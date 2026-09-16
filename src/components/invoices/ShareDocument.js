// src/components/invoices/ShareDocument.js
//
// The share panel on a sales document: a link the customer can open without
// an account, a WhatsApp message ready to send, and a way to refuse every
// link already sent.
//
// The link is deliberately plain about what it is. Anyone holding it can read
// this one document, so the panel says so rather than leaving somebody to
// assume the link is private to the person they sent it to.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Share2, Copy, Check, Link2Off, MessageSquare, Mail, PhoneCall } from 'lucide-react';
import { Btn } from '../ui';
import { isShared, shareUrl, startSharing, stopSharing, whatsappLink, emailDraft, markChased } from '../../lib/share';
import { docLabel, isQuotation } from '../../lib/salesDocs';
import { needsFollowUp, daysSinceChased, lastChasedAt } from '../../lib/invoices';

export default function ShareDocument({ invoice, canEdit = false, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shared = isShared(invoice);
  const url = shared ? shareUrl(invoice.shareToken) : '';
  const quote = isQuotation(invoice);

  if (!invoice?.id) return null;

  const create = async () => {
    setBusy(true);
    try {
      const { url: link } = await startSharing(invoice);
      await copy(link);
      toast.success('Share link ready');
      onChanged?.();
    } catch (e) { toast.error('Could not create the link: ' + e.message); }
    setBusy(false);
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await stopSharing(invoice);
      toast.success('Link revoked — it no longer opens');
      onChanged?.();
    } catch (e) { toast.error('Could not revoke the link: ' + e.message); }
    setBusy(false);
  };

  // The clipboard is blocked in plenty of places (an insecure origin, an
  // in-app browser), so a failure has to leave the link readable on screen
  // rather than silently do nothing.
  const copy = async (value = url) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      toast('Copy the link from the box above', { icon: '📋' });
      return false;
    }
  };

  const label = docLabel(invoice).toLowerCase();

  // Sending the document to the customer is itself a follow-up, so the two
  // are recorded together rather than leaving somebody to tick a box.
  const sendAndRecord = async (href) => {
    window.open(href, '_blank', 'noopener');
    if (!quote || !canEdit) return;
    try { await markChased(invoice, 'Sent to the customer'); onChanged?.(); } catch { /* the send still happened */ }
  };

  const chase = async () => {
    setBusy(true);
    try {
      await markChased(invoice, 'Followed up by phone or in person');
      toast.success('Recorded as followed up today');
      onChanged?.();
    } catch (e) { toast.error('Could not record it: ' + e.message); }
    setBusy(false);
  };

  const emailHref = emailDraft(invoice, url, { to: invoice.customerEmail || '' });

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Share2 size={14} color="var(--text3)" />
        <span style={{
          fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Share
        </span>
      </div>

      {!shared && (
        <>
          <div style={{ fontSize: '0.84rem', color: 'var(--text2)' }}>
            Create a link that opens this {label} in a browser, with no sign-in.
            Useful for sending to a customer on WhatsApp or by email.
          </div>
          {canEdit ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn icon={Share2} onClick={create} disabled={busy}>
                {busy ? 'Creating…' : 'Create share link'}
              </Btn>
              <Btn size="sm" variant="secondary" icon={Mail} onClick={() => sendAndRecord(emailHref)}>
                Send by email
              </Btn>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
              You do not have permission to share this {label}.
            </div>
          )}
        </>
      )}

      {quote && invoice.status !== 'cancelled' && !invoice.convertedToId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          fontSize: '0.82rem', color: needsFollowUp(invoice) ? 'var(--yellow)' : 'var(--text2)',
        }}>
          <PhoneCall size={13} />
          <span style={{ flex: 1, minWidth: 160 }}>
            {invoice.followedUpAt
              ? `Last followed up ${daysSinceChased(invoice) === 0 ? 'today' : `${daysSinceChased(invoice)} days ago`}`
              : `Not followed up since ${lastChasedAt(invoice) || 'it was written'}`}
          </span>
          {canEdit && (
            <Btn size="sm" variant="ghost" onClick={chase} disabled={busy}>Mark followed up</Btn>
          )}
        </div>
      )}

      {shared && (
        <>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', padding: '8px 10px', background: 'var(--bg3)',
              border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: '12px',
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={() => copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </Btn>
            <Btn
              size="sm" variant="secondary" icon={MessageSquare}
              onClick={() => sendAndRecord(whatsappLink(invoice, url, invoice.customerPhone))}
            >
              Send on WhatsApp
            </Btn>
            <Btn size="sm" variant="secondary" icon={Mail} onClick={() => sendAndRecord(emailHref)}>
              Send by email
            </Btn>
            {canEdit && (
              <Btn size="sm" variant="ghost" icon={Link2Off} onClick={revoke} disabled={busy}>
                {busy ? 'Revoking…' : 'Stop sharing'}
              </Btn>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
            Anyone with this link can read this {label}. Stop sharing to refuse it.
          </div>
        </>
      )}
    </div>
  );
}
