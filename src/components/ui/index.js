// src/components/ui/index.js

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Search, Loader2, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';


// True below the phone breakpoint. Kept here so the UI kit can adapt its own
// layout without every caller threading a prop through.
function useIsNarrow(breakpoint = 700) {
  const query = `(max-width: ${breakpoint}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', size = 'md', onClick, type = 'button', disabled, style, icon: Icon }) {
  const variants = {
    primary: { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' },
    secondary: { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)' },
    danger: { background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)' },
    ghost: { background: 'transparent', color: 'var(--text2)', border: 'none' },
    success: { background: 'rgba(34,197,94,0.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.3)' },
  };
  const sizes = {
    sm: { padding: '5px 12px', fontSize: '0.78rem', borderRadius: '7px' },
    md: { padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px' },
    lg: { padding: '11px 22px', fontSize: '0.95rem', borderRadius: '10px' },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        ...sizes[size],
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, placeholder, type = 'text', required, style, name, readOnly, min, max, step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>{label}{required && ' *'}</label>}
      <input
        name={name}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        min={min}
        max={max}
        step={step}
        style={{ padding: '8px 12px', width: '100%', ...style }}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options = [], required, name, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>{label}{required && ' *'}</label>}
      <select
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        style={{ padding: '8px 12px', width: '100%', ...style }}
      >
        <option value="">— Select —</option>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ label, value, onChange, placeholder, rows = 3, name }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>{label}</label>}
      <textarea
        name={name}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        style={{ padding: '8px 12px', width: '100%', resize: 'vertical' }}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', padding: 16,
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: width,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1,
        }}>
          <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text2)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
//
// Paginated by default. The ERP's lists run to hundreds of rows (699 inventory
// items, 770 sales invoices), and rendering them all at once made the pages
// crawl. Pass `paginate={false}` for short, fixed lists where paging is noise.

const PAGE_SIZES = [25, 50, 100, 200];

// Page numbers to render: always first and last, plus a window around current,
// with gaps collapsed into an ellipsis.
function pageWindow(current, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
}

// On a phone a nine-column table is a sideways-scrolling chore. The same rows
// render as cards instead: the first column becomes the card's title, an
// actions column moves to the footer, and everything else becomes a labelled
// pair. Columns can opt out with `hideOnMobile`.
function RowCards({ columns, rows, onRowClick, selectable, selected, toggleRow, startIdx }) {
  const [titleCol, ...restCols] = columns.filter((c) => c.key !== '_select');
  const actionCol = restCols.find((c) => c.key === '_actions');
  const bodyCols = restCols.filter((c) => c.key !== '_actions' && !c.hideOnMobile);

  const cell = (col, row) =>
    col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—');

  return (
    <div className="row-cards">
      {rows.map((row, i) => (
        <div
          key={row.id || startIdx + i}
          className="row-card"
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          style={{ cursor: onRowClick ? 'pointer' : 'default' }}
        >
          <div className="row-card-head">
            {selectable && (
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleRow(row.id)}
                aria-label="Select row"
                style={{ width: 18, height: 18, flexShrink: 0, marginRight: 2 }}
              />
            )}
            <div className="row-card-title">{titleCol ? cell(titleCol, row) : null}</div>
          </div>

          <dl className="row-card-body">
            {bodyCols.map((col) => {
              const value = cell(col, row);
              if (value === null || value === undefined || value === '') return null;
              return (
                <div className="row-card-pair" key={col.key}>
                  <dt>{col.label}</dt>
                  <dd>{value}</dd>
                </div>
              );
            })}
          </dl>

          {actionCol && (
            <div className="row-card-actions" onClick={(e) => e.stopPropagation()}>
              {cell(actionCol, row)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Table({
  columns,
  data,
  onRowClick,
  emptyMsg = 'No records found.',
  pageSize: initialPageSize = 50,
  paginate = true,
  // Sorting is owned by the caller: it already has to sort the full list for
  // export, so the table only renders the affordance and reports clicks.
  sort,
  onSort,
  // Selection works on the whole (filtered) list, not just the visible page —
  // bulk actions are the reason to select at all.
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  // Wide tables become cards on a phone; short ones (few columns) stay tabular.
  cardsOnMobile = true,
}) {
  const narrow = useIsNarrow();
  const rows = useMemo(() => data || [], [data]);
  const total = rows.length;
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const enabled = paginate && total > pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Searching or switching fiscal year changes the row count — go back to the
  // first page rather than stranding the user on a page that no longer exists.
  useEffect(() => { setPage(1); }, [total, pageSize]);
  useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

  const startIdx = enabled ? (page - 1) * pageSize : 0;
  const visible = enabled ? rows.slice(startIdx, startIdx + pageSize) : rows;

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = total > 0 && rows.every((r) => selected.has(r.id));

  const toggleRow = (id) => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange([...next]);
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : rows.map((r) => r.id));
  };

  const navBtn = (disabled) => ({
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 7, color: disabled ? 'var(--text3)' : 'var(--text2)',
    padding: '5px 9px', fontSize: '0.8rem', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  });

  const pageBtn = (active) => ({
    minWidth: 30, padding: '5px 8px',
    background: active ? 'var(--accent)' : 'var(--bg2)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 7, color: active ? 'var(--on-accent)' : 'var(--text2)',
    fontSize: '0.8rem', fontWeight: active ? 700 : 500,
    fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
  });

  const headStyle = (col) => ({
    textAlign: col.align || 'left',
    padding: '10px 14px',
    fontSize: '0.72rem',
    fontFamily: 'var(--font-head)',
    fontWeight: 700,
    color: 'var(--text3)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  });

  const renderHead = (col) => {
    const key = col.sortKey || col.key;
    if (!col.sortable || !onSort) return col.label;
    const active = sort?.key === key;
    const Arrow = active && sort?.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        onClick={() => onSort(key)}
        title={`Sort by ${col.label}`}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
          color: active ? 'var(--accent)' : 'var(--text3)',
        }}
      >
        {col.label}
        {active
          ? <Arrow size={12} />
          : <ArrowUpDown size={12} style={{ opacity: 0.45 }} />}
      </button>
    );
  };

  const checkbox = (checked, onChange, label) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
    />
  );

  const footer = paginate && total > PAGE_SIZES[0] ? (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      padding: '11px 14px', borderTop: '1px solid var(--border)',
      background: 'var(--bg3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text2)' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {total === 0
            ? 'No records'
            : `${startIdx + 1}–${Math.min(startIdx + pageSize, total)} of ${total}`}
        </span>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 7, color: 'var(--text2)', fontSize: '0.78rem',
            fontFamily: 'var(--font-body)', padding: '4px 22px 4px 8px',
            minHeight: 30, cursor: 'pointer',
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
      </div>

      {enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1} style={navBtn(page === 1)} aria-label="Previous page">
            <ChevronLeft size={14} /> Prev
          </button>

          {pageWindow(page, totalPages).map((n) =>
            typeof n === 'string' ? (
              <span key={n} style={{ color: 'var(--text3)', padding: '0 2px' }}>…</span>
            ) : (
              <button key={n} onClick={() => setPage(n)} style={pageBtn(n === page)}
                aria-current={n === page ? 'page' : undefined}>
                {n}
              </button>
            )
          )}

          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages} style={navBtn(page === totalPages)} aria-label="Next page">
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  ) : null;

  // A phone gets cards; a desktop gets the table. Only worth swapping when the
  // table is actually wide — a two-column list reads fine either way.
  const asCards = cardsOnMobile && narrow && columns.length > 3;

  if (asCards) {
    return (
      <>
        {visible.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--text3)' }}>{emptyMsg}</div>
        ) : (
          <RowCards
            columns={columns}
            rows={visible}
            onRowClick={onRowClick}
            selectable={selectable}
            selected={selected}
            toggleRow={toggleRow}
            startIdx={startIdx}
          />
        )}
        {footer}
      </>
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {selectable && (
                <th style={{ ...headStyle({}), width: 36, paddingRight: 0 }}>
                  {checkbox(allSelected, toggleAll, 'Select all rows')}
                </th>
              )}
              {columns.map(col => (
                <th key={col.key} style={headStyle(col)}>{renderHead(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => {
                const isSelected = selectable && selected.has(row.id);
                return (
                  <tr
                    key={row.id || startIdx + i}
                    onClick={() => onRowClick && onRowClick(row)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: onRowClick ? 'pointer' : 'default',
                      background: isSelected ? 'var(--accent-glow)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => onRowClick && !isSelected && (e.currentTarget.style.background = 'var(--bg3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = isSelected ? 'var(--accent-glow)' : 'transparent')}
                  >
                    {selectable && (
                      <td style={{ padding: '10px 0 10px 14px', width: 36 }}>
                        {checkbox(isSelected, () => toggleRow(row.id), `Select row ${row.id}`)}
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key} style={{
                        padding: '10px 14px',
                        fontSize: '0.85rem',
                        color: 'var(--text)',
                        textAlign: col.align || 'left',
                        whiteSpace: col.wrap ? 'normal' : 'nowrap',
                      }}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {footer}
    </>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'default' }) {
  const colors = {
    default: { bg: 'var(--bg3)', color: 'var(--text2)' },
    green: { bg: 'rgba(34,197,94,0.15)', color: 'var(--green)' },
    red: { bg: 'rgba(239,68,68,0.15)', color: 'var(--red)' },
    blue: { bg: 'rgba(59,130,246,0.15)', color: 'var(--blue)' },
    yellow: { bg: 'rgba(240,165,0,0.15)', color: 'var(--accent)' },
    // A real amber, independent of the accent, for "needs a second look".
    warn: { bg: 'rgba(217,119,6,0.15)', color: 'var(--yellow)' },
    purple: { bg: 'rgba(139,92,246,0.15)', color: 'var(--purple)' },
  };
  const c = colors[color] || colors.default;
  return (
    <span style={{
      background: c.bg, color: c.color,
      padding: '2px 8px', borderRadius: 99,
      fontSize: '0.72rem', fontWeight: 600,
      fontFamily: 'var(--font-head)',
    }}>
      {children}
    </span>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search...', inputRef, width = 240 }) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: '8px 12px 8px 30px', width, maxWidth: '100%' }}
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--text3)',
            cursor: 'pointer', padding: 4, display: 'flex',
          }}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
// A toggleable filter pill, optionally carrying the number of rows it matches.
export function Chip({ children, active, onClick, count, color = 'var(--accent)', title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 11px', borderRadius: 99,
        background: active ? 'var(--accent-glow)' : 'var(--bg2)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        color: active ? color : 'var(--text2)',
        fontFamily: 'var(--font-head)',
        fontSize: '0.75rem', fontWeight: active ? 700 : 500,
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
      }}
    >
      {children}
      {count != null && (
        <span style={{
          fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem',
          color: active ? color : 'var(--text3)',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── FilterField ──────────────────────────────────────────────────────────────
// Compact labelled control for filter bars — narrower and denser than the form
// Input/Select, so a dozen of them still fit on one screen.
const filterControlStyle = {
  padding: '6px 9px', width: '100%', fontSize: '0.8rem',
  borderRadius: 8, minHeight: 32,
};

export function FilterField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{
        fontSize: '0.68rem', color: 'var(--text3)', fontFamily: 'var(--font-head)',
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options = [] }) {
  return (
    <FilterField label={label}>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={filterControlStyle}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </FilterField>
  );
}

export function FilterInput({ label, value, onChange, type = 'text', placeholder, min }) {
  return (
    <FilterField label={label}>
      <input
        type={type}
        value={value ?? ''}
        min={min}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={filterControlStyle}
      />
    </FilterField>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
// `compact` shrinks the tile so a row of them still fits on a phone.
export function StatCard({ label, value, icon: Icon, color = 'var(--accent)', trend, sub, compact }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 12, padding: compact ? 12 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: compact ? '0.65rem' : '0.75rem', color: 'var(--text2)', fontFamily: 'var(--font-head)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {Icon && !compact && <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}><Icon size={16} /></div>}
        {Icon && compact && <Icon size={13} color={color} style={{ flexShrink: 0 }} />}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: compact ? '1.05rem' : '1.6rem', fontWeight: 800, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: compact ? '0.68rem' : '0.75rem', color: 'var(--text3)' }}>{sub}</div>}
    </Card>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="actions-wrap" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--text3)', fontSize: '0.82rem', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ─── FormGrid ─────────────────────────────────────────────────────────────────
// Form fields laid out in columns on a wide screen, collapsing on narrow ones.
// A fixed repeat(n, 1fr) squeezed inputs until their values were unreadable
// ("SI-00…", "Unpa…") on a phone, so the column count is capped by width.
export function FormGrid({ children, cols = 2 }) {
  return (
    <div className={`form-grid form-grid-${Math.min(cols, 4)}`}>
      {children}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: active === t.value ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === t.value ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--font-head)',
            fontWeight: active === t.value ? 700 : 500,
            fontSize: '0.82rem',
            marginBottom: -1,
            transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
      {label && <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'var(--font-head)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// ─── Scan attachment ──────────────────────────────────────────────────────────
export { default as ScanAttachment } from './ScanAttachment';
