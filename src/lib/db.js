// src/lib/db.js
import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
  serverTimestamp, writeBatch, onSnapshot,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'firebase/firestore';
import { db } from './firebase';

export const COLLECTIONS = {
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  INVENTORY: 'inventory',
  WAREHOUSES: 'warehouses',
  ACCOUNTS: 'accounts',
  JOURNALS: 'journals',
  TRANSACTIONS: 'transactions',
  PAYMENTS: 'payments',
  EXPENSES: 'expenses',
  USERS: 'users',
  ROLES: 'roles',
  IMPORTS: 'imports',
  SETTINGS: 'settings',
  SALES_INVOICES: 'sales_invoices',
  PURCHASE_INVOICES: 'purchase_invoices',
  BRANDS: 'brands',
};

export const getAll = async (col, constraints = []) => {
  const q = constraints.length
    ? query(collection(db, col), ...constraints)
    : collection(db, col);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getOne = async (col, id) => {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const create = async (col, data) => {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(collection(db, col), {
    ...clean,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const update = async (col, id, data) => {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await updateDoc(doc(db, col, id), {
    ...clean,
    updatedAt: serverTimestamp(),
  });
};

export const remove = async (col, id) => {
  await deleteDoc(doc(db, col, id));
};

export const subscribe = (col, callback, constraints = []) => {
  const q = constraints.length
    ? query(collection(db, col), ...constraints)
    : collection(db, col);
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Firestore listen error:', err);
  });
};

export const batchCreate = async (col, items) => {
  const batch = writeBatch(db);
  items.forEach(item => {
    const ref = doc(collection(db, col));
    const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
    batch.set(ref, { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
};

export { orderBy, where, limit };
