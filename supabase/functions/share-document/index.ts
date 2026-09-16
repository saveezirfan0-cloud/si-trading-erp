// Supabase Edge Function: share-document
//
// Serves ONE sales document to somebody holding its share link, so a customer
// can open a quotation without an account.
//
// The link is a capability: `/d/<token>`, where the token is 32 random bytes
// minted by the app when the user presses Share. This function looks the
// document up by that exact token with the service-role key and returns only
// the fields the printed document shows. There is no way to list documents,
// and a request without a valid token gets nothing.
//
// Deliberately deployed with verify_jwt = false: the visitor is a customer
// with no account, and the token is the credential. Nothing else about the
// project is reachable through it.
//
// GET  /share-document?token=<token>
// POST { token }
// →    { ok: true, document: { ...safe fields } }
// 404  { error } for an unknown, revoked or malformed token

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// The token is hex from crypto.getRandomValues; anything else is not ours and
// is refused before a query is made.
const TOKEN = /^[0-9a-f]{32,128}$/;

// Only what the document itself prints. Everything else the row carries —
// who approved it, the audit stamps, attachment paths, the AI prompt, the
// customer's id — stays inside the business.
function publicView(doc: Record<string, unknown>) {
  const items = (Array.isArray(doc.items) ? doc.items : []).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      itemName: o.itemName ?? "", itemCode: o.itemCode ?? "", description: o.description ?? "",
      qty: o.qty ?? 0, unit: o.unit ?? "", unitPrice: o.unitPrice ?? 0,
      discount: o.discount ?? 0, taxRate: o.taxRate ?? 0, total: o.total ?? 0,
    };
  });
  return {
    docType: doc.docType === "quotation" ? "quotation" : "invoice",
    invoiceNo: doc.invoiceNo ?? "",
    date: doc.date ?? "",
    dueDate: doc.dueDate ?? "",
    reference: doc.reference ?? "",
    quotationNo: doc.quotationNo ?? "",
    status: doc.status ?? "",
    customerName: doc.customerName ?? "",
    customerCompany: doc.customerCompany ?? "",
    attention: doc.attention ?? "",
    customerPhone: doc.customerPhone ?? "",
    customerAddress: doc.customerAddress ?? "",
    paymentMethod: doc.paymentMethod ?? "",
    items,
    subtotal: doc.subtotal ?? 0,
    discountAmount: doc.discountAmount ?? 0,
    taxAmount: doc.taxAmount ?? 0,
    total: doc.total ?? 0,
    paidAmount: doc.paidAmount ?? 0,
    currency: doc.currency ?? "PKR",
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

  let token = "";
  if (req.method === "GET") {
    token = new URL(req.url).searchParams.get("token") || "";
  } else if (req.method === "POST") {
    try {
      token = String(((await req.json()) as { token?: string })?.token || "");
    } catch {
      return reply({ error: "invalid JSON body" }, 400);
    }
  } else {
    return reply({ error: "GET or POST only" }, 405);
  }

  token = token.trim().toLowerCase();
  // One message for every failure: a malformed token must not be
  // distinguishable from a token that simply does not exist.
  const notFound = () => reply({ error: "This link is not valid. It may have been revoked." }, 404);
  if (!TOKEN.test(token)) return notFound();

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return reply({ error: "Sharing is not configured on this project." }, 503);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("erp_sales_invoices")
    .select("doc")
    .filter("doc->>shareToken", "eq", token)
    // A document in the trash is not shared, whatever links exist for it.
    .filter("doc->>deletedAt", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) return reply({ error: "Could not open this link." }, 502);
  if (!data?.doc) return notFound();

  const doc = data.doc as Record<string, unknown>;
  // Sharing can be switched off again without deleting the document.
  if (doc.shareRevoked) return notFound();

  return reply({ ok: true, document: publicView(doc) });
});
