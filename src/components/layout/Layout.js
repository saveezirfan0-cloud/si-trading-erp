// src/components/layout/Layout.js
import React from 'react';
import Sidebar from './Sidebar';
import { useApp } from '../../contexts/AppContext';

export default function Layout({ children }) {
  const { sidebarOpen } = useApp();
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        marginLeft: sidebarOpen ? '240px' : '60px',
        transition: 'margin-left 0.25s ease',
        minWidth: 0,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}>
        {children}
      </main>
    </div>
  );
}
