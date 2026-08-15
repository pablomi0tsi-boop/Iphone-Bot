import type { PhoneCondition } from '../domain/types';

/** Public brand bucket for filters / category tiles. */
export type StoreBrand = 'Apple' | 'Samsung' | 'Other';

/**
 * Public-facing product for the storefront.
 * Never includes IMEI, purchase price, or other internal warehouse fields.
 * Maps 1:1 to a physical phone unit (same id as `phones.id` when live).
 */
export interface StoreProduct {
  id: string;
  modelName: string;
  brand: StoreBrand;
  storage: string;
  /** Optional cosmetic color when known. */
  color?: string;
  batteryPercent: number;
  condition: PhoneCondition;
  /** Customer-facing price (listed_value). */
  price: number;
  description: string;
  warranty: string;
  /** Image URLs or data URIs; empty → CSS placeholder. */
  images: string[];
  createdAt: string;
  /** True when stock comes from demo catalog, not live inventory. */
  isDemo?: boolean;
}

export type StoreSort = 'newest' | 'price_asc' | 'price_desc';

export interface StoreFilters {
  query: string;
  brand: StoreBrand | 'all';
  model: string | 'all';
  storage: string | 'all';
  condition: PhoneCondition | 'all';
  batteryMin: number;
  priceMin: number;
  priceMax: number;
  sort: StoreSort;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export const DEFAULT_WARRANTY =
  '12 miesięcy gwarancji SmartFix — wymiana lub zwrot kosztów naprawy według regulaminu.';

export const DEFAULT_FILTERS: StoreFilters = {
  query: '',
  brand: 'all',
  model: 'all',
  storage: 'all',
  condition: 'all',
  batteryMin: 0,
  priceMin: 0,
  priceMax: 100_000,
  sort: 'newest',
};
