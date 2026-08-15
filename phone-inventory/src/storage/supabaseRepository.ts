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
import { createSupabaseClient, type Database } from '../lib/supabase';
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
    const remote = await this.loadRemote();

    const modelNameById = new Map(state.models.map((m) => [m.id, m.name]));
    const nextIds = new Set(state.phones.map((p) => p.id));
    const soldPhoneIds = new Set(state.sales.map((s) => s.phoneId));

    const toUpsert = state.phones.map((phone) =>
      phoneToRow(phone, modelNameById.get(phone.modelId) ?? phone.modelId),
    );

    if (toUpsert.length > 0) {
      const { error } = await supabase.from('phones').upsert(toUpsert, {
        onConflict: 'id',
      });
      assertOk('phones upsert', error);
    }

    // Phones that left the in-stock list: sold if a sale exists, otherwise removed.
    const missingRemote = remote.phones.filter((p) => !nextIds.has(p.id));
    const toSold = missingRemote
      .filter((p) => soldPhoneIds.has(p.id))
      .map((p) => p.id);
    const toRemoved = missingRemote
      .filter((p) => !soldPhoneIds.has(p.id))
      .map((p) => p.id);

    const now = new Date().toISOString();

    if (toSold.length > 0) {
      const { error } = await supabase
        .from('phones')
        .update({ status: 'sold', updated_at: now })
        .in('id', toSold);
      assertOk('phones mark sold', error);
    }

    if (toRemoved.length > 0) {
      const { error } = await supabase
        .from('phones')
        .update({ status: 'removed', updated_at: now })
        .in('id', toRemoved);
      assertOk('phones mark removed', error);
    }

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

    const remoteHistoryIds = new Set(remote.history.map((h) => h.id));
    const newHistory = state.history
      .filter((h) => !remoteHistoryIds.has(h.id))
      .map(historyToRow);
    if (newHistory.length > 0) {
      const { error } = await supabase.from('history').upsert(newHistory, {
        onConflict: 'id',
      });
      assertOk('history upsert', error);
    }
  }

  async clear(): Promise<void> {
    const supabase = this.client();
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
