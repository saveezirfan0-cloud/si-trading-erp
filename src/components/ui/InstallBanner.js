// src/components/ui/InstallBanner.js
import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Download, X, Share, MoreVertical } from 'lucide-react';

// Chrome hands us a replayable prompt; Safari and the rest need the manual
// route, so the banner explains the taps instead of offering a button.
const COPY = {
  prompt: { title: 'Install SI ERP', body: 'Add to your home screen for the best experience' },
  ios:    { title: 'Add SI ERP to Home Screen', body: 'Tap Share, then "Add to Home Screen"', Icon: Share },
  manual: { title: 'Add SI ERP to Home Screen', body: 'Open the browser menu, then "Add to Home screen"', Icon: MoreVertical },
};

export default function InstallBanner() {
  const { triggerInstall, dismissInstall, isMobile, installMode } = useApp();
  const { title, body, Icon } = COPY[installMode] || COPY.manual;

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
        color: 'var(--on-accent)',
      }}>
        SI
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
          {title}
        </div>
        <div style={{
          fontSize: '0.75rem', color: 'var(--text2)', marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {Icon && <Icon size={13} style={{ flexShrink: 0 }} />}
          <span>{body}</span>
        </div>
      </div>

      {installMode === 'prompt' && (
        <button
          onClick={triggerInstall}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
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
      )}

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
