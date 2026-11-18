# Elite Global — Execution Plan (tonight)

**Goal:** go from "files on my laptop" to a version-controlled GitHub repo, a live Google Forms/Sheets
lead system, and a live preview website that Claude Code can keep updating with clean commits.

**Who does what**
- 🧑 **You:** installs, logins/sign-ins (anything that needs a password or a browser click on Google, GitHub or Netlify), and client information.
- 🤖 **Claude Code** (in VS Code): edits, commands, tests, commits, pushes. You paste the prompt shown in each phase.

**Time:** about 2–3 hours. Phases 1–8 can all be done tonight. Phase 9 waits on the client.

---

## Phase 0: Accounts checklist (10 min) 🧑

| Account | Why | Check |
|---|---|---|
| Claude **Pro** (or higher) | Claude Code login | ☐ |
| **GitHub** account | Repo + history | ☐ |
| Google account **eliteglobaltravelsng@gmail.com** (password + phone for 2-step) | Owns the forms and sheets | ☐ |
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

## Phase 4: Apps Script into the company Google account (20 min) 🧑 + 🤖

🧑 In a browser signed in **only** as eliteglobaltravelsng@gmail.com, open https://script.google.com/home/usersettings and turn **Google Apps Script API → On**.

🧑 In the VS Code terminal (Claude Code can't do logins), run `clasp login`. When the browser opens, choose **eliteglobaltravelsng@gmail.com** and allow access.

🤖 Prompt:
> Using clasp, create a standalone Apps Script project titled "Elite Global Lead System" with rootDir apps-script, push EliteGlobal_LeadSystem.gs, set the runtime to V8 and timeZone Africa/Lagos in appsscript.json, push again, and commit .clasp.json + appsscript.json as "chore(forms): link Apps Script project via clasp". Then run clasp open-script.

Expected: `clasp create-script --type standalone --title "Elite Global Lead System" --rootDir apps-script`, then `clasp push`.

🧑 In the Apps Script editor that opens:
1. Select `setupEliteGlobal` → **Run** → Review permissions → Advanced → Go to … (unsafe) → Allow.
2. Wait for **✅ SETUP COMPLETE**.

> **If clasp gives trouble:** fall back to the manual method in README Part 1 (paste the file into a new project). Don't spend more than 15 minutes fighting clasp.

## Phase 5: Manual Google Forms steps (15 min) 🧑

Google gives no API for these. In **Form 1 and Form 2**:
- **Passport Documents** section → **+** → **File upload**:
  - Form 1 title: *Upload Passport Biodata Page(s) for All Applicants*; Form 2: *…All Travellers*.
  - Allow PDF + Image, max 10 files, 10 MB, **Required OFF**.
- 🎨 **Theme:** header image `assets/form-header.png`, colour `#071B50`.

Then open **Central Lead Tracker → System Info** tab and copy the whole table.

## Phase 6: Connect the website (15 min) 🤖

🤖 Prompt (paste the System Info table under it):
> Here is the System Info table. Fill SITE_CONFIG.forms and SITE_CONFIG.contactForm in public/index.html. Do NOT fill company details or team yet. Verify every URL type (viewform vs formResponse), preview with npx serve public, run the checks in CLAUDE.md, then commit "feat(site): connect CTA buttons and enquiry form to Google Forms" and push.

## Phase 7: End-to-end test (20 min) 🧑 + 🤖

🧑 Test with names starting **TEST** only, and dummy passport images only:
1. Website enquiry form → submit → success message → row appears in the *General Contact Enquiries (Responses)* sheet **and** the Lead Tracker (`EG-GE-00001`).
2. Click both Umrah buttons → submit each form from your **phone** → rows land in the correct sheet, and in the tracker with the correct category, Total Travellers and notes.
3. Turn Wi-Fi off → submit the website form → the red error message shows, and what you typed is kept.

🤖 Prompt:
> Write docs/QA_REPORT.md from the PRD §10 checklist with today's results [paste what you saw], commit "docs: add QA report for lead system", push.

🧑 In the Apps Script editor run `cleanupTestData`, then delete the test passport files in Drive.

## Phase 8: Deploy a live preview on Netlify (15 min) 🧑 + 🤖

🧑 Run `netlify login` (browser).

🤖 Prompt:
> Link this repo to a new Netlify site named elite-global-preview with continuous deployment from GitHub main (publish dir comes from netlify.toml). Then give me the live URL and confirm docs/ and apps-script/ are NOT reachable on it.

Expected: `netlify init` (choose *Create & configure a new site*, connect GitHub). From now on, **every `git push` redeploys automatically.**

🧑 Open the preview URL on your phone and repeat one TEST enquiry, then run `cleanupTestData` again.

## Phase 9: Client content and real domain (when the client replies) 🧑 + 🤖

🧑 Send the client the open-items list in PRD §12: address, phone/WhatsApp, email, team details plus headshots, a decision on passport uploads, and where the domain is hosted.

🤖 When the details arrive:
> Fill SITE_CONFIG.company and SITE_CONFIG.team with these verified details [paste]. Save the headshots as public/assets/team/<role>.jpg, resized to 600×600 and under 150 KB each. Run the checks, commit "content(site): add verified company details and management team", push.

🧑 + 🤖 Going live on the real domain:
- **Domain hosted with cPanel web space:** 🤖 builds a zip of `public/` contents → 🧑 uploads it into `public_html`.
- **Otherwise:** 🧑 Netlify → Domain management → Add domain → copy the DNS records → send them to the client's DNS team → HTTPS turns on automatically.
- 🤖 Final commit: `docs: record production URLs and handover` (update PRD §11 with real URLs). Tag the release: `git tag v1.0.0 && git push --tags`.

## Phase 10: Handover 🧑

Send the client:
- form editing URLs, response sheets and the tracker (from System Info)
- the live site URL
- the QA report
- the reminder to share sheets only with named staff, never "Anyone with link"

---

## Commit history you should end up with
```
chore: initial project import (site, apps script, PRD, runbook)
chore(forms): link Apps Script project via clasp
feat(site): connect CTA buttons and enquiry form to Google Forms
docs: add QA report for lead system
chore: deploy configuration for Netlify          (only if Claude Code changes anything)
content(site): add verified company details and management team
docs: record production URLs and handover        → tag v1.0.0
```

## If something breaks
| Symptom | Fix |
|---|---|
| `winget` not recognised | Install "App Installer" from the Microsoft Store, or download each tool from its website |
| `claude`/`clasp` "not recognised" after installing | Close **all** terminals and VS Code, then reopen |
| `clasp push` "User has not enabled the Apps Script API" | Phase 4 first step, wait 2 minutes, retry |
| Setup script: "You are signed in as …" | You authorised with the wrong Google account. `clasp logout`, then `clasp login` with the company account |
| Website form says success but no row appears | Entry IDs or endpoint wrong. Ask 🤖 to re-check against System Info |
| Tracker stops updating | Run `reinstallTriggers` in the Apps Script editor |
| Netlify shows 404 | Check `netlify.toml` has `publish = "public"` and redeploy |
