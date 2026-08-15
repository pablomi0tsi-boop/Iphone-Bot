import { Link, NavLink, Outlet } from 'react-router-dom';
import { useCart } from '../CartContext';
import './store.css';

const NAV = [
  { to: '/sklep', label: 'Sklep' },
  { to: '/skup', label: 'Skup telefonu' },
  { to: '/serwis', label: 'Serwis' },
  { to: '/kontakt', label: 'Kontakt' },
] as const;

export function StoreLayout() {
  const { itemCount } = useCart();

  return (
    <div className="store">
      <header className="store-nav">
        <div className="store-nav-inner">
          <Link to="/" className="store-logo" aria-label="SmartFix — strona główna">
            <span className="store-logo-mark">SF</span>
            <span className="store-logo-text">SmartFix</span>
          </Link>

          <nav className="store-nav-links" aria-label="Główne">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'store-nav-link active' : 'store-nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Link to="/koszyk" className="store-cart-btn">
            <svg
              className="store-cart-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M3 5h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H7" />
              <circle cx="10" cy="20" r="1.4" />
              <circle cx="17" cy="20" r="1.4" />
            </svg>
            <span>Koszyk</span>
            {itemCount > 0 ? (
              <span className="store-cart-badge">{itemCount}</span>
            ) : null}
          </Link>
        </div>
      </header>

      <Outlet />

      <footer className="store-footer">
        <div className="store-footer-inner">
          <div className="store-footer-brand">
            <p className="store-logo-text">SmartFix</p>
            <p>
              Sprawdzone iPhone&apos;y i smartfony. Uczciwe ceny, gwarancja
              i szybka wysyłka.
            </p>
          </div>
          <div>
            <h3>Sklep</h3>
            <ul>
              <li>
                <Link to="/sklep">Telefony</Link>
              </li>
              <li>
                <Link to="/skup">Sprzedaj telefon</Link>
              </li>
              <li>
                <Link to="/serwis">Serwis</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Informacje</h3>
            <ul>
              <li>
                <Link to="/regulamin">Regulamin</Link>
              </li>
              <li>
                <Link to="/polityka-prywatnosci">Polityka prywatności</Link>
              </li>
              <li>
                <Link to="/kontakt">Kontakt</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Kontakt</h3>
            <ul>
              <li>kontakt@smartfix.pl</li>
              <li>+48 000 000 000</li>
              <li>Polska</li>
            </ul>
          </div>
        </div>
        <p className="store-footer-copy">
          © {new Date().getFullYear()} SmartFix. Wszystkie prawa zastrzeżone.
        </p>
      </footer>
    </div>
  );
}
