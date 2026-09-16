import {
  docTypeOf, isQuotation, docLabel, nextDocNo, calcLine, calcTotals,
} from './salesDocs';

test('a record without a docType is an invoice', () => {
  expect(docTypeOf({})).toBe('invoice');
  expect(docTypeOf({ docType: 'quotation' })).toBe('quotation');
  expect(isQuotation({ docType: 'quotation' })).toBe(true);
  expect(isQuotation({ docType: 'invoice' })).toBe(false);
  expect(docLabel({ docType: 'quotation' })).toBe('Quotation');
});

test('each prefix numbers its own sequence', () => {
  const rows = [
    { invoiceNo: 'SI-0003' }, { invoiceNo: 'si-0010' }, { invoiceNo: 'QT-0002' },
    { invoiceNo: '1157' }, { invoiceNo: '' }, {},
  ];
  expect(nextDocNo(rows, 'SI')).toBe('SI-0011');
  expect(nextDocNo(rows, 'QT')).toBe('QT-0003');
  expect(nextDocNo([], 'QT')).toBe('QT-0001');
});

test('line and document totals agree', () => {
  const items = [
    calcLine({ qty: 4, unitPrice: 23000 }),
    calcLine({ qty: 2, unitPrice: 1000, discount: 10, taxRate: 5 }),
  ];
  expect(items[0].total).toBe(92000);
  expect(items[1].total).toBeCloseTo(1890);
  const t = calcTotals(items);
  expect(t.subtotal).toBe(94000);
  expect(t.discountAmount).toBe(200);
  expect(t.taxAmount).toBeCloseTo(90);
  expect(t.total).toBeCloseTo(93890);
});
