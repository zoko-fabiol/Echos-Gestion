import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Production, RawMaterial } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  Factory, Search, Filter, Plus, Edit2, Trash2, 
  Save, Calendar, FileSpreadsheet, FileText, 
  History, ArrowRight, ClipboardList 
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { syncUp } from '../services/syncEngine';
import { MONTHS } from '../config/constants';
import { Modal } from '../components/ui/Modal';


export const ProductionPage: React.FC = () => {
  const { hasAccess } = useAuth();

  // Dexie Tables
  const productions = useLiveQuery(() => db.productions.toArray()) || [];
  const rawMaterials = useLiveQuery(() => db.rawMaterials.toArray()) || [];
  const products = useLiveQuery(() => db.inventory.toArray()) || [];

  // Active view: 'production' (Production sessions) or 'raw' (Raw material logs)
  const [activeTab, setActiveTab] = useState<'production' | 'raw'>('raw');

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(-1); // -1 = All year

  // Modals
  const [showProdModal, setShowProdModal] = useState(false);
  const [showRawModal, setShowRawModal] = useState(false);


  const [prodMode, setProdMode] = useState<'create' | 'edit'>('create');

  const [rawMode, setRawMode] = useState<'create' | 'edit'>('create');

  const [selectedProd, setSelectedProd] = useState<Production | null>(null);
  const [selectedRaw, setSelectedRaw] = useState<RawMaterial | null>(null);

  // Form Fields - Production
  const [prodDate, setProdDate] = useState(new Date().toISOString().split('T')[0]);
  const [prodProductName, setProdProductName] = useState('');
  const [prodRawQty, setProdRawQty] = useState<number>(0);
  const [prodFinalQty, setProdFinalQty] = useState<number>(0);
  const [prodWeight, setProdWeight] = useState<number>(0);
  const [prodDesc, setProdDesc] = useState('');

  // Form Fields - Raw Material Log
  const [rawDate, setRawDate] = useState(new Date().toISOString().split('T')[0]);
  const [rawProductName, setRawProductName] = useState('');
  const [rawArrivedQty, setRawArrivedQty] = useState<number>(0);
  const [rawOutQty, setRawOutQty] = useState<number>(0);
  const [rawRawQty, setRawRawQty] = useState<number>(0);
  const [rawFinalQty, setRawFinalQty] = useState<number>(0);
  const [rawWeight, setRawWeight] = useState<number>(0);
  const [rawDesc, setRawDesc] = useState('');

  // --- FILTERED LISTS ---

  const dateFilter = (dateStr: string) => {
    const d = new Date(dateStr);
    const yearMatch = selectedYear === -1 ? true : d.getFullYear() === selectedYear;
    const monthMatch = selectedMonth === -1 ? true : d.getMonth() === selectedMonth;
    return yearMatch && monthMatch;
  };

  const filteredProductions = useMemo(() => {
    return productions
      .filter(p => dateFilter(p.date))
      .filter(p => 
        p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productions, searchTerm, selectedYear, selectedMonth]);

  const filteredRawMaterials = useMemo(() => {
    return rawMaterials
      .filter(rm => dateFilter(rm.date))
      .filter(rm => 
        rm.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rm.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [rawMaterials, searchTerm, selectedYear, selectedMonth]);

  // --- CRUD PRODUCTIONS ---

  const openAddProd = () => {
    if (!hasAccess('production', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setProdMode('create');
    setSelectedProd(null);
    setProdDate(new Date().toISOString().split('T')[0]);
    setProdProductName('');
    setProdRawQty(0);
    setProdFinalQty(0);
    setProdWeight(0);
    setProdDesc('');
    setShowProdModal(true);
  };

  const openEditProd = (p: Production) => {
    if (!hasAccess('production', 'edit')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    setProdMode('edit');
    setSelectedProd(p);
    setProdDate(new Date(p.date).toISOString().split('T')[0]);
    setProdProductName(p.productName);
    setProdRawQty(p.rawQuantity);
    setProdFinalQty(p.finalQuantity);
    setProdWeight(p.totalWeight || 0);
    setProdDesc(p.description || '');
    setShowProdModal(true);
  };

  const saveProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodDate || !prodProductName || prodRawQty < 0 || prodFinalQty < 0) {
      showToast('Champs obligatoires manquants ou invalides.', 'warning');
      return;
    }

    const payload: Production = {
      id: prodMode === 'edit' && selectedProd ? selectedProd.id : Date.now(),
      date: new Date(prodDate + 'T12:00:00').toISOString(),
      productName: prodProductName,
      rawQuantity: Number(prodRawQty),
      finalQuantity: Number(prodFinalQty),
      totalWeight: Number(prodWeight),
      description: prodDesc.trim(),
      timestamp: prodMode === 'edit' && selectedProd ? selectedProd.timestamp : Date.now()
    };

    await db.productions.put(payload);
    showToast('Session de production enregistrée.', 'success');
    setShowProdModal(false);
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const deleteProduction = async (id: number) => {
    if (!hasAccess('production', 'delete')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    if (confirm('Supprimer cette session de production ?')) {
      await db.productions.delete(id);
      showToast('Session supprimée.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    }
  };

  // --- CRUD RAW MATERIALS LOG ---

  const openAddRaw = () => {
    if (!hasAccess('production', 'add')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    setRawMode('create');
    setSelectedRaw(null);
    setRawDate(new Date().toISOString().split('T')[0]);
    setRawProductName('');
    setRawArrivedQty(0);
    setRawOutQty(0);
    setRawRawQty(0);
    setRawFinalQty(0);
    setRawWeight(0);
    setRawDesc('');
    setShowRawModal(true);
  };

  const openEditRaw = (rm: RawMaterial) => {
    if (!hasAccess('production', 'edit')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    setRawMode('edit');
    setSelectedRaw(rm);
    setRawDate(new Date(rm.date).toISOString().split('T')[0]);
    setRawProductName(rm.productName);
    setRawArrivedQty(rm.arrivedQty);
    setRawOutQty(rm.outQty);
    setRawRawQty(rm.rawQuantity || 0);
    setRawFinalQty(rm.finalQuantity || 0);
    setRawWeight(rm.totalWeight || 0);
    setRawDesc(rm.description || '');
    setShowRawModal(true);
  };

  const saveRawLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawDate || !rawProductName || rawArrivedQty < 0 || rawOutQty < 0) {
      showToast('Données de matières premières invalides.', 'warning');
      return;
    }

    const payload: RawMaterial = {
      id: rawMode === 'edit' && selectedRaw ? selectedRaw.id : Date.now(),
      date: new Date(rawDate + 'T12:00:00').toISOString(),
      productName: rawProductName,
      arrivedQty: Number(rawArrivedQty),
      outQty: Number(rawOutQty),
      finalStock: Number(rawArrivedQty) - Number(rawOutQty),
      rawQuantity: Number(rawRawQty),
      finalQuantity: Number(rawFinalQty),
      totalWeight: Number(rawWeight),
      description: rawDesc.trim(),
      timestamp: rawMode === 'edit' && selectedRaw ? selectedRaw.timestamp : Date.now()
    };

    await db.rawMaterials.put(payload);
    showToast('Log de matière première mis à jour.', 'success');
    setShowRawModal(false);
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const deleteRawLog = async (id: number) => {
    if (!hasAccess('production', 'delete')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    if (confirm('Supprimer cette ligne de matière première ?')) {
      await db.rawMaterials.delete(id);
      showToast('Ligne supprimée.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    }
  };

  // --- EXPORTS ---

  const exportExcel = () => {
    const data = activeTab === 'production'
      ? filteredProductions.map(p => ({
          'Date': new Date(p.date).toLocaleDateString('fr-FR'),
          'Produit': p.productName,
          'Matière Consommée (sacs)': p.rawQuantity,
          'Produit Fini Obtenu (paquets)': p.finalQuantity,
          'Poids Total (kg)': p.totalWeight || '-',
          'Description': p.description || '-'
        }))
      : filteredRawMaterials.map(rm => ({
          'Date': new Date(rm.date).toLocaleDateString('fr-FR'),
          'Produit / Matière': rm.productName,
          'Sacs Arrivés': rm.arrivedQty,
          'Sacs Sortis': rm.outQty,
          'Stock Net': rm.finalStock,
          'Description': rm.description || '-'
        }));

    const sheet = utils.json_to_sheet(data);
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, activeTab === 'production' ? 'Production' : 'Matières');
    writeFile(book, `echos_${activeTab === 'production' ? 'production' : 'matieres'}_${selectedYear}.xlsx`);
    showToast('Export Excel réussi !', 'success');
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value={-1}>Tous les mois</option>
              {MONTHS.map((m: string, idx: number) => <option key={idx} value={idx}>{m}</option>)}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value={-1}>Toutes les années</option>
              {[2024, 2025, 2026, 2027].map((y: number) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="relative max-w-xs w-48">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-input pl-9 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 shadow-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="btn-secondary py-2 text-sm">
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          
          <button
            onClick={activeTab === 'production' ? openAddProd : openAddRaw}
            className="btn-primary py-2 text-sm"
          >
            <Plus className="w-4.5 h-4.5" />
            Ajouter log
          </button>
        </div>
      </div>

      {/* Rendu des vues */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm flex flex-col overflow-hidden">

        {/* RAW MATERIALS LIST */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <th className="table-header">Date</th>
                <th className="table-header">Produit / Matière</th>
                <th className="table-header text-center">Sacs Arrivés</th>
                <th className="table-header text-center">Sacs Sortis</th>
                <th className="table-header text-center">Stock Net (sacs)</th>
                <th className="table-header">Notes</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRawMaterials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm italic text-slate-400">
                    Aucune matière première enregistrée.
                  </td>
                </tr>
              ) : (
                filteredRawMaterials.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rm => (
                  <tr key={rm.id} className="table-row">
                    <td className="table-cell font-mono text-xs">
                      {new Date(rm.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="table-cell font-semibold text-slate-800 dark:text-slate-100">{rm.productName}</td>
                    <td className="table-cell text-center font-bold text-emerald-600">+{rm.arrivedQty.toFixed(2)}</td>
                    <td className="table-cell text-center font-bold text-red-500">-{rm.outQty.toFixed(2)}</td>
                    <td className="table-cell text-center font-bold font-mono">
                      {(rm.arrivedQty - rm.outQty).toFixed(2)}
                    </td>
                    <td className="table-cell text-xs text-slate-500 max-w-[200px] truncate" title={rm.description}>
                      {rm.description || '-'}
                    </td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => openEditRaw(rm)} className="p-1 text-slate-400 hover:text-brand">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteRawLog(rm.id)} className="p-1 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PRODUCTION */}
      <Modal
        isOpen={showProdModal}
        onClose={() => setShowProdModal(false)}
        title={prodMode === 'create' ? 'Ajouter Production' : 'Modifier la session'}
        size="md"
      >
        <form id="productionForm" onSubmit={saveProduction} className="p-6 flex flex-col gap-4">
          <input type="hidden" id="production-id" value={selectedProd?.id || ''} />
          
          <div>
            <label htmlFor="production-date" className="form-label">Date du jour</label>
            <input
              id="production-date"
              type="date"
              required
              value={prodDate}
              onChange={e => setProdDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="relative">
            <label htmlFor="production-product-name" className="form-label">Nom du produit</label>
            <input
              id="production-product-name"
              type="text"
              required
              value={prodProductName}
              onChange={e => setProdProductName(e.target.value)}
              className="form-input"
              placeholder="Ex: Farine de blé, Riz blanc..."
              list="production-product-names-datalist"
            />
            <datalist id="production-product-names-datalist">
              {products.filter(p => p.type === 'finished').map(p => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="production-raw-quantity" className="form-label">Quantité matière première (kg)</label>
              <input
                id="production-raw-quantity"
                type="number"
                step="0.01"
                min="0"
                required
                value={prodRawQty}
                onChange={e => setProdRawQty(Number(e.target.value))}
                className="form-input font-mono"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="production-final-quantity" className="form-label">Quantité produit final (kg)</label>
              <input
                id="production-final-quantity"
                type="number"
                step="0.01"
                min="0"
                required
                value={prodFinalQty}
                onChange={e => setProdFinalQty(Number(e.target.value))}
                className="form-input font-mono"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label htmlFor="production-total-weight" className="form-label">Poids total (kg)</label>
            <input
              id="production-total-weight"
              type="number"
              step="0.01"
              min="0"
              value={prodWeight}
              onChange={e => setProdWeight(Number(e.target.value))}
              className="form-input font-mono"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="production-description" className="form-label">Détail / Notes</label>
            <textarea
              id="production-description"
              rows={2}
              value={prodDesc}
              onChange={e => setProdDesc(e.target.value)}
              className="form-input min-h-[60px]"
              placeholder="Observations ou détails supplémentaires..."
            />
          </div>

          <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
            <button type="button" onClick={() => setShowProdModal(false)} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary">
              <Save className="w-4 h-4" />
              {prodMode === 'create' ? 'Ajouter Production' : 'Sauvegarder'}
            </button>
          </div>

        </form>
      </Modal>

      {/* MODAL RAW MATERIAL LOG */}
      <Modal
        isOpen={showRawModal}
        onClose={() => setShowRawModal(false)}
        title={rawMode === 'create' ? 'Enregistrer Matière Première' : 'Modifier le Log'}
        size="md"
      >
        <form id="rawMaterialForm" onSubmit={saveRawLog} className="p-6 flex flex-col gap-4">
          <input type="hidden" id="raw-material-id" value={selectedRaw?.id || ''} />
          
          <div>
            <label htmlFor="raw-material-date" className="form-label">Date du jour</label>
            <input
              id="raw-material-date"
              type="date"
              required
              value={rawDate}
              onChange={e => setRawDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="relative">
            <label htmlFor="raw-material-product-name" className="form-label">Nom du produit / Matière</label>
            <input
              id="raw-material-product-name"
              type="text"
              required
              value={rawProductName}
              onChange={e => setRawProductName(e.target.value)}
              className="form-input"
              placeholder="Ex: Riz blanc, Manioc, Huile..."
              list="raw-material-product-names-datalist"
            />
            <datalist id="raw-material-product-names-datalist">
              {products.filter(p => p.type === 'raw').map(p => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="raw-material-arrived-qty" className="form-label">Quantité Arrivée (sacs)</label>
              <input
                id="raw-material-arrived-qty"
                type="number"
                step="0.01"
                min="0"
                required
                value={rawArrivedQty}
                onChange={e => setRawArrivedQty(Number(e.target.value))}
                className="form-input font-mono"
              />
            </div>
            <div>
              <label htmlFor="raw-material-out-qty" className="form-label">Quantité Sortie (sacs)</label>
              <input
                id="raw-material-out-qty"
                type="number"
                step="0.01"
                min="0"
                value={rawOutQty}
                onChange={e => setRawOutQty(Number(e.target.value))}
                className="form-input font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="raw-material-final-stock" className="form-label">Stock Final (sacs)</label>
            <input
              id="raw-material-final-stock"
              type="number"
              step="0.01"
              min="0"
              readOnly
              value={Math.max(0, rawArrivedQty - rawOutQty).toFixed(2)}
              className="form-input font-mono bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="raw-material-raw-quantity" className="form-label">Quantité matière première (kg) <span className="text-xs text-slate-400 font-normal">(optionnel)</span></label>
              <input
                id="raw-material-raw-quantity"
                type="number"
                step="0.01"
                min="0"
                value={rawRawQty || ''}
                onChange={e => setRawRawQty(Number(e.target.value))}
                className="form-input font-mono"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="raw-material-final-quantity" className="form-label">Quantité produit final (paquets) <span className="text-xs text-slate-400 font-normal">(optionnel)</span></label>
              <input
                id="raw-material-final-quantity"
                type="number"
                step="0.01"
                min="0"
                value={rawFinalQty || ''}
                onChange={e => setRawFinalQty(Number(e.target.value))}
                className="form-input font-mono"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label htmlFor="raw-material-total-weight" className="form-label">Poids total (kg) <span className="text-xs text-slate-400 font-normal">(optionnel)</span></label>
            <input
              id="raw-material-total-weight"
              type="number"
              step="0.01"
              min="0"
              value={rawWeight || ''}
              onChange={e => setRawWeight(Number(e.target.value))}
              className="form-input font-mono"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="raw-material-description" className="form-label">Notes / Observations</label>
            <textarea
              id="raw-material-description"
              rows={2}
              value={rawDesc}
              onChange={e => setRawDesc(e.target.value)}
              className="form-input min-h-[60px]"
              placeholder="Détails supplémentaires..."
            />
          </div>

          <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
            <button type="button" onClick={() => setShowRawModal(false)} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary">
              <Plus className="w-4 h-4" />
              {rawMode === 'create' ? 'Ajouter Matière' : 'Sauvegarder'}
            </button>
          </div>

        </form>
      </Modal>

    </div>
  );
};
