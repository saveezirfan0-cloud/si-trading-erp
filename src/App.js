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
import Import from './pages/import/Import';
import WhatsApp from './pages/WhatsApp';
import Settings from './pages/Settings';
import SetupRequired from './pages/SetupRequired';
import NoAccess from './pages/NoAccess';
import { isSupabaseConfigured } from './lib/supabase';
import { MODULES } from './lib/permissions';

function PrivateRoute({ children }) {
  const { user, profile, permissions } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Signed in, but shut out: deactivated, or granted nothing at all.
  if (profile && profile.active === false) return <NoAccess reason="inactive" />;
  if (profile && Object.keys(permissions).length === 0) return <NoAccess reason="empty" />;
  return children;
}

// Wraps a route so a user who lacks the module's `view` permission is sent to
// the first page they can actually open instead of a blank screen.
function Require({ module, children }) {
  const { can } = useAuth();
  if (can(module, 'view')) return children;
  // PrivateRoute already catches "no permissions at all", so a fallback exists
  // in practice; /no-access is the belt-and-braces case.
  const fallback = MODULES.find(m => can(m.key, 'view'))?.path;
  return <Navigate to={fallback || '/no-access'} replace />;
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
              <Route path="/" element={<Require module="dashboard"><Dashboard /></Require>} />
              <Route path="/customers" element={<Require module="customers"><Customers /></Require>} />
              <Route path="/suppliers" element={<Require module="suppliers"><Suppliers /></Require>} />
              <Route path="/inventory" element={<Require module="inventory"><Inventory /></Require>} />
              <Route path="/warehouses" element={<Require module="warehouses"><Warehouses /></Require>} />
              <Route path="/sales" element={<Require module="sales"><SalesInvoices /></Require>} />
              <Route path="/sales/quick" element={<Require module="sales"><QuickInvoice /></Require>} />
              <Route path="/purchases" element={<Require module="purchases"><PurchaseInvoices /></Require>} />
              <Route path="/purchases/scan" element={<Require module="scan"><ScanInvoice /></Require>} />
              <Route path="/accounting/accounts" element={<Require module="accounts"><ChartOfAccounts /></Require>} />
              <Route path="/accounting/bank" element={<Require module="bank"><BankCash /></Require>} />
              <Route path="/accounting/journals" element={<Require module="journals"><Journals /></Require>} />
              <Route path="/accounting/payments" element={<Require module="payments"><Payments /></Require>} />
              <Route path="/accounting/expenses" element={<Require module="expenses"><Expenses /></Require>} />
              <Route path="/reports" element={<Require module="reports"><Reports /></Require>} />
              <Route path="/users" element={<Require module="users"><Users /></Require>} />
              <Route path="/import" element={<Require module="import"><Import /></Require>} />
              <Route path="/whatsapp" element={<Require module="whatsapp"><WhatsApp /></Require>} />
              <Route path="/settings" element={<Require module="settings"><Settings /></Require>} />
              <Route path="/no-access" element={<NoAccess reason="empty" />} />
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
                color: '#000',
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
