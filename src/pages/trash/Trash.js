// src/pages/trash/Trash.js
//
// Deleting a record in the ERP does not destroy it: src/lib/db.js stamps
// doc.deletedAt and every list filters those rows out. This page is where the
// deleted records live — restore one, or (admins only) delete it for good.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Header from '../../components/layout/Header';
import {
  Table, Btn, PageHeader, Card, Loader, SearchBar, StatCard, Badge, HistoryButton,
} from '../../components/ui';
import { RotateCcw, Trash2, AlertCircle, Archive, RefreshCw } from 'lucide-react';
import {
  getDeleted, restore, purge, COLLECTIONS, TRASHABLE_COLLECTIONS,
} from '../../lib/db';
import { moduleLabel, recordLabel } from '../../lib/audit';
import { formatDateTime, timeAgo } from '../../lib/datetime';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';

// A deleted invoice should still show its total; a deleted item its stock.
const amountOf = (row) =>
  typeof row.total === 'number' ? row.total
    : typeof row.amount === 'number' ? row.amount
      : null;

export default function Trash() {
  const { hasPermission } = useAuth();
  const { formatCurrency } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');

  const canPurge = hasPermission('purge');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        TRASHABLE_COLLECTIONS.map(async (col) => {
          try {
            const deleted = await getDeleted(col);
            return deleted.map((r) => ({ ...r, _collection: col }));
          } catch (e) {
            // A table that does not exist in this project should not blank the page.
            console.warn('trash read failed for', col, e);
            return [];
          }
        }),
      );
      setRows(results.flat().sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || '')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (module === 'all' || r._collection === module) &&
      (!q ||
        recordLabel(r, r.id).toLowerCase().includes(q) ||
        moduleLabel(r._collection).toLowerCase().includes(q) ||
        (r.deletedByName || '').toLowerCase().includes(q))
    );
  }, [rows, search, module]);

  const modules = useMemo(() => {
    const counts = new Map();
    rows.forEach((r) => counts.set(r._collection, (counts.get(r._collection) || 0) + 1));
    return [...counts.entries()].map(([value, count]) => ({
      value, count, label: `${moduleLabel(value)} (${count})`,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const handleRestore = async (row) => {
    setBusy(true);
    try {
      await restore(row._collection, row.id);
      toast.success(`${recordLabel(row, row.id)} restored`);
      await load();
    } catch (e) { toast.error(`Restore failed: ${e.message}`); }
    setBusy(false);
  };

  const handlePurge = async (row) => {
    const name = recordLabel(row, row.id);
    if (!window.confirm(`Delete ${name} permanently? This cannot be undone — only the audit entry will remain.`)) return;
    setBusy(true);
    try {
      await purge(row._collection, row.id);
      toast.success(`${name} deleted permanently`);
      await load();
    } catch (e) { toast.error(`Delete failed: ${e.message}`); }
    setBusy(false);
  };

  const handleEmpty = async () => {
    if (!filtered.length) return;
    if (!window.confirm(
      `Permanently delete all ${filtered.length} record(s) shown? This cannot be undone.`
    )) return;
    setBusy(true);
    let failed = 0;
    for (const row of filtered) {
      try { await purge(row._collection, row.id); } catch { failed += 1; }
    }
    setBusy(false);
    if (failed) toast.error(`${failed} record(s) could not be deleted`);
    else toast.success('Trash emptied');
    await load();
  };

  const columns = [
    { key: '_collection', label: 'Module', render: (v) => <Badge color="purple">{moduleLabel(v)}</Badge> },
    { key: '_label', label: 'Record', render: (_, r) => (
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{recordLabel(r, r.id)}</div>
        {amountOf(r) !== null && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{formatCurrency(amountOf(r))}</div>
        )}
      </div>
    )},
    { key: 'deletedByName', label: 'Deleted By', render: (v) => v || 'Unknown user' },
    { key: 'deletedAt', label: 'Deleted', render: (v) => (
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: '0.8rem' }}>{formatDateTime(v)}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{timeAgo(v)}</div>
      </div>
    )},
    { key: 'createdByName', label: 'Originally Created By', render: (v) => v || '—' },
    { key: '_actions', label: '', render: (_, row) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" icon={RotateCcw} disabled={busy}
          onClick={(e) => { e.stopPropagation(); handleRestore(row); }}>Restore</Btn>
        <HistoryButton collection={row._collection} recordId={row.id} label={recordLabel(row, row.id)} />
        {canPurge && (
          <Btn size="sm" variant="danger" icon={Trash2} disabled={busy}
            onClick={(e) => { e.stopPropagation(); handlePurge(row); }}>Delete</Btn>
        )}
      </div>
    )},
  ];

  const invoiceCount = rows.filter(
    (r) => r._collection === COLLECTIONS.SALES_INVOICES || r._collection === COLLECTIONS.PURCHASE_INVOICES
  ).length;

  return (
    <>
      <Header title="Trash" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Trash"
          subtitle="Deleted records, kept until someone clears them out"
          actions={[
            <Btn key="ref" variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Btn>,
            ...(canPurge && filtered.length
              ? [<Btn key="empty" variant="danger" icon={Trash2} onClick={handleEmpty} disabled={busy}>
                   Empty {module === 'all' ? 'Trash' : 'This Module'}
                 </Btn>]
              : []),
          ]}
        />

        <div className="g-stats" style={{ gap: 16 }}>
          <StatCard label="In Trash" value={rows.length} icon={Archive} color="var(--accent)" />
          <StatCard label="Invoices" value={invoiceCount} icon={Trash2} color="var(--red)" />
          <StatCard label="Modules Affected" value={modules.length} icon={Archive} color="var(--purple)" />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search the trash…" />
            <select value={module} onChange={(e) => setModule(e.target.value)}
              aria-label="Module" style={{ padding: '8px 12px', maxWidth: 220 }}>
              <option value="all">All modules</option>
              {modules.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {loading ? <Loader /> : (
            <Table columns={columns} data={filtered}
              emptyMsg={rows.length ? 'Nothing matches these filters.' : 'The trash is empty.'} />
          )}
        </Card>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                      fontSize: '0.78rem', color: 'var(--text3)', lineHeight: 1.55 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Restoring puts a record back exactly where it was, invoice number and all.
            {canPurge
              ? ' Permanent deletion removes the record itself; its history stays in the audit log.'
              : ' Only an admin can delete a record permanently.'}
          </span>
        </div>
      </div>
    </>
  );
}
