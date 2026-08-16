import { STORAGE_KEY } from '../domain/defaults';
import type { AppState } from '../domain/types';
import {
  assertPublicProduct,
  isPurchasableListing,
  mapPhoneToProduct,
} from './mapPhoneToProduct';
import { SEED_IPHONES } from './seedCatalog';
import {
  DEFAULT_FILTERS,
  STORE_CONDITION_OPTIONS,
  type StoreFilters,
  type StoreProduct,
  type StoreSort,
} from './types';

/**
 * Catalog access for the public storefront.
 *
 * Priority:
 * 1. Purchasable iPhones from local warehouse state (STORAGE_KEY) when present
 * 2. Seed iPhone catalog shaped like mapped `phones` rows
 *
 * Later: replace `loadCatalogSource` with a public Supabase select/view on
 * `phones` that omits imei / purchase_price, then map via `mapPhoneToProduct`.
 */
function readLocalWarehouseProducts(): StoreProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const state = JSON.parse(raw) as AppState;
    if (!state?.phones?.length || !state?.models?.length) return [];
    const byId = new Map(state.models.map((m) => [m.id, m.name]));
    const products: StoreProduct[] = [];
    for (const phone of state.phones) {
      const modelName = byId.get(phone.modelId);
      if (!modelName) continue;
      const mapped = mapPhoneToProduct(phone, modelName);
      if (mapped) products.push(mapped);
    }
    return products;
  } catch {
    return [];
  }
}

async function loadCatalogSource(): Promise<StoreProduct[]> {
  const fromWarehouse = readLocalWarehouseProducts().filter(isPurchasableListing);
  if (fromWarehouse.length > 0) {
    for (const p of fromWarehouse) assertPublicProduct(p);
    return fromWarehouse;
  }
  const seed = SEED_IPHONES.filter(isPurchasableListing).map((p) => ({ ...p }));
  for (const p of seed) assertPublicProduct(p);
  return seed;
}

async function loadAllKnownProducts(): Promise<StoreProduct[]> {
  const fromWarehouse = readLocalWarehouseProducts();
  if (fromWarehouse.length > 0) {
    for (const p of fromWarehouse) assertPublicProduct(p);
    return fromWarehouse;
  }
  return SEED_IPHONES.map((p) => ({ ...p }));
}

export async function listStoreProducts(): Promise<StoreProduct[]> {
  return loadCatalogSource();
}

export async function getStoreProduct(
  id: string,
): Promise<StoreProduct | null> {
  const all = await loadAllKnownProducts();
  const found = all.find((p) => p.id === id) ?? null;
  if (found) assertPublicProduct(found);
  return found;
}

export async function listFeaturedByModels(
  modelNames: readonly string[],
): Promise<StoreProduct[]> {
  const products = await listStoreProducts();
  const picked: StoreProduct[] = [];
  for (const name of modelNames) {
    const match = products.find((p) => p.modelName === name);
    if (match) picked.push(match);
  }
  if (picked.length >= 4) return picked;
  const rest = products.filter((p) => !picked.some((x) => x.id === p.id));
  return [...picked, ...rest].slice(0, 8);
}

/** Products with a real compare-at discount (for home “Okazje”). */
export async function listDealProducts(limit = 8): Promise<StoreProduct[]> {
  const products = await listStoreProducts();
  return products
    .filter(
      (p) =>
        typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price,
    )
    .sort((a, b) => dealScore(b) - dealScore(a))
    .slice(0, limit);
}

function matchesQuery(product: StoreProduct, query: string): boolean {
  if (!query.trim()) return true;
  const hay = [
    product.modelName,
    product.storage,
    product.color,
    product.productNumber,
    product.description,
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

function conditionAllowed(
  product: StoreProduct,
  filters: StoreFilters,
): boolean {
  if (filters.conditions.length === 0) return true;
  return filters.conditions.some((filter) => {
    const option = STORE_CONDITION_OPTIONS.find((o) => o.value === filter);
    return option?.mapsTo.includes(product.condition) ?? false;
  });
}

function batteryAllowed(product: StoreProduct, filters: StoreFilters): boolean {
  if (filters.battery === 'any') return true;
  return product.batteryPercent >= Number(filters.battery);
}

function dealScore(product: StoreProduct): number {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) {
    return 0;
  }
  return (product.compareAtPrice - product.price) / product.compareAtPrice;
}

export function sortProducts(
  products: StoreProduct[],
  sort: StoreSort,
): StoreProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return copy.sort((a, b) => b.price - a.price);
    case 'best_deal':
      return copy.sort(
        (a, b) => dealScore(b) - dealScore(a) || a.price - b.price,
      );
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function filterAndSortProducts(
  products: StoreProduct[],
  filters: StoreFilters = DEFAULT_FILTERS,
): StoreProduct[] {
  const max =
    filters.priceMax > 0 ? filters.priceMax : Number.POSITIVE_INFINITY;
  const filtered = products.filter((p) => {
    if (!matchesQuery(p, filters.query)) return false;
    if (filters.models.length && !filters.models.includes(p.modelName)) {
      return false;
    }
    if (filters.storages.length && !filters.storages.includes(p.storage)) {
      return false;
    }
    if (!conditionAllowed(p, filters)) return false;
    if (!batteryAllowed(p, filters)) return false;
    if (p.price < filters.priceMin || p.price > max) return false;
    if (filters.colors.length && !filters.colors.includes(p.color)) {
      return false;
    }
    return true;
  });
  return sortProducts(filtered, filters.sort);
}

export function uniqueColors(products: StoreProduct[]): string[] {
  return [
    ...new Set(products.map((p) => p.color).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pl'));
}
