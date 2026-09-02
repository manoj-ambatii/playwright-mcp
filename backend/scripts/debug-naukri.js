const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded' });
  console.log('after homepage url:', page.url());
  if (page.url().includes('login')) {
    await page.getByPlaceholder('Enter Email ID / Username').fill(process.env.NAUKRI_EMAIL);
    await page.getByPlaceholder('Enter Password').fill(process.env.NAUKRI_PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForTimeout(6000);
    console.log('after login url:', page.url());
  }
  await page.goto('https://www.naukri.com/full-stack-developer-react-node-js-jobs-in-hyderabad?k=full+stack+developer+react+node+js&l=hyderabad&experience=2&jobAge=15', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('search url:', page.url());
  const counts = await page.evaluate(() => ({
    aTitle: document.querySelectorAll('a.title').length,
    articles: document.querySelectorAll('article').length,
    jobTuples: document.querySelectorAll('div.styles_jlc__col__nIQRq, .srp-jobtuple-wrapper, .jobTuple').length,
    bodyLen: document.body.innerText.length,
    sampleHrefs: Array.from(document.querySelectorAll('a[href*="job-listings"]')).slice(0,5).map(a=>a.href),
    title: document.title,
  }));
  console.log(JSON.stringify(counts, null, 2));
  await browser.close();
})();
