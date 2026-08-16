import { describe, expect, it } from 'vitest';
import { CATALOG_MODELS } from '../domain/catalog';
import {
  BUYBACK_BASE_PRICES,
  estimateBuybackPrice,
  getBuybackBasePrice,
  storagesForSellModel,
} from './pricing';
import { EMPTY_TECHNICAL, type SellQuoteInput } from './types';

function baseInput(overrides: Partial<SellQuoteInput> = {}): SellQuoteInput {
  return {
    model: 'iPhone 15 Pro',
    storage: '256 GB',
    condition: 'bardzo_dobry',
    batteryHealth: '90_100',
    technical: { ...EMPTY_TECHNICAL },
    ...overrides,
  };
}

describe('sell pricing engine', () => {
  it('exposes buyback bases for every catalog model/storage', () => {
    for (const model of CATALOG_MODELS) {
      const storages = storagesForSellModel(model);
      expect(storages.length).toBeGreaterThan(0);
      for (const storage of storages) {
        expect(getBuybackBasePrice(model, storage)).toBeGreaterThan(0);
        expect(BUYBACK_BASE_PRICES[model]?.[storage]).toBeDefined();
      }
    }
  });

  it('returns only storages available for the selected model', () => {
    expect(storagesForSellModel('iPhone 11')).toEqual(
      expect.arrayContaining(['64 GB', '128 GB', '256 GB']),
    );
    expect(storagesForSellModel('iPhone 11')).not.toContain('1 TB');
  });

  it('applies condition and battery multipliers without UI coupling', () => {
    const ideal = estimateBuybackPrice(
      baseInput({ condition: 'idealny', batteryHealth: '90_100' }),
    );
    const damaged = estimateBuybackPrice(
      baseInput({ condition: 'uszkodzony', batteryHealth: 'below_80' }),
    );
    expect(ideal.estimatedPrice).toBeGreaterThan(damaged.estimatedPrice);
    expect(ideal.basePrice).toBe(damaged.basePrice);
  });

  it('lowers offer for broken Face ID and iCloud lock', () => {
    const clean = estimateBuybackPrice(baseInput());
    const broken = estimateBuybackPrice(
      baseInput({
        technical: {
          ...EMPTY_TECHNICAL,
          faceIdWorks: 'no',
          freeFromIcloudLock: 'no',
        },
      }),
    );
    expect(broken.estimatedPrice).toBeLessThan(clean.estimatedPrice);
    expect(broken.adjustments.some((a) => a.label.includes('Face ID'))).toBe(
      true,
    );
    expect(broken.adjustments.some((a) => a.label.includes('iCloud'))).toBe(
      true,
    );
  });

  it('never returns a price below the floor', () => {
    const result = estimateBuybackPrice(
      baseInput({
        model: 'iPhone 11',
        storage: '64 GB',
        condition: 'uszkodzony',
        batteryHealth: 'below_80',
        technical: {
          screenOriginal: 'no',
          wasRepaired: 'yes',
          faceIdWorks: 'no',
          camerasWork: 'no',
          chargesNormally: 'no',
          freeFromIcloudLock: 'no',
          carrierLocked: 'yes',
          bodyDamaged: 'yes',
        },
      }),
    );
    expect(result.estimatedPrice).toBeGreaterThanOrEqual(50);
  });
});
