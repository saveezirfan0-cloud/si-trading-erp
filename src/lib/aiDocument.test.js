// src/lib/aiDocument.test.js — the built-in reader stands in for the AI when
// it is unreachable, so the everyday shapes must come out right.
import { parseItemLine, parseDocumentText, toISODate, normalizeParsed, buildDraft, matchCustomer } from './aiDocument';

const TODAY = '2026-09-16';

test('reads the worked example', () => {
  const p = parseDocumentText(`Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=`, TODAY);
  expect(p.docType).toBe('quotation');
  expect(p.customerName).toBe('ARY Laguna Karachi Pvt Ltd');
  expect(p.attention).toBe('Mr Zaheer');
  expect(p.items).toEqual([{ name: 'Demolition Hammer HP1300-DH', qty: 4, unit: 'pcs', rate: 23000, discount: 0 }]);
  expect(p.unparsed).toEqual([]);
});

test('item lines in their usual shapes', () => {
  expect(parseItemLine('4 pcs Demolition Hammer HP1300-DH @ 23000/=')).toMatchObject({ name: 'Demolition Hammer HP1300-DH', qty: 4, unit: 'pcs', rate: 23000 });
  expect(parseItemLine('Angle Grinder 9 inch x 2 @ Rs 8,500')).toMatchObject({ name: 'Angle Grinder 9 inch', qty: 2, rate: 8500 });
  expect(parseItemLine('2 x Cordless Drill 12V at 12000 each')).toMatchObject({ name: 'Cordless Drill 12V', qty: 2, rate: 12000 });
  expect(parseItemLine('Pipe Wrench 24" 6 pcs 1450')).toMatchObject({ name: 'Pipe Wrench 24"', qty: 6, unit: 'pcs', rate: 1450 });
  expect(parseItemLine('1. 10 nos Cutting Disc 4" - 95/-')).toMatchObject({ name: 'Cutting Disc 4"', qty: 10, unit: 'nos', rate: 95 });
  expect(parseItemLine('3 Hammer Drill @ 15000 less 5%')).toMatchObject({ name: 'Hammer Drill', qty: 3, rate: 15000, discount: 5 });
  expect(parseItemLine('Chain Block 2 ton @ PKR 18000')).toMatchObject({ name: 'Chain Block 2 ton', qty: 1, rate: 18000 });
  expect(parseItemLine('6 inch Bench Grinder @ 9000')).toMatchObject({ name: '6 inch Bench Grinder', qty: 1, rate: 9000 });
  expect(parseItemLine('5 sets Spanner Set')).toMatchObject({ name: 'Spanner Set', qty: 5, unit: 'set', rate: 0 });
  // Not items: no quantity and no price, or no words at all.
  expect(parseItemLine('Thanks and regards')).toBeNull();
  expect(parseItemLine('23000')).toBeNull();
});

test('labelled lines, dates and discount', () => {
  const p = parseDocumentText(`Invoice for Ali Hardware Store
Attn Mr Ahmed
Phone: 0300 1234567
Address: Shop 12, Jodia Bazar, Karachi
Date: 05/09/2026
Valid till 20/09/2026
Ref: PO-4451
Discount 10%
Notes: deliver by Friday
2 pcs Grinder @ 5000
Some stray remark`, TODAY);
  expect(p.docType).toBe('invoice');
  expect(p.customerName).toBe('Ali Hardware Store');
  expect(p.attention).toBe('Mr Ahmed');
  expect(p.customerPhone).toBe('0300 1234567');
  expect(p.customerAddress).toBe('Shop 12, Jodia Bazar, Karachi');
  expect(p.date).toBe('2026-09-05');
  expect(p.dueDate).toBe('2026-09-20');
  expect(p.reference).toBe('PO-4451');
  expect(p.discountPercent).toBe(10);
  expect(p.notes).toBe('deliver by Friday');
  expect(p.items).toHaveLength(1);
  expect(p.unparsed).toEqual(['Some stray remark']);
});

test('dates are read the local way', () => {
  expect(toISODate('16/09/2026')).toBe('2026-09-16');
  expect(toISODate('1-2-26')).toBe('2026-02-01');
  expect(toISODate('2026-9-3')).toBe('2026-09-03');
  expect(toISODate('today', TODAY)).toBe(TODAY);
  expect(toISODate('tomorrow', TODAY)).toBe('2026-09-17');
  expect(toISODate('nonsense')).toBe('');
});

test('model output is coerced into the same shape', () => {
  const p = normalizeParsed({ docType: 'Quotation', customerName: ' ARY ', items: [{ name: 'Hammer', qty: '4', unit: 'PCS', rate: '23,000' }, { name: '' }] });
  expect(p.docType).toBe('quotation');
  expect(p.customerName).toBe('ARY');
  expect(p.items).toEqual([{ name: 'Hammer', qty: 4, unit: 'pcs', rate: 23000, discount: 0 }]);
});

const customers = [{ id: 'c1', name: 'ARY Laguna Karachi (Pvt) Ltd', phone: '021-111', address: 'Clifton' }, { id: 'c2', name: 'Ali Hardware' }];
const inventory = [
  { id: 'i1', code: 'HP1300', name: 'Makita Demolition Hammer HP1300-DH', unit: 'pcs', salePrice: 22500, taxRate: 0 },
  { id: 'i2', code: 'AG9', name: 'Angle Grinder 9 inch', unit: 'pcs', salePrice: 8000 },
];
const existing = [{ invoiceNo: 'SI-0042' }, { invoiceNo: 'QT-0007' }];

test('the draft matches the customer and the lines, and keeps the typed price', () => {
  const parsed = parseDocumentText(`Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=
1 pcs Welding Machine 200A @ 35000`, TODAY);
  const { draft, warnings } = buildDraft(parsed, { customers, inventory, existing, today: TODAY, prompt: 'x', provider: 'anthropic' });
  expect(draft.docType).toBe('quotation');
  expect(draft.invoiceNo).toBe('QT-0008');
  expect(draft.status).toBe('draft');
  expect(draft.customerId).toBe('c1');
  expect(draft.customerName).toBe('ARY Laguna Karachi (Pvt) Ltd');
  expect(draft.customerPhone).toBe('021-111');
  expect(draft.attention).toBe('Mr Zaheer');
  expect(draft.date).toBe(TODAY);
  expect(draft.items[0]).toMatchObject({ itemId: 'i1', itemCode: 'HP1300', itemName: 'Makita Demolition Hammer HP1300-DH', description: 'Demolition Hammer HP1300-DH', qty: 4, unitPrice: 23000, total: 92000, isCustom: false });
  expect(draft.items[1]).toMatchObject({ itemId: '', itemName: 'Welding Machine 200A', qty: 1, unitPrice: 35000, total: 35000, isCustom: true });
  expect(draft.subtotal).toBe(127000);
  expect(draft.total).toBe(127000);
  expect(draft.source).toBe('ai');
  expect(draft.aiProvider).toBe('anthropic');
  expect(draft.terms).toMatch(/valid/i);
  expect(warnings.some((w) => w.includes('Welding Machine 200A'))).toBe(true);
  // Brackets and case do not make a different customer.
  expect(warnings.some((w) => w.includes('matched to the customer'))).toBe(false);
});

test('a partial customer name is matched but pointed out', () => {
  const parsed = parseDocumentText('Quotation\nName: ARY Laguna\n1 pcs Grinder @ 100', TODAY);
  const { draft, warnings } = buildDraft(parsed, { customers, inventory, existing, today: TODAY });
  expect(draft.customerId).toBe('c1');
  expect(warnings.some((w) => w.includes('matched to the customer'))).toBe(true);
});

test('an unknown customer and a missing price are flagged, not invented', () => {
  const parsed = parseDocumentText(`Invoice
Name: Brand New Traders
2 pcs Angle Grinder 9 inch`, TODAY);
  const { draft, warnings } = buildDraft(parsed, { customers, inventory, existing, today: TODAY });
  expect(draft.docType).toBe('invoice');
  expect(draft.invoiceNo).toBe('SI-0043');
  expect(draft.status).toBe('unpaid');
  expect(draft.customerId).toBe('');
  expect(draft.customerName).toBe('Brand New Traders');
  expect(draft.items[0]).toMatchObject({ itemId: 'i2', unitPrice: 8000, total: 16000 });
  expect(warnings.some((w) => w.includes('not in the customer list'))).toBe(true);
  expect(warnings.some((w) => w.includes('inventory sale price'))).toBe(true);
});

test('an empty request still yields an editable draft', () => {
  const { draft, warnings } = buildDraft(parseDocumentText('', TODAY), { today: TODAY });
  expect(draft.items).toHaveLength(1);
  expect(draft.total).toBe(0);
  expect(warnings.some((w) => w.includes('No line items'))).toBe(true);
});

// ── Company and contact ──────────────────────────────────
const filedUnderPerson = [
  { id: 'p1', name: 'Mr. Zaheer', company: 'ARY Laguna', phone: '021-9' },
  { id: 'p2', name: 'Ali Hardware' },
];

test('a customer filed under a person is found by their company', () => {
  expect(matchCustomer('ARY Laguna Karachi Pvt Ltd', filedUnderPerson)?.id).toBe('p1');
  expect(matchCustomer('Mr. Zaheer', filedUnderPerson)?.id).toBe('p1');
  expect(matchCustomer('Someone Unheard Of', filedUnderPerson)).toBeNull();
});

test('matching a company fills the document from that record', () => {
  const parsed = parseDocumentText(`Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Angle Grinder 9 inch @ 9000`, TODAY);
  const { draft } = buildDraft(parsed, { customers: filedUnderPerson, inventory, existing, today: TODAY });
  expect(draft.customerId).toBe('p1');
  expect(draft.customerCompany).toBe('ARY Laguna');
  expect(draft.customerName).toBe('Mr. Zaheer');
  expect(draft.attention).toBe('Mr Zaheer');
  expect(draft.customerPhone).toBe('021-9');
});

test('an unknown company becomes the company, with the contact as the person', () => {
  const parsed = parseDocumentText(`Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=`, TODAY);
  const { draft, warnings } = buildDraft(parsed, { customers: [{ id: 'x', name: 'Ali Hardware' }], inventory, existing, today: TODAY });
  expect(draft.customerId).toBe('');
  // This is the shape a customer created from here is given: business in the
  // company field, the person dealt with as the name.
  expect(draft.customerCompany).toBe('ARY Laguna Karachi Pvt Ltd');
  expect(draft.customerName).toBe('Mr Zaheer');
  expect(warnings.some((w) => w.includes('not in the customer list'))).toBe(true);
});

test('with nobody named, the company stands alone', () => {
  const parsed = parseDocumentText('Invoice\nName: Brand New Traders\n2 pcs Angle Grinder 9 inch', TODAY);
  const { draft } = buildDraft(parsed, { customers: [], inventory, existing, today: TODAY });
  expect(draft.customerCompany).toBe('Brand New Traders');
  expect(draft.customerName).toBe('Brand New Traders');
});
