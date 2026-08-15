import { describe, expect, it } from 'vitest';
import {
  defaultListedValue,
  storagesForModel,
} from './catalog';
import {
  calcProfit,
  filterModelSummaries,
  getModelStockSummaries,
  getMonthlyProfit,
  getWarehouseTotals,
  getYearMonth,
  shiftYearMonth,
} from './calculations';
import { createInitialState } from './defaults';
import { addPhone, sellPhone, updatePhone } from './store';
import { normalizeAppState } from '../storage/localStorageRepository';
import type { ModelStockSummary } from './types';

describe('catalog', () => {
  it('returns storages and default values from price book', () => {
    expect(storagesForModel('iPhone 15 Pro')).toEqual([
      '128 GB',
      '256 GB',
      '512 GB',
    ]);
    expect(storagesForModel('iPhone 15 Pro Max')).toEqual(['256 GB', '512 GB']);
    expect(defaultListedValue('iPhone 15 Pro', '256 GB')).toBe(2200);
    expect(defaultListedValue('iPhone 16 Pro Max', '256 GB')).toBe(3300);
  });
});

describe('calculations', () => {
  it('computes profit and month helpers', () => {
    expect(calcProfit(2500, 1800)).toBe(700);
    expect(shiftYearMonth('2026-08', -1)).toBe('2026-07');
    expect(shiftYearMonth('2026-08', 1)).toBe('2026-09');
  });

  it('filters models by query', () => {
    const summaries = [
      {
        model: { id: '1', name: 'iPhone 15 Pro', createdAt: '' },
        quantity: 1,
        stockValue: 1,
        phones: [],
      },
      {
        model: { id: '2', name: 'iPhone 13', createdAt: '' },
        quantity: 0,
        stockValue: 0,
        phones: [],
      },
    ] as ModelStockSummary[];

    expect(filterModelSummaries(summaries, '15 Pro')).toHaveLength(1);
  });
});

describe('store flows', () => {
  it('adds individual units and sells with monthly profit', () => {
    let state = createInitialState('2026-01-01T00:00:00.000Z');
    const model = state.models.find((item) => item.name === 'iPhone 15 Pro');
    expect(model).toBeTruthy();
    expect(state.models.some((m) => m.name === 'iPhone 16 Pro Max')).toBe(true);

    state = addPhone(state, {
      modelId: model!.id,
      storage: '256 GB',
      imei: '111111111111111',
      batteryPercent: 98,
      condition: 'bardzo_dobry',
      purchasePrice: 2000,
      listedValue: 2200,
    });
    state = addPhone(state, {
      modelId: model!.id,
      storage: '128 GB',
      imei: '222222222222222',
      batteryPercent: 91,
      condition: 'dobry',
      purchasePrice: 1850,
      listedValue: 2050,
    });

    expect(state.phones).toHaveLength(2);
    const totals = getWarehouseTotals(state);
    expect(totals.phoneCount).toBe(2);
    expect(totals.stockValue).toBe(4250);

    const summary = getModelStockSummaries(state).find(
      (item) => item.model.id === model!.id,
    )!;
    expect(summary.quantity).toBe(2);

    state = updatePhone(state, {
      phoneId: state.phones[0].id,
      storage: '256 GB',
      imei: '111111111111111',
      batteryPercent: 97,
      condition: 'bardzo_dobry',
      purchasePrice: 2000,
      listedValue: 2250,
    });
    expect(state.phones[0].batteryPercent).toBe(97);
    expect(state.phones[0].listedValue).toBe(2250);

    const phoneId = state.phones[0].id;
    state = sellPhone(state, {
      phoneId,
      salePrice: 2500,
      soldAt: '2026-08-14',
      buyerName: 'Jan Kowalski',
    });

    expect(state.phones).toHaveLength(1);
    expect(state.sales).toHaveLength(1);
    expect(state.sales[0].buyerName).toBe('Jan Kowalski');
    const august = getMonthlyProfit(state, '2026-08');
    expect(august.soldCount).toBe(1);
    expect(august.totalProfit).toBe(500);
    expect(getYearMonth(state.sales[0].soldAt)).toBe('2026-08');
  });

  it('migrates legacy v2 payloads', () => {
    const migrated = normalizeAppState({
      version: 2,
      models: [{ id: 'm1', name: 'iPhone 13 mini', createdAt: '2026-01-01' }],
      phones: [
        {
          id: 'p1',
          modelId: 'm1',
          purchasePrice: 700,
          storage: '128 GB',
          imei: '123',
          condition: 'nowy',
          createdAt: '2026-01-02',
        },
      ],
      sales: [],
      finance: { cash: 100, bank: 200 },
      history: [],
    });

    expect(migrated?.version).toBe(3);
    expect(migrated?.finance.cash).toBe(100);
    expect(migrated?.finance.bank).toBe(200);
    expect(migrated?.models.some((m) => m.name === 'iPhone 13 Mini')).toBe(true);
    expect(migrated?.phones[0].condition).toBe('idealny');
    expect(migrated?.phones[0].listedValue).toBe(700);
    expect(migrated?.phones[0].status).toBe('in_stock');
    expect(migrated?.models.some((m) => m.name === 'iPhone 16 Pro')).toBe(true);
  });
});
