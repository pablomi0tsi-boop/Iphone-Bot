import { PHONE_CONDITIONS, type PhoneCondition } from '../domain/types';

export function formatPricePln(value: number): string {
  return `${value.toLocaleString('pl-PL')} zł`;
}

export function conditionLabel(condition: PhoneCondition): string {
  return (
    PHONE_CONDITIONS.find((c) => c.value === condition)?.label ?? condition
  );
}

export function batteryLabel(percent: number): string {
  return `${percent}%`;
}
