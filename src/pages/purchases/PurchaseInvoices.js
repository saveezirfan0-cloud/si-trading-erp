// src/pages/purchases/PurchaseInvoices.js
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribe, remove, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Badge, PageHeader, Card, Loader, SearchBar, StatCard, HistoryButton } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Download, Eye, FileText, TrendingDown, Camera, Paperclip, ClipboardCheck } from 'lucide-react';
import {
  STATUS_OPTIONS, statusLabel, statusColor, isOutstanding, countsToTotals, needsApproval,
} from '../../lib/invoiceStatus';
import { timeAgo } from '../../lib/datetime';
import { exportCSV } from '../../lib/export';
import PurchaseInvoiceForm from './PurchaseInvoiceForm';
import PurchaseInvoiceView from './PurchaseInvoiceView';

export default function PurchaseInvoices() {
  const { formatCurrency, filterByFiscalYear, fiscalYear, fiscalYearLabel } = useApp();
  const navigate = useNavigate();
  const [allInvoices, setAllInvoices] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const unsub = subscribe(COLLECTIONS.PURCHASE_INVOICES, (data) => {
      const sorted = data.sort((a, b) => (b.invoiceNo || '').localeCompare(a.invoiceNo || ''));
      setAllInvoices(sorted); setLoading(false);
    });
    return () => unsub();
  }, []);

  // Everything below works on the fiscal-year-scoped list.
  const invoices = useMemo(
    () => filterByFiscalYear(allInvoices),
    [allInvoices, filterByFiscalYear]
  );

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(invoices.filter(i =>
      (statusFilter === 'all' || i.status === statusFilter) &&
      (i.invoiceNo?.toLowerCase().includes(q) ||
       i.supplierName?.toLowerCase().includes(q) ||
       i.supplierInvoiceNo?.toLowerCase().includes(q) ||
       i.updatedByName?.toLowerCase().includes(q) ||
       statusLabel(i.status).toLowerCase().includes(q))
    ));
  }, [search, statusFilter, invoices]);

  const handleDelete = async (id) => {
    if (!window.confirm('Move this purchase invoice to the trash? You can restore it from Trash.')) return;
    try { await remove(COLLECTIONS.PURCHASE_INVOICES, id); toast.success('Moved to trash'); }
    catch (e) { toast.error(e.message); }
  };

  // Drafts and invoices still under review are not committed purchases yet.
  const totalPurchases = invoices.filter(i => countsToTotals(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const totalDue = invoices.filter(i => isOutstanding(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  const awaiting = invoices.filter(i => needsApproval(i.status));

  // Keep the open record in step with realtime updates rather than showing the
  // snapshot taken when it was opened.
  const liveSelected = selected?.id
    ? (allInvoices.find(i => i.id === selected.id) || selected)
    : selected;

  if (view === 'form') return (
    <PurchaseInvoiceForm
      invoice={liveSelected}
      onBack={() => { setView('list'); setSelected(null); }}
      onPreview={(data) => { setSelected(data); setView('preview'); }}
    />
  );
  if (view === 'preview') return (
    <PurchaseInvoiceView
      invoice={liveSelected}
      onBack={() => { setView('list'); setSelected(null); }}
      onEdit={() => setView('form')}
    />
  );

  const columns = [
    { key: 'invoiceNo', label: 'Invoice #', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--purple)', fontWeight: 700 }}>{v}</span> },
    { key: 'supplierName', label: 'Supplier' },
    { key: 'supplierInvoiceNo', label: 'Supplier Ref' },
    { key: 'date', label: 'Date' },
    { key: 'items', label: 'Items', render: (v, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Badge color="purple">{v?.length || 0} items</Badge>
        {(r.scanPath || r.attachments?.length > 0) && (
          <span
            title={r.scanPath ? 'Scanned invoice attached' : `${r.attachments.length} attachment(s)`}
            style={{ display: 'inline-flex', color: 'var(--text3)' }}
          >
            <Paperclip size={13} />
          </span>
        )}
      </div>
    )},
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontWeight: 700 }}>{formatCurrency(v || 0)}</span> },
    { key: 'status', label: 'Status', render: v => <Badge color={statusColor(v)}>{statusLabel(v)}</Badge> },
    { key: 'updatedAt', label: 'Last Updated', render: (v, r) => (
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: '0.8rem' }}>{r.updatedByName || r.createdByName || '—'}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{timeAgo(v || r.createdAt, '—')}</div>
      </div>
    )},
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={Eye} onClick={e => { e.stopPropagation(); setSelected(row); setView('preview'); }}>View</Btn>
        <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); setSelected(row); setView('form'); }}>Edit</Btn>
        <HistoryButton collection={COLLECTIONS.PURCHASE_INVOICES} recordId={row.id} label={row.invoiceNo} />
        <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Purchase Invoices" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Purchase Invoices"
          subtitle={`${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}` + (fiscalYear !== 'all' ? ` · ${fiscalYearLabel(fiscalYear)}` : '')}
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(invoices, 'purchase_invoices')}>Export</Btn>,
            <Btn key="scan" variant="secondary" icon={Camera} onClick={() => navigate('/purchases/scan')}>Scan Invoice</Btn>,
            <Btn key="add" icon={Plus} onClick={() => { setSelected(null); setView('form'); }}>New Purchase</Btn>,
          ]}
        />
        <div className="g-stats" style={{ gap: 16 }}>
          <StatCard label="Total Purchases" value={formatCurrency(totalPurchases)} icon={TrendingDown} color="var(--purple)" />
          <StatCard label="Total Paid" value={formatCurrency(totalPaid)} icon={TrendingDown} color="var(--green)" />
          <StatCard label="Outstanding" value={formatCurrency(totalDue)} icon={FileText} color="var(--red)" />
          <StatCard label="Awaiting Approval" value={awaiting.length}
            sub={awaiting.length ? formatCurrency(awaiting.reduce((s, i) => s + (i.total || 0), 0)) : 'Nothing pending review'}
            icon={ClipboardCheck} color="var(--blue)" />
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search purchases..." />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              style={{ padding: '8px 12px', maxWidth: 200 }}
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {loading ? <Loader /> : <Table columns={columns} data={filtered} onRowClick={row => { setSelected(row); setView('preview'); }} />}
        </Card>
      </div>
    </>
  );
}
