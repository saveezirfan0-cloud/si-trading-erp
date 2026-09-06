// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);

// ── PWA Service Worker ────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  // Whether a worker was already driving this page when it loaded. The first
  // visit has none: the worker installs and calls clients.claim(), which fires
  // controllerchange for a version that is not an update at all. Reloading on
  // that would bounce every first-time visitor.
  const hadController = Boolean(navigator.serviceWorker.controller);

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates every 60 seconds
        setInterval(() => registration.update(), 60 * 1000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — show a toast or banner
              const event = new CustomEvent('sw-update-available');
              window.dispatchEvent(event);
            }
          });
        });
      })
      .catch((err) => console.warn('SW registration failed:', err));

    // When new SW takes control, reload for fresh content
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
