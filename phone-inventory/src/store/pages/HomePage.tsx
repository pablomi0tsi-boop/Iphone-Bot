import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { POPULAR_STORE_MODELS } from '../../domain/catalog';
import { listFeaturedByModels, listStoreProducts } from '../catalog';
import type { StoreProduct } from '../types';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, LoadingState } from '../components/States';

const HOW = [
  {
    title: 'Selekcja',
    text: 'Przyjmujemy tylko sprawdzone iPhone’y w dobrym stanie technicznym.',
  },
  {
    title: 'Testy',
    text: 'Face ID, True Tone, aparaty, bateria i łączność — każdy punkt na liście.',
  },
  {
    title: 'Gwarancja',
    text: 'Kupujesz ze spokojem. Każdy egzemplarz ma gwarancję SmartFix.',
  },
];

export function HomePage() {
  const [featured, setFeatured] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listFeaturedByModels(POPULAR_STORE_MODELS)
      .then((items) => {
        if (!cancelled) {
          setFeatured(items);
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

  return (
    <main>
      <section className="sf-hero">
        <div className="sf-hero-inner">
          <p className="sf-eyebrow">SmartFix</p>
          <h1>Używane iPhone&apos;y. Sprawdzone. Gotowe do użycia.</h1>
          <p className="sf-hero-lead">
            Każdy iPhone jest dokładnie sprawdzany przed sprzedażą.
          </p>
          <div className="sf-hero-actions">
            <Link to="/sklep" className="btn primary">
              Zobacz iPhone&apos;y
            </Link>
            <Link to="/sprzedaj" className="btn ghost">
              Sprzedaj iPhone&apos;a
            </Link>
          </div>
        </div>
      </section>

      <section className="sf-section">
        <div className="sf-section-head">
          <div>
            <h2>Znajdź swojego iPhone&apos;a</h2>
            <p className="sf-muted">Popularne modele w ofercie SmartFix.</p>
          </div>
          <Link to="/iphone">Wszystkie modele</Link>
        </div>
        <div className="sf-model-grid">
          {POPULAR_STORE_MODELS.map((model) => (
            <Link
              key={model}
              to={`/sklep?model=${encodeURIComponent(model)}`}
              className="sf-model-tile"
            >
              <span>{model}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sf-section" id="oferta">
        <div className="sf-section-head">
          <div>
            <h2>Polecane egzemplarze</h2>
            <p className="sf-muted">Gotowe do wysyłki — jeden telefon, jedna sztuka.</p>
          </div>
          <Link to="/sklep">Sklep</Link>
        </div>
        {loading ? <LoadingState label="Ładowanie oferty…" /> : null}
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setLoading(true);
              setError(null);
              void listStoreProducts()
                .then((items) => {
                  setFeatured(items.slice(0, 8));
                  setLoading(false);
                })
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : 'Błąd ładowania',
                  );
                  setLoading(false);
                });
            }}
          />
        ) : null}
        {!loading && !error ? (
          <div className="sf-product-grid">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="sf-section" id="jak-dzialamy">
        <div className="sf-section-head">
          <div>
            <h2>Jak działamy?</h2>
            <p className="sf-muted">Prosty proces, premium jakość.</p>
          </div>
        </div>
        <div className="sf-how-grid">
          {HOW.map((item, index) => (
            <article key={item.title} className="sf-how-card">
              <span className="sf-how-num">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
