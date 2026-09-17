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

  // Find a job card that does NOT say Easy Apply (i.e. external apply)
  const externalJob = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.jobs-search-results-list__list-item, div[data-job-id]'));
    for (const c of cards) {
      const text = c.innerText || '';
      if (!/easy apply/i.test(text)) {
        const titleEl = c.querySelector('a.job-card-list__title, a.job-card-container__link, [class*="job-title"]');
        const compEl = c.querySelector('.job-card-container__primary-description, [class*="company-name"]');
        const anchor = c.querySelector('a[href*="/jobs/view/"]');
        return {
          id: c.getAttribute('data-job-id') || c.getAttribute('data-occludable-job-id'),
          title: titleEl?.innerText?.trim(),
          company: compEl?.innerText?.trim(),
          url: anchor ? anchor.href : null,
        };
      }
    }
    return null;
  });

  console.log('Found external job:', externalJob);

  if (externalJob && externalJob.url) {
    console.log('Navigating to external job URL...');
    await page.goto(externalJob.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const applyBtns = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns.filter(b => {
        const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        return /^apply$/i.test(t) || /apply on company/i.test(t) || b.classList.contains('jobs-apply-button');
      }).map(b => ({
        tag: b.tagName,
        text: b.innerText?.trim(),
        aria: b.getAttribute('aria-label'),
        href: b.href || '',
      }));
    });

    console.log('Apply buttons on job page:', applyBtns);

    // Test clicking the external apply button and catching the popup
    const popupPromise = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
    const applyBtn = page.locator('button.jobs-apply-button, a[class*="jobs-apply-button"], button:has-text("Apply")').first();
    if (await applyBtn.count() > 0) {
      console.log('Clicking Apply button...');
      await applyBtn.click();
      const popup = await popupPromise;
      if (popup) {
        console.log('Caught popup page!');
        await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        console.log('Popup URL:', popup.url());
        console.log('Popup Title:', await popup.title());
        await popup.close();
      } else {
        console.log('No popup opened, current page URL:', page.url());
      }
    }
  }

  await browser.close();
})();
