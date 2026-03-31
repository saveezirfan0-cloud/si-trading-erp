// src/hooks/useMobile.js
import { useEffect, useCallback } from 'react';

/**
 * useViewportHeight
 * Fixes the 100vh bug on iOS Safari where vh includes the browser chrome.
 * Sets a --vh CSS variable that equals 1% of the actual visible viewport height.
 * Usage in CSS: height: calc(var(--vh, 1vh) * 100);
 */
export function useViewportHeight() {
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);
}

/**
 * usePullToRefresh
 * Calls `onRefresh` when the user pulls down from the top of the page.
 * Only fires when scrolled to the very top (scrollY === 0).
 */
export function usePullToRefresh(onRefresh, threshold = 80) {
  const handleTouchStart = useCallback((e) => {
    if (window.scrollY !== 0) return;
    const startY = e.touches[0].clientY;

    const handleTouchEnd = (e2) => {
      const delta = e2.changedTouches[0].clientY - startY;
      if (delta > threshold) onRefresh();
      document.removeEventListener('touchend', handleTouchEnd);
    };
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  }, [onRefresh, threshold]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, [handleTouchStart]);
}

/**
 * useLockBodyScroll
 * Prevents body scroll when a modal/drawer is open on iOS.
 */
export function useLockBodyScroll(active) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // iOS also needs position fixed workaround
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = prev;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
