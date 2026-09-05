// src/components/ui/Attachments.js
//
// The paperwork on an invoice, in one place: the photo an OCR scan came from,
// the supplier's own PDF, a signed delivery note, a payment slip. It renders
// whatever src/lib/attachments.js finds on the record — including files
// attached before the multi-file store existed — and every add or remove lands
// in the invoice's history.
//
// Used by the invoice pages (as a panel) and by the list's quick view (plain,
// inside the modal's own chrome).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Paperclip, Upload, Trash2, ExternalLink, FileText, Image as ImageIcon,
  Loader2, Download,
} from 'lucide-react';
import {
  attachmentEntries, signedUrlsFor, uploadAttachments, removeAttachmentEntry,
  isImage, prettySize, ACCEPTED_ATTACHMENTS, MAX_ATTACHMENT_BYTES,
} from '../../lib/attachments';
import { formatDateTime } from '../../lib/datetime';

export default function Attachments({
  collection,
  invoice,
  canEdit = false,
  onChanged,
  title = 'Attachments',
  hint,
  variant = 'panel',   // 'panel' on the invoice page, 'plain' inside a modal
}) {
  const entries = attachmentEntries(invoice);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const recordId = invoice?.id;

  // Signed links, refreshed whenever the set of files changes.
  const keys = entries.map((e) => e.key).join('|');
  useEffect(() => {
    let alive = true;
    if (!entries.length) { setUrls({}); return undefined; }
    signedUrlsFor(entries).then((map) => { if (alive) setUrls(map); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const handleFiles = useCallback(async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { added, skipped } = await uploadAttachments(collection, recordId, files, invoice);
      skipped.forEach((why) => toast.error(why));
      if (added.length) {
        toast.success(added.length === 1 ? 'File attached' : `${added.length} files attached`);
        onChanged?.();
      }
    } catch (e) {
      toast.error(e.message || 'Upload failed');
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [collection, recordId, invoice, onChanged]);

  const handleRemove = async (entry) => {
    if (!window.confirm(`Remove ${entry.name}? The file is deleted permanently.`)) return;
    setBusy(true);
    try {
      await removeAttachmentEntry(collection, recordId, entry, invoice);
      toast.success('Attachment removed');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Could not remove the attachment');
    }
    setBusy(false);
  };

  const addButton = canEdit && (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_ATTACHMENTS}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy || !recordId}
        title={recordId ? `Attach a file (max ${prettySize(MAX_ATTACHMENT_BYTES)})` : 'Save the record first'}
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
        {busy ? 'Working…' : 'Add file'}
      </button>
    </>
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <Paperclip size={14} style={{ color: 'var(--text2)' }} />
      <span style={{
        flex: 1, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem',
        color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {title}{entries.length ? ` (${entries.length})` : ''}
      </span>
      {addButton}
    </div>
  );

  const body = entries.length === 0 ? (
    <div style={{ color: 'var(--text3)', fontSize: '0.8rem', lineHeight: 1.55 }}>
      {!recordId
        ? 'Save this record first — attachments are stored against it.'
        : (hint || 'Nothing attached yet.') + (canEdit ? '' : ' You do not have permission to add one.')}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((entry) => {
        const url = urls[entry.key];
        const Icon = isImage(entry) ? ImageIcon : FileText;
        return (
          <div key={entry.key} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', background: 'var(--bg3)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          }}>
            {isImage(entry) && url ? (
              <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexShrink: 0 }}>
                <img src={url} alt="" style={{
                  width: 42, height: 42, objectFit: 'cover', borderRadius: 6,
                  border: '1px solid var(--border2)',
                }} />
              </a>
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: 6, flexShrink: 0,
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
              }}>{entry.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                {[
                  entry.legacy === 'scan' ? 'From the OCR scan' : null,
                  prettySize(entry.size),
                  entry.uploadedAt && formatDateTime(entry.uploadedAt),
                  entry.uploadedByName,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>

            {url && (
              <>
                <a href={url} target="_blank" rel="noreferrer" title="Open"
                  style={{ display: 'inline-flex', color: 'var(--text2)', padding: 6 }}>
                  <ExternalLink size={14} />
                </a>
                <a href={url} download={entry.name} title="Download"
                  style={{ display: 'inline-flex', color: 'var(--text2)', padding: 6 }}>
                  <Download size={14} />
                </a>
              </>
            )}
            {canEdit && (
              <button onClick={() => handleRemove(entry)} disabled={busy} title="Remove"
                style={{ background: 'none', border: 'none', color: 'var(--red)',
                         cursor: busy ? 'not-allowed' : 'pointer', padding: 6 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  if (variant === 'plain') return <div className="no-print">{header}{body}</div>;

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
