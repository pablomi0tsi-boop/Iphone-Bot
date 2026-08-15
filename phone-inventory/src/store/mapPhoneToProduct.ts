import type { Phone } from '../domain/types';
import { PHONE_CONDITIONS } from '../domain/types';
import {
  DEFAULT_WARRANTY,
  type StoreBrand,
  type StoreProduct,
} from './types';

/** Infer brand from model name for filters / category tiles. */
export function brandFromModelName(modelName: string): StoreBrand {
  const lower = modelName.toLowerCase();
  if (lower.includes('iphone') || lower.includes('apple')) return 'Apple';
  if (lower.includes('samsung') || lower.includes('galaxy')) return 'Samsung';
  return 'Other';
}

/**
 * Convert a warehouse phone unit into a public store product.
 * Explicitly omits IMEI and purchasePrice — never expose those publicly.
 */
export function mapPhoneToProduct(
  phone: Phone,
  modelName: string,
  options?: { color?: string; images?: string[]; warranty?: string },
): StoreProduct | null {
  if (phone.status !== 'in_stock') return null;
  if (phone.listedValue <= 0) return null;

  const conditionLabel =
    PHONE_CONDITIONS.find((c) => c.value === phone.condition)?.label ??
    phone.condition;

  const note = phone.note?.trim();
  const description = note
    ? note
    : `${modelName} ${phone.storage} — stan ${conditionLabel.toLowerCase()}, bateria ${phone.batteryPercent}%. Telefon sprawdzony w SmartFix.`;

  return {
    id: phone.id,
    modelName,
    brand: brandFromModelName(modelName),
    storage: phone.storage,
    color: options?.color,
    batteryPercent: phone.batteryPercent,
    condition: phone.condition,
    price: phone.listedValue,
    description,
    warranty: options?.warranty ?? DEFAULT_WARRANTY,
    images: options?.images ?? [],
    createdAt: phone.createdAt,
  };
}

/** Guard: ensure sensitive fields never leak into JSON / UI props. */
export function assertPublicProduct(product: StoreProduct): void {
  const raw = product as unknown as Record<string, unknown>;
  if ('imei' in raw && raw.imei != null) {
    throw new Error('StoreProduct must never include IMEI');
  }
  if ('purchasePrice' in raw && raw.purchasePrice != null) {
    throw new Error('StoreProduct must never include purchasePrice');
  }
}
