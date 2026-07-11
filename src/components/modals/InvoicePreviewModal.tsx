import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Printer, Save, Check } from 'lucide-react';
import { generateInvoicePDF, exportDailyReportPDF } from '../../utils/exportPDF';
import { showToast } from '../ui/Toast';

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
    setDocDate(data.date ? data.date.split('T')[0] : '');
    setDocRef(data.ref || `FAC-${data.id.toString().slice(-6)}`);
  }, [data]);

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

  const handlePrint = () => {
    const docDataForPrint = {
      ...data,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      date: docDate ? new Date(docDate + 'T12:00:00').toISOString() : data.date,
      ref: docRef.trim()
    };

    // CartItem requires a calculated total field
    const mappedItems = docDataForPrint.items.map(item => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.qty * item.price
    }));

    if (data.type === 'delivery') {
      generateInvoicePDF(mappedItems, { name: clientName, phone: clientPhone }, 'quote');
    } else {
      generateInvoicePDF(mappedItems, { name: clientName, phone: clientPhone }, data.type === 'quote' ? 'quote' : 'sale');
    }
  };

  const renderTableHeaders = () => {
    if (data.type === 'delivery') {
      return (
        <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200/40 dark:border-slate-800/40 font-bold text-slate-500">
          <th className="p-2 text-left">Produit</th>
          <th className="p-2 text-center w-24">Initial</th>
          <th className="p-2 text-center w-24">Livré</th>
          <th className="p-2 text-center w-24">Final</th>
          <th className="p-2 text-right w-28">Prix U.</th>
        </tr>
      );
    }
    return (
      <tr className="bg-slate-100 dark:bg-slate-950 border-b border-slate-200/40 dark:border-slate-800/40 font-bold text-slate-500">
        <th className="p-2 text-left">Produit</th>
        <th className="p-2 text-center w-24">Qté / Unité</th>
        <th className="p-2 text-right w-28">Prix U. (FCFA)</th>
        <th className="p-2 text-right w-28">Total (FCFA)</th>
      </tr>
    );
  };

  const renderTableRows = () => {
    return data.items.map((item, idx) => {
      if (data.type === 'delivery') {
        return (
          <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            <td className="p-2 font-medium">{item.name}</td>
            <td className="p-2 text-center font-mono">{item.initialStock ?? '-'}</td>
            <td className="p-2 text-center font-bold text-brand">{item.qty} {item.unit || ''}</td>
            <td className="p-2 text-center font-mono">{item.finalStock ?? '-'}</td>
            <td className="p-2 text-right font-mono">{item.price.toLocaleString()} F</td>
          </tr>
        );
      }
      return (
        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
          <td className="p-2 font-medium">{item.name}</td>
          <td className="p-2 text-center font-bold">{item.qty} {item.saleUnit || ''}</td>
          <td className="p-2 text-right font-mono">{item.price.toLocaleString()} F</td>
          <td className="p-2 text-right font-mono font-bold text-brand">{(item.qty * item.price).toLocaleString()} F</td>
        </tr>
      );
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Éditeur de ${data.type === 'sale' ? 'Facture' : data.type === 'quote' ? 'Devis' : 'Bon de livraison'}`}
      icon={<Printer className="w-5 h-5" />}
      size="lg"
    >
      <div className="p-6 flex flex-col gap-4">
        
        {/* Inline editable header details */}
        <div className="border border-slate-200/60 dark:border-slate-800/80 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col gap-3">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-3xs font-bold uppercase text-slate-400">Réf Document</label>
              <input
                type="text"
                value={docRef}
                onChange={e => setDocRef(e.target.value)}
                className="w-full text-xs font-bold bg-transparent border-b border-transparent focus:border-brand hover:border-slate-200 dark:hover:border-slate-800 focus:outline-none py-0.5 text-slate-800 dark:text-white transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-3xs font-bold uppercase text-slate-400">Date du jour</label>
              <input
                type="date"
                value={docDate}
                onChange={e => setDocDate(e.target.value)}
                className="w-full text-xs font-semibold bg-transparent border-b border-transparent focus:border-brand hover:border-slate-200 dark:hover:border-slate-800 focus:outline-none py-0.5 text-slate-800 dark:text-white transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-3xs font-bold uppercase text-slate-400">Nom Destinataire</label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full text-xs font-semibold bg-transparent border-b border-transparent focus:border-brand hover:border-slate-200 dark:hover:border-slate-800 focus:outline-none py-0.5 text-slate-800 dark:text-white transition-all"
                placeholder="Client Comptoir / Vente POS"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-3xs font-bold uppercase text-slate-400">Téléphone destinataire</label>
              <input
                type="text"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full text-xs font-semibold bg-transparent border-b border-transparent focus:border-brand hover:border-slate-200 dark:hover:border-slate-800 focus:outline-none py-0.5 text-slate-800 dark:text-white transition-all"
                placeholder="Optionnel"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Column Table */}
        <div className="border border-slate-200/60 dark:border-slate-800/80 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              {renderTableHeaders()}
            </thead>
            <tbody>
              {renderTableRows()}
            </tbody>
          </table>
        </div>

        {/* Total block */}
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80 font-bold">
          <span className="text-slate-400 text-xs">Montant total:</span>
          <span className="text-brand text-lg font-mono">{data.total.toLocaleString()} FCFA</span>
        </div>

        {/* Actions buttons */}
        <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
          
          {onSave && (
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={saving}
              className="btn-secondary flex items-center gap-1.5 border-brand/40 text-brand dark:text-green-400 dark:border-green-900/50 hover:bg-brand/10"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
          )}

          <button onClick={handlePrint} className="btn-primary flex items-center gap-1.5">
            <Printer className="w-4.5 h-4.5" />
            Imprimer PDF
          </button>
        </div>
      </div>
    </Modal>
  );
};
