// src/components/ErrorBoundary.js
//
// A render error anywhere in the tree unmounts the whole app and leaves an
// empty page — no message, no console for a user on a phone, nothing to report
// back to the office beyond "it's not loading". This catches that and shows
// what broke, so a crash is a readable screen instead of a blank one.
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 380 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--accent-glow)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <AlertTriangle size={24} style={{ color: 'var(--red)' }} />
          </div>

          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 20 }}>
            The screen you opened could not be displayed. Reloading usually
            clears it — if it keeps happening, send the message below to support.
          </p>

          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--accent)', color: 'var(--on-accent)',
              border: 'none', borderRadius: 10, padding: '11px 22px',
              fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={15} /> Reload
          </button>

          <p style={{
            marginTop: 18, color: 'var(--text3)', fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)', wordBreak: 'break-word',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
        </div>
      </div>
    );
  }
}
