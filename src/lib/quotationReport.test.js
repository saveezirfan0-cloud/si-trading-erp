import { quotationReport, ratePercent } from './quotationReport';

const TODAY = '2026-09-16';
const q = (patch) => ({
  docType: 'quotation', date: '2026-07-01', status: 'approved',
  customerName: 'Ali', total: 1000, items: [{ itemName: 'x' }], ...patch,
});

test('nothing quoted reads as nothing, not as zero per cent', () => {
  const r = quotationReport([], TODAY);
  expect(r.count).toBe(0);
  expect(r.winRate).toBeNull();
  expect(ratePercent(r.winRate)).toBe('—');
  expect(ratePercent(0)).toBe('0%');
  expect(ratePercent(0.615)).toBe('62%');
});

test('each offer is counted once, under what became of it', () => {
  const rows = [
    q({ id: 'w', convertedToId: 'si1', total: 5000 }),
    q({ id: 'e', dueDate: '2026-08-01', total: 3000 }),           // lapsed
    q({ id: 'c', status: 'cancelled', total: 2000 }),
    q({ id: 'o', dueDate: '2026-12-01', total: 4000 }),           // still live
    { id: 'si1', docType: 'invoice', date: '2026-07-11', total: 5000 },
  ];
  const r = quotationReport(rows, TODAY);
  expect(r.count).toBe(4);
  expect(r.quotedValue).toBe(14000);
  expect(r.won).toBe(1);
  expect(r.expired).toBe(1);
  expect(r.cancelled).toBe(1);
  expect(r.open).toBe(1);
  expect(r.openValue).toBe(4000);
  // Decided means won, lapsed or cancelled — not the one still being discussed.
  expect(r.decided).toBe(3);
  expect(ratePercent(r.winRate)).toBe('33%');
  // By money rather than by count: 5000 won against 5000 lost.
  expect(ratePercent(r.valueRate)).toBe('50%');
  expect(r.averageQuote).toBe(3500);
  // The invoice it became is dated ten days after the offer.
  expect(r.averageDaysToWin).toBe(10);
});

test('a cancelled offer that was still converted counts as won, once', () => {
  const r = quotationReport([q({ id: 'w', convertedToId: 'si1', status: 'cancelled' })], TODAY);
  expect(r.won).toBe(1);
  expect(r.cancelled).toBe(0);
});

test('days to win ignores an invoice that is not in the list', () => {
  const r = quotationReport([q({ id: 'w', convertedToId: 'missing' })], TODAY);
  expect(r.won).toBe(1);
  expect(r.averageDaysToWin).toBeNull();
});

test('the months read in calendar order with their own totals', () => {
  const r = quotationReport([
    q({ id: 'a', date: '2026-07-05', total: 1000 }),
    q({ id: 'b', date: '2026-07-20', total: 2000, convertedToId: 'si1' }),
    q({ id: 'c', date: '2026-09-02', total: 500 }),
  ], TODAY);
  const july = r.byMonth.find((m) => m.month === 'Jul');
  expect(july).toMatchObject({ quotes: 2, quoted: 3000, won: 1, wonValue: 2000 });
  expect(r.byMonth.find((m) => m.month === 'Sep')).toMatchObject({ quotes: 1, quoted: 500, won: 0 });
  expect(r.byMonth.find((m) => m.month === 'Jan')).toMatchObject({ quotes: 0, quoted: 0 });
});

test('customers are ranked by what they were quoted, under their company', () => {
  const r = quotationReport([
    q({ id: '1', customerName: 'Mr. Zaheer', customerCompany: 'ARY Laguna', total: 9000, convertedToId: 'si1' }),
    q({ id: '2', customerName: 'Mr. Zaheer', customerCompany: 'ARY Laguna', total: 1000 }),
    q({ id: '3', customerName: 'Ali Hardware', total: 3000 }),
  ], TODAY);
  expect(r.byCustomer[0]).toMatchObject({ name: 'ARY Laguna', quotes: 2, quoted: 10000, won: 1, wonValue: 9000 });
  expect(ratePercent(r.byCustomer[0].winRate)).toBe('50%');
  expect(r.byCustomer[1]).toMatchObject({ name: 'Ali Hardware', quotes: 1, won: 0 });
});

test('duplicates and invoices never reach the figures', () => {
  const r = quotationReport([
    q({ id: 'd', isDuplicate: true, total: 99999 }),
    { id: 'i', docType: 'invoice', date: '2026-07-01', total: 77777 },
  ], TODAY);
  expect(r.count).toBe(0);
  expect(r.quotedValue).toBe(0);
});
