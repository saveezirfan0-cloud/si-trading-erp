// src/components/layout/FiscalYearPicker.js
//
// Global fiscal-year selector. The chosen year filters every dated list in the
// app (invoices, payments, expenses, journals, bank, dashboard, reports), and
// it opens on the year the business is currently trading in.
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { CalendarRange } from 'lucide-react';

// Offer a sensible span around today; "All years" always available.
const yearOptions = (current) => {
  const thisFy = Number(current) || new Date().getFullYear();
  const years = [];
  for (let y = thisFy + 1; y >= thisFy - 8; y--) years.push(y);
  return years;
};

export default function FiscalYearPicker({ compact = false }) {
  const { fiscalYear, setFiscalYear, fiscalYearLabel, currentFiscalYear } = useApp();
  const isCurrent = fiscalYear === currentFiscalYear;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {!compact && (
        <CalendarRange size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
      )}
      <select
        value={fiscalYear}
        onChange={(e) => setFiscalYear(e.target.value)}
        aria-label="Fiscal year"
        title="Filter everything by fiscal year"
        style={{
          background: isCurrent ? 'var(--accent-glow)' : 'var(--bg3)',
          border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 99,
          color: fiscalYear === 'all' ? 'var(--text2)' : isCurrent ? 'var(--accent)' : 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: compact ? '0.78rem' : '0.82rem',
          fontWeight: 700,
          padding: compact ? '5px 24px 5px 10px' : '6px 26px 6px 12px',
          minHeight: compact ? 34 : 36,
          maxWidth: compact ? 140 : 'none',
          cursor: 'pointer',
          // The header is tight on a phone — the year must not push the title out.
          textOverflow: 'ellipsis',
        }}
      >
        {yearOptions(currentFiscalYear).map((y) => (
          <option key={y} value={String(y)}>
            {/* The phone header has room for the year and nothing else. */}
            {fiscalYearLabel(String(y))}
            {!compact && String(y) === currentFiscalYear ? ' · current' : ''}
          </option>
        ))}
        <option value="all">All years</option>
      </select>
    </div>
  );
}
