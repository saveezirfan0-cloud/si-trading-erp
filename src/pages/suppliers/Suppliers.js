// src/pages/suppliers/Suppliers.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import {
  Table, Btn, Modal, Input, Select, Textarea,
  SearchBar, Badge, PageHeader, FormGrid, Card, Loader
} from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Download } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const EMPTY = {
  name: '', company: '', email: '', phone: '', address: '', city: '',
  country: 'Pakistan', category: 'goods', balance: 0, currency: 'PKR',
  taxId: '', bankName: '', bankAccount: '', notes: '', status: 'active',
  paymentTerms: '30',
};

export default function Suppliers() {
  const { formatCurrency } = useApp();
  const [suppliers, setSuppliers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAll(COLLECTIONS.SUPPLIERS);
    setSuppliers(data);
    setFiltered(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.company?.toLowerCase().includes(q) ||
      s.phone?.includes(q)
    ));
  }, [search, suppliers]);

  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (s) => { setForm({ ...s }); setEditing(s.id); setModal(true); };
  const handleChange = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editing) {
        await update(COLLECTIONS.SUPPLIERS, editing, form);
        toast.success('Supplier updated');
      } else {
        await create(COLLECTIONS.SUPPLIERS, form);
        toast.success('Supplier added');
      }
      setModal(false);
      load();
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Move this supplier to the trash? You can restore it from Trash.')) return;
    await remove(COLLECTIONS.SUPPLIERS, id);
    toast.success('Moved to trash');
    load();
  };

  const columns = [
    { key: 'name', label: 'Supplier', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        {r.company && <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{r.company}</div>}
      </div>
    )},
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'category', label: 'Category', render: v => <Badge color="purple">{v}</Badge> },
    { key: 'paymentTerms', label: 'Terms', render: v => `Net ${v} days` },
    { key: 'balance', label: 'Balance', align: 'right', render: v => (
      <span style={{ color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--text2)' }}>
        {formatCurrency(v || 0)}
      </span>
    )},
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'active' ? 'green' : 'red'}>{v}</Badge> },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); openEdit(row); }} icon={Edit2}>Edit</Btn>
        <Btn size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(row.id); }} icon={Trash2} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Suppliers" />
      <div style={{ padding: 24 }}>
        <PageHeader
          title="Suppliers"
          subtitle={`${suppliers.length} total suppliers`}
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(suppliers, 'suppliers')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={openNew}>Add Supplier</Btn>,
          ]}
        />

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search suppliers..." />
          </div>
          {loading ? <Loader /> : <Table columns={columns} data={filtered} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} width={640}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Contact Name" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
            <Input label="Company Name" value={form.company} onChange={e => handleChange('company', e.target.value)} />
            <Input label="Email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
            <Input label="City" value={form.city} onChange={e => handleChange('city', e.target.value)} />
            <Select label="Category" value={form.category} onChange={e => handleChange('category', e.target.value)}
              options={[
                { value: 'goods', label: 'Goods' },
                { value: 'services', label: 'Services' },
                { value: 'raw_materials', label: 'Raw Materials' },
                { value: 'logistics', label: 'Logistics' },
              ]} />
            <Input label="Tax ID / NTN" value={form.taxId} onChange={e => handleChange('taxId', e.target.value)} />
            <Select label="Payment Terms" value={form.paymentTerms} onChange={e => handleChange('paymentTerms', e.target.value)}
              options={['0', '15', '30', '45', '60', '90'].map(v => ({ value: v, label: `Net ${v} days` }))} />
            <Input label="Bank Name" value={form.bankName} onChange={e => handleChange('bankName', e.target.value)} />
            <Input label="Bank Account #" value={form.bankAccount} onChange={e => handleChange('bankAccount', e.target.value)} />
          </FormGrid>
          <Input label="Address" value={form.address} onChange={e => handleChange('address', e.target.value)} />
          <Textarea label="Notes" value={form.notes} onChange={e => handleChange('notes', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
