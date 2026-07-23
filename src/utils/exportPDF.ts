// ============================================================
// src/utils/exportPDF.ts
// Toutes les fonctions d'export PDF pour le module Stock / Commercial
// ============================================================

import jsPDF from 'jspdf';
import 'jspdf-autotable';

import {
  BRAND_GREEN,
  addPDFHeader,
  addPDFFooter,
  filterByTime,
  formatNum,
  formatDate,
  formatTime,
  getFilterLabel,
  getFilterSuffix,
  getDateSuffix,
  tableHeadStyles,
} from './exportHelpers';

import { showToast } from '../components/ui/Toast';

import type { Product, DailyRecord, Expense, Income, Client, Production, RawMaterial } from '../db/database';

// ----------------------------------------------------------------
// 1. INVENTAIRE PDF
// ----------------------------------------------------------------
export const exportInventoryPDF = (
  inventory: Product[],
  typeFilter: string = 'all'
): void => {
  let list = [...inventory];
  if (typeFilter !== 'all') list = list.filter(p => p.type === typeFilter);
  list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(doc, "RAPPORT D'INVENTAIRE");

  const heads = [
    ['Produit', 'Catégorie', 'Stock', 'Prix Vente', 'Unité V.', 'Prix Achat', 'Unité A.', 'Val. Vente (FCFA)', 'Val. Achat (FCFA)'],
  ];
  const body = list.map(p => [
    p.name,
    p.category,
    p.stock,
    formatNum(p.salePrice),
    p.saleUnit,
    formatNum(p.purchasePrice),
    p.purchaseUnit,
    formatNum(p.stock * p.salePrice),
    formatNum(p.stock * p.purchasePrice),
  ]);

  doc.autoTable({
    startY,
    head: heads,
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'right' },
      5: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        const stockVal = list[data.row.index]?.stock ?? 0;
        if (stockVal <= 0) data.cell.styles.textColor = [220, 53, 69];
        else if (stockVal < 5) data.cell.styles.textColor = [255, 127, 14];
      }
      if (data.section === 'body' && data.column.index === 7) {
        data.cell.styles.textColor = BRAND_GREEN;
      }
    },
  });

  // Résumé
  const totalVente = list.reduce((s, p) => s + p.stock * p.salePrice, 0);
  const alertes = list.filter(p => p.stock > 0 && p.stock < 5).length;
  const epuises = list.filter(p => p.stock <= 0).length;

  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 22, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Valeur totale stock (vente): ${formatNum(totalVente)} FCFA`, 20, finalY + 7);
  doc.text(`Total articles: ${list.length}`, 20, finalY + 13);
  doc.setTextColor(255, 127, 14);
  doc.text(`Alertes stock bas (<5): ${alertes}`, pageWidth / 2, finalY + 7);
  doc.setTextColor(220, 53, 69);
  doc.text(`Épuisés: ${epuises}`, pageWidth / 2, finalY + 13);

  addPDFFooter(doc);
  const typeSuffix = typeFilter === 'all' ? 'Tout' : typeFilter === 'finished' ? 'Produits-finis' : 'Matieres-premieres';
  doc.save(`Inventaire_${typeSuffix}_${getDateSuffix()}.pdf`);
  showToast('Inventaire exporté en PDF avec succès !', 'success');
};

// ----------------------------------------------------------------
// 2. HISTORIQUE DES VENTES PDF
// ----------------------------------------------------------------
export const exportHistoryPDF = (
  dailyRecords: DailyRecord[],
  filterValue: string = 'all'
): void => {
  const list = filterByTime(dailyRecords, filterValue)
    .filter(r => r.type === 'sale')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(doc, 'HISTORIQUE DES VENTES', getFilterLabel(filterValue));

  const body = list.map(r => [
    `${formatDate(r.date)} ${formatTime(r.date)}`,
    r.items.length,
    formatNum(r.total),
    formatNum(r.margin),
    r.items.map(i => `${i.name} (x${i.qty} × ${formatNum(i.price)} F)`).join('\n'),
  ]);

  doc.autoTable({
    startY,
    head: [['Date & Heure', 'Articles', 'Total (FCFA)', 'Marge Brute (FCFA)', 'Détails de la Vente']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 28 },
      4: { cellWidth: 'auto' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = [255, 127, 14];
      }
    },
  });

  const totalCA = list.reduce((s, r) => s + r.total, 0);
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 16, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total CA : ${formatNum(totalCA)} FCFA`, 20, finalY + 7);
  doc.text(`Total transactions : ${list.length}`, pageWidth / 2, finalY + 7);

  addPDFFooter(doc);
  doc.save(`Historique_Ventes_${getFilterSuffix(filterValue)}_${getDateSuffix()}.pdf`);
  showToast('Historique des ventes exporté en PDF !', 'success');
};

// ----------------------------------------------------------------
// 3. DÉPENSES PDF
// ----------------------------------------------------------------
export const exportExpensesPDF = (
  expenses: Expense[],
  timeFilter: string = 'all',
  paymentFilter: string = 'all'
): void => {
  let list = filterByTime(expenses, timeFilter);

  if (paymentFilter === 'partial') {
    list = list.filter(e => (e.remainingAmount ?? 0) > 0);
  } else if (paymentFilter === 'paid') {
    list = list.filter(e => (e.remainingAmount ?? 0) <= 0);
  }

  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(doc, 'HISTORIQUE DES DÉPENSES', getFilterLabel(timeFilter));

  const body = list.map(e => {
    let desc = e.description || '';
    if (e.transportCost) desc += `\nTransport: ${formatNum(e.transportCost)} F`;
    if (e.lossPercentage) desc += `\nPerte: ${e.lossPercentage}%`;
    if (e.paymentType === 'partial') {
      desc += `\nPayé: ${formatNum(e.paidAmount ?? 0)} F`;
      desc += `\nReste: ${formatNum(e.remainingAmount ?? 0)} F`;
    }
    return [formatDate(e.date), e.category, formatNum(e.amount), desc];
  });

  doc.autoTable({
    startY,
    head: [['Date', 'Catégorie', 'Montant', 'Description']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 35 },
      2: { halign: 'right', cellWidth: 30 },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        data.cell.styles.textColor = [220, 53, 69];
      }
    },
  });

  const totalDep = list.reduce((s, e) => s + e.amount, 0);
  const totalDettes = list.reduce((s, e) => s + (e.remainingAmount ?? 0), 0);
  let finalY = (doc as any).lastAutoTable.finalY + 6;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 10, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL DÉPENSES : ${formatNum(totalDep)} FCFA`, 20, finalY + 7);

  if (totalDettes > 0) {
    finalY += 12;
    doc.setFillColor(255, 243, 205);
    doc.rect(15, finalY, pageWidth - 30, 10, 'F');
    doc.setTextColor(204, 102, 0);
    doc.text(`TOTAL DETTES (reste à payer) : ${formatNum(totalDettes)} FCFA`, 20, finalY + 7);
  }

  addPDFFooter(doc);
  doc.save(`Depenses_${getFilterSuffix(timeFilter)}_${paymentFilter}_${getDateSuffix()}.pdf`);
  showToast('Dépenses exportées en PDF !', 'success');
};

// ----------------------------------------------------------------
// 4. RENTRÉES D'ARGENT PDF
// ----------------------------------------------------------------
export const exportIncomeHistoryPDF = (
  income: Income[],
  filterValue: string = 'all'
): void => {
  const list = filterByTime(income, filterValue).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(
    doc,
    "HISTORIQUE DES RENTRÉES D'ARGENT",
    getFilterLabel(filterValue)
  );

  const body = list.map(i => [
    formatDate(i.date),
    i.receivedBy || '',
    i.source || '',
    i.description || '',
    formatNum(i.amount),
  ]);

  doc.autoTable({
    startY,
    head: [['Date', 'Reçu par', 'Source', 'Description', 'Montant (FCFA)']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      4: { halign: 'right' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = BRAND_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const total = list.reduce((s, i) => s + i.amount, 0);
  const finalY = (doc as any).lastAutoTable.finalY + 2;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 10, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL RENTRÉES : ${formatNum(total)} FCFA`, 20, finalY + 7);

  addPDFFooter(doc);
  doc.save(`Rentrees_Argent_${getFilterSuffix(filterValue)}_${getDateSuffix()}.pdf`);
  showToast("Rentrées d'argent exportées en PDF !", 'success');
};

// ----------------------------------------------------------------
// 5. CLIENTS PDF
// ----------------------------------------------------------------
export const exportClientsPDF = (clients: Client[]): void => {
  const list = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(
    doc,
    'LISTE DES CLIENTS ENREGISTRÉS',
    `Total Clients : ${list.length}`
  );

  const body = list.map((c, i) => [
    i + 1,
    c.name,
    c.phone || c.contact || '',
    '',
  ]);

  doc.autoTable({
    startY,
    head: [['#', 'Nom / Entité', 'Téléphone', 'Adresse / Ville']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
    },
  });

  addPDFFooter(doc);
  doc.save(`Clients_${getDateSuffix()}.pdf`);
  showToast('Liste des clients exportée en PDF !', 'success');
};

// ----------------------------------------------------------------
// 6. PRODUCTION PDF
// ----------------------------------------------------------------
export const exportProductionPDF = (
  productions: Production[],
  filterValue: string = 'all'
): void => {
  const list = filterByTime(productions, filterValue).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const startY = addPDFHeader(doc, 'RAPPORT DE PRODUCTION', getFilterLabel(filterValue));

  const body: any[] = list.map(p => [
    formatDate(p.date),
    formatTime(p.date),
    p.productName,
    p.rawQuantity ?? 0,
    p.finalQuantity ?? 0,
    p.totalWeight ?? 0,
    p.description || '',
  ]);

  // Lignes TOTAL par produit
  const products = [...new Set(list.map(p => p.productName))];
  products.forEach(prod => {
    const items = list.filter(p => p.productName === prod);
    const totRaw = items.reduce((s, p) => s + (p.rawQuantity ?? 0), 0);
    const totFinal = items.reduce((s, p) => s + (p.finalQuantity ?? 0), 0);
    const totWeight = items.reduce((s, p) => s + (p.totalWeight ?? 0), 0);
    body.push([`TOTAL ${prod}`, '', '', totRaw, totFinal, totWeight, '']);
  });

  doc.autoTable({
    startY,
    head: [['Date', 'Heure', 'Produit', 'Matière (kg)', 'Produit (kg)', 'Poids Total', 'Détail']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && String(data.cell.raw).startsWith('TOTAL')) {
        data.cell.styles.fillColor = [220, 240, 220];
        data.cell.styles.textColor = BRAND_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const pageWidth = doc.internal.pageSize.getWidth();
  const totRaw = list.reduce((s, p) => s + (p.rawQuantity ?? 0), 0);
  const totFinal = list.reduce((s, p) => s + (p.finalQuantity ?? 0), 0);

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 22, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Productions : ${list.length}`, 20, finalY + 7);
  doc.text(`Matière Utilisée : ${totRaw} kg`, 20, finalY + 14);
  doc.text(`Produit Final : ${totFinal} kg`, pageWidth / 2, finalY + 7);

  addPDFFooter(doc);
  doc.save(`Production_${getFilterSuffix(filterValue)}_${getDateSuffix()}.pdf`);
  showToast('Rapport de production exporté en PDF !', 'success');
};

// ----------------------------------------------------------------
// 7. MATIÈRES PREMIÈRES PDF
// ----------------------------------------------------------------
export const exportRawMaterialPDF = (
  rawMaterials: RawMaterial[],
  filterValue: string = 'all'
): void => {
  const list = filterByTime(rawMaterials, filterValue).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape' }) as any;
  const startY = addPDFHeader(doc, 'RAPPORT DE GESTION MATIÈRE PREMIÈRE', getFilterLabel(filterValue));

  const body: any[] = list.map(r => [
    formatDate(r.date),
    formatTime(r.date),
    r.productName,
    r.arrivedQty ?? 0,
    r.outQty ?? 0,
    r.finalStock ?? 0,
    r.rawQuantity ?? 0,
    r.finalQuantity ?? 0,
    r.totalWeight ?? 0,
    r.description || '',
  ]);

  // Lignes TOTAL par produit
  const products = [...new Set(list.map(r => r.productName))];
  products.forEach(prod => {
    const items = list.filter(r => r.productName === prod);
    const totArr = items.reduce((s, r) => s + (r.arrivedQty ?? 0), 0);
    const totOut = items.reduce((s, r) => s + (r.outQty ?? 0), 0);
    const lastStock = items[0]?.finalStock ?? 0;
    const totRaw = items.reduce((s, r) => s + (r.rawQuantity ?? 0), 0);
    const totFinal = items.reduce((s, r) => s + (r.finalQuantity ?? 0), 0);
    const totWeight = items.reduce((s, r) => s + (r.totalWeight ?? 0), 0);
    body.push([`TOTAL ${prod}`, '', '', totArr, totOut, lastStock, totRaw, totFinal, totWeight, '']);
  });

  doc.autoTable({
    startY,
    head: [['Date', 'Heure', 'Produit', 'Arrivée (sacs)', 'Sortie (sacs)', 'Stock Net (sacs)', 'Matière (kg)', 'Produit (paquets)', 'Poids Total', 'Notes']],
    body,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      3: { halign: 'center' }, 4: { halign: 'center' },
      5: { halign: 'center' }, 6: { halign: 'center' },
      7: { halign: 'center' }, 8: { halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && String(data.cell.raw).startsWith('TOTAL')) {
        data.cell.styles.fillColor = [220, 240, 220];
        data.cell.styles.textColor = BRAND_GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const pageWidth = doc.internal.pageSize.getWidth();
  const totArr = list.reduce((s, r) => s + (r.arrivedQty ?? 0), 0);
  const totOut = list.reduce((s, r) => s + (r.outQty ?? 0), 0);
  const netStock = totArr - totOut;
  const totRaw = list.reduce((s, r) => s + (r.rawQuantity ?? 0), 0);
  const totFinal = list.reduce((s, r) => s + (r.finalQuantity ?? 0), 0);
  const totWeight = list.reduce((s, r) => s + (r.totalWeight ?? 0), 0);

  doc.setFillColor(220, 250, 224);
  doc.rect(15, finalY, pageWidth - 30, 24, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total Arrivée : ${totArr} sacs | Total Sortie : ${totOut} sacs | Stock Net : ${netStock} sacs`,
    20, finalY + 8
  );
  doc.text(
    `Matière : ${totRaw} kg | Produit : ${totFinal} paquets | Poids Total : ${totWeight} kg`,
    20, finalY + 17
  );

  addPDFFooter(doc);
  doc.save(`Matieres_Premieres_${getFilterSuffix(filterValue)}_${getDateSuffix()}.pdf`);
  showToast('Rapport matières premières exporté en PDF !', 'success');
};

// ----------------------------------------------------------------
// 8. RAPPORT JOURNALIER / PÉRIODIQUE PDF
// ----------------------------------------------------------------
interface DailyReportData {
  title: string;
  displayPeriod: string;
  dateStr: string;
  period: string;
  sales: DailyRecord[];
  expenses: Expense[];
  income: Income[];
  productions: Production[];
  rawMaterials: RawMaterial[];
}

export const exportDailyReportPDF = (data: DailyReportData): void => {
  const { title, displayPeriod, dateStr, period, sales, expenses, income, productions, rawMaterials } = data;

  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // En-tête titre
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text(title || 'RAPPORT CONSOLIDÉ', pageWidth / 2, y, { align: 'center' });

  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');
  doc.text(displayPeriod, pageWidth / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    pageWidth / 2, y, { align: 'center' }
  );

  y += 4;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(15, y, pageWidth - 15, y);

  y += 6;

  // Calcul des totaux
  const totalVentes = sales.reduce((s, r) => s + r.total, 0);
  const totalDep = expenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalRawQty = productions.reduce((s, p) => s + (p.rawQuantity ?? 0), 0);
  const totalFinalQty = productions.reduce((s, p) => s + (p.finalQuantity ?? 0), 0);
  const totalWeightKg = productions.reduce((s, p) => s + (p.totalWeight ?? 0), 0);
  const totalArrived = rawMaterials.reduce((s, r) => s + (r.arrivedQty ?? 0), 0);
  const totalOut = rawMaterials.reduce((s, r) => s + (r.outQty ?? 0), 0);
  const netStock = totalArrived - totalOut;

  const tableBody = [
    ['Ventes', `${sales.length} opération(s)`, `${formatNum(totalVentes)} F`],
    ['Dépenses', `${expenses.length} opération(s)`, `${formatNum(totalDep)} F`],
    ["Rentrées d'argent", `${income.length} opération(s)`, `${formatNum(totalIncome)} F`],
    ['Production - Matière', `${productions.length} production(s)`, `${totalRawQty} kg`],
    ['Production - Produit', '', `${totalFinalQty} paquets`],
    ['Production - Poids', '', `${totalWeightKg} kg`],
    ['Matière 1ère - Arrivée', `${rawMaterials.length} mouvement(s)`, `${totalArrived} sacs`],
    ['Matière 1ère - Sortie', '', `${totalOut} sacs`],
    ['Matière 1ère - Stock Net', '', `${netStock} sacs`],
  ];

  doc.autoTable({
    startY: y,
    head: [['Section', 'Détail', 'Valeur']],
    body: tableBody,
    theme: 'grid',
    headStyles: tableHeadStyles,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { cellWidth: 60, textColor: [100] },
      2: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // Bloc bilan
  const bilanY = (doc as any).lastAutoTable.finalY + 10;
  const entrees = totalVentes + totalIncome;
  const sorties = totalDep;
  const solde = entrees - sorties;

  doc.setFillColor(220, 240, 220);
  doc.roundedRect(15, bilanY, pageWidth - 30, 35, 3, 3, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('BILAN FINANCIER', pageWidth / 2, bilanY + 9, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  doc.text(`Entrées (Ventes + Rentrées) : ${formatNum(entrees)} FCFA`, 25, bilanY + 17);
  doc.text(`Sorties (Dépenses) : ${formatNum(sorties)} FCFA`, 25, bilanY + 23);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(solde >= 0 ? BRAND_GREEN[0] : 220, solde >= 0 ? BRAND_GREEN[1] : 53, solde >= 0 ? BRAND_GREEN[2] : 69);
  doc.text(`Solde : ${formatNum(solde)} FCFA`, 25, bilanY + 31);

  // Numérotation des pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i}/${totalPages}`, pageWidth - 15, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }

  addPDFFooter(doc);
  doc.save(`Rapport_${period}_${dateStr}.pdf`);
  showToast('Rapport exporté en PDF avec succès !', 'success');
};

// ----------------------------------------------------------------
// 9. REÇU / FACTURE DE VENTE PDF (generateInvoicePDF)
// ----------------------------------------------------------------
interface CartItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

export const generateInvoicePDF = (
  cartItems: CartItem[],
  client?: { name?: string; phone?: string } | null,
  mode: 'sale' | 'quote' | 'delivery' = 'sale',
  docRef?: string,
  docDate?: string
): void => {
  if (!cartItems || cartItems.length === 0) {
    showToast('Aucun article dans la liste.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const docTypeTitle = mode === 'quote' ? 'DEVIS' : mode === 'delivery' ? 'BON DE LIVRAISON' : 'FACTURE DE VENTE';
  const refCode = docRef || `${mode === 'quote' ? 'DEV' : mode === 'delivery' ? 'BON' : 'FAC'}-${Date.now().toString().slice(-6)}`;
  
  const startY = addPDFHeader(doc, `${docTypeTitle} - ${refCode}`);

  if (docDate) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Date : ${new Date(docDate).toLocaleDateString('fr-FR')}`, pageWidth - 15, startY, { align: 'right' });
  }

  if (client?.name) {
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(`DÉTAILS CLIENT / DESTINATAIRE :`, 15, startY + 4);
    doc.setFont('helvetica', 'normal');
    doc.text(`${client.name}`, 15, startY + 9);
    if (client.phone) doc.text(`Tél : ${client.phone}`, 15, startY + 14);
  }

  const tableStartY = client?.name ? startY + 20 : startY + 8;

  if (mode === 'delivery') {
    doc.autoTable({
      startY: tableStartY,
      head: [['#', 'Description', 'Stock Init.', 'Qté Livrée', 'Stock Fin.', 'Prix Unitaire']],
      body: cartItems.map((i: any, idx: number) => [
        idx + 1,
        i.name,
        i.initialStock ?? '-',
        `${i.qty} ${i.unit || i.saleUnit || ''}`,
        i.finalStock ?? '-',
        `${formatNum(i.price)} F`
      ]),
      theme: 'grid',
      headStyles: tableHeadStyles,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { halign: 'center' },
        3: { halign: 'center', fontStyle: 'bold' },
        4: { halign: 'center' },
        5: { halign: 'right' },
      },
    });
  } else {
    doc.autoTable({
      startY: tableStartY,
      head: [['#', 'Description', 'Qté', 'Prix Unitaire (FCFA)', 'Total (FCFA)']],
      body: cartItems.map((i: any, idx: number) => [
        idx + 1,
        i.name,
        `${i.qty} ${i.saleUnit || ''}`,
        formatNum(i.price),
        formatNum(i.total || i.qty * i.price)
      ]),
      theme: 'grid',
      headStyles: tableHeadStyles,
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'right', cellWidth: 38 },
        4: { halign: 'right', cellWidth: 38 },
      },
    });
  }

  const total = cartItems.reduce((s, i: any) => s + (i.total || i.qty * i.price), 0);
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Total Box
  doc.setFillColor(220, 250, 224);
  doc.rect(pageWidth - 85, finalY, 70, 14, 'F');
  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`NET À PAYER : ${formatNum(total)} FCFA`, pageWidth - 18, finalY + 9, { align: 'right' });

  // Signature Block
  const sigY = Math.max(finalY + 30, pageHeight - 45);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature Client', 25, sigY);
  doc.text('Signature Vendeur', pageWidth - 55, sigY);
  doc.setDrawColor(180);
  doc.setLineDash([2, 2], 0);
  doc.line(20, sigY + 12, 70, sigY + 12);
  doc.line(pageWidth - 65, sigY + 12, pageWidth - 15, sigY + 12);

  addPDFFooter(doc);

  const cleanPrefix = mode === 'quote' ? 'Devis' : mode === 'delivery' ? 'Bon_De_Livraison' : 'Facture';
  doc.save(`${cleanPrefix}_${refCode}.pdf`);
  showToast(`PDF ${cleanPrefix} téléchargé avec succès !`, 'success');
};
