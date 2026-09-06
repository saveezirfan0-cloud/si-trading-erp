-- S.I Trading ERP — restrict the access-control helper functions
--
-- Apply after 0003: Dashboard → SQL Editor → paste → Run. Safe to re-run.
--
-- 0002 added three SECURITY DEFINER functions. Supabase grants EXECUTE on new
-- functions to `anon` and `authenticated` by default, which left all three
-- callable over the REST API as /rest/v1/rpc/<name> — including by visitors who
-- are not signed in. Nothing leaks today (they answer about the *caller*, and
-- for `anon` that is nobody), but an unauthenticated entry point into the code
-- that decides who is an admin has no reason to exist.
--
-- What each function actually needs:
--
--   erp_current_role() / erp_is_admin()
--     Called from inside the RLS policies on erp_users and erp_roles, which
--     PostgreSQL evaluates as the querying user — so `authenticated` must keep
--     EXECUTE or every policy check would fail. `anon` never needs them: no
--     policy on those tables applies to `anon`.
--
--   erp_guard_user_privileges()
--     A trigger function. Triggers fire as part of the table operation and are
--     not permission-checked against the caller, so nobody needs EXECUTE.
--
-- Deliberately untouched: erp_login_email(), which `anon` MUST be able to call
-- — it turns a username or phone number into an email address on the login
-- screen, before anyone is signed in.

-- Revoking from PUBLIC clears the implicit grant; the explicit per-role grants
-- Supabase added are then removed by naming those roles too.
revoke execute on function public.erp_current_role() from public, anon;
grant  execute on function public.erp_current_role() to authenticated, service_role;

revoke execute on function public.erp_is_admin() from public, anon;
grant  execute on function public.erp_is_admin() to authenticated, service_role;

revoke execute on function public.erp_guard_user_privileges() from public, anon, authenticated;
