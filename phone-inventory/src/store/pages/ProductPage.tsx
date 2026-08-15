import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../CartContext';
import { getStoreProduct } from '../catalog';
import { batteryLabel, conditionLabel, formatPricePln } from '../format';
import type { StoreProduct } from '../types';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getStoreProduct(id ?? '').then((item) => {
      if (!cancelled) {
        setProduct(item);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="store-page">
        <div className="empty-state">
          <p>Ładowanie produktu…</p>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="store-page">
        <div className="empty-state">
          <h1>Nie znaleziono telefonu</h1>
          <p>Ten egzemplarz może być już niedostępny.</p>
          <Link to="/sklep" className="btn primary">
            Wróć do sklepu
          </Link>
        </div>
      </main>
    );
  }

  const onAdd = () => {
    addItem(product.id);
    setAdded(true);
  };

  const onBuyNow = () => {
    addItem(product.id);
    navigate('/koszyk');
  };

  return (
    <main className="store-page product-page">
      <Link to="/sklep" className="back-link">
        ← Wróć do sklepu
      </Link>

      <div className="product-detail">
        <div
          className={`product-gallery brand-${product.brand.toLowerCase()}`}
          aria-hidden="true"
        >
          <span className="product-gallery-glyph">
            {product.brand === 'Samsung' ? 'S' : '⌘'}
          </span>
          <p>{product.modelName}</p>
        </div>

        <div className="product-info">
          <p className="hero-eyebrow">{product.brand}</p>
          <h1>{product.modelName}</h1>
          <p className="product-detail-price">
            {formatPricePln(product.price)}
          </p>

          <dl className="product-specs">
            <div>
              <dt>Pamięć</dt>
              <dd>{product.storage}</dd>
            </div>
            {product.color ? (
              <div>
                <dt>Kolor</dt>
                <dd>{product.color}</dd>
              </div>
            ) : null}
            <div>
              <dt>Bateria</dt>
              <dd>{batteryLabel(product.batteryPercent)}</dd>
            </div>
            <div>
              <dt>Stan wizualny</dt>
              <dd>{conditionLabel(product.condition)}</dd>
            </div>
          </dl>

          <section className="product-block">
            <h2>Opis</h2>
            <p>{product.description}</p>
          </section>

          <section className="product-block">
            <h2>Gwarancja</h2>
            <p>{product.warranty}</p>
          </section>

          <div className="product-actions">
            <button type="button" className="btn primary" onClick={onAdd}>
              {added ? 'Dodano do koszyka' : 'Dodaj do koszyka'}
            </button>
            <button type="button" className="btn ghost" onClick={onBuyNow}>
              Kup teraz
            </button>
          </div>
          <p className="product-note">
            To osobny egzemplarz fizyczny. Płatności online wkrótce — na razie
            możesz dodać telefon do koszyka.
          </p>
        </div>
      </div>
    </main>
  );
}
