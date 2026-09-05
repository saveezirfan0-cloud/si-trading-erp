// src/lib/attachments.js — invoice attachments in Supabase Storage.
//
// The OCR screen already writes scans to the private `erp-scans` bucket as
// scans/<invoiceId>.jpg. Files attached by hand land beside them under
// attachments/<table>/<invoiceId>-<stamp>.<ext>, and the invoice doc keeps the
// object path in `attachmentPath`.
import { supabase } from './supabase';
import { update } from './db';

export const SCAN_BUCKET = 'erp-scans';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_ATTACHMENTS = 'image/*,application/pdf';

export const isPdf = (path = '') => /\.pdf$/i.test(path);

// The bucket is private, so every view needs a short-lived signed URL.
export const signedUrl = async (path, expiresIn = 3600) => {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SCAN_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
};

export const uploadAttachment = async (collection, invoiceId, file) => {
  if (!file) throw new Error('No file selected');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('File is larger than 10 MB');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `attachments/${collection}/${invoiceId}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage
    .from(SCAN_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (error) throw error;
  await update(collection, invoiceId, { attachmentPath: path, attachmentName: file.name });
  return path;
};

// Clears the reference first: an invoice pointing at a missing object is worse
// than an orphaned object, and the delete is best-effort either way.
export const removeAttachment = async (collection, invoiceId, path) => {
  await update(collection, invoiceId, { attachmentPath: '', attachmentName: '' });
  try {
    await supabase.storage.from(SCAN_BUCKET).remove([path]);
  } catch (e) {
    console.warn('attachment object delete failed', e);
  }
};
