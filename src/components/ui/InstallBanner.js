// src/components/ui/InstallBanner.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Download, X } from 'lucide-react';

export default function InstallBanner() {
  const { triggerInstall, dismissInstall, isMobile } = useApp();

  return (
    <div
      className="pwa-install-banner"
      style={{
        // On desktop, pin to bottom-right corner instead
        ...(isMobile
          ? {}
          : {
              bottom: 24,
              left: 'auto',
              right: 24,
              width: 320,
            }),
      }}
    >
      {/* App icon */}
      <div style={{
        width: 44, height: 44,
        borderRadius: 12,
        background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontWeight: 800,
        fontFamily: 'var(--font-head)',
        fontSize: '1rem',
        color: '#000',
      }}>
        SI
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
          Install SI ERP
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 2 }}>
          Add to home screen for the best experience
        </div>
      </div>

      <button
        onClick={triggerInstall}
        style={{
          background: 'var(--accent)',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: '0.8rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Download size={14} />
        Install
      </button>

      <button
        onClick={dismissInstall}
        style={{
          background: 'none',
          color: 'var(--text3)',
          padding: 6,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
