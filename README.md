# HR Scheduler — Setup & Deployment Guide

A zero-cost internal HR scheduling tool built on Netlify + Google Sheets + Google Calendar.

---

## Architecture

```
Netlify (hosting + functions)
├── Frontend SPA       → public/
├── API routes         → netlify/functions/
└── Scheduled cron     → netlify/functions/scheduled-sync.js (7am UTC daily)

Google Workspace
├── Contracts Sheet    → employee contracts, start/end dates
├── People Master      → names, emails, roles, managers
├── Meetings Sheet     → auto-generated schedule (written by the engine)
├── Slots Sheet        → available booking slots from team heads
├── Votes Sheet        → group voting records
└── Google Calendar    → created events, invites, cancellations
```

---

## Step 1 — Google Sheets setup

Create **one Google Spreadsheet** (your main workbook) with these tabs:

### Tab: `Contracts`
| A: Employee ID | B: Name | C: Email | D: Type | E: Start Date | F: End Date | G: Manager ID | H: Manager Email | I: Department | J: Status |
|---|---|---|---|---|---|---|---|---|---|
| emp001 | Jane Smith | jane@company.com | intern | 2025-06-01 | 2025-08-31 | mgr001 | alice@company.com | Product | active |
| emp002 | Bob Lee | bob@company.com | contract | 2025-01-01 | 2025-12-31 | mgr001 | alice@company.com | Engineering | active |
| emp003 | Carol Wu | carol@company.com | permanent | 2024-03-01 | | mgr002 | dan@company.com | Design | active |

**Type** must be: `intern`, `contract`, or `permanent`  
**Status**: `active` (included) or `inactive` (skipped)  
**End Date**: blank for permanent employees

### Tab: `People`
| A: Email | B: Name | C: Role | D: Manager | E: Department |
|---|---|---|---|---|
| alice@company.com | Alice Manager | Team Head | ceo@company.com | Product |
| jane@company.com | Jane Smith | Employee | alice@company.com | Product |

**Role** column: `Team Head` for team heads, anything else = employee

### Tab: `Meetings`
Leave this **empty** (just the header row). The engine writes here automatically.

Header row (Row 1):
```
ID | Employee ID | Employee Name | Email | Manager Email | Meeting Type | Label | Date | Duration | Group | Status | Calendar Event ID | Slot ID | Notes | Created At
```

### Tab: `Slots`
Leave **empty** (just header row).

Header row:
```
ID | Meeting ID | Team Head Email | Date | Start Time | End Time | Status | Booked By | Calendar Event ID | Created At
```

### Tab: `Votes`
Leave **empty** (just header row).

Header row:
```
ID | Meeting ID | Slots | Voters | Votes | Status | Deadline | Winner ID | Created At | Resolved By | Resolved At | Notes
```

---

## Step 2 — Google Cloud setup

### 2a. Create a project
1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "HR Scheduler")
3. Enable these APIs:
   - Google Sheets API
   - Google Calendar API
   - Gmail API

### 2b. Service Account (for backend API calls)
1. APIs & Services → Credentials → Create Credentials → Service Account
2. Name: `hr-scheduler-sa`, Role: Editor
3. After creation: click the account → Keys → Add Key → JSON
4. Download the JSON file — you'll need `client_email` and `private_key`
5. **Share your Spreadsheet** with the service account email (Editor access)
6. **Share your Google Calendar** with the service account email (Make changes to events)

### 2c. OAuth Client (for user login)
1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Application type: Web application
3. Authorised redirect URIs: `https://YOUR-SITE.netlify.app/.netlify/functions/auth-callback`
4. Also add: `http://localhost:8888/.netlify/functions/auth-callback` for local dev
5. Copy the Client ID and Client Secret

---

## Step 3 — Gmail App Password (for email sending)
1. Go to your Gmail account → Security → 2-Step Verification (must be on)
2. App passwords → Create → name it "HR Scheduler"
3. Copy the 16-character password

---

## Step 4 — Netlify deployment

### 4a. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-ORG/hr-scheduler.git
git push -u origin main
```

### 4b. Connect to Netlify
1. netlify.com → Add new site → Import from Git → select your repo
2. Build command: (leave blank)
3. Publish directory: `public`
4. Deploy site

### 4c. Set environment variables
In Netlify: Site configuration → Environment variables → Add all variables from `.env.example`:

```
GOOGLE_CLIENT_ID            = your OAuth client ID
GOOGLE_CLIENT_SECRET        = your OAuth client secret
GOOGLE_SERVICE_ACCOUNT_EMAIL = hr-scheduler-sa@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
CONTRACTS_SHEET_ID          = your spreadsheet ID (from the URL)
PEOPLE_MASTER_SHEET_ID      = same spreadsheet ID (or different one)
HR_CALENDAR_ID              = your HR calendar ID
SESSION_SECRET              = (generate: openssl rand -base64 32)
APP_URL                     = https://YOUR-SITE.netlify.app
HR_ADMIN_EMAILS             = hr@company.com,hr-manager@company.com
GMAIL_USER                  = hr@company.com
GMAIL_APP_PASSWORD          = your 16-char app password
VOTE_WINDOW_HOURS           = 24
```

> **Private key tip**: In Netlify's env var UI, paste the key exactly as it appears in the JSON file. Netlify handles the newlines correctly.

### 4d. Redeploy
After setting env vars, trigger a new deploy: Deploys → Trigger deploy → Deploy site.

---

## Step 5 — First run

1. Visit your Netlify URL
2. Sign in with a Google account listed in `HR_ADMIN_EMAILS`
3. You'll land on the HR Dashboard
4. Click **Sync now** to run the first schedule generation
5. Check your Meetings sheet — it should now be populated

---

## Sheet ID — where to find it

The spreadsheet ID is in the URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

---

## Local development

```bash
# Install dependencies
npm install

# Install Netlify CLI
npm install -g netlify-cli

# Copy env file
cp .env.example .env
# Fill in .env with your values

# Run locally
netlify dev
# → opens at http://localhost:8888
```

---

## How the schedule engine works

When HR clicks **Sync now** (or the daily cron runs at 7am UTC), the engine:

1. Reads all rows from `Contracts!A2:J`
2. Skips inactive employees
3. Calculates required meetings per employment type:
   - **Intern**: HR Onboarding (day 1), Product Onboarding (day 5), Interim Feedback (midpoint), Offboarding (2 weeks before end), Final Feedback (1 week before end), Final Check-in (last day), Q2/Q3 1:1s if in range
   - **Contract**: Monthly P&D Trackers (first workday each month), Interim P&D (midpoint), Final P&D (2 weeks before end), Offboarding (1 week before end), Q2/Q3 1:1s, 360° Dev Plan (June), Midyear Review (July)
   - **Permanent**: Q2/Q3 1:1s, 360° Dev Plan (June), Midyear Review (July), Annual Review (December)
4. Skips weekends (moves to next workday)
5. Deduplicates against existing meetings
6. Writes new meetings to the `Meetings` sheet with status `pending`

---

## Troubleshooting

**Login redirects back to login page**  
→ Check `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL` are set correctly  
→ Verify the redirect URI in Google Cloud Console matches exactly  

**"Could not connect to server" on login page**  
→ The Netlify functions may have failed to deploy — check the Functions log in Netlify dashboard  

**Meetings not generating**  
→ Verify the service account has Editor access to the spreadsheet  
→ Check the Contracts sheet has the correct column layout (A–J)  
→ Check function logs: Netlify → Functions → scheduled-sync  

**Emails not sending**  
→ Verify `GMAIL_APP_PASSWORD` is the 16-char app password (not your regular Gmail password)  
→ Check that 2-Step Verification is enabled on the Gmail account  

**Calendar events not creating**  
→ Share the Google Calendar with the service account email  
→ Verify `HR_CALENDAR_ID` is the calendar's full ID (found in Calendar settings)
