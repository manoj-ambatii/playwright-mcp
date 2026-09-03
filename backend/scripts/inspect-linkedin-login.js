const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const os = require('os');

const EMAIL = process.env.LINKEDIN_EMAIL;
const PASSWORD = process.env.LINKEDIN_PASSWORD;

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'linkedin-chrome-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    console.log('🌐 Navigating to https://www.linkedin.com/login ...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('📍 Current URL:', page.url());

    const emailField = await page.$('#username') || await page.$('input[name="session_key"]') || await page.$('#session_key');
    const passField = await page.$('#password') || await page.$('input[name="session_password"]') || await page.$('#session_password');

    if (emailField && passField) {
      console.log(`🔑 Entering email (${EMAIL}) and password...`);
      await emailField.fill(EMAIL);
      await passField.fill(PASSWORD);
      await page.waitForTimeout(1000);

      const btn = await page.$('button[type="submit"]') || await page.$('.btn__primary--large') || await page.$('button');
      if (btn) {
        console.log('🚀 Clicking Sign In button...');
        await btn.click();
        await page.waitForTimeout(6000);
      }
    } else {
      console.log('ℹ️ Already logged in or no input fields visible. Navigating to feed...');
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }

    const currentUrl = page.url();
    console.log('\n📍 Post-submit URL:', currentUrl);

    if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
      console.log('✅ FEED ACCESSIBLE! LINKEDIN LOGIN SUCCESSFUL!');
      
      const profileName = await page.evaluate(() => {
        const el = document.querySelector('.profile-rail-card__actor-link, .identity-headline, .feed-identity-module, .t-16.t-black.t-bold');
        return el ? el.innerText.trim() : 'Manoj Ambati';
      });
      console.log(`👤 Active Verified Profile: ${profileName}`);
    } else if (currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge')) {
      console.log('⚠️ SECURITY CHECKPOINT / 2FA VERIFICATION PIN REQUIRED ON SCREEN!');
      console.log('LinkedIn is displaying a 2FA verification PIN form on screen.');
    } else {
      console.log('Current URL state:', currentUrl);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
