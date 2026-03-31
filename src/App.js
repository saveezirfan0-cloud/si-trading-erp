// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import Layout from './components/layout/Layout';
import './styles/globals.css';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/customers/Customers';
import Suppliers from './pages/suppliers/Suppliers';
import Inventory from './pages/inventory/Inventory';
import Warehouses from './pages/warehouses/Warehouses';
import SalesInvoices from './pages/sales/SalesInvoices';
import QuickInvoice from './pages/sales/QuickInvoice';
import PurchaseInvoices from './pages/purchases/PurchaseInvoices';
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

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
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
              <Route path="/accounting/accounts" element={<ChartOfAccounts />} />
              <Route path="/accounting/bank" element={<BankCash />} />
              <Route path="/accounting/journals" element={<Journals />} />
              <Route path="/accounting/payments" element={<Payments />} />
              <Route path="/accounting/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<Users />} />
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{
            style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '10px', fontFamily: 'var(--font-body)', fontSize: '0.85rem' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#000' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }} />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
