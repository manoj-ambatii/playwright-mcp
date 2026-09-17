/**
 * naukri-auto-apply.js
 * Headless Naukri auto-apply with dedup tracking.
 *  - Quick-apply jobs: applied via chatbot answers when possible.
 *  - "Apply on company site" jobs: external URL captured, saved to
 *    naukri-external-jobs.json (mirrors linkedin-jobs.json shape) and Excel
 *    "External" sheet so they can be applied to manually later.
 *  - Re-runs skip URLs already in job-tracker.json.
 *
 * Usage: node naukri-auto-apply.js          # default 50
 *        TARGET=30 node naukri-auto-apply.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { chromium } = require('playwright');
const tracker = require('./track-jobs');

const os = require('os');

const EMAIL = process.env.NAUKRI_EMAIL;
const PASSWORD = process.env.NAUKRI_PASSWORD;
const TARGET = parseInt(process.env.TARGET || '50', 10);
const SOURCE = 'naukri';
// Default to 7 days for job age; can be overridden via JOB_AGE env var
const JOB_AGE = process.env.JOB_AGE || '7';

// Multiple searches tailored for Full Stack, Frontend, Backend, MERN, and Java Full Stack Developer
const SEARCH_URLS_LIST = [
  // Full Stack Developer (General)
  `https://www.naukri.com/full-stack-developer-jobs-in-hyderabad?k=full+stack+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/full-stack-developer-jobs-in-bengaluru?k=full+stack+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/full-stack-developer-jobs?k=full+stack+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/fullstack-developer-jobs-in-hyderabad?k=fullstack+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/fullstack-developer-jobs-in-bengaluru?k=fullstack+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/fullstack-developer-jobs?k=fullstack+developer&experience=2&jobAge=${JOB_AGE}`,

  // MERN Stack Developer
  `https://www.naukri.com/mern-stack-developer-jobs-in-hyderabad?k=mern+stack+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/mern-stack-developer-jobs-in-bengaluru?k=mern+stack+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/mern-stack-developer-jobs?k=mern+stack+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/mern-developer-jobs-in-hyderabad?k=mern+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/mern-developer-jobs-in-bengaluru?k=mern+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/mern-developer-jobs?k=mern+developer&experience=2&jobAge=${JOB_AGE}`,

  // Frontend Developer & React
  `https://www.naukri.com/frontend-developer-jobs-in-hyderabad?k=frontend+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/frontend-developer-jobs-in-bengaluru?k=frontend+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/frontend-developer-jobs?k=frontend+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/react-js-developer-jobs-in-hyderabad?k=react.js+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/react-developer-jobs-in-bengaluru?k=react+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/react-developer-jobs?k=react+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/ui-developer-jobs-in-hyderabad?k=ui+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/ui-developer-jobs-in-bengaluru?k=ui+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,

  // Backend Developer (General & Node.js)
  `https://www.naukri.com/backend-developer-jobs-in-hyderabad?k=backend+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/backend-developer-jobs-in-bengaluru?k=backend+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/backend-developer-jobs?k=backend+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/node-js-developer-jobs-in-hyderabad?k=node.js+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/node-js-developer-jobs-in-bengaluru?k=node.js+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/nodejs-developer-jobs?k=node.js+developer&experience=2&jobAge=${JOB_AGE}`,

  // Java Backend Developer
  `https://www.naukri.com/java-backend-developer-jobs-in-hyderabad?k=java+backend+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-backend-developer-jobs-in-bengaluru?k=java+backend+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-backend-developer-jobs?k=java+backend+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/backend-developer-java-jobs-in-hyderabad?k=backend+developer+java&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/backend-developer-java-jobs-in-bengaluru?k=backend+developer+java&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,

  // Java Full Stack Developer
  `https://www.naukri.com/java-full-stack-developer-jobs-in-hyderabad?k=java+full+stack+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-full-stack-developer-jobs-in-bengaluru?k=java+full+stack+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-full-stack-developer-jobs?k=java+full+stack+developer&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-fullstack-jobs-in-hyderabad?k=java+fullstack&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-fullstack-jobs-in-bengaluru?k=java+fullstack&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-spring-boot-react-jobs?k=java+spring+boot+react&experience=2&jobAge=${JOB_AGE}`,

  // Spring Boot & Java Developer
  `https://www.naukri.com/spring-boot-developer-jobs-in-hyderabad?k=spring+boot+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/spring-boot-developer-jobs-in-bengaluru?k=spring+boot+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-developer-jobs-in-hyderabad?k=java+developer&l=hyderabad&experience=2&jobAge=${JOB_AGE}`,
  `https://www.naukri.com/java-developer-jobs-in-bengaluru?k=java+developer&l=bengaluru&experience=2&jobAge=${JOB_AGE}`,
];
// Kept for backward compat inside collectJobs
const SEARCH_URL = SEARCH_URLS_LIST[0];
const EXTERNAL_FILE = path.join(__dirname, '../data', 'naukri-external-jobs.json');

const BLACKLIST_TITLE_REGEX = /(?:\b(caller|telecaller|tele-caller|telesales|telemarketing|call\s*center|voice\s*process|non\s*voice|customer\s*(?:support|care|service)|chat\s*support|bpo|kpo|data\s*entry|back\s*office|computer\s*operator|typing|clerk|office\s*assistant|receptionist|front\s*desk|excel\s*operator|sales|business\s*development|bde|field\s*(?:sales|executive)|retail|accountant|tally|recruiter|hr\s*executive|talent\s*acquisition|dot\s*net|dotnet|php|ruby|golang|go\s*developer|python|ios|swift|android|flutter|qa\b|tester|testing|automation\s*test|devops|salesforce|sap|mainframe|etl)\b|(?:\.net\b|c#|c\+\+))/i;

const WHITELIST_TITLE_REGEX = /\b(java|spring|spring\s*boot|full\s*stack|fullstack|backend|front\s*end|frontend|mern|mean|react|node(?:\.js)?|ui\s*developer|web\s*developer|software\s*engineer|software\s*developer|sde)\b/i;

function isTargetJob(title) {
  if (!title) return false;
  if (BLACKLIST_TITLE_REGEX.test(title)) return false;
  return WHITELIST_TITLE_REGEX.test(title);
}

const PROFILE = {
  name: 'Manoj Ambati', email: 'ambatimanoj2469@gmail.com', phone: '9347946872',
  location: 'Hyderabad', currentCtc: '4.2', expectedCtc: '10', noticePeriod: '0',
  totalExp: '2', javaExp: '2', springExp: '2', springBootExp: '2',
  reactExp: '2', nodeExp: '2', jsExp: '2', tsExp: '2',
  mysqlExp: '2', awsExp: '2', dockerExp: '2', defaultYears: '2',
};

function answerForQuestion(q) {
  const t = q.toLowerCase();
  if (/serving.*notice/.test(t)) return 'No';
  if (/offer.*in\s*hand/.test(t)) return 'No';
  if (/years?.*(experience|exp).*(java)/.test(t)) return PROFILE.javaExp;
  if (/years?.*(experience|exp).*(spring|spring boot)/.test(t)) return PROFILE.springBootExp;
  if (/years?.*(experience|exp).*(microservices|micro\s*services)/.test(t)) return PROFILE.springBootExp;
  if (/years?.*(experience|exp).*(hibernate|jpa)/.test(t)) return PROFILE.javaExp;
  if (/years?.*(experience|exp).*(backend|back-end|back\s*end)/.test(t)) return PROFILE.javaExp;
  if (/years?.*(experience|exp).*(full\s*stack|fullstack)/.test(t)) return PROFILE.totalExp;
  if (/years?.*(experience|exp).*(mern|mean|mongo|mongodb)/.test(t)) return PROFILE.totalExp;
  if (/years?.*(experience|exp).*(frontend|front-end|front\s*end|ui\b)/.test(t)) return PROFILE.reactExp;
  if (/years?.*(experience|exp).*(react native|reactnative)/.test(t)) return PROFILE.defaultYears;
  if (/years?.*(experience|exp).*react/.test(t)) return PROFILE.reactExp;
  if (/years?.*(experience|exp).*(node|nodejs|node\.js|express)/.test(t)) return PROFILE.nodeExp;
  if (/years?.*(experience|exp).*(typescript|ts)/.test(t)) return PROFILE.tsExp;
  if (/years?.*(experience|exp).*(javascript|js)/.test(t)) return PROFILE.jsExp;
  if (/years?.*(experience|exp).*aws/.test(t)) return PROFILE.awsExp;
  if (/years?.*(experience|exp).*docker/.test(t)) return PROFILE.dockerExp;
  if (/years?.*(experience|exp).*(mysql|sql)/.test(t)) return PROFILE.mysqlExp;
  if (/years?.*(experience|exp).*(rest|api)/.test(t)) return PROFILE.javaExp;
  if (/years?.*(experience|exp)/.test(t)) return PROFILE.totalExp;
  if (/(current|present).*(ctc|salary|package)/.test(t)) return PROFILE.currentCtc;
  if (/(expected|expecting).*(ctc|salary|package)/.test(t)) return PROFILE.expectedCtc;
  if (/notice/.test(t)) return PROFILE.noticePeriod;
  if (/location|city|based/.test(t)) return PROFILE.location;
  if (/email/.test(t)) return PROFILE.email;
  if (/phone|mobile|contact/.test(t)) return PROFILE.phone;
  if (/name/.test(t)) return PROFILE.name;
  if (/qualification|degree|education|highest/.test(t)) return 'B.E.';
  if (/relocate|relocation|hybrid|office|work from/.test(t)) return 'Yes';
  if (/immediate/.test(t)) return 'Yes';
  if (/^(are you|do you|can you|will you|have you|is it|would you)/.test(t)) return 'Yes';
  if (/how many|number of|years|months/.test(t)) return PROFILE.defaultYears;
  return 'Yes';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  console.log('Checking login state...');
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  if (!page.url().includes('login')) { console.log('Already logged in to Naukri.'); return; }
  console.log('Navigating to login...');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const emailInput = page.getByPlaceholder('Enter your active Email ID / Username')
    .or(page.getByPlaceholder('Enter Email ID / Username'))
    .or(page.locator('#usernameField'))
    .or(page.locator('input[type="text"]')).first();
  const passwordInput = page.getByPlaceholder('Enter your password')
    .or(page.getByPlaceholder('Enter Password'))
    .or(page.locator('#passwordField'))
    .or(page.locator('input[type="password"]')).first();
  const loginBtn = page.getByRole('button', { name: 'Login', exact: true })
    .or(page.locator('button[type="submit"].btn-primary'))
    .or(page.locator('button[type="submit"]')).first();

  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await loginBtn.click();
  await sleep(5000);
  if (page.url().includes('login')) {
    console.log('⚠️ Please check the browser window for CAPTCHA/OTP verification if prompted...');
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      if (!page.url().includes('login')) break;
    }
  }
  if (page.url().includes('login')) throw new Error('Login failed. Please verify credentials or complete verification in the browser.');
  console.log('Logged in successfully.');
}

async function collectJobs(page, target) {
  const jobs = new Map(); // url -> job object
  const maxCollection = Math.max(target * 15, 800);
  for (const baseUrl of SEARCH_URLS_LIST) {
    if (jobs.size >= maxCollection) break;
    const queryTerm = new URL(baseUrl).searchParams.get('k') || 'query';
    for (let p = 1; p <= 2 && jobs.size < maxCollection; p++) {
      const url = baseUrl + `&pageNo=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(2200);
      const pageJobs = await page.evaluate(() => {
        const titleAnchors = Array.from(document.querySelectorAll('a.title, a.job-title, [class*="title"] a'));
        return titleAnchors.map((a) => {
          const card = a.closest('div.srp-jobtuple-wrapper, div.jobTuple, article, [class*="jobTuple"]') || a.parentElement?.parentElement;
          const text = (sel) => card?.querySelector(sel)?.innerText?.trim() || '';
          return {
            title: a.innerText.trim(),
            url: a.href,
            company: text('a.subTitle, a.comp-name, .companyInfo a, .comp-dtls a') || text('span.subTitle'),
            location: text('span.locWdth, .loc, .locations span') || text('.styles_locations__yRPSz'),
            experience: text('span.expwdth, .exp, .styles_jhc__exp__k_giM') || text('.expwd'),
            salary: text('span.sal, .sal, .salary') || text('.styles_jhc__salary__jdfEC'),
            postedAt: text('.job-post-day, span.job-post-day') || text('.styles_jhc__jobpost__pjp7g'),
          };
        }).filter(j => j.title && j.url && j.url.includes('job-listings'));
      });
      if (!pageJobs.length) break;
      let added = 0;
      for (const j of pageJobs) {
        if (!isTargetJob(j.title)) {
          continue;
        }
        if (!jobs.has(j.url)) { jobs.set(j.url, j); added++; }
      }
      console.log(`  [${queryTerm}] page ${p}: +${added} valid Full Stack / Frontend / Backend / MERN jobs (total ${jobs.size})`);
      if (added === 0 && p > 1) break;
    }
  }
  return [...jobs.values()];
}

async function handleChatbot(page) {
  const maxQuestions = 12;
  for (let i = 0; i < maxQuestions; i++) {
    await sleep(1500);
    const state = await page.evaluate(() => {
      const chatbot = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
      if (!chatbot) return { open: false };
      const items = Array.from(chatbot.querySelectorAll('li, [class*="botMsg"], [class*="bot-msg"], [class*="msg-text"]'));
      const lastBot = items[items.length - 1]?.innerText?.trim() || '';
      const successMsg = chatbot.innerText.match(/successfully applied|application sent|thank you|thanks for applying/i);
      return { open: true, lastBot, successMsg: !!successMsg };
    });
    if (!state.open) return 'success';
    if (state.successMsg) return 'success';
    if (!state.lastBot) { await sleep(1500); continue; }
    const ans = answerForQuestion(state.lastBot);
    if (!ans) return 'unknown';

    const clicked = await page.evaluate((answer) => {
      const cb = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
      if (!cb) return false;
      const opts = Array.from(cb.querySelectorAll('[class*="ssrc__radio"], [class*="chip"], [class*="option"], label, button'));
      // 1. Exact match
      let m = opts.find((o) => o.innerText?.trim().toLowerCase() === answer.toLowerCase());
      if (m) { m.click(); return true; }

      // 2. Immediate / Notice period match
      if (answer === '0' || answer.toLowerCase() === 'immediate') {
        m = opts.find((o) => {
          const txt = o.innerText?.trim().toLowerCase() || '';
          return txt.includes('immediate') || txt.includes('15 days') || txt.includes('0 days') || txt.includes('0-15') || txt.includes('serving notice');
        });
        if (m) { m.click(); return true; }
      }

      // 3. Yes / No fuzzy match
      if (answer.toLowerCase() === 'yes') {
        m = opts.find((o) => {
          const txt = o.innerText?.trim().toLowerCase() || '';
          return txt === 'yes' || txt.startsWith('yes');
        });
        if (m) { m.click(); return true; }
      }
      if (answer.toLowerCase() === 'no') {
        m = opts.find((o) => {
          const txt = o.innerText?.trim().toLowerCase() || '';
          return txt === 'no' || txt.startsWith('no');
        });
        if (m) { m.click(); return true; }
      }

      // 4. Numeric experience match (e.g. "2")
      if (/^\d+$/.test(answer)) {
        const num = parseInt(answer, 10);
        m = opts.find((o) => {
          const txt = o.innerText?.trim().toLowerCase() || '';
          return txt.includes(`${num} year`) || txt.includes(`${num}+ year`) || txt.includes('1 - 3') || txt.includes('1-3') || txt.includes('0 - 2') || txt.includes('0-2');
        });
        if (m) { m.click(); return true; }
      }

      // 5. Partial contains match
      m = opts.find((o) => o.innerText?.trim().toLowerCase().includes(answer.toLowerCase()));
      if (m) { m.click(); return true; }
      return false;
    }, ans);

    if (clicked) {
      await sleep(600);
      await page.evaluate(() => {
        const cb = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
        cb?.querySelector('[class*="sendMsg"], button[type="submit"]')?.click();
      });
      continue;
    }

    const typed = await page.evaluate((answer) => {
      const cb = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
      if (!cb) return false;
      const ed = cb.querySelector('[contenteditable="true"]');
      if (ed) {
        ed.focus();
        ed.innerText = answer;
        ed.dispatchEvent(new InputEvent('input', { bubbles: true, data: answer }));
        return true;
      }
      const ta = cb.querySelector('textarea, input[type="text"]');
      if (ta) {
        ta.focus(); ta.value = answer;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, ans);

    if (!typed) return 'unknown';
    await sleep(400);
    await page.keyboard.press('Enter').catch(() => {});
    await sleep(300);
    await page.evaluate(() => {
      const cb = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
      cb?.querySelector('[class*="sendMsg"], button[type="submit"]')?.click();
    });
  }
  return 'unknown';
}

async function processJob(context, page, job) {
  await page.goto(job.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(2200);

  const info = await page.evaluate(() => {
    const apply = document.getElementById('apply-button') ||
      Array.from(document.querySelectorAll('button, a')).find(el => {
        const t = (el.innerText || el.getAttribute('title') || '').trim().toLowerCase();
        return t === 'apply' || t === 'apply now' || el.classList.contains('apply-button');
      });
    const company = document.getElementById('company-site-button') ||
      Array.from(document.querySelectorAll('button, a, div')).find(el =>
        /apply on company site|apply on website|company site|external site/i.test(el.innerText || el.getAttribute('title') || '')
      );
    const alreadyApplied = !!document.querySelector('[class*="already-applied"]') ||
      Array.from(document.querySelectorAll('button, a, div, span')).some(el =>
        /^applied$/i.test(el.innerText?.trim()) || /already applied/i.test(el.innerText || '')
      );
    return { hasApply: !!apply, hasCompany: !!company, alreadyApplied };
  });

  if (info.alreadyApplied) return { status: 'already_applied' };

  if (!info.hasApply && info.hasCompany) {
    // External "Apply on company site" / "Apply from website". Click and capture the popup URL.
    let externalUrl = '';
    const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await page.evaluate(() => {
      const btn = document.getElementById('company-site-button') ||
        Array.from(document.querySelectorAll('button, a, div')).find(el =>
          /apply on company site|apply on website|company site|external site/i.test(el.innerText || el.getAttribute('title') || '')
        );
      btn?.click();
    });
    const popup = await popupPromise;
    if (popup) {
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
        externalUrl = popup.url();
        await popup.close();
      } catch { /* ignore */ }
    }
    if (!externalUrl || externalUrl === 'about:blank') externalUrl = job.url; // fall back to Naukri URL
    return { status: 'company_site_skip', externalUrl };
  }

  if (!info.hasApply) return { status: 'no_apply_button' };

  const clickedApply = await page.evaluate(() => {
    const btn = document.getElementById('apply-button') ||
      Array.from(document.querySelectorAll('button, a')).find(el => {
        const t = (el.innerText || el.getAttribute('title') || '').trim().toLowerCase();
        return t === 'apply' || t === 'apply now' || el.classList.contains('apply-button');
      });
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clickedApply) return { status: 'no_apply_button' };
  await sleep(2500);

  // Dismiss or confirm optional interstitials (e.g., "Apply without updating", "Proceed to apply")
  await page.evaluate(() => {
    const proceedBtn = Array.from(document.querySelectorAll('button, a, div')).find(el =>
      /apply without updating|skip and apply|proceed to apply|save & apply/i.test(el.innerText || '')
    );
    if (proceedBtn && !proceedBtn.id?.includes('company-site')) proceedBtn.click();
  });

  const post = await page.evaluate(() => {
    const text = document.body.innerText;
    const quotaHit = /daily quota of jobs exceeded|error while processing your request/i.test(text);
    const successAnchor = /applied successfully|successfully applied|application has been received|application sent|application submitted|applied to/i.test(text) ||
      Array.from(document.querySelectorAll('button, div, span, a')).some(el => /^applied$/i.test(el.innerText?.trim()));
    const chatbotOpen = !!document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
    return { successAnchor, chatbotOpen, quotaHit };
  });

  if (post.quotaHit) return { status: 'daily_quota_exceeded' };
  if (post.successAnchor && !post.chatbotOpen) return { status: 'applied' };
  if (post.chatbotOpen) {
    const r = await handleChatbot(page);
    return { status: r === 'success' ? 'applied' : `chatbot_${r}` };
  }
  await sleep(1500);
  const final = await page.evaluate(() => {
    const text = document.body.innerText;
    const quotaHit = /daily quota of jobs exceeded|error while processing your request/i.test(text);
    const applied = /applied successfully|successfully applied|application has been received|application sent|application submitted|applied to/i.test(text) ||
      Array.from(document.querySelectorAll('button, div, span, a')).some(el => /^applied$/i.test(el.innerText?.trim()));
    return { applied, quotaHit };
  });
  if (final.quotaHit) return { status: 'daily_quota_exceeded' };
  return { status: final.applied ? 'applied' : 'unknown' };
}

function loadExternalStore() {
  if (fs.existsSync(EXTERNAL_FILE)) {
    try { return JSON.parse(fs.readFileSync(EXTERNAL_FILE, 'utf8')); } catch { return []; }
  }
  return [];
}
function saveExternalStore(arr) {
  fs.writeFileSync(EXTERNAL_FILE, JSON.stringify(arr, null, 2));
}

(async () => {
  if (!EMAIL || !PASSWORD) { console.error('Missing NAUKRI_EMAIL/NAUKRI_PASSWORD in .env'); process.exit(1); }
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

  const externalStore = loadExternalStore();
  const externalUrls = new Set(externalStore.map((j) => j.applyUrl));

  const summary = { applied: 0, external: 0, dedup_skip: 0, irrelevant_title_skip: 0, chatbot_unknown: 0, unknown: 0, no_apply_button: 0, already_applied: 0, error: 0 };

  try {
    await login(page);
    console.log(`Collecting Full Stack, Frontend, Backend, MERN & Java Full Stack jobs...`);
    const allJobs = await collectJobs(page, TARGET);
    console.log(`Collected ${allJobs.length} jobs. Beginning application loop...`);

    let appliedCount = 0;
    for (let i = 0; i < allJobs.length && appliedCount < TARGET; i++) {
      const job = allJobs[i];
      const tag = (job.title || '').slice(0, 40);
      const postTime = job.postedAt ? ` [${job.postedAt}]` : '';
      console.log(`\n[${i + 1}/${allJobs.length}] ${tag} @ ${job.company}${postTime}`);

      if (!isTargetJob(job.title)) {
        console.log(`  -> skipped (not target Full Stack / Frontend / Backend / MERN title: "${job.title}")`);
        summary.irrelevant_title_skip++;
        continue;
      }

      if (tracker.has(job.url)) {
        const where = tracker.whereIs(job.url);
        console.log(`  -> dedup_skip (already in ${where})`);
        summary.dedup_skip++;
        continue;
      }

      try {
        const r = await processJob(context, page, job);
        console.log(`  -> ${r.status}`);
        const base = { title: job.title, company: job.company, location: job.location, url: job.url, source: SOURCE };

        if (r.status === 'applied') {
          tracker.logApplied({ ...base, notes: 'Naukri quick-apply (auto)' });
          summary.applied++; appliedCount++;
        } else if (r.status === 'company_site_skip') {
          tracker.logExternal({ ...base, externalUrl: r.externalUrl, notes: 'External — apply manually' });
          if (!externalUrls.has(job.url)) {
            externalStore.push({
              title: job.title,
              company: job.company,
              location: job.location,
              experience: job.experience,
              salary: job.salary,
              postedAt: job.postedAt,
              applyUrl: job.url,
              externalUrl: r.externalUrl,
              source: SOURCE,
              capturedAt: new Date().toISOString(),
            });
            externalUrls.add(job.url);
          }
          summary.external++;
        } else if (r.status === 'already_applied') {
          tracker.logSkipped({ ...base, reason: 'already_applied' });
          summary.already_applied++;
        } else if (r.status === 'no_apply_button') {
          tracker.logSkipped({ ...base, reason: 'no_apply_button' });
          summary.no_apply_button++;
        } else if (r.status === 'daily_quota_exceeded') {
          console.log('  ⚠️ Naukri daily apply quota has been reached for today! Keeping job retryable.');
          summary.daily_quota_exceeded = (summary.daily_quota_exceeded || 0) + 1;
        } else if (r.status.startsWith('chatbot_')) {
          tracker.logSkipped({ ...base, reason: r.status });
          summary.chatbot_unknown++;
        } else {
          tracker.logSkipped({ ...base, reason: 'unknown_state' });
          summary.unknown++;
        }
      } catch (e) {
        console.log('  error: ' + e.message);
        tracker.logFailed({ title: job.title, company: job.company, location: job.location, url: job.url, source: SOURCE, reason: e.message });
        summary.error++;
      }
      await sleep(1500);
    }
  } catch (e) {
    console.error('Fatal:', e.message);
  } finally {
    saveExternalStore(externalStore);
    tracker.save();
    console.log(`\nExternal jobs file → ${EXTERNAL_FILE} (${externalStore.length} entries)`);
    console.log('Summary:', summary);
    console.log(tracker.summary());
    await context.close().catch(() => {});
  }
})();
