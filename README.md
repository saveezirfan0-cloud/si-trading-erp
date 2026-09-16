# S.I Trading & Co. — ERP System

A full-featured Enterprise Resource Planning system built with React and **Supabase**
(Postgres + Auth + Realtime + Edge Functions), deployed on Vercel.

## Setup — connect a Supabase project

The app is not tied to any particular Supabase project; it reads its connection
from environment variables. To bring up a working instance:

1. **Create a Supabase project** (supabase.com → New project).
2. **Apply the schema** — Dashboard → SQL Editor → paste and run
   [`supabase/migrations/0001_erp_schema.sql`](supabase/migrations/0001_erp_schema.sql),
   then [`supabase/migrations/0002_user_permissions.sql`](supabase/migrations/0002_user_permissions.sql),
   [`supabase/migrations/0003_activity_trash_attachments.sql`](supabase/migrations/0003_activity_trash_attachments.sql)
   and [`supabase/migrations/0004_lock_down_permission_functions.sql`](supabase/migrations/0004_lock_down_permission_functions.sql).
   The first creates the `erp_*` tables with row-level security, realtime and the
   private `erp-scans` storage bucket; the second locks down the two tables that
   define access, so nobody can promote themselves through the API; the third
   adds the append-only `erp_activity` audit table, the trash indexes and the
   private `erp-attachments` bucket; the fourth takes the access-control helper
   functions off the public REST API. All four are safe to re-run.
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
   account to sign in is given the `admin` role automatically. Add everyone
   else from **Users & Roles** in the sidebar — see below.

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
| `ANTHROPIC_MODEL` | optional, default `claude-opus-5` |
| `OPENAI_MODEL` | optional, default `gpt-4o-mini` |

**Key rotation** is automatic: the starting key advances every minute across the
list, and on any failure (rate limit, quota, auth) the function tries the next
key and then the other provider. Paste as many keys as you like. With no keys
configured the scanner reports that clearly instead of failing silently.

## AI invoice / quotation from text

**Sales → AI Invoice / Quote** (`/sales/ai`). Type what you want in plain words:

```
Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=
```

Press **Create document** and the request is read by AI, the customer and each
line are matched against your customer and inventory lists, and the result
opens in the normal sales form — numbered, priced and totalled — for you to
check and save. Nothing is stored until you press Save. The notice at the top
says what was read and lists anything to look at: a customer that is not in
the list (one click adds them), a line that did not match inventory (kept as a
custom item), a line with no price.

What it understands:

- **Quotation or invoice** — "quotation", "quote" or "estimate" makes a `QT-`
  quotation; anything else an `SI-` invoice.
- **Customer** — `Name: …`, `M/s …` or "quotation for …", plus `Kind Attention:`,
  `Phone:`, `Address:`, `Ref:`, `Date:` (DD/MM/YYYY) and `Valid till:`.
- **Items**, one per line — `4 pcs Demolition Hammer @ 23000/=`,
  `Angle Grinder x 2 @ Rs 8,500`, `Pipe Wrench 24" 6 pcs 1450`. A line with no
  price takes the inventory sale price.
- **Discount** — `Discount 10%` for the document or `… @ 15000 less 5%` per line.
- **Notes / Terms** lines.

It uses the same Edge Function secrets as the OCR scanner. Deploy it with:

```bash
supabase functions deploy ai-document
```

If the function is not deployed, has no keys, or cannot be reached, a built-in
reader in the browser handles the common shapes above instead, and the notice
says so — the feature keeps working, you just check the result more carefully.

### The customer is a company, the contact is a person

A customer record has always had both a **Full Name** and a **Company**, so a
business can be filed under its own name ("Fatimi Traders") or under the person
you deal with ("Mr. Zaheer" of "ARY Laguna"). Documents now carry both, and
every screen addresses them the same way: the company heads the address, the
person goes on the line below, and "Kind attention" is only added when it names
somebody not already shown. That rule lives in `partyLines` in
`src/lib/invoices.js`, and the printed document, the quick view and the invoice
list all read it.

The AI screen fills both fields. `Name:` becomes the company and
`Kind Attention:` becomes the contact, and a customer is found by **either** —
so "ARY Laguna Karachi Pvt Ltd" matches the record filed under "Mr. Zaheer"
with that company. When nothing matches, "Add as new customer" files it in the
same shape: business in Company, person in Full Name. Nothing is saved under
the wrong one by mistake.

### Finding a customer

The customer box on the sales forms is a search box, not a dropdown: with
hundreds of customers the native list was unusable. Type any part of the name,
company, phone, city or email. It is the same picker the line items use
(`src/components/ui/ItemPicker.js`), pointed at different fields.

### Quotations

Quotations are sales documents of their own: they get `QT-` numbers, print with
a "Quotation" heading, a "Kind Attention" line and a "Valid Until" date, and
never count as money — they stay out of revenue, balances due and overdue
figures whatever their status. The Sales Invoices list has a **Type** filter to
show quotations or invoices alone, and a quotation's page has
**Convert to Invoice**, which raises a new `SI-` invoice with the same lines and
links the two.

## Audit trail, approvals and trash

Every write the app makes goes through `src/lib/db.js`, which stamps the acting
user onto the record and appends an entry to the append-only `erp_activity`
table with a field-level diff. That gives four things:

* **Who did what** — each invoice shows *Created by … · Last updated by …*, and
  the invoice lists carry a **Last Updated** column with the person and how long
  ago. Attribution comes from the signed-in profile, so it survives edits made
  from any device.
* **Per-record history** — the **Activity history** panel on an invoice (and the
  **History** button on any list row or trashed record) shows every change:
  who, when, and each field's old → new value.
* **Audit Log** (sidebar → System → Audit Log) — the company-wide view of every
  create, edit, approval, delete, restore and import, filterable by module,
  action, person and period, and exportable to CSV. The table grants staff
  `select` and `insert` only: nobody can rewrite or erase the trail from the
  app.
* **Trash** (sidebar → System → Trash) — deleting a record no longer destroys
  it. `remove()` stamps `doc.deletedAt` and every list filters those rows out,
  so a mistaken delete is one click from being restored, invoice number and all.
  Only admins (the `purge` permission) can delete something permanently, and the
  audit entry survives even then.

### Invoice approval flow

Sales and purchase invoices carry the approval step in the same status field:

```
draft → pending_review → approved → unpaid → partial → paid
              ↑ sent back                      └────→ cancelled
```

Anyone with write access can **Submit for Review**; only admins and managers
(the `approve` permission) can **Approve**, **Send Back to Draft** or
**Withdraw Approval**, and the invoice records who approved it and when. Drafts
and invoices still under review are deliberately excluded from revenue,
purchases and outstanding totals — on the invoice lists and on the dashboard —
because nothing is owed until an invoice is approved. An **Awaiting Approval**
stat card and a status filter on both invoice lists show what is queued.

### Attachments

Any invoice can carry as many documents as it needs — the supplier's own PDF, a
signed delivery note, a payment slip — added either from the list's quick view
or from the invoice page. Both surfaces render the same panel, so a file added
in one appears in the other, and each add or remove is recorded in the audit
log. A paperclip in the list marks invoices that carry paperwork.

Three shapes exist in the data for historical reasons, and
[`src/lib/attachments.js`](src/lib/attachments.js) flattens all of them into one
list so nothing attached before is stranded:

| Field | Written by | Bucket |
|---|---|---|
| `doc.scanPath` | the OCR scan screen | `erp-scans` |
| `doc.attachmentPath` | the quick view, before this | `erp-scans` |
| `doc.attachments[]` | everything now | `erp-attachments` |

The OCR photo still shows on the invoice as the first entry, labelled as coming
from the scan. Removing any entry clears the right field and deletes the stored
object.

---

## Modules

| Module | Features |
|--------|----------|
| **Customers** | Add/edit/delete, balance tracking, type (retail/wholesale/corporate), CSV export |
| **Suppliers** | Contact info, payment terms, bank details, balance |
| **Inventory** | Brand, code, description, cost/sale price, stock levels, reorder alerts, warehouse assignment |
| **Warehouses** | Multiple locations, manager, capacity |
| **Sales / Purchase Invoices** | Line items, review & approval workflow, attachments, per-record history, soft delete |
| **Chart of Accounts** | Asset, Liability, Equity, Income, Expense types |
| **Bank & Cash** | Receipts & payments, account linking, cheque tracking |
| **Journal Entries** | Double-entry bookkeeping with balanced debit/credit validation |
| **Payments** | Supplier payments & customer receipts, multi-method |
| **Expenses** | Category tracking, recurring support |
| **Reports** | P&L, Balance Sheet, Cash Flow, Expense breakdown |
| **Users & Roles** | Admin, Manager, Accountant, Staff, Viewer permissions |
| **Audit Log** | Every change across the ERP with the user, the diff, filters and CSV export |
| **Trash** | Soft-deleted records from every module, restore or permanent delete |
| **Data Import** | CSV upload for Customers, Suppliers, Inventory |
| **WhatsApp** | Message templates, wa.me link generation |
| **Settings** | Company info, currency, fiscal year |

---

## Tech Stack

- **Frontend:** React 18, React Router v6
- **Database:** Supabase Postgres (jsonb document tables, realtime)
- **Auth:** Supabase Auth (email/password)
- **Storage:** Supabase Storage (`erp-scans` for OCR photos, `erp-attachments`
  for files staff attach to records)
- **AI OCR:** Supabase Edge Function calling Anthropic / OpenAI vision with key rotation
- **AI documents:** Supabase Edge Function turning a typed request into an invoice or quotation
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

## Users, access and permissions

Everything to do with access lives on one page: **Users & Roles** in the
sidebar (`/users`), under SYSTEM. It has two tabs.

### Users tab

**Add User** creates the Supabase Auth login and the ERP profile in one step —
name, email, password, role — and the new person can sign in immediately. The
admin doing the creating stays signed in (the sign-up runs on an isolated
client so it cannot take over the current session).

Per user you can also:

- **Edit** — name, phone, role, active/inactive.
- **Access** — keep the role's permissions, or switch to a permission grid for
  that person alone.
- **Password** — change your own, or email anyone else a reset link.
- **Deactivate / Remove** — a deactivated user can sign in but sees a "no
  access" screen. Removing deletes the ERP profile; the Supabase Auth login
  itself has to be deleted in the Supabase dashboard.

The ERP will not let you demote, deactivate or remove the last active admin.
Someone who exists in Supabase Auth but has no ERP profile is provisioned as an
**inactive viewer** on first sign-in and waits for an admin to let them in.

### Roles & Permissions tab

A role is a grid of **modules × actions** — view, create, edit, delete, export
for each of the 18 modules. The built-in roles can be edited (and reset), and
you can add your own, e.g. "Warehouse Supervisor":

| Role | Intent |
|------|--------|
| **Admin** | Full access, fixed. Cannot be edited or emptied, so the system always has an administrator. |
| **Manager** | Runs day-to-day trading and accounting; sees users but cannot change them. |
| **Accountant** | Owns the accounting modules; reads the trading side. |
| **Staff** | Creates and edits invoices and master data. No deletes, no accounting. |
| **Viewer** | Read-only across trading, accounting and reports. |

Custom and edited roles are stored in `erp_roles`; the built-in definitions
live in [`src/lib/permissions.js`](src/lib/permissions.js).

### How it is enforced

- **Navigation** — the sidebar and mobile bottom bar only list pages you can view.
- **Routes** — a page you lack `view` on redirects to the first one you can open.
- **Writes** — every create/edit/delete goes through `src/lib/db.js`, which
  checks the module's permission before touching the database, so no screen can
  forget to.
- **Database** — `erp_roles` is admin-only, and a trigger on `erp_users` throws
  away any change a non-admin makes to `role`, `active` or a permission
  override. That is what stops privilege escalation through the API; the layers
  above it are the app being tidy.

Adding users and editing roles is deliberately admin-only, in the app and in
the database alike. Other roles can be given `view` on Users & Roles to see the
directory.

### Approvals, the audit log and the trash

Three of the grants in that grid come from the audit work rather than plain
CRUD:

- **Approve** (Sales Invoices, Purchase Invoices) — sign off an invoice that is
  pending review. Admins and managers hold it by default.
- **Audit Log** — `view` opens the company-wide log of who changed what;
  `export` downloads it. Managers and accountants have it; staff and viewers do
  not, because it shows everyone's activity.
- **Trash** — `view` lists deleted records, `edit` restores one, `delete`
  destroys it for good. Restoring or purging also needs the matching permission
  on the record's own module, so someone who cannot delete invoices cannot
  destroy one from the trash either.

---

## Database tables

Each is a document table of `(id uuid, doc jsonb, "createdAt", "updatedAt")`.

```
erp_customers          erp_accounts        erp_users
erp_suppliers          erp_journals        erp_roles
erp_inventory          erp_transactions    erp_imports
erp_warehouses         erp_payments        erp_settings
erp_sales_invoices     erp_expenses        erp_brands
erp_purchase_invoices  erp_ocr_drafts      erp_activity
```

All have row-level security enabled: signed-in staff can read and write,
anonymous visitors get nothing. `erp_roles` and the privilege fields of
`erp_users` are further restricted to admins by migration 0002. `erp_activity`
is the other exception — staff can read and append to it but there is no update
or delete policy, so the audit trail cannot be altered through the API.

Deleted records stay in their own table with `doc.deletedAt` set; every query in
`src/lib/db.js` filters them out, and the Trash page is the only place they are
listed.

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

The app is a full progressive web app: installed it gets its own home-screen
icon, opens full screen with no address bar, and still opens cached pages when
the phone loses signal. Settings → **App** shows these same steps in-product.

### Android (Chrome)

1. Open the deployed **https://** URL in Chrome and sign in.
2. Tap the **⋮** menu (top right).
3. Tap **Install app** — on older Chrome builds it reads **Add to Home screen**.
4. Confirm with **Install**. The gold *SI* icon appears in your app drawer and
   home screen, and launches without browser chrome.

The app also offers a one-tap **Install** banner ~30 seconds into a session.
Dismissing it snoozes the banner for 14 days.

If **Install app** doesn't appear in the menu, Chrome has judged the app not
installable. It requires, all at once: an HTTPS origin (`localhost` also
counts), a reachable `manifest.json` with `name`, `short_name`, `start_url`,
`display: standalone` and 192 px + 512 px PNG icons, and a registered service
worker with a `fetch` handler. Check DevTools → *Application → Manifest* over
`chrome://inspect` remote debugging, which names whichever one is missing.

### iOS (Safari)

1. Open the URL in **Safari** — Chrome and Firefox on iOS cannot install PWAs.
2. Tap the **Share** button.
3. Scroll down, tap **Add to Home Screen**, then **Add**.

### Icons and splash screens

Every icon (`logo192.png`, `logo512.png`, their `-maskable` variants,
`apple-touch-icon.png`, `favicon.ico`) and the iOS splash screens are generated
from code — no design tool or dependency needed:

```bash
python3 tools/icons/generate_icons.py
```

Edit the brand colours or the monogram geometry at the top of that script and
re-run it to regenerate the whole set. The `-maskable` variants keep the logo
inside the 80% safe zone so Android can crop them to the launcher's shape
(circle, squircle, rounded square) without clipping.

---

## Project Structure

```
si-trading-erp/
├── public/
│   ├── index.html
│   ├── manifest.json          ← PWA manifest
│   ├── sw.js                  ← Service worker (offline shell + caching)
│   ├── logo*.png              ← Generated PWA icons (any + maskable)
│   └── splash/                ← Generated iOS launch screens
├── src/
│   ├── App.js                 ← Routes
│   ├── index.js               ← Entry point + SW registration
│   ├── contexts/
│   │   ├── AuthContext.js     ← Supabase auth + profile + permission gate
│   │   └── AppContext.js      ← Global state (currency, sidebar)
│   ├── lib/
│   │   ├── supabase.js        ← Supabase client (env-driven)
│   │   ├── db.js              ← CRUD, write permissions, attribution, soft delete
│   │   ├── permissions.js     ← Modules, actions and built-in roles
│   │   ├── audit.js           ← Acting user, diffing, activity log reads/writes
│   │   ├── invoices.js        ← Filtering, sorting and totals for the lists
│   │   ├── attachments.js     ← One list of an invoice's documents
│   │   ├── invoiceStatus.js   ← Invoice statuses and the approval flow
│   │   ├── salesDocs.js       ← Invoice vs quotation: numbering, titles, totals
│   │   ├── aiDocument.js      ← Typed request → draft document (with local reader)
│   │   ├── match.js           ← Fuzzy matching against customers and inventory
│   │   ├── datetime.js        ← Shared date/time formatting
│   │   └── export.js          ← CSV + PDF export utilities
│   ├── components/
│   │   ├── layout/            ← Sidebar, Header, Layout
│   │   ├── invoices/          ← Shared list, filters, quick view, ApprovalBar
│   │   └── ui/                ← Shared UI, PermissionMatrix, RecordMeta,
│   │                            ActivityFeed, Attachments
│   ├── pages/
│   │   ├── Login.js
│   │   ├── NoAccess.js        ← Signed in, but deactivated or ungranted
│   │   ├── Dashboard.js
│   │   ├── customers/
│   │   ├── suppliers/
│   │   ├── inventory/
│   │   ├── warehouses/
│   │   ├── accounting/        ← Accounts, Bank, Journals, Payments, Expenses
│   │   ├── reports/
│   │   ├── users/             ← Users & Roles (add users, permissions)
│   │   ├── audit/             ← Company-wide audit log
│   │   ├── trash/             ← Deleted records, restore / purge
│   │   ├── import/
│   │   ├── WhatsApp.js
│   │   └── Settings.js
│   └── styles/
│       └── globals.css        ← Design system + CSS variables
├── .env.example               ← Copy to .env.local
├── supabase/
│   ├── migrations/            ← database schema
│   ├── functions/ocr-invoice/ ← AI OCR edge function
│   └── functions/ai-document/ ← AI invoice / quotation from text
├── tools/manager-import/      ← Manager.io extraction + seed SQL
├── vercel.json                ← SPA routing
└── package.json
```

---

## Support

Built for S.I Trading & Co. — a complete ERP system ready for production use.
