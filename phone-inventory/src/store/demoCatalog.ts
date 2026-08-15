import type { StoreProduct } from './types';
import { DEFAULT_WARRANTY } from './types';

/**
 * Demo catalog for the public storefront until a public Supabase read
 * (or server endpoint) exposes in-stock phones without IMEI / cost fields.
 * Shapes match `mapPhoneToProduct` output so swapping the source is a
 * one-line change in `catalog.ts`.
 */
export const DEMO_PRODUCTS: StoreProduct[] = [
  {
    id: 'demo-iphone-15-pro-256-black',
    modelName: 'iPhone 15 Pro',
    brand: 'Apple',
    storage: '256 GB',
    color: 'Czarny tytan',
    batteryPercent: 94,
    condition: 'bardzo_dobry',
    price: 3899,
    description:
      'iPhone 15 Pro 256 GB w kolorze czarny tytan. Pełna sprawność, Face ID działa, ekran bez rys. Telefon przetestowany w SmartFix.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-10T10:00:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-iphone-14-128-midnight',
    modelName: 'iPhone 14',
    brand: 'Apple',
    storage: '128 GB',
    color: 'Midnight',
    batteryPercent: 89,
    condition: 'dobry',
    price: 2299,
    description:
      'iPhone 14 128 GB Midnight. Lekkie ślady użytkowania na obudowie, wyświetlacz czysty. Gotowy do pracy od razu.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-12T14:30:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-iphone-13-pro-max-256',
    modelName: 'iPhone 13 Pro Max',
    brand: 'Apple',
    storage: '256 GB',
    color: 'Grafitowy',
    batteryPercent: 91,
    condition: 'bardzo_dobry',
    price: 2799,
    description:
      'iPhone 13 Pro Max 256 GB. Świetna bateria, ProMotion 120 Hz, sprawne Face ID. Idealny do zdjęć i wideo.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-08T09:15:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-iphone-12-64-white',
    modelName: 'iPhone 12',
    brand: 'Apple',
    storage: '64 GB',
    color: 'Biały',
    batteryPercent: 86,
    condition: 'dobry',
    price: 1299,
    description:
      'iPhone 12 64 GB biały. Solidny codzienny telefon w atrakcyjnej cenie. Sprawdzona elektronika i oryginalny ekran.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-05T16:00:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-iphone-16-128-teal',
    modelName: 'iPhone 16',
    brand: 'Apple',
    storage: '128 GB',
    color: 'Teal',
    batteryPercent: 100,
    condition: 'idealny',
    price: 4499,
    description:
      'iPhone 16 128 GB Teal — praktycznie jak nowy. Pełna gwarancja SmartFix, fabryczna kondycja baterii.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-14T11:20:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-iphone-15-128-blue',
    modelName: 'iPhone 15',
    brand: 'Apple',
    storage: '128 GB',
    color: 'Niebieski',
    batteryPercent: 97,
    condition: 'idealny',
    price: 3199,
    description:
      'iPhone 15 128 GB niebieski. Dynamic Island, USB-C, bateria w doskonałej kondycji. Polecany egzemplarz.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-13T08:45:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-samsung-s24-256',
    modelName: 'Samsung Galaxy S24',
    brand: 'Samsung',
    storage: '256 GB',
    color: 'Onyx Black',
    batteryPercent: 95,
    condition: 'bardzo_dobry',
    price: 2899,
    description:
      'Galaxy S24 256 GB. Kompaktowy flagowiec Samsunga, sprawny czytnik i ekran AMOLED. Przetestowany w SmartFix.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-11T12:00:00.000Z',
    isDemo: true,
  },
  {
    id: 'demo-samsung-a54-128',
    modelName: 'Samsung Galaxy A54',
    brand: 'Samsung',
    storage: '128 GB',
    color: 'Awesome Violet',
    batteryPercent: 92,
    condition: 'dobry',
    price: 999,
    description:
      'Galaxy A54 128 GB — trwały mid-range na co dzień. Dobra bateria, czysty ekran, uczciwa cena.',
    warranty: DEFAULT_WARRANTY,
    images: [],
    createdAt: '2026-08-07T17:30:00.000Z',
    isDemo: true,
  },
];
