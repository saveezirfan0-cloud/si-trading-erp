// src/pages/sales/SalesInvoiceView.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Badge } from '../../components/ui';
import { ArrowLeft, Edit2, Printer } from 'lucide-react';

export default function SalesInvoiceView({ invoice, onBack, onEdit }) {
  const { formatCurrency } = useApp();
  if (!invoice) return null;

  const statusColor = s => ({ paid: 'green', unpaid: 'red', partial: 'yellow', draft: 'default', cancelled: 'red' }[s] || 'default');
  const statusLabel = s => ({ paid: 'PAID', unpaid: 'UNPAID', partial: 'PARTIAL', draft: 'DRAFT', cancelled: 'CANCELLED' }[s] || s?.toUpperCase());
  const statusBg = s => ({ paid: '#dcfce7', unpaid: '#fee2e2', partial: '#fef9c3', draft: '#f3f4f6', cancelled: '#fee2e2' }[s] || '#f3f4f6');
  const statusClr = s => ({ paid: '#166534', unpaid: '#991b1b', partial: '#854d0e', draft: '#374151', cancelled: '#991b1b' }[s] || '#374151');

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${invoice.invoiceNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; background: #fff; }
    .page { padding: 48px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #f0a500; }
    .company-name { font-size: 26px; font-weight: 900; color: #d4900a; letter-spacing: -0.5px; }
    .company-sub { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-no { font-size: 30px; font-weight: 900; color: #111; text-align: right; }
    .invoice-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; text-align: right; margin-bottom: 6px; }
    .status-badge { display: inline-block; padding: 4px 14px; border-radius: 99px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; margin-top: 8px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 36px; }
    .meta-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 6px; }
    .meta-value { font-size: 13px; color: #111; line-height: 1.6; }
    .meta-value strong { font-size: 15px; font-weight: 800; }
    .meta-right { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #1a1a1a; }
    thead th { padding: 10px 12px; font-size: 10px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; }
    thead th.right { text-align: right; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody td { padding: 10px 12px; font-size: 13px; color: #111; vertical-align: top; }
    tbody td.right { text-align: right; }
    .item-code { font-size: 11px; color: #d4900a; font-family: monospace; margin-top: 2px; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 6px 0; font-size: 13px; }
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .totals-table .divider td { border-top: 1px solid #e0e0e0; padding-top: 10px; }
    .totals-table .grand td { font-size: 17px; font-weight: 900; padding-top: 8px; border-top: 2px solid #111; }
    .totals-table .grand td:last-child { color: #d4900a; }
    .totals-table .paid td { color: #16a34a; }
    .totals-table .balance td { color: #dc2626; font-weight: 800; font-size: 15px; border-top: 1px solid #dc2626; padding-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .footer-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 6px; }
    .footer-value { font-size: 12px; color: #555; line-height: 1.6; }
    .watermark { text-align: center; margin-top: 40px; font-size: 11px; color: #ccc; }
    @page { margin: 15mm; size: A4; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">S.I Trading & Co.</div>
      <div class="company-sub">Power Tools & Hand Tools</div>
    </div>
    <div style="text-align:right">
      <div class="invoice-label">Sales Invoice</div>
      <div class="invoice-no">${invoice.invoiceNo}</div>
      <div>
        <span class="status-badge" style="background:${statusBg(invoice.status)};color:${statusClr(invoice.status)}">
          ${statusLabel(invoice.status)}
        </span>
      </div>
    </div>
  </div>

  <div class="meta-grid">
    <div>
      <div class="meta-label">Bill To</div>
      <div class="meta-value">
        <strong>${invoice.customerName || ''}</strong><br/>
        ${invoice.customerPhone ? invoice.customerPhone + '<br/>' : ''}
        ${invoice.customerAddress || ''}
      </div>
    </div>
    <div class="meta-right">
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        ${[
          ['Invoice Date', invoice.date],
          ['Due Date', invoice.dueDate || '—'],
          ['Payment Method', (invoice.paymentMethod || '').replace(/_/g,' ')],
        ].map(([l,v]) => `
          <div>
            <div class="meta-label">${l}</div>
            <div class="meta-value">${v}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Item</th>
        <th>Description</th>
        <th class="right" style="width:50px">Qty</th>
        <th class="right" style="width:50px">Unit</th>
        <th class="right" style="width:90px">Unit Price</th>
        <th class="right" style="width:55px">Disc%</th>
        <th class="right" style="width:55px">Tax%</th>
        <th class="right" style="width:90px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${(invoice.items || []).map((line, i) => `
        <tr>
          <td style="color:#888">${i+1}</td>
          <td>
            <div style="font-weight:700">${line.itemName || ''}</div>
            ${line.itemCode ? `<div class="item-code">${line.itemCode}</div>` : ''}
          </td>
          <td style="color:#555">${line.description || ''}</td>
          <td class="right">${line.qty}</td>
          <td class="right" style="color:#888">${line.unit}</td>
          <td class="right">PKR ${Number(line.unitPrice).toLocaleString()}</td>
          <td class="right" style="color:#888">${line.discount || 0}%</td>
          <td class="right" style="color:#888">${line.taxRate || 0}%</td>
          <td class="right" style="font-weight:700">PKR ${Number(line.total || 0).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals-table">
      <tr><td style="color:#555">Subtotal</td><td>PKR ${Number(invoice.subtotal||0).toLocaleString()}</td></tr>
      <tr><td style="color:#dc2626">Discount</td><td style="color:#dc2626">− PKR ${Number(invoice.discountAmount||0).toLocaleString()}</td></tr>
      <tr><td style="color:#2563eb">Tax</td><td style="color:#2563eb">+ PKR ${Number(invoice.taxAmount||0).toLocaleString()}</td></tr>
      <tr class="grand"><td>Total</td><td>PKR ${Number(invoice.total||0).toLocaleString()}</td></tr>
      ${invoice.paidAmount > 0 ? `
        <tr class="paid"><td>Paid</td><td>− PKR ${Number(invoice.paidAmount).toLocaleString()}</td></tr>
        <tr class="balance"><td>Balance Due</td><td>PKR ${Number((invoice.total||0)-(invoice.paidAmount||0)).toLocaleString()}</td></tr>
      ` : ''}
    </table>
  </div>

  ${(invoice.notes || invoice.terms) ? `
  <div class="footer">
    ${invoice.notes ? `<div><div class="footer-label">Notes</div><div class="footer-value">${invoice.notes}</div></div>` : '<div></div>'}
    ${invoice.terms ? `<div><div class="footer-label">Terms & Conditions</div><div class="footer-value">${invoice.terms}</div></div>` : ''}
  </div>` : ''}

  <div class="watermark">Generated by S.I Trading & Co. ERP • ${new Date().toLocaleDateString()}</div>
</div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  return (
    <>
      <Header title={`Invoice — ${invoice.invoiceNo}`} />
      <div className="page-pad" style={{ padding: 24, maxWidth: 860 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" icon={Edit2} onClick={onEdit}>Edit</Btn>
          <Btn icon={Printer} onClick={handlePrint}>Print / Save PDF</Btn>
        </div>

        {/* Preview card */}
        <div id="invoice-print-area" style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 40,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36, paddingBottom: 24, borderBottom: '2px solid var(--accent)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>S.I Trading & Co.</div>
              <div style={{ color: 'var(--text3)', fontSize: '0.72rem', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Power Tools & Hand Tools</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Sales Invoice</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{invoice.invoiceNo}</div>
              <Badge color={statusColor(invoice.status)} style={{ marginTop: 8 }}>{statusLabel(invoice.status)}</Badge>
            </div>
          </div>

          {/* Meta */}
          <div className="g-2" style={{ gap: 32, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Bill To</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{invoice.customerName}</div>
              {invoice.customerPhone && <div style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{invoice.customerPhone}</div>}
              {invoice.customerAddress && <div style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{invoice.customerAddress}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
              {[
                ['Invoice Date', invoice.date],
                ['Due Date', invoice.dueDate || '—'],
                ['Payment Method', (invoice.paymentMethod || '—').replace(/_/g, ' ')],
              ].map(([l, v]) => (
                <div key={l} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'capitalize' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['#', 'Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Disc%', 'Tax%', 'Total'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', fontSize: '10px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 3 ? 'right' : 'left', borderBottom: '2px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: '12px' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{line.itemName}</div>
                    {line.itemCode && <div style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{line.itemCode}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '12px' }}>{line.description}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{line.qty}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text3)' }}>{line.unit}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text3)' }}>{line.discount || 0}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text3)' }}>{line.taxRate || 0}%</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
            <div style={{ width: 280 }}>
              {[
                { label: 'Subtotal', value: formatCurrency(invoice.subtotal || 0), color: 'var(--text)' },
                { label: 'Discount', value: `− ${formatCurrency(invoice.discountAmount || 0)}`, color: 'var(--red)' },
                { label: 'Tax', value: `+ ${formatCurrency(invoice.taxAmount || 0)}`, color: 'var(--blue)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.88rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text2)' }}>{r.label}</span>
                  <span style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', borderTop: '2px solid var(--text)' }}>
                <span>Total</span>
                <span style={{ color: 'var(--accent)' }}>{formatCurrency(invoice.total || 0)}</span>
              </div>
              {invoice.paidAmount > 0 && <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.88rem', color: 'var(--green)' }}>
                  <span>Paid</span><span>− {formatCurrency(invoice.paidAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700, fontSize: '0.95rem', color: 'var(--red)', borderTop: '1px solid var(--border)' }}>
                  <span>Balance Due</span><span>{formatCurrency((invoice.total || 0) - (invoice.paidAmount || 0))}</span>
                </div>
              </>}
            </div>
          </div>

          {/* Footer */}
          {(invoice.notes || invoice.terms) && (
            <div className="g-2" style={{ gap: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
              {invoice.notes && <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Notes</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>{invoice.notes}</div>
              </div>}
              {invoice.terms && <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Terms & Conditions</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>{invoice.terms}</div>
              </div>}
            </div>
          )}

          <div style={{ marginTop: 32, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text3)' }}>
            Generated by S.I Trading & Co. ERP • {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>
    </>
  );
}
