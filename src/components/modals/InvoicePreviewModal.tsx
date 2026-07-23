import React, { useState, useEffect } from 'react';
import { FileText, Download, Save, X, Calendar } from 'lucide-react';
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
    <div className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex flex-col overflow-hidden animate-fade-scale">
      
      {/* ========================================================= */}
      {/* 1. TOP HEADER TOOLBAR CONTROL                             */}
      {/* ========================================================= */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white capitalize">
              éditeur de {docTitle}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Générez un document PDF professionnel
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-[#14522D] hover:bg-[#0e3b20] text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger {docTitle} PDF</span>
          </button>

          {onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              <span>{saving ? 'Enregistrement...' : 'Sauvegarder'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. WORKSPACE AREA WITH A4 PAPER SHEET                    */}
      {/* ========================================================= */}
      <main className="flex-1 bg-[#f0f2f5] dark:bg-slate-950 p-4 sm:p-8 overflow-y-auto flex justify-center">
        
        {/* A4 Paper Container */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm w-full max-w-[850px] min-h-[920px] p-8 sm:p-12 flex flex-col justify-between font-sans text-slate-800 dark:text-slate-100 relative">
          
          <div className="space-y-6">
            
            {/* Header Document (Company & Metadata) */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
              
              {/* Left: Company Identity */}
              <div className="space-y-3">
                <AppLogo size={48} className="shadow-none border-none p-0" />
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                    Echos De Chez Moi
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    contact@echosdechezmoi.com
                  </p>
                </div>
              </div>

              {/* Right: Document Title & Metadata */}
              <div className="flex flex-col sm:items-end w-full sm:w-auto gap-2">
                <span className="text-3xl font-black text-[#14522D] tracking-wider uppercase">
                  {uppercaseDocTitle}
                </span>

                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                  <span>Date:</span>
                  <input
                    type="date"
                    value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                    className="font-semibold text-slate-800 dark:text-slate-200 bg-transparent border-b border-slate-200 focus:border-[#14522D] focus:outline-none text-right cursor-pointer"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-semibold">
                  <span className="font-bold text-slate-800 dark:text-white">Réf:</span>
                  <input
                    type="text"
                    value={docRef}
                    onChange={e => setDocRef(e.target.value)}
                    className="font-bold text-slate-900 dark:text-white bg-transparent border-b border-slate-200 focus:border-[#14522D] focus:outline-none w-28 text-right font-mono"
                    placeholder="FAC-849898"
                  />
                </div>
              </div>
            </div>

            {/* Client Details Framed Box */}
            <div className="bg-[#eef8f2] dark:bg-emerald-950/20 border border-[#d2efe0] dark:border-emerald-900/30 rounded-xl p-4 my-6 space-y-3">
              <span className="text-xs font-extrabold text-[#14522D] tracking-wider uppercase block">
                DÉTAILS DU CLIENT
              </span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-1">
                    Nom / Entité:
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border-none rounded-full px-4 py-1.5 text-xs text-slate-800 dark:text-white shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#14522D]"
                    placeholder="Nom du Client"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-1">
                    Contact / Tél:
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border-none rounded-full px-4 py-1.5 text-xs text-slate-800 dark:text-white shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#14522D]"
                    placeholder="Tél du Client"
                  />
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[#14522D] font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-2 text-center w-10">#</th>
                    <th className="py-3 px-2 text-left">DESCRIPTION</th>
                    {data.type === 'delivery' ? (
                      <>
                        <th className="py-3 px-2 text-center w-24">STOCK INITIAL</th>
                        <th className="py-3 px-2 text-center w-24">QTÉ LIVRÉE</th>
                        <th className="py-3 px-2 text-center w-24">STOCK FINAL</th>
                        <th className="py-3 px-2 text-right w-24">PRIX U.</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3 px-2 text-center w-24">QTÉ</th>
                        <th className="py-3 px-2 text-right w-24">PRIX U.</th>
                        <th className="py-3 px-2 text-right w-28">TOTAL</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.items.map((item, idx) => {
                    const rowTotal = item.qty * item.price;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/30 transition-colors">
                        <td className="py-3 px-2 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-2 font-medium text-slate-800 dark:text-slate-100">{item.name}</td>
                        {data.type === 'delivery' ? (
                          <>
                            <td className="py-3 px-2 text-center font-mono text-slate-500">{item.initialStock ?? '-'}</td>
                            <td className="py-3 px-2 text-center font-bold text-[#14522D]">{item.qty} {item.unit || item.saleUnit || 'Unit'}</td>
                            <td className="py-3 px-2 text-center font-mono text-slate-500">{item.finalStock ?? '-'}</td>
                            <td className="py-3 px-2 text-right font-mono">{item.price}</td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-2 text-center font-medium text-slate-700 dark:text-slate-300">{item.qty} {item.saleUnit || 'Unit'}</td>
                            <td className="py-3 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{item.price}</td>
                            <td className="py-3 px-2 text-right font-mono font-bold text-slate-800 dark:text-slate-100">{rowTotal}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Block */}
            <div className="flex justify-end pt-4">
              <div className="w-full sm:w-64 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Total HT</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{data.total} FCFA</span>
                </div>
                <div className="pt-2 flex justify-between items-center text-sm font-extrabold text-[#14522D]">
                  <span className="font-bold text-slate-900 dark:text-white">Net é Payer</span>
                  <span className="font-mono text-base">{data.total} FCFA</span>
                </div>
              </div>
            </div>

          </div>

          {/* Footer & Signature Section */}
          <div className="pt-12 space-y-8">
            
            <div className="flex justify-between items-end px-4">
              <div className="text-center space-y-10">
                <span className="text-xs font-semibold text-slate-400 block">Signature Client</span>
                <div className="w-56 border-b border-dashed border-slate-300 dark:border-slate-700" />
              </div>

              <div className="text-center space-y-10">
                <span className="text-xs font-semibold text-slate-400 block">Signature Vendeur</span>
                <div className="w-56 border-b border-dashed border-slate-300 dark:border-slate-700" />
              </div>
            </div>

            <div className="text-center text-[11px] text-slate-400 pt-4">
              Echos De Chez Moi © 2026
            </div>

          </div>

        </div>

      </main>

    </div>
  );
};
