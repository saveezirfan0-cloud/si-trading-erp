// src/pages/publicDocument.test.js — the only page a customer ever sees, so
// what it shows and what it refuses both matter.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import PublicDocument from './PublicDocument';

// Prefixed with `mock` so jest allows the hoisted factory to reach it.
const mockInvoke = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
  isSupabaseConfigured: true,
}));

beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => mockInvoke.mockReset());

const shared = {
  docType: 'quotation', invoiceNo: 'QT-0001', date: '2026-09-16', dueDate: '2026-10-01',
  customerName: 'Mr. Zaheer', customerCompany: 'ARY Laguna Pvt Ltd', attention: 'Mr Zaheer',
  items: [{ itemName: 'Demolition Hammer', itemCode: 'HP1300-DH', qty: 4, unit: 'pcs', unitPrice: 23000, total: 92000 }],
  subtotal: 92000, discountAmount: 0, taxAmount: 0, total: 92000, paidAmount: 0,
  terms: 'Prices are valid for 15 days.',
};

const open = async (token = 'a'.repeat(32)) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/d/${token}`]}>
        <Routes><Route path="/d/:token" element={<PublicDocument />} /></Routes>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { html: host.innerHTML, cleanup: () => { act(() => root.unmount()); host.remove(); } };
};

test('a shared quotation renders for a customer with no account', async () => {
  mockInvoke.mockResolvedValue({ data: { ok: true, document: shared }, error: null });
  const { html, cleanup } = await open();

  expect(mockInvoke).toHaveBeenCalledWith('share-document', { body: { token: 'a'.repeat(32) } });
  expect(html).toContain('Quotation');
  expect(html).toContain('QT-0001');
  // The company heads the address, the contact sits under it.
  expect(html).toContain('ARY Laguna Pvt Ltd');
  expect(html).toContain('Mr. Zaheer');
  expect(html).toContain('Demolition Hammer');
  expect(html).toContain('Save as PDF');
  expect(html).toContain('Valid until');
  // An offer owes nothing, so no balance is shown.
  expect(html).not.toContain('Balance due');
  // Nothing invites the customer into the business's own app.
  expect(html).not.toContain('Convert to Invoice');
  expect(html).not.toContain('Edit');
  cleanup();
});

test('a revoked or unknown link explains itself and shows nothing', async () => {
  mockInvoke.mockResolvedValue({
    data: null,
    error: { message: 'not found', context: { json: async () => ({ error: 'This link is not valid. It may have been revoked.' }) } },
  });
  const { html, cleanup } = await open('b'.repeat(32));
  expect(html).toContain('This link cannot be opened');
  expect(html).toContain('may have been revoked');
  expect(html).not.toContain('QT-0001');
  cleanup();
});

test('an invoice shows what is still due', async () => {
  mockInvoke.mockResolvedValue({
    data: { ok: true, document: { ...shared, docType: 'invoice', invoiceNo: 'SI-0042', paidAmount: 20000 } },
    error: null,
  });
  const { html, cleanup } = await open();
  expect(html).toContain('SI-0042');
  expect(html).toContain('Balance due');
  expect(html).toContain('Due date');
  cleanup();
});
