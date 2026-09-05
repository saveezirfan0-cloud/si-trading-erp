// src/lib/invoiceStatus.js — the one description of an invoice's status.
//
// Sales and purchase invoices share a single status field that carries both
// the approval step and the payment state:
//
//   draft → pending_review → approved → unpaid → partial → paid
//                    ↑ sent back                     └────→ cancelled
//
// Draft and Pending review are working states: nothing is owed yet, so they
// stay out of the outstanding totals. From Approved onwards the invoice counts
// as a real receivable/payable.
export const INVOICE_STATUSES = [
  { value: 'draft',          label: 'Draft',           color: 'default', print: ['#f3f4f6', '#374151'] },
  { value: 'pending_review', label: 'Pending Review',  color: 'yellow',  print: ['#fef9c3', '#854d0e'] },
  { value: 'approved',       label: 'Approved',        color: 'blue',    print: ['#dbeafe', '#1e40af'] },
  { value: 'unpaid',         label: 'Unpaid',          color: 'red',     print: ['#fee2e2', '#991b1b'] },
  { value: 'partial',        label: 'Partially Paid',  color: 'yellow',  print: ['#fef9c3', '#854d0e'] },
  { value: 'paid',           label: 'Paid',            color: 'green',   print: ['#dcfce7', '#166534'] },
  { value: 'cancelled',      label: 'Cancelled',       color: 'red',     print: ['#fee2e2', '#991b1b'] },
];

const BY_VALUE = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s]));

export const STATUS_OPTIONS = INVOICE_STATUSES.map(({ value, label }) => ({ value, label }));

export const statusLabel = (s) => BY_VALUE[s]?.label || (s ? String(s).replace(/_/g, ' ') : '—');
export const statusColor = (s) => BY_VALUE[s]?.color || 'default';
export const statusPrintBg = (s) => (BY_VALUE[s]?.print || ['#f3f4f6', '#374151'])[0];
export const statusPrintFg = (s) => (BY_VALUE[s]?.print || ['#f3f4f6', '#374151'])[1];

// Not yet real money: excluded from revenue, purchases and outstanding totals.
export const isProvisional = (s) => s === 'draft' || s === 'pending_review';
export const isCancelled = (s) => s === 'cancelled';
export const isSettled = (s) => s === 'paid';

// Counts towards the amount still owed.
export const isOutstanding = (s) => !isProvisional(s) && !isCancelled(s) && !isSettled(s);
// Counts towards revenue / purchase totals (a draft is not a sale yet).
export const countsToTotals = (s) => !isProvisional(s) && !isCancelled(s);

export const needsApproval = (s) => s === 'pending_review';
export const isApproved = (s) =>
  s === 'approved' || s === 'unpaid' || s === 'partial' || s === 'paid';

// What a person can do to an invoice in this state, given whether they hold the
// 'approve' permission. Rendered as buttons on the invoice view.
export const approvalActions = (status, canApprove) => {
  const actions = [];
  if (status === 'draft' || !status) {
    actions.push({ key: 'submit', to: 'pending_review', label: 'Submit for Review', variant: 'primary' });
  }
  if (status === 'pending_review') {
    if (canApprove) {
      actions.push({ key: 'approve', to: 'approved', label: 'Approve', variant: 'success' });
      actions.push({ key: 'reject', to: 'draft', label: 'Send Back to Draft', variant: 'danger' });
    }
  }
  if (status === 'approved') {
    actions.push({ key: 'unpaid', to: 'unpaid', label: 'Mark Awaiting Payment', variant: 'secondary' });
    if (canApprove) {
      actions.push({ key: 'revoke', to: 'pending_review', label: 'Withdraw Approval', variant: 'danger' });
    }
  }
  return actions;
};

// The audit note and approval stamps that go with a status move.
export const approvalPatch = (to, actor) => {
  const now = new Date().toISOString();
  if (to === 'approved') {
    return {
      approvedAt: now,
      approvedBy: actor?.id || null,
      approvedByName: actor?.name || 'Unknown user',
    };
  }
  if (to === 'pending_review') {
    return { submittedForReviewAt: now, approvedAt: null, approvedBy: null, approvedByName: null };
  }
  if (to === 'draft') {
    return { approvedAt: null, approvedBy: null, approvedByName: null };
  }
  return {};
};
