// src/pages/import/Import.js
import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { batchCreate, COLLECTIONS } from '../../lib/db';
import Header from '../../components/layout/Header';
import { Card, Btn, PageHeader, Badge, Table } from '../../components/ui';
import toast from 'react-hot-toast';
import { Upload, FileText, CheckCircle, AlertTriangle, Download } from 'lucide-react';

const IMPORT_TYPES = [
  {
    value: 'customers',
    label: 'Customers',
    collection: COLLECTIONS.CUSTOMERS,
    fields: ['name', 'company', 'email', 'phone', 'city', 'country', 'type', 'balance'],
    sample: 'name,company,email,phone,city,country,type,balance\nJohn Doe,ABC Corp,john@abc.com,03001234567,Karachi,Pakistan,retail,0',
  },
  {
    value: 'suppliers',
    label: 'Suppliers',
    collection: COLLECTIONS.SUPPLIERS,
    fields: ['name', 'company', 'email', 'phone', 'city', 'category', 'paymentTerms'],
    sample: 'name,company,email,phone,city,category,paymentTerms\nAli Traders,Ali & Co,ali@traders.com,03111234567,Lahore,goods,30',
  },
  {
    value: 'inventory',
    label: 'Inventory Items',
    collection: COLLECTIONS.INVENTORY,
    fields: ['code', 'brand', 'name', 'category', 'unit', 'costPrice', 'salePrice', 'quantity', 'reorderLevel'],
    sample: 'code,brand,name,category,unit,costPrice,salePrice,quantity,reorderLevel\nITEM001,BrandX,Widget A,Electronics,pcs,500,800,100,20',
  },
  {
    value: 'accounts',
    label: 'Chart of Accounts',
    collection: COLLECTIONS.ACCOUNTS,
    fields: ['code', 'name', 'type', 'subType', 'balance'],
    sample: 'code,name,type,subType,balance\n1001,Cash and Bank,asset,Current Asset,0\n2001,Accounts Payable,liability,Current Liability,0',
  },
];

export default function Import() {
  const [selected, setSelected] = useState(IMPORT_TYPES[0]);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setPreview(results.data);
        setResult(null);
        toast.success(`${results.data.length} rows loaded from CSV`);
      },
      error: () => toast.error('Failed to parse CSV'),
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'text/csv' || file?.name.endsWith('.csv')) handleFile(file);
    else toast.error('Please drop a CSV file');
  };

  const handleImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    try {
      // Sanitize numbers
      const cleaned = preview.map(row => {
        const obj = { ...row, status: 'active' };
        ['balance', 'costPrice', 'salePrice', 'quantity', 'reorderLevel', 'paymentTerms'].forEach(f => {
          if (obj[f] !== undefined) obj[f] = Number(obj[f]) || 0;
        });
        return obj;
      });
      await batchCreate(selected.collection, cleaned);
      setResult({ success: preview.length, errors: 0 });
      setPreview(null);
      toast.success(`Successfully imported ${preview.length} ${selected.label}`);
    } catch (e) {
      setResult({ success: 0, errors: preview.length });
      toast.error('Import failed: ' + e.message);
    }
    setImporting(false);
  };

  const downloadSample = () => {
    const blob = new Blob([selected.sample], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sample_${selected.value}.csv`;
    a.click();
  };

  const previewColumns = preview?.length
    ? Object.keys(preview[0]).map(k => ({ key: k, label: k.toUpperCase() }))
    : [];

  return (
    <>
      <Header title="Data Import" />
      <div className="page-pad" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Data Import"
          subtitle="Bulk import data from CSV files"
        />

        <div className="g-import" style={{ gap: 20 }}>
          {/* Left: Type selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 14, fontSize: '0.9rem' }}>Import Type</h3>
              {IMPORT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setSelected(t); setPreview(null); setResult(null); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: selected.value === t.value ? 'var(--accent)' : 'var(--border)',
                    background: selected.value === t.value ? 'var(--accent-glow)' : 'transparent',
                    color: selected.value === t.value ? 'var(--accent)' : 'var(--text)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    fontWeight: selected.value === t.value ? 600 : 400,
                    cursor: 'pointer',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  <FileText size={14} />
                  {t.label}
                </button>
              ))}
            </Card>

            <Card>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 10, fontSize: '0.9rem' }}>Required Fields</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selected.fields.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
                    <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <Btn variant="secondary" icon={Download} onClick={downloadSample} style={{ marginTop: 14, width: '100%', justifyContent: 'center' }} size="sm">
                Download Sample CSV
              </Btn>
            </Card>
          </div>

          {/* Right: Upload + Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Drop zone */}
            <Card
              style={{
                border: '2px dashed var(--border2)',
                textAlign: 'center',
                padding: 40,
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={32} color="var(--text3)" style={{ marginBottom: 12 }} />
              <p style={{ fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 6 }}>Drop CSV file here or click to browse</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>Supports .csv files only</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
            </Card>

            {/* Result */}
            {result && (
              <Card style={{ borderColor: result.errors ? 'var(--red)' : 'var(--green)', background: result.errors ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {result.errors ? <AlertTriangle size={20} color="var(--red)" /> : <CheckCircle size={20} color="var(--green)" />}
                  <div>
                    <div style={{ fontWeight: 700 }}>{result.errors ? 'Import Failed' : 'Import Successful'}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
                      {result.success} records imported · {result.errors} errors
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Preview */}
            {preview && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem' }}>Preview</span>
                    <span style={{ marginLeft: 8 }}><Badge color="blue">{preview.length} rows</Badge></span>
                  </div>
                  <Btn
                    onClick={handleImport}
                    disabled={importing}
                    icon={importing ? undefined : Upload}
                  >
                    {importing ? 'Importing...' : `Import ${preview.length} ${selected.label}`}
                  </Btn>
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  <Table columns={previewColumns.slice(0, 6)} data={preview.slice(0, 20)} paginate={false} />
                  {preview.length > 20 && (
                    <div style={{ padding: '10px 16px', color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                      Showing first 20 of {preview.length} rows
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
