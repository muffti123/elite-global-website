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
│   ├── track.html                ← Track my application (reference + email/phone)
│   └── assets/
│       ├── js/config.js          ← ⭐ the ONLY settings file: company details, webAppUrl, team
│       ├── js/lists.js           ← answer options + Nigerian airports (must match apps-script/Config.gs)
│       ├── js/*.js               ← page scripts, motion, date picker, combobox, airports, image checks
│       ├── css/site.css, css/brand.css  ← design + logo lockup (brand/ = SVG emblem, fonts/ = logo fonts)
│       ├── data/airports.json    ← departure airports per country (generated, see Maintenance)
│       └── team/                 ← management portraits, 4:5 (01-…jpg, …)
├── apps-script/                  ← the web app (runs on Google; upload with `clasp push`)
├── tools/                        ← check-lists.js, build-airports.js, browser QA + screenshots (dev only)
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
| `company.instagram` | Full profile URL, `https://www.instagram.com/…/` (icon hidden when empty) |
| `webAppUrl` | Part 1 step 3 (ends in `/exec`) |
| `team` | One line per manager: name, role, bio, photo. Portraits (4:5, e.g. 800 × 1000) go in `public/assets/team/`. An empty list hides the section |

Anything left as `''` hides itself, so no placeholders go live.

## Part 3 — Test

```bash
node tools/check-lists.js                       # options match the web app
cd tools/qa && npm install && node run.js static # all pages, sends nothing
node run.js live                                 # ⚠️ staging only: TEST leads + SPECIMEN files
node shots.js                                    # desktop/tablet/phone screenshots → tools/qa/screenshots/
node ../gas-test/test.js                         # web app logic against a mock (no Google calls)
```
Or by hand: `npx serve public` → http://localhost:3000, use names starting **`TEST`**, never real passports.
Afterwards run **`cleanupTestData`** in the Apps Script editor (removes TEST rows from every tab and moves
TEST visa folders to the Drive bin).

## Part 4 — Put it live

**Option A — client's existing host.** cPanel → File Manager → `public_html` → upload the **contents** of `public/`.

**Staging today:** elite-global-staging.netlify.app is a manual deploy — drag the `public/` folder onto the
elite-global-staging *Deploys* page. It is not connected to the repo.

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
| Nigerian departure airports | `AIRPORTS_NG` in `Config.gs` **and** `lists.js` (same order), then as above |
| Refresh other countries' airports | `node tools/build-airports.js` (OurAirports, public domain) rewrites `public/assets/data/airports.json` **and** `apps-script/Airports.gs`; `node tools/check-lists.js`; commit both; `clasp push` + update the deployment |
| Replace the logo | Swap `public/assets/brand/emblem.svg` / `emblem-white.svg`; the text is live (`brand.css`) |
| See all links | Run `showSystemInfo` or open the tracker's System Info tab |
| Something failed for a customer | Apps Script editor → Executions (the owner also gets an email) |
| Tell a customer something on the Track page | Write it in the Lead Tracker column **Message to Customer** (short, professional; the first 300 characters are shown). Customers see a stage based on **Lead Status**, or for visa applications on **Review Status** (PRD §3.5, §3.6) |
| Visa review + customer emails | See **Staff guide** below |
| Unfinished visa application | Lead Tracker → **Application Status** says `Uploading k/N` (`Expired` after 24 h); the folder link shows what arrived. Follow-up Notes are for staff only |

## Staff guide — visa review, emails and settings

### Review Status (visa applications)
- When a customer finishes uploading, the Lead Tracker sets **Review Status = Under Review** and the customer gets
  one email: "we received your application and it is under review". **Lead Status** is still yours for the
  sales pipeline — the website never changes it.
- Change **Review Status** (dropdown, column "Review Status") as the application moves on: Correction Needed,
  Correction Received, Verified, Visa Processing, Visa Approved, Not Approved / Closed. The Track page shows the
  matching stage to the customer (PRD §3.6.1).

### How status emails are delivered
- The customer is emailed about a new Review Status **5 minutes after your last change** (the email arrives
  5–10 minutes later). **Changed it by mistake? Change it back within 5 minutes and nothing is sent.**
- Each status is emailed **once per application** — setting the same status again later sends nothing.
- **Correction Needed** is only sent once **Message to Customer** says what you need (short, professional;
  the first 300 characters are used). Until then it is "held" and listed in the daily summary. The message is
  also shown on the Track page.
- **Last Customer Email** (auto) shows what was last sent, e.g. `Status: Verified · 22 Nov 2026 09:05`;
  "Queued" means it will go out when the daily quota allows. Every email is in the
  **Elite Global – Email Log** spreadsheet (link in System Info / `showSystemInfo`).
- Every morning around 08:00 (Lagos) `STAFF_EMAIL` gets a **daily summary**: counts per Review Status, reviews
  waiting more than 3 days, new leads not contacted for 3 days, held emails, the email queue and the quota left.
- Every new lead also sends an instant **staff alert** to `STAFF_EMAIL` (with a link to the tracker row and,
  for visa, the Drive folder).

### Settings (Apps Script editor → Project Settings → Script Properties, or run the functions)
| Setting | How |
|---|---|
| Who gets staff alerts + the summary | Run `setStaffEmail("name@example.com")` (several: comma-separated). Default: the script owner |
| Website address in emails | Run `setSiteUrl("https://www.your-domain")` on **production** (default: the staging site) |
| Pause emails | Script Property `NOTIFY_STAFF` or `NOTIFY_CUSTOMER` = `off` (emails skipped while off are not sent later) |
| Check everything | Run `showNotifySettings()` (provider, addresses, quota left, queue size; the Brevo key shows only as "set") |
| Preview every email | Run `sendEmailSamples()` — 15 samples go to `STAFF_EMAIL` |
| Email logo | `public/assets/brand/email-logo.png`, served from the website — run `cd tools/qa && node ../build-email-logo.js` after a logo change, then deploy `public/` |

### Switching email sending to Brevo (needed for production volume)
MailApp on a gmail.com account sends ~100 emails a day; at ~500 applications a day the system needs about
3,000. Brevo's free plan is 300/day, so choose a paid plan that covers ~90,000 emails a month.
1. Create a Brevo account, add and **verify the sender** (ideally your own domain with the DNS records Brevo
   shows; a free gmail.com sender is often sent to spam).
2. Brevo → SMTP & API → **API keys** → create a key. Never paste it into code, chat or documents.
3. Apps Script editor → Project Settings → Script Properties: `BREVO_API_KEY` = the key,
   `SENDER_EMAIL` = the verified sender, `EMAIL_PROVIDER` = `brevo`.
4. Run `showNotifySettings()` and `sendEmailSamples()` to check. Replies still go to the company email.
   To go back, set `EMAIL_PROVIDER` = `mailapp`.
If Brevo or the quota is unavailable, emails wait in the queue and are retried every 5 minutes; leads are
never lost. Email codes cannot wait, so customers are asked to try again or use WhatsApp.

### Email confirmation codes (testing on staging only)
`setTestOtpBypass(true)` lets **TEST** names with **@example.com** emails use a fixed test code (no email is
sent) — staging only, refused elsewhere. Turn it off with `setTestOtpBypass(false)` after testing.
