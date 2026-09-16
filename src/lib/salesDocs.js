// src/lib/salesDocs.js — what kind of sales document a record is.
//
// Sales invoices and quotations live in the same table and share one form,
// one print layout and one list: a quotation is an invoice that has not been
// sold yet. `docType` tells them apart, and everything that must treat them
// differently — numbering, titles, whether money is owed — asks here.

export const DOC_TYPES = [
  { value: 'invoice',   label: 'Sales Invoice', short: 'Invoice', prefix: 'SI', color: 'blue' },
  { value: 'quotation', label: 'Quotation',     short: 'Quote',   prefix: 'QT', color: 'purple' },
];

const BY_VALUE = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t]));

export const DOC_TYPE_OPTIONS = DOC_TYPES.map(({ value, label }) => ({ value, label }));

// Records written before quotations existed carry no docType: they are invoices.
export const docTypeOf = (doc) => (doc?.docType === 'quotation' ? 'quotation' : 'invoice');
export const isQuotation = (doc) => docTypeOf(doc) === 'quotation';
export const docMeta = (doc) => BY_VALUE[docTypeOf(doc)];
export const docLabel = (doc) => docMeta(doc).label;
export const docPrefix = (type) => (BY_VALUE[type] || BY_VALUE.invoice).prefix;

// The wording a quotation and an invoice each print at the bottom.
export const DEFAULT_TERMS = {
  invoice: 'Payment due within 30 days. Thank you for your business.',
  quotation: 'Prices are valid for 15 days from the date above. Delivery subject to stock availability.',
};

// The next number in a prefix's own sequence: SI-0001, SI-0002 … for invoices
// and QT-0001 … for quotations, each counted separately even though both sit
// in one table. Numbers with another prefix (the Manager import's bare "1157",
// say) are left alone. Callers pass trashed records too, so a restored record
// cannot collide with a number handed out while it sat in the trash.
export const nextDocNo = (existing = [], prefix = 'SI') => {
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let max = 0;
  for (const r of existing) {
    const m = re.exec(String(r?.invoiceNo || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

// ── Arithmetic ──────────────────────────────────────────────────────────────
// One line's total after its own discount and tax, and the document totals
// built from the lines. The form, the AI draft and the quotation converter all
// use these so a document never carries totals that disagree with its lines.
export const calcLine = (line) => {
  const qty = Number(line.qty) || 0, price = Number(line.unitPrice) || 0;
  const disc = Number(line.discount) || 0, tax = Number(line.taxRate) || 0;
  const sub = qty * price, discAmt = sub * (disc / 100);
  return { ...line, total: sub - discAmt + (sub - discAmt) * (tax / 100) };
};

export const calcTotals = (items = []) => {
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  const discountAmount = items.reduce((s, i) => s + ((Number(i.qty) || 0) * (Number(i.unitPrice) || 0)) * ((Number(i.discount) || 0) / 100), 0);
  const taxAmount = items.reduce((s, i) => {
    const sub = (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), disc = sub * ((Number(i.discount) || 0) / 100);
    return s + (sub - disc) * ((Number(i.taxRate) || 0) / 100);
  }, 0);
  return { subtotal, discountAmount, taxAmount, total: subtotal - discountAmount + taxAmount };
};
