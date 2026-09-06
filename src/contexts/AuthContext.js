// src/contexts/AuthContext.js — Supabase Auth + ERP permissions
import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, createIsolatedClient } from '../lib/supabase';
import { getAll, getOne, createWithId, setPermissionGate, COLLECTIONS } from '../lib/db';
import { can as canDo, mergeRoles, resolveUserPermissions } from '../lib/permissions';
import { setCurrentActor } from '../lib/audit';
import { Splash, ConnectionError } from '../components/Startup';

// How long to wait for the stored session before giving up on it. A request
// that never answers — a phone that has dropped off the network mid-flight —
// otherwise leaves the app hanging with nothing on screen.
const SESSION_TIMEOUT_MS = 15000;

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [storedRoles, setStoredRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  // Set when the database is reachable but the ERP schema is missing.
  const [schemaError, setSchemaError] = useState(null);
  // Set when the session could not be established at all, so the app has
  // nothing to render and must say so instead of showing an empty page.
  const [startupError, setStartupError] = useState(null);
  // Bumped by retry() to run the bootstrap effect again.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStartupError(null);
    setLoading(true);
    setAttempt(a => a + 1);
  }, []);

  // Custom + overridden roles live in erp_roles; the built-ins come from code.
  const refreshRoles = useCallback(async () => {
    try {
      const rows = await getAll(COLLECTIONS.ROLES);
      setStoredRoles(rows);
      return rows;
    } catch (e) {
      // A missing erp_roles table just means "no custom roles yet".
      console.warn('roles load failed', e?.message);
      setStoredRoles([]);
      return [];
    }
  }, []);

  const refreshProfile = useCallback(async (authUser) => {
    const target = authUser || user;
    if (!target) return null;
    const p = await getOne(COLLECTIONS.USERS, target.id);
    if (p) setProfile(p);
    return p;
  }, [user]);

  useEffect(() => {
    let mounted = true;

    // Nothing renders until `loading` clears, so every way out of this
    // bootstrap has to reach `ready()` — including the ones that fail. The
    // deadline below covers the whole of it, not just getSession(): the
    // profile read that follows stalls on a bad connection just as easily.
    let timer = null;
    const ready = () => {
      clearTimeout(timer);
      if (mounted) { setStartupError(null); setLoading(false); }
    };

    const loadProfile = async (authUser) => {
      if (!authUser) {
        setCurrentActor(null);
        if (mounted) { setUser(null); setProfile(null); setStoredRoles([]); }
        ready();
        return;
      }
      if (mounted) setUser(authUser);
      // Name the actor for the audit trail before any write can happen — the
      // profile row below is itself created through the logged data layer.
      setCurrentActor({
        id: authUser.id,
        name: authUser.user_metadata?.name || authUser.email,
        email: authUser.email,
      });
      try {
        let p = await getOne(COLLECTIONS.USERS, authUser.id);
        // A profile in the trash is revoked access, not a live account: an
        // admin removed it, and it stays restorable rather than being erased.
        // getOne deliberately reads deleted rows, so rule it out here.
        if (p?.deletedAt) p = { ...p, active: false, permissionMode: 'role', permissions: {} };
        if (!p) {
          // The very first sign-in bootstraps an admin so somebody can hand
          // out access. Anyone else who turns up without a profile — created
          // straight in the Supabase dashboard, say — lands as an inactive
          // viewer and waits for an admin to grant them access, rather than
          // letting an unknown login walk into the ERP.
          const existing = await getAll(COLLECTIONS.USERS);
          const isFirstUser = existing.length === 0;
          const basicProfile = {
            name: authUser.user_metadata?.name || authUser.email.split('@')[0],
            email: authUser.email,
            role: isFirstUser ? 'admin' : 'viewer',
            permissionMode: 'role',
            active: isFirstUser,
          };
          await createWithId(COLLECTIONS.USERS, authUser.id, basicProfile);
          p = { id: authUser.id, ...basicProfile };
        }
        if (mounted) setProfile(p);
        await refreshRoles();
      } catch (e) {
        console.error('profile load failed', e);
        // 42P01 = undefined_table: the schema migration has not been run yet.
        const missingSchema =
          e?.code === '42P01' || /relation .*erp_users.* does not exist/i.test(e?.message || '');
        if (mounted) setSchemaError(missingSchema ? 'missing-schema' : (e?.message || 'unknown'));
      }
      ready();
    };

    const fail = (e) => {
      clearTimeout(timer);
      // Offline, DNS failure, an unreachable project, or a stored token the
      // browser will not give back. None of them are recoverable here, but all
      // of them beat an empty page that never resolves.
      console.error('session load failed', e);
      if (mounted) {
        setStartupError(e?.message || 'The server could not be reached.');
        setLoading(false);
      }
    };

    timer = setTimeout(
      () => fail(new Error('The connection timed out.')),
      SESSION_TIMEOUT_MS,
    );

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return loadProfile(data?.session?.user ?? null);
      })
      .catch(fail);

    // A sign-in, a token refresh or a late session all arrive here. Each one
    // re-runs the bootstrap, so a screen left on the reconnect message heals
    // itself the moment the connection comes back.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user ?? null).catch(fail);
    });

    return () => { mounted = false; clearTimeout(timer); subscription.unsubscribe(); };
  }, [refreshRoles, attempt]);

  // Staff sign in with whatever they remember: their email, their phone number,
  // or a username. Supabase Auth keys on email, so an identifier that is not an
  // address is resolved to the account's (possibly synthetic) email first.
  const login = async (identifier, password) => {
    const typed = (identifier || '').trim();
    let email = typed;

    if (!typed.includes('@')) {
      const { data: resolved, error: rpcError } = await supabase
        .rpc('erp_login_email', { p_identifier: typed });
      if (rpcError) throw rpcError;
      if (!resolved) {
        const err = new Error('No account found with that phone number or username.');
        err.code = 'identifier_not_found';
        throw err;
      }
      email = resolved;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentActor(null);
  };

  // Emails a recovery link that lands on /reset-password, where the user picks
  // a new password.
  const sendPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  /**
   * Creates a login and its ERP profile.
   *
   * The sign-up runs on an isolated client so the admin doing the creating
   * keeps their own session (see createIsolatedClient). `extra` carries the
   * optional per-user permission override.
   */
  const register = async (email, password, name, role = 'viewer', extra = {}) => {
    const client = createIsolatedClient();
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { name } },
    });
    if (error) throw error;
    if (data.user) {
      await createWithId(COLLECTIONS.USERS, data.user.id, {
        name, email, role, active: true, permissionMode: 'role', ...extra,
      });
    }
    // The isolated client may hold a session for the new user; drop it.
    await client.auth.signOut().catch(() => {});
    return data;
  };

  const roles = useMemo(() => mergeRoles(storedRoles), [storedRoles]);
  const permissions = useMemo(() => resolveUserPermissions(profile, roles), [profile, roles]);

  /** can('sales', 'create') — the check every page and route guard uses. */
  const can = useCallback(
    (moduleKey, action = 'view') => canDo(permissions, moduleKey, action),
    [permissions]
  );

  const isAdmin = profile?.role === 'admin';

  // Every write records who made it (src/lib/db.js stamps the record and
  // appends to the activity log), so the trail follows the live profile —
  // a rename or a role change shows up on the next save.
  useEffect(() => {
    if (!user) { setCurrentActor(null); return; }
    setCurrentActor({
      id: user.id,
      name: profile?.name || user.user_metadata?.name || user.email,
      email: profile?.email || user.email,
      role: profile?.role || null,
    });
  }, [user, profile]);

  // Hand the data layer the current policy so every write in the app is
  // checked in one place (src/lib/db.js). Anyone may edit their own profile
  // row — name, phone, password — without holding the users permission.
  useEffect(() => {
    if (!profile) { setPermissionGate(null); return; }
    setPermissionGate((moduleKey, action, ctx) => {
      if (moduleKey === 'users' && action !== 'view') {
        // Anyone may edit their own profile row; administering other people's
        // access is the Admin role's, matching the database policy.
        const ownRow = ctx?.collection === COLLECTIONS.USERS && ctx?.id === profile.id;
        return (ownRow && action === 'edit') || profile.role === 'admin';
      }
      return canDo(permissions, moduleKey, action);
    });
    return () => setPermissionGate(null);
  }, [profile, permissions]);

  // Older call sites asked for coarse verbs; map them onto the module grid so
  // nothing that already used hasPermission() breaks.
  const LEGACY = {
    read: ['dashboard', 'view'],
    write: ['sales', 'create'],
    delete: ['sales', 'delete'],
    export: ['reports', 'export'],
    import: ['import', 'create'],
    manage_users: ['users', 'edit'],
  };
  const hasPermission = (perm) => {
    const mapped = LEGACY[perm];
    return mapped ? can(mapped[0], mapped[1]) : false;
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, schemaError, startupError, retry,
      login, logout, register, sendPasswordReset, updatePassword,
      roles, storedRoles, permissions, can, isAdmin, hasPermission,
      refreshRoles, refreshProfile,
    }}>
      {loading
        ? <Splash />
        : startupError
          ? <ConnectionError message={startupError} onRetry={retry} />
          : children}
    </AuthContext.Provider>
  );
};
