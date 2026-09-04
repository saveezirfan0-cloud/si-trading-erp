# S.I Trading & Co. — ERP System

A full-featured Enterprise Resource Planning system built with React and **Supabase**
(Postgres + Auth + Realtime + Edge Functions), deployed on Vercel.

## Setup — connect a Supabase project

The app is not tied to any particular Supabase project; it reads its connection
from environment variables. To bring up a working instance:

1. **Create a Supabase project** (supabase.com → New project).
2. **Apply the schema** — Dashboard → SQL Editor → paste and run
   [`supabase/migrations/0001_erp_schema.sql`](supabase/migrations/0001_erp_schema.sql).
   This creates the `erp_*` tables with row-level security, realtime and the
   private `erp-scans` storage bucket.
3. **Set the environment variables** in Vercel (Project → Settings →
   Environment Variables) and in `.env.local` for local development:

   | Variable | Value |
   |---|---|
   | `REACT_APP_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
   | `REACT_APP_SUPABASE_ANON_KEY` | the project's publishable / anon key |

   Both are browser-safe publishable values. Never put a service-role key here.
4. **Redeploy.** Until the variables are set the app shows a setup screen
   explaining exactly what is missing, rather than a login form that cannot work.
5. **Create your first user** in Supabase → Authentication → Users. The first
   account to sign in is given the `admin` role automatically; manage everyone
   else from the Users page.

## Importing the Manager.io books

`tools/manager-import/` decodes the historical `.manager` desktop files
(SQLite databases whose records are protobuf blobs) and produces SQL you can run
against your project:

```bash
python3 tools/manager-import/extract.py "/path/to/Manager" ./out
python3 tools/manager-import/make_seed_sql.py ./out ./seed.sql
# then run seed.sql in the Supabase SQL editor
```

This recovers inventory items, customers (names are rebuilt from the audit trail
where the live records had been blanked), suppliers, and the full purchase and
sales invoice history with line items, quantities and rates. Entities are merged
across the 2023–2026 books by name, since the older book uses different GUIDs.
Loads are idempotent — re-running updates rather than duplicating.

The date epoch was calibrated against a known paper invoice and verified:
document 588 decodes to 2026-08-18 with all seven lines matching the printed
amounts exactly (₨538,340).

**Known limitation:** only invoices are extracted, not payment/receipt records,
so imported invoices are marked paid and supplier/customer balances start at
zero. Real outstanding balances need to be set as opening balances afterwards.

## AI OCR invoice scanning

Photograph a supplier invoice → AI vision reads the line items → you review and
confirm → the purchase invoice is created and stock quantities, item cost prices
and the supplier balance are updated.

Deploy the Edge Function to your project:

```bash
supabase functions deploy ocr-invoice
```

Then set the keys in Supabase → Project Settings → Edge Functions → Secrets:

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEYS` | one or more Anthropic API keys, comma-separated |
| `OPENAI_API_KEYS` | one or more OpenAI API keys, comma-separated |
| `ANTHROPIC_MODEL` | optional, default `claude-haiku-4-5` |
| `OPENAI_MODEL` | optional, default `gpt-4o-mini` |

**Key rotation** is automatic: the starting key advances every minute across the
list, and on any failure (rate limit, quota, auth) the function tries the next
key and then the other provider. Paste as many keys as you like. With no keys
configured the scanner reports that clearly instead of failing silently.

## Modules

| Module | Features |
|--------|----------|
| **Customers** | Add/edit/delete, balance tracking, type (retail/wholesale/corporate), CSV export |
| **Suppliers** | Contact info, payment terms, bank details, balance |
| **Inventory** | Brand, code, description, cost/sale price, stock levels, reorder alerts, warehouse assignment |
| **Warehouses** | Multiple locations, manager, capacity |
| **Chart of Accounts** | Asset, Liability, Equity, Income, Expense types |
| **Bank & Cash** | Receipts & payments, account linking, cheque tracking |
| **Journal Entries** | Double-entry bookkeeping with balanced debit/credit validation |
| **Payments** | Supplier payments & customer receipts, multi-method |
| **Expenses** | Category tracking, recurring support |
| **Reports** | P&L, Balance Sheet, Cash Flow, Expense breakdown |
| **Users & Roles** | Admin, Manager, Accountant, Staff, Viewer permissions |
| **Data Import** | CSV upload for Customers, Suppliers, Inventory |
| **WhatsApp** | Message templates, wa.me link generation |
| **Settings** | Company info, currency, fiscal year |

---

## Tech Stack

- **Frontend:** React 18, React Router v6
- **Database:** Supabase Postgres (jsonb document tables, realtime)
- **Auth:** Supabase Auth (email/password)
- **Storage:** Supabase Storage (`erp-scans` bucket for invoice photos)
- **AI OCR:** Supabase Edge Function calling Anthropic / OpenAI vision with key rotation
- **Charts:** Recharts
- **PDF Export:** jsPDF + AutoTable
- **CSV:** PapaParse
- **Notifications:** react-hot-toast
- **Icons:** Lucide React
- **Hosting:** Vercel

---

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option B — Vercel Dashboard
1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Add `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` in Vercel project settings
4. Click **Deploy**

The `vercel.json` handles SPA routing automatically.

---

## User Roles

| Role | Permissions |
|------|------------|
| **admin** | Full access — read, write, delete, import, manage users |
| **manager** | Read, write, export, import |
| **accountant** | Read, write, export |
| **staff** | Read, write |
| **viewer** | Read only |

---

## Database tables

Each is a document table of `(id uuid, doc jsonb, "createdAt", "updatedAt")`.

```
erp_customers          erp_accounts        erp_users
erp_suppliers          erp_journals        erp_roles
erp_inventory          erp_transactions    erp_imports
erp_warehouses         erp_payments        erp_settings
erp_sales_invoices     erp_expenses        erp_brands
erp_purchase_invoices  erp_ocr_drafts
```

All have row-level security enabled: signed-in staff can read and write,
anonymous visitors get nothing.

---

## CSV Import Format

### Customers
```
name,company,email,phone,city,country,type,balance
John Doe,ABC Corp,john@abc.com,03001234567,Karachi,Pakistan,retail,0
```

### Suppliers
```
name,company,email,phone,city,category,paymentTerms
Ali Traders,Ali & Co,ali@traders.com,03211234567,Lahore,goods,30
```

### Inventory
```
code,brand,name,category,unit,costPrice,salePrice,quantity,reorderLevel
ITM001,Samsung,Galaxy A15,Electronics,pcs,45000,52000,10,3
```

---

## PWA — Install on Mobile

1. Open the deployed URL in Chrome (Android) or Safari (iOS)
2. **Android:** Tap the browser menu → "Add to Home Screen"
3. **iOS:** Tap Share → "Add to Home Screen"

The app works fully offline for viewing cached data.

---

## Project Structure

```
si-trading-erp/
├── public/
│   ├── index.html
│   └── manifest.json          ← PWA manifest
├── src/
│   ├── App.js                 ← Routes
│   ├── index.js               ← Entry point + SW registration
│   ├── contexts/
│   │   ├── AuthContext.js     ← Supabase auth + user profile
│   │   └── AppContext.js      ← Global state (currency, sidebar)
│   ├── lib/
│   │   ├── supabase.js        ← Supabase client (env-driven)
│   │   ├── db.js              ← Postgres document CRUD helpers
│   │   └── export.js          ← CSV + PDF export utilities
│   ├── components/
│   │   ├── layout/            ← Sidebar, Header, Layout
│   │   └── ui/                ← Shared UI components
│   ├── pages/
│   │   ├── Login.js
│   │   ├── Dashboard.js
│   │   ├── customers/
│   │   ├── suppliers/
│   │   ├── inventory/
│   │   ├── warehouses/
│   │   ├── accounting/        ← Accounts, Bank, Journals, Payments, Expenses
│   │   ├── reports/
│   │   ├── users/
│   │   ├── import/
│   │   ├── WhatsApp.js
│   │   └── Settings.js
│   └── styles/
│       └── globals.css        ← Design system + CSS variables
├── .env.example               ← Copy to .env.local
├── supabase/
│   ├── migrations/            ← database schema
│   └── functions/ocr-invoice/ ← AI OCR edge function
├── tools/manager-import/      ← Manager.io extraction + seed SQL
├── vercel.json                ← SPA routing
└── package.json
```

---

## Support

Built for S.I Trading & Co. — a complete ERP system ready for production use.
