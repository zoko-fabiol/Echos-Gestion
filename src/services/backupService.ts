import { db } from '../db/database';
import { showToast } from '../components/ui/Toast';
import { getObjectHash, syncUp } from './syncEngine';

export async function backupToJSON(): Promise<void> {
  try {
    const data: Record<string, any[]> = {};
    
    // Gather all tables
    data.inventory = await db.inventory.toArray();
    data.dailyRecords = await db.dailyRecords.toArray();
    data.expenses = await db.expenses.toArray();
    data.clients = await db.clients.toArray();
    data.suppliers = await db.suppliers.toArray();
    data.quotes = await db.quotes.toArray();
    data.income = await db.income.toArray();
    data.productions = await db.productions.toArray();
    data.rawMaterials = await db.rawMaterials.toArray();
    data.appSettings = await db.appSettings.toArray();
    data.rhAppData = await db.rhAppData.toArray();
    data.userAccounts = await db.userAccounts.toArray();

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Backup generation failed', err);
    throw new Error('Impossible de générer le fichier de sauvegarde.');
  }
}

export interface RestoreResult {
  type: 'rh' | 'full';
}

export async function restoreFromJSON(file: File): Promise<RestoreResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        // Check if it is an RH backup
        const isRHBackup = !!(data.employees || data.attendance || data.payrollExtras);
        const isFullBackup = !!(data.inventory && data.dailyRecords && data.expenses);

        if (!isRHBackup && !isFullBackup) {
          throw new Error('Format de fichier de sauvegarde invalide.');
        }

        if (isRHBackup) {
          const payload = {
            employees: data.employees || [],
            attendance: data.attendance || {},
            payrollExtras: data.payrollExtras || {},
            visibleSundays: data.visibleSundays || []
          };
          await db.rhAppData.put({ key: 'rh_app_data', value: payload });
          localStorage.setItem('synchash_rhAppData_current', getObjectHash(payload));
          resolve({ type: 'rh' });
          return;
        }

        // Salary protection: keep current rhAppData local wages intact
        const existingRH = await db.rhAppData.get('rh_app_data');

        await db.transaction('rw', [
          db.inventory, db.dailyRecords, db.expenses, db.clients, 
          db.suppliers, db.quotes, db.income, db.productions, 
          db.rawMaterials, db.appSettings, db.rhAppData, db.userAccounts
        ], async () => {
          if (data.inventory) { await db.inventory.clear(); await db.inventory.bulkPut(data.inventory); }
          if (data.dailyRecords) { await db.dailyRecords.clear(); await db.dailyRecords.bulkPut(data.dailyRecords); }
          if (data.expenses) { await db.expenses.clear(); await db.expenses.bulkPut(data.expenses); }
          if (data.clients) { await db.clients.clear(); await db.clients.bulkPut(data.clients); }
          if (data.suppliers) { await db.suppliers.clear(); await db.suppliers.bulkPut(data.suppliers); }
          if (data.quotes) { await db.quotes.clear(); await db.quotes.bulkPut(data.quotes); }
          if (data.income) { await db.income.clear(); await db.income.bulkPut(data.income); }
          if (data.productions) { await db.productions.clear(); await db.productions.bulkPut(data.productions); }
          if (data.rawMaterials) { await db.rawMaterials.clear(); await db.rawMaterials.bulkPut(data.rawMaterials); }
          let appSettings = data.appSettings;
          if (!appSettings || appSettings.length === 0) {
            appSettings = [];
            const now = Date.now();
            if (data.companyInfo) appSettings.push({ key: 'stock_expert_company', value: data.companyInfo, timestamp: now });
            if (data.logo) appSettings.push({ key: 'stock_expert_logo', value: data.logo, timestamp: now });
            if (data.theme) appSettings.push({ key: 'stock_expert_theme', value: data.theme, timestamp: now });
            if (data.themeColor) appSettings.push({ key: 'stock_expert_theme_color', value: data.themeColor, timestamp: now });
          }
          if (appSettings.length > 0) { await db.appSettings.clear(); await db.appSettings.bulkPut(appSettings); }
          if (data.userAccounts) { await db.userAccounts.clear(); await db.userAccounts.bulkPut(data.userAccounts); }
          
          // Restore RH app data with wage preservation
          if (data.rhAppData && data.rhAppData.length > 0) {
            await db.rhAppData.clear();
            if (existingRH) {
              await db.rhAppData.put(existingRH);
            } else {
              await db.rhAppData.bulkPut(data.rhAppData);
            }
          }
        });

        // Do not cache hashes locally, instead upload the restored data directly to Firestore
        try {
          await syncUp();
        } catch (syncErr) {
          console.warn('[Backup] Sync up after restore failed, will retry later:', syncErr);
        }

        resolve({ type: 'full' });
      } catch (err: any) {
        reject(new Error(err.message || 'Restauration échouée.'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
    reader.readAsText(file);
  });
}


export async function importEmployeesFromCSV(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length < 2) throw new Error('Le fichier CSV est vide.');

        // Parse headers
        const headers = lines[0].toLowerCase().split(/[;,]/).map(h => h.trim());
        
        // Find header indexes
        const nomIdx = headers.findIndex(h => h.includes('nom'));
        const prenomIdx = headers.findIndex(h => h.includes('prenom') || h.includes('prénom'));
        const siteIdx = headers.findIndex(h => h.includes('site') || h.includes('lieu'));
        const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('contrat'));
        const salaireIdx = headers.findIndex(h => h.includes('salaire') || h.includes('base') || h.includes('paye'));
        const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('tel') || h.includes('téléphone'));

        if (nomIdx === -1) throw new Error('Le header doit au moins contenir une colonne "Nom".');

        const rhData = await db.rhAppData.get('rh_app_data');
        const employees = rhData?.value?.employees ? [...rhData.value.employees] : [];
        let addedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
          const nom = cols[nomIdx] || '';
          if (!nom) continue;

          const prenom = prenomIdx !== -1 ? cols[prenomIdx] || '' : '';
          
          // Check duplicates
          const exists = employees.some(emp => 
            emp.nom.toLowerCase() === nom.toLowerCase() && 
            emp.prenom.toLowerCase() === prenom.toLowerCase()
          );

          if (!exists) {
            const newEmp = {
              id: Date.now() + i,
              nom,
              prenom,
              site: siteIdx !== -1 ? cols[siteIdx] || 'Principal' : 'Principal',
              type: (typeIdx !== -1 && cols[typeIdx]?.toLowerCase().includes('temp')) ? 'temporaire' : 'permanent' as 'permanent' | 'temporaire',
              salaireBase: salaireIdx !== -1 ? Number(cols[salaireIdx]) || 0 : 0,
              contact: contactIdx !== -1 ? cols[contactIdx] || '' : '',
              statut: 'actif' as 'actif' | 'renvoye',
              dateRenvoi: null,
              dateEmbauche: new Date().toISOString().split('T')[0]
            };
            employees.push(newEmp);
            addedCount++;
          }
        }

        // Save updated employees array back to Dexie rhAppData
        const updatedRH = {
          key: 'rh_app_data',
          value: {
            employees,
            attendance: rhData?.value?.attendance || {},
            payrollExtras: rhData?.value?.payrollExtras || {},
            visibleSundays: rhData?.value?.visibleSundays || []
          }
        };

        await db.rhAppData.put(updatedRH);
        resolve(addedCount);
      } catch (err: any) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}
