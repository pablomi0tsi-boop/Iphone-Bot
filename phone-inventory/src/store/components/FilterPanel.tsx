import type { ReactNode } from 'react';
import {
  BATTERY_FILTER_OPTIONS,
  STORE_CONDITION_OPTIONS,
  STORE_MODEL_OPTIONS,
  STORE_STORAGE_OPTIONS,
  type StoreFilters,
} from '../types';

interface FilterPanelProps {
  filters: StoreFilters;
  colors: string[];
  onChange: (next: StoreFilters) => void;
  onReset: () => void;
}

export function FilterPanel({
  filters,
  colors,
  onChange,
  onReset,
}: FilterPanelProps) {
  const toggle = (
    key: 'models' | 'storages' | 'conditions' | 'colors',
    value: string,
  ) => {
    const list = filters[key] as string[];
    const next = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    onChange({ ...filters, [key]: next });
  };

  return (
    <aside className="sf-filters" aria-label="Filtry katalogu">
      <div className="sf-filters-head">
        <h2>Filtry</h2>
        <button type="button" className="sf-link-btn" onClick={onReset}>
          Wyczyść
        </button>
      </div>

      <label className="sf-field">
        <span>Szukaj</span>
        <input
          type="search"
          value={filters.query}
          placeholder="Model, kolor, nr…"
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />
      </label>

      <FilterGroup title="Model">
        <div className="sf-check-scroll">
          {STORE_MODEL_OPTIONS.map((model) => (
            <label key={model} className="sf-check">
              <input
                type="checkbox"
                checked={filters.models.includes(model)}
                onChange={() => toggle('models', model)}
              />
              <span>{model}</span>
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Pamięć">
        <div className="sf-chip-row">
          {STORE_STORAGE_OPTIONS.map((storage) => {
            const on = filters.storages.includes(storage);
            return (
              <button
                key={storage}
                type="button"
                className={`sf-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle('storages', storage)}
              >
                {storage}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Stan">
        {STORE_CONDITION_OPTIONS.map((c) => (
          <label key={c.value} className="sf-check">
            <input
              type="checkbox"
              checked={filters.conditions.includes(c.value)}
              onChange={() => toggle('conditions', c.value)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Kondycja baterii">
        {BATTERY_FILTER_OPTIONS.map((b) => (
          <label key={b.value} className="sf-check">
            <input
              type="radio"
              name="battery"
              checked={filters.battery === b.value}
              onChange={() => onChange({ ...filters, battery: b.value })}
            />
            <span>{b.label}</span>
          </label>
        ))}
      </FilterGroup>

      {colors.length > 0 ? (
        <FilterGroup title="Kolor">
          <div className="sf-check-scroll">
            {colors.map((color) => (
              <label key={color} className="sf-check">
                <input
                  type="checkbox"
                  checked={filters.colors.includes(color)}
                  onChange={() => toggle('colors', color)}
                />
                <span>{color}</span>
              </label>
            ))}
          </div>
        </FilterGroup>
      ) : null}

      <FilterGroup title="Cena">
        <div className="sf-price-range">
          <input
            type="number"
            min={0}
            placeholder="Od"
            inputMode="numeric"
            value={filters.priceMin || ''}
            onChange={(e) =>
              onChange({
                ...filters,
                priceMin: Number(e.target.value) || 0,
              })
            }
          />
          <span className="sf-price-sep" aria-hidden="true">
            –
          </span>
          <input
            type="number"
            min={0}
            placeholder="Do"
            inputMode="numeric"
            value={filters.priceMax || ''}
            onChange={(e) =>
              onChange({
                ...filters,
                priceMax: Number(e.target.value) || 0,
              })
            }
          />
        </div>
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="sf-filter-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}
