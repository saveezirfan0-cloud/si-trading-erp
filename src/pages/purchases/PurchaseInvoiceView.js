// src/pages/purchases/PurchaseInvoiceView.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Badge, Card, ScanAttachment, RecordMeta, ActivityFeed, Attachments } from '../../components/ui';
import ApprovalBar from '../../components/invoices/ApprovalBar';
import { COLLECTIONS } from '../../lib/db';
import { statusLabel, statusColor } from '../../lib/invoiceStatus';
import { ArrowLeft, Edit2, Printer } from 'lucide-react';

export default function PurchaseInvoiceView({ invoice, onBack, onEdit }) {
  const { formatCurrency } = useApp();
  if (!invoice) return null;

  const handlePrint = () => {
    const printArea = document.getElementById('purchase-print');
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Purchase ${invoice.invoiceNo}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f5f5f5; padding: 9px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; }
        td { padding: 9px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
        .right { text-align: right; }
        @page { margin: 20mm; }
      </style></head><body>${printArea.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <>
      <Header title={`Purchase — ${invoice.invoiceNo}`} />
      <div className="page-pad" style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" icon={Edit2} onClick={onEdit}>Edit</Btn>
          <Btn variant="secondary" icon={Printer} onClick={handlePrint}>Print / PDF</Btn>
        </div>

        {/* Where this invoice sits in the review flow, and what can be done next */}
        <div style={{ marginBottom: 16 }}>
          <ApprovalBar collection={COLLECTIONS.PURCHASE_INVOICES} invoice={invoice} />
        </div>

        <Card>
          <div id="purchase-print">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--purple)' }}>S.I Trading & Co.</div>
                <div style={{ color: 'var(--text3)', fontSize: '0.82rem', marginTop: 4 }}>Purchase Invoice</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>{invoice.invoiceNo}</div>
                {invoice.supplierInvoiceNo && <div style={{ color: 'var(--text3)', fontSize: '0.82rem' }}>Supplier Ref: {invoice.supplierInvoiceNo}</div>}
                <Badge color={statusColor(invoice.status)} style={{ marginTop: 6 }}>{statusLabel(invoice.status).toUpperCase()}</Badge>
              </div>
            </div>

            <div className="g-2" style={{ gap: 30, marginBottom: 30 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Supplier</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{invoice.supplierName}</div>
                {invoice.supplierPhone && <div style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 4 }}>{invoice.supplierPhone}</div>}
                {invoice.supplierAddress && <div style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{invoice.supplierAddress}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {[
                  { label: 'Purchase Date', value: invoice.date },
                  { label: 'Due Date', value: invoice.dueDate || '—' },
                  { label: 'Payment', value: invoice.paymentMethod?.replace(/_/g, ' ') },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{r.label}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 100, textAlign: 'right' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '2px solid var(--border)' }}>
                  {['#', 'Item', 'Description', 'Qty', 'Unit', 'Cost Price', 'Disc %', 'Tax %', 'Total'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', fontSize: '0.7rem', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((line, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: '0.82rem' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{line.itemName}</div>
                      {line.itemCode && <div style={{ fontSize: '0.72rem', color: 'var(--purple)' }}>{line.itemCode}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '0.82rem' }}>{line.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{line.qty}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{line.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{line.discount || 0}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{line.taxRate || 0}%</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div style={{ width: 280 }}>
                {[
                  { label: 'Subtotal', value: formatCurrency(invoice.subtotal || 0) },
                  { label: 'Discount', value: `− ${formatCurrency(invoice.discountAmount || 0)}`, color: 'var(--red)' },
                  { label: 'Tax', value: `+ ${formatCurrency(invoice.taxAmount || 0)}`, color: 'var(--blue)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.88rem', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text2)' }}>{r.label}</span>
                    <span style={{ color: r.color || 'var(--text)' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--purple)' }}>{formatCurrency(invoice.total || 0)}</span>
                </div>
                {invoice.paidAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700, borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--red)' }}>Balance Due</span>
                    <span style={{ color: 'var(--red)' }}>{formatCurrency((invoice.total || 0) - (invoice.paidAmount || 0))}</span>
                  </div>
                )}
              </div>
            </div>

            {invoice.notes && (
              <div style={{ paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>{invoice.notes}</div>
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          {/* The photo this invoice was scanned from, when it came via OCR. */}
          <ScanAttachment
            path={invoice.scanPath}
            uploadedAt={invoice.scanUploadedAt}
            size={invoice.scanSize}
          />
          <RecordMeta record={invoice} />
          <Attachments
            collection={COLLECTIONS.PURCHASE_INVOICES}
            recordId={invoice.id}
            attachments={invoice.attachments}
            hint="Attach the supplier’s own invoice, the goods-received note or a payment proof."
          />
          <ActivityFeed collection={COLLECTIONS.PURCHASE_INVOICES} recordId={invoice.id} />
        </div>
      </div>
    </>
  );
}
