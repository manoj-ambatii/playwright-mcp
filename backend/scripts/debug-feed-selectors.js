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
    console.log('Navigating to LinkedIn Feed: https://www.linkedin.com/feed/ ...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Scroll feed to trigger post render
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 1000));
      }
    });

    const info = await page.evaluate(() => {
      // Find all divs or elements with activity URN or post container classes
      const allDivs = Array.from(document.querySelectorAll('div'));
      const postDivs = allDivs.filter(d => {
        const attr = d.getAttribute('data-id') || d.getAttribute('data-urn') || d.className;
        return attr && (attr.includes('activity') || attr.includes('feed-shared-update') || attr.includes('occluded-update') || attr.includes('update-components'));
      });

      return {
        totalDivs: allDivs.length,
        matchedPostDivsCount: postDivs.length,
        samples: postDivs.slice(0, 4).map(d => ({
          className: d.className,
          dataId: d.getAttribute('data-id') || d.getAttribute('data-urn'),
          textSnippet: d.innerText ? d.innerText.substring(0, 150).replace(/\n/g, ' | ') : ''
        }))
      };
    });

    console.log('\n--- Feed Selector Debug Info ---');
    console.log(JSON.stringify(info, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
