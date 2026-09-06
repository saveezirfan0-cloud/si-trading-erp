// src/components/Startup.js
//
// The two screens the app can show before it has a session to work with.
//
// Neither is decoration: until AuthContext knows whether somebody is signed in
// it cannot render a route, and rendering nothing at all leaves a blank page
// with no spinner, no message and no way out — which is exactly what a phone on
// a stalled connection used to get.
import React from 'react';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';

const shell = {
  minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '24px 16px', textAlign: 'center',
};

/** Shown while the stored session is being read. */
export function Splash() {
  return (
    <div style={shell}>
      <div>
        <Loader2
          size={30}
          style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }}
        />
        <p style={{ marginTop: 14, color: 'var(--text2)', fontSize: '0.85rem' }}>
          Loading S.I Trading ERP…
        </p>
      </div>
    </div>
  );
}

/**
 * Shown when the session could not be established at all — the device is
 * offline, the Supabase project is unreachable, or the request never answered.
 * The app cannot continue, so it says why and offers the one useful action.
 */
export function ConnectionError({ message, onRetry }) {
  return (
    <div style={shell}>
      <div style={{ maxWidth: 360 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
        }}>
          <WifiOff size={24} style={{ color: 'var(--accent)' }} />
        </div>

        <h1 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>
          Can’t reach the server
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 20 }}>
          S.I Trading ERP could not sign you in because the database did not
          answer. Check your connection and try again.
        </p>

        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--accent)', color: 'var(--on-accent)',
            border: 'none', borderRadius: 10, padding: '11px 22px',
            fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={15} /> Try again
        </button>

        {message && (
          <p style={{
            marginTop: 18, color: 'var(--text3)', fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)', wordBreak: 'break-word',
          }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
