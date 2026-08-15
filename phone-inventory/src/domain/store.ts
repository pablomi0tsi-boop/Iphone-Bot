import { createId } from './defaults';
import { calcProfit, dateInputToIso } from './calculations';
import type {
  AddModelInput,
  AddPhoneInput,
  AppState,
  HistoryEntry,
  SaleRecord,
  SellPhoneInput,
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

export function addModel(state: AppState, input: AddModelInput): AppState {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Nazwa modelu jest wymagana.');
  }
  const exists = state.models.some(
    (model) => model.name.toLowerCase() === name.toLowerCase(),
  );
  if (exists) {
    throw new Error('Taki model już istnieje.');
  }
  return {
    ...state,
    models: [
      ...state.models,
      { id: createId(), name, createdAt: nowIso() },
    ],
  };
}

export function addPhone(state: AppState, input: AddPhoneInput): AppState {
  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0) {
    throw new Error('Cena zakupu musi być liczbą ≥ 0.');
  }
  const model = state.models.find((item) => item.id === input.modelId);
  if (!model) {
    throw new Error('Nie znaleziono modelu.');
  }

  const phone = {
    id: createId(),
    modelId: input.modelId,
    purchasePrice: input.purchasePrice,
    storage: input.storage?.trim() || undefined,
    imei: input.imei?.trim() || undefined,
    condition: input.condition,
    note: input.note?.trim() || undefined,
    createdAt: nowIso(),
  };

  let next: AppState = {
    ...state,
    phones: [...state.phones, phone],
  };

  const deduct = input.deductFromCash !== false;
  if (deduct) {
    next = {
      ...next,
      finance: {
        ...next.finance,
        cash: next.finance.cash - input.purchasePrice,
      },
    };
  }

  return pushHistory(next, {
    type: 'purchase',
    date: phone.createdAt,
    modelName: model.name,
    purchasePrice: phone.purchasePrice,
    storage: phone.storage,
    imei: phone.imei,
    note: phone.note,
    phoneId: phone.id,
  });
}

/** Quick +1: add a phone with given purchase price (model already known). */
export function incrementStock(
  state: AppState,
  modelId: string,
  purchasePrice: number,
): AppState {
  return addPhone(state, {
    modelId,
    purchasePrice,
    condition: 'dobry',
    deductFromCash: true,
  });
}

/**
 * Quick -1: remove the newest phone of that model (not a sale).
 * Refunds purchase price to cash.
 */
export function decrementStock(state: AppState, modelId: string): AppState {
  const model = state.models.find((item) => item.id === modelId);
  if (!model) {
    throw new Error('Nie znaleziono modelu.');
  }

  const phones = state.phones
    .filter((phone) => phone.modelId === modelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (phones.length === 0) {
    throw new Error('Brak telefonów tego modelu w magazynie.');
  }

  const removed = phones[0];
  const next: AppState = {
    ...state,
    phones: state.phones.filter((phone) => phone.id !== removed.id),
    finance: {
      ...state.finance,
      cash: state.finance.cash + removed.purchasePrice,
    },
  };

  return pushHistory(next, {
    type: 'remove',
    date: nowIso(),
    modelName: model.name,
    purchasePrice: removed.purchasePrice,
    storage: removed.storage,
    imei: removed.imei,
    note: 'Usunięto ze stanu (−)',
    phoneId: removed.id,
  });
}

export function sellPhone(state: AppState, input: SellPhoneInput): AppState {
  if (!Number.isFinite(input.salePrice) || input.salePrice < 0) {
    throw new Error('Cena sprzedaży musi być liczbą ≥ 0.');
  }
  if (!input.soldAt?.trim()) {
    throw new Error('Data sprzedaży jest wymagana.');
  }

  const phone = state.phones.find((item) => item.id === input.phoneId);
  if (!phone) {
    throw new Error('Nie znaleziono telefonu w magazynie.');
  }

  const model = state.models.find((item) => item.id === phone.modelId);
  const modelName = model?.name ?? 'Nieznany model';
  const storage = (input.storage ?? phone.storage)?.trim() || undefined;
  const imei = (input.imei ?? phone.imei)?.trim() || undefined;
  const profit = calcProfit(input.salePrice, phone.purchasePrice);
  const depositTo = input.depositTo ?? 'cash';
  const soldAt = dateInputToIso(input.soldAt.trim());

  const sale: SaleRecord = {
    id: createId(),
    phoneId: phone.id,
    modelId: phone.modelId,
    modelName,
    storage,
    imei,
    purchasePrice: phone.purchasePrice,
    salePrice: input.salePrice,
    profit,
    soldAt,
  };

  const finance = { ...state.finance };
  finance[depositTo] = finance[depositTo] + input.salePrice;

  const next: AppState = {
    ...state,
    phones: state.phones.filter((item) => item.id !== phone.id),
    sales: [sale, ...state.sales],
    finance,
  };

  return pushHistory(next, {
    type: 'sale',
    date: soldAt,
    modelName,
    purchasePrice: phone.purchasePrice,
    salePrice: input.salePrice,
    profit,
    storage,
    imei,
    phoneId: phone.id,
  });
}

export function setCash(state: AppState, cash: number): AppState {
  if (!Number.isFinite(cash)) {
    throw new Error('Gotówka musi być liczbą.');
  }
  const next: AppState = {
    ...state,
    finance: { ...state.finance, cash },
  };
  return pushHistory(next, {
    type: 'finance',
    date: nowIso(),
    modelName: 'Gotówka',
    note: `Ustawiono gotówkę: ${cash} zł`,
  });
}

export function setBank(state: AppState, bank: number): AppState {
  if (!Number.isFinite(bank)) {
    throw new Error('Stan konta musi być liczbą.');
  }
  const next: AppState = {
    ...state,
    finance: { ...state.finance, bank },
  };
  return pushHistory(next, {
    type: 'finance',
    date: nowIso(),
    modelName: 'Konto',
    note: `Ustawiono konto: ${bank} zł`,
  });
}
