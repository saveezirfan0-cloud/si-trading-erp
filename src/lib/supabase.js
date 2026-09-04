// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Publishable credentials (safe to ship to the browser). Override via env.
const SUPABASE_URL =
  process.env.REACT_APP_SUPABASE_URL || 'https://vdrhjjkcnkbzaxuaoonb.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  'sb_publishable_YfX8ya6-Q67tiXIiOJpixg_-RnJRYtw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
