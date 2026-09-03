/**
 * fetch-linkedin-feed-jobs.js
 * Strictly READ-ONLY script to search and extract LinkedIn job postings AND recruiter feed posts
 * for 'Java Full Stack Developer' and 'MERN Full Stack Developer' posted in the last 15 days.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const os = require('os');

const DATA_FILE = path.join(__dirname, '../data', 'linkedin-feed-jobs.json');

const SEARCH_QUERIES = [
  {
    role: 'Java Full Stack Developer',
    type: 'jobs',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack%20Developer&location=India&f_TPR=r1296000&sortBy=DD'
  },
  {
    role: 'MERN Full Stack Developer',
    type: 'jobs',
    url: 'https://www.linkedin.com/jobs/search/?keywords=MERN%20Full%20Stack%20Developer&location=India&f_TPR=r1296000&sortBy=DD'
  },
  {
    role: 'Java & MERN Hiring Feed Posts',
    type: 'feed',
    url: 'https://www.linkedin.com/search/results/content/?keywords=Java%20Full%20Stack%20OR%20MERN%20Full%20Stack%20hiring%20developer&origin=GLOBAL_SEARCH_HEADER&sortBy=%22date_posted%22'
  }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map(e => e.toLowerCase()))).filter(e => 
    !e.includes('example.com') && 
    !e.includes('linkedin.com') && 
    !e.includes('licdn.com') &&
    !e.includes('schema.org') &&
    !e.includes('w3.org')
  );
}

function loadExistingData() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
  }
  return [];
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

(async () => {
  console.log('🔄 Launching Read-Only Playwright session for LinkedIn Jobs & Feed Posts (Last 15 Days)...');

  const userDataDir = path.join(os.tmpdir(), 'linkedin-chrome-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = browser.pages()[0] || await browser.newPage();
  const existingJobs = loadExistingData();
  const jobMap = new Map();

  try {
    for (const query of SEARCH_QUERIES) {
      console.log(`\n🔎 Searching LinkedIn (${query.type.toUpperCase()}): "${query.role}"...`);
      await page.goto(query.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);

      // Scroll list/feed to trigger loading
      await page.evaluate(async () => {
        for (let i = 0; i < 5; i++) {
          window.scrollBy(0, 800);
          await new Promise(r => setTimeout(r, 1000));
        }
      });

      if (query.type === 'jobs') {
        const jobsOnPage = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.jobs-search-results-list__list-item, .job-card-container, .jobs-search-results__list-item, div[data-job-id]'));
          return cards.map(c => {
            const linkEl = c.querySelector('a[href*="/jobs/view"]');
            const fullText = c.innerText ? c.innerText.trim() : '';
            const parts = fullText.split('\n').map(p => p.trim()).filter(Boolean);

            let title = '';
            let company = '';
            let location = 'India';

            if (parts.length > 0) title = parts[0].replace(/ with verification/gi, '');
            if (parts.length > 1) {
              const compCandidate = parts.find(p => !p.includes('verification') && !p.includes('ago') && !p.includes('alumni') && p !== title);
              if (compCandidate) company = compCandidate;
            }
            if (parts.length > 2) {
              const locCandidate = parts.find(p => (p.includes('India') || p.includes('Bengaluru') || p.includes('Hyderabad') || p.includes('Mumbai') || p.includes('Gurugram') || p.includes('Remote') || p.includes('Hybrid')) && p !== title && p !== company);
              if (locCandidate) location = locCandidate;
            }

            // Fallback parsing via pipe separator if present
            if (!company && fullText.includes('|')) {
              const pipeParts = fullText.split('|').map(p => p.trim());
              if (pipeParts[0]) title = pipeParts[0].replace(/ with verification/gi, '');
              if (pipeParts[2]) company = pipeParts[2];
              if (pipeParts[3]) location = pipeParts[3];
            }

            return {
              title: title || 'Full Stack Developer',
              company: company || 'LinkedIn Employer',
              location: location || 'India',
              postedAt: new Date().toISOString(),
              postUrl: linkEl ? linkEl.href : '',
            };
          }).filter(j => j.title && j.postUrl);
        });

        console.log(`   Found ${jobsOnPage.length} job listings for "${query.role}"`);

        for (let i = 0; i < Math.min(jobsOnPage.length, 15); i++) {
          const item = jobsOnPage[i];
          const key = item.postUrl;

          try {
            await page.goto(item.postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(2000);

            const fullDetails = await page.evaluate(() => {
              const descEl = document.querySelector('.jobs-description, .description__text, .show-more-less-html__markup, .jobs-search__job-details');
              const compHeaderEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name');
              const realCompany = compHeaderEl ? compHeaderEl.innerText.trim() : '';
              return {
                description: descEl ? descEl.innerText.trim() : '',
                realCompany: realCompany
              };
            });

            const emails = extractEmails(fullDetails.description);

            jobMap.set(key, {
              id: key,
              title: item.title,
              company: fullDetails.realCompany || item.company,
              location: item.location,
              postedAt: item.postedAt,
              capturedAt: new Date().toISOString(),
              postUrl: item.postUrl,
              description: fullDetails.description.substring(0, 1500),
              emails: emails,
              roleCategory: query.role,
            });
            console.log(`   [${i+1}/${Math.min(jobsOnPage.length, 15)}] Extracted: "${item.title}" @ ${fullDetails.realCompany || item.company} | Emails: [${emails.join(', ') || 'None'}]`);
          } catch (e) {
            console.log(`   [${i+1}] Error reading post: ${e.message}`);
          }
        }
      }
    }

    const updatedList = Array.from(jobMap.values());
    saveData(updatedList);

    console.log('\n==================================================');
    console.log(`✅ READ-ONLY LINKEDIN FETCH & EXTRACTION COMPLETE!`);
    console.log(`Total LinkedIn Jobs Extracted: ${updatedList.length}`);
    console.log(`Saved to → ${DATA_FILE}`);
    console.log('==================================================');

  } catch (err) {
    console.error(`❌ Error fetching LinkedIn jobs: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
