// src/components/layout/Sidebar.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import useCounts from '../../hooks/useCounts';
import { COLLECTIONS } from '../../lib/db';
import {
  LayoutDashboard, Users, Truck, Package, Warehouse,
  BookOpen, FileText, BarChart3, UserCog, Upload,
  MessageSquare, Settings, LogOut, ChevronLeft, ChevronRight,
  DollarSign, ShoppingCart, Receipt, Zap, Camera
} from 'lucide-react';

const NAV = [
  { label: 'Summary', to: '/', icon: LayoutDashboard },
  { label: 'Customers', to: '/customers', icon: Users, countKey: COLLECTIONS.CUSTOMERS },
  { label: 'Suppliers', to: '/suppliers', icon: Truck, countKey: COLLECTIONS.SUPPLIERS },
  { label: 'Inventory Items', to: '/inventory', icon: Package, countKey: COLLECTIONS.INVENTORY },
  { label: 'Warehouses', to: '/warehouses', icon: Warehouse },
  { type: 'divider', label: 'SALES & PURCHASES' },
  { label: 'Sales Invoices', to: '/sales', icon: Receipt, countKey: COLLECTIONS.SALES_INVOICES },
  { label: 'Quick Invoice', to: '/sales/quick', icon: Zap },
  { label: 'Purchase Invoices', to: '/purchases', icon: ShoppingCart, countKey: COLLECTIONS.PURCHASE_INVOICES },
  { label: 'Scan Invoice (OCR)', to: '/purchases/scan', icon: Camera, highlight: true },
  { type: 'divider', label: 'ACCOUNTING' },
  { label: 'Chart of Accounts', to: '/accounting/accounts', icon: BookOpen },
  { label: 'Bank & Cash', to: '/accounting/bank', icon: DollarSign },
  { label: 'Journal Entries', to: '/accounting/journals', icon: FileText },
  { label: 'Payments', to: '/accounting/payments', icon: DollarSign },
  { label: 'Expenses', to: '/accounting/expenses', icon: FileText },
  { type: 'divider', label: 'ANALYTICS' },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { type: 'divider', label: 'SYSTEM' },
  { label: 'Users & Roles', to: '/users', icon: UserCog },
  { label: 'Data Import', to: '/import', icon: Upload },
  { label: 'WhatsApp', to: '/whatsapp', icon: MessageSquare },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, isMobile } = useApp();
  const { logout, profile } = useAuth();
  const navigate = useNavigate();
  const counts = useCounts();

  const handleLogout = async () => { await logout(); navigate('/login'); };

  // On mobile: full slide-in overlay at 280px. On desktop: collapsible rail.
  const mobileWidth = 280;
  const desktopWidth = sidebarOpen ? 240 : 60;

  return (
    <aside style={{
      width: isMobile ? mobileWidth : desktopWidth,
      minWidth: isMobile ? mobileWidth : desktopWidth,
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 100,
      transition: isMobile
        ? 'transform 0.3s cubic-bezier(0.4,0,0.2,1)'
        : 'width 0.25s ease, min-width 0.25s ease',
      // Mobile: translate off-screen when closed
      transform: isMobile && !sidebarOpen ? `translateX(-${mobileWidth}px)` : 'translateX(0)',
      overflow: 'hidden',
      // Safe area inset for notch devices
      paddingTop: 'env(safe-area-inset-top)',
    }}>

      {/* Logo row */}
      <div style={{
        padding: '0 16px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: (sidebarOpen || isMobile) ? 'space-between' : 'center',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {(sidebarOpen || isMobile) && (
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: 'var(--accent)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              S.I Trading
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>& Co. ERP</div>
          </div>
        )}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text2)',
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', WebkitOverflowScrolling: 'touch' }}>
        {NAV.map((item, i) => {
          if (item.type === 'divider') {
            return (sidebarOpen || isMobile)
              ? <div key={i} style={{ padding: '12px 16px 4px', fontSize: '0.6rem', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{item.label}</div>
              : <div key={i} style={{ height: 1, background: 'var(--border)', margin: '8px 10px' }} />;
          }
          const Icon = item.icon;
          const isQuick = item.to === '/sales/quick' || item.highlight;
          const count = item.countKey ? counts[item.countKey] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: (sidebarOpen || isMobile) ? '10px 16px' : '10px',
                justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
                marginInline: 8,
                borderRadius: 'var(--radius)',
                color: isActive ? 'var(--accent)' : isQuick ? 'var(--accent)' : 'var(--text2)',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : isQuick ? 600 : 400,
                transition: 'all 0.15s',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                opacity: isQuick && !isActive ? 0.85 : 1,
                WebkitTapHighlightColor: 'transparent',
                // Bigger tap targets on mobile
                minHeight: isMobile ? 44 : 'auto',
              })}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {(sidebarOpen || isMobile) && <span style={{ flex: 1 }}>{item.label}</span>}
              {(sidebarOpen || isMobile) && count !== undefined && count > 0 && (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--text3)',
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 99, padding: '1px 7px', lineHeight: 1.5,
                }}>{count}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
        paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : '12px',
      }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-head)',
          fontWeight: 700,
          fontSize: '0.8rem',
          color: 'var(--on-accent)',
          flexShrink: 0,
        }}>
          {profile?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        {(sidebarOpen || isMobile) && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name || 'User'}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'capitalize' }}>{profile?.role || 'viewer'}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ background: 'none', color: 'var(--text3)', padding: 8, borderRadius: 8, WebkitTapHighlightColor: 'transparent' }}
              aria-label="Logout"
            >
              <LogOut size={15} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
