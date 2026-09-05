// src/lib/permissions.js
//
// One place that describes every protected area of the ERP and what may be
// done inside it. Roles and per-user overrides are both expressed in the same
// shape:
//
//   { [moduleKey]: ['view', 'create', ...] }
//
// `'*'` inside a module's list means "every action this module supports", so
// presets stay readable and survive new actions being added later.

export const ACTIONS = [
  { key: 'view',   label: 'View',   desc: 'Open the page and read records' },
  { key: 'create', label: 'Create', desc: 'Add new records' },
  { key: 'edit',   label: 'Edit',   desc: 'Change existing records' },
  { key: 'delete', label: 'Delete', desc: 'Remove records' },
  { key: 'export', label: 'Export', desc: 'Download CSV / PDF' },
];

export const ACTION_KEYS = ACTIONS.map(a => a.key);

const FULL = ['view', 'create', 'edit', 'delete', 'export'];
const NO_DELETE = ['view', 'create', 'edit', 'export'];
const READ = ['view'];

// Every module the app can gate. `path` is the route the sidebar links to, so
// navigation and route guards read from this single list.
export const MODULES = [
  { key: 'dashboard',  label: 'Dashboard',         group: 'General',    path: '/',                     actions: ['view', 'export'] },
  { key: 'customers',  label: 'Customers',         group: 'Master Data', path: '/customers',           actions: FULL },
  { key: 'suppliers',  label: 'Suppliers',         group: 'Master Data', path: '/suppliers',           actions: FULL },
  { key: 'inventory',  label: 'Inventory Items',   group: 'Master Data', path: '/inventory',           actions: FULL },
  { key: 'warehouses', label: 'Warehouses',        group: 'Master Data', path: '/warehouses',          actions: FULL },
  { key: 'sales',      label: 'Sales Invoices',    group: 'Trading',    path: '/sales',                actions: FULL },
  { key: 'purchases',  label: 'Purchase Invoices', group: 'Trading',    path: '/purchases',            actions: FULL },
  { key: 'scan',       label: 'Scan Invoice (OCR)', group: 'Trading',   path: '/purchases/scan',       actions: ['view', 'create'] },
  { key: 'accounts',   label: 'Chart of Accounts', group: 'Accounting', path: '/accounting/accounts',  actions: FULL },
  { key: 'bank',       label: 'Bank & Cash',       group: 'Accounting', path: '/accounting/bank',      actions: FULL },
  { key: 'journals',   label: 'Journal Entries',   group: 'Accounting', path: '/accounting/journals',  actions: FULL },
  { key: 'payments',   label: 'Payments',          group: 'Accounting', path: '/accounting/payments',  actions: FULL },
  { key: 'expenses',   label: 'Expenses',          group: 'Accounting', path: '/accounting/expenses',  actions: FULL },
  { key: 'reports',    label: 'Reports',           group: 'Analytics',  path: '/reports',              actions: ['view', 'export'] },
  // View only by design: creating users and editing roles is the Admin role's
  // job, and the database enforces that (supabase/migrations/0002).
  { key: 'users',      label: 'Users & Roles',     group: 'System',     path: '/users',                actions: ['view'] },
  { key: 'import',     label: 'Data Import',       group: 'System',     path: '/import',               actions: ['view', 'create'] },
  { key: 'whatsapp',   label: 'WhatsApp',          group: 'System',     path: '/whatsapp',             actions: ['view', 'create'] },
  { key: 'settings',   label: 'Settings',          group: 'System',     path: '/settings',             actions: ['view', 'edit'] },
];

export const MODULE_GROUPS = MODULES.reduce((acc, m) => {
  (acc[m.group] = acc[m.group] || []).push(m);
  return acc;
}, {});

const BY_KEY = MODULES.reduce((acc, m) => { acc[m.key] = m; return acc; }, {});

export const getModule = (key) => BY_KEY[key];

/** Actions a module actually supports — used to keep stored maps honest. */
export const actionsFor = (key) => BY_KEY[key]?.actions || [];

// ── Building permission maps ────────────────────────────────────────────────

const pick = (keys, actions) =>
  keys.reduce((acc, k) => {
    const allowed = actions.filter(a => actionsFor(k).includes(a));
    if (allowed.length) acc[k] = allowed;
    return acc;
  }, {});

export const ALL_MODULE_KEYS = MODULES.map(m => m.key);

/** Every action on every module. */
export const fullAccess = () =>
  MODULES.reduce((acc, m) => { acc[m.key] = [...m.actions]; return acc; }, {});

/** Nothing at all. */
export const noAccess = () => ({});

/**
 * Drops unknown modules/actions and expands `'*'`, so a map coming from the
 * database can never grant something the app does not know about.
 */
export function normalize(perms) {
  const out = {};
  for (const [key, list] of Object.entries(perms || {})) {
    const supported = actionsFor(key);
    if (!supported.length) continue;
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    const expanded = arr.includes('*') ? supported : arr.filter(a => supported.includes(a));
    if (expanded.length) out[key] = [...new Set(expanded)];
  }
  return out;
}

/** True when `perms` allows `action` on `moduleKey`. */
export function can(perms, moduleKey, action = 'view') {
  const list = perms?.[moduleKey];
  if (!list) return false;
  return list.includes('*') || list.includes(action);
}

/** Count of granted actions — handy for summaries in the UI. */
export const countGrants = (perms) =>
  Object.values(normalize(perms)).reduce((n, list) => n + list.length, 0);

export const TOTAL_GRANTS = countGrants(fullAccess());

// ── Built-in roles ──────────────────────────────────────────────────────────

const OPERATIONS = ['customers', 'suppliers', 'inventory', 'warehouses', 'sales', 'purchases', 'scan'];
const ACCOUNTING = ['accounts', 'bank', 'journals', 'payments', 'expenses'];

export const BUILT_IN_ROLES = [
  {
    key: 'admin',
    label: 'Admin',
    color: 'red',
    description: 'Full access to every module, including users, roles and settings.',
    locked: true, // always full access; cannot be edited or emptied
    permissions: fullAccess(),
  },
  {
    key: 'manager',
    label: 'Manager',
    color: 'yellow',
    description: 'Runs day-to-day trading and accounting. Can see users but not change them.',
    permissions: {
      ...pick(['dashboard'], ['view', 'export']),
      ...pick(OPERATIONS, FULL),
      ...pick(ACCOUNTING, NO_DELETE),
      ...pick(['reports'], ['view', 'export']),
      ...pick(['import', 'whatsapp'], ['view', 'create']),
      ...pick(['users', 'settings'], READ),
    },
  },
  {
    key: 'accountant',
    label: 'Accountant',
    color: 'blue',
    description: 'Owns the accounting modules; reads the trading side.',
    permissions: {
      ...pick(['dashboard'], ['view', 'export']),
      ...pick(ACCOUNTING, NO_DELETE),
      ...pick(['sales', 'purchases'], ['view', 'export']),
      ...pick(['customers', 'suppliers', 'inventory', 'warehouses'], READ),
      ...pick(['reports'], ['view', 'export']),
    },
  },
  {
    key: 'staff',
    label: 'Staff',
    color: 'green',
    description: 'Creates and edits invoices and master data. No deletes, no accounting.',
    permissions: {
      ...pick(['dashboard'], READ),
      ...pick(OPERATIONS, ['view', 'create', 'edit']),
      ...pick(['reports'], READ),
    },
  },
  {
    key: 'viewer',
    label: 'Viewer',
    color: 'default',
    description: 'Read-only across trading, accounting and reports.',
    permissions: {
      ...pick(['dashboard'], READ),
      ...pick(OPERATIONS, READ),
      ...pick(ACCOUNTING, READ),
      ...pick(['reports'], READ),
    },
  },
];

export const BUILT_IN_KEYS = BUILT_IN_ROLES.map(r => r.key);

export const isLockedRole = (key) => key === 'admin';

/**
 * Built-in roles merged with the custom/overridden ones stored in `erp_roles`.
 * A stored role reusing a built-in key overrides that preset, except `admin`,
 * which stays at full access so an operator can never lock themselves out.
 */
export function mergeRoles(storedRoles = []) {
  const stored = (storedRoles || []).filter(r => r && r.key);
  const out = BUILT_IN_ROLES.map(base => {
    const override = stored.find(r => r.key === base.key);
    if (!override || base.locked) return { ...base, builtIn: true };
    return {
      ...base,
      ...override,
      key: base.key,
      builtIn: true,
      customised: true,
      permissions: normalize(override.permissions),
    };
  });
  for (const r of stored) {
    if (BUILT_IN_KEYS.includes(r.key)) continue;
    out.push({ color: 'purple', description: '', ...r, builtIn: false, permissions: normalize(r.permissions) });
  }
  return out;
}

export const findRole = (roles, key) => roles.find(r => r.key === key);

/** The permission map a role grants. Falls back to the most restrictive role. */
export function permissionsForRole(roleKey, roles) {
  const list = roles?.length ? roles : mergeRoles([]);
  const role = findRole(list, roleKey) || findRole(list, 'viewer');
  return normalize(role?.permissions);
}

/**
 * What a specific user may do. A profile can either inherit its role
 * (the default) or carry its own map when `permissionMode === 'custom'`.
 * Deactivated users get nothing; admins always get everything.
 */
export function resolveUserPermissions(profile, roles) {
  if (!profile) return {};
  if (profile.active === false) return {};
  if (profile.role === 'admin') return fullAccess();
  if (profile.permissionMode === 'custom') return normalize(profile.permissions);
  return permissionsForRole(profile.role, roles);
}

/** Turn a display name into a stable role key. */
export const slugifyRoleKey = (name) =>
  (name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
