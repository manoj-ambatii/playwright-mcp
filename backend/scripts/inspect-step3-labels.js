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

  const card = page.locator('div.job-card-container[data-job-id="4465458555"]').first();
  await card.click();
  await page.waitForTimeout(2000);

  const easyApplyBtn = page.locator('.jobs-search__job-details--container button.jobs-apply-button:has-text("Easy Apply")').first();
  await easyApplyBtn.click();
  await page.waitForTimeout(2000);

  const modal = page.locator('.jobs-easy-apply-modal');
  // Click Next on Step 1
  await modal.locator('button:has-text("Next")').first().click();
  await page.waitForTimeout(1500);

  // Click Next on Step 2
  await modal.locator('button:has-text("Next")').first().click();
  await page.waitForTimeout(1500);

  // Inspect questions in Step 3
  const questions = await page.evaluate(() => {
    const m = document.querySelector('.jobs-easy-apply-modal');
    const sections = Array.from(m.querySelectorAll('.jobs-easy-apply-form-section__grouping, .fb-form-element, [class*="form-element"]'));
    return sections.map(s => {
      const label = s.querySelector('label, .fb-form-element-label, legend, span[aria-hidden="true"]')?.innerText?.trim();
      const input = s.querySelector('input, select, textarea');
      return {
        question: label,
        inputType: input?.type,
        currentVal: input?.value,
      };
    }).filter(q => q.question);
  });

  console.log('Step 3 Questions & Labels:', JSON.stringify(questions, null, 2));

  // Dismiss
  const dismiss = page.locator('.jobs-easy-apply-modal button[aria-label="Dismiss"]').first();
  await dismiss.click();
  await page.waitForTimeout(500);
  const discard = page.locator('button:has-text("Discard")').first();
  if (await discard.count() > 0) await discard.click();

  await browser.close();
})();
