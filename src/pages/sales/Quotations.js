// src/pages/sales/Quotations.js
//
// Quotations have their own section: they share the sales table with the
// invoices but they are offers, not sales, so mixing them into the invoice
// list put documents that owe nothing beside documents that do. This page is
// the same list, form and print view scoped to `docType: 'quotation'`.
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

export default function Quotations() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

  const refreshSelected = async () => {
    if (!selected?.id) return;
    try {
      const fresh = await getOne(COLLECTIONS.SALES_INVOICES, selected.id);
      if (fresh) setSelected(fresh);
    } catch (e) { console.warn('could not refresh the quotation', e); }
  };

  if (view === 'form') return (
    <SalesInvoiceForm
      invoice={selected}
      defaultDocType="quotation"
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
      // Accepted: the invoice it became belongs on the invoice list.
      onConverted={() => navigate('/sales')}
    />
  );

  return (
    <>
      <Header title="Quotations" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <InvoiceListView
          kind="sales"
          docType="quotation"
          noun="quotation"
          collection={COLLECTIONS.SALES_INVOICES}
          title="Quotations"
          partyField="customerName"
          partyLabel="Customer"
          accent="var(--purple)"
          badgeColor="purple"
          totalLabel="Total Quoted"
          newLabel="New Quotation"
          exportName="quotations"
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
