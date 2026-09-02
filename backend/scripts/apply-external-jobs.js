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
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const tracker = require('./track-jobs');
const { fetchLatestOtp } = require('./gmail-otp-helper');

const RESUME_PATH = path.join(__dirname, '../../frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf');
const EXTERNAL_FILE = path.join(__dirname, '../data', 'naukri-external-jobs.json');

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

  // Check if page loaded
  const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  if (!bodyText || bodyText.length < 50) {
    return { status: 'failed', reason: 'Page failed to load or access restricted' };
  }

  // Look for application inputs / upload fields
  const pageState = await page.evaluate(() => {
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
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(RESUME_PATH);
        console.log('  Uploaded resume PDF');
        await sleep(1000);
      }
    } catch (e) {
      console.log('  Resume upload skipped:', e.message);
    }
  }

  // Fill standard input fields (Name, Email, Phone)
  await page.evaluate((prof) => {
    const setVal = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    setVal('input[name*="name" i], input[id*="name" i]', prof.fullName);
    setVal('input[name*="email" i], input[id*="email" i], input[type="email"]', prof.email);
    setVal('input[name*="phone" i], input[id*="phone" i], input[type="tel"]', prof.phone);
    setVal('input[name*="location" i], input[id*="location" i]', prof.location);
  }, PROFILE).catch(() => {});

  // Check for OTP prompt
  const needsOtp = await page.evaluate(() => 
    /enter otp|verification code|enter code|sent to your email/i.test(document.body.innerText)
  );

  if (needsOtp) {
    console.log('  OTP verification prompt detected! Querying Gmail API...');
    await sleep(5000); // Wait 5s for email arrival
    const otpCode = await fetchLatestOtp(180);
    if (otpCode) {
      console.log(`  Extracted OTP from Gmail: ${otpCode}`);
      await page.evaluate((code) => {
        const otpInput = document.querySelector('input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[id*="code" i], input[type="number"]');
        if (otpInput) {
          otpInput.value = code;
          otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, otpCode);
      await sleep(1000);
    } else {
      console.log('  No OTP received in Gmail yet');
    }
  }

  // Evaluate final state
  const isApplied = await page.evaluate(() => 
    /application submitted|thank you for applying|successfully applied|application received/i.test(document.body.innerText)
  );

  if (isApplied) {
    return { status: 'applied' };
  }

  return { status: 'external_visited', reason: `Captured form state (${pageState.inputCount} fields)` };
}

(async () => {
  const jobs = loadExternalJobs();
  console.log(`Loaded ${jobs.length} external company job postings.`);

  if (!jobs.length) {
    console.log('No external jobs found to process.');
    process.exit(0);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const maxToProcess = parseInt(process.env.TARGET || '20', 10);
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
  await browser.close();
  console.log(`\nCompleted processing ${processed} external company job applications.`);
})();
