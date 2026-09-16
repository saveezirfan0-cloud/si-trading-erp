// src/lib/aiDocument.js — turning a typed request into a sales document.
//
// Someone types what they want in plain words:
//
//   Make a quotation
//   Name: ARY Laguna Karachi Pvt Ltd
//   Kind Attention : Mr Zaheer
//   4 pcs Demolition Hammer HP1300-DH @ 23000/=
//
// and gets a filled-in quotation (or invoice) to check and save. The reading
// is done by the ai-document Edge Function; when that is unreachable or has no
// keys, `parseDocumentText` below reads the common shapes on its own so the
// feature still works. Both produce the same `parsed` shape, and `buildDraft`
// turns that into the record the sales form edits — matching the customer and
// each line against the lists as it goes and saying what it could not settle.
import { makeRanker, pickMatch, similarity } from './match';
import { nextDocNo, docPrefix, calcLine, calcTotals, DEFAULT_TERMS } from './salesDocs';

// ── Text parsing ────────────────────────────────────────────────────────────

const UNITS = 'pcs?|pieces?|pc|nos?|sets?|ctns?|cartons?|boxes?|box|units?|kgs?|kg|ltrs?|litres?|liters?|mtrs?|meters?|metres?|ft|feet|pairs?|prs?|dozens?|dz|rolls?|packs?|pkts?|bags?|drums?|lots?|bundles?|bdls?';

const UNIT_NAMES = {
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'nos', set: 'set', sets: 'set',
  ctn: 'ctn', ctns: 'ctn', carton: 'ctn', cartons: 'ctn', boxes: 'box',
  pair: 'pair', pairs: 'pair', pr: 'pair', prs: 'pair', dozen: 'dz', dozens: 'dz',
  kgs: 'kg', ltr: 'ltr', ltrs: 'ltr', litre: 'ltr', litres: 'ltr', liter: 'ltr', liters: 'ltr',
  mtr: 'mtr', mtrs: 'mtr', meter: 'mtr', meters: 'mtr', metre: 'mtr', metres: 'mtr', feet: 'ft',
  units: 'unit', rolls: 'roll', packs: 'pack', pkt: 'pkt', pkts: 'pkt', bags: 'bag',
  drums: 'drum', lots: 'lot', bundle: 'bdl', bundles: 'bdl', bdls: 'bdl',
};

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const normUnit = (u) => {
  const t = clean(u).toLowerCase().replace(/\.$/, '');
  if (!t) return '';
  return UNIT_NAMES[t] || t;
};

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Dates people type here are DD/MM/YYYY; ISO is accepted as-is.
export const toISODate = (raw, today = isoOf(new Date())) => {
  const s = clean(raw).toLowerCase();
  if (!s) return '';
  if (s === 'today') return today;
  if (s === 'tomorrow') { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + 1); return isoOf(d); }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? '' : isoOf(new Date(t));
};

// "Name: …", "Kind Attention: …" and the other labelled lines. Order matters
// only where two labels could both fit a line; the first wins.
const FIELDS = [
  ['attention',       /^(?:kind\s*)?att(?:n|ention)\.?\s*[:\-–]?\s*(.+)$/i],
  ['customerName',    /^(?:customer|client|company|party|name|bill\s*to|to|m\/s|messrs\.?)\s*[:\-–]\s*(.+)$/i],
  ['customerName',    /^m\/s\.?\s+(.+)$/i],
  ['customerPhone',   /^(?:phone|mobile|cell|tel|telephone|contact|ph)\.?\s*(?:no\.?|#)?\s*[:\-–]?\s*(.+)$/i],
  ['customerAddress', /^(?:address|addr)\.?\s*[:\-–]?\s*(.+)$/i],
  ['dueDate',         /^(?:due\s*date|due|valid\s*(?:till|until|upto|up\s*to|to)|validity)\s*[:\-–]?\s*(.+)$/i],
  ['date',            /^(?:date|dated|dt)\.?\s*[:\-–]?\s*(.+)$/i],
  ['notes',           /^(?:notes?|remarks?|comments?)\s*[:\-–]\s*(.+)$/i],
  ['terms',           /^(?:terms?(?:\s*(?:&|and)\s*conditions?)?|payment\s*terms?)\s*[:\-–]\s*(.+)$/i],
  ['reference',       /^(?:ref|reference|po|p\.o\.?|po\s*no\.?|order\s*no\.?)\s*[:\-–]?\s*(.+)$/i],
];

const DOC_WORD = /\b(quotation|quote|estimate|proforma|invoice|bill)\b/i;
const INTRO = /\b(?:make|create|prepare|generate|raise|issue|draft|new|need|want|please|kindly)\b/i;

// A line that describes something sold: "4 pcs Demolition Hammer @ 23000/=",
// "Angle Grinder x 2 @ 8500", "Hammer 4 pcs 23000", "2 x Drill Rs 12,000".
// Returns null for anything that carries neither a quantity nor a price.
export const parseItemLine = (raw) => {
  let s = clean(raw)
    .replace(/^\d+\s*[.)]\s+/, '')               // "1. " / "1) " serials
    .replace(/\s+[-–—]\s+/g, ' ')                 // dashes used as separators
    .replace(/\s*(?:\/=|\/-|=)\s*$/, '')          // "23000/=" endings
    .trim();
  if (!s || !/[a-z]/i.test(s)) return null;

  let rate = 0, qty = 0, unit = '', discount = 0;

  const disc = /\s*(?:less|discount|disc\.?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%\s*$/i.exec(s);
  if (disc) { discount = num(disc[1]); s = s.slice(0, disc.index).trim(); }

  const money = '(?:rs\\.?|pkr|₨)?\\s*([\\d,]+(?:\\.\\d+)?)';
  const tail = '\\s*(?:\\/=|\\/-|=|each|\\/each|per\\s+\\w+|\\/\\w+)?\\s*$';
  const withSep = new RegExp(`(?:^|\\s)(?:@|at|\\*|rate\\s*[:=]?|price\\s*[:=]?)\\s*${money}${tail}`, 'i');
  const withCurrency = new RegExp(`(?:^|\\s)(?:rs\\.?|pkr|₨)\\s*([\\d,]+(?:\\.\\d+)?)${tail}`, 'i');
  let m = withSep.exec(s) || withCurrency.exec(s);
  if (m) { rate = num(m[1]); s = s.slice(0, m.index).trim(); }

  // Quantity in front: "4 pcs Hammer", "2 x Drill", "3 Grinder" (but not the
  // "6" of "6 inch grinder").
  m = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(?:(${UNITS})\\.?|[x×])\\s+(?=\\S)`, 'i').exec(s);
  if (m) { qty = num(m[1]); unit = normUnit(m[2]); s = s.slice(m[0].length); }
  else {
    m = /^(\d+(?:\.\d+)?)\s+(?!(?:inch|in|mm|cm|m|ft|v|w|hp|kg|g|ltr|l|amp|a|\d|"|”|'')\b)(?=[a-z])/i.exec(s);
    if (m) { qty = num(m[1]); s = s.slice(m[0].length); }
  }
  // "Pipe Wrench 24\" 6 pcs 1450": quantity, unit and price in a row with no
  // separator at all — the unit is what tells the two numbers apart.
  if (!qty && !rate) {
    m = new RegExp(`^(.*\\S)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNITS})\\.?\\s+([\\d,]+(?:\\.\\d+)?)$`, 'i').exec(s);
    if (m) { qty = num(m[2]); unit = normUnit(m[3]); rate = num(m[4]); s = m[1]; }
  }
  // …or at the back: "Hammer x 4", "Hammer 4 pcs", "Hammer qty 4".
  if (!qty) {
    m = new RegExp(`\\s*(?:[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNITS})?\\.?|(\\d+(?:\\.\\d+)?)\\s*(${UNITS})\\.?|qty\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNITS})?\\.?)\\s*$`, 'i').exec(s);
    if (m) { qty = num(m[1] || m[3] || m[5]); unit = normUnit(m[2] || m[4] || m[6]); s = s.slice(0, m.index).trim(); }
  }
  // "Hammer 4 pcs 23000": with a unit-carrying quantity, a bare trailing
  // number can only be the price.
  if (!rate && qty && unit) {
    m = /\s+([\d,]+(?:\.\d+)?)\s*$/.exec(s);
    if (m) { rate = num(m[1]); s = s.slice(0, m.index).trim(); }
  }

  const name = s.replace(/^[\s:,.\-–—]+|[\s:,.\-–—]+$/g, '').trim();
  if (!name || !/[a-z]/i.test(name)) return null;
  if (!qty && !rate) return null;
  return { name, qty: qty || 1, unit: unit || 'pcs', rate, discount };
};

// Reads the whole request. `today` anchors relative dates; the result is the
// same shape the Edge Function returns, so both feed `buildDraft`.
export const parseDocumentText = (text, today = isoOf(new Date())) => {
  const out = {
    docType: 'invoice', customerName: '', attention: '', customerPhone: '', customerAddress: '',
    date: '', dueDate: '', reference: '', notes: '', terms: '', discountPercent: 0,
    items: [], unparsed: [],
  };
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  let sawQuoteWord = false;

  for (const line of lines) {
    let matched = false;
    for (const [key, re] of FIELDS) {
      const m = re.exec(line);
      if (!m) continue;
      const v = clean(m[1]);
      if (key === 'date' || key === 'dueDate') out[key] = toISODate(v, today) || out[key];
      else if (key === 'notes' || key === 'terms') out[key] = out[key] ? `${out[key]} ${v}` : v;
      else if (!out[key]) out[key] = v;
      matched = true;
      break;
    }
    if (matched) continue;

    const item = parseItemLine(line);
    if (item) { out.items.push(item); continue; }

    // Anything else: the "make a quotation for X" intro, a discount, or noise.
    const w = DOC_WORD.exec(line);
    if (w) {
      if (/quot|estimate|proforma/i.test(w[1])) sawQuoteWord = true;
      const forWhom = /\b(?:quotation|quote|estimate|proforma|invoice|bill)\s+(?:for|to)\s+(.+)$/i.exec(line);
      if (forWhom && !out.customerName) out.customerName = clean(forWhom[1]).replace(/[.,;]+$/, '');
    }
    const d = /\b(?:discount|less)\s*(?:of\s*)?[:=]?\s*(\d+(?:\.\d+)?)\s*%/i.exec(line);
    if (d) { out.discountPercent = num(d[1]); continue; }
    if (w || INTRO.test(line)) continue;
    out.unparsed.push(line);
  }

  // A request that says both ("quotation … convert to invoice later") is a quotation.
  out.docType = sawQuoteWord ? 'quotation' : 'invoice';
  return out;
};

// ── Model output → the same shape ───────────────────────────────────────────
// The Edge Function is asked for exactly this JSON, but a model still
// sometimes returns "23,000" or leaves a field out.
export const normalizeParsed = (data) => {
  const d = data || {};
  const items = (Array.isArray(d.items) ? d.items : [])
    .map((it) => ({
      name: clean(it?.name), qty: num(it?.qty) || 1, unit: normUnit(it?.unit) || 'pcs',
      rate: num(it?.rate), discount: num(it?.discount),
    }))
    .filter((it) => it.name);
  return {
    docType: /quot/i.test(String(d.docType || '')) ? 'quotation' : 'invoice',
    customerName: clean(d.customerName), attention: clean(d.attention),
    customerPhone: clean(d.customerPhone), customerAddress: clean(d.customerAddress),
    date: toISODate(d.date) || '', dueDate: toISODate(d.dueDate) || '',
    reference: clean(d.reference), notes: clean(d.notes), terms: clean(d.terms),
    discountPercent: num(d.discountPercent), items,
    unparsed: Array.isArray(d.unparsed) ? d.unparsed.map(clean).filter(Boolean) : [],
  };
};

// ── Draft ───────────────────────────────────────────────────────────────────
export const EMPTY_LINE = {
  itemId: '', itemCode: '', itemName: '', description: '', qty: 1, unit: 'pcs',
  unitPrice: 0, discount: 0, taxRate: 0, total: 0, isCustom: false,
};

// People shorten customer names ("ARY Laguna" for "ARY Laguna Karachi (Pvt)
// Ltd"), which token overlap scores low. So a clear winner is accepted on a
// weaker score than a close race, and either way anything short of an exact
// match is pointed out for checking.
export const matchCustomer = (name, customers = []) => {
  const ranked = customers
    .map((c) => ({ c, score: similarity(name, c.name) }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  if (!best || best.score < 0.3) return null;
  const clear = best.score >= 0.5 || best.score - (next?.score || 0) >= 0.1;
  return clear ? { ...best.c, _score: best.score } : null;
};

// The record the sales form will edit, plus everything a person should look
// at before saving. Lines are matched to inventory the same way the scanner
// does it: a clear winner is filled in, anything doubtful stays a custom line
// under the words that were typed.
export const buildDraft = (parsedIn, {
  customers = [], inventory = [], existing = [], today = isoOf(new Date()),
  prompt = '', provider = 'local',
} = {}) => {
  const parsed = normalizeParsed(parsedIn);
  const docType = parsed.docType;
  const warnings = [];

  const customer = parsed.customerName ? matchCustomer(parsed.customerName, customers) : null;
  if (!parsed.customerName) warnings.push('No customer name was found — choose one before saving.');
  else if (!customer) warnings.push(`"${parsed.customerName}" is not in the customer list — add them as a new customer or pick an existing one.`);
  else if (customer._score < 0.99) warnings.push(`"${parsed.customerName}" was matched to the customer "${customer.name}" — check that this is right.`);

  const rank = makeRanker(inventory);
  const unmatched = [];
  const items = parsed.items.map((it) => {
    const match = inventory.length ? pickMatch(rank, it.name) : { itemId: '' };
    const inv = match.itemId ? inventory.find((i) => i.id === match.itemId) : null;
    const rate = it.rate > 0 ? it.rate : num(inv?.salePrice);
    if (!(it.rate > 0)) {
      warnings.push(inv && rate > 0
        ? `No price was given for "${it.name}" — the inventory sale price was used.`
        : `No price was given for "${it.name}".`);
    }
    if (!inv) unmatched.push(it.name);
    return calcLine({
      ...EMPTY_LINE,
      itemId: inv?.id || '', itemCode: inv?.code || '',
      itemName: inv ? inv.name : it.name,
      description: inv && similarity(it.name, inv.name) < 0.99 ? it.name : '',
      qty: it.qty, unit: it.unit || inv?.unit || 'pcs', unitPrice: rate,
      discount: it.discount || parsed.discountPercent || 0,
      taxRate: num(inv?.taxRate), isCustom: !inv,
    });
  });
  if (unmatched.length) {
    warnings.push(`${unmatched.length === 1 ? 'This line is' : `${unmatched.length} lines are`} not in the inventory and ${unmatched.length === 1 ? 'was' : 'were'} added as custom items: ${unmatched.join('; ')}.`);
  }
  if (!items.length) warnings.push('No line items were found — add them by hand.');
  if (parsed.unparsed.length) warnings.push(`Not understood: ${parsed.unparsed.join(' / ')}`);

  const draft = {
    docType,
    invoiceNo: nextDocNo(existing, docPrefix(docType)),
    date: parsed.date || today,
    dueDate: parsed.dueDate || '',
    customerId: customer?.id || '',
    customerName: customer?.name || parsed.customerName || '',
    customerAddress: customer?.address || parsed.customerAddress || '',
    customerPhone: customer?.phone || parsed.customerPhone || '',
    attention: parsed.attention || '',
    reference: parsed.reference || '',
    status: docType === 'quotation' ? 'draft' : 'unpaid',
    paymentMethod: '',
    notes: parsed.notes || '',
    terms: parsed.terms || DEFAULT_TERMS[docType],
    items: items.length ? items : [{ ...EMPTY_LINE }],
    ...calcTotals(items),
    paidAmount: 0,
    currency: 'PKR',
    source: 'ai',
    aiPrompt: prompt,
    aiProvider: provider,
  };
  return { draft, warnings };
};
