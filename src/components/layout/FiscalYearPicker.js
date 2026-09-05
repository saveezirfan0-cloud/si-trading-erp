// src/components/layout/FiscalYearPicker.js
//
// Global fiscal-year selector. The chosen year filters every dated list in the
// app (invoices, payments, expenses, journals, dashboard, reports).
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { CalendarRange } from 'lucide-react';

// Offer a sensible span around today; "All years" always available.
const yearOptions = (thisFy) => {
  const years = [];
  for (let y = thisFy + 1; y >= thisFy - 8; y--) years.push(y);
  return years;
};

export default function FiscalYearPicker({ compact = false }) {
  const { fiscalYear, setFiscalYear, thisFiscalYear, fiscalYearLabel } = useApp();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {!compact && (
        <CalendarRange size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
      )}
      <select
        value={fiscalYear}
        onChange={(e) => setFiscalYear(e.target.value)}
        aria-label="Fiscal year"
        title="Filter everything by fiscal year"
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: fiscalYear === 'all' ? 'var(--text2)' : 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '6px 26px 6px 10px',
          minHeight: 34,
          cursor: 'pointer',
        }}
      >
        <option value="all">All years</option>
        {yearOptions(thisFiscalYear).map((y) => (
          <option key={y} value={String(y)}>{fiscalYearLabel(String(y))}</option>
        ))}
      </select>
    </div>
  );
}
