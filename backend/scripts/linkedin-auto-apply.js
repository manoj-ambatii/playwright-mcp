/**
 * linkedin-auto-apply.js
 * End-to-end automated LinkedIn job applicant:
 * - Direct in-platform Easy Apply submission.
 * - External company career portal application (Workday, Greenhouse, Lever, SmartRecruiters, Ashby, Google Forms, company sites).
 * - Profile matching candidate facts (Manoj Ambati, 2 yrs exp, immediate joiner, 4.2 current CTC, 10 expected CTC).
 * - Full deduplication with job-tracker.json and job-applications.xlsx.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const tracker = require('./track-jobs');
const { fetchLatestOtp } = require('./gmail-otp-helper');

const EMAIL = process.env.LINKEDIN_EMAIL;
const PASSWORD = process.env.LINKEDIN_PASSWORD;
const DEFAULT_SITE_PASSWORD = process.env.NAUKRI_PASSWORD || 'Manoj@2469';
const TARGET = parseInt(process.env.TARGET || '25', 10);
const RESUME_PATH = path.join(__dirname, '../../frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf');

// Freshness filter: r86400 = 24h, r259200 = 3 days, r604800 = 1 week
const FRESHNESS = process.env.FRESHNESS || 'r604800';

const PROFILE = {
  firstName: 'Manoj',
  lastName: 'Ambati',
  fullName: 'Manoj Ambati',
  name: 'Manoj Ambati',
  email: 'ambatimanoj2469@gmail.com',
  phone: '9347946872',
  countryCode: '+91',
  location: 'Hyderabad',
  city: 'Hyderabad',
  country: 'India',
  currentCompany: 'Voltuswave Technologies India Pvt. Ltd.',
  currentTitle: 'Full Stack Developer',
  currentCtc: '4.2',
  expectedCtc: '10',
  noticePeriod: '0',
  totalExp: '2',
  javaExp: '2',
  springExp: '2',
  springBootExp: '2',
  reactExp: '2',
  nodeExp: '2',
  mysqlExp: '2',
  awsExp: '2',
  dockerExp: '2',
  defaultYears: '2',
  githubUrl: 'https://github.com/manoj-voltuswave',
  linkedinUrl: 'https://www.linkedin.com/in/manojambati2469/',
};

// Search URLs tailored for Java Full Stack, Java Backend, Java Developer, Spring Boot
const SEARCH_URLS = [
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack%20Developer&location=India&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Backend%20Developer&location=India&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Spring%20Boot%20Developer&location=India&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Developer&location=India&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Developer%20Java&location=India&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack&location=Hyderabad&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Full%20Stack&location=Bengaluru&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Backend&location=Hyderabad&f_TPR=${FRESHNESS}&sortBy=DD`,
  `https://www.linkedin.com/jobs/search/?keywords=Java%20Backend&location=Bengaluru&f_TPR=${FRESHNESS}&sortBy=DD`,
];

// Strict Whitelist & Blacklist for matching roles
const BLACKLIST_TITLE_REGEX = /\b(caller|telecaller|tele-caller|telesales|call\s*center|voice\s*process|non\s*voice|customer\s*support|bpo|kpo|data\s*entry|sales|hr\s*executive|recruiter|\.net|dot\s*net|dotnet|c#|c\+\+|php|ruby|golang|go\s*developer|python|ios|swift|android|flutter|qa\b|tester|testing|devops|salesforce|sap|mainframe|intern|internship)\b/i;
const WHITELIST_TITLE_REGEX = /\b(java|spring|spring\s*boot|full\s*stack|fullstack|backend|back\s*end|software\s*engineer|software\s*developer|sde)\b/i;

function isTargetJob(title) {
  if (!title) return false;
  if (BLACKLIST_TITLE_REGEX.test(title)) return false;
  return WHITELIST_TITLE_REGEX.test(title);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureLoggedIn(page) {
  console.log('Verifying LinkedIn login status...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  if (page.url().includes('/feed') || page.url().includes('/mynetwork')) {
    console.log('Active verified LinkedIn session confirmed.');
    return;
  }

  console.log('Session not active, performing login...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const emailInput = page.locator('input[type="email"]').last();
  const passInput = page.locator('input[type="password"]').last();

  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);
    await sleep(1000);
    const signInBtn = page.locator('button:has-text("Sign in")').last();
    await signInBtn.click();
    await sleep(6000);
  }

  let currentUrl = page.url();
  if (currentUrl.includes('/checkpoint') || currentUrl.includes('/challenge')) {
    console.log('2FA Challenge detected, checking Gmail OTP or phone approval...');
    let otp = await fetchLatestOtp(180);
    if (otp) {
      const pinInput = page.locator('input[name="pin"], input[type="text"], input[name="email-pin"]').first();
      if (await pinInput.count() > 0) {
        await pinInput.fill(otp);
        const submitPinBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Verify")').first();
        await submitPinBtn.click();
        await sleep(6000);
      }
    }
  }

  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  if (!page.url().includes('/feed') && !page.url().includes('/mynetwork')) {
    throw new Error('LinkedIn login failed. Please verify credentials or complete checkpoint.');
  }
  console.log('Logged into LinkedIn successfully.');
}

function answerQuestion(label, options = []) {
  const t = (label || '').toLowerCase();
  if (/serving.*notice/.test(t)) return 'No';
  if (/offer.*in\s*hand/.test(t)) return 'No';
  if (/notice\s*period|\bnp\b|mention in days/i.test(t)) {
    if (options.some(o => /immediate|0\s*days?/i.test(o))) return 'Immediate';
    return '0';
  }
  if (/years?.*(experience|exp).*(java)/.test(t)) return PROFILE.javaExp;
  if (/years?.*(experience|exp).*(spring|spring boot)/.test(t)) return PROFILE.springBootExp;
  if (/years?.*(experience|exp).*(microservices|micro\s*services)/.test(t)) return PROFILE.springBootExp;
  if (/years?.*(experience|exp).*(react)/.test(t)) return PROFILE.reactExp;
  if (/years?.*(experience|exp).*(node|nodejs)/.test(t)) return PROFILE.nodeExp;
  if (/years?.*(experience|exp).*(sql|mysql)/.test(t)) return PROFILE.mysqlExp;
  if (/years?.*(experience|exp).*(docker)/.test(t)) return PROFILE.dockerExp;
  if (/years?.*(experience|exp).*(aws)/.test(t)) return PROFILE.awsExp;
  if (/years?.*(experience|exp).*(rest|api)/.test(t)) return PROFILE.totalExp;
  if (/years?.*(experience|exp).*(full\s*stack|fullstack|backend|back\s*end)/.test(t)) return PROFILE.totalExp;
  if (/years?.*(experience|exp)/.test(t)) return PROFILE.totalExp;

  if (/(current|present).*(ctc|salary|package|pay)/.test(t)) return PROFILE.currentCtc;
  if (/(expected|expecting).*(ctc|salary|package|pay)/.test(t)) return PROFILE.expectedCtc;
  if (/\bctc\b/i.test(t)) return PROFILE.currentCtc;

  if (/authorized|legally.*authorized|work.*authorization/i.test(t)) return 'Yes';
  if (/sponsorship|visa.*sponsor/i.test(t)) return 'No';
  if (/relocate|relocation/i.test(t)) return 'Yes';
  if (/hybrid|on-site|office|work from/i.test(t)) return 'Yes';
  if (/immediate|join.*immediately/i.test(t)) return 'Yes';
  if (/git|agile|scrum|methodolog/i.test(t)) return 'Yes';

  if (/^(are you|do you|can you|will you|have you|is it|would you)/i.test(t)) return 'Yes';
  if (/how many|number of|years/i.test(t)) return PROFILE.defaultYears;
  return 'Yes';
}

async function handleEasyApplyModal(page) {
  const modalSelector = '.jobs-easy-apply-modal';
  await page.waitForSelector(modalSelector, { timeout: 8000 }).catch(() => null);

  const maxSteps = 12;
  for (let step = 1; step <= maxSteps; step++) {
    await sleep(1500);
    const modal = page.locator(modalSelector).first();
    if (await modal.count() === 0) break;

    // 1. Fill phone number if empty
    const phoneInput = modal.locator('input[type="text"][id*="phoneNumber"]').first();
    if (await phoneInput.count() > 0) {
      const val = await phoneInput.inputValue();
      if (!val || val.trim() === '') {
        await phoneInput.fill(PROFILE.phone);
        await sleep(300);
      }
    }

    // 2. Resume handling
    const fileInput = modal.locator('input[type="file"]').first();
    if (await fileInput.count() > 0 && fs.existsSync(RESUME_PATH)) {
      const radioSelected = await modal.locator('input[type="radio"]:checked').count() > 0;
      if (!radioSelected) {
        try {
          await fileInput.setInputFiles(RESUME_PATH);
          console.log('  Uploaded resume PDF to Easy Apply modal');
          await sleep(1500);
        } catch (e) {}
      }
    }

    // 3. Question Form Elements (sections)
    await page.evaluate((prof) => {
      function ans(q, opts = []) {
        const t = (q || '').toLowerCase();
        if (/serving.*notice/.test(t)) return 'No';
        if (/offer.*in\s*hand/.test(t)) return 'No';
        if (/notice\s*period|\bnp\b|mention in days/i.test(t)) {
          if (opts.some(o => /immediate|0\s*days?/i.test(o))) return 'Immediate';
          return '0';
        }
        if (/years?.*(experience|exp)/.test(t)) return prof.totalExp;
        if (/(current|present).*(ctc|salary|package|pay)/.test(t)) return prof.currentCtc;
        if (/(expected|expecting).*(ctc|salary|package|pay)/.test(t)) return prof.expectedCtc;
        if (/\bctc\b/i.test(t)) return prof.currentCtc;
        if (/authorized|legally.*authorized|work.*authorization/i.test(t)) return 'Yes';
        if (/sponsorship|visa.*sponsor/i.test(t)) return 'No';
        if (/relocate|relocation/i.test(t)) return 'Yes';
        if (/hybrid|on-site|office|work from/i.test(t)) return 'Yes';
        if (/immediate|join.*immediately/i.test(t)) return 'Yes';
        if (/git|agile|scrum/i.test(t)) return 'Yes';
        if (/^(are you|do you|can you|will you|have you|is it|would you)/i.test(t)) return 'Yes';
        return 'Yes';
      }

      const m = document.querySelector('.jobs-easy-apply-modal');
      if (!m) return;

      const elements = Array.from(m.querySelectorAll('.jobs-easy-apply-form-section__grouping, .fb-form-element, [class*="form-element"]'));
      for (const el of elements) {
        const label = el.querySelector('label, .fb-form-element-label, legend, span[aria-hidden="true"]')?.innerText?.trim() || '';
        if (!label) continue;

        // Radios
        const radios = Array.from(el.querySelectorAll('input[type="radio"]'));
        if (radios.length > 0) {
          const expectedAns = ans(label);
          const target = radios.find(r => {
            const rLbl = r.closest('label')?.innerText?.trim().toLowerCase() || r.value.toLowerCase();
            return rLbl.includes(expectedAns.toLowerCase());
          });
          if (target && !target.checked) target.click();
          continue;
        }

        // Select dropdown
        const sel = el.querySelector('select');
        if (sel) {
          const opts = Array.from(sel.options).map(o => o.text.trim());
          const expectedAns = ans(label, opts);
          const match = Array.from(sel.options).find(o => o.text.toLowerCase().includes(expectedAns.toLowerCase()));
          if (match && sel.value !== match.value) {
            sel.value = match.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          continue;
        }

        // Text / number input
        const inp = el.querySelector('input[type="text"], input[type="number"], textarea');
        if (inp && (!inp.value || inp.value.trim() === '')) {
          const expectedAns = ans(label);
          inp.focus();
          inp.value = expectedAns;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, PROFILE);

    await sleep(1000);

    // Dismiss any open autocomplete/typeahead overlay before navigation
    await page.evaluate(() => {
      const hit = document.querySelector('.search-typeahead-v2__hit, [class*="typeahead"] [class*="hit"]');
      if (hit) hit.click();
    }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);

    // 4. Check submit button
    const submitBtn = modal.locator('button:has-text("Submit application")').first();
    if (await submitBtn.count() > 0 && await submitBtn.isVisible().catch(() => false)) {
      const followCb = modal.locator('input[type="checkbox"][id*="follow"]').first();
      if (await followCb.count() > 0 && await followCb.isChecked().catch(() => false)) {
        await followCb.uncheck().catch(() => {});
      }
      console.log('  Submitting Easy Apply application...');
      await submitBtn.click({ force: true, timeout: 8000 }).catch(() => {});
      await sleep(3500);

      const doneBtn = page.locator('button:has-text("Done"), button[aria-label="Dismiss"]').first();
      if (await doneBtn.count() > 0) {
        await doneBtn.click({ force: true }).catch(() => {});
      }
      return { status: 'applied', notes: 'LinkedIn Easy Apply' };
    }

    const reviewBtn = modal.locator('button:has-text("Review")').first();
    if (await reviewBtn.count() > 0 && await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click({ force: true, timeout: 6000 }).catch(() => {});
      await sleep(1000);
      continue;
    }

    const nextBtn = modal.locator('button:has-text("Next"), button[aria-label*="Continue to next step"]').first();
    if (await nextBtn.count() > 0 && await nextBtn.isVisible().catch(() => false)) {
      const clicked = await nextBtn.click({ force: true, timeout: 6000 }).then(() => true).catch(() => false);
      if (!clicked) {
        // If Playwright click timed out, try native evaluate click
        await page.evaluate(() => {
          const btn = document.querySelector('.jobs-easy-apply-modal button[data-easy-apply-next-button], .jobs-easy-apply-modal button.artdeco-button--primary');
          if (btn) btn.click();
        }).catch(() => {});
      }
      await sleep(1000);
      continue;
    }

    break;
  }

  // Dismiss if stuck
  const dismiss = page.locator('.jobs-easy-apply-modal button[aria-label="Dismiss"]').first();
  if (await dismiss.count() > 0) {
    await dismiss.click({ force: true }).catch(() => {});
    await sleep(500);
    const discard = page.locator('button:has-text("Discard")').first();
    if (await discard.count() > 0) await discard.click({ force: true }).catch(() => {});
  }
  return { status: 'failed', reason: 'Easy Apply modal could not advance' };
}

async function handleExternalApply(context, page, job, applyBtnLocator) {
  console.log('  External apply detected, opening external career portal...');
  const popupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);

  await applyBtnLocator.click({ force: true });
  let externalPage = await popupPromise;

  if (!externalPage) {
    const pages = context.pages();
    if (pages.length > 1) {
      externalPage = pages[pages.length - 1];
    }
  }

  if (!externalPage) {
    const href = await applyBtnLocator.getAttribute('href').catch(() => null);
    if (href) {
      externalPage = await context.newPage();
      await externalPage.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
  }

  if (!externalPage) {
    return { status: 'failed', reason: 'Could not open external application URL' };
  }

  await externalPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await sleep(3000);
  const extUrl = externalPage.url();
  console.log(`  External URL: ${extUrl}`);

  try {
    // 1. Check if external site has login/sign-in required
    const loginDetected = await externalPage.evaluate(() => {
      const emailField = document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
      const passField = document.querySelector('input[type="password"], input[name*="password" i]');
      const signInBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b =>
        /sign in|log in|login/i.test(b.innerText || b.value || '')
      );
      return !!(emailField && passField && signInBtn);
    }).catch(() => false);

    if (loginDetected) {
      console.log('  Login form detected on external company site, entering candidate credentials...');
      await externalPage.evaluate((creds) => {
        const setVal = (el, val) => {
          if (el) {
            el.focus(); el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        const emailField = document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
        const passField = document.querySelector('input[type="password"], input[name*="password" i]');
        setVal(emailField, creds.email);
        setVal(passField, creds.password);
      }, { email: PROFILE.email, password: DEFAULT_SITE_PASSWORD }).catch(() => {});

      await sleep(1000);
      const submitLogin = externalPage.locator('button:has-text("Sign In"), button:has-text("Log In"), button[type="submit"]').first();
      if (await submitLogin.count() > 0) {
        await submitLogin.click().catch(() => {});
        await sleep(4000);
      }
    }

    // 2. Look for "Apply" / "Apply Now" button to open the form if not yet visible
    await externalPage.evaluate(() => {
      const hasForm = document.querySelector('input[type="file"], input[name*="name" i]');
      if (!hasForm) {
        const applyBtn = Array.from(document.querySelectorAll('button, a')).find(b =>
          /^(apply|apply now|apply for this job|start application)$/i.test((b.innerText || '').trim()) ||
          /apply now|apply for this/i.test(b.innerText || '')
        );
        if (applyBtn) applyBtn.click();
      }
    }).catch(() => {});
    await sleep(2500);

    // 3. Resume attachment
    const fileInput = externalPage.locator('input[type="file"]').first();
    if (await fileInput.count() > 0 && fs.existsSync(RESUME_PATH)) {
      try {
        await fileInput.setInputFiles(RESUME_PATH);
        console.log('  Attached resume PDF on external portal');
        await sleep(1500);
      } catch (e) {}
    }

    // 4. Fill standard candidate fields
    await externalPage.evaluate((prof) => {
      const setVal = (sel, val) => {
        const el = document.querySelector(sel);
        if (el && (!el.value || el.value.trim() === '')) {
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      setVal('input[name*="first" i], input[id*="first" i]', prof.firstName);
      setVal('input[name*="last" i], input[id*="last" i]', prof.lastName);
      setVal('input[name*="full" i], input[id*="full" i], input[name="name" i], input[id="name" i]', prof.fullName);
      setVal('input[name*="email" i], input[id*="email" i], input[type="email"]', prof.email);
      setVal('input[name*="phone" i], input[id*="phone" i], input[name*="mobile" i], input[type="tel"]', prof.phone);
      setVal('input[name*="location" i], input[id*="location" i], input[name*="city" i]', prof.location);
      setVal('input[name*="linkedin" i], input[id*="linkedin" i]', prof.linkedinUrl);
      setVal('input[name*="github" i], input[id*="github" i]', prof.githubUrl);
      setVal('input[name*="experience" i], input[name*="exp" i]', prof.totalExp);
      setVal('input[name*="notice" i]', prof.noticePeriod);
      setVal('input[name*="ctc" i]', prof.expectedCtc);

      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const label = cb.closest('label')?.innerText?.toLowerCase() || '';
        if (/agree|consent|terms|privacy|policy|data/i.test(label)) {
          if (!cb.checked) cb.click();
        }
      });
    }, PROFILE).catch(() => {});

    await sleep(2000);

    // 5. Check if submit button is available
    const submitBtn = externalPage.locator('button:has-text("Submit Application"), button:has-text("Submit"), input[type="submit"]').first();
    const canSubmit = await submitBtn.count() > 0 && await submitBtn.isVisible().catch(() => false);

    if (canSubmit) {
      console.log('  Submitting external company application...');
      await submitBtn.click().catch(() => {});
      await sleep(4000);

      const isSuccess = await externalPage.evaluate(() => {
        const t = document.body.innerText;
        return /thank you for applying|application received|successfully submitted|application submitted/i.test(t);
      }).catch(() => false);

      await externalPage.close().catch(() => {});
      return {
        status: isSuccess ? 'applied' : 'external',
        externalUrl: extUrl,
        notes: isSuccess ? 'Applied via External Career Site' : 'Submitted on External Portal (Pending Confirmation)',
      };
    } else {
      await externalPage.close().catch(() => {});
      return {
        status: 'external',
        externalUrl: extUrl,
        notes: 'External Career Site lead captured (requires multi-step ATS completion)',
      };
    }
  } catch (err) {
    if (externalPage && !externalPage.isClosed()) await externalPage.close().catch(() => {});
    return { status: 'external', externalUrl: extUrl, notes: `External lead (${err.message})` };
  }
}

async function collectLinkedInJobs(page, searchUrl) {
  console.log(`\nNavigating to search URL: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);

  // Progressive scroll to load occluded job cards
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const list = document.querySelector('.scaffold-layout__list, .jobs-search-results-list');
      if (list) list.scrollBy(0, 1000);
    });
    await sleep(600);
  }

  const jobs = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.job-card-container[data-job-id]'));
    return cards.map(c => {
      const titleEl = c.querySelector('.job-card-list__title--link, [class*="job-title"]');
      const compEl = c.querySelector('.artdeco-entity-lockup__subtitle, [class*="company-name"]');
      const locEl = c.querySelector('.job-card-container__metadata-wrapper');
      const id = c.getAttribute('data-job-id');
      const text = c.innerText || '';
      return {
        id,
        title: titleEl ? titleEl.innerText.trim().split('\n')[0] : '',
        company: compEl ? compEl.innerText.trim() : '',
        location: locEl ? locEl.innerText.trim() : '',
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        isEasyApply: /easy apply/i.test(text),
      };
    }).filter(j => j.title && j.id);
  });

  return jobs;
}

(async () => {
  if (!EMAIL || !PASSWORD) {
    console.error('Missing LINKEDIN_EMAIL or LINKEDIN_PASSWORD in .env');
    process.exit(1);
  }

  const userDataDir = path.join(os.tmpdir(), 'linkedin-chrome-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  const summary = { appliedEasy: 0, appliedExternal: 0, externalLeads: 0, dedupSkip: 0, irrelevantSkip: 0, failed: 0 };

  try {
    await ensureLoggedIn(page);

    let totalApplied = 0;

    for (const searchUrl of SEARCH_URLS) {
      if (totalApplied >= TARGET) break;

      const jobs = await collectLinkedInJobs(page, searchUrl);
      console.log(`Found ${jobs.length} candidate jobs in list.`);

      for (let i = 0; i < jobs.length && totalApplied < TARGET; i++) {
        const job = jobs[i];
        console.log(`\n[${i + 1}/${jobs.length}] ${job.title} @ ${job.company} (${job.location})`);

        if (!isTargetJob(job.title)) {
          console.log(`  -> skipped (not Java Full Stack / Backend target title)`);
          summary.irrelevantSkip++;
          continue;
        }

        if (tracker.has(job.url)) {
          console.log(`  -> dedup_skip (already tracked in ${tracker.whereIs(job.url)})`);
          summary.dedupSkip++;
          continue;
        }

        try {
          // Click card in left list to load right pane
          const cardLocator = page.locator(`div.job-card-container[data-job-id="${job.id}"]`).first();
          if (await cardLocator.count() > 0) {
            await cardLocator.click({ force: true }).catch(() => {});
            await sleep(2000);
          } else {
            await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await sleep(2500);
          }

          // Check if already applied on page
          const alreadyApplied = await page.evaluate(() => {
            const text = document.body.innerText;
            return /you applied|already applied|applied \d+ days? ago/i.test(text) ||
              Array.from(document.querySelectorAll('span, button, div')).some(el => /^applied$/i.test(el.innerText?.trim()));
          }).catch(() => false);

          if (alreadyApplied) {
            console.log('  -> already_applied on LinkedIn');
            tracker.logSkipped({ ...job, source: 'linkedin', reason: 'already_applied' });
            summary.dedupSkip++;
            continue;
          }

          // Check right pane apply button
          const applyBtnInfo = await page.evaluate(() => {
            const pane = document.querySelector('.jobs-search__job-details--container, .jobs-details') || document.body;
            const btns = Array.from(pane.querySelectorAll('button, a')).filter(b => {
              const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
              return /^apply$/i.test(t) || /easy apply/i.test(t) || /apply on company/i.test(t) || b.classList.contains('jobs-apply-button');
            });
            const btn = btns[0];
            if (!btn) return null;
            const text = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
            return {
              isEasyApply: /easy apply/i.test(text),
              text,
              href: btn.href || null,
            };
          }).catch(() => null);

          if (!applyBtnInfo) {
            console.log('  -> no apply button found');
            tracker.logSkipped({ ...job, source: 'linkedin', reason: 'no_apply_button' });
            continue;
          }

          const applyBtnLocator = page.locator('.jobs-search__job-details--container button.jobs-apply-button, .jobs-search__job-details--container a[class*="jobs-apply-button"], button.jobs-apply-button, a:has-text("Apply")').first();

          if (applyBtnInfo.isEasyApply) {
            console.log('  -> LinkedIn Easy Apply detected, opening modal...');
            await applyBtnLocator.click({ force: true });
            const res = await handleEasyApplyModal(page);
            console.log(`  -> Easy Apply Result: ${res.status}`);

            if (res.status === 'applied') {
              tracker.logApplied({ ...job, source: 'linkedin', notes: 'LinkedIn Easy Apply' });
              summary.appliedEasy++;
              totalApplied++;
            } else {
              tracker.logSkipped({ ...job, source: 'linkedin', reason: res.reason || 'easy_apply_incomplete' });
              summary.failed++;
            }
          } else {
            console.log('  -> External Apply detected (navigating to company site)...');
            const res = await handleExternalApply(context, page, job, applyBtnLocator);
            console.log(`  -> External Apply Result: ${res.status}`);

            if (res.status === 'applied') {
              tracker.logApplied({ ...job, source: 'linkedin-external', externalUrl: res.externalUrl, notes: res.notes });
              summary.appliedExternal++;
              totalApplied++;
            } else {
              tracker.logExternal({ ...job, source: 'linkedin-external', externalUrl: res.externalUrl, notes: res.notes });
              summary.externalLeads++;
            }
          }
        } catch (jobErr) {
          console.error(`  Error processing job: ${jobErr.message}`);
          tracker.logFailed({ ...job, source: 'linkedin', reason: jobErr.message });
          summary.failed++;
        }

        tracker.save();
        await sleep(2000);
      }
    }
  } catch (err) {
    console.error('Fatal LinkedIn runner error:', err.message);
  } finally {
    tracker.save();
    console.log('\n==================================================');
    console.log('📊 LINKEDIN AUTO-APPLY RUN COMPLETED');
    console.log('==================================================');
    console.log('Summary:', summary);
    console.log(tracker.summary());
    await context.close().catch(() => {});
  }
})();
