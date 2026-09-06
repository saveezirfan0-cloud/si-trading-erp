// src/pages/NoAccess.js
//
// Shown to someone who is signed in but has no way into the app: their profile
// was deactivated, they were auto-provisioned and an admin has not granted them
// anything yet, or their profile could not be fetched at all — a failed load is
// not an empty account, so it says so and offers to try again.
import React from 'react';
import { ShieldOff, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Btn } from '../components/ui';

const COPY = {
  inactive: 'Your account is not active yet. An administrator needs to activate it in Users & Roles before you can sign in to the ERP.',
  empty: 'Your role does not grant access to any module yet. Ask an administrator to give you permissions in Users & Roles.',
  error: 'We could not load your profile, so the ERP does not know what you may open. This is usually a connection problem — try again.',
};

export default function NoAccess({ reason = 'inactive', detail, onRetry }) {
  const { profile, user, logout } = useAuth();

  const isError = reason === 'error';
  const copy = COPY[reason] || COPY.empty;
  const Icon = isError ? WifiOff : ShieldOff;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg)',
    }}>
      <div style={{
        maxWidth: 460, width: '100%', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 32, textAlign: 'center',
      }}>
        <Icon size={36} color="var(--red)" style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.25rem', marginBottom: 10 }}>
          {isError ? 'Could not load your access' : 'No access'}
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: 20 }}>
          {copy}
        </p>
        {isError && detail && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text3)',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '8px 10px', marginBottom: 20,
            wordBreak: 'break-word',
          }}>
            {detail}
          </div>
        )}
        <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 24 }}>
          Signed in as {profile?.email || user?.email}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isError && onRetry && <Btn icon={RefreshCw} onClick={onRetry}>Try again</Btn>}
          <Btn icon={LogOut} variant="secondary" onClick={logout}>Sign out</Btn>
        </div>
      </div>
    </div>
  );
}
