// src/contexts/AppContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

// The fiscal year today falls into, given the FY's starting month.
// FY is named after the calendar year it ends in (FY2027 = Jul 2026–Jun 2027).
const currentFiscalYear = (startMonth) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (startMonth === 1) return y;
  return m >= startMonth ? y + 1 : y;
};

export const AppProvider = ({ children }) => {
  // ── Mobile detection ────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => {
      setIsMobile(e.matches);
      // Auto-close sidebar when switching to mobile
      if (e.matches) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Sidebar state ───────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Theme ───────────────────────────────────────────────────────────────
  const [currency] = useState('PKR');
  const [companyName] = useState('S.I Trading & Co.');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('si-theme') || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    try { localStorage.setItem('si-theme', theme); } catch {}
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // ── PWA Install prompt ──────────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      // Show banner after 30s if not dismissed
      setTimeout(() => setShowInstallBanner(true), 30000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallPrompt(null);
    setShowInstallBanner(false);
  };

  const dismissInstall = () => setShowInstallBanner(false);

  // ── Fiscal year ─────────────────────────────────────────────────────────
  // Pakistan's fiscal year runs July–June by default; configurable in Settings.
  const [fyStartMonth, setFyStartMonth] = useState(() => {
    const v = parseInt(localStorage.getItem('si-fy-start') || '', 10);
    return v >= 1 && v <= 12 ? v : 7;
  });
  // 'all' or the fiscal year's ending calendar year (FY2026 = Jul 2025–Jun 2026).
  // Defaults to the current fiscal year so lists open on this year's data.
  const [fiscalYear, setFiscalYear] = useState(() => {
    const thisFy = String(currentFiscalYear(fyStartMonth));
    try {
      const stored = localStorage.getItem('si-fy2');
      if (stored) return stored;
      // Migrate the old key. Its 'all' was the previous default rather than a
      // deliberate choice, so only a specific year is carried over.
      const legacy = localStorage.getItem('si-fy');
      if (legacy && legacy !== 'all') return legacy;
    } catch {}
    return thisFy;
  });

  useEffect(() => {
    try {
      localStorage.setItem('si-fy2', fiscalYear);
      localStorage.setItem('si-fy-start', String(fyStartMonth));
    } catch {}
  }, [fiscalYear, fyStartMonth]);

  // Inclusive start / exclusive end for a given fiscal year label.
  const fiscalYearRange = useCallback((year) => {
    const y = Number(year);
    if (!y) return null;
    // FY ends in calendar year `y`; if it starts in January the FY is that year.
    const startYear = fyStartMonth === 1 ? y : y - 1;
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${startYear}-${pad(fyStartMonth)}-01`;
    const endYear = fyStartMonth === 1 ? y + 1 : y;
    const end = `${endYear}-${pad(fyStartMonth)}-01`;
    return { start, end };
  }, [fyStartMonth]);

  // Which fiscal year a YYYY-MM-DD date falls in.
  const fiscalYearOf = useCallback((date) => {
    if (!date) return null;
    const d = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10);
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    if (!y || !m) return null;
    if (fyStartMonth === 1) return y;
    return m >= fyStartMonth ? y + 1 : y;
  }, [fyStartMonth]);

  // Filter any list of records that carry a `date` field.
  const filterByFiscalYear = useCallback((rows) => {
    if (fiscalYear === 'all' || !Array.isArray(rows)) return rows || [];
    const range = fiscalYearRange(fiscalYear);
    if (!range) return rows;
    return rows.filter((r) => {
      const d = r?.date;
      if (!d) return false;
      const s = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
      return s >= range.start && s < range.end;
    });
  }, [fiscalYear, fiscalYearRange]);

  const fiscalYearLabel = useCallback((year) => {
    if (year === 'all') return 'All years';
    if (fyStartMonth === 1) return `FY ${year}`;
    return `FY ${Number(year) - 1}\u2013${String(year).slice(2)}`;
  }, [fyStartMonth]);

  // ── Formatters ──────────────────────────────────────────────────────────
  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
      .format(val || 0);

  const formatDate = (date) => {
    if (!date) return '—';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <AppContext.Provider value={{
      sidebarOpen, setSidebarOpen, closeSidebar,
      isMobile,
      currency, companyName, formatCurrency, formatDate,
      fiscalYear, setFiscalYear, fyStartMonth, setFyStartMonth,
      fiscalYearRange, fiscalYearOf, filterByFiscalYear, fiscalYearLabel,
      thisFiscalYear: currentFiscalYear(fyStartMonth),
      theme, toggleTheme,
      installPrompt, showInstallBanner, triggerInstall, dismissInstall,
    }}>
      {children}
    </AppContext.Provider>
  );
};
