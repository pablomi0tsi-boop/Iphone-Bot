import { createId } from './defaults';
import { calcProfit, dateInputToIso } from './calculations';
import type {
  AddPhoneInput,
  AppState,
  HistoryEntry,
  SaleRecord,
  SellPhoneInput,
  UpdatePhoneInput,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function pushHistory(state: AppState, entry: Omit<HistoryEntry, 'id'>): AppState {
  const next: HistoryEntry = { ...entry, id: createId() };
  return {
    ...state,
    history: [next, ...state.history],
  };
}

function assertMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} musi być liczbą ≥ 0.`);
  }
}

function assertBattery(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('Kondycja baterii musi być w zakresie 0–100%.');
  }
}

export function addPhone(state: AppState, input: AddPhoneInput): AppState {
  assertMoney(input.purchasePrice, 'Cena zakupu');
  assertMoney(input.listedValue, 'Cena sprzedaży / wartość');
  assertBattery(input.batteryPercent);

  const model = state.models.find((item) => item.id === input.modelId);
  if (!model) throw new Error('Nie znaleziono modelu.');

  const storage = input.storage.trim();
  const imei = input.imei.trim();
  if (!storage) throw new Error('Pamięć jest wymagana.');
  if (!imei) throw new Error('IMEI jest wymagane.');

  const createdAt = nowIso();
  const phone = {
    id: createId(),
    modelId: input.modelId,
    storage,
    imei,
    batteryPercent: Math.round(input.batteryPercent),
    condition: input.condition,
    note: input.note?.trim() || undefined,
    purchasePrice: input.purchasePrice,
    listedValue: input.listedValue,
    createdAt,
    updatedAt: createdAt,
  };

  const next: AppState = {
    ...state,
    phones: [...state.phones, phone],
  };

  return pushHistory(next, {
    type: 'purchase',
    date: createdAt,
    modelName: model.name,
    purchasePrice: phone.purchasePrice,
    salePrice: phone.listedValue,
    storage: phone.storage,
    imei: phone.imei,
    note: phone.note,
    phoneId: phone.id,
  });
}

export function updatePhone(state: AppState, input: UpdatePhoneInput): AppState {
  assertMoney(input.purchasePrice, 'Cena zakupu');
  assertMoney(input.listedValue, 'Cena sprzedaży / wartość');
  assertBattery(input.batteryPercent);

  const index = state.phones.findIndex((item) => item.id === input.phoneId);
  if (index < 0) throw new Error('Nie znaleziono telefonu.');

  const existing = state.phones[index];
  const model = state.models.find((item) => item.id === existing.modelId);
  const storage = input.storage.trim();
  const imei = input.imei.trim();
  if (!storage) throw new Error('Pamięć jest wymagana.');
  if (!imei) throw new Error('IMEI jest wymagane.');

  const updated = {
    ...existing,
    storage,
    imei,
    batteryPercent: Math.round(input.batteryPercent),
    condition: input.condition,
    note: input.note?.trim() || undefined,
    purchasePrice: input.purchasePrice,
    listedValue: input.listedValue,
    updatedAt: nowIso(),
  };

  const phones = [...state.phones];
  phones[index] = updated;

  return pushHistory(
    { ...state, phones },
    {
      type: 'update',
      date: updated.updatedAt,
      modelName: model?.name ?? 'Nieznany model',
      purchasePrice: updated.purchasePrice,
      salePrice: updated.listedValue,
      storage: updated.storage,
      imei: updated.imei,
      note: updated.note,
      phoneId: updated.id,
    },
  );
}

export function removePhone(state: AppState, phoneId: string): AppState {
  const phone = state.phones.find((item) => item.id === phoneId);
  if (!phone) throw new Error('Nie znaleziono telefonu.');
  const model = state.models.find((item) => item.id === phone.modelId);

  const next: AppState = {
    ...state,
    phones: state.phones.filter((item) => item.id !== phoneId),
  };

  return pushHistory(next, {
    type: 'remove',
    date: nowIso(),
    modelName: model?.name ?? 'Nieznany model',
    purchasePrice: phone.purchasePrice,
    salePrice: phone.listedValue,
    storage: phone.storage,
    imei: phone.imei,
    note: 'Usunięto z magazynu',
    phoneId: phone.id,
  });
}

export function sellPhone(state: AppState, input: SellPhoneInput): AppState {
  assertMoney(input.salePrice, 'Cena sprzedaży');
  if (!input.soldAt?.trim()) throw new Error('Data sprzedaży jest wymagana.');
  const buyerName = input.buyerName.trim();
  if (!buyerName) throw new Error('Imię i nazwisko kupującego jest wymagane.');

  const phone = state.phones.find((item) => item.id === input.phoneId);
  if (!phone) throw new Error('Nie znaleziono telefonu w magazynie.');

  const model = state.models.find((item) => item.id === phone.modelId);
  const modelName = model?.name ?? 'Nieznany model';
  const profit = calcProfit(input.salePrice, phone.purchasePrice);
  const soldAt = dateInputToIso(input.soldAt.trim());

  const sale: SaleRecord = {
    id: createId(),
    phoneId: phone.id,
    modelId: phone.modelId,
    modelName,
    storage: phone.storage,
    imei: phone.imei,
    buyerName,
    purchasePrice: phone.purchasePrice,
    salePrice: input.salePrice,
    profit,
    soldAt,
  };

  const next: AppState = {
    ...state,
    phones: state.phones.filter((item) => item.id !== phone.id),
    sales: [sale, ...state.sales],
  };

  return pushHistory(next, {
    type: 'sale',
    date: soldAt,
    modelName,
    purchasePrice: phone.purchasePrice,
    salePrice: input.salePrice,
    profit,
    storage: phone.storage,
    imei: phone.imei,
    buyerName,
    phoneId: phone.id,
  });
}
