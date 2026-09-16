// src/pages/sales/SalesInvoiceForm.js
import React, { useEffect, useState } from 'react';
import { create, update, getAll, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Btn, Input, Select, Textarea, Card, FormGrid, ItemPicker, RecordMeta } from '../../components/ui';
import { STATUS_OPTIONS, approvalPatch } from '../../lib/invoiceStatus';
import {
  DOC_TYPE_OPTIONS, DEFAULT_TERMS, docLabel, docPrefix, isQuotation, nextDocNo, calcLine, calcTotals,
} from '../../lib/salesDocs';
import { getCurrentActor } from '../../lib/audit';
import { QuickAddCustomer } from '../../components/ui/QuickAddModal';
import toast from 'react-hot-toast';
import { Plus, ArrowLeft, Save, Eye, UserPlus } from 'lucide-react';

const EMPTY_LINE = { itemId: '', itemCode: '', itemName: '', description: '', qty: 1, unit: 'pcs', unitPrice: 0, discount: 0, taxRate: 0, total: 0, isCustom: false };

// One form for both sales documents. `invoice` is the record to edit; a
// record without an id (the AI document screen hands one over) is a draft to
// review and create. `onSaved` runs after a save (default: `onBack`), and
// `notice` is rendered above the form — the AI screen uses it to say what it
// read and what needs checking.
export default function SalesInvoiceForm({ invoice, onBack, onPreview, onSaved, notice }) {
  const { formatCurrency } = useApp();
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  // Every sales document, trash included, for numbering.
  const [existing, setExisting] = useState([]);
  const [saving, setSaving] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);

  const [form, setForm] = useState({
    docType: 'invoice',
    invoiceNo: '', date: new Date().toISOString().split('T')[0],
    dueDate: '', customerId: '', customerName: '', customerAddress: '', customerPhone: '',
    attention: '', reference: '',
    status: 'unpaid', paymentMethod: '',
    notes: '', terms: DEFAULT_TERMS.invoice,
    items: [{ ...EMPTY_LINE }],
    subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0, paidAmount: 0, currency: 'PKR',
  });
  const isQuote = isQuotation(form);

  useEffect(() => {
    const load = async () => {
      // Invoice numbering counts trashed invoices too, so a restored invoice
      // cannot collide with a number handed out while it sat in the trash.
      const [c, inv, si] = await Promise.all([getAll(COLLECTIONS.CUSTOMERS), getAll(COLLECTIONS.INVENTORY), getAll(COLLECTIONS.SALES_INVOICES, [], { includeDeleted: true })]);
      setCustomers(c); setInventory(inv); setExisting(si);
      if (invoice) setForm(f => ({ ...f, ...invoice }));
      else setForm(f => ({ ...f, invoiceNo: nextDocNo(si, docPrefix(f.docType)) }));
    };
    load();
  }, [invoice]);

  // Switching between invoice and quotation moves the document to the other
  // numbering sequence and swaps the default footer wording; an existing
  // record keeps its number, and hand-written terms are left alone.
  const setDocType = (docType) => setForm(f => ({
    ...f,
    docType,
    invoiceNo: invoice?.id ? f.invoiceNo : nextDocNo(existing, docPrefix(docType)),
    terms: !f.terms || f.terms === DEFAULT_TERMS[f.docType] ? DEFAULT_TERMS[docType] : f.terms,
    status: docType === 'quotation' && f.status === 'unpaid' ? 'draft' : f.status,
  }));

  // A name that came from the AI reader (or was typed) but matches nobody in
  // the customer list: one click makes the customer, no retyping.
  const addNamedCustomer = async () => {
    const name = (form.customerName || '').trim();
    if (!name) return;
    setAddingCustomer(true);
    try {
      const data = {
        name, phone: form.customerPhone || '', address: form.customerAddress || '',
        contactPerson: form.attention || '', email: '', city: '', type: 'retail',
        status: 'active', balance: 0, country: 'Pakistan',
      };
      const id = await create(COLLECTIONS.CUSTOMERS, data);
      handleCustomerCreated({ id, ...data });
      toast.success(`Customer "${name}" added`);
    } catch (e) { toast.error('Could not add the customer: ' + e.message); }
    setAddingCustomer(false);
  };

  const setCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    if (c) setForm(f => ({ ...f, customerId: id, customerName: c.name, customerAddress: c.address || '', customerPhone: c.phone || '' }));
  };

  const handleCustomerCreated = (c) => {
    setCustomers(prev => [...prev, c]);
    setCustomer(c.id);
  };

  const toggleCustomLine = (idx) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...EMPTY_LINE, isCustom: !items[idx].isCustom };
      return { ...f, items };
    });
  };

  const setItemFromInventory = (lineIdx, itemId) => {
    const item = inventory.find(x => x.id === itemId);
    if (!item) return;
    updateLine(lineIdx, { itemId, itemCode: item.code || '', itemName: item.name || '', description: item.description || '', unit: item.unit || 'pcs', unitPrice: item.salePrice || 0, taxRate: item.taxRate || 0, qty: 1, isCustom: false });
  };

  const updateLine = (idx, changes) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = calcLine({ ...items[idx], ...changes });
      return { ...f, items, ...calcTotals(items) };
    });
  };

  const addLine = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_LINE }] }));
  const removeLine = (idx) => setForm(f => {
    const items = f.items.filter((_, i) => i !== idx);
    return { ...f, items, ...calcTotals(items) };
  });

  const handleSave = async (status = form.status) => {
    if (!form.customerId) return toast.error('Please select a customer');
    if (!form.items.length || !form.items[0].itemName) return toast.error('Add at least one item');
    setSaving(true);
    try {
      // Moving into (or back out of) review carries the approval stamps with it.
      const data = { ...form, status, ...approvalPatch(status, getCurrentActor()) };
      const label = docLabel(form);
      if (invoice?.id) { await update(COLLECTIONS.SALES_INVOICES, invoice.id, data); toast.success(`${label} updated`); }
      else { await create(COLLECTIONS.SALES_INVOICES, data); toast.success(`${label} ${form.invoiceNo} created`); }
      (onSaved || onBack)();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    setSaving(false);
  };

  const cs = { padding: '6px 8px' };
  const ci = (val, onChange, type = 'text', placeholder = '') => (
    <input type={type} value={val} onChange={onChange} placeholder={placeholder}
      style={{ width: '100%', padding: '5px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-body)' }} />
  );

  return (
    <>
      <Header title={invoice?.id ? `Edit — ${form.invoiceNo}` : `New ${docLabel(form)}`} />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>

        <div className="toolbar">
          <Btn variant="ghost" icon={ArrowLeft} onClick={onBack}>Back</Btn>
          <div className="toolbar-spacer" />
          <div className="toolbar-actions">
          <Btn variant="secondary" onClick={() => handleSave('draft')} disabled={saving}>Save as Draft</Btn>
          {onPreview && <Btn variant="secondary" icon={Eye} onClick={() => onPreview(form)} disabled={saving}>Preview</Btn>}
          <Btn icon={Save} onClick={() => handleSave()} disabled={saving}>{saving ? 'Saving…' : invoice ? 'Update' : 'Save'}</Btn>
          </div>
        </div>

        {notice}

        {/* Who raised this and who touched it last */}
        {invoice?.id && <RecordMeta record={invoice} />}

        <div className="g-main" style={{ gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Invoice meta */}
            <Card>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isQuote ? 'Quotation' : 'Invoice'} Details</div>
              <FormGrid cols={2}>
                <Select label="Document Type" value={form.docType || 'invoice'} onChange={e => setDocType(e.target.value)}
                  options={DOC_TYPE_OPTIONS} />
                <Input label={isQuote ? 'Quotation No.' : 'Invoice No.'} value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} />
                <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                <Input label={isQuote ? 'Valid Until' : 'Due Date'} type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  options={STATUS_OPTIONS} />
                <Input label="Reference / PO No." value={form.reference || ''} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Customer's PO or reference" />
              </FormGrid>
            </Card>

            {/* Customer with Quick Add */}
            <Card>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bill To</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <Select label="Customer *" value={form.customerId} onChange={e => setCustomer(e.target.value)}
                    options={customers.map(c => ({ value: c.id, label: c.name }))} />
                </div>
                <Btn variant="secondary" icon={UserPlus} onClick={() => setShowQuickCustomer(true)} style={{ height: 38, whiteSpace: 'nowrap' }}>
                  + New
                </Btn>
              </div>
              {form.customerName && !form.customerId && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: '13px' }}>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <strong>{form.customerName}</strong> is not in the customer list — pick an existing customer above, or
                  </span>
                  <Btn size="sm" variant="secondary" icon={UserPlus} onClick={addNamedCustomer} disabled={addingCustomer}>
                    {addingCustomer ? 'Adding…' : 'Add as new customer'}
                  </Btn>
                </div>
              )}
              {form.customerName && (
                <FormGrid cols={2}>
                  <Input label="Kind Attention" value={form.attention || ''} onChange={e => setForm(f => ({ ...f, attention: e.target.value }))} placeholder="Contact person, e.g. Mr Zaheer" />
                  <Input label="Phone" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
                  <Input label="Address" value={form.customerAddress} onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))} />
                </FormGrid>
              )}
            </Card>

            {/* Line Items */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Use 📦 for inventory • ✏️ for custom item</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Item', 'Desc', 'Qty', 'Unit', 'Price', 'Disc%', 'Tax%', 'Total', ''].map((h, i) => (
                        <th key={i} style={{ padding: '9px 8px', fontSize: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: i > 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...cs, color: 'var(--text3)', fontSize: '12px', width: 28 }}>{idx + 1}</td>
                        <td style={{ ...cs, minWidth: 180 }}>
                          {line.isCustom ? (
                            <div style={{ display: 'flex', gap: 3 }}>
                              {ci(line.itemName, e => updateLine(idx, { itemName: e.target.value }), 'text', 'Item name')}
                              <button onClick={() => toggleCustomLine(idx)} title="Switch to inventory lookup" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--accent)', padding: '3px 6px', fontSize: '12px', cursor: 'pointer' }}>📦</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 3 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <ItemPicker
                                  items={inventory}
                                  value={line.itemId}
                                  onChange={(v) => setItemFromInventory(idx, v)}
                                  emptyLabel="Select item"
                                  placeholder="Search by name, code, SKU, barcode…"
                                />
                              </div>
                              <button onClick={() => toggleCustomLine(idx)} title="Enter custom item" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text3)', padding: '3px 6px', fontSize: '12px', cursor: 'pointer' }}>✏️</button>
                            </div>
                          )}
                        </td>
                        <td style={{ ...cs, minWidth: 120 }}>{ci(line.description, e => updateLine(idx, { description: e.target.value }), 'text', 'Description')}</td>
                        <td style={{ ...cs, width: 60 }}>{ci(line.qty, e => updateLine(idx, { qty: e.target.value }), 'number')}</td>
                        <td style={{ ...cs, width: 55 }}>{ci(line.unit, e => updateLine(idx, { unit: e.target.value }))}</td>
                        <td style={{ ...cs, width: 100 }}>{ci(line.unitPrice, e => updateLine(idx, { unitPrice: e.target.value }), 'number')}</td>
                        <td style={{ ...cs, width: 55 }}>{ci(line.discount, e => updateLine(idx, { discount: e.target.value }), 'number')}</td>
                        <td style={{ ...cs, width: 55 }}>{ci(line.taxRate, e => updateLine(idx, { taxRate: e.target.value }), 'number')}</td>
                        <td style={{ ...cs, width: 100, textAlign: 'right', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>{formatCurrency(line.total || 0)}</td>
                        <td style={{ ...cs, width: 32 }}>
                          {form.items.length > 1 && (
                            <button onClick={() => removeLine(idx)} style={{ background: 'none', color: 'var(--red)', fontSize: '1.1rem', lineHeight: 1, padding: '2px 4px' }}>×</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                <Btn variant="ghost" size="sm" icon={Plus} onClick={addLine}>Add Line</Btn>
              </div>
            </Card>

            <Card>
              <FormGrid cols={2}>
                <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Notes for the customer..." />
                <Textarea label="Terms & Conditions" value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} rows={3} />
              </FormGrid>
            </Card>
          </div>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 16, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Subtotal', value: formatCurrency(form.subtotal) },
                  { label: 'Discount', value: `− ${formatCurrency(form.discountAmount)}`, color: 'var(--red)' },
                  { label: 'Tax', value: `+ ${formatCurrency(form.taxAmount)}`, color: 'var(--blue)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text2)' }}>{r.label}</span>
                    <span style={{ color: r.color || 'var(--text)' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem' }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--accent)' }}>{formatCurrency(form.total)}</span>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Select label="Payment Method" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  options={[{ value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'online', label: 'Online' }]} />
                <Input label="Amount Paid (PKR)" type="number" value={form.paidAmount} onChange={e => setForm(f => ({ ...f, paidAmount: Number(e.target.value) }))} />
                {form.total > 0 && (
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text2)' }}>Balance Due</span>
                      <span style={{ fontWeight: 700, color: (form.total - form.paidAmount) > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {formatCurrency(form.total - (form.paidAmount || 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', marginBottom: 14, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn icon={Save} onClick={() => handleSave()} disabled={saving} style={{ justifyContent: 'center', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 8, padding: '10px' }}>Save Invoice</Btn>
                <Btn variant="success" onClick={() => handleSave('paid')} disabled={saving} style={{ justifyContent: 'center' }}>Mark as Paid</Btn>
                <Btn variant="secondary" onClick={() => handleSave('pending_review')} disabled={saving} style={{ justifyContent: 'center' }}>Submit for Review</Btn>
                <Btn variant="secondary" onClick={() => handleSave('draft')} disabled={saving} style={{ justifyContent: 'center' }}>Save as Draft</Btn>
                {onPreview && <Btn variant="secondary" icon={Eye} onClick={() => onPreview(form)} style={{ justifyContent: 'center' }}>Preview & Print</Btn>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <QuickAddCustomer open={showQuickCustomer} onClose={() => setShowQuickCustomer(false)} onCreated={handleCustomerCreated} />
    </>
  );
}
