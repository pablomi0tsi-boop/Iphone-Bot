import { Link } from 'react-router-dom';
import { useCart } from '../CartContext';
import { batteryLabel, conditionLabel, formatPricePln } from '../format';

export function CartPage() {
  const { lines, total, removeItem, itemCount } = useCart();

  return (
    <main className="store-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Koszyk</p>
        <h1>Twój koszyk</h1>
        <p>
          {itemCount === 0
            ? 'Koszyk jest pusty.'
            : `${itemCount} ${itemCount === 1 ? 'produkt' : 'produkty'} w koszyku.`}
        </p>
      </header>

      {lines.length === 0 ? (
        <div className="empty-state">
          <p>Dodaj telefon ze sklepu, aby kontynuować.</p>
          <Link to="/sklep" className="btn primary">
            Przejdź do sklepu
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <ul className="cart-list">
            {lines.map(({ product }) => (
              <li key={product.id} className="cart-row">
                <div
                  className={`cart-thumb brand-${product.brand.toLowerCase()}`}
                  aria-hidden="true"
                />
                <div className="cart-row-info">
                  <h2>{product.modelName}</h2>
                  <p>
                    {product.storage}
                    {product.color ? ` · ${product.color}` : ''} · Bateria{' '}
                    {batteryLabel(product.batteryPercent)} ·{' '}
                    {conditionLabel(product.condition)}
                  </p>
                  <p className="cart-row-price">
                    {formatPricePln(product.price)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => removeItem(product.id)}
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>

          <aside className="cart-summary">
            <h2>Podsumowanie</h2>
            <div className="cart-summary-row">
              <span>Suma</span>
              <strong>{formatPricePln(total)}</strong>
            </div>
            <button type="button" className="btn primary block" disabled>
              Przejdź do zamówienia
            </button>
            <p className="product-note">
              Płatności i składanie zamówień pojawią się w kolejnym etapie.
              Na razie koszyk działa tylko jako UI.
            </p>
            <Link to="/sklep" className="btn ghost block">
              Kontynuuj zakupy
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
