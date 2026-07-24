// ============================================================
// src/utils/exportHelpers.ts
// Helpers partagés : formatage, filtres temporels, header PDF Stock
// ============================================================

export const BRAND_GREEN: [number, number, number] = [31, 122, 62];

// --- Formatage ---

/** Formate un nombre avec espace comme séparateur de milliers (style FCFA) */
export const formatNum = (n: number): string =>
  Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/** Formatage monétaire avec suffixe F */
export const formatMoney = (n: number): string => `${formatNum(n)} F`;

/** Date ISO vers string lisible 'dd/mm/yyyy' */
export const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR');
  } catch {
    return dateStr;
  }
};

/** Date ISO vers heure 'HH:mm' */
export const formatTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// --- Filtres temporels ---

/** Extrait de manière robuste l'année et le mois (0-11) de tout format de date (French DD/MM/YYYY, ISO, Date obj) */
export const getItemYearAndMonth = (dateStr: any): { year: number; month: number } | null => {
  if (!dateStr) return null;
  
  if (typeof dateStr === 'string') {
    const trimmed = dateStr.trim();
    // Format français DD/MM/YYYY
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length >= 3) {
        const month = parseInt(parts[1], 10) - 1; // 0-indexed month
        const year = parseInt(parts[2].slice(0, 4), 10);
        if (!isNaN(year) && !isNaN(month)) return { year, month };
      }
    }
    // Format ISO YYYY-MM-DD
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length >= 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-indexed month
        if (!isNaN(year) && !isNaN(month)) return { year, month };
      }
    }
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  return null;
};

/** Filtre un tableau d'objets avec champ `date` selon l'année sélectionnée et la période */
export const filterByTime = <T extends { date: string }>(list: T[], filter: string, targetYear?: number): T[] => {
  const now = new Date();
  const currentYear = targetYear || now.getFullYear();

  return list.filter(item => {
    const parsed = getItemYearAndMonth(item.date);
    if (!parsed) return false;

    // Filtre strict sur l'année sélectionnée
    if (parsed.year !== currentYear) {
      return false;
    }

    switch (filter) {
      case 'today': {
        const d = new Date(item.date);
        return !isNaN(d.getTime()) && d.toDateString() === now.toDateString();
      }
      case 'week': {
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay() + 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        const d = new Date(item.date);
        return !isNaN(d.getTime()) && d >= start && d <= end;
      }
      case 'month':
        return parsed.month === now.getMonth() && parsed.year === currentYear;
      case 'year':
      default:
        return parsed.year === currentYear;
    }
  });
};

/** Libellé lisible du filtre de période */
export const getFilterLabel = (filter: string): string =>
  ({
    today: "Aujourd'hui",
    week: 'Cette semaine',
    month: 'Ce mois',
    year: 'Cette année',
    all: 'Tout',
  }[filter] || 'Tout');

/** Suffixe pour le nom de fichier exporté */
export const getFilterSuffix = (filter: string): string =>
  ({
    today: "Aujourd-hui",
    week: 'Cette-semaine',
    month: 'Ce-mois',
    year: 'Cette-annee',
    all: 'Tout',
  }[filter] || 'Tout');

/** Suffixe de date pour les noms de fichier */
export const getDateSuffix = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --- Lecture des données partagées ---

export const getCompanyInfo = (): { name: string; contact: string; footer: string } => {
  try {
    return JSON.parse(localStorage.getItem('stock_expert_company') || '{}');
  } catch {
    return { name: '', contact: '', footer: '' };
  }
};

export const getLogoData = (): string | null => localStorage.getItem('stock_expert_logo');

// --- Header PDF commun (module Stock) ---

/**
 * Ajoute l'en-tête standard à un doc jsPDF.
 * Retourne la position Y après l'en-tête (prêt pour autoTable startY).
 */
export const addPDFHeader = (doc: any, title: string, subtitle?: string): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  const logoData = getLogoData();
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 15, y, 25, 25);
    } catch {
      // Ignorer si le logo est invalide
    }
  }

  doc.setFontSize(18);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(title, pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Date d'export: ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, y + 14, {
    align: 'center',
  });

  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(subtitle, pageWidth / 2, y + 19, { align: 'center' });
    y += 6;
  }

  const company = getCompanyInfo();
  const contact = company.contact || '';
  doc.setFontSize(9);
  doc.setTextColor(0);
  let contactY = y + 21;
  contact.split('\n').forEach((line: string) => {
    doc.text(line, pageWidth / 2, contactY, { align: 'center' });
    contactY += 4;
  });

  return contactY + 5;
};

/** Ajoute le pied de page (footer) sur la page courante */
export const addPDFFooter = (doc: any): void => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const company = getCompanyInfo();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    company.footer || 'Merci de votre confiance !',
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );
};

// --- Styles communs autoTable ---

export const tableHeadStyles = {
  fillColor: BRAND_GREEN,
  textColor: [255, 255, 255] as [number, number, number],
  fontStyle: 'bold' as const,
  halign: 'center' as const,
  valign: 'middle' as const,
  fontSize: 9,
};
