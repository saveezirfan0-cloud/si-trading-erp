// Supabase Edge Function: ocr-invoice
//
// Accepts a photo of a supplier invoice and returns structured line items
// using AI vision. Providers: Anthropic (Claude) and OpenAI, with automatic
// API-key rotation and failover.
//
// Secrets (set in Supabase dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEYS  comma-separated list, rotated automatically
//   OPENAI_API_KEYS     comma-separated list, rotated automatically
//   ANTHROPIC_MODEL     optional, default claude-haiku-4-5
//   OPENAI_MODEL        optional, default gpt-4o-mini
//
// POST { image: <base64 without data: prefix>, mimeType: "image/jpeg" }
// →    { ok: true, provider, data: { supplierName, documentNo, date, items:[
//        { name, unit, qty, rate, amount } ], subtotal, discount, netTotal,
//        previousBalance, totalDue, remarks } }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are reading a photo of a supplier's sales invoice / delivery challan from a hardware-tools wholesale business in Pakistan (amounts in PKR).

Extract the data and reply with ONLY a JSON object (no markdown, no commentary) in exactly this shape:
{
  "supplierName": "name of the business that issued the invoice",
  "documentNo": "invoice/document number",
  "date": "YYYY-MM-DD",
  "items": [
    { "name": "item description as printed", "unit": "PCS|SET|NOS|CTN|...", "qty": 0, "rate": 0, "amount": 0 }
  ],
  "subtotal": 0,
  "discount": 0,
  "netTotal": 0,
  "previousBalance": 0,
  "totalDue": 0,
  "remarks": "any remarks/transporter/bilty text"
}

Rules:
- Numbers must be plain numbers without thousands separators.
- Dates on these invoices are DD/MM/YYYY; convert to YYYY-MM-DD.
- If a field is not present use "" for strings and 0 for numbers.
- Copy item names exactly as printed, including size/spec text.
- amount should be qty × rate as printed (use the printed total value column when available).

CRITICAL — do not invent data. This feeds an accounting system: fabricated
figures become real stock movements and real money owed to a supplier. If the
image is blank, too blurry to read, not an invoice, or you cannot actually make
out the line items, reply with ONLY this and nothing else:
{"readable": false, "reason": "<short reason>"}
Never guess a supplier name, a document number, an item or a price that you
cannot actually see in the image. Returning "readable": false is always better
than a plausible guess. Report only the line items you can genuinely read; if
some rows are legible and others are not, include the legible ones and say so
in "remarks".`;

function keys(envName: string): string[] {
  return (Deno.env.get(envName) || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// Rotate through keys: start index advances every minute so consecutive
// requests spread across keys automatically; failover walks the rest.
function rotated<T>(arr: T[]): T[] {
  if (arr.length < 2) return arr;
  const start = Math.floor(Date.now() / 60000) % arr.length;
  return [...arr.slice(start), ...arr.slice(0, start)];
}

async function callAnthropic(key: string, image: string, mimeType: string) {
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`anthropic ${res.status}: ${await res.text()}`), { status: res.status });
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

async function callOpenAI(key: string, image: string, mimeType: string) {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`openai ${res.status}: ${await res.text()}`), { status: res.status });
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

function parseModelJson(text: string) {
  // strip markdown fences if the model added them anyway
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: CORS });
  }
  const image = body.image || "";
  const mimeType = body.mimeType || "image/jpeg";
  if (!image) {
    return new Response(JSON.stringify({ error: "image (base64) required" }), { status: 400, headers: CORS });
  }

  const attempts: { provider: string; call: () => Promise<string> }[] = [];
  for (const k of rotated(keys("ANTHROPIC_API_KEYS"))) {
    attempts.push({ provider: "anthropic", call: () => callAnthropic(k, image, mimeType) });
  }
  for (const k of rotated(keys("OPENAI_API_KEYS"))) {
    attempts.push({ provider: "openai", call: () => callOpenAI(k, image, mimeType) });
  }
  if (attempts.length === 0) {
    return new Response(JSON.stringify({
      error: "No AI keys configured. Set ANTHROPIC_API_KEYS and/or OPENAI_API_KEYS " +
             "in Supabase → Project Settings → Edge Functions → Secrets.",
    }), { status: 503, headers: CORS });
  }

  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const text = await a.call();
      const data = parseModelJson(text);

      // The model tells us when it cannot actually read the document. Surface
      // that as a failure rather than handing the user invented line items.
      if (data && data.readable === false) {
        return new Response(JSON.stringify({
          error: "Could not read this image",
          detail: typeof data.reason === "string" && data.reason
            ? data.reason
            : "The photo was not legible enough to extract invoice lines.",
          unreadable: true,
        }), { status: 422, headers: { ...CORS, "content-type": "application/json" } });
      }

      // A reply with no line items is not a usable invoice either.
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        return new Response(JSON.stringify({
          error: "No line items found",
          detail: "Nothing readable was found on this image. Retake the photo with the "
            + "whole invoice in frame and in focus.",
          unreadable: true,
        }), { status: 422, headers: { ...CORS, "content-type": "application/json" } });
      }

      return new Response(JSON.stringify({ ok: true, provider: a.provider, data }), {
        headers: { ...CORS, "content-type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${a.provider}: ${msg.slice(0, 300)}`);
      // keep trying remaining keys/providers on any failure
    }
  }
  return new Response(JSON.stringify({ error: "All providers failed", details: errors }), {
    status: 502, headers: { ...CORS, "content-type": "application/json" },
  });
});
