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

export interface Model {
  id: string;
  name: string;
  createdAt: string;
}

export interface Phone {
  id: string;
  modelId: string;
  purchasePrice: number;
  imei?: string;
  condition: PhoneCondition;
  note?: string;
  createdAt: string;
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
  note?: string;
  phoneId?: string;
}

export interface AppState {
  version: 1;
  models: Model[];
  phones: Phone[];
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

export interface AddPhoneInput {
  modelId: string;
  purchasePrice: number;
  imei?: string;
  condition: PhoneCondition;
  note?: string;
  /** When true, deduct purchase price from cash. Default true. */
  deductFromCash?: boolean;
}

export interface SellPhoneInput {
  phoneId: string;
  salePrice: number;
  /** Where sale proceeds go. Default 'cash'. */
  depositTo?: 'cash' | 'bank';
}

export interface AddModelInput {
  name: string;
}
