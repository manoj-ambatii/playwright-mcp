/**
 * sync-excel.js — Rebuild job-applications.xlsx from job-tracker.json (source of truth).
 * Idempotent. Run after migrations or any time the Excel drifts from the JSON store.
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data', 'job-applications.xlsx');
const JSON_FILE = path.join(__dirname, '../data', 'job-tracker.json');

if (!fs.existsSync(JSON_FILE)) { console.error('No job-tracker.json'); process.exit(1); }
const store = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

const HEADERS = ['#', 'Date', 'Source', 'Job Title', 'Company', 'Location', 'Apply URL', 'External URL', 'Notes / Reason'];
const SHEETS = { applied: 'Applied', external: 'External', failed: 'Failed', skipped: 'Skipped' };

const wb = XLSX.utils.book_new();
const counts = {};
for (const [key, name] of Object.entries(SHEETS)) {
  const entries = Object.entries(store[key] || {});
  // sort by date asc
  entries.sort((a, b) => new Date(a[1].date || 0) - new Date(b[1].date || 0));
  const rows = entries.map(([url, e], i) => [
    i + 1,
    e.date ? new Date(e.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
    e.source || '',
    e.title || '',
    e.company || '',
    e.location || '',
    url,
    e.externalUrl || '',
    e.notes || '',
  ]);
  counts[key] = rows.length;
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = [{ wch: 4 }, { wch: 20 }, { wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 20 }, { wch: 60 }, { wch: 60 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, name);
}
XLSX.writeFile(wb, FILE);
console.log('Excel rebuilt:', counts);
