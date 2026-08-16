import type { PhoneCondition } from '../domain/types';
import { CATALOG_MODELS } from '../domain/catalog';

/**
 * Public store listing status for a physical iPhone unit.
 * Mapped from warehouse `Phone.status` until dedicated Supabase columns exist:
 *   in_stock → available (or reserved when meta says so)
 *   sold     → sold
 *   removed  → hidden (not listed)
 */
export type StoreListingStatus = 'available' | 'reserved' | 'sold';

/** Customer-facing condition labels used in store filters. */
export type StoreConditionFilter = 'jak_nowy' | 'bardzo_dobry' | 'dobry';

export type StoreSort =
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'best_deal';

export type BatteryFilter = 'any' | '90' | '85' | '80';

/**
 * Public product — one physical iPhone.
 * Never includes IMEI or purchasePrice.
 * `id` matches `phones.id` when sourced from warehouse/Supabase.
 */
export interface StoreProduct {
  id: string;
  /** Short public SKU / product number for search (not IMEI). */
  productNumber: string;
  modelName: string;
  storage: string;
  color: string;
  batteryPercent: number;
  condition: PhoneCondition;
  price: number;
  /** Optional strikethrough / previous price. */
  compareAtPrice?: number;
  warrantyMonths: number;
  description: string;
  listingStatus: StoreListingStatus;
  /** When false, product is withheld from the public catalog. */
  listedInStore: boolean;
  images: string[];
  createdAt: string;
  /** True for seed units used until public Supabase read is enabled. */
  isSeed?: boolean;
}

export interface StoreFilters {
  query: string;
  models: string[];
  storages: string[];
  conditions: StoreConditionFilter[];
  battery: BatteryFilter;
  priceMin: number;
  priceMax: number;
  colors: string[];
  sort: StoreSort;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CheckoutForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  delivery: 'courier' | 'parcel_locker' | 'pickup';
  payment: 'blik' | 'card' | 'transfer';
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';

export interface StoreOrderItem {
  productId: string;
  productNumber: string;
  modelName: string;
  storage: string;
  color: string;
  unitPrice: number;
  quantity: number;
}

export interface StoreOrder {
  id: string;
  createdAt: string;
  status: OrderStatus;
  customer: CheckoutForm;
  items: StoreOrderItem[];
  productsTotal: number;
  deliveryFee: number;
  total: number;
  userId?: string;
}

export const STORE_MODEL_OPTIONS = [...CATALOG_MODELS];

export const STORE_STORAGE_OPTIONS = [
  '64 GB',
  '128 GB',
  '256 GB',
  '512 GB',
  '1 TB',
] as const;

export const STORE_CONDITION_OPTIONS: {
  value: StoreConditionFilter;
  label: string;
  mapsTo: PhoneCondition[];
}[] = [
  { value: 'jak_nowy', label: 'Jak nowy', mapsTo: ['idealny'] },
  { value: 'bardzo_dobry', label: 'Bardzo dobry', mapsTo: ['bardzo_dobry'] },
  { value: 'dobry', label: 'Dobry', mapsTo: ['dobry'] },
];

export const BATTERY_FILTER_OPTIONS: { value: BatteryFilter; label: string }[] =
  [
    { value: 'any', label: 'Dowolna' },
    { value: '90', label: '90%+' },
    { value: '85', label: '85%+' },
    { value: '80', label: '80%+' },
  ];

export const CHECKED_FEATURES = [
  'Face ID',
  'True Tone',
  'Aparaty',
  'Głośniki',
  'Mikrofon',
  'Ładowanie',
  'Wi-Fi',
  'Bluetooth',
  'Przyciski',
  'Ekran',
  'Bateria',
] as const;

export const DEFAULT_FILTERS: StoreFilters = {
  query: '',
  models: [],
  storages: [],
  conditions: [],
  battery: 'any',
  priceMin: 0,
  priceMax: 0,
  colors: [],
  sort: 'newest',
};

export const DEFAULT_CHECKOUT: CheckoutForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  delivery: 'courier',
  payment: 'blik',
};

export const DELIVERY_FEE: Record<CheckoutForm['delivery'], number> = {
  courier: 19,
  parcel_locker: 14,
  pickup: 0,
};
