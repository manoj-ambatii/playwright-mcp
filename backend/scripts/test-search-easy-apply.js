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

  // Find right pane apply button
  const rightPaneButtons = await page.evaluate(() => {
    const pane = document.querySelector('.jobs-search__job-details--container, .job-view-layout, .jobs-details, [class*=\"job-details\"]');
    if (!pane) return { foundPane: false };

    const buttons = Array.from(pane.querySelectorAll('button, a')).map(b => ({
      tag: b.tagName,
      className: b.className,
      text: b.innerText?.trim() || '',
      aria: b.getAttribute('aria-label') || '',
    })).filter(b => /apply/i.test(b.text) || /apply/i.test(b.aria));

    return {
      foundPane: true,
      buttons,
    };
  });

  console.log('Right pane buttons:', JSON.stringify(rightPaneButtons, null, 2));

  // Now click the Easy Apply button if found in right pane
  const easyApplyLocator = page.locator('.jobs-apply-button, button:has-text("Easy Apply"), [class*="jobs-apply-button"]').first();
  if (await easyApplyLocator.count() > 0) {
    console.log('Found Easy Apply button in search page right pane! Clicking it...');
    await easyApplyLocator.click();
    await page.waitForTimeout(3000);

    const modalState = await page.evaluate(() => {
      const modal = document.querySelector('.jobs-easy-apply-modal, div[role=\"dialog\"]');
      if (!modal) return { modalFound: false, body: document.body.innerText.substring(0, 300) };
      return {
        modalFound: true,
        header: modal.querySelector('h2, h3, [class*=\"header\"]')?.innerText?.trim(),
        text: modal.innerText.substring(0, 400).replace(/\n/g, ' | '),
      };
    });
    console.log('Modal State:', JSON.stringify(modalState, null, 2));
  } else {
    console.log('Easy Apply locator count is 0');
  }

  await browser.close();
})();
