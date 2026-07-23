// ============================================================
// src/components/ui/Modal.tsx
// Composant Modal générique basé sur React Portal.
// Le portal rend le contenu directement dans document.body,
// contournant tout contexte overflow/transform du Layout.
// ============================================================

import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  /** Si true, la modale est visible */
  isOpen: boolean;
  /** Callback de fermeture */
  onClose: () => void;
  /** Titre affiché dans le header */
  title?: React.ReactNode;
  /** Contenu de la modale */
  children: React.ReactNode;
  /** Largeur max Tailwind : 'sm' | 'md' | 'lg' | 'xl' | '2xl' */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Icône optionnelle dans le header */
  icon?: React.ReactNode;
  /** Si true, ferme la modale au clic sur l'overlay */
  closeOnOverlay?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  icon,
  closeOnOverlay = true,
}) => {
  // Bloquer le défilement du body lorsque la modale est ouverte
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // Fermer au clavier (Escape)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    // Overlay – rendu directement dans <body>, jamais affecté par overflow parent
    <div
      className="fixed top-0 left-0 w-screen h-screen z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm"
      onClick={closeOnOverlay ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      {/* Boîte de dialogue */}
      <div
        className={`relative w-full ${sizeClasses[size]} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl flex flex-col max-h-[90vh] animate-fade-scale`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixe en haut) */}
        {title !== undefined && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              {icon && <span className="text-brand">{icon}</span>}
              {typeof title === 'string' ? (
                <h3 className="font-bold text-slate-800 dark:text-white">{title}</h3>
              ) : (
                title
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
