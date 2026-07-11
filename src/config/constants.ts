export const SITES = ['Douala', 'Kribi', 'Sikoum', 'Yaoundé', 'Bafoussam'];
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export const CATEGORIES_DEPENSES = ['Loyers', 'Électricité', 'Eau', 'Salaires', 'Matières Premières', 'Transport', 'Marketing', 'Divers'];
export const CATEGORIES_PRODUITS = ['Boissons', 'Aliments', 'Services', 'Matières Premières', 'Divers'];

// LocalStorage/AppSettings Keys
export const LOGO_KEY = 'stock_expert_logo';
export const THEME_COLOR_KEY = 'stock_expert_theme_color';
export const THEME_KEY = 'stock_expert_theme';
export const COMPANY_KEY = 'stock_expert_company';
export const APP_YEAR_KEY = 'stock_expert_year';
export const ODOO_BRIDGE_KEY = 'odooBridge';

export const DEFAULT_THEME_COLOR = '#14522D';

export interface CompanyInfo {
  name: string;
  contact: string;
  footer: string;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'Echos De Chez Moi',
  contact: 'contact@echosdechezmoi.com',
  footer: 'Echos De Chez Moi © 2026'
};
