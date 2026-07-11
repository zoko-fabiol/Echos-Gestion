// ============================================================
// src/utils/exportRHPDF.ts
// Fonctions d'export PDF pour le module RH (Personnel, Pointage, Bulletins, Historique)
// ============================================================

import jsPDF from 'jspdf';
import 'jspdf-autotable';

import {
  RH_GREEN,
  addPdfHeaderRH,
  removeAccents,
  formatMoney,
  getDateSuffix,
  MONTHS_FR,
} from './exportRHHelpers';

import { showToast } from '../components/ui/Toast';

import type { RhEmployee } from '../db/database';

// ----------------------------------------------------------------
// Types locaux
// ----------------------------------------------------------------
interface PayrollExtras {
  prime: number;
  dette: number;
  retenue: number;
}

interface PayrollEntry {
  emp: RhEmployee;
  salaireBase: number;
  absentDays: number;
  retenueAbsence: number;
  extras: PayrollExtras;
  net: number;
}

// ----------------------------------------------------------------
// Helper : obtenir le logo depuis le store RH ou localStorage
// ----------------------------------------------------------------
const getLogo = (): string | null =>
  localStorage.getItem('stock_expert_logo');

// ----------------------------------------------------------------
// 1. EXPORT PERSONNEL PDF (avec sélection de colonnes)
// ----------------------------------------------------------------
type PersonnelColumn = 'nomComplet' | 'type' | 'statut' | 'site' | 'contact' | 'salaire';

interface PersonnelPDFOptions {
  exportColumns?: PersonnelColumn[];
  customColumns?: string[];
  filters?: {
    site?: string;
    statut?: string;
    type?: string;
  };
}

export const exportPersonnelPDF = (
  employees: RhEmployee[],
  options: PersonnelPDFOptions = {}
): void => {
  const { exportColumns = ['nomComplet', 'type', 'statut', 'site', 'contact', 'salaire'], customColumns = [], filters = {} } = options;

  let list = [...employees];
  if (filters.site && filters.site !== 'all') list = list.filter(e => e.site === filters.site);
  if (filters.statut && filters.statut !== 'all') list = list.filter(e => e.statut === filters.statut);
  if (filters.type && filters.type !== 'all') list = list.filter(e => e.type === filters.type);

  list.sort((a, b) => {
    const siteComp = a.site.localeCompare(b.site, 'fr');
    if (siteComp !== 0) return siteComp;
    return a.nom.localeCompare(b.nom, 'fr');
  });

  if (list.length === 0) {
    showToast('Aucun employé à exporter.', 'warning');
    return;
  }

  const colDefs: Record<PersonnelColumn, { label: string; getValue: (e: RhEmployee) => string }> = {
    nomComplet: { label: 'Nom & Prenom', getValue: e => removeAccents(`${e.nom} ${e.prenom}`) },
    type:       { label: 'Type',         getValue: e => e.type === 'temporaire' ? 'TEMP' : 'CDI/CDD' },
    statut:     { label: 'Statut',       getValue: e => e.statut === 'renvoye' ? 'RENVOYE' : 'ACTIF' },
    site:       { label: 'Site',         getValue: e => removeAccents(e.site) },
    contact:    { label: 'Contact',      getValue: e => e.contact || '' },
    salaire:    { label: 'Salaire',      getValue: e => formatMoney(e.salaireBase) },
  };

  const activeCols = exportColumns.filter(c => colDefs[c]);
  const allColLabels = ['N°', ...activeCols.map(c => colDefs[c].label), ...customColumns];

  const totalCols = allColLabels.length;
  const orientation = totalCols > 7 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation }) as any;

  const startY = addPdfHeaderRH(doc, 'LISTE DU PERSONNEL', getLogo());

  const body = list.map((e, i) => {
    const row: any[] = [i + 1, ...activeCols.map(c => colDefs[c].getValue(e))];
    customColumns.forEach(() => row.push(''));
    return row;
  });

  doc.autoTable({
    startY,
    head: [allColLabels],
    body,
    theme: 'grid',
    headStyles: { fillColor: RH_GREEN, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    styles: { fontSize: 9, minCellHeight: 12 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      const statIdx = activeCols.indexOf('statut') + 1; // offset +1 pour N°
      if (
        data.section === 'body' &&
        statIdx > 0 &&
        data.column.index === statIdx &&
        data.cell.raw === 'RENVOYE'
      ) {
        data.cell.styles.textColor = [220, 53, 69];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save('echos_personnel.pdf');
  showToast('Liste du personnel exportée en PDF !', 'success');
};

// ----------------------------------------------------------------
// 2. EXPORT POINTAGE MENSUEL PDF
// ----------------------------------------------------------------
interface AttendanceFilters {
  year: number;
  month: number; // 0-indexed
}

export const exportAttendancePDF = (
  employees: RhEmployee[],
  attendance: Record<string, number>,
  filters: AttendanceFilters
): void => {
  const { year, month } = filters;

  if (employees.length === 0) {
    showToast('Aucun employé à exporter.', 'warning');
    return;
  }

  const monthName = removeAccents(MONTHS_FR[month]);
  const doc = new jsPDF({ orientation: 'landscape' }) as any;
  const startY = addPdfHeaderRH(doc, `POINTAGE: ${monthName} ${year}`, getLogo());

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Jours ouvrables (hors dimanche)
  const workDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() !== 0) workDays.push(d);
  }

  const headers = [
    'Nom',
    ...workDays.map(d => String(d)),
    'Total Absences',
  ];

  const body = employees.map(emp => {
    let totalAbs = 0;
    const cells: any[] = [removeAccents(`${emp.nom} ${emp.prenom}`)];

    workDays.forEach(d => {
      const dateObj = new Date(year, month, d);
      dateObj.setHours(0, 0, 0, 0);

      // Après renvoi
      if (emp.statut === 'renvoye' && emp.dateRenvoi) {
        const dismissal = new Date(emp.dateRenvoi);
        dismissal.setHours(0, 0, 0, 0);
        if (dateObj > dismissal) { cells.push('-'); return; }
      }
      // Avant embauche
      if (emp.dateEmbauche) {
        const start = new Date(emp.dateEmbauche);
        start.setHours(0, 0, 0, 0);
        if (dateObj < start) { cells.push('-'); return; }
      }

      const key = `${emp.id}_${year}-${month}-${d}`;
      let status = attendance[key];
      if (status === undefined) status = emp.type === 'temporaire' ? 3 : 1;

      if (status === 2) { totalAbs++; cells.push('ABS'); }
      else if (status === 3) cells.push('J');
      else cells.push('.');
    });

    // Compter toutes absences y compris dimanches (pour la colonne total)
    let fullAbs = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      if (dateObj.getDay() === 0) continue;
      if (emp.statut === 'renvoye' && emp.dateRenvoi) {
        const dismissal = new Date(emp.dateRenvoi);
        if (dateObj > dismissal) continue;
      }
      if (emp.dateEmbauche) {
        const start = new Date(emp.dateEmbauche);
        if (dateObj < start) continue;
      }
      const key = `${emp.id}_${year}-${month}-${d}`;
      let status = attendance[key];
      if (status === undefined) status = emp.type === 'temporaire' ? 3 : 1;
      if (status === 2) fullAbs++;
    }
    cells.push(fullAbs);
    return cells;
  });

  doc.autoTable({
    startY,
    head: [headers],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: RH_GREEN, textColor: 255, fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold', halign: 'left' },
      [workDays.length + 1]: { fontStyle: 'bold', fillColor: [240, 253, 244], halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (
        data.section === 'body' &&
        data.column.index > 0 &&
        data.column.index <= workDays.length &&
        data.cell.raw === 'ABS'
      ) {
        data.cell.styles.textColor = [220, 53, 69];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save('echos_pointage.pdf');
  showToast('Fiche de pointage exportée en PDF !', 'success');
};

// ----------------------------------------------------------------
// 3. PRÉSENCE DU JOUR PDF
// ----------------------------------------------------------------
export const exportAttendanceTodayPDF = (
  employees: RhEmployee[],
  attendance: Record<string, number>
): void => {
  if (employees.length === 0) {
    showToast('Aucun employé à exporter.', 'warning');
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const titleDate = removeAccents(
    now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  const doc = new jsPDF() as any;
  const startY = addPdfHeaderRH(doc, `PRESENCE DU JOUR - ${titleDate}`, getLogo());

  const todayObj = new Date(year, month, day);
  todayObj.setHours(0, 0, 0, 0);

  const statusStyles: Record<string, { color: number[]; style: string }> = {
    Present: { color: [34, 197, 94], style: 'bold' },
    Absent: { color: [220, 53, 69], style: 'bold' },
    Justifie: { color: [255, 193, 7], style: 'bold' },
    'Fin Contrat': { color: [156, 163, 175], style: 'italic' },
    'Pas encore embauche': { color: [156, 163, 175], style: 'italic' },
  };

  const body = employees.map(emp => {
    const nomComplet = removeAccents(`${emp.nom} ${emp.prenom}`);

    if (emp.statut === 'renvoye' && emp.dateRenvoi) {
      const dismissal = new Date(emp.dateRenvoi);
      dismissal.setHours(0, 0, 0, 0);
      if (todayObj > dismissal) return [nomComplet, 'Fin Contrat'];
    }

    if (emp.dateEmbauche) {
      const start = new Date(emp.dateEmbauche);
      start.setHours(0, 0, 0, 0);
      if (todayObj < start) return [nomComplet, 'Pas encore embauche'];
    }

    const key = `${emp.id}_${year}-${month}-${day}`;
    let status = attendance[key];
    if (status === undefined) status = emp.type === 'temporaire' ? 3 : 1;

    let label = 'Present';
    if (status === 2) label = 'Absent';
    else if (status === 3) label = 'Justifie';
    return [nomComplet, label];
  });

  doc.autoTable({
    startY,
    head: [['Employe', 'Statut']],
    body,
    theme: 'grid',
    headStyles: { fillColor: RH_GREEN, textColor: 255, fontSize: 11, cellPadding: 5 },
    bodyStyles: { cellPadding: 4, fontSize: 10 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: {
      0: { cellWidth: 100, halign: 'left' },
      1: { cellWidth: 50, halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 1) {
        const val = String(data.cell.raw);
        const s = statusStyles[val];
        if (s) {
          data.cell.styles.textColor = s.color;
          data.cell.styles.fontStyle = s.style;
        }
      }
    },
  });

  doc.save(`echos_presence_${dateStr}.pdf`);
  showToast('Présence du jour exportée en PDF !', 'success');
};

// ----------------------------------------------------------------
// 4. BULLETINS DE PAIE PDF
// ----------------------------------------------------------------
export const exportPayrollPDF = (
  payrollData: PayrollEntry[]
): void => {
  if (payrollData.length === 0) {
    showToast('Aucune donnée de paie à exporter.', 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  let y = addPdfHeaderRH(doc, 'BULLETINS DE PAIE', getLogo());

  payrollData.forEach(p => {
    // Nouvelle page si débordement
    if (y > 220) {
      doc.addPage();
      y = addPdfHeaderRH(doc, 'BULLETINS DE PAIE (Suite)', getLogo());
    }

    // Bordure du bulletin
    doc.setDrawColor(...RH_GREEN);
    doc.setLineWidth(0.5);
    doc.rect(10, y, 190, 60);

    // Fond en-tête du bulletin
    doc.setFillColor(240, 253, 244);
    doc.rect(10, y, 190, 10, 'F');

    // Nom & Site
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RH_GREEN);
    const nomSite = removeAccents(`${p.emp.nom} ${p.emp.prenom}  |  ${p.emp.site}`);
    doc.text(nomSite, 15, y + 7);

    // Badges type / statut
    if (p.emp.type === 'temporaire') {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text('(Temporaire)', 150, y + 7);
    }
    if (p.emp.statut === 'renvoye') {
      doc.setFontSize(8);
      doc.setTextColor(220, 53, 69);
      doc.text('(FIN CONTRAT)', 165, y + 7);
    }

    let ly = y + 18;

    // Ligne 1 : Salaire de base | Primes
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text('Salaire de Base:', 15, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RH_GREEN);
    doc.text(formatMoney(p.salaireBase), 90, ly, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text('Primes:', 140, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text(`+ ${formatMoney(p.extras.prime)}`, 195, ly, { align: 'right' });

    ly += 6;

    // Ligne 2 : Absences & Retenues | Dettes
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(`Absences (${p.absentDays}j) & Retenues:`, 15, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 53, 69);
    doc.text(`- ${formatMoney(p.extras.retenue + p.retenueAbsence)}`, 90, ly, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text('Dettes / Avances:', 140, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 53, 69);
    doc.text(`- ${formatMoney(p.extras.dette)}`, 195, ly, { align: 'right' });

    // Séparateur
    ly += 12;
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(15, ly, 195, ly);

    // NET À PAYER
    ly += 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('NET A PAYER', 15, ly);

    doc.setTextColor(...RH_GREEN);
    doc.text(formatMoney(p.net), 195, ly, { align: 'right' });

    y += 65;
  });

  doc.save('echos_bulletins.pdf');
  showToast('Bulletins de paie exportés en PDF !', 'success');
};

// ----------------------------------------------------------------
// 5. HISTORIQUE ANNUEL D'UN EMPLOYÉ PDF
// ----------------------------------------------------------------
interface HistoryItem {
  monthName: string;
  presentDays: number;
  absentDays: number;
  netPay: number;
}

export const exportRHHistoryPDF = (
  employee: RhEmployee,
  historyItems: HistoryItem[],
  year: number
): void => {
  if (historyItems.length === 0) {
    showToast("Aucune donnée d'historique disponible.", 'warning');
    return;
  }

  const doc = new jsPDF() as any;
  const title = removeAccents(`HISTORIQUE: ${employee.nom} ${employee.prenom} (${year})`);
  const startY = addPdfHeaderRH(doc, title, getLogo());

  const body = historyItems.map(h => [
    removeAccents(h.monthName),
    h.presentDays,
    h.absentDays,
    formatMoney(h.netPay),
  ]);

  doc.autoTable({
    startY,
    head: [['Mois', 'Jours Travailles', 'Absences (J)', 'Net Estime']],
    body,
    theme: 'grid',
    headStyles: { fillColor: RH_GREEN, textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: {
      1: { halign: 'center' },
      2: { textColor: [220, 53, 69], halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    removeAccents('Ce document est un recapitulatif annuel genere automatiquement.'),
    15,
    finalY
  );

  const fname = removeAccents(`historique_${employee.nom}_${employee.prenom}_${year}`).replace(/\s/g, '_');
  doc.save(`${fname}.pdf`);
  showToast('Historique exporté en PDF !', 'success');
};

// ----------------------------------------------------------------
// Helper exporté : calcul d'historique annuel (à appeler depuis le composant)
// ----------------------------------------------------------------
const JOURS_OUVRABLES = 22;

export const buildRHHistory = (
  emp: RhEmployee,
  year: number,
  attendance: Record<string, number>,
  payrollExtras: Record<string, PayrollExtras>
): HistoryItem[] => {
  const items: HistoryItem[] = [];
  const now = new Date();

  for (let m = 0; m < 12; m++) {
    const daysInM = new Date(year, m + 1, 0).getDate();
    let absentCount = 0;
    let presentCount = 0;
    let hasData = false;

    const extrasKey = `${emp.id}_${year}-${m}`;
    const extras = payrollExtras[extrasKey] || { prime: 0, dette: 0, retenue: 0 };

    for (let d = 1; d <= daysInM; d++) {
      const dateObj = new Date(year, m, d);
      dateObj.setHours(0, 0, 0, 0);

      if (emp.statut === 'renvoye' && emp.dateRenvoi) {
        const dismissal = new Date(emp.dateRenvoi);
        dismissal.setHours(0, 0, 0, 0);
        if (dateObj > dismissal) continue;
      }
      if (emp.dateEmbauche) {
        const start = new Date(emp.dateEmbauche);
        start.setHours(0, 0, 0, 0);
        if (dateObj < start) continue;
      }

      const dateKey = `${emp.id}_${year}-${m}-${d}`;
      let status = attendance[dateKey];
      if (status !== undefined) hasData = true;
      if (status === undefined) status = emp.type === 'temporaire' ? 3 : 1;

      if (status === 2 && new Date(year, m, d).getDay() !== 0) absentCount++;
      if (status !== 2) presentCount++;
    }

    if (hasData || m <= now.getMonth()) {
      const retenueAbsence = Math.round((emp.salaireBase / JOURS_OUVRABLES) * absentCount);
      const net = Math.round(
        emp.salaireBase + (extras.prime || 0) - (extras.dette || 0) - (extras.retenue || 0) - retenueAbsence
      );
      items.push({
        monthName: MONTHS_FR[m],
        presentDays: presentCount,
        absentDays: absentCount,
        netPay: net > 0 ? net : 0,
      });
    }
  }

  return items;
};
