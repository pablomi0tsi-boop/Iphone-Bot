import { describe, expect, it } from 'vitest';
import {
  averagePurchasePrice,
  calcProfit,
  filterModelSummaries,
  getFinanceSummary,
  getModelStockSummaries,
} from './calculations';
import { createInitialState } from './defaults';
import {
  addPhone,
  sellPhone,
  setBank,
  setCash,
} from './store';
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
      depositTo: 'cash',
    });

    expect(state.phones).toHaveLength(0);
    expect(state.finance.cash).toBe(10500);
    const finance = getFinanceSummary(state);
    expect(finance.phoneValue).toBe(0);
    expect(finance.totalProfit).toBe(500);
    expect(finance.totalAssets).toBe(10500 + 5000);
    expect(state.history[0].type).toBe('sale');
    expect(state.history[0].profit).toBe(500);
  });

  it('keeps seed models available', () => {
    const state = createInitialState();
    expect(state.models.length).toBe(17);
    expect(state.models.some((m) => m.name === 'iPhone 16')).toBe(true);
  });
});
