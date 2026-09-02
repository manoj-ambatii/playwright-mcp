# Naukri In-Platform Apply — Prompt for Claude Code

You are driving a Chromium browser through the Playwright MCP server. Follow the steps below to apply to Naukri jobs on the user's behalf.

## Required reading — do this FIRST

1. Read [`prompts/candidate-facts.md`](candidate-facts.md) — this is the single source of truth for every screening-question answer (years per skill, CTC, notice period, DOB, education, location, narrative answers). If `candidate-facts.md` is missing, stop and tell the user to copy `candidate-facts.example.md` to `candidate-facts.md` and fill it in.
2. Read `.env` for `NAUKRI_EMAIL` and `NAUKRI_PASSWORD`.

Resume PDF: the file matching `*Resume*.pdf` in the project root (currently `Manoj_Ambati_Resume_2026.pdf`). Naukri uses the resume already on the user's profile — do NOT re-upload during apply unless a job explicitly asks for one.

## Search criteria (defaults — confirm with user before changing)

- **Keyword:** `Full Stack Developer`
- **Location:** `India` (or specify cities: Hyderabad, Bangalore, Pune, Remote)
- **Freshness:** Last 1 day
- **Experience:** 2 years
- **Sort by:** Date
- **Daily cap:** stop after **25** successful submissions

## Steps

1. **Open & login**
   - Navigate to `https://www.naukri.com/nlogin/login`
   - Fill email and password from `.env`
   - Submit
   - If a CAPTCHA, OTP, or "verify it's you" challenge appears, **pause and ask the user to solve it manually**, then continue once the dashboard loads
   - If a "Update your profile" interstitial blocks the flow, dismiss it (close `X` or click `Skip`) — don't update the profile during this run

2. **Run the search**
   - Use the top search bar: keyword `Full Stack Developer`, experience `2`, location `India`
   - Click `Search`
   - On the results page, apply filters in the left sidebar:
     - `Freshness` → `Last 1 day`
     - `Sort` (top right) → `Date`

3. **Iterate over job cards** (top to bottom)

   For each job card:
   - Click the card title to open the job detail (Naukri opens a new tab — switch to it)
   - Identify the apply button:
     - `Apply` button (Naukri-internal, blue) → **proceed**
     - `Apply on company site` (opens external URL) → **skip**, close tab, go back to results
     - `Applied` badge (already applied) → **skip**
   - If "proceed", click `Apply`

4. **Handle the apply flow**

   Naukri's apply has three possible outcomes:

   **(a) Instant submit** — a green toast appears: "Your application has been sent to the recruiter". Done, log it.

   **(b) Chatbot questionnaire** — a chat-style modal opens with screening questions. Answer using `candidate-facts.md` as the source of truth. Match the question to the closest fact (skills table, compensation, notice period, location, education, narrative). For anything not covered there, or anything in the file's "Always-ask" list, **pause and ask the user**.

   Notes for Naukri's chatbot specifically:
   - If a notice-period dropdown doesn't have an exact match for the value in `candidate-facts.md`, pick the closest higher option (e.g. facts say `60 days` but options are `30 / 90 / Immediate` → pick `90`)
   - Multi-choice buttons take priority over typing — click the matching option instead

   Submit the chatbot when done.

   **(c) Redirect to recruiter form** — full page form opens. **Skip these for now** (too varied to automate safely); close the tab and continue.

5. **Close the apply tab** (if opened in new tab) and switch back to the results tab

6. **Pagination:** when the current results page is done, scroll to the bottom and click the next page number

7. **Stop conditions** (whichever comes first):
   - **25** applications successfully submitted
   - No more jobs match the filters
   - Naukri shows a rate-limit message or starts forcing CAPTCHAs on every apply
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
Skipped (recruiter form): R
Errors: E
```

## Naukri-specific gotchas

- After login, Naukri sometimes shows a **profile update prompt** ("Your profile is X% complete"). Dismiss with `Skip` or `Close` — don't fill it
- Naukri opens jobs in **new tabs**. Track tab IDs and close them after each apply to avoid leaking tabs
- The chatbot modal is a `<div>` overlay — the input is a textbox at the bottom. Press `Enter` or click `Send` to submit each answer
- Some chatbot questions are **multi-choice buttons** instead of free text — click the matching button rather than typing
- If the apply button text is in another language (Naukri occasionally serves Hindi UI), match by the button's position and color (primary blue button on the right side of the job header) rather than text

## Things to NOT do

- Do not auto-answer **CTC** questions — always ask the user
- Do not auto-answer open-text questions like "Why are you a good fit?" — pause and ask the user
- Do not update the user's Naukri profile during this run, even if prompted
- Do not click `Save` / `Bookmark` instead of `Apply`
- Do not retry a job that errored more than once
