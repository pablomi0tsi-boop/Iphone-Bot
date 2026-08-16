import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../CartContext';
import { getStoreProduct } from '../catalog';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import {
  availabilityLabel,
  batteryLabel,
  conditionBadge,
  formatPricePln,
  warrantyLabel,
} from '../format';
import { CHECKED_FEATURES, type StoreProduct } from '../types';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getStoreProduct(id ?? '')
      .then((item) => {
        if (!cancelled) {
          setProduct(item);
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
  }, [id]);

  if (loading) {
    return (
      <main className="sf-page">
        <LoadingState label="Ładowanie iPhone'a…" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="sf-page">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  if (!product) {
    return (
      <main className="sf-page">
        <EmptyState
          title="Nie znaleziono iPhone'a"
          text="Ten egzemplarz może być już niedostępny."
          action={
            <Link to="/sklep" className="btn primary">
              Wróć do sklepu
            </Link>
          }
        />
      </main>
    );
  }

  const available = product.listingStatus === 'available';
  const gallery =
    product.images.length > 0
      ? product.images
      : [`/products/iphone-15.webp`];

  return (
    <main className="sf-page sf-product-page">
      <Link to="/sklep" className="sf-back">
        ← Wróć do sklepu
      </Link>

      <div className="sf-product-layout">
        <div>
          <div className="sf-product-gallery">
            <img
              src={gallery[Math.min(activeImage, gallery.length - 1)]}
              alt={`${product.modelName} — zdjęcie katalogowe`}
              className="sf-product-gallery-img"
            />
          </div>
          {gallery.length > 1 ? (
            <div className="sf-gallery-thumbs" role="tablist" aria-label="Galeria">
              {gallery.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  className={index === activeImage ? 'active' : ''}
                  aria-label={`Zdjęcie ${index + 1}`}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sf-product-info">
          <p className="sf-eyebrow">{product.productNumber}</p>
          <h1>{product.modelName}</h1>
          <p
            className={`sf-badge inline ${available ? 'ok' : 'muted'}`}
          >
            {availabilityLabel(product.listingStatus)}
          </p>

          <div className="sf-card-price-row" style={{ marginTop: 12 }}>
            <p className="sf-price xl">{formatPricePln(product.price)}</p>
            {product.compareAtPrice &&
            product.compareAtPrice > product.price ? (
              <p className="sf-price-was">
                {formatPricePln(product.compareAtPrice)}
              </p>
            ) : null}
          </div>

          <dl className="sf-specs">
            <div>
              <dt>Pamięć</dt>
              <dd>{product.storage}</dd>
            </div>
            <div>
              <dt>Kolor</dt>
              <dd>{product.color}</dd>
            </div>
            <div>
              <dt>Bateria</dt>
              <dd>{batteryLabel(product.batteryPercent)}</dd>
            </div>
            <div>
              <dt>Stan wizualny</dt>
              <dd>{conditionBadge(product.condition)}</dd>
            </div>
          </dl>

          <section className="sf-block">
            <h2>Opis</h2>
            <p>{product.description}</p>
          </section>

          <section className="sf-block">
            <h2>Gwarancja</h2>
            <p>
              {warrantyLabel(product.warrantyMonths)} — wymiana lub naprawa
              zgodnie z regulaminem SmartFix.
            </p>
          </section>

          <section className="sf-block">
            <h2>Co zostało sprawdzone?</h2>
            <ul className="sf-checklist">
              {CHECKED_FEATURES.map((item) => (
                <li key={item}>
                  <span aria-hidden="true">✓</span> {item}
                </li>
              ))}
            </ul>
          </section>

          <div className="sf-product-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!available}
              onClick={() => {
                addItem(product.id);
                setAdded(true);
              }}
            >
              {added ? 'Dodano do koszyka' : 'Dodaj do koszyka'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!available}
              onClick={() => {
                addItem(product.id);
                navigate('/koszyk');
              }}
            >
              Kup teraz
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
