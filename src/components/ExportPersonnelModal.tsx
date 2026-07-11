// ============================================================
// src/components/ExportPersonnelModal.tsx
// Modale de sélection de colonnes avant l'export PDF du personnel
// ============================================================

import React, { useState } from 'react';
import { Plus, Download, X } from 'lucide-react';
import { Modal } from './ui/Modal';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
type PersonnelColumn = 'nomComplet' | 'type' | 'statut' | 'site' | 'contact' | 'salaire';

interface ColDef {
  id: PersonnelColumn;
  label: string;
  description: string;
}

const AVAILABLE_COLUMNS: ColDef[] = [
  { id: 'nomComplet', label: 'Nom & Prénom',   description: 'Nom complet de l\'employé' },
  { id: 'type',       label: 'Type',           description: 'CDI/CDD ou Temporaire' },
  { id: 'statut',     label: 'Statut',         description: 'Actif ou Renvoyé' },
  { id: 'site',       label: 'Site',           description: 'Site d\'affectation' },
  { id: 'contact',    label: 'Contact',        description: 'Numéro de téléphone' },
  { id: 'salaire',    label: 'Salaire',        description: 'Salaire de base (FCFA)' },
];

interface ExportPersonnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (selectedCols: PersonnelColumn[], customCols: string[]) => void;
}

// ----------------------------------------------------------------
// Composant
// ----------------------------------------------------------------
export const ExportPersonnelModal: React.FC<ExportPersonnelModalProps> = ({
  isOpen,
  onClose,
  onExport,
}) => {
  const [selectedCols, setSelectedCols] = useState<PersonnelColumn[]>([
    'nomComplet', 'type', 'statut', 'site', 'contact', 'salaire',
  ]);

  const [customCols, setCustomCols] = useState<string[]>([]);
  const [newCustomCol, setNewCustomCol] = useState('');

  const toggleCol = (id: PersonnelColumn) => {
    setSelectedCols(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const addCustomCol = () => {
    const trimmed = newCustomCol.trim();
    if (trimmed && !customCols.includes(trimmed)) {
      setCustomCols(prev => [...prev, trimmed]);
    }
    setNewCustomCol('');
  };

  const removeCustomCol = (col: string) => {
    setCustomCols(prev => prev.filter(c => c !== col));
  };

  const handleExport = () => {
    if (selectedCols.length === 0) return;
    onExport(selectedCols, customCols);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exporter le personnel en PDF"
      size="md"
    >
      {/* Colonnes disponibles */}
      <div className="px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Colonnes disponibles
        </p>
        {AVAILABLE_COLUMNS.map(col => (
          <label
            key={col.id}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedCols.includes(col.id)}
              onChange={() => toggleCol(col.id)}
              className="w-4 h-4 text-brand accent-emerald-600 rounded"
            />
            <div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {col.label}
              </span>
              <span className="text-xs text-slate-400 ml-2">{col.description}</span>
            </div>
          </label>
        ))}
      </div>

      {/* Colonnes personnalisées vides */}
      <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Colonnes personnalisées (vides)
        </p>

        {customCols.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {customCols.map(c => (
              <span
                key={c}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg"
              >
                {c}
                <button
                  onClick={() => removeCustomCol(c)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newCustomCol}
            onChange={e => setNewCustomCol(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomCol()}
            placeholder="Ex: Signature, Observations..."
            className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            onClick={addCustomCol}
            disabled={!newCustomCol.trim()}
            className="flex items-center gap-1 px-3 py-2 text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
        <span className="text-xs text-slate-400">
          {selectedCols.length} colonne(s) sélectionnée(s)
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={selectedCols.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#0F5132' }}
          >
            <Download className="w-4 h-4" />
            Exporter PDF
          </button>
        </div>
      </div>
    </Modal>
  );
};
