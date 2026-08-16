import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useCart } from '../CartContext';

const NAV = [
  { to: '/sklep', label: 'Sklep' },
  { to: '/sprzedaj', label: "Sprzedaj iPhone'a" },
  { to: '/napraw', label: 'Napraw' },
  { to: '/o-nas', label: 'O nas' },
  { to: '/kontakt', label: 'Kontakt' },
] as const;

export function StoreHeader() {
  const { itemCount } = useCart();
  const { session, user, cloudAuthRequired } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    if (itemCount <= 0) return;
    setCartPulse(true);
    const t = window.setTimeout(() => setCartPulse(false), 650);
    return () => window.clearTimeout(t);
  }, [itemCount]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/sklep?q=${encodeURIComponent(q)}` : '/sklep');
    setMenuOpen(false);
    setMobileSearchOpen(false);
  };

  const accountLabel = session
    ? user?.user_metadata?.user_name ||
      user?.email?.split('@')[0] ||
      'Konto'
    : 'Zaloguj';

  return (
    <header className="sf-header">
      <div className="sf-header-inner">
        <Link to="/" className="sf-brand" onClick={() => setMenuOpen(false)}>
          <span className="sf-brand-mark" aria-hidden="true">
            SF
          </span>
          <span className="sf-brand-name">SmartFix</span>
        </Link>

        <nav className="sf-nav-desktop" aria-label="Główna nawigacja">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'sf-nav-link active' : 'sf-nav-link'
              }
              end={item.to === '/sklep' ? false : undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sf-header-actions">
          <form className="sf-search desktop" onSubmit={onSearch} role="search">
            <label className="sr-only" htmlFor="sf-header-search">
              Szukaj iPhone&apos;a
            </label>
            <input
              id="sf-header-search"
              type="search"
              placeholder="Szukaj iPhone'a…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="sf-icon-btn" aria-label="Szukaj">
              <SearchIcon />
            </button>
          </form>

          <button
            type="button"
            className="sf-icon-btn sf-search-toggle"
            aria-label="Szukaj"
            aria-expanded={mobileSearchOpen}
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <SearchIcon />
          </button>

          <Link
            to={session ? '/konto' : cloudAuthRequired ? '/konto' : '/magazyn'}
            className="sf-icon-btn sf-account-icon"
            aria-label={accountLabel}
          >
            <UserIcon />
          </Link>

          <Link
            to={session ? '/konto' : cloudAuthRequired ? '/konto' : '/magazyn'}
            className="sf-account-link"
          >
            <UserIcon />
            <span>{accountLabel}</span>
          </Link>

          <Link
            to="/koszyk"
            className={`sf-icon-btn sf-cart-link${cartPulse ? ' pulse' : ''}`}
            aria-label="Koszyk"
          >
            <CartIcon />
            {itemCount > 0 ? (
              <span className="sf-cart-count">{itemCount}</span>
            ) : null}
          </Link>

          <button
            type="button"
            className="sf-icon-btn sf-menu-toggle"
            aria-expanded={menuOpen}
            aria-label="Menu"
            onClick={() => {
              setMenuOpen((v) => !v);
              setMobileSearchOpen(false);
            }}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {mobileSearchOpen ? (
        <div className="sf-mobile-search">
          <form className="sf-search mobile" onSubmit={onSearch} role="search">
            <input
              type="search"
              placeholder="Szukaj iPhone'a…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn primary">
              Szukaj
            </button>
          </form>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="sf-mobile-panel">
          <nav aria-label="Menu mobilne">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  isActive ? 'sf-nav-link active' : 'sf-nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/koszyk" onClick={() => setMenuOpen(false)}>
              Koszyk {itemCount > 0 ? `(${itemCount})` : ''}
            </Link>
            <Link to="/konto" onClick={() => setMenuOpen(false)}>
              {accountLabel}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 5h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H7" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.8-3.2 4-4.8 7-4.8s5.2 1.6 7 4.8" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {open ? (
        <path d="M6 6 18 18M18 6 6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}
