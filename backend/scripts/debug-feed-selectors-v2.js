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
    await page.waitForTimeout(5000);

    // Scroll feed to trigger post render
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 1000));
      }
    });

    const info = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return { error: 'No main container found' };

      // Inspect main children
      const children = Array.from(main.querySelectorAll('div, section, article')).map(el => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        dataId: el.getAttribute('data-id') || el.getAttribute('data-urn') || el.getAttribute('data-activity-id'),
        textSnippet: el.innerText ? el.innerText.substring(0, 100).replace(/\n/g, ' | ') : ''
      })).filter(x => x.textSnippet.length > 30);

      return {
        mainClass: main.className,
        totalChildrenWithText: children.length,
        samples: children.slice(0, 8)
      };
    });

    console.log('\n--- Feed Main Debug Info ---');
    console.log(JSON.stringify(info, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
