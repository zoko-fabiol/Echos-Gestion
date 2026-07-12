import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product, DailyRecord, Quote } from '../db/database';
import { useAuth } from '../context/AuthContext';
import { 
  ShoppingCart, Send, Trash2, Calendar, User, 
  ArrowRightLeft, BadgeAlert, Printer, CheckCircle 
} from 'lucide-react';
import { showToast } from '../components/ui/Toast';
import { COMPANY_KEY, LOGO_KEY, DEFAULT_COMPANY_INFO } from '../config/constants';
import { generateInvoicePDF, generateDeliveryPDF } from '../services/pdfGenerator';
import { syncUp } from '../services/syncEngine';
import { logAction } from '../services/logService';

interface CaisseProps {
  cart: (Product & { qty: number })[];
  setCart: React.Dispatch<React.SetStateAction<(Product & { qty: number })[]>>;
  updateCartQty: (id: number, qty: number) => void;
  removeCartItem: (id: number) => void;
}

export const Caisse: React.FC<CaisseProps> = ({ 
  cart, 
  setCart, 
  updateCartQty, 
  removeCartItem 
}) => {
  const { hasAccess } = useAuth();
  
  // Local modes: 'sale' (Direct Sale) or 'quote' (Livraison / Devis)
  const [caisseMode, setCaisseMode] = useState<'sale' | 'quote'>('sale');
  
  // Form details
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);

  const products = useLiveQuery(() => db.inventory.toArray()) || [];

  const cartTotal = cart.reduce((acc, curr) => acc + (curr.salePrice * curr.qty), 0);

  const handleModeChange = (mode: 'sale' | 'quote') => {
    if (mode === 'sale' && !hasAccess('caisse', 'add')) {
      showToast('Accès refusé : vous n\'êtes pas autorisé à utiliser le mode Vente.', 'error');
      return;
    }
    setCaisseMode(mode);
  };

  const handleQtyChange = (id: number, val: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    let qty = val;
    if (qty < 0) qty = 0;

    // In direct sale mode, clamp quantity to available stock
    if (caisseMode === 'sale' && qty > prod.stock) {
      qty = prod.stock;
      showToast(`Quantité ajustée au stock disponible : ${prod.stock}`, 'warning');
    }

    updateCartQty(id, qty);
  };

  // --- POS VALIDATION (VENTE ET LIVRAISON) ---

  const handleValidation = async () => {
    if (!hasAccess('caisse', 'add')) {
      showToast('Opération non autorisée en lecture seule.', 'error');
      return;
    }

    // Filter items with qty > 0
    const activeItems = cart.filter((item: any) => item.qty > 0);
    if (activeItems.length === 0) {
      showToast('Le panier est vide ou ne contient que des articles à quantité nulle.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const now = Date.now();
      const companyVal = await db.appSettings.get(COMPANY_KEY);
      const companyInfo = companyVal?.value || DEFAULT_COMPANY_INFO;
      const logoVal = await db.appSettings.get(LOGO_KEY);
      const logoData = logoVal?.value || null;

      if (caisseMode === 'sale') {
        // --- 1. DIRECT SALE PROCESS ---
        let insufficientStockItems: string[] = [];
        
        // Stock double check
        activeItems.forEach((c: any) => {
          const p = products.find(prod => prod.id === c.id);
          if (p && p.stock < c.qty) {
            insufficientStockItems.push(`${c.name} (Stock: ${p.stock}, Demandé: ${c.qty})`);
          }
        });

        if (insufficientStockItems.length > 0) {
          showToast('Validation annulée : stock insuffisant pour certains articles.', 'error');
          alert(`STOCK INSUFFISANT :\n- ${insufficientStockItems.join('\n- ')}`);
          setLoading(false);
          return;
        }

        // Deduce stock physically
        for (const c of activeItems) {
          const p = products.find(prod => prod.id === c.id);
          if (p) {
            await db.inventory.update(c.id, { stock: p.stock - c.qty });
          }
        }

        // Save dailyRecord
        const saleTotalCost = activeItems.reduce((acc: number, curr: any) => acc + (curr.purchasePrice * curr.qty), 0);
        const record: DailyRecord = {
          id: now,
          type: 'sale',
          date: new Date().toISOString(),
          items: activeItems.map((item: any) => ({
            name: item.name,
            qty: item.qty,
            price: item.salePrice,
            cost: item.purchasePrice,
            total: item.qty * item.salePrice,
            totalCost: item.qty * item.purchasePrice
          })),
          total: cartTotal,
          totalCost: saleTotalCost,
          margin: cartTotal - saleTotalCost
        };

        await db.dailyRecords.put(record);
        await logAction('create', 'caisse', `Vente directe enregistrée d'un montant de ${cartTotal.toLocaleString()} F (${activeItems.length} article(s))`, record.id);
        showToast('Vente enregistrée avec succès !', 'success');

        // Generate PDF Invoice
        try {
          generateInvoicePDF(record, 'sale', companyInfo, logoData);
        } catch (e) {
          console.warn('PDF Invoice generation failed', e);
        }

      } else {
        // --- 2. DEVIS / LIVRAISON PROCESS ---
        const deliveryItems = [];
        for (const item of activeItems) {
          const prod = products.find(p => p.id === item.id);
          const initialStock = prod ? prod.stock : 0;
          const finalStock = initialStock - item.qty;

          deliveryItems.push({
            name: item.name,
            productId: item.id,
            qty: item.qty,
            initialStock,
            finalStock,
            price: item.salePrice,
            cost: item.purchasePrice,
            total: item.qty * item.salePrice,
            totalCost: item.qty * item.purchasePrice,
            unit: item.saleUnit
          });

          // Deduce stock physically for deliveries too
          if (prod) {
            await db.inventory.update(item.id, { stock: finalStock });
          }
        }

        const deliveryRecord: Quote = {
          id: now,
          type: 'delivery',
          date: deliveryDate ? new Date(deliveryDate + 'T12:00:00').toISOString() : new Date().toISOString(),
          items: deliveryItems,
          total: cartTotal,
          clientName: clientName.trim() || 'Client de Passage',
          clientPhone: clientPhone.trim()
        };

        await db.quotes.put(deliveryRecord);
        await logAction('create', 'caisse', `Bon de livraison enregistré d'un montant de ${cartTotal.toLocaleString()} F pour ${deliveryRecord.clientName}`, deliveryRecord.id);
        showToast('Livraison enregistrée !', 'success');

        // Generate PDF Delivery Slip
        try {
          generateDeliveryPDF(deliveryRecord, companyInfo, logoData);
        } catch (e) {
          console.warn('PDF Delivery generation failed', e);
        }
      }

      // Empty Cart & reset fields
      setCart([]);
      setClientName('');
      setClientPhone('');
      
      // Auto-push in background
      syncUp().catch(err => console.warn('Syncup after POS validation failed', err));

    } catch (err: any) {
      showToast(`Erreur de validation: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-scale">
      
      {/* 1. Left Section: POS Cart Panel */}
      <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm p-4 md:p-6 flex flex-col min-h-[450px]">
        
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5.5 h-5.5 text-brand" />
            <h3 className="font-bold text-slate-800 dark:text-white">Panier POS</h3>
          </div>
          
          {/* Mode Switcher */}
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/60">
            <button
              onClick={() => handleModeChange('sale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                caisseMode === 'sale' 
                  ? 'bg-brand text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Vente Directe
            </button>
            <button
              onClick={() => handleModeChange('quote')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                caisseMode === 'quote' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mode Livraison
            </button>
          </div>
        </div>

        {/* Cart Item checklist */}
        <div className="flex-1 overflow-y-auto max-h-[400px] mb-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-slate-400 dark:text-slate-600 py-12">
              <ShoppingCart className="w-12 h-12 mb-2 text-slate-200 dark:text-slate-800" />
              <p className="text-sm italic">Votre panier est vide.</p>
              <p className="text-xs">Ajoutez des produits depuis le catalogue.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item: any, idx: number) => {
                const prod = products.find(p => p.id === item.id);
                const initialStock = prod ? prod.stock : 0;
                const remaining = initialStock - item.qty;

                return (
                  <div 
                    key={item.id}
                    className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white truncate" title={item.name}>
                        {item.name}
                      </h4>
                      <div className="flex gap-2.5 text-xs text-slate-400 mt-1">
                        <span>P.U: <span className="font-semibold text-slate-600 dark:text-slate-300">{item.salePrice.toLocaleString()} F</span></span>
                        <span>•</span>
                        <span>Stock dispo: <span className="font-semibold">{initialStock}</span></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Quantity input spinner */}
                      <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 w-24">
                        <input
                          type="number"
                          min={0}
                          max={caisseMode === 'sale' ? initialStock : undefined}
                          value={item.qty}
                          onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                          className="w-full text-center py-1 text-sm font-bold text-brand bg-transparent focus:outline-none"
                        />
                      </div>

                      {/* Remaining stock preview */}
                      <div className="w-14 text-center text-2xs font-semibold hidden md:block">
                        <span className="text-slate-400 block font-normal">Reste</span>
                        <span className={remaining < 0 ? 'text-red-500 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                          {remaining}
                        </span>
                      </div>

                      {/* Subtotal */}
                      <div className="w-20 text-right font-bold text-sm text-brand font-mono">
                        {(item.salePrice * item.qty).toLocaleString()} F
                      </div>

                      {/* Remove item */}
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart total summary footer */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 flex justify-between items-center mt-auto">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Montant Total</span>
          <span className="text-2xl font-extrabold text-brand font-mono">{cartTotal.toLocaleString()} FCFA</span>
        </div>

      </div>

      {/* 2. Right Section: Checkout Details Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm p-4 md:p-6 flex flex-col gap-5">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-white">Validation & Client</h3>
          <p className="text-xs text-slate-400">Informations de livraison et facturation</p>
        </div>

        {caisseMode === 'quote' && (
          <div className="flex flex-col gap-4 animate-fade-scale">
            <div>
              <label className="form-label">Date de Livraison</label>
              <div className="relative rounded-xl">
                <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="form-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Nom du Client</label>
              <div className="relative rounded-xl">
                <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ex. Client de Passage"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="form-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Contact Client (Optionnel)</label>
              <input
                type="tel"
                placeholder="ex. 699000000"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        )}

        {caisseMode === 'sale' && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-xs flex gap-2.5 text-emerald-800 dark:text-emerald-400 animate-fade-scale">
            <CheckCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Mode Vente Directe</span>. La validation déduira le stock et générera une facture de caisse PDF instantanément. Le stock négatif est bloqué.
            </div>
          </div>
        )}

        <button
          onClick={handleValidation}
          disabled={loading || cart.length === 0}
          className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.01] ${
            caisseMode === 'sale' 
              ? 'bg-brand hover:bg-brand-dark text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Send className="w-4.5 h-4.5" />
          {loading 
            ? 'Traitement...' 
            : caisseMode === 'sale' 
              ? 'Valider & Facturer (F10)' 
              : 'Sauvegarder Livraison (F10)'
          }
        </button>

      </div>

    </div>
  );
};
