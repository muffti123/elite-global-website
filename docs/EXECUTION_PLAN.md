# Elite Global — Execution Plan (tonight)

**Goal:** go from "files on my laptop" to a version-controlled GitHub repo, a live Apps Script web app
writing to Google Sheets/Drive, and a live preview website that Claude Code can keep updating with clean commits.

**Who does what**
- 🧑 **You:** installs, logins/sign-ins (anything that needs a password or a browser click on Google, GitHub or Netlify), and client information.
- 🤖 **Claude Code** (in VS Code): edits, commands, tests, commits, pushes. You paste the prompt shown in each phase.

**Time:** about 2–3 hours. Phases 1–7 can all be done tonight. Phase 8 waits on the client.

---

## Phase 0: Accounts checklist (10 min) 🧑

| Account | Why | Check |
|---|---|---|
| Claude **Pro** (or higher) | Claude Code login | ☐ |
| **GitHub** account | Repo + history | ☐ |
| Google **owner account (see docs/ENVIRONMENTS.md)** (password + phone for 2-step) | Owns the web app, sheets and passport folder | ☐ |
| **Netlify** account (sign up *with GitHub*) | Free hosting + preview URL | ☐ |

## Phase 1: Install the tools (20–30 min) 🧑

Open **PowerShell** (Start → type "PowerShell"). Run one line at a time. Each one should finish without red errors.

```powershell
winget install --id Microsoft.VisualStudioCode -e
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id GitHub.cli -e
irm https://claude.ai/install.ps1 | iex
```
**Close PowerShell and open a new one**, so the new tools are found. Then:

```powershell
npm install -g @google/clasp netlify-cli
git config --global user.name  "Abdulmumin"
git config --global user.email "you@example.com"   # the email on your GitHub account
```
Verify all of them (each should print a version):
```powershell
code --version; git --version; node --version; gh --version; claude --version; clasp --version; netlify --version
```
VS Code: Extensions (Ctrl+Shift+X) → install **Claude Code** (publisher: Anthropic, verified badge).

| Tool | What it's for |
|---|---|
| VS Code | Editor where you and Claude Code work |
| Git | Version history / commits |
| Node.js LTS | Runs `clasp`, `netlify`, `npx serve` |
| GitHub CLI (`gh`) | Create repo + push without leaving the terminal |
| Claude Code (CLI + extension) | The agent that executes this plan |
| clasp | Pushes the Apps Script from the repo to Google |
| Netlify CLI | Links and deploys the website |

## Phase 2: Open the project and start Claude Code (5 min) 🧑

1. Extract the project zip to the Desktop, giving `C:\Users\LenovoT460\Desktop\Elite-Global-World-Travel-and-Tour`.
2. VS Code → **File → Open Folder** → that folder → *Yes, I trust the authors*.
3. Terminal: **Ctrl+`** → type `claude` → sign in with your Claude account in the browser.
4. First prompt:
   > Read CLAUDE.md, docs/PRD.md and docs/EXECUTION_PLAN.md. Summarise the project in 5 lines and list anything inconsistent before we start.

Claude Code asks permission before editing files or running commands. Read each request and approve it. **Shift+Tab** switches on "accept edits" mode for this session if you're comfortable.

## Phase 3: Git + private GitHub repo (10 min) 🧑 + 🤖

🧑 Log GitHub CLI in once (browser opens): `gh auth login` → GitHub.com → HTTPS → Login with a web browser.

🤖 Prompt:
> Initialise git on main. Confirm source/ is ignored. Make the first commit "chore: initial project import (site, apps script, PRD, runbook)". Then create a PRIVATE GitHub repo named elite-global-website with gh and push. Show me git log and the repo URL.

Expected: `gh repo create elite-global-website --private --source . --remote origin --push`.

## Phase 4: Apps Script web app in the owner account (see docs/ENVIRONMENTS.md) (20 min) 🧑 + 🤖

🧑 In a browser signed in **only** as the owner account (see docs/ENVIRONMENTS.md), open https://script.google.com/home/usersettings and turn **Google Apps Script API → On**.

🧑 In the VS Code terminal (Claude Code can't do logins), run `clasp login`. When the browser opens, choose the **owner account (see docs/ENVIRONMENTS.md)** and allow access.

🤖 Prompt:
> Verify with clasp show-authorized-user, create (or reuse, per docs/ENVIRONMENTS.md) the Apps Script project for this environment with rootDir apps-script, clasp push, and record the scriptId in docs/ENVIRONMENTS.md. Then run clasp open-script.

🧑 In the Apps Script editor that opens:
1. Select `setupEliteGlobal` → **Run** → Review permissions → Advanced → Go to … (unsafe) → Allow → wait for **✅ SETUP COMPLETE**.
2. **Deploy → New deployment → ⚙ Web app** → *Execute as:* **Me** · *Who has access:* **Anyone** → Deploy → authorise.
3. Copy the **Web app URL** (ends in `/exec`) and the **Deployment ID** for Claude Code. Opening the URL must show `{"ok":true,…}`.

> **If clasp gives trouble:** create the project at script.google.com and paste each file from `apps-script/` (same names). Don't spend more than 15 minutes fighting clasp.

## Phase 5: Connect the website (10 min) 🤖

🤖 Prompt (paste the web app URL and Deployment ID):
> Set webAppUrl in public/assets/js/config.js to this /exec URL and record it with the Deployment ID in docs/ENVIRONMENTS.md. Do NOT fill company details or team yet. Run node tools/check-lists.js and tools/qa (static), then commit and push.

## Phase 6: End-to-end test on staging (20 min) 🧑 + 🤖

🤖 Prompt:
> Run tools/qa live against staging (TEST names, SPECIMEN files) and report the Lead IDs.

🧑 Then check by hand, on your **phone** as well as desktop:
1. Contact box → success shows `EG-GE-…` → row in **Lead Tracker** and **Contact Enquiries**.
2. Customize page → all steps → `EG-CE-…` → row in **Custom Requests**.
3. Visa page → 2 passengers with specimen images → `EG-VO-…` → **Visa Passengers** rows, 📁 folder link in the tracker, files in `Visa Applications/`.
4. Turn Wi-Fi off during a visa upload → the passenger shows **Retry**; turn it on, tap Retry → finishes without duplicates.

🧑 In the Apps Script editor run `cleanupTestData` (TEST rows removed from all tabs, TEST visa folders moved to the Drive bin).

## Phase 7: Deploy a live preview on Netlify (15 min) 🧑 + 🤖

🧑 Run `netlify login` (browser).

🤖 Prompt:
> Link this repo to a new Netlify site named elite-global-preview with continuous deployment from GitHub main (publish dir comes from netlify.toml). Then give me the live URL and confirm docs/ and apps-script/ are NOT reachable on it.

Expected: `netlify init` (choose *Create & configure a new site*, connect GitHub). From now on, **every `git push` redeploys automatically.**

🧑 Open the preview URL on your phone: send one TEST contact message and one TEST visa application (specimen images only), then run `cleanupTestData` again.

## Phase 8: Client content and real domain (when the client replies) 🧑 + 🤖

🧑 Send the client the open-items list in PRD §12: address, phone/WhatsApp, email, team details plus headshots, a Drive storage/retention decision for passports, and where the domain is hosted. Then switch staging → production (docs/ENVIRONMENTS.md).

🤖 When the details arrive:
> Fill SITE_CONFIG.company and SITE_CONFIG.team in public/assets/js/config.js with these verified details [paste]. Save the headshots as public/assets/team/<role>.jpg, resized to 600×600 and under 150 KB each. Run the checks, commit "content(site): add verified company details and management team", push.

🧑 + 🤖 Going live on the real domain:
- **Domain hosted with cPanel web space:** 🤖 builds a zip of `public/` contents → 🧑 uploads it into `public_html`.
- **Otherwise:** 🧑 Netlify → Domain management → Add domain → copy the DNS records → send them to the client's DNS team → HTTPS turns on automatically.
- 🤖 Final commit: `docs: record production URLs and handover` (update PRD §11 with real URLs). Tag the release: `git tag v1.0.0 && git push --tags`.

## Phase 9: Handover 🧑

Send the client:
- the Central Lead Tracker and Visa Applications folder links (from System Info), shared with named staff
- the live site URL
- the QA report
- the reminder to share sheets only with named staff, never "Anyone with link"

---

## Commit history so far (staging)
```
chore: initial project import (site, apps script, PRD, runbook)
chore: normalise line endings
chore(forms): link Apps Script project via clasp
refactor(forms): make owner account configurable
chore: per-environment clasp config
docs: add staging and production environments
feat(forms): add web app API for website forms
refactor(forms): idempotent setup with new tracker tabs; retire and close Google Forms
feat(forms): clean TEST data from all tabs, visa folders and upload state
refactor(site): extract shared styles, config and logo for multi-page site
feat(site): send contact form to web app and show Lead ID
content(site): update FAQs for website forms and passport uploads
feat(site): add Customize My Umrah Experience page
feat(site): add Umrah visa application page with passenger uploads
chore: add list-sync check and browser QA scripts
docs: replace Google Forms with website forms and web app
```
Still to come: `feat(site): point website forms to production web app`,
`content(site): add verified company details and management team`,
`docs: record production URLs and handover` → tag `v1.0.0`.

## If something breaks
| Symptom | Fix |
|---|---|
| `winget` not recognised | Install "App Installer" from the Microsoft Store, or download each tool from its website |
| `claude`/`clasp` "not recognised" after installing | Close **all** terminals and VS Code, then reopen |
| `clasp push` "User has not enabled the Apps Script API" | Phase 4 first step, wait 2 minutes, retry |
| Setup script: "You are signed in as …" | Wrong Google account. `clasp logout`, then `clasp login` with the owner account (see docs/ENVIRONMENTS.md) |
| Website says "temporarily unavailable" | `webAppUrl` in `config.js` is empty or not an `/exec` URL |
| Website says "something went wrong on our side" | Apps Script editor → **Executions** shows the error (the owner also gets an email). Usually setup was not run, or a tab was renamed |
| Code change has no effect on the website | The deployment still runs the old version: `clasp update-deployment <id>` (or Manage deployments → New version) |
| Web app answers with an HTML sign-in page | Deployment access is not **Anyone** — edit the deployment |
| "Please choose a valid option…" for a correct choice | `lists.js` and `Config.gs` differ: `node tools/check-lists.js` |
| Visa upload very slow | Normal on slow data: each passenger is one request (~5–10 s server time + upload). The page keeps going and shows Retry on failures |
| Netlify shows 404 | Check `netlify.toml` has `publish = "public"` and redeploy |
