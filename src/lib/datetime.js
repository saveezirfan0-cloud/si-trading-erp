// src/lib/datetime.js — one place for the date formats the audit views share.
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === 'string') {
    const d = parseISO(value);
    if (isValid(d)) return d;
  }
  const d = new Date(value);
  return isValid(d) ? d : null;
};

// "12 Aug 2026, 14:03"
export const formatDateTime = (value, fallback = '—') => {
  const d = toDate(value);
  return d ? format(d, 'dd MMM yyyy, HH:mm') : fallback;
};

// "12 Aug 2026"
export const formatDay = (value, fallback = '—') => {
  const d = toDate(value);
  return d ? format(d, 'dd MMM yyyy') : fallback;
};

// "3 days ago"
export const timeAgo = (value, fallback = '') => {
  const d = toDate(value);
  return d ? `${formatDistanceToNow(d)} ago` : fallback;
};

export { toDate };
