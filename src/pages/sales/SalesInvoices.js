// src/pages/sales/SalesInvoices.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { COLLECTIONS, getOne } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/layout/Header';
import { Btn } from '../../components/ui';
import InvoiceListView from '../../components/invoices/InvoiceListView';
import SalesInvoiceForm from './SalesInvoiceForm';
import SalesInvoiceView from './SalesInvoiceView';

export default function SalesInvoices() {
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
      const fresh = await getOne(COLLECTIONS.SALES_INVOICES, selected.id);
      if (fresh) setSelected(fresh);
    } catch (e) { console.warn('could not refresh the invoice', e); }
  };

  if (view === 'form') return (
    <SalesInvoiceForm
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onPreview={(data) => { setSelected(data); setView('preview'); }}
    />
  );
  if (view === 'preview') return (
    <SalesInvoiceView
      invoice={selected}
      onBack={() => { setView('list'); setSelected(null); }}
      onEdit={() => setView('form')}
      onChanged={refreshSelected}
      // A quotation just turned into an invoice: show the invoice.
      onConverted={async (id) => {
        try {
          const fresh = await getOne(COLLECTIONS.SALES_INVOICES, id);
          if (fresh) setSelected(fresh);
        } catch (e) { console.warn('could not open the new invoice', e); }
      }}
    />
  );

  return (
    <>
      <Header title="Sales Invoices" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <InvoiceListView
          kind="sales"
          collection={COLLECTIONS.SALES_INVOICES}
          title="Sales Invoices"
          partyField="customerName"
          partyLabel="Customer"
          accent="var(--accent)"
          badgeColor="blue"
          totalLabel="Total Revenue"
          newLabel="New Invoice"
          exportName="sales_invoices"
          extraActions={can('sales', 'create') ? [
            <Btn key="ai" variant="secondary" icon={Sparkles} onClick={() => navigate('/sales/ai')}>AI Invoice / Quote</Btn>,
          ] : []}
          onNew={() => { setSelected(null); setView('form'); }}
          onEditRow={(row) => { setSelected(row); setView('form'); }}
          onOpenRow={(row) => { setSelected(row); setView('preview'); }}
        />
      </div>
    </>
  );
}
