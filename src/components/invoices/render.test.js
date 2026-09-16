// Render smoke tests: these components take a lot of props from the list page,
// and a bad prop is otherwise only visible in the browser.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../../contexts/AppContext';
import { Table, Chip, FilterSelect } from '../ui';
import InvoiceFilters from './InvoiceFilters';
import InvoiceQuickView from './InvoiceQuickView';
import { EMPTY_FILTERS } from '../../lib/invoices';

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});

const invoice = {
  id: 'x1', invoiceNo: 'PI-0001', date: '2025-01-05', dueDate: '2025-02-05',
  status: 'partial', total: 1200, paidAmount: 400, supplierName: 'Ali Traders',
  supplierInvoiceNo: '77',
  items: [{ itemName: 'Pipe', itemCode: 'P1', qty: 2, unit: 'pcs', unitPrice: 600, total: 1200 }],
  notes: 'Imported from Manager.io (S.I.Trading Co (2023))',
  importedFrom: 'manager.io',
};

const render = (el) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AppProvider>{el}</AppProvider>); });
  const html = host.innerHTML;
  act(() => { root.unmount(); });
  host.remove();
  return html;
};

test('the table renders sortable headers and selection checkboxes', () => {
  const html = render(
    <Table
      columns={[
        { key: 'invoiceNo', label: 'Invoice #', sortable: true },
        { key: 'total', label: 'Total', align: 'right' },
      ]}
      data={[invoice]}
      sort={{ key: 'invoiceNo', dir: 'asc' }}
      onSort={() => {}}
      selectable
      selectedIds={['x1']}
      onSelectionChange={() => {}}
    />
  );
  expect(html).toContain('PI-0001');
  expect(html).toContain('type="checkbox"');
});

test('the filter bar lists the filters that are active', () => {
  const html = render(
    <InvoiceFilters
      filters={{ ...EMPTY_FILTERS, status: 'paid', year: '2025', search: 'ali' }}
      onChange={() => {}}
      onReset={() => {}}
      open
      onToggleOpen={() => {}}
      statusCounts={{ all: 3, paid: 1 }}
      flagCounts={{ overdue: 1 }}
      years={[{ value: '2025', label: '2025' }]}
      parties={['Ali Traders']}
      partyLabel="Supplier"
      sort={{ key: 'date', dir: 'desc' }}
      onSortChange={() => {}}
      showing={1}
      total={3}
    />
  );
  expect(html).toContain('Year: 2025');
  // The chip reads the status's display label, not the stored value.
  expect(html).toContain('Status: Paid');
  expect(html).toContain('Supplier');
});

test('the quick view shows the invoice, its origin and its line items', () => {
  const html = render(
    <InvoiceQuickView
      invoice={invoice}
      collection="erp_purchase_invoices"
      partyField="supplierName"
      partyLabel="Supplier"
      canEdit
      onClose={() => {}}
      onOpenFull={() => {}}
      onEdit={() => {}}
    />
  );
  expect(html).toContain('Ali Traders');
  expect(html).toContain('Imported (Manager.io)');
  expect(html).toContain('S.I.Trading Co (2023)');
  expect(html).toContain('Pipe');
});

test('the quick view names the company, its contact, and stays off payment for a quotation', () => {
  const quotation = {
    id: 'q1', docType: 'quotation', invoiceNo: 'QT-0001', date: '2026-09-16', dueDate: '2026-10-01',
    status: 'draft', customerName: 'ARY Laguna Karachi (Pvt) Ltd', attention: 'Mr Zaheer',
    reference: 'PO-91', items: [{ itemName: 'Demolition Hammer', itemCode: 'HP1300-DH', qty: 4, unit: 'pcs', unitPrice: 23000, total: 92000 }],
    subtotal: 92000, total: 92000, paidAmount: 0, source: 'ai',
  };
  const html = render(
    <InvoiceQuickView
      invoice={quotation}
      collection="erp_sales_invoices"
      partyField="customerName"
      partyLabel="Customer"
      canEdit
      onClose={() => {}}
      onOpenFull={() => {}}
      onEdit={() => {}}
    />
  );
  // The company is the customer; the person is shown as the contact, not instead of it.
  expect(html).toContain('ARY Laguna Karachi (Pvt) Ltd');
  expect(html).toContain('Kind attention');
  expect(html).toContain('Mr Zaheer');
  expect(html).toContain('Reference');
  expect(html).toContain('PO-91');
  // It is a quotation, so it is titled one and owes nothing.
  expect(html).toContain('Quotation QT-0001');
  expect(html).toContain('Valid until');
  expect(html).toContain('Open full quotation');
  expect(html).not.toContain('Balance due');
  expect(html).not.toContain('Mark paid');
  expect(html).not.toContain('Payment method');
});

test('an invoice still shows the payment rows and buttons', () => {
  const html = render(
    <InvoiceQuickView
      invoice={{ ...invoice, docType: 'invoice' }}
      collection="erp_sales_invoices"
      partyField="supplierName"
      partyLabel="Supplier"
      canEdit
      onClose={() => {}}
      onOpenFull={() => {}}
      onEdit={() => {}}
    />
  );
  expect(html).toContain('Invoice PI-0001');
  expect(html).toContain('Balance due');
  expect(html).toContain('Mark paid');
  expect(html).toContain('Due date');
});

test('chips and filter controls render', () => {
  const html = render(
    <>
      <Chip active count={4}>Paid</Chip>
      <FilterSelect label="Source" value="all" onChange={() => {}} options={[{ value: 'all', label: 'Any' }]} />
    </>
  );
  expect(html).toContain('Paid');
  expect(html).toContain('Source');
});
