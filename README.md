# CardTracker - Real-Time Expense Tracking Engine & Dashboard (PWA)

A production-ready, mobile-first Personal Finance Progressive Web App tailored for the Indian payment ecosystem (**Kiwi RuPay UPI, Axis Neo, Other Axis Credit Cards, and Direct Bank UPI**). Designed for **₹0 recurring cost** on free tiers (Vercel Hobby, Supabase Free, Google Apps Script, Groq Free Tier) with **no custom domain required**.

---

## 🏗️ Architecture & Security Model

```
Bank / Credit Card Email (Axis / Kiwi)
       │
       ▼
     Gmail
       │
       ▼ (Scheduled Google Apps Script Polling)
POST /api/ingest/email (Authorization: Bearer <INGESTION_SECRET_TOKEN>)
       │
       ├─► 1. 3-Tier Idempotency (bank_reference_id -> message_id -> time fingerprint)
       ├─► 2. Parser & Normalizer (Axis, Kiwi, RuPay, UPI)
       ├─► 3. Deterministic Merchant Rules (Self-Learning)
       ├─► 4. Groq AI Fallback (Llama-3.3-70b-versatile, zero hallucination)
       │
       ▼
Supabase Database (PostgreSQL with RLS)
       │
       ▼
Mobile-First Dashboard (Next.js PWA)
```

### Strict Security Rules Enforced:
1. **API Keys Isolation:**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Safe for client browser.
   - `SUPABASE_SERVICE_ROLE_KEY`: Server-side only. NEVER exposed to frontend.
   - `GROQ_API_KEY`: Server-side only. NEVER exposed to frontend.
2. **Ingestion API Security:**
   - Protected by `INGESTION_SECRET_TOKEN` via `Authorization: Bearer <token>`.
   - Rejects missing or invalid tokens with HTTP 401.
   - Client-provided `user_id` is explicitly disallowed to prevent account spoofing; transactions are bound strictly to the single authenticated personal account context.
3. **Google Apps Script Failure Safety:**
   - `CardTracker/Processed` label is **only** applied to an email thread after the ingestion API returns a 2xx success response.
   - Unsuccessful requests leave the email untouched in Gmail, enabling automatic retry on subsequent scheduled runs.
   - Never marks emails as read.

---

## 📬 Email Ingestion Setup (Google Apps Script)

CardTracker uses a lightweight, scheduled Google Apps Script to poll Gmail for bank alerts.

See the complete step-by-step setup guide at **[`google-apps-script/README.md`](google-apps-script/README.md)**:
- Script file: [`google-apps-script/Code.gs`](google-apps-script/Code.gs)
- Gmail Search Query: `from:(axisbank.com OR kiwi.money) -label:CardTracker/Processed newer_than:7d`
- Script Properties: `CARDTRACKER_INGEST_URL` and `CARDTRACKER_INGESTION_TOKEN`
- One-click trigger setup via `setupRecurringTrigger()` (runs every 5 minutes).

---

## 🗄️ Database Setup (Supabase)

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Run the script located at [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
3. The migration automatically:
   - Creates enums (`payment_rail`, `tx_status`, `tx_type`).
   - Creates all tables (`payment_instruments`, `categories`, `merchant_rules`, `budgets`, `transactions`).
   - Enables Row Level Security (RLS) on all tables with user ownership policies.
   - Creates full-text search indexing with automatic triggers.
   - Sets up the `on_auth_user_created` trigger that seeds default categories, instruments, and initial rules upon user sign up.

---

## 📐 Authoritative Spending Calculation Contract

All dashboard calculations, category progress bars, and alerts adhere to:
- **`DEBIT` + `CONFIRMED`:** ADD amount to spending.
- **`REFUND` + `CONFIRMED`:** SUBTRACT amount from spending.
- **`TRANSFER`:** EXCLUDE completely (CC bill repayments, peer-to-peer transfers, self-transfers).
- **`EXCLUDED`:** EXCLUDE completely.
- **`PENDING_REVIEW`:** EXCLUDE from confirmed spending totals.

Centralized SQL aggregation logic implemented in `src/app/api/analytics/route.ts` and `src/lib/utils.ts`.

---

## 🛡️ Idempotency Hierarchy

- **Tier 1 (Authoritative):** `bank_reference_id` (UTR / Ref number). Discarded if already existing for the user.
- **Tier 2:** `message_id` (Gmail Message ID passed by Apps Script). Discarded if already existing.
- **Tier 3 (Fallback Fingerprint):** `SHA256(amount + normalized_merchant + round_to_15min(time))`.
- **Safety Rule:** If an identical charge occurs within ±15 minutes, it is **never automatically discarded or merged**. The record is inserted with `is_potential_duplicate = TRUE` and status `'PENDING_REVIEW'` with note: *"Potential duplicate of recent transaction"*.

---

## 🤖 Dynamic Groq AI Fallback Service

Located in [`src/lib/groq.ts`](src/lib/groq.ts):
- Dynamically selects model: `process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'`.
- Enforces strict rail validation: Only accepts `'UPI'`, `'CARD'`, `'NETBANKING'`, or `'CASH'`. Never `'OTHER'`.
- If any rail, merchant, or category is ambiguous, it returns `null` (no hallucinated guesses).
- User confirmations in `/inbox` prompt to save rules to `merchant_rules`, training deterministic memory and reducing AI token usage to near zero.

---

## 📱 Mobile-First Features & UX

1. **Main Dashboard (`/`):**
   - Natural language and quick search (by amount or merchant name).
   - Net Confirmed Spend vs. Current Monthly Budget.
   - Visual progress bar: Green (< 70%), Amber (70-90%), Red (> 90%).
   - Month-over-Month comparison pill (e.g. `↓ 8% vs last month`).
   - Action Required Banner notifying pending review transactions.
   - In-app notification center for budget thresholds (70%, 90%, 100%) and potential duplicates.
   - Two-dimensional breakdown cards: By Rail (UPI vs Card) and By Instrument (Kiwi RuPay vs Axis Neo vs Bank UPI).
   - Real-time category progress bars.
   - Recent transactions feed.

2. **Transaction Review Inbox (`/inbox`):**
   - Displays all `PENDING_REVIEW` transactions.
   - Single-tap category chips: Food, Groceries, Fuel, Transport, Shopping, Healthcare, Bills, Entertainment, Other.
   - Single tap confirms transaction and prompts *"Always categorize [Merchant] as [Category]?"*.
   - Clicking *"Yes, Save Rule"* records deterministic memory in `merchant_rules`.

3. **Fast Manual Entry Modal (`/add`):**
   - Global Floating Action Button (FAB).
   - Large numeric keypad for one-handed thumb entry.
   - Instrument selector and Rail selector (UPI vs CARD).
   - Category grid.

4. **Progressive Web App (PWA):**
   - `manifest.json` configured for standalone mobile display.
   - `sw.js` Service Worker for offline capability.
   - Installable directly to Android and iOS home screens.

---

## 🚀 Running Locally

```bash
# 1. Clone & copy environment variables
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev

# 4. Run tests
npx tsx --test test/spending.test.mjs
node test/ingest-migration.test.mjs
```
