import type { Phone, PhoneCondition, PhoneStatus } from '../domain/types';
import { PHONE_CONDITIONS } from '../domain/types';
import { isIPhoneModel } from '../domain/catalog';
import { defaultImagesForModel } from './productImages';
import type { StoreListingStatus, StoreProduct } from './types';

/** Optional storefront meta encoded in warehouse `note` (no schema change). */
export interface StorePhoneMeta {
  listedInStore?: boolean;
  listingStatus?: Exclude<StoreListingStatus, 'sold'>;
  color?: string;
  compareAtPrice?: number;
  productNumber?: string;
  warrantyMonths?: number;
}

const META_RE = /\[sf:(\{.*?\})\]\s*$/s;

export function parseStoreMeta(note?: string): {
  cleanNote: string;
  meta: StorePhoneMeta;
} {
  if (!note) return { cleanNote: '', meta: {} };
  const match = note.match(META_RE);
  if (!match) return { cleanNote: note.trim(), meta: {} };
  try {
    const meta = JSON.parse(match[1]) as StorePhoneMeta;
    return {
      cleanNote: note.replace(META_RE, '').trim(),
      meta: meta && typeof meta === 'object' ? meta : {},
    };
  } catch {
    return { cleanNote: note.trim(), meta: {} };
  }
}

export function encodeStoreMeta(
  note: string | undefined,
  meta: StorePhoneMeta,
): string {
  const clean = (note ?? '').replace(META_RE, '').trim();
  const payload = JSON.stringify(meta);
  return clean ? `${clean}\n[sf:${payload}]` : `[sf:${payload}]`;
}

export function warehouseToListingStatus(
  status: PhoneStatus,
  meta: StorePhoneMeta,
): StoreListingStatus | 'hidden' {
  if (status === 'sold') return 'sold';
  if (status === 'removed') return 'hidden';
  if (meta.listingStatus === 'reserved') return 'reserved';
  return 'available';
}

export function conditionStoreLabel(condition: PhoneCondition): string {
  if (condition === 'idealny') return 'Jak nowy';
  return (
    PHONE_CONDITIONS.find((c) => c.value === condition)?.label ?? condition
  );
}

/**
 * Map a warehouse phone unit → public store product.
 * Skips non-iPhones and removed units. Never copies IMEI / purchasePrice.
 */
export function mapPhoneToProduct(
  phone: Phone,
  modelName: string,
): StoreProduct | null {
  if (!isIPhoneModel(modelName)) return null;

  const { cleanNote, meta } = parseStoreMeta(phone.note);
  const listing = warehouseToListingStatus(phone.status, meta);
  if (listing === 'hidden') return null;

  const listedInStore =
    listing === 'available' && meta.listedInStore !== false;

  const shortId = phone.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const productNumber = meta.productNumber ?? `SF-${shortId}`;
  const conditionLabel = conditionStoreLabel(phone.condition);
  const color = meta.color?.trim() || 'Niepodany';
  const description = cleanNote
    ? cleanNote
    : `${modelName} ${phone.storage}${color !== 'Niepodany' ? `, ${color}` : ''}. Stan: ${conditionLabel.toLowerCase()}, bateria ${phone.batteryPercent}%. Telefon przetestowany w SmartFix.`;

  return {
    id: phone.id,
    productNumber,
    modelName,
    storage: phone.storage,
    color,
    batteryPercent: phone.batteryPercent,
    condition: phone.condition,
    price: phone.listedValue,
    compareAtPrice: meta.compareAtPrice,
    warrantyMonths: meta.warrantyMonths ?? 12,
    description,
    listingStatus: listing,
    listedInStore,
    images: defaultImagesForModel(modelName),
    createdAt: phone.createdAt,
  };
}

export function assertPublicProduct(product: StoreProduct): void {
  const raw = product as unknown as Record<string, unknown>;
  if ('imei' in raw && raw.imei != null) {
    throw new Error('StoreProduct must never include IMEI');
  }
  if ('purchasePrice' in raw && raw.purchasePrice != null) {
    throw new Error('StoreProduct must never include purchasePrice');
  }
}

/** Products that appear in the public shop grid. */
export function isPurchasableListing(product: StoreProduct): boolean {
  return (
    product.listedInStore &&
    product.listingStatus === 'available' &&
    product.price > 0
  );
}
