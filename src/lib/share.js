// src/lib/share.js — the public link for one sales document.
//
// A share link is a capability: whoever holds it can read that one document
// and nothing else. The token is 16 random bytes of hex, minted here and
// stored on the document; the public page hands it to the share-document Edge
// Function, which is the only thing that can read the row.
//
// Sharing is switched off by marking the document revoked rather than by
// dropping the token, so a link that was sent out can be refused by name and
// the same document can be shared again later under a new token.
import { update, COLLECTIONS } from './db';

// Whoever holds the token can read the document, so it has to come from the
// platform's cryptographic source. If that is missing, minting a weaker token
// from Math.random would hand out a guessable link, so refuse instead: the
// share panel reports it and nothing is written.
export const newShareToken = () => {
  const c = (typeof window !== 'undefined' && (window.crypto || window.msCrypto)) || null;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('This browser cannot generate a secure share link. Please use an up-to-date browser.');
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const shareUrl = (token) =>
  token ? `${window.location.origin}/d/${token}` : '';

export const isShared = (doc) => Boolean(doc?.shareToken && !doc.shareRevoked);

// Turns sharing on, minting a token the first time. Returns the link.
export const startSharing = async (doc) => {
  const token = doc?.shareToken && !doc.shareRevoked ? doc.shareToken : newShareToken();
  await update(COLLECTIONS.SALES_INVOICES, doc.id, {
    shareToken: token,
    shareRevoked: false,
    sharedAt: new Date().toISOString(),
  }, { action: 'share', note: 'Share link created' });
  return { token, url: shareUrl(token) };
};

// Refuses every link already sent for this document.
export const stopSharing = async (doc) => {
  await update(COLLECTIONS.SALES_INVOICES, doc.id, {
    shareRevoked: true,
  }, { action: 'share', note: 'Share link revoked' });
};

// WhatsApp is how this business actually sends documents, so the message is
// composed here rather than left to the person pasting the link.
export const whatsappMessage = (doc, url, { company = 'S.I Trading & Co.' } = {}) => {
  const what = doc?.docType === 'quotation' ? 'quotation' : 'invoice';
  const total = Number(doc?.total) || 0;
  return [
    `${company}`,
    `${what.charAt(0).toUpperCase() + what.slice(1)} ${doc?.invoiceNo || ''}`.trim(),
    `Total: PKR ${Math.round(total).toLocaleString('en-PK')}`,
    '',
    url,
  ].join('\n');
};

export const whatsappLink = (doc, url, phone = '') => {
  const digits = String(phone || '').replace(/\D/g, '');
  const to = digits ? `phone=${digits}&` : '';
  return `https://wa.me/?${to}text=${encodeURIComponent(whatsappMessage(doc, url))}`;
};
