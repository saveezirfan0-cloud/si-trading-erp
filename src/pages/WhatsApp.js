// src/pages/WhatsApp.js
import React, { useState, useEffect } from 'react';
import { getAll, COLLECTIONS } from '../lib/db';
import Header from '../components/layout/Header';
import { Card, Btn, Input, Select, Textarea, PageHeader, Badge, FormGrid } from '../components/ui';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Copy, ExternalLink, Phone } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'payment_reminder',
    label: 'Payment Reminder',
    template: (data) => `Dear ${data.name},\n\nThis is a friendly reminder that your payment of *PKR ${data.amount}* is due.\n\nPlease arrange payment at your earliest convenience.\n\nThank you,\n*S.I Trading & Co.*`,
  },
  {
    id: 'order_confirmation',
    label: 'Order Confirmation',
    template: (data) => `Dear ${data.name},\n\nYour order has been confirmed.\n\nOrder Details:\n📦 Items: ${data.items || 'As discussed'}\n💰 Amount: *PKR ${data.amount}*\n📅 Date: ${new Date().toLocaleDateString()}\n\nThank you for your business!\n*S.I Trading & Co.*`,
  },
  {
    id: 'payment_received',
    label: 'Payment Received',
    template: (data) => `Dear ${data.name},\n\nWe confirm receipt of your payment of *PKR ${data.amount}*.\n\nReference: ${data.reference || 'N/A'}\nDate: ${new Date().toLocaleDateString()}\n\nThank you!\n*S.I Trading & Co.*`,
  },
  {
    id: 'low_stock',
    label: 'Low Stock Alert',
    template: (data) => `⚠️ *Low Stock Alert*\n\nItem: ${data.name}\nCode: ${data.code}\nCurrent Stock: ${data.quantity} units\nReorder Level: ${data.reorderLevel} units\n\nPlease reorder soon.\n*S.I Trading & Co.*`,
  },
  {
    id: 'custom',
    label: 'Custom Message',
    template: (data) => data.message || '',
  },
];

export default function WhatsApp() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [partyType, setPartyType] = useState('customer');
  const [selectedParty, setSelectedParty] = useState('');
  const [phone, setPhone] = useState('');
  const [data, setData] = useState({ name: '', amount: '', items: '', reference: '', message: '' });
  const [preview, setPreview] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [c, s] = await Promise.all([getAll(COLLECTIONS.CUSTOMERS), getAll(COLLECTIONS.SUPPLIERS)]);
      setCustomers(c);
      setSuppliers(s);
    };
    load();
  }, []);

  const parties = partyType === 'customer' ? customers : suppliers;

  const handlePartySelect = (id) => {
    setSelectedParty(id);
    const party = parties.find(p => p.id === id);
    if (party) {
      setPhone(party.phone || '');
      setData(d => ({ ...d, name: party.name || party.company || '' }));
    }
  };

  useEffect(() => {
    setPreview(template.template(data));
  }, [template, data]);

  const formatPhone = (p) => {
    let num = p.replace(/\D/g, '');
    if (num.startsWith('0')) num = '92' + num.slice(1);
    if (!num.startsWith('92')) num = '92' + num;
    return num;
  };

  const sendWhatsApp = () => {
    if (!phone) return toast.error('Phone number required');
    const num = formatPhone(phone);
    const encoded = encodeURIComponent(preview);
    const url = `https://wa.me/${num}?text=${encoded}`;
    window.open(url, '_blank');
    const entry = {
      id: Date.now(),
      to: data.name || phone,
      phone,
      template: template.label,
      time: new Date().toLocaleTimeString(),
      preview: preview.slice(0, 60) + '...',
    };
    setHistory(h => [entry, ...h.slice(0, 19)]);
    toast.success('WhatsApp opened');
  };

  const copyText = () => {
    navigator.clipboard.writeText(preview);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      <Header title="WhatsApp" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="WhatsApp Notifications"
          subtitle="Send messages to customers and suppliers via WhatsApp"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Compose */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 16, fontSize: '0.9rem' }}>Compose Message</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FormGrid cols={2}>
                  <Select label="Party Type" value={partyType} onChange={e => { setPartyType(e.target.value); setSelectedParty(''); setPhone(''); }}
                    options={[{ value: 'customer', label: 'Customer' }, { value: 'supplier', label: 'Supplier' }]} />
                  <Select label="Select Party" value={selectedParty} onChange={e => handlePartySelect(e.target.value)}
                    options={parties.map(p => ({ value: p.id, label: p.name || p.company }))} />
                </FormGrid>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500, marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Phone size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03001234567"
                        style={{ paddingLeft: 30, padding: '8px 12px 8px 30px', width: '100%' }} />
                    </div>
                  </div>
                </div>

                <Select label="Message Template" value={template.id}
                  onChange={e => setTemplate(TEMPLATES.find(t => t.id === e.target.value) || TEMPLATES[0])}
                  options={TEMPLATES.map(t => ({ value: t.id, label: t.label }))} />

                {/* Dynamic fields */}
                <FormGrid cols={2}>
                  <Input label="Name" value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} />
                  <Input label="Amount (PKR)" value={data.amount} onChange={e => setData(d => ({ ...d, amount: e.target.value }))} />
                  {template.id === 'order_confirmation' && (
                    <Input label="Items" value={data.items} onChange={e => setData(d => ({ ...d, items: e.target.value }))} style={{ gridColumn: 'span 2' }} />
                  )}
                  {template.id === 'payment_received' && (
                    <Input label="Reference" value={data.reference} onChange={e => setData(d => ({ ...d, reference: e.target.value }))} />
                  )}
                </FormGrid>

                {template.id === 'custom' && (
                  <Textarea label="Custom Message" value={data.message} onChange={e => setData(d => ({ ...d, message: e.target.value }))} rows={4} />
                )}
              </div>
            </Card>

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="secondary" icon={Copy} onClick={copyText} style={{ flex: 1 }}>Copy Text</Btn>
              <Btn icon={Send} onClick={sendWhatsApp} style={{ flex: 2, justifyContent: 'center' }}>
                Open in WhatsApp
              </Btn>
            </div>
          </div>

          {/* Preview + History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Preview */}
            <Card>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 14, fontSize: '0.9rem' }}>Message Preview</h3>
              <div style={{
                background: '#0b5e30',
                borderRadius: 12,
                padding: 16,
                minHeight: 160,
                position: 'relative',
              }}>
                <div style={{
                  background: '#dcf8c6',
                  color: '#111',
                  borderRadius: '12px 12px 0 12px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  maxWidth: '90%',
                  marginLeft: 'auto',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}>
                  {preview || 'Fill in the fields to preview your message...'}
                </div>
                <div style={{ position: 'absolute', bottom: 8, right: 16 }}>
                  <MessageSquare size={20} color="rgba(255,255,255,0.2)" />
                </div>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 8 }}>
                Preview only — actual formatting may vary in WhatsApp
              </p>
            </Card>

            {/* History */}
            {history.length > 0 && (
              <Card>
                <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 14, fontSize: '0.9rem' }}>Recent Messages</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.map(h => (
                    <div key={h.id} style={{
                      padding: '10px 12px',
                      background: 'var(--bg3)',
                      borderRadius: 8,
                      borderLeft: '3px solid var(--green)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{h.to}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{h.time}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{h.template} · {h.phone}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Info */}
        <Card style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <MessageSquare size={20} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>How WhatsApp Integration Works</div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                This uses the official WhatsApp "Click to Chat" API (wa.me). Clicking "Open in WhatsApp" will open WhatsApp
                Web or the mobile app with the pre-filled message. No API keys or Business Account required.
                For automated sending, integrate the <strong>WhatsApp Business API</strong> or use a service like Twilio or WaBlas.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
