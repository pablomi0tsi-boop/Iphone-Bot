import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useOrders } from '../OrdersContext';
import { formatPricePln } from '../format';

export function AccountPage() {
  const {
    loading,
    session,
    user,
    error,
    cloudAuthRequired,
    signInWithGitHub,
    signOut,
    clearError,
  } = useAuth();
  const { ordersForUser, ready } = useOrders();
  const [busy, setBusy] = useState(false);

  const orders = ordersForUser(user?.id);

  if (loading) {
    return (
      <main className="sf-page">
        <div className="sf-state">
          <div className="spinner" />
          <p>Sprawdzanie sesji…</p>
        </div>
      </main>
    );
  }

  if (cloudAuthRequired && !session) {
    return (
      <main className="sf-page">
        <header className="sf-page-header">
          <p className="sf-eyebrow">Konto</p>
          <h1>Zaloguj się</h1>
          <p className="sf-muted">
            Użyj GitHub OAuth (to samo logowanie co magazyn SmartFix).
          </p>
        </header>
        {error ? (
          <div className="toast error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError} aria-label="Zamknij">
              ✕
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signInWithGitHub('/konto').finally(() => setBusy(false));
          }}
        >
          {busy ? 'Przekierowanie…' : 'Zaloguj przez GitHub'}
        </button>
      </main>
    );
  }

  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">Konto</p>
        <h1>
          {user?.user_metadata?.user_name ||
            user?.email ||
            'Twoje konto'}
        </h1>
        <p className="sf-muted">
          {user?.email ? `E-mail: ${user.email}` : 'Sesja lokalna / magazyn'}
        </p>
      </header>

      <div className="sf-account-actions">
        <Link to="/magazyn" className="btn ghost">
          Panel magazynu
        </Link>
        {cloudAuthRequired ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              void signOut();
            }}
          >
            Wyloguj
          </button>
        ) : null}
      </div>

      <section className="sf-section" style={{ width: '100%', paddingLeft: 0, paddingRight: 0 }}>
        <div className="sf-section-head">
          <div>
            <h2>Historia zamówień</h2>
            <p className="sf-muted">
              Zamówienia zapisane w tej przeglądarce (przed podłączeniem
              płatności / tabeli orders).
            </p>
          </div>
        </div>

        {!ready ? <p className="sf-muted">Ładowanie…</p> : null}
        {ready && orders.length === 0 ? (
          <p className="sf-muted">Brak zamówień. Złóż pierwsze w sklepie.</p>
        ) : null}
        {orders.length > 0 ? (
          <ul className="sf-order-list">
            {orders.map((order) => (
              <li key={order.id} className="sf-order-card">
                <div>
                  <strong>{order.id.slice(0, 8).toUpperCase()}</strong>
                  <p className="sf-muted">
                    {new Date(order.createdAt).toLocaleString('pl-PL')} · status:{' '}
                    {order.status}
                  </p>
                  <p className="sf-muted">
                    {order.items
                      .map((i) => `${i.modelName} ${i.storage}`)
                      .join(', ')}
                  </p>
                </div>
                <p className="sf-price">{formatPricePln(order.total)}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
