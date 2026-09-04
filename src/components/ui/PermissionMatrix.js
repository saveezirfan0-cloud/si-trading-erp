// src/components/ui/PermissionMatrix.js
//
// The grid used to grant access: one row per module, one checkbox per action.
// `value` / `onChange` speak the permission-map shape from lib/permissions.
import React from 'react';
import { Check } from 'lucide-react';
import {
  ACTIONS, MODULE_GROUPS, actionsFor, can, fullAccess, normalize,
} from '../../lib/permissions';

const cellStyle = { padding: '6px 4px', textAlign: 'center', width: 62 };

function Tick({ checked, disabled, onChange, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 22, height: 22, borderRadius: 6, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border2)'}`,
        background: checked ? 'var(--accent)' : 'transparent',
        color: checked ? 'var(--on-accent, #000)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        transition: 'all 0.12s',
      }}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

export default function PermissionMatrix({ value, onChange, readOnly = false }) {
  const perms = normalize(value);

  const emit = (next) => { if (!readOnly) onChange(normalize(next)); };

  // Viewing is the floor: granting any action implies view, and removing view
  // removes the rest — there is no "can delete but cannot open the page".
  const toggle = (moduleKey, action) => {
    const current = new Set(perms[moduleKey] || []);
    if (current.has(action)) {
      if (action === 'view') current.clear();
      else current.delete(action);
    } else {
      current.add(action);
      if (actionsFor(moduleKey).includes('view')) current.add('view');
    }
    emit({ ...perms, [moduleKey]: [...current] });
  };

  const toggleModule = (moduleKey) => {
    const all = actionsFor(moduleKey);
    const isFull = all.every(a => can(perms, moduleKey, a));
    emit({ ...perms, [moduleKey]: isFull ? [] : all });
  };

  const toggleColumn = (action) => {
    const modules = Object.values(MODULE_GROUPS).flat().filter(m => m.actions.includes(action));
    const isFull = modules.every(m => can(perms, m.key, action));
    const next = { ...perms };
    for (const m of modules) {
      const set = new Set(next[m.key] || []);
      if (isFull) {
        if (action === 'view') set.clear(); else set.delete(action);
      } else {
        set.add(action);
        if (m.actions.includes('view')) set.add('view');
      }
      next[m.key] = [...set];
    }
    emit(next);
  };

  const preset = (kind) => {
    if (kind === 'full') return emit(fullAccess());
    if (kind === 'none') return emit({});
    const next = {};
    for (const m of Object.values(MODULE_GROUPS).flat()) {
      if (m.actions.includes('view')) next[m.key] = ['view'];
    }
    emit(next);
  };

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['full', 'Full access'], ['read', 'Read only'], ['none', 'Clear all']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => preset(k)}
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 999, padding: '4px 12px', fontSize: '0.72rem',
                color: 'var(--text2)', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 460 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.7rem', color: 'var(--text3)', letterSpacing: '0.05em' }}>
                MODULE
              </th>
              {ACTIONS.map(a => (
                <th key={a.key} style={{ ...cellStyle, fontSize: '0.68rem', color: 'var(--text3)' }}>
                  {readOnly ? a.label : (
                    <button
                      type="button"
                      onClick={() => toggleColumn(a.key)}
                      title={`Toggle ${a.label} everywhere`}
                      style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      {a.label}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(MODULE_GROUPS).map(([group, modules]) => (
              <React.Fragment key={group}>
                <tr>
                  <td colSpan={ACTIONS.length + 1} style={{
                    padding: '8px 12px 4px', fontSize: '0.65rem', fontWeight: 700,
                    color: 'var(--text3)', letterSpacing: '0.08em',
                    borderTop: '1px solid var(--border)', background: 'var(--bg2)',
                  }}>
                    {group.toUpperCase()}
                  </td>
                </tr>
                {modules.map(m => (
                  <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px' }}>
                      {readOnly ? m.label : (
                        <button
                          type="button"
                          onClick={() => toggleModule(m.key)}
                          title="Toggle every action on this module"
                          style={{ background: 'none', border: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                        >
                          {m.label}
                        </button>
                      )}
                    </td>
                    {ACTIONS.map(a => {
                      const supported = m.actions.includes(a.key);
                      return (
                        <td key={a.key} style={cellStyle}>
                          {supported ? (
                            <Tick
                              checked={can(perms, m.key, a.key)}
                              disabled={readOnly}
                              title={`${a.label} — ${m.label}`}
                              onChange={() => toggle(m.key, a.key)}
                            />
                          ) : (
                            <span style={{ color: 'var(--text3)', opacity: 0.35 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
