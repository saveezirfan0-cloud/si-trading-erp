// src/lib/supabase.js
//
// The Supabase project is supplied entirely through environment variables so
// the app is not bound to any particular project. Set these in Vercel
// (Project → Settings → Environment Variables) and in .env.local for local
// development:
//
//   REACT_APP_SUPABASE_URL       https://<your-project-ref>.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY  the project's publishable / anon key
//
// Both are publishable, browser-safe values — never put a service-role key here.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (process.env.REACT_APP_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

// Whether the app has been pointed at a Supabase project yet.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// When unconfigured we still export a client object so imports don't explode at
// module load; every call rejects with a clear, actionable message and the UI
// shows the setup screen instead.
const notConfigured = () =>
  Promise.reject(new Error(
    'Supabase is not configured. Set REACT_APP_SUPABASE_URL and ' +
    'REACT_APP_SUPABASE_ANON_KEY, then redeploy.'
  ));

const stub = () => {
  const table = {
    select: notConfigured, insert: notConfigured, update: notConfigured,
    upsert: notConfigured, delete: notConfigured,
    eq: () => table, filter: () => table, order: () => table,
    limit: () => table, maybeSingle: notConfigured, single: notConfigured,
    then: (resolve, reject) => notConfigured().then(resolve, reject),
  };
  return {
    from: () => table,
    channel: () => ({ on: function () { return this; }, subscribe: () => {} }),
    removeChannel: () => {},
    functions: { invoke: notConfigured },
    storage: { from: () => ({ upload: notConfigured, download: notConfigured }) },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: notConfigured,
      signUp: notConfigured,
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: notConfigured,
      updateUser: notConfigured,
    },
  };
};

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : stub();

// A throwaway client that never reads or writes the stored session.
//
// signUp() replaces the caller's own session with the brand-new user's, which
// would silently log an admin out of their own account the moment they add
// someone. Signing the new user up on an isolated client keeps the admin
// signed in; the ERP profile row is then written with the real `supabase`
// client, which still carries the admin's credentials.
export const createIsolatedClient = () =>
  isSupabaseConfigured
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'erp-isolated-auth',
        },
      })
    : stub();

export default supabase;
