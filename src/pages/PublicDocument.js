// src/pages/PublicDocument.js
//
// What a customer sees when they open a share link: the quotation or invoice,
// read-only, with a button to save it as a PDF. No sign-in, no navigation into
// the rest of the app, and nothing on the page but the document itself.
//
// The document is fetched by token through the share-document Edge Function,
// which is the only thing that can read the row.
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { downloadDocumentPdf } from '../lib/documentPdf';
import { partyLines } from '../lib/invoices';
import { docLabel, isQuotation } from '../lib/salesDocs';
import { Loader } from '../components/ui';
import { FileDown, AlertCircle } from 'lucide-react';

const money = (n) => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

const SHELL = {
  minHeight: '100vh', background: '#f4f5f7', padding: '24px 16px',
  fontFamily: 'Arial, Helvetica, sans-serif', color: '#111',
};
const SHEET = {
  maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)', padding: 'clamp(20px, 5vw, 44px)',
};
const LABEL = {
  fontSize: 10, color: '#888', textTransform: 'uppercase',
  letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6,
};

export default function PublicDocument() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, doc: null, error: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState({ loading: true, doc: null, error: '' });
    try {
      const { data, error } = await supabase.functions.invoke('share-document', { body: { token } });
      if (error) {
        let detail = 'This link is not valid. It may have been revoked.';
        try { detail = (await error.context.json())?.error || detail; } catch {}
        throw new Error(detail);
      }
      if (!data?.ok || !data.document) throw new Error(data?.error || 'This link is not valid.');
      setState({ loading: false, doc: data.document, error: '' });
    } catch (e) {
      setState({ loading: false, doc: null, error: e.message });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (state.loading) {
    return <div style={{ ...SHELL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader /></div>;
  }

  if (state.error) {
    return (
      <div style={SHELL}>
        <div style={{ ...SHEET, maxWidth: 520, textAlign: 'center' }}>
          <AlertCircle size={28} color="#dc2626" />
          <h1 style={{ fontSize: 18, margin: '12px 0 6px' }}>This link cannot be opened</h1>
          <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{state.error}</p>
          <p style={{ color: '#888', fontSize: 13, marginTop: 14 }}>
            Please ask S.I Trading &amp; Co. for a new link.
          </p>
        </div>
      </div>
    );
  }

  const doc = state.doc;
  const quote = isQuotation(doc);
  const party = partyLines(doc, 'customerName');
  const items = doc.items || [];

  const save = async () => {
    setSaving(true);
    try { await downloadDocumentPdf(doc); } catch { /* the browser said no */ }
    setSaving(false);
  };

  const th = (align = 'left') => ({
    padding: '9px 10px', fontSize: 10, fontWeight: 800, color: '#fff',
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align,
  });
  const td = (align = 'left') => ({ padding: '9px 10px', fontSize: 13, textAlign: align, verticalAlign: 'top' });

  return (
    <div style={SHELL}>
      <div style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
            background: '#111', color: '#fff', border: 0, borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
          }}
        >
          <FileDown size={15} />
          {saving ? 'Preparing…' : 'Save as PDF'}
        </button>
      </div>

      <div style={SHEET}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 16, flexWrap: 'wrap', paddingBottom: 20, marginBottom: 28,
          borderBottom: '2px solid #f0a500',
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#d4900a', letterSpacing: '-0.5px' }}>
              S.I Trading &amp; Co.
            </div>
            <div style={{ ...LABEL, marginBottom: 0, marginTop: 4 }}>Power Tools &amp; Hand Tools</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={LABEL}>{docLabel(doc)}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{doc.invoiceNo}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
          <div>
            <div style={LABEL}>{quote ? 'Quotation for' : 'Bill to'}</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{party.heading}</div>
            {party.person && <div style={{ fontSize: 13, color: '#555' }}>{party.person}</div>}
            {party.attention && <div style={{ fontSize: 13, color: '#555' }}>Kind Attention: {party.attention}</div>}
            {doc.customerPhone && <div style={{ fontSize: 13, color: '#555' }}>{doc.customerPhone}</div>}
            {doc.customerAddress && <div style={{ fontSize: 13, color: '#555' }}>{doc.customerAddress}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            {[
              [quote ? 'Quotation date' : 'Invoice date', doc.date],
              [quote ? 'Valid until' : 'Due date', doc.dueDate || '—'],
              ...(doc.reference ? [['Reference', doc.reference]] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={LABEL}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#1a1a1a' }}>
                <th style={th()}>Item</th>
                <th style={th('right')}>Qty</th>
                <th style={th('right')}>Unit price</th>
                <th style={th('right')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={td()}>
                    <div style={{ fontWeight: 700 }}>{line.itemName}</div>
                    {line.itemCode && <div style={{ fontSize: 11, color: '#d4900a', fontFamily: 'monospace' }}>{line.itemCode}</div>}
                    {line.description && line.description !== line.itemName && (
                      <div style={{ fontSize: 12, color: '#666' }}>{line.description}</div>
                    )}
                  </td>
                  <td style={td('right')}>{line.qty} {line.unit}</td>
                  <td style={td('right')}>{money(line.unitPrice)}</td>
                  <td style={{ ...td('right'), fontWeight: 700 }}>{money(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ width: 260 }}>
            {[
              ['Subtotal', money(doc.subtotal), '#111'],
              ['Discount', `− ${money(doc.discountAmount)}`, '#dc2626'],
              ['Tax', `+ ${money(doc.taxAmount)}`, '#2563eb'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                <span style={{ color: '#555' }}>{k}</span><span style={{ color: c }}>{v}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 6,
              borderTop: '2px solid #111', fontSize: 17, fontWeight: 900,
            }}>
              <span>Total</span><span style={{ color: '#d4900a' }}>{money(doc.total)}</span>
            </div>
            {!quote && Number(doc.paidAmount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 14, fontWeight: 800, color: '#dc2626' }}>
                <span>Balance due</span>
                <span>{money((Number(doc.total) || 0) - (Number(doc.paidAmount) || 0))}</span>
              </div>
            )}
          </div>
        </div>

        {(doc.notes || doc.terms) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
            {doc.notes && <div><div style={LABEL}>Notes</div><div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.6 }}>{doc.notes}</div></div>}
            {doc.terms && <div><div style={LABEL}>Terms &amp; Conditions</div><div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.6 }}>{doc.terms}</div></div>}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 16 }}>
        S.I Trading &amp; Co. · Power Tools &amp; Hand Tools
      </div>
    </div>
  );
}
