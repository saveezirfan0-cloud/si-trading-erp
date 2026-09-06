// src/components/layout/BottomNav.js
//
// Mobile bottom bar. It carries only what the business actually does standing
// in the shop: photograph a supplier bill, write a sale, or open the menu for
// everything else. Five cramped tabs with clipped labels were harder to hit
// and read than the three big targets here.
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X, Camera, Zap, Receipt, ShoppingCart } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';

// Slot heights are shared with Layout's bottom padding and the install banner.
export const BOTTOM_NAV_H = 62;

// Each action falls back to the list page when the user cannot create or scan,
// so the slot is never dead and never disappears mid-session.
const actionSlots = (can) => {
  const slots = [];

  if (can('scan', 'view')) {
    slots.push({ key: 'scan', label: 'Scan Bill', to: '/purchases/scan', icon: Camera, fab: true });
  } else if (can('purchases', 'view')) {
    slots.push({ key: 'purchases', label: 'Purchases', to: '/purchases', icon: ShoppingCart });
  }

  if (can('sales', 'create')) {
    slots.push({ key: 'sale', label: 'New Sale', to: '/sales/quick', icon: Zap });
  } else if (can('sales', 'view')) {
    slots.push({ key: 'sales', label: 'Sales', to: '/sales', icon: Receipt });
  }

  return slots;
};

const slotStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  padding: '0 4px',
  textDecoration: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.68rem',
  WebkitTapHighlightColor: 'transparent',
};

const labelStyle = {
  letterSpacing: '0.01em',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
};

// Plain icon + label slot; `active` drives the pill behind the icon.
function SlotBody({ icon: Icon, label, active }) {
  return (
    <>
      <div style={{
        width: 40,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 99,
        background: active ? 'var(--accent-glow)' : 'transparent',
        transition: 'background 0.15s',
      }}>
        <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
      </div>
      <span style={labelStyle}>{label}</span>
    </>
  );
}

// The camera slot sits proud of the bar: it is the flow that starts from the
// bottom bar rather than from a list.
function FabBody({ icon: Icon, label, active }) {
  return (
    <>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: active ? 'var(--accent2)' : 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 16px var(--accent-glow)',
        border: '3px solid var(--bg2)',
        marginTop: -20,
        marginBottom: 1,
      }}>
        <Icon size={22} color="var(--on-accent)" strokeWidth={2.4} />
      </div>
      <span style={{ ...labelStyle, color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: 600 }}>
        {label}
      </span>
    </>
  );
}

export default function BottomNav() {
  const { sidebarOpen, setSidebarOpen } = useApp();
  const { can } = useAuth();
  const slots = actionSlots(can);

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
        boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
        display: 'flex',
        alignItems: 'stretch',
        height: `calc(${BOTTOM_NAV_H}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Menu: everything that is not a scan or a sale lives behind this. */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-expanded={sidebarOpen}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        style={{
          ...slotStyle,
          color: sidebarOpen ? 'var(--accent)' : 'var(--text3)',
          fontWeight: sidebarOpen ? 700 : 500,
        }}
      >
        <SlotBody icon={sidebarOpen ? X : Menu} label={sidebarOpen ? 'Close' : 'Menu'} active={sidebarOpen} />
      </button>

      {slots.map((slot) => {
        const Body = slot.fab ? FabBody : SlotBody;
        return (
          <NavLink
            key={slot.key}
            to={slot.to}
            style={({ isActive }) => ({
              ...slotStyle,
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              fontWeight: isActive ? 700 : 500,
              transition: 'color 0.15s',
            })}
          >
            {({ isActive }) => <Body icon={slot.icon} label={slot.label} active={isActive} />}
          </NavLink>
        );
      })}
    </nav>
  );
}
