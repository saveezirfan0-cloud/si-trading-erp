// src/pages/warehouses/Warehouses.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Textarea, Badge, PageHeader, FormGrid, Card, Loader } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Warehouse } from 'lucide-react';

const EMPTY = { name: '', code: '', address: '', city: '', manager: '', phone: '', capacity: '', type: 'main', status: 'active', notes: '' };

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setWarehouses(await getAll(COLLECTIONS.WAREHOUSES));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (w) => { setForm({ ...w }); setEditing(w.id); setModal(true); };
  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name) return toast.error('Name required');
    setSaving(true);
    try {
      if (editing) { await update(COLLECTIONS.WAREHOUSES, editing, form); toast.success('Updated'); }
      else { await create(COLLECTIONS.WAREHOUSES, form); toast.success('Created'); }
      setModal(false); load();
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return;
    try {
      await remove(COLLECTIONS.WAREHOUSES, id);
      toast.success('Deleted'); load();
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  };

  const columns = [
    { key: 'name', label: 'Warehouse', render: (v, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <Warehouse size={15} />
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.code}</div>
        </div>
      </div>
    )},
    { key: 'city', label: 'City' },
    { key: 'manager', label: 'Manager' },
    { key: 'phone', label: 'Phone' },
    { key: 'type', label: 'Type', render: v => <Badge color="blue">{v}</Badge> },
    { key: 'capacity', label: 'Capacity' },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'active' ? 'green' : 'red'}>{v}</Badge> },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={Edit2} onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Btn>
        <Btn size="sm" variant="danger" icon={Trash2} onClick={e => { e.stopPropagation(); handleDelete(row.id); }} />
      </div>
    )},
  ];

  return (
    <>
      <Header title="Warehouses" />
      <div style={{ padding: 24 }}>
        <PageHeader
          title="Warehouses"
          subtitle={`${warehouses.length} locations`}
          actions={[<Btn key="add" icon={Plus} onClick={openNew}>Add Warehouse</Btn>]}
        />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <Loader /> : <Table columns={columns} data={warehouses} />}
        </Card>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Warehouse' : 'New Warehouse'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Warehouse Name *" value={form.name} onChange={e => h('name', e.target.value)} required />
            <Input label="Code" value={form.code} onChange={e => h('code', e.target.value)} />
            <Input label="City" value={form.city} onChange={e => h('city', e.target.value)} />
            <Select label="Type" value={form.type} onChange={e => h('type', e.target.value)}
              options={[{ value: 'main', label: 'Main' }, { value: 'transit', label: 'Transit' }, { value: 'cold', label: 'Cold Storage' }]} />
            <Input label="Manager" value={form.manager} onChange={e => h('manager', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={e => h('phone', e.target.value)} />
            <Input label="Capacity" value={form.capacity} onChange={e => h('capacity', e.target.value)} placeholder="e.g. 5000 sq ft" />
            <Select label="Status" value={form.status} onChange={e => h('status', e.target.value)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </FormGrid>
          <Input label="Address" value={form.address} onChange={e => h('address', e.target.value)} />
          <Textarea label="Notes" value={form.notes} onChange={e => h('notes', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
