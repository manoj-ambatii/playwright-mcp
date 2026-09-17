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
  await page.waitForTimeout(3000);

  // Progressive scroll of scaffold list
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const container = document.querySelector('.scaffold-layout__list, .jobs-search-results-list');
      if (container) container.scrollBy(0, 1000);
    });
    await page.waitForTimeout(600);
  }

  const jobs = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.job-card-container[data-job-id]'));
    return cards.map(c => {
      const title = c.querySelector('.job-card-list__title--link, [class*="job-title"]')?.innerText?.trim() || '';
      const comp = c.querySelector('.artdeco-entity-lockup__subtitle, [class*="company-name"]')?.innerText?.trim() || '';
      const loc = c.querySelector('.job-card-container__metadata-wrapper')?.innerText?.trim() || '';
      const text = c.innerText || '';
      const id = c.getAttribute('data-job-id');
      return {
        id,
        title: title.split('\n')[0],
        comp,
        loc,
        isEasyApply: /easy apply/i.test(text),
        hasApplied: /applied/i.test(text),
      };
    });
  });

  console.log('Jobs loaded count after scaffold scroll:', jobs.length);
  console.log('Sample jobs:', JSON.stringify(jobs.slice(0, 8), null, 2));

  await browser.close();
})();
