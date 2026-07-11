// ============================================================
// src/utils/exportRHHelpers.ts
// Helpers spécifiques au module RH (header bandeau, removeAccents, formatMoney)
// ============================================================

export const RH_GREEN: [number, number, number] = [15, 81, 50];   // #0F5132
export const RH_YELLOW: [number, number, number] = [255, 193, 7];  // #FFC107

/** Supprime les accents pour compatibilité jsPDF */
export const removeAccents = (str: string): string =>
  str.replace(/[éèêëàâîïôùûüç]/gi, (c) =>
    ({
      é: 'e', è: 'e', ê: 'e', ë: 'e',
      à: 'a', â: 'a',
      î: 'i', ï: 'i',
      ô: 'o',
      ù: 'u', û: 'u', ü: 'u',
      ç: 'c',
    }[c] || c)
  );

/** Formatage monétaire RH (séparateur espace + F) */
export const formatMoney = (n: number): string =>
  `${Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')} F`;

/** Suffixe de date pour les noms de fichier */
export const getDateSuffix = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Noms des mois en français */
export const MONTHS_FR = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
];

/**
 * Ajoute le bandeau en-tête RH (bande verte foncée + bande jaune + logo + titres).
 * Retourne startY = 68 (position Y pour le premier autoTable).
 */
export const addPdfHeaderRH = (doc: any, title: string, logoSrc?: string | null): number => {
  const pageWidth = doc.internal.pageSize.width;

  // Retrieve logo from localStorage if not passed
  const activeLogo = logoSrc || localStorage.getItem('stock_expert_logo');

  // Bande verte foncée (h=58mm)
  doc.setFillColor(...RH_GREEN);
  doc.rect(0, 0, pageWidth, 58, 'F');

  // Bande jaune fine (h=3mm)
  doc.setFillColor(...RH_YELLOW);
  doc.rect(0, 58, pageWidth, 3, 'F');

  let textLeftOffset = 15;

  // Render logo if exists - increased logo size and positioned it nicely
  if (activeLogo) {
    try {
      let format = 'PNG';
      if (activeLogo.startsWith('data:image/jpeg') || activeLogo.startsWith('data:image/jpg')) {
        format = 'JPEG';
      } else if (activeLogo.startsWith('data:image/webp')) {
        format = 'WEBP';
      }
      doc.addImage(activeLogo, format, 15, 6, 42, 42);
      textLeftOffset = 64; // Offset text to the right of the larger logo
    } catch (err) {
      console.warn('Failed to add logo to PDF:', err);
    }
  }

  // Nom de l'entreprise
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Echos De chez Moi', textLeftOffset, 20);

  // Sous-titre
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Services RH & Paie', textLeftOffset, 30);

  // Titre du document (à droite) - shifted down slightly (y=26) to prevent overlapping with Echos De chez Moi
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(removeAccents(title), pageWidth - 15, 26, { align: 'right' });

  // Date du jour (à droite) - shifted down to y=40 to align cleanly
  const dateStr = removeAccents(
    new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  );
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(dateStr, pageWidth - 15, 40, { align: 'right' });

  return 66; // startY après le bandeau vert (58) + jaune (3) + marge de sécurité
};
