// ============================================================
// src/components/ExportButton.tsx
// Bouton générique d'export (PDF rouge + Excel vert) avec icônes SVG intégrées
// ============================================================

import React from 'react';
import { showToast } from './ui/Toast';

// --- Icônes SVG inline (pas de dépendance FontAwesome requise) ---

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9.5 14.5h1.25v-1.25h.625c.69 0 1.25-.56 1.25-1.25s-.56-1.25-1.25-1.25H9.5v3.75zm1.25-2.5h.625a.25.25 0 0 1 0 .5h-.625V12zm3.25 2.5h-1.25v-3.75H14a1.875 1.875 0 0 1 0 3.75zm-1.25-1.25h.625a.625.625 0 0 0 0-1.25H13V13.5zm3.5 1.25h-1.25v-3.75h3.125v1.25h-1.875v.625h1.25v1.25h-1.25V14.75z" />
  </svg>
);

const ExcelIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17l2-3-2-3h1.5l1.25 2 1.25-2H13.5l-2 3 2 3H12l-1.25-2L9.5 17H8z" />
  </svg>
);

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface ExportButtonProps {
  /** Callback déclenché lors du clic PDF. Si absent, bouton PDF masqué. */
  onPDF?: () => void;
  /** Callback déclenché lors du clic Excel. Si absent, bouton Excel masqué. */
  onXLSX?: () => void;
  /** Afficher les libellés texte à côté des icônes (défaut : true) */
  showLabels?: boolean;
  /** Classes supplémentaires pour le conteneur */
  className?: string;
  /** Variante de taille : 'sm' (défaut) | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg';
}

// ----------------------------------------------------------------
// Composant ExportButton
// ----------------------------------------------------------------
export const ExportButton: React.FC<ExportButtonProps> = ({
  onPDF,
  onXLSX,
  showLabels = true,
  className = '',
  size = 'sm',
}) => {
  const handlePDF = () => {
    try {
      onPDF?.();
    } catch (err: any) {
      console.error('[ExportPDF] Error:', err);
      showToast("Erreur lors de l'export PDF.", 'error');
    }
  };

  const handleXLSX = () => {
    try {
      onXLSX?.();
    } catch (err: any) {
      console.error('[ExportXLSX] Error:', err);
      showToast("Erreur lors de l'export Excel.", 'error');
    }
  };

  if (!onPDF && !onXLSX) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {onPDF && (
        <button
          type="button"
          onClick={handlePDF}
          title="Exporter en PDF"
          className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2 cursor-pointer"
        >
          <span className="text-red-500 flex items-center justify-center flex-shrink-0">
            <PdfIcon />
          </span>
          {showLabels && (
            <span className="text-left leading-tight">
              Exporter<br/>en PDF
            </span>
          )}
        </button>
      )}

      {onXLSX && (
        <button
          type="button"
          onClick={handleXLSX}
          title="Exporter en Excel"
          className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2 cursor-pointer"
        >
          <span className="text-emerald-650 flex items-center justify-center flex-shrink-0">
            <ExcelIcon />
          </span>
          {showLabels && (
            <span className="text-left leading-tight">
              Exporter<br/>en Excel
            </span>
          )}
        </button>
      )}
    </div>
  );
};

// ----------------------------------------------------------------
// ExportButtonGroup – variante avec style bouton (outlined/card)
// ----------------------------------------------------------------
interface ExportButtonGroupProps {
  onPDF?: () => void;
  onXLSX?: () => void;
  disabled?: boolean;
}

export const ExportButtonGroup: React.FC<ExportButtonGroupProps> = ({ onPDF, onXLSX, disabled }) => (
  <div className="flex items-center gap-2">
    {onPDF && (
      <button
        type="button"
        onClick={onPDF}
        disabled={disabled}
        className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <span className="text-red-500 flex items-center justify-center flex-shrink-0">
          <PdfIcon />
        </span>
        <span className="text-left leading-tight">
          Exporter<br/>en PDF
        </span>
      </button>
    )}
    {onXLSX && (
      <button
        type="button"
        onClick={onXLSX}
        disabled={disabled}
        className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <span className="text-emerald-650 flex items-center justify-center flex-shrink-0">
          <ExcelIcon />
        </span>
        <span className="text-left leading-tight">
          Exporter<br/>en Excel
        </span>
      </button>
    )}
  </div>
);
