// src/pages/Settings.js
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/layout/Header';
import { useApp } from '../contexts/AppContext';
import { Card, Btn, Input, Select, FormGrid, PageHeader, Tabs } from '../components/ui';
import { getAll, create, remove, COLLECTIONS } from '../lib/db';
import toast from 'react-hot-toast';
import { Save, Plus, Trash2, Tag, Download, Smartphone, Check } from 'lucide-react';

function InstallSteps({ title, steps }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>
        <Smartphone size={14} />
        {title}
      </div>
      <ol style={{ margin: '8px 0 0', paddingLeft: 22, color: 'var(--text2)', fontSize: '0.82rem', lineHeight: 1.9 }}>
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </div>
  );
}

export default function Settings() {
  const { fyStartMonth, setFyStartMonth, isInstalled, installMode, triggerInstall } = useApp();
  const [tab, setTab] = useState('company');
  const [company, setCompany] = useState({
    name: 'S.I Trading & Co.',
    address: 'Karachi, Pakistan',
    phone: '',
    email: '',
    website: '',
    ntn: '',
    strn: '',
    currency: 'PKR',
    fiscalYear: 'jan-dec',
  });
  const [brands, setBrands] = useState([]);
  const [newBrand, setNewBrand] = useState('');
  const [loadingBrands, setLoadingBrands] = useState(false);

  const loadBrands = useCallback(async () => {
    setLoadingBrands(true);
    const data = await getAll(COLLECTIONS.BRANDS);
    setBrands(data.sort((a, b) => a.name.localeCompare(b.name)));
    setLoadingBrands(false);
  }, []);

  useEffect(() => { if (tab === 'brands') loadBrands(); }, [tab, loadBrands]);

  const handleAddBrand = async () => {
    const name = newBrand.trim();
    if (!name) return toast.error('Enter a brand name');
    if (brands.find(b => b.name.toLowerCase() === name.toLowerCase())) return toast.error('Brand already exists');
    try {
      await create(COLLECTIONS.BRANDS, { name });
      setNewBrand('');
      loadBrands();
      toast.success(`Brand "${name}" added`);
    } catch (e) { toast.error(e.message); }
  };

  const handleDeleteBrand = async (id, name) => {
    if (!window.confirm(`Move brand "${name}" to the trash? You can restore it from Trash.`)) return;
    try {
      await remove(COLLECTIONS.BRANDS, id);
      loadBrands();
      toast.success('Brand moved to trash');
    } catch (e) { toast.error(e.message); }
  };

  const handleSaveCompany = () => {
    toast.success('Company settings saved');
  };

  return (
    <>
      <Header title="Settings" />
      <div style={{ padding: 24 }}>
        <PageHeader title="Settings" subtitle="Configure your ERP system" />

        <Tabs
          tabs={[
            { value: 'company', label: 'Company' },
            { value: 'brands', label: 'Brands' },
            { value: 'invoice', label: 'Invoice' },
            { value: 'notifications', label: 'Notifications' },
            { value: 'app', label: 'App' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* Company */}
        {tab === 'company' && (
          <Card>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>Company Information</div>
            <FormGrid cols={2}>
              <Input label="Company Name" value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} />
              <Input label="Phone" value={company.phone} onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))} />
              <Input label="Email" type="email" value={company.email} onChange={e => setCompany(c => ({ ...c, email: e.target.value }))} />
              <Input label="Website" value={company.website} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} />
              <Input label="NTN" value={company.ntn} onChange={e => setCompany(c => ({ ...c, ntn: e.target.value }))} />
              <Input label="STRN" value={company.strn} onChange={e => setCompany(c => ({ ...c, strn: e.target.value }))} />
              <Select label="Currency" value={company.currency} onChange={e => setCompany(c => ({ ...c, currency: e.target.value }))}
                options={[{ value: 'PKR', label: 'PKR — Pakistani Rupee' }, { value: 'USD', label: 'USD — US Dollar' }]} />
              {/* Drives the fiscal-year filter in the header across the whole app. */}
              <Select label="Fiscal Year" value={String(fyStartMonth)}
                onChange={e => {
                  const m = Number(e.target.value);
                  setFyStartMonth(m);
                  setCompany(c => ({ ...c, fiscalYear: m === 1 ? 'jan-dec' : 'jul-jun' }));
                }}
                options={[{ value: '1', label: 'January – December' }, { value: '7', label: 'July – June' }]} />
            </FormGrid>
            <Input label="Address" value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} style={{ marginTop: 16 }} />
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Btn icon={Save} onClick={handleSaveCompany}>Save Settings</Btn>
            </div>
          </Card>
        )}

        {/* Brands */}
        {tab === 'brands' && (
          <Card>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Brand Management</div>
            <p style={{ color: 'var(--text3)', fontSize: '0.82rem', marginBottom: 20 }}>
              Brands added here will appear as a dropdown when creating inventory items.
            </p>

            {/* Add new brand */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              <input
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddBrand()}
                placeholder="Enter brand name (e.g. Hyundai, Solid, Ideal)"
                style={{ flex: 1, padding: '9px 14px' }}
              />
              <Btn icon={Plus} onClick={handleAddBrand}>Add Brand</Btn>
            </div>

            {/* Brand list */}
            {loadingBrands ? (
              <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>Loading...</div>
            ) : brands.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: '0.85rem', textAlign: 'center', padding: 40 }}>
                No brands yet. Add your first brand above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brands.map(brand => (
                  <div key={brand.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg3)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Tag size={14} color="var(--accent)" />
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{brand.name}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteBrand(brand.id, brand.name)}
                      style={{ background: 'none', color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Invoice Settings */}
        {tab === 'invoice' && (
          <Card>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>Invoice Settings</div>
            <FormGrid cols={2}>
              <Input label="Invoice Prefix (Sales)" value="SI" onChange={() => {}} placeholder="SI" />
              <Input label="Invoice Prefix (Purchase)" value="PI" onChange={() => {}} placeholder="PI" />
              <Input label="Starting Number" value="1" onChange={() => {}} type="number" />
              <Select label="Default Payment Terms" value="30"
                onChange={() => {}}
                options={['0', '15', '30', '45', '60', '90'].map(v => ({ value: v, label: `Net ${v} days` }))} />
            </FormGrid>
            <div style={{ marginTop: 16 }}>
              <Input label="Default Invoice Footer / Terms" value="Payment due within 30 days. Thank you for your business." onChange={() => {}} />
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Btn icon={Save} onClick={() => toast.success('Invoice settings saved')}>Save Settings</Btn>
            </div>
          </Card>
        )}

        {/* Notifications */}
        {tab === 'notifications' && (
          <Card>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>Notification Settings</div>
            <p style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>WhatsApp and email notification settings coming soon.</p>
          </Card>
        )}

        {/* App / install */}
        {tab === 'app' && (
          <Card>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>Install on Your Phone</div>

            {isInstalled ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: '0.85rem' }}>
                <Check size={16} style={{ color: '#22c55e' }} />
                SI ERP is installed and running from your home screen.
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 0, lineHeight: 1.6 }}>
                  SI ERP installs like a normal app — its own icon, full screen, no address bar,
                  and it still opens (read-only on cached pages) when you lose signal.
                </p>

                {installMode === 'prompt' && (
                  <div style={{ margin: '16px 0' }}>
                    <Btn icon={Download} onClick={triggerInstall}>Install SI ERP</Btn>
                  </div>
                )}

                <InstallSteps
                  title="Android — Chrome"
                  steps={[
                    'Open the app in Chrome and sign in.',
                    'Tap the ⋮ menu at the top right.',
                    'Tap "Install app" (or "Add to Home screen").',
                    'Confirm with Install — the SI icon lands on your home screen.',
                  ]}
                />
                <InstallSteps
                  title="iPhone / iPad — Safari"
                  steps={[
                    'Open the app in Safari (Chrome on iOS cannot install it).',
                    'Tap the Share button in the toolbar.',
                    'Scroll down and tap "Add to Home Screen".',
                    'Tap Add.',
                  ]}
                />
              </>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
