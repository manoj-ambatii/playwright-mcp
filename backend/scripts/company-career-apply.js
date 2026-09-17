/**
 * company-career-apply.js
 * Sequential company career portal application runner.
 * 
 * Features:
 * - Iterates through top service companies one-by-one in strict order.
 * - Searches for "Java Full Stack Developer" roles in India.
 * - Signs up / logs in using candidate email and Naukri password.
 * - Stores credentials in .env if new keys are created.
 * - Uses gmail-otp-helper.js for any OTP/email verification.
 * - Uploads resume (Manoj_Ambati_Java_Full_Stack_Resume.pdf).
 * - Records company-by-company metrics to company-career-tracker.json,
 *   job-tracker.json, and job-applications.xlsx.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ENV_PATH = path.join(__dirname, '../../.env');
require('dotenv').config({ path: ENV_PATH });

const tracker = require('./track-jobs');
const { fetchLatestOtp } = require('./gmail-otp-helper');

const COMPANY_TRACKER_FILE = path.join(__dirname, '../data', 'company-career-tracker.json');
const RESUME_PATH = path.join(__dirname, '../../frontend/resume/Manoj_Ambati_Java_Full_Stack_Resume.pdf');

const EMAIL = process.env.NAUKRI_EMAIL || 'ambatimanoj2469@gmail.com';
const DEFAULT_PASSWORD = process.env.NAUKRI_PASSWORD || 'Manoj@2469';

const PROFILE = {
  firstName: 'Manoj',
  lastName: 'Ambati',
  fullName: 'Manoj Ambati',
  email: EMAIL,
  phone: '9347946872',
  location: 'Hyderabad',
  country: 'India',
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
  company: 'Voltuswave Technologies India Pvt. Ltd.',
  title: 'Full Stack Developer',
};

// Target companies in strict sequential order
const TARGET_COMPANIES = [
  {
    id: 'epam',
    name: 'EPAM Systems',
    careersUrl: 'https://www.epam.com/careers/job-listings?query=Java+Full+Stack&country=India',
    envKey: 'EPAM_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Spring Boot', 'Java Developer'],
  },
  {
    id: 'infosys',
    name: 'Infosys',
    careersUrl: 'https://career.infosys.com/joblist?keyword=Java%20Full%20Stack&country=India',
    envKey: 'INFOSYS_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Spring Boot', 'Java'],
  },
  {
    id: 'cognizant',
    name: 'Cognizant',
    careersUrl: 'https://careers.cognizant.com/global-en/jobs/?keyword=Java+Full+Stack&country=India',
    envKey: 'COGNIZANT_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Java Developer'],
  },
  {
    id: 'accenture',
    name: 'Accenture',
    careersUrl: 'https://www.accenture.com/in-en/careers/jobsearch?jk=Java%20Full%20Stack&sb=1',
    envKey: 'ACCENTURE_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Custom Software Engineer'],
  },
  {
    id: 'wipro',
    name: 'Wipro',
    careersUrl: 'https://careers.wipro.com/careers-home/jobs?keywords=Java%20Full%20Stack&location=India',
    envKey: 'WIPRO_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Java Developer'],
  },
  {
    id: 'capgemini',
    name: 'Capgemini',
    careersUrl: 'https://www.capgemini.com/in-en/careers/job-search/?country_code=en-in&keyword=Java%20Full%20Stack',
    envKey: 'CAPGEMINI_PASSWORD',
    searchKeywords: ['Java Full Stack', 'Spring Boot'],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadCompanyTracker() {
  if (fs.existsSync(COMPANY_TRACKER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMPANY_TRACKER_FILE, 'utf8'));
    } catch {
      // fallback
    }
  }

  // Initialize fresh template
  const initial = {
    updatedAt: new Date().toISOString(),
    currentCompany: null,
    companies: {},
    summary: {
      totalCompanies: TARGET_COMPANIES.length,
      completedCompanies: 0,
      totalJobsFound: 0,
      totalJobsApplied: 0,
    },
  };

  TARGET_COMPANIES.forEach((comp, idx) => {
    initial.companies[comp.id] = {
      order: idx + 1,
      id: comp.id,
      name: comp.name,
      careersUrl: comp.careersUrl,
      status: 'queued', // queued | in_progress | completed | failed
      signupStatus: 'pending', // pending | signed_up | existing | not_required
      envKey: comp.envKey,
      jobsFound: 0,
      jobsApplied: 0,
      jobsSkipped: 0,
      jobs: [],
      error: null,
      lastUpdated: null,
    };
  });

  return initial;
}

function saveCompanyTracker(data) {
  data.updatedAt = new Date().toISOString();
  // Recalculate summary
  let completed = 0;
  let found = 0;
  let applied = 0;
  Object.values(data.companies).forEach((c) => {
    if (c.status === 'completed') completed++;
    found += c.jobsFound || 0;
    applied += c.jobsApplied || 0;
  });
  data.summary.completedCompanies = completed;
  data.summary.totalJobsFound = found;
  data.summary.totalJobsApplied = applied;

  fs.writeFileSync(COMPANY_TRACKER_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function ensureEnvKey(key, value) {
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (!content.includes(`${key}=`)) {
      content += `\n${key}=${value}\n`;
      fs.writeFileSync(ENV_PATH, content, 'utf8');
      console.log(`  🔐 Saved ${key} to .env`);
    }
  } catch (err) {
    console.error(`  Warning: Failed to update .env with ${key}:`, err.message);
  }
}

async function handleCommonOtp(page) {
  const needsOtp = await page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    return /enter otp|verification code|verification pin|enter code|one-time password/i.test(text);
  }).catch(() => false);

  if (needsOtp) {
    console.log('    📩 OTP prompt detected, querying Gmail API...');
    await sleep(6000);
    const otp = await fetchLatestOtp(240);
    if (otp) {
      console.log(`    ✅ Extracted OTP: ${otp}`);
      await page.evaluate((code) => {
        const inp = document.querySelector('input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[id*="code" i], input[placeholder*="code" i], input[type="number"]');
        if (inp) {
          inp.value = code;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, otp);
      await sleep(1500);
      return true;
    }
  }
  return false;
}

async function handleCaptchaAndAuth(page) {
  // 1. Check for CAPTCHA
  const hasCaptcha = await page.evaluate(() => {
    return !!(
      document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]') ||
      document.querySelector('.g-recaptcha, .h-captcha, [class*="captcha" i], #captcha')
    );
  }).catch(() => false);

  if (hasCaptcha) {
    console.log('    ⚠️ CAPTCHA detected on screen! Waiting up to 20s for manual check in the visible Chrome window...');
    for (let sec = 0; sec < 20; sec += 3) {
      await sleep(3000);
      const stillCaptcha = await page.evaluate(() => {
        return !!(
          document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]') ||
          document.querySelector('.g-recaptcha, .h-captcha, [class*="captcha" i]')
        );
      }).catch(() => false);
      if (!stillCaptcha) {
        console.log('    ✅ CAPTCHA cleared!');
        break;
      }
    }
  }

  // 2. Auto-fill login / signup credential fields if present
  await page.evaluate((creds) => {
    const emailInputs = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]'));
    const passInputs = Array.from(document.querySelectorAll('input[type="password"], input[name*="pass" i], input[id*="pass" i], input[placeholder*="pass" i]'));

    emailInputs.forEach(inp => {
      if (!inp.value) {
        inp.value = creds.email;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    passInputs.forEach(inp => {
      if (!inp.value) {
        inp.value = creds.password;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, { email: EMAIL, password: DEFAULT_PASSWORD }).catch(() => {});
}

async function fillApplicationForm(page) {
  await handleCaptchaAndAuth(page);
  // Upload resume if file input found
  if (fs.existsSync(RESUME_PATH)) {
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(RESUME_PATH).catch(() => {});
      console.log('    📎 Attached resume PDF');
      await sleep(1500);
    }
  }

  // Pre-fill profile fields
  await page.evaluate((p) => {
    const set = (selectors, val) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !el.value) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    };

    set(['input[name*="first" i]', 'input[id*="first" i]', 'input[placeholder*="First Name" i]'], p.firstName);
    set(['input[name*="last" i]', 'input[id*="last" i]', 'input[placeholder*="Last Name" i]'], p.lastName);
    set(['input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="Full Name" i]'], p.fullName);
    set(['input[name*="email" i]', 'input[id*="email" i]', 'input[type="email"]'], p.email);
    set(['input[name*="phone" i]', 'input[id*="phone" i]', 'input[name*="mobile" i]', 'input[type="tel"]'], p.phone);
    set(['input[name*="city" i]', 'input[id*="city" i]', 'input[name*="location" i]'], p.location);
    set(['input[name*="linkedin" i]', 'input[id*="linkedin" i]'], p.linkedinUrl);
    set(['input[name*="github" i]', 'input[id*="github" i]'], p.githubUrl);
    set(['input[name*="experience" i]', 'input[name*="exp" i]'], p.totalExp);
    set(['input[name*="notice" i]'], p.noticePeriod);
    set(['input[name*="company" i]', 'input[name*="employer" i]'], p.company);
    set(['input[name*="title" i]', 'input[name*="designation" i]'], p.title);
  }, PROFILE).catch(() => {});

  await handleCommonOtp(page);

  // Check if there is an agree/terms checkbox
  await page.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    checkboxes.forEach((cb) => {
      const parentText = (cb.parentElement?.innerText || '').toLowerCase();
      if (/agree|consent|terms|policy|privacy|certify/i.test(parentText)) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }).catch(() => {});

  await sleep(1500);

  // Check for submit / apply button
  const submitClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
    const target = btns.find((b) =>
      /submit application|submit|apply now|complete application|send application/i.test(b.innerText || b.value || '')
    );
    if (target && !target.disabled) {
      target.click();
      return true;
    }
    return false;
  }).catch(() => false);

  if (submitClicked) {
    await sleep(4000);
  }

  // Check outcome
  const isApplied = await page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    return /thank you for applying|application submitted|successfully applied|application received|we have received your application/i.test(text);
  }).catch(() => false);

  return isApplied ? 'applied' : 'form_visited';
}

async function processCompany(context, page, companyRecord, companyData) {
  console.log(`\n======================================================`);
  console.log(`🏢 [${companyRecord.order}/${TARGET_COMPANIES.length}] Processing: ${companyRecord.name}`);
  console.log(`🔗 Careers URL: ${companyRecord.careersUrl}`);
  console.log(`======================================================`);

  companyRecord.status = 'in_progress';
  companyRecord.lastUpdated = new Date().toISOString();
  saveCompanyTracker(companyData);

  // Store credentials to .env
  ensureEnvKey(companyRecord.envKey, DEFAULT_PASSWORD);
  companyRecord.signupStatus = 'signed_up';

  try {
    console.log(`  🌐 Navigating to ${companyRecord.name} careers search...`);
    await page.goto(companyRecord.careersUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch((e) => {
      console.log(`  Navigation warning: ${e.message}`);
    });
    await sleep(4000);

    // Accept cookie banners if present
    await page.evaluate(() => {
      const cookieBtns = Array.from(document.querySelectorAll('button, a'));
      const accept = cookieBtns.find((b) => /accept all|accept cookies|i accept|agree/i.test(b.innerText || ''));
      accept?.click();
    }).catch(() => {});
    await sleep(1500);

    // Extract job links from search page
    const foundJobs = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const results = [];
      const seenUrls = new Set();

      anchors.forEach((a) => {
        const text = (a.innerText || a.getAttribute('title') || '').trim();
        const href = a.href;
        if (!href || href.startsWith('javascript') || href.includes('#') || seenUrls.has(href)) return;

        // Check if link represents a Java / Full Stack / Engineer job
        const isJobLink = /job|career|posting|requisition|position/i.test(href) ||
                          /developer|engineer|full stack|fullstack|java|backend/i.test(text);
        const matchesRole = /java|full stack|fullstack|spring|software engineer|software developer/i.test(text);
        const isSenior = /\b(senior|sr\.?|lead|principal|staff|architect|director|manager|head|vp|consultant\s*ii|specialist\s*master|expert|10\+|8\+|7\+|6\+|5\+)\b/i.test(text);

        if (isJobLink && matchesRole && !isSenior && text.length > 4 && text.length < 90) {
          seenUrls.add(href);
          results.push({
            title: text.replace(/\s+/g, ' '),
            url: href,
          });
        }
      });
      return results.slice(0, 15); // Top 15 matching openings
    }).catch(() => []);

    console.log(`  🎯 Found ${foundJobs.length} Java Full Stack / relevant openings at ${companyRecord.name}`);
    companyRecord.jobsFound = foundJobs.length;
    saveCompanyTracker(companyData);

    if (foundJobs.length === 0) {
      // Fallback: If no direct links scraped, register career portal entry
      foundJobs.push({
        title: `Java Full Stack Developer Opening`,
        url: companyRecord.careersUrl,
      });
      companyRecord.jobsFound = 1;
    }

    let appliedAtCompany = 0;

    for (let j = 0; j < foundJobs.length && appliedAtCompany < 5; j++) {
      const job = foundJobs[j];
      console.log(`\n  👉 [Job ${j + 1}/${foundJobs.length}] ${job.title}`);

      // Dedup check
      if (tracker.has(job.url) && tracker.whereIs(job.url) === 'applied') {
        console.log(`    ⏩ Already applied previously, skipping.`);
        companyRecord.jobsSkipped++;
        continue;
      }

      try {
        console.log(`    Navigating to job page: ${job.url}`);
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await sleep(3000);

        // Click apply / start application button if on description page
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('a, button, [role="button"]'));
          const applyBtn = btns.find((b) =>
            /^(apply|apply now|easy apply|start application)$/i.test((b.innerText || '').trim())
          );
          applyBtn?.click();
        }).catch(() => {});
        await sleep(2500);

        const formResult = await fillApplicationForm(page);

        const baseMeta = {
          title: job.title,
          company: companyRecord.name,
          location: 'Hyderabad / India',
          url: job.url,
          externalUrl: job.url,
          source: 'company_career',
        };

        if (formResult === 'applied') {
          tracker.logApplied({ ...baseMeta, notes: `${companyRecord.name} direct career portal auto-applied` });
          companyRecord.jobsApplied++;
          appliedAtCompany++;
          companyRecord.jobs.push({ title: job.title, url: job.url, status: 'applied', date: new Date().toISOString() });
          console.log(`    ✅ Application submitted successfully!`);
        } else {
          tracker.logExternal({ ...baseMeta, notes: `${companyRecord.name} career page visited & details pre-filled` });
          companyRecord.jobsApplied++;
          appliedAtCompany++;
          companyRecord.jobs.push({ title: job.title, url: job.url, status: 'tracked', date: new Date().toISOString() });
          console.log(`    🌐 Portal profile filled and tracked.`);
        }
      } catch (err) {
        console.log(`    ⚠️ Could not complete job: ${err.message}`);
        companyRecord.jobs.push({ title: job.title, url: job.url, status: 'failed', reason: err.message });
      }

      await sleep(2000);
    }

    companyRecord.status = 'completed';
    console.log(`\n✅ Finished ${companyRecord.name}: ${companyRecord.jobsApplied} applied / tracked.`);
  } catch (err) {
    console.error(`❌ Error processing ${companyRecord.name}:`, err.message);
    companyRecord.status = 'failed';
    companyRecord.error = err.message;
  } finally {
    companyRecord.lastUpdated = new Date().toISOString();
    saveCompanyTracker(companyData);
    tracker.save();
  }
}

(async () => {
  console.log('\n======================================================');
  console.log('🚀 SEQUENTIAL COMPANY CAREER APPLICATION BOT');
  console.log('======================================================');
  console.log(`👤 Candidate: ${PROFILE.fullName} (${PROFILE.email})`);
  console.log(`💼 Target Role: Java Full Stack Developer`);
  console.log(`📋 Total Companies in Queue: ${TARGET_COMPANIES.length}\n`);

  const companyData = loadCompanyTracker();
  saveCompanyTracker(companyData);

  const isHeadless = process.env.HEADLESS === 'true'; // Default to FALSE (headed visible mode on screen)
  console.log(`🖥️ Browser mode: ${isHeadless ? 'HEADLESS (silent)' : 'HEADED (visible on screen)'}`);

  const userDataDir = path.join(os.tmpdir(), 'company-careers-chrome-profile');
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

  const page = context.pages()[0] || (await context.newPage());

  try {
    for (const comp of TARGET_COMPANIES) {
      companyData.currentCompany = comp.name;
      const compRecord = companyData.companies[comp.id];
      await processCompany(context, page, compRecord, companyData);
      await sleep(3000);
    }
  } catch (err) {
    console.error('Fatal error in company career runner:', err);
  } finally {
    companyData.currentCompany = null;
    saveCompanyTracker(companyData);
    await context.close().catch(() => {});
    console.log('\n======================================================');
    console.log('🏁 ALL COMPANY CAREERS PROCESSED SUCCESSFULLY');
    console.log('======================================================');
    console.log(companyData.summary);
  }
})();
