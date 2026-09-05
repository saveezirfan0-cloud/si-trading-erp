// Supabase Edge Function: admin-users
//
// Creating a user from the browser with supabase.auth.signUp() signs the NEW
// user in, throwing the administrator out of their own session. User creation
// therefore happens here, with the service-role key, after checking that the
// caller is an admin.
//
// It also lets an admin set someone's password directly. Staff who sign in with
// a phone number or username have no mailbox, so the "email me a reset link"
// route cannot serve them.
//
// Actions: create | set_password | delete
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

// Accounts without a real email get a synthetic one they never see or type.
const LOCAL_DOMAIN = "si-trading.local";

const handleFrom = (username: string, phone: string) => {
  const u = (username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (u) return u;
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return digits ? `u${digits}` : "";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their own JWT.
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: callerUser }, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !callerUser) return json({ error: "Not signed in" }, 401);

  const admin = createClient(url, serviceKey);

  // Only an admin may manage accounts.
  const { data: callerRow } = await admin
    .from("erp_users").select("doc").eq("id", callerUser.id).maybeSingle();
  if ((callerRow?.doc?.role || "") !== "admin") {
    return json({ error: "Only an admin can manage users" }, 403);
  }

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const action = body.action || "create";

  if (action === "create") {
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();
    const username = (body.username || "").trim().toLowerCase();
    const password = body.password || "";
    const role = body.role || "staff";

    if (!name) return json({ error: "Name is required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    if (!email && !phone && !username) {
      return json({ error: "Give an email, a phone number or a username to sign in with" }, 400);
    }

    const handle = handleFrom(username, phone);
    const authEmail = email || (handle ? `${handle}@${LOCAL_DOMAIN}` : "");
    if (!authEmail) return json({ error: "Could not derive a sign-in handle" }, 400);

    // Reject a clash before creating anything, so we never half-create a user.
    const { data: existing } = await admin
      .from("erp_users").select("id, doc").limit(1000);
    const clash = (existing || []).find((r) => {
      const d = r.doc || {};
      const samePhone = phone && d.phone &&
        String(d.phone).replace(/[^0-9]/g, "").slice(-10) === phone.replace(/[^0-9]/g, "").slice(-10);
      const sameUser = username && String(d.username || "").toLowerCase() === username;
      const sameMail = authEmail && String(d.email || "").toLowerCase() === authEmail;
      return samePhone || sameUser || sameMail;
    });
    if (clash) return json({ error: "Those sign-in details are already in use" }, 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,           // no mailbox to confirm through
      user_metadata: { name },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const { error: profileErr } = await admin.from("erp_users").upsert({
      id: created.user!.id,
      doc: {
        name, role, active: true,
        email: authEmail,
        contactEmail: email || "",   // the real address, when they have one
        phone, username,
        synthetic: !email,           // signs in by phone/username, not email
      },
    });
    if (profileErr) {
      // Do not leave an auth account with no profile behind it.
      await admin.auth.admin.deleteUser(created.user!.id);
      return json({ error: profileErr.message }, 400);
    }

    return json({ ok: true, id: created.user!.id, signInWith: username || phone || email });
  }

  if (action === "set_password") {
    const id = body.id || "";
    const password = body.password || "";
    if (!id) return json({ error: "Which user?" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "delete") {
    const id = body.id || "";
    if (!id) return json({ error: "Which user?" }, 400);
    if (id === callerUser.id) return json({ error: "You cannot delete your own account" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    await admin.from("erp_users").delete().eq("id", id);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
