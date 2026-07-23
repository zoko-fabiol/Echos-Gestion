// ============================================================
// src/utils/importDocParser.ts
// Module d'analyse et d'importation de documents PDF, Excel et JSON
// pour la restauration automatique des données dans Echo Gestion
// ============================================================

import { read, utils } from 'xlsx';

export interface ParsedBackupData {
  inventory?: any[];
  dailyRecords?: any[];
  expenses?: any[];
  clients?: any[];
  suppliers?: any[];
  quotes?: any[];
  income?: any[];
  productions?: any[];
  rawMaterials?: any[];
  employees?: any[];
  attendance?: Record<string, any>;
  rhAppData?: any[];
}

/** Convertit les dates au format français DD/MM/YYYY + HH:mm vers un ISO String standard */
const parseFrenchDate = (dateStr: any, timeStr?: any): string => {
  if (!dateStr) return new Date().toISOString();

  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parts[0].trim().padStart(2, '0');
      const month = parts[1].trim().padStart(2, '0');
      const year = parts[2].trim();
      const time = timeStr && typeof timeStr === 'string' && timeStr.includes(':') ? timeStr.trim() : '12:00';
      return `${year}-${month}-${day}T${time}:00.000Z`;
    }
  }

  if (typeof dateStr === 'number') {
    // Conversion numéro de série de date Excel vers JS Date
    const parsed = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
    return parsed.toISOString();
  }

  const dateObj = new Date(dateStr);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
};

export const parseUploadedDocument = async (
  file: File
): Promise<{ backupData: ParsedBackupData; summary: Record<string, number> }> => {
  const fileName = file.name.toLowerCase();

  // ------------------------------------------------------------
  // 1. FICHIERS SAUVEGARDE JSON (.json)
  // ------------------------------------------------------------
  if (fileName.endsWith('.json')) {
    const text = await file.text();
    const json = JSON.parse(text);
    const summary: Record<string, number> = {};
    Object.keys(json).forEach(k => {
      if (Array.isArray(json[k])) summary[k] = json[k].length;
    });
    return { backupData: json, summary };
  }

  // ------------------------------------------------------------
  // 2. FICHIERS EXCEL (.xlsx, .xls)
  // ------------------------------------------------------------
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { type: 'array' });
    const backupData: ParsedBackupData = {};
    const summary: Record<string, number> = {};

    workbook.SheetNames.forEach((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawRows || rawRows.length === 0) return;

      // Détection automatique de la ligne contenant les vrais en-têtes de colonnes
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        const rowStr = rawRows[i].map(cell => String(cell || '').toLowerCase()).join(' ');
        if (
          rowStr.includes('date') ||
          rowStr.includes('produit') ||
          rowStr.includes('montant') ||
          rowStr.includes('prénom') ||
          rowStr.includes('prenom') ||
          rowStr.includes('nom') ||
          rowStr.includes('catégorie') ||
          rowStr.includes('categorie') ||
          rowStr.includes('matière') ||
          rowStr.includes('description')
        ) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) headerRowIndex = 0;

      const headers: string[] = rawRows[headerRowIndex].map(cell => String(cell || '').trim());
      const dataRows = rawRows.slice(headerRowIndex + 1);

      // Conversion des lignes 2D en objets avec clés d'en-têtes
      const objectRows = dataRows
        .map(r => {
          const obj: Record<string, any> = {};
          headers.forEach((h, colIdx) => {
            if (h) obj[h] = r[colIdx] !== undefined ? r[colIdx] : '';
          });
          return obj;
        })
        .filter(r => {
          // Ignorer la ligne total et les lignes vides
          const firstVal = String(Object.values(r)[0] || '').toUpperCase();
          return firstVal && !firstVal.startsWith('TOTAL') && !firstVal.startsWith('GÉNÉRÉ');
        });

      if (objectRows.length === 0) return;

      const keysLower = headers.map(h => h.toLowerCase());
      const nameLower = sheetName.toLowerCase();

      // --- DÉPENSES ---
      if (
        nameLower.includes('dépense') ||
        nameLower.includes('depense') ||
        keysLower.some(
          k =>
            k.includes('dépense') ||
            k.includes('montant') ||
            k.includes('description') ||
            k.includes('reste à payer') ||
            k.includes('mode paiement')
        )
      ) {
        const expenses = objectRows
          .map((r, idx) => {
            const dateVal = r['Date'] || r['date'];
            const timeVal = r['Heure'] || r['heure'];
            const categoryVal = r['Catégorie'] || r['Categorie'] || r['catégorie'] || 'Autre';
            const amountVal = r['Montant (FCFA)'] || r['Montant'] || r['montant'] || r['Montant Payé'] || 0;
            const transportVal = r['Transport (FCFA)'] || r['Transport'] || r['frais transport'] || 0;
            const descVal = r['Description'] || r['description'] || r['Reste à Payer'] || categoryVal;

            return {
              id: Date.now() + idx,
              date: parseFrenchDate(dateVal, timeVal),
              description: String(descVal || categoryVal).trim(),
              category: String(categoryVal || 'Autre').trim(),
              amount: Number(String(amountVal).replace(/[^\d]/g, '')),
              paid: true,
              transport: Number(String(transportVal).replace(/[^\d]/g, ''))
            };
          })
          .filter(e => e.amount > 0 || e.description);

        if (expenses.length > 0) {
          backupData.expenses = expenses;
          summary['expenses'] = expenses.length;
        }
      }

      // --- INVENTAIRE / STOCK ---
      else if (
        nameLower.includes('inventaire') ||
        nameLower.includes('stock') ||
        keysLower.some(k => k.includes('produit') && (k.includes('prix') || k.includes('stock')))
      ) {
        const inventory = objectRows
          .map((r, idx) => {
            const nameVal = r['Produit'] || r['nom'] || r['name'] || r['Description'];
            const catVal = r['Catégorie'] || r['category'] || 'Général';
            const stockVal = r['Stock'] || r['stock'] || 0;
            const saleVal = r['Prix Vente (FCFA)'] || r['Prix Vente'] || r['salePrice'] || r['prix'] || 0;
            const saleUnitVal = r['Unité Vente'] || r['Unité V.'] || r['saleUnit'] || 'unité';
            const purchaseVal = r['Prix Achat (FCFA)'] || r['Prix Achat'] || r['purchasePrice'] || 0;
            const purchaseUnitVal = r['Unité Achat'] || r['Unité A.'] || r['purchaseUnit'] || 'unité';

            return {
              id: Date.now() + idx,
              name: String(nameVal || '').trim(),
              category: String(catVal || 'Général').trim(),
              type: 'finished',
              stock: Number(stockVal || 0),
              salePrice: Number(String(saleVal).replace(/[^\d]/g, '')),
              saleUnit: String(saleUnitVal || 'unité').trim(),
              purchasePrice: Number(String(purchaseVal).replace(/[^\d]/g, '')),
              purchaseUnit: String(purchaseUnitVal || 'unité').trim()
            };
          })
          .filter(p => p.name);

        if (inventory.length > 0) {
          backupData.inventory = inventory;
          summary['inventory'] = inventory.length;
        }
      }

      // --- EMPLOYEES / PERSONNEL ---
      else if (
        nameLower.includes('personnel') ||
        nameLower.includes('employ') ||
        keysLower.some(k => k.includes('prénom') || k.includes('prenom') || k.includes('salaire'))
      ) {
        const employees = objectRows
          .map((r, idx) => {
            const prenomVal = r['Prénom'] || r['prenom'] || r['Prenom'] || '';
            const nomVal = r['Nom'] || r['nom'] || '';
            const siteVal = r["Site d'affectation"] || r['Site'] || r['site'] || 'Chantier A';
            const typeVal = r['Type contrat'] || r['Type'] || r['type'] || 'permanent';
            const salaireVal = r['Salaire de base (FCFA)'] || r['Salaire Base'] || r['salaire'] || 0;
            const contactVal = r['Contact'] || r['contact'] || '';

            return {
              id: Number(r['N°'] || r['ID'] || idx + 1),
              prenom: String(prenomVal).trim(),
              nom: String(nomVal).trim(),
              site: String(siteVal).trim(),
              type: String(typeVal).toLowerCase().includes('temp') ? 'temporaire' : 'permanent',
              salaireBase: Number(String(salaireVal).replace(/[^\d]/g, '')),
              contact: String(contactVal).trim()
            };
          })
          .filter(e => e.prenom || e.nom);

        if (employees.length > 0) {
          backupData.employees = employees;
          summary['employees'] = employees.length;
        }
      }

      // --- VENTES / HISTORIQUE ---
      else if (
        nameLower.includes('vente') ||
        nameLower.includes('historique') ||
        keysLower.some(k => k.includes('vente') || k.includes('total'))
      ) {
        const dailyRecords = objectRows
          .map((r, idx) => {
            const dateVal = r['Date'] || r['date'];
            const timeVal = r['Heure'] || r['heure'];
            const totalVal = r['Total (FCFA)'] || r['Total'] || r['total'] || 0;
            const marginVal = r['Marge (FCFA)'] || r['marge'] || 0;
            const clientVal = r['Client'] || r['clientName'] || 'Client';

            return {
              id: Number(r['ID Vente'] || r['id'] || Date.now() + idx),
              type: 'sale',
              date: parseFrenchDate(dateVal, timeVal),
              total: Number(String(totalVal).replace(/[^\d]/g, '')),
              margin: Number(String(marginVal).replace(/[^\d]/g, '')),
              clientName: String(clientVal || 'Client').trim(),
              items: []
            };
          })
          .filter(s => s.total > 0);

        if (dailyRecords.length > 0) {
          backupData.dailyRecords = dailyRecords;
          summary['dailyRecords'] = dailyRecords.length;
        }
      }

      // --- PRODUCTION ---
      else if (
        nameLower.includes('production') ||
        keysLower.some(k => k.includes('produit fini') || k.includes('matière'))
      ) {
        const productions = objectRows
          .map((r, idx) => {
            const dateVal = r['Date'] || r['date'];
            const timeVal = r['Heure'] || r['heure'];
            const prodVal = r['Produit Fini'] || r['Produit'] || r['productName'] || '';
            const qtyVal = r['Quantité Produite'] || r['Produit Final'] || r['quantity'] || 0;
            const rawVal = r['Matière Première'] || r['Matière (kg)'] || r['rawMaterialName'] || '';
            const rawQtyVal = r['Quantité Matière'] || r['rawQuantity'] || 0;

            return {
              id: Number(r['ID Production'] || r['id'] || Date.now() + idx),
              date: parseFrenchDate(dateVal, timeVal),
              productName: String(prodVal).trim(),
              quantity: Number(qtyVal || 0),
              rawMaterialName: String(rawVal).trim(),
              rawQuantity: Number(rawQtyVal || 0)
            };
          })
          .filter(p => p.productName);

        if (productions.length > 0) {
          backupData.productions = productions;
          summary['productions'] = productions.length;
        }
      }

      // --- MATIÈRES PREMIÈRES ---
      else if (nameLower.includes('matière') || nameLower.includes('matiere')) {
        const rawMaterials = objectRows
          .map((r, idx) => {
            const dateVal = r['Date'] || r['date'];
            const nameVal = r['Matière Première'] || r['name'] || '';
            const arrVal = r['Stock Arrivé (sacs)'] || r['arrivedQty'] || 0;
            const outVal = r['Stock Sorti (sacs)'] || r['outQty'] || 0;
            const netVal = r['Stock Net (sacs)'] || r['netStock'] || 0;

            return {
              id: Number(r['ID'] || r['id'] || Date.now() + idx),
              date: parseFrenchDate(dateVal),
              name: String(nameVal).trim(),
              arrivedQty: Number(arrVal || 0),
              outQty: Number(outVal || 0),
              netStock: Number(netVal || 0)
            };
          })
          .filter(m => m.name);

        if (rawMaterials.length > 0) {
          backupData.rawMaterials = rawMaterials;
          summary['rawMaterials'] = rawMaterials.length;
        }
      }
    });

    return { backupData, summary };
  }

  // ------------------------------------------------------------
  // 3. FICHIERS PDF (.pdf)
  // ------------------------------------------------------------
  if (fileName.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Extraction des chaînes de texte de la structure binaire PDF
    const decoder = new TextDecoder('latin1');
    const content = decoder.decode(bytes);
    const matches = content.match(/\(([^()]+)\)/g);

    let rawText = '';
    if (matches) {
      rawText = matches.map(m => m.slice(1, -1)).join(' ');
    }

    const backupData: ParsedBackupData = {};
    const summary: Record<string, number> = {};
    const textUpper = rawText.toUpperCase();

    // DÉPENSES PDF
    if (textUpper.includes('DÉPENSE') || textUpper.includes('DEPENSES')) {
      const expenses: any[] = [];
      const expRegex = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+([A-Za-z0-9À-ÿ\s\-'"]+?)\s+([\d\s]+)\s*FCFA/g;
      let match;
      let idx = 1;

      while ((match = expRegex.exec(rawText)) !== null) {
        const dateStr = match[1];
        const description = match[2].trim();
        const amount = parseInt(match[3].replace(/\s/g, ''), 10);

        if (description && !isNaN(amount) && amount > 0) {
          expenses.push({
            id: Date.now() + idx++,
            date: parseFrenchDate(dateStr),
            description,
            category: 'Autre',
            amount,
            paid: true,
            transport: 0
          });
        }
      }

      if (expenses.length > 0) {
        backupData.expenses = expenses;
        summary['expenses'] = expenses.length;
      }
    }

    // INVENTAIRE PDF
    if (textUpper.includes('INVENTAIRE') || textUpper.includes('PRIX VENTE')) {
      const inventory: any[] = [];
      const prodRegex = /([A-Za-z0-9À-ÿ\s\-'"]+?)\s+(\d+)\s+([\d\s]+)\s+([a-zA-Z]+)\s+([\d\s]+)\s+([a-zA-Z]+)/g;
      let match;
      let idx = 1;

      while ((match = prodRegex.exec(rawText)) !== null) {
        const name = match[1].trim();
        const stock = parseInt(match[2], 10);
        const salePrice = parseInt(match[3].replace(/\s/g, ''), 10);
        const saleUnit = match[4].trim();
        const purchasePrice = parseInt(match[5].replace(/\s/g, ''), 10);
        const purchaseUnit = match[6].trim();

        if (name && !name.toUpperCase().includes('PRODUIT') && !isNaN(salePrice)) {
          inventory.push({
            id: Date.now() + idx++,
            name,
            category: 'Général',
            type: 'finished',
            stock: isNaN(stock) ? 0 : stock,
            salePrice,
            saleUnit,
            purchasePrice: isNaN(purchasePrice) ? 0 : purchasePrice,
            purchaseUnit
          });
        }
      }

      if (inventory.length > 0) {
        backupData.inventory = inventory;
        summary['inventory'] = inventory.length;
      }
    }

    return { backupData, summary };
  }

  return { backupData: {}, summary: {} };
};
