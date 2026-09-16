// src/lib/documentPdf.js — one sales document as a real PDF file.
//
// "Print / PDF" hands the document to the browser's print dialog, which is
// fine at a desk but no use on a phone and never produces a file you can
// attach to a message. This builds the same document as an A4 PDF and saves
// it, so a quotation can be sent to a customer as QT-0001.pdf.
//
// jsPDF and jspdf-autotable are loaded on demand: they are the two largest
// dependencies in the app and nothing but this needs them.
import { partyLines } from './invoices';
import { docLabel, isQuotation } from './salesDocs';

const ACCENT = [212, 144, 10];   // the brand amber, as the print layout uses
const INK = [17, 17, 17];
const MUTED = [136, 136, 136];

const money = (n) => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const text = (v) => (v == null ? '' : String(v));

export const documentFileName = (doc) =>
  `${text(doc?.invoiceNo) || docLabel(doc)}`.replace(/[^\w.-]+/g, '_');

// Returns the jsPDF document, so a caller can save it, open it, or hand the
// bytes to something else.
export const buildDocumentPdf = async (doc, { company = 'S.I Trading & Co.', tagline = 'Power Tools & Hand Tools' } = {}) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const M = 15;                       // page margin
  const right = pageW - M;
  const quote = isQuotation(doc);
  const label = docLabel(doc).toUpperCase();
  const party = partyLines(doc, 'customerName');

  // ── Letterhead ────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...ACCENT);
  pdf.text(company, M, 22);
  pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
  pdf.text(tagline.toUpperCase(), M, 27);

  pdf.setFontSize(8).setTextColor(...MUTED);
  pdf.text(label, right, 20, { align: 'right' });
  pdf.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK);
  pdf.text(text(doc?.invoiceNo), right, 27, { align: 'right' });

  pdf.setDrawColor(...ACCENT).setLineWidth(0.8);
  pdf.line(M, 32, right, 32);

  // ── Who it is for, and its dates ──────────────────────────────────────────
  let y = 41;
  pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED);
  pdf.text(quote ? 'QUOTATION FOR' : 'BILL TO', M, y);

  const facts = [
    [quote ? 'Quotation date' : 'Invoice date', text(doc?.date)],
    [quote ? 'Valid until' : 'Due date', text(doc?.dueDate) || '—'],
    ...(doc?.reference ? [['Reference', text(doc.reference)]] : []),
    ...(doc?.quotationNo ? [['Quotation', text(doc.quotationNo)]] : []),
    ...(!quote && doc?.paymentMethod ? [['Payment method', text(doc.paymentMethod).replace(/_/g, ' ')]] : []),
  ];
  facts.forEach(([k], i) => {
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED);
    pdf.text(String(k).toUpperCase(), right, y + i * 9, { align: 'right' });
  });

  const addressed = [
    party.heading,
    party.person,
    party.attention ? `Kind Attention: ${party.attention}` : '',
    text(doc?.customerPhone),
    text(doc?.customerAddress),
  ].filter(Boolean);
  addressed.forEach((line, i) => {
    pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal')
      .setFontSize(i === 0 ? 11 : 9)
      .setTextColor(i === 0 ? INK[0] : 85, i === 0 ? INK[1] : 85, i === 0 ? INK[2] : 85);
    pdf.text(line, M, y + 6 + i * 5, { maxWidth: pageW / 2 - M });
  });
  facts.forEach(([, v], i) => {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    pdf.text(text(v), right, y + 5 + i * 9, { align: 'right' });
  });

  y = Math.max(y + 6 + addressed.length * 5, y + facts.length * 9) + 6;

  // ── Line items ────────────────────────────────────────────────────────────
  const items = Array.isArray(doc?.items) ? doc.items : [];
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    head: [['#', 'Item', 'Qty', 'Unit', 'Unit price', 'Disc%', 'Tax%', 'Total']],
    body: items.map((line, i) => [
      i + 1,
      [text(line.itemName), text(line.itemCode), text(line.description)]
        .filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join('\n'),
      text(line.qty),
      text(line.unit),
      money(line.unitPrice),
      `${Number(line.discount) || 0}%`,
      `${Number(line.taxRate) || 0}%`,
      money(line.total),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2.4, textColor: INK, lineColor: [235, 235, 235], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 8, textColor: MUTED },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 14, textColor: MUTED },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 14, textColor: MUTED },
      6: { halign: 'right', cellWidth: 14, textColor: MUTED },
      7: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  y = pdf.lastAutoTable.finalY + 8;
  const boxW = 70;
  const boxL = right - boxW;
  const rows = [
    ['Subtotal', money(doc?.subtotal)],
    ['Discount', `− ${money(doc?.discountAmount)}`],
    ['Tax', `+ ${money(doc?.taxAmount)}`],
  ];
  rows.forEach(([k, v], i) => {
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(85, 85, 85);
    pdf.text(k, boxL, y + i * 5.5);
    pdf.setTextColor(...INK);
    pdf.text(v, right, y + i * 5.5, { align: 'right' });
  });
  y += rows.length * 5.5 + 1;
  pdf.setDrawColor(...INK).setLineWidth(0.4);
  pdf.line(boxL, y, right, y);
  y += 6;
  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
  pdf.text('Total', boxL, y);
  pdf.setTextColor(...ACCENT);
  pdf.text(money(doc?.total), right, y, { align: 'right' });

  // A quotation is an offer: it has nothing paid and nothing due.
  if (!quote && Number(doc?.paidAmount) > 0) {
    y += 6;
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(22, 163, 74);
    pdf.text('Paid', boxL, y);
    pdf.text(`− ${money(doc.paidAmount)}`, right, y, { align: 'right' });
    y += 6;
    pdf.setFont('helvetica', 'bold').setTextColor(220, 38, 38);
    pdf.text('Balance due', boxL, y);
    pdf.text(money((Number(doc.total) || 0) - (Number(doc.paidAmount) || 0)), right, y, { align: 'right' });
  }

  // ── Notes, terms and the footer ───────────────────────────────────────────
  y += 12;
  [['Notes', doc?.notes], ['Terms & Conditions', doc?.terms]].forEach(([k, v]) => {
    if (!v) return;
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED);
    pdf.text(k.toUpperCase(), M, y);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(85, 85, 85);
    const lines = pdf.splitTextToSize(text(v), pageW - 2 * M);
    pdf.text(lines, M, y + 4);
    y += 6 + lines.length * 4;
  });

  pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(190, 190, 190);
  pdf.text(
    `Generated by ${company} ERP · ${new Date().toLocaleDateString()}`,
    pageW / 2, pdf.internal.pageSize.getHeight() - 10, { align: 'center' }
  );

  return pdf;
};

// Saves the document to the visitor's downloads as "QT-0001.pdf".
export const downloadDocumentPdf = async (doc, opts) => {
  const pdf = await buildDocumentPdf(doc, opts);
  pdf.save(`${documentFileName(doc)}.pdf`);
};
