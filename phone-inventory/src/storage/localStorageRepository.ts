import { createId, createInitialState } from '../domain/defaults';
import type { AppState, HistoryEntry, SaleRecord } from '../domain/types';
import type { InventoryRepository } from './types';
import { STORAGE_KEY } from '../domain/defaults';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migrateSalesFromHistory(history: HistoryEntry[]): SaleRecord[] {
  return history
    .filter((entry) => entry.type === 'sale' && typeof entry.salePrice === 'number')
    .map((entry) => ({
      id: entry.id || createId(),
      phoneId: entry.phoneId ?? createId(),
      modelId: 'unknown',
      modelName: entry.modelName,
      storage: entry.storage,
      imei: entry.imei,
      purchasePrice: entry.purchasePrice ?? 0,
      salePrice: entry.salePrice ?? 0,
      profit:
        typeof entry.profit === 'number'
          ? entry.profit
          : (entry.salePrice ?? 0) - (entry.purchasePrice ?? 0),
      soldAt: entry.date,
    }));
}

/** Accept v1 (no sales) and v2 payloads; always return AppState v2. */
export function normalizeAppState(value: unknown): AppState | null {
  if (!isObject(value)) return null;
  if (!Array.isArray(value.models) || !Array.isArray(value.phones)) return null;
  if (!Array.isArray(value.history) || !isObject(value.finance)) return null;

  const history = value.history as HistoryEntry[];
  const sales = Array.isArray(value.sales)
    ? (value.sales as SaleRecord[])
    : migrateSalesFromHistory(history);

  return {
    version: 2,
    models: value.models as AppState['models'],
    phones: value.phones as AppState['phones'],
    sales,
    finance: value.finance as unknown as AppState['finance'],
    history,
  };
}

export class LocalStorageRepository implements InventoryRepository {
  private readonly key: string;
  private readonly storage: Storage | null;

  constructor(
    key: string = STORAGE_KEY,
    storage: Storage | null = typeof localStorage !== 'undefined'
      ? localStorage
      : null,
  ) {
    this.key = key;
    this.storage = storage;
  }

  async load(): Promise<AppState | null> {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return normalizeAppState(parsed);
    } catch {
      return null;
    }
  }

  async save(state: AppState): Promise<void> {
    if (!this.storage) return;
    this.storage.setItem(this.key, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    if (!this.storage) return;
    this.storage.removeItem(this.key);
  }
}

/** Placeholder for a future REST/Supabase/etc. backend. */
export class RemoteInventoryRepository implements InventoryRepository {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async load(): Promise<AppState | null> {
    const response = await fetch(this.endpoint);
    if (!response.ok) {
      throw new Error(`Nie udało się pobrać danych (${response.status}).`);
    }
    return normalizeAppState(await response.json()) ?? createInitialState();
  }

  async save(state: AppState): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!response.ok) {
      throw new Error(`Nie udało się zapisać danych (${response.status}).`);
    }
  }

  async clear(): Promise<void> {
    const response = await fetch(this.endpoint, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Nie udało się wyczyścić danych (${response.status}).`);
    }
  }
}

export function createDefaultRepository(): InventoryRepository {
  return new LocalStorageRepository();
}
