// src/pages/accounting/ChartOfAccounts.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Badge, PageHeader, FormGrid, Card, Loader } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2 } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset', color: 'blue' },
  { value: 'liability', label: 'Liability', color: 'red' },
  { value: 'equity', label: 'Equity', color: 'purple' },
  { value: 'income', label: 'Income', color: 'green' },
  { value: 'expense', label: 'Expense', color: 'yellow' },
];

const EMPTY = { code: '', name: '', type: 'asset', subType: '', currency: 'PKR', description: '', active: true, balance: 0 };

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAll(COLLECTIONS.ACCOUNTS);
    // Sort by code
    setAccounts(data.sort((a, b) => (a.code || '').localeCompare(b.code || '')));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (a) => { setForm({ ...a }); setEditing(a.id); setModal(true); };
  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name || !form.code) return toast.error('Code and Name required');
    setSaving(true);
    try {
      if (editing) { await update(COLLECTIONS.ACCOUNTS, editing, form); toast.success('Account updated'); }
      else { await create(COLLECTIONS.ACCOUNTS, form); toast.success('Account created'); }
      setModal(false); load();
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Move this account to the trash? You can restore it from Trash.')) return;
    try {
      await remove(COLLECTIONS.ACCOUNTS, id);
      toast.success('Moved to trash'); load();
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  };

  const grouped = ACCOUNT_TYPES.map(t => ({
    ...t,
    accounts: accounts.filter(a => a.type === t.value),
  }));

  const columns = [
    { key: 'code', label: 'Code', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: '0.82rem' }}>{v}</span> },
    { key: 'name', label: 'Account Name', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        {r.subType && <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.subType}</div>}
      </div>
    )},
    { key: 'type', label: 'Type', render: (v) => {
      const t = ACCOUNT_TYPES.find(x => x.value === v);
      return <Badge color={t?.color || 'default'}>{v}</Badge>;
    }},
    { key: 'balance', label: 'Balance', align: 'right', render: v => (
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {new Intl.NumberFormat('en-PK').format(v || 0)}
      </span>
    )},
    { key: 'active', label: 'Status', render: v => <Badge color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Btn>
        <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Chart of Accounts" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader
          title="Chart of Accounts"
          subtitle={`${accounts.length} accounts configured`}
          actions={[<Btn key="add" icon={Plus} onClick={openNew}>Add Account</Btn>]}
        />

        {loading ? <Loader /> : grouped.map(g => g.accounts.length > 0 && (
          <Card key={g.value} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <Badge color={g.color}>{g.label}</Badge>
              <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{g.accounts.length} accounts</span>
            </div>
            <Table columns={columns} data={g.accounts} paginate={false} />
          </Card>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Account' : 'New Account'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Account Code" value={form.code} onChange={e => h('code', e.target.value)} placeholder="e.g. 1001" required />
            <Select label="Account Type *" value={form.type} onChange={e => h('type', e.target.value)}
              options={ACCOUNT_TYPES.map(t => ({ value: t.value, label: t.label }))} required />
            <Input label="Account Name" value={form.name} onChange={e => h('name', e.target.value)} required />
            <Input label="Sub-Type" value={form.subType} onChange={e => h('subType', e.target.value)} placeholder="e.g. Current Asset" />
            <Input label="Opening Balance" type="number" value={form.balance} onChange={e => h('balance', Number(e.target.value))} />
            <Select label="Status" value={form.active ? 'true' : 'false'} onChange={e => h('active', e.target.value === 'true')}
              options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
          </FormGrid>
          <Input label="Description" value={form.description} onChange={e => h('description', e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
