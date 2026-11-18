# Environments: staging and production

The same Apps Script (`apps-script/EliteGlobal_LeadSystem.gs`) and website (`public/`) run in two
Google accounts. Each account owns its own Apps Script project, Drive folder, three forms and four
sheets. Nothing is shared between them.

`.clasp.json` (git-ignored) decides which project `clasp push` uploads to. Copy
`.clasp.json.example` to `.clasp.json` and paste the `scriptId` of the environment you're working on.

The setup script checks the owner through the Script Property **`OWNER_EMAIL`**. If it's empty, the
script logs the signed-in account and continues. To enforce an owner, run `setOwnerEmail()` from the
editor while signed in as that account. With no argument it stores the current account.

> ⚠️ **Rule: no real customer data and no real passports in staging.** Use only made-up test
> leads whose names start with `TEST` (`cleanupTestData()` removes them). Real enquiries go only to
> production.

---

## Staging (saniabdulmumin70@gmail.com)

| Item | Value |
|---|---|
| Purpose | Building and testing before the client hands over the company account |
| Apps Script project | Elite Global Lead System (Staging) |
| scriptId | `1H510Iw90QAggF4gjWJomnZ7KoU9pD4O3Lopkafjgg0KTCPwYS8hda4kO` |
| Editor | https://script.google.com/d/1H510Iw90QAggF4gjWJomnZ7KoU9pD4O3Lopkafjgg0KTCPwYS8hda4kO/edit |
| Time zone / runtime | Africa/Lagos / V8 |

## Production (eliteglobaltravelsng@gmail.com)

| Item | Value |
|---|---|
| Purpose | Live system that receives real customer leads |
| Apps Script project | Elite Global Lead System |
| scriptId | `1Lhrr8yjk5BISLVHBPY8BqRaidh09-4CBD7__bNpmm8iRB9TjnjWnDhe0` |
| Editor | https://script.google.com/d/1Lhrr8yjk5BISLVHBPY8BqRaidh09-4CBD7__bNpmm8iRB9TjnjWnDhe0/edit |
| Time zone / runtime | Africa/Lagos / V8 |

> This project was created and pushed before the owner check became configurable, so it still holds
> the old script version. Step 4 below uploads the current one.

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
   clasp login            # choose eliteglobaltravelsng@gmail.com in the browser
   clasp show-authorized-user   # must say eliteglobaltravelsng@gmail.com
   ```
3. 🤖 **Point clasp at the production project.** In `.clasp.json`, replace `scriptId` with the
   production scriptId above. Leave `rootDir` set to `apps-script`.
4. 🤖 **Upload the current script:** `clasp push`. Then confirm `apps-script/appsscript.json` still
   says `Africa/Lagos` and `V8`.
5. 🧑 **Build the system.** Open the production editor (`clasp open-script`) and run:
   - `setOwnerEmail`. This stores eliteglobaltravelsng@gmail.com as `OWNER_EMAIL`. Optional, but
     recommended for production.
   - `setupEliteGlobal`. Review permissions → Advanced → Go to … (unsafe) → Allow, then wait for
     **✅ SETUP COMPLETE**.
6. 🧑 **Redo the two manual Google Forms steps** in production Forms 1 and 2. Google gives no API
   for these.
   - Passport Documents section → **+** → **File upload**. Form 1 title: *Upload Passport Biodata
     Page(s) for All Applicants*. Form 2: *…All Travellers*. PDF + Image, max 10 files, 10 MB,
     **Required OFF**.
   - Theme: header image `assets/form-header.png`, colour `#071B50`.
7. 🧑 **Copy the production System Info.** Open **Central Lead Tracker → System Info** in the
   company Drive and copy the whole table.
8. 🤖 **Rewire the website.** Paste the new values into `SITE_CONFIG.forms` and
   `SITE_CONFIG.contactForm` in `public/index.html`. Use only `/viewform` and `/formResponse`, never
   `/edit`. Run the checks in `CLAUDE.md`, including one `TEST …` enquiry that reaches the
   production tracker.
9. 🤖 **Commit and push.** For example:
   `git commit -m "feat(site): point forms to production Google account"`, then `git push`.
   Netlify redeploys from `main`.
10. 🧑 **Retire staging.** Once production works, stop sending traffic to the staging forms. Run
    `cleanupTestData()` in staging, or leave it unused.
