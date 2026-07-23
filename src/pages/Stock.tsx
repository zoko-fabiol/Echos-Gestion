import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Package, Search, Filter, Plus, Edit2, Trash2, 
  Save, X, DollarSign, ListOrdered, AlertTriangle, 
  Upload
} from 'lucide-react';
import { CATEGORIES_PRODUITS } from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { read, utils } from 'xlsx';
import { syncUp } from '../services/syncEngine';
import { useExports } from '../hooks/useExports';
import { ExportButton } from '../components/ExportButton';
import { Modal } from '../components/ui/Modal';
import { logAction } from '../services/logService';
// --- INVENTORY STOCK PAGE ---


export const Stock: React.FC = () => {
  const { hasAccess } = useAuth();
  
  const products = useLiveQuery(() => db.inventory.toArray()) || [];

  // Extract unique categories from actual database products & fallback to defaults
  const dbCategories = useMemo(() => {
    const unique = new Set<string>();
    products.forEach(p => {
      if (p.category) unique.add(p.category);
    });
    // Add default hardcoded ones to ensure they always exist as base suggestions
    CATEGORIES_PRODUITS.forEach(cat => unique.add(cat));
    return Array.from(unique);
  }, [products]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'finished' | 'raw' | 'alert' | 'finished_in_stock' | 'raw_in_stock'>('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<'finished' | 'raw'>('finished');
  const [formStock, setFormStock] = useState<number>(0);
  const [formPurchasePrice, setFormPurchasePrice] = useState<number>(0);
  const [formPurchaseUnit, setFormPurchaseUnit] = useState('Kg');
  const [formSalePrice, setFormSalePrice] = useState<number>(0);
  const [formSaleUnit, setFormSaleUnit] = useState('Unit');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- KPI VALUES ---

  const kpi = useMemo(() => {
    return products.reduce((acc, curr) => {
      const stock = Number(curr.stock || 0);
      const isRaw = curr.type === 'raw';
      
      return {
        totalItems: acc.totalItems + 1,
        rawItems: acc.rawItems + (isRaw ? 1 : 0),
        finishedItems: acc.finishedItems + (isRaw ? 0 : 1),
        alertsCount: acc.alertsCount + (stock <= 5 ? 1 : 0),
        estimatedValue: acc.estimatedValue + (stock * (isRaw ? curr.purchasePrice : curr.salePrice))
      };
    }, { totalItems: 0, rawItems: 0, finishedItems: 0, alertsCount: 0, estimatedValue: 0 });
  }, [products]);

  // --- FILTERED PRODUCTS ---

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
      
      let matchesType = false;
      const stock = Number(p.stock || 0);
      if (typeFilter === 'all') {
        matchesType = true;
      } else if (typeFilter === 'alert') {
        matchesType = stock <= 5;
      } else if (typeFilter === 'finished_in_stock') {
        matchesType = p.type === 'finished' && stock > 0;
      } else if (typeFilter === 'raw_in_stock') {
        matchesType = p.type === 'raw' && stock > 0;
      } else {
        matchesType = p.type === typeFilter;
      }

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [products, searchTerm, categoryFilter, typeFilter]);

  // --- CRUD ACTIONS ---

  const openAddModal = () => {
    if (!hasAccess('stock', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setModalMode('create');
    setSelectedProduct(null);
    setFormName('');
    setFormCategory(CATEGORIES_PRODUITS[0] || 'Boissons');
    setFormType('finished');
    setFormStock(0);
    setFormPurchasePrice(0);
    setFormPurchaseUnit('Kg');
    setFormSalePrice(0);
    setFormSaleUnit('Bouteille');
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    if (!hasAccess('stock', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setModalMode('edit');
    setSelectedProduct(p);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormType(p.type || 'finished');
    setFormStock(p.stock);
    setFormPurchasePrice(p.purchasePrice || 0);
    setFormPurchaseUnit(p.purchaseUnit || 'Kg');
    setFormSalePrice(p.salePrice || 0);
    setFormSaleUnit(p.saleUnit || 'Unit');
    setShowModal(true);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCategory) {
      showToast('Veuillez remplir les champs obligatoires.', 'warning');
      return;
    }

    const payload: Product = {
      id: modalMode === 'edit' && selectedProduct ? selectedProduct.id : Date.now(),
      name: formName.trim(),
      category: formCategory,
      type: formType,
      stock: Number(formStock),
      purchasePrice: Number(formPurchasePrice),
      purchaseUnit: formPurchaseUnit,
      salePrice: Number(formSalePrice),
      saleUnit: formSaleUnit
    };

    if (modalMode === 'edit') {
      await db.inventory.put(payload);
      await logAction('update', 'stock', `Produit '${payload.name}' mis à jour (Stock: ${payload.stock}, Prix: ${payload.salePrice} F)`, payload.id);
      showToast('Produit mis à jour dans l\'inventaire.', 'success');
    } else {
      // Check duplicate
      const dup = products.some(p => p.name.toUpperCase() === payload.name.toUpperCase());
      if (dup) {
        showToast('Ce produit existe déjà.', 'warning');
        return;
      }
      await db.inventory.add(payload);
      await logAction('create', 'stock', `Nouveau produit '${payload.name}' créé (Stock: ${payload.stock}, Prix: ${payload.salePrice} F)`, payload.id);
      showToast('Nouveau produit inséré.', 'success');
    }

    setShowModal(false);
    syncUp().catch(err => console.warn('POS background sync failed', err));
  };

  const deleteProduct = async (id: number) => {
    if (!hasAccess('stock', 'delete')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    if (confirm('Voulez-vous supprimer ce produit de l\'inventaire ?')) {
      const prod = products.find(p => p.id === id);
      await db.inventory.delete(id);
      await logAction('delete', 'stock', `Produit '${prod?.name || id}' supprimé du stock`, id);
      showToast('Produit supprimé.', 'success');
      syncUp().catch(err => console.warn('POS background sync failed', err));
    }
  };

  const adjustStockInline = async (p: Product, delta: number) => {
    if (!hasAccess('stock', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    const newStock = Math.max(0, p.stock + delta);
    await db.inventory.update(p.id, { stock: newStock });
    await logAction('update', 'stock', `Stock ajusté de ${delta > 0 ? '+' : ''}${delta} pour '${p.name}' (Nouveau stock: ${newStock})`, p.id);
    showToast(`Stock ajusté pour ${p.name} : ${newStock}`, 'success');
    syncUp().catch(err => console.warn('POS background sync failed', err));
  };

  const { exportInventoryPDF, exportInventoryXLSX } = useExports();

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasAccess('stock', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Headers: Nom, Catégorie, Type, Stock, Prix Achat, Prix Vente, Unité Achat, Unité Vente
        const rows = utils.sheet_to_json(sheet, { header: 1 }) as any[];
        if (rows.length <= 1) {
          showToast('Fichier vide ou invalide.', 'warning');
          return;
        }

        const headers = rows[0].map((h: string) => String(h).trim().toUpperCase());
        const nomIdx = headers.indexOf('NOM');
        const catIdx = headers.indexOf('CATEGORIE') !== -1 ? headers.indexOf('CATEGORIE') : headers.indexOf('CATÉGORIE');
        const typeIdx = headers.indexOf('TYPE');
        const stockIdx = headers.indexOf('STOCK');
        const purchaseIdx = headers.indexOf('PRIX ACHAT');
        const saleIdx = headers.indexOf('PRIX VENTE');
        const purchaseUnitIdx = headers.indexOf('UNITE ACHAT') !== -1 ? headers.indexOf('UNITE ACHAT') : headers.indexOf('UNITÉ ACHAT');
        const saleUnitIdx = headers.indexOf('UNITE VENTE') !== -1 ? headers.indexOf('UNITE VENTE') : headers.indexOf('UNITÉ VENTE');

        if (nomIdx === -1 || catIdx === -1) {
          showToast('Colonnes "Nom" et "Categorie" obligatoires.', 'error');
          return;
        }

        let addedCount = 0;
        const now = Date.now();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const name = String(row[nomIdx] || '').trim();
          const category = String(row[catIdx] || '').trim();
          if (!name || !category) continue;

          const rawType = String(row[typeIdx] || '').trim().toLowerCase();
          const type: 'finished' | 'raw' = rawType.includes('mati') || rawType.includes('raw') ? 'raw' : 'finished';
          const stock = stockIdx !== -1 ? Number(row[stockIdx] || 0) : 0;
          const purchasePrice = purchaseIdx !== -1 ? Number(row[purchaseIdx] || 0) : 0;
          const salePrice = saleIdx !== -1 ? Number(row[saleIdx] || 0) : 0;
          const purchaseUnit = purchaseUnitIdx !== -1 ? String(row[purchaseUnitIdx] || 'Kg') : 'Kg';
          const saleUnit = saleUnitIdx !== -1 ? String(row[saleUnitIdx] || 'Unit') : 'Unit';

          // Put product in Dexie directly
          const exists = products.find(p => p.name.toUpperCase() === name.toUpperCase());
          
          await db.inventory.put({
            id: exists ? exists.id : now + i,
            name,
            category,
            type,
            stock,
            purchasePrice,
            purchaseUnit,
            salePrice,
            saleUnit
          });

          addedCount++;
        }

        if (addedCount > 0) {
          await logAction('create', 'stock', `Importation Excel : ${addedCount} produit(s) importé(s)/mis à jour`);
          showToast(`${addedCount} produits importés/mis à jour.`, 'success');
          syncUp().catch(err => console.warn('POS background sync failed', err));
        }
      } catch (err) {
        showToast('Erreur lors du traitement Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Search & Site action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input pl-10 py-2 text-sm bg-white border-slate-200 shadow-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm focus:outline-none text-slate-700 dark:text-slate-200 max-w-[160px] truncate"
            >
              <option value="">Catégories</option>
              {dbCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold shadow-sm focus:outline-none text-slate-700 dark:text-slate-200 max-w-[170px] truncate"
            >
              <option value="all">Tous les produits</option>
              <option value="finished">Produits Finis (Tous)</option>
              <option value="finished_in_stock">PF en Stock</option>
              <option value="raw">Matières Prem. (Toutes)</option>
              <option value="raw_in_stock">MP en Stock</option>
              <option value="alert">Stocks Bas (Alertes)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {hasAccess('stock', 'add') && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2 cursor-pointer"
                title="Importer depuis Excel"
              >
                <Upload className="w-4 h-4 text-brand" />
                <span className="leading-tight">Importer</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleImport}
                className="hidden"
              />
            </>
          )}

          <ExportButton 
            onPDF={() => exportInventoryPDF(typeFilter)} 
            onXLSX={() => exportInventoryXLSX(typeFilter)} 
          />

          {hasAccess('stock', 'add') && (
            <button 
              onClick={openAddModal} 
              className="px-4 py-3 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-900 transition-all flex items-center gap-2 cursor-pointer h-full"
            >
              <Plus className="w-4 h-4" />
              <span>Ajouter</span>
            </button>
          )}
        </div>

      </div>

      {/* KPI values list panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Nombre d'Articles</span>
          <span className="text-lg font-bold text-slate-700 dark:text-slate-200 font-mono">{kpi.totalItems}</span>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Produits Finis / MP</span>
          <span className="text-lg font-bold text-slate-700 dark:text-slate-200 font-mono">{kpi.finishedItems} / {kpi.rawItems}</span>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl">
          <span className="text-4xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Alertes Stock Bas</span>
          <span className={`text-lg font-bold font-mono ${kpi.alertsCount > 0 ? 'text-amber-500 font-extrabold' : 'text-slate-400'}`}>
            {kpi.alertsCount}
          </span>
        </div>
        <div className="p-4 bg-brand/5 dark:bg-brand/10 border border-brand/20 rounded-2xl">
          <span className="text-4xs font-bold text-brand uppercase tracking-widest block mb-1">Valeur Estimée Stock</span>
          <span className="text-lg font-extrabold text-brand font-mono">{kpi.estimatedValue.toLocaleString()} F</span>
        </div>
      </div>

      {/* Inventory table / cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        
        {/* DESKTOP VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <th className="table-header">Nom Produit</th>
                <th className="table-header text-center">Catégorie</th>
                <th className="table-header text-center">Type</th>
                <th className="table-header text-center">Stock</th>
                <th className="table-header text-right">Prix Achat</th>
                <th className="table-header text-right">Prix Vente</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm italic text-slate-400">
                    Aucun produit dans le stock.
                  </td>
                </tr>
              ) : (
                filteredProducts.sort((a,b) => a.name.localeCompare(b.name)).map(p => {
                  const isRaw = p.type === 'raw';
                  const isLow = p.stock <= 5;

                  return (
                    <tr key={p.id} className="table-row">
                      <td className="table-cell font-semibold text-slate-800 dark:text-slate-100">{p.name}</td>
                      <td className="table-cell text-center">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full font-semibold text-xs text-slate-600 dark:text-slate-300">
                          {p.category}
                        </span>
                      </td>
                      <td className="table-cell text-center text-xs font-semibold">
                        {isRaw ? 'Matière Première' : 'Produit Fini'}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          {hasAccess('stock', 'edit') && (
                            <button
                              onClick={() => adjustStockInline(p, -1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-xs"
                            >
                              -
                            </button>
                          )}
                          
                          <span className={`font-bold font-mono px-2 py-0.5 rounded ${
                            p.stock <= 0 
                              ? 'bg-red-500/10 text-red-600' 
                              : isLow 
                                ? 'bg-amber-500/10 text-amber-600' 
                                : 'text-slate-800 dark:text-white'
                          }`}>
                            {p.stock} {isRaw ? p.purchaseUnit : p.saleUnit}
                          </span>

                          {hasAccess('stock', 'edit') && (
                            <button
                              onClick={() => adjustStockInline(p, 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-xs"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="table-cell text-right font-mono font-medium">
                        {p.purchasePrice.toLocaleString()} F / {p.purchaseUnit}
                      </td>
                      <td className="table-cell text-right font-mono font-bold text-brand">
                        {!isRaw ? `${p.salePrice.toLocaleString()} F / ${p.saleUnit}` : '-'}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand transition-colors cursor-pointer"
                            title="Modifier le produit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteProduct(p.id); }}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
                            title="Supprimer le produit"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE VIEW */}
        <div className="md:hidden grid grid-cols-1 gap-4 p-4">
          {filteredProducts.length === 0 ? (
            <p className="text-center text-sm italic text-slate-400 py-6">Aucun produit trouvé.</p>
          ) : (
            filteredProducts.map(p => {
              const isRaw = p.type === 'raw';
              const isLow = p.stock <= 5;
              return (
                <div 
                  key={p.id}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative"
                >
                  <span className={`absolute top-4 right-4 text-3xs font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    isRaw ? 'bg-blue-500/10 text-blue-600' : 'bg-brand/10 text-brand'
                  }`}>
                    {isRaw ? 'MP' : 'Fini'}
                  </span>

                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white">{p.name}</h4>
                    <p className="text-4xs text-slate-400 capitalize mt-0.5">{p.category}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-3xs font-semibold block uppercase">Prix Vente:</span>
                      <span className="font-mono font-bold text-brand">{!isRaw ? `${p.salePrice.toLocaleString()} F` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-3xs font-semibold block uppercase">Prix Achat:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{p.purchasePrice.toLocaleString()} F</span>
                    </div>
                  </div>

                  {/* Inline Stock Adjust Panel */}
                  <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40 mt-1">
                    <span className="text-2xs font-extrabold uppercase text-slate-500">Stock Actuel:</span>
                    <div className="flex items-center gap-2">
                      {hasAccess('stock', 'edit') && (
                        <button
                          onClick={() => adjustStockInline(p, -1)}
                          className="w-7 h-7 bg-white hover:bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm"
                        >
                          -
                        </button>
                      )}
                      
                      <span className={`font-bold font-mono px-2 ${
                        p.stock <= 0 ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'
                      }`}>
                        {p.stock} {isRaw ? p.purchaseUnit : p.saleUnit}
                      </span>

                      {hasAccess('stock', 'edit') && (
                        <button
                          onClick={() => adjustStockInline(p, 1)}
                          className="w-7 h-7 bg-white hover:bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      onClick={() => openEditModal(p)}
                      className="flex items-center gap-1 text-xs font-semibold text-brand"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Modifier
                    </button>
                    <button
                      onClick={() => deleteProduct(p.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* CRUD MODAL FOR PRODUCT */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === 'create' ? 'Ajouter un Produit' : 'Modifier le Produit'}
        size="lg"
      >
            {/* Form */}
            <form onSubmit={saveProduct} className="p-6 flex flex-col gap-4">
              <input type="hidden" id="prodId" value={selectedProduct?.id || ''} />

              <div>
                <label htmlFor="prodName" className="form-label">Désignation <span className="text-red-500">*</span></label>
                <input
                  id="prodName"
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="form-input"
                  placeholder="ex. Bière Castel 65cl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prodCategory" className="form-label">Catégorie</label>
                  <input
                    id="prodCategory"
                    type="text"
                    list="categories"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="form-input"
                    placeholder="Alimentaire, Boissons, Entretien..."
                  />
                  <datalist id="categories">
                    {dbCategories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="prodType" className="form-label">Type de Produit</label>
                  <select
                    id="prodType"
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="form-input font-semibold"
                  >
                    <option value="finished">Produit Fini (Vente)</option>
                    <option value="raw">Matière Première (Achat/Stock)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="prodStock" className="form-label">Stock Initial <span className="text-red-500">*</span></label>
                  <input
                    id="prodStock"
                    type="number"
                    required
                    value={formStock}
                    onChange={e => setFormStock(Number(e.target.value))}
                    className="form-input font-mono font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor="prodPurchasePrice" className="form-label">Prix Achat</label>
                  <input
                    id="prodPurchasePrice"
                    type="number"
                    value={formPurchasePrice}
                    onChange={e => setFormPurchasePrice(Number(e.target.value))}
                    className="form-input font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="prodPurchaseUnit" className="form-label">Unité Achat</label>
                  <input
                    id="prodPurchaseUnit"
                    type="text"
                    value={formPurchaseUnit}
                    onChange={e => setFormPurchaseUnit(e.target.value)}
                    className="form-input"
                    placeholder="ex. kg, sac, pce"
                  />
                </div>
              </div>

              {formType === 'finished' && (
                <div id="saleSection" className="grid grid-cols-2 gap-4 animate-fade-scale">
                  <div>
                    <label htmlFor="prodSalePrice" className="form-label text-brand font-bold">Prix Vente</label>
                    <input
                      id="prodSalePrice"
                      type="number"
                      value={formSalePrice}
                      onChange={e => setFormSalePrice(Number(e.target.value))}
                      className="form-input font-mono font-semibold border-brand/35 focus:ring-brand/45"
                    />
                  </div>
                  <div>
                    <label htmlFor="prodSaleUnit" className="form-label">Unité Vente <span className="text-red-500">*</span></label>
                    <input
                      id="prodSaleUnit"
                      type="text"
                      required
                      value={formSaleUnit}
                      onChange={e => setFormSaleUnit(e.target.value)}
                      className="form-input"
                      placeholder="ex. pce, kg"
                    />
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  <Save className="w-4.5 h-4.5" />
                  {modalMode === 'create' ? 'Ajouter Produit' : 'Sauvegarder'}
                </button>
              </div>

            </form>
      </Modal>

    </div>
  );
};
