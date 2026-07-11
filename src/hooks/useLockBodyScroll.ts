import { useEffect } from 'react';

/**
 * Hook pour verrouiller le défilement du body lors de l'ouverture d'une modale.
 * @param active Indique si la modale est active (ouvert)
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;

    // Sauvegarder le style d'origine
    const originalStyle = window.getComputedStyle(document.body).overflow;
    
    // Verrouiller le défilement
    document.body.style.overflow = 'hidden';

    // Rétablir à la désactivation
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [active]);
}
