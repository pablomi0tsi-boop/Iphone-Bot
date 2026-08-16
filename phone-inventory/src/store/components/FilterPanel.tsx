import type { ReactNode } from 'react';
import {
  BATTERY_FILTER_OPTIONS,
  STORE_CONDITION_OPTIONS,
  STORE_MODEL_OPTIONS,
  STORE_STORAGE_OPTIONS,
  type StoreFilters,
  type StoreSort,
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
  const toggle = (key: 'models' | 'storages' | 'conditions' | 'colors', value: string) => {
    const list = filters[key] as string[];
    const next = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    onChange({ ...filters, [key]: next });
  };

  return (
    <aside className="sf-filters" aria-label="Filtry">
      <div className="sf-filters-head">
        <h2>Filtry</h2>
        <button type="button" className="btn ghost sm" onClick={onReset}>
          Wyczyść
        </button>
      </div>

      <label className="sf-field">
        <span>Szukaj</span>
        <input
          type="search"
          value={filters.query}
          placeholder="Model, kolor, nr produktu…"
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
        {STORE_STORAGE_OPTIONS.map((storage) => (
          <label key={storage} className="sf-check">
            <input
              type="checkbox"
              checked={filters.storages.includes(storage)}
              onChange={() => toggle('storages', storage)}
            />
            <span>{storage}</span>
          </label>
        ))}
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

      <FilterGroup title="Bateria">
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

      <FilterGroup title="Cena (zł)">
        <div className="sf-price-range">
          <input
            type="number"
            min={0}
            placeholder="Od"
            value={filters.priceMin || ''}
            onChange={(e) =>
              onChange({
                ...filters,
                priceMin: Number(e.target.value) || 0,
              })
            }
          />
          <input
            type="number"
            min={0}
            placeholder="Do"
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

      <label className="sf-field">
        <span>Sortowanie</span>
        <select
          value={filters.sort}
          onChange={(e) =>
            onChange({ ...filters, sort: e.target.value as StoreSort })
          }
        >
          <option value="newest">Najnowsze</option>
          <option value="price_asc">Najtańsze</option>
          <option value="price_desc">Najdroższe</option>
          <option value="best_deal">Najlepsza okazja</option>
        </select>
      </label>
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
