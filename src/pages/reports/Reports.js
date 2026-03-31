// src/pages/reports/Reports.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Card, Btn, Tabs, Loader, PageHeader } from '../../components/ui';
import { Download, FileText } from 'lucide-react';
import { exportPDF } from '../../lib/export';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#f0a500', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const { formatCurrency } = useApp();
  const [tab, setTab] = useState('pl');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    expenses: [], payments: [], accounts: [], transactions: [], journals: []
  });
  const [period, setPeriod] = useState('this_month');

  const load = useCallback(async () => {
    setLoading(true);
    const [expenses, payments, accounts, transactions, journals] = await Promise.all([
      getAll(COLLECTIONS.EXPENSES),
      getAll(COLLECTIONS.PAYMENTS),
      getAll(COLLECTIONS.ACCOUNTS),
      getAll(COLLECTIONS.TRANSACTIONS),
      getAll(COLLECTIONS.JOURNALS),
    ]);
    setData({ expenses, payments, accounts, transactions, journals });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filterByPeriod = (items) => {
    const now = new Date();
    return items.filter(item => {
      const d = new Date(item.date);
      if (period === 'this_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (period === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
      }
      if (period === 'this_year') return d.getFullYear() === now.getFullYear();
      return true; // all time
    });
  };

  const fExpenses = filterByPeriod(data.expenses);
  const fPayments = filterByPeriod(data.payments);
  const fTransactions = filterByPeriod(data.transactions);

  const totalIncome = fPayments.filter(p => p.type === 'received').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalExpenses = fExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome ? ((netProfit / totalIncome) * 100).toFixed(1) : 0;

  // Expense by category for pie
  const expByCat = Object.entries(
    fExpenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Monthly P&L
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyPL = months.map((m, i) => {
    const income = data.payments
      .filter(p => p.type === 'received' && new Date(p.date).getMonth() === i)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const expenses = data.expenses
      .filter(e => new Date(e.date).getMonth() === i)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: m, income, expenses, profit: income - expenses };
  });

  // Balance sheet totals
  const assetAccounts = data.accounts.filter(a => a.type === 'asset');
  const liabilityAccounts = data.accounts.filter(a => a.type === 'liability');
  const equityAccounts = data.accounts.filter(a => a.type === 'equity');
  const totalAssets = assetAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalLiabilities = liabilityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalEquity = equityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);

  // Cash flow
  const cashIn = fTransactions.filter(t => t.type === 'receipt').reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashOut = fTransactions.filter(t => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);

  const periodLabel = { this_month: 'This Month', last_month: 'Last Month', this_year: 'This Year', all_time: 'All Time' }[period];

  return (
    <>
      <Header title="Reports" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Financial Reports"
          subtitle={`Period: ${periodLabel}`}
          actions={[
            <select key="period" value={period} onChange={e => setPeriod(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: '0.85rem' }}>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="all_time">All Time</option>
            </select>,
            <Btn key="pdf" variant="secondary" icon={Download} onClick={() => exportPDF('reports-content', 'SI_Trading_Report')}>Export PDF</Btn>,
          ]}
        />

        <Tabs
          tabs={[
            { value: 'pl', label: 'P&L Statement' },
            { value: 'balance', label: 'Balance Sheet' },
            { value: 'cashflow', label: 'Cash Flow' },
            { value: 'charts', label: 'Analytics' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {loading ? <Loader /> : (
          <div id="reports-content">
            {/* P&L */}
            {tab === 'pl' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  {[
                    { label: 'Total Revenue', value: formatCurrency(totalIncome), color: 'var(--green)' },
                    { label: 'Total Expenses', value: formatCurrency(totalExpenses), color: 'var(--red)' },
                    { label: 'Net Profit', value: formatCurrency(netProfit), color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Profit Margin', value: `${profitMargin}%`, color: 'var(--accent)' },
                  ].map(s => (
                    <Card key={s.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'var(--font-head)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                    </Card>
                  ))}
                </div>

                <Card>
                  <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 16 }}>Profit & Loss Statement — {periodLabel}</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={2} style={{ padding: '8px 0', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--green)', fontSize: '0.9rem' }}>INCOME</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>Revenue / Sales</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(totalIncome)}</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(34,197,94,0.05)' }}>
                        <td style={{ padding: '10px 0', fontWeight: 700 }}>Total Income</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(totalIncome)}</td>
                      </tr>

                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={2} style={{ padding: '16px 0 8px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.9rem' }}>EXPENSES</td>
                      </tr>
                      {expByCat.map(({ name, value }) => (
                        <tr key={name}>
                          <td style={{ padding: '8px 16px', color: 'var(--text2)' }}>{name}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatCurrency(value)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.05)' }}>
                        <td style={{ padding: '10px 0', fontWeight: 700 }}>Total Expenses</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{formatCurrency(totalExpenses)}</td>
                      </tr>

                      <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--bg3)' }}>
                        <td style={{ padding: '14px', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>NET PROFIT / LOSS</td>
                        <td style={{ padding: '14px', textAlign: 'right', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {formatCurrency(netProfit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {/* Balance Sheet */}
            {tab === 'balance' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Card>
                  <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--green)', marginBottom: 16 }}>ASSETS</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {assetAccounts.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 0', color: 'var(--text2)', fontSize: '0.85rem' }}>{a.code} - {a.name}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontSize: '0.85rem' }}>{formatCurrency(a.balance || 0)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(34,197,94,0.07)' }}>
                        <td style={{ padding: '12px 0', fontWeight: 700 }}>Total Assets</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(totalAssets)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Card>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', marginBottom: 16 }}>LIABILITIES</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {liabilityAccounts.map(a => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text2)', fontSize: '0.85rem' }}>{a.code} - {a.name}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right', fontSize: '0.85rem' }}>{formatCurrency(a.balance || 0)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'rgba(239,68,68,0.07)' }}>
                          <td style={{ padding: '12px 0', fontWeight: 700 }}>Total Liabilities</td>
                          <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{formatCurrency(totalLiabilities)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Card>

                  <Card>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--purple)', marginBottom: 16 }}>EQUITY</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {equityAccounts.map(a => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 0', color: 'var(--text2)', fontSize: '0.85rem' }}>{a.code} - {a.name}</td>
                            <td style={{ padding: '8px 0', textAlign: 'right', fontSize: '0.85rem' }}>{formatCurrency(a.balance || 0)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'rgba(139,92,246,0.07)' }}>
                          <td style={{ padding: '12px 0', fontWeight: 700 }}>Total Equity</td>
                          <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700, color: 'var(--purple)' }}>{formatCurrency(totalEquity)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--bg3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
                      <span>Liabilities + Equity</span>
                      <span style={{ color: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(totalLiabilities + totalEquity)}
                      </span>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* Cash Flow */}
            {tab === 'cashflow' && (
              <Card>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 20 }}>Cash Flow Statement — {periodLabel}</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '8px 0', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>OPERATING ACTIVITIES</td>
                    </tr>
                    <tr><td style={{ padding: '8px 16px', color: 'var(--text2)' }}>Cash Receipts from Customers</td><td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatCurrency(cashIn)}</td></tr>
                    <tr><td style={{ padding: '8px 16px', color: 'var(--text2)' }}>Cash Payments (Expenses)</td><td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatCurrency(totalExpenses)})</td></tr>
                    <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                      <td style={{ padding: '10px 0' }}>Net Operating Cash Flow</td>
                      <td style={{ textAlign: 'right', color: cashIn - totalExpenses >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(cashIn - totalExpenses)}</td>
                    </tr>

                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '16px 0 8px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>FINANCING ACTIVITIES</td>
                    </tr>
                    <tr><td style={{ padding: '8px 16px', color: 'var(--text2)' }}>Payments Made to Suppliers</td><td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatCurrency(cashOut)})</td></tr>
                    <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                      <td style={{ padding: '10px 0' }}>Net Financing Cash Flow</td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatCurrency(cashOut)})</td>
                    </tr>

                    <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border2)' }}>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>NET CASH POSITION</td>
                      <td style={{ padding: '14px', textAlign: 'right', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: (cashIn - cashOut - totalExpenses) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(cashIn - cashOut - totalExpenses)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            )}

            {/* Analytics */}
            {tab === 'charts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
                  <Card>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 20, fontSize: '0.9rem' }}>Monthly P&L</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={monthlyPL}>
                        <XAxis dataKey="month" stroke="var(--text3)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--text3)" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={v => formatCurrency(v)} />
                        <Bar dataKey="income" fill="var(--green)" radius={[4,4,0,0]} />
                        <Bar dataKey="expenses" fill="var(--red)" radius={[4,4,0,0]} />
                        <Bar dataKey="profit" fill="var(--accent)" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card>
                    <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 20, fontSize: '0.9rem' }}>Expenses by Category</h3>
                    {expByCat.length === 0 ? (
                      <p style={{ color: 'var(--text3)', fontSize: '0.82rem' }}>No expense data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={expByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                            {expByCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
