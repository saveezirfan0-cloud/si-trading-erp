// src/components/layout/Layout.js
import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useApp } from '../../contexts/AppContext';
import { useLocation } from 'react-router-dom';
import { useLockBodyScroll } from '../../hooks/useMobile';

export default function Layout({ children }) {
  const { sidebarOpen, isMobile, closeSidebar } = useApp();
  const location = useLocation();
  useLockBodyScroll(isMobile && sidebarOpen);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (isMobile) closeSidebar();
  }, [location.pathname, isMobile, closeSidebar]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Mobile overlay backdrop ── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 99,
            WebkitTapHighlightColor: 'transparent',
          }}
        />
      )}

      <Sidebar />

      <main style={{
        flex: 1,
        marginLeft: isMobile ? 0 : (sidebarOpen ? '240px' : '60px'),
        transition: isMobile ? 'none' : 'margin-left 0.25s ease',
        minWidth: 0,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        // Bottom padding for mobile bottom nav + safe area
        paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0,
      }}>
        {children}
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && <BottomNav />}
    </div>
  );
}
