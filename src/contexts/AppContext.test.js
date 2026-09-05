// The fiscal year scopes every dated figure in the app, so the value the
// provider starts on is worth pinning down.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, useApp } from './AppContext';

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});

beforeEach(() => localStorage.clear());

function Probe() {
  const { fiscalYear, currentFiscalYear } = useApp();
  return <span>{`${fiscalYear}|${currentFiscalYear}`}</span>;
}

const readFiscalYear = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<AppProvider><Probe /></AppProvider>); });
  const text = host.textContent;
  act(() => { root.unmount(); });
  host.remove();
  return text.split('|');
};

// July–June is the default, so a date in September belongs to the year ending
// the following June.
const expectedFy = () => {
  const now = new Date();
  return String(now.getMonth() + 1 >= 7 ? now.getFullYear() + 1 : now.getFullYear());
};

test('a fresh install opens on the fiscal year we are trading in', () => {
  const [fiscalYear, current] = readFiscalYear();
  expect(fiscalYear).toBe(expectedFy());
  expect(current).toBe(expectedFy());
});

test('a choice made in this fiscal year is remembered', () => {
  localStorage.setItem('si-fy-choice', JSON.stringify({ value: 'all', madeIn: expectedFy() }));
  expect(readFiscalYear()[0]).toBe('all');
});

test('a choice left over from an earlier fiscal year rolls forward', () => {
  localStorage.setItem('si-fy-choice', JSON.stringify({
    value: String(Number(expectedFy()) - 2), madeIn: String(Number(expectedFy()) - 2),
  }));
  expect(readFiscalYear()[0]).toBe(expectedFy());
});
