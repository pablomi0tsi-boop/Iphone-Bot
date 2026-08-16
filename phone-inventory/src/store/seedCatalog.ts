import { modelIdFromName } from '../domain/catalog';
import type { StoreProduct } from './types';

/**
 * Seed iPhone catalog shaped like mapped warehouse units.
 * Used until a public Supabase read (or view) exposes in-stock iPhones
 * without IMEI / purchase_price. Replace by swapping `loadCatalogSource()`.
 */
function unit(
  partial: Omit<StoreProduct, 'warrantyMonths' | 'listedInStore' | 'isSeed'> & {
    warrantyMonths?: number;
  },
): StoreProduct {
  return {
    warrantyMonths: 12,
    listedInStore: partial.listingStatus === 'available',
    isSeed: true,
    ...partial,
  };
}

export const SEED_IPHONES: StoreProduct[] = [
  unit({
    id: 'seed-17-pro-max-512-cosmic',
    productNumber: 'SF-17PM-512-01',
    modelName: 'iPhone 17 Pro Max',
    storage: '512 GB',
    color: 'Cosmic Orange',
    batteryPercent: 100,
    condition: 'idealny',
    price: 5799,
    compareAtPrice: 6299,
    description:
      'iPhone 17 Pro Max 512 GB Cosmic Orange. Egzemplarz w stanie jak nowy, pełna sprawność, fabryczna kondycja baterii.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-14T09:00:00.000Z',
  }),
  unit({
    id: 'seed-17-pro-256-silver',
    productNumber: 'SF-17P-256-01',
    modelName: 'iPhone 17 Pro',
    storage: '256 GB',
    color: 'Silver',
    batteryPercent: 99,
    condition: 'idealny',
    price: 4899,
    compareAtPrice: 5299,
    description:
      'iPhone 17 Pro 256 GB Silver. Sprawdzony w SmartFix — Face ID, True Tone i aparaty bez zastrzeżeń.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-13T11:20:00.000Z',
  }),
  unit({
    id: 'seed-16-pro-max-256-black',
    productNumber: 'SF-16PM-256-01',
    modelName: 'iPhone 16 Pro Max',
    storage: '256 GB',
    color: 'Black Titanium',
    batteryPercent: 96,
    condition: 'bardzo_dobry',
    price: 4499,
    compareAtPrice: 4799,
    description:
      'iPhone 16 Pro Max 256 GB Black Titanium. Minimalne ślady użytkowania, bateria 96%, gotowy do pracy.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-12T15:40:00.000Z',
  }),
  unit({
    id: 'seed-16-pro-256-natural',
    productNumber: 'SF-16P-256-01',
    modelName: 'iPhone 16 Pro',
    storage: '256 GB',
    color: 'Natural Titanium',
    batteryPercent: 94,
    condition: 'bardzo_dobry',
    price: 3999,
    description:
      'iPhone 16 Pro 256 GB Natural Titanium. Solidny egzemplarz Pro z przetestowaną elektroniką.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-11T10:10:00.000Z',
  }),
  unit({
    id: 'seed-15-pro-max-256-blue',
    productNumber: 'SF-15PM-256-01',
    modelName: 'iPhone 15 Pro Max',
    storage: '256 GB',
    color: 'Blue Titanium',
    batteryPercent: 93,
    condition: 'bardzo_dobry',
    price: 3599,
    compareAtPrice: 3899,
    description:
      'iPhone 15 Pro Max 256 GB Blue Titanium. Duży ekran, sprawny aparat, 12 miesięcy gwarancji SmartFix.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-10T08:30:00.000Z',
  }),
  unit({
    id: 'seed-15-pro-256-natural',
    productNumber: 'SF-15P-256-02',
    modelName: 'iPhone 15 Pro',
    storage: '256 GB',
    color: 'Natural Titanium',
    batteryPercent: 92,
    condition: 'bardzo_dobry',
    price: 2499,
    compareAtPrice: 2799,
    description:
      'iPhone 15 Pro 256 GB Natural Titanium. Stan bardzo dobry, bateria 92%, pełen pakiet testów SmartFix.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-09T14:00:00.000Z',
  }),
  unit({
    id: 'seed-15-128-blue',
    productNumber: 'SF-15-128-01',
    modelName: 'iPhone 15',
    storage: '128 GB',
    color: 'Blue',
    batteryPercent: 97,
    condition: 'idealny',
    price: 2899,
    description:
      'iPhone 15 128 GB Blue. Dynamic Island, USB-C, kondycja jak nowa.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-08T12:00:00.000Z',
  }),
  unit({
    id: 'seed-14-pro-max-256-purple',
    productNumber: 'SF-14PM-256-01',
    modelName: 'iPhone 14 Pro Max',
    storage: '256 GB',
    color: 'Deep Purple',
    batteryPercent: 91,
    condition: 'bardzo_dobry',
    price: 2799,
    description:
      'iPhone 14 Pro Max 256 GB Deep Purple. ProMotion 120 Hz, sprawne Face ID.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-07T16:45:00.000Z',
  }),
  unit({
    id: 'seed-14-pro-128-space',
    productNumber: 'SF-14P-128-01',
    modelName: 'iPhone 14 Pro',
    storage: '128 GB',
    color: 'Space Black',
    batteryPercent: 89,
    condition: 'dobry',
    price: 2299,
    compareAtPrice: 2499,
    description:
      'iPhone 14 Pro 128 GB Space Black. Lekkie ślady użytkowania, w pełni sprawny.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-06T09:15:00.000Z',
  }),
  unit({
    id: 'seed-13-pro-256-graphite',
    productNumber: 'SF-13P-256-01',
    modelName: 'iPhone 13 Pro',
    storage: '256 GB',
    color: 'Graphite',
    batteryPercent: 88,
    condition: 'dobry',
    price: 1899,
    description:
      'iPhone 13 Pro 256 GB Graphite. Sprawdzony ekran ProMotion i aparat.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-05T13:20:00.000Z',
  }),
  unit({
    id: 'seed-13-128-midnight',
    productNumber: 'SF-13-128-01',
    modelName: 'iPhone 13',
    storage: '128 GB',
    color: 'Midnight',
    batteryPercent: 90,
    condition: 'bardzo_dobry',
    price: 1599,
    description:
      'iPhone 13 128 GB Midnight. Uniwersalny codzienny iPhone w atrakcyjnej cenie.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-04T11:00:00.000Z',
  }),
  unit({
    id: 'seed-12-128-white',
    productNumber: 'SF-12-128-01',
    modelName: 'iPhone 12',
    storage: '128 GB',
    color: 'White',
    batteryPercent: 86,
    condition: 'dobry',
    price: 1199,
    description:
      'iPhone 12 128 GB White. Solidna baza z 5G, przetestowana elektronika.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-03T17:30:00.000Z',
  }),
  unit({
    id: 'seed-11-64-black',
    productNumber: 'SF-11-64-01',
    modelName: 'iPhone 11',
    storage: '64 GB',
    color: 'Black',
    batteryPercent: 84,
    condition: 'dobry',
    price: 899,
    description:
      'iPhone 11 64 GB Black. Sprawdzony klasyk w uczciwej cenie SmartFix.',
    listingStatus: 'available',
    images: [],
    createdAt: '2026-08-02T10:00:00.000Z',
  }),
];

/** Stable model id helper for warehouse linkage docs / future sync. */
export function seedModelId(modelName: string): string {
  return modelIdFromName(modelName);
}
