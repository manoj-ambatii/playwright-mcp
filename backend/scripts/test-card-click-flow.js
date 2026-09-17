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

  // Progressive scroll to load all 25 jobs
  for (let s = 0; s < 5; s++) {
    await page.evaluate(() => {
      const list = document.querySelector('.jobs-search-results-list');
      if (list) list.scrollBy(0, 800);
    });
    await page.waitForTimeout(800);
  }

  const cardsCount = await page.locator('.jobs-search-results-list__list-item').count();
  console.log('Total cards loaded on page after progressive scroll:', cardsCount);

  // Click card 2
  if (cardsCount > 1) {
    const card = page.locator('.jobs-search-results-list__list-item').nth(1);
    await card.click();
    await page.waitForTimeout(2000);

    const rightTitle = await page.locator('.job-details-jobs-unified-top-card__job-title, h1.t-24').first().innerText().catch(() => '');
    console.log('Clicked card 2, right pane title:', rightTitle);

    const applyBtns = await page.evaluate(() => {
      const pane = document.querySelector('.jobs-search__job-details--container, .jobs-details');
      if (!pane) return [];
      return Array.from(pane.querySelectorAll('button, a')).map(b => ({
        tag: b.tagName,
        text: b.innerText?.trim() || '',
        aria: b.getAttribute('aria-label') || '',
        isEasy: /easy apply/i.test(b.innerText || b.getAttribute('aria-label') || ''),
      })).filter(b => /apply/i.test(b.text) || /apply/i.test(b.aria));
    });
    console.log('Apply buttons in right pane for card 2:', applyBtns);
  }

  await browser.close();
})();
