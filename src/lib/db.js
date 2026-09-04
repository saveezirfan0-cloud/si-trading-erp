// src/lib/db.js — Supabase-backed document store.
//
// Tables are namespaced erp_* and each row is (id uuid, doc jsonb,
// createdAt, updatedAt). This module keeps the same API surface the app used
// against Firestore, so pages work unchanged: rows come back flattened as
// { id, ...doc, createdAt, updatedAt }.
import { supabase } from './supabase';
import { actionsFor, getModule } from './permissions';

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
};

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

export const getAll = async (col, constraints = []) => {
  let q = supabase.from(col).select('*');
  q = applyConstraints(q, constraints);
  if (!(constraints || []).some((c) => c?.kind === 'orderBy')) {
    q = q.order('createdAt', { ascending: true });
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(flatten);
};

export const getOne = async (col, id) => {
  const { data, error } = await supabase.from(col).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return flatten(data);
};

export const create = async (col, data) => {
  assertAllowed(col, 'create');
  const { data: row, error } = await supabase
    .from(col).insert({ doc: toDoc(data) }).select('id').single();
  if (error) throw error;
  return row.id;
};

// Create/replace a row with a caller-chosen id (used for user profiles)
export const createWithId = async (col, id, data) => {
  const { error } = await supabase.from(col).upsert({ id, doc: toDoc(data) });
  if (error) throw error;
  return id;
};

export const update = async (col, id, data) => {
  assertAllowed(col, 'edit', id);
  // read-modify-write merge so partial updates behave like Firestore updateDoc
  const { data: existing, error: readErr } = await supabase
    .from(col).select('doc').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  const merged = { ...(existing?.doc || {}), ...toDoc(data) };
  const { error } = await supabase.from(col).update({ doc: merged }).eq('id', id);
  if (error) throw error;
};

export const remove = async (col, id) => {
  assertAllowed(col, 'delete', id);
  const { error } = await supabase.from(col).delete().eq('id', id);
  if (error) throw error;
};

// Initial fetch + realtime refetch on any change to the table.
export const subscribe = (col, callback, constraints = []) => {
  let cancelled = false;
  let timer = null;

  const fetchAll = async () => {
    try {
      const rows = await getAll(col, constraints);
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

export const batchCreate = async (col, items) => {
  assertAllowed(col, 'create');
  const rows = items.map((item) => ({ doc: toDoc(item) }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(col).insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
};
