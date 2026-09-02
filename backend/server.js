const express = require('express');
const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch {}

const { ApifyClient } = require('apify-client');

const app = express();
app.use(express.json());

const JOBS_FILE       = path.join(__dirname, 'data', 'linkedin-jobs.json');
const NAUKRI_EXT_FILE = path.join(__dirname, 'data', 'naukri-external-jobs.json');
const TRACKER_FILE    = path.join(__dirname, 'data', 'job-tracker.json');
const CONFIG_FILE     = path.join(__dirname, 'data', 'config.json');

const SEARCH_URLS = [
  'https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Developer&location=India&f_TPR=r86400&sortBy=DD',
  'https://www.linkedin.com/jobs/search/?keywords=React%20Node%20Developer&location=India&f_TPR=r86400&sortBy=DD',
  'https://www.linkedin.com/jobs/search/?keywords=MERN%20Stack%20Developer&location=India&f_TPR=r86400&sortBy=DD',
  'https://www.linkedin.com/jobs/search/?keywords=React%20Developer&location=India&f_TPR=r86400&sortBy=DD',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const loadJobs       = () => fs.existsSync(JOBS_FILE)       ? readJson(JOBS_FILE, [])                                                                  : [];
const loadNaukriExt  = () => fs.existsSync(NAUKRI_EXT_FILE) ? readJson(NAUKRI_EXT_FILE, [])                                                            : [];
const loadTracker    = () => fs.existsSync(TRACKER_FILE)    ? readJson(TRACKER_FILE,   { applied:{}, skipped:{}, external:{}, failed:{} })             : { applied:{}, skipped:{}, external:{}, failed:{} };
const loadConfig     = () => fs.existsSync(CONFIG_FILE)     ? readJson(CONFIG_FILE,    {})                                                             : {};

// Build a unified job list: LinkedIn jobs + Naukri external jobs + tracker store.
function loadAllJobs() {
  const tracker = loadTracker();
  const allMap = new Map();
  const extSet = new Set();

  // Load LinkedIn jobs
  loadJobs().forEach((j, idx) => {
    const key = j.applyUrl || j.linkedinUrl || `linkedin-${idx}`;
    allMap.set(key, {
      id: key,
      title: j.title || '',
      company: j.company || '',
      location: j.location || '',
      description: j.description || '',
      postedAt: j.postedAt || '',
      applyUrl: j.applyUrl || j.linkedinUrl || '',
      externalUrl: j.applyUrl || j.linkedinUrl || '',
      easyApply: !!j.easyApply,
      source: 'linkedin',
      _key: key,
    });
  });

  // Load Naukri External jobs
  loadNaukriExt().forEach((j, idx) => {
    const key = j.applyUrl || j.externalUrl || `naukri-${idx}`;
    extSet.add(key);
    if (j.externalUrl) extSet.add(j.externalUrl);
    if (j.applyUrl) extSet.add(j.applyUrl);

    allMap.set(key, {
      id: key,
      title: j.title || '',
      company: j.company || '',
      location: j.location || '',
      description: '',
      postedAt: j.postedAt || j.capturedAt || '',
      experience: j.experience || '',
      salary: j.salary || '',
      applyUrl: j.applyUrl || '',
      externalUrl: j.externalUrl || j.applyUrl || '',
      source: 'external',
      _key: key,
    });
  });

  // Include any extra entries present in tracker categories
  const categories = [
    { cat: 'applied' },
    { cat: 'external' },
    { cat: 'failed' },
    { cat: 'skipped' },
  ];

  categories.forEach(({ cat }) => {
    const obj = tracker[cat] || {};
    Object.entries(obj).forEach(([url, item]) => {
      const isExt = extSet.has(url) || (item.source && String(item.source).includes('external')) || cat === 'external' || cat === 'failed';
      const source = isExt ? 'external' : (item.source || 'naukri');

      const existing = allMap.get(url);
      if (existing) {
        if (item.title && item.title !== 'Job Posting') existing.title = item.title;
        if (item.company && item.company !== 'Company') existing.company = item.company;
        if (item.location) existing.location = item.location;
        if (item.externalUrl) existing.externalUrl = item.externalUrl;
        existing.source = source;
      } else {
        allMap.set(url, {
          id: url,
          title: item.title || 'Job Application',
          company: item.company || 'Company',
          location: item.location || '',
          description: '',
          postedAt: item.date || '',
          applyUrl: url,
          externalUrl: item.externalUrl || url,
          source: source,
          _key: url,
        });
      }
    });
  });

  return Array.from(allMap.values());
}

// ── POST /api/manual-job ──────────────────────────────────────────────────────
app.post('/api/manual-job', (req, res) => {
  const { title, company, location, externalUrl, notes } = req.body;
  if (!title || !company) {
    return res.status(400).json({ error: 'Company and Job Title are required' });
  }

  const tracker = loadTracker();
  const key = externalUrl || `manual-${Date.now()}`;
  tracker.applied[key] = {
    date: new Date().toISOString(),
    source: 'manual_external',
    title,
    company,
    location: location || 'Hyderabad / Remote',
    externalUrl: externalUrl || '',
    notes: notes || 'Manual external application',
  };

  writeJson(TRACKER_FILE, tracker);
  res.json({ ok: true, id: key });
});

// ── POST /api/config ──────────────────────────────────────────────────────────
app.post('/api/config', (req, res) => {
  const cfg = loadConfig();
  if (req.body.apifyKey !== undefined) cfg.apifyKey = req.body.apifyKey;
  writeJson(CONFIG_FILE, cfg);
  res.json({ ok: true });
});

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
app.get('/api/jobs', (_req, res) => {
  const jobs    = loadAllJobs();
  const tracker = loadTracker();
  res.json(jobs.map((j) => {
    const key = j._key;
    const inApplied  = tracker.applied[key];
    const inExternal = tracker.external[key];
    const inFailed   = tracker.failed[key];
    const inSkipped  = tracker.skipped[key];
    
    let status = 'pending';
    if (inApplied) status = 'applied';
    else if (inFailed) status = 'failed';
    else if (inExternal) status = 'external';
    else if (inSkipped) status = 'skipped';

    return {
      ...j,
      id:          key,
      status,
      appliedAt:   inApplied?.date || null,
      failedReason: inFailed?.notes || inFailed?.reason || null,
      skippedAt:   inSkipped?.date || null,
      notes:       inApplied?.notes || inExternal?.notes || inFailed?.notes || inSkipped?.notes || '',
    };
  }));
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  const jobs    = loadAllJobs();
  const tracker = loadTracker();
  const applied  = Object.keys(tracker.applied).length;
  const external = Object.keys(tracker.external).length;
  const failed   = Object.keys(tracker.failed).length;
  const skipped  = Object.keys(tracker.skipped).length;
  const bySource = { linkedin: 0, naukri: 0 };
  for (const j of jobs) bySource[j.source] = (bySource[j.source] || 0) + 1;
  const pending = Math.max(0, jobs.length - applied - external - failed - skipped);
  res.json({ total: jobs.length, applied, external, failed, skipped, pending, bySource });
});

// ── POST /api/fetch-jobs ──────────────────────────────────────────────────────
app.post('/api/fetch-jobs', async (req, res) => {
  const apiKey = req.body.apiKey || loadConfig().apifyKey;
  if (!apiKey) return res.status(400).json({ error: 'Apify API key is required' });

  // Save the key for future use
  const cfg = loadConfig();
  cfg.apifyKey = apiKey;
  writeJson(CONFIG_FILE, cfg);

  try {
    const client  = new ApifyClient({ token: apiKey });
    const allJobs = [];

    for (const url of SEARCH_URLS) {
      const label = new URL(url).searchParams.get('keywords');
      console.log(`Fetching: "${label}"...`);
      try {
        const run = await client.actor('curious_coder/linkedin-jobs-scraper').call({ urls: [url], count: 50 });
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        for (const item of items) {
          allJobs.push({
            title:       item.title       || item.jobTitle    || '',
            company:     item.companyName || item.company     || '',
            location:    item.location    || '',
            applyUrl:    item.applyUrl    || item.jobUrl      || item.url || '',
            linkedinUrl: item.jobUrl      || '',
            description: (item.description || '').substring(0, 600),
            postedAt:    item.postedAt    || item.publishedAt || '',
            easyApply:   !!item.easyApplyUrl,
            easyApplyUrl: item.easyApplyUrl || '',
          });
        }
      } catch (err) { console.error(`  Error "${label}":`, err.message); }
    }

    // Deduplicate
    const seen = new Set();
    const unique = allJobs.filter(j => {
      const k = j.applyUrl || j.linkedinUrl;
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    });

    // Merge with existing (keep old + add new)
    const existing     = loadJobs();
    const existingKeys = new Set(existing.map(j => j.applyUrl || j.linkedinUrl));
    const newJobs      = unique.filter(j => !existingKeys.has(j.applyUrl || j.linkedinUrl));
    const merged       = [...existing, ...newJobs];
    writeJson(JOBS_FILE, merged);

    res.json({ total: merged.length, added: newJobs.length, fetched: unique.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/status ──────────────────────────────────────────────────────────
app.post('/api/status', (req, res) => {
  const { id, status, notes } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'id and status required' });

  const tracker = loadTracker();
  // Look up job details so we persist title/company/source alongside status.
  const job = loadAllJobs().find((j) => j._key === id);
  const meta = job ? {
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
  } : {};
  if (status === 'applied') {
    tracker.applied[id] = { date: new Date().toISOString(), notes: notes || '', ...meta };
    delete tracker.skipped[id];
  } else if (status === 'skipped') {
    tracker.skipped[id] = { date: new Date().toISOString(), notes: notes || '', ...meta };
    delete tracker.applied[id];
  } else {
    delete tracker.applied[id];
    delete tracker.skipped[id];
  }
  writeJson(TRACKER_FILE, tracker);
  res.json({ ok: true });
});

// ── DELETE /api/jobs ──────────────────────────────────────────────────────────
app.delete('/api/jobs', (_req, res) => {
  writeJson(JOBS_FILE, []);
  writeJson(TRACKER_FILE, { applied: {}, skipped: {} });
  res.json({ ok: true });
});

// ── Serve UI (AFTER all API routes) ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/public')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`\n✅  LinkedIn Job Tracker → http://localhost:${PORT}\n`));
