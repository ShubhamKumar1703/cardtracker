# CardTracker — Google Apps Script Ingestion Setup Guide

This guide walks you through setting up automated bank and credit card email ingestion into CardTracker using **Google Apps Script**.

### Architecture & Advantages
```
Bank / Credit Card Email (Axis / Kiwi)
       │
       ▼
     Gmail
       │
       ▼ (Every 5-15 mins via Time-driven Trigger)
Google Apps Script (Code.gs)
       │
       ▼ (HTTP POST with Bearer Token)
CardTracker Ingestion API (/api/ingest/email)
       │
       ├─► 1. 3-Tier Idempotency (bank_reference_id -> message_id -> time fingerprint)
       ├─► 2. Parser & Normalizer (Axis, Kiwi, Rupay, UPI)
       ├─► 3. Merchant Rules / Groq Fallback
       │
       ▼
Supabase Database (PostgreSQL)
       │
       ▼
Mobile-First Dashboard (PWA)
```

- **₹0 Cost**: No custom domain, no Cloudflare Email Routing or Workers needed.
- **Safe & Retryable**: Emails are only labeled `CardTracker/Processed` after CardTracker returns a successful 2xx response. If the server is offline or fails, the email remains unlabeled and is retried on the next run.
- **Never marks emails as read**: Your email unread status in Gmail is left untouched.

---

## 1. Create Google Apps Script Project

1. Open your browser and navigate to [Google Apps Script (script.google.com)](https://script.google.com/).
2. Click **+ New project**.
3. Name the project: **CardTracker Ingestion**.
4. In the code editor, delete any default code in `Code.gs`.
5. Copy the contents of [`google-apps-script/Code.gs`](./Code.gs) and paste it into the editor.
6. Click **Save** (disk icon or `Ctrl + S`).

---

## 2. Configure Script Properties

The script uses Google Apps Script's secure **Script Properties** so your authentication token is never hard-coded in plain text.

1. In the left navigation menu of Apps Script, click the **Project Settings** gear icon (⚙️).
2. Scroll down to the **Script Properties** section.
3. Click **Add script property** and add these two entries:

| Property Name | Example Value | Description |
| :--- | :--- | :--- |
| `CARDTRACKER_INGEST_URL` | `https://your-cardtracker.vercel.app/api/ingest/email` | The live URL of your deployed CardTracker ingestion endpoint (or ngrok URL for local dev). |
| `CARDTRACKER_INGESTION_TOKEN` | `your-secret-token` | The secret token that matches `INGESTION_SECRET_TOKEN` in your CardTracker `.env.local`. |

4. Click **Save script properties**.

---

## 3. Authorize Permissions

The first time you execute the script, Google will ask for permission:

1. In the editor top toolbar, select `testConnection` from the function dropdown.
2. Click **Run**.
3. A popup titled **"Authorization Required"** will appear. Click **Review permissions**.
4. Select your Google account.
5. If Google shows *"Google hasn't verified this app"*, click **Advanced** -> **Go to CardTracker Ingestion (unsafe)**.
6. Click **Allow**.

The permissions granted are:
- `https://www.googleapis.com/auth/gmail.modify` (To search bank alert emails and apply the `CardTracker/Processed` label).
- `https://www.googleapis.com/auth/script.external_request` (To POST email payloads to your CardTracker API).

---

## 4. Test Connectivity & Initial Run

### Step 4.1: Run `testConnection`
In the function dropdown, select `testConnection` and click **Run**.
Check the **Execution log** at the bottom:
```
[CardTracker] Testing connection to: https://.../api/ingest/email
[CardTracker] Response Code: 200
[CardTracker] Connection test PASSED! Token is valid and API is responsive.
```
If you get code `401`, verify that `CARDTRACKER_INGESTION_TOKEN` in Script Properties exactly matches `INGESTION_SECRET_TOKEN` on your CardTracker deployment.

### Step 4.2: Run `syncBankEmails`
1. Select `syncBankEmails` in the dropdown and click **Run**.
2. It will:
   - Create the Gmail label `CardTracker/Processed` if it doesn't already exist.
   - Search for bank alerts: `from:(axisbank.com OR kiwi.money) -label:CardTracker/Processed newer_than:7d`.
   - Post matching alerts to CardTracker.
   - Attach the label `CardTracker/Processed` to successful threads.

---

## 5. Set Up Automated Recurring Trigger

You can set up the recurring trigger automatically or manually:

### Option A: Automated (One Click)
1. In the Apps Script function dropdown, select `setupRecurringTrigger`.
2. Click **Run**.
3. Check the execution log: you should see `Recurring 5-minute trigger created successfully for syncBankEmails.`

### Option B: Manual Trigger Setup via UI
1. In the left navigation bar, click the **Triggers** alarm clock icon (⏰).
2. Click **+ Add Trigger** (bottom right).
3. Configure the trigger:
   - **Choose which function to run:** `syncBankEmails`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Minutes timer`
   - **Select minute interval:** `Every 5 minutes` (or `Every 10 minutes`)
   - **Failure notification settings:** `Notify me immediately`
4. Click **Save**.

---

## 6. Verification & Troubleshooting

- **Check Processed Emails in Gmail:**
  Search `label:CardTracker/Processed` in Gmail to view emails that were ingested.
- **Duplicate Safety:**
  If an email was already ingested, CardTracker's 3-tier idempotency system detects the duplicate reference or message ID and returns `{ success: true, action: "DISCARDED_TIER1" }` or `"DISCARDED_TIER2"`. Apps Script safely applies the processed label without creating duplicate records.
- **CardTracker Inbox Review:**
  New unmapped merchants will appear under **Needs Review** at `/inbox` on your CardTracker dashboard for quick one-tap categorization and rule learning.
