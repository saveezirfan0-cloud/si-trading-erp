// src/pages/inventory/Inventory.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import {
  Table, Btn, Modal, Input, Select, Textarea,
  SearchBar, Badge, PageHeader, FormGrid, Card, Loader, StatCard, Tabs
} from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Download, Package, AlertTriangle } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const EMPTY = {
  code: '', brand: '', name: '', description: '', category: '',
  unit: 'pcs', costPrice: 0, salePrice: 0, quantity: 0,
  reorderLevel: 10, warehouseId: '', supplierId: '',
  taxRate: 0, barcode: '', status: 'active',
};

export default function Inventory() {
  const { formatCurrency } = useApp();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('all');
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [brands, setBrands] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [data, wh, sup, br] = await Promise.all([
      getAll(COLLECTIONS.INVENTORY),
      getAll(COLLECTIONS.WAREHOUSES),
      getAll(COLLECTIONS.SUPPLIERS),
      getAll(COLLECTIONS.BRANDS),
    ]);
    setItems(data);
    setFiltered(data);
    setWarehouses(wh);
    setSuppliers(sup);
    setBrands(br.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let list = items;
    if (tab === 'low') list = items.filter(i => i.quantity > 0 && i.quantity <= i.reorderLevel);
    if (tab === 'out') list = items.filter(i => i.quantity === 0);
    const q = search.toLowerCase();
    setFiltered(list.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.code?.toLowerCase().includes(q) ||
      i.brand?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    ));
  }, [search, items, tab]);

  const openNew = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (item) => { setForm({ ...item }); setEditing(item.id); setModal(true); };
  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name || !form.code) return toast.error('Name and Code are required');
    setSaving(true);
    try {
      if (editing) {
        await update(COLLECTIONS.INVENTORY, editing, form);
        toast.success('Item updated');
      } else {
        await create(COLLECTIONS.INVENTORY, form);
        toast.success('Item added');
      }
      setModal(false);
      load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete item?')) return;
    await remove(COLLECTIONS.INVENTORY, id);
    toast.success('Deleted');
    load();
  };

  const totalValue = items.reduce((s, i) => s + (i.costPrice * i.quantity), 0);
  const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.reorderLevel).length;

  const columns = [
    { key: 'code', label: 'Code', render: v => <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--accent)' }}>{v}</span> },
    { key: 'name', label: 'Item', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.brand}{r.brand && r.category ? ' · ' : ''}{r.category}</div>
      </div>
    )},
    { key: 'unit', label: 'Unit' },
    { key: 'quantity', label: 'Stock', align: 'right', render: (v, r) => (
      <span style={{ color: v === 0 ? 'var(--red)' : v <= r.reorderLevel ? 'var(--accent)' : 'var(--green)', fontWeight: 600 }}>{v}</span>
    )},
    { key: 'costPrice', label: 'Cost', align: 'right', render: v => formatCurrency(v) },
    { key: 'salePrice', label: 'Sale Price', align: 'right', render: v => formatCurrency(v) },
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
      <Header title="Inventory" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Inventory Items"
          subtitle={`${items.length} total items`}
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(items, 'inventory')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={openNew}>Add Item</Btn>,
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard label="Total Items" value={items.length} icon={Package} color="var(--blue)" />
          <StatCard label="Inventory Value" value={formatCurrency(totalValue)} icon={Package} color="var(--accent)" />
          <StatCard label="Low Stock" value={lowStock} icon={AlertTriangle} color="var(--accent)" />
          <StatCard label="Out of Stock" value={items.filter(i => i.quantity === 0).length} icon={AlertTriangle} color="var(--red)" />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search by name, code, brand..." />
          </div>
          <div style={{ padding: '0 16px' }}>
            <Tabs
              tabs={[
                { value: 'all', label: `All (${items.length})` },
                { value: 'low', label: `Low Stock (${lowStock})` },
                { value: 'out', label: `Out of Stock (${items.filter(i => i.quantity === 0).length})` },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>
          {loading ? <Loader /> : <Table columns={columns} data={filtered} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Item' : 'New Inventory Item'} width={680}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={2}>
            <Input label="Item Code *" value={form.code} onChange={e => h('code', e.target.value)} required />
            <Select label="Brand" value={form.brand} onChange={e => h('brand', e.target.value)}
              options={brands.map(b => ({ value: b.name, label: b.name }))} />
            <Input label="Item Name *" value={form.name} onChange={e => h('name', e.target.value)} required />
            <Input label="Category" value={form.category} onChange={e => h('category', e.target.value)} />
            <Select label="Unit" value={form.unit} onChange={e => h('unit', e.target.value)}
              options={['pcs', 'kg', 'g', 'L', 'mL', 'box', 'carton', 'roll', 'm', 'ft', 'set', 'pair']} />
            <Input label="Cost Price (PKR)" type="number" value={form.costPrice} onChange={e => h('costPrice', Number(e.target.value))} />
            <Input label="Sale Price (PKR)" type="number" value={form.salePrice} onChange={e => h('salePrice', Number(e.target.value))} />
            <Input label="Opening Quantity" type="number" value={form.quantity} onChange={e => h('quantity', Number(e.target.value))} />
            <Input label="Reorder Level" type="number" value={form.reorderLevel} onChange={e => h('reorderLevel', Number(e.target.value))} />
            <Input label="Tax Rate (%)" type="number" value={form.taxRate} onChange={e => h('taxRate', Number(e.target.value))} />
            <Input label="Barcode" value={form.barcode} onChange={e => h('barcode', e.target.value)} />
            <Select label="Warehouse" value={form.warehouseId} onChange={e => h('warehouseId', e.target.value)}
              options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
            <Select label="Default Supplier" value={form.supplierId} onChange={e => h('supplierId', e.target.value)}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
            <Select label="Status" value={form.status} onChange={e => h('status', e.target.value)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </FormGrid>
          <Textarea label="Description" value={form.description} onChange={e => h('description', e.target.value)} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
