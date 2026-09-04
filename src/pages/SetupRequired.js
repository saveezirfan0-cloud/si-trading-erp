// src/pages/SetupRequired.js
//
// Shown when the app has no Supabase project configured. Without this the app
// would render a login form that silently fails on every submit.
import React from 'react';
import { Database, ExternalLink } from 'lucide-react';

const VARS = [
  ['REACT_APP_SUPABASE_URL', 'https://<your-project-ref>.supabase.co'],
  ['REACT_APP_SUPABASE_ANON_KEY', 'your project publishable / anon key'],
];

export default function SetupRequired() {
  const box = {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem', wordBreak: 'break-all',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, background: 'var(--bg)',
    }}>
      <div style={{
        maxWidth: 560, width: '100%', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: 32, boxShadow: 'var(--shadow)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: 'var(--accent-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <Database size={24} style={{ color: 'var(--accent)' }} />
        </div>

        <h1 style={{ fontSize: '1.3rem', marginBottom: 8 }}>Connect a Supabase project</h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: 22 }}>
          S.I Trading ERP is deployed but not yet pointed at a database. Create a
          Supabase project, then add these two environment variables in Vercel
          (Project → Settings → Environment Variables) and redeploy.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          {VARS.map(([name, example]) => (
            <div key={name}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                {name}
              </div>
              <div style={box}>{example}</div>
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: 6 }}>
          Then apply the database schema from the repository:
        </p>
        <div style={{ ...box, marginBottom: 22 }}>supabase/migrations/0001_erp_schema.sql</div>

        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
           style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}>
          Open the Supabase dashboard <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
