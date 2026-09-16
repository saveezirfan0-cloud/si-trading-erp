// Render smoke tests for the AI document screen and the quotation view. The
// AI service is mocked as unreachable, which is exactly the path that must
// keep working: the built-in reader takes over and the sales form opens with
// the draft filled in.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../contexts/AppContext';
import AiDocument from './AiDocument';
import SalesInvoiceView from './SalesInvoiceView';

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
    erp_customers: [{ id: 'c1', name: 'Ali Hardware', phone: '021-1' }],
    erp_inventory: [{ id: 'i1', code: 'HP1300', name: 'Makita Demolition Hammer HP1300-DH', unit: 'pcs', salePrice: 22500 }],
    erp_sales_invoices: [{ id: 's1', invoiceNo: 'SI-0007' }, { id: 'q1', invoiceNo: 'QT-0002', docType: 'quotation' }],
  };
  return {
    COLLECTIONS,
    getAll: async (col) => rows[col] || [],
    getOne: async () => null,
    create: async () => 'new-id',
    update: async () => {},
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
  expect(html).toContain('is not in the customer list');
  expect(html).toContain('Add as new customer');
  // Attention and the line came through; the inventory item was linked.
  expect(html).toContain('Mr Zaheer');
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
