/** Canonical iPhone model names + default resale values (PLN) by storage. */

export const CATALOG_MODELS = [
  'iPhone 11',
  'iPhone 11 Pro',
  'iPhone 11 Pro Max',
  'iPhone 12 Mini',
  'iPhone 12',
  'iPhone 12 Pro',
  'iPhone 12 Pro Max',
  'iPhone 13 Mini',
  'iPhone 13',
  'iPhone 13 Pro',
  'iPhone 13 Pro Max',
  'iPhone 14',
  'iPhone 14 Plus',
  'iPhone 14 Pro',
  'iPhone 14 Pro Max',
  'iPhone 15',
  'iPhone 15 Plus',
  'iPhone 15 Pro',
  'iPhone 15 Pro Max',
  'iPhone 16',
  'iPhone 16 Plus',
  'iPhone 16 Pro',
  'iPhone 16 Pro Max',
  'iPhone 17',
  'iPhone 17 Pro',
  'iPhone 17 Pro Max',
] as const;

export type CatalogModelName = (typeof CATALOG_MODELS)[number];

/** Popular models highlighted on the storefront home page. */
export const POPULAR_STORE_MODELS = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 14 Pro Max',
  'iPhone 14 Pro',
] as const;

/** Generation tiles on the home page (family filters). */
export const STORE_GENERATIONS = [
  '17',
  '16',
  '15',
  '14',
  '13',
  '12',
  '11',
] as const;

export type StoreGeneration = (typeof STORE_GENERATIONS)[number];

/** All catalog models belonging to a generation (e.g. 15 → 15 / Plus / Pro / Pro Max). */
export function modelsInGeneration(generation: string): string[] {
  const prefix = `iPhone ${generation}`;
  return CATALOG_MODELS.filter(
    (name) => name === prefix || name.startsWith(`${prefix} `),
  );
}

/** Shop URL that filters to every variant of a generation. */
export function shopUrlForGeneration(generation: string): string {
  const models = modelsInGeneration(generation);
  if (models.length === 0) return '/sklep';
  if (models.length === 1) {
    return `/sklep?model=${encodeURIComponent(models[0])}`;
  }
  return `/sklep?models=${encodeURIComponent(models.join('|'))}`;
}

/** Default sale / stock value for each model + storage variant. */
export const PRICE_BOOK: Record<string, Record<string, number>> = {
  'iPhone 11': { '64 GB': 350, '128 GB': 400, '256 GB': 450 },
  'iPhone 11 Pro': { '64 GB': 450, '128 GB': 500, '256 GB': 550 },
  'iPhone 11 Pro Max': { '64 GB': 500, '256 GB': 600, '512 GB': 650 },
  'iPhone 12 Mini': { '64 GB': 400, '128 GB': 450, '256 GB': 550 },
  'iPhone 12': { '64 GB': 450, '128 GB': 500, '256 GB': 600 },
  'iPhone 12 Pro': { '128 GB': 700, '256 GB': 750, '512 GB': 850 },
  'iPhone 12 Pro Max': { '128 GB': 850, '256 GB': 900, '512 GB': 1000 },
  'iPhone 13 Mini': { '128 GB': 700, '256 GB': 800 },
  'iPhone 13': { '128 GB': 800, '256 GB': 900, '512 GB': 1000 },
  'iPhone 13 Pro': { '128 GB': 1100, '256 GB': 1200, '512 GB': 1300 },
  'iPhone 13 Pro Max': { '128 GB': 1250, '256 GB': 1300, '512 GB': 1400 },
  'iPhone 14': { '128 GB': 950, '256 GB': 1050, '512 GB': 1200 },
  'iPhone 14 Plus': { '128 GB': 1050, '256 GB': 1100, '512 GB': 1150 },
  'iPhone 14 Pro': { '128 GB': 1450, '256 GB': 1550, '512 GB': 1650 },
  'iPhone 14 Pro Max': { '128 GB': 1700, '256 GB': 1800, '512 GB': 1900 },
  'iPhone 15': { '128 GB': 1500, '256 GB': 1650, '512 GB': 1750 },
  'iPhone 15 Plus': { '128 GB': 1600, '256 GB': 1750, '512 GB': 1850 },
  'iPhone 15 Pro': { '128 GB': 2050, '256 GB': 2200, '512 GB': 2400 },
  'iPhone 15 Pro Max': { '256 GB': 2300, '512 GB': 2500 },
  'iPhone 16': { '128 GB': 2050, '256 GB': 2250, '512 GB': 2400 },
  'iPhone 16 Plus': { '128 GB': 2300, '256 GB': 2400, '512 GB': 2500 },
  'iPhone 16 Pro': { '128 GB': 3000, '256 GB': 3050, '512 GB': 3150 },
  'iPhone 16 Pro Max': { '128 GB': 3250, '256 GB': 3300, '512 GB': 3400 },
  'iPhone 17': { '256 GB': 3800, '512 GB': 4100 },
  'iPhone 17 Pro': { '256 GB': 4800, '512 GB': 5200, '1 TB': 5600 },
  'iPhone 17 Pro Max': { '256 GB': 5400, '512 GB': 5800, '1 TB': 6200 },
};

/** Map legacy / alternate spellings onto catalog names. */
const MODEL_ALIASES: Record<string, string> = {
  'iphone 12 mini': 'iPhone 12 Mini',
  'iphone 13 mini': 'iPhone 13 Mini',
  'iphone 13 Mini': 'iPhone 13 Mini',
};

export function normalizeModelName(name: string): string {
  const trimmed = name.trim();
  const alias = MODEL_ALIASES[trimmed.toLowerCase()] ?? MODEL_ALIASES[trimmed];
  if (alias) return alias;
  const match = CATALOG_MODELS.find(
    (item) => item.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

/** Stable cross-device model id (e.g. "iphone-15-pro"). */
export function modelIdFromName(name: string): string {
  return normalizeModelName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function storagesForModel(modelName: string): string[] {
  const book = PRICE_BOOK[normalizeModelName(modelName)];
  return book ? Object.keys(book) : [];
}

export function defaultListedValue(
  modelName: string,
  storage: string,
): number | undefined {
  const book = PRICE_BOOK[normalizeModelName(modelName)];
  if (!book) return undefined;
  if (storage in book) return book[storage];
  const compact = storage.replace(/\s+/g, '').toUpperCase();
  for (const [key, value] of Object.entries(book)) {
    if (key.replace(/\s+/g, '').toUpperCase() === compact) return value;
  }
  return undefined;
}

/** True when the model name is an Apple iPhone (store sells only these). */
export function isIPhoneModel(modelName: string): boolean {
  return normalizeModelName(modelName).toLowerCase().startsWith('iphone');
}
