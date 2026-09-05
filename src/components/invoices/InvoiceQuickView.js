// src/components/invoices/InvoiceQuickView.js
//
// Peek at an invoice without leaving the list: header facts, the line items,
// the money, and the scan or file attached to it. The full print view is one
// click away for when the whole document is wanted.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { Modal, Btn, Badge, Loader } from '../ui';
import {
  Paperclip, ExternalLink, Upload, Trash2, FileText, Edit2, Eye,
  AlertTriangle, CheckCircle2, Download, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { update } from '../../lib/db';
import {
  SOURCES, invoiceSource, importBook, attachmentPath, balanceDue,
  daysOverdue, invoiceIssues, invoiceTotal, paidAmount,
} from '../../lib/invoices';
import {
  signedUrl, uploadAttachment, removeAttachment, isPdf, ACCEPTED_ATTACHMENTS,
} from '../../lib/attachments';
import { statusColor, statusLabel, needsApproval, approvalPatch } from '../../lib/invoiceStatus';
import { getCurrentActor } from '../../lib/audit';


function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: '0.84rem' }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function InvoiceQuickView({
  invoice,
  collection,
  partyField = 'customerName',
  partyLabel = 'Customer',
  accent = 'var(--accent)',
  canEdit = false,
  canApprove = false,
  onClose,
  onOpenFull,
  onEdit,
}) {
  const { formatCurrency, formatDate } = useApp();
  const [url, setUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [busy, setBusy] = useState(false);

  const path = attachmentPath(invoice);

  const loadFile = useCallback(async () => {
    if (!path) { setUrl(null); return; }
    setLoadingFile(true);
    try {
      setUrl(await signedUrl(path));
    } catch (e) {
      console.warn('attachment link failed', e);
      setUrl(null);
      toast.error('Could not open the attachment');
    }
    setLoadingFile(false);
  }, [path]);

  useEffect(() => { loadFile(); }, [loadFile]);

  if (!invoice) return null;

  const source = invoiceSource(invoice);
  const book = importBook(invoice);
  const issues = invoiceIssues(invoice, partyField);
  const late = daysOverdue(invoice);
  const balance = balanceDue(invoice);
  const isManualFile = Boolean(invoice.attachmentPath);

  const handleUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAttachment(collection, invoice.id, file);
      toast.success('Attachment saved');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Upload failed');
    }
    setBusy(false);
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove this attachment?')) return;
    setBusy(true);
    try {
      await removeAttachment(collection, invoice.id, invoice.attachmentPath);
      toast.success('Attachment removed');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not remove the attachment');
    }
    setBusy(false);
  };

  // Sign-off, with the approval stamped onto the invoice and into its history.
  const approve = async () => {
    setBusy(true);
    try {
      await update(
        collection, invoice.id,
        { status: 'approved', ...approvalPatch('approved', getCurrentActor()) },
        { action: 'status', note: 'Approved from the invoice quick view' },
      );
      toast.success('Approved');
      onClose();
    } catch (e) {
      toast.error(e.message || 'Update failed');
    }
    setBusy(false);
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await update(collection, invoice.id, {
        status,
        paidAmount: status === 'paid' ? invoiceTotal(invoice) : (status === 'unpaid' ? 0 : paidAmount(invoice)),
      });
      toast.success(`Marked ${status}`);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Update failed');
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title={`Invoice ${invoice.invoiceNo || ''}`} width={820}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Labels */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge color={statusColor(invoice.status)}>{statusLabel(invoice.status)}</Badge>
          <Badge color={SOURCES[source].color}>{SOURCES[source].label}</Badge>
          {book && <Badge>{book}</Badge>}
          {invoice.date && <Badge color="blue">{String(invoice.date).slice(0, 4)}</Badge>}
          {path && <Badge color="green">Attachment</Badge>}
          {late > 0 && <Badge color="red">{late} days overdue</Badge>}
          {issues.map(i => <Badge key={i} color="yellow">{i}</Badge>)}
        </div>

        {/* Facts + money */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <div>
            <Row label={partyLabel} value={invoice[partyField] || '—'} />
            {invoice.supplierInvoiceNo && <Row label="Supplier ref" value={invoice.supplierInvoiceNo} />}
            <Row label="Date" value={invoice.date ? formatDate(invoice.date) : '—'} />
            <Row label="Due date" value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} color={late > 0 ? 'var(--red)' : undefined} />
            <Row label="Payment method" value={invoice.paymentMethod?.replace(/_/g, ' ') || '—'} />
            <Row label="Line items" value={(invoice.items || []).length} />
            {invoice.createdAt && <Row label="Added" value={formatDate(invoice.createdAt)} />}
          </div>
          <div>
            <Row label="Subtotal" value={formatCurrency(invoice.subtotal || 0)} />
            <Row label="Discount" value={`− ${formatCurrency(invoice.discountAmount || 0)}`} color="var(--red)" />
            <Row label="Tax" value={`+ ${formatCurrency(invoice.taxAmount || 0)}`} color="var(--blue)" />
            <Row label="Total" value={formatCurrency(invoiceTotal(invoice))} color={accent} />
            <Row label="Paid" value={formatCurrency(paidAmount(invoice))} color="var(--green)" />
            <Row label="Balance due" value={formatCurrency(balance)} color={balance > 0 ? 'var(--red)' : 'var(--green)'} />
          </div>
        </div>

        {/* Line items */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Item', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h} style={{
                      padding: '8px 12px', fontSize: '0.68rem', textAlign: i ? 'right' : 'left',
                      fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      position: 'sticky', top: 0, background: 'var(--bg3)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>No line items on this invoice.</td></tr>
                ) : (invoice.items || []).map((line, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: 600 }}>{line.itemName}</div>
                      {line.itemCode && <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{line.itemCode}</div>}
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: '0.82rem', textAlign: 'right' }}>{line.qty} {line.unit}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.82rem', textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.82rem', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Attachment */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: path ? 12 : 0, flexWrap: 'wrap' }}>
            <Paperclip size={14} color="var(--text2)" />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.85rem' }}>Attachment</span>
            <div style={{ flex: 1 }} />
            {path && url && (
              <>
                <Btn size="sm" variant="secondary" icon={ExternalLink}
                  onClick={() => window.open(url, '_blank', 'noopener')}>Open</Btn>
                <a href={url} download style={{ textDecoration: 'none' }}>
                  <Btn size="sm" variant="secondary" icon={Download}>Download</Btn>
                </a>
              </>
            )}
            {canEdit && isManualFile && (
              <Btn size="sm" variant="danger" icon={Trash2} onClick={handleRemove} disabled={busy}>Remove</Btn>
            )}
            {canEdit && (
              <label style={{ display: 'inline-flex' }}>
                <input
                  type="file"
                  accept={ACCEPTED_ATTACHMENTS}
                  hidden
                  disabled={busy}
                  onChange={e => handleUpload(e.target.files?.[0])}
                />
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg3)', border: '1px solid var(--border2)',
                  color: 'var(--text)', borderRadius: 7, padding: '5px 12px',
                  fontSize: '0.78rem', cursor: busy ? 'wait' : 'pointer',
                }}>
                  <Upload size={14} />{path ? 'Replace' : 'Attach file'}
                </span>
              </label>
            )}
          </div>

          {!path && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
              No file attached. {canEdit ? 'Attach a photo or PDF of the original document.' : ''}
            </p>
          )}
          {path && loadingFile && <Loader />}
          {path && !loadingFile && url && (
            isPdf(path)
              ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: '0.82rem' }}>
                  <FileText size={16} /> {invoice.attachmentName || path.split('/').pop()} — open to view the PDF.
                </div>
              )
              : (
                <img
                  src={url}
                  alt="Invoice attachment"
                  style={{
                    width: '100%', maxHeight: 340, objectFit: 'contain',
                    borderRadius: 'var(--radius)', background: 'var(--bg)',
                    border: '1px solid var(--border)',
                  }}
                />
              )
          )}
          {path && !loadingFile && !url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: '0.82rem' }}>
              <AlertTriangle size={15} /> The stored file could not be loaded.
            </div>
          )}
        </div>

        {invoice.notes && (
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text2)' }}>{invoice.notes}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <Btn variant="secondary" icon={Eye} onClick={onOpenFull}>Open full invoice</Btn>
          {canEdit && <Btn variant="secondary" icon={Edit2} onClick={onEdit}>Edit</Btn>}
          <div style={{ flex: 1 }} />
          {canApprove && needsApproval(invoice.status) && (
            <Btn variant="success" icon={ShieldCheck} disabled={busy} onClick={approve}>Approve</Btn>
          )}
          {canEdit && invoice.status !== 'paid' && (
            <Btn variant="success" icon={CheckCircle2} disabled={busy} onClick={() => setStatus('paid')}>Mark paid</Btn>
          )}
          {canEdit && invoice.status === 'paid' && (
            <Btn variant="secondary" disabled={busy} onClick={() => setStatus('unpaid')}>Mark unpaid</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
