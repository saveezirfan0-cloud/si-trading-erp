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
//        totalQty, previousBalance, totalDue, remarks } }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are reading a photo of a supplier's sales invoice / delivery challan from a hardware-tools wholesale business in Pakistan (amounts in PKR).

The photo is often taken at an angle, upside down or rotated 90°, and the paper may be creased. Work out the orientation first and read the table in its own reading direction.

Read ONLY the machine-printed values. These invoices are usually marked up by hand afterwards — ticks, circles, strokes and small numbers written in pen (often red or blue) over the quantity, rate or total columns, and notes in the margin. Those are the warehouse's own carton counts and checkmarks, NOT invoice data. Never let a handwritten number replace a printed one; if handwriting covers a printed figure, read the printed figure underneath it.

The line-item table has these columns, in this order:
  Serial | Particulars | UOM | Quantity | Rate | Total Value
Quantity is the printed number in the Quantity column (typically printed as "240.00" — that means 240). It is NOT the carton count, and NOT a number taken from the item description such as "( 36PCS/CTN )" or from the Remarks line such as "( 24 CTN )".

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
  "totalQty": 0,
  "previousBalance": 0,
  "totalDue": 0,
  "remarks": "any remarks/transporter/bilty text"
}

Rules:
- Numbers must be plain numbers without thousands separators.
- Dates on these invoices are DD/MM/YYYY; convert to YYYY-MM-DD. If two dates are printed (document date and delivery date), use the document date.
- If a field is not present use "" for strings and 0 for numbers.
- Copy item names exactly as printed, including size/spec text.
- "amount" is the printed Total Value for that row.
- Check your arithmetic before answering: for every row qty × rate must equal that row's printed Total Value. If it does not, you have misread a digit — re-read the row's Quantity and Rate against the printed Total Value and correct them. A row where qty × rate is thousands off from the printed total is always a misread.
- The row totals must add up to the printed Net Total, and the quantities to the printed Total quantity ("totalQty"). Use those printed totals to check your work.
- Output one entry per printed line item, in order. Never invent, pad or repeat rows: if the table has 7 lines, return exactly 7.`;

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
  // Dense, hand-annotated tables photographed at an angle need a strong vision
  // model — a cheaper one misreads the quantity column. Override with the
  // ANTHROPIC_MODEL secret if a different cost/latency trade-off is wanted.
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Thinking is on by default on this model family and shares the budget.
      max_tokens: 8000,
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
  // With thinking on, the JSON answer is not necessarily the first block.
  const text = (json.content || [])
    .filter((b: { type?: string }) => b?.type === "text")
    .map((b: { text?: string }) => b.text || "")
    .join("");
  return text;
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
