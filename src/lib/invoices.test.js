// src/lib/invoices.test.js — the list pages lean on these helpers for every
// badge, filter and total, so they are worth pinning down.
import {
  invoiceSource, importBook, balanceDue, daysOverdue, isDueSoon, yearsOf,
  invoiceIssues, filterInvoices, sortInvoices, summarise, invoiceExportRows,
  activeFilterCount, hasAttachment, attachmentCount, EMPTY_FILTERS,
  duplicateKey, findDuplicate, activeInvoices, duplicateInvoices,
} from './invoices';

const imported = {
  id: 'a', invoiceNo: '1157', date: '2024-03-01', dueDate: '2024-04-01',
  status: 'unpaid', total: 1000, paidAmount: 200, customerName: 'Zed',
  items: [{ itemName: 'Pipe wrench' }],
  importedFrom: 'manager.io', managerKey: 'k1',
  notes: 'Imported from Manager.io (S.I.Trading Co (2023))',
};
const undated = {
  id: 'b', invoiceNo: 'PI-0004', date: '', status: 'paid', total: 500,
  paidAmount: 500, customerName: '', items: [],
};
const scanned = {
  id: 'c', invoiceNo: '99', date: '2026-09-01', status: 'partial', total: 300,
  paidAmount: 100, customerName: 'Ali', items: [{ itemName: 'Hammer' }],
  source: 'ocr', scanPath: 'scans/c.jpg',
};
const rows = [imported, undated, scanned];
const f = (patch) => ({ ...EMPTY_FILTERS, ...patch });

test('provenance is read from the import and OCR markers', () => {
  expect(rows.map(invoiceSource)).toEqual(['manager', 'manual', 'ocr']);
  expect(importBook(imported)).toBe('S.I.Trading Co (2023)');
  expect(importBook(scanned)).toBe('');
});

test('settled and cancelled invoices owe nothing', () => {
  expect(balanceDue(imported)).toBe(800);
  expect(balanceDue(undated)).toBe(0);
  expect(balanceDue({ status: 'cancelled', total: 900 })).toBe(0);
});

test('overdue is measured against the due date, not the invoice date', () => {
  expect(daysOverdue(imported, '2024-04-11')).toBe(10);
  expect(daysOverdue(imported, '2024-03-15')).toBe(0);
  expect(daysOverdue(undated, '2030-01-01')).toBe(0);
  expect(isDueSoon(imported, 7, '2024-03-28')).toBe(true);
  expect(isDueSoon(imported, 7, '2024-03-01')).toBe(false);
  // A draft has not been issued, so it is never late.
  expect(daysOverdue({ ...imported, status: 'draft' }, '2024-05-01')).toBe(0);
});

test('undated rows get their own year bucket', () => {
  expect(yearsOf(rows)).toEqual([
    { value: '2026', label: '2026' },
    { value: '2024', label: '2024' },
    { value: 'none', label: 'No date' },
  ]);
});

test('missing fields surface as issues', () => {
  expect(invoiceIssues(undated)).toEqual(['No date', 'No party', 'No line items']);
  expect(invoiceIssues(imported)).toEqual([]);
});

test('filters narrow by source, year, attachment, flag and free text', () => {
  const ids = (filters) => filterInvoices(rows, filters).map((r) => r.id);
  expect(ids(f({ source: 'manager' }))).toEqual(['a']);
  expect(ids(f({ source: 'ocr' }))).toEqual(['c']);
  expect(ids(f({ year: 'none' }))).toEqual(['b']);
  expect(ids(f({ year: '2024' }))).toEqual(['a']);
  expect(ids(f({ month: '09' }))).toEqual(['c']);
  expect(ids(f({ attachment: 'with' }))).toEqual(['c']);
  expect(ids(f({ attachment: 'without' }))).toEqual(['a', 'b']);
  expect(ids(f({ flag: 'issues' }))).toEqual(['b']);
  expect(ids(f({ flag: 'outstanding' }))).toEqual(['a', 'c']);
  expect(ids(f({ status: 'paid' }))).toEqual(['b']);
  expect(ids(f({ party: 'Ali' }))).toEqual(['c']);
  expect(ids(f({ from: '2025-01-01' }))).toEqual(['c']);
  expect(ids(f({ min: '600' }))).toEqual(['a']);
  expect(ids(f({ search: 'hammer' }))).toEqual(['c']);
});

test('invoice numbers sort the way they read, blanks last', () => {
  expect(sortInvoices(rows, { key: 'invoiceNo', dir: 'asc' }).map((r) => r.invoiceNo))
    .toEqual(['99', '1157', 'PI-0004']);
  expect(sortInvoices(rows, { key: 'date', dir: 'desc' }).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  expect(sortInvoices(rows, { key: 'date', dir: 'asc' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
  expect(sortInvoices(rows, { key: 'balance', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
});

test('summary totals what is on screen', () => {
  const s = summarise(rows);
  expect(s).toMatchObject({ count: 3, total: 1800, paid: 800, due: 1000, withAttachment: 1 });
});

test('export flattens line items away and adds derived columns', () => {
  const [row] = invoiceExportRows([imported]);
  expect(row).toMatchObject({
    invoiceNo: '1157', customer: 'Zed', lineItems: 1,
    total: 1000, paid: 200, balanceDue: 800, source: 'Manager', attachment: 'no',
  });
  expect(row.items).toBeUndefined();
});

test('the active-filter count ignores the search box', () => {
  expect(activeFilterCount(f({ search: 'x' }))).toBe(0);
  expect(activeFilterCount(f({ year: '2024', status: 'paid' }))).toBe(2);
});

// ── Approval flow ────────────────────────────────────────────────────────────
//
// Nothing is owed until an invoice has been signed off, so drafts and invoices
// still in review stay out of the balances and the totals.

const inReview = {
  id: 'd', invoiceNo: 'SI-0009', date: '2024-01-01', dueDate: '2024-01-15',
  status: 'pending_review', total: 400, paidAmount: 0, customerName: 'Bilal',
  items: [{ itemName: 'Drill' }],
};
const approved = { ...inReview, id: 'e', invoiceNo: 'SI-0010', status: 'approved' };

test('drafts and invoices in review owe nothing and cannot be late', () => {
  expect(balanceDue(inReview)).toBe(0);
  expect(balanceDue({ ...inReview, status: 'draft' })).toBe(0);
  expect(daysOverdue(inReview, '2026-01-01')).toBe(0);
  expect(isDueSoon(inReview, 7, '2024-01-10')).toBe(false);
  // Once approved it is a real receivable again.
  expect(balanceDue(approved)).toBe(400);
  expect(daysOverdue(approved, '2024-01-20')).toBe(5);
});

test('the summary reports what is waiting for approval separately', () => {
  const s = summarise([...rows, inReview, approved]);
  // The two extra invoices do not change the money except for the approved one.
  expect(s).toMatchObject({
    count: 5, total: 2200, due: 1400,
    provisionalCount: 1, awaitingCount: 1, awaitingAmount: 400,
  });
});

test('paperwork counts the quick-view file and the invoice page attachments', () => {
  expect(hasAttachment(imported)).toBe(false);
  expect(attachmentCount(scanned)).toBe(1);
  expect(attachmentCount({ ...imported, attachments: [{ path: 'a' }, { path: 'b' }] })).toBe(2);
  expect(hasAttachment({ ...imported, attachments: [{ path: 'a' }] })).toBe(true);
});

// ── Duplicates ────────────────────────────────────────────────────────────────
describe('duplicate detection', () => {
  const original = {
    id: 'd1', invoiceNo: 'PI-0001', date: '2026-08-18', supplierInvoiceNo: '588',
    supplierId: 's1', supplierName: 'Nasir Brothers', status: 'unpaid',
    total: 538340, paidAmount: 0, items: [{ itemName: 'Plier' }],
  };
  const repeat = { ...original, id: 'd2', invoiceNo: 'PI-0002', isDuplicate: true, duplicateOf: 'd1' };

  test('keys on date, supplier and reference', () => {
    expect(duplicateKey(original)).toBe('2026-08-18|s1|588');
    // whitespace and case in the printed reference must not create a new key
    expect(duplicateKey({ ...original, supplierInvoiceNo: ' 588 ' })).toBe(duplicateKey(original));
  });

  test('refuses to judge documents missing a date or reference', () => {
    expect(duplicateKey({ ...original, date: '' })).toBeNull();
    expect(duplicateKey({ ...original, supplierInvoiceNo: '' })).toBeNull();
    expect(duplicateKey({ ...original, supplierId: '', supplierName: '' })).toBeNull();
  });

  test('a different date, supplier or reference is not a duplicate', () => {
    expect(findDuplicate([original], { ...original, id: 'x', date: '2026-08-19' })).toBeNull();
    expect(findDuplicate([original], { ...original, id: 'x', supplierId: 's2' })).toBeNull();
    expect(findDuplicate([original], { ...original, id: 'x', supplierInvoiceNo: '589' })).toBeNull();
  });

  test('finds the original, and never matches a row against itself', () => {
    expect(findDuplicate([original], { ...original, id: 'x' })?.id).toBe('d1');
    expect(findDuplicate([original], original)).toBeNull();
  });

  test('a third copy points at the original, not the second copy', () => {
    expect(findDuplicate([original, repeat], { ...original, id: 'x' })?.id).toBe('d1');
  });

  test('duplicates are excluded from totals and balances', () => {
    const s = summarise([original, repeat]);
    expect(s.count).toBe(1);
    expect(s.total).toBe(538340);      // not doubled
    expect(s.due).toBe(538340);        // the repeat adds nothing owed
    expect(s.duplicates).toBe(1);
  });

  test('the duplicates flag isolates them for their own tab', () => {
    const only = filterInvoices([original, repeat], { ...EMPTY_FILTERS, flag: 'duplicates' }, 'supplierName');
    expect(only.map(r => r.id)).toEqual(['d2']);
    expect(activeInvoices([original, repeat]).map(r => r.id)).toEqual(['d1']);
    expect(duplicateInvoices([original, repeat]).map(r => r.id)).toEqual(['d2']);
  });
});
