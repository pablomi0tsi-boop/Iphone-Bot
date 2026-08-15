import type {
  AppState,
  ModelStockSummary,
  MonthlyProfitSummary,
  Phone,
  SaleRecord,
} from './types';

const MONTHS_PL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
] as const;

export function phoneStockValue(phone: Phone): number {
  return Number.isFinite(phone.listedValue) ? phone.listedValue : 0;
}

export function sumStockValue(phones: Phone[]): number {
  return phones.reduce((sum, phone) => sum + phoneStockValue(phone), 0);
}

export function getPhonesForModel(state: AppState, modelId: string): Phone[] {
  return state.phones
    .filter((phone) => phone.modelId === modelId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getModelStockSummaries(state: AppState): ModelStockSummary[] {
  return state.models.map((model) => {
    const phones = getPhonesForModel(state, model.id);
    return {
      model,
      quantity: phones.length,
      stockValue: sumStockValue(phones),
      phones,
    };
  });
}

export function filterModelSummaries(
  summaries: ModelStockSummary[],
  query: string,
): ModelStockSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return summaries;
  return summaries.filter((item) =>
    item.model.name.toLowerCase().includes(normalized),
  );
}

export function getWarehouseTotals(state: AppState): {
  phoneCount: number;
  stockValue: number;
} {
  return {
    phoneCount: state.phones.length,
    stockValue: sumStockValue(state.phones),
  };
}

export function getTotalProfit(state: AppState): number {
  return state.sales.reduce((sum, sale) => sum + sale.profit, 0);
}

export function calcProfit(salePrice: number, purchasePrice: number): number {
  return salePrice - purchasePrice;
}

export function formatPln(amount: number): string {
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} zł`;
}

export function formatSignedPln(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '' : '';
  return `${sign}${formatPln(amount)}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

export function getYearMonth(isoOrDate: string): string {
  const date = new Date(isoOrDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function currentYearMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [yearRaw, monthRaw] = yearMonth.split('-').map(Number);
  const date = new Date(yearRaw, monthRaw - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(yearMonth: string, uppercase = true): string {
  const [yearRaw, monthRaw] = yearMonth.split('-').map(Number);
  const name = MONTHS_PL[monthRaw - 1] ?? yearMonth;
  const label = `${name} ${yearRaw}`;
  return uppercase ? label.toUpperCase() : label;
}

export function shortMonthLabel(yearMonth: string): string {
  return formatMonthLabel(yearMonth, false);
}

export function dateInputToIso(dateInput: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0).toISOString();
  }
  return new Date(dateInput).toISOString();
}

export function isoToDateInput(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMonthlyProfit(
  state: AppState,
  yearMonth: string,
): MonthlyProfitSummary {
  const sales = state.sales
    .filter((sale) => getYearMonth(sale.soldAt) === yearMonth)
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));

  return {
    yearMonth,
    label: formatMonthLabel(yearMonth),
    soldCount: sales.length,
    totalSales: sales.reduce((sum, sale) => sum + sale.salePrice, 0),
    totalProfit: sales.reduce((sum, sale) => sum + sale.profit, 0),
    sales,
  };
}

export function listSaleYearMonths(sales: SaleRecord[]): string[] {
  const keys = new Set(sales.map((sale) => getYearMonth(sale.soldAt)));
  return [...keys].sort();
}

export function conditionLabel(value: string): string {
  switch (value) {
    case 'idealny':
      return 'Idealny';
    case 'bardzo_dobry':
      return 'Bardzo dobry';
    case 'dobry':
      return 'Dobry';
    case 'uzywany':
      return 'Używany';
    case 'uszkodzony':
      return 'Uszkodzony';
    case 'nowy':
      return 'Idealny';
    case 'zadrapania':
      return 'Używany';
    default:
      return value;
  }
}

export function unitLabel(index: number): string {
  return `#${index + 1}`;
}
