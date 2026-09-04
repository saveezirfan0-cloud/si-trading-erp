# S.I Trading & Co. — ERP System

A full-featured Enterprise Resource Planning system built with React and **Supabase**
(Postgres + Auth + Realtime + Edge Functions), deployed on Vercel.

## What's new (Supabase migration)

- **Firebase → Supabase**: all data lives in Postgres tables (`erp_*`) in project
  `vdrhjjkcnkbzaxuaoonb`, with row-level security (authenticated users only),
  realtime subscriptions, and Supabase Auth for login.
- **Manager.io data imported**: the historical books (2023–2026 `.manager` files)
  were decoded and imported — inventory items, customers, suppliers, and the full
  purchase/sales invoice history with dates, line items and prices.
  See `tools/manager-import/` for the extractor and importer.
- **AI OCR invoice scanning**: photograph a supplier invoice → AI vision reads the
  items → review & confirm → the purchase invoice is created and stock quantities,
  item cost prices and the supplier balance are updated automatically.
- **Manager.io-style UI**: light theme by default, module sidebar with live record
  counts, blue accent. The dark theme is still available from the header toggle.

## OCR setup (one-time)

The scanner uses AI vision through a Supabase Edge Function (`ocr-invoice`) with
**automatic API-key rotation and provider failover**. Configure keys in
Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEYS` | one or more Anthropic API keys, comma-separated |
| `OPENAI_API_KEYS` | one or more OpenAI API keys, comma-separated |
| `ANTHROPIC_MODEL` | optional, default `claude-haiku-4-5` |
| `OPENAI_MODEL` | optional, default `gpt-4o-mini` |

Rotation: the starting key rotates every minute across the list; on any failure
(rate limit, quota, auth) the function automatically tries the next key, then the
other provider. You can paste any number of keys — they will be used in rotation.
If no keys are configured the scanner shows a clear error explaining what to set.

---

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

## Setup Instructions

### 1. Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `si-trading-erp`
3. Enable **Firestore Database** (start in production mode)
4. Enable **Authentication** → Sign-in method → **Email/Password**
5. Go to **Project Settings** → **Your apps** → **Web** → Register app
6. Copy the config values

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Fill in your Firebase values in `.env.local`:

```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

### 3. Deploy Firestore Rules

Install Firebase CLI if you haven't:
```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
firebase deploy --only firestore:rules
```

### 4. Create First Admin User

In Firebase Console → Authentication → Users → **Add user**:
- Email: `admin@sitrading.com`
- Password: (your choice)

Then in Firestore → **users** collection → **Add document**:
- Document ID: *(paste the UID from Authentication)*
- Fields:
  ```
  name: "Admin"
  email: "admin@sitrading.com"
  role: "admin"
  active: true
  ```

### 5. Install & Run Locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

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
3. Add all `REACT_APP_*` environment variables in Vercel project settings
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

## Firestore Collections

```
customers/       — Customer records
suppliers/       — Supplier records
inventory/       — Inventory items
warehouses/      — Warehouse locations
accounts/        — Chart of Accounts
journals/        — Journal entries (double-entry)
transactions/    — Bank & Cash transactions
payments/        — Supplier/customer payments
expenses/        — Business expenses
users/           — User profiles & roles
imports/         — Import history log
settings/        — Company settings
```

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
│   │   ├── AuthContext.js     ← Firebase auth + user profile
│   │   └── AppContext.js      ← Global state (currency, sidebar)
│   ├── lib/
│   │   ├── firebase.js        ← Firebase init
│   │   ├── db.js              ← Firestore CRUD helpers
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
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── vercel.json                ← SPA routing
└── package.json
```

---

## Support

Built for S.I Trading & Co. — a complete ERP system ready for production use.
