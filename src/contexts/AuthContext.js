// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword, signOut,
  onAuthStateChanged, createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          setProfile({ id: firebaseUser.uid, ...snap.data() });
        } else {
          // User exists in Firebase Auth but has no Firestore profile yet
          // Create a basic profile for them automatically
          const basicProfile = {
            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            role: 'viewer',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), basicProfile);
          setProfile({ id: firebaseUser.uid, ...basicProfile });
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const register = async (email, password, name, role = 'viewer') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      name,
      email,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return cred;
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
