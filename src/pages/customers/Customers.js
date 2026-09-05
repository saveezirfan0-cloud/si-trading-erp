// src/pages/customers/Customers.js
import React, { useEffect, useState } from 'react';
import { subscribe, create, update, remove, COLLECTIONS } from '../../lib/db';
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
  country: 'Pakistan', type: 'retail', balance: 0, currency: 'PKR',
  taxId: '', notes: '', status: 'active',
};

export default function Customers() {
  const { formatCurrency } = useApp();
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Real-time listener
  useEffect(() => {
    const unsub = subscribe(COLLECTIONS.CUSTOMERS, (data) => {
      setCustomers(data);
      setFiltered(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    ));
  }, [search, customers]);

  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (c) => { setForm({ ...c }); setEditing(c.id); setModal(true); };
  const handleChange = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSave = async () => {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editing) {
        await update(COLLECTIONS.CUSTOMERS, editing, form);
        toast.success('Customer updated');
      } else {
        await create(COLLECTIONS.CUSTOMERS, form);
        toast.success('Customer added');
      }
      setModal(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save: ' + (e.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Move this customer to the trash? You can restore it from Trash.')) return;
    try {
      await remove(COLLECTIONS.CUSTOMERS, id);
      toast.success('Moved to trash');
    } catch (e) {
      toast.error('Delete failed: ' + e.message);
    }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        {r.company && <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{r.company}</div>}
      </div>
    )},
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'city', label: 'City' },
    { key: 'type', label: 'Type', render: v => <Badge color="blue">{v}</Badge> },
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
      <Header title="Customers" />
      <div style={{ padding: 24 }}>
        <PageHeader
          title="Customers"
          subtitle={`${customers.length} total customers`}
          actions={[
            <Btn key="export" variant="secondary" icon={Download} onClick={() => exportCSV(customers, 'customers')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={openNew}>Add Customer</Btn>,
          ]}
        />

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search customers..." />
          </div>
          {loading ? <Loader /> : <Table columns={columns} data={filtered} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Customer' : 'New Customer'} width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Full Name *" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
            <Input label="Company" value={form.company} onChange={e => handleChange('company', e.target.value)} />
            <Input label="Email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
            <Input label="City" value={form.city} onChange={e => handleChange('city', e.target.value)} />
            <Input label="Country" value={form.country} onChange={e => handleChange('country', e.target.value)} />
            <Select label="Type" value={form.type} onChange={e => handleChange('type', e.target.value)}
              options={[{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }, { value: 'corporate', label: 'Corporate' }]} />
            <Select label="Status" value={form.status} onChange={e => handleChange('status', e.target.value)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            <Input label="Tax ID / NTN" value={form.taxId} onChange={e => handleChange('taxId', e.target.value)} />
            <Input label="Opening Balance (PKR)" type="number" value={form.balance} onChange={e => handleChange('balance', Number(e.target.value))} />
          </FormGrid>
          <Input label="Address" value={form.address} onChange={e => handleChange('address', e.target.value)} />
          <Textarea label="Notes" value={form.notes} onChange={e => handleChange('notes', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
