// src/pages/accounting/Payments.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Textarea, Badge, PageHeader, FormGrid, Card, Loader, StatCard } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Download, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const EMPTY = {
  date: new Date().toISOString().split('T')[0],
  type: 'received',
  partyType: 'customer',
  partyId: '',
  partyName: '',
  amount: 0,
  method: 'cash',
  account: '',
  reference: '',
  chequeNo: '',
  chequeDate: '',
  bankName: '',
  notes: '',
  status: 'cleared',
};

export default function Payments() {
  const { formatCurrency } = useApp();
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c, s, a] = await Promise.all([
      getAll(COLLECTIONS.PAYMENTS),
      getAll(COLLECTIONS.CUSTOMERS),
      getAll(COLLECTIONS.SUPPLIERS),
      getAll(COLLECTIONS.ACCOUNTS),
    ]);
    setPayments(p.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setCustomers(c);
    setSuppliers(s);
    setAccounts(a.filter(x => x.active));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const parties = form.partyType === 'customer' ? customers : suppliers;

  const handleSave = async () => {
    if (!form.amount || !form.partyName) return toast.error('Party and amount required');
    setSaving(true);
    try {
      await create(COLLECTIONS.PAYMENTS, form);
      toast.success('Payment recorded');
      setModal(false);
      load();
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const totalIn = payments.filter(p => p.type === 'received').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalOut = payments.filter(p => p.type === 'made').reduce((s, p) => s + Number(p.amount || 0), 0);

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type', render: v => (
      <Badge color={v === 'received' ? 'green' : 'red'}>{v === 'received' ? 'Received' : 'Made'}</Badge>
    )},
    { key: 'partyName', label: 'Party', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{r.partyType}</div>
      </div>
    )},
    { key: 'method', label: 'Method', render: v => <Badge color="blue">{v}</Badge> },
    { key: 'reference', label: 'Reference' },
    { key: 'chequeNo', label: 'Cheque #' },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'cleared' ? 'green' : v === 'pending' ? 'yellow' : 'red'}>{v}</Badge> },
    { key: 'amount', label: 'Amount', align: 'right', render: (v, r) => (
      <span style={{ fontWeight: 600, color: r.type === 'received' ? 'var(--green)' : 'var(--red)' }}>
        {r.type === 'received' ? '+' : '-'}{formatCurrency(v)}
      </span>
    )},
  ];

  return (
    <>
      <Header title="Payments" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Payments"
          subtitle="Customer receipts & supplier payments"
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(payments, 'payments')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={() => { setForm(EMPTY); setModal(true); }}>New Payment</Btn>,
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <StatCard label="Received" value={formatCurrency(totalIn)} icon={ArrowDownLeft} color="var(--green)" />
          <StatCard label="Paid Out" value={formatCurrency(totalOut)} icon={ArrowUpRight} color="var(--red)" />
          <StatCard label="Net" value={formatCurrency(totalIn - totalOut)} icon={ArrowDownLeft} color="var(--accent)" />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <Loader /> : <Table columns={columns} data={payments} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Payment" width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Date" type="date" value={form.date} onChange={e => h('date', e.target.value)} />
            <Select label="Payment Type" value={form.type} onChange={e => h('type', e.target.value)}
              options={[{ value: 'received', label: 'Received (from Customer)' }, { value: 'made', label: 'Made (to Supplier)' }]} />
            <Select label="Party Type" value={form.partyType} onChange={e => { h('partyType', e.target.value); h('partyName', ''); }}
              options={[{ value: 'customer', label: 'Customer' }, { value: 'supplier', label: 'Supplier' }]} />
            <Select label="Party Name" value={form.partyName} onChange={e => h('partyName', e.target.value)}
              options={parties.map(p => ({ value: p.name, label: p.name }))} />
            <Input label="Amount (PKR)" type="number" value={form.amount} onChange={e => h('amount', Number(e.target.value))} />
            <Select label="Payment Method" value={form.method} onChange={e => h('method', e.target.value)}
              options={['cash', 'cheque', 'bank_transfer', 'online', 'other']} />
            <Input label="Reference #" value={form.reference} onChange={e => h('reference', e.target.value)} />
            <Select label="Account" value={form.account} onChange={e => h('account', e.target.value)}
              options={accounts.map(a => ({ value: a.name, label: `${a.code} - ${a.name}` }))} />
          </FormGrid>

          {form.method === 'cheque' && (
            <FormGrid cols={2}>
              <Input label="Cheque No." value={form.chequeNo} onChange={e => h('chequeNo', e.target.value)} />
              <Input label="Cheque Date" type="date" value={form.chequeDate} onChange={e => h('chequeDate', e.target.value)} />
              <Input label="Bank Name" value={form.bankName} onChange={e => h('bankName', e.target.value)} />
              <Select label="Status" value={form.status} onChange={e => h('status', e.target.value)}
                options={['pending', 'cleared', 'bounced', 'cancelled']} />
            </FormGrid>
          )}

          <Textarea label="Notes" value={form.notes} onChange={e => h('notes', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Payment'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
