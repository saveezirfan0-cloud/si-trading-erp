// src/lib/attachments.js — the paperwork attached to an invoice.
//
// One invoice can carry several documents: the photo an OCR scan came from,
// the supplier's own PDF, a signed delivery note, a payment slip. They are all
// described the same way here so the list's quick view and the invoice page
// show and manage the identical set.
//
// Three shapes exist in the data, for historical reasons, and this module
// flattens all of them into one list of entries:
//
//   doc.scanPath        — the OCR photo, written by the scan screen (erp-scans)
//   doc.attachmentPath  — the single file the quick view used to write (erp-scans)
//   doc.attachments[]   — any number of files, the shape everything writes now
//
// New uploads always go to the last one. The first two are read, shown and
// removable, so nothing attached before this is stranded.
import { supabase } from './supabase';
import { update } from './db';
import { getCurrentActor } from './audit';

export const SCAN_BUCKET = 'erp-scans';
export const ATTACHMENT_BUCKET = 'erp-attachments';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_ATTACHMENTS =
  'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

const SIGNED_URL_TTL = 60 * 60; // 1 hour

export const isPdf = (nameOrPath = '') => /\.pdf$/i.test(nameOrPath || '');
export const isImage = (entry) =>
  (entry?.type || '').startsWith('image/') ||
  (!entry?.type && /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(entry?.path || ''));

export const prettySize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ── Reading ──────────────────────────────────────────────────────────────────

// Every document on an invoice, oldest first: the scan, then the legacy single
// file, then whatever has been added since. `legacy` marks the two old fields
// so removal knows to clear them rather than edit the array.
export const attachmentEntries = (inv) => {
  const entries = [];
  if (inv?.scanPath) {
    entries.push({
      key: `scan:${inv.scanPath}`,
      path: inv.scanPath,
      bucket: SCAN_BUCKET,
      name: 'Scanned invoice',
      size: inv.scanSize,
      type: 'image/jpeg',
      uploadedAt: inv.scanUploadedAt,
      legacy: 'scan',
    });
  }
  if (inv?.attachmentPath) {
    entries.push({
      key: `file:${inv.attachmentPath}`,
      path: inv.attachmentPath,
      bucket: SCAN_BUCKET,
      name: inv.attachmentName || inv.attachmentPath.split('/').pop(),
      size: inv.attachmentSize,
      type: isPdf(inv.attachmentPath) ? 'application/pdf' : '',
      uploadedAt: inv.attachmentUploadedAt,
      legacy: 'attachment',
    });
  }
  for (const a of inv?.attachments || []) {
    if (!a?.path) continue;
    entries.push({
      key: `list:${a.path}`,
      path: a.path,
      bucket: a.bucket || ATTACHMENT_BUCKET,
      name: a.name || a.path.split('/').pop(),
      size: a.size,
      type: a.type || '',
      uploadedAt: a.uploadedAt,
      uploadedByName: a.uploadedByName,
      legacy: null,
    });
  }
  return entries;
};

// Counted without building the entries: the invoice lists ask this of every
// row on every render, and the answer is the same either way.
export const attachmentCount = (inv) =>
  (inv?.scanPath ? 1 : 0) +
  (inv?.attachmentPath ? 1 : 0) +
  (inv?.attachments || []).filter((a) => a?.path).length;

export const hasAttachment = (inv) => attachmentCount(inv) > 0;

// The buckets are private, so every view needs a short-lived signed URL.
export const signedUrl = async (path, expiresIn = SIGNED_URL_TTL, bucket = SCAN_BUCKET) => {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
};

// { [entry.key]: url } for a whole list, one request per bucket.
export const signedUrlsFor = async (entries = [], expiresIn = SIGNED_URL_TTL) => {
  const byBucket = new Map();
  entries.forEach((e) => {
    if (!e?.path) return;
    const list = byBucket.get(e.bucket) || [];
    list.push(e);
    byBucket.set(e.bucket, list);
  });

  const urls = {};
  await Promise.all([...byBucket.entries()].map(async ([bucket, list]) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket).createSignedUrls(list.map((e) => e.path), expiresIn);
      if (error || !data) return;
      const byPath = Object.fromEntries(
        data.filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl])
      );
      list.forEach((e) => { if (byPath[e.path]) urls[e.key] = byPath[e.path]; });
    } catch (e) {
      console.warn('signed urls failed for', bucket, e);
    }
  }));
  return urls;
};

// ── Writing ──────────────────────────────────────────────────────────────────

// Storage rejects a lot of what a phone will name a file.
const safeName = (name) => (name || 'file').replace(/[^\w.-]+/g, '_').slice(-80);

/**
 * Uploads files and records them on the invoice. Returns { added, skipped }.
 * Files that are too large, or that storage refuses, are reported rather than
 * silently dropped — a missing attachment the user believes they have is
 * worse than an error.
 */
export const uploadAttachments = async (collection, invoiceId, files, invoice) => {
  if (!invoiceId) throw new Error('Save the record first, then attach files to it.');
  const chosen = Array.from(files || []);
  const added = [];
  const skipped = [];
  const actor = getCurrentActor();

  for (const file of chosen) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      skipped.push(`${file.name} is larger than ${prettySize(MAX_ATTACHMENT_BYTES)}`);
      continue;
    }
    const path = `${collection}/${invoiceId}/${Date.now().toString(36)}-${safeName(file.name)}`;
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) {
      skipped.push(`${file.name}: ${error.message}`);
      continue;
    }
    added.push({
      path,
      bucket: ATTACHMENT_BUCKET,
      name: file.name,
      size: file.size,
      type: file.type || '',
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor?.id || null,
      uploadedByName: actor?.name || 'Unknown user',
    });
  }

  if (added.length) {
    await update(
      collection, invoiceId,
      { attachments: [...(invoice?.attachments || []), ...added] },
      { action: 'attach', note: `Attached ${added.map((a) => a.name).join(', ')}` },
    );
  }
  return { added, skipped };
};

/**
 * Removes one entry, whichever of the three shapes it came from. The reference
 * on the invoice goes first: an invoice pointing at a missing object is worse
 * than an orphaned object, and the storage delete is best-effort either way.
 */
export const removeAttachmentEntry = async (collection, invoiceId, entry, invoice) => {
  if (!entry?.path) return;

  const patch = entry.legacy === 'scan'
    ? { scanPath: '', scanUploadedAt: '', scanSize: 0 }
    : entry.legacy === 'attachment'
      ? { attachmentPath: '', attachmentName: '', attachmentUploadedAt: '', attachmentSize: 0 }
      : { attachments: (invoice?.attachments || []).filter((a) => a.path !== entry.path) };

  await update(collection, invoiceId, patch, {
    action: 'detach', note: `Removed ${entry.name}`,
  });

  try {
    await supabase.storage.from(entry.bucket).remove([entry.path]);
  } catch (e) {
    console.warn('attachment object delete failed', e);
  }
};
