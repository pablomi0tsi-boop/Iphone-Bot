import { describe, expect, it } from 'vitest';
import {
  averagePurchasePrice,
  calcProfit,
  filterModelSummaries,
  getFinanceSummary,
  getModelStockSummaries,
  getMonthlyProfit,
  getYearMonth,
  shiftYearMonth,
} from './calculations';
import { createInitialState } from './defaults';
import {
  addPhone,
  sellPhone,
  setBank,
  setCash,
} from './store';
import { normalizeAppState } from '../storage/localStorageRepository';
import type { ModelStockSummary } from './types';

describe('calculations', () => {
  it('computes average and profit', () => {
    expect(averagePurchasePrice([])).toBe(0);
    expect(
      averagePurchasePrice([
        {
          id: '1',
          modelId: 'm',
          purchasePrice: 1000,
          condition: 'dobry',
          createdAt: '2026-01-01',
        },
        {
          id: '2',
          modelId: 'm',
          purchasePrice: 2000,
          condition: 'dobry',
          createdAt: '2026-01-02',
        },
      ]),
    ).toBe(1500);
    expect(calcProfit(2500, 1800)).toBe(700);
    expect(calcProfit(1500, 1800)).toBe(-300);
  });

  it('filters models by query', () => {
    const summaries = [
      {
        model: { id: '1', name: 'iPhone 15 Pro', createdAt: '' },
        quantity: 1,
        averagePurchasePrice: 1,
        stockValue: 1,
        phones: [],
      },
      {
        model: { id: '2', name: 'iPhone 13', createdAt: '' },
        quantity: 0,
        averagePurchasePrice: 0,
        stockValue: 0,
        phones: [],
      },
    ] as ModelStockSummary[];

    expect(filterModelSummaries(summaries, '15 Pro')).toHaveLength(1);
    expect(filterModelSummaries(summaries, '15 Pro')[0].model.name).toBe(
      'iPhone 15 Pro',
    );
  });

  it('shifts months and builds monthly profit', () => {
    expect(shiftYearMonth('2026-08', -1)).toBe('2026-07');
    expect(shiftYearMonth('2026-08', 1)).toBe('2026-09');
  });
});

describe('store flows', () => {
  it('adds, sells, and updates finance correctly', () => {
    let state = createInitialState('2026-01-01T00:00:00.000Z');
    const model = state.models.find((item) => item.name === 'iPhone 15 Pro');
    expect(model).toBeTruthy();

    state = setCash(state, 10000);
    state = setBank(state, 5000);
    state = addPhone(state, {
      modelId: model!.id,
      purchasePrice: 2000,
      storage: '256 GB',
      imei: '111111111111111',
      condition: 'dobry',
    });

    expect(state.phones).toHaveLength(1);
    expect(state.finance.cash).toBe(8000);

    const summaries = getModelStockSummaries(state);
    const summary = summaries.find((item) => item.model.id === model!.id)!;
    expect(summary.quantity).toBe(1);
    expect(summary.stockValue).toBe(2000);
    expect(summary.averagePurchasePrice).toBe(2000);

    state = sellPhone(state, {
      phoneId: state.phones[0].id,
      salePrice: 2500,
      soldAt: '2026-08-14',
      storage: '256 GB',
      imei: '111111111111111',
      depositTo: 'cash',
    });

    expect(state.phones).toHaveLength(0);
    expect(state.sales).toHaveLength(1);
    expect(state.finance.cash).toBe(10500);
    const finance = getFinanceSummary(state);
    expect(finance.phoneValue).toBe(0);
    expect(finance.totalProfit).toBe(500);
    expect(finance.totalAssets).toBe(10500 + 5000);
    expect(state.history[0].type).toBe('sale');
    expect(state.history[0].profit).toBe(500);

    const august = getMonthlyProfit(state, '2026-08');
    expect(august.soldCount).toBe(1);
    expect(august.totalSales).toBe(2500);
    expect(august.totalProfit).toBe(500);
    expect(august.label).toContain('SIERPIEŃ');

    const july = getMonthlyProfit(state, '2026-07');
    expect(july.soldCount).toBe(0);
    expect(july.totalProfit).toBe(0);
    expect(getYearMonth(state.sales[0].soldAt)).toBe('2026-08');
  });

  it('keeps seed models available', () => {
    const state = createInitialState();
    expect(state.models.length).toBe(17);
    expect(state.models.some((m) => m.name === 'iPhone 16')).toBe(true);
    expect(state.sales).toEqual([]);
    expect(state.version).toBe(2);
  });

  it('migrates v1 localStorage payloads without sales', () => {
    const migrated = normalizeAppState({
      version: 1,
      models: [],
      phones: [],
      finance: { cash: 1, bank: 2 },
      history: [
        {
          id: 'h1',
          type: 'sale',
          date: '2026-08-01T12:00:00.000Z',
          modelName: 'iPhone 14',
          purchasePrice: 1000,
          salePrice: 1300,
          profit: 300,
        },
      ],
    });

    expect(migrated?.version).toBe(2);
    expect(migrated?.sales).toHaveLength(1);
    expect(migrated?.sales[0].profit).toBe(300);
  });
});
