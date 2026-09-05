// src/components/invoices/ApprovalBar.js
//
// The review/approve strip on an invoice: where it sits in the approval flow,
// who signed it off, and the moves available to the person looking at it.
// Approving is restricted to roles holding the 'approve' permission (admin and
// manager); anyone with write access can send a draft for review.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, ClipboardCheck } from 'lucide-react';
import { Btn, Badge } from '../ui';
import { update } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import {
  approvalActions, approvalPatch, statusLabel, statusColor, needsApproval,
} from '../../lib/invoiceStatus';
import { formatDateTime } from '../../lib/datetime';

export default function ApprovalBar({ collection, invoice, onChanged }) {
  const { profile, hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);

  // An unsaved preview has no id yet — there is nothing to approve.
  if (!invoice?.id) return null;

  const canApprove = hasPermission('approve');
  const actions = approvalActions(invoice.status, canApprove);

  const move = async (action) => {
    setBusy(true);
    try {
      const actor = { id: profile?.id, name: profile?.name };
      await update(
        collection,
        invoice.id,
        { status: action.to, ...approvalPatch(action.to, actor) },
        { action: 'status', note: `${action.label} — ${statusLabel(invoice.status)} → ${statusLabel(action.to)}` },
      );
      toast.success(`${statusLabel(action.to)}`);
      onChanged?.(action.to);
    } catch (e) {
      toast.error(`Could not update the status: ${e.message}`);
    }
    setBusy(false);
  };

  const pending = needsApproval(invoice.status);

  return (
    <div className="no-print" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'var(--bg2)',
      border: `1px solid ${pending ? 'var(--accent)' : 'var(--border)'}`,
      borderLeft: `3px solid ${pending ? 'var(--accent)' : 'var(--border2)'}`,
      borderRadius: 'var(--radius-lg)', padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {invoice.approvedAt ? <ShieldCheck size={15} style={{ color: 'var(--green)' }} />
                            : <ClipboardCheck size={15} style={{ color: 'var(--text2)' }} />}
        <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Status</span>
        <Badge color={statusColor(invoice.status)}>{statusLabel(invoice.status)}</Badge>
      </div>

      <div style={{ fontSize: '0.76rem', color: 'var(--text3)', flex: 1, minWidth: 140 }}>
        {invoice.approvedAt
          ? `Approved by ${invoice.approvedByName || 'unknown'} · ${formatDateTime(invoice.approvedAt)}`
          : pending
            ? (canApprove
                ? 'Waiting for your approval.'
                : 'Waiting for a manager or admin to approve.')
            : ''}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <Btn key={a.key} size="sm" variant={a.variant} disabled={busy} onClick={() => move(a)}>
            {a.label}
          </Btn>
        ))}
      </div>
    </div>
  );
}
