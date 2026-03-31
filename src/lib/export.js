// src/lib/export.js
import Papa from 'papaparse';

// CSV Export
export const exportCSV = (data, filename = 'export') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }
  // Remove Firebase internal fields
  const clean = data.map(({ id, createdAt, updatedAt, ...rest }) => rest);
  const csv = Papa.unparse(clean);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// PDF Export (prints the given element)
export const exportPDF = (elementId, title = 'Report') => {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          h1,h2,h3 { font-family: Arial, sans-serif; }
          .no-print { display: none; }
          @page { margin: 20mm; }
        </style>
      </head>
      <body>
        <h2 style="text-align:center">S.I Trading & Co. — ${title}</h2>
        <p style="text-align:center;color:#666">Generated: ${new Date().toLocaleString()}</p>
        <hr/>
        ${el.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
};

// Export table data as PDF using jsPDF + autoTable
export const exportTablePDF = async (columns, data, title = 'Report', filename = 'report') => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('S.I Trading & Co.', 14, 15);
  doc.setFontSize(11);
  doc.text(title, 14, 22);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(doc, {
    head: [columns.map(c => c.label)],
    body: data.map(row => columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      if (val?.toDate) return val.toDate().toLocaleDateString();
      return String(val);
    })),
    startY: 33,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [240, 165, 0], textColor: 0, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};
