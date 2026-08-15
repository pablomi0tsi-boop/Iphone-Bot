import { describe, expect, it } from 'vitest';
import type { Phone } from '../domain/types';
import { assertPublicProduct, mapPhoneToProduct } from './mapPhoneToProduct';
import { filterAndSortProducts } from './catalog';
import { DEMO_PRODUCTS } from './demoCatalog';

function samplePhone(overrides: Partial<Phone> = {}): Phone {
  return {
    id: 'phone-1',
    modelId: 'iphone-15',
    storage: '128 GB',
    imei: 'SECRET-IMEI-SHOULD-NEVER-LEAK',
    batteryPercent: 91,
    condition: 'dobry',
    note: 'Czysty egzemplarz',
    purchasePrice: 2000,
    listedValue: 3199,
    status: 'in_stock',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapPhoneToProduct', () => {
  it('maps stock phone without IMEI or purchase price', () => {
    const product = mapPhoneToProduct(samplePhone(), 'iPhone 15', {
      color: 'Niebieski',
    });
    expect(product).not.toBeNull();
    expect(product!.id).toBe('phone-1');
    expect(product!.price).toBe(3199);
    expect(product!.color).toBe('Niebieski');
    expect(product).not.toHaveProperty('imei');
    expect(product).not.toHaveProperty('purchasePrice');
    assertPublicProduct(product!);
  });

  it('skips sold / zero-price phones', () => {
    expect(
      mapPhoneToProduct(samplePhone({ status: 'sold' }), 'iPhone 15'),
    ).toBeNull();
    expect(
      mapPhoneToProduct(samplePhone({ listedValue: 0 }), 'iPhone 15'),
    ).toBeNull();
  });
});

describe('filterAndSortProducts', () => {
  it('filters by brand and sorts by price', () => {
    const apple = filterAndSortProducts(DEMO_PRODUCTS, {
      query: '',
      brand: 'Apple',
      model: 'all',
      storage: 'all',
      condition: 'all',
      batteryMin: 0,
      priceMin: 0,
      priceMax: 100_000,
      sort: 'price_asc',
    });
    expect(apple.every((p) => p.brand === 'Apple')).toBe(true);
    expect(apple[0].price).toBeLessThanOrEqual(apple[apple.length - 1].price);
  });
});
