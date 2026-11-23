# Elite Global — Product Requirements Document (PRD)

**Project:** Umrah Lead Generation System — website forms + Apps Script web app + Google Sheets/Drive
**Client:** Elite Global World Travel & Tours Ltd. (RC: 7787410)
**Developer:** Abdulmumin (independent full-stack developer)
**Document version:** 3.7 — supersedes v2.x (Google Forms) and the original *Project Handover Note*
**Last updated:** 22 November 2026 (v3.7: scale safety — archive, bursts, daily limits, System health — §3.9, §5.5; v3.6: Send Now tick box, instant recount — §3.8; v3.5: approved visa delivery + Track live updates — §3.8; v3.4: Track session + self-service corrections — §3.7; v3.3: review workflow, emails, email verification — §3.6; v3.2: Track my application — §3.5; v3.1: round 1 client feedback — §0.1)

---

## 0. What changed

| # | Before | Now (correct) |
|---|---|---|
| 1 | Owner account: `Citizenactofficial@gmail.com` (earlier `Muhammada@wakanow.com`) | **The owner account for the current environment (see docs/ENVIRONMENTS.md)** owns the script, Sheets and Drive files. Production is `eliteglobaltravelsng@gmail.com` |
| 2 | Blocked waiting on a ChatGPT Google Drive connector | **No connector needed.** A Google Apps Script in the owner account does everything |
| 3 | v2: three Google Forms, linked from the website | **v3: no Google Forms for customers.** Three forms live on our website and submit to **one Apps Script web app** |
| 4 | Google Forms with a file upload forced customers to sign in to Google | **No sign-in.** Passports and photos are uploaded on our website, one passenger at a time |
| 5 | Passports optional, up to 10 files per form | Visa application: **one card per passenger** (up to 50), passport **and** 25–50 KB photo required for each |
| 6 | Three response spreadsheets + tracker synced by `onFormSubmit` triggers | **One Central Lead Tracker** with a tab per form; the web app writes to it directly. No triggers |
| 7 | Lead Category: Visa Only, Customised Experience | **Adds "General Enquiry"** for website contact leads |
| 8 | Website: button links only | **Multi-page site**: home, `apply-visa.html`, `customize-umrah.html`, all sharing one design and one `SITE_CONFIG` |

The retired Google Forms 1–3 and their response sheets stay in Drive, **closed** by `setupEliteGlobal()`.

### 0.1 v3.1 — round 1 client feedback (20 Nov 2026)
| Area | Change |
|---|---|
| Brand | Logo lockup: SVG emblem + live text (`brand.css`, self-hosted OFL fonts); light in the header, white-and-gold in the navy footer; links home |
| Header | Labels never wrap; menu button below 1024 px; CTA **Apply for Visa** on every page; 320–1920 px |
| Motion | Scroll reveal, hover lift, "Why Choose Elite Global" carousel (6 cards); all respect `prefers-reduced-motion` |
| Content | About section rewritten around values; verified company details, Instagram; 4-person management team |
| Contact + footer | WhatsApp / Instagram / email icons, phone and address in both; footer 4 → 2 → 1 columns |
| Forms | Branded date picker (min today) and searchable comboboxes; **Departure Airport** (by country) replaces Departure City |
| Visa | Camera capture; optional Flight Ticket and Hotel Booking per passenger or shared once; passport photo guide and shape check |
| Tracker | Lead Tracker + Email, Country, Departure, Passengers, Lead Source, Application Status; new **Visa Applications** tab; Follow-up Notes staff-only |

---

## 1. Overview

### 1.1 Problem
Elite Global needs a professional web presence and a dependable way to capture Umrah enquiries and visa
applications. Every lead should land in one place where the sales and operations team can track it from
first contact to conversion. Customers must never be asked to sign in to anything.

### 1.2 Goals
1. Publish a premium, mobile-first website on the client's existing domain.
2. Capture three kinds of lead: **Visa Only** (with every passenger's passport and photo), **Customised Umrah Experience** and **General Enquiry**.
3. Store every lead in one **Central Lead Tracker** automatically, with the visa documents filed per application and passenger in Drive.
4. Keep passports and customer data private and visible only to authorised staff.
5. No paid services and no admin backend: Google Sheets is the back office.

### 1.3 Non-goals (this phase)
- Online payments or booking engine
- Customer accounts or login on the website
- CRM integration beyond Google Sheets
- Automated email/WhatsApp replies to customers (phase 2)

### 1.4 Users
| User | Need |
|---|---|
| Prospective pilgrim (mostly on mobile, often slow data) | Apply or enquire quickly, no sign-in, clear progress, nothing lost on a bad connection |
| Sales agent | See new leads immediately, update status, add notes, open a visa application's documents in one click |
| Operations / management | See the pipeline, conversion rate and lead sources |
| Developer | Build it, hand it over and maintain it |

---

## 2. System architecture

```
 Website (public/, static, no framework)                     Owner's Google account
 ┌─────────────────────────────────────────────┐            ┌──────────────────────────────────────────┐
 │ index.html ── contact box ────────────────┐ │            │ Apps Script web app  (doPost router)     │
 │ customize-umrah.html (7 steps) ───────────┤ │  POST      │  Execute as: Me · Access: Anyone         │
 │ apply-visa.html                           ├─┼──────────▶│  validate → Lead ID (lock) → write       │
 │   create → upload ×N passengers → finalize┘ │ text/plain │                │                         │
 │ assets/js/config.js → webAppUrl             │   JSON     │                ▼                         │
 └─────────────────────────────────────────────┘ ◀─────────┼─ {ok, leadId, error}                     │
                                                    JSON    │  Central Lead Tracker (Sheets)          │
                                                            │   Lead Tracker · Visa Passengers ·      │
                                                            │   Custom Requests · Contact Enquiries · │
                                                            │   System Info                           │
                                                            │  Drive: Visa Applications/<LeadID> – …/ │
                                                            │         NN – <passenger>/passport.*,    │
                                                            │                            photo.*      │
                                                            └──────────────────────────────────────────┘
```

**Platform:** static website (Netlify or cPanel) + Google Apps Script web app + Google Sheets + Google Drive,
all owned by the owner account for the current environment (see docs/ENVIRONMENTS.md), inside one private
Drive folder: **Elite Global – Lead Generation System**.

---

## 3. Website forms

### 3.1 Rules for every form
- Open to the public, **no sign-in**, works on 360 px phones.
- Labels on every field; errors appear beside the field; the first invalid field gets focus.
- The server repeats every check (§5.4). Option values must match `apps-script/Config.gs` exactly —
  `public/assets/js/lists.js` mirrors it; `node tools/check-lists.js` proves it.
- Submit buttons show "Sending…" and are disabled while sending. Submits are **not** retried
  automatically (a lost reply would create a duplicate lead); the customer can try again.
- Errors and offline: a red message with WhatsApp/phone/email fallbacks (those filled in `SITE_CONFIG`).
- Success shows the **Lead ID** (e.g. `EG-VO-00012`) and asks the customer to quote it.
- Hidden honeypot field: bots get a fake success and nothing is stored.
- Visa and customise forms: the email address is confirmed with a 6-digit code on Step 1 before the customer can continue (§3.6.4). The contact box is unchanged.

| Field | Rule |
|---|---|
| Full name | 2–100 characters |
| Phone / WhatsApp | Optional `+`, then 7–20 digits; spaces, `-` and `()` allowed. "Include your country code" |
| Email | Valid email address |
| Country of Residence | Searchable combobox: Nigeria first, then all countries A–Z, then "Other" (accents ignored when typing) |
| Departure Airport | Combobox filtered by Country of Residence. Nigeria (or no country yet): LOS, ABV, KAN, DKA, PHC, ENU, SKO, KAD, MIU, YOL, ILR, BCU, ABB, CBQ, QUO, QOW, GMO. Other countries: `airports.json` (OurAirports, public domain: scheduled service, IATA code, large airport or "International" in the name — 1,374 airports in 188 countries, 79 KB / ~26 KB gzipped, loaded on first need). Always "Other (type it)" → text 2–100 characters. Sent as the IATA code or `OTHER`; stored as e.g. "Lagos – Murtala Muhammed International Airport (LOS)" |
| Counts, nights | Whole number 0–999 (contact form travellers: 1–999) |
| Dates | Branded date picker (keyboard: arrows, PgUp/PgDn, Home/End, Enter, Esc). Today (Lagos time) or later |
| Free text | Up to 2,000 characters |

### 3.2 `apply-visa.html` — Request Umrah Visa Only
**Steps:** 1 Your Details → 2 Passengers → 3 Review & Submit → 4 Upload → success.

| Step | Fields | Required |
|---|---|---|
| 1. Your details | Full Name; Phone Number / WhatsApp Number; Email Address; Country of Residence | Yes |
| | Preferred Travel Date; Departure Airport | Yes |
| | Do you have a confirmed flight ticket? (Yes/No); Have you previously travelled to Saudi Arabia? (Yes/No) | Yes |
| | Do you currently hold a valid UK, US or Schengen visa? (Yes/No) | No |
| | Additional Information / Special Requests; How did you hear about Elite Global? | No |
| 2. Passengers | 1–50 cards. Each: **Full name as on passport**, **Category** (Adult (18+) · Child (2–17) · Infant (under 2)), **Passport biodata page**, **Passport photograph** — each with "Take photo" (phones: `capture="environment"` passport, `capture="user"` photo) and "Choose file" | All yes |
| | **Flight Ticket**, **Hotel Booking** per card (PDF/JPG/PNG, "recommended ≤ 2 MB", images compressed); "Use this file for all passengers" stores one file per application | No |
| 3. Review | Lead summary, passenger list with counts, **consent** checkbox | Consent yes |

**Passenger cards:** "Select all passports" (multi-file, also drag & drop) creates one card per file,
filling empty cards first; "+ Add passenger" adds an empty card; each card can be removed. Previews are
small thumbnails behind object URLs, revoked when a card or file is removed/replaced and after success.
All answers and files stay in the page, so Back/Next and "Edit" never lose anything. The browser warns
before leaving while there is unsaved input or an upload is running.

**Files (checked by their real first bytes, not the file name):**
| File | Accepted | Rule |
|---|---|---|
| Passport | PDF, JPG, PNG | PDF ≤ 5 MB, sent unchanged. Images > 1.5 MB are re-encoded in the browser to ~1 MB JPEG (long side ≤ 2400 px) when sent |
| Photo | JPG, PNG. **Blocked only if landscape (wider than tall) or smaller than 200 × 250 px** — friendly message and the photo guide opens. Everything else is accepted; a square photo or a portrait ratio outside 0.70–0.85 shows a non-blocking tip under the photo ("Tip: a passport photo is usually 35 × 45 mm (head and shoulders, plain white background).") and the guide stays closed (v3.2.1, client feedback: real 251 × 342 exports were refused) | **25–50 KB.** Under 25 KB → rejected ("choose a clearer photo"). 25–50 KB → kept as is. Over 50 KB → compressed in the browser (JPEG quality search, then −15 % dimensions, repeat) into range; the final size is shown |
| Flight ticket / hotel booking | PDF, JPG, PNG | Optional. PDF ≤ 5 MB sent unchanged; images > 1.5 MB re-encoded to ~1 MB JPEG |
| Anything else (e.g. a text file renamed `.jpg`) | — | Rejected with a friendly message |

**Photo guide** (collapsible, Passengers step): drawn SVG head-and-shoulders example at 35 × 45 mm, ✓/✗
examples (selfie, full body, busy background, landscape) and the rules: recent, plain white background,
face centred and looking at the camera, no selfies, no full-body shots.

**Upload flow:** `createVisaApplication` (lead + passenger names/categories) → Lead ID + token →
`uploadDocument` for shared documents, then `uploadPassenger` (+ `uploadDocument` for that passenger's own documents) once per passenger, in order, with a progress bar; network errors or "busy" replies are
retried 3 times with back-off, then a **Retry** button appears for that passenger (re-uploading replaces
the files — no duplicates) → `finalizeVisaApplication` → success screen with the Lead ID and passenger count.

**Confirmation:** Thank you for choosing Elite Global World Travel & Tours Ltd. Your Umrah visa application
has been received with *N passengers*. Our team will review your documents and contact you shortly.

### 3.3 `customize-umrah.html` — Customize My Umrah Experience
Same questions, options and sections as the former Form 2; **no uploads**. Seven steps with a progress
indicator; each step validates before Next; step 7 is a review with "Edit" links.

| Step | Question | Type | Required |
|---|---|---|---|
| 1. Personal Information | Full Name; Phone Number / WhatsApp Number; Email Address; Country of Residence | As §3.1 | Yes |
| 2. Traveller and Travel Information | Number of Adults (18+) / Children (2–17) / Infants (below 2) | Whole number ≥ 0, total ≥ 1 | Yes |
| | Preferred Departure Airport | Combobox by country + "Other (type it)" (§3.1) | Yes |
| | Preferred Travel Date | Date | Yes |
| | Do you have a confirmed flight ticket? | Yes / No | Yes |
| | Preferred Arrival City in Saudi Arabia | Madinah / Jeddah / No preference | Yes |
| 3. Accommodation Preferences | Preferred Duration in Madinah (nights); in Makkah (nights) | Whole number ≥ 0 | Yes |
| | Preferred Hotel Category | 3-star, 4-star, 5-star, Luxury / Premium, No preference | Yes |
| | Preferred Distance from Haram | Walking distance, Close / short walk, Shuttle service, No preference | Yes |
| | Preferred Hotel | Short answer | No |
| 4. Additional Services Required | Which services do you require? | Checkboxes: Umrah Visa Processing, International Flight Ticket, Hotel Accommodation in Makkah, Hotel Accommodation in Madinah, Airport Transfers, Makkah–Madinah Transportation, Ziyarah / Religious Tours, Complete Umrah Package, Other (text required when ticked) | No |
| 5. Visa and Budget Preferences | Do you require Umrah visa assistance? | Yes / No / I already have my visa | Yes |
| | What is your estimated budget per person? | Below ₦1,000,000 · ₦1,000,000 – ₦2,000,000 · ₦2,000,000 – ₦3,000,000 · ₦3,000,000 – ₦5,000,000 · Above ₦5,000,000 · I need guidance on the budget | Yes |
| 6. Travel Experience, Special Requests, Lead Source | Preferred Travel Experience (Economy / Budget-friendly, Standard / Comfortable, Premium, Luxury, No preference); Preferred Hotel or Airline; Special Requests / Additional Information; How did you hear about Elite Global? (Website, Instagram, Facebook, WhatsApp, Referral, Travel Agent, Other) | | No |
| 7. Review & Submit | All answers, "Edit" per group | | |

**Confirmation:** Thank you for choosing Elite Global World Travel & Tours Ltd. Your customised Umrah enquiry
has been successfully received. Your reference number is *EG-CE-…*. Our travel consultants will review your
preferences and contact you to discuss the best arrangements for your journey.

### 3.5 `track.html` — Track my application (v3.2)
A public page (`noindex`) where a customer checks progress with the **reference number** (EG-VO/CE/GE-#####,
case-insensitive, trimmed) and the **email or phone number used on the application**. `track.html?id=EG-VO-00012`
prefills the reference; the email/phone is only ever sent in the POST body, never in a URL. Linked from the
header menu and footer ("Track Application") on every page and from all three success screens
("Track this application" → `track.html?id=<Lead ID>`).

**Matching:** email case-insensitive against the lead's Email; phone by digits, with `0XXXXXXXXXX`, `+234 XXX…`,
`234…` and `00234…` treated as the same Nigerian number (fewer than 7 digits never match). General enquiries
have no email, so they match by phone only.

**Privacy:** an unknown reference, a wrong email/phone, a malformed reference, a rate limit and the honeypot
all return the **same** message — *"We couldn't find an application with those details. Please check your
reference number and the email or phone number you used."* — so references cannot be guessed. Limits:
**5 lookups per reference and 20 per email/phone value per 10 minutes** (hashed keys in CacheService). The reply
contains only: reference, service type, date received (date only), customer stage, description, next step, the
staff *Message to Customer* (plain text, max 300 characters), for visa applications the upload line, the session
token and `canCorrect` (§3.7). Never
name, phone, email, passport data, answers, Drive links, notes or the assigned agent. The contact is never logged.

**Customer stages** (approved; `CONFIG.TRACK` in `Config.gs`). Lost wins, then an expired visa upload:
| Lead Status (staff) | Stage shown | Description | Next step |
|---|---|---|---|
| New Lead (or blank) | Received | We have received your request and it is in our queue. | A member of our team will contact you shortly by phone or WhatsApp. |
| Contacted | In progress | Our team has been in touch with you about this request. | Reply to our message, or contact us if you have any questions. |
| Awaiting Response | Waiting for your reply | We are waiting for information or a reply from you. | Please reply to our last message, or contact us on WhatsApp or by phone. |
| Quotation Sent | Quotation sent | We have sent you a quotation for your request. | Please review it and let us know if you would like to go ahead. |
| Payment Pending | Awaiting payment | Your arrangements are ready to continue once payment is received. | Please complete payment as agreed with our team. Contact us if you need the details again. |
| Converted | Confirmed | Your request is confirmed. Thank you for choosing Elite Global. | Our team will keep you updated on the next steps of your journey. |
| Lost | Closed | This request is closed. | Contact us if you have questions. |
| *(visa, Application Status Expired)* | Upload not finished | Upload not finished — please contact us or apply again. | Contact us on WhatsApp or by phone, or start a new application. |

Visa upload line: `Complete: N` → "All N passengers' documents received" (1: "All documents for your 1 passenger
received"); `Uploading k/N` → "Upload not finished (k of N passengers received)"; `Expired` → "Upload not finished".
Service type: Visa only · Customised Umrah · General enquiry.

### 3.6 Review workflow, emails and email verification (v3.3)

#### 3.6.1 Review Status (visa applications)
Staff set **Review Status** in the Lead Tracker (column 23). **Lead Status stays the sales pipeline** and is
never changed by the web app. `finalizeVisaApplication` sets Review Status to **Under Review**. For visa leads a
Review Status, when set, decides the stage on the Track page (it wins over every Lead Status and Expired —
**except Lost: a Lost lead always shows "Closed"**, even when a Review Status is set):

| Review Status (staff) | Stage shown | Description | Next step |
|---|---|---|---|
| Under Review | Under review | We have received all your documents and our team is checking them. | No action needed for now. We will email you if anything needs correcting. |
| Correction Needed | **Action needed** (amber; the Message to Customer is shown first, as "What we need from you") | We need a correction or more information to continue your application. | Please read the message below, then use “Make the correction”, or contact us on WhatsApp. |
| Correction Received | Correction received | Thank you — we have received your correction and are checking it. | No action needed for now. We will update you soon. |
| Verified | Documents verified | Your documents have been checked and are ready for submission. | We will submit your visa application and keep you updated. |
| Visa Processing | Visa in processing | Your visa application has been submitted and is being processed. | Processing times vary. We will email you as soon as there is a decision. |
| Visa Approved | Visa approved | Good news — your visa has been approved. | Our team will contact you with your visa and the next steps. |
| Not Approved / Closed | Closed | This application is closed. | Please contact us if you have any questions. |

#### 3.6.2 Emails
| Email | To | When |
|---|---|---|
| Staff alert | `STAFF_EMAIL` | At once for every new lead: contact and customise at submit, visa at finalize. Lead ID, service, name, phone, email, country, travel date, passengers/travellers, a link to the tracker row and (visa) the Drive folder. No attachments |
| Confirmation | Customer | Customise at submit. Visa at finalize: **one combined "received + under review" email** (it also counts as the Under Review status email). Reference, what happens next, Track link `<SITE_URL>/track.html?id=<Lead ID>`, phone/WhatsApp/email, "check your spam folder" |
| Status update | Customer | Every Review Status change, **once the status has stayed unchanged for 5 minutes** (undo window: change it back within 5 minutes and nothing is sent); the email goes out about 5 minutes after the last status change (checked every 5 minutes). A status is never emailed twice in a row; **once per status per lead**, except Correction Needed / Correction Received, which are emailed again in each new correction round. Includes the Message to Customer. **Correction Needed is held while Message to Customer is empty** (listed in the daily summary) and is released on the next check once it is filled in (message first, then status, also works). **Editing the message after sending does not resend.** `checkRecentEmailJobs` logs the last 20 decisions (Lead ID, status, decision, reason, time; no personal data) |
| Daily summary | `STAFF_EMAIL` | ~08:00 Africa/Lagos: counts per Review Status, visa reviews unchanged for more than 3 days, new leads not contacted for more than 3 days, held emails, queue size and failures, remaining MailApp quota |
| Email code | Customer | On "Send code" (§3.6.4) |
| Error notice | `STAFF_EMAIL` | Unexpected web app error, at most one per 10 minutes, no request data |

- **Triggers** (installable, created once by `setupEliteGlobal`): `onTrackerEdit` (Review Status edits → Review Updated; message edits do not restart the wait), `runEmailJobs` (every 5 minutes: queue + status emails; runs never overlap), `sendDailySummary` (daily, 08:00 Lagos). A Review Status change the edit trigger missed is picked up by `runEmailJobs`, which starts the 5 minutes then.
- **Never blocks a lead, never sends twice:** every email is wrapped in try/catch; the result is logged (`email <kind> ok|queued|skipped|failed`, no address or name); a key such as `EG-VO-00012|status:Verified` is sent at most once (Email Log, §4.4).
- **TEST leads:** customer emails are skipped (logged "skipped") when the name starts with TEST **and** the email ends in `@example.com`; staff alerts are still sent. `emailed:false` is returned and the success screen hides "We've emailed you a confirmation".
- **Template:** one branded layout for every email — navy `#06163F` header with the logo PNG (`<SITE_URL>/assets/brand/email-logo.png`, made by `tools/build-email-logo.js`), gold `#F5AE00` accents and button, the website font stack, subject "Elite Global — …", footer with company name, RC 7787410, address, phone, WhatsApp and Instagram (as text), a Track link and "You're receiving this because you applied on our website." (staff emails: "Staff notification…"). Inline CSS, 600 px, full width on phones; **every email has a plain-text version** (MailApp `body`, Brevo `textContent`); **every customer value escaped**; sender name "Elite Global World Travel & Tours"; Reply-To = the company email.
- **Deliverability rules** (checked by `tools/gas-test`): no ALL-CAPS words or forced capitals in templates (the staff message is shown as typed), no "!!", no "urgent / free / act now"; one image only (the logo, with alt, width and height), no tracking pixels; mostly text; in customer emails the only links are `https://` links to `SITE_URL` (no shorteners). The code email and the first confirmation ask the customer to add the company email to their contacts and to mark it "Not spam". The website shows "We've emailed you. If it isn't in your inbox within 5 minutes, check Spam/Junk or Promotions and mark it 'Not spam' — or message us on WhatsApp." after Send code and on the customise / visa success screens (the Track page has the same note, starting "We email you about every update."). The contact box collects no email address, so its success message has no such note. Company details come from `CONFIG.COMPANY_INFO` (checked against `config.js` by `tools/check-lists.js`).
- `sendEmailSamples()` sends one sample of each of the 15 emails to `STAFF_EMAIL` (not logged, not de-duplicated).

#### 3.6.3 Settings (Script Properties)
| Property | Default | Notes |
|---|---|---|
| `STAFF_EMAIL` | script owner (set by setup only if empty) | One address or several, comma-separated. Invalid entries are ignored and flagged by `checkEmailSettings` |
| `SITE_URL` | `https://elite-global-staging.netlify.app` | Links and logo in emails — **set it on production**. Must be `https://…`; otherwise the default is used and flagged |
| `NOTIFY_STAFF` / `NOTIFY_CUSTOMER` | `on` | `off` stops staff alerts + summary / customer emails (skipped emails are not sent later) |
| `EMAIL_PROVIDER` | `mailapp` | `brevo` = Brevo transactional API (§3.6.5) |
| `BREVO_API_KEY`, `SENDER_EMAIL` | — | Brevo only; never in code |
| `TEST_OTP_BYPASS` | off | Staging only: run `enableTestOtpBypass` / `disableTestOtpBypass` (refused unless SITE_URL contains "staging") |

Staff change these in **Project Settings → Script Properties** (the Run button cannot pass arguments; `setStaffEmail` /
`setSiteUrl` run without arguments print these instructions), then run **`checkEmailSettings`**, which prints every
setting (the key only as "set"), flags invalid values, and shows the remaining MailApp quota and the queue size.

#### 3.6.4 Email verification (Step 1 of visa and customise)
- "Send code" next to Email → a branded email with a **6-digit code, valid 30 minutes**. Resend after **60 s**; **5 codes per hour per email**; 300 per hour in total. **5 wrong attempts** → "Please request a new code". Only a salted hash of the code is stored (CacheService). The code email contains no text typed by the visitor.
- A correct code shows **"Email confirmed ✓"** and returns a **verified-email token valid 24 h** (`<expiry>.<sha256(email)>.<HMAC>`). The website keeps it in **sessionStorage** with a hash of the email — never the email. Changing the email resets the confirmation; Next on Step 1 is blocked until it is confirmed.
- `createVisaApplication` and `submitCustomRequest` refuse a missing, expired, tampered or other-email token with `reverify:true`; the form returns to Step 1.
- Messages mention the spam folder and offer WhatsApp/phone/email. A code that cannot be sent (quota/provider) is never queued: the customer is asked to try again or use WhatsApp.
- `TEST_OTP_BYPASS=on` (staging, `enableTestOtpBypass`): TEST names with `@example.com` emails get no email and use the fixed test code (QA only).

#### 3.6.5 Volume and provider
~500 applications/day ≈ **3,000 emails/day** (codes, staff alerts, confirmations, ~3 status emails per visa). MailApp on a gmail.com account allows ~100 recipients/day, so **production must use Brevo** on a paid plan (the free plan is 300/day). Switching is a Script Property change (`EMAIL_PROVIDER=brevo` + key + verified sender); nothing in the code changes. With MailApp, normal emails stop at the last 20 quota units so codes can still be sent; the rest waits in the queue.

### 3.7 Track session and self-service corrections (v3.4)
**Track session.** A successful lookup also returns a **session token** `<idle expiry>.<max expiry>.<Lead ID>.<HMAC>`
(HMAC-SHA256 with `OTP_SECRET`; no email or phone inside). The page keeps only the token and the time of the last
activity in **sessionStorage** (this tab): a refresh or reopening in the same tab looks the application up with
`trackApplication {session}` — no contact check — and shows the status again. It ends on **Log out** (button on the
status view; `endTrackSession` revokes every token of that session), when the tab is closed, after **60 minutes
without activity** (sliding: every lookup returns a fresh token; activity on the page refreshes it quietly when less
than 30 minutes are left) or after **8 hours** at most. An ended session shows the lookup form with *"Please look up
your application again."* Session lookups have their own limit (**30 per Lead ID per 10 minutes**); a tampered,
expired, logged-out or other-lead token gets the same not-found reply as §3.5. The token is never logged.

**Staff side.** Lead Tracker column **Correction For** (dropdown, schema 6): Passport photo · Passport data page ·
Personal details · Travel details · Flight ticket · Hotel booking · Other (see message). With Review Status
**Correction Needed**, the email has a gold **Fix my application** button → `<SITE_URL>/track.html?id=<Lead ID>`
(no token, email or phone in the URL); the customer still enters their email or phone to log in.

**Customer side.**
- The Track page shows **Make the correction** only when the server says `canCorrect`: a visa lead, not Lost,
  Review Status Correction Needed (one correction round = the Review Updated time of that status).
- **Step-up check:** `sendCorrectionCode {session}` emails a code to the email **on the application** (the reply
  shows it masked, e.g. `a•••@g•••.com`); same rules as §3.6.4 (30 min, resend after 60 s, 5 per hour, global cap,
  5 attempts), in its own code scope. `verifyCorrectionCode {session, code}` → a **correction token** valid
  60 minutes, bound to the Lead ID and the round, **used once** (at submit). Staging: `TEST_OTP_BYPASS` covers TEST
  leads with @example.com emails (checked against the stored name and email).
- **`correct-visa.html`** (same brand, `noindex`; the token is in sessionStorage, never in the URL): the staff message
  at the top, the part from Correction For highlighted, the answers (name, country, travel date, departure airport,
  Yes/No questions, additional information), every passenger (name, category) and every file as **"Uploaded ✓ —
  Replace"** (optional flight ticket / hotel booking: "No file — Add file"). The old files are never sent to the
  browser (`loadCorrection` returns their file type only). **Email and phone are not editable** — "To change your
  email or phone, contact us on WhatsApp". The number of passengers cannot change.
- Replacements follow the application rules (§3.2): photo checks and 25–50 KB compression on the device, passport
  and document type/size rules, one file per request (`uploadCorrectionFile`) with Retry; they wait in
  `Correction (pending)` in the lead's folder.
- **`submitCorrection`** (only while Review Status is still Correction Needed; once per round; under the lock): old
  files move to `Replaced <d MMM yyyy HH:mm>/` in the lead's folder (renamed `NN – file`, `All – file` for shared
  documents; **never deleted**), the new files take their place; Visa Passengers, Visa Applications and the Lead Tracker
  are updated (counts follow the categories); Follow-up Notes gets the line *"Correction submitted <date>: <what
  changed>."* (staff text kept); Review Status → **Correction Received** with Review Updated stamped, so the normal
  Correction Received email follows (no extra customer email); an **immediate staff alert** lists what changed, with
  links to the row and the folder. "Nothing changed" is refused.
- Success: *"Thank you — your correction has been received."* → back to the Track page (same session), now showing
  Correction received.
- Unfinished corrections: the pending folder goes to the **Drive bin** (restorable) when the token expires —
  `runEmailJobs`, `cleanupTestData` and `setupEliteGlobal` clean up. Original files are never touched.
- Staging only: `testRequestCorrection` (no arguments) sets Correction Needed on the newest finished TEST visa lead
  with an @example.com email and logs its Lead ID only; refused unless SITE_URL is staging.

### 3.8 Approved visa delivery and Track live updates (v3.5)
**Staff side.** Every visa lead folder has an `Approved Visa/` subfolder (created at finalize; `setupEliteGlobal` adds it
to existing leads, budgeted and resumable; created on demand when missing). Staff upload the visa there: **PDF, JPG or
PNG, max 5 MB each** (one per passenger or one combined). Lead Tracker column **Visa Files** (auto, schema 7) = the
number of valid files; other types or bigger files are ignored and the cell note says why (*"1 file ignored: too large
(max 5 MB) — please upload a smaller PDF, JPG or PNG"*). `runEmailJobs` refreshes it only for rows that need it:
Review Status **Visa Processing**, or **Visa Approved** whose email has not gone out yet (held or waiting). After the
email it is recounted when the customer opens the download (and by `setupEliteGlobal`).

**Send Now (v3.6, schema 8).** Lead Tracker tick-box column **Send Now**, handled by the existing installable
`onTrackerEdit` (no new permissions; a tracker menu is not possible because the script is not bound to the
tracker). Ticking it on a visa row (several rows: select + Space; max 50 per edit) recounts Visa Files for that row,
then sends the current Review Status email **at once**, skipping only the 5-minute undo wait — every other rule is
kept (once per status / round, Correction Needed needs a message, Visa Approved needs Visa Files > 0, TEST @example.com
skipped, queued without quota). It never runs at the same time as `runEmailJobs` (waits up to ~40 s, otherwise
"tick again in a minute"). The box is unticked and its **note** shows the result (*"Sent 22 Nov 04:30 — Visa Approved,
1 file attached"*, *"Not sent — no visa file in Approved Visa"* …); a toast is best-effort; the decision is kept for
`checkRecentEmailJobs`. Ticks on non-visa rows: unticked + note. Logs: Lead ID + result only. Normal status
changes keep the 5-minute undo window. `recountVisaFiles` (Run button) recounts every Visa Processing /
Visa-Approved-not-yet-emailed row (logs Lead ID + count). **Instant recount on the Track page:** a lookup of a Visa
Approved lead whose Visa Files is 0 recounts that one folder at once, so the Download button appears without waiting.

**Held email.** Visa Approved with Visa Files = 0 → the customer email is **held** ("no visa file yet"), listed in
`checkRecentEmailJobs` and in the daily summary; it is sent on the first check after a file is there.

**Visa Approved email.** Always a gold **Download your visa** button → `<SITE_URL>/track.html?id=<Lead ID>` (no
token, email or phone). Script Property **`ATTACH_VISA`** (default off; shown by `checkEmailSettings`): on → the valid
files are attached (MailApp and Brevo), read from Drive when the email is delivered (also from the queue — the queue
never holds file contents). Over **15 MB** together → nothing attached and *"Your visa is too large to attach — please
download it from the Track page."* The Email Log shows only "attached N files" / "not attached (…)".

**Customer side (Track page).**
- **Download your visa** appears only when `canDownload`: visa lead, not Lost, Review Status Visa Approved, Visa
  Files > 0. The next step reads *"Download your visa with the button below. Our team will also contact you about the
  next steps."*
- **Step-up check** like §3.7: `sendVisaCode {session}` → code to the email **on the application** (masked);
  `verifyVisaCode {session, code}` → a **download token** `<expiry>.<session max>.<Lead ID>.<HMAC>`, 30 minutes,
  several downloads, ended by **Log out** (the session revocation also covers it) — plus the file list. Own code scope
  `visa|<Lead ID>|<email>`: a Step 1 or correction code can never open a download, and the other way round. The
  token is kept in page memory only (never sessionStorage or a URL) and never logged.
- The list shows each file as *"Visa – 1 of 2 (PDF, 240 KB)"* with a Download button (`ref` = an HMAC of the file,
  never the Drive ID). `downloadVisaFile {dtoken, ref}` returns the bytes as base64 through the web app with a neutral
  name (`EG-VO-00052 – Visa 1 of 2.pdf`); the first bytes are checked against the type. Drive sharing is never
  changed; no Drive link is ever sent. Limit: **20 downloads per Lead ID per hour**. Logs: Lead ID + file count only.

**Live updates.** While the status is shown and the tab is visible the page calls `trackApplication {session, poll: true}`
every **2 minutes** — the reply has **no new token**, so polling is not activity (the 60-minute idle end still applies)
and stays within the 30-per-10-minutes session limit. Paused while the tab is hidden; one check when it becomes visible
again (at most every 30 s). A change (stage, description, next step, message, buttons) updates the view, is announced
in the aria-live region and shows *"Updated just now"* with a gentle highlight (none with reduced motion); *"Last
checked HH:MM"* is always shown. Failed checks stay quiet; after 3 in a row *"We couldn't refresh — check your
connection"*. Polling stops when the session ends or on Log out.

**Staging only:** `testApproveVisa` (no arguments) puts two generated SPECIMEN PDFs (`apps-script/Specimen.gs`: small +
~4.5 MB, "SPECIMEN - NOT A VISA", no personal data) in Approved Visa of the newest finished TEST visa lead with an
@example.com email and sets Visa Approved; refused unless SITE_URL is staging; logs the Lead ID only.

### 3.9 Scale safety: archive, bursts, daily limits (v3.7)
Target: ~500 applications/day with bursts of ~50 in a few minutes, for years, on Apps Script + Sheets + Drive.
Production is Google Workspace; the code stays inside the stricter gmail.com limits too (§5.5).

**Growth (500 leads/day: 300 visa × 2.5 passengers, 125 customise, 75 contact).** Google counts every cell of every
tab's grid (empty ones too) towards 10 million per spreadsheet.

| Tab (columns) | Rows / year | Cells / year |
|---|---|---|
| Lead Tracker (30) | 182,500 | 5.5 M |
| Visa Applications (20) | 109,500 | 2.2 M |
| Visa Passengers (10) | 273,750 | 2.7 M |
| Custom Requests (25) | 45,625 | 1.1 M |
| Contact Enquiries (8) | 27,375 | 0.2 M |
| **Tracker spreadsheet, no archive** | | **≈ 11.7 M → the limit after ~10 months** (all-visa mix: ~9 months); slow for staff from ~50–100k rows (month 4–6) |
| Email Log (7), 90 days kept | ~270k rows at ~3,000 emails/day | ≈ 1.9 M, steady |
| Archive Index (4) | 182,500 | 0.73 M / year (70 % of the limit together with the live tabs after ~6 years) |

**Archive** (`Archive.gs`). Trigger `runArchive` daily ~02:00 Lagos: works on the 1st of each month and continues
nightly until done (`ARCHIVE_PENDING`); `archiveNow` runs it at once. Finished leads (Lead Status Converted / Lost,
or Review Status Visa Approved / Not Approved / Closed) move **90 days after their Last Change** (new auto column, schema
9: stamped by staff edits and web-app writes; empty → the newest of Review Updated / Date Received) to
`Elite Global – Archive <YYYY>-Q<n>` (quarter of Date Received; folder `Archive/`; same tabs and columns).
Never moved: an email still to go out, a Due row, an Email Queue row, an upload or correction in progress, a ticked Send
Now. Per batch (≤ 200 leads, contiguous rows, under the lock): copy every row of the lead (tracker + detail tabs;
HYPERLINK formulas kept, other formulas as values, formula-looking text kept as text) → read back and compare → Archive
Index row (Lead ID, date, link, spreadsheet ID; tab in the tracker) → delete from the live tabs bottom-up, each block
re-checked by Lead ID. Any stop is safe: a lead already in the archive is compared and rewritten in place, never copied
twice. The tracker keeps ≥ 2,000 pre-formatted rows. Unfinished leads unchanged for 365 days are listed in the daily
summary as **"please close"** (never archived automatically). The Track page finds archived leads through the Archive
Index (read-only: no correction, no writes; the visa download still works — Drive folders never move).

**Bursts.** The script lock is held only for Lead ID numbers, submission-key claims, state and row writes (Drive work,
emails and file moves outside it — `submitCorrection` now moves files between two short locks and records each move, so
an interrupted submit resumes without moving anything twice). **Creating a lead** holds the lock only for the sid
claim, the Lead ID and one tracker row (a 2-row read that checks the stored next row — the row above holds a Lead ID, the
row itself is empty — and one row write, plus one property write); the header is read and the detail-tab row is
appended (`appendRow`, one atomic call) outside it. Visa create keeps two tiny locks (claim + Lead ID; then the row once
the Drive folder exists, so a Drive failure never leaves a row without a folder). If the stored next row does not check
out (staff sorted or deleted rows, the archive or clean-up ran) the lock is released, the row after the last Lead ID is
found **outside the lock** with one Ctrl+↑ lookup (`getNextDataCell`, logged "next row fallback", counted in System
health) and the lock is taken again — column A is never scanned under the lock. Upload and finalize keep their tracker
cell writes under the lock: they write into an existing row, whose position can shift when the archive or clean-up
deletes rows (both under the lock). Every hold is timed (log line "lock <action> held N ms", System health "Script
lock"; staging load tests read the numbers with `qaTiming`). The lock wait is 20 s; then the reply is
`{ok:false, busy:true}`. Google errors that mean "busy" (lock timeout, service invoked too many times, temporary
Sheets/Drive errors) also answer busy — JSON, no error email — and are counted for System health. The website
(`api.js`) retries busy replies, non-JSON replies (Google's overload page), HTTP 429/5xx and — for actions safe to
repeat — network errors after 2, 5, 10, 20, 30 and 30 s (±30 % jitter, ~97 s in all; uploads keep their own retry loop
for network errors and never re-run the busy wait), showing *"We're busy — still sending, please keep this
page open"*. **No duplicates:** contact, customise, visa create and correction submit carry a submission key `sid`
(random; the same for every retry and for a re-click with the same answers, 6 h). The server claims it inside the same
lock as the Lead ID and stores the reply (CacheService, 6 h): a retry gets the first reply (same Lead ID, same upload
token), a retry while the first is still running gets busy. Email-code actions are never repeated automatically.
Lead IDs stay unique (one counter, under the lock); a number taken by a request that then failed is a gap.
**Lookups:** a cached Lead ID → row (CacheService) is checked against column A before use (staff sort/delete rows, the
archive deletes them) and falls back to TextFinder; the next tracker row comes from a checked stored counter (see above).
Reads of many rows always take one contiguous block (benchmark at 20,000 rows: one block 2.5 s, 8 single columns 7.7 s,
column A alone 2.5 s, TextFinder 0.07 s); the archive reads column A of each tab outside its lock and re-checks every
row by Lead ID under it (a row that moved stops the batch — nothing lost, resumed next night).

**Daily trigger time.** `runEmailJobs` (every 5 min) reads only the hidden **Due** tab (Lead ID, Due At, Reason; written
under the lock by Review Status edits, finalize, correction submits, the test helpers and the hourly scan; rows removed
when handled; waiting / held rows stay). A run with nothing due reads that tab and a queue flag and stops. The full
Lead Tracker scan runs **once an hour** as the safety net (an edit the trigger missed). The once-only email check reads
the lead's hidden **Emails Sent** cell instead of searching the Email Log. The 5-minute Visa Files recount covers only
Visa Approved rows whose email is still held. Measured on staging with `benchmarkScale` (1,000 and 20,000 synthetic
rows).

**System health** (daily summary): trigger time yesterday vs the limit (90 min gmail.com, 6 h Workspace, or
`TRIGGER_LIMIT_MIN`), emails sent vs quota (`MAIL_LIMIT` overrides), website requests, busy replies and the slowest
action, tracker and Email Log cells vs 10 M, tracker rows, Due rows, queue size, the last archive run — ⚠️ at 70 % of a
limit. Records: Script Property `HEALTH_<date>` (< 1 KB, 8 days), best-effort counts without a lock.

**Load test** (`tools/qa/load-live.js`, staging only, TEST_OTP_BYPASS on): N simultaneous customers (default 25, max 50) —
contact, customise and visa with a SPECIMEN upload — with the website's retry rules; reports success rate, busy
retries, p50/p95 and duplicates (must be 0; counted by the staging-only action `loadTestReport`, counts only). "TEST
Load" names send no staff alert (gmail.com's 100 emails a day).

### 3.4 Contact box on `index.html`
| Field | Type | Required |
|---|---|---|
| Full name | Text | Yes |
| Phone / WhatsApp | Phone | Yes |
| What would you like help with? | Request Umrah Visa Only, Customize My Umrah Experience, Hotel Accommodation, Ground Transportation, Other Travel Enquiry | Yes |
| Preferred travel date | Date | No |
| Number of travellers | Whole number 1–999 | No |
| Additional details | Paragraph | No |

Success: the form resets and shows "Your reference number is EG-GE-…".

---

## 4. Data model

### 4.1 Central Lead Tracker — `Lead Tracker` tab (one row per lead, all types)
| # | Column | Filled by | Rule |
|---|---|---|---|
| 1 | Lead ID | Auto | `EG-VO-00001` / `EG-CE-00002` / `EG-GE-00003`. One running number shared by all types |
| 2 | Date Received | Auto | `dd mmm yyyy, hh:mm` (Africa/Lagos) |
| 3 | Customer Name | Auto | Lead / main contact |
| 4 | Phone Number | Auto | Plain text (leading zeros kept) |
| 5 | Lead Category | Auto | Visa Only · Customised Experience · General Enquiry |
| 6–8 | Adults · Children · Infants | Auto | Visa: counted from passenger categories. Contact: total under Adults, flagged in notes |
| 9 | Total Travellers | Formula | `=IF(COUNT(F:H)=0,"",F+G+H)` |
| 10 | Travel Date | Auto | `dd mmm yyyy` |
| 11 | Budget | Auto | Customise: chosen band. Visa: "N/A (visa only)". Contact: blank |
| 12 | Lead Status | Staff | New Lead · Contacted · Awaiting Response · Quotation Sent · Payment Pending · Converted · Lost (colour-coded) |
| 13 | Assigned Agent | Staff | Free text |
| 14 | Follow-up Notes | **Staff only** | The web app leaves it empty (leads before v3.1 keep their old `[Auto]` text) |
| 15 | Drive Folder | Auto | Visa only: `=HYPERLINK(folder,"📁 EG-VO-…")`. Empty for other types |
| 16 | Email | Auto | Visa, customise |
| 17 | Country | Auto | Country of residence |
| 18 | Departure | Auto | Departure airport label |
| 19 | Passengers | Auto | Visa: number of passengers |
| 20 | Lead Source | Auto | How did you hear about Elite Global? |
| 21 | Application Status | Auto | Visa: `Uploading k/N` → `Complete: N passengers`, or `Expired` (24 h purge). Others: `Received` |
| 22 | Message to Customer | **Staff** | Optional short message shown to the customer on track.html (plain text, first 300 characters). Header note: "Visible to the customer on the Track page — keep it short and professional" (v3.2). Also included in status emails; required before a Correction Needed email is sent |
| 23 | Review Status | **Staff** | Visa: dropdown Under Review, Correction Needed, Correction Received, Verified, Visa Processing, Visa Approved, Not Approved / Closed. Set to Under Review at finalize; every change is emailed to the customer after 5 unchanged minutes (§3.6) (v3.3) |
| 24 | Review Updated | Auto | Time of the last Review Status / Message to Customer edit (starts the 5-minute undo window) |
| 29 | Last Change | Auto | v9 (§3.9): last staff edit or web-app write; archive age |
| 30 | Emails Sent | Auto (hidden) | v9: this lead's once-only email keys (" ; "-separated); the Email Log is never searched |
| 28 | Send Now | Staff | v8 tick box (§3.8): recount + send the current status email at once; unticks itself, result in its note |
| 27 | Visa Files | Auto | v7 (§3.8): valid files in Approved Visa (PDF/JPG/PNG ≤ 5 MB); note lists ignored files |
| 26 | Correction For | Staff | v6 dropdown (§3.7): what the customer should correct; highlighted on the correction page; kept after a submit |
| 25 | Last Customer Email | Auto | Last customer email, e.g. "Status: Verified · 22 Nov 2026 09:05", "Queued: …", "Not sent (test lead) · …" |

Columns 16–25 were appended after Drive Folder (v3.1–v3.3) and are found by header name, so existing rows,
formulas, protections and Lead IDs never move. `setupEliteGlobal()` adds them to an existing tracker and
fills **only empty cells** of earlier leads from their old `[Auto]` notes (notes are kept); running it
again changes nothing.

2,000 pre-formatted rows (500 more added automatically), frozen header and first three columns, filter on,
owner-only protection (v3.4, docs/LAUNCH.md §7): the Lead Tracker sheet is protected except the staff columns
(`CONFIG.STAFF_COLUMNS`: customer details, Lead Status, Assigned Agent, Follow-up Notes, Message to Customer, Review
Status, Correction For, Send Now); the header row, every generated column and the detail, System Info, Due and
Archive Index tabs can only be edited by the owner. Editors cannot re-share the tracker or the Visa Applications folder.

### 4.4 Email Log spreadsheet ("Elite Global – Email Log", v3.3)
A **separate** spreadsheet in the root Drive folder (ID in Script Property `EMAIL_LOG_ID`; link in System Info), created by `setupEliteGlobal`:
- **Email Log** — Time, Key (e.g. `EG-VO-00012|status:Verified`), Kind, Lead ID, Result (ok / queued / skipped / failed / unavailable), Provider, Detail. **No email addresses, names or codes.** A key that is ok, queued or skipped is never sent again. Rows older than **90 days** are removed by the daily summary.
- **Email Queue** — emails waiting for quota or the provider (address, subject, HTML, text, attempts). Sent by `runEmailJobs`; after 10 failed attempts a row stays as "gave up" and is reported in the daily summary.

`cleanupTestData` removes the rows of TEST leads from both tabs.

### 4.2 Detail tabs
| Tab | One row per | Columns |
|---|---|---|
| `Visa Applications` | visa application | Lead ID · Date Received · Full Name · Phone / WhatsApp · Email · Country · Travel Date · Departure Airport · Confirmed Flight Ticket · Travelled to Saudi Arabia Before · UK/US/Schengen Visa · Passengers · Adults · Children · Infants · Shared Flight Ticket · Shared Hotel Booking · Additional Information · How They Heard · Drive Folder |
| `Visa Passengers` | passenger | Lead ID · No. · Full Name (as on passport) · Category · Photo (KB) · Passport File (link) · Photo File (link) · Uploaded At · Flight Ticket (link) · Hotel Booking (link; "… (all passengers)" when shared) |
| `Custom Requests` | customise request | Lead ID · Date Received · every answer in §3.3 (25 columns; services joined, "Other: …" appended) |
| `Contact Enquiries` | contact message | Lead ID · Date Received · Full Name · Phone / WhatsApp · Enquiry Type · Preferred Travel Date · Number of Travellers · Additional Details |
| `System Info` | — | Owner account, Drive folder, Visa Applications folder, tracker, **web app URL**, retired forms and their real state |

Customer text that starts with `=`, `+`, `-` or `@` (other than phone numbers) is stored with a leading `'`
so it can never run as a formula.

### 4.3 Drive layout (all private, inherited from the root folder)
```
Elite Global – Lead Generation System/
├── Elite Global – Central Lead Tracker
├── Visa Applications/
│   └── EG-VO-00012 – <lead name>/
│       ├── flight-ticket.*, hotel-booking.*   (only when shared by all passengers)
│       ├── 01 – <passenger name>/  passport.pdf|jpg|png, photo.jpg|png, flight-ticket.*, hotel-booking.* (optional)
│       ├── 02 – <passenger name>/  …
│       ├── Replaced <d MMM yyyy HH:mm>/  01 – photo.jpg, All – hotel-booking.pdf …  (files replaced by a correction, §3.7)
│       ├── Correction (pending)/  replacements until submit (binned when the correction token expires)
│       └── Approved Visa/  the approved visa, uploaded by staff (PDF/JPG/PNG ≤ 5 MB each; §3.8)
└── (retired, closed) Google Forms 1–3 and their response sheets
```
File extensions follow the file's **real** type (magic bytes), never the customer's file name.

---

## 5. Web app API (`apps-script/WebApp.gs`)

### 5.1 Transport
`POST <web app /exec URL>` with a `text/plain;charset=utf-8` JSON body (a "simple" request: no CORS
preflight). Apps Script answers with a 302 to `script.googleusercontent.com`, which serves the JSON with
`Access-Control-Allow-Origin: *`. `GET` returns a health check `{"ok":true,"service":…,"version":1,"schema":9}` (schema = tracker version written by `setupEliteGlobal`: 3 = v3 columns + Visa Applications tab, 4 = Message to Customer, 5 = Review Status, Review Updated, Last Customer Email, 6 = Correction For, 7 = Visa Files + Approved Visa folders, 8 = Send Now, 9 = Last Change, Emails Sent, Due + Archive Index tabs).

Every request: `{"action": "<name>", "hp": "<honeypot>", …}` → `{"ok":true,"leadId":…}` or
`{"ok":false,"error":"<friendly>","field"?:"<name>","missing"?:[…],"reverify"?:true,"relogin"?:true,"restart"?:true,"relist"?:true}` (`relist`: the visa file list changed; `reverify`: the email must be confirmed again; `relogin`: the Track session ended; `restart`: the correction or download token ended — start again from the Track page).

### 5.2 Actions
| Action | Input | Writes | Returns |
|---|---|---|---|
| `submitContact` | name, phone, enquiryType, travelDate?, travellers?, details? | Lead Tracker + Contact Enquiries | leadId `EG-GE-…` |
| `submitCustomRequest` | all §3.3 answers (`services` is an array), `emailToken` | Lead Tracker + Custom Requests; staff alert + confirmation email | leadId `EG-CE-…`, emailed |
| `createVisaApplication` | lead fields §3.2 (`departureAirport`, `departureAirportOther`), `emailToken`, `consent:true`, `passengers:[{name, category}]` (1–50), `docs:{shared:{ticket,hotel}, passengers:[{ticket,hotel}]}` (optional) | Drive folder, Lead Tracker row (status `Uploading 0/N`), Visa Applications row, upload state | leadId `EG-VO-…`, token |
| `uploadPassenger` | leadId, token, index (1…N), name, category, `passport:{name,mime,b64}`, `photo:{mime,b64}` | `NN – name/` passport + photo (replaced on retry; documents kept), Visa Passengers row (upsert), status `Uploading k/N` | uploaded, total, photoKb |
| `uploadDocument` | leadId, token, `scope` ("all" or 1…N), `kind` (ticket/hotel), name, `file:{name,mime,b64}` | `flight-ticket.*` / `hotel-booking.*` (replaced on retry), links in Visa Passengers / Visa Applications. Only documents declared at create | scope, kind |
| `trackApplication` | leadId, contact (email or phone) — or session | nothing (read-only) | §3.5 fields + session token + canCorrect, or the generic not-found message |
| `endTrackSession` | session | revokes the session (CacheService) | ok |
| `sendCorrectionCode` | session | code hash in CacheService; code email to the stored address | masked, resendIn |
| `verifyCorrectionCode` | session, code | correction state `CORR_<LeadID>` | ctoken (60 min, single use), minutes |
| `loadCorrection` | ctoken | nothing | answers, passengers (name, category, file types), shared file types, Correction For, message, masked email |
| `uploadCorrectionFile` | ctoken, slot (0 shared, 1…N), kind (passport/photo/ticket/hotel), `file:{name,mime,b64}` | file in `Correction (pending)` (a retry replaces it) | slot, kind |
| `submitCorrection` | ctoken, answers, `passengers:[{index,name,category}]` | §3.7 submit; staff alert | leadId |
| `trackApplication` (poll) | session, `poll: true` | nothing | §3.5 fields + canCorrect/canDownload, **no new token** (§3.8) |
| `sendVisaCode` | session | code hash in CacheService (scope visa\|…); code email to the stored address | masked, resendIn |
| `verifyVisaCode` | session, code | recounts Visa Files | dtoken (30 min), minutes, `files:[{ref,label,type,kb}]` |
| `listVisaFiles` | dtoken | recounts Visa Files | files |
| `downloadVisaFile` | dtoken, ref | nothing (20 per Lead ID per hour) | name, mime, size, b64 |
| `sendEmailCode` | email, name | code hash in CacheService; code email (§3.6.4) | resendIn |
| `verifyEmailCode` | email, code | nothing | token (24 h) |
| `finalizeVisaApplication` | leadId, token | status `Complete: N passengers` (all passengers and declared documents arrived), Review Status Under Review, deletes upload state; staff alert + combined confirmation email | leadId, emailed (repeat-safe); else `missing` (0 = shared documents) |

### 5.3 Upload state
Script Property `UPLOAD_<LeadID>` = `{t: token, n: passengers, f: folderId, k: category codes, u: uploaded
indexes, c: created ms, d: declared documents (one digit per slot: 0 shared, 1…N), dd: uploaded documents,
sl: shared file links}` (~200–500 bytes). Deleted on finalize. `purgeStaleUploads_()` (run by setup and
`cleanupTestData`) deletes entries older than **24 h**; the tracker row and folder stay so sales can follow
up, and the customer is told the application expired.

### 5.4 Server-side rules
- Every client rule in §3 is re-checked; list values must match `LISTS` / `COUNTRIES` exactly.
- Files: magic bytes (`%PDF-`, `FF D8 FF`, PNG signature) must agree with the declared MIME type;
  passport PDF ≤ 5 MB, passport image ≤ 1.6 MB, photo 24–51 KB (1 KB slack), ticket/hotel PDF ≤ 5 MB and
  image ≤ 1.6 MB (one file per request), ≤ 50 passengers, body ≤ 12 MB.
- Departure airport: IATA code in the list for the chosen country (`LISTS.AIRPORTS_NG` / `AIRPORTS`), or `OTHER` + text.
- Token must match; category per passenger must match what was declared at create.
- Tracking: 5 lookups per reference and 20 per email/phone per 10 minutes; every miss looks the same (§3.5).
- Email codes: resend after 60 s, 5 per hour per email, 300 per hour in total, 5 wrong attempts per code; `createVisaApplication` / `submitCustomRequest` need a valid token for the submitted email (§3.6.4).
- Emails never fail a submission: every send is wrapped, queued when the quota/provider is unavailable, and logged without personal data (§3.6).
- Rate limit: **10 create/submit calls per 10 minutes** per email (contact form: per phone), counted in
  CacheService with a hashed key.
- `LockService` only around Lead ID + row writes + upload-state updates — never around Drive uploads.
- Logs contain action, Lead ID, sizes and error class only — **never** names, answers or file contents.
  Unexpected errors email the owner (at most one per 10 minutes) without request data.

### 5.5 Google limits the code depends on (and how it stays inside them)
Staging is a gmail.com account; production is Google Workspace. The code is built for the stricter gmail.com limits.

| Limit | gmail.com / Workspace | How the code stays inside it |
|---|---|---|
| Execution time | 6 min per call | One passenger per upload request (≈ 5–10 s); jobs stop on a time budget (email jobs 4 min, archive 4.5 min) and continue next run |
| **Simultaneous executions** | **~30 per user** — every customer runs as the owner | Short locks; Google's overload page / network errors / busy are retried by the website with backoff + jitter; submission keys make retries safe; load-tested with up to 50 at once |
| Script lock | one at a time, per script | Held only for IDs, key claims, state and row writes (create: claim + ID + one row; no column scan ever); web requests wait ≤ 20 s, then busy (the website retries for ~97 s); every hold is timed (System health ⚠️ at 70 % of the wait); the nightly archive holds it per batch of 200 (column A read outside) |
| **Script Properties** | **9 KB per value, 500 KB in total**; 50k (Workspace 500k) reads/writes per day | Only small values: counters, flags, per-application upload/correction state (~200 B, purged), health records (< 1 KB × 8 days), archive file IDs, last 20 email decisions. Anything that grows with traffic (the Due list, email keys) lives in sheets, never in properties |
| **CacheService** | **100 KB per value, max 6 h**, may be evicted | Rate counters, codes, row-number hints (always re-checked against the sheet), submission-key replies (< 1 KB, 6 h). Nothing that must survive is kept only in the cache |
| **Trigger runtime** | **90 min / day** (Workspace 6 h) | Email jobs read only the Due tab every 5 min (full scan hourly); onTrackerEdit exits at once on other tabs; archive works only on the 1st and while unfinished; measured daily in System health with ⚠️ at 70 % |
| Cells per spreadsheet | 10 million (all grids, empty cells too) | Monthly archive of finished leads; unused grid columns trimmed by setup; health warns at 70 % (§3.9) |
| MailApp | 100 recipients / day (Workspace 1,500) | Codes keep a reserve of 20; other emails queue; "TEST Load" sends no staff alerts. **Production at ~500 applications/day needs Brevo** (§3.6.5) |
| UrlFetchApp | 20k calls / day (Workspace 100k) | Only Brevo sends (one call per email) |
| Spreadsheets created | 250 / day | One archive file per quarter; the benchmark makes one temporary file |
| Request size | ~50 MB practical | Largest request ≈ 7 MB (5 MB PDF base64 + photo); visa downloads ≤ 5 MB per file (~6.7 MB base64) |
| **Drive storage** | **15 GB free, shared with Gmail/Photos** (Workspace: per plan) | ~1 MB per passenger (image passports). **Open item for production** (§12) |
| Deploying | Code goes live only when the **same** deployment gets a new version | `/exec` stays the same; new scopes need re-authorising in the editor |

---

## 6. Apps Script (deliverable)

**Folder:** `apps-script/` (pushed with `clasp push`): `Config.gs` (lists, limits, columns), `WebApp.gs`
(router), `Validate.gs`, `Leads.gs` (Lead IDs, tracker, contact + customise), `Visa.gs` (visa flow,
upload state, Drive), `Setup.gs`, `Cleanup.gs`, `appsscript.json` (V8, Africa/Lagos, web app: execute as
deploying user, access anyone).

| Function | Purpose |
|---|---|
| `setupEliteGlobal()` | **Idempotent.** Creates or reuses the root folder, `Visa Applications` folder and tracker; adds the Drive Folder column and detail tabs; keeps `LEAD_SEQ`; removes old form triggers; **closes retired Forms 1–3** if their IDs exist (custom "This form has moved. Please apply on our website." message where Google accepts it, otherwise Google's default closed message; `setPublished(false)` fallback; the real state is logged and shown in System Info); purges stale upload state; writes System Info |
| `showSystemInfo()` | Prints the folder, tracker and web app URLs and the retired forms' state |
| `previewTestData()` | Lists the Lead IDs `cleanupTestData` would remove (counts and IDs only, no names); changes nothing |
| `pauseForms()` / `resumeForms()` | Script Property `FORMS_PAUSED`: new contact / customise / visa / code requests get `{paused:true}` and a friendly message (the website adds the contact links); requests under way continue; the health check shows `paused` |
| `cleanupTestData()` | Removes every lead whose name starts with "TEST " (capitals + a space; never "Testimony …") from all four tabs, moves their visa folders to the Drive bin, deletes their upload state, purges state > 24 h, cleans retired-form responses |
| `setOwnerEmail(email?)` | Stores the expected owner for this environment (`OWNER_EMAIL`) |
| `testBackdateUpload(leadId)` | Test only: makes an unfinished application 25 h old to test the purge |
| `resetSetupFlag()` | ⚠️ Forgets every stored ID (only after deleting the Drive folder) |

**Manual steps (owner, in the browser):** run `setupEliteGlobal`, then **Deploy → New deployment → Web app**
(Execute as **Me**, Who has access **Anyone**), copy the `/exec` URL into `public/assets/js/config.js`.

---

## 7. Website requirements

### 7.1 Pages and files
| File | Purpose |
|---|---|
| `public/index.html` | Home: hero, about (values), management team (portrait cards; hidden when empty), services, why (carousel), FAQ, CTA band, contact box, footer |
| `public/apply-visa.html` | §3.2 |
| `public/track.html` | §3.5 Track my application (noindex) |
| `public/customize-umrah.html` | §3.3 |
| `public/assets/js/config.js` | **The only place to edit:** `company` (address, phone, WhatsApp, email, Instagram), `webAppUrl`, `team`. Empty values hide their element |
| `public/assets/js/*.js` | `common.js` (company details, form helpers), `api.js`, `wizard.js`, `lists.js`, `image.js`, page scripts |
| `public/assets/css/site.css`, `assets/css/brand.css`, `assets/brand/`, `assets/fonts/` | Shared navy/gold design; logo lockup (SVG emblem + live text) |
| `public/assets/data/airports.json` | Departure airports per country (generated by `tools/build-airports.js`) |

### 7.2 Calls to action
| Button (exact label) | Locations | Destination | Behaviour |
|---|---|---|---|
| Request Umrah Visa Only | Hero, CTA band, footer | `apply-visa.html` | Same tab |
| Customize My Umrah Experience | Hero, CTA band, footer | `customize-umrah.html` | Same tab |
| Apply for Visa | Header (every page) | `apply-visa.html` | Same tab |
| Contact / Speak with our team | Nav, About | `#contact` | Smooth scroll |

### 7.3 FAQ (must stay consistent with the flow)
Difference between Visa Only and Customize · Do I need my passport (yes for the visa application, no
otherwise) · How do I upload passports and photos — no sign-in, stored privately, photo 25–50 KB resized
automatically · What happens after I submit (reference number) · Families and groups (up to 50 travellers).
No mention of Google Forms or Google sign-in anywhere.

### 7.4 Quality
- Responsive from 320 px to 1920 px; no sideways scrolling on any step. Header labels never wrap; menu button below 1024 px.
- Motion: scroll reveal, hover lift, carousel — all off under `prefers-reduced-motion`.
- Accessible: labels, alt text, visible focus, step indicator with `aria-current`, live status regions.
- SEO basics per page: title, description, favicon. No frameworks, no build step, no external JS.

---

## 8. Hosting and deployment

### 8.1 Launch: domain and email (final stage)
Until this is done, staging emails are sent from a gmail.com address through MailApp and **may land in
Spam/Junk or Promotions**. The company domain is already bought (registered elsewhere, not at Hostinger). No
domain work happens before the final launch stage; then, in this order:

1. **Point the domain to Hostinger** — at the company that sold the domain, change its nameservers (or A/CNAME records) to the ones Hostinger shows for the website. DNS changes can take a few hours.
2. **Deploy the site on Hostinger** — upload the contents of `public/` to the website's `public_html`, turn on free SSL (HTTPS) and check every page loads on `https://` the domain.
3. **Set up the company mailbox** on the domain (e.g. `info@` the domain) in Hostinger Email, so customers can reply and the address can receive mail.
4. **Verify the domain in Brevo** — Brevo → Senders, domains & dedicated IPs → Domains → add the domain.
5. **Add the SPF, DKIM and DMARC DNS records** exactly as Brevo shows them (TXT records; SPF must also include Hostinger mail if the mailbox sends mail). Wait until Brevo shows the domain as authenticated.
6. **Script Properties** (Apps Script editor → Project Settings → Script Properties): `EMAIL_PROVIDER` = `brevo`, `BREVO_API_KEY` = a new Brevo API key, `SENDER_EMAIL` = the verified company address, `SITE_URL` = `https://` the domain (no slash at the end). Then run `checkEmailSettings`.
7. **Send test emails** — run `sendEmailSamples`, then one real application with your own email; check they arrive in the inbox (Gmail, Yahoo and Outlook), with the logo and working links.

Everything is Script Properties (§3.6.3); no code change. Open items 8 and 9 (§12).

| Option | When | Steps |
|---|---|---|
| **A. Production: Hostinger (elitetravelng.com)** | Chosen (v3.4) | `tools/release/build.js` → zip → hPanel File Manager → `public_html` → Extract; `.htaccess` forces https://elitetravelng.com, security + cache headers, 404 (docs/LAUNCH.md) |
| **B. GitHub (private) + Netlify** | Preview/history always; production if the host has no web space | Netlify publishes `public/` on every push → DNS records to the client's DNS team → HTTPS automatic |

The Apps Script is deployed separately with `clasp push` + a web app deployment (docs/ENVIRONMENTS.md).

---

## 9. Security and privacy
- All files are owned by the owner account for the current environment (see docs/ENVIRONMENTS.md) and stay
  private. **No real customer data or passports in staging.** Staff access by sharing with named accounts
  only, never "Anyone with the link".
- Passports and photos go straight from the customer's browser to the owner's Drive over HTTPS; nothing is
  stored on the website host. They are never made public. Apply the retention and deletion policy once a
  lead closes.
- The web app is public by design (customers have no Google account); it only accepts validated data,
  rate-limits, requires a per-application token for uploads, and never returns stored data.
- Logs never contain request bodies, names or file contents — nor email addresses, codes or tokens. The Email Log holds Lead IDs and results only.
- Email codes are stored only as a salted hash (30 min). The verified-email token holds an expiry and a hash of the email, signed with `OTP_SECRET`; the website keeps it in sessionStorage with a hash of the email, never the address.
- The code email contains no visitor-typed text, and sending is capped per email and per hour, so the form cannot be used to send spam.
- `BREVO_API_KEY` lives only in Script Properties and is never printed (`showNotifySettings` shows "set").
- The website contains no Google Forms links and no `/edit` URLs. Never put the owner password or
  verification codes in any tool, chat or document.

---

## 10. Testing and QA checklist
Run `node tools/check-lists.js` and `node tools/qa/run.js static` before every site commit;
`node tools/qa/run.js live` against **staging only** (TEST names, generated SPECIMEN files), then `cleanupTestData()`.

- [ ] `setupEliteGlobal` ✅ as the right owner; tabs, Drive Folder column, Visa Applications folder present; retired forms reported closed
- [ ] Web app `/exec` health check returns `ok:true`; System Info shows the URL
- [ ] Contact message → `EG-GE-…` shown; rows in Lead Tracker and Contact Enquiries
- [ ] One customise request (all steps, "Other" service, Back/Next) → `EG-CE-…`; full Custom Requests row
- [ ] Visa with **1**, **3** (adult/child/infant, PDF passport, PNG photo) and **12** passengers → folders `NN – name/passport.*, photo.*`, Visa Passengers rows, counts, 📁 link, `[Complete: N passengers]`
- [ ] Photo landscape / < 200 × 250 px refused with the guide opening; 251 × 342 portrait accepted; square / selfie-ratio accepted with the tip (guide stays closed)
- [ ] Departure Airport: Nigeria list, another country's list, "Other (type it)"; server rejects a code from another country
- [ ] Visa with a shared flight ticket and one passenger's hotel booking → Drive files + Visa Passengers / Visa Applications links
- [ ] `setupEliteGlobal` on the existing tracker: columns 16–21 + Visa Applications tab added, old rows/IDs unchanged, re-run changes nothing
- [ ] Photo **< 25 KB** rejected; **2 MB** photo compressed to 25–50 KB; **fake .jpg (text)** rejected — in the browser and by the server
- [ ] Forced upload failure → Retry → no duplicate row; leave-page warning during upload and with unsaved input; none after success
- [ ] Honeypot → fake success, no row; 11th submission in 10 min with the same email/phone is refused
- [ ] Unfinished application backdated 25 h (`testBackdateUpload`) is purged by setup and then "expired"
- [ ] All pages: no console errors, no Google Forms URLs, no horizontal scroll at 360 px, checked on Android Chrome, iPhone Safari and desktop
- [ ] Track page: prefill from `?id=`, track by email (any case) and by phone (0… and +234…), wrong contact and unknown reference get the same message, 6th lookup per reference refused, staff message shown as text
- [ ] `setupEliteGlobal` adds Message to Customer; health check shows `"schema":4`
- [ ] `setupEliteGlobal` adds Review Status / Review Updated / Last Customer Email, the Email Log spreadsheet and 3 triggers (re-run adds nothing); health check `"schema":5`
- [ ] Email code: Send code → email arrives (check spam) → wrong code refused → right code "Email confirmed ✓"; changing the email resets it; submit without a confirmed email is refused
- [ ] `sendEmailSamples()`: every email approved (logo, colours, footer, links, phone layout)
- [ ] New lead → staff alert at once; customise / visa → confirmation email; visa → Review Status Under Review
- [ ] Review Status change → email 5–10 min later; change + undo within 5 min → no email; Correction Needed waits for a Message to Customer; daily summary arrives ~08:00
- [ ] `setupEliteGlobal` adds Correction For (dropdown); health check `"schema":6`
- [ ] Track: refresh keeps the status; Log out / new tab / 60 min idle → "Please look up your application again."
- [ ] Correction round on staging (`testRequestCorrection`, `tools/qa/correction-live.js`): Fix my application button, Make the correction, code, replace a photo, submit → Correction Received, Notes line, Replaced folder, staff alert, Correction Received email; second round works
- [ ] `setupEliteGlobal` adds Visa Files + Approved Visa folders; health check `"schema":7`
- [ ] Visa delivery on staging (`testApproveVisa`, `tools/qa/visa-live.js`): Download your visa, code, 2 files (one ~4.5 MB) match byte for byte, Log out ends the token; held email without a file; ATTACH_VISA on/off with a real email
- [ ] Send Now: tick on a Visa Approved row with a file → email within a minute, note "Sent …"; without a file → "Not sent — no visa file …"
- [ ] Scale (§3.9): `benchmarkScale` numbers recorded; `load-live.js` 25 and 50 → 100 % success, 0 duplicates; `archiveNow` on staging moves only finished old TEST leads; System health in the daily summary
- [ ] Track live updates: a staff change shows within 2 minutes without a refresh; hidden tab pauses
- [ ] `cleanupTestData()` run: TEST rows gone from 4 tabs, TEST visa folders in the Drive bin
- [ ] Sharing on the tracker and the Visa Applications folder checked (named staff only)

---

## 11. Deliverables to the client
| Deliverable | Status |
|---|---|
| Apps Script web app (staging) | ✅ Deployed and tested |
| Website: home, visa application, customise pages | ✅ Built and tested against staging |
| Central Lead Tracker + Visa Applications folder (production) | Pending: production switch-over (docs/ENVIRONMENTS.md) |
| Live site on the client domain + HTTPS | Pending |
| QA sign-off (§10) and staff handover notes | Pending |

---

## 12. Status and open items

**Current phase:** staging complete. Waiting for the client's verified details and the production switch-over.

| # | Open item | Owner |
|---|---|---|
| 1 | Switch staging → production (docs/ENVIRONMENTS.md) and re-run §10 there with one TEST of each | Developer |
| 2 | ~~Verified office address, phone/WhatsApp, email~~ — supplied (20 Nov 2026), plus Instagram | Client |
| 3 | ~~Team members~~ — 4 supplied and published (20 Nov 2026) | Client |
| 4 | Drive storage plan for passports (15 GB free shared with Gmail; Google One upgrade or a retention rule, e.g. delete documents N days after a lead closes) | Client |
| 5 | Retention and deletion policy for passports and photos | Client |
| 6 | Where the domain is hosted, and cPanel access or a DNS contact | Client |
| 7 | Update the original handover note to the correct owner account | Client |
| 8 | Email volume for production (~3,000 emails/day at 500 applications): a paid Brevo plan, verified sender domain, then `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `SENDER_EMAIL` (README) | Client + Developer |
| 9 | Production Script Properties: `SITE_URL` (live domain) and `STAFF_EMAIL`; never enable `TEST_OTP_BYPASS` there | Developer |

## 13. Phase 2 ideas (not in scope)
- **Optional free in-browser passport MRZ scan** (Tesseract.js, runs on the device) to pre-fill each passenger's name from the passport — customer always confirms
- Faster uploads: fewer Drive calls per passenger (server time is ~5–10 s today)
- Automatic WhatsApp or email acknowledgement to customers
- Daily lead summary email to management; dashboard tab (leads by status, category, source; conversion rate)
- Floating WhatsApp chat button on the website
