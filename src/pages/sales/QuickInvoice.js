// src/pages/sales/QuickInvoice.js
// Lightweight quick invoice creator — accessible from sidebar or dashboard
import React, { useEffect, useState } from 'react';
import { create, getAll, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Input, Select, Card, FormGrid } from '../../components/ui';
import { QuickAddCustomer } from '../../components/ui/QuickAddModal';
import toast from 'react-hot-toast';
import { Plus, Save, UserPlus, ArrowLeft, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const EMPTY_LINE = { itemId: '', itemCode: '', itemName: '', qty: 1, unit: 'pcs', unitPrice: 0, isCustom: false };

const nextInvoiceNo = (existing) => {
  const nums = existing.map(i => parseInt((i.invoiceNo || 'SI-0').split('-')[1])).filter(Boolean);
  return `SI-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
};

export default function QuickInvoice() {
  const { formatCurrency } = useApp();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('SI-0001');

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('unpaid');

  useEffect(() => {
    const load = async () => {
      const [c, inv, si] = await Promise.all([
        getAll(COLLECTIONS.CUSTOMERS),
        getAll(COLLECTIONS.INVENTORY),
        // Trashed invoices count too: a restored invoice must not collide
        // with a number handed out while it sat in the trash.
        getAll(COLLECTIONS.SALES_INVOICES, [], { includeDeleted: true }),
      ]);
      setCustomers(c);
      setInventory(inv);
      setInvoiceNo(nextInvoiceNo(si));
    };
    load();
  }, []);

  const selectCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    setCustomerId(id);
    setCustomerName(c?.name || '');
    setCustomerPhone(c?.phone || '');
  };

  const handleCustomerCreated = (c) => {
    setCustomers(prev => [...prev, c]);
    selectCustomer(c.id);
  };

  const updateLine = (idx, field, val) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (field === 'itemId' && val) {
        const item = inventory.find(i => i.id === val);
        if (item) {
          next[idx] = { ...next[idx], itemId: val, itemCode: item.code || '', itemName: item.name || '', unit: item.unit || 'pcs', unitPrice: item.salePrice || 0, isCustom: false };
        }
      }
      return next;
    });
  };

  const toggleCustom = (idx) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...EMPTY_LINE, isCustom: !next[idx].isCustom };
      return next;
    });
  };

  const addLine = () => setLines(p => [...p, { ...EMPTY_LINE }]);
  const removeLine = (idx) => setLines(p => p.filter((_, i) => i !== idx));

  const calcTotal = (line) => (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
  const grandTotal = lines.reduce((s, l) => s + calcTotal(l), 0);

  const handleSave = async (saveStatus = status) => {
    if (!customerId) return toast.error('Select a customer');
    if (!lines[0].itemName) return toast.error('Add at least one item');
    setSaving(true);
    try {
      const items = lines.map(l => ({ ...l, total: calcTotal(l) }));
      const subtotal = grandTotal;
      await create(COLLECTIONS.SALES_INVOICES, {
        invoiceNo, date, customerId, customerName, customerPhone,
        status: saveStatus, items, subtotal, discountAmount: 0,
        taxAmount: 0, total: grandTotal, paidAmount: 0, notes,
        terms: 'Payment due within 30 days.',
      });
      toast.success(`Invoice ${invoiceNo} created!`);
      navigate('/sales');
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  const cs = { padding: '5px 7px' };
  const ci = (val, onChange, type = 'text', placeholder = '') => (
    <input type={type} value={val} onChange={onChange} placeholder={placeholder}
      style={{ width: '100%', padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)' }} />
  );

  return (
    <>
      <Header title="Quick Invoice" />
      <div className="page-pad" style={{ padding: 24, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Top */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn variant="ghost" icon={ArrowLeft} onClick={() => navigate('/sales')}>Back</Btn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="var(--accent)" />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem' }}>Quick Sales Invoice</span>
          </div>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" onClick={() => handleSave('draft')} disabled={saving}>Save Draft</Btn>
          <Btn variant="success" onClick={() => handleSave('paid')} disabled={saving}>Mark Paid & Save</Btn>
          <Btn icon={Save} onClick={() => handleSave('unpaid')} disabled={saving}>{saving ? 'Saving...' : 'Save Invoice'}</Btn>
        </div>

        {/* Invoice meta */}
        <Card>
          <FormGrid cols={3}>
            <Input label="Invoice No." value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
            <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            <Select label="Status" value={status} onChange={e => setStatus(e.target.value)}
              options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }, { value: 'draft', label: 'Draft' }]} />
          </FormGrid>
        </Card>

        {/* Customer */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Select label="Customer *" value={customerId} onChange={e => selectCustomer(e.target.value)}
                options={customers.map(c => ({ value: c.id, label: c.name }))} />
            </div>
            <Btn variant="secondary" icon={UserPlus} onClick={() => setShowQuickCustomer(true)} style={{ marginBottom: 0, height: 38 }}>
              New
            </Btn>
          </div>
          {customerName && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: '13px', color: 'var(--text2)' }}>
              <strong style={{ color: 'var(--text)' }}>{customerName}</strong>
              {customerPhone && <span style={{ marginLeft: 12 }}>{customerPhone}</span>}
            </div>
          )}
        </Card>

        {/* Line Items */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Items
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Item / Description', 'Code', 'Qty', 'Unit', 'Price (PKR)', 'Total', ''].map((h, i) => (
                    <th key={i} style={{ padding: '8px', fontSize: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: i > 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...cs, width: 28, color: 'var(--text3)', fontSize: '12px' }}>{idx + 1}</td>

                    {/* Item selector or custom input */}
                    <td style={{ ...cs, minWidth: 200 }}>
                      {line.isCustom ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ci(line.itemName, e => updateLine(idx, 'itemName', e.target.value), 'text', 'Item description')}
                          <button onClick={() => toggleCustom(idx)} title="Switch to inventory" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--accent)', padding: '3px 6px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            📦
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <select value={line.itemId} onChange={e => updateLine(idx, 'itemId', e.target.value)}
                            style={{ flex: 1, padding: '5px 7px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '13px' }}>
                            <option value="">Select item...</option>
                            {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                          <button onClick={() => toggleCustom(idx)} title="Enter custom item" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text3)', padding: '3px 6px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>

                    <td style={{ ...cs, width: 90 }}>{ci(line.itemCode, e => updateLine(idx, 'itemCode', e.target.value), 'text', 'Code')}</td>
                    <td style={{ ...cs, width: 65 }}>{ci(line.qty, e => updateLine(idx, 'qty', e.target.value), 'number')}</td>
                    <td style={{ ...cs, width: 65 }}>{ci(line.unit, e => updateLine(idx, 'unit', e.target.value))}</td>
                    <td style={{ ...cs, width: 110 }}>{ci(line.unitPrice, e => updateLine(idx, 'unitPrice', e.target.value), 'number')}</td>
                    <td style={{ ...cs, width: 110, textAlign: 'right', fontWeight: 600, fontSize: '13px' }}>{formatCurrency(calcTotal(line))}</td>
                    <td style={{ ...cs, width: 32 }}>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(idx)} style={{ background: 'none', color: 'var(--red)', fontSize: '1.1rem', padding: '2px 4px' }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Btn variant="ghost" size="sm" icon={Plus} onClick={addLine}>Add Line</Btn>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>
              Total: <span style={{ color: 'var(--accent)' }}>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes for this invoice..."
            style={{ width: '100%', padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '13px', resize: 'vertical' }} />
        </Card>

      </div>

      <QuickAddCustomer open={showQuickCustomer} onClose={() => setShowQuickCustomer(false)} onCreated={handleCustomerCreated} />
    </>
  );
}
