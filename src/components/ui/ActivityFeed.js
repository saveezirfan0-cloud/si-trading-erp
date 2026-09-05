// src/components/ui/ActivityFeed.js
//
// The change history of one record: every create, edit, status change, delete
// and restore, newest first, with the fields that changed and who changed them.
// Rendered inline on the invoice views and inside the HistoryModal used by the
// list pages.
import React, { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
import { fetchRecordActivity, actionLabel, actionColor, fieldLabel } from '../../lib/audit';
import { formatDateTime, timeAgo } from '../../lib/datetime';

// Local pill rather than the shared <Badge>: this file is re-exported from
// components/ui/index.js, and importing back from it would make a cycle.
const TONES = {
  green:   { bg: 'rgba(34,197,94,0.15)',  fg: 'var(--green)',  dot: 'var(--green)'  },
  red:     { bg: 'rgba(239,68,68,0.15)',  fg: 'var(--red)',    dot: 'var(--red)'    },
  blue:    { bg: 'rgba(59,130,246,0.15)', fg: 'var(--blue)',   dot: 'var(--blue)'   },
  yellow:  { bg: 'rgba(240,165,0,0.15)',  fg: 'var(--accent)', dot: 'var(--accent)' },
  purple:  { bg: 'rgba(139,92,246,0.15)', fg: 'var(--purple)', dot: 'var(--purple)' },
  default: { bg: 'var(--bg3)',            fg: 'var(--text2)',  dot: 'var(--text3)'  },
};

export const tone = (action) => TONES[actionColor(action)] || TONES.default;

export function ActionPill({ action }) {
  const t = tone(action);
  return (
    <span style={{
      background: t.bg, color: t.fg, padding: '2px 8px', borderRadius: 99,
      fontSize: '0.72rem', fontWeight: 600, fontFamily: 'var(--font-head)',
      whiteSpace: 'nowrap',
    }}>
      {actionLabel(action)}
    </span>
  );
}

// The activity table is missing until migration 0002 is applied. Postgres
// reports 42P01 (undefined_table); PostgREST's schema cache reports PGRST205.
const isMissingTable = (e) =>
  e?.code === '42P01' || e?.code === 'PGRST205' ||
  /erp_activity/i.test(e?.message || '') ||
  /could not find the table/i.test(e?.message || '');

export function ChangeList({ changes }) {
  if (!changes?.length) return null;
  return (
    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex',
                 flexDirection: 'column', gap: 3 }}>
      {changes.map((c, i) => (
        <li key={`${c.field}-${i}`} style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          fontSize: '0.76rem', color: 'var(--text2)',
        }}>
          <span style={{ color: 'var(--text3)', fontWeight: 600 }}>{fieldLabel(c.field)}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)',
                         textDecoration: 'line-through' }}>{c.from}</span>
          <ArrowRight size={11} style={{ color: 'var(--text3)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{c.to}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ActivityFeed({ collection, recordId, max = 100, embedded = false }) {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | empty | error | no-table

  const load = useCallback(async () => {
    if (!collection || !recordId) { setState('empty'); return; }
    setState('loading');
    try {
      const rows = await fetchRecordActivity(collection, recordId, max);
      setEntries(rows);
      setState(rows.length ? 'ready' : 'empty');
    } catch (e) {
      console.error('activity load failed', e);
      setState(isMissingTable(e) ? 'no-table' : 'error');
    }
  }, [collection, recordId, max]);

  useEffect(() => { load(); }, [load]);

  const body = (() => {
    if (state === 'loading') {
      return <div style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '14px 0' }}>Loading history…</div>;
    }
    if (state === 'no-table') {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text2)',
                      fontSize: '0.82rem', padding: '10px 0', lineHeight: 1.55 }}>
          <AlertCircle size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <span>
            History is not recording yet. Run{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>
              supabase/migrations/0002_activity_trash_attachments.sql
            </code>{' '}
            in the Supabase SQL editor to switch on the activity log.
          </span>
        </div>
      );
    }
    if (state === 'error') {
      return <div style={{ color: 'var(--red)', fontSize: '0.82rem', padding: '10px 0' }}>
        Could not load the history for this record.
      </div>;
    }
    if (state === 'empty') {
      return <div style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '10px 0' }}>
        No changes recorded yet. Edits made from now on appear here.
      </div>;
    }
    return (
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex',
                   flexDirection: 'column', gap: 2 }}>
        {entries.map((e, i) => (
          <li key={e.id} style={{
            display: 'flex', gap: 12, padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}>
            {/* timeline rail */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: tone(e.action).dot,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <ActionPill action={e.action} />
                <strong style={{ fontSize: '0.82rem', fontWeight: 600 }}>{e.userName || 'Unknown user'}</strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--text3)' }} title={formatDateTime(e.at)}>
                  {timeAgo(e.at) || formatDateTime(e.at)}
                </span>
              </div>
              {e.note && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: 4 }}>{e.note}</div>
              )}
              <ChangeList changes={e.changes} />
            </div>
          </li>
        ))}
      </ol>
    );
  })();

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <History size={14} style={{ color: 'var(--text2)' }} />
      <span style={{
        flex: 1, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem',
        color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        Activity history
      </span>
      <button onClick={load} title="Refresh"
        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
        <RefreshCw size={13} />
      </button>
    </div>
  );

  if (embedded) return <>{header}{body}</>;

  return (
    <div className="no-print" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 16,
    }}>
      {header}
      {body}
    </div>
  );
}
