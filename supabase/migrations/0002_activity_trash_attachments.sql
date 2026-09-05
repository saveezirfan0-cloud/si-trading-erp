-- S.I Trading ERP — activity log, trash (soft delete) and file attachments
--
-- Apply after 0001_erp_schema.sql: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run.
--
-- What this adds:
--   * erp_activity  — append-only audit trail of every create/update/delete
--                     the app performs, with the acting user and a field-level
--                     diff. Staff can read and insert; nobody can edit or
--                     delete a row through the API, so the trail cannot be
--                     doctored from the browser.
--   * deletedAt indexes — the app soft-deletes records (Trash) by stamping
--                     doc->>'deletedAt'; lists filter on it on every query.
--   * erp-attachments — private bucket for files staff attach to records
--                     (delivery notes, payment proofs, supplier PDFs).

-- ── Activity log ─────────────────────────────────────────────────────────────
create table if not exists erp_activity (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table erp_activity enable row level security;

-- Read + append only. No update/delete policy exists, so PostgREST refuses
-- both for every signed-in user.
drop policy if exists "erp authenticated all" on erp_activity;
drop policy if exists "erp activity read" on erp_activity;
create policy "erp activity read" on erp_activity
  for select to authenticated using (true);
drop policy if exists "erp activity append" on erp_activity;
create policy "erp activity append" on erp_activity
  for insert to authenticated with check (true);

create index if not exists erp_activity_at_idx on erp_activity ((doc->>'at') desc);
create index if not exists erp_activity_record_idx
  on erp_activity ((doc->>'collection'), (doc->>'recordId'));
create index if not exists erp_activity_user_idx on erp_activity ((doc->>'userId'));

do $$
begin
  execute 'alter publication supabase_realtime add table erp_activity';
exception when duplicate_object then null;
end $$;

-- ── Trash: index the soft-delete marker every list query filters on ──────────
do $$
declare
  t text;
  tables text[] := array[
    'erp_customers','erp_suppliers','erp_inventory','erp_warehouses',
    'erp_accounts','erp_journals','erp_transactions','erp_payments',
    'erp_expenses','erp_users','erp_roles','erp_imports','erp_settings',
    'erp_sales_invoices','erp_purchase_invoices','erp_brands','erp_ocr_drafts'
  ];
begin
  foreach t in array tables loop
    execute format('create index if not exists %I on %I ((doc->>''deletedAt''))',
                   t || '_deleted_idx', t);
  end loop;
end $$;

-- ── Attachments bucket (private; signed-in staff only) ───────────────────────
insert into storage.buckets (id, name, public)
values ('erp-attachments', 'erp-attachments', false)
on conflict (id) do nothing;

drop policy if exists "erp attachments read" on storage.objects;
create policy "erp attachments read" on storage.objects
  for select to authenticated using (bucket_id = 'erp-attachments');
drop policy if exists "erp attachments write" on storage.objects;
create policy "erp attachments write" on storage.objects
  for insert to authenticated with check (bucket_id = 'erp-attachments');
drop policy if exists "erp attachments update" on storage.objects;
create policy "erp attachments update" on storage.objects
  for update to authenticated using (bucket_id = 'erp-attachments');
drop policy if exists "erp attachments delete" on storage.objects;
create policy "erp attachments delete" on storage.objects
  for delete to authenticated using (bucket_id = 'erp-attachments');
