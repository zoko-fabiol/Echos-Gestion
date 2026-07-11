import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth, TabId } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ToastContainer, showToast } from './components/ui/Toast';
import { PinLockModal } from './components/PinLockModal';
import { PinVerifyModal } from './components/PinVerifyModal';
import { PinSetupModal } from './components/PinSetupModal';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product } from './db/database';
import { THEME_COLOR_KEY, DEFAULT_THEME_COLOR } from './config/constants';

// --- PAGE COMPONENTS ---
import { Login } from './pages/Login';
import { DashboardRH } from './pages/DashboardRH';
import { Employees } from './pages/Employees';
import { Attendance } from './pages/Attendance';
import { Salaires } from './pages/Salaires';
import { Catalogue } from './pages/Catalogue';
import { Caisse } from './pages/Caisse';
import { Stock } from './pages/Stock';
import { Transactions } from './pages/Transactions';
import { ProductionPage } from './pages/Production';
import { Comptes } from './pages/Comptes';
import { SettingsPage } from './pages/Settings';
import { AICopilotChat } from './components/AICopilotChat';
import { initializeMistral } from './services/mistralService';
import { useExports } from './hooks/useExports';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { addPDFHeader, addPDFFooter, tableHeadStyles } from './utils/exportHelpers';
import { getObjectHash, syncUp } from './services/syncEngine';

const AppContent: React.FC = () => {
  const { isLoggedIn, emailVerificationRequired, hasAccess, authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [cart, setCart] = useState<(Product & { qty: number })[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const { 
    exportAttendancePDF, exportAttendanceXLSX,
    exportPersonnelPDF, exportPersonnelXLSX,
    exportInventoryPDF, exportInventoryXLSX,
    exportExpensesPDF, exportExpensesXLSX,
    exportHistoryPDF, exportHistoryXLSX,
    exportProductionPDF, exportProductionXLSX,
    exportRawMaterialPDF, exportRawMaterialXLSX
  } = useExports();

  // Initialisation silencieuse de Mistral AI après connexion
  useEffect(() => {
    if (isLoggedIn) {
      initializeMistral();
    }
  }, [isLoggedIn]);

  // Écouteur d'action de l'IA global (Navigation et Impression de fiches)
  useEffect(() => {
    const handleAIAction = async (e: Event) => {
      const { action, args } = (e as CustomEvent).detail || {};
      if (action === 'navigateToTab' && args?.tabId) {
        if (hasAccess(args.tabId, 'view')) {
          setActiveTab(args.tabId);
        }
      } else if (action === 'triggerExport') {
        const { reportType, format = 'pdf', year, month } = args;
        const targetYear = year || new Date().getFullYear();
        const targetMonth = month !== undefined ? (month - 1) : new Date().getMonth();
        
        if (reportType === 'attendance') {
          if (format === 'excel') exportAttendanceXLSX({ year: targetYear, month: targetMonth });
          else exportAttendancePDF({ year: targetYear, month: targetMonth });
        } else if (reportType === 'personnel') {
          if (format === 'excel') exportPersonnelXLSX();
          else exportPersonnelPDF();
        } else if (reportType === 'inventory') {
          if (format === 'excel') exportInventoryXLSX();
          else exportInventoryPDF();
        } else if (reportType === 'expenses') {
          if (format === 'excel') exportExpensesXLSX();
          else exportExpensesPDF();
        } else if (reportType === 'salesHistory') {
          if (format === 'excel') exportHistoryXLSX();
          else exportHistoryPDF();
        } else if (reportType === 'production') {
          if (format === 'excel') exportProductionXLSX();
          else exportProductionPDF();
        } else if (reportType === 'rawMaterials') {
          if (format === 'excel') exportRawMaterialXLSX();
          else exportRawMaterialPDF();
        }
      } else if (action === 'generateCustomReportPDF') {
        const { title, subtitle, sections } = args;
        const doc = new jsPDF() as any;
        const startY = addPDFHeader(doc, title.toUpperCase(), subtitle);
        let currentY = startY;

        sections.forEach((sec: any) => {
          if (currentY > 260) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(31, 122, 62);
          doc.text(sec.sectionTitle, 15, currentY);
          currentY += 6;

          if (sec.content) {
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            
            const splitText = doc.splitTextToSize(sec.content, 180);
            splitText.forEach((line: string) => {
              if (currentY > 275) {
                doc.addPage();
                currentY = 20;
              }
              doc.text(line, 15, currentY);
              currentY += 4.5;
            });
            currentY += 5;
          }

          if (sec.table && sec.table.body) {
            doc.autoTable({
              startY: currentY,
              head: sec.table.head ? [sec.table.head] : undefined,
              body: sec.table.body,
              theme: 'grid',
              headStyles: tableHeadStyles,
              styles: { fontSize: 8, cellPadding: 2 },
              margin: { left: 15, right: 15 }
            });
            currentY = (doc as any).lastAutoTable.finalY + 8;
          }
        });

        addPDFFooter(doc);
        const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
      } else if (action === 'mergeBackupData') {
        const backup = (window as any).tempUploadedBackupData;
        if (!backup) {
          showToast("Aucune donnée de sauvegarde en mémoire à fusionner.", 'error');
          return;
        }

        try {
          let mergedCount = 0;
          
          await db.transaction('rw', [
            db.inventory, db.dailyRecords, db.expenses, db.clients, 
            db.suppliers, db.quotes, db.income, db.productions, 
            db.rawMaterials
          ], async () => {
            const mergeTable = async (tableName: string, items: any[]) => {
              if (!items || !Array.isArray(items)) return;
              const table = (db as any)[tableName];
              const existingIds = new Set((await table.toArray()).map((x: any) => x.id));
              const missingItems = items.filter(item => !existingIds.has(item.id));
              if (missingItems.length > 0) {
                await table.bulkPut(missingItems);
                mergedCount += missingItems.length;
              }
            };

            await mergeTable('inventory', backup.inventory);
            await mergeTable('dailyRecords', backup.dailyRecords);
            await mergeTable('expenses', backup.expenses);
            await mergeTable('clients', backup.clients);
            await mergeTable('suppliers', backup.suppliers);
            await mergeTable('quotes', backup.quotes);
            await mergeTable('income', backup.income);
            await mergeTable('productions', backup.productions);
            await mergeTable('rawMaterials', backup.rawMaterials);
          });

          // Merge RH Data
          const localRH = await db.rhAppData.get('rh_app_data');
          const backupRHList = backup.rhAppData || [];
          const backupRH = backupRHList.find((x: any) => x.key === 'rh_app_data')?.value || 
                           (backup.employees || backup.attendance ? backup : null);

          if (backupRH) {
            const currentRHValue = localRH?.value || { employees: [], attendance: {}, payrollExtras: {}, visibleSundays: [] };
            
            const existingEmpIds = new Set(currentRHValue.employees.map((e: any) => e.id));
            const backupEmployees = backupRH.employees || [];
            const missingEmployees = backupEmployees.filter((e: any) => !existingEmpIds.has(e.id));
            
            const mergedAttendance = { ...currentRHValue.attendance, ...(backupRH.attendance || {}) };
            const mergedPayrollExtras = { ...currentRHValue.payrollExtras, ...(backupRH.payrollExtras || {}) };
            
            const updatedRHValue = {
              employees: [...currentRHValue.employees, ...missingEmployees],
              attendance: mergedAttendance,
              payrollExtras: mergedPayrollExtras,
              visibleSundays: Array.from(new Set([...(currentRHValue.visibleSundays || []), ...(backupRH.visibleSundays || [])]))
            };

             await db.rhAppData.put({ key: 'rh_app_data', value: updatedRHValue });
            // Do not cache the new rhAppData hash so that syncUp sees the local change as pending.
            mergedCount += missingEmployees.length;
          }

          // Trigger syncUp to push the restored data to Firestore
          try {
            await syncUp();
          } catch (syncErr) {
            console.warn('Sync up after merge failed, will retry later:', syncErr);
          }

          showToast(`Fusion complétée avec succès ! ${mergedCount} éléments insérés.`, 'success');
          (window as any).tempUploadedBackupData = null;
        } catch (err: any) {
          console.error(err);
          showToast(`Erreur lors de la fusion : ${err.message}`, 'error');
        }
      }
    };
    window.addEventListener('ai-action', handleAIAction);
    return () => window.removeEventListener('ai-action', handleAIAction);
  }, [
    hasAccess, 
    exportAttendancePDF, exportAttendanceXLSX,
    exportPersonnelPDF, exportPersonnelXLSX,
    exportInventoryPDF, exportInventoryXLSX,
    exportExpensesPDF, exportExpensesXLSX,
    exportHistoryPDF, exportHistoryXLSX,
    exportProductionPDF, exportProductionXLSX,
    exportRawMaterialPDF, exportRawMaterialXLSX
  ]);

  // 1. Initial Database Loading Block (Dexie local)
  useEffect(() => {
    const loadAllLocalTables = async () => {
      try {
        await Promise.all([
          db.inventory.toArray(),
          db.dailyRecords.toArray(),
          db.expenses.toArray(),
          db.clients.toArray(),
          db.suppliers.toArray(),
          db.quotes.toArray(),
          db.income.toArray(),
          db.productions.toArray(),
          db.rawMaterials.toArray(),
          db.rhAppData.toArray(),
          db.userAccounts.toArray(),
          db.appSettings.toArray(),
        ]);
      } catch (err) {
        console.error('Dexie local loading failed:', err);
      } finally {
        setDbLoading(false);
      }
    };
    loadAllLocalTables();
  }, []);

  // 2. Dynamic Brand Color & Glassmorphism Injection
  const colorRecord = useLiveQuery(() => db.appSettings.get(THEME_COLOR_KEY));
  const glassEnabledRecord = useLiveQuery(() => db.appSettings.get('theme_glass_enabled'));
  const glassOpacityRecord = useLiveQuery(() => db.appSettings.get('theme_glass_opacity'));
  
  useEffect(() => {
    const color = colorRecord?.value || DEFAULT_THEME_COLOR;
    document.documentElement.style.setProperty('--brand-color', color);
    
    const isGlass = glassEnabledRecord?.value === true;
    const opacity = glassOpacityRecord?.value ?? 0.15;
    
    if (isGlass) {
      document.documentElement.style.setProperty('--glass-bg', `rgba(255, 255, 255, ${opacity})`);
      document.documentElement.style.setProperty('--glass-border', `rgba(255, 255, 255, 0.25)`);
    } else {
      document.documentElement.style.removeProperty('--glass-bg');
      document.documentElement.style.removeProperty('--glass-border');
    }
  }, [colorRecord, glassEnabledRecord, glassOpacityRecord]);

  // 3. Adjust activeTab if user role changes and they lose access to current tab
  useEffect(() => {
    if (isLoggedIn && !hasAccess(activeTab, 'view')) {
      // Find first available tab
      const availableTabs: TabId[] = [
        'dashboard', 'employes', 'pointage', 'salaires',
        'catalogue', 'caisse', 'stock', 'transactions',
        'production', 'comptes', 'settings'
      ];
      const nextTab = availableTabs.find(tab => hasAccess(tab, 'view'));
      if (nextTab) setActiveTab(nextTab);
    }
  }, [isLoggedIn, hasAccess, activeTab]);

  // 4. Cart handlers
  const addToCart = (product: Product) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, qty: Math.min(item.qty + 1, product.stock) } 
            : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateCartQty = (id: number, qty: number) => {
    setCart(prev => {
      if (qty <= 0) {
        return prev.filter(item => item.id !== id);
      }
      return prev.map(item => 
        item.id === id ? { ...item, qty } : item
      );
    });
  };

  const removeCartItem = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // --- RENDER CONDITIONALS ---

  if (dbLoading || authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold text-slate-400">Initialisation de la session...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    if (emailVerificationRequired) {
      return (
        <>
          <Login />
          <PinVerifyModal />
          <ToastContainer />
        </>
      );
    }
    return (
      <>
        <Login />
        <ToastContainer />
      </>
    );
  }

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardRH />;
      case 'employes': return <Employees />;
      case 'pointage': return <Attendance />;
      case 'salaires': return <Salaires />;
      case 'catalogue': return <Catalogue cart={cart} addToCart={addToCart} />;
      case 'caisse': return <Caisse cart={cart} setCart={setCart} updateCartQty={updateCartQty} removeCartItem={removeCartItem} />;
      case 'stock': return <Stock />;
      case 'transactions': return <Transactions />;
      case 'production': return <ProductionPage />;
      case 'comptes': return <Comptes />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardRH />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderActivePage()}
      
      {/* Absolute Overlays */}
      <AICopilotChat />
      <PinLockModal />
      <PinVerifyModal />
      <PinSetupModal />
      <ToastContainer />
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
