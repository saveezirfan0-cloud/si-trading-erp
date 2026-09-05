// src/pages/sales/SalesInvoices.js
import React, { useState } from 'react';
import { COLLECTIONS } from '../../lib/db';
import Header from '../../components/layout/Header';
import InvoiceListView from '../../components/invoices/InvoiceListView';
import SalesInvoiceForm from './SalesInvoiceForm';
import SalesInvoiceView from './SalesInvoiceView';

export default function SalesInvoices() {
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

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
    />
  );

  return (
    <>
      <Header title="Sales Invoices" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
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
          onNew={() => { setSelected(null); setView('form'); }}
          onEditRow={(row) => { setSelected(row); setView('form'); }}
          onOpenRow={(row) => { setSelected(row); setView('preview'); }}
        />
      </div>
    </>
  );
}
