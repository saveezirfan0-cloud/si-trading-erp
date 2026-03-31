// src/components/ui/QuickAddModal.js
import React, { useState } from 'react';
import { create, COLLECTIONS } from '../../lib/db';
import { Modal, Input, Select, Btn, FormGrid } from './index';
import toast from 'react-hot-toast';

// Quick Add Customer
export function QuickAddCustomer({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', type: 'retail', status: 'active', balance: 0, country: 'Pakistan' });
  const [saving, setSaving] = useState(false);
  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      const id = await create(COLLECTIONS.CUSTOMERS, form);
      toast.success(`Customer "${form.name}" created`);
      onCreated({ id, ...form });
      onClose();
      setForm({ name: '', phone: '', email: '', city: '', type: 'retail', status: 'active', balance: 0, country: 'Pakistan' });
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Add Customer" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormGrid cols={2}>
          <Input label="Full Name *" value={form.name} onChange={e => h('name', e.target.value)} required />
          <Input label="Phone" value={form.phone} onChange={e => h('phone', e.target.value)} />
          <Input label="Email" value={form.email} onChange={e => h('email', e.target.value)} />
          <Input label="City" value={form.city} onChange={e => h('city', e.target.value)} />
          <Select label="Type" value={form.type} onChange={e => h('type', e.target.value)}
            options={[{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }, { value: 'corporate', label: 'Corporate' }]} />
        </FormGrid>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Creating...' : 'Create Customer'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Quick Add Supplier
export function QuickAddSupplier({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', category: 'goods', status: 'active', balance: 0, country: 'Pakistan', paymentTerms: '30' });
  const [saving, setSaving] = useState(false);
  const h = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.name) return toast.error('Name is required');
    setSaving(true);
    try {
      const id = await create(COLLECTIONS.SUPPLIERS, form);
      toast.success(`Supplier "${form.name}" created`);
      onCreated({ id, ...form });
      onClose();
      setForm({ name: '', phone: '', email: '', city: '', category: 'goods', status: 'active', balance: 0, country: 'Pakistan', paymentTerms: '30' });
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Add Supplier" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormGrid cols={2}>
          <Input label="Name *" value={form.name} onChange={e => h('name', e.target.value)} required />
          <Input label="Phone" value={form.phone} onChange={e => h('phone', e.target.value)} />
          <Input label="Email" value={form.email} onChange={e => h('email', e.target.value)} />
          <Input label="City" value={form.city} onChange={e => h('city', e.target.value)} />
          <Select label="Category" value={form.category} onChange={e => h('category', e.target.value)}
            options={[{ value: 'goods', label: 'Goods' }, { value: 'services', label: 'Services' }, { value: 'raw_materials', label: 'Raw Materials' }]} />
          <Select label="Payment Terms" value={form.paymentTerms} onChange={e => h('paymentTerms', e.target.value)}
            options={['0','15','30','45','60','90'].map(v => ({ value: v, label: `Net ${v} days` }))} />
        </FormGrid>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Creating...' : 'Create Supplier'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
