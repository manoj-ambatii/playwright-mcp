const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
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

  try {
    const url = 'https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack%20Developer&location=India&f_TPR=r1296000&sortBy=DD';
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const title = await page.title();
    console.log('Page Title:', title);
    console.log('Current URL:', page.url());

    const result = await page.evaluate(() => {
      // Find all potential job card containers
      const cards = Array.from(document.querySelectorAll('.jobs-search-results-list__list-item, .job-card-container, .jobs-search-results__list-item, div[data-job-id]'));
      return cards.map((c, idx) => {
        const text = c.innerText ? c.innerText.substring(0, 150).replace(/\n/g, ' | ') : '';
        const links = Array.from(c.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText.trim() }));
        return { idx, text, links };
      });
    });

    console.log('\nFound Job Cards:', result.length);
    console.log(JSON.stringify(result.slice(0, 5), null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
