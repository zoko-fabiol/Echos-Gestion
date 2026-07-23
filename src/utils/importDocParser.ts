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
      const rows: any[] = utils.sheet_to_json(sheet, { defval: '' });
      if (!rows || rows.length === 0) return;

      const firstRow = rows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase());
      const nameLower = sheetName.toLowerCase();

      // EMPLOYEES / PERSONNEL RH
      if (
        nameLower.includes('personnel') ||
        nameLower.includes('employ') ||
        keys.some(k => k.includes('prénom') || k.includes('prenom') || k.includes('salaire'))
      ) {
        const employees = rows
          .map((r: any, idx: number) => ({
            id: Number(r['N°'] || r['id'] || idx + 1),
            prenom: String(r['Prénom'] || r['prenom'] || r['Prenom'] || '').trim(),
            nom: String(r['Nom'] || r['nom'] || '').trim(),
            site: String(r["Site d'affectation"] || r['site'] || 'Chantier A').trim(),
            type: String(r['Type contrat'] || r['type'] || 'permanent')
              .toLowerCase()
              .includes('temp')
              ? 'temporaire'
              : 'permanent',
            salaireBase: Number(
              String(r['Salaire de base (FCFA)'] || r['salaireBase'] || r['salaire'] || 0).replace(/[^\d]/g, '')
            ),
            contact: String(r['Contact'] || r['contact'] || '').trim()
          }))
          .filter(e => e.prenom || e.nom);

        if (employees.length > 0) {
          backupData.employees = employees;
          summary['employees'] = employees.length;
        }
      }

      // INVENTAIRE / STOCK
      else if (
        nameLower.includes('inventaire') ||
        nameLower.includes('stock') ||
        keys.some(k => k.includes('produit') && (k.includes('prix') || k.includes('stock')))
      ) {
        const inventory = rows
          .map((r: any, idx: number) => ({
            id: Number(r['ID'] || r['id'] || Date.now() + idx),
            name: String(r['Produit'] || r['nom'] || r['name'] || '').trim(),
            category: String(r['Catégorie'] || r['category'] || 'Général').trim(),
            type: 'finished',
            stock: Number(r['Stock'] || r['stock'] || 0),
            salePrice: Number(
              String(r['Prix Vente (FCFA)'] || r['salePrice'] || r['prix'] || 0).replace(/[^\d]/g, '')
            ),
            saleUnit: String(r['Unité Vente'] || r['saleUnit'] || 'unité').trim(),
            purchasePrice: Number(
              String(r['Prix Achat (FCFA)'] || r['purchasePrice'] || 0).replace(/[^\d]/g, '')
            ),
            purchaseUnit: String(r['Unité Achat'] || r['purchaseUnit'] || 'unité').trim()
          }))
          .filter(p => p.name);

        if (inventory.length > 0) {
          backupData.inventory = inventory;
          summary['inventory'] = inventory.length;
        }
      }

      // DÉPENSES
      else if (
        nameLower.includes('dépense') ||
        nameLower.includes('depense') ||
        keys.some(k => k.includes('dépense') || k.includes('montant'))
      ) {
        const expenses = rows
          .map((r: any, idx: number) => ({
            id: Number(r['ID Dépense'] || r['id'] || Date.now() + idx),
            date: String(r['Date'] || new Date().toISOString()),
            description: String(r['Description'] || r['description'] || 'Dépense').trim(),
            category: String(r['Catégorie'] || r['category'] || 'Autre').trim(),
            amount: Number(
              String(r['Montant (FCFA)'] || r['montant'] || r['amount'] || 0).replace(/[^\d]/g, '')
            ),
            paid: true,
            transport: Number(
              String(r['Frais Transport'] || r['transport'] || 0).replace(/[^\d]/g, '')
            )
          }))
          .filter(e => e.amount > 0 || e.description);

        if (expenses.length > 0) {
          backupData.expenses = expenses;
          summary['expenses'] = expenses.length;
        }
      }

      // VENTES / HISTORIQUE
      else if (
        nameLower.includes('vente') ||
        nameLower.includes('historique') ||
        keys.some(k => k.includes('vente') || k.includes('total'))
      ) {
        const dailyRecords = rows
          .map((r: any, idx: number) => ({
            id: Number(r['ID Vente'] || r['id'] || Date.now() + idx),
            type: 'sale',
            date: String(r['Date'] || new Date().toISOString()),
            total: Number(
              String(r['Total (FCFA)'] || r['total'] || 0).replace(/[^\d]/g, '')
            ),
            margin: Number(
              String(r['Marge (FCFA)'] || r['marge'] || 0).replace(/[^\d]/g, '')
            ),
            clientName: String(r['Client'] || r['clientName'] || 'Client').trim(),
            items: []
          }))
          .filter(s => s.total > 0);

        if (dailyRecords.length > 0) {
          backupData.dailyRecords = dailyRecords;
          summary['dailyRecords'] = dailyRecords.length;
        }
      }

      // PRODUCTION
      else if (nameLower.includes('production') || keys.some(k => k.includes('produit fini') || k.includes('matière'))) {
        const productions = rows
          .map((r: any, idx: number) => ({
            id: Number(r['ID Production'] || r['id'] || Date.now() + idx),
            date: String(r['Date'] || new Date().toISOString()),
            productName: String(r['Produit Fini'] || r['productName'] || '').trim(),
            quantity: Number(r['Quantité Produite'] || r['quantity'] || 0),
            rawMaterialName: String(r['Matière Première'] || r['rawMaterialName'] || '').trim(),
            rawQuantity: Number(r['Quantité Matière'] || r['rawQuantity'] || 0)
          }))
          .filter(p => p.productName);

        if (productions.length > 0) {
          backupData.productions = productions;
          summary['productions'] = productions.length;
        }
      }

      // MATIÈRES PREMIÈRES
      else if (nameLower.includes('matière') || nameLower.includes('matiere')) {
        const rawMaterials = rows
          .map((r: any, idx: number) => ({
            id: Number(r['ID'] || r['id'] || Date.now() + idx),
            date: String(r['Date'] || new Date().toISOString()),
            name: String(r['Matière Première'] || r['name'] || '').trim(),
            arrivedQty: Number(r['Stock Arrivé (sacs)'] || r['arrivedQty'] || 0),
            outQty: Number(r['Stock Sorti (sacs)'] || r['outQty'] || 0),
            netStock: Number(r['Stock Net (sacs)'] || r['netStock'] || 0)
          }))
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

    // INVENTAIRE PDF
    if (textUpper.includes('INVENTAIRE') || textUpper.includes('PRIX VENTE') || textUpper.includes('VALEUR')) {
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
            date: dateStr,
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

    // PERSONNEL PDF
    if (textUpper.includes('PERSONNEL') || textUpper.includes('EMPLOYÉ') || textUpper.includes('EFFECTIFS')) {
      const employees: any[] = [];
      const empRegex = /(\d+)\s+([A-Za-zÀ-ÿ]+)\s+([A-Za-zÀ-ÿ\s]+)\s+([A-Za-z0-9\s]+?)\s+(Permanent|Temporaire)\s+([\d\s]+)/g;
      let match;

      while ((match = empRegex.exec(rawText)) !== null) {
        const id = parseInt(match[1], 10);
        const prenom = match[2].trim();
        const nom = match[3].trim();
        const site = match[4].trim();
        const type = match[5].toLowerCase() === 'temporaire' ? 'temporaire' : 'permanent';
        const salaireBase = parseInt(match[6].replace(/\s/g, ''), 10);

        if (prenom && nom && !isNaN(salaireBase)) {
          employees.push({
            id,
            prenom,
            nom,
            site,
            type,
            salaireBase,
            contact: ''
          });
        }
      }

      if (employees.length > 0) {
        backupData.employees = employees;
        summary['employees'] = employees.length;
      }
    }

    return { backupData, summary };
  }

  return { backupData: {}, summary: {} };
};
