// src/components/ui/ScanAttachment.js
//
// Shows the scanned photo attached to a purchase invoice. The erp-scans bucket
// is private, so the image is fetched through a short-lived signed URL rather
// than a public link.
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Paperclip, ExternalLink, ImageOff, Loader2 } from 'lucide-react';

const SIGNED_URL_TTL = 60 * 60; // 1 hour

export default function ScanAttachment({ path, uploadedAt, size }) {
  const [url, setUrl] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!path) { setState('error'); return; }
    supabase.storage.from('erp-scans').createSignedUrl(path, SIGNED_URL_TTL)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) { setState('error'); return; }
        setUrl(data.signedUrl);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [path]);

  if (!path) return null;

  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
      fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem',
      color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <Paperclip size={14} />
      <span style={{ flex: 1 }}>Scanned invoice</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                   fontSize: '0.72rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
          Open full size <ExternalLink size={12} />
        </a>
      )}
    </div>
  );

  return (
    <div className="no-print" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 16,
    }}>
      {header}

      {state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)',
                      fontSize: '0.84rem', padding: '18px 0' }}>
          <Loader2 size={15} className="spin" /> Loading image…
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)',
                      fontSize: '0.84rem', padding: '18px 0' }}>
          <ImageOff size={15} /> The attached scan could not be loaded.
        </div>
      )}

      {state === 'ready' && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Shrink' : 'Tap to enlarge'}
            style={{ display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'zoom-in' }}
          >
            <img
              src={url}
              alt="Scanned supplier invoice"
              style={{
                width: '100%',
                maxHeight: expanded ? 'none' : 320,
                objectFit: expanded ? 'contain' : 'cover',
                objectPosition: 'top',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                display: 'block',
              }}
            />
          </button>
          {(uploadedAt || size) && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text3)' }}>
              {uploadedAt && new Date(uploadedAt).toLocaleString('en-PK', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {uploadedAt && size ? ' · ' : ''}
              {size ? `${Math.round(size / 1024)} KB` : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}
