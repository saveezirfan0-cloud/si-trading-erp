// Render smoke tests for the AI document screen and the quotation view. The
// AI service is mocked as unreachable, which is exactly the path that must
// keep working: the built-in reader takes over and the sales form opens with
// the draft filled in.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../contexts/AppContext';
import AiDocument from './AiDocument';
import SalesInvoiceForm from './SalesInvoiceForm';
import SalesInvoiceView from './SalesInvoiceView';
import SalesInvoices from './SalesInvoices';
import Quotations from './Quotations';

// jest.mock is hoisted above the imports, so the pages get the mocks.
jest.mock('../../lib/supabase', () => {
  const chain = () => {
    const q = {
      select: () => q, insert: () => q, update: () => q, eq: () => q, filter: () => q,
      not: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return q;
  };
  const supabase = {
    from: chain,
    functions: { invoke: async () => ({ data: null, error: new Error('Edge Function not deployed') }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe: () => {} }),
    removeChannel: () => {},
  };
  return { supabase, default: supabase, isSupabaseConfigured: true, SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
});

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { id: 'u1' }, profile: { name: 'Tester' }, permissions: {} }),
}));

jest.mock('../../lib/db', () => {
  const COLLECTIONS = {
    CUSTOMERS: 'erp_customers', INVENTORY: 'erp_inventory', SALES_INVOICES: 'erp_sales_invoices',
    PURCHASE_INVOICES: 'erp_purchase_invoices', ACTIVITY: 'erp_activity',
  };
  const rows = {
    erp_customers: [
      { id: 'c1', name: 'Ali Hardware', phone: '021-1' },
      { id: 'c2', name: 'Mr. Zaheer', company: 'ARY Laguna', phone: '021-9' },
    ],
    erp_inventory: [{ id: 'i1', code: 'HP1300', name: 'Makita Demolition Hammer HP1300-DH', unit: 'pcs', salePrice: 22500 }],
    erp_sales_invoices: [
      {
        id: 's1', invoiceNo: 'SI-0007', date: '2026-09-10', status: 'unpaid',
        customerName: 'Ali Hardware', items: [{ itemName: 'Drill', qty: 1, unitPrice: 5000, total: 5000 }],
        subtotal: 5000, total: 5000, paidAmount: 0,
      },
      {
        id: 'q1', invoiceNo: 'QT-0002', docType: 'quotation', date: '2026-09-12', status: 'draft',
        customerName: 'Mr. Zaheer', customerCompany: 'ARY Laguna', attention: 'Mr Zaheer',
        items: [{ itemName: 'Demolition Hammer', qty: 4, unitPrice: 23000, total: 92000 }],
        subtotal: 92000, total: 92000, paidAmount: 0,
      },
    ],
  };
  return {
    COLLECTIONS,
    getAll: async (col) => rows[col] || [],
    getOne: async () => null,
    create: async () => 'new-id',
    update: async () => {},
    remove: async () => {},
    subscribe: (col, cb) => { cb(rows[col] || []); return () => {}; },
  };
});

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});

const mount = (el) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<MemoryRouter><AppProvider>{el}</AppProvider></MemoryRouter>); });
  return { host, unmount: () => { act(() => { root.unmount(); }); host.remove(); } };
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const setValue = (input, value) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

test('a typed request becomes a quotation draft in the sales form', async () => {
  const { host, unmount } = mount(<AiDocument />);
  expect(host.innerHTML).toContain('Create document');

  const textarea = host.querySelector('textarea');
  act(() => {
    setValue(textarea, `Make a quotation
Name: ARY Laguna Karachi Pvt Ltd
Kind Attention : Mr Zaheer
4 pcs Demolition Hammer HP1300-DH @ 23000/=`);
  });
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Create document'));
  await act(async () => { button.click(); });
  await flush();
  await flush();

  const html = host.innerHTML;
  // The form opened as a new quotation in the QT- sequence, after QT-0002.
  expect(html).toContain('New Quotation');
  expect(html).toContain('QT-0003');
  // The notice says who read it and what to check.
  expect(html).toContain('built-in reader');
  expect(html).toContain('ARY Laguna Karachi Pvt Ltd');
  // "ARY Laguna Karachi Pvt Ltd" is filed under its contact's name, and is
  // found by its company, so the document links to that record.
  expect(html).toContain('was matched to the customer');
  expect(host.querySelector('input[value="ARY Laguna"]')).not.toBeNull();
  // Attention and the line came through; the inventory item was linked.
  expect(html).toContain('Mr Zaheer');
  expect(html).toContain('Mr. Zaheer');
  expect(html).toContain('HP1300');
  expect(html).toContain('23000');
  unmount();
});

test('a quotation prints as one, with the contact and no balance due', async () => {
  const quotation = {
    id: 'q1', docType: 'quotation', invoiceNo: 'QT-0002', date: '2026-09-16', dueDate: '2026-10-01',
    status: 'draft', customerName: 'ARY Laguna', attention: 'Mr Zaheer',
    items: [{ itemName: 'Demolition Hammer', qty: 4, unit: 'pcs', unitPrice: 23000, total: 92000 }],
    subtotal: 92000, total: 92000, paidAmount: 1000,
  };
  const { host, unmount } = mount(<SalesInvoiceView invoice={quotation} onBack={() => {}} onEdit={() => {}} />);
  await flush();
  const html = host.innerHTML;
  expect(html).toContain('Quotation — QT-0002');
  expect(html).toContain('Quotation For');
  expect(html).toContain('Kind Attention: Mr Zaheer');
  expect(html).toContain('Valid Until');
  expect(html).toContain('Convert to Invoice');
  expect(html).not.toContain('Balance Due');
  expect(html).not.toContain('Payment Method');
  unmount();
});

test('the customer box is searchable instead of a long dropdown', async () => {
  const { host, unmount } = mount(<SalesInvoiceForm invoice={null} onBack={() => {}} />);
  await flush();

  // No native <select> of every customer any more.
  const selects = [...host.querySelectorAll('select')];
  expect(selects.some((el) => el.innerHTML.includes('Ali Hardware'))).toBe(false);

  // The picker opens a search box listing the customers by name and company.
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Select customer'));
  expect(button).toBeTruthy();
  await act(async () => { button.click(); });

  const search = [...document.querySelectorAll('input')].find((i) => (i.placeholder || '').startsWith('Search by name'));
  expect(search).toBeTruthy();
  expect(document.body.textContent).toContain('Ali Hardware');

  // Searching by the company finds a customer filed under a person's name.
  act(() => { setValue(search, 'laguna'); });
  expect(document.body.textContent).toContain('Mr. Zaheer');
  expect(document.body.textContent).not.toContain('Ali Hardware');
  unmount();
});

test('a company nobody has on file is offered as a new customer', async () => {
  const { host, unmount } = mount(<AiDocument />);
  act(() => {
    setValue(host.querySelector('textarea'), `Quotation
Name: Brand New Traders
Kind Attention: Mr Kamran
2 pcs Angle Grinder 9 inch @ 8000`);
  });
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Create document'));
  await act(async () => { button.click(); });
  await flush();
  await flush();

  const html = host.innerHTML;
  expect(html).toContain('is not in the customer list');
  expect(html).toContain('Add as new customer');
  // The business is the company and the contact is the person, which is the
  // shape the customer is then filed under.
  expect(host.querySelector('input[value="Brand New Traders"]')).not.toBeNull();
  expect(host.querySelector('input[value="Mr Kamran"]')).not.toBeNull();
  unmount();
});

test('a quotation form offers no payment, an invoice does', async () => {
  const quote = mount(<SalesInvoiceForm invoice={{ docType: 'quotation', invoiceNo: 'QT-9', items: [] }} onBack={() => {}} />);
  await flush();
  expect(quote.host.innerHTML).toContain('Save Quotation');
  expect(quote.host.innerHTML).not.toContain('Mark as Paid');
  expect(quote.host.innerHTML).not.toContain('Amount Paid');
  quote.unmount();

  const bill = mount(<SalesInvoiceForm invoice={{ docType: 'invoice', invoiceNo: 'SI-9', items: [] }} onBack={() => {}} />);
  await flush();
  expect(bill.host.innerHTML).toContain('Save Invoice');
  expect(bill.host.innerHTML).toContain('Mark as Paid');
  expect(bill.host.innerHTML).toContain('Amount Paid');
  bill.unmount();
});

test('the two sections keep invoices and quotations apart', async () => {
  const quotes = mount(<Quotations />);
  await flush();
  const qHtml = quotes.host.innerHTML;
  expect(qHtml).toContain('QT-0002');
  expect(qHtml).not.toContain('SI-0007');
  // A quotation is measured by what was offered, not by revenue owed.
  expect(qHtml).toContain('Total Quoted');
  expect(qHtml).toContain('Converted to invoice');
  expect(qHtml).not.toContain('Outstanding');
  expect(qHtml).toContain('1 of 1 quotation');
  // The company heads the row, with the person under it.
  expect(qHtml).toContain('ARY Laguna');
  quotes.unmount();

  const bills = mount(<SalesInvoices />);
  await flush();
  const iHtml = bills.host.innerHTML;
  expect(iHtml).toContain('SI-0007');
  expect(iHtml).not.toContain('QT-0002');
  expect(iHtml).toContain('Total Revenue');
  expect(iHtml).toContain('1 of 1 invoice');
  bills.unmount();
});
