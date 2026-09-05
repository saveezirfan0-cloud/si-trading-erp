// src/components/layout/BottomNav.js
//
// Mobile bottom bar. The two actions the business does on a phone — scanning a
// supplier invoice and writing a quick sale — get first-class slots; the centre
// FAB is the scanner, since that is the camera-driven flow.
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Receipt, Zap, Camera } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// `module` ties each slot to a permission key, so the bar only offers what the
// signed-in user can actually open.
const BOTTOM_NAV = [
  { label: 'Summary', to: '/', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { label: 'Stock', to: '/inventory', icon: Package, module: 'inventory' },
  { label: 'Scan', to: '/purchases/scan', icon: Camera, fab: true, module: 'scan' },
  { label: 'Quick Sale', to: '/sales/quick', icon: Zap, module: 'sales' },
  { label: 'Sales', to: '/sales', icon: Receipt, module: 'sales' },
];

export default function BottomNav() {
  const { can } = useAuth();
  const items = BOTTOM_NAV.filter(i => can(i.module, 'view'));
  if (!items.length) return null;
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'stretch',
        height: 'calc(58px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              textDecoration: 'none',
              fontSize: '0.6rem',
              fontWeight: isActive ? 700 : 500,
              fontFamily: 'var(--font-body)',
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.15s',
              padding: '0 2px',
            })}
          >
            {({ isActive }) => (
              <>
                {item.fab ? (
                  <>
                    <div style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      background: isActive ? 'var(--accent2)' : 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 14px var(--accent-glow)',
                      border: '3px solid var(--bg2)',
                      marginTop: -18,
                      marginBottom: 1,
                    }}>
                      <Icon size={21} color="var(--on-accent)" strokeWidth={2.4} />
                    </div>
                    <span style={{
                      letterSpacing: '0.01em',
                      color: isActive ? 'var(--accent)' : 'var(--text2)',
                      fontWeight: 600,
                    }}>
                      {item.label}
                    </span>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: 34,
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: isActive ? 'var(--accent-glow)' : 'transparent',
                      transition: 'background 0.15s',
                    }}>
                      <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                    </div>
                    <span style={{
                      letterSpacing: '0.01em',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.label}
                    </span>
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
