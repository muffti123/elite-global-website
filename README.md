# Elite Global World Travel & Tours Ltd. — Website & Lead System

Landing page + Google Forms/Sheets lead generation system.
Full requirements: [`docs/PRD.md`](docs/PRD.md)

```
Elite-Global-World-Travel-and-Tour/
├── public/                     ← EVERYTHING IN HERE IS THE LIVE WEBSITE (and nothing else is)
│   ├── index.html              ← the website
│   └── assets/team/            ← management headshots (ceo.jpg, ...)
├── assets/
│   └── form-header.png         ← header image for Google Forms 1 & 2 (not part of the website)
├── netlify.toml                ← tells Netlify to publish only public/
├── CLAUDE.md                   ← instructions Claude Code reads automatically
├── apps-script/
│   └── EliteGlobal_LeadSystem.gs  ← paste into script.google.com (runs on Google, not your PC)
├── docs/
│   ├── PRD.md                  ← product requirements (v2.1)
│   └── EXECUTION_PLAN.md       ← tonight's step-by-step runbook (start here)
└── source/                     ← original template + handover (git-ignored, stays on your PC)
```

---

## Part 1 — Build the Google Forms & Sheets (once)

Nothing to install. In an incognito window signed in **only** as the owner account for the current environment (see docs/ENVIRONMENTS.md):

1. Go to **script.google.com → New project**, rename it `Elite Global Lead System`.
2. Open `apps-script/EliteGlobal_LeadSystem.gs` in Notepad/VS Code → copy all → replace everything in `Code.gs` → **Ctrl+S**.
3. Function dropdown → `setupEliteGlobal` → **Run** → Review permissions → Advanced → *Go to … (unsafe)* → Allow.
4. Wait for **✅ SETUP COMPLETE**. A Drive folder *Elite Global – Lead Generation System* now holds 3 forms + 4 sheets.
5. Manual (Google has no API for these), in **Form 1 and Form 2**:
   - Click the **Passport Documents** section → **+** → **File upload**. Title: *Upload Passport Biodata Page(s) for All Applicants* (Form 2: *…All Travellers*). Allow only **PDF** + **Image**, max **10** files, **10 MB**. Leave **Required OFF**.
   - 🎨 Theme → header image `assets/form-header.png`, colour `#071B50`, lightest background.
6. Open the **Central Lead Tracker → System Info** tab. You need its values for Part 2.

## Part 2 — Configure the website (one place only)

Open `public/index.html` in **VS Code** (recommended) or Notepad. Near the top, find `window.SITE_CONFIG = {` and fill in:

| Setting | Where to get it |
|---|---|
| `company.address`, `phone`, `email` | From the client (verified) |
| `company.whatsapp` | Same number, **digits only** with country code, e.g. `2348030000000` |
| `forms.visaOnlyUrl` | System Info → *FORM 1 … PUBLIC respondent URL* (ends in `/viewform`) |
| `forms.customUmrahUrl` | System Info → *FORM 2 … PUBLIC respondent URL* |
| `contactForm.endpoint` | System Info → *Form 3 — website POST endpoint* (ends in `/formResponse`) |
| `contactForm.entries.*` | System Info → *Form 3 — field entry IDs* — copy each `entry.123456789` to the matching key |
| `team` | One line per manager (example line is in the file). Photos go in `public/assets/team/` |

Example:
```js
team: [
  { name: 'Aisha Bello', role: 'Managing Director / CEO', bio: 'Over 10 years in Hajj & Umrah operations.', photo: 'assets/team/ceo.jpg' },
]
```

Anything left as `''` hides itself (no ugly placeholders go live). Until the form URLs are set, the buttons scroll to the enquiry form instead.

> ⚠️ Never paste a URL that ends in `/edit` — that is the staff editing link.

## Part 3 — Test locally

1. Double-click `public/index.html` — it opens in your browser. No server needed.
2. Click all **4** Umrah buttons → each opens the correct form in a new tab.
3. Submit the enquiry form with a name starting **`TEST`** → it must appear in *General Contact Enquiries (Responses)* **and** the *Lead Tracker*.
4. Submit Forms 1 & 2 from your phone with `TEST` names and dummy images.
5. Press **F12 → Device toolbar** to check phone sizes.
6. In script.google.com run **`cleanupTestData`** to remove all TEST records. Delete the test upload files in Drive.

## Part 4 — Put it live

**Option A — client's existing host (simplest).** cPanel → File Manager → `public_html` → upload the **contents** of `public/` (`index.html` + `assets/`). Done — no DNS change.

**Option B — GitHub + Netlify.**
```bash
cd C:\Users\LenovoT460\Desktop\Elite-Global-World-Travel-and-Tour
git init
git add .
git commit -m "Elite Global website v1"
git branch -M main
git remote add origin https://github.com/<your-username>/elite-global-website.git
git push -u origin main
```
(No Git installed? Use GitHub's **Add file → Upload files** in the browser instead.)
Then netlify.com → *Add new site → Import from GitHub* → pick the repo → Deploy (no build command; `netlify.toml` already sets the publish folder to `public`). Netlify → *Domain settings → Add custom domain* shows the DNS records to send to the client's DNS team. HTTPS is automatic.

> `source/` is in `.gitignore`, so the client's original handover never reaches GitHub. Keep the repo **private** anyway.

## Maintenance

| Task | How |
|---|---|
| Change phone/email/team | Edit `SITE_CONFIG` in `public/index.html`, commit, push (Netlify redeploys automatically) |
| Rename a form question | Also update the `Q` constants in the Apps Script, or the tracker sync breaks |
| Sync stopped | script.google.com → run `reinstallTriggers` |
| See all links again | run `showSystemInfo` or open the System Info tab |
