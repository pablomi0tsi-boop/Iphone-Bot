import { Link } from 'react-router-dom';
import { useCart } from '../CartContext';
import { ProductVisual } from '../components/ProductVisual';
import { EmptyState } from '../components/States';
import {
  batteryLabel,
  conditionBadge,
  formatPricePln,
} from '../format';

const DELIVERY_PREVIEW = 19;

export function CartPage() {
  const { lines, productsTotal, removeItem, itemCount, ready } = useCart();
  const total = productsTotal + (itemCount > 0 ? DELIVERY_PREVIEW : 0);

  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">Koszyk</p>
        <h1>Twój koszyk</h1>
        <p className="sf-muted">
          {itemCount === 0
            ? 'Koszyk jest pusty.'
            : `${itemCount} ${itemCount === 1 ? 'iPhone' : 'iPhone\'y'} w koszyku.`}
        </p>
      </header>

      {!ready ? <p className="sf-muted">Synchronizacja koszyka…</p> : null}

      {ready && lines.length === 0 ? (
        <EmptyState
          title="Brak produktów"
          text="Dodaj iPhone'a ze sklepu, aby kontynuować."
          action={
            <Link to="/sklep" className="btn primary">
              Przejdź do sklepu
            </Link>
          }
        />
      ) : null}

      {lines.length > 0 ? (
        <div className="sf-cart-layout">
          <ul className="sf-cart-list">
            {lines.map(({ product, quantity }) => (
              <li key={product.id} className="sf-cart-row">
                <div className="sf-cart-thumb">
                  <ProductVisual product={product} />
                </div>
                <div className="sf-cart-info">
                  <h2>{product.modelName}</h2>
                  <p className="sf-muted">
                    {product.storage} · {product.color} · Bateria{' '}
                    {batteryLabel(product.batteryPercent)} ·{' '}
                    {conditionBadge(product.condition)}
                  </p>
                  <p className="sf-muted">Ilość: {quantity}</p>
                  <p className="sf-price">{formatPricePln(product.price)}</p>
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

          <aside className="sf-summary">
            <h2>Podsumowanie</h2>
            <div className="sf-summary-row">
              <span>Wartość produktów</span>
              <span>{formatPricePln(productsTotal)}</span>
            </div>
            <div className="sf-summary-row">
              <span>Dostawa (szacunek)</span>
              <span>{formatPricePln(DELIVERY_PREVIEW)}</span>
            </div>
            <div className="sf-summary-row total">
              <span>Suma</span>
              <strong>{formatPricePln(total)}</strong>
            </div>
            <Link to="/zamowienie" className="btn primary block">
              Przejdź do zamówienia
            </Link>
            <Link to="/sklep" className="btn ghost block">
              Kontynuuj zakupy
            </Link>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
