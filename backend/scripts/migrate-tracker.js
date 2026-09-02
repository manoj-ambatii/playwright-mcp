/**
 * migrate-tracker.js
 * One-shot migration:
 *  - Tags existing job-tracker.json entries with source: 'linkedin'
 *  - Imports previous naukri-apply-results.json into the tracker (source: naukri)
 *  - Imports any company_site_skip Naukri results into naukri-external-jobs.json
 *
 * Idempotent — safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const JSON_FILE = path.join(__dirname, '../data', 'job-tracker.json');
const NAUKRI_RESULTS = path.join(__dirname, '../data', 'naukri-apply-results.json');
const EXTERNAL_FILE = path.join(__dirname, '../data', 'naukri-external-jobs.json');

const store = fs.existsSync(JSON_FILE) ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')) : {};
for (const k of ['applied', 'external', 'failed', 'skipped']) if (!store[k]) store[k] = {};

let tagged = 0;
for (const k of ['applied', 'external', 'failed', 'skipped']) {
  for (const url of Object.keys(store[k])) {
    const entry = store[k][url];
    if (typeof entry === 'string') store[k][url] = { date: entry, notes: '' };
    if (!store[k][url].source) {
      store[k][url].source = 'linkedin';
      tagged++;
    }
  }
}
console.log(`Tagged ${tagged} existing entries as source=linkedin`);

const ext = fs.existsSync(EXTERNAL_FILE) ? JSON.parse(fs.readFileSync(EXTERNAL_FILE, 'utf8')) : [];
const extUrls = new Set(ext.map((j) => j.applyUrl));

let importedApplied = 0, importedExternal = 0, importedSkipped = 0;
if (fs.existsSync(NAUKRI_RESULTS)) {
  const prev = JSON.parse(fs.readFileSync(NAUKRI_RESULTS, 'utf8'));
  for (const r of prev) {
    if (!r.url) continue;
    const base = {
      date: new Date().toISOString(),
      source: 'naukri',
      title: r.title || '',
      company: r.company || '',
      location: '',
      notes: '',
    };
    if (r.status === 'applied' || r.status === 'applied_with_chatbot') {
      if (!store.applied[r.url]) {
        store.applied[r.url] = { ...base, notes: 'Naukri quick-apply (prior run)' };
        importedApplied++;
      }
    } else if (r.status === 'company_site_skip') {
      if (!store.external[r.url]) {
        store.external[r.url] = { ...base, externalUrl: '', notes: 'External — needs manual apply' };
        importedExternal++;
      }
      if (!extUrls.has(r.url)) {
        ext.push({
          title: r.title || '',
          company: r.company || '',
          location: '',
          experience: '',
          salary: '',
          postedAt: '',
          applyUrl: r.url,
          externalUrl: '',
          source: 'naukri',
          capturedAt: new Date().toISOString(),
        });
        extUrls.add(r.url);
      }
    } else {
      if (!store.skipped[r.url]) {
        store.skipped[r.url] = { ...base, notes: r.status };
        importedSkipped++;
      }
    }
  }
}
console.log(`Imported from naukri-apply-results.json: applied=${importedApplied}, external=${importedExternal}, skipped=${importedSkipped}`);

fs.writeFileSync(JSON_FILE, JSON.stringify(store, null, 2));
fs.writeFileSync(EXTERNAL_FILE, JSON.stringify(ext, null, 2));
console.log(`Saved → ${JSON_FILE}`);
console.log(`Saved → ${EXTERNAL_FILE} (${ext.length} entries)`);
