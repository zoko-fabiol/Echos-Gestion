// ============================================================
// src/utils/exportXLSX.ts
// Export Excel stylisé (xlsx-js-style) – Module Stock / Commercial
// ============================================================

// xlsx-js-style est un fork de SheetJS avec support complet des styles
import XLSXStyle from 'xlsx-js-style';
const { utils, writeFile } = XLSXStyle;

import {
  filterByTime,
  formatDate,
  formatTime,
  getFilterLabel,
  getFilterSuffix,
  getDateSuffix,
} from './exportHelpers';

import { showToast } from '../components/ui/Toast';

import type { Product, DailyRecord, Expense, Income, Production, RawMaterial } from '../db/database';

// ================================================================
// DESIGN SYSTEM – couleurs, polices et styles partagés
// ================================================================

// Couleur principale de la marque (vert Echo Gestion)
const BRAND   = '1F7A3E'; // vert marque
const ACCENT  = 'D4EDDA'; // fond vert clair (lignes paires)
const WHITE   = 'FFFFFF';
const DARK    = '1C2833'; // texte très sombre
const RED_BG  = 'FDECEA'; // fond rouge pâle (alertes stock)
const RED_FG  = 'C0392B'; // texte rouge foncé
const ORANGE  = 'E67E22'; // texte orange (marges)
const GREY_BG = 'F2F3F4'; // fond gris très clair (lignes impaires)
const TOTAL_BG= 'D5F5E3'; // fond vert pâle (ligne total)

/** Style d'une cellule d'en-tête colonne */
const colHeaderStyle = (align: 'left' | 'center' | 'right' = 'left') => ({
  font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: align, vertical: 'center', wrapText: true },
  border: {
    top:    { style: 'thin', color: { rgb: BRAND } },
    bottom: { style: 'medium', color: { rgb: BRAND } },
    left:   { style: 'thin', color: { rgb: BRAND } },
    right:  { style: 'thin', color: { rgb: BRAND } },
  },
});

/** Style d'une cellule de donnée normale */
const dataStyle = (
  even: boolean,
  align: 'left' | 'center' | 'right' = 'left',
  bold = false,
  fg?: string,
  bg?: string
) => ({
  font: { bold, color: { rgb: fg ?? DARK }, sz: 9, name: 'Calibri' },
  fill: { fgColor: { rgb: bg ?? (even ? ACCENT : GREY_BG) } },
  alignment: { horizontal: align, vertical: 'center', wrapText: false },
  border: {
    top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
    bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
    left:   { style: 'thin', color: { rgb: 'D5D8DC' } },
    right:  { style: 'thin', color: { rgb: 'D5D8DC' } },
  },
});

/** Style ligne TOTAL */
const totalStyle = (align: 'left' | 'center' | 'right' = 'right') => ({
  font: { bold: true, color: { rgb: BRAND }, sz: 10, name: 'Calibri' },
  fill: { fgColor: { rgb: TOTAL_BG } },
  alignment: { horizontal: align, vertical: 'center' },
  border: {
    top:    { style: 'medium', color: { rgb: BRAND } },
    bottom: { style: 'medium', color: { rgb: BRAND } },
    left:   { style: 'thin',   color: { rgb: BRAND } },
    right:  { style: 'thin',   color: { rgb: BRAND } },
  },
});

/** Style titre du rapport (ligne 1) */
const titleStyle = () => ({
  font: { bold: true, color: { rgb: WHITE }, sz: 13, name: 'Calibri' },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: 'left', vertical: 'center' },
});

/** Style sous-titre / métadonnées (ligne 2) */
const subtitleStyle = () => ({
  font: { italic: true, color: { rgb: BRAND }, sz: 9, name: 'Calibri' },
  fill: { fgColor: { rgb: ACCENT } },
  alignment: { horizontal: 'left', vertical: 'center' },
});

// ================================================================
// Helper : construire une WorkSheet stylisée depuis AOA
// ================================================================
interface ColDef {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string; // ex: '#,##0' ou '#,##0.00'
}

interface StyledRow {
  values: (string | number | null)[];
  /** Si undefined → ligne normale. 'total' = ligne total. 'alert' = ligne alerte rouge. */
  rowType?: 'total' | 'alert';
  /** Overrides d'alignement par colonne (index → align) */
  aligns?: Record<number, 'left' | 'center' | 'right'>;
  /** Overrides de couleur de texte par colonne (index → RGB) */
  colors?: Record<number, string>;
}

const buildStyledSheet = (
  title: string,
  subtitle: string,
  cols: ColDef[],
  styledRows: StyledRow[]
): any => {
  const ws: any = {};
  const nCols = cols.length;
  let r = 0; // ligne courante (0-indexed)

  // ── Ligne 0 : titre ──────────────────────────────────────────
  ws[utils.encode_cell({ r, c: 0 })] = { v: title, t: 's', s: titleStyle() };
  for (let c = 1; c < nCols; c++) {
    ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: titleStyle() };
  }
  r++;

  // ── Ligne 1 : sous-titre ─────────────────────────────────────
  ws[utils.encode_cell({ r, c: 0 })] = { v: subtitle, t: 's', s: subtitleStyle() };
  for (let c = 1; c < nCols; c++) {
    ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: subtitleStyle() };
  }
  r++;

  // ── Ligne 2 : vide ───────────────────────────────────────────
  r++;

  // ── Ligne 3 : en-têtes colonnes ──────────────────────────────
  cols.forEach((col, c) => {
    ws[utils.encode_cell({ r, c })] = {
      v: col.label,
      t: 's',
      s: colHeaderStyle(col.align ?? 'left'),
    };
  });
  r++;

  // ── Lignes de données ─────────────────────────────────────────
  styledRows.forEach((row, rowIdx) => {
    const even = rowIdx % 2 === 0;

    row.values.forEach((val, c) => {
      const col = cols[c];
      const isNum = typeof val === 'number';
      const align = row.aligns?.[c] ?? col.align ?? (isNum ? 'right' : 'left');

      let style: any;

      if (row.rowType === 'total') {
        style = totalStyle(align);
      } else if (row.rowType === 'alert') {
        style = {
          ...dataStyle(even, align, true, RED_FG, RED_BG),
        };
      } else {
        const fg = row.colors?.[c];
        style = dataStyle(even, align, false, fg, undefined);
      }

      const cell: any = { v: val ?? '', s: style };
      if (isNum) {
        cell.t = 'n';
        if (col.numFmt) cell.z = col.numFmt;
      } else {
        cell.t = 's';
      }

      ws[utils.encode_cell({ r, c })] = cell;
    });

    r++;
  });

  // ── Merges titre et sous-titre ────────────────────────────────
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
  ];

  // ── Largeurs colonnes ─────────────────────────────────────────
  ws['!cols'] = cols.map(col => ({ wch: col.width }));

  // ── Range ────────────────────────────────────────────────────
  ws['!ref'] = utils.encode_range({ r: 0, c: 0 }, { r: r - 1, c: nCols - 1 });

  // ── Hauteur ligne header ──────────────────────────────────────
  ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }];

  return ws;
};

// ================================================================
// 1. INVENTAIRE EXCEL
// ================================================================
export const exportInventoryXLSX = (
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

  const label = typeFilter === 'all'
    ? 'Tous les produits'
    : typeFilter === 'finished' ? 'Produits finis' : 'Matières premières';

  const cols: ColDef[] = [
    { label: 'Produit',               width: 28 },
    { label: 'Catégorie',             width: 16 },
    { label: 'Stock',                 width: 10, align: 'center', numFmt: '#,##0' },
    { label: 'Unité Vente',           width: 14, align: 'center' },
    { label: 'Prix Vente (FCFA)',     width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Unité Achat',           width: 14, align: 'center' },
    { label: 'Prix Achat (FCFA)',     width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Val. Vente (FCFA)',     width: 20, align: 'right', numFmt: '#,##0' },
    { label: 'Val. Achat (FCFA)',     width: 20, align: 'right', numFmt: '#,##0' },
  ];

  const rows: StyledRow[] = list.map(p => {
    const isAlert = p.stock <= 0;
    const isLow   = !isAlert && p.stock < 5;
    return {
      values: [
        p.name, p.category, p.stock, p.saleUnit, p.salePrice,
        p.purchaseUnit, p.purchasePrice, p.stock * p.salePrice, p.stock * p.purchasePrice,
      ],
      rowType: isAlert ? 'alert' : undefined,
      colors: (isLow ? { 2: ORANGE } : { 7: BRAND }) as Record<number, string>,
    };
  });

  // Ligne total
  rows.push({
    values: [
      'TOTAL', `${list.length} articles`,
      list.reduce((s, p) => s + p.stock, 0),
      '', '',
      '', '',
      list.reduce((s, p) => s + p.stock * p.salePrice, 0),
      list.reduce((s, p) => s + p.stock * p.purchasePrice, 0),
    ],
    rowType: 'total',
    aligns: { 0: 'left', 1: 'left' },
  });

  const ws = buildStyledSheet(
    `INVENTAIRE – ${label.toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Inventaire');

  const suffix = typeFilter === 'all' ? 'Tout' : typeFilter === 'finished' ? 'Produits-finis' : 'Matieres';
  writeFile(wb, `Inventaire_${suffix}_${getDateSuffix()}.xlsx`);
  showToast('Inventaire exporté en Excel avec succès !', 'success');
};

// ================================================================
// 2. HISTORIQUE DES VENTES EXCEL
// ================================================================
export const exportHistoryXLSX = (
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

  const cols: ColDef[] = [
    { label: 'Date',                  width: 14 },
    { label: 'Heure',                 width: 10, align: 'center' },
    { label: 'Nb Articles',           width: 12, align: 'center', numFmt: '#,##0' },
    { label: 'Total (FCFA)',          width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Coût Achat (FCFA)',     width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Marge Brute (FCFA)',    width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Détails Vente',         width: 55 },
  ];

  let totalCA = 0, totalMarge = 0;

  const rows: StyledRow[] = list.map(r => {
    totalCA     += r.total;
    totalMarge  += r.margin;
    return {
      values: [
        formatDate(r.date),
        formatTime(r.date),
        r.items.length,
        r.total,
        r.totalCost,
        r.margin,
        r.items.map(i => `${i.name} x${i.qty} @ ${i.price} F`).join(' | '),
      ],
      colors: { 5: ORANGE },
    };
  });

  rows.push({
    values: ['TOTAL', `${list.length} ventes`, '', totalCA, '', totalMarge, ''],
    rowType: 'total',
    aligns: { 0: 'left', 1: 'left' },
  });

  const ws = buildStyledSheet(
    `HISTORIQUE DES VENTES – ${getFilterLabel(filterValue).toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Historique Ventes');
  writeFile(wb, `Historique_Ventes_${getFilterSuffix(filterValue)}_${getDateSuffix()}.xlsx`);
  showToast('Historique des ventes exporté en Excel !', 'success');
};

// ================================================================
// 3. DÉPENSES EXCEL
// ================================================================
export const exportExpensesXLSX = (
  expenses: Expense[],
  filterValue: string = 'all'
): void => {
  const list = filterByTime(expenses, filterValue).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (list.length === 0) {
    showToast('Aucune donnée à exporter.', 'warning');
    return;
  }

  const cols: ColDef[] = [
    { label: 'Date',               width: 14 },
    { label: 'Heure',              width: 10, align: 'center' },
    { label: 'Catégorie',          width: 22 },
    { label: 'Montant (FCFA)',     width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Transport (FCFA)',   width: 18, align: 'right', numFmt: '#,##0' },
    { label: 'Perte (%)',          width: 12, align: 'center', numFmt: '0.0' },
    { label: 'Mode Paiement',      width: 16, align: 'center' },
    { label: 'Montant Payé',       width: 16, align: 'right', numFmt: '#,##0' },
    { label: 'Reste à Payer',      width: 16, align: 'right', numFmt: '#,##0' },
    { label: 'Description',        width: 40 },
  ];

  let total = 0, totalReste = 0;

  const rows: StyledRow[] = list.map(e => {
    const reste = e.remainingAmount ?? 0;
    const isDebt = reste > 0;
    total += e.amount;
    totalReste += reste;
    return {
      values: [
        formatDate(e.date),
        formatTime(e.date),
        e.category,
        e.amount,
        e.transportCost ?? 0,
        e.lossPercentage ?? 0,
        e.paymentType === 'partial' ? 'Partiel' : 'Complet',
        e.paidAmount ?? e.amount,
        reste,
        e.description || '',
      ],
      colors: {
        3: RED_FG,
        8: isDebt ? ORANGE : BRAND,
      },
    };
  });

  rows.push({
    values: ['TOTAL', `${list.length} dépenses`, '', total, '', '', '', '', totalReste, ''],
    rowType: 'total',
    aligns: { 0: 'left', 1: 'left' },
  });

  const ws = buildStyledSheet(
    `HISTORIQUE DES DÉPENSES – ${getFilterLabel(filterValue).toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Depenses');
  writeFile(wb, `Depenses_${getFilterSuffix(filterValue)}_${getDateSuffix()}.xlsx`);
  showToast('Dépenses exportées en Excel !', 'success');
};

// ================================================================
// 4. PRODUCTION EXCEL
// ================================================================
export const exportProductionXLSX = (
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

  const cols: ColDef[] = [
    { label: 'Date',             width: 14 },
    { label: 'Heure',            width: 10, align: 'center' },
    { label: 'Produit',          width: 24 },
    { label: 'Matière (kg)',     width: 15, align: 'center', numFmt: '#,##0.0' },
    { label: 'Produit Final',    width: 15, align: 'center', numFmt: '#,##0.0' },
    { label: 'Poids Total (kg)', width: 16, align: 'center', numFmt: '#,##0.0' },
    { label: 'Notes',            width: 38 },
  ];

  const rows: StyledRow[] = list.map(p => ({
    values: [
      formatDate(p.date), formatTime(p.date), p.productName,
      p.rawQuantity ?? 0, p.finalQuantity ?? 0, p.totalWeight ?? 0, p.description || '',
    ],
    colors: { 3: ORANGE, 4: BRAND },
  }));

  // Sous-totaux par produit
  const products = [...new Set(list.map(p => p.productName))];
  products.forEach(prod => {
    const items = list.filter(p => p.productName === prod);
    rows.push({
      values: [
        `Sous-total ${prod}`, '',  prod,
        items.reduce((s, p) => s + (p.rawQuantity ?? 0), 0),
        items.reduce((s, p) => s + (p.finalQuantity ?? 0), 0),
        items.reduce((s, p) => s + (p.totalWeight ?? 0), 0),
        '',
      ],
      rowType: 'total',
      aligns: { 0: 'left' },
    });
  });

  const ws = buildStyledSheet(
    `RAPPORT DE PRODUCTION – ${getFilterLabel(filterValue).toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Productions');
  writeFile(wb, `Production_${getFilterSuffix(filterValue)}_${getDateSuffix()}.xlsx`);
  showToast('Productions exportées en Excel !', 'success');
};

// ================================================================
// 5. MATIÈRES PREMIÈRES EXCEL
// ================================================================
export const exportRawMaterialXLSX = (
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

  const cols: ColDef[] = [
    { label: 'Date',                  width: 14 },
    { label: 'Heure',                 width: 10, align: 'center' },
    { label: 'Produit',               width: 22 },
    { label: 'Arrivée (sacs)',        width: 15, align: 'center', numFmt: '#,##0' },
    { label: 'Sortie (sacs)',         width: 14, align: 'center', numFmt: '#,##0' },
    { label: 'Stock Net (sacs)',      width: 16, align: 'center', numFmt: '#,##0' },
    { label: 'Matière (kg)',          width: 14, align: 'center', numFmt: '#,##0.0' },
    { label: 'Produit (paquets)',     width: 16, align: 'center', numFmt: '#,##0' },
    { label: 'Poids Total (kg)',      width: 16, align: 'center', numFmt: '#,##0.0' },
    { label: 'Notes',                 width: 35 },
  ];

  const rows: StyledRow[] = list.map(r => ({
    values: [
      formatDate(r.date), formatTime(r.date), r.productName,
      r.arrivedQty ?? 0, r.outQty ?? 0, r.finalStock ?? 0,
      r.rawQuantity ?? 0, r.finalQuantity ?? 0, r.totalWeight ?? 0,
      r.description || '',
    ],
    colors: { 3: BRAND, 4: ORANGE },
  }));

  const ws = buildStyledSheet(
    `GESTION MATIÈRES PREMIÈRES – ${getFilterLabel(filterValue).toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Matieres Premieres');
  writeFile(wb, `Matieres_Premieres_${getFilterSuffix(filterValue)}_${getDateSuffix()}.xlsx`);
  showToast('Matières premières exportées en Excel !', 'success');
};

// ================================================================
// 6. RENTRÉES D'ARGENT EXCEL
// ================================================================
export const exportIncomeXLSX = (
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

  const cols: ColDef[] = [
    { label: 'Date',            width: 14 },
    { label: 'Heure',           width: 10, align: 'center' },
    { label: 'Source',          width: 22 },
    { label: 'Reçu par',        width: 20 },
    { label: 'Description',     width: 38 },
    { label: 'Montant (FCFA)',  width: 18, align: 'right', numFmt: '#,##0' },
  ];

  let total = 0;
  const rows: StyledRow[] = list.map(i => {
    total += i.amount;
    return {
      values: [
        formatDate(i.date), formatTime(i.date),
        i.source || '', i.receivedBy || '', i.description || '',
        i.amount,
      ],
      colors: { 5: BRAND },
    };
  });

  rows.push({
    values: ['TOTAL', `${list.length} rentrées`, '', '', '', total],
    rowType: 'total',
    aligns: { 0: 'left', 1: 'left' },
  });

  const ws = buildStyledSheet(
    `RENTRÉES D'ARGENT – ${getFilterLabel(filterValue).toUpperCase()}`,
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Rentrees Argent');
  writeFile(wb, `Rentrees_Argent_${getFilterSuffix(filterValue)}_${getDateSuffix()}.xlsx`);
  showToast("Rentrées d'argent exportées en Excel !", 'success');
};
