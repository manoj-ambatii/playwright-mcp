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

  const btn = page.locator('button.jobs-apply-button:has-text("Easy Apply")').first();
  await btn.click({ force: true });
  await page.waitForTimeout(2000);

  const modal = page.locator('.jobs-easy-apply-modal');
  if (await modal.count() > 0) {
    console.log('Modal is open!');
    // Inspect fields in step 1
    const step1Fields = await page.evaluate(() => {
      const m = document.querySelector('.jobs-easy-apply-modal');
      const inputs = Array.from(m.querySelectorAll('input, select, textarea')).map(i => ({
        tag: i.tagName,
        type: i.type,
        id: i.id,
        name: i.name,
        value: i.value,
        ariaLabel: i.getAttribute('aria-label'),
      }));
      const btns = Array.from(m.querySelectorAll('button')).map(b => b.innerText?.trim());
      return { inputs, btns };
    });
    console.log('Step 1 fields:', JSON.stringify(step1Fields, null, 2));

    // Try clicking Next button
    const nextBtn = page.locator('.jobs-easy-apply-modal button:has-text("Next"), .jobs-easy-apply-modal button[aria-label*="next"]').first();
    if (await nextBtn.count() > 0) {
      console.log('Clicking Next button...');
      await nextBtn.click();
      await page.waitForTimeout(2000);

      const step2Fields = await page.evaluate(() => {
        const m = document.querySelector('.jobs-easy-apply-modal');
        const inputs = Array.from(m.querySelectorAll('input, select, textarea')).map(i => ({
          tag: i.tagName,
          type: i.type,
          id: i.id,
          name: i.name,
          value: i.value,
          ariaLabel: i.getAttribute('aria-label'),
        }));
        const btns = Array.from(m.querySelectorAll('button')).map(b => b.innerText?.trim());
        const header = m.querySelector('h2, h3, [class*="header"]')?.innerText?.trim();
        return { header, inputs, btns };
      });
      console.log('Step 2 fields:', JSON.stringify(step2Fields, null, 2));
    }

    // Dismiss modal cleanly so we don't accidentally submit this AI test job
    const dismissBtn = page.locator('.jobs-easy-apply-modal button[aria-label="Dismiss"], .jobs-easy-apply-modal button:has-text("Cancel")').first();
    if (await dismissBtn.count() > 0) {
      await dismissBtn.click();
      await page.waitForTimeout(1000);
      const discardBtn = page.locator('button:has-text("Discard")').first();
      if (await discardBtn.count() > 0) await discardBtn.click();
    }
  }

  await browser.close();
})();
