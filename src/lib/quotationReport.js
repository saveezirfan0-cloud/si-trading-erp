// src/lib/quotationReport.js — what became of the quotations.
//
// A trading business lives on how much of what it offers turns into a sale.
// The Quotations page answers that for one document at a time; this answers it
// for the whole book: how much was quoted, how much was won, how much lapsed,
// how long a win takes, and which customers actually buy.
//
// Every figure is derived, never stored, so it cannot drift from the documents.
import { activeInvoices, isQuotation, isExpired, isQuotationOpen, invoiceTotal, todayISO } from './invoices';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sum = (rows) => rows.reduce((s, r) => s + invoiceTotal(r), 0);
const monthOf = (inv) => (inv?.date ? Number(String(inv.date).slice(5, 7)) - 1 : -1);

// Days between the quotation and the invoice it became. Only counted where the
// invoice is in the same list, so a partial export cannot skew it.
const daysToWin = (quote, byId) => {
  const invoice = byId.get(quote.convertedToId);
  if (!invoice?.date || !quote.date) return null;
  const days = Math.round((Date.parse(invoice.date) - Date.parse(quote.date)) / 86400000);
  return Number.isFinite(days) && days >= 0 ? days : null;
};

export const quotationReport = (rows = [], today = todayISO()) => {
  const live = activeInvoices(rows);
  const byId = new Map(live.map((r) => [r.id, r]));
  const quotes = live.filter(isQuotation);

  const won = quotes.filter((q) => q.convertedToId);
  const cancelled = quotes.filter((q) => q.status === 'cancelled' && !q.convertedToId);
  const expired = quotes.filter((q) => isExpired(q, today));
  const open = quotes.filter((q) => isQuotationOpen(q) && !isExpired(q, today));

  // A quotation still under discussion says nothing about the win rate yet:
  // the rate is won as a share of everything that has actually been decided.
  const decided = won.length + expired.length + cancelled.length;
  const winRate = decided ? won.length / decided : null;
  const wonValue = sum(won);
  const lostValue = sum(expired) + sum(cancelled);
  const valueRate = wonValue + lostValue ? wonValue / (wonValue + lostValue) : null;

  const winDays = won.map((q) => daysToWin(q, byId)).filter((d) => d != null);
  const averageDaysToWin = winDays.length
    ? Math.round(winDays.reduce((s, d) => s + d, 0) / winDays.length)
    : null;

  const byMonth = MONTHS.map((month, i) => {
    const inMonth = quotes.filter((q) => monthOf(q) === i);
    const wonInMonth = inMonth.filter((q) => q.convertedToId);
    return {
      month,
      quotes: inMonth.length,
      quoted: sum(inMonth),
      won: wonInMonth.length,
      wonValue: sum(wonInMonth),
    };
  });

  // Who to spend the next quotation on.
  const customers = new Map();
  quotes.forEach((q) => {
    const name = (q.customerCompany || q.customerName || '').trim() || '— none —';
    const row = customers.get(name) || { name, quotes: 0, quoted: 0, won: 0, wonValue: 0 };
    row.quotes += 1;
    row.quoted += invoiceTotal(q);
    if (q.convertedToId) { row.won += 1; row.wonValue += invoiceTotal(q); }
    customers.set(name, row);
  });
  const byCustomer = [...customers.values()]
    .map((r) => ({ ...r, winRate: r.quotes ? r.won / r.quotes : 0 }))
    .sort((a, b) => b.quoted - a.quoted);

  return {
    count: quotes.length,
    quotedValue: sum(quotes),
    averageQuote: quotes.length ? Math.round(sum(quotes) / quotes.length) : 0,
    won: won.length, wonValue,
    expired: expired.length, expiredValue: sum(expired),
    cancelled: cancelled.length, cancelledValue: sum(cancelled),
    open: open.length, openValue: sum(open),
    decided, winRate, valueRate, averageDaysToWin,
    byMonth, byCustomer,
  };
};

// "62%" or "—" when nothing has been decided yet. A rate of 0 is a real
// answer and must not read as missing.
export const ratePercent = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`);
