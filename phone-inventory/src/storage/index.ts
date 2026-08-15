import { isSupabaseConfigured } from '../lib/supabase';
import {
  LocalStorageRepository,
  RemoteInventoryRepository,
  normalizeAppState,
} from './localStorageRepository';
import { SupabaseInventoryRepository } from './supabaseRepository';
import type { InventoryRepository } from './types';

export type { InventoryRepository } from './types';
export {
  LocalStorageRepository,
  RemoteInventoryRepository,
  normalizeAppState,
};
export { SupabaseInventoryRepository } from './supabaseRepository';

/**
 * Prefer Supabase when env vars are set; otherwise fall back to localStorage
 * (local/e2e without cloud credentials).
 */
export function createDefaultRepository(): InventoryRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseInventoryRepository();
  }
  return new LocalStorageRepository();
}
