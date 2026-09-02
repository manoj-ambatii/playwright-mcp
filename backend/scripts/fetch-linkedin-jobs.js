/**
 * fetch-linkedin-jobs.js
 * Calls Apify's LinkedIn Jobs Scraper actor and saves results to linkedin-jobs.json
 * Usage: node fetch-linkedin-jobs.js
 * Requires: APIFY_API_KEY in .env
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { ApifyClient } = require('apify-client');

const JOBS_FILE = path.join(__dirname, '../data', 'linkedin-jobs.json');

const APIFY_API_KEY = process.env.APIFY_API_KEY;
if (!APIFY_API_KEY) {
  console.error('ERROR: APIFY_API_KEY not found in .env');
  process.exit(1);
}

const client = new ApifyClient({ token: APIFY_API_KEY });

// LinkedIn job search URLs — f_TPR=r86400 = past 24h, sortBy=DD = most recent
const SEARCH_URLS = [
  'https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Developer&location=India&f_TPR=r86400&sortBy=DD',
  'https://www.linkedin.com/jobs/search/?keywords=React%20Node%20Developer&location=India&f_TPR=r86400&sortBy=DD',
  'https://www.linkedin.com/jobs/search/?keywords=MERN%20Stack%20Developer&location=India&f_TPR=r86400&sortBy=DD',
];

async function fetchJobs() {
  console.log('Starting Apify LinkedIn Jobs Scraper...');

  const allJobs = [];

  for (const url of SEARCH_URLS) {
    const label = new URL(url).searchParams.get('keywords');
    console.log(`\nSearching: "${label}"`);

    try {
      const run = await client.actor('curious_coder/linkedin-jobs-scraper').call({
        urls: [url],
        count: 50,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      console.log(`  Found ${items.length} jobs`);

      for (const item of items) {
        allJobs.push({
          title: item.title || item.jobTitle || '',
          company: item.companyName || item.company || '',
          location: item.location || '',
          applyUrl: item.applyUrl || item.jobUrl || item.url || '',
          linkedinUrl: item.jobUrl || '',
          description: (item.description || '').substring(0, 500),
          postedAt: item.postedAt || item.publishedAt || '',
          easyApply: item.easyApplyUrl ? true : false,
          easyApplyUrl: item.easyApplyUrl || '',
        });
      }
    } catch (err) {
      console.error(`  Error for query "${query.keywords}": ${err.message}`);
    }
  }

  // Deduplicate by applyUrl
  const seen = new Set();
  const unique = allJobs.filter(j => {
    const key = j.applyUrl || j.linkedinUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  fs.writeFileSync(JOBS_FILE, JSON.stringify(unique, null, 2));
  console.log(`\nSaved ${unique.length} unique jobs to ${JOBS_FILE}`);
  return unique;
}

fetchJobs().catch(console.error);
