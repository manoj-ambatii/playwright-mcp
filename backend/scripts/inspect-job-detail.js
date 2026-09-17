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
  const url = 'https://www.linkedin.com/jobs/view/4465458555/'; // Talentgigs Full Stack Engineer (Easy Apply)
  console.log('Navigating to job:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const btns = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, a'));
    return allBtns.map(b => ({
      tag: b.tagName,
      className: b.className,
      id: b.id,
      text: b.innerText?.trim() || '',
      aria: b.getAttribute('aria-label') || '',
      href: b.href || '',
    })).filter(b => /apply|submit/i.test(b.text) || /apply|submit/i.test(b.aria));
  });

  console.log('Buttons found:', JSON.stringify(btns, null, 2));

  await browser.close();
})();
