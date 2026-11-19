# Elite Global World Travel & Tours Ltd. — Website & Lead System

A static website whose three customer forms (visa application with passports and photos, customised Umrah
request, contact box) submit to **one Google Apps Script web app**. The web app writes every lead to the
*Central Lead Tracker* sheet and files passports in Drive. No Google Forms, no sign-in for customers.
Full requirements: [`docs/PRD.md`](docs/PRD.md) · accounts and IDs: [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md)

```
Elite-Global-World-Travel-and-Tour/
├── public/                       ← EVERYTHING IN HERE IS THE LIVE WEBSITE (and nothing else is)
│   ├── index.html                ← home page + contact box
│   ├── apply-visa.html           ← Request Umrah Visa Only (passengers, passports, photos)
│   ├── customize-umrah.html      ← Customize My Umrah Experience (7 steps)
│   └── assets/
│       ├── js/config.js          ← ⭐ the ONLY settings file: company details, webAppUrl, team
│       ├── js/lists.js           ← answer options (must match apps-script/Config.gs)
│       ├── js/*.js, css/site.css, logo.jpg
│       └── team/                 ← management headshots (ceo.jpg, ...)
├── apps-script/                  ← the web app (runs on Google; upload with `clasp push`)
├── tools/                        ← check-lists.js + browser QA (dev only, never published)
├── docs/                         ← PRD, ENVIRONMENTS (staging/production), EXECUTION_PLAN
├── assets/form-header.png        ← old Google Forms header (retired forms only)
├── netlify.toml                  ← publishes only public/
└── source/                       ← client originals (git-ignored, stays on your PC)
```

---

## Part 1 — Deploy the web app (once per Google account)

Signed in **only** as the owner account for the current environment (see docs/ENVIRONMENTS.md):

1. Push the code: `clasp push` (`.clasp.json` must hold this environment's `scriptId`; copy `.clasp.json.example`).
   No clasp? Create a project at script.google.com and paste each file from `apps-script/` (same names).
2. In the editor run **`setupEliteGlobal`** → Review permissions → Advanced → *Go to … (unsafe)* → Allow.
   Wait for **✅ SETUP COMPLETE**. Safe to run again at any time.
3. **Deploy → New deployment → ⚙ Web app** → *Execute as:* **Me** · *Who has access:* **Anyone** → Deploy →
   authorise → copy the **Web app URL** (ends in `/exec`) and the **Deployment ID**.
4. Open the `/exec` URL in a browser: it must show `{"ok":true,…}`.

Later code changes: `clasp push`, then update the **same** deployment so the URL stays the same —
`clasp update-deployment <Deployment ID>` or Deploy → Manage deployments → ✏ → Version: *New version*.

## Part 2 — Configure the website (one file only)

Open `public/assets/js/config.js`:

| Setting | Where to get it |
|---|---|
| `company.address`, `phone`, `email` | From the client (verified) |
| `company.whatsapp` | Same number, **digits only** with country code, e.g. `2348030000000` |
| `webAppUrl` | Part 1 step 3 (ends in `/exec`) |
| `team` | One line per manager (example in the file). Photos go in `public/assets/team/` |

Anything left as `''` hides itself, so no placeholders go live.

## Part 3 — Test

```bash
node tools/check-lists.js                       # options match the web app
cd tools/qa && npm install && node run.js static # all pages, sends nothing
node run.js live                                 # ⚠️ staging only: TEST leads + SPECIMEN files
```
Or by hand: `npx serve public` → http://localhost:3000, use names starting **`TEST`**, never real passports.
Afterwards run **`cleanupTestData`** in the Apps Script editor (removes TEST rows from every tab and moves
TEST visa folders to the Drive bin).

## Part 4 — Put it live

**Option A — client's existing host.** cPanel → File Manager → `public_html` → upload the **contents** of `public/`.

**Option B — GitHub + Netlify.** Netlify → *Import from GitHub* → this repo (no build command; `netlify.toml`
publishes `public/`). Every `git push` to `main` redeploys. *Domain settings → Add custom domain* shows the
DNS records for the client's DNS team. HTTPS is automatic.

## Repository mirror

| Repo | Role |
|---|---|
| https://github.com/muffti123/elite-global-website | **Source of truth** (fetch + push) |
| https://github.com/Elite-Global-World-Travel-Tours/Elite-Global-World-Travel-Tours-Website | **Push mirror** — Netlify deploys from it |

Every `git push` sends the same history to both (origin has two push URLs). **Never edit, commit to or
merge PRs in the org repo directly** — the next push would be rejected or would overwrite it. If one of the
two pushes fails, fix the cause and run `git push` again. The push URLs are local git config, so set them
up again on any new clone:
```bash
git remote set-url --add --push origin https://github.com/muffti123/elite-global-website.git
git remote set-url --add --push origin https://github.com/Elite-Global-World-Travel-Tours/Elite-Global-World-Travel-Tours-Website.git
git remote -v   # 1 fetch URL (personal), 2 push URLs (personal, org)
```

## Maintenance

| Task | How |
|---|---|
| Change phone/email/team | Edit `public/assets/js/config.js`, commit, push |
| Change an answer option | Change it in `apps-script/Config.gs` **and** `public/assets/js/lists.js` (and the home-page `<select>` for enquiry types) in the same commit; run `node tools/check-lists.js`; `clasp push` + update the deployment |
| See all links | Run `showSystemInfo` or open the tracker's System Info tab |
| Something failed for a customer | Apps Script editor → Executions (the owner also gets an email) |
| Unfinished visa application | Tracker notes start with `[Uploading k/N]`; the folder link shows what arrived |
