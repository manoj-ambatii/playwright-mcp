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
    console.log('Navigating to https://www.linkedin.com/login ...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Page Title:', title);
    console.log('Page URL:', page.url());

    // Print all form elements, buttons, inputs, links
    const elements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, button, a')).map(el => ({
        tag: el.tagName,
        id: el.id,
        name: el.name,
        type: el.type,
        text: el.innerText ? el.innerText.substring(0, 30) : '',
        placeholder: el.placeholder || '',
        class: el.className,
      }));
      return inputs;
    });

    console.log('\n--- Page Elements ---');
    console.log(JSON.stringify(elements, null, 2));

    // Also take a screenshot for full clarity
    const screenshotPath = path.join(__dirname, '../data', 'linkedin-page.png');
    await page.screenshot({ path: screenshotPath });
    console.log('\nScreenshot saved to:', screenshotPath);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
