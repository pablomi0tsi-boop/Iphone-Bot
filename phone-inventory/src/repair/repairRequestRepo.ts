import type { RepairRequest } from './types';

const STORAGE_KEY = 'smartfix-store:repair-requests:v1';

/**
 * Persistence for repair requests.
 * Today: localStorage. Later: swap to Supabase `repair_requests`.
 */
export interface RepairRequestRepository {
  create(
    request: Omit<
      RepairRequest,
      'id' | 'createdAt' | 'requestNumber' | 'status'
    > & { status?: RepairRequest['status'] },
  ): Promise<RepairRequest>;
  list(): Promise<RepairRequest[]>;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextRequestNumber(existing: RepairRequest[]): string {
  const max = existing.reduce((acc, item) => {
    const n = Number(item.requestNumber.replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `SR-${String(max + 1).padStart(6, '0')}`;
}

function loadAll(): RepairRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RepairRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(items: RepairRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localRepairRequestRepository: RepairRequestRepository = {
  async create(input) {
    const existing = loadAll();
    const request: RepairRequest = {
      ...input,
      id: createId(),
      createdAt: new Date().toISOString(),
      status: input.status ?? 'new',
      requestNumber: nextRequestNumber(existing),
      userId: input.userId ?? null,
      photoNames: input.photoNames ?? [],
    };
    saveAll([request, ...existing]);
    return request;
  },

  async list() {
    return loadAll();
  },
};

export const repairRequestRepository: RepairRequestRepository =
  localRepairRequestRepository;
