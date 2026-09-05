// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import Layout from './components/layout/Layout';
import InstallBanner from './components/ui/InstallBanner';
import { useViewportHeight } from './hooks/useMobile';
import './styles/globals.css';

import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Customers from './pages/customers/Customers';
import Suppliers from './pages/suppliers/Suppliers';
import Inventory from './pages/inventory/Inventory';
import Warehouses from './pages/warehouses/Warehouses';
import SalesInvoices from './pages/sales/SalesInvoices';
import QuickInvoice from './pages/sales/QuickInvoice';
import PurchaseInvoices from './pages/purchases/PurchaseInvoices';
import ScanInvoice from './pages/purchases/ScanInvoice';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import BankCash from './pages/accounting/BankCash';
import Journals from './pages/accounting/Journals';
import Payments from './pages/accounting/Payments';
import Expenses from './pages/accounting/Expenses';
import Reports from './pages/reports/Reports';
import Users from './pages/users/Users';
import AuditLog from './pages/audit/AuditLog';
import Trash from './pages/trash/Trash';
import Import from './pages/import/Import';
import WhatsApp from './pages/WhatsApp';
import Settings from './pages/Settings';
import SetupRequired from './pages/SetupRequired';
import { isSupabaseConfigured } from './lib/supabase';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

// Signed in, database reachable, but the tables are absent — tell the operator
// exactly what to do instead of showing empty lists and a "viewer" role.
function SchemaBanner() {
  const { schemaError } = useAuth();
  if (schemaError !== 'missing-schema') return null;
  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 400,
      background: 'var(--bg2)', border: '1px solid var(--red)',
      borderLeft: '4px solid var(--red)', borderRadius: 'var(--radius)',
      padding: '12px 16px', boxShadow: 'var(--shadow)', maxWidth: 620,
      margin: '0 auto', fontSize: '0.85rem', lineHeight: 1.55,
    }}>
      <strong style={{ color: 'var(--red)' }}>Database schema not applied.</strong>{' '}
      Your Supabase project is connected but has no ERP tables yet, so nothing can
      load or save. In the Supabase dashboard open <em>SQL Editor</em>, paste the
      contents of <code style={{ fontFamily: 'var(--font-mono)' }}>
      supabase/migrations/0001_erp_schema.sql</code> from this repository, and run it.
      Then reload this page.
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      {/* Public: the emailed recovery link lands here, signed in or not. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/*" element={
        <PrivateRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/warehouses" element={<Warehouses />} />
              <Route path="/sales" element={<SalesInvoices />} />
              <Route path="/sales/quick" element={<QuickInvoice />} />
              <Route path="/purchases" element={<PurchaseInvoices />} />
              <Route path="/purchases/scan" element={<ScanInvoice />} />
              <Route path="/accounting/accounts" element={<ChartOfAccounts />} />
              <Route path="/accounting/bank" element={<BankCash />} />
              <Route path="/accounting/journals" element={<Journals />} />
              <Route path="/accounting/payments" element={<Payments />} />
              <Route path="/accounting/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<Users />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/import" element={<Import />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />
    </Routes>
  );
}

// Listens for SW update event and fires a toast
function SWUpdateListener() {
  useEffect(() => {
    const handler = () => {
      toast(
        (t) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔄 New version available</span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                window.location.reload();
              }}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Update
            </button>
          </span>
        ),
        { duration: Infinity, id: 'sw-update' }
      );
    };
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);
  return null;
}

function AppInner() {
  const { showInstallBanner } = useApp();
  useViewportHeight();
  return (
    <>
      <AppRoutes />
      <SchemaBanner />
      <SWUpdateListener />
      {showInstallBanner && <InstallBanner />}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg2)',
            color: 'var(--text)',
            border: '1px solid var(--border2)',
            borderRadius: '10px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#000' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </>
  );
}

export default function App() {
  // No database configured yet — show setup instructions instead of a login
  // form that cannot possibly succeed.
  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppInner />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
