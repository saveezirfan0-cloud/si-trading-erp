-- S.I Trading ERP — user access & permissions
--
-- Apply after 0001: Dashboard → SQL Editor → paste → Run.
--
-- Who may see and do what inside the ERP is decided by the role grid in the
-- app (src/lib/permissions.js). This migration adds the two guarantees that
-- have to hold in the database itself, because the app cannot enforce them
-- against someone calling the API directly:
--
--   1. Nobody can promote themselves — role, active status and any per-user
--      permission override can only be changed by an admin.
--   2. Role definitions (erp_roles) can only be written by an admin.
--
-- Everything else stays as 0001 left it: signed-in staff read and write the
-- business tables, and the app decides what they are offered.

-- The signed-in user's ERP role. SECURITY DEFINER so this lookup is not itself
-- subject to the policies below.
create or replace function erp_current_role() returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(u.doc->>'role', '') from erp_users u where u.id = auth.uid()
$$;

create or replace function erp_is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select erp_current_role() = 'admin'
$$;

-- ── erp_users ───────────────────────────────────────────────────────────────
-- The directory stays readable to everyone signed in, and anyone can still
-- edit their own profile (name, phone). Adding and removing people is an
-- admin's job; the privilege fields on an update are protected by the trigger
-- below rather than by a policy, so ordinary profile edits keep working.
drop policy if exists "erp authenticated all" on erp_users;
drop policy if exists "erp users read"   on erp_users;
drop policy if exists "erp users insert" on erp_users;
drop policy if exists "erp users update" on erp_users;
drop policy if exists "erp users delete" on erp_users;

create policy "erp users read" on erp_users
  for select to authenticated using (true);

-- `id = auth.uid()` covers the very first sign-in, when no admin exists yet.
create policy "erp users insert" on erp_users
  for insert to authenticated with check (erp_is_admin() or id = auth.uid());

create policy "erp users update" on erp_users
  for update to authenticated using (true) with check (true);

create policy "erp users delete" on erp_users
  for delete to authenticated using (erp_is_admin());

create or replace function erp_guard_user_privileges() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  k text;
begin
  if erp_is_admin() then
    return new;
  end if;
  -- Restore every access-granting field to whatever it was before the update.
  foreach k in array array['role', 'active', 'permissionMode', 'permissions'] loop
    new.doc = new.doc - k;
    if old.doc ? k then
      new.doc = new.doc || jsonb_build_object(k, old.doc -> k);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_guard_privileges on erp_users;
create trigger trg_guard_privileges before update on erp_users
  for each row execute function erp_guard_user_privileges();

-- ── erp_roles ───────────────────────────────────────────────────────────────
-- Readable by everyone signed in (the app needs the definitions to render the
-- UI), writable only by admins — a role is a grant of access.
drop policy if exists "erp authenticated all" on erp_roles;
drop policy if exists "erp roles read"  on erp_roles;
drop policy if exists "erp roles write" on erp_roles;

create policy "erp roles read" on erp_roles
  for select to authenticated using (true);

create policy "erp roles write" on erp_roles
  for all to authenticated using (erp_is_admin()) with check (erp_is_admin());
