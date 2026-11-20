# Elite Global — Product Requirements Document (PRD)

**Project:** Umrah Lead Generation System — website forms + Apps Script web app + Google Sheets/Drive
**Client:** Elite Global World Travel & Tours Ltd. (RC: 7787410)
**Developer:** Abdulmumin (independent full-stack developer)
**Document version:** 3.2 — supersedes v2.x (Google Forms) and the original *Project Handover Note*
**Last updated:** 20 November 2026 (v3.2: Track my application — §3.5; v3.1: round 1 client feedback — §0.1)

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
| Photo | JPG, PNG, **portrait**: width/height 0.70–0.85 (35 × 45 mm), at least 350 × 450 px — landscape, square, too narrow (selfie/full body) or too small is refused with a friendly message and the photo guide opens | **25–50 KB.** Under 25 KB → rejected ("choose a clearer photo"). 25–50 KB → kept as is. Over 50 KB → compressed in the browser (JPEG quality search, then −15 % dimensions, repeat) into range; the final size is shown |
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
staff *Message to Customer* (plain text, max 300 characters) and, for visa applications, the upload line. Never
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
| 22 | Message to Customer | **Staff** | Optional short message shown to the customer on track.html (plain text, first 300 characters). Header note: "Visible to the customer on the Track page — keep it short and professional" (v3.2) |

Columns 16–22 were appended after Drive Folder (v3.1, v3.2) and are found by header name, so existing rows,
formulas, protections and Lead IDs never move. `setupEliteGlobal()` adds them to an existing tracker and
fills **only empty cells** of earlier leads from their old `[Auto]` notes (notes are kept); running it
again changes nothing.

2,000 pre-formatted rows (500 more added automatically), frozen header and first three columns, filter on,
warning-only protection on Lead ID, Date Received, Total Travellers and Drive Folder.

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
│       └── 02 – <passenger name>/  …
└── (retired, closed) Google Forms 1–3 and their response sheets
```
File extensions follow the file's **real** type (magic bytes), never the customer's file name.

---

## 5. Web app API (`apps-script/WebApp.gs`)

### 5.1 Transport
`POST <web app /exec URL>` with a `text/plain;charset=utf-8` JSON body (a "simple" request: no CORS
preflight). Apps Script answers with a 302 to `script.googleusercontent.com`, which serves the JSON with
`Access-Control-Allow-Origin: *`. `GET` returns a health check `{"ok":true,"service":…,"version":1,"schema":4}` (schema = tracker version written by `setupEliteGlobal`: 3 = v3 columns + Visa Applications tab, 4 = Message to Customer).

Every request: `{"action": "<name>", "hp": "<honeypot>", …}` → `{"ok":true,"leadId":…}` or
`{"ok":false,"error":"<friendly>","field"?:"<name>","missing"?:[…]}`.

### 5.2 Actions
| Action | Input | Writes | Returns |
|---|---|---|---|
| `submitContact` | name, phone, enquiryType, travelDate?, travellers?, details? | Lead Tracker + Contact Enquiries | leadId `EG-GE-…` |
| `submitCustomRequest` | all §3.3 answers (`services` is an array) | Lead Tracker + Custom Requests | leadId `EG-CE-…` |
| `createVisaApplication` | lead fields §3.2 (`departureAirport`, `departureAirportOther`), `consent:true`, `passengers:[{name, category}]` (1–50), `docs:{shared:{ticket,hotel}, passengers:[{ticket,hotel}]}` (optional) | Drive folder, Lead Tracker row (status `Uploading 0/N`), Visa Applications row, upload state | leadId `EG-VO-…`, token |
| `uploadPassenger` | leadId, token, index (1…N), name, category, `passport:{name,mime,b64}`, `photo:{mime,b64}` | `NN – name/` passport + photo (replaced on retry; documents kept), Visa Passengers row (upsert), status `Uploading k/N` | uploaded, total, photoKb |
| `uploadDocument` | leadId, token, `scope` ("all" or 1…N), `kind` (ticket/hotel), name, `file:{name,mime,b64}` | `flight-ticket.*` / `hotel-booking.*` (replaced on retry), links in Visa Passengers / Visa Applications. Only documents declared at create | scope, kind |
| `trackApplication` | leadId, contact (email or phone) | nothing (read-only) | §3.5 fields only, or the generic not-found message |
| `finalizeVisaApplication` | leadId, token | status `Complete: N passengers` (all passengers and declared documents arrived), deletes upload state | leadId (repeat-safe); else `missing` (0 = shared documents) |

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
- Rate limit: **10 create/submit calls per 10 minutes** per email (contact form: per phone), counted in
  CacheService with a hashed key.
- `LockService` only around Lead ID + row writes + upload-state updates — never around Drive uploads.
- Logs contain action, Lead ID, sizes and error class only — **never** names, answers or file contents.
  Unexpected errors email the owner (at most one per 10 minutes) without request data.

### 5.5 Apps Script limits that matter (consumer @gmail.com)
| Limit | Value | Design response |
|---|---|---|
| Execution time | 6 min per call | One passenger per request (≈ 5–10 s server time) |
| Request size | Not documented; ~50 MB practical | Largest request ≈ 7 MB (5 MB PDF base64 + photo) |
| Concurrent executions | ~30 per user (all customers run as the owner) | Uploads sequential per customer; "busy" is retried |
| PropertiesService | 9 KB/value, 500 KB/store, 50k ops/day | ~200 B per open application, purged after 24 h |
| CacheService | ≤ 6 h, may evict | Rate counters only |
| MailApp | 100 recipients/day | Error notices only, throttled |
| **Drive storage** | **15 GB free, shared with Gmail/Photos** | ~1 MB per passenger (image passports) → roughly 1,000 twelve-passenger applications; PDFs use more. **Open item for production** (§12) |
| Deploying | Code goes live only when the **same** deployment gets a new version | `/exec` URL stays the same; new scopes need re-authorising in the editor |

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
| `cleanupTestData()` | Removes every lead whose name starts with "TEST" from all four tabs, moves their visa folders to the Drive bin, deletes their upload state, purges state > 24 h, cleans retired-form responses |
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

| Option | When | Steps |
|---|---|---|
| **A. The client's existing host** | The domain's host includes web space or cPanel | cPanel → File Manager → `public_html` → upload the contents of `public/` |
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
- Logs never contain request bodies, names or file contents.
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
- [ ] Photo landscape / square / selfie-ratio / < 350 × 450 px refused with the guide opening; portrait accepted
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

## 13. Phase 2 ideas (not in scope)
- **Optional free in-browser passport MRZ scan** (Tesseract.js, runs on the device) to pre-fill each passenger's name from the passport — customer always confirms
- Faster uploads: fewer Drive calls per passenger (server time is ~5–10 s today)
- Automatic WhatsApp or email acknowledgement to customers
- Daily lead summary email to management; dashboard tab (leads by status, category, source; conversion rate)
- Floating WhatsApp chat button on the website
