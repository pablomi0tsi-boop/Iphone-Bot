import { describe, expect, it } from 'vitest';
import type { Phone } from '../domain/types';
import {
  assertPublicProduct,
  encodeStoreMeta,
  isPurchasableListing,
  mapPhoneToProduct,
  parseStoreMeta,
} from './mapPhoneToProduct';
import { filterAndSortProducts } from './catalog';
import { SEED_IPHONES } from './seedCatalog';

function samplePhone(overrides: Partial<Phone> = {}): Phone {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    modelId: 'iphone-15',
    storage: '128 GB',
    imei: 'SECRET-IMEI-SHOULD-NEVER-LEAK',
    batteryPercent: 91,
    condition: 'dobry',
    note: encodeStoreMeta('Czysty egzemplarz', {
      color: 'Blue',
      listedInStore: true,
    }),
    purchasePrice: 2000,
    listedValue: 3199,
    status: 'in_stock',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapPhoneToProduct', () => {
  it('maps stock iPhone without IMEI or purchase price', () => {
    const product = mapPhoneToProduct(samplePhone(), 'iPhone 15');
    expect(product).not.toBeNull();
    expect(product!.price).toBe(3199);
    expect(product!.color).toBe('Blue');
    expect(product!.listedInStore).toBe(true);
    expect(product).not.toHaveProperty('imei');
    expect(product).not.toHaveProperty('purchasePrice');
    assertPublicProduct(product!);
    expect(isPurchasableListing(product!)).toBe(true);
  });

  it('hides non-listed and sold phones from catalog', () => {
    const hidden = mapPhoneToProduct(
      samplePhone({
        note: encodeStoreMeta('', { listedInStore: false }),
      }),
      'iPhone 15',
    );
    expect(hidden).not.toBeNull();
    expect(isPurchasableListing(hidden!)).toBe(false);

    const sold = mapPhoneToProduct(samplePhone({ status: 'sold' }), 'iPhone 15');
    expect(sold?.listingStatus).toBe('sold');
    expect(isPurchasableListing(sold!)).toBe(false);

    expect(
      mapPhoneToProduct(samplePhone({ status: 'removed' }), 'iPhone 15'),
    ).toBeNull();
  });

  it('rejects non-iPhone models', () => {
    expect(mapPhoneToProduct(samplePhone(), 'Samsung Galaxy S24')).toBeNull();
  });

  it('round-trips store meta in note', () => {
    const encoded = encodeStoreMeta('hello', {
      color: 'Natural Titanium',
      listedInStore: true,
    });
    const { cleanNote, meta } = parseStoreMeta(encoded);
    expect(cleanNote).toBe('hello');
    expect(meta.color).toBe('Natural Titanium');
    expect(meta.listedInStore).toBe(true);
  });
});

describe('filterAndSortProducts', () => {
  it('filters iPhone seed catalog by model and sorts by price', () => {
    const filtered = filterAndSortProducts(SEED_IPHONES, {
      query: '',
      models: ['iPhone 15 Pro'],
      storages: [],
      conditions: [],
      battery: 'any',
      priceMin: 0,
      priceMax: 0,
      colors: [],
      sort: 'price_asc',
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((p) => p.modelName === 'iPhone 15 Pro')).toBe(true);
  });

  it('searches by product number', () => {
    const filtered = filterAndSortProducts(SEED_IPHONES, {
      query: 'SF-15P-256-02',
      models: [],
      storages: [],
      conditions: [],
      battery: 'any',
      priceMin: 0,
      priceMax: 0,
      colors: [],
      sort: 'newest',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].modelName).toBe('iPhone 15 Pro');
  });
});
