/**
 * apply-external-jobs.js
 * Automated application handler for external company career sites (Workday, Greenhouse, Lever, etc.)
 * 
 * Features:
 * - Reads external job links from naukri-external-jobs.json / job-tracker.json
 * - Uses candidate profile details from candidate-facts.md
 * - Uploads resume (frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf)
 * - Uses gmail-otp-helper.js for OTP verification when required
 * - Logs results to job-tracker.json (applied / failed / external)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const tracker = require('./track-jobs');
const { fetchLatestOtp } = require('./gmail-otp-helper');

const RESUME_PATH = path.join(__dirname, '../../frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf');
const EXTERNAL_FILE = path.join(__dirname, '../data', 'naukri-external-jobs.json');

// Strict Blacklist & Whitelist Regex to eliminate caller, BPO, data entry, non-tech, and mismatched stacks
const BLACKLIST_TITLE_REGEX = /\b(caller|telecaller|tele-caller|telesales|telemarketing|call\s*center|voice\s*process|non\s*voice|customer\s*(?:support|care|service)|chat\s*support|bpo|kpo|data\s*entry|back\s*office|computer\s*operator|typing|clerk|office\s*assistant|receptionist|front\s*desk|excel\s*operator|sales|business\s*development|bde|field\s*(?:sales|executive)|retail|accountant|tally|recruiter|hr\s*executive|talent\s*acquisition|\.net|dot\s*net|dotnet|c#|c\+\+|php|ruby|golang|go\s*developer|python|ios|swift|android|flutter|qa\b|tester|testing|automation\s*test|devops|salesforce|sap|mainframe|etl)\b/i;

const WHITELIST_TITLE_REGEX = /\b(java|spring|spring\s*boot|full\s*stack|fullstack|backend|software\s*engineer|software\s*developer|sde)\b/i;

function isTargetJob(title) {
  if (!title) return false;
  if (BLACKLIST_TITLE_REGEX.test(title)) return false;
  return WHITELIST_TITLE_REGEX.test(title);
}

const PROFILE = {
  firstName: 'Manoj',
  lastName: 'Ambati',
  fullName: 'Manoj Ambati',
  email: 'ambatimanoj2469@gmail.com',
  phone: '9347946872',
  location: 'Hyderabad',
  currentCtc: '4.2',
  expectedCtc: '10',
  noticePeriod: '0',
  totalExp: '2',
  javaExp: '2',
  springExp: '2',
  reactExp: '2',
  nodeExp: '2',
  sqlExp: '2',
  githubUrl: 'https://github.com/manoj-voltuswave',
  linkedinUrl: 'https://www.linkedin.com/in/manojambati2469/',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadExternalJobs() {
  if (fs.existsSync(EXTERNAL_FILE)) {
    try { return JSON.parse(fs.readFileSync(EXTERNAL_FILE, 'utf8')); } catch { return []; }
  }
  return [];
}

async function attemptExternalApply(page, job) {
  const targetUrl = job.externalUrl || job.applyUrl;
  console.log(`\nNavigating to external site: ${job.company} (${targetUrl})`);
  
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(2500);

  let activePage = page;
  if (page.url().includes('naukri.com')) {
    // Check if job on Naukri is already applied
    const alreadyApplied = await page.evaluate(() => {
      return !!document.getElementById('already-applied') ||
        !!document.querySelector('[class*="already-applied"]') ||
        Array.from(document.querySelectorAll('button, a, div, span')).some(el =>
          /^applied$/i.test(el.innerText?.trim())
        );
    }).catch(() => false);

    if (alreadyApplied) {
      return { status: 'already_applied', reason: 'Already applied' };
    }

    const popupPromise = page.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
    const clickedCompanyBtn = await page.evaluate(() => {
      const btn = document.getElementById('company-site-button') ||
        Array.from(document.querySelectorAll('button, a, div, span')).find(el =>
          /apply on company site|apply on website|company site|external site/i.test(el.innerText || el.getAttribute('title') || '')
        );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }).catch(() => false);

    if (clickedCompanyBtn) {
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        activePage = popup;
        await sleep(3000);
      }
    }
  }

  // Check if page loaded
  const bodyText = await activePage.evaluate(() => document.body.innerText || '').catch(() => '');
  if (!bodyText || bodyText.length < 50) {
    if (activePage !== page) await activePage.close().catch(() => {});
    return { status: 'failed', reason: 'Page failed to load or access restricted' };
  }

  // If not yet on application form, check for an "Apply" / "Apply Now" button to open the form
  await activePage.evaluate(() => {
    const hasForm = document.querySelector('input[type="file"], input[name*="email" i], input[type="email"]');
    if (!hasForm) {
      const applyBtn = Array.from(document.querySelectorAll('button, a')).find(b =>
        /^(apply|apply now|apply for this job|start application)$/i.test((b.innerText || '').trim()) ||
        /apply now|apply for this/i.test(b.innerText || '')
      );
      if (applyBtn && !applyBtn.id?.includes('company-site')) {
        applyBtn.click();
      }
    }
  }).catch(() => {});
  await sleep(2500);

  // Look for application inputs / upload fields
  const pageState = await activePage.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const fileInput = document.querySelector('input[type="file"]');
    const applyBtns = Array.from(document.querySelectorAll('button, a')).filter(b => 
      /apply|submit|start application/i.test(b.innerText || '')
    );
    return {
      inputCount: inputs.length,
      hasFileInput: !!fileInput,
      hasApplyBtn: applyBtns.length > 0,
      title: document.title,
    };
  });

  // Handle resume file upload if input present
  if (pageState.hasFileInput && fs.existsSync(RESUME_PATH)) {
    try {
      const fileInput = await activePage.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(RESUME_PATH);
        console.log('  Uploaded resume PDF');
        await sleep(1200);
      }
    } catch (e) {
      console.log('  Resume upload skipped:', e.message);
    }
  }

  // Fill standard input fields (Name, Email, Phone, LinkedIn, GitHub, Location, CTC)
  await activePage.evaluate((prof) => {
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
    setVal('input[name*="current" i][name*="ctc" i], input[name*="current" i][name*="salary" i]', prof.currentCtc);
    setVal('input[name*="expected" i][name*="ctc" i], input[name*="expected" i][name*="salary" i]', prof.expectedCtc);
  }, PROFILE).catch(() => {});

  // Agree to terms / consent checkboxes if unchecked
  await activePage.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const cb of checkboxes) {
      if (!cb.checked && /agree|consent|terms|policy|privacy|authorized/i.test(cb.parentElement?.innerText || cb.name || cb.id || '')) {
        cb.click();
      }
    }
  }).catch(() => {});

  // Check for OTP prompt
  const needsOtp = await activePage.evaluate(() => 
    /enter otp|verification code|enter code|sent to your email/i.test(document.body.innerText)
  ).catch(() => false);

  if (needsOtp) {
    console.log('  OTP verification prompt detected! Querying Gmail API...');
    await sleep(5000); // Wait 5s for email arrival
    const otpCode = await fetchLatestOtp(180);
    if (otpCode) {
      console.log(`  Extracted OTP from Gmail: ${otpCode}`);
      await activePage.evaluate((code) => {
        const otpInput = document.querySelector('input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[id*="code" i], input[type="number"]');
        if (otpInput) {
          otpInput.value = code;
          otpInput.dispatchEvent(new Event('input', { bubbles: true }));
          otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, otpCode);
      await sleep(1000);
    } else {
      console.log('  No OTP received in Gmail yet');
    }
  }

  // Attempt click submit button if ready
  await activePage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b =>
      /submit application|submit|apply now|complete application/i.test(b.innerText || b.value || '')
    );
    if (btn) btn.click();
  }).catch(() => {});
  await sleep(3000);

  // Evaluate final state
  const isApplied = await activePage.evaluate(() => 
    /application submitted|thank you for applying|successfully applied|application received/i.test(document.body.innerText)
  ).catch(() => false);

  if (activePage !== page) {
    await activePage.close().catch(() => {});
  }

  if (isApplied) {
    return { status: 'applied' };
  }

  return { status: 'external_visited', reason: `Captured form state (${pageState.inputCount} fields)` };
}

(async () => {
  const allJobs = loadExternalJobs();
  // Prioritize newest captured jobs first
  allJobs.sort((a, b) => new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0));
  const jobs = allJobs.filter(j => isTargetJob(j.title));
  console.log(`Loaded ${allJobs.length} external company job postings (${jobs.length} valid Java Full Stack/Backend roles).`);

  if (!jobs.length) {
    console.log('No valid Java Full Stack/Backend external jobs found to process.');
    process.exit(0);
  }

  const userDataDir = path.join(os.tmpdir(), 'naukri-chrome-profile');
  const isHeadless = process.env.HEADLESS === 'true';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: isHeadless,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = context.pages()[0] || await context.newPage();

  const maxToProcess = parseInt(process.env.TARGET || '50', 10);
  let processed = 0;

  for (let i = 0; i < jobs.length && processed < maxToProcess; i++) {
    const job = jobs[i];
    const key = job.applyUrl || job.externalUrl;
    
    // Skip if already applied or logged in tracker
    if (tracker.has(key) && tracker.whereIs(key) === 'applied') {
      console.log(`Skipping already applied job: ${job.title} @ ${job.company}`);
      continue;
    }

    console.log(`\n[${processed + 1}/${maxToProcess}] Processing: ${job.title} @ ${job.company}`);
    try {
      const res = await attemptExternalApply(page, job);
      const base = {
        title: job.title,
        company: job.company,
        location: job.location,
        url: key,
        externalUrl: job.externalUrl || job.applyUrl,
        source: 'naukri_external',
      };

      if (res.status === 'applied') {
        tracker.logApplied({ ...base, notes: 'External site auto-applied' });
        console.log('  -> ✅ Applied successfully!');
      } else if (res.status === 'already_applied') {
        tracker.logSkipped({ ...base, reason: 'already_applied' });
        console.log('  -> ℹ️ Already applied');
      } else if (res.status === 'failed') {
        tracker.logFailed({ ...base, reason: res.reason || 'Failed to complete application' });
        console.log(`  -> ❌ Failed: ${res.reason}`);
      } else {
        tracker.logExternal({ ...base, notes: res.reason || 'External site visited' });
        console.log(`  -> 🌐 External: ${res.reason}`);
      }
    } catch (err) {
      console.log(`  -> ❌ Error: ${err.message}`);
      tracker.logFailed({
        title: job.title,
        company: job.company,
        location: job.location,
        url: key,
        source: 'naukri_external',
        reason: err.message,
      });
    }
    processed++;
    await sleep(2000);
  }

  tracker.save();
  await context.close();
  console.log(`\nCompleted processing ${processed} external company job applications.`);
})();
