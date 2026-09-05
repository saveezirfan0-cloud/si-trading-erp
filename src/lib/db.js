// src/lib/db.js — Supabase-backed document store.
//
// Tables are namespaced erp_* and each row is (id uuid, doc jsonb,
// createdAt, updatedAt). This module keeps the same API surface the app used
// against Firestore, so pages work unchanged: rows come back flattened as
// { id, ...doc, createdAt, updatedAt }.
//
// Three behaviours are layered on top of that, and every page gets them free:
//
//   Permissions — every write is checked against the current user's module
//   grid before it leaves the browser (see the permission gate below).
//
//   Attribution — writes stamp createdBy/updatedBy (id + name) into the doc and
//   append an entry to the activity log (src/lib/audit.js) with a field-level
//   diff, so every record can say who last touched it and what they changed.
//
//   Trash — remove() is a *soft* delete: it stamps doc.deletedAt instead of
//   dropping the row, and every list query filters those out. Deleted records
//   stay restorable from the Trash page until someone purges them.
import { supabase } from './supabase';
import { actionsFor, getModule } from './permissions';
import { diffDocs, logActivity, getCurrentActor, recordLabel } from './audit';

export const COLLECTIONS = {
  CUSTOMERS: 'erp_customers',
  SUPPLIERS: 'erp_suppliers',
  INVENTORY: 'erp_inventory',
  WAREHOUSES: 'erp_warehouses',
  ACCOUNTS: 'erp_accounts',
  JOURNALS: 'erp_journals',
  TRANSACTIONS: 'erp_transactions',
  PAYMENTS: 'erp_payments',
  EXPENSES: 'erp_expenses',
  USERS: 'erp_users',
  ROLES: 'erp_roles',
  IMPORTS: 'erp_imports',
  SETTINGS: 'erp_settings',
  SALES_INVOICES: 'erp_sales_invoices',
  PURCHASE_INVOICES: 'erp_purchase_invoices',
  BRANDS: 'erp_brands',
  OCR_DRAFTS: 'erp_ocr_drafts',
  ACTIVITY: 'erp_activity',
};

// Every table a deleted record can sit in — the Trash page sweeps these.
export const TRASHABLE_COLLECTIONS = [
  COLLECTIONS.SALES_INVOICES, COLLECTIONS.PURCHASE_INVOICES,
  COLLECTIONS.CUSTOMERS, COLLECTIONS.SUPPLIERS, COLLECTIONS.INVENTORY,
  COLLECTIONS.WAREHOUSES, COLLECTIONS.PAYMENTS, COLLECTIONS.EXPENSES,
  COLLECTIONS.JOURNALS, COLLECTIONS.ACCOUNTS, COLLECTIONS.BRANDS,
  // Removing someone's ERP access deletes their profile row; keeping it here
  // means an admin can put it back, and AuthContext treats a trashed profile
  // as revoked in the meantime.
  COLLECTIONS.USERS,
];

// ── Permission gate ─────────────────────────────────────────────────────────
//
// Every page writes through this module, so enforcing permissions here covers
// all of them at once instead of relying on each screen to hide its own
// buttons. Reads stay open: the dashboard and reports legitimately aggregate
// across modules, and viewing is already gated by the routes and the sidebar.

/** Which permission module owns each table. */
export const COLLECTION_MODULES = {
  [COLLECTIONS.CUSTOMERS]: 'customers',
  [COLLECTIONS.SUPPLIERS]: 'suppliers',
  [COLLECTIONS.INVENTORY]: 'inventory',
  [COLLECTIONS.WAREHOUSES]: 'warehouses',
  [COLLECTIONS.ACCOUNTS]: 'accounts',
  [COLLECTIONS.JOURNALS]: 'journals',
  [COLLECTIONS.TRANSACTIONS]: 'bank',
  [COLLECTIONS.PAYMENTS]: 'payments',
  [COLLECTIONS.EXPENSES]: 'expenses',
  [COLLECTIONS.SALES_INVOICES]: 'sales',
  [COLLECTIONS.PURCHASE_INVOICES]: 'purchases',
  [COLLECTIONS.OCR_DRAFTS]: 'scan',
  [COLLECTIONS.IMPORTS]: 'import',
  [COLLECTIONS.USERS]: 'users',
  [COLLECTIONS.ROLES]: 'users',
  [COLLECTIONS.BRANDS]: 'settings',
  [COLLECTIONS.SETTINGS]: 'settings',
  // The activity log is append-only and is written by src/lib/audit.js rather
  // than through this module, so nothing here ever gates it; the mapping is
  // what the Audit Log page's own view permission is named after.
  [COLLECTIONS.ACTIVITY]: 'audit',
};

// Installed by AuthContext once a profile is known: (module, action, ctx) => boolean.
let permissionGate = null;
export const setPermissionGate = (fn) => { permissionGate = fn; };

export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
    this.code = 'permission-denied';
  }
}

const assertAllowed = (col, action, id) => {
  if (!permissionGate) return;              // gate not installed yet (e.g. sign-in bootstrap)
  const moduleKey = COLLECTION_MODULES[col];
  if (!moduleKey) return;                   // unknown table: nothing to enforce
  // Modules without a create/delete of their own (Settings, say) fall back to
  // their edit permission; the rest are passed through for the gate to judge.
  const supported = actionsFor(moduleKey);
  const needed = supported.includes(action) ? action
    : supported.includes('edit') ? 'edit'
    : action;
  if (!permissionGate(moduleKey, needed, { collection: col, id })) {
    const label = getModule(moduleKey)?.label || moduleKey;
    throw new PermissionError(`You do not have permission to ${action} ${label}.`);
  }
};

const flatten = (row) =>
  row ? { ...(row.doc || {}), id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;

const toDoc = (data) => {
  const doc = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined) continue;
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt') continue;
    doc[k] = v;
  }
  return doc;
};

// Who is saving. Falls back to nulls when nobody is signed in (imports run by
// a script, say) so the trail still records that the write happened.
const actorStamp = (prefix) => {
  const actor = getCurrentActor();
  return {
    [`${prefix}By`]: actor?.id || null,
    [`${prefix}ByName`]: actor?.name || 'Unknown user',
    [`${prefix}ByEmail`]: actor?.email || null,
  };
};

// Lightweight constraint objects (Firestore-compatible signatures)
export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir });
export const limit = (n) => ({ kind: 'limit', n });

const OPS = { '==': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };

const applyConstraints = (q, constraints) => {
  for (const c of constraints || []) {
    if (!c) continue;
    if (c.kind === 'where') {
      const op = OPS[c.op] || 'eq';
      q = q.filter(`doc->>${c.field}`, op, c.value);
    } else if (c.kind === 'orderBy') {
      const col = ['createdAt', 'updatedAt', 'id'].includes(c.field)
        ? `"${c.field}"` : `doc->>${c.field}`;
      q = q.order(col, { ascending: c.dir !== 'desc' });
    } else if (c.kind === 'limit') {
      q = q.limit(c.n);
    }
  }
  return q;
};

// Trashed records are invisible everywhere except the Trash page, which passes
// { includeDeleted: true } or calls getDeleted().
const notDeleted = (q) => q.filter('doc->>deletedAt', 'is', null);

export const getAll = async (col, constraints = [], { includeDeleted = false } = {}) => {
  let q = supabase.from(col).select('*');
  if (!includeDeleted) q = notDeleted(q);
  q = applyConstraints(q, constraints);
  if (!(constraints || []).some((c) => c?.kind === 'orderBy')) {
    q = q.order('createdAt', { ascending: true });
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(flatten);
};

// Everything currently in the trash for one table, most recently deleted first.
export const getDeleted = async (col) => {
  const { data, error } = await supabase
    .from(col).select('*')
    .not('doc->>deletedAt', 'is', null)
    .order('doc->>deletedAt', { ascending: false });
  if (error) throw error;
  return (data || []).map(flatten);
};

// Reads a record whether or not it is in the trash — the Trash page and the
// audit log both need to show deleted records.
export const getOne = async (col, id) => {
  const { data, error } = await supabase.from(col).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return flatten(data);
};

export const create = async (col, data) => {
  assertAllowed(col, 'create');
  const doc = { ...toDoc(data), ...actorStamp('created'), ...actorStamp('updated') };
  const { data: row, error } = await supabase
    .from(col).insert({ doc }).select('id').single();
  if (error) throw error;
  await logActivity({
    collection: col, recordId: row.id, action: 'create',
    label: recordLabel(doc, row.id), changes: [],
  });
  return row.id;
};

// Create/replace a row with a caller-chosen id (used for user profiles)
export const createWithId = async (col, id, data) => {
  const doc = { ...toDoc(data), ...actorStamp('created'), ...actorStamp('updated') };
  const { error } = await supabase.from(col).upsert({ id, doc });
  if (error) throw error;
  await logActivity({
    collection: col, recordId: id, action: 'create',
    label: recordLabel(doc, id), changes: [],
  });
  return id;
};

// Partial update, Firestore-style: read-modify-write merge, with the diff
// between old and new recorded in the activity log.
//
// `meta` lets a caller label the reason for a write — { action: 'status',
// note: 'Approved by manager' } — instead of it showing up as a plain edit.
export const update = async (col, id, data, meta = {}) => {
  assertAllowed(col, 'edit', id);
  const { data: existing, error: readErr } = await supabase
    .from(col).select('doc').eq('id', id).maybeSingle();
  if (readErr) throw readErr;

  const before = existing?.doc || {};
  const merged = { ...before, ...toDoc(data), ...actorStamp('updated') };
  const { error } = await supabase.from(col).update({ doc: merged }).eq('id', id);
  if (error) throw error;

  const changes = diffDocs(before, merged);
  // A save that changed nothing is noise in the history — unless the caller
  // attached a reason to it.
  if (changes.length || meta.action || meta.note) {
    await logActivity({
      collection: col, recordId: id,
      action: meta.action || 'update',
      label: meta.label || recordLabel(merged, id),
      changes, note: meta.note,
    });
  }
};

// Soft delete — the record moves to Trash and can be restored.
export const remove = async (col, id, meta = {}) => {
  assertAllowed(col, 'delete', id);
  const { data: existing, error: readErr } = await supabase
    .from(col).select('doc').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return;

  const actor = getCurrentActor();
  const doc = {
    ...(existing.doc || {}),
    deletedAt: new Date().toISOString(),
    deletedBy: actor?.id || null,
    deletedByName: actor?.name || 'Unknown user',
  };
  const { error } = await supabase.from(col).update({ doc }).eq('id', id);
  if (error) throw error;

  await logActivity({
    collection: col, recordId: id, action: 'delete',
    label: recordLabel(doc, id), changes: [], note: meta.note,
  });
};

// Bring a record back out of the trash. Restoring is an edit of an existing
// record, so it needs the module's edit permission.
export const restore = async (col, id) => {
  assertAllowed(col, 'edit', id);
  const { data: existing, error: readErr } = await supabase
    .from(col).select('doc').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return;

  const doc = { ...(existing.doc || {}), ...actorStamp('updated') };
  delete doc.deletedAt;
  delete doc.deletedBy;
  delete doc.deletedByName;
  // Replace the whole doc rather than merging, so the delete markers really go.
  const { error } = await supabase.from(col).update({ doc }).eq('id', id);
  if (error) throw error;

  await logActivity({
    collection: col, recordId: id, action: 'restore',
    label: recordLabel(doc, id), changes: [],
  });
};

// Permanent delete. The row is gone; only the audit entry remains.
export const purge = async (col, id) => {
  assertAllowed(col, 'delete', id);
  const { data: existing } = await supabase.from(col).select('doc').eq('id', id).maybeSingle();
  const label = recordLabel(existing?.doc || {}, id);
  const { error } = await supabase.from(col).delete().eq('id', id);
  if (error) throw error;
  await logActivity({
    collection: col, recordId: id, action: 'purge', label, changes: [],
  });
};

// Initial fetch + realtime refetch on any change to the table.
export const subscribe = (col, callback, constraints = [], options = {}) => {
  let cancelled = false;
  let timer = null;

  const fetchAll = async () => {
    try {
      const rows = await getAll(col, constraints, options);
      if (!cancelled) callback(rows);
    } catch (err) {
      console.error('subscribe fetch error:', col, err);
    }
  };

  fetchAll();

  const channel = supabase
    .channel(`db-${col}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: col }, () => {
      // debounce bursts of changes into one refetch
      clearTimeout(timer);
      timer = setTimeout(fetchAll, 250);
    })
    .subscribe();

  return () => {
    cancelled = true;
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
};

// Bulk insert (CSV import, OCR seeding). One audit entry for the whole batch —
// a per-row entry would bury the log under hundreds of identical lines.
export const batchCreate = async (col, items, meta = {}) => {
  assertAllowed(col, 'create');
  const stamp = { ...actorStamp('created'), ...actorStamp('updated') };
  const rows = items.map((item) => ({ doc: { ...toDoc(item), ...stamp } }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(col).insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  if (rows.length) {
    await logActivity({
      collection: col, recordId: null, action: 'import',
      label: `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`,
      changes: [], note: meta.note || null,
    });
  }
};
