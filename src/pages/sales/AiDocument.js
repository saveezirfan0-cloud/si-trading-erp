// src/pages/sales/AiDocument.js — write an invoice or quotation by describing it.
//
//   Make a quotation
//   Name: ARY Laguna Karachi Pvt Ltd
//   Kind Attention : Mr Zaheer
//   4 pcs Demolition Hammer HP1300-DH @ 23000/=
//
// The text goes to the ai-document Edge Function, the reply is matched against
// the customer and inventory lists (src/lib/aiDocument.js), and the result
// opens in the ordinary sales form to be checked and saved. Nothing is written
// until the person presses Save there.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAll, COLLECTIONS } from '../../lib/db';
import { parseDocumentText, buildDraft } from '../../lib/aiDocument';
import { docLabel } from '../../lib/salesDocs';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import SalesInvoiceForm from './SalesInvoiceForm';
import { Btn, Card } from '../../components/ui';
import toast from 'react-hot-toast';
import { ArrowLeft, Sparkles, AlertTriangle, RefreshCw, Wand2 } from 'lucide-react';

const EXAMPLE = `Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=`;

const todayISO = () => new Date().toISOString().split('T')[0];

// Ask the AI first. When it has no keys, is not deployed or cannot be reached,
// the built-in reader takes over so a document can still be written — and the
// screen says which one ran. Text the AI itself calls unreadable is an error
// about the text, not the service, so that one is not retried locally.
async function readRequest(text) {
  const today = todayISO();
  const local = (reason) => ({ parsed: parseDocumentText(text, today), provider: 'local', fallbackReason: reason });
  try {
    const { data, error } = await supabase.functions.invoke('ai-document', { body: { text, today } });
    if (error) {
      let body = null;
      try { body = await error.context.json(); } catch {}
      if (body?.unreadable) {
        throw Object.assign(new Error(`${body.error}. ${body.detail || ''}`.trim()), { unreadable: true });
      }
      return local(body?.error || error.message);
    }
    if (!data?.ok) return local(data?.error || 'no reply from the AI service');
    return { parsed: data.data, provider: data.provider || 'ai', fallbackReason: '' };
  } catch (e) {
    if (e.unreadable) throw e;
    return local(e.message);
  }
}

const PROVIDER_NAMES = { anthropic: 'Claude', openai: 'OpenAI', local: 'the built-in reader' };

function Notice({ draft, warnings, provider, onRestart }) {
  const who = PROVIDER_NAMES[provider] || provider;
  return (
    <Card style={{ borderLeft: '4px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <Sparkles size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {docLabel(draft)} {draft.invoiceNo} drafted by {who}
            {draft.customerName ? ` for ${draft.customerName}` : ''}
            {draft.attention ? ` (attn. ${draft.attention})` : ''}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
            {draft.items.filter(i => i.itemName).length} line{draft.items.filter(i => i.itemName).length === 1 ? '' : 's'} read.
            Check every field below, then press <strong>Save</strong>. Nothing is stored until you do.
          </div>
          {warnings.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.5 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ color: 'var(--text)' }}>
                  <AlertTriangle size={12} color="var(--yellow)" style={{ verticalAlign: '-1px', marginRight: 6 }} />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Btn size="sm" variant="ghost" icon={RefreshCw} onClick={onRestart}>Change the request</Btn>
      </div>
    </Card>
  );
}

export default function AiDocument() {
  const navigate = useNavigate();
  const { isMobile } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    if (!text.trim()) return toast.error('Describe the document first');
    setBusy(true);
    try {
      const [customers, inventory, existing, read] = await Promise.all([
        getAll(COLLECTIONS.CUSTOMERS),
        getAll(COLLECTIONS.INVENTORY),
        // Trashed documents count towards numbering, as everywhere else.
        getAll(COLLECTIONS.SALES_INVOICES, [], { includeDeleted: true }),
        readRequest(text),
      ]);
      const { draft, warnings } = buildDraft(read.parsed, {
        customers, inventory, existing, today: todayISO(), prompt: text, provider: read.provider,
      });
      if (read.fallbackReason) {
        warnings.unshift(`The AI service could not be used (${read.fallbackReason}), so the built-in reader was used instead — check every line.`);
      }
      setResult({ draft, warnings, provider: read.provider });
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  if (result) {
    return (
      <SalesInvoiceForm
        invoice={result.draft}
        onBack={() => setResult(null)}
        onSaved={() => navigate(result.draft.docType === 'quotation' ? '/sales/quotations' : '/sales')}
        notice={<Notice draft={result.draft} warnings={result.warnings} provider={result.provider} onRestart={() => setResult(null)} />}
      />
    );
  }

  return (
    <>
      <Header title="AI Invoice / Quotation" />
      <div className="page-pad" style={{ padding: 24, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="toolbar">
          <Btn variant="ghost" icon={ArrowLeft} onClick={() => navigate('/sales')}>Back</Btn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Sparkles size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem', whiteSpace: 'nowrap' }}>
              Describe it, we write it
            </span>
          </div>
          <div className="toolbar-spacer" />
        </div>

        <Card>
          <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
            What do you need? One item per line.
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={isMobile ? 8 : 10}
            placeholder={EXAMPLE}
            disabled={busy}
            style={{
              width: '100%', padding: '10px 12px', background: 'var(--input-bg)',
              border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.6, resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn icon={Wand2} onClick={handleGenerate} disabled={busy}>
              {busy ? 'Reading…' : 'Create document'}
            </Btn>
            <Btn variant="secondary" onClick={() => setText(EXAMPLE)} disabled={busy}>Use the example</Btn>
            {text && <Btn variant="ghost" onClick={() => setText('')} disabled={busy}>Clear</Btn>}
          </div>
        </Card>

        <Card>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            What it understands
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text2)' }}>
            <li><strong>Quotation or invoice</strong> — say which; "quotation", "quote" or "estimate" makes a QT- document, anything else an SI- invoice.</li>
            <li><strong>Customer</strong> — <code>Name: …</code>, <code>M/s …</code> or "quotation for …". Existing customers are matched by name; a new name can be added with one click.</li>
            <li><strong>Contact</strong> — <code>Kind Attention: Mr Zaheer</code>, plus <code>Phone:</code>, <code>Address:</code>, <code>Ref:</code>, <code>Date:</code> and <code>Valid till:</code> when you need them.</li>
            <li><strong>Items</strong> — <code>4 pcs Demolition Hammer HP1300-DH @ 23000/=</code>, <code>Angle Grinder x 2 @ Rs 8,500</code> or <code>Pipe Wrench 24" 6 pcs 1450</code>. Items in the inventory are linked; a line without a price takes the inventory sale price.</li>
            <li><strong>Discount</strong> — <code>Discount 10%</code> for the whole document, or <code>… @ 15000 less 5%</code> on one line.</li>
            <li><strong>Notes</strong> — <code>Notes: deliver by Friday</code>, <code>Terms: …</code>.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
