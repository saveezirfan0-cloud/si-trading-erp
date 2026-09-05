// src/pages/accounting/Expenses.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Textarea, Badge, PageHeader, FormGrid, Card, Loader, StatCard } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Download, TrendingDown } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Office Supplies', 'Marketing', 'Maintenance', 'Insurance', 'Bank Charges', 'Telephone', 'Internet', 'Fuel', 'Other'];

const EMPTY = {
  date: new Date().toISOString().split('T')[0],
  category: '',
  description: '',
  amount: 0,
  paidBy: 'cash',
  reference: '',
  accountId: '',
  vendorName: '',
  receiptNo: '',
  notes: '',
  status: 'approved',
};

export default function Expenses() {
  const { formatCurrency, filterByFiscalYear } = useApp();
  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, a] = await Promise.all([
      getAll(COLLECTIONS.EXPENSES),
      getAll(COLLECTIONS.ACCOUNTS),
    ]);
    setExpenses(filterByFiscalYear(e.sort((a, b) => new Date(b.date) - new Date(a.date))));
    setAccounts(a.filter(x => x.active));
    setLoading(false);
  }, [filterByFiscalYear]);

  useEffect(() => { load(); }, [load]);

  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (e) => { setForm({ ...e }); setEditing(e.id); setModal(true); };

  const handleSave = async () => {
    if (!form.amount || !form.category) return toast.error('Category and amount required');
    setSaving(true);
    try {
      if (editing) { await update(COLLECTIONS.EXPENSES, editing, form); toast.success('Updated'); }
      else { await create(COLLECTIONS.EXPENSES, form); toast.success('Expense recorded'); }
      setModal(false); load();
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Move this expense to the trash? You can restore it from Trash.')) return;
    try {
      await remove(COLLECTIONS.EXPENSES, id); toast.success('Moved to trash'); load();
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  };

  const totalThisMonth = expenses
    .filter(e => new Date(e.date).getMonth() === new Date().getMonth())
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const totalAll = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  // Group by category for summary
  const byCat = CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount || 0), 0),
  })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'category', label: 'Category', render: v => <Badge color="yellow">{v}</Badge> },
    { key: 'description', label: 'Description' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'paidBy', label: 'Method', render: v => <Badge color="blue">{v}</Badge> },
    { key: 'reference', label: 'Reference' },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'approved' ? 'green' : 'yellow'}>{v}</Badge> },
    { key: 'amount', label: 'Amount', align: 'right', render: v => <span style={{ color: 'var(--red)', fontWeight: 600 }}>-{formatCurrency(v)}</span> },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Btn>
        <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Expenses" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Expenses"
          subtitle="Track all business expenses"
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(expenses, 'expenses')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={openNew}>Add Expense</Btn>,
          ]}
        />

        <div className="g-stats" style={{ gap: 16 }}>
          <StatCard label="Total Expenses" value={formatCurrency(totalAll)} icon={TrendingDown} color="var(--red)" />
          <StatCard label="This Month" value={formatCurrency(totalThisMonth)} icon={TrendingDown} color="var(--accent)" />
          <StatCard label="Entries" value={expenses.length} icon={TrendingDown} color="var(--blue)" />
        </div>

        <div className="g-main" style={{ gap: 16 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? <Loader /> : <Table columns={columns} data={expenses} />}
          </Card>

          <Card>
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 16 }}>By Category</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byCat.length === 0
                ? <p style={{ color: 'var(--text3)', fontSize: '0.82rem' }}>No data yet</p>
                : byCat.map(({ cat, total }) => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem' }}>{cat}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatCurrency(total)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99 }}>
                      <div style={{ width: `${Math.min(100, (total / totalAll) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                    </div>
                  </div>
                ))
              }
            </div>
          </Card>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Expense' : 'New Expense'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Date" type="date" value={form.date} onChange={e => h('date', e.target.value)} />
            <Select label="Category *" value={form.category} onChange={e => h('category', e.target.value)}
              options={CATEGORIES} required />
            <Input label="Amount (PKR) *" type="number" value={form.amount} onChange={e => h('amount', Number(e.target.value))} required />
            <Select label="Paid By" value={form.paidBy} onChange={e => h('paidBy', e.target.value)}
              options={['cash', 'bank_transfer', 'cheque', 'card']} />
            <Input label="Vendor / Payee" value={form.vendorName} onChange={e => h('vendorName', e.target.value)} />
            <Input label="Receipt / Reference No." value={form.receiptNo} onChange={e => h('receiptNo', e.target.value)} />
            <Select label="Account" value={form.accountId} onChange={e => h('accountId', e.target.value)}
              options={accounts.filter(a => a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }))} />
            <Select label="Status" value={form.status} onChange={e => h('status', e.target.value)}
              options={['pending', 'approved', 'rejected']} />
          </FormGrid>
          <Input label="Description" value={form.description} onChange={e => h('description', e.target.value)} />
          <Textarea label="Notes" value={form.notes} onChange={e => h('notes', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Record'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
