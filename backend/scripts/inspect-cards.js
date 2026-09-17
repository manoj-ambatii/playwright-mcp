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

  const cardDetails = await page.evaluate(() => {
    // Find containers matching data-job-id or job card classes
    const els = Array.from(document.querySelectorAll('*')).filter(el => {
      return el.hasAttribute('data-job-id') || el.hasAttribute('data-occludable-job-id') || (typeof el.className === 'string' && el.className.includes('job-card'));
    });
    return els.slice(0, 10).map(el => ({
      tag: el.tagName,
      className: el.className,
      dataJobId: el.getAttribute('data-job-id'),
      dataOccludableJobId: el.getAttribute('data-occludable-job-id'),
      text: el.innerText ? el.innerText.substring(0, 120).replace(/\n/g, ' ') : '',
    }));
  });

  console.log('Cards matching attributes:', JSON.stringify(cardDetails, null, 2));

  await browser.close();
})();
