import Dexie, { type Table } from 'dexie';

// --- TYPES & INTERFACES ---

export interface Product {
  id: number;
  name: string;
  category: string;
  stock: number;
  purchasePrice: number;
  purchaseUnit: string;
  salePrice: number;
  saleUnit: string;
  type: 'finished' | 'raw';
}

export interface SaleItem {
  name: string;
  qty: number;
  price: number;
  cost: number;
  total: number;
  totalCost: number;
}

export interface DailyRecord {
  id: number;
  type: 'sale';
  date: string;
  items: SaleItem[];
  total: number;
  totalCost: number;
  margin: number;
}

export interface Expense {
  id: number;
  date: string;
  amount: number;
  category: string;
  description: string;
  type: 'general' | 'purchase';
  productName?: string;
  supplier?: string;
  transportCost?: number | null;
  lossPercentage?: number | null;
  paymentType?: 'total' | 'partial';
  paidAmount?: number;
  remainingAmount?: number;
}

export interface Client {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
}

export interface DeliveryItem {
  name: string;
  productId: number;
  qty: number;
  initialStock: number;
  finalStock: number;
  price: number;
  cost: number;
  total: number;
  totalCost: number;
  unit?: string;
}

export interface Quote {
  id: number;
  type: 'delivery';
  date: string;
  items: DeliveryItem[];
  total: number;
  clientName: string;
  clientPhone?: string;
}

export interface Income {
  id: number;
  date: string;
  amount: number;
  receivedBy: string;
  source?: string;
  description?: string;
}

export interface Production {
  id: number;
  date: string;
  productName: string;
  rawQuantity: number;
  finalQuantity: number;
  totalWeight?: number;
  description?: string;
  timestamp?: number;
}

export interface RawMaterial {
  id: number;
  date: string;
  productName: string;
  arrivedQty: number;
  outQty: number;
  finalStock: number;
  rawQuantity?: number;
  finalQuantity?: number;
  totalWeight?: number;
  description?: string;
  timestamp?: number;
}

export interface AppSetting {
  key: string;
  value: any;
  timestamp: number;
}

export interface RhEmployee {
  id: number;
  nom: string;
  prenom: string;
  site: string;
  type: 'permanent' | 'temporaire';
  salaireBase: number;
  contact: string;
  statut: 'actif' | 'renvoye';
  dateRenvoi: string | null;
  dateEmbauche: string | null;
}

export interface RhAppDataPayload {
  employees: RhEmployee[];
  attendance: Record<string, number>; // key: `${empId}_${year}-${month}-${day}` -> status
  payrollExtras: Record<string, { prime: number; dette: number; retenue: number }>; // key: `${empId}_${year}-${month}`
  visibleSundays: string[]; // array of Sunday date strings
}

export interface RhAppData {
  key: string; // 'rh_app_data'
  value: RhAppDataPayload;
}

export interface TabPermission {
  visible: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export interface UserPermissions {
  chatbotEnabled: boolean;
  tabs?: Record<string, TabPermission>;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName?: string | null;
  role: 'admin' | 'user' | 'lecteur';
  status: 'active' | 'inactive';
  hashedToken?: string;
  lastEmailVerificationCheck?: number;
  createdAt?: number;
  updatedAt?: number;
  permissions?: UserPermissions;
}

export interface ActionLog {
  id: string; // "log_${timestamp}_${rand}"
  timestamp: number;
  userEmail: string;
  userName?: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'export' | 'auth_fail';
  tabId: string; // e.g. 'caisse', 'stock', 'rh', 'comptes', 'production'
  details: string;
  targetId?: string;
}

// --- DEXIE CLASS DEFINITION ---

export class StockExpertDB extends Dexie {
  inventory!: Table<Product, number>;
  dailyRecords!: Table<DailyRecord, number>;
  expenses!: Table<Expense, number>;
  clients!: Table<Client, string>;
  suppliers!: Table<Supplier, string>;
  quotes!: Table<Quote, number>;
  income!: Table<Income, number>;
  productions!: Table<Production, number>;
  rawMaterials!: Table<RawMaterial, number>;
  appSettings!: Table<AppSetting, string>;
  rhAppData!: Table<RhAppData, string>;
  userAccounts!: Table<UserAccount, string>;
  actionLogs!: Table<ActionLog, string>;

  constructor() {
    super('StockExpertDB');
    this.version(3).stores({
      inventory: '&id, name, category, type',
      dailyRecords: '&id, date, clientName',
      expenses: '&id, date',
      clients: '&id, name',
      suppliers: '&id, name',
      quotes: '&id, id, clientName, date',
      income: '&id, date',
      productions: '&id, date',
      rawMaterials: '&id, date',
      appSettings: '&key, timestamp',
      rhAppData: '&key',
      userAccounts: '&uid, email, role, status',
      actionLogs: '&id, timestamp, userEmail, action, tabId'
    });
  }
}

export const db = new StockExpertDB();
