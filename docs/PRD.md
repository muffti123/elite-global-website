# Elite Global — Product Requirements Document (PRD)

**Project:** Umrah Lead Generation System — Landing Page + Google Forms/Sheets
**Client:** Elite Global World Travel & Tours Ltd. (RC: 7787410)
**Developer:** Abdulmumin (independent full-stack developer)
**Document version:** 2.0 — supersedes the original *Project Handover Note*
**Last updated:** 18 November 2026 (v2.1: website built)

---

## 0. What changed from the original handover

| # | Original handover | This PRD (correct) |
|---|---|---|
| 1 | Owner account: `Citizenactofficial@gmail.com` (earlier `Muhammada@wakanow.com`) | **Owner account: `eliteglobaltravelsng@gmail.com`** for every Form, Sheet, script and Drive file |
| 2 | Blocked waiting on a ChatGPT Google Drive connector | **No connector needed.** Everything is built by a Google Apps Script run directly in the company account at script.google.com |
| 3 | 2 forms, 2 response sheets | **3 forms, 3 response sheets.** Added Form 3: *General Contact Enquiries*, which powers the website contact form |
| 4 | Lead Category: Visa Only, Customised Experience | **Adds a third category, "General Enquiry"**, for website contact leads |
| 5 | The tracker must not be assumed to sync automatically, and options needed approval | **Auto-sync approved and built** with Google-native Apps Script triggers (no third-party service) |
| 6 | Website: button links only | **Full production `index.html`**: buttons, a working contact form, verified company details, team section, responsive design and hosting/DNS plan |

---

## 1. Overview

### 1.1 Problem
Elite Global needs a professional web presence and a dependable way to capture Umrah enquiries. Every lead should land in one place where the sales and operations team can track it from first contact to conversion.

### 1.2 Goals
1. Publish a premium, mobile-friendly landing page on the client's existing domain.
2. Capture three kinds of lead: **Visa Only**, **Customised Umrah Experience** and **General Enquiry**.
3. Store every lead in its own response spreadsheet **and** in one **Central Lead Tracker**, without anyone copying data by hand.
4. Keep passport documents and customer data private and visible only to authorised staff.

### 1.3 Non-goals (this phase)
- Online payments or booking engine
- Customer accounts or login on the website
- CRM integration beyond Google Sheets
- Automated email/WhatsApp replies to customers (possible phase 2)

### 1.4 Users
| User | Need |
|---|---|
| Prospective pilgrim (mostly on mobile) | Request a visa or a custom package quickly, with no friction |
| Sales agent | See new leads immediately, update their status and add notes |
| Operations / management | See the pipeline, conversion rate and lead sources |
| Developer | Build it, hand it over and maintain it |

---

## 2. System architecture

```
                 ┌────────────────────────── Website (index.html) ──────────────────────────┐
                 │  Hero + CTA buttons            Contact section enquiry form               │
                 └──────┬───────────────┬────────────────────────┬──────────────────────────┘
          opens new tab │               │ opens new tab          │ JS POST (no page reload)
                        ▼               ▼                        ▼
               Form 1: Visa Only   Form 2: Custom Experience   Form 3: General Contact
                        │               │                        │
                        ▼               ▼                        ▼
             Visa Only Enquiries  Custom Experience Enq.   General Contact Enq. (Responses)
                        │               │                        │
                        └───────── onLeadFormSubmit trigger (Apps Script) ─────────┘
                                                │
                                                ▼
                              Elite Global – Central Lead Tracker
                                  ├─ Lead Tracker  (14 columns)
                                  └─ System Info   (all URLs + Form 3 entry IDs)
```

**Platform:** Google Forms, Google Sheets, Google Apps Script and Google Drive, all owned by `eliteglobaltravelsng@gmail.com` and stored in one private Drive folder: **Elite Global – Lead Generation System**.

---

## 3. Google Forms requirements

### 3.1 Settings for all forms
- Progress bar **on**; questions **not shuffled**; keep the order specified below
- Open to the public; no sign-in required (but see §3.5 on file uploads)
- Respondents cannot see the summary of other people's responses
- Response editing off; "Submit another response" link on
- Email collected as a **validated question**, not through Google's email collection setting
- Branding: header image `Elite_Global_Form_Header.png` (1600×400), theme colour navy `#071B50`, accent gold `#F5AE00`, white background

### 3.2 Shared validation rules
| Field type | Rule |
|---|---|
| Phone / WhatsApp (Forms 1 & 2) | Optional `+`, then 7–20 digits; spaces, `-` and `()` allowed. Help text: "Include your country code, e.g. +234 803 000 0000" |
| Email | Must be a valid email address |
| Traveller counts, nights | Whole number from 0 to 999. No decimals or negative numbers |
| Country of Residence | Dropdown: Nigeria first, then all countries A–Z, then "Other" |

### 3.3 Form 1 — `Elite Global – Request Umrah Visa Only`
**Description:** Welcome to Elite Global World Travel & Tours Ltd. Planning your Umrah journey? Complete this short form to request Umrah visa assistance. Our team will review your enquiry and contact you with the next steps.

| Section | Question | Type | Required |
|---|---|---|---|
| 1. Personal Information | Full Name | Short answer | Yes |
| | Phone Number / WhatsApp Number | Short answer (phone validation) | Yes |
| | Email Address | Short answer (email validation) | Yes |
| | Country of Residence | Dropdown | Yes |
| 2. Applicant Information | Number of Adults (18 years and above) | Whole number ≥ 0 | Yes |
| | Number of Children (2–17 years) | Whole number ≥ 0 | Yes |
| | Number of Infants (below 2 years) | Whole number ≥ 0 | Yes |
| 3. Travel Information | Preferred Travel Date | Date | Yes |
| | Departure City | Short answer | Yes |
| | Do you have a confirmed flight ticket? | Yes / No | Yes |
| | Have you previously travelled to Saudi Arabia? | Yes / No | Yes |
| | Do you currently hold a valid UK, US or Schengen visa? | Yes / No | No |
| 4. Passport Documents | Upload Passport Biodata Page(s) for All Applicants | File upload: PDF + Image, up to 10 files, 10 MB each | **No** |
| 5. Additional Information | Additional Information / Special Requests | Paragraph | No |
| | How did you hear about Elite Global? | Dropdown: Website, Instagram, Facebook, WhatsApp, Referral, Travel Agent, Other | No |

**Confirmation:** Thank you for choosing Elite Global World Travel & Tours Ltd. Your Umrah visa enquiry has been received. Our team will contact you shortly to guide you through the next steps.

### 3.4 Form 2 — `Elite Global – Customize My Umrah Experience`
**Description:** Every Umrah journey is unique. Tell us about your travel preferences, accommodation requirements and additional services you may need. Our team will use the information provided to prepare a customised Umrah travel proposal for you.

| Section | Question | Type | Required |
|---|---|---|---|
| 1. Personal Information | Full Name; Phone Number / WhatsApp Number; Email Address; Country of Residence | Same as Form 1 | Yes |
| 2. Traveller and Travel Information | Number of Adults / Children / Infants | Whole number ≥ 0 | Yes |
| | Preferred Departure City | Short answer | Yes |
| | Preferred Travel Date | Date | Yes |
| | Do you have a confirmed flight ticket? | Yes / No | Yes |
| | Preferred Arrival City in Saudi Arabia | Madinah / Jeddah / No preference | Yes |
| 3. Accommodation Preferences | Preferred Duration in Madinah (nights) | Whole number ≥ 0 | Yes |
| | Preferred Duration in Makkah (nights) | Whole number ≥ 0 | Yes |
| | Preferred Hotel Category | Dropdown: 3-star, 4-star, 5-star, Luxury / Premium, No preference | Yes |
| | Preferred Distance from Haram | Dropdown: Walking distance, Close / short walk, Shuttle service, No preference | Yes |
| | Preferred Hotel | Short answer | No |
| 4. Additional Services Required | Which services do you require? | Checkboxes: Umrah Visa Processing, International Flight Ticket, Hotel Accommodation in Makkah, Hotel Accommodation in Madinah, Airport Transfers, Makkah–Madinah Transportation, Ziyarah / Religious Tours, Complete Umrah Package, Other (free text) | No |
| 5. Visa and Budget Preferences | Do you require Umrah visa assistance? | Yes / No / I already have my visa | Yes |
| | What is your estimated budget per person? | Dropdown: Below ₦1,000,000 · ₦1,000,000 – ₦2,000,000 · ₦2,000,000 – ₦3,000,000 · ₦3,000,000 – ₦5,000,000 · Above ₦5,000,000 · I need guidance on the budget | Yes |
| 6. Travel Experience and Special Requests | Preferred Travel Experience | Dropdown: Economy / Budget-friendly, Standard / Comfortable, Premium, Luxury, No preference | No |
| | Preferred Hotel or Airline | Short answer | No |
| | Special Requests / Additional Information | Paragraph | No |
| 7. Passport Documents | Upload Passport Biodata Page(s) for All Travellers | File upload: PDF + Image, up to 10 files, 10 MB each | **No** |
| 8. Lead Source | How did you hear about Elite Global? | Dropdown (same as Form 1) | No |

**Confirmation:** Thank you for choosing Elite Global World Travel & Tours Ltd. Your customised Umrah enquiry has been successfully received. Our travel consultants will review your preferences and contact you to discuss the best arrangements for your journey. We look forward to being part of your Umrah experience.

### 3.5 Passport upload rules
- **Optional, never required.** Customers can send their enquiry first and supply passports later.
- The section text tells customers that Google requires a Google sign-in to upload, and that they can send passports later on WhatsApp or by email.
- ⚠️ **Known platform limitation:** when a form contains a file-upload question, Google makes the **whole form** require sign-in, not only the upload. This can reduce the number of leads on Forms 1 and 2. **The client must decide:** keep the uploads, or remove them and collect passports on WhatsApp. Form 3 never has an upload, so the website contact form never needs sign-in.
- Uploaded files stay private in the owner's Drive and are never shared publicly. The company's document retention and deletion policy applies.
- Never use real passports for testing.

### 3.6 Form 3 — `Elite Global – General Contact Enquiries`
Mirrors the website contact form. The website submits to it in the background.

| Question | Type | Required |
|---|---|---|
| Full Name | Short answer | Yes |
| Phone / WhatsApp Number | Short answer | Yes |
| Enquiry Type | Dropdown: Request Umrah Visa Only, Customize My Umrah Experience, Hotel Accommodation, Ground Transportation, Other Travel Enquiry | Yes |
| Preferred Travel Date | Date | No |
| Number of Travellers | Short answer | No |
| Additional Details | Paragraph | No |

**Important:** Form 3 has **no regex validation** on purpose. Google silently rejects website submissions that fail validation, so the website's JavaScript does the validation instead. The dropdown options must match the website's `<select>` options **exactly**.

**Confirmation:** Thank you for contacting Elite Global World Travel & Tours Ltd. Your enquiry has been received. A member of our team will contact you shortly.

---

## 4. Response spreadsheets

| Form | Response spreadsheet |
|---|---|
| Form 1 | `Elite Global – Visa Only Enquiries` |
| Form 2 | `Elite Global – Custom Experience Enquiries` |
| Form 3 | `Elite Global – General Contact Enquiries (Responses)` |

- Each is linked as the form's response destination, and the empty default sheet is removed.
- The header row is navy and frozen. Phone columns are formatted as plain text so leading zeros are kept.
- These sheets are the **source of truth**. The tracker is a working copy built from them.

---

## 5. Central Lead Tracker

**Spreadsheet:** `Elite Global – Central Lead Tracker`
**Tabs:** `Lead Tracker`, `System Info`

### 5.1 Columns (`Lead Tracker`)
| # | Column | Filled by | Rule |
|---|---|---|---|
| 1 | Lead ID | Auto | `EG-VO-00001` / `EG-CE-00002` / `EG-GE-00003`. One running number shared by all forms |
| 2 | Date Received | Auto | Form timestamp, shown as `dd mmm yyyy, hh:mm` |
| 3 | Customer Name | Auto | |
| 4 | Phone Number | Auto | Plain text |
| 5 | Lead Category | Auto | Dropdown: Visa Only · Customised Experience · General Enquiry |
| 6 | Adults | Auto | Number ≥ 0 |
| 7 | Children | Auto | Number ≥ 0 |
| 8 | Infants | Auto | Number ≥ 0 |
| 9 | Total Travellers | Formula | `=IF(COUNT(F2:H2)=0,"",F2+G2+H2)`, filled down every row |
| 10 | Travel Date | Auto | `dd mmm yyyy` |
| 11 | Budget | Auto | From Form 2. "N/A (visa only)" for Form 1. Blank for Form 3 |
| 12 | Lead Status | Staff | Dropdown, colour-coded. Default **New Lead** |
| 13 | Assigned Agent | Staff | Free text |
| 14 | Follow-up Notes | Auto + staff | Starts with an `[Auto]` summary: email, country, departure city, preferences, services, lead source |

**Lead Status values:** New Lead · Contacted · Awaiting Response · Quotation Sent · Payment Pending · Converted · Lost

**Rules for Form 3 leads:** the website gives only a traveller total. That total goes in **Adults**, and the notes say "age split not given".

### 5.2 Tracker features
- 2,000 pre-formatted rows; 500 more are added automatically when it fills up
- Frozen header row and first three columns; filter on; the Lead Status header is highlighted in gold
- Warning-only protection on Lead ID, Date Received and Total Travellers
- The `System Info` tab lists every edit URL, public URL, sheet URL, the Form 3 POST endpoint and Form 3 entry IDs

### 5.3 Auto-sync
- An installable `onFormSubmit` trigger on each of the three forms runs `onLeadFormSubmit`.
- A lock prevents duplicate Lead IDs when two people submit at the same moment.
- Answers are matched to columns by **exact question title**. If a question is renamed, the `Q` constants in the script must be updated.
- If a sync fails, an email alert goes to the owner account. The lead is still safe in its response sheet.

---

## 6. Setup script (deliverable)

**File:** `EliteGlobal_LeadSystem.gs`. Paste it into a new project at script.google.com while signed in as the owner.

| Function | Purpose |
|---|---|
| `setupEliteGlobal()` | Builds everything. Run **once**. It refuses to run as the wrong account or to run twice |
| `cleanupTestData()` | Removes every record whose name starts with "TEST" from the forms, response sheets and tracker, and restarts Lead IDs if the tracker is empty |
| `reinstallTriggers()` | Re-creates the auto-sync triggers |
| `showSystemInfo()` | Prints all URLs in the log |
| `resetSetupFlag()` | Clears stored IDs and triggers so setup can run again after the folder is deleted |

**Manual steps after the script (Google provides no API for these):**
1. Add the File upload question to the Passport section of Forms 1 and 2 (§3.5).
2. Apply the theme: header image, navy colour and white background.

---

## 7. Website requirements (`index.html`)

### 7.1 Content
- Base: the approved template `Elite_Global_Website_Updated.html`, with its existing navy/gold design kept as-is.
- Replace every placeholder with **verified** information:
  - office address, phone/WhatsApp number and email (contact section **and** footer)
  - the five management team members: photo, name, role and short profile
- Remove the developer and prototype notes ("Developer note…", "Prototype form…", demo success text).
- All configurable values live in one `SITE_CONFIG` block at the top of `index.html`. Empty values hide their section, so no placeholders ever go live.
- Add a real FAQ section (the nav already links to "FAQs"); the "Why Choose" section moves to `#why`.
- Footer: © current year, RC: 7787410.

### 7.2 Calls to action
| Button (exact label) | Locations | Destination | Behaviour |
|---|---|---|---|
| Request Umrah Visa Only | Hero, CTA band | Form 1 **public** URL (`/viewform`, never `/edit`) | `target="_blank" rel="noopener"` |
| Customize My Umrah Experience | Hero, CTA band | Form 2 **public** URL | `target="_blank" rel="noopener"` |
| Get in Touch / Speak with our team | Nav, About | `#contact` | Smooth scroll |

### 7.3 Contact form
- Fields: Full name\*, Phone / WhatsApp\*, Enquiry type\*, Preferred travel date, Number of travellers (≥ 1), Additional details.
- Submits to the Form 3 `formResponse` endpoint with `fetch` (`mode: "no-cors"`) using the entry IDs from `System Info`. The date is sent as `entry.X_year`, `entry.X_month` and `entry.X_day`.
- Client-side validation with clear messages beside each field. The submit button is disabled and shows "Sending…" while sending, which also prevents double submissions.
- Success: the form resets and a green confirmation message appears.
- Error or offline: a red message appears with a direct WhatsApp/phone fallback link. What the customer typed is kept.
- A hidden honeypot field blocks basic spam bots.

### 7.4 Quality
- Responsive at 360 px, 768 px and 1280 px+. Buttons stack full-width on mobile, and no content scrolls sideways.
- Accessible: labels on every input, alt text on images, visible focus states, good colour contrast.
- SEO basics: title, meta description, Open Graph tags, favicon.
- Single self-contained file with the logo embedded, so there is no build step. It lives in `public/`, the only folder that is published.

---

## 8. Hosting and deployment

| Option | When | Steps |
|---|---|---|
| **A. The client's existing host** | The domain's host includes web space or cPanel | cPanel → File Manager → `public_html` → upload the contents of `public/`. No DNS change needed |
| **B. GitHub (private) + Netlify (chosen for development)** | Always used for preview and version history; also production if the host has no web space | Private repo → Netlify linked to it publishes `public/` on every push → send the DNS records to the client's DNS team → HTTPS automatic |

Git and GitHub are **not** needed for the Apps Script. GitHub is optional, and only for the website.

---

## 9. Security and privacy
- All files are owned by `eliteglobaltravelsng@gmail.com` and stay private. Staff get access by sharing with named accounts only, never "Anyone with the link".
- Passport files are never made public. Apply the retention and deletion policy once a lead closes.
- Never put the owner password or verification codes in any tool, chat or document.
- The website exposes only the **public** form URLs and the Form 3 POST endpoint, never edit URLs.

---

## 10. Testing and QA checklist
- [ ] Setup log shows ✅ SETUP COMPLETE as `eliteglobaltravelsng@gmail.com`
- [ ] All 3 forms and 4 spreadsheets are in the Drive folder
- [ ] Every question, option, required flag and validation matches §3
- [ ] Passport uploads are optional, PDF/Image only, max 10, with the sign-in notice visible
- [ ] Theme applied to Forms 1 and 2
- [ ] Each form is linked to its own response sheet
- [ ] TEST submissions (desktop and mobile) appear in the correct response sheet **and** the tracker with the correct Lead ID, category, total and notes
- [ ] Website contact form → Form 3 → tracker works end to end, including the error state when offline
- [ ] All 4 hero/CTA buttons open the correct **public** form in a new tab
- [ ] Site checked on Android Chrome, iPhone Safari and desktop
- [ ] `cleanupTestData()` run; test passport files deleted from Drive
- [ ] Sharing permissions on sheets and the upload folders checked

---

## 11. Deliverables to the client
| Deliverable | Status |
|---|---|
| Form 1 editing URL / public URL / response sheet | Pending: run script |
| Form 2 editing URL / public URL / response sheet | Pending: run script |
| Form 3 editing URL / public URL / response sheet | Pending: run script |
| Central Lead Tracker URL | Pending: run script |
| Setup script `EliteGlobal_LeadSystem.gs` | ✅ Done |
| Form header image `Elite_Global_Form_Header.png` | ✅ Done |
| Production `index.html` | ✅ Built and browser-tested (desktop/tablet/mobile). Goes live once `SITE_CONFIG` is filled with the inputs in §12 |
| Live site on the client domain + HTTPS | Pending |
| QA sign-off (§10) and staff handover notes | Pending |

---

## 12. Status and open items

**Current phase:** Script and website built. Waiting for (1) the script to be run in the owner account and (2) the client's verified details. Both go into the single `SITE_CONFIG` block in `index.html`.

| # | Open item | Owner |
|---|---|---|
| 1 | Run `setupEliteGlobal()`, do the manual upload/theme steps, test | Developer |
| 2 | Send the contents of the `System Info` tab (public URLs, Form 3 endpoint and entry IDs) | Developer |
| 3 | Verified office address, phone/WhatsApp, email | Client |
| 4 | Five team members: name, role, short profile, headshot | Client |
| 5 | Decision: keep passport uploads (sign-in required) or collect passports on WhatsApp | Client |
| 6 | Where the domain is hosted, and cPanel access or a DNS contact | Client |
| 7 | Update the original handover note to the correct owner account | Client |

## 13. Phase 2 ideas (not in scope)
- Automatic WhatsApp or email acknowledgement to customers
- Daily lead summary email to management
- Dashboard tab: leads by status, category and source; conversion rate
- Floating WhatsApp chat button on the website
