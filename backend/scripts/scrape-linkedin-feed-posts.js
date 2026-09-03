/**
 * scrape-linkedin-feed-posts.js
 * Scrapes actual LinkedIn Feed posts (https://www.linkedin.com/feed/)
 * and Content Search posts for Java & MERN Full Stack Developer opportunities (last 15 days).
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const os = require('os');

const DATA_FILE = path.join(__dirname, '../data', 'linkedin-feed-jobs.json');

const FEED_SEARCH_QUERIES = [
  {
    type: 'Home Feed',
    url: 'https://www.linkedin.com/feed/'
  },
  {
    type: 'Java Hiring Feed Posts',
    url: 'https://www.linkedin.com/search/results/content/?keywords=Java%20Full%20Stack%20Developer%20hiring&origin=GLOBAL_SEARCH_HEADER&sortBy=%22date_posted%22'
  },
  {
    type: 'MERN Hiring Feed Posts',
    url: 'https://www.linkedin.com/search/results/content/?keywords=MERN%20Full%20Stack%20Developer%20hiring&origin=GLOBAL_SEARCH_HEADER&sortBy=%22date_posted%22'
  },
  {
    type: 'Full Stack Recruiter Posts',
    url: 'https://www.linkedin.com/search/results/content/?keywords=Full%20Stack%20Developer%20hiring%20resume%20email&origin=GLOBAL_SEARCH_HEADER&sortBy=%22date_posted%22'
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
  console.log('🔄 Launching Read-Only Playwright session for LinkedIn Home Feed & Recruiter Posts...');

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
    for (const item of FEED_SEARCH_QUERIES) {
      console.log(`\n📰 Navigating to ${item.type} (${item.url})...`);
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);

      // Scroll multiple times to load dynamic feed items
      console.log('   Scrolling feed to load posts...');
      await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) {
          window.scrollBy(0, 1000);
          await new Promise(r => setTimeout(r, 1200));
        }
      });

      // Extract posts from main DOM
      const extractedPosts = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const divs = Array.from(main.querySelectorAll('div'));
        
        const candidatePosts = [];
        const seenTexts = new Set();

        for (const d of divs) {
          const text = d.innerText ? d.innerText.trim() : '';
          if (text.length < 60 || text.length > 2500) continue;
          if (seenTexts.has(text.substring(0, 80))) continue;

          // Find links inside element
          const links = Array.from(d.querySelectorAll('a'));
          const postLinkEl = links.find(a => a.href.includes('/feed/update/') || a.href.includes('/posts/') || a.href.includes('activity'));
          const authorLinkEl = links.find(a => a.href.includes('/in/') || a.href.includes('/company/'));

          if (postLinkEl || authorLinkEl) {
            seenTexts.add(text.substring(0, 80));
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const author = authorLinkEl ? authorLinkEl.innerText.split('\n')[0].trim() : (lines[0] || 'LinkedIn Recruiter');
            const authorTitle = lines[1] || 'Recruiter / Hiring Manager';

            candidatePosts.push({
              author: author.length < 50 ? author : 'LinkedIn Poster',
              authorTitle: authorTitle.length < 80 ? authorTitle : 'Hiring Post',
              text: text,
              postUrl: postLinkEl ? postLinkEl.href : (authorLinkEl ? authorLinkEl.href : window.location.href),
              time: 'Recent Feed Post'
            });
          }
        }
        return candidatePosts;
      });

      console.log(`   Found ${extractedPosts.length} potential feed posts for "${item.type}"`);

      for (let i = 0; i < extractedPosts.length; i++) {
        const post = extractedPosts[i];
        const lower = post.text.toLowerCase();

        // Check developer & hiring relevance
        const isRelevant = lower.includes('java') || 
                           lower.includes('mern') || 
                           lower.includes('full stack') || 
                           lower.includes('react') || 
                           lower.includes('node') || 
                           lower.includes('hiring') || 
                           lower.includes('developer') || 
                           lower.includes('opportunity') ||
                           lower.includes('opening') ||
                           lower.includes('@');

        if (!isRelevant) continue;

        const emails = extractEmails(post.text);
        const key = post.postUrl.includes('update') || post.postUrl.includes('posts') ? post.postUrl : post.postUrl + '_' + Math.random().toString(36).substring(7);

        let inferredRole = 'Java / MERN Full Stack Developer';
        if (lower.includes('java') && lower.includes('mern')) inferredRole = 'Java & MERN Developer';
        else if (lower.includes('java')) inferredRole = 'Java Full Stack Developer';
        else if (lower.includes('mern')) inferredRole = 'MERN Full Stack Developer';

        jobMap.set(key, {
          id: key,
          title: `${inferredRole} (Recruiter Post)`,
          company: post.author || 'LinkedIn Recruiter',
          location: 'India / Remote (LinkedIn Feed)',
          postedAt: post.time,
          capturedAt: new Date().toISOString(),
          postUrl: post.postUrl,
          description: post.text.substring(0, 1500),
          emails: emails,
          roleCategory: inferredRole,
          isFeedPost: true,
        });

        console.log(`   [Post ${i+1}] Extracted from ${post.author} | Emails: [${emails.join(', ') || 'None'}]`);
      }
    }

    const updatedList = Array.from(jobMap.values());
    saveData(updatedList);

    console.log('\n==================================================');
    console.log(`✅ LINKEDIN FEED & POSTS EXTRACTION COMPLETE!`);
    console.log(`Total Extracted Jobs & Feed Posts: ${updatedList.length}`);
    console.log(`Saved to → ${DATA_FILE}`);
    console.log('==================================================');

  } catch (err) {
    console.error(`❌ Error scraping LinkedIn feed posts: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
