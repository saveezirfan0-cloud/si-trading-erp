// Supabase Edge Function: ocr-invoice
//
// Accepts a photo of a supplier invoice and returns structured line items
// using AI vision. Providers: Anthropic (Claude) and OpenAI, with automatic
// API-key rotation and failover.
//
// The model is asked for the printed serial number of every row and for the
// invoice's own printed totals, so the reply can be checked against the paper
// before anyone sees it: a row count that disagrees with the serials, a
// quantity sum that disagrees with the printed total, or a repeated
// description are all caught here. A reply that fails those checks gets one
// repair pass; whatever is still wrong is reported as warnings for the review
// screen rather than being silently accepted.
//
// Secrets (set in Supabase dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEYS  comma-separated list, rotated automatically
//   OPENAI_API_KEYS     comma-separated list, rotated automatically
//   ANTHROPIC_MODEL     optional, default claude-opus-5
//   OPENAI_MODEL        optional, default gpt-4o-mini
//
// POST { image: <base64 without data: prefix>, mimeType: "image/jpeg" }
// →    { ok: true, provider, repaired, warnings: [...], checks: {...},
//        data: { supplierName, documentNo, date, items:[
//        { serial, name, unit, qty, rate, amount, duplicateOf } ], lineCount,
//        subtotal, discount, netTotal, printedTotalQty, previousBalance,
//        totalDue, remarks } }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are reading a photo of a supplier's sales invoice / delivery challan from a hardware-tools wholesale business in Pakistan (amounts in PKR).

The photo may be rotated, creased or annotated by hand — read the printed table regardless.

Extract the data and reply with ONLY a JSON object (no markdown, no commentary) in exactly this shape:
{
  "supplierName": "name of the business that issued the invoice",
  "documentNo": "invoice/document number",
  "date": "YYYY-MM-DD",
  "lineCount": 0,
  "items": [
    { "serial": 1, "name": "item description as printed", "unit": "PCS|SET|NOS|CTN|...", "qty": 0, "rate": 0, "amount": 0 }
  ],
  "printedTotalQty": 0,
  "subtotal": 0,
  "discount": 0,
  "netTotal": 0,
  "previousBalance": 0,
  "totalDue": 0,
  "remarks": "any remarks/transporter/bilty text"
}

Rules for the item table — follow these exactly, they matter more than anything else:
- The table has a printed Serial column. Return exactly one object per printed serial number, in order, and copy that number into "serial".
- Set "lineCount" to how many rows are printed in the table. items must have exactly that many entries.
- Read ACROSS each row: the name, UOM, quantity, rate and total value of one object must all come from the SAME printed row. Do not let a description slide onto the next row's UOM or quantity.
- Never split one printed row into two objects, never merge two printed rows into one, and never repeat a description. If two rows really do share a description they must differ in serial, and their quantities and rates are read separately.
- If a row is unreadable, still emit it with its serial and whatever you can read; do not drop it and do not invent an extra row to make the totals work.
- The columns run: Serial | Particulars | UOM | Quantity | Rate | Total Value.
- Read ONLY the machine-printed values. These invoices are marked up by hand afterwards — ticks, circles, strokes and small numbers written in pen (often red or blue) over the quantity, rate or total columns. Those are the warehouse's own carton counts and checkmarks, NOT invoice data. Never let a handwritten number replace a printed one; if handwriting covers a printed figure, read the printed figure underneath it.
- Quantity is the printed number in the Quantity column (typically printed as "240.00" — that means 240). It is NOT the carton count, and NOT a number taken from the item description such as "( 36PCS/CTN )" or from the Remarks line such as "( 24 CTN )".
- Check your arithmetic before answering: for every row qty × rate must equal that row's printed Total Value. If it does not, you have misread a digit — re-read that row's Quantity and Rate against the printed Total Value and correct them. A row where qty × rate is thousands off from the printed total is always a misread.
- "printedTotalQty" is the quantity total printed under the table (not your own sum). "netTotal" is the printed Net Total. Copy them as printed; they are used to check your reading.

Other rules:
- Numbers must be plain numbers without thousands separators.
- Dates on these invoices are DD/MM/YYYY; convert to YYYY-MM-DD.
- If a field is not present use "" for strings and 0 for numbers.
- Copy item names exactly as printed, including size/spec text.
- amount should be qty × rate as printed (use the printed total value column when available).`;

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

async function callAnthropic(key: string, image: string, mimeType: string, extra = "") {
  // A dense, hand-annotated table photographed at an angle is where a cheaper
  // vision model misreads the quantity column. Override with ANTHROPIC_MODEL.
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
          { type: "text", text: PROMPT + extra },
        ],
      }],
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

async function callOpenAI(key: string, image: string, mimeType: string, extra = "") {
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
          { type: "text", text: PROMPT + extra },
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

// ── Sanity checking the reply against the invoice's own printed totals ───────

type Item = {
  serial: number; name: string; unit: string;
  qty: number; rate: number; amount: number;
  duplicateOf?: number;
};

// Models sometimes return "1,320" or "Rs 795" despite the instruction.
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

function normalizeItems(raw: unknown): Item[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Item[] = [];
  arr.forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const qty = num(o.qty);
    const rate = num(o.rate);
    const amount = num(o.amount) || qty * rate;
    if (!name && !qty && !rate) return; // blank filler row
    out.push({
      serial: num(o.serial) || i + 1,
      name,
      unit: String(o.unit ?? "").trim().toUpperCase(),
      qty, rate, amount,
    });
  });
  return out;
}

// Flag — never silently drop — rows that look like the same printed row read
// twice: the duplicated description on a neighbouring row's UOM is the classic
// failure on these dense, rotated challans. A supplier genuinely can list one
// product twice, so this only marks rows the review screen then pre-skips.
function flagDuplicates(items: Item[]): { items: Item[]; duplicates: number } {
  const flagged = items.map((it) => ({ ...it }));
  let duplicates = 0;
  for (let i = 0; i < flagged.length; i++) {
    const it = flagged[i];
    for (let j = 0; j < i; j++) {
      const prev = flagged[j];
      if (prev.duplicateOf !== undefined) continue;
      if (norm(prev.name) !== norm(it.name) || !norm(it.name)) continue;
      // Same description on both rows. Treat as a re-read of the earlier row
      // when nothing distinguishes them: identical rate, or an empty qty/rate.
      const sameRate = close(prev.rate, it.rate, 0.01);
      const emptyRow = !it.qty || !it.rate;
      const sameSerial = prev.serial === it.serial;
      if (sameRate || emptyRow || sameSerial) {
        it.duplicateOf = prev.serial;
        duplicates++;
        break;
      }
    }
  }
  return { items: flagged, duplicates };
}

type Checks = {
  lineCount: number;          // rows the model says are printed
  extracted: number;          // rows it actually returned
  duplicates: number;
  qtySum: number; printedTotalQty: number;
  amountSum: number; netTotal: number;
  countOk: boolean; qtyOk: boolean; totalOk: boolean;
};

function check(data: Record<string, unknown>, items: Item[], duplicates: number): Checks {
  const live = items.filter((i) => i.duplicateOf === undefined);
  const qtySum = live.reduce((s, i) => s + i.qty, 0);
  const amountSum = live.reduce((s, i) => s + i.amount, 0);
  const lineCount = num(data.lineCount);
  const printedTotalQty = num(data.printedTotalQty);
  const netTotal = num(data.netTotal) || num(data.subtotal);
  return {
    lineCount, extracted: live.length, duplicates,
    qtySum, printedTotalQty, amountSum, netTotal,
    // A total the model did not read back is not evidence either way, so an
    // absent printed total counts as "nothing to contradict".
    countOk: !lineCount || lineCount === live.length,
    qtyOk: !printedTotalQty || close(qtySum, printedTotalQty, 0.5),
    totalOk: !netTotal || close(amountSum, netTotal, 1),
  };
}

function warningsFor(c: Checks): string[] {
  const w: string[] = [];
  if (c.duplicates) {
    w.push(`${c.duplicates} line${c.duplicates > 1 ? "s were" : " was"} read twice from the same ` +
           `invoice row and ${c.duplicates > 1 ? "have" : "has"} been skipped — restore ${c.duplicates > 1 ? "them" : "it"} if the invoice really lists the item twice.`);
  }
  if (!c.countOk) {
    w.push(`The invoice prints ${c.lineCount} rows but ${c.extracted} were extracted — check for a missing or duplicated line.`);
  }
  if (!c.qtyOk) {
    w.push(`Quantities add up to ${c.qtySum} but the invoice's printed total quantity is ${c.printedTotalQty}.`);
  }
  if (!c.totalOk) {
    w.push(`Line amounts add up to ${Math.round(c.amountSum).toLocaleString("en-PK")} but the invoice's printed net total is ${Math.round(c.netTotal).toLocaleString("en-PK")}.`);
  }
  return w;
}

const failCount = (c: Checks) =>
  (c.countOk ? 0 : 1) + (c.qtyOk ? 0 : 1) + (c.totalOk ? 0 : 1);

// What to tell the model on the repair pass, in terms of its own reply.
function repairNote(c: Checks, items: Item[]): string {
  const problems: string[] = [];
  if (!c.countOk) problems.push(`you returned ${c.extracted} items but said the invoice prints ${c.lineCount} rows`);
  if (!c.qtyOk) problems.push(`your quantities sum to ${c.qtySum} but the printed total quantity is ${c.printedTotalQty}`);
  if (!c.totalOk) problems.push(`your line amounts sum to ${Math.round(c.amountSum)} but the printed net total is ${Math.round(c.netTotal)}`);
  const dup = items.filter((i) => i.duplicateOf !== undefined).map((i) => i.name);
  if (dup.length) problems.push(`these descriptions were repeated across rows: ${dup.join("; ")}`);
  return `

A previous reading of this same photo was rejected because ${problems.join(", and ")}.
Read the table again, one object per printed serial number, taking each row's name, UOM, quantity and rate from the same printed row. Reply with the corrected JSON only.`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

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

  type Call = (extra?: string) => Promise<string>;
  const attempts: { provider: string; call: Call }[] = [];
  for (const k of rotated(keys("ANTHROPIC_API_KEYS"))) {
    attempts.push({ provider: "anthropic", call: (extra) => callAnthropic(k, image, mimeType, extra) });
  }
  for (const k of rotated(keys("OPENAI_API_KEYS"))) {
    attempts.push({ provider: "openai", call: (extra) => callOpenAI(k, image, mimeType, extra) });
  }
  if (attempts.length === 0) {
    return new Response(JSON.stringify({
      error: "No AI keys configured. Set ANTHROPIC_API_KEYS and/or OPENAI_API_KEYS " +
             "in Supabase → Project Settings → Edge Functions → Secrets.",
    }), { status: 503, headers: CORS });
  }

  const read = (text: string) => {
    const data = parseModelJson(text) as Record<string, unknown>;
    const { items, duplicates } = flagDuplicates(normalizeItems(data.items));
    return { data, items, checks: check(data, items, duplicates) };
  };

  const errors: string[] = [];
  for (const a of attempts) {
    let first;
    try {
      first = read(await a.call());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${a.provider}: ${msg.slice(0, 300)}`);
      continue; // keep trying remaining keys/providers on any failure
    }

    // The reading disagrees with the invoice's own totals — give the same
    // provider one corrective pass before handing it over for review.
    let best = first;
    let repaired = false;
    if (failCount(first.checks) > 0) {
      try {
        const second = read(await a.call(repairNote(first.checks, first.items)));
        if (failCount(second.checks) < failCount(best.checks)) {
          best = second;
          repaired = true;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${a.provider} (repair pass): ${msg.slice(0, 200)}`);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      provider: a.provider,
      repaired,
      checks: best.checks,
      warnings: warningsFor(best.checks),
      data: { ...best.data, items: best.items },
    }), { headers: { ...CORS, "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "All providers failed", details: errors }), {
    status: 502, headers: { ...CORS, "content-type": "application/json" },
  });
});
