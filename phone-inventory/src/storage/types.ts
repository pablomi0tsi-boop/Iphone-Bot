import type { AppState } from '../domain/types';

/**
 * Storage port — swap LocalStorageRepository for an API/DB implementation later
 * without changing UI or domain logic.
 */
export interface InventoryRepository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}
