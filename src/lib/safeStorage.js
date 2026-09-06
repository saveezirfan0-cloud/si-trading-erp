// src/lib/safeStorage.js
//
// `window.localStorage` is not always readable. A browser set to block site
// data, private mode on some builds, and the in-app browsers people open links
// from all throw on the *property access itself*:
//
//   "Failed to read the 'localStorage' property from 'Window':
//    Access is denied for this document."
//
// That throw is not catchable by the code that merely reads a key later — it
// happens the moment the property is touched. One unguarded touch during a
// provider's initial state took the whole app down before the sign-in form
// could render, so the user saw the crash screen instead of Login.
//
// This wrapper is Storage-shaped, never throws, and falls back to an in-memory
// map when the real thing is unavailable. Preferences and the Supabase session
// then live for the length of the tab instead of forever — a reasonable
// degradation, and the app still works.

const memory = new Map();

// Resolved once: probe with a real write, because some browsers expose the
// object and only reject when it is used.
const realStorage = (() => {
  try {
    const s = window.localStorage;
    const probe = '__si_probe__';
    s.setItem(probe, probe);
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
})();

// False when the browser is blocking site data, so nothing written here
// survives a reload. The sign-in screen tells the user as much.
export const storageIsPersistent = Boolean(realStorage);

if (!storageIsPersistent) {
  console.warn(
    'Site data is blocked in this browser — preferences and the sign-in ' +
    'session will not survive a reload.'
  );
}

const safeStorage = {
  getItem(key) {
    if (!realStorage) return memory.has(key) ? memory.get(key) : null;
    try {
      return realStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key, value) {
    // Quota exceeded is the other everyday failure, and it is just as fatal
    // if it escapes. Callers treat storage as best-effort.
    if (!realStorage) { memory.set(key, String(value)); return; }
    try {
      realStorage.setItem(key, String(value));
    } catch {}
  },

  removeItem(key) {
    if (!realStorage) { memory.delete(key); return; }
    try {
      realStorage.removeItem(key);
    } catch {}
  },
};

export default safeStorage;
