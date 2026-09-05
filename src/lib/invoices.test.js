// src/lib/invoices.test.js — the list pages lean on these helpers for every
// badge, filter and total, so they are worth pinning down.
import {
  invoiceSource, importBook, balanceDue, daysOverdue, isDueSoon, yearsOf,
  invoiceIssues, filterInvoices, sortInvoices, summarise, invoiceExportRows,
  activeFilterCount, EMPTY_FILTERS,
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
