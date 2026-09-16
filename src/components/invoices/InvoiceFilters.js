// src/components/invoices/InvoiceFilters.js
//
// The filter/sort bar shared by the sales and purchase invoice lists. It is a
// controlled component: the page owns `filters` and this only reports changes.
import React from 'react';
import {
  SearchBar, Chip, Btn, FilterSelect, FilterInput, Badge,
} from '../ui';
import { useApp } from '../../contexts/AppContext';
import { SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import {
  SOURCES, MONTHS, SORT_OPTIONS, EMPTY_FILTERS, activeFilterCount,
} from '../../lib/invoices';
import { INVOICE_STATUSES, statusLabel } from '../../lib/invoiceStatus';
import { DOC_TYPES } from '../../lib/salesDocs';

// In workflow order — draft, review, approved, then the payment states — so the
// chips read as the path an invoice takes.
const STATUSES = INVOICE_STATUSES.map(s => s.value);

const FLAGS = [
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'duesoon', label: 'Due in 7 days' },
  { value: 'issues', label: 'Needs attention' },
];

// Human-readable summary of one active filter, for the removable chips.
const describe = (key, value, partyLabel) => {
  switch (key) {
    case 'status': return `Status: ${statusLabel(value)}`;
    case 'source': return `Source: ${SOURCES[value]?.short || value}`;
    case 'type': return `Type: ${DOC_TYPES.find(t => t.value === value)?.label || value}`;
    case 'year': return value === 'none' ? 'No date' : `Year: ${value}`;
    case 'month': return `Month: ${MONTHS.find(m => m.value === value)?.label || value}`;
    case 'party': return `${partyLabel}: ${value}`;
    case 'from': return `From ${value}`;
    case 'to': return `To ${value}`;
    case 'min': return `Min ${value}`;
    case 'max': return `Max ${value}`;
    case 'attachment': return value === 'with' ? 'Has attachment' : 'No attachment';
    case 'flag': return FLAGS.find(f => f.value === value)?.label || value;
    default: return `${key}: ${value}`;
  }
};

export default function InvoiceFilters({
  filters,
  onChange,
  onReset,
  open,
  onToggleOpen,
  statusCounts = {},
  flagCounts = {},
  years = [],
  parties = [],
  partyLabel = 'Customer',
  showType = false,          // sales lists mix invoices and quotations
  sort,
  onSortChange,
  showing = 0,
  total = 0,
  searchRef,
}) {
  const { isMobile } = useApp();
  const set = (patch) => onChange({ ...filters, ...patch });
  const activeCount = activeFilterCount(filters);
  const activeKeys = Object.keys(EMPTY_FILTERS).filter(
    k => k !== 'search' && filters[k] !== EMPTY_FILTERS[k]
  );

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Search + status chips + panel toggle */}
      <div className="list-tools" style={{
        padding: '12px 16px', display: 'flex', gap: 10,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <SearchBar
          value={filters.search}
          onChange={v => set({ search: v })}
          inputRef={searchRef}
          // The "/" shortcut hint means nothing without a keyboard.
          placeholder={isMobile ? 'Search invoices…' : 'Search no., name, item, note…  (/)'}
          width={260}
        />

        {/* Seven status chips wrapped onto three lines on a phone; they scroll
            as one row instead. */}
        <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip active={filters.status === 'all'} count={statusCounts.all}
            onClick={() => set({ status: 'all' })}>All</Chip>
          {STATUSES.map(s => (
            <Chip
              key={s}
              active={filters.status === s}
              count={statusCounts[s] || 0}
              onClick={() => set({ status: filters.status === s ? 'all' : s })}
            >
              {statusLabel(s)}
            </Chip>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Btn
          size="sm"
          variant={open || activeCount ? 'primary' : 'secondary'}
          icon={SlidersHorizontal}
          onClick={onToggleOpen}
        >
          Filters{activeCount ? ` · ${activeCount}` : ''}
        </Btn>
        {(activeCount > 0 || filters.search) && (
          <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={onReset}>Reset</Btn>
        )}
      </div>

      {/* Full filter panel */}
      {open && (
        <div style={{
          padding: '4px 16px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
          gap: 12,
          borderTop: '1px dashed var(--border)',
        }}>
          {showType && (
            <FilterSelect
              label="Type"
              value={filters.type}
              onChange={v => set({ type: v })}
              options={[
                { value: 'all', label: 'Invoices & quotations' },
                ...DOC_TYPES.map(t => ({ value: t.value, label: t.label })),
              ]}
            />
          )}
          <FilterSelect
            label="Source"
            value={filters.source}
            onChange={v => set({ source: v })}
            options={[
              { value: 'all', label: 'Any source' },
              ...Object.entries(SOURCES).map(([value, m]) => ({ value, label: m.label })),
            ]}
          />
          <FilterSelect
            label="Year"
            value={filters.year}
            onChange={v => set({ year: v })}
            options={[{ value: 'all', label: 'All years' }, ...years]}
          />
          <FilterSelect
            label="Month"
            value={filters.month}
            onChange={v => set({ month: v })}
            options={[{ value: 'all', label: 'All months' }, ...MONTHS]}
          />
          <FilterSelect
            label={partyLabel}
            value={filters.party}
            onChange={v => set({ party: v })}
            options={[
              { value: 'all', label: `All ${partyLabel.toLowerCase()}s` },
              ...parties.map(p => ({ value: p, label: p })),
            ]}
          />
          <FilterInput label="Date from" type="date" value={filters.from} onChange={v => set({ from: v })} />
          <FilterInput label="Date to" type="date" value={filters.to} onChange={v => set({ to: v })} />
          <FilterInput label="Min total" type="number" min="0" placeholder="0" value={filters.min} onChange={v => set({ min: v })} />
          <FilterInput label="Max total" type="number" min="0" placeholder="Any" value={filters.max} onChange={v => set({ max: v })} />
          <FilterSelect
            label="Attachment"
            value={filters.attachment}
            onChange={v => set({ attachment: v })}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'with', label: 'Has attachment' },
              { value: 'without', label: 'No attachment' },
            ]}
          />
          <FilterSelect
            label="Show only"
            value={filters.flag}
            onChange={v => set({ flag: v })}
            options={[
              { value: 'all', label: 'Everything' },
              ...FLAGS.map(f => ({
                value: f.value,
                label: flagCounts[f.value] != null ? `${f.label} (${flagCounts[f.value]})` : f.label,
              })),
            ]}
          />
          <FilterSelect
            label="Sort by"
            value={sort.key}
            onChange={v => onSortChange({ ...sort, key: v })}
            options={SORT_OPTIONS}
          />
          <FilterSelect
            label="Order"
            value={sort.dir}
            onChange={v => onSortChange({ ...sort, dir: v })}
            options={[
              { value: 'desc', label: 'Descending' },
              { value: 'asc', label: 'Ascending' },
            ]}
          />
        </div>
      )}

      {/* Active filters + result count */}
      {(activeKeys.length > 0 || filters.search) && (
        <div style={{
          padding: '0 16px 12px', display: 'flex', gap: 6,
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            Showing <strong>{showing}</strong> of {total}
          </span>
          {activeKeys.map(k => (
            <button
              key={k}
              onClick={() => set({ [k]: EMPTY_FILTERS[k] })}
              title="Remove filter"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'var(--bg3)', border: '1px solid var(--border2)',
                borderRadius: 99, padding: '3px 8px', cursor: 'pointer',
                color: 'var(--text2)', fontSize: '0.72rem', fontWeight: 600,
                fontFamily: 'var(--font-head)',
              }}
            >
              {describe(k, filters[k], partyLabel)}
              <X size={11} />
            </button>
          ))}
          {filters.search && <Badge color="blue">“{filters.search}”</Badge>}
        </div>
      )}
    </div>
  );
}
