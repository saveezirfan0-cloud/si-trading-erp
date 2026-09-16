// src/lib/share.test.js — a share link is a capability handed to a customer,
// so the parts that decide what it is and who can still open it are pinned.
import { newShareToken, shareUrl, isShared, whatsappMessage, whatsappLink } from './share';
import { documentFileName } from './documentPdf';

jest.mock('./db', () => ({ update: jest.fn(async () => {}), COLLECTIONS: { SALES_INVOICES: 'erp_sales_invoices' } }));

// jsdom ships no Web Crypto; the browsers this runs in do.
const setCrypto = (value) =>
  Object.defineProperty(window, 'crypto', { value, configurable: true, writable: true });

beforeAll(() => {
  if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
    setCrypto(require('crypto').webcrypto);
  }
});

const quotation = {
  id: 'q1', docType: 'quotation', invoiceNo: 'QT-0001', total: 92000,
  customerPhone: '0300 123 4567', shareToken: 'a'.repeat(32),
};

test('a token is long, random hex the edge function will accept', () => {
  const a = newShareToken();
  const b = newShareToken();
  expect(a).toMatch(/^[0-9a-f]{32}$/);
  expect(a).not.toBe(b);
});

test('a browser without Web Crypto is refused a link, not given a weak one', () => {
  const real = window.crypto;
  setCrypto({});
  expect(() => newShareToken()).toThrow(/secure share link/);
  setCrypto(real);
});

test('the link points at the public page on this deployment', () => {
  expect(shareUrl('abc123')).toBe(`${window.location.origin}/d/abc123`);
  expect(shareUrl('')).toBe('');
});

test('a revoked document is no longer shared', () => {
  expect(isShared(quotation)).toBe(true);
  expect(isShared({ ...quotation, shareRevoked: true })).toBe(false);
  expect(isShared({ ...quotation, shareToken: '' })).toBe(false);
  expect(isShared(null)).toBe(false);
});

test('the WhatsApp message names the document, its total and the link', () => {
  const url = shareUrl(quotation.shareToken);
  const msg = whatsappMessage(quotation, url);
  expect(msg).toContain('Quotation QT-0001');
  expect(msg).toContain('92,000');
  expect(msg).toContain(url);

  // The customer's own number is dialled when there is one, and the message
  // still works when there is not.
  expect(whatsappLink(quotation, url, quotation.customerPhone)).toContain('phone=03001234567');
  expect(whatsappLink(quotation, url, '')).not.toContain('phone=');
  expect(whatsappLink(quotation, url)).toContain(encodeURIComponent('QT-0001'));
});

test('the PDF is named after the document', () => {
  expect(documentFileName(quotation)).toBe('QT-0001');
  // Nothing that could escape a file name survives.
  expect(documentFileName({ invoiceNo: 'SI/2026 0042' })).toBe('SI_2026_0042');
});
