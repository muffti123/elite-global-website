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

## Production (eliteglobaltravelsng@gmail.com)

| Item | Value |
|---|---|
| Purpose | Live system that receives real customer leads |
| Apps Script project | Elite Global Lead System |
| scriptId | `1Lhrr8yjk5BISLVHBPY8BqRaidh09-4CBD7__bNpmm8iRB9TjnjWnDhe0` |
| Editor | https://script.google.com/d/1Lhrr8yjk5BISLVHBPY8BqRaidh09-4CBD7__bNpmm8iRB9TjnjWnDhe0/edit |
| Web app URL / Deployment ID | — (not deployed yet) |
| Time zone / runtime | Africa/Lagos / V8 |

> This project still holds an old script version (Google Forms era) and setup has never run in it.
> Step 4 below uploads the current code. Production has no Google Forms, so there is nothing to close.

---

## Switching staging → production

Run these from the project root. 🧑 means the operator does the step (logins and browser clicks).
🤖 means Claude Code can do it.

1. 🧑 **Turn on the Apps Script API for the company account.** Sign in to
   https://script.google.com/home/usersettings **only** as eliteglobaltravelsng@gmail.com and set
   **Google Apps Script API → On**.
2. 🧑 **Switch clasp to the company account.**
   ```
   clasp logout
   clasp login                  # choose eliteglobaltravelsng@gmail.com in the browser
   clasp show-authorized-user   # must say eliteglobaltravelsng@gmail.com
   ```
3. 🤖 **Point clasp at the production project.** In `.clasp.json`, replace `scriptId` with the production
   scriptId above. Leave `rootDir` set to `apps-script`.
4. 🤖 **Upload the current code:** `clasp push`. Confirm `apps-script/appsscript.json` still says
   `Africa/Lagos`, `V8` and the `webapp` block (execute as deploying user, access anyone).
5. 🧑 **Build the system.** Open the production editor (`clasp open-script`) and run:
   - `setOwnerEmail` — stores eliteglobaltravelsng@gmail.com as `OWNER_EMAIL` (recommended).
   - `setupEliteGlobal` — Review permissions → Advanced → Go to … (unsafe) → Allow → **✅ SETUP COMPLETE**.
     (If retired Google Forms exist in that account, setup closes them and reports their state.)
6. 🧑 **Deploy the web app.** Deploy → New deployment → ⚙ Web app → *Execute as:* **Me** ·
   *Who has access:* **Anyone** → Deploy → authorise. Copy the **Web app URL** and **Deployment ID** into
   the Production table above. Open the URL: it must show `{"ok":true,…}`.
7. 🤖 **Rewire the website.** Set `webAppUrl` in `public/assets/js/config.js` to the production `/exec`
   URL. Run `node tools/check-lists.js` and `node tools/qa/run.js static`, then send **one** TEST of each
   form by hand (contact, customise, visa with 1 passenger and SPECIMEN files) and check the production
   tracker and Visa Applications folder. Run `cleanupTestData()` in production afterwards.
   *Do not run `run.js live` against production* — it creates many TEST leads.
8. 🤖 **Commit and push**, e.g. `git commit -m "feat(site): point website forms to production web app"`,
   then `git push`. Netlify redeploys from `main`.
9. 🧑 **Share** the production tracker and Visa Applications folder with named staff only.
10. 🧑 **Retire staging.** Run `cleanupTestData()` in staging. Optionally archive the staging deployment
    (Deploy → Manage deployments → Archive) so the staging URL stops accepting data.
