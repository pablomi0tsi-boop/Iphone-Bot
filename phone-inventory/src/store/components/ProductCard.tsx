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
  const available = product.listingStatus === 'available';

  return (
    <article className="sf-card">
      <Link to={`/sklep/${product.id}`} className="sf-card-media-link">
        <ProductVisual product={product} />
        <span
          className={`sf-badge ${available ? 'ok' : 'muted'}`}
          aria-label={availabilityLabel(product.listingStatus)}
        >
          {availabilityLabel(product.listingStatus)}
        </span>
      </Link>

      <div className="sf-card-body">
        <h3>
          <Link to={`/sklep/${product.id}`}>{product.modelName}</Link>
        </h3>
        <p className="sf-card-meta">
          <span>{product.storage}</span>
          <span>{product.color}</span>
        </p>
        <p className="sf-card-meta">
          <span>Bateria {batteryLabel(product.batteryPercent)}</span>
          <span>Stan: {conditionBadge(product.condition)}</span>
        </p>
        <p className="sf-card-warranty">
          {warrantyLabel(product.warrantyMonths)}
        </p>

        <div className="sf-card-price-row">
          <p className="sf-price">{formatPricePln(product.price)}</p>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <p className="sf-price-was">
              {formatPricePln(product.compareAtPrice)}
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
            onClick={() => addItem(product.id)}
          >
            Dodaj do koszyka
          </button>
        </div>
      </div>
    </article>
  );
}
