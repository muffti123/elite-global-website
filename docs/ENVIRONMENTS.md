# Environments: staging and production

The same Apps Script (`apps-script/`) and website (`public/`) run in two Google accounts. Each account owns
its own Apps Script project + web app deployment, Drive folder, Central Lead Tracker and Visa Applications
folder. Nothing is shared between them. The website talks to whichever web app
`public/assets/js/config.js → webAppUrl` points at.

`.clasp.json` (git-ignored) decides which project `clasp push` uploads to. Copy `.clasp.json.example` to
`.clasp.json` and paste the `scriptId` of the environment you're working on.

The setup script checks the owner through the Script Property **`OWNER_EMAIL`**. If it's empty, the script
logs the signed-in account and continues. To enforce an owner, run `setOwnerEmail()` from the editor while
signed in as that account. With no argument it stores the current account.

> ⚠️ **Rule: no real customer data and no real passports in staging.** Use only made-up test leads whose
> names start with `TEST` and generated specimen files (`tools/qa/fixtures.js`). `cleanupTestData()`
> removes them. Real enquiries go only to production.

---

## Staging (saniabdulmumin70@gmail.com)

| Item | Value |
|---|---|
| Purpose | Building and testing before the client hands over the company account |
| Apps Script project | Elite Global Lead System (Staging) |
| scriptId | `1H510Iw90QAggF4gjWJomnZ7KoU9pD4O3Lopkafjgg0KTCPwYS8hda4kO` |
| Editor | https://script.google.com/d/1H510Iw90QAggF4gjWJomnZ7KoU9pD4O3Lopkafjgg0KTCPwYS8hda4kO/edit |
| **Web app URL** (`webAppUrl`) | https://script.google.com/macros/s/AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ/exec |
| Deployment ID | `AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ` ("staging v1") |
| Time zone / runtime | Africa/Lagos / V8 |
| Drive folder | https://drive.google.com/drive/folders/12fCpHRx9-qgdfmTgaHgZLgHgB2DcYM-8 |
| Central Lead Tracker | https://docs.google.com/spreadsheets/d/1fE5Ukcn2y0P1pyMUykrWrTpYKPMUC9VUWL58p7OkzjU/edit |
| Visa Applications folder | Inside the Drive folder (link in the tracker's System Info tab) |

### Retired Google Forms (staging)
**Closed by `setupEliteGlobal()`** and kept in Drive, not deleted. Google rejected the custom message
("This form has moved. Please apply on our website.") on these forms with *Invalid data updating form*, so
they show Google's default "…is no longer accepting responses". The website no longer links to them.
Setup logs and System Info show the real state each time it runs.

| Form | Edit (admin only) | Old public link (closed) |
|---|---|---|
| 1 — Request Umrah Visa Only | https://docs.google.com/forms/d/1SpxJsVAfDW9pmsIrlsuVwGnXLgPeQCyIGKuj73BfuzY/edit | https://docs.google.com/forms/d/e/1FAIpQLSeSxTcKMLAguBCEBbIJRlmUvoLHqKTm_6UtMrxA0mUawB61oQ/viewform |
| 2 — Customize My Umrah Experience | https://docs.google.com/forms/d/1NkaY-jtleCi68RYQespzCNBzeHtZO5V93yH25dKKUGU/edit | https://docs.google.com/forms/d/e/1FAIpQLSf6By61NsbF6fR2sNb6bS8tl0frlsc_PMsXfqs4eIb2rClkQQ/viewform |
| 3 — General Contact Enquiries | https://docs.google.com/forms/d/11mlisymEHkKXXISNwplydum2lPQ-ffBlWuCjcxr6hdU/edit | https://docs.google.com/forms/d/e/1FAIpQLSeoKpj51pKYbmvlRqgNAVfb2M0QRXrIzPXYvIlWVyszcoHVow/viewform |

Their old response sheets (read-only history):

| Form | Response sheet |
|---|---|
| 1 — Request Umrah Visa Only | https://docs.google.com/spreadsheets/d/12yYRIt28_FkQgdbXtsAQ-R28LLty120VyMR0iH2_Qxc/edit |
| 2 — Customize My Umrah Experience | https://docs.google.com/spreadsheets/d/1tltFG23vPjim4xzl1E44Kb-PKMtICf6ea3T58SdLeq8/edit |
| 3 — General Contact Enquiries | https://docs.google.com/spreadsheets/d/1vAR_InBqfNKOx4bPBptY-Nlje9VdFCu0pz803zm8uCo/edit |

## Production (admin@elitetravelng.com — Google Workspace)

| Item | Value |
|---|---|
| Purpose | Live system that receives real customer leads |
| Owner account | **admin@elitetravelng.com** (Workspace Business Standard). 6 Workspace users. Staff (5, OU `Staff`): muhammad@, abdulmumin@, mustapha@, hamza@ and abdul@elitetravelng.com — tracker + Visa Applications folder only (docs/LAUNCH.md §7) |
| Website | https://elitetravelng.com on Hostinger — the release zip from `tools/release/build.js` (docs/LAUNCH.md §2) |
| Apps Script project | Elite Global Lead System — created by admin@ (scriptId: in `deploy/production.json` once created) |
| clasp | Named login `prod` + `.clasp.prod.json` (git-ignored), always through `tools/prod-clasp.ps1` |
| Web app URL / Deployment ID | In `deploy/production.json` after the first deployment (docs/LAUNCH.md §1.5) |
| Time zone / runtime | Africa/Lagos / V8 |
| Script Properties | `SITE_URL=https://elitetravelng.com`, `OWNER_EMAIL` / `STAFF_EMAIL` = admin@elitetravelng.com, `ATTACH_VISA=on`, `EMAIL_PROVIDER=mailapp` → `brevo` once Brevo is verified. `TEST_OTP_BYPASS` never |
| Customer email | info@elitetravelng.com (Workspace group; Reply-To of every email) |

**How to go live:** follow **docs/LAUNCH.md** (step by step, with who does what and how each step is checked).
No live QA suite ever runs against production: they refuse unless `config.js` points at staging.

### Retired: the old gmail.com "production" project
`1Lhrr8yjk5BISLVHBPY8BqRaidh09-4CBD7__bNpmm8iRB9TjnjWnDhe0` (owned by eliteglobaltravelsng@gmail.com, Google Forms
era, setup never ran) is **not used** and is left untouched. eliteglobaltravelsng@gmail.com stays as the
developer/staging-era account (no forwarding).
