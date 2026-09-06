// The bottom bar is the whole navigation on a phone; a bad slot is otherwise
// only visible on a device.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../contexts/AppContext';
import BottomNav from './BottomNav';

// `can(module, action)` is the only thing the bar reads from auth.
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ can: (mod, action) => (mockGrants[mod] || []).includes(action) }),
}));

let mockGrants = {};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AppProvider><MemoryRouter><BottomNav /></MemoryRouter></AppProvider>
    );
  });
  const html = host.innerHTML;
  act(() => { root.unmount(); });
  host.remove();
  return html;
};

test('a full-access user gets menu, scan and new sale', () => {
  mockGrants = { scan: ['view'], sales: ['view', 'create'], purchases: ['view'] };
  const html = render();
  expect(html).toMatch(/aria-label="(Open|Close) menu"/);
  expect(html).toContain('Scan Bill');
  expect(html).toContain('New Sale');
  expect(html).toContain('/purchases/scan');
  expect(html).toContain('/sales/quick');
});

test('without the scan and create rights the slots fall back to the lists', () => {
  mockGrants = { sales: ['view'], purchases: ['view'] };
  const html = render();
  expect(html).toContain('Purchases');
  expect(html).toContain('Sales');
  expect(html).not.toContain('Scan Bill');
});

test('a user with neither module still gets the menu', () => {
  mockGrants = {};
  const html = render();
  expect(html).toMatch(/aria-label="(Open|Close) menu"/);
  expect(html).not.toContain('New Sale');
});
