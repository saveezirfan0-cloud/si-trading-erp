// src/pages/audit/AuditLog.js
//
// The company-wide audit log: every create, edit, approval, delete and restore
// across the ERP, with the person who did it and what changed. Entries are
// written by src/lib/db.js and cannot be edited or removed from the app — the
// erp_activity table grants staff select and insert only.
import React, { useEffect, useMemo, useState } from 'react';
import Header from '../../components/layout/Header';
import {
  Table, Btn, PageHeader, Card, Loader, SearchBar, StatCard, Modal, ChangeList, ActionPill,
} from '../../components/ui';
import { Download, ShieldAlert, Activity, Users, Trash2, AlertCircle } from 'lucide-react';
import { subscribeActivity, ACTIONS, MODULE_LABELS, actionLabel } from '../../lib/audit';
import { formatDateTime, timeAgo } from '../../lib/datetime';
import { exportCSV } from '../../lib/export';
import { useAuth } from '../../contexts/AuthContext';

const MODULE_OPTIONS = Object.entries(MODULE_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

const ACTION_OPTIONS = Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label }));

const summarise = (entry) => {
  if (entry.note) return entry.note;
  if (!entry.changes?.length) return '—';
  const shown = entry.changes.slice(0, 3).map((c) => c.field).join(', ');
  return entry.changes.length > 3
    ? `${shown} +${entry.changes.length - 3} more`
    : shown;
};

const selectStyle = { padding: '8px 12px', maxWidth: 190 };

export default function AuditLog() {
  const { can } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');
  const [action, setAction] = useState('all');
  const [user, setUser] = useState('all');
  const [days, setDays] = useState('30');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setLoading(true);
    const from = days === 'all'
      ? undefined
      : new Date(Date.now() - Number(days) * 86400000).toISOString();
    const unsub = subscribeActivity(
      { collection: module === 'all' ? undefined : module, from, max: 1000 },
      (rows) => { setEntries(rows); setLoading(false); },
    );
    return () => unsub();
  }, [module, days]);

  const users = useMemo(() => {
    const seen = new Map();
    entries.forEach((e) => { if (e.userId) seen.set(e.userId, e.userName || e.userEmail || 'Unknown'); });
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) =>
      (action === 'all' || e.action === action) &&
      (user === 'all' || e.userId === user) &&
      (!q ||
        (e.label || '').toLowerCase().includes(q) ||
        (e.userName || '').toLowerCase().includes(q) ||
        (e.module || '').toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q) ||
        actionLabel(e.action).toLowerCase().includes(q) ||
        (e.changes || []).some((c) => (c.field || '').toLowerCase().includes(q)))
    );
  }, [entries, search, action, user]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = filtered.filter((e) => (e.at || '').slice(0, 10) === today).length;
  const deletions = filtered.filter((e) => e.action === 'delete' || e.action === 'purge').length;

  const columns = [
    { key: 'at', label: 'When', render: (v) => (
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: '0.8rem' }}>{formatDateTime(v)}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{timeAgo(v)}</div>
      </div>
    )},
    { key: 'userName', label: 'User', render: (v, r) => (
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{v || 'Unknown user'}</div>
        {r.userRole && <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{r.userRole}</div>}
      </div>
    )},
    { key: 'action', label: 'Action', render: (v) => <ActionPill action={v} /> },
    { key: 'module', label: 'Module' },
    { key: 'label', label: 'Record', render: (v) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{v || '—'}</span>
    )},
    { key: '_summary', label: 'Changed', wrap: true, render: (_, r) => (
      <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{summarise(r)}</span>
    )},
  ];

  const handleExport = () => exportCSV(
    filtered.map((e) => ({
      when: e.at,
      user: e.userName,
      email: e.userEmail,
      role: e.userRole,
      action: actionLabel(e.action),
      module: e.module,
      record: e.label,
      note: e.note || '',
      changes: (e.changes || []).map((c) => `${c.field}: ${c.from} → ${c.to}`).join('; '),
    })),
    'audit_log',
  );

  return (
    <>
      <Header title="Audit Log" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Audit Log"
          subtitle="Every change made in the ERP, and who made it"
          actions={can('audit', 'export')
            ? [<Btn key="exp" variant="secondary" icon={Download} onClick={handleExport}>Export</Btn>]
            : []}
        />

        <div className="g-stats" style={{ gap: 16 }}>
          <StatCard label="Entries Shown" value={filtered.length} icon={Activity} color="var(--accent)" />
          <StatCard label="Changes Today" value={todayCount} icon={ShieldAlert} color="var(--blue)" />
          <StatCard label="Deletions" value={deletions} icon={Trash2} color="var(--red)" />
          <StatCard label="People Active" value={users.length} icon={Users} color="var(--green)" />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search people, records…" />
            <select value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module" style={selectStyle}>
              <option value="all">All modules</option>
              {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" style={selectStyle}>
              <option value="all">All actions</option>
              {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="User" style={selectStyle}>
              <option value="all">Everyone</option>
              {users.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Period" style={selectStyle}>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">Everything</option>
            </select>
          </div>

          {loading ? <Loader /> : (
            <Table
              columns={columns}
              data={filtered}
              onRowClick={(row) => setDetail(row)}
              emptyMsg={
                entries.length === 0
                  ? 'Nothing recorded yet for this period. If this stays empty, apply supabase/migrations/0003_activity_trash_attachments.sql.'
                  : 'No entries match these filters.'
              }
            />
          )}
        </Card>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                      fontSize: '0.78rem', color: 'var(--text3)', lineHeight: 1.55 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Audit entries are append-only: staff accounts can read and add to the log but
            cannot edit or delete what is already in it. Records deleted from the ERP keep
            their history here even after the record itself is purged.
          </span>
        </div>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${actionLabel(detail.action)} — ${detail.label || detail.module}` : ''}
        width={620}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text3)' }}>When</span>
              <span>{formatDateTime(detail.at)} · {timeAgo(detail.at)}</span>
              <span style={{ color: 'var(--text3)' }}>User</span>
              <span>{detail.userName || 'Unknown user'}{detail.userEmail ? ` (${detail.userEmail})` : ''}</span>
              <span style={{ color: 'var(--text3)' }}>Module</span>
              <span>{detail.module}</span>
              <span style={{ color: 'var(--text3)' }}>Record</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{detail.label || detail.recordId || '—'}</span>
              {detail.note && (<>
                <span style={{ color: 'var(--text3)' }}>Note</span>
                <span>{detail.note}</span>
              </>)}
            </div>
            {detail.changes?.length ? (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Fields changed
                </div>
                <ChangeList changes={detail.changes} />
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>No field-level changes recorded.</div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
