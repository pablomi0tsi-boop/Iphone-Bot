import { Link } from 'react-router-dom';

export function ContactPage() {
  return (
    <main className="store-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Kontakt</p>
        <h1>Skontaktuj się z SmartFix</h1>
        <p>Chętnie pomożemy w zakupie, skupie lub serwisie.</p>
      </header>

      <div className="info-grid">
        <article className="why-card">
          <h2>E-mail</h2>
          <p>kontakt@smartfix.pl</p>
        </article>
        <article className="why-card">
          <h2>Telefon</h2>
          <p>+48 000 000 000</p>
        </article>
        <article className="why-card">
          <h2>Godziny</h2>
          <p>Pon–Pt 10:00–18:00</p>
        </article>
      </div>

      <div className="hero-actions" style={{ marginTop: 28 }}>
        <Link to="/sklep" className="btn primary">
          Zobacz telefony
        </Link>
        <Link to="/serwis" className="btn ghost">
          Zgłoś serwis
        </Link>
      </div>
    </main>
  );
}

export function TermsPage() {
  return (
    <main className="store-page legal-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Dokumenty</p>
        <h1>Regulamin</h1>
      </header>
      <div className="legal-body">
        <p>
          Niniejszy regulamin jest wersją roboczą na potrzeby UI sklepu
          SmartFix. Pełna treść prawna zostanie uzupełniona przed uruchomieniem
          sprzedaży online.
        </p>
        <h2>1. Sprzedawca</h2>
        <p>SmartFix — sprzedaż sprawdzonych telefonów używanych.</p>
        <h2>2. Zamówienia</h2>
        <p>
          Składanie zamówień i płatności nie są jeszcze aktywne. Koszyk służy
          wyłącznie demonstracji interfejsu.
        </p>
        <h2>3. Gwarancja</h2>
        <p>
          Każdy telefon objęty jest gwarancją SmartFix zgodnie z opisem na
          karcie produktu.
        </p>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <main className="store-page legal-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Dokumenty</p>
        <h1>Polityka prywatności</h1>
      </header>
      <div className="legal-body">
        <p>
          Wersja robocza polityki prywatności SmartFix. Przed produkcyjną
          sprzedażą uzupełnimy pełne informacje RODO.
        </p>
        <h2>Jakie dane zbieramy</h2>
        <p>
          Na tym etapie formularze skupu i serwisu nie wysyłają danych na
          serwer — działają lokalnie w przeglądarce.
        </p>
        <h2>Pliki cookie</h2>
        <p>
          Aplikacja może zapisywać koszyk w localStorage urządzenia
          użytkownika.
        </p>
        <h2>Kontakt</h2>
        <p>
          W sprawach prywatności: <Link to="/kontakt">kontakt</Link>.
        </p>
      </div>
    </main>
  );
}
