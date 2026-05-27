/**
 * cleanup-jobs.js
 * - Removes jobs posted > 30 days ago from linkedin-jobs.json and naukri-external-jobs.json
 * - Deduplicates both lists by applyUrl
 * - Rebuilds Excel via sync-excel.js logic
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const TODAY = new Date();
const CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;

// Parse Naukri relative date text → offset in days (minimum estimate)
function relDays(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  if (t === 'just now' || t === 'few hours ago' || t === 'today') return 0;
  const m1 = t.match(/^(\d+)\s*day/);   if (m1) return parseInt(m1[1]);
  const m2 = t.match(/^(\d+)\+?\s*week/); if (m2) return parseInt(m2[1]) * 7;
  const m3 = t.match(/^(\d+)\+?\s*month/); if (m3) return parseInt(m3[1]) * 30;
  if (t.includes('week')) return 7;
  if (t.includes('month')) return 30;
  return null;
}

function actualPostDate(job) {
  const days = relDays(job.postedAt);
  if (days === null) return null;
  const captured = new Date(job.capturedAt || job.postedAt);
  const d = new Date(captured);
  d.setDate(d.getDate() - days);
  return d;
}

function daysAgo(date) {
  return Math.floor((TODAY - date) / (24 * 60 * 60 * 1000));
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
const LI_FILE = path.join(__dirname, 'linkedin-jobs.json');
let li = fs.existsSync(LI_FILE) ? JSON.parse(fs.readFileSync(LI_FILE)) : [];
const liBefore = li.length;

// Dedup
const liSeen = new Set();
li = li.filter(j => {
  const k = j.applyUrl || j.linkedinUrl;
  if (!k || liSeen.has(k)) return false;
  liSeen.add(k); return true;
});

// Remove stale (older than 30 days)
li = li.filter(j => {
  if (!j.postedAt) return true; // keep if no date
  const age = daysAgo(new Date(j.postedAt));
  return age <= 30;
});

fs.writeFileSync(LI_FILE, JSON.stringify(li, null, 2));
console.log(`linkedin-jobs.json: ${liBefore} → ${li.length} (removed ${liBefore - li.length})`);

// ── Naukri External ───────────────────────────────────────────────────────────
const EXT_FILE = path.join(__dirname, 'naukri-external-jobs.json');
let ext = fs.existsSync(EXT_FILE) ? JSON.parse(fs.readFileSync(EXT_FILE)) : [];
const extBefore = ext.length;

// Dedup by applyUrl first
const extSeen = new Set();
ext = ext.filter(j => {
  if (!j.applyUrl || extSeen.has(j.applyUrl)) return false;
  extSeen.add(j.applyUrl); return true;
});

// Dedup by title+company — keep most recently captured entry per role per company
const byTitleCo = new Map();
for (const j of ext) {
  const k = (j.title + '|' + j.company).toLowerCase().trim();
  const existing = byTitleCo.get(k);
  if (!existing || new Date(j.capturedAt) > new Date(existing.capturedAt)) byTitleCo.set(k, j);
}
ext = [...byTitleCo.values()];
const afterDedup = ext.length;

// Remove stale
ext = ext.filter(j => {
  const post = actualPostDate(j);
  if (!post) return true; // keep if can't determine
  return daysAgo(post) <= 30;
});

fs.writeFileSync(EXT_FILE, JSON.stringify(ext, null, 2));
console.log(`naukri-external-jobs.json: ${extBefore} → ${afterDedup} (dedup) → ${ext.length} (after age filter, removed ${extBefore - ext.length})`);

// ── Rebuild Excel from tracker (unchanged) ─────────────────────────────────
const JSON_FILE = path.join(__dirname, 'job-tracker.json');
const EXCEL_FILE = path.join(__dirname, 'job-applications.xlsx');
const store = JSON.parse(fs.readFileSync(JSON_FILE));
const HEADERS = ['#', 'Date', 'Source', 'Job Title', 'Company', 'Location', 'Apply URL', 'External URL', 'Notes / Reason'];
const SHEETS = { applied: 'Applied', external: 'External', failed: 'Failed', skipped: 'Skipped' };
const wb = XLSX.utils.book_new();
const counts = {};
for (const [key, name] of Object.entries(SHEETS)) {
  const entries = Object.entries(store[key] || {});
  entries.sort((a, b) => new Date(a[1].date || 0) - new Date(b[1].date || 0));
  const rows = entries.map(([url, e], i) => [
    i + 1,
    e.date ? new Date(e.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
    e.source || '', e.title || '', e.company || '', e.location || '',
    url, e.externalUrl || '', e.notes || '',
  ]);
  counts[key] = rows.length;
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = [{ wch: 4 }, { wch: 20 }, { wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 20 }, { wch: 60 }, { wch: 60 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, name);
}
XLSX.writeFile(wb, EXCEL_FILE);
console.log('Excel rebuilt:', counts);
console.log(`\nDone. View fresh jobs at http://localhost:4000`);
