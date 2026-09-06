// src/pages/Login.js
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Eye, EyeOff, ArrowLeft, MailCheck } from 'lucide-react';
import { storageIsPersistent } from '../lib/safeStorage';

const shell = {
  minHeight: '100dvh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px 16px',
  paddingTop: 'max(20px, env(safe-area-inset-top))',
  paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
};

const card = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 28,
  boxShadow: 'var(--shadow)',
};

const label = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 6,
};

const field = {
  width: '100%',
  padding: '11px 13px',
  background: 'var(--input-bg)',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '15px',
  fontFamily: 'var(--font-body)',
};

const primaryBtn = (disabled) => ({
  width: '100%',
  padding: '12px',
  background: 'var(--accent)',
  color: 'var(--on-accent)',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: '0.95rem',
  fontWeight: 600,
  fontFamily: 'var(--font-head)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const linkBtn = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

export default function Login() {
  const [mode, setMode] = useState('signin');   // signin | forgot | sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, sendPasswordReset } = useAuth();
  const navigate = useNavigate();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      // `replace` so the back button does not land on the sign-in form of a
      // session that is already signed in. The app itself waits for the
      // profile before deciding what this user may open (see PrivateRoute).
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err?.code === 'identifier_not_found'
        ? err.message
        : /invalid login/i.test(err?.message || '')
          ? 'Those sign-in details are not correct.'
          : err?.message || 'Sign in failed.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter your email address first');
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setMode('sent');
    } catch (err) {
      toast.error(err?.message || 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--accent)', color: 'var(--on-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem',
            letterSpacing: '-0.02em',
          }}>SI</div>
          <h1 style={{ fontSize: '1.35rem', marginBottom: 4 }}>S.I Trading &amp; Co.</h1>
          <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>
            Enterprise Resource Planning
          </div>
        </div>

        {mode === 'sent' ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', margin: '0 auto 14px',
              background: 'var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MailCheck size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Check your email</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.87rem', marginBottom: 20, lineHeight: 1.55 }}>
              If an account exists for <strong style={{ color: 'var(--text)' }}>{email}</strong>,
              a password reset link is on its way. The link opens this app and lets
              you choose a new password.
            </p>
            <button onClick={() => { setMode('signin'); setPassword(''); }} style={linkBtn}>
              Back to sign in
            </button>
          </div>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} style={card}>
            <button type="button" onClick={() => setMode('signin')}
              style={{ ...linkBtn, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14, color: 'var(--text2)' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>Reset your password</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 18, lineHeight: 1.5 }}>
              Enter the email you sign in with and we'll send you a reset link.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={label} htmlFor="reset-email">Email address</label>
              <input id="reset-email" type="email" required autoFocus autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" style={field} />
              <p style={{ color: 'var(--text3)', fontSize: '0.76rem', marginTop: 8, lineHeight: 1.5 }}>
                Signing in with a phone number or username? There is no mailbox to send
                a link to — ask an administrator to set a new password for you.
              </p>
            </div>

            <button type="submit" disabled={loading} style={primaryBtn(loading)}>
              {loading && <Loader2 size={16} className="spin" />}
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} style={card}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 20 }}>Sign in</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={label} htmlFor="email">Email, phone or username</label>
              <input id="email" type="text" required autoComplete="username"
                inputMode="email" autoCapitalize="none" autoCorrect="off"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com  ·  0300 1234567  ·  saveez" style={field} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={label} htmlFor="password">Password</label>
                <button type="button" onClick={() => setMode('forgot')} style={linkBtn}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input id="password" type={showPw ? 'text' : 'password'} required
                  autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ ...field, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text3)',
                    padding: 8, display: 'flex', cursor: 'pointer',
                  }}>
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ ...primaryBtn(loading), marginTop: 12 }}>
              {loading && <Loader2 size={16} className="spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            {/* Signing in works, but nothing is kept: the session is gone on
                the next reload. Better said here than discovered later. */}
            {!storageIsPersistent && (
              <p style={{ color: 'var(--text3)', fontSize: '0.75rem', marginTop: 14, lineHeight: 1.5 }}>
                This browser is blocking site data, so you will be asked to sign
                in again after every reload. Allowing cookies and site data for
                this site — or opening it in Chrome or Safari rather than inside
                another app — keeps you signed in.
              </p>
            )}
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: '0.75rem', color: 'var(--text3)' }}>
          © {new Date().getFullYear()} S.I Trading &amp; Co.
        </div>
      </div>
    </div>
  );
}
