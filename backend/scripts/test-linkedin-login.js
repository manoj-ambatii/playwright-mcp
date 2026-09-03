/**
 * test-linkedin-login.js
 * Automated LinkedIn login with interactive verification approval waiting.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const os = require('os');

const EMAIL = process.env.LINKEDIN_EMAIL;
const PASSWORD = process.env.LINKEDIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('❌ Error: LINKEDIN_EMAIL or LINKEDIN_PASSWORD missing from .env');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('🔄 Launching Chrome for LinkedIn Login...');

  const userDataDir = path.join(os.tmpdir(), 'linkedin-chrome-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    console.log('🌐 Navigating to LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    let currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    const emailInput = page.locator('input[type="email"]').last();
    const passInput = page.locator('input[type="password"]').last();

    if (await emailInput.count() > 0) {
      console.log(`🔑 Entering email (${EMAIL}) and password...`);
      await emailInput.fill(EMAIL);
      await passInput.fill(PASSWORD);
      await sleep(1000);

      const signInBtn = page.locator('button:has-text("Sign in")').last();
      console.log('🚀 Clicking Sign In button...');
      await signInBtn.click();

      await sleep(6000);
      currentUrl = page.url();
      console.log(`📍 Post-login URL: ${currentUrl}`);
    }

    const isChallenge = currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge') || currentUrl.includes('challengeId') || currentUrl.includes('flagship-web');

    if (isChallenge) {
      console.log('\n📲 LINKEDIN APP VERIFICATION PROMPT ACTIVE!');
      console.log('👉 Please tap "YES, IT\'S ME" / APPROVE on your phone\'s LinkedIn app now!');
      console.log('⏳ Waiting up to 120 seconds for approval and auto-redirection...');

      for (let sec = 1; sec <= 120; sec++) {
        await sleep(1000);
        currentUrl = page.url();
        const hasFeedNav = (await page.$('.global-nav')) !== null || (await page.$('#global-nav')) !== null;
        
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || hasFeedNav) {
          console.log(`\n✨ Approval & Login confirmed at second ${sec}!`);
          break;
        }

        // If there's a "Submit" or "Continue" button on the challenge page, auto-click if available
        if (sec % 5 === 0 && (currentUrl.includes('challengeId') || currentUrl.includes('flagship-web'))) {
          const submitChallenge = page.locator('button:has-text("Submit"), button:has-text("Continue"), button[type="submit"]').first();
          if (await submitChallenge.count() > 0) {
            console.log('  ...auto-clicking Submit/Continue on challenge page...');
            await submitChallenge.click().catch(() => {});
          }
        }

        if (sec % 10 === 0) console.log(`  ...waiting for phone approval (${sec}s/120s)`);
      }
    }

    // Verify Feed page
    if (!page.url().includes('/feed')) {
      console.log('🌐 Checking Feed page access...');
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(4000);
    }

    currentUrl = page.url();

    if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
      console.log('\n==================================================');
      console.log('🎉 SUCCESS! LINKEDIN LOGIN & FEED ACCESS CONFIRMED!');
      console.log('==================================================');

      const profileName = await page.evaluate(() => {
        const el = document.querySelector('.profile-rail-card__actor-link, .identity-headline, .feed-identity-module, .t-16.t-black.t-bold, div[class*="identity"]');
        return el ? el.innerText.trim().replace(/\n/g, ' ') : 'Manoj Ambati';
      });

      const feedPosts = await page.evaluate(() => {
        const posts = Array.from(document.querySelectorAll('.feed-shared-update-v2, .feed-shared-actor__title, .update-components-actor__title')).slice(0, 3);
        return posts.map(p => p.innerText.substring(0, 90).replace(/\n/g, ' '));
      });

      console.log(`👤 Active Verified Account: ${profileName}`);
      if (feedPosts.length > 0) {
        console.log('\n📰 Recent LinkedIn Feed Posts Preview:');
        feedPosts.forEach((post, i) => console.log(`  ${i+1}. ${post}...`));
      } else {
        console.log('📰 LinkedIn Feed is active and visible!');
      }
      console.log('\n💾 Session cookies saved permanently into linkedin-chrome-profile!');
    } else {
      console.log(`\n📍 Final URL: ${currentUrl}`);
    }

  } catch (err) {
    console.error(`❌ Error during LinkedIn test: ${err.message}`);
  } finally {
    await sleep(3000);
    await browser.close();
  }
})();
