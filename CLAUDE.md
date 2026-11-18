# CLAUDE.md — Elite Global World Travel & Tours Ltd. (RC: 7787410)

You are the engineer executing this project. The human operator is Abdulmumin (developer).
**Source of truth:** `docs/PRD.md`. **Tonight's runbook:** `docs/EXECUTION_PLAN.md` (follow its phases in order).

## What this project is
A static landing page (`public/index.html`) + Google Forms/Sheets lead system built by a Google
Apps Script (`apps-script/EliteGlobal_LeadSystem.gs`) in the account `eliteglobaltravelsng@gmail.com`.
The website opens Forms 1 & 2 in a new tab and POSTs the contact form to Form 3. Every
submission is synced to the "Elite Global – Central Lead Tracker" sheet.

## Layout
- `public/` — the ONLY published folder (Netlify publishes it; cPanel gets its contents).
  - `public/index.html` — single self-contained page. All editable values live in the
    `window.SITE_CONFIG = {…}` block near the top. Do not scatter config elsewhere.
  - `public/assets/team/` — headshots referenced from `SITE_CONFIG.team[].photo`.
- `apps-script/` — Apps Script source (clasp rootDir once Phase 4 is done).
- `assets/form-header.png` — Google Forms header image (not part of the website).
- `docs/` — PRD and runbook. `source/` — client originals, git-ignored, never commit.

## Hard rules
1. **Never invent client data.** Address, phone, WhatsApp, email, team names/bios/photos and
   form URLs come only from the operator. If missing, leave `''` (the page hides empty items).
2. **Never** put a Google Forms `/edit` URL in the website. Only `/viewform` (Forms 1 & 2) and
   `/formResponse` (Form 3 endpoint).
3. Never commit `source/`, `.clasprc.json`, tokens, passwords or real customer/passport data.
   Run `git status` before every commit and check what is staged.
4. Never type passwords or verification codes. Logins (`gh auth login`, `clasp login`,
   `netlify login`, Google sign-in, script authorisation) are done by the operator in the browser.
5. Form 3 question titles, the website `<select>` options and the `Q`/`LISTS` constants in the
   Apps Script must stay identical. If one changes, change all three in the same commit.
6. Keep the approved navy/gold design. No frameworks, no build step, no external JS libraries.
7. Ask before anything irreversible: deleting the Drive folder, `resetSetupFlag`, force-push,
   changing DNS, or deleting the GitHub repo.

## Verify before every commit that touches `public/index.html`
- Open it in a browser (or `npx serve public` → http://localhost:3000) and check the console
  has no errors.
- Confirm: 4 CTA buttons → correct `/viewform` URLs with `target="_blank"`; contact form shows
  field errors on empty submit; no `[Add …]`/`[Full Name]` placeholders anywhere;
  no horizontal scroll at 360 px wide (DevTools device toolbar).
- After config is real: submit one enquiry named `TEST …` and confirm it reaches the
  "General Contact Enquiries (Responses)" sheet and the Lead Tracker.

## Git conventions
- Branch: `main` (small project; one commit per logical change).
- Conventional Commits, imperative mood, ≤ 72-char subject, body explains *why* when useful:
  - `feat(site): …` new website behaviour · `fix(site): …` · `style(site): …` visual only
  - `feat(forms): …` / `fix(forms): …` Apps Script changes
  - `docs: …` PRD/README/runbook · `chore: …` tooling, config, ignore files
  - `content(site): …` client copy/details/photos
- Push after each phase: `git push`. Netlify redeploys automatically from `main`.

## Useful commands (Windows, run from the project root)
```
git status / git add -p / git commit / git push
gh repo view --web                 # open the GitHub repo
npx serve public                   # local preview at http://localhost:3000
clasp push                         # upload apps-script/ to script.google.com (after Phase 4)
clasp open-script                  # open the Apps Script editor in the browser
netlify status / netlify open      # deployment info / dashboard
```
