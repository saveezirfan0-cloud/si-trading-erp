// src/components/layout/Header.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Bell, Menu, Sun, Moon } from 'lucide-react';

export default function Header({ title }) {
  const { setSidebarOpen, sidebarOpen, theme, toggleTheme } = useApp();
  return (
    <header style={{
      height: 'var(--header-h)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      background: 'var(--bg2)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ background: 'none', color: 'var(--text2)', padding: 4, display: 'flex', alignItems: 'center' }}
      >
        <Menu size={20} />
      </button>

      <h1 style={{
        fontFamily: 'var(--font-head)',
        fontSize: '1.05rem',
        fontWeight: 700,
        flex: 1,
        color: 'var(--text)',
      }}>
        {title}
      </h1>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text2)',
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <button style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text2)',
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Bell size={16} />
      </button>
    </header>
  );
}
