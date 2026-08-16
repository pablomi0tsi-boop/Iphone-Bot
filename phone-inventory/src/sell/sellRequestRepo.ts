import type { SellRequest } from './types';

const STORAGE_KEY = 'smartfix-store:sell-requests:v1';

/**
 * Persistence for sell requests.
 * Today: localStorage. Later: swap implementation to Supabase `sell_requests`.
 */
export interface SellRequestRepository {
  create(request: Omit<SellRequest, 'id' | 'createdAt' | 'referenceNumber' | 'status'> & {
    status?: SellRequest['status'];
  }): Promise<SellRequest>;
  list(): Promise<SellRequest[]>;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextReferenceNumber(existing: SellRequest[]): string {
  const max = existing.reduce((acc, item) => {
    const n = Number(item.referenceNumber.replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `SF-${String(max + 1).padStart(6, '0')}`;
}

function loadAll(): SellRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SellRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(items: SellRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localSellRequestRepository: SellRequestRepository = {
  async create(input) {
    const existing = loadAll();
    const request: SellRequest = {
      ...input,
      id: createId(),
      createdAt: new Date().toISOString(),
      status: input.status ?? 'new',
      referenceNumber: nextReferenceNumber(existing),
      bankAccount: input.bankAccount?.trim() || null,
      userId: input.userId ?? null,
    };
    saveAll([request, ...existing]);
    return request;
  },

  async list() {
    return loadAll();
  },
};

/** Active repository — replace with Supabase adapter when table is live. */
export const sellRequestRepository: SellRequestRepository =
  localSellRequestRepository;
