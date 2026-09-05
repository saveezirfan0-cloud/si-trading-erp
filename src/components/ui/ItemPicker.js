// src/components/ui/ItemPicker.js
//
// Searchable inventory picker used everywhere a line item is chosen — new/edit
// sales & purchase invoices, quick invoice, and the AI invoice scanner.
//
// The plain <select> it replaces was unusable once the catalogue passed a few
// hundred items: the native dropdown gives you one alphabetical list and no way
// to search by code, brand or barcode. This renders a filter box over the same
// list and matches on name, code, SKU, barcode, brand and category.
//
// The popover is portalled to <body> with fixed positioning because these
// pickers live inside `overflow-x: auto` invoice tables, which would otherwise
// clip the dropdown.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X } from 'lucide-react';

const MAX_RESULTS = 80;

const norm = (s) => (s == null ? '' : String(s)).toLowerCase().trim();

// Fields an item can be found by. `sku` isn't on every record — items imported
// from other systems carry it, so search it when it's there.
const HAYSTACK = ['name', 'code', 'sku', 'barcode', 'brand', 'category', 'description'];

// Ranked filter: an item that starts with the query beats one that merely
// contains it, and a code/name hit beats a hit on brand or category. Every
// query word must match somewhere, so "8 plier" finds '8" plier Xianyu'.
//
// The exact-field bonus is deliberately limited to the identity fields. Whole
// categories share a name ("Wrench"), so without that limit every item filed
// under a category outranked the item whose own name contains the word.
const scoreItem = (item, words) => {
  const fields = HAYSTACK.map(f => norm(item[f]));
  const [name, code, sku, barcode] = fields;
  let score = 0;
  for (const w of words) {
    let best = 0;
    for (let i = 0; i < fields.length; i++) {
      const v = fields[i];
      if (!v) continue;
      const at = v.indexOf(w);
      if (at < 0) continue;
      const identity = i <= 3; // name, code, sku, barcode
      const hit = (at === 0 ? 3 : 1) + (identity ? 3 : 0) + (identity && v === w ? 3 : 0);
      if (hit > best) best = hit;
    }
    if (!best) return 0; // every word must land somewhere
    score += best;
  }
  // Whole-phrase hits on the identity fields float above scattered word hits,
  // so "pipe wrench" ranks 'Solid Pipe Wrench' over 'Pipe Rainch' (category
  // Wrench), which matched both words but never as a phrase.
  const phrase = words.join(' ');
  if (name.startsWith(phrase) || code === phrase || sku === phrase || barcode === phrase) score += 6;
  else if (name.includes(phrase) || code.includes(phrase)) score += 4;
  return score;
};

export default function ItemPicker({
  items = [],
  value = '',
  onChange,                 // (id, item) => void
  extraOptions = [],        // [{ value, label, hint, alwaysShow }] pinned above results
  placeholder = 'Search item…',
  emptyLabel = 'Select item',
  disabled = false,
  style,
  formatSub,                // (item) => string — optional second line override
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [rect, setRect] = useState(null);

  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(
    () => items.find(i => i.id === value) || null,
    [items, value]
  );
  const selectedExtra = useMemo(
    () => extraOptions.find(o => o.value === value) || null,
    [extraOptions, value]
  );

  const words = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  // Pinned options are filtered by the query too. Callers pin real inventory
  // items here (the scanner pins its top OCR guesses), and leaving those in
  // place put a wall of unrelated rows above the one row you searched for.
  // An option marked `alwaysShow` — "➕ New item" — is exempt, since it stays
  // useful precisely when nothing matches.
  const visibleExtras = useMemo(() => {
    if (!words.length) return extraOptions;
    return extraOptions.filter(o =>
      o.alwaysShow || scoreItem({ name: o.label }, words) > 0);
  }, [extraOptions, words]);

  // A pinned option that names an inventory item would otherwise show again in
  // the results below it — same item, listed twice in one dropdown.
  const pinnedIds = useMemo(
    () => new Set(visibleExtras.map(o => o.value)),
    [visibleExtras]
  );

  const results = useMemo(() => {
    const pool = items.filter(i => !pinnedIds.has(i.id));
    if (!words.length) return pool.slice(0, MAX_RESULTS);
    return pool
      .map(i => ({ i, s: scoreItem(i, words) }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s || norm(a.i.name).localeCompare(norm(b.i.name)))
      .slice(0, MAX_RESULTS)
      .map(r => r.i);
  }, [items, words, pinnedIds]);

  // One flat list of rows so the keyboard cursor can run through the pinned
  // options and the search results without special-casing either.
  const rows = useMemo(() => [
    ...visibleExtras.map(o => ({ kind: 'extra', key: `x:${o.value}`, option: o })),
    ...results.map(i => ({ kind: 'item', key: i.id, item: i })),
  ], [visibleExtras, results]);

  const position = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom, bottom: r.top, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => { if (open) position(); }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => position();
    // capture:true so scrolling the invoice table (not just the window) moves it
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, position]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // focus after the portal paints, or the caret lands nowhere
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // With a query typed, the cursor skips the always-shown action rows so Enter
  // picks what you searched for rather than creating a new item. It stops at
  // the first real candidate — which may be a pinned suggestion, since those
  // are now filtered by the query and so are matches in their own right.
  useEffect(() => {
    const firstPickable = rows.findIndex(r => !(r.kind === 'extra' && r.option.alwaysShow));
    setCursor(query.trim() && firstPickable > 0 ? firstPickable : 0);
  }, [query, rows]);

  // Keep the highlighted row inside the scroll viewport while arrowing.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children?.[cursor];
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const choose = (row) => {
    if (row.kind === 'extra') onChange?.(row.option.value, null);
    else onChange?.(row.item.id, row.item);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[cursor]) choose(rows[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); anchorRef.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const label = selectedExtra?.label
    || (selected ? `${selected.code ? `${selected.code} — ` : ''}${selected.name}` : '');

  const sub = (item) => {
    if (formatSub) return formatSub(item);
    return [item.brand, item.category, item.sku && `SKU ${item.sku}`, item.barcode && `#${item.barcode}`]
      .filter(Boolean).join(' · ');
  };

  // Flip above the anchor when the popover would run off the bottom of the
  // viewport — matters most on phones, where the picker sits low in the page.
  const POP_H = 300;
  const flip = rect && rect.top + POP_H > window.innerHeight && rect.bottom > POP_H;

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        title={label || emptyLabel}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 7px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 6,
          color: label ? 'var(--text)' : 'var(--text3)',
          fontSize: '13px', fontFamily: 'var(--font-body)', textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          minHeight: 30,
          ...style,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || emptyLabel}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text3)' }} />
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: flip ? undefined : rect.top + 4,
            bottom: flip ? window.innerHeight - rect.bottom + 4 : undefined,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 280) - 8)),
            width: Math.max(rect.width, 280),
            maxWidth: 'calc(100vw - 16px)',
            zIndex: 2000,
            background: 'var(--bg2)',
            border: '1px solid var(--border2)',
            borderRadius: 10,
            boxShadow: 'var(--shadow, 0 12px 32px rgba(0,0,0,0.35))',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            maxHeight: POP_H,
          }}
        >
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--border)' }}>
            <Search size={14} style={{ position: 'absolute', left: 17, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              style={{
                width: '100%', padding: '7px 28px 7px 30px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 7, color: 'var(--text)', fontSize: '13px',
              }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                title="Clear search"
                style={{ position: 'absolute', right: 15, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
            {rows.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text3)', fontSize: '12.5px' }}>
                No item matches “{query}”
              </div>
            )}
            {rows.map((row, idx) => {
              const active = idx === cursor;
              const isSelected = row.kind === 'extra' ? row.option.value === value : row.item.id === value;
              const s = row.kind === 'item' ? sub(row.item) : row.option.hint;
              return (
                <div
                  key={row.key}
                  onMouseEnter={() => setCursor(idx)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
                  onClick={() => choose(row)}
                  style={{
                    padding: '7px 10px', cursor: 'pointer',
                    background: active ? 'var(--bg3)' : 'transparent',
                    borderLeft: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: isSelected ? 700 : 500 }}>
                    {row.kind === 'extra' ? row.option.label : (
                      <>
                        {row.item.code && (
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginRight: 6 }}>
                            {row.item.code}
                          </span>
                        )}
                        {row.item.name}
                      </>
                    )}
                  </div>
                  {s && (
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s}
                    </div>
                  )}
                </div>
              );
            })}
            {results.length === MAX_RESULTS && (
              <div style={{ padding: '7px 10px', fontSize: '11px', color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
                Showing first {MAX_RESULTS} — keep typing to narrow.
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
