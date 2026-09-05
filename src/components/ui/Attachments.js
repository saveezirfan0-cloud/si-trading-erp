// src/components/ui/Attachments.js
//
// Files staff attach to a record — a delivery note, a payment slip, the
// supplier's own PDF. The bytes live in the private erp-attachments bucket and
// the metadata lives on the record itself (doc.attachments), so an invoice
// carries its paperwork with it and every add/remove lands in the audit log.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Paperclip, Upload, Trash2, ExternalLink, FileText, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { update } from '../../lib/db';
import { formatDateTime } from '../../lib/datetime';

export const ATTACHMENT_BUCKET = 'erp-attachments';
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

const prettySize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Keep object keys boring: storage rejects a lot of what a phone will name a file.
const safeName = (name) =>
  (name || 'file').replace(/[^\w.-]+/g, '_').slice(-80);

const isImage = (type) => (type || '').startsWith('image/');

export default function Attachments({
  collection,
  recordId,
  attachments,
  onChange,
  readOnly = false,
  title = 'Attachments',
  hint,
}) {
  const list = attachments || [];
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // One signed URL per file, refreshed whenever the list changes.
  useEffect(() => {
    let alive = true;
    const paths = list.map((a) => a.path).filter(Boolean);
    if (!paths.length) { setUrls({}); return; }
    supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)
      .then(({ data }) => {
        if (!alive || !data) return;
        const map = {};
        data.forEach((d) => { if (d.signedUrl && !d.error) map[d.path] = d.signedUrl; });
        setUrls(map);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(list.map((a) => a.path))]);

  const persist = useCallback(async (next, meta) => {
    if (collection && recordId) {
      await update(collection, recordId, { attachments: next }, meta);
    }
    onChange?.(next);
  }, [collection, recordId, onChange]);

  const handleFiles = async (files) => {
    const chosen = Array.from(files || []);
    if (!chosen.length) return;
    if (!recordId) {
      toast.error('Save the record first, then attach files to it.');
      return;
    }
    setBusy(true);
    const added = [];
    for (const file of chosen) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 15 MB and was skipped.`);
        continue;
      }
      const path = `${collection}/${recordId}/${Date.now()}-${safeName(file.name)}`;
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (error) {
        toast.error(`Upload failed for ${file.name}: ${error.message}`);
        continue;
      }
      added.push({
        path,
        name: file.name,
        size: file.size,
        type: file.type || '',
        uploadedAt: new Date().toISOString(),
      });
    }
    if (added.length) {
      try {
        await persist([...list, ...added], {
          action: 'attach',
          note: `Attached ${added.map((a) => a.name).join(', ')}`,
        });
        toast.success(added.length === 1 ? 'File attached' : `${added.length} files attached`);
      } catch (e) {
        toast.error(`Could not save the attachment: ${e.message}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemove = async (att) => {
    if (!window.confirm(`Remove ${att.name}? The file is deleted permanently.`)) return;
    setBusy(true);
    try {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.path]);
      await persist(list.filter((a) => a.path !== att.path), {
        action: 'detach', note: `Removed ${att.name}`,
      });
      toast.success('Attachment removed');
    } catch (e) {
      toast.error(`Could not remove the attachment: ${e.message}`);
    }
    setBusy(false);
  };

  return (
    <div className="no-print" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Paperclip size={14} style={{ color: 'var(--text2)' }} />
        <span style={{
          flex: 1, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem',
          color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {title}{list.length ? ` (${list.length})` : ''}
        </span>
        {!readOnly && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: 'none' }}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy || !recordId}
              title={recordId ? 'Attach a file' : 'Save the record first'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--bg3)', border: '1px solid var(--border2)',
                borderRadius: 7, color: 'var(--text)', padding: '5px 12px',
                fontSize: '0.78rem', fontFamily: 'var(--font-body)', fontWeight: 500,
                cursor: busy || !recordId ? 'not-allowed' : 'pointer',
                opacity: busy || !recordId ? 0.5 : 1,
              }}
            >
              {busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
              {busy ? 'Uploading…' : 'Add file'}
            </button>
          </>
        )}
      </div>

      {list.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: '0.8rem', lineHeight: 1.55 }}>
          {!recordId
            ? 'Save this record first — attachments are stored against it.'
            : (hint || 'Nothing attached yet. Add delivery notes, payment proofs or the supplier’s own copy.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((att) => {
            const url = urls[att.path];
            const Icon = isImage(att.type) ? ImageIcon : FileText;
            return (
              <div key={att.path} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', background: 'var(--bg3)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                {isImage(att.type) && url ? (
                  <img src={url} alt="" style={{
                    width: 38, height: 38, objectFit: 'cover', borderRadius: 6,
                    border: '1px solid var(--border2)', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                    background: 'var(--bg2)', border: '1px solid var(--border2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text3)',
                  }}>
                    <Icon size={16} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.82rem', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{att.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                    {[prettySize(att.size), att.uploadedAt && formatDateTime(att.uploadedAt)]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" title="Open"
                    style={{ display: 'inline-flex', color: 'var(--text2)', padding: 6 }}>
                    <ExternalLink size={14} />
                  </a>
                )}
                {!readOnly && (
                  <button onClick={() => handleRemove(att)} disabled={busy} title="Remove"
                    style={{ background: 'none', border: 'none', color: 'var(--red)',
                             cursor: busy ? 'not-allowed' : 'pointer', padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
