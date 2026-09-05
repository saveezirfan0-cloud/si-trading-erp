// src/pages/purchases/ScanInvoice.js
//
// OCR purchase-invoice capture: photograph a supplier invoice → AI vision
// extracts the lines → review & confirm → creates the purchase invoice,
// updates inventory quantities/costs and the supplier balance.
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAll, getOne, create, update, COLLECTIONS } from '../../lib/db';
import { findDuplicate } from '../../lib/invoices';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Card, Input, Select, Loader, Badge, ItemPicker } from '../../components/ui';
import toast from 'react-hot-toast';
import { Camera, Upload, ArrowLeft, Check, RefreshCw, Sparkles, X, AlertTriangle } from 'lucide-react';

// ── Image compression ────────────────────────────────────────────────────────
// Decode with the photo's EXIF orientation applied. These challans are shot
// sideways on a phone, and a sideways table is read noticeably worse — rows
// slide into each other and descriptions land on the wrong quantity.
const decodeImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { /* older browsers ignore the option or reject it — fall through */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
};

// 2000px keeps the rate/quantity columns of a dense 7–20 row table legible;
// below that the digits start to blur together on a phone photo.
const compressImage = async (file, maxDim = 2000, quality = 0.9) => {
  const src = await decodeImage(file);
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (typeof src.close === 'function') src.close();

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode image')), 'image/jpeg', quality));
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { base64, mimeType: 'image/jpeg', blob, previewUrl: canvas.toDataURL('image/jpeg', 0.6) };
};

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

// ── Component ────────────────────────────────────────────────────────────────
export default function ScanInvoice() {
  const navigate = useNavigate();
  const { formatCurrency } = useApp();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const [step, setStep] = useState('capture'); // capture | processing | review | saving
  const [img, setImg] = useState(null);
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [existingInvoices, setExistingInvoices] = useState([]);

  // review state
  const [meta, setMeta] = useState({ supplierId: '', supplierName: '', newSupplier: false,
    documentNo: '', date: '', status: 'unpaid', remarks: '', previousBalance: 0, totalDue: 0,
    netTotal: 0 });
  const [lines, setLines] = useState([]);
  // Everything the reading disagreed with the invoice's own printed totals on.
  const [warnings, setWarnings] = useState([]);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setStep('processing');
    try {
      const compressed = await compressImage(file);
      setImg(compressed);
      const [supps, items, purchases] = await Promise.all([
        getAll(COLLECTIONS.SUPPLIERS), getAll(COLLECTIONS.INVENTORY),
        getAll(COLLECTIONS.PURCHASE_INVOICES),
      ]);
      setSuppliers(supps); setInventory(items); setExistingInvoices(purchases);

      const { data: res, error: fnError } = await supabase.functions.invoke('ocr-invoice', {
        body: { image: compressed.base64, mimeType: compressed.mimeType },
      });
      if (fnError) {
        // supabase-js wraps non-2xx into FunctionsHttpError; surface the body.
        let detail = fnError.message;
        try {
          const body = await fnError.context.json();
          detail = body.unreadable && body.detail
            ? `${body.error}. ${body.detail}`
            : (body.error || detail);
        } catch {}
        throw new Error(detail);
      }
      if (!res?.ok) throw new Error(res?.error || 'OCR failed');

      const d = res.data || {};
      setProvider(res.provider || '');
      setWarnings(res.warnings || []);
      const suppMatch = bestMatch(d.supplierName || '', supps, 0.35);
      setMeta({
        supplierId: suppMatch?.id || '',
        supplierName: d.supplierName || '',
        newSupplier: !suppMatch && !!d.supplierName,
        documentNo: d.documentNo || '',
        date: d.date || new Date().toISOString().split('T')[0],
        status: 'unpaid',
        remarks: d.remarks || '',
        previousBalance: Number(d.previousBalance) || 0,
        totalDue: Number(d.totalDue) || 0,
        netTotal: Number(d.netTotal) || Number(d.subtotal) || 0,
      });
      setLines((d.items || []).map((it) => {
        // A line the reader flagged as the same printed row read twice starts
        // skipped, so a phantom row can never be confirmed into stock by
        // someone who trusted the count — it stays visible and restorable.
        const dupOf = it.duplicateOf ?? null;
        const m = bestMatch(it.name || '', items);
        return {
          ocrName: it.name || '', unit: (it.unit || 'pcs').toLowerCase(),
          qty: Number(it.qty) || 0, rate: Number(it.rate) || 0,
          serial: it.serial ?? null,
          duplicateOf: dupOf,
          action: dupOf !== null ? 'skip' : (m ? 'match' : 'create'),
          itemId: m?.id || '',
          matchScore: m?._score || 0,
        };
      }));
      setStep('review');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to read invoice');
      setStep('capture');
    }
  };

  const setLine = (idx, changes) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...changes } : l));

  // Recomputed as the reviewer corrects the date, supplier or reference, so the
  // warning tracks what would actually be saved.
  const duplicateOf = useMemo(() => findDuplicate(existingInvoices, {
    date: meta.date,
    supplierInvoiceNo: meta.documentNo,
    supplierId: meta.supplierId,
    supplierName: meta.supplierId
      ? (suppliers.find(s => s.id === meta.supplierId)?.name || '')
      : meta.supplierName,
  }), [existingInvoices, meta.date, meta.documentNo, meta.supplierId, meta.supplierName, suppliers]);

  const activeLines = useMemo(() => lines.filter(l => l.action !== 'skip'), [lines]);
  const total = useMemo(() =>
    activeLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0),
    [activeLines]);

  const nextInvoiceNo = async () => {
    const existing = await getAll(COLLECTIONS.PURCHASE_INVOICES);
    const nums = existing.map(i => parseInt((i.invoiceNo || 'PI-0').split('-')[1])).filter(Boolean);
    return { no: `PI-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`, existing };
  };

  const handleConfirm = async () => {
    if (!meta.supplierId && !meta.supplierName.trim()) return toast.error('Select or name a supplier');
    if (!activeLines.length) return toast.error('No line items to save');
    if (activeLines.some(l => l.action === 'match' && !l.itemId)) return toast.error('Pick an inventory item for every matched line (or set it to New/Skip)');
    // Confirming posts stock and a supplier balance, so a reading that still
    // disagrees with the invoice's own printed net total is worth stopping on.
    if (meta.netTotal > 0 && Math.abs(total - meta.netTotal) > 1 && !window.confirm(
      `These lines add up to ${formatCurrency(total)}, but the invoice's printed net total is ` +
      `${formatCurrency(meta.netTotal)}.\n\nA line may have been read twice, missed, or read with ` +
      `the wrong quantity. Save anyway?`
    )) return;
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
            name: l.ocrName, description: '', brand: '', category: '',
            unit: l.unit || 'pcs', costPrice: Number(l.rate) || 0, salePrice: 0,
            quantity: 0, reorderLevel: 10, warehouseId: '', supplierId,
            taxRate: 0, barcode: '', status: 'active', createdVia: 'ocr',
          });
        } else {
          itemDoc = inventory.find(i => i.id === itemId) || null;
        }
        resolvedLines.push({ ...l, itemId, itemDoc });
      }

      // 3. purchase invoice.
      //
      // Before writing it, check whether this exact document (same date, same
      // supplier, same printed reference) is already recorded. A repeat is
      // still saved — the photo is evidence and quietly discarding someone's
      // capture is worse — but it is marked, and steps 5 and 6 below are
      // skipped so it moves no stock and owes no money.
      const { no, existing } = await nextInvoiceNo();
      const candidate = {
        date: meta.date,
        supplierInvoiceNo: meta.documentNo,
        supplierId, supplierName,
      };
      const duplicateOf = findDuplicate(existing, candidate);
      const qtyOf = (l) => Number(l.qty) || 0;
      const rateOf = (l) => Number(l.rate) || 0;
      const items = resolvedLines.map(l => ({
        itemId: l.itemId,
        itemCode: l.itemDoc?.code || '',
        itemName: l.itemDoc?.name || l.ocrName,
        description: l.itemDoc && similarity(l.ocrName, l.itemDoc.name) < 0.99 ? l.ocrName : '',
        qty: qtyOf(l), unit: l.itemDoc?.unit || l.unit || 'pcs',
        unitPrice: rateOf(l), discount: 0, taxRate: 0,
        total: qtyOf(l) * rateOf(l), isCustom: false,
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
        supplierStatement: { previousBalance: meta.previousBalance, totalDue: meta.totalDue },
        ...(duplicateOf ? {
          isDuplicate: true,
          duplicateOf: duplicateOf.id,
          duplicateOfNo: duplicateOf.invoiceNo || '',
          duplicateDetectedAt: new Date().toISOString(),
        } : {}),
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

      // 5. inventory quantities + cost prices — never for a duplicate, or the
      // same delivery would be counted into stock twice.
      for (const l of (duplicateOf ? [] : resolvedLines)) {
        const current = await getOne(COLLECTIONS.INVENTORY, l.itemId);
        if (!current) continue;
        await update(COLLECTIONS.INVENTORY, l.itemId, {
          quantity: (Number(current.quantity) || 0) + qtyOf(l),
          costPrice: rateOf(l) || current.costPrice || 0,
        });
      }

      // 6. supplier balance (unpaid amount owed to supplier)
      if (!paid && !duplicateOf) {
        const supp = await getOne(COLLECTIONS.SUPPLIERS, supplierId);
        await update(COLLECTIONS.SUPPLIERS, supplierId, {
          balance: (Number(supp?.balance) || 0) + total,
        });
      }

      if (duplicateOf) {
        toast(
          `Saved as a duplicate of ${duplicateOf.invoiceNo || 'an existing invoice'} — ` +
          'stock and supplier balance were left unchanged.',
          { icon: '⚠️', duration: 8000 }
        );
      } else {
        toast.success(`Purchase invoice ${no} created — stock & supplier balance updated`);
      }
      navigate('/purchases');
    } catch (e) {
      console.error(e);
      toast.error('Save failed: ' + e.message);
      setStep('review');
    }
  };

  const th = { padding: '8px 8px', fontSize: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' };
  const cellInput = (val, onChange, type = 'text', width) => (
    <input type={type} value={val} onChange={onChange}
      style={{ width: width || '100%', padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '13px' }} />
  );

  return (
    <>
      <Header title="Scan Purchase Invoice" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1250 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn variant="ghost" icon={ArrowLeft} onClick={() => navigate('/purchases')}>Back to Purchases</Btn>
          <div style={{ flex: 1 }} />
          {step === 'review' && (
            <Btn variant="secondary" icon={RefreshCw}
              onClick={() => { setStep('capture'); setImg(null); setWarnings([]); }}>Rescan</Btn>
          )}
        </div>

        {step === 'capture' && (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <Sparkles size={40} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.25rem', marginBottom: 8 }}>
              Scan a supplier invoice
            </div>
            <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
              Take a photo of the invoice or delivery challan. AI reads the items, quantities and
              rates, matches them against your inventory, then asks you to review before anything
              is saved.
            </div>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: '0.85rem' }}>
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
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <Loader />
            <div style={{ marginTop: 12, color: 'var(--text2)' }}>
              {step === 'processing' ? 'Reading invoice with AI…' : 'Saving invoice, updating stock & supplier balance…'}
            </div>
          </Card>
        )}

        {step === 'review' && duplicateOf && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: 'rgba(234,179,8,0.10)', border: '1px solid var(--yellow)',
            borderLeft: '4px solid var(--yellow)',
            borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: '0.86rem',
            lineHeight: 1.55,
          }}>
            <AlertTriangle size={17} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>This looks like a duplicate.</strong>{' '}
              {duplicateOf.invoiceNo || 'An existing invoice'} already records reference{' '}
              <strong>{meta.documentNo}</strong> from{' '}
              <strong>{duplicateOf.supplierName || 'this supplier'}</strong> dated{' '}
              <strong>{meta.date}</strong>. You can still save it — the scan will be kept and
              flagged as a duplicate, and it will not affect stock, totals or the supplier
              balance. Correct the date or reference above if this is in fact a different
              document.
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="g-main" style={{ gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invoice Details</span>
                  {provider && <Badge color="purple">read by {provider}</Badge>}
                </div>
                <div className="g-2" style={{ gap: 12 }}>
                  <div>
                    <Select label="Supplier" value={meta.supplierId}
                      onChange={e => setMeta(m => ({ ...m, supplierId: e.target.value, newSupplier: !e.target.value }))}
                      options={[
                        ...(meta.supplierName && !suppliers.some(s => similarity(s.name, meta.supplierName) > 0.99)
                          ? [{ value: '', label: `➕ Create "${meta.supplierName}"` }] : []),
                        ...suppliers.map(s => ({ value: s.id, label: s.name })),
                      ]} />
                    {!meta.supplierId && (
                      <div style={{ marginTop: 8 }}>
                        <Input label="New supplier name" value={meta.supplierName}
                          onChange={e => setMeta(m => ({ ...m, supplierName: e.target.value }))} />
                      </div>
                    )}
                  </div>
                  <Input label="Supplier Invoice No." value={meta.documentNo}
                    onChange={e => setMeta(m => ({ ...m, documentNo: e.target.value }))} />
                  <Input label="Date" type="date" value={meta.date}
                    onChange={e => setMeta(m => ({ ...m, date: e.target.value }))} />
                  <Select label="Payment Status" value={meta.status}
                    onChange={e => setMeta(m => ({ ...m, status: e.target.value }))}
                    options={[{ value: 'unpaid', label: 'Unpaid (adds to supplier balance)' }, { value: 'paid', label: 'Paid' }]} />
                </div>
              </Card>

              {warnings.length > 0 && (
                <Card style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid var(--yellow, #eab308)' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <AlertTriangle size={17} style={{ color: 'var(--yellow, #eab308)', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>
                        The reading doesn’t match the invoice’s own totals
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                        {warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                      <div style={{ marginTop: 7, fontSize: '0.78rem', color: 'var(--text3)' }}>
                        Fix the lines below before confirming, or rescan with the invoice flat and fully in frame.
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Extracted Items ({activeLines.length}
                    {lines.length !== activeLines.length ? ` of ${lines.length} read` : ''})
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Check every match before confirming</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                        <th style={th}>Read from invoice</th>
                        <th style={th}>Inventory item</th>
                        <th style={{ ...th, width: 70 }}>Qty</th>
                        <th style={{ ...th, width: 90 }}>Rate</th>
                        <th style={{ ...th, textAlign: 'right', width: 100 }}>Amount</th>
                        <th style={{ ...th, width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', opacity: l.action === 'skip' ? 0.4 : 1 }}>
                          <td style={{ padding: '7px 8px', fontSize: '13px', maxWidth: 220 }}>
                            <div style={{ fontWeight: 600 }}>
                              {l.serial ? <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{l.serial}. </span> : null}
                              {l.ocrName}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{l.unit}</div>
                            {l.duplicateOf !== null && l.duplicateOf !== undefined && (
                              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--yellow, #eab308)' }}>
                                Same row as line {l.duplicateOf} — skipped
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '7px 8px', minWidth: 220 }}>
                            {l.action === 'skip' ? <span style={{ color: 'var(--text3)', fontSize: '12px' }}>skipped</span> : (
                              <>
                                <ItemPicker
                                  items={inventory}
                                  value={l.action === 'create' ? '__new__' : l.itemId}
                                  onChange={(v) => {
                                    if (v === '__new__') setLine(idx, { action: 'create', itemId: '', matchScore: 0 });
                                    else setLine(idx, { action: 'match', itemId: v, matchScore: 0 });
                                  }}
                                  extraOptions={[{
                                    value: '__new__',
                                    label: `➕ New item: ${l.ocrName.slice(0, 34)}`,
                                    hint: 'Creates this item in inventory',
                                  }]}
                                  emptyLabel="Search inventory…"
                                  placeholder="Search by name, code, SKU, barcode…"
                                  style={{ fontSize: '12.5px' }}
                                />
                                {l.action === 'match' && l.matchScore > 0 && (
                                  <span style={{ fontSize: '10px', color: l.matchScore > 0.7 ? 'var(--green)' : 'var(--yellow)' }}>
                                    {Math.round(l.matchScore * 100)}% match
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '7px 8px' }}>{cellInput(l.qty, e => setLine(idx, { qty: e.target.value }), 'number')}</td>
                          <td style={{ padding: '7px 8px' }}>{cellInput(l.rate, e => setLine(idx, { rate: e.target.value }), 'number')}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                            {formatCurrency((Number(l.qty) || 0) * (Number(l.rate) || 0))}
                          </td>
                          <td style={{ padding: '7px 8px' }}>
                            <button title={l.action === 'skip' ? 'Restore line' : 'Skip line'}
                              onClick={() => setLine(idx, { action: l.action === 'skip' ? (l.itemId ? 'match' : 'create') : 'skip' })}
                              style={{ background: 'none', border: 'none', color: l.action === 'skip' ? 'var(--green)' : 'var(--red)', cursor: 'pointer' }}>
                              {l.action === 'skip' ? <RefreshCw size={14} /> : <X size={15} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.88rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text2)' }}>Items</span><span>{activeLines.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text2)' }}>Quantity</span>
                    <span>{activeLines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
                    <span>Total</span><span style={{ color: 'var(--purple)' }}>{formatCurrency(total)}</span>
                  </div>
                  {meta.netTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem',
                                  color: Math.abs(total - meta.netTotal) > 1 ? 'var(--yellow, #eab308)' : 'var(--text2)',
                                  fontWeight: Math.abs(total - meta.netTotal) > 1 ? 700 : 400 }}>
                      <span>Printed net total on invoice</span><span>{formatCurrency(meta.netTotal)}</span>
                    </div>
                  )}
                  {meta.previousBalance > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)', fontSize: '0.8rem' }}>
                      <span>Prev. balance on invoice</span><span>{formatCurrency(meta.previousBalance)}</span>
                    </div>
                  )}
                  {meta.totalDue > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)', fontSize: '0.8rem' }}>
                      <span>Total due on invoice</span><span>{formatCurrency(meta.totalDue)}</span>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Btn icon={Check} onClick={handleConfirm}
                    variant={duplicateOf ? 'secondary' : 'primary'}
                    style={{ justifyContent: 'center' }}>
                    {duplicateOf ? 'Save as duplicate' : 'Confirm & Create Invoice'}
                  </Btn>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center' }}>
                    {duplicateOf
                      ? 'Records the invoice and its scan for reference only — stock, totals and the supplier balance are left untouched.'
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
