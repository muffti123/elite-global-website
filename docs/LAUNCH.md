# LAUNCH — production on elitetravelng.com (runbook)

Status: **approved 23 Nov 2026; everything that doesn't need Workspace is built** (branch `launch-prod`).
The only waits left are Google (Workspace verification and payment), DNS, and Brevo's checks.
Staging stays exactly as it is: Netlify (manual drag) + the staging Apps Script (`1H510Iw…`, deployment
`AKfycbzSBOiav…`). Nothing in this runbook touches staging data or its `/exec` URL.

**Who:**
- 🧑 **You:** logins, browser clicks, hPanel, Google Admin, DNS, anything that needs a password or a code.
- 🤖 **Me:** code, builds, checks, and `clasp` commands once you have logged in.
- ✅ **Verify:** how we confirm each step before moving on.

**Hard rules that stay in force:**
- **Production data:**
  - No live QA suite (`run.js live`, `load-live.js`, `*-live.js`) against production, ever. They refuse unless `config.js` points at staging (`tools/qa/staging-only.js`).
  - `TEST_OTP_BYPASS` is never set on production.
  - No real data on staging.
- **Logging and email:**
  - Never log email, name, code or token.
  - The only email address in code is the company one (info@elitetravelng.com).
- **Git:** never commit `.clasp*.json` (except the example), `.clasprc.json`, `source/` or tokens. No force-push.

## Contents
- [Decisions (23 Nov 2026)](#decisions-23-nov-2026)
- [What's built](#whats-built)
- [Target picture](#target-picture)
- [1. Production Apps Script](#1-production-apps-script)
- [2. Website release for Hostinger](#2-website-release-for-hostinger)
- [3. Company email → info@elitetravelng.com](#3-company-email--infoelitetravelngcom)
- [4. DNS records in Hostinger](#4-dns-records-in-hostinger)
- [5. Google Workspace trial and plan](#5-google-workspace-trial-and-plan)
- [6. Go-live checklist, smoke test, rollback](#6-go-live-checklist-smoke-test-rollback)
- [7. Access rules and staff access checklist](#7-access-rules-and-staff-access-checklist)

---

## Decisions (23 Nov 2026)

| # | Question | Decision |
|---|---|---|
| 1 | STAFF_EMAIL | `admin@elitetravelng.com` for now; staff addresses later (comma-separated) |
| 2 | Sender until Brevo | admin@elitetravelng.com (MailApp), Reply-To info@; Brevo then sends from info@ |
| 3 | Hero image | Copied into the site (`assets/img/hero-1600.webp`, `hero-800.webp`); no Unsplash request |
| 4 | Existing mail on the domain | None (Go54 confirmed; no Hostinger email created). MX can move to Google straight away |
| 5 | DMARC reports | admin@elitetravelng.com |
| 6 | Staff Drive access | **Editor on the "Visa Applications" folder only** (they upload approved visas). Never the root folder, the Apps Script, the Email Log, archive files or other system files |
| 7 | Seats | 5 staff (muhammad@, abdulmumin@, mustapha@, hamza@ and abdul@elitetravelng.com) + admin@ = **6 Workspace users** |
| 8 | HSTS | `max-age=86400` (1 day) first; 1 year (`31536000`) after a week without problems; no preload |
| 9 | Forms-paused switch | Built (`pauseForms` / `resumeForms`) |
| 10 | eliteglobaltravelsng@gmail.com | Left as it is (staging/developer account); no forwarding, no auto-reply |
| 11 | Go-live | As soon as possible: within 1–2 days after Google verifies the Workspace payment |

---

## What's built
All of it is on `launch-prod`. Every commit passed `check-lists`, `gas-test` and the static QA.

| # | Commit | What |
|---|---|---|
| B1 | `chore: ignore per-environment clasp files; add production clasp wrapper` | `.clasp.*.json` and `/release/` are git-ignored. `tools/prod-clasp.ps1` refuses staging and any login that is not @elitetravelng.com |
| B2 | `chore(qa): refuse every live suite unless config.js points at staging` | `tools/qa/staging-only.js` + self-test in the static run; `run.js --root` |
| B3 | `content(site): use info@elitetravelng.com as the company email` | `config.js`, `COMPANY_INFO`, tests; `check-lists` checks the domain |
| — | `content(site): serve the hero image from the site instead of Unsplash` | Decision 3 |
| B4 | `feat(site): add 404 page and noindex staging headers` | `public/404.html`, `public/_headers` |
| B6 | `fix(forms): only remove capital "TEST " leads; add previewTestData` | "Testimony …" is safe. Lead IDs restart only if nothing was ever archived |
| B7 | `feat(forms): forms-paused switch for maintenance` | §6.3 |
| B9 | `feat(forms): protect system columns and tabs so only the owner can edit` | §7 |
| — | `feat(forms): stop editors re-sharing the tracker and Visa Applications folder` | §7 |
| B5 | `chore: add production release build and checks` | `tools/release/{build,check,check-live}.js`, `deploy/production.json` |
| B8 | `docs: …` | This runbook, ENVIRONMENTS, CLAUDE.md, README, PRD |

The Apps Script changes (B6, B7, B9) are on **staging** too: `clasp push` + `update-deployment AKfycbzSBOiav…`, with `"schema":9` unchanged.

---

## Target picture

| | Staging (unchanged) | Production (new) |
|---|---|---|
| Website | elite-global-staging.netlify.app (drag `public/`), **noindex** | https://elitetravelng.com on Hostinger (upload the release zip in hPanel) |
| Google account | saniabdulmumin70@gmail.com | **admin@elitetravelng.com** (Workspace Business Standard) |
| Apps Script | `1H510Iw…`, `/exec` `AKfycbzSBOiav…` | New project "Elite Global Lead System" owned by admin@, new `/exec` |
| Tracker + Drive | Staging copies, TEST data only | New tracker, Drive folders, Email Log, all owned by admin@ |
| clasp | Default credentials + `.clasp.json` | Named user `prod` + `.clasp.prod.json` (both git-ignored), via `tools/prod-clasp.ps1` |
| Customer email | — | info@elitetravelng.com (Workspace group): Reply-To, footer, website |
| Sending | MailApp | MailApp (from admin@, Reply-To info@) → Brevo (from info@) once Brevo is verified |

The old "production" project (`1Lhrr8…`, owned by eliteglobaltravelsng@gmail.com) is **not used**. It stays untouched and is marked retired in ENVIRONMENTS.md.

---

## 1. Production Apps Script

### 1.1 Prepare admin@ (🧑)
1. **Sign-in:** sign in to admin@elitetravelng.com and turn on **2-Step Verification**. This account owns passports.
2. **Org units:** Admin console → Directory → **Organizational units** → create **`Staff`**. admin@ stays in the top unit, and the 5 staff accounts go into `Staff` later (§7).
3. **External sharing:** Admin console → Apps → Google Workspace → Drive and Docs → **Sharing settings**.
   - **Top unit (admin@): sharing outside Elite Global = ON.** Without it, Google hides the web app's "Anyone" access option, and the website cannot post. Files stay private, because the code never changes Drive sharing.
   - **`Staff` unit: sharing outside = OFF.** Staff can't share any file outside the company.
4. **Apps Script API:** open https://script.google.com/home/usersettings as **admin@** and set **Google Apps Script API → On**.
5. **New project:** in the same session, script.google.com → **New project** → rename it "Elite Global Lead System".
   - Project Settings → time zone **Africa/Lagos**.
   - Copy the **Script ID** and send it to me.
- ✅ The Script ID is not the staging one (`1H510Iw…`). The wrapper also refuses it.

### 1.2 Separate clasp login and config (🧑 login, 🤖 config)
1. 🧑 Run `! clasp login --user prod` and choose **admin@elitetravelng.com** in the browser. Your staging login stays as it is.
2. 🤖 I create `.clasp.prod.json` (git-ignored): `{"scriptId":"<prod id>","rootDir":"apps-script"}`.
3. 🤖 **Every production command goes through the wrapper:**
   ```
   powershell -ExecutionPolicy Bypass -File tools/prod-clasp.ps1 <command>
   ```
   It runs `clasp --user prod -P .clasp.prod.json <command>`. It refuses in four cases:
   - `.clasp.prod.json` is missing;
   - the scriptId is the staging one;
   - the command names the staging deployment;
   - the `prod` login is not an @elitetravelng.com account.

   Plain `clasp push` keeps going to **staging**.
- ✅ `clasp --user prod show-authorized-user` → admin@elitetravelng.com.
- ✅ `git status` shows no `.clasp.prod.json`.

### 1.3 Script Properties — set **before** setup (🧑, Project Settings → Script Properties)

| Property | Production value | Notes |
|---|---|---|
| `SITE_URL` | `https://elitetravelng.com` | No trailing slash. Email links and the email logo use it, and it blocks `TEST_OTP_BYPASS` (that needs "staging" in SITE_URL) |
| `OWNER_EMAIL` | `admin@elitetravelng.com` | Or run `setOwnerEmail` as admin@ (no argument = the current account) |
| `STAFF_EMAIL` | `admin@elitetravelng.com` | Staff alerts + daily summary. Add staff later, comma-separated |
| `ATTACH_VISA` | `on` | The Visa Approved email attaches the visa (≤ 15 MB) |
| `EMAIL_PROVIDER` | `mailapp` | Change to `brevo` only after Brevo's domain is verified (§4) |
| `NOTIFY_STAFF` / `NOTIFY_CUSTOMER` | Not set (= on) | |
| `BREVO_API_KEY`, `SENDER_EMAIL` | Later: the key, `info@elitetravelng.com` | Set when switching to Brevo; the key is never in code or docs |
| `TEST_OTP_BYPASS` | **Never** | `setTestOtpBypass` also refuses, because SITE_URL has no "staging" |
| `FORMS_PAUSED` | Not set | Only through `pauseForms` / `resumeForms` (§6.3) |

Setup creates `OTP_SECRET`, `SCHEMA_VERSION`, the folder and tracker IDs, and `EMAIL_LOG_ID`. Never copy them from staging.

### 1.4 Code upload and setup
1. 🤖 **Checks:** `node tools/check-lists.js`, `node tools/gas-test/test.js` and `cd tools/qa && node run.js static`, all green.
2. 🤖 **Upload:** `prod-clasp push`.
3. 🧑 **Setup:** in the production editor (`prod-clasp open-script`), run `setupEliteGlobal` and authorise as admin@ (Advanced → Go to … → Allow).
   - The log must end with **✅ SETUP COMPLETE**.
   - It must show no ⚠️ SITE_URL line.
   - It must show the line "Staff access: Lead Tracker open for staff in 17 columns only …".
4. 🧑 **Settings:** run `checkEmailSettings` and send me the log. It contains no customer data.
- ✅ **Tracker and Drive:** the tracker, Drive folder, Visa Applications folder and Email Log exist in admin@'s Drive. Their links are in the tracker's System Info tab.
- ✅ **Settings log:** SITE_URL is elitetravelng.com, the provider is mailapp, ATTACH_VISA is on, TEST_OTP_BYPASS is off, FORMS_PAUSED is off, and the MailApp quota is shown.
- ✅ **Triggers** (Editor → ⏰ Triggers): exactly **4**:
  - `onTrackerEdit` (on edit, tracker);
  - `runEmailJobs` (every 5 min);
  - `runArchive` (daily, 02:00);
  - `sendDailySummary` (daily, 08:00).

  Running setup again must still show 4.

### 1.5 Deploy the web app
1. 🤖 **Deploy:** `prod-clasp create-deployment -d "production v1"`. This uses the manifest: execute as **the deploying user**, access **Anyone (anonymous)**.
2. 🤖 **Record:** I put the Deployment ID, the `/exec` URL and the scriptId in `deploy/production.json` and ENVIRONMENTS.md, and commit them. They are public anyway, because the website calls them.
3. **Every later production deploy:** `prod-clasp update-deployment <prod id> -d "production vN"`, so the `/exec` URL never changes.
- ✅ **Health check:** a GET on the prod `/exec` returns `{"ok":true,…,"schema":9}`. Read-only.
- ✅ **Signed out:** an incognito window opens the `/exec` URL without a Google sign-in. That proves the "Anyone" access works on Workspace.

---

## 2. Website release for Hostinger

### 2.1 Build — `node tools/release/build.js` (🤖)
**Input:** `public/` (unchanged; staging keeps using it as is) and `deploy/production.json` (`siteUrl`, `webAppUrl`, `hstsMaxAge`).
**Output:** `release/site/`, `release/elitetravelng-<yyyymmdd>-<commit>.zip`, `release/RELEASE-NOTES.txt` (all git-ignored).

**The build:**
- **Clean tree:** refuses with uncommitted changes in `public/`, `deploy/` or `tools/release/`.
- **Web app address:** refuses until `webAppUrl` is a production `/exec` URL.
- **Copies** `public/` without `_headers` and sets the production `webAppUrl` in `config.js`.
- **Each page:**
  - **Asset versions:** CSS/JS links get `?v=<commit>`.
  - **CSP meta tag:** a `Content-Security-Policy` meta tag (the inline script is allowed by its sha256 hash).
  - **Canonical:** canonical URLs on index, apply-visa and customize-umrah, plus `og:url` on index. Track, correct-visa and 404 must have noindex.
- **Writes** `robots.txt`, `sitemap.xml` (the 3 indexable pages) and `.htaccess`.
- **Zips it** with Windows' own `tar.exe`. The zip includes `.htaccess`, and its files sit at the top level.
- **Release notes:** list files removed since the last release (delete those on the server by hand).

`node tools/release/build.js --preview` makes `release/site/` with the **staging** web app and no zip. It exists only so the QA can run on the release before production exists.

**Checks before every upload (🤖):**
1. `node tools/release/check.js`:
   - **Web app:** the production web app is in `config.js`.
   - **Nothing left from staging:** no staging web app, Netlify, gmail address, localhost, Google Forms, `/edit` or Unsplash in the release.
   - **Pages:** `?v=` on every CSS/JS link, CSP on every page, canonical/noindex per page, robots and sitemap.
   - **`.htaccess`:** every rule is present.
   - **Zip:** it is complete, at the top level.
2. `cd tools/qa && node run.js static --root ../../release/site`: the whole static QA on the release, with the CSP on. Any violation is a console error and fails the run.
   - **Tried on 23 Nov:** a preview build passes all 353 checks.

### 2.2 `.htaccess` (Hostinger runs LiteSpeed)
- **Redirects:**
  - One **301** to `https://elitetravelng.com/` for http and www (a single rule, no chain).
  - `/.well-known/` is never redirected (certificate renewal).
  - Leave hPanel's **Force HTTPS off** so the two don't stack.
- **Basics:**
  - `Options -Indexes`, `DirectoryIndex index.html`, `ErrorDocument 404 /404.html`.
  - Dotfiles and `*.md|map|zip|bak|log|ps1|sh` are blocked.
- **Caching:**

  | Files | Cache-Control |
  |---|---|
  | HTML | `no-cache` |
  | CSS/JS/woff2 | `max-age=31536000, immutable` |
  | Images, SVG, JSON | 7 days |
  | XML/TXT | 1 hour |

  Compression is on for text types.
- **Security headers:**
  - `Strict-Transport-Security: max-age=86400` (from `deploy/production.json` → `hstsMaxAge`; raise it to 31536000 after a week and release again).
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
  - `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`.
  - **`Content-Security-Policy`:** `default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`.

### 2.3 404 page and 2.4 staging noindex
- **404 page:** `public/404.html` uses absolute paths, so it works at any depth. Netlify serves it too.
- **Staging noindex:** `public/_headers` (Netlify only, never in the release) sends `X-Robots-Tag: noindex, nofollow`.
  - ✅ After your next Netlify drag: `node tools/release/check-live.js --staging`.

### 2.5 Upload to Hostinger (🧑, hPanel File Manager)
1. **Open the folder:** hPanel → Websites → elitetravelng.com → **File Manager** → `public_html`.
2. **First time only:**
   - Download a backup of what's there.
   - Delete Hostinger's placeholder files (`default.php`, `index.php` …).
3. **Upload:** upload the zip → right-click → **Extract** → into `public_html` itself (not a subfolder) → delete the zip.
4. **Hidden files:** File Manager → Settings → **Show hidden files** → `.htaccess` is there.
5. **Later releases:** the same steps (Extract overwrites). Delete by hand any file that `RELEASE-NOTES.txt` lists as removed.
6. **Keep the zip:** keep every release zip on your PC. The previous one is the rollback.
- ✅ 🤖 **`node tools/release/check-live.js`** (GET/HEAD only, never a form post):
  - **Redirects:** http, www and https-www each give **one 301** to the bare https domain.
  - **Pages:** every page returns 200 with its canonical or noindex.
  - **Headers:** the security headers and cache headers are present.
  - **Web app:** `config.js` has the production `/exec` and is cached for a year.
  - **Images and logo:** images are cached for a week, and the email logo is online.
  - **Missing pages:** a missing page → **404** with our page.
  - **Robots and sitemap:** `robots.txt` and `sitemap.xml` are OK.
  - **Hidden files:** `.htaccess`, `assets/.htaccess` and `README.md` are not served.
  - **Health check:** the production web app answers `schema 9`, not paused.
  - **Tried on 23 Nov:** the domain shows Hostinger's placeholder and its www redirect isn't set up yet. The checks will pass after the first upload.

---

## 3. Company email → info@elitetravelng.com
- 🤖 **Done in code (B3):**
  - The website contact link, the Reply-To, the email footer, "add us to your contacts" and the Brevo `replyTo` all use info@.
  - `check-lists` fails if it isn't info@elitetravelng.com.
- **Staging:** it gets the same change after your next Netlify drag. Its emails' Reply-To becomes info@, which is harmless.
- 🧑 **Create the group:** Admin console → Directory → **Groups** → create **info@elitetravelng.com**.
  - **Who can post:** *Anyone on the web*. Without it, customer replies bounce.
  - **Members:** admin@ now, staff later.
  - **Delivery:** each member gets every email (or turn on Collaborative Inbox).
- ✅ Send a mail from a personal Gmail to info@: it arrives at admin@.
- **Sender until Brevo (decision 2):** MailApp sends **from admin@elitetravelng.com** as "Elite Global World Travel & Tours", with Reply-To info@.

---

## 4. DNS records in Hostinger (🧑 adds, 🤖 verifies with public DNS lookups)
**Where:** hPanel → Domains → elitetravelng.com → **DNS / Nameservers**. The domain must use Hostinger's nameservers.

**Day 0:**
- **Screenshot** the whole zone, and lower the TTL of the records you change to 300 s.
- **Delete** any Hostinger mail defaults (`MX mx1/mx2.hostinger.com`, `TXT v=spf1 include:_spf.mail.hostinger.com …`, `autodiscover`/`autoconfig` CNAMEs). No mailboxes are in use (decision 4).
- **Keep** the website records (`A @`, `CNAME www` or `A www`). For the www redirect, `www` must reach Hostinger, and hPanel's SSL must cover **both** `elitetravelng.com` and `www.elitetravelng.com`.
- **One SPF only:** there must be a single SPF record.

| # | Type | Name | Value | When |
|---|---|---|---|---|
| 1 | TXT | `@` | `google-site-verification=…` (from Google Admin) | Day 0 → Admin: **Verify** |
| 2 | MX | `@` | `smtp.google.com`, priority **1** | Right after verification |
| 3 | TXT | `@` | `v=spf1 include:_spf.google.com ~all` → after Brevo: `v=spf1 include:_spf.google.com include:spf.brevo.com ~all` (only if Brevo's Domains page asks for it) | Day 0 |
| 4 | TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=…` from Admin → Apps → Gmail → **Authenticate email** → Generate (**2048-bit**) | Day 0, then **Start authentication** after ~24–48 h |
| 5 | TXT | `brevo-code` (as shown) | `brevo-code:…` | When Brevo is set up |
| 6 | CNAME | `brevo1._domainkey`, `brevo2._domainkey` | The targets Brevo shows (copy exactly) | When Brevo is set up |
| 7 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@elitetravelng.com; fo=1` | Day 0 |

**DMARC stages:** after 2–4 weeks of clean reports (Google and Brevo both pass), change to `p=quarantine; pct=25` → `p=quarantine` → `p=reject`. Each step is its own decision.

**✅ Verify:**
- 🤖 **Public DNS:** `nslookup -type=TXT elitetravelng.com 8.8.8.8`, the same for `MX`, `_dmarc` and `google._domainkey`.
- 🧑 **Google:** Google Admin shows the domain verified, Gmail active and DKIM "Authenticating email".
- 🧑 **Inbound:** a mail from outside arrives at admin@ and at info@.
- 🧑 **Outbound:** a production email to a Gmail address shows **SPF, DKIM (elitetravelng.com) and DMARC: PASS** (Show original). Optional: mail-tester.com score ≥ 9.
- 🧑 **Brevo:** the domain shows **Authenticated**, and a Brevo test mail shows DMARC PASS with DKIM aligned to elitetravelng.com. Only then:
  - set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `SENDER_EMAIL=info@elitetravelng.com`;
  - run `checkEmailSettings` + `sendEmailSamples`.
### 4.1 New-domain deliverability and the Brevo fallback (27 Nov 2026)
**What happened:** Google's outbound spam filter bounced the first code emails to gmail.com within a second
("Message rejected", answer/69585). The domain was days old and Workspace was still on trial. Internal copies were delivered.
**What changed (v3.4.1):**
- **The code email is minimal:** "Your Elite Global confirmation code", with no code in the subject, no image, no link, no button and no preheader. It is short plain text plus the same text as simple HTML.
- **Other customer emails:** no remote logo (a text wordmark instead), and the button is their only link.
- **Diagnostic:** `diagExternalEmail` (Script Property `DIAG_TO`) sends variants A, B and C to compare.
- **Monitoring:** System health and the daily summary show **Email codes** (sent / confirmed / failed) with a ⚠️ when most codes are never confirmed.
- **Website:** "If no code arrives within 2 minutes, email info@ or message us on WhatsApp" under every code.

**Brevo as the fallback (prepare now, switch only if Google keeps bouncing):**
1. 🧑 **Account:** brevo.com → sign up with admin@elitetravelng.com, company "Elite Global World Travel & Tours Ltd.", website https://elitetravelng.com. Answer the onboarding questions truthfully (transactional emails to customers who asked for them). Brevo may review a new account for up to a day.
2. 🧑 **Domain:** Brevo → Settings (gear) → **Senders, Domains & Dedicated IPs → Domains → Add a domain** → `elitetravelng.com` → "Authenticate it yourself". It shows the records to add in Hostinger (rows 5–6 above):
   - `TXT brevo-code` = `brevo-code:…`;
   - `CNAME brevo1._domainkey` and `CNAME brevo2._domainkey` → the targets shown;
   - DMARC already exists. **Do not add a second SPF record** (only change the one SPF, and only if Brevo asks).
   - hPanel → Domains → elitetravelng.com → DNS → **Add record**, copy each value exactly, TTL 300. Then Brevo → **Authenticate**. ✅ The domain shows "Authenticated".
3. 🧑 **Sender:** Senders → **Add a sender**: name `Elite Global World Travel & Tours`, email `info@elitetravelng.com`. It verifies automatically once the domain is authenticated (otherwise Brevo emails a link to info@, which reaches the group).
4. 🧑 **API key:** SMTP & API → **API keys → Generate**, name `apps-script-prod`. Copy it once into Apps Script → Project Settings → Script Properties `BREVO_API_KEY`. Never put it into chat, code or documents.
5. 🧑 **Authorised IPs:** Settings → Security → **Authorised IPs** → **deactivate** the IP blocking. Apps Script calls come from changing Google IPs, so with blocking on, every call is refused (HTTP 401).
6. 🧑 **Switch (only when you decide):** set Script Properties `SENDER_EMAIL=info@elitetravelng.com` and `EMAIL_PROVIDER=brevo` → run `checkEmailSettings` (Brevo key "set"), then `sendEmailSamples`. ✅ A sample in Gmail → Show original: DKIM `elitetravelng.com` PASS, DMARC PASS.
   - **Back:** `EMAIL_PROVIDER=mailapp`. Queued emails are kept either way.

- **Brevo plan:** the free plan allows 300/day. At ~3,000 emails/day (500 applications/day) a paid plan is needed, sized for ~90k/month. MailApp on paid Workspace allows ~1,500 recipients/day, enough for the first weeks.

---

## 5. Google Workspace trial and plan (🧑, Admin console → Billing)
**The trial** (check the exact numbers in your Admin console):
- **Length and seats:** usually 14 days, about 10 users. 6 users fit.
- **Sending limits:** lower for new and trial accounts.
  - The code queues emails and keeps 20 quota units free for codes.
  - `checkEmailSettings` shows the real remaining quota.
- **When the trial ends:** without billing the services are suspended, and with them the web app, the tracker and the passports.

**Plan for "go-live 1–2 days after Google verifies the payment" (decision 11):**
1. **Billing:** set it up as soon as the domain is verified. That ends the trial, starts the paid plan and lets Google verify the payment.
2. **While Google verifies:** do §1 (production Apps Script), §3 (info@ group) and §4 Day-0 DNS. None of these need the paid plan.
3. **Plan:** start on the **Flexible Plan** (monthly; seats can go up and down) for the first month while the 5 staff accounts settle in.
   - Switch to **Annual/Fixed-Term** once 6 seats is stable (cheaper; seats can't go down until renewal).
   - Flexible → Annual is allowed at any time.
- ✅ **Billing:** Admin → Billing → Subscriptions shows "Business Standard — Active", not "Trial".
- ✅ **Quota:** `checkEmailSettings` shows the full MailApp quota (re-check the next day; the quota resets every 24 h).

---

## 6. Go-live checklist, smoke test, rollback

### 6.1 Order of work

| # | Step | Who | ✅ |
|---|---|---|---|
| 1 | ~~Plan approved, questions answered~~ | 🧑 | Done 23 Nov |
| 2 | ~~Build work on `launch-prod`, pushed to both mirrors; Apps Script changes on staging~~ | 🤖 | Done 23 Nov |
| 3 | Drag `public/` to Netlify (staging: noindex, 404, info@, hero image) | 🧑 | `check-live.js --staging` |
| 4 | Staging: run `setupEliteGlobal` once (applies the staff protection to the staging tracker), then try an edit as a non-owner if you like | 🧑 | Log shows "Staff access: …" |
| 5 | Workspace: verify the domain, set up billing, 2SV, `Staff` org unit + sharing settings, Apps Script API, info@ group | 🧑 | §1.1, §3, §5 |
| 6 | DNS Day 0: verification, MX, SPF, Google DKIM, DMARC | 🧑 | §4 |
| 7 | Production Apps Script: project, `clasp login --user prod`, properties, push, setup, deploy | 🧑 + 🤖 | §1 |
| 8 | Fill `deploy/production.json`, build the release, check it, QA on it, give you the zip | 🤖 | §2.1 |
| 9 | Upload to `public_html` | 🧑 | `check-live.js` |
| 10 | `sendEmailSamples` on production (to admin@) | 🧑 | Logo from elitetravelng.com; SPF/DKIM/DMARC PASS |
| 11 | Smoke test (6.2) + `previewTestData` + `cleanupTestData` | 🧑 | 6.2 |
| 12 | Staff accounts + shares (§7) | 🧑 | §7 checks |
| 13 | Go live: announce; update the Instagram/WhatsApp links | 🧑 | First real lead in the tracker |
| 14 | Merge `launch-prod` → `main` (no force), push both mirrors, delete the branch | 🤖 | ls-remote |
| 15 | Later: Brevo domain + paid plan → `EMAIL_PROVIDER=brevo` | 🧑 + 🤖 | §4 |
| 16 | After a week: `hstsMaxAge` 31536000 + a new release; later DMARC → quarantine | 🤖 + 🧑 | Headers / reports |

### 6.2 Smoke test (🧑, on production, once)
- **Your details:** use **your own real email address** (the bypass is off, so a real code arrives) and names starting with **`TEST `**, capital letters and a space.
- **Files:** use the SPECIMEN files from `tools/qa/fixtures/`. No real passports.

1. **Contact form** → `TEST Contact`.
   - ✅ Lead ID shown, a tracker row, a staff alert at admin@.
2. **Customise** → `TEST Customise`, through the email code.
   - ✅ Lead ID, a Custom Requests row, a confirmation email (inbox, not spam; logo; Reply-To info@), a staff alert.
3. **Visa**, 1 passenger, SPECIMEN passport + photo → `TEST Visa`.
   - ✅ Lead ID, the Visa Applications row, the Drive folder `01 – TEST …`, the "under review" email, a staff alert.
4. **Track page:** reference + email → ✅ "Under review".
5. **Status email:** in the tracker, set Review Status → *Verified*.
   - ✅ The status email arrives 5–10 min later.
   - ✅ A reply to it reaches info@.
6. **Optional — visa delivery:** `testApproveVisa` is staging-only and refuses on production, so do it by hand.
   - Upload a generated SPECIMEN visa PDF (🤖 makes one in `release/smoke/`, from `Specimen.gs`) into the TEST lead's
     `Approved Visa` folder, then set Review Status → *Visa Approved*.
   - ✅ The Visa Approved email arrives 5–10 min later with the attachment (ATTACH_VISA on), and Track → Download works.
7. **Clean-up:**
   - Run **`previewTestData`**. It changes nothing and lists the matching Lead IDs only. ✅ Exactly your 3 TEST leads.
   - Then run **`cleanupTestData`**. ✅ The 3 leads are gone from every tab, the folder is in admin@'s Drive bin (empty it), and the Email Log has no TEST rows.
8. 🤖 **Last check:** `check-live.js` once more, then you announce.

### 6.3 Rollback plan

| Problem | Rollback | Time |
|---|---|---|
| Bad website release | Upload the **previous release zip** (Extract, overwrite) | ~5 min |
| Bad Apps Script version | `prod-clasp deployments` → `prod-clasp update-deployment <prod id> -V <previous version>` (same `/exec`); or editor → Deploy → Manage deployments → ✏️ → previous version | ~2 min |
| Need to stop new leads (web app trouble, maintenance) | Run **`pauseForms`**. New contact, customise, visa and code requests then get *"We're updating our online system for a short while…"*, and the website adds the WhatsApp/phone/email links. Uploads, corrections, Track and downloads already under way keep working. `checkEmailSettings` and the health check show it. **`resumeForms`** opens them again | ~1 min |
| Emails failing or going to spam | Switch `EMAIL_PROVIDER` (brevo ↔ mailapp). Queued emails go out by `runEmailJobs`; nothing is lost | ~1 min |
| DNS mistake (mail) | Restore from the Day-0 screenshot (TTL 300 s) | ~5–30 min |
| Wrong data in the tracker | Tracker → File → Version history → restore, or copy cells back | — |

We **never** roll production back to the staging web app (no real data on staging), and we never force-push.

---

## 7. Access rules and staff access checklist

### 7.1 Rules
- **admin@ only:**
  - the Apps Script project and its Script Properties;
  - the Admin console;
  - the root "Elite Global" Drive folder;
  - the Email Log;
  - the archive files;
  - the triggers.

  The project is standalone (not inside the tracker), so tracker editors never see it.
- **The tracker:** staff are **Editors**. `setupEliteGlobal` (`protectForStaff_`) protects it so that **only admin@ can edit**:
  - **Lead Tracker:** the whole sheet is protected, except the **staff working columns** (`CONFIG.STAFF_COLUMNS`). Those 17 columns are open for staff from row 2 down:

    | Group | Columns |
    |---|---|
    | Customer details | Customer Name, Phone Number, Email, Country, Departure, Adults, Children, Infants, Travel Date, Budget |
    | Lead work | Lead Status, Assigned Agent, Follow-up Notes |
    | Visa review | Message to Customer, Review Status, Correction For, Send Now |

  - **Protected for staff:**
    - the header row;
    - Lead ID, Date Received, Lead Category, Total Travellers, Drive Folder, Passengers, Lead Source;
    - **Application Status, Review Updated, Last Customer Email, Visa Files, Last Change, Emails Sent**.
  - **Whole tabs, admin@ only:** Visa Applications, Visa Passengers, Custom Requests, Contact Enquiries, System Info, **Due**, **Archive Index**. Staff can read them but not edit them.
  - These are real protections, not warnings. The web app and the triggers run as admin@, so they are not affected.
  - When the grid grows, the open staff columns grow with it.
  - Tabs that staff add themselves are left alone.
- **Sharing:**
  - `setupEliteGlobal` turns off **"Editors can change permissions and share"** on the tracker and the Visa Applications folder.
  - The `Staff` org unit cannot share outside the company (§1.1).
- **The Visa Applications folder:** staff are **Editors**, so they can upload approved visas into each lead's `Approved Visa` folder. They can also see the passports, which is the agreed decision.

**What this means for staff:**
- **No adding or deleting in the Lead Tracker:** staff can't insert or delete rows or columns, rename the tab, or change headers. New leads come only from the website. For a walk-in customer, staff fill in the contact form on the website.
- **Filtering:** use **Data → Filter views → Create new filter view** (each person gets their own). The shared filter row belongs to admin@.

### 7.2 Staff access checklist (🧑, after go-live step 11)
1. **Create the 5 users:** Admin console → Directory → Users → **Add new user**:
   - `muhammad@elitetravelng.com`
   - `abdulmumin@elitetravelng.com`
   - `mustapha@elitetravelng.com`
   - `hamza@elitetravelng.com`
   - `abdul@elitetravelng.com`
   - Put each one in the **`Staff`** org unit.
   - Security → 2-Step Verification: **enforce** it for `Staff` (allow a 1-week enrolment period).
2. **Emails:** add the users who answer customers to the **info@** group, and to `STAFF_EMAIL` if they should get the alerts. `STAFF_EMAIL` is comma-separated; run `checkEmailSettings` after a change.
3. **Tracker:** open the production tracker → **Share** → the 5 staff addresses → **Editor** → Send.
   - ⚙️ in the Share dialog: "Editors can change permissions and share" must be **off** (setup turns it off).
4. **Visa Applications folder:** open the folder (from System Info) → **Share** → the 5 staff addresses → **Editor**.
   - **Only** this folder, never the root "Elite Global" folder above it.
5. **Never share:** the Apps Script project, the root folder, "Elite Global – Email Log", the archive files ("Elite Global – Archive …").
6. **Check as a staff member** (incognito, signed in as one staff account):
   - ✅ **Working column:** editing Lead Status, Follow-up Notes or Review Status works.
   - ✅ **Protected column:** typing in Lead ID, Application Status or Review Updated → *"You are trying to edit a protected cell"*.
   - ✅ **Protected tab:** System Info, Due and Visa Applications are read-only.
   - ✅ **Drive links:** a lead's Drive Folder link opens. The root "Elite Global" folder does not.
   - ✅ **Apps Script:** script.google.com shows no Elite Global project.
7. **When someone leaves:** Admin console → Users → the user → **Delete**, and choose **transfer Drive files to admin@**. This keeps any approved visas they uploaded, because Drive counts those files as theirs.
   - Remove them from the info@ group and from `STAFF_EMAIL`.
