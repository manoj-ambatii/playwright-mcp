/**
 * track-jobs.js
 * Manages the Excel tracker (job-applications.xlsx) and JSON dedup map (job-tracker.json).
 *
 * Usage:
 *   const tracker = require('./track-jobs');
 *   if (tracker.has(url)) return;                           // dedup across runs
 *   tracker.logApplied({ title, company, location, url, source, notes });
 *   tracker.logSkipped({ title, company, location, url, source, reason });
 *   tracker.logExternal({ title, company, location, url, externalUrl, source, notes });
 *   tracker.save();
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data', 'job-applications.xlsx');
const JSON_FILE = path.join(__dirname, '../data', 'job-tracker.json');

const SHEETS = {
  applied:  { name: 'Applied',  rows: [] },
  external: { name: 'External', rows: [] },
  failed:   { name: 'Failed',   rows: [] },
  skipped:  { name: 'Skipped',  rows: [] },
};

const HEADERS = ['#', 'Date', 'Source', 'Job Title', 'Company', 'Location', 'Apply URL', 'External URL', 'Notes / Reason'];

function now() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// ---------- JSON dedup store ----------
let store;
if (fs.existsSync(JSON_FILE)) {
  try { store = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch { store = {}; }
} else {
  store = {};
}
for (const k of ['applied', 'external', 'failed', 'skipped']) {
  if (!store[k] || typeof store[k] !== 'object') store[k] = {};
}

function has(url) {
  if (!url) return false;
  return !!(store.applied[url] || store.external[url] || store.failed[url] || store.skipped[url]);
}
function whereIs(url) {
  for (const k of ['applied', 'external', 'failed', 'skipped']) if (store[k][url]) return k;
  return null;
}

// ---------- Workbook ----------
let wb;
let counters = { applied: 0, external: 0, failed: 0, skipped: 0 };
if (fs.existsSync(FILE)) {
  wb = XLSX.readFile(FILE);
  for (const key of Object.keys(SHEETS)) {
    const ws = wb.Sheets[SHEETS[key].name];
    if (ws) {
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      SHEETS[key].rows = rows.length > 1 ? rows.slice(1) : [];
      // Migrate old 7-col rows to new 9-col schema (insert empty Source + External URL).
      SHEETS[key].rows = SHEETS[key].rows.map((r) => {
        if (r.length === 7) {
          // old: [#, Date, Title, Company, Location, URL, Notes]
          return [r[0], r[1], '', r[2], r[3], r[4], r[5], '', r[6]];
        }
        return r;
      });
      counters[key] = SHEETS[key].rows.length;
    }
  }
} else {
  wb = XLSX.utils.book_new();
}

function addRow(sheetKey, { title = '', company = '', location = '', url = '', source = '', externalUrl = '', notes = '' }) {
  counters[sheetKey]++;
  SHEETS[sheetKey].rows.push([counters[sheetKey], now(), source, title, company, location, url, externalUrl, notes]);
}

function persistStore(sheetKey, job) {
  if (!job.url) return;
  store[sheetKey][job.url] = {
    date: new Date().toISOString(),
    source: job.source || '',
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    externalUrl: job.externalUrl || '',
    notes: job.notes || job.reason || '',
  };
}

function save() {
  for (const key of Object.keys(SHEETS)) {
    const data = [HEADERS, ...SHEETS[key].rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 4 }, { wch: 20 }, { wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 20 }, { wch: 60 }, { wch: 60 }, { wch: 50 }];
    if (wb.SheetNames.includes(SHEETS[key].name)) {
      wb.Sheets[SHEETS[key].name] = ws;
    } else {
      XLSX.utils.book_append_sheet(wb, ws, SHEETS[key].name);
    }
  }
  XLSX.writeFile(wb, FILE);
  fs.writeFileSync(JSON_FILE, JSON.stringify(store, null, 2));
  console.log(`Tracker saved → ${FILE} & ${JSON_FILE}`);
}

function logApplied(job)  { addRow('applied',  job);                                          persistStore('applied',  job); }
function logExternal(job) { addRow('external', { ...job, notes: job.notes || job.reason || '' }); persistStore('external', job); }
function logFailed(job)   { addRow('failed',   { ...job, notes: job.reason || job.notes || '' }); persistStore('failed',   { ...job, notes: job.reason || job.notes || '' }); }
function logSkipped(job)  { addRow('skipped',  { ...job, notes: job.reason || job.notes || '' }); persistStore('skipped',  { ...job, notes: job.reason || job.notes || '' }); }

function summary() {
  return `Applied: ${counters.applied}  External: ${counters.external}  Failed: ${counters.failed}  Skipped: ${counters.skipped}`;
}

module.exports = { has, whereIs, logApplied, logExternal, logFailed, logSkipped, save, summary, FILE, JSON_FILE };
