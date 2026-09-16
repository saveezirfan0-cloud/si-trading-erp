// src/lib/audit.js — who did what, and when.
//
// Every write the app makes through src/lib/db.js is stamped with the acting
// user and appended to the erp_activity table as an immutable entry with a
// field-level diff. That table backs three things the office asked for:
//   * "created by / last updated by" on each record  (RecordMeta)
//   * the change history of one record               (ActivityFeed)
//   * the company-wide audit log                     (pages/audit/AuditLog)
//
// Logging is best-effort by design: if the trail cannot be written the save
// itself must still succeed, so failures are warned about, never thrown.
import { supabase } from './supabase';

export const ACTIVITY_TABLE = 'erp_activity';

// ── Current actor ────────────────────────────────────────────────────────────
// AuthContext calls setCurrentActor() as the profile loads and clears it on
// logout. db.js reads it on every write; nothing else needs to pass a user id
// around.
let currentActor = null;

export const setCurrentActor = (actor) => {
  currentActor = actor
    ? {
        id: actor.id || null,
        name: actor.name || actor.email || 'Unknown user',
        email: actor.email || null,
        role: actor.role || null,
      }
    : null;
};

export const getCurrentActor = () => currentActor;

// ── Labels ───────────────────────────────────────────────────────────────────
export const MODULE_LABELS = {
  erp_customers: 'Customers',
  erp_suppliers: 'Suppliers',
  erp_inventory: 'Inventory',
  erp_warehouses: 'Warehouses',
  erp_accounts: 'Chart of Accounts',
  erp_journals: 'Journal Entries',
  erp_transactions: 'Transactions',
  erp_payments: 'Payments',
  erp_expenses: 'Expenses',
  erp_users: 'Users',
  erp_roles: 'Roles',
  erp_imports: 'Data Imports',
  erp_settings: 'Settings',
  erp_sales_invoices: 'Sales Invoices',
  erp_purchase_invoices: 'Purchase Invoices',
  erp_brands: 'Brands',
  erp_ocr_drafts: 'Scan Drafts',
};

export const moduleLabel = (collection) =>
  MODULE_LABELS[collection] ||
  String(collection || '').replace(/^erp_/, '').replace(/_/g, ' ');

export const ACTIONS = {
  create:  { label: 'Created',            color: 'green'  },
  update:  { label: 'Edited',             color: 'blue'   },
  status:  { label: 'Status changed',     color: 'yellow' },
  delete:  { label: 'Moved to trash',     color: 'red'    },
  restore: { label: 'Restored',           color: 'green'  },
  purge:   { label: 'Deleted permanently',color: 'red'    },
  import:  { label: 'Imported',           color: 'purple' },
  attach:  { label: 'Attachment added',   color: 'purple' },
  detach:  { label: 'Attachment removed', color: 'red'    },
  share:   { label: 'Sharing changed',    color: 'blue'   },
};

export const actionLabel = (action) => ACTIONS[action]?.label || action;
export const actionColor = (action) => ACTIONS[action]?.color || 'default';

// camelCase / snake_case field name → "Camel case" heading
export const fieldLabel = (field) =>
  String(field || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

// Best guess at how a person refers to this record: "SI-0043", "Bosch GSB 550".
const LABEL_FIELDS = [
  'invoiceNo', 'number', 'reference', 'name', 'itemName', 'code',
  'title', 'accountName', 'description', 'email',
];

export const recordLabel = (doc, fallback = '') => {
  for (const f of LABEL_FIELDS) {
    const v = doc?.[f];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return fallback ? String(fallback).slice(0, 8) : '(untitled)';
};

// ── Diffing ──────────────────────────────────────────────────────────────────
// Bookkeeping fields would otherwise show up as a change on every single save.
const IGNORED_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt',
  'createdBy', 'createdByName', 'createdByEmail',
  'updatedBy', 'updatedByName', 'updatedByEmail',
  'deletedAt', 'deletedBy', 'deletedByName',
]);

const isEmpty = (v) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0);

const same = (a, b) => {
  if (a === b) return true;
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
};

const MAX_VALUE = 140;

// A short, human-readable rendering of a value for the history table. Line-item
// arrays become "4 lines" rather than a wall of JSON.
export const summarizeValue = (v) => {
  if (isEmpty(v)) return '—';
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? 'line' : 'lines'}`;
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + '…' : s;
    } catch { return '(object)'; }
  }
  const s = String(v);
  return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + '…' : s;
};

// [{ field, from, to }] for everything that actually changed.
export const diffDocs = (before, after) => {
  const a = before || {};
  const b = after || {};
  const changes = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (same(a[key], b[key])) continue;
    const bothArrays = Array.isArray(a[key]) && Array.isArray(b[key]);
    changes.push({
      field: key,
      from: summarizeValue(a[key]),
      to: bothArrays && a[key].length === b[key].length
        ? `${summarizeValue(b[key])} (edited)`
        : summarizeValue(b[key]),
    });
  }
  return changes.sort((x, y) => x.field.localeCompare(y.field));
};

// ── Writing ──────────────────────────────────────────────────────────────────
export const logActivity = async ({
  collection, recordId, action, label, changes, note,
}) => {
  const actor = getCurrentActor();
  const doc = {
    at: new Date().toISOString(),
    collection,
    module: moduleLabel(collection),
    recordId: recordId || null,
    label: label || null,
    action,
    changes: (changes || []).slice(0, 60),
    note: note || null,
    userId: actor?.id || null,
    userName: actor?.name || 'Unknown user',
    userEmail: actor?.email || null,
    userRole: actor?.role || null,
  };
  try {
    const { error } = await supabase.from(ACTIVITY_TABLE).insert({ doc });
    if (error) throw error;
  } catch (e) {
    // Never let an audit failure break the user's save.
    console.warn('activity log failed', e);
  }
};

// ── Reading ──────────────────────────────────────────────────────────────────
const flattenEntry = (row) => ({
  ...(row.doc || {}),
  id: row.id,
  createdAt: row.createdAt,
});

// History of one record, newest first.
export const fetchRecordActivity = async (collection, recordId, max = 100) => {
  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .select('*')
    .filter('doc->>collection', 'eq', collection)
    .filter('doc->>recordId', 'eq', recordId)
    .order('doc->>at', { ascending: false })
    .limit(max);
  if (error) throw error;
  return (data || []).map(flattenEntry);
};

// The company-wide log, newest first.
export const fetchActivity = async ({ collection, action, userId, from, to, max = 500 } = {}) => {
  let q = supabase.from(ACTIVITY_TABLE).select('*');
  if (collection) q = q.filter('doc->>collection', 'eq', collection);
  if (action) q = q.filter('doc->>action', 'eq', action);
  if (userId) q = q.filter('doc->>userId', 'eq', userId);
  if (from) q = q.filter('doc->>at', 'gte', from);
  if (to) q = q.filter('doc->>at', 'lte', to);
  const { data, error } = await q.order('doc->>at', { ascending: false }).limit(max);
  if (error) throw error;
  return (data || []).map(flattenEntry);
};

// Live audit log: initial fetch plus a refetch whenever a new entry lands.
export const subscribeActivity = (filters, callback) => {
  let cancelled = false;
  let timer = null;

  const load = async () => {
    try {
      const rows = await fetchActivity(filters);
      if (!cancelled) callback(rows);
    } catch (e) {
      console.error('activity fetch failed', e);
      if (!cancelled) callback([]);
    }
  };
  load();

  const channel = supabase
    .channel(`activity-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: ACTIVITY_TABLE }, () => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    })
    .subscribe();

  return () => { cancelled = true; clearTimeout(timer); supabase.removeChannel(channel); };
};
