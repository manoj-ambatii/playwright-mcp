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
  const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack%20Developer&location=India&f_TPR=r604800&sortBy=DD';
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Listen for popup/tab
  page.context().on('page', p => console.log('New tab opened:', p.url()));

  const btn = page.locator('button.jobs-apply-button:has-text("Easy Apply")').first();
  console.log('Clicking visible Easy Apply button...');
  await btn.click({ force: true });
  await page.waitForTimeout(4000);

  // Check what new elements appeared
  const domInfo = await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('.artdeco-modal, div[role="dialog"], [class*="easy-apply"], [data-test-modal]'));
    return {
      modalCount: modals.length,
      modals: modals.map(m => ({
        tag: m.tagName,
        className: m.className,
        role: m.getAttribute('role'),
        text: m.innerText?.substring(0, 300).replace(/\n/g, ' '),
      })),
      allButtons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.length > 0 && t.length < 30)
    };
  });

  console.log('DOM info after click:', JSON.stringify(domInfo, null, 2));

  await browser.close();
})();
