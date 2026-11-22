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
# ⚠️ staging only, one correction round (public/ served on :3000; TEST_OTP_BYPASS on):
node correction-live.js http://localhost:3000 <chrome> fixtures create   # then run testRequestCorrection in the editor
node correction-live.js http://localhost:3000 <chrome> fixtures correct EG-VO-#####
# ⚠️ staging only, one visa-delivery round (same set-up):
node visa-live.js http://localhost:3000 <chrome> fixtures create          # then run testApproveVisa in the editor
node visa-live.js http://localhost:3000 <chrome> fixtures download EG-VO-#####
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


## Launch: domain and email (last stage — do not start before then)
Until this is done, **staging emails come from a gmail.com address and may land in Spam/Junk or Promotions** —
that is expected and is why the website tells customers to check those folders. The company domain is already
bought (registered elsewhere, not at Hostinger). At the final launch stage, in this order:

1. **Point the domain to Hostinger** — at the company that sold the domain, change its nameservers (or A/CNAME records) to the ones Hostinger shows for the website. DNS changes can take a few hours.
2. **Deploy the site on Hostinger** — upload the contents of `public/` to the website's `public_html`, turn on free SSL (HTTPS) and check every page loads on `https://` the domain.
3. **Set up the company mailbox** on the domain (e.g. `info@` the domain) in Hostinger Email, so customers can reply and the address can receive mail.
4. **Verify the domain in Brevo** — Brevo → Senders, domains & dedicated IPs → Domains → add the domain.
5. **Add the SPF, DKIM and DMARC DNS records** exactly as Brevo shows them (TXT records; SPF must also include Hostinger mail if the mailbox sends mail). Wait until Brevo shows the domain as authenticated.
6. **Script Properties** (Apps Script editor → Project Settings → Script Properties): `EMAIL_PROVIDER` = `brevo`, `BREVO_API_KEY` = a new Brevo API key, `SENDER_EMAIL` = the verified company address, `SITE_URL` = `https://` the domain (no slash at the end), `ATTACH_VISA` = `on` (company decision: the Visa Approved email attaches the visa, as on staging). Then run `checkEmailSettings`.
7. **Send test emails** — run `sendEmailSamples`, then one real application with your own email; check they arrive in the inbox (Gmail, Yahoo and Outlook), with the logo and working links.

The code needs no change for this: everything is Script Properties. Never put the API key in code, chat or documents.

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
  matching stage to the customer (PRD §3.6.1). A lead whose **Lead Status is Lost always shows "Closed"**,
  whatever its Review Status.

### Corrections the customer makes themselves (Correction For)
- To ask for a correction: set **Correction For** (dropdown: Passport photo, Passport data page, Personal details,
  Travel details, Flight ticket, Hotel booking, Other (see message)), write **Message to Customer**, then set
  **Review Status = Correction Needed**. The Correction Needed email has a gold **Fix my application** button that
  opens the Track page (reference number filled in; the customer still enters their email or phone).
- On the Track page the customer chooses **Make the correction**. We email a 6-digit code to the email address
  **on the application** (they cannot change it), then the correction page shows their answers, passengers and
  files (“Uploaded ✓ — Replace”), with the part you chose in Correction For highlighted. Email and phone cannot be
  changed there — the customer is asked to message you on WhatsApp.
- When they submit (once per correction round):
  - **Review Status changes to Correction Received** by itself (Review Updated is stamped), so the normal Correction
    Received email goes out about 5 minutes later — no extra email.
  - You get a **staff alert straight away** listing what changed, with links to the tracker row and the Drive folder.
  - **Follow-up Notes** gets one line at the end, e.g. `Correction submitted 22 Nov 2026 14:05: Passenger 1 photo
    replaced; Travel date changed.` Your own notes are kept.
  - The tracker cells, Visa Applications and Visa Passengers rows are updated.
- **Drive:** replaced files are never deleted. They move to a **Replaced <date time>** folder inside the
  application folder, named with the passenger number (`01 – photo.jpg`, or `All – hotel-booking.pdf` for a shared file);
  the new files take their place. Files uploaded for a correction that was never submitted wait in
  **Correction (pending)** and go to the Drive bin after 60 minutes (restorable for 30 days).
- Need another correction? Set Correction For / Message to Customer again and change Review Status back to
  **Correction Needed** (a new round). Correction For is left as it was after a submit, as a record.
- **Customers stay logged in on the Track page** in the same browser tab (a refresh shows the status again). It ends
  when they choose **Log out**, close the tab, after 60 minutes without activity, or after 8 hours.
- **Staging test:** `testRequestCorrection` (Run button) sets Correction Needed on the newest finished TEST visa
  lead with an @example.com email. Refused outside staging.

### Sending the approved visa (Approved Visa folder)
- **Where to put the visa:** open the application's Drive folder (Lead Tracker → Drive Folder link) → **Approved Visa**
  → upload the visa file(s): **PDF, JPG or PNG, up to 5 MB each** — one per passenger or one combined file. Every
  visa application has this folder (created when the upload finishes; `setupEliteGlobal` adds it to older ones;
  if it is missing, the system creates it the next time it checks).
- **Visa Files** (auto column) shows how many valid files are there. Files of another type (e.g. HEIC, Word) or
  over 5 MB are **ignored**, and the cell gets a note, e.g. *"1 file ignored: too large (max 5 MB) — please upload
  a smaller PDF, JPG or PNG"*. It is updated every 5 minutes while Review Status is **Visa Processing**, and for
  **Visa Approved** until the customer email has gone out; after that, when the customer opens the download.
- **Fastest order (about a minute instead of 10):**
  1. Upload the visa to **Approved Visa**.
  2. Set **Review Status = Visa Approved**.
  3. Tick **Send Now** on that row. It recounts Visa Files at once and sends the Visa Approved email straight away
     (no 5-minute wait). The box unticks itself; hover over it to read the result in its note, e.g.
     *"Sent 22 Nov 04:30 — Visa Approved, 1 file attached"* or *"Not sent — no visa file in Approved Visa"*.
  Without Send Now it still works on its own: Visa Files is recounted every 5 minutes and the email goes out
  5–10 minutes after the status change.
- **No file yet?** The Visa Approved email is **held** ("held: no visa file yet" in `checkRecentEmailJobs`, and in
  the daily summary's held list). It goes out on the next check (within 5 minutes) once a file is in Approved Visa.
- **The customer** gets the Visa Approved email with a gold **Download your visa** button (Track page, reference
  filled in). On the Track page, **Download your visa** emails a 6-digit code to the email on the application; then
  they see each file ("Visa – 1 of 2 (PDF, 240 KB)") with a Download button, for 30 minutes (Log out ends it).
  Downloads are named `EG-VO-00052 – Visa 1 of 2.pdf` (your file names are never shown). Up to 20 downloads per
  application per hour. Drive sharing is never changed and no Drive link is sent.
- **Attach the visa to the email too (optional):** Script Property **`ATTACH_VISA`** = `on` (default: off). The
  Visa Approved email then attaches the valid files. If they are over 15 MB together nothing is attached and the
  email says *"Your visa is too large to attach — please download it from the Track page."* The Email Log only
  shows "attached N files" / "not attached (…)". The Download button is in the email either way.
- **Send Now works for every Review Status** of a visa application (e.g. Correction Needed once the message is
  written). Every rule still applies: each status is emailed once, Correction Needed needs a Message to Customer,
  Visa Approved needs a visa file, TEST leads are not emailed, and the email is queued when the daily quota is used
  up. Several rows at once: select their Send Now cells and press **Space**. Ticks on other lead types are ignored.
  Normal status changes (without Send Now) keep the 5-minute undo window.
- **Recount everything now:** run **`recountVisaFiles`** in the Apps Script editor (rows at Visa Processing, or Visa
  Approved whose email has not gone out). The log lists Lead ID + count only.
- **The customer does not have to wait either:** when they look up a Visa Approved application and Visa Files is
  still 0, the Track page recounts that one folder at once, so the Download button appears as soon as the file is there.
- **The Track page updates itself** every 2 minutes while the customer has it open (paused when the tab is hidden),
  so they see a new status without refreshing. It does not keep them logged in: 60 minutes without activity still ends it.
- **Staging test:** `testApproveVisa` (Run button) puts two SPECIMEN visa PDFs (a small one and one of ~4.5 MB,
  marked "SPECIMEN — NOT A VISA") in Approved Visa of the newest finished TEST visa lead with an @example.com email
  and sets Visa Approved. Refused outside staging.

### How status emails are delivered
- **The customer email goes out about 5 minutes after the last Review Status change** (the system checks every
  5 minutes, so allow 5–10 minutes). **Changed it by mistake? Change it back within 5 minutes and nothing is sent.**
- A status is never emailed twice in a row, and Verified, Visa Processing, Visa Approved and Not Approved /
  Closed are emailed **once per application**. **Correction Needed** and **Correction Received** are emailed
  again in each new correction round (Correction Needed → Correction Received → Correction Needed again sends
  a new email with the new message).
- **Correction Needed** is only sent once **Message to Customer** says what you need (short, professional;
  the first 300 characters are used). Until then it is "held" and listed in the daily summary. Fill the message
  in and it goes out on the next check (within 5 minutes). You can also write the message first and then set
  the status. The message is also shown on the Track page.
- **Editing Message to Customer after the email was sent does not send it again** (the Track page shows the new
  text). To send a new correction email, start a new round: set Correction Received, then Correction Needed.
- To see what the system decided and why, run **checkRecentEmailJobs**: the last 20 decisions (Lead ID,
  status, sent / waiting / held / not sent, reason, time) — no addresses, names or messages.
- **Last Customer Email** (auto) shows what was last sent, e.g. `Status: Verified · 22 Nov 2026 09:05`;
  "Queued" means it will go out when the daily quota allows. Every email is in the
  **Elite Global – Email Log** spreadsheet (link in System Info / `showSystemInfo`).
- Every morning around 08:00 (Lagos) `STAFF_EMAIL` gets a **daily summary**: counts per Review Status, reviews
  waiting more than 3 days, new leads not contacted for 3 days, held emails, the email queue and the quota left.
- Every new lead also sends an instant **staff alert** to `STAFF_EMAIL` (with a link to the tracker row and,
  for visa, the Drive folder).

### Settings
Settings live in the Apps Script editor → **Project Settings** (gear icon, left) → **Script Properties** →
**Edit script properties**. Change the value, press **Save script properties**, then choose
**checkEmailSettings** in the function list at the top and press **Run** — the log shows every setting and
marks anything that is not valid with ⚠️. (The Run button cannot pass values to a function, so settings are
always changed in Script Properties.)

| Setting | Script Property | Value |
|---|---|---|
| Who gets staff alerts + the summary | `STAFF_EMAIL` | An email address; several: separate with commas. Default (empty): the script owner |
| Website address in emails | `SITE_URL` | `https://www.your-domain` (no slash at the end) — **set it on production**; default: the staging site |
| Pause staff / customer emails | `NOTIFY_STAFF` / `NOTIFY_CUSTOMER` | `off` (emails skipped while off are not sent later); delete or `on` to resume |
| Attach the visa to the Visa Approved email | `ATTACH_VISA` | `on` to attach (up to 15 MB together); `off` or empty: Download button only |
| Check everything | — | Run `checkEmailSettings` (provider, addresses, quota left, queue size; the Brevo key shows only as "set") |
| Preview every email | — | Run `sendEmailSamples` — 18 samples go to `STAFF_EMAIL` (Visa Approved three times: button only, SPECIMEN visa attached, too large) |
| Email logo | `public/assets/brand/email-logo.png`, served from the website — run `cd tools/qa && node ../build-email-logo.js` after a logo change, then deploy `public/` |

### Switching email sending to Brevo (needed for production volume)
MailApp on a gmail.com account sends ~100 emails a day; at ~500 applications a day the system needs about
3,000. Brevo's free plan is 300/day, so choose a paid plan that covers ~90,000 emails a month.
1. Create a Brevo account, add and **verify the sender** (ideally your own domain with the DNS records Brevo
   shows; a free gmail.com sender is often sent to spam).
2. Brevo → SMTP & API → **API keys** → create a key. Never paste it into code, chat or documents.
3. Apps Script editor → Project Settings → Script Properties: `BREVO_API_KEY` = the key,
   `SENDER_EMAIL` = the verified sender, `EMAIL_PROVIDER` = `brevo`.
4. Run `checkEmailSettings` and `sendEmailSamples` to check. Replies still go to the company email.
   To go back, set `EMAIL_PROVIDER` = `mailapp`.
If Brevo or the quota is unavailable, emails wait in the queue and are retried every 5 minutes; leads are
never lost. Email codes cannot wait, so customers are asked to try again or use WhatsApp.
The full launch order (domain → Hostinger → mailbox → Brevo domain → SPF/DKIM/DMARC → Script Properties → test)
is in **Launch: domain and email** below.

### Email confirmation codes (testing on staging only)
Run **enableTestOtpBypass** to let **TEST** names with **@example.com** emails use a fixed test code (no email
is sent) — staging only, refused elsewhere. Run **disableTestOtpBypass** after testing. Never on production. The same test code works for the
correction code of TEST leads with @example.com emails.
