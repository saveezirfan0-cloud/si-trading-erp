// src/contexts/AppContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── PWA install helpers ─────────────────────────────────────────────────────
const INSTALL_SNOOZE_KEY = 'si-install-dismissed';
const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // don't nag for a fortnight

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const installSnoozed = () => {
  try {
    const at = Number(localStorage.getItem(INSTALL_SNOOZE_KEY));
    return Boolean(at) && Date.now() - at < INSTALL_SNOOZE_MS;
  } catch { return false; }
};

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

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
  // Chrome/Android fires `beforeinstallprompt` once the app is installable and
  // hands us an event we can replay from our own button. iOS Safari never fires
  // it — there the only route is Share → Add to Home Screen, so we show the
  // steps instead of a button.
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const snoozeInstall = () => {
    try { localStorage.setItem(INSTALL_SNOOZE_KEY, String(Date.now())); } catch {}
  };

  useEffect(() => {
    if (isInstalled) return undefined;

    let bannerTimer;
    const armBanner = () => {
      if (installSnoozed()) return;
      bannerTimer = setTimeout(() => setShowInstallBanner(true), 30000);
    };

    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      armBanner();
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallBanner(false);
      try { localStorage.removeItem(INSTALL_SNOOZE_KEY); } catch {}
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // iOS gets no event to wait for, so arm the banner directly.
    if (isIOS()) armBanner();

    return () => {
      clearTimeout(bannerTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isInstalled]);

  // 'prompt'  → one-tap install (Android Chrome, desktop Chrome/Edge)
  // 'ios'     → manual Share → Add to Home Screen
  // 'manual'  → browser menu → Install app / Add to Home screen
  const installMode = installPrompt ? 'prompt' : (isIOS() ? 'ios' : 'manual');

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    // The event is single-use — a declined prompt can't be replayed.
    setInstallPrompt(null);
    if (result.outcome !== 'accepted') snoozeInstall();
    setShowInstallBanner(false);
  };

  const dismissInstall = () => {
    snoozeInstall();
    setShowInstallBanner(false);
  };

  // ── Fiscal year ─────────────────────────────────────────────────────────
  // Pakistan's fiscal year runs July–June by default; configurable in Settings.
  const [fyStartMonth, setFyStartMonth] = useState(() => {
    const v = parseInt(localStorage.getItem('si-fy-start') || '', 10);
    return v >= 1 && v <= 12 ? v : 7;
  });
  // 'all' or the fiscal year's ending calendar year (FY2026 = Jul 2025–Jun 2026)
  const [fiscalYear, setFiscalYear] = useState(() => {
    try { return localStorage.getItem('si-fy') || 'all'; } catch { return 'all'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('si-fy', fiscalYear);
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
      theme, toggleTheme,
      installPrompt, showInstallBanner, triggerInstall, dismissInstall,
      isInstalled, installMode,
    }}>
      {children}
    </AppContext.Provider>
  );
};
