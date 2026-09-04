// src/contexts/AuthContext.js — Supabase Auth
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOne, createWithId, COLLECTIONS } from '../lib/db';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (authUser) => {
      if (!authUser) {
        if (mounted) { setUser(null); setProfile(null); setLoading(false); }
        return;
      }
      if (mounted) setUser(authUser);
      try {
        let p = await getOne(COLLECTIONS.USERS, authUser.id);
        if (!p) {
          const basicProfile = {
            name: authUser.user_metadata?.name || authUser.email.split('@')[0],
            email: authUser.email,
            role: 'admin', // first login bootstraps as admin; manage roles in Users
            active: true,
          };
          await createWithId(COLLECTIONS.USERS, authUser.id, basicProfile);
          p = { id: authUser.id, ...basicProfile };
        }
        if (mounted) setProfile(p);
      } catch (e) {
        console.error('profile load failed', e);
      }
      if (mounted) setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadProfile(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user ?? null);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const register = async (email, password, name, role = 'viewer') => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name } },
    });
    if (error) throw error;
    if (data.user) {
      await createWithId(COLLECTIONS.USERS, data.user.id, {
        name, email, role, active: true,
      });
    }
    return data;
  };

  const hasPermission = (perm) => {
    const rolePerms = {
      admin: ['read', 'write', 'delete', 'export', 'import', 'manage_users'],
      manager: ['read', 'write', 'export', 'import'],
      accountant: ['read', 'write', 'export'],
      staff: ['read', 'write'],
      viewer: ['read'],
    };
    return rolePerms[profile?.role]?.includes(perm) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, register, hasPermission }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
