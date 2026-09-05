// src/components/layout/Header.js
//
// On a phone the menu lives in the bottom bar, so the header keeps only what
// tells you where you are and what you are looking at: the page title and the
// fiscal year.
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Bell, Menu, Sun, Moon } from 'lucide-react';
import FiscalYearPicker from './FiscalYearPicker';

const iconBtn = {
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text2)',
  width: 36, height: 36,
  minHeight: 36, minWidth: 36,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  flexShrink: 0,
};

export default function Header({ title }) {
  const { setSidebarOpen, sidebarOpen, theme, toggleTheme, isMobile } = useApp();

  return (
    <header style={{
      height: 'var(--header-h)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: isMobile ? '0 12px' : '0 16px',
      gap: isMobile ? 8 : 12,
      background: 'var(--bg2)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      // Safe area: top notch on iOS
      paddingTop: 0,
    }}>
      {/* Mobile gets its menu button in the bottom bar instead. */}
      {!isMobile && (
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
          <Menu size={20} />
        </button>
      )}

      <h1 style={{
        fontFamily: 'var(--font-head)',
        fontSize: isMobile ? '1rem' : '1.05rem',
        fontWeight: 700,
        flex: 1,
        minWidth: 0,
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
        style={iconBtn}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* The bell has nothing behind it yet; on a phone that space is better
          spent on the title. */}
      {!isMobile && (
        <button style={iconBtn} aria-label="Notifications">
          <Bell size={16} />
        </button>
      )}
    </header>
  );
}
