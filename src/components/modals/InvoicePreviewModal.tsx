import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { FileText, Download, Save, X, Printer, Check, Building2, User, Phone, Calendar, Hash } from 'lucide-react';
import { generateInvoicePDF } from '../../utils/exportPDF';
import { showToast } from '../ui/Toast';
import { AppLogo } from '../AppLogo';

export interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
  saleUnit?: string;
  initialStock?: number;
  finalStock?: number;
  unit?: string;
}

export interface InvoiceData {
  id: string | number;
  date: string;
  clientName?: string;
  clientPhone?: string;
  items: InvoiceItem[];
  type: 'sale' | 'quote' | 'delivery' | 'purchase';
  total: number;
  totalCost?: number;
  margin?: number;
  ref?: string;
}

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: InvoiceData;
  onSave?: (updatedData: InvoiceData) => Promise<void>;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  onSave
}) => {
  const [clientName, setClientName] = useState(data.clientName || '');
  const [clientPhone, setClientPhone] = useState(data.clientPhone || '');
  const [docDate, setDocDate] = useState(data.date ? data.date.split('T')[0] : '');
  const [docRef, setDocRef] = useState(data.ref || '');
  const [saving, setSaving] = useState(false);

  // Sync state with incoming props
  useEffect(() => {
    setClientName(data.clientName || '');
    setClientPhone(data.clientPhone || '');
    setDocDate(data.date ? data.date.split('T')[0] : new Date().toISOString().split('T')[0]);
    
    const prefix = data.type === 'quote' ? 'DEV' : data.type === 'delivery' ? 'BON' : 'FAC';
    setDocRef(data.ref || `${prefix}-${data.id.toString().slice(-6)}`);
  }, [data]);

  if (!isOpen) return null;

  const docTitle = data.type === 'quote' 
    ? 'Devis' 
    : data.type === 'delivery' 
      ? 'Bon de Livraison' 
      : 'Facture';

  const uppercaseDocTitle = data.type === 'quote' 
    ? 'DEVIS' 
    : data.type === 'delivery' 
      ? 'BON DE LIVRAISON' 
      : 'FACTURE';

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const updatedDate = docDate ? new Date(docDate + 'T12:00:00').toISOString() : data.date;
      await onSave({
        ...data,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        date: updatedDate,
        ref: docRef.trim()
      });
      showToast('Document mis à jour avec succès.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erreur lors de la mise à jour.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = () => {
    const mappedItems = data.items.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.qty * item.price,
      initialStock: item.initialStock,
      finalStock: item.finalStock,
      unit: item.unit || item.saleUnit
    }));

    generateInvoicePDF(
      mappedItems, 
      { name: clientName.trim() || 'Client', phone: clientPhone.trim() }, 
      data.type === 'delivery' ? 'delivery' : data.type === 'quote' ? 'quote' : 'sale',
      docRef,
      docDate
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex flex-col overflow-hidden animate-fade-scale">
      
      {/* ========================================================= */}
      {/* 1. TOP HEADER TOOLBAR CONTROL                             */}
      {/* ========================================================= */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-md z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand/10 text-brand rounded-2xl flex items-center justify-center border border-brand/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white capitalize">
              Éditeur de {docTitle}
            </h2>
            <p className="text-3xs sm:text-2xs text-slate-400 font-medium">
              Générez un document PDF professionnel pour l'impression ou le partage
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">{saving ? 'Enregistrement...' : 'Sauvegarder'}</span>
            </button>
          )}

          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-brand hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-brand/20 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger {docTitle} PDF</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition-all cursor-pointer"
            title="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. WORKSPACE AREA WITH A4 PAPER SHEET                    */}
      {/* ========================================================= */}
      <main className="flex-1 bg-slate-200 dark:bg-slate-950 p-4 sm:p-8 overflow-y-auto flex justify-center">
        
        {/* A4 Paper Container */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl w-full max-w-[820px] min-h-[980px] p-6 sm:p-12 flex flex-col justify-between font-sans text-slate-800 dark:text-slate-100 relative">
          
          <div className="space-y-8">
            
            {/* Header Document (Company & Metadata) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
              
              {/* Left: Company Identity */}
              <div className="flex items-center gap-4">
                <AppLogo size={56} className="shadow-sm" />
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Echos De Chez Moi
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Épicerie & Distribution Générale
                  </p>
                  <span className="text-2xs text-slate-400 block mt-1">
                    contact@echosdechezmoi.com
                  </span>
                </div>
              </div>

              {/* Right: Document Title & Metadata */}
              <div className="flex flex-col sm:items-end w-full sm:w-auto gap-2">
                <span className="text-2xl font-black text-brand tracking-wider font-sans uppercase">
                  {uppercaseDocTitle}
                </span>

                <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-400 font-bold uppercase text-3xs">Réf :</span>
                  <input
                    type="text"
                    value={docRef}
                    onChange={e => setDocRef(e.target.value)}
                    className="font-bold text-slate-800 dark:text-white bg-transparent border-b border-transparent focus:border-brand focus:outline-none w-28 text-right font-mono"
                    placeholder="FAC-000000"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-400 font-bold uppercase text-3xs">Date :</span>
                  <input
                    type="date"
                    value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                    className="font-semibold text-slate-700 dark:text-slate-200 bg-transparent border-b border-transparent focus:border-brand focus:outline-none text-right font-mono cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Client Details Framed Box */}
            <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row justify-between gap-4 shadow-sm">
              <div className="flex-1 space-y-1">
                <span className="text-3xs font-extrabold text-brand uppercase tracking-wider block">
                  Détails du Client / Destinataire
                </span>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-brand flex-shrink-0" />
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className="w-full text-sm font-bold bg-transparent border-b border-slate-300/50 dark:border-slate-700 focus:border-brand focus:outline-none py-0.5 text-slate-900 dark:text-white"
                    placeholder="Nom du Client / Entité..."
                  />
                </div>
              </div>

              <div className="w-full sm:w-64 space-y-1">
                <span className="text-3xs font-extrabold text-slate-400 uppercase tracking-wider block">
                  Contact / Téléphone
                </span>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    className="w-full text-sm font-semibold bg-transparent border-b border-slate-300/50 dark:border-slate-700 focus:border-brand focus:outline-none py-0.5 text-slate-800 dark:text-white"
                    placeholder="+225 00 00 00 00"
                  />
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-extrabold uppercase tracking-wider">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3 text-left">Description</th>
                    {data.type === 'delivery' ? (
                      <>
                        <th className="p-3 text-center w-24">Stock Init.</th>
                        <th className="p-3 text-center w-24">Qté Livrée</th>
                        <th className="p-3 text-center w-24">Stock Fin.</th>
                        <th className="p-3 text-right w-28">Prix U.</th>
                      </>
                    ) : (
                      <>
                        <th className="p-3 text-center w-24">Qté</th>
                        <th className="p-3 text-right w-28">Prix U.</th>
                        <th className="p-3 text-right w-32">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => {
                    const rowTotal = item.qty * item.price;
                    return (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/80 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-950/30 transition-colors">
                        <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{item.name}</td>
                        {data.type === 'delivery' ? (
                          <>
                            <td className="p-3 text-center font-mono text-slate-500">{item.initialStock ?? '-'}</td>
                            <td className="p-3 text-center font-extrabold text-brand">{item.qty} {item.unit || item.saleUnit || ''}</td>
                            <td className="p-3 text-center font-mono text-slate-500">{item.finalStock ?? '-'}</td>
                            <td className="p-3 text-right font-mono font-medium">{item.price.toLocaleString()} F</td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-center font-bold">{item.qty} {item.saleUnit || ''}</td>
                            <td className="p-3 text-right font-mono font-medium">{item.price.toLocaleString()} F</td>
                            <td className="p-3 text-right font-mono font-bold text-brand">{rowTotal.toLocaleString()} F</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Block */}
            <div className="flex justify-end pt-2">
              <div className="w-full sm:w-72 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-2xl space-y-2 shadow-sm">
                <div className="flex justify-between items-center text-xs text-slate-500 font-semibold">
                  <span>Total HT :</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{data.total.toLocaleString()} FCFA</span>
                </div>
                <div className="border-t border-emerald-500/20 pt-2 flex justify-between items-center text-sm font-extrabold">
                  <span className="text-slate-800 dark:text-white uppercase tracking-wider text-2xs">Net à Payer :</span>
                  <span className="text-brand text-lg font-mono">{data.total.toLocaleString()} FCFA</span>
                </div>
              </div>
            </div>

          </div>

          {/* Footer & Signature Section */}
          <div className="pt-12 space-y-10 border-t border-slate-100 dark:border-slate-800/80 mt-12">
            
            <div className="flex justify-between items-end px-4">
              <div className="text-center space-y-12">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Signature Client</span>
                <div className="w-48 border-b-2 border-dashed border-slate-300 dark:border-slate-700" />
              </div>

              <div className="text-center space-y-12">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Signature Vendeur</span>
                <div className="w-48 border-b-2 border-dashed border-slate-300 dark:border-slate-700" />
              </div>
            </div>

            <div className="text-center text-3xs font-semibold text-slate-400 uppercase tracking-widest pt-4">
              Echos De Chez Moi © 2026 — Document généré le {new Date().toLocaleDateString('fr-FR')}
            </div>

          </div>

        </div>

      </main>

    </div>
  );
};
