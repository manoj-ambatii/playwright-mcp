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
  console.log('Navigating to search URL...');
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Scroll down results list to load more cards
  await page.evaluate(() => {
    const list = document.querySelector('.jobs-search-results-list');
    if (list) list.scrollTop = 1200;
  });
  await page.waitForTimeout(2000);

  const jobs = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.jobs-search-results-list__list-item, div[data-job-id]'));
    return cards.map(c => {
      const titleEl = c.querySelector('a.job-card-list__title, a.job-card-container__link, [class*="job-title"]');
      const compEl = c.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, [class*="company-name"]');
      const locEl = c.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption');
      const text = c.innerText || '';
      const anchor = c.querySelector('a[href*="/jobs/view/"]');
      return {
        id: c.getAttribute('data-job-id') || c.getAttribute('data-occludable-job-id'),
        title: titleEl ? titleEl.innerText.trim() : '',
        company: compEl ? compEl.innerText.trim() : '',
        location: locEl ? locEl.innerText.trim() : '',
        url: anchor ? anchor.href.split('?')[0] : '',
        isEasyApply: /easy apply/i.test(text),
        hasApplied: /applied/i.test(text),
      };
    }).filter(j => j.title);
  });

  console.log('Found jobs count:', jobs.length);
  console.log('Sample jobs:', JSON.stringify(jobs.slice(0, 10), null, 2));

  if (jobs.length > 0) {
    const firstJob = jobs[0];
    console.log('\nInspecting first job:', firstJob.title, 'at', firstJob.company);
    await page.goto(firstJob.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const detailInfo = await page.evaluate(() => {
      const applyBtn = document.querySelector('.jobs-apply-button, button[class*="jobs-apply-button"], button[aria-label*="Apply"]');
      const text = applyBtn ? applyBtn.innerText.trim() : '';
      const aria = applyBtn ? applyBtn.getAttribute('aria-label') : '';
      const isEasy = /easy apply/i.test(text) || /easy apply/i.test(aria || '');
      return {
        applyBtnFound: !!applyBtn,
        applyBtnText: text,
        applyBtnAria: aria,
        isEasyApply: isEasy,
      };
    });

    console.log('Detail Pane Info:', detailInfo);
  }

  await browser.close();
})();
