import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  filterAndSortProducts,
  listStoreProducts,
  uniqueColors,
} from '../catalog';
import { FilterPanel } from '../components/FilterPanel';
import { ProductCard } from '../components/ProductCard';
import { ProductSkeletonGrid } from '../components/ProductSkeleton';
import { EmptyState, ErrorState } from '../components/States';
import {
  DEFAULT_FILTERS,
  type StoreFilters,
  type StoreProduct,
  type StoreSort,
} from '../types';

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<StoreFilters>(() =>
    filtersFromParams(searchParams),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listStoreProducts()
      .then((items) => {
        if (!cancelled) {
          setProducts(items);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Błąd ładowania');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFilters(filtersFromParams(searchParams));
  }, [searchParams]);

  const colors = useMemo(() => uniqueColors(products), [products]);
  const filtered = useMemo(
    () => filterAndSortProducts(products, filters),
    [products, filters],
  );

  const activeFilterCount = countActiveFilters(filters);

  const updateFilters = (next: StoreFilters) => {
    setFilters(next);
    syncParams(next, setSearchParams);
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSearchParams({}, { replace: true });
  };

  return (
    <main className="sf-page sf-catalog">
      <header className="sf-catalog-hero">
        <h1>iPhone&apos;y</h1>
        <p>
          Sprawdzone używane iPhone&apos;y w świetnym stanie. Wybierz model
          dopasowany do swoich potrzeb.
        </p>
      </header>

      <div className="sf-catalog-toolbar">
        <button
          type="button"
          className="btn ghost sf-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filtry{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        <p className="sf-catalog-count" aria-live="polite">
          {loading
            ? 'Ładowanie oferty…'
            : `${filtered.length} ${productWord(filtered.length)}`}
        </p>

        <label className="sf-catalog-sort">
          <span className="sr-only">Sortowanie</span>
          <select
            value={filters.sort}
            disabled={loading}
            onChange={(e) =>
              updateFilters({
                ...filters,
                sort: e.target.value as StoreSort,
              })
            }
          >
            <option value="newest">Najnowsze</option>
            <option value="price_asc">Cena: rosnąco</option>
            <option value="price_desc">Cena: malejąco</option>
          </select>
        </label>
      </div>

      <div className="sf-shop-layout">
        <div
          className={`sf-filters-shell ${filtersOpen ? 'open' : ''}`}
        >
          <FilterPanel
            filters={filters}
            colors={colors}
            onChange={updateFilters}
            onReset={resetFilters}
          />
        </div>

        <section className="sf-catalog-results" aria-label="Lista iPhone'ów">
          {loading ? <ProductSkeletonGrid /> : null}

          {error ? (
            <ErrorState
              message={error}
              onRetry={() => window.location.reload()}
            />
          ) : null}

          {!loading && !error && filtered.length === 0 ? (
            <EmptyState
              title="Brak wyników"
              text="Żaden iPhone nie pasuje do wybranych filtrów. Zmień kryteria lub wyczyść filtry."
              action={
                <button type="button" className="btn primary" onClick={resetFilters}>
                  Wyczyść filtry
                </button>
              }
            />
          ) : null}

          {!loading && !error && filtered.length > 0 ? (
            <div className="sf-product-grid">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function productWord(count: number): string {
  if (count === 1) return 'iPhone';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return "iPhone'y";
  }
  return "iPhone'ów";
}

function countActiveFilters(filters: StoreFilters): number {
  let n = 0;
  if (filters.query.trim()) n += 1;
  n += filters.models.length;
  n += filters.storages.length;
  n += filters.conditions.length;
  n += filters.colors.length;
  if (filters.battery !== 'any') n += 1;
  if (filters.priceMin > 0) n += 1;
  if (filters.priceMax > 0) n += 1;
  return n;
}

function syncParams(
  next: StoreFilters,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
) {
  const params = new URLSearchParams();
  if (next.query.trim()) params.set('q', next.query.trim());
  if (next.models.length === 1) params.set('model', next.models[0]);
  if (next.models.length > 1) {
    params.set('models', next.models.join('|'));
  }
  if (next.sort !== 'newest') params.set('sort', next.sort);
  setSearchParams(params, { replace: true });
}

function filtersFromParams(params: URLSearchParams): StoreFilters {
  const model = params.get('model');
  const modelsParam = params.get('models');
  const sort = params.get('sort');
  const models = modelsParam
    ? modelsParam.split('|').filter(Boolean)
    : model
      ? [model]
      : [];
  return {
    ...DEFAULT_FILTERS,
    query: params.get('q') ?? '',
    models,
    sort:
      sort === 'price_asc' || sort === 'price_desc' || sort === 'newest'
        ? sort
        : sort === 'best_deal'
          ? 'newest'
          : 'newest',
  };
}
