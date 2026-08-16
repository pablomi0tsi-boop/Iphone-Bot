import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  availabilityLabel,
  batteryLabel,
  conditionBadge,
  formatPricePln,
  warrantyLabel,
} from '../format';
import type { StoreProduct } from '../types';
import { useCart } from '../CartContext';
import { ProductVisual } from './ProductVisual';

interface ProductCardProps {
  product: StoreProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const available = product.listingStatus === 'available';
  const hasDiscount =
    typeof product.compareAtPrice === 'number' &&
    product.compareAtPrice > product.price;

  return (
    <article className="sf-card">
      <Link
        to={`/sklep/${product.id}`}
        className="sf-card-media-link"
        aria-label={`Zobacz ${product.modelName}`}
      >
        <ProductVisual product={product} />
        <span className={`sf-badge ${available ? 'ok' : 'muted'}`}>
          {availabilityLabel(product.listingStatus)}
        </span>
      </Link>

      <div className="sf-card-body">
        <div className="sf-card-top">
          <h3>
            <Link to={`/sklep/${product.id}`}>{product.modelName}</Link>
          </h3>
          <ul className="sf-card-specs">
            <li>{product.storage}</li>
            <li>{product.color}</li>
            <li>Bateria {batteryLabel(product.batteryPercent)}</li>
            <li>{conditionBadge(product.condition)}</li>
          </ul>
          <p className="sf-card-warranty">
            {warrantyLabel(product.warrantyMonths)}
          </p>
        </div>

        <div className="sf-card-footer">
          <div className="sf-card-price-row">
            <p className="sf-price">{formatPricePln(product.price)}</p>
            {hasDiscount ? (
              <p className="sf-price-was">
                {formatPricePln(product.compareAtPrice!)}
              </p>
            ) : null}
          </div>

          <div className="sf-card-actions">
            <Link className="btn ghost" to={`/sklep/${product.id}`}>
              Zobacz
            </Link>
            <button
              type="button"
              className="btn primary"
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
