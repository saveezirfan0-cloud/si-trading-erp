// src/components/invoices/InvoiceListView.js
//
// The list half of both invoice screens. Sales and purchases only differ in a
// couple of columns and labels, so they share the filtering, sorting, bulk
// actions, quick view and exports from here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribe, remove, update } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { Table, Btn, Badge, PageHeader, Card, Loader, StatCard } from '../ui';
import toast from 'react-hot-toast';
import {
  Plus, Edit2, Trash2, Download, Eye, FileText, Paperclip, AlertTriangle,
  CheckCircle2, XCircle, FileDown, Wallet, Clock,
} from 'lucide-react';
import { exportCSV, exportTablePDF } from '../../lib/export';
import InvoiceFilters from './InvoiceFilters';
import InvoiceQuickView from './InvoiceQuickView';
import {
  EMPTY_FILTERS, SOURCES, invoiceSource, filterInvoices, sortInvoices,
  yearsOf, summarise, balanceDue, daysOverdue, hasAttachment, invoiceIssues,
  invoiceExportRows, invoiceTotal, isDueSoon, isOverdue, activeFilterCount,
} from '../../lib/invoices';

const statusColor = (s) =>
  ({ paid: 'green', unpaid: 'red', partial: 'yellow', draft: 'default', cancelled: 'red' }[s] || 'default');

const loadPrefs = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
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
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('write');

  const prefsKey = `si-invoice-view-${kind}`;
  const initial = useRef(loadPrefs(prefsKey)).current;

  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initial.filters);
  const [sort, setSort] = useState(initial.sort);
  const [panelOpen, setPanelOpen] = useState(initial.panelOpen);
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
      localStorage.setItem(prefsKey, JSON.stringify({ filters, sort, panelOpen }));
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
  const scoped = useMemo(() => filterByFiscalYear(allInvoices), [allInvoices, filterByFiscalYear]);

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
    if (!window.confirm('Delete this invoice?')) return;
    try { await remove(collection, id); toast.success('Deleted'); }
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

  const bulkDelete = async () => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Delete ${selectedRows.length} invoice(s)? This cannot be undone.`)) return;
    setBusy(true);
    let failed = 0;
    for (const row of selectedRows) {
      try { await remove(collection, row.id); } catch (e) { failed += 1; }
    }
    setBusy(false);
    setSelectedIds([]);
    failed
      ? toast.error(`${failed} of ${selectedRows.length} could not be deleted`)
      : toast.success(`${selectedRows.length} invoice(s) deleted`);
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
            {hasAttachment(row) && <Paperclip size={12} color="var(--text3)" title="Has an attachment" />}
            {issues.length > 0 && (
              <AlertTriangle size={12} color="var(--accent)" title={`Needs attention: ${issues.join(', ')}`} />
            )}
          </span>
        );
      },
    },
    { key: partyField, label: partyLabel, sortable: true, sortKey: 'party', render: v => v || <span style={{ color: 'var(--text3)' }}>— none —</span> },
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
    { key: 'status', label: 'Status', sortable: true, render: v => <Badge color={statusColor(v)}>{v || '—'}</Badge> },
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
          {canWrite && <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); onEditRow(row); }} />}
          {canWrite && <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />}
        </div>
      ),
    },
  ];

  // A phone cannot show eleven columns; the rest of the record is one tap away
  // in the quick view, which is also where the row actions live.
  const MOBILE_COLUMNS = ['invoiceNo', partyField, 'date', 'total', 'status'];
  const shownColumns = isMobile ? columns.filter(c => MOBILE_COLUMNS.includes(c.key)) : columns;

  const filtersActive = activeFilterCount(filters) > 0 || Boolean(filters.search);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          `${visible.length} of ${scoped.length} ${scoped.length === 1 ? 'invoice' : 'invoices'}` +
          (fiscalYear !== 'all' ? ` · ${fiscalYearLabel(fiscalYear)}` : '')
        }
        actions={[
          ...extraActions,
          <Btn key="csv" variant="secondary" icon={Download} onClick={() => exportRows(visible)}>Export CSV</Btn>,
          <Btn key="pdf" variant="secondary" icon={FileDown} onClick={() => exportPdf(visible)}>PDF</Btn>,
          ...(canWrite ? [<Btn key="add" icon={Plus} onClick={onNew}>{newLabel}</Btn>] : []),
        ]}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: isMobile ? 10 : 16,
      }}>
        <StatCard compact={isMobile} label={totalLabel} value={formatCurrency(stats.total)} icon={FileText} color={accent}
          sub={`${stats.count} invoice${stats.count === 1 ? '' : 's'} shown`} />
        <StatCard compact={isMobile} label="Paid" value={formatCurrency(stats.paid)} icon={CheckCircle2} color="var(--green)" />
        <StatCard compact={isMobile} label="Outstanding" value={formatCurrency(stats.due)} icon={Wallet} color="var(--red)" />
        <StatCard compact={isMobile} label="Overdue" value={formatCurrency(stats.overdueAmount)} icon={Clock} color="var(--accent)"
          sub={`${stats.overdueCount} past due date`} />
        <StatCard compact={isMobile} label="With attachment" value={`${stats.withAttachment}`} icon={Paperclip} color="var(--purple)"
          sub={`${stats.count - stats.withAttachment} without`} />
      </div>

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
            <Btn size="sm" variant="secondary" icon={Download} onClick={() => exportRows(selectedRows, '_selected')}>Export</Btn>
            {canWrite && <Btn size="sm" variant="success" icon={CheckCircle2} disabled={busy} onClick={() => bulkStatus('paid')}>Mark paid</Btn>}
            {canWrite && <Btn size="sm" variant="secondary" icon={XCircle} disabled={busy} onClick={() => bulkStatus('unpaid')}>Mark unpaid</Btn>}
            {canWrite && <Btn size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={bulkDelete}>Delete</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Btn>
          </div>
        )}

        {loading ? <Loader /> : (
          <Table
            columns={shownColumns}
            data={visible}
            sort={sort}
            onSort={toggleSort}
            selectable={canWrite}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={row => setQuickView(row)}
            emptyMsg={filtersActive ? 'No invoices match these filters.' : 'No invoices yet.'}
          />
        )}
      </Card>

      {quickView && (
        <InvoiceQuickView
          invoice={quickView}
          collection={collection}
          partyField={partyField}
          partyLabel={partyLabel}
          accent={accent}
          canWrite={canWrite}
          onClose={() => setQuickView(null)}
          onOpenFull={() => { const row = quickView; setQuickView(null); onOpenRow(row); }}
          onEdit={() => { const row = quickView; setQuickView(null); onEditRow(row); }}
        />
      )}
    </>
  );
}
