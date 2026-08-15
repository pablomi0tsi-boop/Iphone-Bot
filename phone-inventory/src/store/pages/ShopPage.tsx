import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PHONE_CONDITIONS } from '../../domain/types';
import {
  filterAndSortProducts,
  listStoreProducts,
  uniqueModels,
  uniqueStorages,
} from '../catalog';
import type { StoreBrand, StoreFilters, StoreProduct, StoreSort } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { ProductCard } from '../components/ProductCard';

function brandFromParam(value: string | null): StoreBrand | 'all' {
  if (value === 'Apple' || value === 'Samsung' || value === 'Other') return value;
  return 'all';
}

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<StoreFilters>(() => ({
    ...DEFAULT_FILTERS,
    brand: brandFromParam(searchParams.get('brand')),
  }));

  useEffect(() => {
    let cancelled = false;
    void listStoreProducts().then((items) => {
      if (!cancelled) {
        setProducts(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const brand = brandFromParam(searchParams.get('brand'));
    setFilters((prev) =>
      prev.brand === brand ? prev : { ...prev, brand },
    );
  }, [searchParams]);

  const filtered = useMemo(
    () => filterAndSortProducts(products, filters),
    [products, filters],
  );

  const models = useMemo(() => uniqueModels(products), [products]);
  const storages = useMemo(() => uniqueStorages(products), [products]);

  const update = <K extends keyof StoreFilters>(key: K, value: StoreFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (key === 'brand') {
      const next = new URLSearchParams(searchParams);
      if (value === 'all') next.delete('brand');
      else next.set('brand', String(value));
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <main className="store-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Sklep</p>
        <h1>Dostępne telefony</h1>
        <p>Każdy egzemplarz to osobna sztuka — sprawdzona i gotowa do wysyłki.</p>
      </header>

      <div className="shop-layout">
        <aside className="shop-filters" aria-label="Filtry">
          <label className="filter-field">
            <span>Szukaj</span>
            <input
              type="search"
              placeholder="Model, kolor…"
              value={filters.query}
              onChange={(e) => update('query', e.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>Producent</span>
            <select
              value={filters.brand}
              onChange={(e) =>
                update('brand', e.target.value as StoreFilters['brand'])
              }
            >
              <option value="all">Wszystkie</option>
              <option value="Apple">Apple</option>
              <option value="Samsung">Samsung</option>
              <option value="Other">Pozostałe</option>
            </select>
          </label>

          <label className="filter-field">
            <span>Model</span>
            <select
              value={filters.model}
              onChange={(e) => update('model', e.target.value)}
            >
              <option value="all">Wszystkie</option>
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
              value={filters.storage}
              onChange={(e) => update('storage', e.target.value)}
            >
              <option value="all">Wszystkie</option>
              {storages.map((storage) => (
                <option key={storage} value={storage}>
                  {storage}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Stan</span>
            <select
              value={filters.condition}
              onChange={(e) =>
                update('condition', e.target.value as StoreFilters['condition'])
              }
            >
              <option value="all">Wszystkie</option>
              {PHONE_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Bateria min. ({filters.batteryMin}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={filters.batteryMin}
              onChange={(e) => update('batteryMin', Number(e.target.value))}
            />
          </label>

          <div className="filter-row">
            <label className="filter-field">
              <span>Cena od</span>
              <input
                type="number"
                min={0}
                value={filters.priceMin || ''}
                placeholder="0"
                onChange={(e) =>
                  update('priceMin', Number(e.target.value) || 0)
                }
              />
            </label>
            <label className="filter-field">
              <span>Cena do</span>
              <input
                type="number"
                min={0}
                value={filters.priceMax >= 100_000 ? '' : filters.priceMax}
                placeholder="max"
                onChange={(e) =>
                  update(
                    'priceMax',
                    e.target.value ? Number(e.target.value) : 100_000,
                  )
                }
              />
            </label>
          </div>

          <label className="filter-field">
            <span>Sortowanie</span>
            <select
              value={filters.sort}
              onChange={(e) => update('sort', e.target.value as StoreSort)}
            >
              <option value="newest">Najnowsze</option>
              <option value="price_asc">Najtańsze</option>
              <option value="price_desc">Najdroższe</option>
            </select>
          </label>

          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS });
              setSearchParams({}, { replace: true });
            }}
          >
            Wyczyść filtry
          </button>
        </aside>

        <section>
          <p className="shop-count">
            {loading
              ? 'Ładowanie…'
              : `${filtered.length} ${filtered.length === 1 ? 'telefon' : 'telefonów'}`}
          </p>
          {filtered.length === 0 && !loading ? (
            <div className="empty-state">
              <h2>Brak wyników</h2>
              <p>Spróbuj zmienić filtry lub wyczyścić wyszukiwanie.</p>
            </div>
          ) : (
            <div className="product-grid">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
