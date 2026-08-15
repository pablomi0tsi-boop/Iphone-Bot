import type { AppState, Model } from './types';

export const STORAGE_KEY = 'phone-inventory:v1';

export const INITIAL_MODEL_NAMES = [
  'iPhone 11',
  'iPhone 11 Pro',
  'iPhone 11 Pro Max',
  'iPhone 12',
  'iPhone 12 Pro',
  'iPhone 12 Pro Max',
  'iPhone 13',
  'iPhone 13 mini',
  'iPhone 13 Pro',
  'iPhone 13 Pro Max',
  'iPhone 14',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'iPhone 15',
  'iPhone 15 Pro',
  'iPhone 15 Pro Max',
  'iPhone 16',
] as const;

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialModels(now = new Date().toISOString()): Model[] {
  return INITIAL_MODEL_NAMES.map((name) => ({
    id: createId(),
    name,
    createdAt: now,
  }));
}

export function createInitialState(now = new Date().toISOString()): AppState {
  return {
    version: 2,
    models: createInitialModels(now),
    phones: [],
    sales: [],
    finance: { cash: 0, bank: 0 },
    history: [],
  };
}
