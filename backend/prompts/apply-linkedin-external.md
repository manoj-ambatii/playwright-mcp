# LinkedIn External Apply — Prompt for Claude Code
# (uses Apify job list + handles company sites, Google Forms, Easy Apply)

## Prerequisites — do these FIRST

1. Read `prompts/candidate-facts.md` — single source of truth for all answers.
2. Read `.env` for `LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`, `APIFY_API_KEY`.
3. Run `node fetch-linkedin-jobs.js` to fetch fresh jobs from Apify → `linkedin-jobs.json`.
4. Import the tracker: `const tracker = require('./track-jobs');`

Resume PDF: `Manoj Ambati — Resume 2026 latest.pdf` in the project root.

---

## Apply loop

Read `linkedin-jobs.json`. For each job (skip if already in tracker "Applied" sheet):

### Step 1 — Determine apply type

Open `applyUrl` (or `easyApplyUrl` if `easyApply: true`) in a new browser tab.

| What you see | Action |
|---|---|
| LinkedIn Easy Apply modal | → [LinkedIn Easy Apply](#linkedin-easy-apply) |
| Company careers page / ATS (Greenhouse, Lever, Workday, etc.) | → [Company ATS](#company-ats) |
| Google Form | → [Google Form](#google-form) |
| Login wall / requires account creation | Log as **Skipped** (reason: "requires account") |
| 404 / expired | Log as **Skipped** (reason: "expired") |

---

### LinkedIn Easy Apply

1. Click **Easy Apply** button.
2. Fill each step of the modal using `candidate-facts.md`.
   - Phone: `+91 9347946872`
   - Email: `ambatimanoj2469@gmail.com`
   - Resume: confirm the PDF shown matches the project-root PDF; upload if wrong.
   - Screening Qs: use the skills table (listed skills = 2 yrs, unlisted = 0).
   - Relocate / location: Yes for Hyderabad/Bangalore; Yes for Remote; No for others.
3. Click **Review** → **Submit application**.
4. Log: `tracker.logApplied({ title, company, location, url }); tracker.save();`
5. Print: `[N] APPLIED (Easy Apply) — <Title> at <Company>`

---

### Company ATS

Common ATSes: Greenhouse, Lever, Workday, BambooHR, iCIMS, SmartRecruiters.

1. Upload resume PDF when prompted.
2. Fill all required fields using `candidate-facts.md`.
3. For multi-step forms, click Next/Continue through each step.
4. On the final page, click **Submit** / **Apply** / **Send application**.
5. If a success confirmation page or email confirmation is shown → log Applied.
6. If you reach a step you cannot complete (e.g. requires country-specific SSN, employer reference contacts) → log **Failed** with the reason and stop.
7. Log: `tracker.logApplied(...)` or `tracker.logFailed({ ...job, reason: '...' }); tracker.save();`

---

### Google Form

1. Fill all fields using `candidate-facts.md`:
   - Name: `Manoj Ambati`
   - Email: `ambatimanoj2469@gmail.com`
   - Phone: `+91 9347946872`
   - Years of experience: `2`
   - Current CTC: `4.2 LPA`
   - Expected CTC: `7.5 LPA`
   - Notice period: `60 days`
   - Current location: `Hyderabad`
   - Resume upload: upload `Manoj Ambati — Resume 2026 latest.pdf`
   - LinkedIn URL: `https://www.linkedin.com/in/manojambati2469/`
   - GitHub: `https://github.com/manoj-voltuswave`
   - Open-text "Tell us about yourself" → use narrative answer from `candidate-facts.md`
2. If a file-upload question appears for resume, upload the PDF.
3. Click **Submit**.
4. On the "Your response has been recorded" confirmation → log Applied.
5. Log: `tracker.logApplied(...)` or `tracker.logFailed(...)` ; `tracker.save();`

---

## Rules

- **Never skip a job just because it's not "Easy Apply"** — attempt the company site or form.
- **Always-ask** (pause, don't auto-answer):
  - "Why this company?" / "What do you know about us?"
  - PAN / Aadhaar / bank details
  - Background check consent checkboxes
  - Reference contact names/emails
- **Close each apply tab** after completing or failing; return to the jobs list.
- **Daily cap:** stop after **50** successful submissions or when all jobs are processed.

---

## After each job

```js
tracker.save();
console.log(tracker.summary());
```

Print one line per job:
```
[N] APPLIED   — <Title> at <Company> — <URL>
[N] FAILED    — <Title> at <Company> — <Reason>
[N] SKIPPED   — <Title> at <Company> — <Reason>
```

## Final summary

```
=== LinkedIn Apply Run Complete ===
tracker.summary()   // Applied: X  Failed: Y  Skipped: Z
Excel tracker: job-applications.xlsx
```
