export type PhoneCondition =
  | 'nowy'
  | 'idealny'
  | 'bardzo_dobry'
  | 'dobry'
  | 'zadrapania'
  | 'uszkodzony';

export const PHONE_CONDITIONS: { value: PhoneCondition; label: string }[] = [
  { value: 'nowy', label: 'Nowy' },
  { value: 'idealny', label: 'Idealny' },
  { value: 'bardzo_dobry', label: 'Bardzo dobry' },
  { value: 'dobry', label: 'Dobry' },
  { value: 'zadrapania', label: 'Zadrapania' },
  { value: 'uszkodzony', label: 'Uszkodzony' },
];

export const STORAGE_OPTIONS = [
  '64 GB',
  '128 GB',
  '256 GB',
  '512 GB',
  '1 TB',
] as const;

export type StorageOption = (typeof STORAGE_OPTIONS)[number] | string;

export interface Model {
  id: string;
  name: string;
  createdAt: string;
}

export interface Phone {
  id: string;
  modelId: string;
  purchasePrice: number;
  storage?: string;
  imei?: string;
  condition: PhoneCondition;
  note?: string;
  createdAt: string;
}

/** Durable sale record used for monthly profit. */
export interface SaleRecord {
  id: string;
  phoneId: string;
  modelId: string;
  modelName: string;
  storage?: string;
  imei?: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  soldAt: string;
}

export interface Finance {
  cash: number;
  bank: number;
}

export type HistoryType = 'purchase' | 'sale' | 'remove' | 'finance';

export interface HistoryEntry {
  id: string;
  type: HistoryType;
  date: string;
  modelName: string;
  purchasePrice?: number;
  salePrice?: number;
  profit?: number;
  storage?: string;
  imei?: string;
  note?: string;
  phoneId?: string;
}

export interface AppState {
  version: 2;
  models: Model[];
  phones: Phone[];
  sales: SaleRecord[];
  finance: Finance;
  history: HistoryEntry[];
}

export interface ModelStockSummary {
  model: Model;
  quantity: number;
  averagePurchasePrice: number;
  stockValue: number;
  phones: Phone[];
}

export interface FinanceSummary {
  cash: number;
  bank: number;
  phoneValue: number;
  totalAssets: number;
  totalProfit: number;
}

export interface MonthlyProfitSummary {
  yearMonth: string;
  label: string;
  soldCount: number;
  totalSales: number;
  totalProfit: number;
  sales: SaleRecord[];
}

export interface AddPhoneInput {
  modelId: string;
  purchasePrice: number;
  storage?: string;
  imei?: string;
  condition: PhoneCondition;
  note?: string;
  /** When true, deduct purchase price from cash. Default true. */
  deductFromCash?: boolean;
}

export interface SellPhoneInput {
  phoneId: string;
  salePrice: number;
  /** Local calendar date YYYY-MM-DD or ISO datetime. */
  soldAt: string;
  storage?: string;
  imei?: string;
  /** Where sale proceeds go. Default 'cash'. */
  depositTo?: 'cash' | 'bank';
}

export interface AddModelInput {
  name: string;
}
