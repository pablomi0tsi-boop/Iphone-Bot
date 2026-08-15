import { DEMO_PRODUCTS } from './demoCatalog';
import { assertPublicProduct } from './mapPhoneToProduct';
import {
  DEFAULT_FILTERS,
  type StoreFilters,
  type StoreProduct,
  type StoreSort,
} from './types';

/**
 * Public catalog access. Today: demo products.
 * Later: fetch in-stock rows from `phones` (or a safe view/RPC) and map via
 * `mapPhoneToProduct` — never select IMEI / purchase_price for the storefront.
 */
export async function listStoreProducts(): Promise<StoreProduct[]> {
  const products = DEMO_PRODUCTS.map((p) => ({ ...p }));
  for (const product of products) assertPublicProduct(product);
  return products;
}

export async function getStoreProduct(
  id: string,
): Promise<StoreProduct | null> {
  const products = await listStoreProducts();
  const found = products.find((p) => p.id === id) ?? null;
  if (found) assertPublicProduct(found);
  return found;
}

export async function listFeaturedProducts(
  limit = 4,
): Promise<StoreProduct[]> {
  const products = await listStoreProducts();
  return [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

function matchesQuery(product: StoreProduct, query: string): boolean {
  if (!query.trim()) return true;
  const hay = [
    product.modelName,
    product.storage,
    product.color ?? '',
    product.brand,
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

export function filterAndSortProducts(
  products: StoreProduct[],
  filters: StoreFilters = DEFAULT_FILTERS,
): StoreProduct[] {
  let next = products.filter((p) => {
    if (!matchesQuery(p, filters.query)) return false;
    if (filters.brand !== 'all' && p.brand !== filters.brand) return false;
    if (filters.model !== 'all' && p.modelName !== filters.model) return false;
    if (filters.storage !== 'all' && p.storage !== filters.storage) return false;
    if (filters.condition !== 'all' && p.condition !== filters.condition) {
      return false;
    }
    if (p.batteryPercent < filters.batteryMin) return false;
    if (p.price < filters.priceMin || p.price > filters.priceMax) return false;
    return true;
  });

  next = sortProducts(next, filters.sort);
  return next;
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
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function uniqueModels(products: StoreProduct[]): string[] {
  return [...new Set(products.map((p) => p.modelName))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
}

export function uniqueStorages(products: StoreProduct[]): string[] {
  return [...new Set(products.map((p) => p.storage))].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, 'pl');
  });
}
