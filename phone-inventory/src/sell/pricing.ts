import { PRICE_BOOK, storagesForModel } from '../domain/catalog';
import type {
  SellBatteryHealth,
  SellCondition,
  SellQuoteInput,
  SellQuoteResult,
  SellTechnicalAnswers,
} from './types';

/**
 * Buyback base prices (PLN) — trade-in floor before condition/tech adjustments.
 * Kept in one place so ops can tune without touching UI components.
 * Defaults: ~72% of store PRICE_BOOK listed value for the same model/storage.
 */
export const BUYBACK_BASE_PRICES: Record<string, Record<string, number>> =
  Object.fromEntries(
    Object.entries(PRICE_BOOK).map(([model, storages]) => [
      model,
      Object.fromEntries(
        Object.entries(storages).map(([storage, retail]) => [
          storage,
          roundToTen(Math.round(retail * 0.72)),
        ]),
      ),
    ]),
  );

/** Multipliers / flat deltas — edit here, never in React components. */
export const BUYBACK_ADJUSTMENTS = {
  conditionMultiplier: {
    idealny: 1,
    bardzo_dobry: 0.94,
    dobry: 0.84,
    uszkodzony: 0.48,
  } as Record<SellCondition, number>,

  batteryMultiplier: {
    '90_100': 1,
    '80_89': 0.93,
    below_80: 0.78,
    unknown: 0.9,
  } as Record<SellBatteryHealth, number>,

  /** Flat PLN deltas (negative = lower offer). */
  technical: {
    screenNotOriginal: -180,
    screenUnknown: -60,
    wasRepaired: -90,
    repairedUnknown: -40,
    faceIdBroken: -280,
    camerasBroken: -160,
    chargingBroken: -140,
    icloudLocked: -500,
    carrierLocked: -120,
    carrierUnknown: -40,
    bodyDamaged: -150,
  },
} as const;

export function storagesForSellModel(model: string): string[] {
  return storagesForModel(model);
}

export function getBuybackBasePrice(
  model: string,
  storage: string,
): number | undefined {
  const book = BUYBACK_BASE_PRICES[model];
  if (!book) return undefined;
  if (storage in book) return book[storage];
  const compact = storage.replace(/\s+/g, '').toUpperCase();
  for (const [key, value] of Object.entries(book)) {
    if (key.replace(/\s+/g, '').toUpperCase() === compact) return value;
  }
  return undefined;
}

/**
 * Pure valuation function — UI must only call this, never embed price math.
 */
export function estimateBuybackPrice(input: SellQuoteInput): SellQuoteResult {
  const base = getBuybackBasePrice(input.model, input.storage) ?? 0;
  const adjustments: { label: string; amount: number }[] = [];

  let price = base;
  const condMul = BUYBACK_ADJUSTMENTS.conditionMultiplier[input.condition];
  const afterCond = roundToTen(price * condMul);
  if (afterCond !== price) {
    adjustments.push({
      label: `Stan: ${input.condition}`,
      amount: afterCond - price,
    });
    price = afterCond;
  }

  const batMul = BUYBACK_ADJUSTMENTS.batteryMultiplier[input.batteryHealth];
  const afterBat = roundToTen(price * batMul);
  if (afterBat !== price) {
    adjustments.push({
      label: `Bateria: ${input.batteryHealth}`,
      amount: afterBat - price,
    });
    price = afterBat;
  }

  price = applyTechnical(price, input.technical, adjustments);
  price = Math.max(50, roundToTen(price));

  return {
    estimatedPrice: price,
    currency: 'PLN',
    basePrice: base,
    adjustments,
  };
}

function applyTechnical(
  price: number,
  tech: SellTechnicalAnswers,
  adjustments: { label: string; amount: number }[],
): number {
  const t = BUYBACK_ADJUSTMENTS.technical;
  const apply = (label: string, amount: number) => {
    if (!amount) return price;
    adjustments.push({ label, amount });
    return price + amount;
  };

  let next = price;
  if (tech.screenOriginal === 'no') {
    next = apply('Ekran nieoryginalny', t.screenNotOriginal);
  } else if (tech.screenOriginal === 'unknown') {
    next = apply('Ekran — niepewność', t.screenUnknown);
  }
  if (tech.wasRepaired === 'yes') {
    next = apply('Telefon był naprawiany', t.wasRepaired);
  } else if (tech.wasRepaired === 'unknown') {
    next = apply('Naprawy — niepewność', t.repairedUnknown);
  }
  if (tech.faceIdWorks === 'no') {
    next = apply('Face ID niesprawne', t.faceIdBroken);
  }
  if (tech.camerasWork === 'no') {
    next = apply('Aparaty niesprawne', t.camerasBroken);
  }
  if (tech.chargesNormally === 'no') {
    next = apply('Problem z ładowaniem', t.chargingBroken);
  }
  if (tech.freeFromIcloudLock === 'no') {
    next = apply('Blokada iCloud / Activation Lock', t.icloudLocked);
  }
  if (tech.carrierLocked === 'yes') {
    next = apply('Blokada operatorska', t.carrierLocked);
  } else if (tech.carrierLocked === 'unknown') {
    next = apply('Operator — niepewność', t.carrierUnknown);
  }
  if (tech.bodyDamaged === 'yes') {
    next = apply('Uszkodzona obudowa / tylna szyba', t.bodyDamaged);
  }
  return next;
}

function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}
