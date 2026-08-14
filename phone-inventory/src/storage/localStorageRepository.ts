import { STORAGE_KEY } from '../domain/defaults';
import type { AppState } from '../domain/types';
import type { InventoryRepository } from './types';

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.models) &&
    Array.isArray(candidate.phones) &&
    Array.isArray(candidate.history) &&
    typeof candidate.finance === 'object' &&
    candidate.finance !== null
  );
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
      return isAppState(parsed) ? parsed : null;
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
    return (await response.json()) as AppState;
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
