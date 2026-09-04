// src/pages/sales/SalesInvoices.js
import React, { useEffect, useMemo, useState } from 'react';
import { subscribe, remove, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Select, Badge, PageHeader, Card, Loader, SearchBar, StatCard } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Download, Eye, FileText, TrendingUp } from 'lucide-react';
import { exportCSV } from '../../lib/export';
import SalesInvoiceForm from './SalesInvoiceForm';
import SalesInvoiceView from './SalesInvoiceView';

export default function SalesInvoices() {
  const { formatCurrency, filterByFiscalYear, fiscalYear, fiscalYearLabel } = useApp();
  const [allInvoices, setAllInvoices] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const unsub = subscribe(COLLECTIONS.SALES_INVOICES, (data) => {
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
      i.invoiceNo?.toLowerCase().includes(q) ||
      i.customerName?.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q)
    ));
  }, [search, invoices]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try { await remove(COLLECTIONS.SALES_INVOICES, id); toast.success('Deleted'); }
    catch (e) { toast.error(e.message); }
  };

  const totalRevenue = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const totalDue = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + (i.total || 0), 0);

  const statusColor = s => ({ paid: 'green', unpaid: 'red', partial: 'yellow', draft: 'default', cancelled: 'red' }[s] || 'default');

  if (view === 'form') return (
    <SalesInvoiceForm
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onPreview={(data) => { setSelected(data); setView('preview'); }}
    />
  );
  if (view === 'preview') return (
    <SalesInvoiceView
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onEdit={() => setView('form')}
    />
  );

  const columns = [
    { key: 'invoiceNo', label: 'Invoice #', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>{v}</span> },
    { key: 'customerName', label: 'Customer' },
    { key: 'date', label: 'Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'items', label: 'Items', render: v => <Badge color="blue">{v?.length || 0} items</Badge> },
    { key: 'total', label: 'Total', align: 'right', render: v => <span style={{ fontWeight: 700 }}>{formatCurrency(v || 0)}</span> },
    { key: 'status', label: 'Status', render: v => <Badge color={statusColor(v)}>{v}</Badge> },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={Eye} onClick={e => { e.stopPropagation(); setSelected(row); setView('preview'); }}>View</Btn>
        <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); setSelected(row); setView('form'); }}>Edit</Btn>
        <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Sales Invoices" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Sales Invoices"
          subtitle={`${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}` + (fiscalYear !== 'all' ? ` · ${fiscalYearLabel(fiscalYear)}` : '')}
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(invoices, 'sales_invoices')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={() => { setSelected(null); setView('form'); }}>New Invoice</Btn>,
          ]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} color="var(--accent)" />
          <StatCard label="Total Paid" value={formatCurrency(totalPaid)} icon={TrendingUp} color="var(--green)" />
          <StatCard label="Outstanding" value={formatCurrency(totalDue)} icon={FileText} color="var(--red)" />
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search invoices..." />
          </div>
          {loading ? <Loader /> : <Table columns={columns} data={filtered} onRowClick={row => { setSelected(row); setView('preview'); }} />}
        </Card>
      </div>
    </>
  );
}
