import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Expense, Income } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  CreditCard, Search, Filter, Plus, Edit2, Trash2, 
  Save, TrendingUp, TrendingDown, ArrowRightLeft, 
  Calendar, DollarSign 
} from 'lucide-react';
import { CATEGORIES_DEPENSES } from '../config/constants';
import { showToast } from '../components/ui/Toast';
import { syncUp } from '../services/syncEngine';
import { useExports } from '../hooks/useExports';
import { ExportButton } from '../components/ExportButton';
import { Modal } from '../components/ui/Modal';
// --- TRANSACTIONS COMPTABLES PAGE ---


export const Transactions: React.FC = () => {
  const { hasAccess } = useAuth();
  
  // Tables
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const incomes = useLiveQuery(() => db.income.toArray()) || [];
  const products = useLiveQuery(() => db.inventory.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

  // Tabs: 'expense' or 'income'
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [expenseCatFilter, setExpenseCatFilter] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(-1); // -1 = All year

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);


  const [expenseMode, setExpenseMode] = useState<'create' | 'edit'>('create');

  const [incomeMode, setIncomeMode] = useState<'create' | 'edit'>('create');
  
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);

  // Form Fields - Expense
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expCategory, setExpCategory] = useState(CATEGORIES_DEPENSES[0] || 'Divers');
  const [expDesc, setExpDesc] = useState('');
  const [expType, setExpType] = useState<'general' | 'purchase'>('general');
  const [expProdName, setExpProdName] = useState('');
  const [expSupplier, setExpSupplier] = useState('');
  const [expTransportCost, setExpTransportCost] = useState<number>(0);
  const [expLossPercent, setExpLossPercent] = useState<number>(0);
  const [expPaymentType, setExpPaymentType] = useState<'total' | 'partial'>('total');
  const [expPaidAmount, setExpPaidAmount] = useState<number>(0);

  // Form Fields - Income
  const [incDate, setIncDate] = useState(new Date().toISOString().split('T')[0]);
  const [incAmount, setIncAmount] = useState<number>(0);
  const [incReceivedBy, setIncReceivedBy] = useState('');
  const [incSource, setIncSource] = useState('');
  const [incDesc, setIncDesc] = useState('');

  // --- DERIVED METRICS ---

  const metrics = useMemo(() => {
    // Filter by year & month
    const filterByDate = (dateStr: string) => {
      const d = new Date(dateStr);
      const yearMatch = d.getFullYear() === selectedYear;
      const monthMatch = selectedMonth === -1 ? true : d.getMonth() === selectedMonth;
      return yearMatch && monthMatch;
    };

    const yearExpenses = expenses.filter(e => filterByDate(e.date));
    const yearIncomes = incomes.filter(i => filterByDate(i.date));

    const totalExp = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalInc = yearIncomes.reduce((sum, i) => sum + i.amount, 0);

    return {
      expensesList: yearExpenses,
      incomesList: yearIncomes,
      totalExpenses: totalExp,
      totalIncome: totalInc,
      netProfit: totalInc - totalExp
    };
  }, [expenses, incomes, selectedYear, selectedMonth]);

  // --- FILTERED AND SEARCHED LISTS ---

  const filteredExpenses = useMemo(() => {
    return metrics.expensesList.filter(e => {
      const matchSearch = 
        e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.supplier || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCat = expenseCatFilter ? e.category === expenseCatFilter : true;
      return matchSearch && matchCat;
    });
  }, [metrics.expensesList, searchTerm, expenseCatFilter]);

  const filteredIncomes = useMemo(() => {
    return metrics.incomesList.filter(i => {
      return (
        i.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.receivedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.source || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [metrics.incomesList, searchTerm]);

  // --- CRUD OPERATIONS EXPENSES ---

  const openAddExpense = () => {
    if (!hasAccess('transactions', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setExpenseMode('create');
    setSelectedExpense(null);
    setExpDate(new Date().toISOString().split('T')[0]);
    setExpAmount(0);
    setExpCategory(CATEGORIES_DEPENSES[0] || 'Divers');
    setExpDesc('');
    setExpType('general');
    setExpProdName('');
    setExpSupplier('');
    setExpTransportCost(0);
    setExpLossPercent(0);
    setExpPaymentType('total');
    setExpPaidAmount(0);
    setShowExpenseModal(true);
  };

  const openEditExpense = (e: Expense) => {
    if (!hasAccess('transactions', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setExpenseMode('edit');
    setSelectedExpense(e);
    setExpDate(new Date(e.date).toISOString().split('T')[0]);
    setExpAmount(e.amount);
    setExpCategory(e.category);
    setExpDesc(e.description);
    setExpType(e.type || 'general');
    setExpProdName(e.productName || '');
    setExpSupplier(e.supplier || '');
    setExpTransportCost(e.transportCost || 0);
    setExpLossPercent(e.lossPercentage || 0);
    setExpPaymentType(e.paymentType || 'total');
    setExpPaidAmount(e.paidAmount || e.amount);
    setShowExpenseModal(true);
  };

  const saveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDate || expAmount <= 0) {
      showToast('Veuillez renseigner une date et un montant valide.', 'warning');
      return;
    }

    const totalAmount = Number(expAmount);
    const paid = expPaymentType === 'total' ? totalAmount : Number(expPaidAmount);
    const remaining = totalAmount - paid;

    const payload: Expense = {
      id: expenseMode === 'edit' && selectedExpense ? selectedExpense.id : Date.now(),
      date: new Date(expDate + 'T12:00:00').toISOString(),
      amount: totalAmount,
      category: expCategory,
      description: expDesc.trim(),
      type: expType,
      productName: expType === 'purchase' ? expProdName : undefined,
      supplier: expType === 'purchase' ? expSupplier : undefined,
      transportCost: expType === 'purchase' ? Number(expTransportCost) : undefined,
      lossPercentage: expType === 'purchase' ? Number(expLossPercent) : undefined,
      paymentType: expPaymentType,
      paidAmount: paid,
      remainingAmount: remaining
    };

    // If purchase of raw material, automatically update raw materials logs / stock
    if (expCategory === 'Matières Premières' && expType === 'purchase' && expProdName) {
      const arrivedSacks = Number(expAmount) / 5000; // Mock derived bags
      // Check if product exists in inventory, if so increase stock
      const p = products.find(prod => prod.name.toUpperCase() === expProdName.toUpperCase());
      if (p) {
        await db.inventory.update(p.id, { stock: p.stock + arrivedSacks });
      }
      
      // Add rawMaterials logs entry
      await db.rawMaterials.put({
        id: Date.now() + 1,
        date: payload.date,
        productName: expProdName,
        arrivedQty: arrivedSacks,
        outQty: 0,
        finalStock: p ? p.stock + arrivedSacks : arrivedSacks,
        description: `Achat Matière Première : ${expDesc}`
      });
    }

    await db.expenses.put(payload);
    showToast('Dépense enregistrée.', 'success');
    setShowExpenseModal(false);
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const deleteExpense = async (id: number) => {
    if (!hasAccess('transactions', 'delete')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    if (confirm('Voulez-vous supprimer cette dépense ?')) {
      await db.expenses.delete(id);
      showToast('Dépense supprimée.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    }
  };

  // --- CRUD OPERATIONS INCOME ---

  const openAddIncome = () => {
    if (!hasAccess('transactions', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setIncomeMode('create');
    setSelectedIncome(null);
    setIncDate(new Date().toISOString().split('T')[0]);
    setIncAmount(0);
    setIncReceivedBy('');
    setIncSource('');
    setIncDesc('');
    setShowIncomeModal(true);
  };

  const openEditIncome = (i: Income) => {
    if (!hasAccess('transactions', 'edit')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }
    setIncomeMode('edit');
    setSelectedIncome(i);
    setIncDate(new Date(i.date).toISOString().split('T')[0]);
    setIncAmount(i.amount);
    setIncReceivedBy(i.receivedBy);
    setIncSource(i.source || '');
    setIncDesc(i.description || '');
    setShowIncomeModal(true);
  };

  const saveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incDate || incAmount <= 0 || !incReceivedBy) {
      showToast('Champs requis invalides.', 'warning');
      return;
    }

    const payload: Income = {
      id: incomeMode === 'edit' && selectedIncome ? selectedIncome.id : Date.now(),
      date: new Date(incDate + 'T12:00:00').toISOString(),
      amount: Number(incAmount),
      receivedBy: incReceivedBy.trim(),
      source: incSource.trim(),
      description: incDesc.trim()
    };

    await db.income.put(payload);
    showToast('Rentré d\'argent enregistrée.', 'success');
    setShowIncomeModal(false);
    syncUp().catch(err => console.warn('Background sync failed', err));
  };

  const deleteIncome = async (id: number) => {
    if (!hasAccess('transactions', 'delete')) {
      showToast('Opération non autorisée.', 'error');
      return;
    }
    if (confirm('Voulez-vous supprimer cette rentrée d\'argent ?')) {
      await db.income.delete(id);
      showToast('Rentrée d\'argent supprimée.', 'success');
      syncUp().catch(err => console.warn('Background sync failed', err));
    }
  };

  const { 
    exportExpensesPDF, exportExpensesXLSX,
    exportIncomeHistoryPDF, exportIncomeXLSX
  } = useExports();

  return (
    <div className="flex flex-col gap-6 animate-fade-scale">
      
      {/* 1. Header Toolbar Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none shadow-sm"
            >
              <option value={-1}>Toute l'année</option>
              {CATEGORIES_DEPENSES.map((m, idx) => (
                // Safe lookup month arrays
                idx < 12 && <option key={idx} value={idx}>{new Date(2026, idx).toLocaleDateString('fr-FR', { month: 'long' })}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none shadow-sm"
            >
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
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

          {activeTab === 'expense' && (
            <select
              value={expenseCatFilter}
              onChange={e => setExpenseCatFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold focus:outline-none text-slate-700 dark:text-slate-200"
            >
              <option value="">Toutes catégories</option>
              {CATEGORIES_DEPENSES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <ExportButton
            onPDF={() => {
              if (activeTab === 'expense') {
                exportExpensesPDF(selectedMonth === -1 ? 'all' : 'month');
              } else {
                exportIncomeHistoryPDF(selectedMonth === -1 ? 'all' : 'month');
              }
            }}
            onXLSX={() => {
              if (activeTab === 'expense') {
                exportExpensesXLSX(selectedMonth === -1 ? 'all' : 'month');
              } else {
                exportIncomeXLSX(selectedMonth === -1 ? 'all' : 'month');
              }
            }}
          />
          
          <button
            onClick={activeTab === 'expense' ? openAddExpense : openAddIncome}
            className="px-4 py-3 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-900 transition-all flex items-center gap-2 cursor-pointer h-full"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter</span>
          </button>
        </div>

      </div>

      {/* 2. Solde Card Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Total Rentrées</span>
            <span className="text-2xl font-extrabold text-emerald-600 font-sans block">+{metrics.totalIncome.toLocaleString()} F</span>
          </div>
          <div className="p-4 bg-emerald-500/10 text-emerald-600 rounded-2xl border border-emerald-500/20">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 p-6 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Total Dépenses</span>
            <span className="text-2xl font-extrabold text-red-500 font-sans block">-{metrics.totalExpenses.toLocaleString()} F</span>
          </div>
          <div className="p-4 bg-red-500/10 text-red-600 rounded-2xl border border-red-500/20">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className={`border p-6 rounded-2xl flex items-center justify-between shadow-sm ${
          metrics.netProfit >= 0 
            ? 'bg-brand/5 border-brand/20 text-brand dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400' 
            : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/30'
        }`}>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Solde Net Exercice</span>
            <span className="text-2xl font-extrabold font-sans block">
              {metrics.netProfit >= 0 ? '+' : ''}{metrics.netProfit.toLocaleString()} F
            </span>
          </div>
          <div className={`p-4 rounded-2xl border ${
            metrics.netProfit >= 0 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' 
              : 'bg-red-500/10 border-red-500/20 text-red-600'
          }`}>
            <ArrowRightLeft className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Tab navigation bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6">
          <button
            onClick={() => { setActiveTab('expense'); setSearchTerm(''); }}
            className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'expense' 
                ? 'border-brand text-brand' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Fiche des Dépenses
          </button>
          <button
            onClick={() => { setActiveTab('income'); setSearchTerm(''); }}
            className={`py-4 px-6 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'income' 
                ? 'border-brand text-brand' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Fiche des Rentrées d'argent
          </button>
        </div>

        {/* 4. Display Table / Cards */}
        {activeTab === 'expense' ? (
          /* EXPENSES TABLE */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <th className="table-header">Date</th>
                  <th className="table-header text-center">Catégorie</th>
                  <th className="table-header">Description</th>
                  <th className="table-header text-center">Paiement</th>
                  <th className="table-header text-right">Montant</th>
                  <th className="table-header text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm italic text-slate-400">
                      Aucune dépense enregistrée pour cette période.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(exp => (
                    <tr key={exp.id} className="table-row">
                      <td className="table-cell font-mono text-xs">
                        {new Date(exp.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="table-cell text-center">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-2xs font-bold text-slate-600 dark:text-slate-400">
                          {exp.category}
                        </span>
                      </td>
                      <td className="table-cell font-medium max-w-[200px] truncate" title={exp.description}>
                        {exp.description}
                      </td>
                      <td className="table-cell text-center">
                        {exp.paymentType === 'partial' ? (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-3xs font-extrabold uppercase rounded-full">
                            Reste: {exp.remainingAmount?.toLocaleString()} F
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-3xs font-extrabold uppercase rounded-full">
                            Payé Total
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {exp.amount.toLocaleString()} F
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditExpense(exp)}
                            className="p-1 text-slate-400 hover:text-brand transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteExpense(exp.id)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
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
        ) : (
          /* INCOME TABLE */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <th className="table-header">Date</th>
                  <th className="table-header">Reçu par</th>
                  <th className="table-header">Source / Provenance</th>
                  <th className="table-header">Description / Notes</th>
                  <th className="table-header text-right">Montant</th>
                  <th className="table-header text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncomes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm italic text-slate-400">
                      Aucune rentrée d'argent enregistrée pour cette période.
                    </td>
                  </tr>
                ) : (
                  filteredIncomes.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(inc => (
                    <tr key={inc.id} className="table-row">
                      <td className="table-cell font-mono text-xs">
                        {new Date(inc.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="table-cell font-semibold">{inc.receivedBy}</td>
                      <td className="table-cell font-medium">{inc.source || '-'}</td>
                      <td className="table-cell text-xs text-slate-500 max-w-[200px] truncate" title={inc.description}>
                        {inc.description || '-'}
                      </td>
                      <td className="table-cell text-right font-mono font-bold text-brand">
                        {inc.amount.toLocaleString()} F
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditIncome(inc)}
                            className="p-1 text-slate-400 hover:text-brand transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteIncome(inc.id)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
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
        )}

      </div>

      {/* CRUD MODAL FOR EXPENSE */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title={expenseMode === 'create' ? 'Ajouter une dépense' : 'Modifier la dépense'}
        size="lg"
      >
            <form id="expenseForm" onSubmit={saveExpense} className="p-6 flex flex-col gap-4">
              <input type="hidden" id="expense-id" value={selectedExpense?.id || ''} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expense-date" className="form-label">Date</label>
                  <input
                    id="expense-date"
                    type="date"
                    required
                    value={expDate}
                    onChange={e => setExpDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label htmlFor="expense-category" className="form-label">Catégorie</label>
                  <input
                    id="expense-category"
                    type="text"
                    list="expense-categories"
                    value={expCategory}
                    onChange={e => setExpCategory(e.target.value)}
                    className="form-input"
                    placeholder="Internet, Loyer, Transport..."
                  />
                  <datalist id="expense-categories">
                    {CATEGORIES_DEPENSES.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expense-amount" className="form-label">Montant (FCFA)</label>
                  <input
                    id="expense-amount"
                    type="number"
                    min="1"
                    required
                    value={expAmount}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setExpAmount(val);
                      if (expPaymentType === 'total') {
                        setExpPaidAmount(val);
                      }
                    }}
                    className="form-input font-mono font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="expense-payment-type" className="form-label">Type de paiement</label>
                  <select
                    id="expense-payment-type"
                    value={expPaymentType}
                    onChange={e => {
                      const val = e.target.value as 'total' | 'partial';
                      setExpPaymentType(val);
                      if (val === 'total') {
                        setExpPaidAmount(expAmount);
                      }
                    }}
                    className="form-input"
                  >
                    <option value="total">Paiement total</option>
                    <option value="partial">Paiement partiel</option>
                  </select>
                </div>
              </div>

              {expPaymentType === 'partial' && (
                <div className="grid grid-cols-2 gap-4 animate-fade-scale">
                  <div>
                    <label htmlFor="expense-paid-amount" className="form-label font-bold text-brand">Payer (FCFA)</label>
                    <input
                      id="expense-paid-amount"
                      type="number"
                      min="0"
                      value={expPaidAmount}
                      onChange={e => setExpPaidAmount(Number(e.target.value))}
                      className="form-input font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label htmlFor="expense-remaining-amount" className="form-label">Reste à payer (FCFA)</label>
                    <input
                      id="expense-remaining-amount"
                      type="number"
                      readOnly
                      value={Math.max(0, expAmount - expPaidAmount)}
                      className="form-input font-mono font-bold text-sm bg-red-50 dark:bg-red-950/20 text-red-500 cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expense-type" className="form-label">Type de dépense</label>
                  <select
                    id="expense-type"
                    value={expType}
                    onChange={e => setExpType(e.target.value as any)}
                    className="form-input"
                  >
                    <option value="general">Charge générale</option>
                    <option value="purchase">Facture d'achat</option>
                  </select>
                </div>
                {expType === 'purchase' && (
                  <div>
                    <label htmlFor="expense-supplier" className="form-label">Fournisseur</label>
                    <input
                      id="expense-supplier"
                      type="text"
                      value={expSupplier}
                      onChange={e => setExpSupplier(e.target.value)}
                      className="form-input"
                      placeholder="Ex: Entreprise X"
                    />
                  </div>
                )}
              </div>

              {expType === 'purchase' && (
                <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800 rounded-2xl animate-fade-scale">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="expense-product-name" className="form-label text-brand">Nom du produit</label>
                      <input
                        id="expense-product-name"
                        type="text"
                        value={expProdName}
                        onChange={e => setExpProdName(e.target.value)}
                        className="form-input"
                        placeholder="Ex: Riz blanc, Farine..."
                        list="expense-product-names-datalist"
                      />
                      <datalist id="expense-product-names-datalist">
                        {products.filter(p => p.type === 'raw').map(p => (
                          <option key={p.id} value={p.name} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="form-label">Frais Transport (FCFA)</label>
                      <input
                        type="number"
                        value={expTransportCost}
                        onChange={e => setExpTransportCost(Number(e.target.value))}
                        className="form-input font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="expense-description" className="form-label">Description</label>
                <textarea
                  id="expense-description"
                  rows={1}
                  value={expDesc}
                  onChange={e => setExpDesc(e.target.value)}
                  className="form-input min-h-[60px]"
                  placeholder="Notes explicatives..."
                />
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">
                  <Save className="w-4 h-4" />
                  {expenseMode === 'create' ? 'Ajouter Dépense' : 'Sauvegarder'}
                </button>
              </div>

            </form>
      </Modal>

      {/* CRUD MODAL FOR INCOME */}
      <Modal
        isOpen={showIncomeModal}
        onClose={() => setShowIncomeModal(false)}
        title={incomeMode === 'create' ? 'Ajouter une Recette' : 'Modifier la Recette'}
        size="md"
      >
            <form id="incomeForm" onSubmit={saveIncome} className="p-6 flex flex-col gap-4">
              <input type="hidden" id="income-id" value={selectedIncome?.id || ''} />

              <div>
                <label htmlFor="income-date" className="form-label">Date du jour</label>
                <input
                  id="income-date"
                  type="date"
                  required
                  value={incDate}
                  onChange={e => setIncDate(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label htmlFor="income-amount" className="form-label">Montant (FCFA)</label>
                <input
                  id="income-amount"
                  type="number"
                  step="100"
                  required
                  value={incAmount}
                  onChange={e => setIncAmount(Number(e.target.value))}
                  className="form-input font-mono font-bold"
                  placeholder="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="income-received-by" className="form-label">Reçu par</label>
                  <input
                    id="income-received-by"
                    type="text"
                    required
                    value={incReceivedBy}
                    onChange={e => setIncReceivedBy(e.target.value)}
                    className="form-input"
                    placeholder="Nom de la personne"
                  />
                </div>
                <div>
                  <label htmlFor="income-source" className="form-label">Venant de (Optionnel)</label>
                  <input
                    id="income-source"
                    type="text"
                    value={incSource}
                    onChange={e => setIncSource(e.target.value)}
                    className="form-input"
                    placeholder="Client, prêt, remboursement..."
                  />
                </div>
              </div>

              <div>
                <label htmlFor="income-description" className="form-label">Observations</label>
                <textarea
                  id="income-description"
                  rows={2}
                  value={incDesc}
                  onChange={e => setIncDesc(e.target.value)}
                  className="form-input min-h-[60px]"
                  placeholder="Notes supplémentaires..."
                />
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
                <button type="button" onClick={() => setShowIncomeModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">
                  <Save className="w-4 h-4" />
                  {incomeMode === 'create' ? 'Ajouter Recette' : 'Sauvegarder'}
                </button>
              </div>

            </form>
      </Modal>

    </div>
  );
};
