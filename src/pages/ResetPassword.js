// src/pages/ResetPassword.js
//
// Landing page for the recovery link emailed by "Forgot password?".
// Supabase puts the user into a temporary recovery session when the link is
// opened; we let them set a new password, then send them to the app.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    // The recovery token in the URL is exchanged for a session by supabase-js
    // (detectSessionInUrl); it may land just after mount, so listen too.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive && session) { setValid(true); }
      if (alive) setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || session) { setValid(true); setReady(true); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast.error('Use at least 8 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await updatePassword(password);
      toast.success('Password updated — you are signed in');
      navigate('/');
    } catch (err) {
      toast.error(err?.message || 'Could not update the password');
    } finally {
      setSaving(false);
    }
  };

  const shell = {
    minHeight: '100dvh', background: 'var(--bg)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px 16px',
  };
  const card = {
    width: '100%', maxWidth: 400, background: 'var(--bg2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    padding: 28, boxShadow: 'var(--shadow)',
  };
  const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
  const field = {
    width: '100%', padding: '11px 13px', background: 'var(--input-bg)',
    border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
    color: 'var(--text)', fontSize: '15px', fontFamily: 'var(--font-body)',
  };

  if (!ready) {
    return <div style={shell}><Loader2 size={22} className="spin" style={{ color: 'var(--accent)' }} /></div>;
  }

  if (!valid) {
    return (
      <div style={shell}>
        <div style={{ ...card, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.1rem', marginBottom: 8 }}>This link has expired</h1>
          <p style={{ color: 'var(--text2)', fontSize: '0.87rem', marginBottom: 20, lineHeight: 1.55 }}>
            Password reset links can only be used once, and expire after a short
            while. Request a fresh one from the sign-in page.
          </p>
          <button onClick={() => navigate('/login')}
            style={{
              width: '100%', padding: 12, background: 'var(--accent)',
              color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)',
              fontWeight: 600, fontFamily: 'var(--font-head)', cursor: 'pointer',
            }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <form onSubmit={handleSubmit} style={card}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <KeyRound size={21} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ fontSize: '1.15rem', marginBottom: 6 }}>Choose a new password</h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 20 }}>
          At least 8 characters.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={label} htmlFor="new-pw">New password</label>
          <div style={{ position: 'relative' }}>
            <input id="new-pw" type={showPw ? 'text' : 'password'} required autoFocus
              autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...field, paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text3)', padding: 8,
                display: 'flex', cursor: 'pointer',
              }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={label} htmlFor="confirm-pw">Confirm password</label>
          <input id="confirm-pw" type={showPw ? 'text' : 'password'} required
            autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} style={field} />
        </div>

        <button type="submit" disabled={saving}
          style={{
            width: '100%', padding: 12, background: 'var(--accent)',
            color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)',
            fontWeight: 600, fontFamily: 'var(--font-head)', fontSize: '0.95rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
          {saving && <Loader2 size={16} className="spin" />}
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
