import { conditionStoreLabel } from './mapPhoneToProduct';
import type { PhoneCondition } from '../domain/types';

export function formatPricePln(value: number): string {
  return `${value.toLocaleString('pl-PL')} zł`;
}

export function batteryLabel(percent: number): string {
  return `${percent}%`;
}

export function warrantyLabel(months: number): string {
  return `${months} miesięcy gwarancji`;
}

export { conditionStoreLabel };

export function availabilityLabel(
  status: 'available' | 'reserved' | 'sold',
): string {
  switch (status) {
    case 'available':
      return 'Dostępny';
    case 'reserved':
      return 'Zarezerwowany';
    case 'sold':
      return 'Sprzedany';
  }
}

export function conditionBadge(condition: PhoneCondition): string {
  return conditionStoreLabel(condition);
}

/** Discount percent when compareAtPrice is higher than price; else null. */
export function discountPercent(
  price: number,
  compareAtPrice?: number,
): number | null {
  if (typeof compareAtPrice !== 'number' || compareAtPrice <= price) {
    return null;
  }
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function isOnSale(product: {
  price: number;
  compareAtPrice?: number;
}): boolean {
  return discountPercent(product.price, product.compareAtPrice) != null;
}
