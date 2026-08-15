import { defaultListedValue, normalizeModelName } from '../domain/catalog';
import { createId, createInitialState, ensureCatalogModels } from '../domain/defaults';
import { STORAGE_KEY } from '../domain/defaults';
import type {
  AppState,
  HistoryEntry,
  Phone,
  PhoneCondition,
  SaleRecord,
} from '../domain/types';
import type { InventoryRepository } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapLegacyCondition(value: unknown): PhoneCondition {
  switch (value) {
    case 'idealny':
    case 'bardzo_dobry':
    case 'dobry':
    case 'uzywany':
    case 'uszkodzony':
      return value;
    case 'nowy':
      return 'idealny';
    case 'zadrapania':
      return 'uzywany';
    default:
      return 'dobry';
  }
}

function migratePhone(
  raw: Record<string, unknown>,
  models: AppState['models'],
): Phone | null {
  if (typeof raw.id !== 'string' || typeof raw.modelId !== 'string') return null;
  const model = models.find((item) => item.id === raw.modelId);
  const modelName = model?.name ?? '';
  const storage =
    typeof raw.storage === 'string' && raw.storage.trim()
      ? raw.storage.trim()
      : '128 GB';
  const purchasePrice =
    typeof raw.purchasePrice === 'number' ? raw.purchasePrice : 0;
  const listedValue =
    typeof raw.listedValue === 'number'
      ? raw.listedValue
      : (defaultListedValue(modelName, storage) ?? purchasePrice);
  const createdAt =
    typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();

  return {
    id: raw.id,
    modelId: raw.modelId,
    storage,
    imei: typeof raw.imei === 'string' ? raw.imei : '',
    batteryPercent:
      typeof raw.batteryPercent === 'number' ? raw.batteryPercent : 100,
    condition: mapLegacyCondition(raw.condition),
    note: typeof raw.note === 'string' ? raw.note : undefined,
    purchasePrice,
    listedValue,
    createdAt,
    updatedAt:
      typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
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

/** Accept older payloads; always return AppState v3. */
export function normalizeAppState(value: unknown): AppState | null {
  if (!isObject(value)) return null;
  if (!Array.isArray(value.models) || !Array.isArray(value.phones)) return null;
  if (!Array.isArray(value.history)) return null;

  const models = ensureCatalogModels(
    (value.models as AppState['models']).map((model) => ({
      ...model,
      name: normalizeModelName(model.name),
    })),
  );

  const phones = (value.phones as unknown[])
    .map((item) => (isObject(item) ? migratePhone(item, models) : null))
    .filter((item): item is Phone => item !== null)
    .map((phone) => {
      // Remap modelId if name was normalized onto a catalog model with different id
      const oldModel = (value.models as AppState['models']).find(
        (m) => m.id === phone.modelId,
      );
      if (!oldModel) return phone;
      const canonical = models.find(
        (m) => m.name.toLowerCase() === normalizeModelName(oldModel.name).toLowerCase(),
      );
      return canonical ? { ...phone, modelId: canonical.id } : phone;
    });

  const history = value.history as HistoryEntry[];
  const sales = Array.isArray(value.sales)
    ? (value.sales as SaleRecord[])
    : migrateSalesFromHistory(history);

  return {
    version: 3,
    models,
    phones,
    sales,
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
      return normalizeAppState(JSON.parse(raw));
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
