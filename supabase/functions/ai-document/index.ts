// Supabase Edge Function: ai-document
//
// Turns a typed request for a sales document into structured fields:
//
//   Make a quotation
//   Name: ARY Laguna Karachi Pvt Ltd
//   Kind Attention : Mr Zaheer
//   4 pcs Demolition Hammer HP1300-DH @ 23000/=
//
// becomes { docType: "quotation", customerName, attention, items: [...] }.
// The browser then matches the customer and the items against its own lists
// and opens the result in the sales form for checking — nothing is saved here.
//
// Providers: Anthropic (Claude) and OpenAI, with the same key rotation and
// failover as ocr-invoice. Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEYS  comma-separated list, rotated automatically
//   OPENAI_API_KEYS     comma-separated list, rotated automatically
//   ANTHROPIC_MODEL     optional, default claude-opus-5
//   OPENAI_MODEL        optional, default gpt-4o-mini
//
// POST { text: "…", today?: "YYYY-MM-DD" }
// →    { ok: true, provider, data: { docType, customerName, attention,
//        customerPhone, customerAddress, date, dueDate, reference, notes,
//        terms, discountPercent, items: [{ name, qty, unit, rate, discount }],
//        unparsed: [] } }
// 422  { error, detail, unreadable: true } when the text holds no document.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TEXT = 8000;

const prompt = (text: string, today: string) => `You are the order desk of a hardware-tools wholesale business in Pakistan (amounts in PKR). A colleague has typed a request for a sales document. Read it and reply with ONLY a JSON object (no markdown, no commentary) in exactly this shape:
{
  "docType": "quotation" or "invoice",
  "customerName": "the business or person the document is for",
  "attention": "the contact person named after Attention / Attn / Kind Attention, if any",
  "customerPhone": "",
  "customerAddress": "",
  "date": "YYYY-MM-DD or empty",
  "dueDate": "YYYY-MM-DD or empty — a due date, or the date a quotation is valid until",
  "reference": "their PO / reference number, if any",
  "notes": "",
  "terms": "",
  "discountPercent": 0,
  "items": [
    { "name": "item description as typed, including model numbers", "qty": 0, "unit": "pcs", "rate": 0, "discount": 0 }
  ],
  "unparsed": ["any line you could not place anywhere"]
}

Rules:
- "docType" is "quotation" when the request says quotation, quote, estimate or proforma; otherwise "invoice".
- One object per product line, in the order written. "qty" is the quantity, "unit" the unit of measure (pcs, set, ctn, box, kg, mtr, pair, dz, nos …; default "pcs"), "rate" the unit price and "discount" a percentage. "23000/=", "Rs 23,000" and "@ 23000" all mean a rate of 23000. "4 pcs X @ 23000" is four of X at 23000 each. A line with no price has rate 0 — never guess a price.
- A discount written once for the whole document goes in "discountPercent"; one written on a line goes on that line.
- Today is ${today}. Dates typed here are DD/MM/YYYY; write them as YYYY-MM-DD. Leave "date" empty when none was given.
- Numbers are plain numbers without thousands separators. Missing strings are "" and missing numbers are 0.
- Do not invent anything. Copy names and model numbers as typed (fix only obvious spacing). If the text contains no product lines at all, reply with ONLY {"readable": false, "reason": "<short reason>"}.

The request:
<<<
${text}
>>>`;

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

async function callAnthropic(key: string, text: string, today: string) {
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
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt(text, today) }],
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`anthropic ${res.status}: ${await res.text()}`), { status: res.status });
  const json = await res.json();
  // With thinking on, the JSON answer is not necessarily the first block.
  return (json.content || [])
    .filter((b: { type?: string }) => b?.type === "text")
    .map((b: { text?: string }) => b.text || "")
    .join("");
}

async function callOpenAI(key: string, text: string, today: string) {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt(text, today) }],
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`openai ${res.status}: ${await res.text()}`), { status: res.status });
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

function parseModelJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Models sometimes return "1,320" or "Rs 795" despite the instruction.
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const str = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

type Item = { name: string; qty: number; unit: string; rate: number; discount: number };

function normalize(data: Record<string, unknown>) {
  const items: Item[] = (Array.isArray(data.items) ? data.items : [])
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        name: str(o.name), qty: num(o.qty) || 1, unit: str(o.unit).toLowerCase() || "pcs",
        rate: num(o.rate), discount: num(o.discount),
      };
    })
    .filter((it) => it.name);
  return {
    docType: /quot/i.test(str(data.docType)) ? "quotation" : "invoice",
    customerName: str(data.customerName),
    attention: str(data.attention),
    customerPhone: str(data.customerPhone),
    customerAddress: str(data.customerAddress),
    date: str(data.date),
    dueDate: str(data.dueDate),
    reference: str(data.reference),
    notes: str(data.notes),
    terms: str(data.terms),
    discountPercent: num(data.discountPercent),
    items,
    unparsed: (Array.isArray(data.unparsed) ? data.unparsed : []).map(str).filter(Boolean),
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  let body: { text?: string; today?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "invalid JSON body" }, 400);
  }
  const text = String(body.text || "").trim();
  if (!text) return reply({ error: "text required" }, 400);
  if (text.length > MAX_TEXT) return reply({ error: `text is too long (max ${MAX_TEXT} characters)` }, 400);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || "")
    ? body.today as string
    : new Date().toISOString().slice(0, 10);

  type Call = () => Promise<string>;
  const attempts: { provider: string; call: Call }[] = [];
  for (const k of rotated(keys("ANTHROPIC_API_KEYS"))) {
    attempts.push({ provider: "anthropic", call: () => callAnthropic(k, text, today) });
  }
  for (const k of rotated(keys("OPENAI_API_KEYS"))) {
    attempts.push({ provider: "openai", call: () => callOpenAI(k, text, today) });
  }
  if (attempts.length === 0) {
    return reply({
      error: "No AI keys configured. Set ANTHROPIC_API_KEYS and/or OPENAI_API_KEYS " +
             "in Supabase → Project Settings → Edge Functions → Secrets.",
      noKeys: true,
    }, 503);
  }

  const errors: string[] = [];
  for (const a of attempts) {
    let data: Record<string, unknown>;
    try {
      data = parseModelJson(await a.call()) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${a.provider}: ${msg.slice(0, 300)}`);
      continue; // keep trying remaining keys/providers on any failure
    }

    // The model saying "this is not a document" is a fact about the text, not
    // a provider fault — another key would only invent something.
    if (data && data.readable === false) {
      return reply({
        error: "Could not read a document from this text",
        detail: typeof data.reason === "string" && data.reason ? data.reason : "No product lines were found.",
        unreadable: true,
      }, 422);
    }
    const parsed = normalize(data);
    if (parsed.items.length === 0) {
      return reply({
        error: "Could not read a document from this text",
        detail: "No product lines were found. Write one item per line, e.g. \"4 pcs Demolition Hammer @ 23000\".",
        unreadable: true,
      }, 422);
    }
    return reply({ ok: true, provider: a.provider, data: parsed });
  }

  return reply({ error: "All providers failed", details: errors }, 502);
});
