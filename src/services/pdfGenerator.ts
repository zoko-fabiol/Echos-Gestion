import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { CompanyInfo } from '../config/constants';
import { DailyRecord, Quote } from '../db/database';

const sanitizeNumber = (n: number) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// --- GENERATE BON DE LIVRAISON PDF ---

export function generateDeliveryPDF(
  quote: Quote,
  companyInfo: CompanyInfo,
  logoData: string | null
) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 15;

  const bonRef = `BON-${quote.id.toString().slice(-6)}`;
  const clientName = quote.clientName || 'Client Non Spécifié';
  const clientPhone = quote.clientPhone || '';

  // 1. Logo
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', 15, y, 22, 22);
    } catch (e) {
      console.warn("Logo error on PDF", e);
    }
  }

  // 2. Company Info
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.name, 47, y + 3);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const contactLines = companyInfo.contact.split('\n');
  let contactY = y + 8;
  contactLines.forEach(line => {
    doc.text(line, 47, contactY);
    contactY += 4;
  });

  // 3. Document Title
  doc.setFontSize(22);
  doc.setTextColor(20, 82, 45); // Brand primary color
  doc.setFont('helvetica', 'bold');
  doc.text("BON DE LIVRAISON", pageWidth / 2, y + 10, { align: 'center' });

  // 4. Ref & Date
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Réf: ${bonRef}`, pageWidth - 15, y + 5, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${new Date(quote.date).toLocaleDateString('fr-FR')}`, pageWidth - 15, y + 11, { align: 'right' });

  // 5. Client Box
  const clientBoxY = y + 30;
  doc.setFillColor(240, 248, 240);
  doc.rect(15, clientBoxY, pageWidth - 30, 22, 'F');

  doc.setFontSize(8);
  doc.setTextColor(20, 82, 45);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENT / DESTINATAIRE", 20, clientBoxY + 5);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(clientName, 20, clientBoxY + 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tél: ${clientPhone || 'N/A'}`, 20, clientBoxY + 17);

  // 6. Items Table
  const tableStartY = clientBoxY + 28;
  const body = (quote.items || []).map((item, i) => [
    i + 1,
    item.name,
    sanitizeNumber(item.initialStock),
    sanitizeNumber(item.qty),
    sanitizeNumber(item.finalStock),
    item.unit || 'Unit'
  ]);

  doc.autoTable({
    startY: tableStartY,
    head: [['#', 'Produit', 'Stock Initial', 'Qté Livrée', 'Stock Final', 'Unité']],
    body: body,
    theme: 'grid',
    headStyles: {
      fillColor: [20, 82, 45],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'center', cellWidth: 25, fontStyle: 'bold', textColor: [20, 82, 45] },
      4: { halign: 'center', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 20 }
    },
    margin: { left: 15, right: 15 }
  });

  // 7. Notes
  const notesY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setTextColor(20, 82, 45);
  doc.setFont('helvetica', 'bold');
  doc.text("NOTES", 15, notesY);

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text("- Vérifier les quantités et l'état des produits à la réception.", 15, notesY + 5);
  doc.text("- Tout problème doit être signalé sous 48 heures.", 15, notesY + 9);

  // 8. Signatures
  const sigY = pageHeight - 50;
  doc.setDrawColor(220);
  doc.line(15, sigY, pageWidth - 15, sigY);

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');

  doc.text("Signature Livreur", 35, sigY + 6, { align: 'center' });
  doc.line(15, sigY + 12, 55, sigY + 12);

  doc.text("Signature Client", pageWidth - 35, sigY + 6, { align: 'center' });
  doc.line(pageWidth - 55, sigY + 12, pageWidth - 15, sigY + 12);

  doc.text("Cachet", pageWidth / 2, sigY + 6, { align: 'center' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(companyInfo.footer, pageWidth / 2, pageHeight - 8, { align: 'center' });

  doc.save(`BON_LIVRAISON_${bonRef}.pdf`);
}

// --- GENERATE INVOICE / DEVIS PDF ---

export function generateInvoicePDF(
  record: DailyRecord | Quote,
  type: 'sale' | 'quote',
  companyInfo: CompanyInfo,
  logoData: string | null
) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 15;

  const docType = type === 'sale' ? 'Facture' : 'Devis';
  const docRef = type === 'sale' ? `FAC-${record.id.toString().slice(-6)}` : `DEV-${record.id.toString().slice(-6)}`;
  const clientName = (record as any).clientName || 'Client Non Spécifié';
  const clientPhone = (record as any).clientPhone || '';
  const totalToPay = record.total;

  // 1. Logo
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', 15, y, 22, 22);
    } catch (e) {
      console.warn("Logo error on PDF", e);
    }
  }

  // 2. Company Info
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.name, 47, y + 3);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const contactLines = companyInfo.contact.split('\n');
  let contactY = y + 8;
  contactLines.forEach(line => {
    doc.text(line, 47, contactY);
    contactY += 4;
  });

  // 3. Document Title
  doc.setFontSize(22);
  doc.setTextColor(20, 82, 45);
  doc.setFont('helvetica', 'bold');
  doc.text(docType.toUpperCase(), pageWidth - 15, y + 8, { align: 'right' });

  // 4. Ref & Date
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${new Date(record.date).toLocaleDateString('fr-FR')}`, pageWidth - 15, y + 14, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Réf: ${docRef}`, pageWidth - 15, y + 20, { align: 'right' });

  // 5. Client Box
  const clientBoxY = y + 28;
  doc.setFillColor(245, 250, 245);
  doc.rect(120, clientBoxY, 75, 22, 'F');

  doc.setFontSize(8);
  doc.setTextColor(20, 82, 45);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENT", 125, clientBoxY + 5);

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  const nameLines = doc.splitTextToSize(clientName, 65);
  doc.text(nameLines, 125, clientBoxY + 10);
  doc.setFontSize(9);
  doc.text(clientPhone, 125, clientBoxY + 17);

  // 6. Items Table
  const body = (record.items || []).map((item: any, i: number) => [
    i + 1,
    item.name,
    `${item.qty} ${item.saleUnit || 'Unit'}`,
    sanitizeNumber(item.price) + ' F',
    sanitizeNumber(item.total) + ' F'
  ]);

  doc.autoTable({
    startY: clientBoxY + 28,
    head: [['#', 'Description', 'Qté', 'Prix U.', 'Total']],
    body: body,
    theme: 'grid',
    headStyles: {
      fillColor: [20, 82, 45],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', fontStyle: 'bold', textColor: [20, 82, 45], cellWidth: 30 }
    },
    margin: { left: 15, right: 15 }
  });

  // 7. Total Box
  const totalBoxY = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(245, 250, 245);
  doc.rect(pageWidth - 90, totalBoxY, 75, 22, 'F');

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text("Total HT", pageWidth - 85, totalBoxY + 6);
  doc.text(sanitizeNumber(totalToPay) + ' FCFA', pageWidth - 20, totalBoxY + 6, { align: 'right' });

  doc.setFontSize(11);
  doc.setTextColor(20, 82, 45);
  doc.setFont('helvetica', 'bold');
  doc.text("Net à Payer", pageWidth - 85, totalBoxY + 14);
  doc.text(sanitizeNumber(totalToPay) + ' FCFA', pageWidth - 20, totalBoxY + 14, { align: 'right' });

  // 8. Signatures
  const sigY = pageHeight - 50;
  doc.setDrawColor(220);
  doc.line(15, sigY, pageWidth - 15, sigY);

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');

  doc.text("Signature Client", 30, sigY + 6, { align: 'center' });
  doc.line(15, sigY + 12, 45, sigY + 12);

  doc.text("Signature Vendeur", pageWidth - 30, sigY + 6, { align: 'center' });
  doc.line(pageWidth - 45, sigY + 12, pageWidth - 15, sigY + 12);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(companyInfo.footer, pageWidth / 2, pageHeight - 8, { align: 'center' });

  doc.save(`${docType}_${docRef}.pdf`);
}
