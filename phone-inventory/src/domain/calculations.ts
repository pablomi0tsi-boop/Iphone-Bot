import type {
  AppState,
  FinanceSummary,
  ModelStockSummary,
  Phone,
} from './types';

export function sumPurchasePrices(phones: Phone[]): number {
  return phones.reduce((sum, phone) => sum + phone.purchasePrice, 0);
}

export function averagePurchasePrice(phones: Phone[]): number {
  if (phones.length === 0) return 0;
  return sumPurchasePrices(phones) / phones.length;
}

export function getPhonesForModel(state: AppState, modelId: string): Phone[] {
  return state.phones.filter((phone) => phone.modelId === modelId);
}

export function getModelStockSummaries(state: AppState): ModelStockSummary[] {
  return state.models
    .map((model) => {
      const phones = getPhonesForModel(state, model.id);
      return {
        model,
        quantity: phones.length,
        averagePurchasePrice: averagePurchasePrice(phones),
        stockValue: sumPurchasePrices(phones),
        phones,
      };
    })
    .sort((a, b) => a.model.name.localeCompare(b.model.name, 'pl'));
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

export function getPhoneValue(state: AppState): number {
  return sumPurchasePrices(state.phones);
}

export function getTotalProfit(state: AppState): number {
  return state.history
    .filter((entry) => entry.type === 'sale' && typeof entry.profit === 'number')
    .reduce((sum, entry) => sum + (entry.profit ?? 0), 0);
}

export function getFinanceSummary(state: AppState): FinanceSummary {
  const phoneValue = getPhoneValue(state);
  const totalProfit = getTotalProfit(state);
  return {
    cash: state.finance.cash,
    bank: state.finance.bank,
    phoneValue,
    totalAssets: state.finance.cash + state.finance.bank + phoneValue,
    totalProfit,
  };
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
