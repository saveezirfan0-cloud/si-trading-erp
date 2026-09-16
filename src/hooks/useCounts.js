// src/hooks/useCounts.js — live record counts for the sidebar, Manager.io style.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { COLLECTIONS } from '../lib/db';

const TABLES = [
  COLLECTIONS.CUSTOMERS, COLLECTIONS.SUPPLIERS, COLLECTIONS.INVENTORY,
  COLLECTIONS.SALES_INVOICES, COLLECTIONS.PURCHASE_INVOICES,
  COLLECTIONS.PAYMENTS, COLLECTIONS.EXPENSES,
];

// Quotations live in the sales table but have their own page, so they are
// counted separately and taken back off the invoice badge. Anything without a
// docType is an invoice: the field arrived after these records did.
export const QUOTATIONS_COUNT = 'quotations';

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
      const byTable = Object.fromEntries(entries);

      const { count: quotes } = await supabase
        .from(COLLECTIONS.SALES_INVOICES).select('id', { count: 'exact', head: true })
        .filter('doc->>deletedAt', 'is', null)
        .filter('doc->>docType', 'eq', 'quotation');
      const quotations = quotes ?? 0;

      if (!cancelled) setCounts({
        ...byTable,
        [QUOTATIONS_COUNT]: quotations,
        // Counting the quotations off rather than filtering them out avoids
        // relying on how a null docType compares in Postgres.
        [COLLECTIONS.SALES_INVOICES]: Math.max(0, (byTable[COLLECTIONS.SALES_INVOICES] || 0) - quotations),
      });
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
