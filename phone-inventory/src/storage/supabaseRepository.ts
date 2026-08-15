import { createInitialState, ensureCatalogModels } from '../domain/defaults';
import type {
  AppState,
  Finance,
  HistoryEntry,
  Phone,
  PhoneCondition,
  PhoneStatus,
  SaleRecord,
} from '../domain/types';
import {
  createSupabaseClient,
  ensureSupabaseAuth,
  type Database,
} from '../lib/supabase';
import { LocalStorageRepository } from './localStorageRepository';
import type { InventoryRepository } from './types';

type PhoneRow = Database['public']['Tables']['phones']['Row'];
type SaleRow = Database['public']['Tables']['sales']['Row'];
type FinanceRow = Database['public']['Tables']['finance']['Row'];
type HistoryRow = Database['public']['Tables']['history']['Row'];

function mapPhone(row: PhoneRow): Phone {
  return {
    id: row.id,
    modelId: row.model_id,
    storage: row.storage,
    imei: row.imei,
    batteryPercent: row.battery_percent,
    condition: row.condition as PhoneCondition,
    note: row.note ?? undefined,
    purchasePrice: Number(row.purchase_price),
    listedValue: Number(row.listed_value),
    status: (row.status as PhoneStatus) ?? 'in_stock',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function phoneToRow(phone: Phone, modelName: string): PhoneRow {
  return {
    id: phone.id,
    model_id: phone.modelId,
    model_name: modelName,
    storage: phone.storage,
    imei: phone.imei,
    battery_percent: phone.batteryPercent,
    condition: phone.condition,
    note: phone.note ?? null,
    purchase_price: phone.purchasePrice,
    listed_value: phone.listedValue,
    status: phone.status ?? 'in_stock',
    created_at: phone.createdAt,
    updated_at: phone.updatedAt,
  };
}

function mapSale(row: SaleRow): SaleRecord {
  return {
    id: row.id,
    phoneId: row.phone_id,
    modelId: row.model_id,
    modelName: row.model_name,
    storage: row.storage ?? undefined,
    imei: row.imei ?? undefined,
    buyerName: row.buyer_name,
    purchasePrice: Number(row.purchase_price),
    salePrice: Number(row.sale_price),
    profit: Number(row.profit),
    depositTo: row.deposit_to,
    soldAt: row.sold_at,
  };
}

function saleToRow(sale: SaleRecord): Omit<SaleRow, 'created_at'> {
  return {
    id: sale.id,
    phone_id: sale.phoneId,
    model_id: sale.modelId,
    model_name: sale.modelName,
    storage: sale.storage ?? null,
    imei: sale.imei ?? null,
    buyer_name: sale.buyerName ?? '',
    purchase_price: sale.purchasePrice,
    sale_price: sale.salePrice,
    profit: sale.profit,
    deposit_to: sale.depositTo ?? 'cash',
    sold_at: sale.soldAt,
  };
}

function mapFinance(row: FinanceRow | null): Finance {
  if (!row) return { cash: 0, bank: 0 };
  return {
    cash: Number(row.cash),
    bank: Number(row.bank),
  };
}

function mapHistory(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    type: row.type as HistoryEntry['type'],
    date: row.date,
    modelName: row.model_name,
    purchasePrice:
      row.purchase_price == null ? undefined : Number(row.purchase_price),
    salePrice: row.sale_price == null ? undefined : Number(row.sale_price),
    profit: row.profit == null ? undefined : Number(row.profit),
    storage: row.storage ?? undefined,
    imei: row.imei ?? undefined,
    buyerName: row.buyer_name ?? undefined,
    note: row.note ?? undefined,
    phoneId: row.phone_id ?? undefined,
  };
}

function historyToRow(entry: HistoryEntry): Omit<HistoryRow, 'created_at'> {
  return {
    id: entry.id,
    type: entry.type,
    date: entry.date,
    model_name: entry.modelName,
    purchase_price: entry.purchasePrice ?? null,
    sale_price: entry.salePrice ?? null,
    profit: entry.profit ?? null,
    storage: entry.storage ?? null,
    imei: entry.imei ?? null,
    buyer_name: entry.buyerName ?? null,
    note: entry.note ?? null,
    phone_id: entry.phoneId ?? null,
  };
}

/** Minimal sold-phone row from a sale snapshot (when unit left in-stock state). */
function soldPhoneFromSale(sale: SaleRecord, updatedAt: string): PhoneRow {
  return {
    id: sale.phoneId,
    model_id: sale.modelId,
    model_name: sale.modelName,
    storage: sale.storage ?? '128 GB',
    imei: sale.imei ?? '',
    battery_percent: 100,
    condition: 'dobry',
    note: null,
    purchase_price: sale.purchasePrice,
    listed_value: sale.salePrice,
    status: 'sold',
    created_at: sale.soldAt,
    updated_at: updatedAt,
  };
}

/** Minimal removed-phone row from a history snapshot. */
function removedPhoneFromHistory(
  entry: HistoryEntry,
  updatedAt: string,
): PhoneRow | null {
  if (!entry.phoneId) return null;
  return {
    id: entry.phoneId,
    model_id: 'unknown',
    model_name: entry.modelName || 'Nieznany model',
    storage: entry.storage ?? '128 GB',
    imei: entry.imei ?? '',
    battery_percent: 100,
    condition: 'dobry',
    note: entry.note ?? null,
    purchase_price: entry.purchasePrice ?? 0,
    listed_value: entry.salePrice ?? entry.purchasePrice ?? 0,
    status: 'removed',
    created_at: entry.date,
    updated_at: updatedAt,
  };
}

function assertOk(label: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`Supabase ${label}: ${error.message}`);
  }
}

function isEmptyInventory(state: AppState): boolean {
  return (
    state.phones.length === 0 &&
    state.sales.length === 0 &&
    state.history.length === 0 &&
    state.finance.cash === 0 &&
    state.finance.bank === 0
  );
}

/**
 * Cloud repository. In-stock phones are loaded into app state.
 * Sold/removed units remain in `phones` with updated status (history preserved).
 */
export class SupabaseInventoryRepository implements InventoryRepository {
  private client() {
    return createSupabaseClient();
  }

  private async loadRemote(): Promise<AppState> {
    const supabase = this.client();
    await ensureSupabaseAuth(supabase);

    const [phonesRes, salesRes, financeRes, historyRes] = await Promise.all([
      supabase
        .from('phones')
        .select('*')
        .eq('status', 'in_stock')
        .order('created_at', { ascending: false }),
      supabase
        .from('sales')
        .select('*')
        .order('sold_at', { ascending: false }),
      supabase.from('finance').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('history')
        .select('*')
        .order('date', { ascending: false })
        .limit(500),
    ]);

    assertOk('phones', phonesRes.error);
    assertOk('sales', salesRes.error);
    assertOk('finance', financeRes.error);
    assertOk('history', historyRes.error);

    const base = createInitialState();
    return {
      version: 3,
      models: ensureCatalogModels(base.models),
      phones: ((phonesRes.data ?? []) as PhoneRow[]).map(mapPhone),
      sales: ((salesRes.data ?? []) as SaleRow[]).map(mapSale),
      finance: mapFinance((financeRes.data as FinanceRow | null) ?? null),
      history: ((historyRes.data ?? []) as HistoryRow[]).map(mapHistory),
    };
  }

  async load(): Promise<AppState | null> {
    const remote = await this.loadRemote();
    if (!isEmptyInventory(remote)) return remote;

    // One-time migrate from localStorage when cloud is empty.
    const local = await new LocalStorageRepository().load();
    if (!local || isEmptyInventory(local)) return remote;

    await this.save(local);
    return this.loadRemote();
  }

  async save(state: AppState): Promise<void> {
    const supabase = this.client();
    await ensureSupabaseAuth(supabase);
    const remote = await this.loadRemote();

    const modelNameById = new Map(state.models.map((m) => [m.id, m.name]));
    const nextIds = new Set(state.phones.map((p) => p.id));
    const soldPhoneIds = new Set(state.sales.map((s) => s.phoneId));
    const now = new Date().toISOString();

    // IDs known to exist in public.phones after the phone writes below.
    const ensuredPhoneIds = new Set<string>();

    // --- 1) In-stock phones first (purchase / update keep the unit here) ---
    const inStockRows = state.phones.map((phone) =>
      phoneToRow(phone, modelNameById.get(phone.modelId) ?? phone.modelId),
    );
    if (inStockRows.length > 0) {
      const { error } = await supabase.from('phones').upsert(inStockRows, {
        onConflict: 'id',
      });
      assertOk('phones upsert', error);
      for (const row of inStockRows) ensuredPhoneIds.add(row.id);
    }

    // --- 2) Units that left stock: ensure row exists, then set status ---
    const missingRemote = remote.phones.filter((p) => !nextIds.has(p.id));
    const toSold = missingRemote
      .filter((p) => soldPhoneIds.has(p.id))
      .map((p) => p.id);
    const toRemoved = missingRemote
      .filter((p) => !soldPhoneIds.has(p.id))
      .map((p) => p.id);

    // Sales whose phone is not in-stock in app state (and maybe not remote yet).
    const soldRowsNeeded: PhoneRow[] = [];
    for (const sale of state.sales) {
      if (nextIds.has(sale.phoneId) || ensuredPhoneIds.has(sale.phoneId)) continue;
      if (toSold.includes(sale.phoneId)) {
        ensuredPhoneIds.add(sale.phoneId);
        continue;
      }
      // Phone never written as in_stock on this save (e.g. add+sell, or local migrate).
      soldRowsNeeded.push(soldPhoneFromSale(sale, now));
      ensuredPhoneIds.add(sale.phoneId);
    }
    if (soldRowsNeeded.length > 0) {
      const { error } = await supabase.from('phones').upsert(soldRowsNeeded, {
        onConflict: 'id',
      });
      assertOk('phones upsert sold', error);
    }

    if (toSold.length > 0) {
      const { error } = await supabase
        .from('phones')
        .update({ status: 'sold', updated_at: now })
        .in('id', toSold);
      assertOk('phones mark sold', error);
      for (const id of toSold) ensuredPhoneIds.add(id);
    }

    // Removals: remote in-stock units that disappeared without a sale.
    if (toRemoved.length > 0) {
      const { error } = await supabase
        .from('phones')
        .update({ status: 'removed', updated_at: now })
        .in('id', toRemoved);
      assertOk('phones mark removed', error);
      for (const id of toRemoved) ensuredPhoneIds.add(id);
    }

    // History-only removals (e.g. localStorage migrate) — phone not in remote/state/sales.
    const removedRowsNeeded: PhoneRow[] = [];
    for (const entry of state.history) {
      if (entry.type !== 'remove' || !entry.phoneId) continue;
      if (ensuredPhoneIds.has(entry.phoneId) || nextIds.has(entry.phoneId)) continue;
      if (soldPhoneIds.has(entry.phoneId)) continue;
      const row = removedPhoneFromHistory(entry, now);
      if (!row) continue;
      removedRowsNeeded.push(row);
      ensuredPhoneIds.add(entry.phoneId);
    }
    if (removedRowsNeeded.length > 0) {
      const { error } = await supabase.from('phones').upsert(removedRowsNeeded, {
        onConflict: 'id',
      });
      assertOk('phones upsert removed', error);
    }

    // --- 3) Sales (FK → phones) ---
    const remoteSaleIds = new Set(remote.sales.map((s) => s.id));
    const newSales = state.sales
      .filter((s) => !remoteSaleIds.has(s.id))
      .map(saleToRow);
    if (newSales.length > 0) {
      const { error } = await supabase.from('sales').upsert(newSales, {
        onConflict: 'id',
      });
      assertOk('sales upsert', error);
    }

    // --- 4) Finance ---
    const { error: financeError } = await supabase.from('finance').upsert(
      {
        id: 1,
        cash: state.finance.cash,
        bank: state.finance.bank,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
    assertOk('finance upsert', financeError);

    // --- 5) History last; phone_id only when phones.id is guaranteed ---
    const remoteHistoryIds = new Set(remote.history.map((h) => h.id));
    const newHistory = state.history
      .filter((h) => !remoteHistoryIds.has(h.id))
      .map((entry) => {
        const row = historyToRow(entry);
        if (row.phone_id && !ensuredPhoneIds.has(row.phone_id)) {
          // No matching phones row (finance-only / orphan) — allowed NULL.
          return { ...row, phone_id: null };
        }
        return row;
      });
    if (newHistory.length > 0) {
      const { error } = await supabase.from('history').upsert(newHistory, {
        onConflict: 'id',
      });
      assertOk('history upsert', error);
    }
  }

  async clear(): Promise<void> {
    const supabase = this.client();
    await ensureSupabaseAuth(supabase);
    const ops = await Promise.all([
      supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('history').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('phones').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('finance').upsert({
        id: 1,
        cash: 0,
        bank: 0,
        updated_at: new Date().toISOString(),
      }),
    ]);
    for (const res of ops) {
      if (res.error) throw new Error(`Supabase clear: ${res.error.message}`);
    }
  }
}
