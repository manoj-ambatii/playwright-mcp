const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'linkedin-chrome-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  const url = 'https://www.linkedin.com/jobs/view/4465458555/';
  console.log('Navigating to job:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const easyApplyBtn = page.locator('a:has-text("Easy Apply"), button:has-text("Easy Apply")').first();
  const href = await easyApplyBtn.getAttribute('href');
  console.log('Easy Apply href:', href);

  console.log('Clicking Easy Apply button...');
  await easyApplyBtn.click();
  await page.waitForTimeout(4000);
  console.log('Post-click URL:', page.url());

  const dialogs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).filter(el => {
      const role = el.getAttribute('role');
      const ariaModal = el.getAttribute('aria-modal');
      const cls = el.className || '';
      return role === 'dialog' || ariaModal === 'true' || (typeof cls === 'string' && cls.includes('modal'));
    }).map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      className: el.className,
      text: el.innerText ? el.innerText.substring(0, 200).replace(/\n/g, ' ') : '',
    }));
  });

  console.log('Dialogs/modals found:', JSON.stringify(dialogs, null, 2));

  await browser.close();
})();
