// src/components/layout/Header.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Bell, Menu, Sun, Moon, X } from 'lucide-react';
import FiscalYearPicker from './FiscalYearPicker';

export default function Header({ title }) {
  const { setSidebarOpen, sidebarOpen, theme, toggleTheme, isMobile } = useApp();

  return (
    <header style={{
      height: 'var(--header-h)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      background: 'var(--bg2)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      // Safe area: top notch on iOS
      paddingTop: 0,
    }}>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          background: 'none',
          color: 'var(--text2)',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 8,
          WebkitTapHighlightColor: 'transparent',
          minWidth: 36, minHeight: 36,
          justifyContent: 'center',
        }}
        aria-label="Toggle menu"
      >
        {isMobile && sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <h1 style={{
        fontFamily: 'var(--font-head)',
        fontSize: isMobile ? '0.95rem' : '1.05rem',
        fontWeight: 700,
        flex: 1,
        color: 'var(--text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {title}
      </h1>

      <FiscalYearPicker compact={isMobile} />


      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text2)',
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          flexShrink: 0,
        }}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <button style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text2)',
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
        flexShrink: 0,
      }}
        aria-label="Notifications"
      >
        <Bell size={16} />
      </button>
    </header>
  );
}
