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
