export type PhoneCondition =
  | 'idealny'
  | 'bardzo_dobry'
  | 'dobry'
  | 'uzywany'
  | 'uszkodzony';

export const PHONE_CONDITIONS: { value: PhoneCondition; label: string }[] = [
  { value: 'idealny', label: 'Idealny' },
  { value: 'bardzo_dobry', label: 'Bardzo dobry' },
  { value: 'dobry', label: 'Dobry' },
  { value: 'uzywany', label: 'Używany' },
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
  storage: string;
  imei: string;
  batteryPercent: number;
  condition: PhoneCondition;
  note?: string;
  purchasePrice: number;
  /** Asking / stock value (cena sprzedaży / wartość). */
  listedValue: number;
  createdAt: string;
  updatedAt: string;
}

/** Durable sale record used for monthly profit. */
export interface SaleRecord {
  id: string;
  phoneId: string;
  modelId: string;
  modelName: string;
  storage?: string;
  imei?: string;
  buyerName?: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  soldAt: string;
}

export type HistoryType = 'purchase' | 'sale' | 'remove' | 'update' | 'finance';

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
  buyerName?: string;
  note?: string;
  phoneId?: string;
}

export interface Finance {
  cash: number;
  bank: number;
}

export interface AppState {
  version: 3;
  models: Model[];
  phones: Phone[];
  sales: SaleRecord[];
  finance: Finance;
  history: HistoryEntry[];
}

export interface ModelStockSummary {
  model: Model;
  quantity: number;
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
  storage: string;
  imei: string;
  batteryPercent: number;
  condition: PhoneCondition;
  note?: string;
  purchasePrice: number;
  listedValue: number;
}

export interface UpdatePhoneInput {
  phoneId: string;
  storage: string;
  imei: string;
  batteryPercent: number;
  condition: PhoneCondition;
  note?: string;
  purchasePrice: number;
  listedValue: number;
}

export interface SellPhoneInput {
  phoneId: string;
  salePrice: number;
  soldAt: string;
  buyerName: string;
}
