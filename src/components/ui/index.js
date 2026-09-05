// src/components/ui/index.js

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

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

export function Table({
  columns,
  data,
  onRowClick,
  emptyMsg = 'No records found.',
  pageSize: initialPageSize = 50,
  paginate = true,
}) {
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

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(col => (
                <th key={col.key} style={{
                  textAlign: col.align || 'left',
                  padding: '10px 14px',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-head)',
                  fontWeight: 700,
                  color: 'var(--text3)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={row.id || startIdx + i}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => onRowClick && (e.currentTarget.style.background = 'var(--bg3)')}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginate && total > PAGE_SIZES[0] && (
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
      )}
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
export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: '8px 12px 8px 30px', width: 240 }}
      />
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, color = 'var(--accent)', trend, sub }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text2)', fontFamily: 'var(--font-head)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {Icon && <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}><Icon size={16} /></div>}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{sub}</div>}
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
export function FormGrid({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 16,
    }}>
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
