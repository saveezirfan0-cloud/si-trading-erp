// src/pages/purchases/ScanInvoice.js
//
// OCR purchase-invoice capture: photograph a supplier invoice → AI vision
// extracts the lines → review & confirm → creates the purchase invoice,
// updates inventory quantities/costs and the supplier balance.
//
// Everything the OCR reads is editable in the review step, and anything it
// failed to read (or read suspiciously) is highlighted so it gets checked
// before the invoice is saved.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAll, getOne, create, update, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Card, Loader, Badge } from '../../components/ui';
import toast from 'react-hot-toast';
import { Camera, Upload, ArrowLeft, Check, RefreshCw, Sparkles, X, Plus, AlertTriangle, Search, ChevronDown, Copy } from 'lucide-react';

// Amber isn't a theme variable — warnings use this in both themes.
const WARN = '#e0a01a';
const WARN_BG = 'rgba(224,160,26,0.12)';
const ERR_BG = 'rgba(239,68,68,0.10)';

// ── Image compression ────────────────────────────────────────────────────────
const compressImage = (file, maxDim = 1800, quality = 0.87) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          base64: reader.result.split(',')[1],
          mimeType: 'image/jpeg',
          blob,
          previewUrl: canvas.toDataURL('image/jpeg', 0.6),
        });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });

// ── Fuzzy matching ───────────────────────────────────────────────────────────
// Normalizes common local/OCR spellings so "PIPE RAINCH" matches "Pipe Wrench",
// "PLIERS" matches "plier", etc.
const SYNONYMS = {
  rainch: 'wrench', rench: 'wrench', wrinch: 'wrench', wranch: 'wrench',
  pliers: 'plier', screwdriver: 'driver', sd: 'driver',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', no: 'nos',
};

const tokens = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s"']/g, ' ')
  .split(/\s+/).filter(t => t.length > 1)
  .map(t => {
    let n = SYNONYMS[t] || t;
    if (n.length > 3 && n.endsWith('s') && !SYNONYMS[n]) n = n.slice(0, -1); // crude plural strip
    return SYNONYMS[n] || n;
  });

const similarity = (a, b) => {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
};

const bestMatch = (name, candidates, min = 0.3) => {
  let best = null, score = 0;
  for (const c of candidates) {
    const s = similarity(name, c.name);
    if (s > score) { score = s; best = c; }
  }
  return score >= min ? { ...best, _score: score } : null;
};

// Ranking a line against the inventory.
//
// Plain token overlap treats every word as equally telling, so an invoice line
// like "PLIERS ORANGE XIANYU CUTTER" scores the same against "6\" Solid Cutter
// Plier" as against "Pliers Orange Xianyu Cutter" — the words that actually
// identify the item ("xianyu", "orange") carry no more weight than the ones
// half the catalogue shares ("solid", "6\""). So weight each token by how rare
// it is across the inventory, and search the code and brand too.
const makeRanker = (items) => {
  // Score against the item name only — codes and brands are for the search box,
  // and letting them into the score dilutes it.
  const docs = items.map((i) => ({ item: i, set: new Set(tokens(i.name)) }));
  const df = new Map();
  docs.forEach((d) => d.set.forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const n = docs.length || 1;
  const idf = (t) => Math.log((n + 1) / ((df.get(t) || 0) + 1)) + 1;
  const weight = (set) => { let w = 0; set.forEach((t) => { w += idf(t); }); return w; };
  const docWeight = docs.map((d) => weight(d.set));

  return (name, limit = 5) => {
    const q = new Set(tokens(name));
    if (!q.size) return [];
    const qw = weight(q);
    const scored = [];
    docs.forEach((d, k) => {
      let inter = 0;
      q.forEach((t) => { if (d.set.has(t)) inter += idf(t); });
      if (!inter) return;
      // Dice coefficient: rewards covering both sides, but unlike dividing by
      // the longer side it doesn't punish an invoice line for carrying extra
      // spec words ("SOLID HD", "( 36PCS/CTN )") the catalogue name omits.
      scored.push({ ...d.item, score: (2 * inter) / (qw + docWeight[k]) });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  };
};

// Auto-select an inventory item only when one candidate is both good and
// clearly ahead of the next one; a near-tie means the scan has to be checked by
// hand, and proposing a new item is safer than silently picking the wrong one.
const AUTO_MATCH = 0.55;
const AUTO_MARGIN = 0.08;

const pickMatch = (rank, name) => {
  const [best, next] = rank(name, 2);
  if (!best) return { action: 'create', itemId: '', matchScore: 0, nearMiss: null };
  const clear = best.score >= AUTO_MATCH && (!next || best.score - next.score >= AUTO_MARGIN);
  return clear
    ? { action: 'match', itemId: best.id, matchScore: best.score, runnerUp: next?.score || 0, nearMiss: null }
    : { action: 'create', itemId: '', matchScore: 0,
        nearMiss: best.score >= 0.3 ? { name: best.name, score: best.score } : null };
};

const num = (v) => Number(v) || 0;
// Printed totals are rounded, so allow a rupee (or 2%) of drift before flagging.
const differs = (a, b) => Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.02);

// The printed line total is the most trustworthy number on these invoices: it
// is machine-printed, and unlike the quantity column it is rarely written over
// by hand. When qty × rate disagrees with it and the total divides cleanly by
// the rate, the quantity is what was misread (warehouse carton counts get
// pencilled straight onto the quantity column), so take the quantity the
// printed total implies — and flag it, because the rate could be the wrong one
// instead.
const reconcileQty = (l) => {
  if (!(l.printedAmount > 0) || !(l.rate > 0)) return l;
  if (!differs(l.qty * l.rate, l.printedAmount)) return l;
  const implied = l.printedAmount / l.rate;
  const rounded = Math.round(implied);
  if (rounded < 1 || rounded > 1e6 || Math.abs(implied - rounded) > 0.02) return l;
  if (rounded === l.qty) return l;
  return { ...l, qty: rounded, qtyRead: l.qty, qtyFromAmount: true };
};

// Scanning the same challan twice would post the stock and the supplier
// balance twice over, and nothing downstream would flag it — so look for an
// invoice that has already been entered before the user confirms this one.
// The supplier's own invoice number is the reliable key; where it wasn't read,
// fall back to same supplier + same date + same total.
const norm = (v) => String(v || '').trim().toLowerCase().replace(/[\s-]/g, '');

const findDuplicate = (invoices, { supplierId, supplierName, documentNo, date, total }) => {
  const doc = norm(documentNo);
  const name = norm(supplierName);
  const sameSupplier = (inv) => (supplierId && inv.supplierId === supplierId)
    || (!!name && norm(inv.supplierName) === name)
    || (!!supplierName && similarity(inv.supplierName, supplierName) > 0.8);

  for (const inv of invoices) {
    if (inv.status === 'cancelled' || !sameSupplier(inv)) continue;
    if (doc && norm(inv.supplierInvoiceNo) === doc) return { invoice: inv, on: 'invoice number' };
    if (!doc && date && inv.date === date && total > 0 && !differs(num(inv.total), total)) {
      return { invoice: inv, on: 'date and total' };
    }
  }
  return null;
};

const emptyLine = () => ({
  ocrName: '', unit: 'pcs', qty: '', rate: '', printedAmount: 0,
  action: 'create', itemId: '', matchScore: 0, manual: true,
});

// ── Small field primitives ───────────────────────────────────────────────────
// Local versions of Input/Select so the label, the highlight and the hint
// message stay together for every field on this page.
const flagStyle = (flag) => !flag ? {} : {
  borderColor: flag.level === 'error' ? 'var(--red)' : WARN,
  background: flag.level === 'error' ? ERR_BG : WARN_BG,
};

// `short` is for the narrow table cells, where the full sentence would wrap
// the row to three lines; the banner above always shows the full message.
function Hint({ flag, short }) {
  if (!flag) return null;
  return (
    <span title={flag.msg} style={{
      display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
      fontSize: '0.72rem', lineHeight: 1.3, color: flag.level === 'error' ? 'var(--red)' : WARN,
    }}>
      <AlertTriangle size={11} style={{ flexShrink: 0 }} /> {(short && flag.short) || flag.msg}
    </span>
  );
}

function Field({ label, flag, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, ...style }}>
      {label && (
        <label style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </label>
      )}
      {children}
      <Hint flag={flag} />
    </div>
  );
}

const TextField = ({ label, flag, value, onChange, type = 'text', placeholder, inputStyle, ...rest }) => (
  <Field label={label} flag={flag}>
    <input
      type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder}
      style={{ padding: '8px 12px', width: '100%', minWidth: 0, ...flagStyle(flag), ...inputStyle }}
      {...rest}
    />
  </Field>
);

const SelectField = ({ label, flag, value, onChange, children }) => (
  <Field label={label} flag={flag}>
    <select value={value} onChange={onChange}
      style={{ padding: '8px 12px', width: '100%', minWidth: 0, ...flagStyle(flag) }}>
      {children}
    </select>
  </Field>
);

// ── Inventory item picker ────────────────────────────────────────────────────
// A native <select> over ~700 items is a wall of alphabetical text on a phone,
// so this is a search box over name, code, brand and category, with the lines'
// best matches offered first.
function ItemPicker({ value, ocrName, inventory, rank, flag, onChange, isMobile }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    const t = setTimeout(() => searchRef.current?.focus(), 40);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const selected = value ? inventory.find((i) => i.id === value) : null;

  const { suggestions, rest, filtered } = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      const sugg = rank(ocrName, 6).filter((x) => x.score > 0.15);
      const seen = new Set(sugg.map((x) => x.id));
      return { suggestions: sugg, rest: inventory.filter((i) => !seen.has(i.id)), filtered: false };
    }
    const terms = query.split(/\s+/);
    const hit = (i) => {
      const hay = `${i.name || ''} ${i.code || ''} ${i.brand || ''} ${i.category || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    };
    return { suggestions: [], rest: inventory.filter(hit), filtered: true };
  }, [q, ocrName, inventory, rank]);

  const CAP = 60;
  const shown = rest.slice(0, CAP);

  const row = (label, sub, onClick, key, extra) => (
    <button key={key} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      width: '100%', textAlign: 'left', background: 'none', border: 'none',
      borderBottom: '1px solid var(--border)', padding: '11px 14px', color: 'var(--text)',
      fontSize: '0.88rem',
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text3)' }}>{sub}</span>}
      </span>
      {extra}
    </button>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} title={selected ? selected.name : 'Choose an inventory item'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          width: '100%', minWidth: 0, textAlign: 'left',
          background: 'var(--input-bg)', border: '1px solid var(--border2)',
          borderRadius: 'var(--radius)', color: 'var(--text)',
          padding: isMobile ? '10px 12px' : '6px 8px', fontSize: isMobile ? '0.95rem' : '12.5px',
          ...flagStyle(flag),
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : `➕ New item${ocrName ? `: ${ocrName}` : ''}`}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text3)' }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900 }} />
          <div style={{
            position: 'fixed', zIndex: 901, background: 'var(--bg2)',
            border: '1px solid var(--border2)', boxShadow: 'var(--shadow)',
            display: 'flex', flexDirection: 'column',
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, top: '12%', borderRadius: '16px 16px 0 0' }
              : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 520, maxHeight: '72vh', borderRadius: 'var(--radius-lg)' }),
          }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, code or brand…"
                  style={{ padding: '9px 12px 9px 30px', width: '100%' }} />
              </div>
              <button data-compact onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text2)', padding: 6 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {row(`➕ New item${ocrName ? `: ${ocrName}` : ''}`,
                'Adds it to inventory when the invoice is confirmed',
                () => { onChange(null); setOpen(false); }, '__new__')}

              {suggestions.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px', fontSize: '0.7rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--bg3)' }}>
                    Closest to what was scanned
                  </div>
                  {suggestions.map((i) => row(i.name, i.code || undefined,
                    () => { onChange(i.id); setOpen(false); }, `s-${i.id}`,
                    <span style={{ flexShrink: 0, fontSize: '0.72rem', color: i.score > 0.7 ? 'var(--green)' : WARN }}>
                      {Math.round(i.score * 100)}%
                    </span>))}
                </>
              )}

              {!filtered && shown.length > 0 && (
                <div style={{ padding: '8px 14px', fontSize: '0.7rem', fontFamily: 'var(--font-head)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--bg3)' }}>
                  All items ({rest.length})
                </div>
              )}
              {shown.map((i) => row(i.name, i.code || undefined,
                () => { onChange(i.id); setOpen(false); }, i.id))}

              {rest.length > CAP && (
                <div style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text3)' }}>
                  Showing {CAP} of {rest.length} — keep typing to narrow it down.
                </div>
              )}
              {filtered && rest.length === 0 && (
                <div style={{ padding: '18px 14px', fontSize: '0.85rem', color: 'var(--text2)' }}>
                  Nothing matches “{q}”. Pick “New item” to add it to inventory.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ScanInvoice() {
  const navigate = useNavigate();
  const { formatCurrency, formatDate, isMobile } = useApp();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [step, setStep] = useState('capture'); // capture | processing | review | saving
  const [img, setImg] = useState(null);
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [dupAccepted, setDupAccepted] = useState(false);
  const [rank, setRank] = useState(() => () => []);

  // review state
  const [meta, setMeta] = useState({ supplierId: '', supplierName: '', dateRead: false,
    documentNo: '', date: '', status: 'unpaid', remarks: '', previousBalance: 0, totalDue: 0 });
  const [printed, setPrinted] = useState({ subtotal: 0, discount: 0, netTotal: 0, totalQty: 0 });
  const [lines, setLines] = useState([]);

  const setMetaField = (changes) => setMeta(m => ({ ...m, ...changes }));

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setStep('processing');
    try {
      const compressed = await compressImage(file);
      setImg(compressed);
      const [supps, items, saved] = await Promise.all([
        getAll(COLLECTIONS.SUPPLIERS), getAll(COLLECTIONS.INVENTORY),
        getAll(COLLECTIONS.PURCHASE_INVOICES),
      ]);
      setSuppliers(supps); setInventory(items); setSavedInvoices(saved);
      setDupAccepted(false);
      const ranker = makeRanker(items);
      setRank(() => ranker);

      const { data: res, error: fnError } = await supabase.functions.invoke('ocr-invoice', {
        body: { image: compressed.base64, mimeType: compressed.mimeType },
      });
      if (fnError) {
        // supabase-js wraps non-2xx into FunctionsHttpError; surface the body
        let detail = fnError.message;
        try { detail = (await fnError.context.json()).error || detail; } catch {}
        throw new Error(detail);
      }
      if (!res?.ok) throw new Error(res?.error || 'OCR failed');

      const d = res.data || {};
      setProvider(res.provider || '');
      const suppMatch = bestMatch(d.supplierName || '', supps, 0.35);
      setMeta({
        supplierId: suppMatch?.id || '',
        supplierName: d.supplierName || '',
        dateRead: !!d.date,
        documentNo: d.documentNo || '',
        date: d.date || new Date().toISOString().split('T')[0],
        status: 'unpaid',
        remarks: d.remarks || '',
        previousBalance: num(d.previousBalance),
        totalDue: num(d.totalDue),
      });
      setPrinted({ subtotal: num(d.subtotal), discount: num(d.discount),
        netTotal: num(d.netTotal), totalQty: num(d.totalQty) });
      setLines((d.items || [])
        .map((it) => ({
          ocrName: (it.name || '').trim(),
          unit: (it.unit || 'pcs').toLowerCase(),
          qty: num(it.qty), rate: num(it.rate), printedAmount: num(it.amount),
        }))
        // Models sometimes pad the table with an empty trailing row.
        .filter((l) => l.ocrName || l.qty > 0 || l.rate > 0)
        .map(reconcileQty)
        .map((l) => ({ ...l, ...pickMatch(ranker, l.ocrName), manual: false })));
      setStep('review');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to read invoice');
      setStep('capture');
    }
  };

  const setLine = (idx, changes) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...changes } : l));

  // Once the user types a quantity themselves it is no longer a derived one.
  const setQty = (idx, qty) => setLine(idx, { qty, qtyFromAmount: false });

  const activeLines = useMemo(() => lines.filter(l => l.action !== 'skip'), [lines]);
  const total = useMemo(() =>
    activeLines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0),
    [activeLines]);

  // ── What didn't come through ───────────────────────────────────────────────
  // Recomputed from live state, so a highlight clears as soon as it's fixed.
  const metaFlags = useMemo(() => {
    const f = {};
    if (!meta.supplierId && !meta.supplierName.trim())
      f.supplier = { level: 'error', msg: "Supplier wasn't read — pick one or type a name" };
    if (!meta.documentNo.trim())
      f.documentNo = { level: 'warn', msg: "Invoice no. wasn't read" };
    if (!meta.date) f.date = { level: 'error', msg: 'Date is required' };
    else if (!meta.dateRead) f.date = { level: 'warn', msg: "Date wasn't read — defaulted to today" };
    return f;
  }, [meta]);

  const lineFlags = useMemo(() => lines.map((l) => {
    if (l.action === 'skip') return {};
    const f = {};
    if (!String(l.ocrName || '').trim()) f.name = { level: 'error', msg: "Name wasn't read", short: 'not read' };
    if (!(num(l.qty) > 0)) f.qty = { level: 'error', msg: "Qty wasn't read", short: 'not read' };
    else if (l.qtyFromAmount) f.qty = {
      level: 'warn', short: `read as ${l.qtyRead}`,
      msg: `Qty read as ${l.qtyRead}; set to ${l.qty} from the printed line total ${formatCurrency(l.printedAmount)} — confirm it`,
    };
    if (!(num(l.rate) > 0)) f.rate = { level: 'warn', msg: "Rate wasn't read", short: 'not read' };
    else if (l.printedAmount > 0 && num(l.qty) > 0 && differs(num(l.qty) * num(l.rate), l.printedAmount))
      f.rate = { level: 'warn', msg: `Qty × rate ≠ printed ${formatCurrency(l.printedAmount)}`, short: `≠ ${formatCurrency(l.printedAmount)}` };
    if (l.action === 'match' && !l.itemId) f.item = { level: 'error', msg: 'Pick an inventory item', short: 'pick an item' };
    else if (l.action === 'match' && !l.userPicked && l.matchScore < 0.75)
      f.item = { level: 'warn', msg: 'Not a confident match — check this is the right item', short: 'check the item' };
    else if (l.action === 'create' && l.nearMiss)
      f.item = {
        level: 'warn', short: 'similar item exists',
        msg: `Will create a new item — "${l.nearMiss.name}" already looks similar (${Math.round(l.nearMiss.score * 100)}%)`,
      };
    return f;
  }), [lines, formatCurrency]);

  const duplicate = useMemo(() => findDuplicate(savedInvoices, {
    supplierId: meta.supplierId,
    supplierName: meta.supplierId
      ? (suppliers.find((x) => x.id === meta.supplierId)?.name || '')
      : meta.supplierName,
    documentNo: meta.documentNo, date: meta.date, total,
  }), [savedInvoices, meta.supplierId, meta.supplierName, meta.documentNo, meta.date, total, suppliers]);

  const qtyTotal = useMemo(() => activeLines.reduce((s, l) => s + num(l.qty), 0), [activeLines]);

  const qtyFlag = useMemo(() => {
    if (!printed.totalQty || !activeLines.length) return null;
    return differs(qtyTotal, printed.totalQty)
      ? { level: 'warn', msg: `Invoice prints ${printed.totalQty} — check the quantities below` }
      : null;
  }, [printed.totalQty, qtyTotal, activeLines.length]);

  const totalFlag = useMemo(() => {
    if (!printed.netTotal || !activeLines.length) return null;
    return differs(total, printed.netTotal)
      ? { level: 'warn', msg: `Invoice prints ${formatCurrency(printed.netTotal)} — check the lines below` }
      : null;
  }, [printed.netTotal, total, activeLines.length, formatCurrency]);

  // Blocking problems keep the Confirm button disabled; warnings only nag.
  const problems = useMemo(() => {
    const errors = [], warnings = [];
    const push = (flag, text) => (flag.level === 'error' ? errors : warnings).push(text);

    Object.values(metaFlags).forEach(f => push(f, f.msg));
    if (!activeLines.length) errors.push('No line items — add one or rescan');
    if (duplicate && !dupAccepted) {
      errors.push(`Already entered as ${duplicate.invoice.invoiceNo} — confirm it is a different invoice`);
    }
    lineFlags.forEach((flags, idx) => {
      Object.values(flags).forEach(f => push(f, `Line ${idx + 1}: ${f.msg}`));
    });
    if (qtyFlag) warnings.push(`Quantity ${qtyTotal} — ${qtyFlag.msg}`);
    if (totalFlag) warnings.push(`Total ${formatCurrency(total)} — ${totalFlag.msg}`);
    return { errors, warnings };
  }, [metaFlags, lineFlags, activeLines.length, duplicate, dupAccepted, qtyFlag, qtyTotal, totalFlag, total, formatCurrency]);

  const nextInvoiceNo = async () => {
    const existing = await getAll(COLLECTIONS.PURCHASE_INVOICES);
    const nums = existing.map(i => parseInt((i.invoiceNo || 'PI-0').split('-')[1])).filter(Boolean);
    return { no: `PI-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`, existing };
  };

  const handleConfirm = async () => {
    if (problems.errors.length) return toast.error(problems.errors[0]);
    setStep('saving');
    try {
      // 1. supplier
      let supplierId = meta.supplierId;
      let supplierName = meta.supplierName.trim();
      if (supplierId) {
        supplierName = suppliers.find(s => s.id === supplierId)?.name || supplierName;
      } else {
        supplierId = await create(COLLECTIONS.SUPPLIERS, {
          name: supplierName, company: '', email: '', phone: '', address: '',
          city: '', country: 'Pakistan', category: 'goods', balance: 0, currency: 'PKR',
          createdVia: 'ocr',
        });
      }

      // 2. items — create the ones flagged as new
      const resolvedLines = [];
      for (const l of activeLines) {
        let itemId = l.itemId, itemDoc = null;
        if (l.action === 'create') {
          itemId = await create(COLLECTIONS.INVENTORY, {
            code: `OCR-${Date.now().toString(36).toUpperCase()}${resolvedLines.length}`,
            name: l.ocrName.trim(), description: '', brand: '', category: '',
            unit: l.unit || 'pcs', costPrice: num(l.rate), salePrice: 0,
            quantity: 0, reorderLevel: 10, warehouseId: '', supplierId,
            taxRate: 0, barcode: '', status: 'active', createdVia: 'ocr',
          });
        } else {
          itemDoc = inventory.find(i => i.id === itemId) || null;
        }
        resolvedLines.push({ ...l, itemId, itemDoc });
      }

      // 3. purchase invoice
      const { no } = await nextInvoiceNo();
      const items = resolvedLines.map(l => ({
        itemId: l.itemId,
        itemCode: l.itemDoc?.code || '',
        itemName: l.itemDoc?.name || l.ocrName.trim(),
        description: l.itemDoc && similarity(l.ocrName, l.itemDoc.name) < 0.99 ? l.ocrName.trim() : '',
        qty: num(l.qty), unit: l.itemDoc?.unit || l.unit || 'pcs',
        unitPrice: num(l.rate), discount: 0, taxRate: 0,
        total: num(l.qty) * num(l.rate), isCustom: false,
      }));
      const paid = meta.status === 'paid';
      const invoiceId = await create(COLLECTIONS.PURCHASE_INVOICES, {
        invoiceNo: no, supplierInvoiceNo: meta.documentNo,
        date: meta.date, dueDate: '',
        supplierId, supplierName, supplierPhone: '', supplierAddress: '',
        status: meta.status, paymentMethod: '',
        notes: [meta.remarks, provider ? `Scanned via AI OCR (${provider})` : 'Scanned via AI OCR']
          .filter(Boolean).join(' — '),
        items, subtotal: total, discountAmount: 0, taxAmount: 0,
        total, paidAmount: paid ? total : 0, currency: 'PKR',
        source: 'ocr',
        supplierStatement: { previousBalance: num(meta.previousBalance), totalDue: num(meta.totalDue) },
      });

      // 4. attach the scanned photo to the invoice it produced. The invoice is
      // already saved, so a storage failure must not lose it — but it must not
      // pass silently either, or the user believes they have an attachment.
      const scanPath = `scans/${invoiceId}.jpg`;
      try {
        const { error: upErr } = await supabase.storage.from('erp-scans')
          .upload(scanPath, img.blob, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        await update(COLLECTIONS.PURCHASE_INVOICES, invoiceId, {
          scanPath,
          scanUploadedAt: new Date().toISOString(),
          scanSize: img.blob.size,
        });
      } catch (e) {
        console.warn('scan upload failed', e);
        toast.error(`Invoice saved, but the scan image could not be attached: ${e.message || e}`,
                    { duration: 7000 });
      }

      // 5. inventory quantities + cost prices
      for (const l of resolvedLines) {
        const current = await getOne(COLLECTIONS.INVENTORY, l.itemId);
        if (!current) continue;
        await update(COLLECTIONS.INVENTORY, l.itemId, {
          quantity: (Number(current.quantity) || 0) + num(l.qty),
          costPrice: num(l.rate) || current.costPrice || 0,
        });
      }

      // 6. supplier balance (unpaid amount owed to supplier)
      if (!paid) {
        const supp = await getOne(COLLECTIONS.SUPPLIERS, supplierId);
        await update(COLLECTIONS.SUPPLIERS, supplierId, {
          balance: (Number(supp?.balance) || 0) + total,
        });
      }

      toast.success(`Purchase invoice ${no} created — stock & supplier balance updated`);
      navigate('/purchases');
    } catch (e) {
      console.error(e);
      toast.error('Save failed: ' + e.message);
      setStep('review');
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const th = { padding: '8px 8px', fontSize: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' };
  const cardTitle = { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const cellInput = (val, onChange, flag, type = 'text') => (
    <input type={type} value={val} onChange={onChange} inputMode={type === 'number' ? 'decimal' : undefined}
      title={type === 'text' ? String(val || '') : undefined}
      style={{ width: '100%', minWidth: 0, padding: '6px 6px', borderRadius: 6, fontSize: '13px', ...flagStyle(flag) }} />
  );

  const onItemPick = (idx) => (id) =>
    setLine(idx, id
      ? { action: 'match', itemId: id, matchScore: 1, userPicked: true, nearMiss: null }
      : { action: 'create', itemId: '', matchScore: 0, userPicked: true, nearMiss: null });
  const toggleSkip = (idx, l) =>
    setLine(idx, { action: l.action === 'skip' ? (l.itemId ? 'match' : 'create') : 'skip' });

  const amountOf = (l) => formatCurrency(num(l.qty) * num(l.rate));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Header title="Scan Purchase Invoice" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20, maxWidth: 1250 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Btn variant="ghost" icon={ArrowLeft} onClick={() => navigate('/purchases')}>
            {isMobile ? 'Back' : 'Back to Purchases'}
          </Btn>
          <div style={{ flex: 1 }} />
          {step === 'review' && (
            <Btn variant="secondary" icon={RefreshCw} onClick={() => { setStep('capture'); setImg(null); }}>Rescan</Btn>
          )}
        </div>

        {step === 'capture' && (
          <Card style={{ textAlign: 'center', padding: isMobile ? '32px 18px' : 48 }}>
            <Sparkles size={40} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.25rem', marginBottom: 8 }}>
              Scan a supplier invoice
            </div>
            <div style={{ color: 'var(--text2)', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto 24px' }}>
              Take a photo of the invoice or delivery challan. AI reads the items, quantities and
              rates, matches them against your inventory, then asks you to review before anything
              is saved.
            </div>
            {error && (
              <div style={{ background: ERR_BG, border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: '0.85rem' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn icon={Camera} onClick={() => cameraRef.current?.click()}>Take Photo</Btn>
              <Btn variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>Upload Image</Btn>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => handleFile(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={e => handleFile(e.target.files?.[0])} />
          </Card>
        )}

        {(step === 'processing' || step === 'saving') && (
          <Card style={{ textAlign: 'center', padding: isMobile ? '32px 18px' : 48 }}>
            <Loader />
            <div style={{ marginTop: 12, color: 'var(--text2)' }}>
              {step === 'processing' ? 'Reading invoice with AI…' : 'Saving invoice, updating stock & supplier balance…'}
            </div>
          </Card>
        )}

        {step === 'review' && (
          <div className="g-main" style={{ gap: isMobile ? 14 : 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 16, minWidth: 0 }}>

              {/* Already entered */}
              {duplicate && (
                <div style={{
                  background: ERR_BG, border: '1px solid var(--red)', borderLeft: '4px solid var(--red)',
                  borderRadius: 'var(--radius-lg)', padding: '13px 15px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <Copy size={16} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', marginBottom: 4 }}>
                      This invoice looks like one you already have
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.5 }}>
                      {duplicate.invoice.invoiceNo} — {duplicate.invoice.supplierName || 'same supplier'}
                      {duplicate.invoice.supplierInvoiceNo ? `, their invoice ${duplicate.invoice.supplierInvoiceNo}` : ''}
                      {duplicate.invoice.date ? ` on ${formatDate(duplicate.invoice.date)}` : ''}
                      {' '}for {formatCurrency(num(duplicate.invoice.total))} (matched on {duplicate.on}).
                      Saving it again would add the stock and the supplier balance a second time.
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.82rem', color: 'var(--text)' }}>
                      <input type="checkbox" checked={dupAccepted}
                        onChange={(e) => setDupAccepted(e.target.checked)}
                        style={{
                          // globals.css strips appearance from every input, which
                          // leaves a checkbox as an empty rounded box.
                          appearance: 'checkbox', WebkitAppearance: 'checkbox',
                          width: 16, height: 16, minHeight: 0, minWidth: 0, flexShrink: 0,
                          padding: 0, borderRadius: 3, accentColor: 'var(--red)',
                        }} />
                      This is a different invoice — save it anyway
                    </label>
                  </div>
                </div>
              )}

              {/* What didn't come through */}
              {(problems.errors.length > 0 || problems.warnings.length > 0) && (
                <div style={{
                  background: problems.errors.length ? ERR_BG : WARN_BG,
                  border: `1px solid ${problems.errors.length ? 'var(--red)' : WARN}`,
                  borderRadius: 'var(--radius-lg)', padding: '12px 14px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <AlertTriangle size={16} style={{ color: problems.errors.length ? 'var(--red)' : WARN, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: problems.errors.length ? 'var(--red)' : WARN, marginBottom: 4 }}>
                      {[
                        problems.errors.length && `${problems.errors.length} field${problems.errors.length > 1 ? 's' : ''} to fix before saving`,
                        problems.warnings.length && `${problems.warnings.length} to double-check`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.8rem', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[...problems.errors, ...problems.warnings].slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}
                      {problems.errors.length + problems.warnings.length > 6 && (
                        <li>…and {problems.errors.length + problems.warnings.length - 6} more, highlighted below</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Invoice details */}
              <Card style={isMobile ? { padding: 16 } : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span style={cardTitle}>Invoice Details</span>
                  {provider && <Badge color="purple">read by {provider}</Badge>}
                </div>
                <div className="g-2" style={{ gap: 12 }}>
                  <SelectField label="Supplier" flag={metaFlags.supplier}
                    value={meta.supplierId || '__new__'}
                    onChange={e => setMetaField({ supplierId: e.target.value === '__new__' ? '' : e.target.value })}>
                    <option value="__new__">
                      {meta.supplierName.trim() ? `➕ Create "${meta.supplierName.trim()}"` : '➕ Create a new supplier'}
                    </option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </SelectField>

                  {!meta.supplierId && (
                    <TextField label="New supplier name" flag={metaFlags.supplier}
                      placeholder="Name on the invoice"
                      value={meta.supplierName}
                      onChange={e => setMetaField({ supplierName: e.target.value })} />
                  )}

                  <TextField label="Supplier Invoice No." flag={metaFlags.documentNo}
                    placeholder="Not read — type it in"
                    value={meta.documentNo}
                    onChange={e => setMetaField({ documentNo: e.target.value })} />

                  <TextField label="Date" type="date" flag={metaFlags.date}
                    value={meta.date}
                    onChange={e => setMetaField({ date: e.target.value, dateRead: true })} />

                  <SelectField label="Payment Status" value={meta.status}
                    onChange={e => setMetaField({ status: e.target.value })}>
                    <option value="unpaid">Unpaid (adds to supplier balance)</option>
                    <option value="paid">Paid</option>
                  </SelectField>

                  <TextField label="Prev. balance on invoice" type="number"
                    value={meta.previousBalance}
                    onChange={e => setMetaField({ previousBalance: e.target.value })} />

                  <TextField label="Total due on invoice" type="number"
                    value={meta.totalDue}
                    onChange={e => setMetaField({ totalDue: e.target.value })} />

                  <Field label="Remarks" style={{ gridColumn: '1 / -1' }}>
                    <textarea rows={2} value={meta.remarks}
                      placeholder="Transporter / bilty / notes"
                      onChange={e => setMetaField({ remarks: e.target.value })}
                      style={{ padding: '8px 12px', width: '100%', resize: 'vertical' }} />
                  </Field>
                </div>
              </Card>

              {/* Extracted items */}
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={cardTitle}>Extracted Items ({activeLines.length})</span>
                  <Btn size="sm" variant="secondary" icon={Plus}
                    onClick={() => setLines(ls => [...ls, emptyLine()])}>Add line</Btn>
                </div>

                {lines.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: '0.85rem' }}>
                    No items were read from this photo. Add the lines by hand, or rescan with a
                    clearer picture.
                  </div>
                )}

                {/* Mobile: one card per line. Desktop: table. */}
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {lines.map((l, idx) => {
                      const f = lineFlags[idx] || {};
                      const skipped = l.action === 'skip';
                      const bad = Object.values(f).some(x => x.level === 'error');
                      return (
                        <div key={idx} style={{
                          borderBottom: '1px solid var(--border)', padding: 14,
                          opacity: skipped ? 0.45 : 1,
                          borderLeft: `3px solid ${skipped ? 'transparent' : bad ? 'var(--red)' : Object.keys(f).length ? WARN : 'transparent'}`,
                          background: skipped ? 'var(--bg3)' : 'transparent',
                        }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Field label={`Line ${idx + 1} — read from invoice`} flag={f.name}>
                                <input value={l.ocrName} placeholder="Item name"
                                  onChange={e => setLine(idx, { ocrName: e.target.value })}
                                  style={{ padding: '8px 12px', width: '100%', ...flagStyle(f.name) }} />
                              </Field>
                            </div>
                            <button data-compact title={skipped ? 'Restore line' : 'Skip line'}
                              onClick={() => toggleSkip(idx, l)}
                              style={{ background: 'none', border: 'none', padding: 6, marginTop: 18, color: skipped ? 'var(--green)' : 'var(--red)' }}>
                              {skipped ? <RefreshCw size={16} /> : <X size={17} />}
                            </button>
                          </div>

                          {!skipped && (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                                <TextField label="Qty" type="number" flag={f.qty} value={l.qty}
                                  onChange={e => setQty(idx, e.target.value)} inputMode="decimal" />
                                <TextField label="Unit" value={l.unit}
                                  onChange={e => setLine(idx, { unit: e.target.value })} />
                                <TextField label="Rate" type="number" flag={f.rate} value={l.rate}
                                  onChange={e => setLine(idx, { rate: e.target.value })} inputMode="decimal" />
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <Field label="Inventory item" flag={f.item}>
                                  <ItemPicker value={l.itemId} ocrName={l.ocrName}
                                    inventory={inventory} rank={rank} flag={f.item}
                                    onChange={onItemPick(idx)} isMobile />
                                </Field>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text2)' }}>
                                  {l.action !== 'match' ? 'Will be created'
                                    : l.userPicked ? 'Chosen by you'
                                    : `${Math.round(l.matchScore * 100)}% match`}
                                </span>
                                <span style={{ fontWeight: 700 }}>{amountOf(l)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ ...th, minWidth: 150 }}>Read from invoice</th>
                          <th style={{ ...th, minWidth: 160 }}>Inventory item</th>
                          <th style={{ ...th, width: 66 }}>Qty</th>
                          <th style={{ ...th, width: 58 }}>Unit</th>
                          <th style={{ ...th, width: 84 }}>Rate</th>
                          <th style={{ ...th, textAlign: 'right', width: 96 }}>Amount</th>
                          <th style={{ ...th, width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, idx) => {
                          const f = lineFlags[idx] || {};
                          const skipped = l.action === 'skip';
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', opacity: skipped ? 0.4 : 1, verticalAlign: 'top' }}>
                              <td style={{ padding: '7px 8px' }}>
                                {cellInput(l.ocrName, e => setLine(idx, { ocrName: e.target.value }), f.name)}
                                <Hint flag={f.name} short />
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                {skipped ? <span style={{ color: 'var(--text3)', fontSize: '12px' }}>skipped</span> : (
                                  <>
                                    <ItemPicker value={l.itemId} ocrName={l.ocrName}
                                      inventory={inventory} rank={rank} flag={f.item}
                                      onChange={onItemPick(idx)} isMobile={false} />
                                    {f.item
                                      ? <Hint flag={f.item} short />
                                      : l.action === 'match' && l.matchScore > 0 && !l.userPicked && (
                                        <span style={{ fontSize: '10px', color: 'var(--green)' }}>
                                          {Math.round(l.matchScore * 100)}% match
                                        </span>
                                      )}
                                  </>
                                )}
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                {cellInput(l.qty, e => setQty(idx, e.target.value), f.qty, 'number')}
                                <Hint flag={f.qty} short />
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                {cellInput(l.unit, e => setLine(idx, { unit: e.target.value }))}
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                {cellInput(l.rate, e => setLine(idx, { rate: e.target.value }), f.rate, 'number')}
                                <Hint flag={f.rate} short />
                              </td>
                              <td style={{ padding: '13px 8px 7px', textAlign: 'right', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                                {amountOf(l)}
                              </td>
                              <td style={{ padding: '11px 8px 7px' }}>
                                <button data-compact title={skipped ? 'Restore line' : 'Skip line'}
                                  onClick={() => toggleSkip(idx, l)}
                                  style={{ background: 'none', border: 'none', color: skipped ? 'var(--green)' : 'var(--red)', cursor: 'pointer' }}>
                                  {skipped ? <RefreshCw size={14} /> : <X size={15} />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 16, minWidth: 0 }}>
              <Card style={isMobile ? { padding: 16 } : undefined}>
                <div style={{ ...cardTitle, marginBottom: 14 }}>Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Items</span><span>{activeLines.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Quantity</span>
                    <span style={{ color: qtyFlag ? WARN : undefined }}>{qtyTotal}</span>
                  </div>
                  <Hint flag={qtyFlag} />
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', alignItems: 'baseline' }}>
                    <span>Total</span>
                    <span style={{ color: totalFlag ? WARN : 'var(--purple)', textAlign: 'right', wordBreak: 'break-word' }}>
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <Hint flag={totalFlag} />
                  {num(meta.previousBalance) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text2)', fontSize: '0.8rem' }}>
                      <span>Prev. balance on invoice</span><span>{formatCurrency(num(meta.previousBalance))}</span>
                    </div>
                  )}
                  {num(meta.totalDue) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text2)', fontSize: '0.8rem' }}>
                      <span>Total due on invoice</span><span>{formatCurrency(num(meta.totalDue))}</span>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Btn icon={Check} onClick={handleConfirm} disabled={problems.errors.length > 0}
                    style={{ justifyContent: 'center' }}>
                    Confirm & Create Invoice
                  </Btn>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center' }}>
                    {problems.errors.length
                      ? 'Fix the highlighted fields above to enable this.'
                      : `Creates the purchase invoice, adds quantities to stock, updates item cost prices${meta.status === 'unpaid' ? ' and adds the total to the supplier balance' : ''}.`}
                  </div>
                </div>
              </Card>
              {img && (
                <Card style={{ padding: 8 }}>
                  <img src={img.previewUrl} alt="Scanned invoice"
                    style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
