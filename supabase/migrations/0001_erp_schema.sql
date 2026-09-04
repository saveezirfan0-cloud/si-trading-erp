-- S.I Trading ERP — database schema
--
-- Apply to a fresh Supabase project: Dashboard → SQL Editor → paste → Run.
-- (Or: supabase db push, if you use the CLI.)
--
-- Design: every module is a document table of (id uuid, doc jsonb, timestamps).
-- The app's data layer (src/lib/db.js) flattens `doc` into the row, which keeps
-- the schema flexible while still giving Postgres, RLS and realtime.
--
-- Tables are erp_-prefixed so the ERP can share a project with another app if
-- ever needed.

create or replace function erp_touch_updated_at() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  new."updatedAt" = now();
  return new;
end $$;

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
    execute format($f$
      create table if not exists %I (
        id uuid primary key default gen_random_uuid(),
        doc jsonb not null default '{}'::jsonb,
        "createdAt" timestamptz not null default now(),
        "updatedAt" timestamptz not null default now()
      )$f$, t);

    -- Signed-in staff may read and write; anonymous visitors get nothing.
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "erp authenticated all" on %I', t);
    execute format($f$
      create policy "erp authenticated all" on %I
        for all to authenticated using (true) with check (true)$f$, t);

    execute format('drop trigger if exists trg_touch on %I', t);
    execute format('create trigger trg_touch before update on %I
                    for each row execute function erp_touch_updated_at()', t);

    execute format('create index if not exists %I on %I ((doc->>''date''))',
                   t || '_date_idx', t);

    -- realtime, so open lists refresh when another user saves
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Storage for scanned invoice photos (private; signed-in staff only).
insert into storage.buckets (id, name, public)
values ('erp-scans', 'erp-scans', false)
on conflict (id) do nothing;

drop policy if exists "erp scans read" on storage.objects;
create policy "erp scans read" on storage.objects
  for select to authenticated using (bucket_id = 'erp-scans');
drop policy if exists "erp scans write" on storage.objects;
create policy "erp scans write" on storage.objects
  for insert to authenticated with check (bucket_id = 'erp-scans');
drop policy if exists "erp scans update" on storage.objects;
create policy "erp scans update" on storage.objects
  for update to authenticated using (bucket_id = 'erp-scans');
drop policy if exists "erp scans delete" on storage.objects;
create policy "erp scans delete" on storage.objects
  for delete to authenticated using (bucket_id = 'erp-scans');
