import { CATALOG_MODELS, modelIdFromName, normalizeModelName } from './catalog';
import type { AppState, Model } from './types';

export const STORAGE_KEY = 'phone-inventory:v1';

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createInitialModels(now = new Date().toISOString()): Model[] {
  return CATALOG_MODELS.map((name) => ({
    id: modelIdFromName(name),
    name,
    createdAt: now,
  }));
}

/** Ensure catalog models exist with stable ids; keep existing when names match. */
export function ensureCatalogModels(
  models: Model[],
  now = new Date().toISOString(),
): Model[] {
  const byName = new Map<string, Model>();
  for (const model of models) {
    const name = normalizeModelName(model.name);
    if (!byName.has(name.toLowerCase())) {
      byName.set(name.toLowerCase(), {
        ...model,
        id: modelIdFromName(name),
        name,
      });
    }
  }

  const next: Model[] = [];
  for (const catalogName of CATALOG_MODELS) {
    const existing = byName.get(catalogName.toLowerCase());
    if (existing) {
      next.push({
        ...existing,
        id: modelIdFromName(catalogName),
        name: catalogName,
      });
      byName.delete(catalogName.toLowerCase());
    } else {
      next.push({
        id: modelIdFromName(catalogName),
        name: catalogName,
        createdAt: now,
      });
    }
  }

  for (const leftover of byName.values()) {
    next.push(leftover);
  }
  return next;
}

export function createInitialState(now = new Date().toISOString()): AppState {
  return {
    version: 3,
    models: createInitialModels(now),
    phones: [],
    sales: [],
    finance: { cash: 0, bank: 0 },
    history: [],
  };
}
