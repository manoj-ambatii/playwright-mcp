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
  const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Engineer&location=India&f_TPR=r604800&sortBy=DD';
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click Talentgigs card
  const card = page.locator('div.job-card-container[data-job-id="4465458555"]').first();
  if (await card.count() > 0) {
    await card.click();
    await page.waitForTimeout(2000);

    const easyApplyBtn = page.locator('.jobs-search__job-details--container button.jobs-apply-button:has-text("Easy Apply")').first();
    if (await easyApplyBtn.count() > 0) {
      console.log('Clicking Easy Apply on Talentgigs...');
      await easyApplyBtn.click();
      await page.waitForTimeout(2000);

      const modal = page.locator('.jobs-easy-apply-modal');
      // Step 1: Click Next
      const nextBtn1 = modal.locator('button:has-text("Next")').first();
      console.log('Clicking Step 1 Next...');
      await nextBtn1.click();
      await page.waitForTimeout(2000);

      // Inspect Step 2
      const step2Info = await page.evaluate(() => {
        const m = document.querySelector('.jobs-easy-apply-modal');
        const errs = Array.from(m.querySelectorAll('.artdeco-inline-feedback, [class*="error"]')).map(e => e.innerText?.trim());
        const btns = Array.from(m.querySelectorAll('button')).map(b => ({
          text: b.innerText?.trim(),
          disabled: b.disabled,
          aria: b.getAttribute('aria-label'),
        }));
        const radios = Array.from(m.querySelectorAll('input[type="radio"]')).map(r => ({
          id: r.id,
          checked: r.checked,
          name: r.name,
          label: r.closest('label')?.innerText?.trim(),
        }));
        return { errs, btns, radios, title: m.querySelector('h3, h2')?.innerText };
      });
      console.log('Step 2 DOM Info:', JSON.stringify(step2Info, null, 2));

      // Click Next on Step 2
      const nextBtn2 = modal.locator('button:has-text("Next")').first();
      console.log('Attempting Step 2 Next click...');
      await nextBtn2.click();
      await page.waitForTimeout(2000);

      // Check if Step 3 opened
      const step3Title = await page.locator('.jobs-easy-apply-modal h3, .jobs-easy-apply-modal h2').first().innerText().catch(() => '');
      console.log('Post-Step-2 Modal Title / Header:', step3Title);

      const step3Fields = await page.evaluate(() => {
        const m = document.querySelector('.jobs-easy-apply-modal');
        return Array.from(m.querySelectorAll('input, select, textarea, fieldset')).map(el => ({
          tag: el.tagName,
          label: el.closest('div.jobs-easy-apply-form-element, .fb-form-element')?.querySelector('label')?.innerText?.trim() || el.innerText?.substring(0, 50),
          type: el.type,
          value: el.value,
        }));
      });
      console.log('Step 3 Fields:', JSON.stringify(step3Fields, null, 2));

      // Cleanly dismiss
      const dismiss = page.locator('.jobs-easy-apply-modal button[aria-label="Dismiss"]').first();
      await dismiss.click();
      await page.waitForTimeout(800);
      const discard = page.locator('button:has-text("Discard")').first();
      if (await discard.count() > 0) await discard.click();
    }
  }

  await browser.close();
})();
