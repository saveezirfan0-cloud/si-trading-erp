// src/components/layout/BottomNav.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Receipt, Zap, BarChart3 } from 'lucide-react';

const BOTTOM_NAV = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Inventory', to: '/inventory', icon: Package },
  { label: 'Invoice', to: '/sales/quick', icon: Zap, accent: true },
  { label: 'Sales', to: '/sales', icon: Receipt },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
];

export default function BottomNav() {
  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      background: 'var(--bg2)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'stretch',
      height: 'calc(56px + env(safe-area-inset-bottom))',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {BOTTOM_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: isActive ? 'var(--accent)' : item.accent ? 'var(--accent)' : 'var(--text3)',
              textDecoration: 'none',
              fontSize: '0.6rem',
              fontWeight: isActive ? 700 : 500,
              fontFamily: 'var(--font-body)',
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.15s',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                {item.accent ? (
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: isActive ? 'var(--accent2)' : 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(240,165,0,0.4)',
                    marginTop: -10,
                  }}>
                    <Icon size={20} color="#000" strokeWidth={2.5} />
                  </div>
                ) : (
                  <>
                    <div style={{
                      width: 32,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: isActive ? 'var(--accent-glow)' : 'transparent',
                      transition: 'background 0.15s',
                    }}>
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                    </div>
                    <span style={{ letterSpacing: '0.01em' }}>{item.label}</span>
                  </>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
