import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  filterAndSortProducts,
  listStoreProducts,
  uniqueColors,
} from '../catalog';
import { FilterPanel } from '../components/FilterPanel';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { DEFAULT_FILTERS, type StoreFilters, type StoreProduct } from '../types';

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StoreFilters>(() =>
    filtersFromParams(searchParams),
  );

  useEffect(() => {
    let cancelled = false;
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

  const updateFilters = (next: StoreFilters) => {
    setFilters(next);
    const params = new URLSearchParams();
    if (next.query.trim()) params.set('q', next.query.trim());
    if (next.models.length === 1) params.set('model', next.models[0]);
    if (next.sort !== 'newest') params.set('sort', next.sort);
    setSearchParams(params, { replace: true });
  };

  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">Sklep</p>
        <h1>Używane iPhone&apos;y</h1>
        <p className="sf-muted">
          Każdy egzemplarz to osobna sztuka — sprawdzona, z gwarancją SmartFix.
        </p>
      </header>

      <div className="sf-shop-layout">
        <FilterPanel
          filters={filters}
          colors={colors}
          onChange={updateFilters}
          onReset={() => {
            setFilters({ ...DEFAULT_FILTERS });
            setSearchParams({}, { replace: true });
          }}
        />

        <section>
          <p className="sf-count">
            {loading
              ? 'Ładowanie…'
              : `${filtered.length} ${filtered.length === 1 ? 'iPhone' : 'iPhone\'ów'}`}
          </p>
          {loading ? <LoadingState /> : null}
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => window.location.reload()}
            />
          ) : null}
          {!loading && !error && filtered.length === 0 ? (
            <EmptyState
              title="Brak wyników"
              text="Zmień filtry lub wyczyść wyszukiwanie."
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

function filtersFromParams(params: URLSearchParams): StoreFilters {
  const model = params.get('model');
  const sort = params.get('sort');
  return {
    ...DEFAULT_FILTERS,
    query: params.get('q') ?? '',
    models: model ? [model] : [],
    sort:
      sort === 'price_asc' ||
      sort === 'price_desc' ||
      sort === 'best_deal' ||
      sort === 'newest'
        ? sort
        : 'newest',
  };
}
