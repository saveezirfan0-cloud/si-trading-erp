// src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { subscribe, COLLECTIONS } from '../lib/db';
import { INVOICE_STATUSES, countsToTotals } from '../lib/invoiceStatus';
import { activeInvoices, isQuotation, isQuotationOpen, isExpired } from '../lib/invoices';
import { Card, Loader } from '../components/ui';
import Header from '../components/layout/Header';
import { Users, Truck, Package, TrendingUp, TrendingDown, Warehouse, Receipt, ShoppingCart, FileSignature } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#f0a500', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#94a3b8'];

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--font-head)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          <Icon size={16} />
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.74rem', color: 'var(--text3)', marginTop: -6 }}>{sub}</div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: '13px' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { formatCurrency, filterByFiscalYear, fiscalYear } = useApp();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ customers: 0, suppliers: 0, inventory: 0, inventoryValue: 0, totalPayments: 0, totalExpenses: 0, salesTotal: 0, purchasesTotal: 0, salesCount: 0, purchasesCount: 0, quotesOpen: 0, quotesValue: 0, quotesExpired: 0 });
  const [salesData, setSalesData] = useState([]);
  const [invoiceStatusData, setInvoiceStatusData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSalesData([]);
    let d = { customers: 0, suppliers: 0, inventory: 0, inventoryValue: 0, totalPayments: 0, totalExpenses: 0, salesTotal: 0, purchasesTotal: 0, salesCount: 0, purchasesCount: 0, quotesOpen: 0, quotesValue: 0, quotesExpired: 0 };
    let loaded = 0;
    const done = (n = 1) => { loaded += n; if (loaded >= 7) setLoading(false); };

    // Every subscription is collected so it can be torn down when the fiscal
    // year changes or the page unmounts.
    const unsubs = [];
    const track = (...args) => unsubs.push(subscribe(...args));

    track(COLLECTIONS.CUSTOMERS, r => { d = { ...d, customers: r.length }; setStats({ ...d }); done(); });
    track(COLLECTIONS.SUPPLIERS, r => { d = { ...d, suppliers: r.length }; setStats({ ...d }); done(); });
    track(COLLECTIONS.INVENTORY, r => { d = { ...d, inventory: r.length, inventoryValue: r.reduce((s, i) => s + ((i.costPrice || 0) * (i.quantity || 0)), 0) }; setStats({ ...d }); done(); });
    track(COLLECTIONS.PAYMENTS, rows => { const r = filterByFiscalYear(rows); d = { ...d, totalPayments: r.reduce((s, p) => s + (Number(p.amount) || 0), 0) }; setStats({ ...d }); done(); });
    track(COLLECTIONS.EXPENSES, rows => { const r = filterByFiscalYear(rows); d = { ...d, totalExpenses: r.reduce((s, e) => s + (Number(e.amount) || 0), 0) }; setStats({ ...d }); done(); });

    track(COLLECTIONS.SALES_INVOICES, rows => {
      // Duplicates never count, and drafts and invoices still awaiting
      // approval are not sales yet — they stay out of the headline totals and
      // the monthly chart, the same rule the Sales Invoices page uses.
      // Quotations are offers, not sales, whatever their status.
      const r = activeInvoices(filterByFiscalYear(rows)).filter(i => countsToTotals(i.status) && !isQuotation(i));
      d = { ...d, salesTotal: r.reduce((s, i) => s + (i.total || 0), 0), salesCount: r.length };

      // What is out with customers and still undecided: the money the business
      // has offered and not yet won or lost.
      const quotes = activeInvoices(filterByFiscalYear(rows)).filter(isQuotation);
      const open = quotes.filter((q) => isQuotationOpen(q) && !isExpired(q));
      d = {
        ...d,
        quotesOpen: open.length,
        quotesValue: open.reduce((s, q) => s + (q.total || 0), 0),
        quotesExpired: quotes.filter((q) => isExpired(q)).length,
      };
      setStats({ ...d });

      // Build monthly sales chart from real invoice data
      const monthMap = {};
      r.forEach(inv => {
        if (!inv.date) return;
        const mon = inv.date.slice(0, 7); // YYYY-MM
        if (!monthMap[mon]) monthMap[mon] = { sales: 0, purchases: 0 };
        monthMap[mon].sales += inv.total || 0;
      });
      setSalesData(prev => mergeMonthly(prev, monthMap, 'sales'));

      // Invoice status breakdown, including the review states. Built from the
      // full fiscal-year list so drafts and pending approvals still show here.
      const all = filterByFiscalYear(rows).filter(i => !isQuotation(i));
      const statuses = Object.fromEntries(INVOICE_STATUSES.map(st => [st.value, 0]));
      all.forEach(i => { if (statuses[i.status] !== undefined) statuses[i.status] += i.total || 0; });
      setInvoiceStatusData(
        INVOICE_STATUSES
          .map(st => ({ name: st.label, value: statuses[st.value] }))
          .filter(x => x.value > 0)
      );
      done();
    });

    track(COLLECTIONS.PURCHASE_INVOICES, rows => {
      const r = activeInvoices(filterByFiscalYear(rows)).filter(i => countsToTotals(i.status));
      d = { ...d, purchasesTotal: r.reduce((s, i) => s + (i.total || 0), 0), purchasesCount: r.length };
      setStats({ ...d });
      const monthMap = {};
      r.forEach(inv => {
        if (!inv.date) return;
        const mon = inv.date.slice(0, 7);
        if (!monthMap[mon]) monthMap[mon] = { sales: 0, purchases: 0 };
        monthMap[mon].purchases += inv.total || 0;
      });
      setSalesData(prev => mergeMonthly(prev, monthMap, 'purchases'));
      done();
    });
    return () => unsubs.forEach((u) => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const mergeMonthly = (prev, newMap, key) => {
    const merged = {};
    prev.forEach(p => { merged[p.month] = { ...p }; });
    Object.entries(newMap).forEach(([mon, vals]) => {
      if (!merged[mon]) merged[mon] = { month: mon, sales: 0, purchases: 0 };
      merged[mon][key] = vals[key];
    });
    return Object.values(merged).sort((a, b) => a.month.localeCompare(b.month)).slice(-6).map(m => ({
      ...m,
      label: new Date(m.month + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
    }));
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Fallback chart data if no invoices yet
  const chartData = salesData.length > 0 ? salesData : [
    { label: 'Oct', sales: 0, purchases: 0 },
    { label: 'Nov', sales: 0, purchases: 0 },
    { label: 'Dec', sales: 0, purchases: 0 },
  ];

  return (
    <>
      <Header title="Dashboard" />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Welcome */}
        <div style={{ background: 'linear-gradient(135deg, var(--accent-glow) 0%, transparent 70%)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 28px' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>
            {greeting}, {profile?.name?.split(' ')[0] || 'User'} 👋
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>Here's a snapshot of S.I Trading & Co. operations today.</p>
        </div>

        {loading ? <Loader /> : (<>
          {/* Stats — 4 columns */}
          <div className="g-stats" style={{ gap: 14 }}>
            <StatCard label="Customers" value={stats.customers} icon={Users} color="#3b82f6" />
            <StatCard label="Suppliers" value={stats.suppliers} icon={Truck} color="#8b5cf6" />
            <StatCard label="Inventory Items" value={stats.inventory} icon={Package} color="#22c55e" />
            <StatCard label="Inventory Value" value={formatCurrency(stats.inventoryValue)} icon={Warehouse} color="#f0a500" />
            <StatCard label="Sales Invoices" value={stats.salesCount} icon={Receipt} color="#f0a500" />
            <StatCard label="Purchase Invoices" value={stats.purchasesCount} icon={ShoppingCart} color="#8b5cf6" />
            <StatCard
              label="Open Quotations" value={stats.quotesOpen} icon={FileSignature} color="#8b5cf6"
              sub={stats.quotesExpired
                ? `${formatCurrency(stats.quotesValue)} · ${stats.quotesExpired} expired`
                : formatCurrency(stats.quotesValue)} />
            <StatCard label="Total Revenue" value={formatCurrency(stats.salesTotal)} icon={TrendingUp} color="#22c55e" />
            <StatCard label="Total Purchases" value={formatCurrency(stats.purchasesTotal)} icon={TrendingDown} color="#ef4444" />
          </div>

          {/* Charts row 1 */}
          <div className="g-chart" style={{ gap: 16 }}>
            <Card>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem' }}>Sales vs Purchases</h3>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2 }}>Monthly comparison from invoices</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0a500" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f0a500" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPurchases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" stroke="var(--text3)" tick={{ fontSize: 12, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--text3)" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#f0a500" fill="url(#gSales)" strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#8b5cf6" fill="url(#gPurchases)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                {[{ color: '#f0a500', label: 'Sales' }, { color: '#8b5cf6', label: 'Purchases' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text2)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />{l.label}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem' }}>Invoice Status</h3>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2 }}>Sales invoice breakdown</p>
              </div>
              {invoiceStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={invoiceStatusData} cx="50%" cy="45%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {invoiceStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                  No invoice data yet
                </div>
              )}
            </Card>
          </div>

          {/* Charts row 2 */}
          <div className="g-2" style={{ gap: 16 }}>
            <Card>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem' }}>Monthly Sales</h3>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2 }}>Revenue from sales invoices</p>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="var(--text3)" tick={{ fontSize: 12, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--text3)" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                  <Bar dataKey="sales" name="Sales" fill="#f0a500" radius={[5, 5, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem' }}>Monthly Purchases</h3>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 2 }}>Cost from purchase invoices</p>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="var(--text3)" tick={{ fontSize: 12, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--text3)" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                  <Bar dataKey="purchases" name="Purchases" fill="#8b5cf6" radius={[5, 5, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>)}
      </div>
    </>
  );
}
