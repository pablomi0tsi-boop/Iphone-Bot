import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../CartContext';
import { useOrders } from '../OrdersContext';
import { formatPricePln } from '../format';
import {
  DEFAULT_CHECKOUT,
  DELIVERY_FEE,
  type CheckoutForm,
  type StoreOrder,
} from '../types';

function createOrderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ord_${Date.now()}`;
}

export function CheckoutPage() {
  const { lines, productsTotal, clear, itemCount, ready } = useCart();
  const { addOrder } = useOrders();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutForm>(DEFAULT_CHECKOUT);
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  if (!ready) {
    return (
      <main className="sf-page">
        <div className="sf-state">
          <div className="spinner" />
          <p>Ładowanie zamówienia…</p>
        </div>
      </main>
    );
  }

  if (itemCount === 0 && !doneId) {
    return <Navigate to="/koszyk" replace />;
  }

  const deliveryFee = DELIVERY_FEE[form.delivery];
  const total = productsTotal + deliveryFee;

  const set =
    <K extends keyof CheckoutForm>(key: K) =>
    (value: CheckoutForm[K]) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (lines.length === 0) return;
    setSubmitting(true);
    const order: StoreOrder = {
      id: createOrderId(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      customer: form,
      items: lines.map(({ product, quantity }) => ({
        productId: product.id,
        productNumber: product.productNumber,
        modelName: product.modelName,
        storage: product.storage,
        color: product.color,
        unitPrice: product.price,
        quantity,
      })),
      productsTotal,
      deliveryFee,
      total,
      userId: user?.id,
    };
    addOrder(order);
    clear();
    setDoneId(order.id);
    setSubmitting(false);
  };

  if (doneId) {
    return (
      <main className="sf-page">
        <div className="sf-state">
          <p className="sf-eyebrow">Zamówienie</p>
          <h1>Dziękujemy!</h1>
          <p className="sf-muted">
            Zamówienie <strong>{doneId.slice(0, 8).toUpperCase()}</strong> zostało
            zapisane lokalnie. Płatności online podłączymy w kolejnym etapie.
          </p>
          <div className="sf-hero-actions">
            <Link to="/konto" className="btn primary">
              Zobacz konto
            </Link>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate('/sklep')}
            >
              Wróć do sklepu
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">Zamówienie</p>
        <h1>Dane dostawy</h1>
        <p className="sf-muted">
          Formularz działa end-to-end w przeglądarce. Płatność nie jest jeszcze
          pobierana.
        </p>
      </header>

      <div className="sf-checkout-layout">
        <form className="sf-form" onSubmit={onSubmit}>
          <div className="sf-form-grid">
            <label className="sf-field">
              <span>Imię</span>
              <input
                required
                value={form.firstName}
                onChange={(e) => set('firstName')(e.target.value)}
              />
            </label>
            <label className="sf-field">
              <span>Nazwisko</span>
              <input
                required
                value={form.lastName}
                onChange={(e) => set('lastName')(e.target.value)}
              />
            </label>
          </div>
          <label className="sf-field">
            <span>E-mail</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
            />
          </label>
          <label className="sf-field">
            <span>Telefon</span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => set('phone')(e.target.value)}
            />
          </label>
          <label className="sf-field">
            <span>Adres</span>
            <input
              required
              value={form.address}
              onChange={(e) => set('address')(e.target.value)}
            />
          </label>
          <div className="sf-form-grid">
            <label className="sf-field">
              <span>Kod pocztowy</span>
              <input
                required
                value={form.postalCode}
                onChange={(e) => set('postalCode')(e.target.value)}
              />
            </label>
            <label className="sf-field">
              <span>Miasto</span>
              <input
                required
                value={form.city}
                onChange={(e) => set('city')(e.target.value)}
              />
            </label>
          </div>
          <label className="sf-field">
            <span>Sposób dostawy</span>
            <select
              value={form.delivery}
              onChange={(e) =>
                set('delivery')(e.target.value as CheckoutForm['delivery'])
              }
            >
              <option value="courier">Kurier ({formatPricePln(19)})</option>
              <option value="parcel_locker">
                Paczkomat ({formatPricePln(14)})
              </option>
              <option value="pickup">Odbiór osobisty (0 zł)</option>
            </select>
          </label>
          <label className="sf-field">
            <span>Sposób płatności</span>
            <select
              value={form.payment}
              onChange={(e) =>
                set('payment')(e.target.value as CheckoutForm['payment'])
              }
            >
              <option value="blik">BLIK</option>
              <option value="card">Karta</option>
              <option value="transfer">Przelew</option>
            </select>
          </label>
          <button type="submit" className="btn primary block" disabled={submitting}>
            {submitting ? 'Zapisywanie…' : 'Złóż zamówienie'}
          </button>
        </form>

        <aside className="sf-summary">
          <h2>Podsumowanie</h2>
          <ul className="sf-summary-items">
            {lines.map(({ product, quantity }) => (
              <li key={product.id}>
                <span>
                  {product.modelName} · {product.storage}
                </span>
                <span>
                  {quantity} × {formatPricePln(product.price)}
                </span>
              </li>
            ))}
          </ul>
          <div className="sf-summary-row">
            <span>Produkty</span>
            <span>{formatPricePln(productsTotal)}</span>
          </div>
          <div className="sf-summary-row">
            <span>Dostawa</span>
            <span>{formatPricePln(deliveryFee)}</span>
          </div>
          <div className="sf-summary-row total">
            <span>Suma</span>
            <strong>{formatPricePln(total)}</strong>
          </div>
        </aside>
      </div>
    </main>
  );
}
