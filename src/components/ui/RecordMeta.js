// src/components/ui/RecordMeta.js
//
// The "who touched this" strip shown under a record: who created it and when,
// who last changed it, and — for anything sitting in the Trash — who deleted
// it. Reads the createdBy/updatedBy stamps src/lib/db.js writes on every save.
import React from 'react';
import { UserCircle2, Clock, Trash2, CheckCircle2 } from 'lucide-react';
import { formatDateTime, timeAgo } from '../../lib/datetime';

const Row = ({ icon: Icon, label, name, at, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
    <Icon size={13} style={{ color: color || 'var(--text3)', flexShrink: 0 }} />
    <span style={{ color: 'var(--text3)' }}>{label}</span>
    <strong style={{ color: color || 'var(--text2)', fontWeight: 600 }}>{name || 'Unknown user'}</strong>
    {at && (
      <span style={{ color: 'var(--text3)' }} title={timeAgo(at)}>
        · {formatDateTime(at)}
      </span>
    )}
  </div>
);

export default function RecordMeta({ record, style }) {
  if (!record) return null;

  const created = record.createdAt || record.createdOn;
  const updated = record.updatedAt;
  // Only worth showing an "edited" line once the record has actually changed.
  const wasEdited =
    updated && created && new Date(updated).getTime() - new Date(created).getTime() > 1000;

  return (
    <div
      className="no-print"
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px 20px',
        fontSize: '0.76rem', lineHeight: 1.6,
        padding: '10px 14px',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        ...style,
      }}
    >
      <Row icon={UserCircle2} label="Created by" name={record.createdByName} at={created} />
      {wasEdited && (
        <Row icon={Clock} label="Last updated by" name={record.updatedByName} at={updated} />
      )}
      {record.approvedAt && (
        <Row icon={CheckCircle2} label="Approved by" name={record.approvedByName}
          at={record.approvedAt} color="var(--green)" />
      )}
      {record.deletedAt && (
        <Row icon={Trash2} label="Deleted by" name={record.deletedByName}
          at={record.deletedAt} color="var(--red)" />
      )}
    </div>
  );
}
