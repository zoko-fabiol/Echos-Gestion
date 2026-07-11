// ============================================================
// src/utils/exportRHXLSX.ts
// Export Excel stylisé (xlsx-js-style) – Module RH (Personnel, Pointage)
// ============================================================

import XLSXStyle from 'xlsx-js-style';
const { utils, writeFile } = XLSXStyle;

import { showToast } from '../components/ui/Toast';
import { getDateSuffix, MONTHS_FR, removeAccents } from './exportRHHelpers';

import type { RhEmployee } from '../db/database';

// ================================================================
// DESIGN SYSTEM
// ================================================================
const BRAND    = '1F7A3E';
const ACCENT   = 'D4EDDA';
const WHITE    = 'FFFFFF';
const DARK     = '1C2833';
const GREY_BG  = 'F2F3F4';
const TOTAL_BG = 'D5F5E3';
const ORANGE   = 'E67E22';
const RED_BG   = 'FDECEA';
const RED_FG   = 'C0392B';
const BLUE_BG  = 'D6EAF8';
const BLUE_FG  = '1A5276';

const colHeaderStyle = (align: 'left' | 'center' | 'right' = 'left') => ({
  font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: align, vertical: 'center', wrapText: true },
  border: {
    top:    { style: 'thin',   color: { rgb: BRAND } },
    bottom: { style: 'medium', color: { rgb: BRAND } },
    left:   { style: 'thin',   color: { rgb: BRAND } },
    right:  { style: 'thin',   color: { rgb: BRAND } },
  },
});

const dataStyle = (even: boolean, align: 'left' | 'center' | 'right' = 'left', bold = false, fg?: string, bg?: string) => ({
  font: { bold, color: { rgb: fg ?? DARK }, sz: 9, name: 'Calibri' },
  fill: { fgColor: { rgb: bg ?? (even ? ACCENT : GREY_BG) } },
  alignment: { horizontal: align, vertical: 'center' },
  border: {
    top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
    bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
    left:   { style: 'thin', color: { rgb: 'D5D8DC' } },
    right:  { style: 'thin', color: { rgb: 'D5D8DC' } },
  },
});

const titleStyle = () => ({
  font: { bold: true, color: { rgb: WHITE }, sz: 13, name: 'Calibri' },
  fill: { fgColor: { rgb: BRAND } },
  alignment: { horizontal: 'left', vertical: 'center' },
});

const subtitleStyle = () => ({
  font: { italic: true, color: { rgb: BRAND }, sz: 9, name: 'Calibri' },
  fill: { fgColor: { rgb: ACCENT } },
  alignment: { horizontal: 'left', vertical: 'center' },
});

const totalRowStyle = (align: 'left' | 'center' | 'right' = 'right') => ({
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

// ================================================================
// Helper buildStyledSheet (identique à exportXLSX.ts)
// ================================================================
interface ColDef { label: string; width: number; align?: 'left' | 'center' | 'right'; numFmt?: string; }
interface StyledRow {
  values: (string | number | null)[];
  rowType?: 'total' | 'alert' | 'renvoy';
  aligns?: Record<number, 'left' | 'center' | 'right'>;
  colors?: Record<number, string>;
  bgs?: Record<number, string>;
}

const buildStyledSheet = (title: string, subtitle: string, cols: ColDef[], styledRows: StyledRow[]): any => {
  const ws: any = {};
  const nCols = cols.length;
  let r = 0;

  // Titre
  ws[utils.encode_cell({ r, c: 0 })] = { v: title,    t: 's', s: titleStyle() };
  for (let c = 1; c < nCols; c++) ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: titleStyle() };
  r++;

  // Sous-titre
  ws[utils.encode_cell({ r, c: 0 })] = { v: subtitle, t: 's', s: subtitleStyle() };
  for (let c = 1; c < nCols; c++) ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: subtitleStyle() };
  r++;

  // Ligne vide
  r++;

  // En-têtes colonnes
  cols.forEach((col, c) => {
    ws[utils.encode_cell({ r, c })] = { v: col.label, t: 's', s: colHeaderStyle(col.align ?? 'left') };
  });
  r++;

  // Données
  styledRows.forEach((row, rowIdx) => {
    const even = rowIdx % 2 === 0;
    row.values.forEach((val, c) => {
      const col  = cols[c];
      const isNum = typeof val === 'number';
      const align = row.aligns?.[c] ?? col.align ?? (isNum ? 'right' : 'left');

      let style: any;
      if (row.rowType === 'total') {
        style = totalRowStyle(align);
      } else if (row.rowType === 'alert') {
        style = dataStyle(even, align, false, RED_FG, RED_BG);
      } else if (row.rowType === 'renvoy') {
        style = dataStyle(even, align, false, RED_FG, RED_BG);
      } else {
        const fg = row.colors?.[c];
        const bg = row.bgs?.[c] ?? (even ? ACCENT : GREY_BG);
        style = dataStyle(even, align, false, fg, bg);
      }

      const cell: any = { v: val ?? '', s: style };
      if (isNum) { cell.t = 'n'; if (col.numFmt) cell.z = col.numFmt; }
      else cell.t = 's';

      ws[utils.encode_cell({ r, c })] = cell;
    });
    r++;
  });

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
  ];
  ws['!cols']  = cols.map(col => ({ wch: col.width }));
  ws['!ref']   = utils.encode_range({ r: 0, c: 0 }, { r: r - 1, c: nCols - 1 });
  ws['!rows']  = [{ hpt: 22 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }];

  return ws;
};

// ================================================================
// 1. EXPORT PERSONNEL EXCEL – Stylisé
// ================================================================
interface PersonnelFilters {
  site?: string;
  statut?: string;
  type?: string;
}

export const exportPersonnelXLSX = (
  employees: RhEmployee[],
  filters: PersonnelFilters = {}
): void => {
  let list = [...employees];
  if (filters.site   && filters.site   !== 'all') list = list.filter(e => e.site    === filters.site);
  if (filters.statut && filters.statut !== 'all') list = list.filter(e => e.statut  === filters.statut);
  if (filters.type   && filters.type   !== 'all') list = list.filter(e => e.type    === filters.type);

  list.sort((a, b) => {
    const sc = a.site.localeCompare(b.site, 'fr');
    return sc !== 0 ? sc : a.nom.localeCompare(b.nom, 'fr');
  });

  if (list.length === 0) {
    showToast('Aucun employé à exporter.', 'warning');
    return;
  }

  const cols: ColDef[] = [
    { label: '#',             width: 5,  align: 'center' },
    { label: 'Nom',           width: 18 },
    { label: 'Prénom',        width: 18 },
    { label: 'Type',          width: 14, align: 'center' },
    { label: 'Statut',        width: 12, align: 'center' },
    { label: 'Site',          width: 18 },
    { label: 'Contact',       width: 18 },
    { label: 'Salaire (FCFA)', width: 18, align: 'right', numFmt: '#,##0' },
  ];

  // Totaux
  const activeList  = list.filter(e => e.statut !== 'renvoye');
  const totalSalary = activeList.reduce((s, e) => s + (e.salaireBase || 0), 0);

  const rows: StyledRow[] = list.map((e, idx) => ({
    values: [
      idx + 1,
      e.nom,
      e.prenom,
      e.type === 'temporaire' ? 'Temporaire' : 'Permanent',
      e.statut === 'renvoye' ? 'Renvoyé' : 'Actif',
      e.site,
      e.contact || '',
      e.salaireBase,
    ],
    rowType: e.statut === 'renvoye' ? 'renvoy' : undefined,
    colors: e.statut !== 'renvoye'
      ? { 4: BRAND, 7: DARK }
      : undefined,
  }));

  rows.push({
    values: [
      '', `${activeList.length} actifs / ${list.length} total`,
      '', '', '', '', '', totalSalary,
    ],
    rowType: 'total',
    aligns: { 0: 'center', 1: 'left' },
  });

  const ws = buildStyledSheet(
    'LISTE DU PERSONNEL',
    `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    cols, rows
  );

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Employés');
  writeFile(wb, `echos_employes_${getDateSuffix()}.xlsx`);
  showToast('Liste des employés exportée en Excel !', 'success');
};

// ================================================================
// 2. EXPORT POINTAGE MENSUEL EXCEL – Stylisé avec légende
// ================================================================
interface AttendanceFilters {
  year: number;
  month: number; // 0-indexed
}

export const exportAttendanceXLSX = (
  employees: RhEmployee[],
  attendance: Record<string, number>,
  filters: AttendanceFilters
): void => {
  const { year, month } = filters;

  if (employees.length === 0) {
    showToast('Aucun employé à exporter.', 'warning');
    return;
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() !== 0) workDays.push(d);
  }

  const monthName = MONTHS_FR[month];
  const ws: any = {};
  const nCols = workDays.length + 3; // Nom + jours + Total Absences + Jours Effectifs
  let r = 0;

  // ── Titre ────────────────────────────────────────────────────
  const titleVal = `FEUILLE DE POINTAGE – ${removeAccents(monthName).toUpperCase()} ${year}`;
  ws[utils.encode_cell({ r, c: 0 })] = { v: titleVal, t: 's', s: titleStyle() };
  for (let c = 1; c < nCols; c++) ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: titleStyle() };
  r++;

  // ── Sous-titre ────────────────────────────────────────────────
  const subVal = `Généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  ws[utils.encode_cell({ r, c: 0 })] = { v: subVal, t: 's', s: subtitleStyle() };
  for (let c = 1; c < nCols; c++) ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: subtitleStyle() };
  r++;

  // ── Ligne vide ────────────────────────────────────────────────
  r++;

  // ── En-têtes colonnes ─────────────────────────────────────────
  // En-tête "Nom"
  ws[utils.encode_cell({ r, c: 0 })] = { v: 'Employé', t: 's', s: colHeaderStyle('left') };
  // Jours
  workDays.forEach((d, i) => {
    const dayOfWeek = new Date(year, month, d).getDay();
    const isSat = dayOfWeek === 6;
    ws[utils.encode_cell({ r, c: i + 1 })] = {
      v: d,
      t: 'n',
      s: {
        ...colHeaderStyle('center'),
        font: { bold: true, color: { rgb: WHITE }, sz: 8, name: 'Calibri' },
        fill: { fgColor: { rgb: isSat ? '6D8A6E' : BRAND } },
      },
    };
  });
  // Totaux
  ws[utils.encode_cell({ r, c: workDays.length + 1 })] = {
    v: 'Absences', t: 's', s: {
      ...colHeaderStyle('center'),
      fill: { fgColor: { rgb: 'A93226' } },
    },
  };
  ws[utils.encode_cell({ r, c: workDays.length + 2 })] = {
    v: 'Jours Travaillés', t: 's', s: {
      ...colHeaderStyle('center'),
      fill: { fgColor: { rgb: '1A5276' } },
    },
  };
  r++;

  // ── Lignes employés ───────────────────────────────────────────
  employees.forEach((emp, rowIdx) => {
    const even = rowIdx % 2 === 0;
    let totalAbs = 0;
    let totalPresent = 0;

    // Nom
    const isRenvoye = emp.statut === 'renvoye';
    ws[utils.encode_cell({ r, c: 0 })] = {
      v: `${emp.nom} ${emp.prenom}`,
      t: 's',
      s: {
        font: { bold: true, color: { rgb: isRenvoye ? RED_FG : DARK }, sz: 9, name: 'Calibri' },
        fill: { fgColor: { rgb: even ? ACCENT : GREY_BG } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: {
          top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
          bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
          right:  { style: 'thin', color: { rgb: 'D5D8DC' } },
        },
      },
    };

    // Cellule par jour
    workDays.forEach((d, i) => {
      const dateObj = new Date(year, month, d);
      dateObj.setHours(0, 0, 0, 0);

      let displayVal = 'P';
      let cellBg  = even ? ACCENT : GREY_BG;
      let cellFg  = BRAND;

      if (isRenvoye && emp.dateRenvoi) {
        const dismissal = new Date(emp.dateRenvoi);
        dismissal.setHours(0, 0, 0, 0);
        if (dateObj > dismissal) {
          displayVal = '–';
          cellBg = GREY_BG;
          cellFg = 'AAAAAA';
        }
      }

      if (emp.dateEmbauche && displayVal !== '–') {
        const start = new Date(emp.dateEmbauche);
        start.setHours(0, 0, 0, 0);
        if (dateObj < start) {
          displayVal = '–';
          cellBg = GREY_BG;
          cellFg = 'AAAAAA';
        }
      }

      if (displayVal !== '–') {
        const key = `${emp.id}_${year}-${month}-${d}`;
        let status = attendance[key];
        if (status === undefined) status = emp.type === 'temporaire' ? 3 : 1;

        if (status === 2) {
          displayVal = 'ABS';
          cellBg = RED_BG;
          cellFg = RED_FG;
          totalAbs++;
        } else if (status === 3) {
          displayVal = 'J';
          cellBg = BLUE_BG;
          cellFg = BLUE_FG;
        } else {
          displayVal = 'P';
          cellBg = even ? ACCENT : GREY_BG;
          cellFg = BRAND;
          totalPresent++;
        }
      }

      ws[utils.encode_cell({ r, c: i + 1 })] = {
        v: displayVal,
        t: 's',
        s: {
          font: { bold: displayVal === 'ABS', color: { rgb: cellFg }, sz: 8, name: 'Calibri' },
          fill: { fgColor: { rgb: cellBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
            bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
            left:   { style: 'hair', color: { rgb: 'D5D8DC' } },
            right:  { style: 'hair', color: { rgb: 'D5D8DC' } },
          },
        },
      };
    });

    // Colonne Absences
    ws[utils.encode_cell({ r, c: workDays.length + 1 })] = {
      v: totalAbs,
      t: 'n',
      s: {
        font: { bold: totalAbs > 0, color: { rgb: totalAbs > 0 ? RED_FG : DARK }, sz: 9, name: 'Calibri' },
        fill: { fgColor: { rgb: totalAbs > 0 ? RED_BG : (even ? ACCENT : GREY_BG) } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
          bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
          left:   { style: 'medium', color: { rgb: 'D5D8DC' } },
          right:  { style: 'thin',   color: { rgb: 'D5D8DC' } },
        },
      },
    };

    // Colonne Jours Travaillés
    ws[utils.encode_cell({ r, c: workDays.length + 2 })] = {
      v: totalPresent,
      t: 'n',
      s: {
        font: { bold: true, color: { rgb: BLUE_FG }, sz: 9, name: 'Calibri' },
        fill: { fgColor: { rgb: BLUE_BG } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top:    { style: 'hair', color: { rgb: 'D5D8DC' } },
          bottom: { style: 'hair', color: { rgb: 'D5D8DC' } },
          left:   { style: 'thin', color: { rgb: 'D5D8DC' } },
          right:  { style: 'thin', color: { rgb: 'D5D8DC' } },
        },
      },
    };

    r++;
  });

  // ── Ligne légende ─────────────────────────────────────────────
  r++;
  ws[utils.encode_cell({ r, c: 0 })] = {
    v: 'Légende : P = Présent   ABS = Absent   J = Journalier   – = Non applicable',
    t: 's',
    s: subtitleStyle(),
  };
  for (let c = 1; c < nCols; c++) {
    ws[utils.encode_cell({ r, c })] = { v: '', t: 's', s: subtitleStyle() };
  }

  // ── Merges titre + sous-titre + légende ───────────────────────
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } },
    { s: { r: r, c: 0 }, e: { r: r, c: nCols - 1 } },
  ];

  ws['!cols'] = [
    { wch: 28 },
    ...workDays.map(() => ({ wch: 5 })),
    { wch: 12 },
    { wch: 18 },
  ];

  ws['!ref']  = utils.encode_range({ r: 0, c: 0 }, { r: r, c: nCols - 1 });
  ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Pointage');
  writeFile(wb, `echos_pointage_${year}_${String(month + 1).padStart(2, '0')}.xlsx`);
  showToast('Pointage exporté en Excel !', 'success');
};
