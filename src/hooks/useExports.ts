// ============================================================
// src/hooks/useExports.ts
// Hook React exposant toutes les fonctions d'export (Stock + RH)
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../context/AuthContext';
import { db } from '../db/database';
import { showToast } from '../components/ui/Toast';
import { logAction } from '../services/logService';

// --- Imports Stock / Commercial ---
import {
  exportInventoryPDF,
  exportHistoryPDF,
  exportExpensesPDF,
  exportIncomeHistoryPDF,
  exportClientsPDF,
  exportProductionPDF,
  exportRawMaterialPDF,
  exportDailyReportPDF,
  generateInvoicePDF,
} from '../utils/exportPDF';

import {
  exportInventoryXLSX,
  exportHistoryXLSX,
  exportExpensesXLSX,
  exportProductionXLSX,
  exportRawMaterialXLSX,
  exportIncomeXLSX,
} from '../utils/exportXLSX';

// --- Imports RH ---
import {
  exportPersonnelPDF,
  exportAttendancePDF,
  exportAttendanceTodayPDF,
  exportPayrollPDF,
  exportRHHistoryPDF,
  buildRHHistory,
} from '../utils/exportRHPDF';

import {
  exportPersonnelXLSX,
  exportAttendanceXLSX,
} from '../utils/exportRHXLSX';

// ----------------------------------------------------------------
// useExports – hook principal
// ----------------------------------------------------------------
export function useExports() {
  const { currentUser } = useAuth();

  // Données commerciales
  const inventory = useLiveQuery(() => db.inventory.toArray(), []) ?? [];
  const dailyRecords = useLiveQuery(() => db.dailyRecords.toArray(), []) ?? [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? [];
  const income = useLiveQuery(() => db.income.toArray(), []) ?? [];
  const productions = useLiveQuery(() => db.productions.toArray(), []) ?? [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];

  // Données RH
  const rhData = useLiveQuery(() => db.rhAppData.get('rh_app_data'));
  const employees = rhData?.value?.employees ?? [];
  const attendance = rhData?.value?.attendance ?? {};
  const payrollExtras = rhData?.value?.payrollExtras ?? {};

  /** Vérifie que l'utilisateur est admin pour les exports sensibles */
  const checkAdmin = (): boolean => {
    if (currentUser?.role === 'lecteur') {
      showToast("Accès refusé : les lecteurs ne peuvent pas exporter ce rapport.", 'error');
      return false;
    }
    return true;
  };

  return {
    // ============ PDF STOCK ============
    exportInventoryPDF: (typeFilter = 'all') => {
      logAction('export', 'stock', `Export PDF de l'inventaire (Filtre: ${typeFilter})`);
      return exportInventoryPDF(inventory, typeFilter);
    },

    exportHistoryPDF: (filter = 'all') => {
      if (!checkAdmin()) return;
      logAction('export', 'transactions', `Export PDF de l'historique des ventes (Filtre: ${filter})`);
      exportHistoryPDF(dailyRecords, filter);
    },

    exportExpensesPDF: (timeFilter = 'all', payFilter = 'all') => {
      logAction('export', 'expenses', `Export PDF des dépenses (Période: ${timeFilter}, Mode: ${payFilter})`);
      return exportExpensesPDF(expenses, timeFilter, payFilter);
    },

    exportIncomeHistoryPDF: (filter = 'all') => {
      logAction('export', 'income', `Export PDF des revenus additionnels (Filtre: ${filter})`);
      return exportIncomeHistoryPDF(income, filter);
    },

    exportClientsPDF: () => {
      logAction('export', 'clients', `Export PDF du fichier clients`);
      return exportClientsPDF(clients as any);
    },

    exportProductionPDF: (filter = 'all') => {
      logAction('export', 'production', `Export PDF du rapport de production (Filtre: ${filter})`);
      return exportProductionPDF(productions, filter);
    },

    exportRawMaterialPDF: (filter = 'all') => {
      logAction('export', 'rawMaterials', `Export PDF des matières premières (Filtre: ${filter})`);
      return exportRawMaterialPDF(rawMaterials, filter);
    },

    exportDailyReportPDF: (data: any) => {
      if (!checkAdmin()) return;
      logAction('export', 'dashboard', `Export PDF du rapport journalier synthétique`);
      exportDailyReportPDF(data);
    },

    generateInvoicePDF: (cartItems: any[], client?: any, mode?: 'sale' | 'quote') => {
      logAction('export', 'caisse', `Génération d'une facture/bon au format PDF`);
      return generateInvoicePDF(cartItems, client, mode);
    },

    // ============ EXCEL STOCK ============
    exportInventoryXLSX: (typeFilter = 'all') => {
      logAction('export', 'stock', `Export Excel de l'inventaire (Filtre: ${typeFilter})`);
      return exportInventoryXLSX(inventory, typeFilter);
    },

    exportHistoryXLSX: (filter = 'all') => {
      if (!checkAdmin()) return;
      logAction('export', 'transactions', `Export Excel de l'historique des ventes (Filtre: ${filter})`);
      exportHistoryXLSX(dailyRecords, filter);
    },

    exportExpensesXLSX: (filter = 'all') => {
      logAction('export', 'expenses', `Export Excel des dépenses (Filtre: ${filter})`);
      return exportExpensesXLSX(expenses, filter);
    },

    exportProductionXLSX: (filter = 'all') => {
      logAction('export', 'production', `Export Excel du rapport de production (Filtre: ${filter})`);
      return exportProductionXLSX(productions, filter);
    },

    exportRawMaterialXLSX: (filter = 'all') => {
      logAction('export', 'rawMaterials', `Export Excel des matières premières (Filtre: ${filter})`);
      return exportRawMaterialXLSX(rawMaterials, filter);
    },

    exportIncomeXLSX: (filter = 'all') => {
      logAction('export', 'income', `Export Excel des revenus additionnels (Filtre: ${filter})`);
      return exportIncomeXLSX(income, filter);
    },

    // ============ PDF RH ============
    exportPersonnelPDF: (options?: any) => {
      logAction('export', 'rh', `Export PDF du registre du personnel`);
      return exportPersonnelPDF(employees, options);
    },

    exportAttendancePDF: (filters: { year: number; month: number }) => {
      logAction('export', 'rh', `Export PDF du pointage mensuel (${filters.month + 1}/${filters.year})`);
      return exportAttendancePDF(employees, attendance, filters);
    },

    exportAttendanceTodayPDF: () => {
      logAction('export', 'rh', `Export PDF de la feuille de présence du jour`);
      return exportAttendanceTodayPDF(employees, attendance);
    },

    exportPayrollPDF: (payrollData: any[]) => {
      if (!checkAdmin()) return;
      logAction('export', 'salaires', `Export PDF de l'état récapitulatif des salaires`);
      exportPayrollPDF(payrollData);
    },

    exportRHHistoryPDF: (employee: any, year: number) => {
      logAction('export', 'rh', `Export PDF de la fiche historique annuelle de ${employee.nom} ${employee.prenom} (${year})`, employee.id);
      const historyItems = buildRHHistory(employee, year, attendance, payrollExtras);
      exportRHHistoryPDF(employee, historyItems, year);
    },

    // ============ EXCEL RH ============
    exportPersonnelXLSX: (filters?: any) => {
      logAction('export', 'rh', `Export Excel du registre du personnel`);
      return exportPersonnelXLSX(employees, filters);
    },

    exportAttendanceXLSX: (filters: { year: number; month: number }) => {
      logAction('export', 'rh', `Export Excel du pointage mensuel (${filters.month + 1}/${filters.year})`);
      return exportAttendanceXLSX(employees, attendance, filters);
    },

    // Données brutes disponibles pour les composants
    _data: {
      inventory, dailyRecords, expenses, income, productions, rawMaterials, clients,
      employees, attendance, payrollExtras,
    },
  };
}
