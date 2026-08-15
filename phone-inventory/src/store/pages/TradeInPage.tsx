import { useMemo, useState, type FormEvent } from 'react';
import { CATALOG_MODELS, storagesForModel } from '../../domain/catalog';
import { PHONE_CONDITIONS } from '../../domain/types';
import { formatPricePln } from '../format';

type YesNo = 'yes' | 'no' | '';

interface TradeInForm {
  brand: string;
  model: string;
  storage: string;
  battery: string;
  condition: string;
  faceId: YesNo;
  originalScreen: YesNo;
  fullyWorking: YesNo;
  notes: string;
}

const INITIAL: TradeInForm = {
  brand: 'Apple',
  model: 'iPhone 13',
  storage: '128 GB',
  battery: '90',
  condition: 'dobry',
  faceId: 'yes',
  originalScreen: 'yes',
  fullyWorking: 'yes',
  notes: '',
};

/** Placeholder valuation — replace with real algorithm later. */
function estimateTradeIn(form: TradeInForm): number {
  const baseByModel: Record<string, number> = {
    'iPhone 11': 280,
    'iPhone 12': 450,
    'iPhone 13': 700,
    'iPhone 14': 950,
    'iPhone 15': 1400,
    'iPhone 16': 1900,
  };
  let base = 500;
  for (const [key, value] of Object.entries(baseByModel)) {
    if (form.model.startsWith(key)) {
      base = value;
      break;
    }
  }
  if (form.brand === 'Samsung') base = Math.round(base * 0.85);

  const storageBonus =
    form.storage.includes('512') || form.storage.includes('1 TB')
      ? 180
      : form.storage.includes('256')
        ? 90
        : 0;

  const battery = Number(form.battery) || 0;
  const batteryFactor = battery >= 90 ? 1 : battery >= 80 ? 0.92 : 0.8;

  const conditionFactor: Record<string, number> = {
    idealny: 1.05,
    bardzo_dobry: 1,
    dobry: 0.9,
    uzywany: 0.75,
    uszkodzony: 0.45,
  };

  let price =
    (base + storageBonus) *
    batteryFactor *
    (conditionFactor[form.condition] ?? 0.85);

  if (form.faceId === 'no') price *= 0.7;
  if (form.originalScreen === 'no') price *= 0.75;
  if (form.fullyWorking === 'no') price *= 0.55;

  return Math.max(50, Math.round(price / 10) * 10);
}

export function TradeInPage() {
  const [form, setForm] = useState<TradeInForm>(INITIAL);
  const [estimate, setEstimate] = useState<number | null>(null);

  const models = useMemo(() => {
    if (form.brand === 'Samsung') {
      return ['Samsung Galaxy S24', 'Samsung Galaxy S23', 'Samsung Galaxy A54'];
    }
    if (form.brand === 'Other') {
      return ['Inny model'];
    }
    return [...CATALOG_MODELS];
  }, [form.brand]);

  const storages = useMemo(() => {
    const fromCatalog = storagesForModel(form.model);
    if (fromCatalog.length) return fromCatalog;
    return ['64 GB', '128 GB', '256 GB', '512 GB'];
  }, [form.model]);

  const set =
    <K extends keyof TradeInForm>(key: K) =>
    (value: TradeInForm[K]) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setEstimate(estimateTradeIn(form));
  };

  return (
    <main className="store-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Skup</p>
        <h1>Sprzedaj telefon</h1>
        <p>
          Wypełnij formularz i zobacz przykładową wycenę. Docelowo podłączymy
          prawdziwy algorytm skupu.
        </p>
      </header>

      <form className="store-form" onSubmit={onSubmit}>
        <label className="filter-field">
          <span>Producent</span>
          <select
            value={form.brand}
            onChange={(e) => {
              const brand = e.target.value;
              setForm((prev) => ({
                ...prev,
                brand,
                model:
                  brand === 'Samsung'
                    ? 'Samsung Galaxy S24'
                    : brand === 'Other'
                      ? 'Inny model'
                      : 'iPhone 13',
              }));
            }}
          >
            <option value="Apple">Apple</option>
            <option value="Samsung">Samsung</option>
            <option value="Other">Pozostałe</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Model</span>
          <select
            value={form.model}
            onChange={(e) => set('model')(e.target.value)}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Pamięć</span>
          <select
            value={storages.includes(form.storage) ? form.storage : storages[0]}
            onChange={(e) => set('storage')(e.target.value)}
          >
            {storages.map((storage) => (
              <option key={storage} value={storage}>
                {storage}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Bateria (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            required
            value={form.battery}
            onChange={(e) => set('battery')(e.target.value)}
          />
        </label>

        <label className="filter-field">
          <span>Stan</span>
          <select
            value={form.condition}
            onChange={(e) => set('condition')(e.target.value)}
          >
            {PHONE_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="yesno-set">
          <legend>Czy Face ID działa?</legend>
          <label>
            <input
              type="radio"
              name="faceId"
              checked={form.faceId === 'yes'}
              onChange={() => set('faceId')('yes')}
            />
            Tak
          </label>
          <label>
            <input
              type="radio"
              name="faceId"
              checked={form.faceId === 'no'}
              onChange={() => set('faceId')('no')}
            />
            Nie
          </label>
        </fieldset>

        <fieldset className="yesno-set">
          <legend>Czy ekran jest oryginalny?</legend>
          <label>
            <input
              type="radio"
              name="originalScreen"
              checked={form.originalScreen === 'yes'}
              onChange={() => set('originalScreen')('yes')}
            />
            Tak
          </label>
          <label>
            <input
              type="radio"
              name="originalScreen"
              checked={form.originalScreen === 'no'}
              onChange={() => set('originalScreen')('no')}
            />
            Nie
          </label>
        </fieldset>

        <fieldset className="yesno-set">
          <legend>Czy telefon jest sprawny?</legend>
          <label>
            <input
              type="radio"
              name="fullyWorking"
              checked={form.fullyWorking === 'yes'}
              onChange={() => set('fullyWorking')('yes')}
            />
            Tak
          </label>
          <label>
            <input
              type="radio"
              name="fullyWorking"
              checked={form.fullyWorking === 'no'}
              onChange={() => set('fullyWorking')('no')}
            />
            Nie
          </label>
        </fieldset>

        <label className="filter-field">
          <span>Dodatkowe informacje</span>
          <textarea
            rows={4}
            value={form.notes}
            placeholder="Np. rysy, brak pudełka, historia napraw…"
            onChange={(e) => set('notes')(e.target.value)}
          />
        </label>

        <button type="submit" className="btn primary block">
          Oblicz wycenę
        </button>
      </form>

      {estimate != null ? (
        <div className="estimate-card" role="status">
          <p className="hero-eyebrow">Szacunkowa wycena</p>
          <p className="estimate-value">{formatPricePln(estimate)}</p>
          <p>
            To przykładowa wycena UI. Ostateczną ofertę potwierdzimy po
            weryfikacji telefonu.
          </p>
        </div>
      ) : null}
    </main>
  );
}
