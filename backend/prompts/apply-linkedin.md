# LinkedIn Easy Apply — Prompt for Claude Code

You are driving a Chromium browser through the Playwright MCP server. Follow the steps below to apply to LinkedIn jobs on the user's behalf.

## Required reading — do this FIRST

1. Read [`prompts/candidate-facts.md`](candidate-facts.md) — this is the single source of truth for every screening-question answer (years per skill, CTC, notice period, DOB, education, location, narrative answers). If `candidate-facts.md` is missing, stop and tell the user to copy `candidate-facts.example.md` to `candidate-facts.md` and fill it in.
2. Read `.env` for `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD`.

Resume PDF: the file matching `*Resume*.pdf` in the project root (currently `Manoj_Ambati_Resume_2026.pdf`).

## Search criteria (defaults — confirm with user before changing)

- **Keyword:** `Full Stack Developer`
- **Location:** `India`
- **Date posted:** Past 24 hours
- **Sort by:** Most recent
- **Filter:** Easy Apply only
- **Experience level:** 1–3 years (entry / associate)
- **Daily cap:** stop after **25** successful submissions

## Steps

1. **Open & login**
   - Navigate to `https://www.linkedin.com/login`
   - Fill email and password from `.env`
   - Submit
   - If a CAPTCHA, OTP, or "verify it's you" challenge appears, **pause and ask the user to solve it manually**, then continue once the feed loads

2. **Open Jobs search**
   - Click `Jobs` in the top nav
   - In the search bar, enter `Full Stack Developer` and location `India`
   - Apply filters: `Easy Apply` ON, `Date posted = Past 24 hours`, sort by `Most recent`

3. **Iterate over job cards** (top to bottom)

   For each job:
   - Click the card to open the right-side detail panel
   - If the visible button is **not** `Easy Apply` (e.g. `Apply` that opens a new tab), **skip to next job**
   - If the job has already been applied to (badge says "Applied"), **skip**
   - Click `Easy Apply`

4. **Fill the Easy Apply modal**

   The modal has 1–6 steps. For each step:
   - **Contact info:** confirm email and phone match the values in `candidate-facts.md`
   - **Resume:** the user's default resume should already be selected. If not, upload the PDF from the project root
   - **Screening questions:** answer using `candidate-facts.md` as the source of truth. Match the question to the closest fact (skills table, compensation, notice period, location, education, narrative). For anything not covered there, or anything in the file's "Always-ask" list, **pause and ask the user**
   - Click `Next` between steps. Click `Review` then `Submit application` on the last step
   - **Do not click `Submit application` if any required field is unanswered** — ask the user

5. **Close confirmation modal** and continue to the next job in the list

6. **Pagination:** when the current page is exhausted, click `Next` at the bottom of the results to load page 2, 3, etc.

7. **Stop conditions** (whichever comes first):
   - **25** applications successfully submitted
   - No more jobs match the filters
   - LinkedIn shows a rate-limit / "you've hit the daily limit" banner
   - User interrupts

## Reporting

After each successful submission, print a short line:
```
[N] APPLIED — <Job Title> at <Company> — <link>
```

When the run ends, print a summary:
```
Total applied: N
Skipped (external Apply): M
Skipped (already applied): K
Errors: E
```

## Things to NOT do

- Do not submit if the resume preview shows a wrong/old file
- Do not auto-fill open-text questions (e.g. "Why are you a good fit?") — pause and ask the user
- Do not click `Save` instead of `Submit` — `Save` only saves a draft
- Do not retry a job that errored more than once
- Do not navigate away mid-application without finishing or canceling cleanly
