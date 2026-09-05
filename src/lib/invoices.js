// src/lib/invoices.js — shared logic for the sales/purchase invoice lists.
//
// Both lists ask the same questions of a record: where did it come from, what
// does it still owe, is it late, is anything missing, and how should the rows
// be filtered and ordered. Keeping that here means the two pages stay thin and
// answer those questions identically.

import { isProvisional, needsApproval } from './invoiceStatus';

// ── Provenance ────────────────────────────────────────────────────────────────
//
// Manager.io rows are seeded by tools/manager-import with `importedFrom` and
// `managerKey`; the OCR capture screen stamps `source: 'ocr'` and a `scanPath`.
// Anything else was typed into this app.
export const SOURCES = {
  manual:  { label: 'Created here',      short: 'Manual',  color: 'blue' },
  manager: { label: 'Imported (Manager.io)', short: 'Manager', color: 'purple' },
  ocr:     { label: 'Scanned (AI OCR)',  short: 'Scanned', color: 'yellow' },
};

export const invoiceSource = (inv) => {
  if (!inv) return 'manual';
  if (inv.importedFrom || inv.managerKey) return 'manager';
  if (inv.source === 'ocr' || inv.createdVia === 'ocr' || inv.scanPath) return 'ocr';
  return 'manual';
};

// The Manager books were imported per business file; the note carries the book
// name, which is the only place the original ledger is recorded. Book names
// contain brackets of their own ("S.I.Trading Co (2023)"), so match greedily up
// to the closing one.
export const importBook = (inv) => {
  const m = /Imported from Manager\.io \((.*)\)/.exec(inv?.notes || '');
  return m ? m[1] : '';
};

// ── Attachments ───────────────────────────────────────────────────────────────
export const attachmentPath = (inv) => inv?.attachmentPath || inv?.scanPath || '';
// The list's quick view attaches one file to `attachmentPath`; the invoice page
// can hold any number in `attachments`. A row counts as having paperwork when
// either is present.
export const attachmentCount = (inv) =>
  (attachmentPath(inv) ? 1 : 0) + (inv?.attachments?.length || 0);
export const hasAttachment = (inv) => attachmentCount(inv) > 0;

// Everything the viewers need to render the attachment: an invoice carries
// either a hand-attached file or the photo its OCR scan came from.
export const attachmentMeta = (inv) => {
  if (inv?.attachmentPath) {
    return {
      path: inv.attachmentPath,
      uploadedAt: inv.attachmentUploadedAt,
      size: inv.attachmentSize,
      label: inv.attachmentName || 'Attachment',
    };
  }
  if (inv?.scanPath) {
    return { path: inv.scanPath, uploadedAt: inv.scanUploadedAt, size: inv.scanSize, label: 'Scanned invoice' };
  }
  return null;
};

// ── Money ─────────────────────────────────────────────────────────────────────
export const invoiceTotal = (inv) => Number(inv?.total) || 0;
export const paidAmount = (inv) => Number(inv?.paidAmount) || 0;

// What is still owed. Settled and cancelled invoices owe nothing regardless of
// the amount recorded against them, and neither do drafts or invoices still
// waiting for approval — nothing is due until an invoice is signed off.
export const balanceDue = (inv) => {
  if (!inv || inv.status === 'paid' || inv.status === 'cancelled') return 0;
  if (isProvisional(inv.status)) return 0;
  return Math.max(0, invoiceTotal(inv) - paidAmount(inv));
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Drafts and invoices under review are not issued documents, so they cannot be
// late however old they are.
export const daysOverdue = (inv, today = todayISO()) => {
  if (!inv?.dueDate || isProvisional(inv.status) || balanceDue(inv) <= 0) return 0;
  const due = String(inv.dueDate).slice(0, 10);
  if (due >= today) return 0;
  return Math.round((Date.parse(today) - Date.parse(due)) / 86400000);
};

export const isOverdue = (inv, today = todayISO()) => daysOverdue(inv, today) > 0;

// Falls due inside the next `days` days (and is not already late).
export const isDueSoon = (inv, days = 7, today = todayISO()) => {
  if (!inv?.dueDate || isProvisional(inv.status) || balanceDue(inv) <= 0) return false;
  const due = String(inv.dueDate).slice(0, 10);
  const horizon = new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  return due >= today && due <= horizon;
};

// ── Dates ─────────────────────────────────────────────────────────────────────
export const invoiceYear = (inv) => (inv?.date ? String(inv.date).slice(0, 4) : '');
export const invoiceMonth = (inv) => (inv?.date ? String(inv.date).slice(5, 7) : '');

export const MONTHS = [
  { value: '01', label: 'January' },   { value: '02', label: 'February' },
  { value: '03', label: 'March' },     { value: '04', label: 'April' },
  { value: '05', label: 'May' },       { value: '06', label: 'June' },
  { value: '07', label: 'July' },      { value: '08', label: 'August' },
  { value: '09', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' },  { value: '12', label: 'December' },
];

// Calendar years present in the data, newest first, plus a bucket for rows that
// carry no date at all (the Manager import left some blank).
export const yearsOf = (rows = []) => {
  const set = new Set();
  let undated = false;
  rows.forEach((r) => { const y = invoiceYear(r); if (y) set.add(y); else undated = true; });
  const years = [...set].sort().reverse().map((y) => ({ value: y, label: y }));
  return undated ? [...years, { value: 'none', label: 'No date' }] : years;
};

// ── Duplicates ────────────────────────────────────────────────────────────────
//
// The same supplier invoice often gets photographed twice — a second copy of
// the paper, or a re-scan after a bad crop. A repeat is identified by the three
// things printed on the document: its date, who issued it, and their reference
// number. Repeats are still recorded (the scan is evidence, and deleting a
// user's capture silently would be worse), but they are marked and excluded
// from every total, balance and stock movement.

const normRef = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

// Null when the invoice lacks the fields needed to judge it — an undated or
// unreferenced document cannot be called a repeat of anything.
export const duplicateKey = (inv, partyField = 'supplierName') => {
  const date = String(inv?.date || '').slice(0, 10);
  const ref = normRef(inv?.supplierInvoiceNo);
  const party = normRef(inv?.[partyField === 'supplierName' ? 'supplierId' : 'customerId'])
    || normRef(inv?.[partyField]);
  if (!date || !ref || !party) return null;
  return `${date}|${party}|${ref}`;
};

export const isDuplicate = (inv) => Boolean(inv?.isDuplicate);

// The row an incoming invoice repeats, or null. Existing duplicates are not
// themselves candidates, so a third copy points at the original.
export const findDuplicate = (rows = [], candidate, partyField = 'supplierName') => {
  const key = duplicateKey(candidate, partyField);
  if (!key) return null;
  return rows.find(
    (r) => r.id !== candidate?.id && !isDuplicate(r) && duplicateKey(r, partyField) === key
  ) || null;
};

// Rows that count towards money and stock.
export const activeInvoices = (rows = []) => rows.filter((r) => !isDuplicate(r));
export const duplicateInvoices = (rows = []) => rows.filter(isDuplicate);

// ── Data quality ──────────────────────────────────────────────────────────────
export const invoiceIssues = (inv, partyField = 'customerName') => {
  const issues = [];
  if (!inv?.date) issues.push('No date');
  if (!inv?.[partyField]) issues.push('No party');
  if (!(inv?.items || []).length) issues.push('No line items');
  if (invoiceTotal(inv) <= 0) issues.push('Zero total');
  return issues;
};

// ── Filtering ─────────────────────────────────────────────────────────────────
export const EMPTY_FILTERS = {
  search: '', status: 'all', source: 'all', year: 'all', month: 'all',
  party: 'all', from: '', to: '', min: '', max: '',
  attachment: 'all', flag: 'all',
};

export const activeFilterCount = (f = {}) =>
  Object.keys(EMPTY_FILTERS).filter(
    (k) => k !== 'search' && f[k] !== undefined && f[k] !== EMPTY_FILTERS[k]
  ).length;

export const filterInvoices = (rows = [], f = EMPTY_FILTERS, partyField = 'customerName') => {
  const q = (f.search || '').trim().toLowerCase();
  const min = f.min === '' || f.min == null ? null : Number(f.min);
  const max = f.max === '' || f.max == null ? null : Number(f.max);
  const today = todayISO();

  return rows.filter((inv) => {
    if (q) {
      const hay = [
        inv.invoiceNo, inv[partyField], inv.supplierInvoiceNo, inv.status,
        inv.notes, inv.paymentMethod,
        ...(inv.items || []).map((i) => `${i.itemName} ${i.itemCode}`),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status !== 'all' && inv.status !== f.status) return false;
    if (f.source !== 'all' && invoiceSource(inv) !== f.source) return false;

    if (f.year !== 'all') {
      if (f.year === 'none') { if (inv.date) return false; }
      else if (invoiceYear(inv) !== f.year) return false;
    }
    if (f.month !== 'all' && invoiceMonth(inv) !== f.month) return false;
    if (f.party !== 'all' && (inv[partyField] || '') !== f.party) return false;

    const d = inv.date ? String(inv.date).slice(0, 10) : '';
    if (f.from && (!d || d < f.from)) return false;
    if (f.to && (!d || d > f.to)) return false;

    const total = invoiceTotal(inv);
    if (min != null && !Number.isNaN(min) && total < min) return false;
    if (max != null && !Number.isNaN(max) && total > max) return false;

    if (f.attachment === 'with' && !hasAttachment(inv)) return false;
    if (f.attachment === 'without' && hasAttachment(inv)) return false;

    if (f.flag === 'overdue' && !isOverdue(inv, today)) return false;
    if (f.flag === 'duesoon' && !isDueSoon(inv, 7, today)) return false;
    if (f.flag === 'outstanding' && balanceDue(inv) <= 0) return false;
    if (f.flag === 'issues' && invoiceIssues(inv, partyField).length === 0) return false;
    if (f.flag === 'duplicates' && !isDuplicate(inv)) return false;

    return true;
  });
};

// ── Sorting ───────────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { value: 'date',      label: 'Date' },
  { value: 'invoiceNo', label: 'Invoice #' },
  { value: 'party',     label: 'Name' },
  { value: 'total',     label: 'Total' },
  { value: 'balance',   label: 'Balance due' },
  { value: 'dueDate',   label: 'Due date' },
  { value: 'items',     label: 'Line items' },
  { value: 'status',    label: 'Status' },
  { value: 'createdAt', label: 'Date added' },
  { value: 'updated',   label: 'Last updated' },
];

const sortValue = (inv, key, partyField) => {
  switch (key) {
    case 'invoiceNo': return inv.invoiceNo || '';
    case 'party':     return (inv[partyField] || '').toLowerCase();
    case 'total':     return invoiceTotal(inv);
    case 'balance':   return balanceDue(inv);
    case 'dueDate':   return inv.dueDate || '';
    case 'items':     return (inv.items || []).length;
    case 'status':    return inv.status || '';
    case 'createdAt': return inv.createdAt || '';
    case 'updated':   return inv.updatedAt || inv.createdAt || '';
    case 'date':
    default:          return inv.date || '';
  }
};

export const sortInvoices = (rows = [], { key = 'date', dir = 'desc' } = {}, partyField = 'customerName') => {
  const factor = dir === 'asc' ? 1 : -1;
  // Invoice numbers mix "1157" and "PI-0004"; compare them the way a human
  // reads them rather than by raw code points.
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key, partyField);
    const bv = sortValue(b, key, partyField);
    // Blanks always sink to the bottom, whichever way the sort runs.
    if (av === '' && bv !== '') return 1;
    if (bv === '' && av !== '') return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return collator.compare(String(av), String(bv)) * factor;
  });
};

// ── Export ────────────────────────────────────────────────────────────────────
// The raw docs carry a nested `items` array that turns into unreadable CSV, so
// flatten each invoice into the columns an accountant actually wants.
export const invoiceExportRows = (rows = [], partyField = 'customerName') =>
  rows.map((inv) => ({
    invoiceNo: inv.invoiceNo || '',
    date: inv.date || '',
    dueDate: inv.dueDate || '',
    [partyField === 'supplierName' ? 'supplier' : 'customer']: inv[partyField] || '',
    ...(partyField === 'supplierName' ? { supplierRef: inv.supplierInvoiceNo || '' } : {}),
    status: inv.status || '',
    lineItems: (inv.items || []).length,
    subtotal: Number(inv.subtotal) || 0,
    discount: Number(inv.discountAmount) || 0,
    tax: Number(inv.taxAmount) || 0,
    total: invoiceTotal(inv),
    paid: paidAmount(inv),
    balanceDue: balanceDue(inv),
    daysOverdue: daysOverdue(inv),
    source: SOURCES[invoiceSource(inv)].short,
    attachment: hasAttachment(inv) ? 'yes' : 'no',
    paymentMethod: inv.paymentMethod || '',
    notes: inv.notes || '',
  }));

// ── Summary ───────────────────────────────────────────────────────────────────
// Duplicates are excluded here, which is what keeps them out of every stat card
// and dashboard figure that runs through this helper. Drafts and invoices still
// in review are left out of the money too — they are not sales or purchases yet
// — and reported separately so the list can say what is waiting on somebody.
export const summarise = (allRows = []) => {
  const rows = activeInvoices(allRows);
  const today = todayISO();
  let total = 0, paid = 0, due = 0, overdueAmount = 0, overdueCount = 0, withAttachment = 0;
  let provisionalCount = 0, awaitingCount = 0, awaitingAmount = 0;
  rows.forEach((inv) => {
    if (hasAttachment(inv)) withAttachment += 1;
    if (isProvisional(inv.status)) {
      provisionalCount += 1;
      if (needsApproval(inv.status)) { awaitingCount += 1; awaitingAmount += invoiceTotal(inv); }
      return;
    }
    total += invoiceTotal(inv);
    paid += inv.status === 'paid' ? invoiceTotal(inv) : paidAmount(inv);
    const bal = balanceDue(inv);
    due += bal;
    if (isOverdue(inv, today)) { overdueAmount += bal; overdueCount += 1; }
  });
  return {
    count: rows.length, total, paid, due, overdueAmount, overdueCount, withAttachment,
    provisionalCount, awaitingCount, awaitingAmount,
    duplicates: allRows.length - rows.length,
  };
};
