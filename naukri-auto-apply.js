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
require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const tracker = require('./track-jobs');

const EMAIL = process.env.NAUKRI_EMAIL;
const PASSWORD = process.env.NAUKRI_PASSWORD;
const TARGET = parseInt(process.env.TARGET || '50', 10);
const SOURCE = 'naukri';
// Multiple searches so we get fresh jobs beyond the first 15-day window
const SEARCH_URLS_LIST = [
  'https://www.naukri.com/full-stack-developer-jobs-in-hyderabad?k=full+stack+developer&l=hyderabad&experience=2&jobAge=30',
  'https://www.naukri.com/react-developer-jobs-in-hyderabad?k=react+developer&l=hyderabad&experience=2&jobAge=30',
  'https://www.naukri.com/nodejs-developer-jobs-in-hyderabad?k=node+js+developer&l=hyderabad&experience=2&jobAge=30',
  'https://www.naukri.com/mern-stack-developer-jobs-in-hyderabad?k=mern+stack+developer&l=hyderabad&experience=2&jobAge=30',
];
// Kept for backward compat inside collectJobs
const SEARCH_URL = SEARCH_URLS_LIST[0];
const EXTERNAL_FILE = path.join(__dirname, 'naukri-external-jobs.json');

const PROFILE = {
  name: 'Manoj Ambati', email: 'ambatimanoj2469@gmail.com', phone: '9347946872',
  location: 'Hyderabad', currentCtc: '6', expectedCtc: '12', noticePeriod: '30',
  totalExp: '2', reactExp: '2', nodeExp: '2', jsExp: '2', tsExp: '2',
  reactNativeExp: '1', pythonExp: '1', awsExp: '1', dockerExp: '1',
  mysqlExp: '2', mongoExp: '1', defaultYears: '2',
};

function answerForQuestion(q) {
  const t = q.toLowerCase();
  if (/years?.*(experience|exp).*(react native|reactnative)/.test(t)) return PROFILE.reactNativeExp;
  if (/years?.*(experience|exp).*react/.test(t)) return PROFILE.reactExp;
  if (/years?.*(experience|exp).*(node|nodejs|node\.js)/.test(t)) return PROFILE.nodeExp;
  if (/years?.*(experience|exp).*(typescript|ts)/.test(t)) return PROFILE.tsExp;
  if (/years?.*(experience|exp).*(javascript|js)/.test(t)) return PROFILE.jsExp;
  if (/years?.*(experience|exp).*python/.test(t)) return PROFILE.pythonExp;
  if (/years?.*(experience|exp).*aws/.test(t)) return PROFILE.awsExp;
  if (/years?.*(experience|exp).*docker/.test(t)) return PROFILE.dockerExp;
  if (/years?.*(experience|exp).*(mysql|sql)/.test(t)) return PROFILE.mysqlExp;
  if (/years?.*(experience|exp).*(mongo)/.test(t)) return PROFILE.mongoExp;
  if (/years?.*(experience|exp)/.test(t)) return PROFILE.totalExp;
  if (/(current|present).*(ctc|salary|package)/.test(t)) return PROFILE.currentCtc;
  if (/(expected|expecting).*(ctc|salary|package)/.test(t)) return PROFILE.expectedCtc;
  if (/notice/.test(t)) return PROFILE.noticePeriod;
  if (/location|city|based/.test(t)) return PROFILE.location;
  if (/email/.test(t)) return PROFILE.email;
  if (/phone|mobile|contact/.test(t)) return PROFILE.phone;
  if (/name/.test(t)) return PROFILE.name;
  if (/^(are you|do you|can you|will you|have you|is it|would you)/.test(t)) return 'Yes';
  if (/how many|number of|years|months/.test(t)) return PROFILE.defaultYears;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  console.log('Logging in...');
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  if (!page.url().includes('login')) { console.log('Already logged in.'); return; }
  await page.getByPlaceholder('Enter Email ID / Username').fill(EMAIL);
  await page.getByPlaceholder('Enter Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await sleep(5000);
  if (page.url().includes('login')) throw new Error('Login failed');
  console.log('Logged in.');
}

async function collectJobs(page, target) {
  const jobs = new Map(); // url -> job object
  for (const baseUrl of SEARCH_URLS_LIST) {
    if (jobs.size >= target * 5) break;
    for (let p = 1; p <= 15 && jobs.size < target * 5; p++) {
      const url = baseUrl + `&pageNo=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(2200);
      const pageJobs = await page.evaluate(() => {
        const titleAnchors = Array.from(document.querySelectorAll('a.title'));
        return titleAnchors.map((a) => {
          const card = a.closest('div.srp-jobtuple-wrapper, div.jobTuple, article') || a.parentElement?.parentElement;
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
        });
      });
      if (!pageJobs.length) break;
      let added = 0;
      for (const j of pageJobs) {
        if (!jobs.has(j.url)) { jobs.set(j.url, j); added++; }
      }
      console.log(`  [${new URL(baseUrl).searchParams.get('k')}] page ${p}: +${added} (total ${jobs.size})`);
      if (added === 0 && p > 1) break;
    }
  }
  return [...jobs.values()];
}

async function handleChatbot(page) {
  const maxQuestions = 12;
  for (let i = 0; i < maxQuestions; i++) {
    await sleep(1200);
    const state = await page.evaluate(() => {
      const chatbot = document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
      if (!chatbot) return { open: false };
      const items = Array.from(chatbot.querySelectorAll('li, [class*="botMsg"], [class*="bot-msg"]'));
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
      const opts = Array.from(cb.querySelectorAll('[class*="ssrc__radio"], [class*="chip"], [class*="option"], label'));
      const m = opts.find((o) => o.innerText?.trim().toLowerCase() === answer.toLowerCase());
      if (m) { m.click(); return true; }
      return false;
    }, ans);
    if (clicked) {
      await sleep(500);
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
    const apply = document.getElementById('apply-button');
    const company = document.getElementById('company-site-button');
    const alreadyApplied = !!document.querySelector('[class*="already-applied"]') ||
      /you have already applied/i.test(document.body.innerText);
    return { hasApply: !!apply, hasCompany: !!company, alreadyApplied };
  });

  if (info.alreadyApplied) return { status: 'already_applied' };

  if (!info.hasApply && info.hasCompany) {
    // External "Apply on company site". Click and capture the popup URL.
    let externalUrl = '';
    const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await page.evaluate(() => document.getElementById('company-site-button').click());
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

  await page.evaluate(() => document.getElementById('apply-button').click());
  await sleep(2500);

  const post = await page.evaluate(() => {
    const text = document.body.innerText;
    const successAnchor = /you have successfully applied|application has been received|applied successfully/i.test(text);
    const chatbotOpen = !!document.querySelector('.chatbot_DrawerContentWrapper, [class*="chatbot"]');
    return { successAnchor, chatbotOpen };
  });

  if (post.successAnchor && !post.chatbotOpen) return { status: 'applied' };
  if (post.chatbotOpen) {
    const r = await handleChatbot(page);
    return { status: r === 'success' ? 'applied' : `chatbot_${r}` };
  }
  await sleep(1500);
  const final = await page.evaluate(() =>
    /you have successfully applied|application has been received|applied successfully/i.test(document.body.innerText)
  );
  return { status: final ? 'applied' : 'unknown' };
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
  const userDataDir = '/home/voltuswave/.cache/ms-playwright/mcp-chrome-27e9049';
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = context.pages()[0] || await context.newPage();

  const externalStore = loadExternalStore();
  const externalUrls = new Set(externalStore.map((j) => j.applyUrl));

  const summary = { applied: 0, external: 0, dedup_skip: 0, chatbot_unknown: 0, unknown: 0, no_apply_button: 0, already_applied: 0, error: 0 };

  try {
    await login(page);
    console.log(`Collecting up to ${TARGET * 4} jobs...`);
    const allJobs = await collectJobs(page, TARGET);
    console.log(`Collected ${allJobs.length} jobs. Beginning loop...`);

    let appliedCount = 0;
    for (let i = 0; i < allJobs.length && appliedCount < TARGET; i++) {
      const job = allJobs[i];
      const tag = (job.title || '').slice(0, 40);
      console.log(`\n[${i + 1}/${allJobs.length}] ${tag} @ ${job.company}`);

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
