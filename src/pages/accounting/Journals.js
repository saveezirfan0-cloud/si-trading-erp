// src/pages/accounting/Journals.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, COLLECTIONS } from '../../lib/db';
import { useApp } from '../../contexts/AppContext';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Textarea, Badge, PageHeader, Card, Loader, FormGrid } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Trash2, Download } from 'lucide-react';
import { exportCSV } from '../../lib/export';

const emptyLine = () => ({ account: '', accountId: '', debit: 0, credit: 0, description: '' });

const EMPTY_JOURNAL = {
  date: new Date().toISOString().split('T')[0],
  reference: '',
  narration: '',
  type: 'general',
  lines: [emptyLine(), emptyLine()],
};

export default function Journals() {
  const { formatCurrency, formatDate } = useApp();
  const [journals, setJournals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_JOURNAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [j, a] = await Promise.all([
      getAll(COLLECTIONS.JOURNALS),
      getAll(COLLECTIONS.ACCOUNTS),
    ]);
    setJournals(j.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setAccounts(a.filter(x => x.active));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalDebit = form.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (i, field, val) => {
    setForm(p => ({
      ...p,
      lines: p.lines.map((l, idx) => idx === i ? { ...l, [field]: val } : l),
    }));
  };

  const addLine = () => setForm(p => ({ ...p, lines: [...p.lines, emptyLine()] }));
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!isBalanced) return toast.error('Journal must balance (Debit = Credit)');
    if (!form.narration) return toast.error('Narration required');
    setSaving(true);
    try {
      await create(COLLECTIONS.JOURNALS, { ...form, totalDebit, totalCredit });
      toast.success('Journal entry posted');
      setModal(false);
      setForm(EMPTY_JOURNAL);
      load();
    } catch { toast.error('Failed to post'); }
    setSaving(false);
  };

  const columns = [
    { key: 'date', label: 'Date', render: v => <span style={{ fontSize: '0.82rem' }}>{v}</span> },
    { key: 'reference', label: 'Reference' },
    { key: 'narration', label: 'Narration', wrap: true },
    { key: 'type', label: 'Type', render: v => <Badge color="purple">{v}</Badge> },
    { key: 'totalDebit', label: 'Debit', align: 'right', render: v => formatCurrency(v || 0) },
    { key: 'totalCredit', label: 'Credit', align: 'right', render: v => formatCurrency(v || 0) },
  ];

  return (
    <>
      <Header title="Journal Entries" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Journal Entries"
          subtitle={`${journals.length} entries posted`}
          actions={[
            <Btn key="exp" variant="secondary" icon={Download} onClick={() => exportCSV(journals, 'journals')}>Export</Btn>,
            <Btn key="add" icon={Plus} onClick={() => { setForm(EMPTY_JOURNAL); setModal(true); }}>New Entry</Btn>,
          ]}
        />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <Loader /> : <Table columns={columns} data={journals} />}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Journal Entry" width={720}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormGrid cols={3}>
            <Input label="Date" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <Input label="Reference" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
            <Select label="Type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              options={['general', 'opening', 'closing', 'adjustment', 'reversal']} />
          </FormGrid>
          <Input label="Narration *" value={form.narration} onChange={e => setForm(p => ({ ...p, narration: e.target.value }))} />

          {/* Lines */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>JOURNAL LINES</span>
              <Btn size="sm" variant="secondary" icon={Plus} onClick={addLine}>Add Line</Btn>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 32px',
                gap: 8, padding: '8px 12px',
                background: 'var(--bg3)',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'var(--font-head)', fontWeight: 700, textTransform: 'uppercase',
              }}>
                <span>Account</span><span>Debit</span><span>Credit</span><span>Description</span><span />
              </div>

              {form.lines.map((line, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 32px',
                  gap: 8, padding: '8px 12px',
                  borderBottom: i < form.lines.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}>
                  <select
                    value={line.account}
                    onChange={e => updateLine(i, 'account', e.target.value)}
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                  >
                    <option value="">— Account —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.name}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={line.debit || ''}
                    onChange={e => updateLine(i, 'debit', Number(e.target.value))}
                    placeholder="0"
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                  />
                  <input
                    type="number"
                    value={line.credit || ''}
                    onChange={e => updateLine(i, 'credit', Number(e.target.value))}
                    placeholder="0"
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                  />
                  <input
                    type="text"
                    value={line.description}
                    onChange={e => updateLine(i, 'description', e.target.value)}
                    placeholder="Note..."
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                  />
                  <button onClick={() => removeLine(i)} style={{ background: 'none', color: 'var(--red)', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Totals */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 32px',
                gap: 8, padding: '10px 12px',
                background: 'var(--bg3)',
                borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text2)' }}>TOTAL</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isBalanced ? 'var(--green)' : 'var(--accent)' }}>
                  {formatCurrency(totalDebit)}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isBalanced ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(totalCredit)}
                </span>
                <span style={{ fontSize: '0.75rem', color: isBalanced ? 'var(--green)' : 'var(--red)' }}>
                  {isBalanced ? '✓ Balanced' : `Difference: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving || !isBalanced}>{saving ? 'Posting...' : 'Post Entry'}</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}
