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

import { App as CapApp } from '@capacitor/app';

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

  // Écouteur du bouton retour matériel d'Android (Capacitor & Web)
  useEffect(() => {
    let backListener: any;
    const registerAndroidBack = async () => {
      try {
        backListener = await CapApp.addListener('backButton', () => {
          const customBackEvent = new CustomEvent('android-back-button', { cancelable: true });
          window.dispatchEvent(customBackEvent);

          if (!customBackEvent.defaultPrevented) {
            if (activeTab !== 'dashboard') {
              setActiveTab('dashboard');
            } else {
              CapApp.exitApp();
            }
          }
        });
      } catch (err) {
        // Environnement non-Capacitor
      }
    };

    registerAndroidBack();

    return () => {
      if (backListener && typeof backListener.remove === 'function') {
        backListener.remove();
      }
    };
  }, [activeTab]);

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
        const targetTables: string[] = args?.targetTables || ['all'];

        if (!backup) {
          showToast("Aucune donnée de sauvegarde en mémoire à fusionner.", 'error');
          return;
        }

        const shouldSync = (tableName: string) => {
          if (targetTables.includes('all') || targetTables.includes('*')) return true;
          return targetTables.some(t => t.toLowerCase() === tableName.toLowerCase() || t.toLowerCase() === tableName.toLowerCase() + 's');
        };

        try {
          let mergedCount = 0;
          let deletedCount = 0;

          // Helper : Clés d'unicité naturelle (Business Keys) pour empêcher TOUT doublon
          const getKeyForTable = (tableName: string, x: any): string => {
            if (!x) return '';
            if (tableName === 'expenses') {
              const d = String(x.date || '').slice(0, 10);
              const desc = String(x.description || '').trim().toLowerCase();
              const amt = Number(x.amount || 0);
              const cat = String(x.category || '').trim().toLowerCase();
              return `exp_${d}_${desc}_${amt}_${cat}`;
            }
            if (tableName === 'inventory') {
              return `inv_${String(x.name || '').trim().toLowerCase()}`;
            }
            if (tableName === 'dailyRecords') {
              const d = String(x.date || '').slice(0, 10);
              const tot = Number(x.total || 0);
              const client = String(x.clientName || '').trim().toLowerCase();
              return `sale_${d}_${tot}_${client}`;
            }
            if (tableName === 'rawMaterials') {
              return `raw_${String(x.name || '').trim().toLowerCase()}`;
            }
            if (tableName === 'productions') {
              const d = String(x.date || '').slice(0, 10);
              const pName = String(x.productName || '').trim().toLowerCase();
              const rName = String(x.rawMaterialName || '').trim().toLowerCase();
              const qty = Number(x.quantity || 0);
              return `prod_${d}_${pName}_${rName}_${qty}`;
            }
            if (tableName === 'clients' || tableName === 'suppliers') {
              return `${tableName}_${String(x.name || '').trim().toLowerCase()}`;
            }
            if (tableName === 'quotes') {
              const d = String(x.date || '').slice(0, 10);
              const tot = Number(x.total || 0);
              const client = String(x.clientName || '').trim().toLowerCase();
              return `quote_${d}_${tot}_${client}`;
            }
            return `id_${x.id}`;
          };

          await db.transaction('rw', [
            db.inventory, db.dailyRecords, db.expenses, db.clients, 
            db.suppliers, db.quotes, db.income, db.productions, 
            db.rawMaterials
          ], async () => {
            const syncTableSmart = async (tableName: string, importedItems: any[]) => {
              if (!shouldSync(tableName) || !importedItems || !Array.isArray(importedItems)) return;
              const table = (db as any)[tableName];
              const localItems: any[] = await table.toArray();

              // Carte des éléments locaux par clé naturelle
              const localKeyMap = new Map<string, any>();
              localItems.forEach(item => {
                const k = getKeyForTable(tableName, item);
                if (k) localKeyMap.set(k, item);
              });

              // Dédoublonnage du fichier d'importation lui-même
              const importedKeyMap = new Map<string, any>();
              importedItems.forEach(item => {
                const k = getKeyForTable(tableName, item);
                if (k && !importedKeyMap.has(k)) {
                  importedKeyMap.set(k, item);
                }
              });

              // 1. SUPPRESSION : Tout élément local n'existant pas dans le fichier importé est supprimé de cette section
              const toDeleteIds: (number | string)[] = [];
              localItems.forEach(localItem => {
                const k = getKeyForTable(tableName, localItem);
                if (k && !importedKeyMap.has(k)) {
                  toDeleteIds.push(localItem.id);
                }
              });

              if (toDeleteIds.length > 0) {
                await table.bulkDelete(toDeleteIds);
                deletedCount += toDeleteIds.length;
              }

              // 2. INSERTION / MISE À JOUR : Réutiliser les IDs locaux existants pour écraser sans créer de doublon
              const itemsToPut: any[] = [];
              importedKeyMap.forEach((importedItem, key) => {
                const existingLocal = localKeyMap.get(key);
                if (existingLocal) {
                  itemsToPut.push({
                    ...importedItem,
                    id: existingLocal.id
                  });
                } else {
                  itemsToPut.push(importedItem);
                }
              });

              if (itemsToPut.length > 0) {
                await table.bulkPut(itemsToPut);
              }

              mergedCount += itemsToPut.length;
            };

            if (backup.inventory) await syncTableSmart('inventory', backup.inventory);
            if (backup.dailyRecords) await syncTableSmart('dailyRecords', backup.dailyRecords);
            if (backup.expenses) await syncTableSmart('expenses', backup.expenses);
            if (backup.clients) await syncTableSmart('clients', backup.clients);
            if (backup.suppliers) await syncTableSmart('suppliers', backup.suppliers);
            if (backup.quotes) await syncTableSmart('quotes', backup.quotes);
            if (backup.income) await syncTableSmart('income', backup.income);
            if (backup.productions) await syncTableSmart('productions', backup.productions);
            if (backup.rawMaterials) await syncTableSmart('rawMaterials', backup.rawMaterials);
          });

          // Restauration des Employés / RH si la section RH est ciblée
          if (shouldSync('employees') || shouldSync('rhAppData') || shouldSync('personnel')) {
            const localRH = await db.rhAppData.get('rh_app_data');
            const backupRHList = backup.rhAppData || [];
            const backupRH = backupRHList.find((x: any) => x.key === 'rh_app_data')?.value || 
                             (backup.employees || backup.attendance ? backup : null);

            if (backupRH && backupRH.employees) {
              // Dédoublonnage des employés par clé (prénom + nom)
              const empMap = new Map<string, any>();
              (backupRH.employees || []).forEach((emp: any) => {
                const k = `${String(emp.prenom || '').trim().toLowerCase()}_${String(emp.nom || '').trim().toLowerCase()}`;
                if (k && !empMap.has(k)) empMap.set(k, emp);
              });
              const cleanEmployees = Array.from(empMap.values());

              const updatedRHValue = {
                employees: cleanEmployees, // Restauration miroir stricte
                attendance: backupRH.attendance || localRH?.value?.attendance || {},
                payrollExtras: backupRH.payrollExtras || localRH?.value?.payrollExtras || {},
                visibleSundays: backupRH.visibleSundays || localRH?.value?.visibleSundays || []
              };

              await db.rhAppData.put({ key: 'rh_app_data', value: updatedRHValue });
              mergedCount += cleanEmployees.length;
            }
          }

          // Trigger syncUp to push clean data to Firestore
          try {
            await syncUp();
          } catch (syncErr) {
            console.warn('Sync up after restore failed:', syncErr);
          }

          showToast(`Restauration terminée : ${mergedCount} éléments conservés/restaurés, ${deletedCount} anciens éléments non présents supprimés.`, 'success');
          (window as any).tempUploadedBackupData = null;
        } catch (err: any) {
          console.error(err);
          showToast(`Erreur lors de la restauration : ${err.message}`, 'error');
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
