// src/pages/Login.js
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      toast.error('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      {/* Background accent */}
      <div style={{
        position: 'fixed',
        top: -200,
        right: -200,
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontFamily: 'var(--font-head)',
            fontWeight: 800,
            fontSize: '1.4rem',
            color: '#000',
          }}>
            SI
          </div>
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}>
            S.I Trading & Co.
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginTop: 6 }}>
            Enterprise Resource Planning
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 32,
        }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 24 }}>
            Sign In
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500, marginBottom: 6 }}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@sitrading.com"
                required
                style={{ width: '100%', padding: '10px 14px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500, marginBottom: 6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '10px 14px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: 'var(--radius)',
                padding: '12px',
                fontFamily: 'var(--font-head)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
              }}
            >
              {loading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '0.75rem', marginTop: 20 }}>
          © 2025 S.I Trading & Co. — All rights reserved
        </p>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
