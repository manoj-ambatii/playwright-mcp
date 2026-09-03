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
    role: 'Java Full Stack Developer (Jobs)',
    type: 'jobs',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack%20Developer&location=India&f_TPR=r1296000&sortBy=DD'
  },
  {
    role: 'MERN Full Stack Developer (Jobs)',
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
  const jobMap = new Map(existingJobs.map(j => [j.id || j.postUrl, j]));

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
          const cards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, .base-card'));
          return cards.map(c => {
            const titleEl = c.querySelector('.job-card-list__title, .base-search-card__title, a[data-control-id]');
            const compEl = c.querySelector('.job-card-container__primary-description, .base-search-card__subtitle');
            const locEl = c.querySelector('.job-card-container__metadata-item, .job-search-card__location');
            const timeEl = c.querySelector('time');
            const linkEl = c.querySelector('a.job-card-list__title, a.base-card__full-link, a[href*="/jobs/view"]');

            return {
              title: titleEl ? titleEl.innerText.trim() : '',
              company: compEl ? compEl.innerText.trim() : '',
              location: locEl ? locEl.innerText.trim() : 'India',
              postedAt: timeEl ? timeEl.getAttribute('datetime') || timeEl.innerText.trim() : 'Last 15 days',
              postUrl: linkEl ? linkEl.href : '',
            };
          }).filter(j => j.title && j.postUrl);
        });

        console.log(`   Found ${jobsOnPage.length} job listings for "${query.role}"`);

        for (let i = 0; i < Math.min(jobsOnPage.length, 15); i++) {
          const item = jobsOnPage[i];
          const key = item.postUrl;

          if (jobMap.has(key) && jobMap.get(key).description) continue;

          try {
            await page.goto(item.postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(2000);

            const fullDetails = await page.evaluate(() => {
              const descEl = document.querySelector('.jobs-description, .description__text, .show-more-less-html__markup');
              return descEl ? descEl.innerText.trim() : '';
            });

            const emails = extractEmails(fullDetails);

            jobMap.set(key, {
              id: key,
              title: item.title,
              company: item.company,
              location: item.location,
              postedAt: item.postedAt || new Date().toISOString(),
              capturedAt: new Date().toISOString(),
              postUrl: item.postUrl,
              description: fullDetails.substring(0, 1500),
              emails: emails,
              roleCategory: query.role,
            });
            console.log(`   [${i+1}/${Math.min(jobsOnPage.length, 15)}] Extracted: "${item.title}" @ ${item.company} | Emails: [${emails.join(', ') || 'None'}]`);
          } catch (e) {
            console.log(`   [${i+1}] Error reading post: ${e.message}`);
          }
        }
      } else if (query.type === 'feed') {
        const feedItems = await page.evaluate(() => {
          const posts = Array.from(document.querySelectorAll('.feed-shared-update-v2, .search-results-container .artdeco-card'));
          return posts.map(p => {
            const authorEl = p.querySelector('.update-components-actor__name, .feed-shared-actor__name');
            const titleEl = p.querySelector('.update-components-actor__sub-description, .feed-shared-actor__sub-description');
            const textEl = p.querySelector('.update-components-text, .feed-shared-text');
            const linkEl = p.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
            const timeEl = p.querySelector('.update-components-actor__sub-description time, time');

            return {
              company: authorEl ? authorEl.innerText.trim() : 'Recruiter Post',
              title: titleEl ? titleEl.innerText.trim() : 'Developer Hiring Post',
              description: textEl ? textEl.innerText.trim() : '',
              postUrl: linkEl ? linkEl.href : window.location.href,
              postedAt: timeEl ? timeEl.innerText.trim() : 'Recent Post',
            };
          }).filter(p => p.description.length > 20);
        });

        console.log(`   Found ${feedItems.length} recruiter feed posts for "${query.role}"`);

        feedItems.forEach((item, idx) => {
          const key = item.postUrl + '_' + idx;
          const emails = extractEmails(item.description);

          jobMap.set(key, {
            id: key,
            title: item.title || 'Full Stack Developer Opportunity',
            company: item.company || 'LinkedIn Recruiter',
            location: 'India / Remote',
            postedAt: item.postedAt || new Date().toISOString(),
            capturedAt: new Date().toISOString(),
            postUrl: item.postUrl,
            description: item.description.substring(0, 1500),
            emails: emails,
            roleCategory: query.role,
          });
          console.log(`   [Feed ${idx+1}/${feedItems.length}] Scraped post by ${item.company} | Emails: [${emails.join(', ') || 'None'}]`);
        });
      }
    }

    const updatedList = Array.from(jobMap.values());
    saveData(updatedList);

    console.log('\n==================================================');
    console.log(`✅ READ-ONLY LINKEDIN FETCH & FEED EXTRACTION COMPLETE!`);
    console.log(`Total LinkedIn Jobs & Feed Posts Extracted: ${updatedList.length}`);
    console.log(`Saved to → ${DATA_FILE}`);
    console.log('==================================================');

  } catch (err) {
    console.error(`❌ Error fetching LinkedIn jobs: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
