import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  batteryLabel,
  conditionBadge,
  discountPercent,
  formatPricePln,
} from '../format';
import type { StoreProduct } from '../types';
import { useCart } from '../CartContext';
import { useFavorites } from '../FavoritesContext';
import { ProductVisual } from './ProductVisual';

interface ProductCardProps {
  product: StoreProduct;
  /** Emphasize deal badge when shown in promotions section. */
  showDealBadge?: boolean;
}

export function ProductCard({
  product,
  showDealBadge = false,
}: ProductCardProps) {
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [added, setAdded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const available = product.listingStatus === 'available';
  const pct = discountPercent(product.price, product.compareAtPrice);
  const hasDiscount = pct != null;
  const favorite = isFavorite(product.id);

  useEffect(() => {
    if (!added) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 500);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <article className={`sf-card${pulse ? ' sf-card--added' : ''}`}>
      <div className="sf-card-media">
        <Link
          to={`/sklep/${product.id}`}
          className="sf-card-media-link"
          aria-label={`Zobacz ${product.modelName}`}
        >
          <ProductVisual product={product} />
        </Link>

        <span className="sf-badge ok">Sprawdzony</span>

        {showDealBadge && hasDiscount ? (
          <span className="sf-badge deal">-{pct}%</span>
        ) : null}

        <button
          type="button"
          className={`sf-fav-btn${favorite ? ' on' : ''}`}
          aria-label={
            favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'
          }
          aria-pressed={favorite}
          onClick={() => toggleFavorite(product.id)}
        >
          <HeartIcon filled={favorite} />
        </button>
      </div>

      <div className="sf-card-body">
        <div className="sf-card-top">
          <h3>
            <Link to={`/sklep/${product.id}`}>{product.modelName}</Link>
          </h3>
          <dl className="sf-card-meta">
            <div>
              <dt>Pamięć</dt>
              <dd>{product.storage}</dd>
            </div>
            <div>
              <dt>Kolor</dt>
              <dd>{product.color}</dd>
            </div>
            <div>
              <dt>Stan</dt>
              <dd>{conditionBadge(product.condition)}</dd>
            </div>
            <div>
              <dt>Bateria</dt>
              <dd>{batteryLabel(product.batteryPercent)}</dd>
            </div>
          </dl>
        </div>

        <div className="sf-card-footer">
          <div className="sf-card-price-row">
            <p className="sf-price">{formatPricePln(product.price)}</p>
            {hasDiscount ? (
              <>
                <p className="sf-price-was">
                  {formatPricePln(product.compareAtPrice!)}
                </p>
                {!showDealBadge ? (
                  <span className="sf-discount-pill">-{pct}%</span>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="sf-card-actions">
            <Link className="btn ghost" to={`/sklep/${product.id}`}>
              Zobacz
            </Link>
            <button
              type="button"
              className={`btn primary${added ? ' sf-btn-added' : ''}`}
              disabled={!available}
              onClick={() => {
                addItem(product.id);
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1600);
              }}
            >
              {added ? 'Dodano' : 'Dodaj do koszyka'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.4-9.2-8.2C1.2 9.2 2.4 6 5.5 5.4c1.8-.3 3.5.5 4.5 1.9 1-1.4 2.7-2.2 4.5-1.9 3.1.6 4.3 3.8 2.7 6.4C19 15.6 12 20 12 20z" />
    </svg>
  );
}
