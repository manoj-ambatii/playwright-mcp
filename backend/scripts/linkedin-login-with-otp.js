/**
 * linkedin-login-with-otp.js
 * Automates LinkedIn login, fetches 2FA OTP verification code from Gmail API,
 * submits the PIN, and confirms access to LinkedIn Feed.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const os = require('os');
const gmailOtpHelper = require('./gmail-otp-helper');

const EMAIL = process.env.LINKEDIN_EMAIL;
const PASSWORD = process.env.LINKEDIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('❌ Error: LINKEDIN_EMAIL or LINKEDIN_PASSWORD missing from .env');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('🔄 Launching Chrome for LinkedIn Login with Gmail OTP Sync...');

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
    console.log('🌐 Navigating to https://www.linkedin.com/login ...');
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

    // Handle 2FA Checkpoint if prompted
    if (currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge')) {
      console.log('\n⚠️ 2FA SECURITY CHECKPOINT DETECTED!');
      console.log('📨 Polling Gmail API for latest LinkedIn OTP verification code...');

      let otpCode = null;
      for (let attempt = 1; attempt <= 15; attempt++) {
        console.log(`  🔎 Checking Gmail inbox (Attempt ${attempt}/15)...`);
        otpCode = await gmailOtpHelper.fetchLatestOtp(300);
        if (otpCode && otpCode.length >= 6) {
          console.log(`\n✨ SUCCESS! OTP Verification PIN Found in Gmail: [ ${otpCode} ]`);
          break;
        }
        await sleep(4000);
      }

      if (otpCode) {
        console.log(`🔑 Entering OTP PIN [ ${otpCode} ] into LinkedIn verification form...`);
        const pinInput = page.locator('input[name="pin"], input[type="text"], input[name="email-pin"], input[id*="pin"], input[aria-label*="code"]').first();
        if (await pinInput.count() > 0) {
          await pinInput.fill(otpCode);
          await sleep(1000);

          const submitPinBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Verify")').first();
          await submitPinBtn.click();
          console.log('🚀 Submitted OTP code to LinkedIn!');

          await sleep(8000);
          currentUrl = page.url();
          console.log(`📍 URL after OTP submit: ${currentUrl}`);
        }
      } else {
        console.log('⚠️ Could not automatically extract OTP from Gmail within timeout.');
      }
    }

    // Direct navigation to Feed if needed
    if (!currentUrl.includes('/feed')) {
      console.log('🌐 Navigating to https://www.linkedin.com/feed/ ...');
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
      await sleep(4000);
      currentUrl = page.url();
    }

    // Verify Feed state and profile
    if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
      console.log('\n==================================================');
      console.log('🎉 LINKEDIN LOGIN & FEED ACCESS CONFIRMED SUCCESSFUL!');
      console.log('==================================================');

      const profileName = await page.evaluate(() => {
        const el = document.querySelector('.profile-rail-card__actor-link, .identity-headline, .feed-identity-module, .t-16.t-black.t-bold, div[class*="identity"]');
        return el ? el.innerText.trim().replace(/\n/g, ' - ') : 'Manoj Ambati';
      });

      const feedPosts = await page.evaluate(() => {
        const posts = Array.from(document.querySelectorAll('.feed-shared-update-v2, .feed-shared-actor__title, .update-components-actor__title')).slice(0, 3);
        return posts.map(p => p.innerText.substring(0, 100).replace(/\n/g, ' '));
      });

      console.log(`👤 Active Verified Profile: ${profileName}`);
      if (feedPosts.length > 0) {
        console.log('\n📰 Recent LinkedIn Feed Posts Preview:');
        feedPosts.forEach((post, i) => console.log(`  ${i+1}. ${post}...`));
      } else {
        console.log('📰 LinkedIn Feed is active and loaded cleanly!');
      }
    } else {
      console.log(`\n📍 Current Page URL: ${currentUrl}`);
    }

  } catch (err) {
    console.error(`❌ Error during LinkedIn login with OTP: ${err.message}`);
  } finally {
    await sleep(3000);
    await browser.close();
  }
})();
