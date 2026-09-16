// src/components/invoices/InvoiceListView.js
//
// The list half of both invoice screens. Sales and purchases only differ in a
// couple of columns and labels, so they share the filtering, sorting, bulk
// actions, quick view and exports from here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribe, remove, update } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { Table, Btn, Badge, PageHeader, Card, Loader, StatCard, HistoryButton } from '../ui';
import toast from 'react-hot-toast';
import {
  Plus, Edit2, Trash2, Download, Eye, FileText, Paperclip, AlertTriangle,
  CheckCircle2, XCircle, FileDown, Wallet, Clock, Copy, ClipboardCheck, ShieldCheck,
} from 'lucide-react';
import { exportCSV, exportTablePDF } from '../../lib/export';
import InvoiceFilters from './InvoiceFilters';
import InvoiceQuickView from './InvoiceQuickView';
import {
  EMPTY_FILTERS, SOURCES, invoiceSource, isQuotation, docTypeOf, partyLines, filterInvoices, sortInvoices,
  isExpired, expiresSoon, isQuotationOpen, needsFollowUp, daysSinceChased,
  yearsOf, summarise, balanceDue, daysOverdue, hasAttachment, invoiceIssues,
  isDuplicate, activeInvoices, duplicateInvoices,
  invoiceExportRows, invoiceTotal, isDueSoon, isOverdue, activeFilterCount, attachmentCount,
} from '../../lib/invoices';
import { statusColor, statusLabel, needsApproval, approvalPatch } from '../../lib/invoiceStatus';
import { getCurrentActor } from '../../lib/audit';
import { timeAgo } from '../../lib/datetime';
import safeStorage from '../../lib/safeStorage';

const loadPrefs = (key) => {
  try {
    const saved = JSON.parse(safeStorage.getItem(key) || '{}');
    return {
      filters: { ...EMPTY_FILTERS, ...(saved.filters || {}) },
      sort: { key: 'date', dir: 'desc', ...(saved.sort || {}) },
      panelOpen: Boolean(saved.panelOpen),
    };
  } catch {
    return { filters: EMPTY_FILTERS, sort: { key: 'date', dir: 'desc' }, panelOpen: false };
  }
};

export default function InvoiceListView({
  kind,                      // 'sales' | 'purchase'
  docType,                   // 'invoice' | 'quotation' — scopes the whole page
  noun = 'invoice',          // what one row is called, in the counts and labels
  collection,
  title,
  partyField,                // 'customerName' | 'supplierName'
  partyLabel,                // 'Customer' | 'Supplier'
  accent = 'var(--accent)',
  badgeColor = 'blue',
  totalLabel = 'Total',
  newLabel = 'New Invoice',
  exportName,
  extraActions = [],
  onNew,
  onEditRow,
  onOpenRow,
}) {
  const { formatCurrency, formatDate, filterByFiscalYear, fiscalYear, fiscalYearLabel, isMobile } = useApp();
  // Sales and purchases are separate permission modules, and each action is
  // granted on its own — the buttons follow the same grid the data layer
  // enforces in lib/db.js.
  const { can } = useAuth();
  const moduleKey = kind === 'sales' ? 'sales' : 'purchases';
  const canCreate = can(moduleKey, 'create');
  const canEdit = can(moduleKey, 'edit');
  const canDelete = can(moduleKey, 'delete');
  const canExport = can(moduleKey, 'export');
  const canApprove = can(moduleKey, 'approve');
  const canSelect = canEdit || canDelete || canExport;

  const prefsKey = `si-invoice-view-${kind}${docType ? `-${docType}` : ''}`;
  const initial = useRef(loadPrefs(prefsKey)).current;

  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initial.filters);
  const [sort, setSort] = useState(initial.sort);
  const [panelOpen, setPanelOpen] = useState(initial.panelOpen);
  const [bucket, setBucket] = useState('active'); // active | duplicates | all
  const [selectedIds, setSelectedIds] = useState([]);
  const [quickView, setQuickView] = useState(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const unsub = subscribe(collection, (data) => { setAllInvoices(data); setLoading(false); });
    return () => unsub();
  }, [collection]);

  // Filters, sort and the panel state survive navigation and reloads.
  useEffect(() => {
    try {
      safeStorage.setItem(prefsKey, JSON.stringify({ filters, sort, panelOpen }));
    } catch {}
  }, [prefsKey, filters, sort, panelOpen]);

  // "/" jumps to the search box, the way every other list-heavy tool works.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The fiscal-year picker in the header scopes everything below it.
  const inYear = useMemo(() => filterByFiscalYear(allInvoices), [allInvoices, filterByFiscalYear]);

  // Duplicates are kept out of the working list by default. They are real rows
  // — the scan is evidence — but they carry no money and no stock, so mixing
  // them into the normal view would misrepresent every figure on the page.
  const dupes = useMemo(() => duplicateInvoices(inYear), [inYear]);
  const ofType = useMemo(
    () => (docType ? inYear.filter((r) => docTypeOf(r) === docType) : inYear),
    [inYear, docType]
  );
  const scoped = useMemo(() => {
    if (bucket === 'duplicates') return duplicateInvoices(ofType);
    if (bucket === 'all') return ofType;
    return activeInvoices(ofType);
  }, [bucket, ofType]);

  const visible = useMemo(
    () => sortInvoices(filterInvoices(scoped, filters, partyField), sort, partyField),
    [scoped, filters, sort, partyField]
  );

  // Counts come from the fiscal-year scope with the other filters applied, so a
  // status chip shows what clicking it would actually give you.
  const withoutStatus = useMemo(
    () => filterInvoices(scoped, { ...filters, status: 'all' }, partyField),
    [scoped, filters, partyField]
  );

  const statusCounts = useMemo(() => {
    const counts = { all: withoutStatus.length };
    withoutStatus.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
    return counts;
  }, [withoutStatus]);

  const flagCounts = useMemo(() => {
    const base = filterInvoices(scoped, { ...filters, flag: 'all' }, partyField);
    return {
      outstanding: base.filter((i) => balanceDue(i) > 0).length,
      overdue: base.filter((i) => isOverdue(i)).length,
      duesoon: base.filter((i) => isDueSoon(i)).length,
      issues: base.filter((i) => invoiceIssues(i, partyField).length > 0).length,
      followup: base.filter((i) => needsFollowUp(i)).length,
      open: base.filter(isQuotationOpen).length,
      expired: base.filter((i) => isExpired(i)).length,
      expiringsoon: base.filter((i) => expiresSoon(i)).length,
    };
  }, [scoped, filters, partyField]);

  const years = useMemo(() => yearsOf(scoped), [scoped]);

  const parties = useMemo(() => {
    const set = new Set(scoped.map((i) => i[partyField]).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped, partyField]);

  const stats = useMemo(() => summarise(visible), [visible]);

  // Selections that scroll out of the filtered set would silently act on rows
  // the user can no longer see.
  useEffect(() => {
    setSelectedIds((ids) => {
      if (!ids.length) return ids;
      const live = new Set(visible.map((r) => r.id));
      const next = ids.filter((id) => live.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [visible]);

  const selectedRows = useMemo(
    () => visible.filter((r) => selectedIds.includes(r.id)),
    [visible, selectedIds]
  );

  const toggleSort = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Move this invoice to the trash? You can restore it from Trash.')) return;
    try { await remove(collection, id); toast.success('Moved to trash'); }
    catch (e) { toast.error(e.message); }
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const bulkStatus = async (status) => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Mark ${selectedRows.length} invoice(s) as ${status}?`)) return;
    setBusy(true);
    let failed = 0;
    for (const row of selectedRows) {
      try {
        await update(collection, row.id, {
          status,
          paidAmount: status === 'paid' ? invoiceTotal(row) : (status === 'unpaid' ? 0 : Number(row.paidAmount) || 0),
        });
      } catch (e) { failed += 1; }
    }
    setBusy(false);
    setSelectedIds([]);
    failed
      ? toast.error(`${failed} of ${selectedRows.length} could not be updated`)
      : toast.success(`${selectedRows.length} invoice(s) marked ${status}`);
  };

  // Sign off everything selected that is waiting for review. Rows in any other
  // state are left alone rather than dragged backwards through the flow.
  const pendingSelected = selectedRows.filter(r => needsApproval(r.status));

  const bulkApprove = async () => {
    if (!pendingSelected.length) return;
    if (!window.confirm(`Approve ${pendingSelected.length} invoice(s) pending review?`)) return;
    setBusy(true);
    let failed = 0;
    for (const row of pendingSelected) {
      try {
        await update(
          collection, row.id,
          { status: 'approved', ...approvalPatch('approved', getCurrentActor()) },
          { action: 'status', note: 'Approved from the invoice list' },
        );
      } catch (e) { failed += 1; }
    }
    setBusy(false);
    setSelectedIds([]);
    failed
      ? toast.error(`${failed} of ${pendingSelected.length} could not be approved`)
      : toast.success(`${pendingSelected.length} invoice(s) approved`);
  };

  const bulkDelete = async () => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Move ${selectedRows.length} invoice(s) to the trash? You can restore them from Trash.`)) return;
    setBusy(true);
    let failed = 0;
    for (const row of selectedRows) {
      try { await remove(collection, row.id); } catch (e) { failed += 1; }
    }
    setBusy(false);
    setSelectedIds([]);
    failed
      ? toast.error(`${failed} of ${selectedRows.length} could not be moved to the trash`)
      : toast.success(`${selectedRows.length} invoice(s) moved to trash`);
  };

  // Exports follow what is on screen — filters, sort and all.
  const exportRows = (rows, suffix = '') => {
    if (!rows.length) return toast.error('Nothing to export');
    exportCSV(invoiceExportRows(rows, partyField), `${exportName}${suffix}`);
  };

  const exportPdf = (rows) => {
    if (!rows.length) return toast.error('Nothing to export');
    const cols = [
      { key: 'invoiceNo', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: partyField === 'supplierName' ? 'supplier' : 'customer', label: partyLabel },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'balanceDue', label: 'Balance' },
      { key: 'source', label: 'Source' },
    ];
    exportTablePDF(cols, invoiceExportRows(rows, partyField), title, exportName);
  };

  const resetFilters = () => { setFilters(EMPTY_FILTERS); setSelectedIds([]); };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'invoiceNo', label: 'Invoice #', sortable: true,
      render: (v, row) => {
        const issues = invoiceIssues(row, partyField);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: accent, fontWeight: 700 }}>{v || '—'}</span>
            {hasAttachment(row) && (
              <Paperclip size={12} color="var(--text3)"
                title={`${attachmentCount(row)} attachment(s)`} />
            )}
            {issues.length > 0 && (
              <AlertTriangle size={12} color="var(--accent)" title={`Needs attention: ${issues.join(', ')}`} />
            )}
            {kind === 'sales' && !docType && isQuotation(row) && (
              <Badge color="purple">Quote</Badge>
            )}
            {isExpired(row) && <Badge color="red">Expired</Badge>}
            {needsFollowUp(row) && (
              <span title={`Not chased for ${daysSinceChased(row)} days`}>
                <Badge color="yellow">Chase</Badge>
              </span>
            )}
            {row.convertedToNo && (
              <span title={`Converted to ${row.convertedToNo}`}>
                <Badge color="green">Won</Badge>
              </span>
            )}
            {isDuplicate(row) && (
              <span title={row.duplicateOfNo ? `Duplicate of ${row.duplicateOfNo}` : 'Duplicate — excluded from totals'}>
                <Badge color="warn">dup</Badge>
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: partyField, label: partyLabel, sortable: true, sortKey: 'party',
      // A business filed under a person's name shows the company under it, the
      // same way the Customers page lists it.
      render: (v, row) => {
        const { heading, person } = partyLines(row, partyField);
        if (!heading) return <span style={{ color: 'var(--text3)' }}>— none —</span>;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div>{heading}</div>
            {person && <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{person}</div>}
          </div>
        );
      },
    },
    ...(kind === 'purchase'
      ? [{ key: 'supplierInvoiceNo', label: 'Supplier Ref', render: v => v || '—' }]
      : []),
    {
      key: 'date', label: 'Date', sortable: true,
      render: v => (v ? formatDate(v) : <span style={{ color: 'var(--text3)' }}>no date</span>),
    },
    {
      key: 'dueDate', label: 'Due', sortable: true,
      render: (v, row) => {
        const late = daysOverdue(row);
        if (!v) return <span style={{ color: 'var(--text3)' }}>—</span>;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {formatDate(v)}
            {late > 0 && <Badge color="red">{late}d late</Badge>}
          </span>
        );
      },
    },
    { key: 'items', label: 'Items', sortable: true, render: v => <Badge color={badgeColor}>{v?.length || 0}</Badge> },
    {
      key: 'total', label: 'Total', align: 'right', sortable: true,
      render: v => <span style={{ fontWeight: 700 }}>{formatCurrency(v || 0)}</span>,
    },
    {
      key: 'balance', label: 'Balance', align: 'right', sortable: true, sortKey: 'balance',
      render: (_, row) => {
        const bal = balanceDue(row);
        return <span style={{ fontWeight: 600, color: bal > 0 ? 'var(--red)' : 'var(--text3)' }}>{bal > 0 ? formatCurrency(bal) : '—'}</span>;
      },
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (v, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Badge color={statusColor(v)}>{statusLabel(v)}</Badge>
          {row.approvedAt && (
            <ShieldCheck size={12} color="var(--green)"
              title={`Approved by ${row.approvedByName || 'unknown'}`} />
          )}
        </span>
      ),
    },
    {
      key: 'updatedAt', label: 'Last Updated', sortable: true, sortKey: 'updated',
      render: (v, row) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: '0.8rem' }}>{row.updatedByName || row.createdByName || '—'}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{timeAgo(v || row.createdAt, '—')}</div>
        </div>
      ),
    },
    {
      key: 'source', label: 'Source', sortable: false,
      render: (_, row) => {
        const s = SOURCES[invoiceSource(row)];
        return <Badge color={s.color}>{s.short}</Badge>;
      },
    },
    {
      key: '_actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Btn size="sm" variant="secondary" icon={Eye} onClick={e => { e.stopPropagation(); onOpenRow(row); }}>Open</Btn>
          {canEdit && <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); onEditRow(row); }} />}
          <HistoryButton collection={collection} recordId={row.id} label={row.invoiceNo} />
          {canDelete && <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />}
        </div>
      ),
    },
  ];

  // A phone cannot show eleven columns; the rest of the record is one tap away
  // in the quick view, which is also where the row actions live.
  const MOBILE_COLUMNS = ['invoiceNo', partyField, 'date', 'total', 'status'];
  const shownColumns = isMobile ? columns.filter(c => MOBILE_COLUMNS.includes(c.key)) : columns;

  // The quick view can change the row under itself (an approval, a file added
  // or removed), so read it back from the live list rather than holding the
  // snapshot the click handed over.
  const quickRow = quickView
    ? (allInvoices.find((r) => r.id === quickView.id) || quickView)
    : null;

  const filtersActive = activeFilterCount(filters) > 0 || Boolean(filters.search);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          `${visible.length} of ${scoped.length} ${scoped.length === 1 ? noun : `${noun}s`}` +
          (fiscalYear !== 'all' ? ` · ${fiscalYearLabel(fiscalYear)}` : '')
        }
        actions={[
          ...extraActions,
          ...(canExport ? [
            <Btn key="csv" variant="secondary" icon={Download} onClick={() => exportRows(visible)}>Export CSV</Btn>,
            <Btn key="pdf" variant="secondary" icon={FileDown} onClick={() => exportPdf(visible)}>PDF</Btn>,
          ] : []),
          ...(canCreate ? [<Btn key="add" icon={Plus} onClick={onNew}>{newLabel}</Btn>] : []),
        ]}
      />

      {/* Duplicates get their own view rather than polluting the working list. */}
      {dupes.length > 0 && (
        <div className="bucket-tabs" role="tablist" aria-label="Invoice set">
          {[
            { key: 'active', label: 'Active', count: inYear.length - dupes.length },
            { key: 'duplicates', label: 'Duplicates', count: dupes.length },
            { key: 'all', label: 'All', count: inYear.length },
          ].map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={bucket === t.key}
              onClick={() => setBucket(t.key)}
              className={`bucket-tab${bucket === t.key ? ' is-active' : ''}`}
            >
              {t.label}
              <span className="bucket-tab-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {bucket === 'duplicates' ? (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderLeft: '4px solid var(--yellow)',
          borderRadius: 'var(--radius)', padding: '13px 15px',
          fontSize: '0.86rem', lineHeight: 1.55,
        }}>
          <Copy size={17} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>{dupes.length} duplicate {dupes.length === 1 ? 'invoice' : 'invoices'}</strong>
            {' '}worth {formatCurrency(dupes.reduce((sum, d) => sum + invoiceTotal(d), 0))} are kept
            here for reference. They are excluded from every total, balance and stock movement in
            the app. If one of these is genuinely a separate document, open it and clear its
            duplicate flag by editing the date or supplier reference.
          </div>
        </div>
      ) : (
        <div className="g-stats">
          {docType === 'quotation' ? (<>
            <StatCard compact={isMobile} label={totalLabel} value={formatCurrency(stats.quotedAmount)} icon={FileText} color={accent}
              sub={`${stats.quotations} quotation${stats.quotations === 1 ? '' : 's'} shown`} />
            <StatCard compact={isMobile} label="Awaiting Approval" value={`${stats.awaitingCount}`}
              icon={ClipboardCheck} color="var(--blue)"
              sub={stats.awaitingCount ? formatCurrency(stats.awaitingAmount) : 'Nothing pending review'} />
            <StatCard compact={isMobile} label="Converted to invoice" value={`${stats.converted}`} icon={CheckCircle2} color="var(--green)"
              sub={stats.converted ? formatCurrency(stats.convertedAmount) : 'None accepted yet'} />
            <StatCard compact={isMobile} label="Still open" value={`${stats.quotations - stats.converted - stats.expired}`} icon={Clock} color="var(--accent)"
              sub={formatCurrency(stats.quotedAmount - stats.convertedAmount - stats.expiredAmount)} />
            <StatCard compact={isMobile} label="Expired" value={`${stats.expired}`} icon={XCircle} color="var(--red)"
              sub={stats.expired ? formatCurrency(stats.expiredAmount) : 'None past its date'} />
            <StatCard compact={isMobile} label="With attachment" value={`${stats.withAttachment}`} icon={Paperclip} color="var(--purple)"
              sub={`${stats.count - stats.withAttachment} without`} />
          </>) : (<>
            <StatCard compact={isMobile} label={totalLabel} value={formatCurrency(stats.total)} icon={FileText} color={accent}
              sub={stats.provisionalCount
                ? `${stats.count} shown · ${stats.provisionalCount} draft/in review not counted`
                : `${stats.count} ${noun}${stats.count === 1 ? '' : 's'} shown`} />
            <StatCard compact={isMobile} label="Awaiting Approval" value={`${stats.awaitingCount}`}
              icon={ClipboardCheck} color="var(--blue)"
              sub={stats.awaitingCount ? formatCurrency(stats.awaitingAmount) : 'Nothing pending review'} />
            <StatCard compact={isMobile} label="Paid" value={formatCurrency(stats.paid)} icon={CheckCircle2} color="var(--green)" />
            <StatCard compact={isMobile} label="Outstanding" value={formatCurrency(stats.due)} icon={Wallet} color="var(--red)" />
            <StatCard compact={isMobile} label="Overdue" value={formatCurrency(stats.overdueAmount)} icon={Clock} color="var(--accent)"
              sub={`${stats.overdueCount} past due date`} />
            <StatCard compact={isMobile} label="With attachment" value={`${stats.withAttachment}`} icon={Paperclip} color="var(--purple)"
              sub={`${stats.count - stats.withAttachment} without`} />
          </>)}
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <InvoiceFilters
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          open={panelOpen}
          onToggleOpen={() => setPanelOpen(o => !o)}
          statusCounts={statusCounts}
          flagCounts={flagCounts}
          years={years}
          parties={parties}
          partyLabel={partyLabel}
          showType={kind === 'sales' && !docType}
          docType={docType}
          sort={sort}
          onSortChange={setSort}
          showing={visible.length}
          total={scoped.length}
          searchRef={searchRef}
        />

        {selectedIds.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '10px 16px', background: 'var(--accent-glow)',
            borderBottom: '1px solid var(--border)',
          }}>
            <strong style={{ fontSize: '0.82rem' }}>{selectedIds.length} selected</strong>
            <div style={{ flex: 1 }} />
            {canExport && <Btn size="sm" variant="secondary" icon={Download} onClick={() => exportRows(selectedRows, '_selected')}>Export</Btn>}
            {canApprove && pendingSelected.length > 0 && (
              <Btn size="sm" variant="success" icon={ShieldCheck} disabled={busy} onClick={bulkApprove}>
                Approve {pendingSelected.length}
              </Btn>
            )}
            {canEdit && <Btn size="sm" variant="success" icon={CheckCircle2} disabled={busy} onClick={() => bulkStatus('paid')}>Mark paid</Btn>}
            {canEdit && <Btn size="sm" variant="secondary" icon={XCircle} disabled={busy} onClick={() => bulkStatus('unpaid')}>Mark unpaid</Btn>}
            {canDelete && <Btn size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={bulkDelete}>Delete</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Btn>
          </div>
        )}

        {loading ? <Loader /> : (
          <Table
            columns={shownColumns}
            data={visible}
            sort={sort}
            onSort={toggleSort}
            selectable={canSelect}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={row => setQuickView(row)}
            emptyMsg={filtersActive ? `No ${noun}s match these filters.` : `No ${noun}s yet.`}
          />
        )}
      </Card>

      {quickRow && (
        <InvoiceQuickView
          invoice={quickRow}
          collection={collection}
          partyField={partyField}
          partyLabel={partyLabel}
          accent={accent}
          canEdit={canEdit}
          canApprove={canApprove}
          onClose={() => setQuickView(null)}
          onOpenFull={() => { const row = quickRow; setQuickView(null); onOpenRow(row); }}
          onEdit={() => { const row = quickRow; setQuickView(null); onEditRow(row); }}
        />
      )}
    </>
  );
}
