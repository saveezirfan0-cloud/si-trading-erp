// src/hooks/useCounts.js — live record counts for the sidebar, Manager.io style.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { COLLECTIONS } from '../lib/db';

const TABLES = [
  COLLECTIONS.CUSTOMERS, COLLECTIONS.SUPPLIERS, COLLECTIONS.INVENTORY,
  COLLECTIONS.SALES_INVOICES, COLLECTIONS.PURCHASE_INVOICES,
  COLLECTIONS.PAYMENTS, COLLECTIONS.EXPENSES,
];

export default function useCounts() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fetchCounts = async () => {
      const entries = await Promise.all(TABLES.map(async (t) => {
        // Trashed records are hidden from the lists, so they must not be
        // counted in the sidebar badges either.
        const { count } = await supabase
          .from(t).select('id', { count: 'exact', head: true })
          .filter('doc->>deletedAt', 'is', null);
        return [t, count ?? 0];
      }));
      if (!cancelled) setCounts(Object.fromEntries(entries));
    };
    fetchCounts();

    const channel = supabase.channel('sidebar-counts');
    TABLES.forEach((t) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        clearTimeout(timer);
        timer = setTimeout(fetchCounts, 500);
      });
    });
    channel.subscribe();

    return () => { cancelled = true; clearTimeout(timer); supabase.removeChannel(channel); };
  }, []);

  return counts;
}
