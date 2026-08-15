import { Link } from 'react-router-dom';
import type { StoreProduct } from '../types';
import { batteryLabel, conditionLabel, formatPricePln } from '../format';

interface ProductCardProps {
  product: StoreProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="product-card">
      <div
        className={`product-card-media brand-${product.brand.toLowerCase()}`}
        aria-hidden="true"
      >
        <span className="product-card-glyph">
          {product.brand === 'Samsung' ? 'S' : '⌘'}
        </span>
        {product.color ? (
          <span className="product-card-color">{product.color}</span>
        ) : null}
      </div>
      <div className="product-card-body">
        <h3>{product.modelName}</h3>
        <p className="product-card-meta">
          {product.storage}
          <span>·</span>
          Bateria {batteryLabel(product.batteryPercent)}
          <span>·</span>
          {conditionLabel(product.condition)}
        </p>
        <p className="product-card-price">{formatPricePln(product.price)}</p>
        <Link className="btn primary block" to={`/sklep/${product.id}`}>
          Zobacz
        </Link>
      </div>
    </article>
  );
}
