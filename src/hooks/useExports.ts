// ============================================================
// src/hooks/useExports.ts
// Hook React exposant toutes les fonctions d'export (Stock + RH)
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../context/AuthContext';
import { db } from '../db/database';
import { showToast } from '../components/ui/Toast';

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
    exportInventoryPDF: (typeFilter = 'all') =>
      exportInventoryPDF(inventory, typeFilter),

    exportHistoryPDF: (filter = 'all') => {
      if (!checkAdmin()) return;
      exportHistoryPDF(dailyRecords, filter);
    },

    exportExpensesPDF: (timeFilter = 'all', payFilter = 'all') =>
      exportExpensesPDF(expenses, timeFilter, payFilter),

    exportIncomeHistoryPDF: (filter = 'all') =>
      exportIncomeHistoryPDF(income, filter),

    exportClientsPDF: () =>
      exportClientsPDF(clients as any),

    exportProductionPDF: (filter = 'all') =>
      exportProductionPDF(productions, filter),

    exportRawMaterialPDF: (filter = 'all') =>
      exportRawMaterialPDF(rawMaterials, filter),

    exportDailyReportPDF: (data: any) => {
      if (!checkAdmin()) return;
      exportDailyReportPDF(data);
    },

    generateInvoicePDF: (cartItems: any[], client?: any, mode?: 'sale' | 'quote') =>
      generateInvoicePDF(cartItems, client, mode),

    // ============ EXCEL STOCK ============
    exportInventoryXLSX: (typeFilter = 'all') =>
      exportInventoryXLSX(inventory, typeFilter),

    exportHistoryXLSX: (filter = 'all') => {
      if (!checkAdmin()) return;
      exportHistoryXLSX(dailyRecords, filter);
    },

    exportExpensesXLSX: (filter = 'all') =>
      exportExpensesXLSX(expenses, filter),

    exportProductionXLSX: (filter = 'all') =>
      exportProductionXLSX(productions, filter),

    exportRawMaterialXLSX: (filter = 'all') =>
      exportRawMaterialXLSX(rawMaterials, filter),

    exportIncomeXLSX: (filter = 'all') =>
      exportIncomeXLSX(income, filter),

    // ============ PDF RH ============
    exportPersonnelPDF: (options?: any) =>
      exportPersonnelPDF(employees, options),

    exportAttendancePDF: (filters: { year: number; month: number }) =>
      exportAttendancePDF(employees, attendance, filters),

    exportAttendanceTodayPDF: () =>
      exportAttendanceTodayPDF(employees, attendance),

    exportPayrollPDF: (payrollData: any[]) => {
      if (!checkAdmin()) return;
      exportPayrollPDF(payrollData);
    },

    exportRHHistoryPDF: (employee: any, year: number) => {
      const historyItems = buildRHHistory(employee, year, attendance, payrollExtras);
      exportRHHistoryPDF(employee, historyItems, year);
    },

    // ============ EXCEL RH ============
    exportPersonnelXLSX: (filters?: any) =>
      exportPersonnelXLSX(employees, filters),

    exportAttendanceXLSX: (filters: { year: number; month: number }) =>
      exportAttendanceXLSX(employees, attendance, filters),

    // Données brutes disponibles pour les composants
    _data: {
      inventory, dailyRecords, expenses, income, productions, rawMaterials, clients,
      employees, attendance, payrollExtras,
    },
  };
}
