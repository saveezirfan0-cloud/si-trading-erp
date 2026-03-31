// src/contexts/AppContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currency] = useState('PKR');
  const [companyName] = useState('S.I Trading & Co.');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('si-theme') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    try { localStorage.setItem('si-theme', theme); } catch {}
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
      .format(val || 0);

  const formatDate = (date) => {
    if (!date) return '—';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <AppContext.Provider value={{ sidebarOpen, setSidebarOpen, currency, companyName, formatCurrency, formatDate, theme, toggleTheme }}>
      {children}
    </AppContext.Provider>
  );
};
