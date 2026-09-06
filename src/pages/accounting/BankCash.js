// src/pages/accounting/BankCash.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Textarea, PageHeader, FormGrid, Card, Loader, StatCard } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, ArrowUpRight, ArrowDownLeft, DollarSign, Download } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const EMPTY = {
  date: new Date().toISOString().split('T')[0],
  type: 'receipt',
  account: '',
  amount: 0,
  reference: '',
  description: '',
  payee: '',
  category: '',
  chequeNo: '',
  bankName: '',
};

export default function BankCash() {
  const { formatCurrency, filterByFiscalYear } = useApp();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tx, acc] = await Promise.all([
      getAll(COLLECTIONS.TRANSACTIONS),
      getAll(COLLECTIONS.ACCOUNTS),
    ]);
    // Movements follow the header's fiscal year, like every other dated list.
    // Account balances stay cumulative — a bank balance is not a yearly figure.
    setTransactions(filterByFiscalYear(tx).sort((a, b) => new Date(b.date) - new Date(a.date)));
    setAccounts(acc.filter(a => ['asset'].includes(a.type)));
    setLoading(false);
  }, [filterByFiscalYear]);

  useEffect(() => { load(); }, [load]);

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.amount || !form.account) return toast.error('Account and amount required');
    setSaving(true);
    try {
      await create(COLLECTIONS.TRANSACTIONS, form);
      toast.success('Transaction recorded');
      setModal(false);
      load();
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const totalIn = transactions.filter(t => t.type === 'receipt').reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalOut = transactions.filter(t => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);

  const columns = [
    { key: 'date', label: 'Date', render: v => <span style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{v}</span> },
    { key: 'type', label: 'Type', render: v => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: v === 'receipt' ? 'var(--green)' : 'var(--red)' }}>
        {v === 'receipt' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
        <span style={{ textTransform: 'capitalize', fontSize: '0.82rem', fontWeight: 600 }}>{v}</span>
      </div>
    )},
    { key: 'description', label: 'Description' },
    { key: 'payee', label: 'Payee/Payer' },
    { key: 'reference', label: 'Reference' },
    { key: 'account', label: 'Account' },
    { key: 'amount', label: 'Amount', align: 'right', render: (v, r) => (
      <span style={{ fontWeight: 600, color: r.type === 'receipt' ? 'var(--green)' : 'var(--red)' }}>
        {r.type === 'receipt' ? '+' : '-'}{formatCurrency(v)}
      </span>
    )},
  ];

  return (
    <>
      <Header title="Bank & Cash" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Bank & Cash"
          subtitle="Track all money in and out"
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(transactions, 'transactions')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={() => { setForm(EMPTY); setModal(true); }}>New Transaction</Btn>,
          ]}
        />

        <div className="g-stats" style={{ gap: 16 }}>
          <StatCard label="Total In" value={formatCurrency(totalIn)} icon={ArrowDownLeft} color="var(--green)" />
          <StatCard label="Total Out" value={formatCurrency(totalOut)} icon={ArrowUpRight} color="var(--red)" />
          <StatCard label="Net Balance" value={formatCurrency(totalIn - totalOut)} icon={DollarSign} color="var(--accent)" />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <Loader /> : <Table columns={columns} data={transactions} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Transaction">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Date" type="date" value={form.date} onChange={e => h('date', e.target.value)} />
            <Select label="Type" value={form.type} onChange={e => h('type', e.target.value)}
              options={[{ value: 'receipt', label: 'Receipt (Money In)' }, { value: 'payment', label: 'Payment (Money Out)' }]} />
            <Select label="Account" value={form.account} onChange={e => h('account', e.target.value)}
              options={accounts.map(a => ({ value: a.name, label: `${a.code} - ${a.name}` }))} />
            <Input label="Amount (PKR)" type="number" value={form.amount} onChange={e => h('amount', Number(e.target.value))} />
            <Input label="Payee / Payer" value={form.payee} onChange={e => h('payee', e.target.value)} />
            <Input label="Reference #" value={form.reference} onChange={e => h('reference', e.target.value)} />
            <Input label="Cheque No." value={form.chequeNo} onChange={e => h('chequeNo', e.target.value)} />
            <Input label="Bank Name" value={form.bankName} onChange={e => h('bankName', e.target.value)} />
          </FormGrid>
          <Textarea label="Description" value={form.description} onChange={e => h('description', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
