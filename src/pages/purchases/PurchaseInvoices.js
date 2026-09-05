// src/pages/purchases/PurchaseInvoices.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COLLECTIONS, getOne } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/layout/Header';
import { Btn } from '../../components/ui';
import { Camera } from 'lucide-react';
import InvoiceListView from '../../components/invoices/InvoiceListView';
import PurchaseInvoiceForm from './PurchaseInvoiceForm';
import PurchaseInvoiceView from './PurchaseInvoiceView';

export default function PurchaseInvoices() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

  // An approval or an attachment saved from the detail view changes the record
  // underneath it, so pull the row back rather than leaving the snapshot the
  // list handed over.
  const refreshSelected = async () => {
    if (!selected?.id) return;
    try {
      const fresh = await getOne(COLLECTIONS.PURCHASE_INVOICES, selected.id);
      if (fresh) setSelected(fresh);
    } catch (e) { console.warn('could not refresh the invoice', e); }
  };

  if (view === 'form') return (
    <PurchaseInvoiceForm
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onPreview={(data) => { setSelected(data); setView('preview'); }}
    />
  );
  if (view === 'preview') return (
    <PurchaseInvoiceView
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onEdit={() => setView('form')}
      onChanged={refreshSelected}
    />
  );

  return (
    <>
      <Header title="Purchase Invoices" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <InvoiceListView
          kind="purchase"
          collection={COLLECTIONS.PURCHASE_INVOICES}
          title="Purchase Invoices"
          partyField="supplierName"
          partyLabel="Supplier"
          accent="var(--purple)"
          badgeColor="purple"
          totalLabel="Total Purchases"
          newLabel="New Purchase"
          exportName="purchase_invoices"
          extraActions={can('scan', 'create') ? [
            <Btn key="scan" variant="secondary" icon={Camera} onClick={() => navigate('/purchases/scan')}>Scan Invoice</Btn>,
          ] : []}
          onNew={() => { setSelected(null); setView('form'); }}
          onEditRow={(row) => { setSelected(row); setView('form'); }}
          onOpenRow={(row) => { setSelected(row); setView('preview'); }}
        />
      </div>
    </>
  );
}
