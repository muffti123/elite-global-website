# LAUNCH — production on elitetravelng.com (runbook)

Status: **plan, not built yet** (branch `launch-prod`, from `main` @ `86d2604`).
Staging stays exactly as it is: Netlify (manual drag) + the staging Apps Script (`1H510Iw…`, deployment
`AKfycbzSBOiav…`). Nothing in this runbook touches staging data or its `/exec` URL.

**Who:**
- 🧑 **You:** logins, browser clicks, hPanel, Google Admin, DNS, anything that needs a password or a code.
- 🤖 **Me:** code, builds, checks, and `clasp` commands once you have logged in.
- ✅ **Verify:** how we confirm each step before moving on.

**Hard rules that stay in force:**
- **Production data:**
  - No live QA suite (`run.js live`, `load-live.js`, `*-live.js`) against production, ever.
  - `TEST_OTP_BYPASS` is never set on production.
  - No real data on staging.
- **Logging and email:**
  - Never log email, name, code or token.
  - The only email address in code is the company one.
- **Git:** never commit `.clasp*.json` (except the example), `.clasprc.json`, `source/` or tokens. No force-push.

## Contents
- [Target picture](#target-picture)
- [1. Production Apps Script](#1-production-apps-script)
- [2. Website release for Hostinger](#2-website-release-for-hostinger)
- [3. Company email → info@elitetravelng.com](#3-company-email--infoelitetravelngcom)
- [4. DNS records in Hostinger](#4-dns-records-in-hostinger)
- [5. Google Workspace trial and plan](#5-google-workspace-trial-and-plan)
- [6. Go-live checklist, smoke test, rollback](#6-go-live-checklist-smoke-test-rollback)
- [Build work (after approval)](#build-work-after-approval)
- [Open questions](#open-questions)

---

## Target picture

| | Staging (unchanged) | Production (new) |
|---|---|---|
| Website | elite-global-staging.netlify.app (drag `public/`), **noindex** | https://elitetravelng.com on Hostinger (upload the release zip in hPanel) |
| Google account | saniabdulmumin70@gmail.com | **admin@elitetravelng.com** (Workspace Business Standard) |
| Apps Script | `1H510Iw…`, `/exec` `AKfycbzSBOiav…` | New project "Elite Global Lead System" owned by admin@, new `/exec` |
| Tracker + Drive | staging copies, TEST data only | New tracker, Drive folders, Email Log, all owned by admin@ |
| clasp | default credentials + `.clasp.json` | named user `prod` + `.clasp.prod.json` (both git-ignored) |
| Customer email | — | info@elitetravelng.com (Workspace group): Reply-To, footer, website |
| Sending | MailApp | MailApp (as admin@) → Brevo (from info@) once Brevo is verified |

The old "production" project in ENVIRONMENTS.md (`1Lhrr8…`, owned by eliteglobaltravelsng@gmail.com) is **not used**.
We leave it untouched and mark it retired in ENVIRONMENTS.md.

---

## 1. Production Apps Script

### 1.1 Prepare admin@ (🧑)
1. **Sign-in:** sign in to admin@elitetravelng.com and turn on **2-Step Verification**. This account will own passports.
2. **Admin console → Security → Access and data control → API controls:** leave Apps Script allowed (the default).
3. **Admin console → Apps → Google Workspace → Drive and Docs → Sharing settings:** sharing outside the organisation must be **ON** for admin@'s unit.
   - Without it, Google hides the web app's "Anyone" access option, and the website cannot post.
   - Files stay private, because the code never changes Drive sharing.
4. **Apps Script API:** open https://script.google.com/home/usersettings as **admin@** and set **Google Apps Script API → On**.
5. **New project:** in the same session, script.google.com → **New project** → rename it "Elite Global Lead System".
   - Project Settings → time zone **Africa/Lagos**.
   - Copy the **Script ID** and send it to me.
- ✅ The Script ID you send is not the staging one (`1H510Iw…`). I check this.

### 1.2 Separate clasp login and config (🧑 login, 🤖 config)
clasp 3.4.1 supports named credentials (`--user`) and a project file (`-P`), so staging and production never mix:
1. 🧑 Run `! clasp login --user prod` and choose **admin@elitetravelng.com** in the browser.
2. 🤖 Add `.clasp.*.json` to `.gitignore` (`.clasp.json.example` stays tracked).
3. 🤖 Create `.clasp.prod.json`: `{"scriptId":"<prod id>","rootDir":"apps-script", …}`.
4. 🤖 **Every production command takes this form:**
   ```
   clasp --user prod -P .clasp.prod.json <command>
   ```
   `tools/prod-clasp.ps1` wraps it. Before every command, the wrapper checks two things:
   - `show-authorized-user` says admin@elitetravelng.com;
   - the scriptId is not staging.

   If either fails, it refuses.

Plain `clasp push` keeps going to **staging**, as today.
- ✅ `clasp --user prod show-authorized-user` → admin@elitetravelng.com.
- ✅ `git status` shows no `.clasp.prod.json`.

### 1.3 Script Properties — set **before** setup (🧑, Project Settings → Script Properties)

| Property | Production value | Notes |
|---|---|---|
| `SITE_URL` | `https://elitetravelng.com` | No trailing slash. Email links and the email logo use it, and it blocks `TEST_OTP_BYPASS` (that needs "staging" in SITE_URL). |
| `OWNER_EMAIL` | admin@elitetravelng.com | Or run `setOwnerEmail` as admin@ (no argument = the current account). |
| `STAFF_EMAIL` | **? (question 1)** | Staff alerts + daily summary. One address or several, comma-separated. |
| `ATTACH_VISA` | `on` | The Visa Approved email attaches the visa (≤ 15 MB). |
| `EMAIL_PROVIDER` | `mailapp` | → `brevo` only after Brevo's domain is verified (§4). |
| `NOTIFY_STAFF` / `NOTIFY_CUSTOMER` | not set (= on) | |
| `BREVO_API_KEY`, `SENDER_EMAIL` | later: key, `info@elitetravelng.com` | Set when switching to Brevo; the key is never in code or docs. |
| `TEST_OTP_BYPASS` | **never** | `setTestOtpBypass` also refuses, because SITE_URL has no "staging". |

`OTP_SECRET`, `SCHEMA_VERSION`, the folder/tracker IDs and `EMAIL_LOG_ID` are created by setup. Never copy them from staging.

### 1.4 Code upload and setup
1. 🤖 **Checks:** `node tools/check-lists.js`, `node tools/gas-test/test.js` and `cd tools/qa && node run.js static` must all be green on `launch-prod`.
2. 🤖 **Upload:** `prod-clasp push`.
3. 🧑 **Setup:** in the production editor, run `setupEliteGlobal` and authorise as admin@ (Advanced → Go to … → Allow).
   - The log must end with **✅ SETUP COMPLETE**.
   - It must show no ⚠️ SITE_URL line.
4. 🧑 **Settings:** run `checkEmailSettings` and send me the log. It contains no customer data.
- ✅ **Tracker and Drive:** the tracker, Drive folder, Visa Applications folder and Email Log exist in admin@'s Drive. Their links are in the tracker's System Info tab.
- ✅ **Settings log:** SITE_URL is elitetravelng.com, the provider is mailapp, ATTACH_VISA is on, TEST_OTP_BYPASS is off, and the MailApp quota is shown.
- ✅ **Triggers** (Editor → ⏰ Triggers): exactly **4**:
  - `onTrackerEdit` (on edit, tracker);
  - `runEmailJobs` (every 5 min);
  - `runArchive` (daily, 02:00);
  - `sendDailySummary` (daily, 08:00).

  Setup never creates duplicates, so running it again must still show 4.

### 1.5 Deploy the web app
1. 🤖 **Deploy:** `prod-clasp create-deployment -d "production v1"`. This uses the manifest: execute as **the deploying user**, access **Anyone (anonymous)**.
2. 🤖 **Record:** I put the Deployment ID and the `/exec` URL in `deploy/production.json` and ENVIRONMENTS.md. They are public anyway, because the website calls them.
3. **Every later production deploy:** `prod-clasp update-deployment <prod id> -d "production vN"`, so the `/exec` URL never changes.
- ✅ **Health check:** a GET on the prod `/exec` returns `{"ok":true,…,"schema":9}`. Read-only, no data.
- ✅ **Signed out:** an incognito window opens the `/exec` URL without a Google sign-in. That proves the "Anyone" access works on Workspace.

### 1.6 Permissions for staff (🧑, later)
- **Tracker:** staff accounts get **Editor on the tracker only**.
- **Folders:** do not share the Drive folders or the Email Log (but see question 6).
- **Triggers:** they run as admin@, so staff edits still send status emails.

---

## 2. Website release for Hostinger

### 2.1 Build step — `node tools/release/build.js` (🤖 writes it; no dependencies)
**Input:** `public/` (unchanged; staging keeps using it as is) and `deploy/production.json`:
```json
{ "siteUrl": "https://elitetravelng.com", "webAppUrl": "https://script.google.com/macros/s/<prod id>/exec" }
```
**Output:** `release/site/` (git-ignored) and `release/elitetravelng-<yyyymmdd>-<commit>.zip`.

The build:
1. **Copies** `public/` and leaves out `_headers` (Netlify-only).
2. **`assets/js/config.js`:** replaces `webAppUrl` with the production URL. It stops if the staging deployment ID is still present anywhere.
3. **Each HTML page:**
   - **Canonical and og:url:**
     - `<link rel="canonical">` and `og:url` on the indexable pages: `/` for index, `/apply-visa.html`, `/customize-umrah.html`.
     - `track.html` and `correct-visa.html` keep `noindex` and get no canonical.
   - **Asset versions:** every local CSS/JS link gets `?v=<commit>`, so files can be cached for a year and still update on release.
   - **CSP meta tag:** a `Content-Security-Policy` meta tag (same policy as .htaccess, without `frame-ancestors`), so local QA sees any violation as a console error.
4. **Writes:**
   - `robots.txt`: allow all and point to the sitemap.
   - `sitemap.xml`: the 3 indexable pages, `lastmod` = the release date.
   - `.htaccess`: see 2.2.
5. **Zips it** with Windows' built-in `tar -a -cf` (it includes `.htaccess`, which Explorer's "Send to → zip" can drop).

**Release check — `node tools/release/check.js` (🤖 runs it after every build; it fails on any miss):**
- **Web app URL:** it is the production one in `config.js`.
- **Nothing left from staging in `release/site`:** no `AKfycbzSBOiav…`, no `netlify`, no `eliteglobaltravelsng@gmail.com`, no `localhost`, no Google Forms and no `/edit` URLs.
- **Page tags:** canonical, robots and sitemap match the domain.
- **Zip contents:** the zip contains `.htaccess`, `404.html`, `robots.txt` and `sitemap.xml`.
- **Browser QA:** `node run.js static` against `release/site` (new `--root` option) must pass. It sends nothing, except the read-only GET health check, which now hits the production web app.

### 2.2 `.htaccess` (Hostinger runs LiteSpeed, which reads `.htaccess`)
- **Redirects:** `http://` → `https://` and `www.` → `https://elitetravelng.com`. One 301, in a single rule, so there is no redirect chain.
  - Leave hPanel's "Force HTTPS" **off**, so the two don't stack.
- **Basics:**
  - `DirectoryIndex index.html`, `Options -Indexes`.
  - Deny dotfiles and `*.map`, `*.md`, `*.zip`.
  - `ErrorDocument 404 /404.html`.
- **Caching:**

  | Files | Cache-Control |
  |---|---|
  | HTML | `no-cache` (always revalidated) |
  | CSS/JS (versioned) and fonts | `public, max-age=31536000, immutable` |
  | Images, SVG, `airports.json` | `max-age=604800` (7 days) |

  Compression (gzip/brotli) is on for text types.
- **Security headers:**
  - **HSTS:** `Strict-Transport-Security: max-age=86400` at first, raised to `31536000` after a week with no problems. No `preload` (question 8).
  - **Others:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()` (file pickers still work).
  - **Content-Security-Policy:** `default-src 'self'; script-src 'self' 'sha256-<hash of the 1-line js class script>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src https://script.google.com https://script.googleusercontent.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
    - The build computes the hash.
    - `connect-src` includes googleusercontent, because Apps Script redirects there for the reply.
    - If the hero image stays on Unsplash, `img-src` also needs `https://images.unsplash.com` (question 3).

### 2.3 404 page (🤖)
- **New `public/404.html`:** the same header and footer, "Page not found", buttons to Home, Apply for a visa and Track.
- **Paths:** absolute asset paths (`/assets/…`), so it works at any depth.
- **Staging:** Netlify serves it automatically too.

### 2.4 Staging gets noindex (🤖)
- **New `public/_headers`** (Netlify only, left out of the production build):
  ```
  /*
    X-Robots-Tag: noindex, nofollow
  ```
- **No robots.txt on staging:** crawlers must be able to fetch the pages to see the noindex.
- ✅ After your next Netlify drag, `curl -sI https://elite-global-staging.netlify.app/` shows the `X-Robots-Tag` header.

### 2.5 Upload to Hostinger (🧑, hPanel File Manager)
1. **Open the folder:** hPanel → Websites → elitetravelng.com → **File Manager** → `public_html`.
2. **First time only:**
   - Download a backup of whatever is there.
   - Delete Hostinger's placeholder (`default.php`, `index.php`/old files).
   - Keep nothing else unless I've checked it.
3. **Upload:** upload `elitetravelng-<date>-<commit>.zip` → right-click → **Extract** → into `public_html` (not a subfolder) → delete the zip.
4. **Hidden files:** File Manager → Settings → **Show hidden files** → confirm `.htaccess` is there.
5. **Later releases:** the same steps. Extract and overwrite. If a file was removed from the site, delete it by hand (I'll list any in the release notes).
6. **Keep the zip:** keep the previous release zip on your PC. It is the rollback.
- ✅ 🤖 **`node tools/release/check-live.js https://elitetravelng.com`** (GET/HEAD only, no form posts):
  - **Redirects:** http→https and www→apex each give a single 301.
  - **Pages:** every page returns 200 with the right canonical.
  - **Web app:** `config.js` has the production `/exec`.
  - **Headers:** the security headers and cache headers are present.
  - **Missing pages:** `/nope` returns **404** with our page.
  - **Robots and sitemap:** `robots.txt` and `sitemap.xml` are OK.
  - **TLS:** the certificate covers apex and www.
  - **Health check:** the web app GET answers `schema 9`.

---

## 3. Company email → info@elitetravelng.com

### 🤖 Code (one commit, `content(site): use info@elitetravelng.com as the company email`)
- **Company details:**
  - `public/assets/js/config.js` → `company.email`.
  - `apps-script/Config.gs` → `CONFIG.COMPANY_INFO.email`. It is the Reply-To, footer and "add us to your contacts" line in every email, and the Brevo `replyTo`.
- **Tests:** `tools/check-lists.js` already checks that the two are equal. I add a check that it is `@elitetravelng.com` and not a gmail.com address.
- **Expected values:** `tools/gas-test/test-email.js` (5 expectations), `tools/qa/site.js` (mailto link).
- **Docs:** README, PRD, CLAUDE.md hard rules ("No email address in code except the company one" → info@elitetravelng.com), ENVIRONMENTS.md.
- **Staging gets the same change,** because the code is shared. Staging emails then show Reply-To info@. That's harmless.
- ✅ `check-lists`, `gas-test`, `run.js static`, and `grep -r eliteglobaltravelsng public apps-script tools` returns nothing.

### 🧑 Workspace group info@
- **Group settings:** **Who can post: Anyone on the web.** Without it, customer replies bounce.
- **Members:** admin@ now, staff later.
- **Delivery:** each member gets every email (or use a Collaborative Inbox).
- ✅ Send a mail from a personal Gmail to info@: it arrives at admin@, and a reply goes out from the right place.

### Sender while on MailApp
- **Who sends:** MailApp always sends **from the script owner** (admin@elitetravelng.com). The name is "Elite Global World Travel & Tours" and Reply-To is info@.
- **After Brevo:** emails come **from info@** (`SENDER_EMAIL`).
- **Question 2:** do we accept admin@ as the From address until then?

---

## 4. DNS records in Hostinger (🧑 adds, 🤖 verifies with public DNS lookups)

**Where:** hPanel → Domains → elitetravelng.com → **DNS / Nameservers** → DNS records.
The domain must use Hostinger's nameservers (`ns1/ns2.dns-parking.com`). If it still uses Go54's, change that first.

**Day 0, before anything else:**
- **Screenshot** the whole zone.
- **TTL:** lower the TTL of existing MX/TXT records to 300 s.
- **Delete** Hostinger's mail defaults if present:
  - `MX` `mx1/mx2.hostinger.com`;
  - `TXT v=spf1 include:_spf.mail.hostinger.com …`;
  - `CNAME autodiscover`/`autoconfig`;
  - any Hostinger DKIM.

  Also delete Go54 leftovers. There must be **one** SPF record only. See question 4 on existing mailboxes.
- **Keep:** the website records (`A @` → the Hostinger IP, `CNAME www` → `elitetravelng.com`, or as hPanel set them).

| # | Type | Name | Value | When |
|---|---|---|---|---|
| 1 | TXT | `@` | `google-site-verification=…` (copied from Google Admin) | Day 0 → Admin: **Verify** |
| 2 | MX | `@` | `smtp.google.com`, priority **1** (Google's current single MX) | After verification |
| 3 | TXT | `@` | `v=spf1 include:_spf.google.com ~all` → once Brevo is set up: `v=spf1 include:_spf.google.com include:spf.brevo.com ~all` (only if Brevo's Domains page asks for it) | Day 0 |
| 4 | TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=…` from Admin → Apps → Gmail → **Authenticate email** → Generate (**2048-bit**) | Day 0, then **Start authentication** after ~24–48 h |
| 5 | TXT | `brevo-code` (as shown) | `brevo-code:…` | When Brevo is set up |
| 6 | CNAME | `brevo1._domainkey`, `brevo2._domainkey` | the targets Brevo shows (copy exactly) | When Brevo is set up |
| 7 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<reports address>; fo=1` (question 5) | Day 0 |

**Notes:**
- **Long TXT values:** Hostinger accepts long TXT values. Paste the DKIM key as one string, without quotes splitting it.
- **DMARC stages:** after 2–4 weeks of clean reports (Google and Brevo both pass), change to `p=quarantine; pct=25` → `p=quarantine` → `p=reject`. Each step is its own decision.

**✅ Verify:**
- 🤖 **Public DNS:** `nslookup -type=TXT elitetravelng.com 8.8.8.8`, the same for `MX`, `_dmarc` and `google._domainkey`.
- 🧑 **Google:** Google Admin shows the domain verified, Gmail active and DKIM "Authenticating email".
- 🧑 **Inbound:** a test mail from outside arrives in admin@.
- 🧑 **Outbound:** an email from the production script to a Gmail address shows `SPF: PASS`, `DKIM: PASS (elitetravelng.com)` and `DMARC: PASS` (Show original). Optional: mail-tester.com score ≥ 9.
- 🧑 **Brevo:** the domain shows **Authenticated**, and a Brevo test mail shows DKIM aligned to elitetravelng.com and DMARC PASS. Only then: `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `SENDER_EMAIL=info@elitetravelng.com`, and run `checkEmailSettings` + `sendEmailSamples`.
- **Brevo plan:** Brevo free = 300/day. At the expected volume (~3,000 emails/day at 500 applications/day) a paid plan is needed, sized for ~90k/month. MailApp on Workspace is ~1,500 recipients/day, enough for the first weeks.

---

## 5. Google Workspace trial and plan (🧑, Admin console → Billing)

**What the trial means for us** (check the exact numbers in your Admin console; Google changes them):
- **Length and seats:** the trial is usually **14 days** and capped at about **10 users**.
- **Sending limits:** Gmail and Apps Script limits are **lower for new and trial accounts**. MailApp's 1,500/day applies to paid accounts in good standing.
  - Our code already protects itself: it queues emails and keeps 20 quota units free for verification codes.
  - Check the real number with `checkEmailSettings` (remaining quota).
- **When the trial ends:** if billing isn't set up, the services are suspended, and with them the web app, the tracker and the passports. That must never happen after launch.

**Recommendation:**
1. **Seats now:** keep the trial for setup and the smoke test, with only admin@ (and staff accounts you are sure of).
2. **Before go-live:** **set up billing at least 2–3 days before go-live**. Setting it up ends the trial and starts the paid plan.
   - This must happen after the domain is verified and DKIM is on, and before you announce the site.
   - Sending limits and Drive storage are then the full ones.
3. **Plan:** start on the **Flexible Plan** (monthly, seats can go up and down) for the first month while staff accounts are added.
   - Switch to the **Annual/Fixed-Term Plan** once the seat count is stable. It is cheaper per month, but seats can't go down until renewal.
   - Flexible → Annual is allowed at any time. Annual → Flexible only at renewal.
- ✅ **Billing:** Admin → Billing → Subscriptions shows "Business Standard — Active", not "Trial".
- ✅ **Quota:** `checkEmailSettings` shows the higher MailApp quota (re-check the next day; the quota resets every 24 h).

---

## 6. Go-live checklist, smoke test, rollback

### 6.1 Order of work

| # | Step | Who | ✅ |
|---|---|---|---|
| 1 | Approve this plan + answer the questions | 🧑 | — |
| 2 | Build work on `launch-prod` (list below), commit, push both mirrors (ls-remote) | 🤖 | All checks green |
| 3 | Drag `public/` to Netlify (staging: noindex, 404, info@) | 🧑 | `X-Robots-Tag` header |
| 4 | Workspace: group info@, 2SV, sharing setting, Apps Script API | 🧑 | §1.1, §3 |
| 5 | DNS: verification, MX, SPF, Google DKIM, DMARC | 🧑 | §4 (Google part) |
| 6 | Production Apps Script: project, clasp login, properties, push, setup, deploy | 🧑 + 🤖 | §1 |
| 7 | Build the release with the production `/exec`, check it, give you the zip | 🤖 | `check.js` + static QA on the release |
| 8 | Upload to `public_html` | 🧑 | `check-live.js` |
| 9 | `sendEmailSamples` on production (to STAFF_EMAIL) | 🧑 | Logo loads from elitetravelng.com; SPF/DKIM/DMARC PASS |
| 10 | Smoke test (6.2) + clean-up | 🧑 | 6.2 |
| 11 | Billing: end the trial (≥ 2–3 days before the announcement) | 🧑 | §5 |
| 12 | Go live: announce the site; update Instagram/WhatsApp links | 🧑 | First real lead in the tracker |
| 13 | Merge `launch-prod` → `main` (no force), push both mirrors, delete the branch | 🤖 | ls-remote |
| 14 | Later: Brevo domain + paid plan → `EMAIL_PROVIDER=brevo` | 🧑 + 🤖 | §4 Brevo |
| 15 | Later: HSTS 1 year; DMARC → quarantine | 🤖 + 🧑 | Headers / reports |

### 6.2 Smoke test (🧑, on production, once)
Use **your own real email address** (the bypass is off, so a real code arrives), names starting with **`TEST `**,
and the SPECIMEN files from `tools/qa/fixtures/`. No real passports.
1. **Contact form** on the home page → `TEST Contact`.
   - ✅ Lead ID shown, a tracker row, a staff alert.
2. **Customise** → `TEST Customise`, through the email code.
   - ✅ Lead ID, a Custom Requests row, a confirmation email (inbox, not spam; the logo shows; Reply-To info@), a staff alert.
3. **Visa**, 1 passenger, SPECIMEN passport and photo → `TEST Visa`.
   - ✅ Lead ID, the Visa Applications row, the Drive folder with `01 – TEST …`, the "under review" email and a staff alert.
4. **Track page:** reference + email → ✅ "Under review".
5. **Status email:** in the tracker, set the visa lead's Review Status → *Verified*.
   - ✅ The status email arrives 5–10 minutes later.
   - ✅ A reply to it reaches info@.
6. **Optional:** run `testApproveVisa` (SPECIMEN visa).
   - ✅ The Visa Approved email has the attachment (ATTACH_VISA on), and Track → Download works.
7. **Clean-up:** run `cleanupTestData`.
   - ✅ The 3 TEST leads are gone from every tab.
   - ✅ The folder is in admin@'s Drive bin. Empty the bin for that folder.
   - ✅ The Email Log has no TEST rows.
8. **Last check:** 🤖 `check-live.js` once more, then you announce.

⚠️ **Before the smoke test, the TEST match has to be tightened.** `cleanupTestData` matches names starting with
"test" in any case (`/^\s*'?TEST/i`). On production that would also delete a real customer called **"Testimony …"**.
Build work item B6 changes it before production exists:
- **What it matches:** only names that start with `TEST` + a space, in capitals.
- **New function:** a no-argument `previewTestData` that logs the matching Lead IDs and counts only (no names), so you see what will go.

### 6.3 Rollback plan

| Problem | Rollback | Time |
|---|---|---|
| Bad website release | Upload the **previous release zip** to `public_html` (extract, overwrite) | ~5 min |
| Bad Apps Script version | `prod-clasp deployments` → `prod-clasp update-deployment <prod id> -V <previous version>` (same `/exec`). Or: editor → Deploy → Manage deployments → ✏️ → Version: previous | ~2 min |
| Web app down or broken, need to stop new leads | **Forms paused** (question 9): the Script Property `FORMS_PAUSED=on` makes every submit answer "We're updating our system — please WhatsApp us on …", and the website shows that message with the WhatsApp button. Nothing is lost half-way. | ~1 min |
| Emails failing or going to spam | Brevo → set `EMAIL_PROVIDER=mailapp` (or back). Queued emails are sent by `runEmailJobs` when fixed; nothing is lost. | ~1 min |
| DNS mistake (mail) | Restore from the Day-0 screenshot. The low TTL (300 s) makes it take effect quickly. | ~5–30 min |
| Wrong data in the tracker | Tracker → File → Version history → restore, or copy cells back. Archive files are never deleted before verification. | — |

We **never** roll production back to the staging web app (no real data on staging), and we never force-push.

---

## Build work (after approval)
Branch `launch-prod`. Each item is its own commit. Before each commit: `check-lists`, `gas-test` and static QA.
Then push to both mirrors and check them with ls-remote.

| # | Commit | Touches |
|---|---|---|
| B1 | `chore: ignore per-environment clasp files; add prod clasp wrapper` | `.gitignore`, `tools/prod-clasp.ps1`, `.clasp.json.example` comment |
| B2 | `chore(qa): refuse every live suite unless config.js points at staging` | `run.js live`, `*-live.js` (the same guard `load-live.js` already has) |
| B3 | `content(site): use info@elitetravelng.com as the company email` | §3 |
| B4 | `feat(site): add 404 page and noindex staging headers` | `public/404.html`, `public/_headers` (**public/ changes → Netlify drag**) |
| B5 | `chore: add production release build and checks` | `tools/release/{build,check,check-live}.js`, `deploy/production.json` (filled after §1.5), `run.js --root` |
| B6 | `fix(forms): only remove capital "TEST " leads; add previewTestData` | `Cleanup.gs`, gas-test |
| B7 | `feat(forms): forms-paused switch for maintenance` (if question 9 = yes) | `WebApp.gs`, `api.js`, gas-test + static QA |
| B8 | `docs: production environment and launch runbook` | `ENVIRONMENTS.md` (prod = admin@, retire `1Lhrr8…`), CLAUDE.md (Hostinger instead of cPanel, release build, prod clasp), README |

B6 and B7 change Apps Script. They go to **staging first** (`clasp push` + `update-deployment AKfycbzSBOiav…`, schema stays 9), then to production in §1.4.

---

## Open questions
1. **STAFF_EMAIL:** which address(es) get staff alerts and the daily summary? For example info@ (the whole group), or admin@ plus named staff later.
2. **From address until Brevo:** customers see **admin@elitetravelng.com** as the sender (Reply-To info@). OK for the first weeks? The alternative is sending as info@ through Gmail's "send as" alias, which needs a code change and a broader Gmail permission. I don't recommend it, because Brevo will send from info@ anyway.
3. **Hero image:** it is loaded from images.unsplash.com. Should I copy it into `assets/img/` (faster, no third party, simpler CSP)? I recommend yes.
4. **Existing mail on elitetravelng.com:** are there mailboxes at Hostinger or Go54 that anyone still uses? Switching MX to Google moves **all** incoming mail to Workspace.
5. **DMARC reports:** to which address? admin@, or a new group like dmarc@ (recommended, to keep admin@'s inbox clean).
6. **Staff access:** "tracker only" means the Drive folder links in the tracker won't open for staff. Should they get **view** access to the Visa Applications folder to check passports, or does only admin@ open them?
7. **Seats:** how many staff accounts at launch? This decides when to move from Flexible to Annual.
8. **HSTS:** start at 1 day and raise to 1 year after a week, without preload (recommended)?
9. **Forms-paused switch (B7):** build it for rollback? I recommend yes; it's small.
10. **The old Gmail address** eliteglobaltravelsng@gmail.com: should it auto-forward to info@ and/or auto-reply with the new address? Customers and old printed material have it. (That's your setting in Gmail; no code.)
11. **Go-live date:** that date sets when to end the trial (§5).
