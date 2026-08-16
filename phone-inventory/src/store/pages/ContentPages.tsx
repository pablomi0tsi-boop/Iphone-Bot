import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">O nas</p>
        <h1>SmartFix — iPhone&apos;y z charakterem premium</h1>
        <p className="sf-muted">
          Specjalizujemy się wyłącznie w sprzedaży używanych iPhone&apos;ów.
          Każdy egzemplarz testujemy przed wystawieniem.
        </p>
      </header>
      <div className="sf-how-grid">
        <article className="sf-how-card">
          <h3>Tylko Apple iPhone</h3>
          <p>Bez Samsungów, bez tabletów, bez zegarków — fokus na jakość.</p>
        </article>
        <article className="sf-how-card">
          <h3>Testy przed sprzedażą</h3>
          <p>Face ID, True Tone, aparaty, bateria i łączność w standardzie.</p>
        </article>
        <article className="sf-how-card">
          <h3>Gwarancja</h3>
          <p>Kupujesz bezpiecznie, z jasnym opisem stanu i wsparciem SmartFix.</p>
        </article>
      </div>
    </main>
  );
}

export function ContactPage() {
  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">Kontakt</p>
        <h1>Porozmawiajmy</h1>
        <p className="sf-muted">Pytania o iPhone&apos;a, dostawę lub gwarancję.</p>
      </header>
      <div className="sf-how-grid">
        <article className="sf-how-card">
          <h3>E-mail</h3>
          <p>kontakt@smartfix.pl</p>
        </article>
        <article className="sf-how-card">
          <h3>Telefon</h3>
          <p>+48 000 000 000</p>
        </article>
        <article className="sf-how-card">
          <h3>Godziny</h3>
          <p>Pon–Pt 10:00–18:00</p>
        </article>
      </div>
    </main>
  );
}

export function TermsPage() {
  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <h1>Regulamin</h1>
      </header>
      <div className="sf-legal">
        <p>
          Wersja robocza regulaminu sklepu SmartFix (używane iPhone&apos;y). Pełna
          treść prawna przed uruchomieniem płatności.
        </p>
        <h2>1. Przedmiot</h2>
        <p>Sprzedaż używanych iPhone&apos;ów sprawdzonych przez SmartFix.</p>
        <h2>2. Zamówienia</h2>
        <p>
          Formularz zamówienia zapisuje dane lokalnie do czasu podłączenia
          płatności i backendu zamówień.
        </p>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <h1>Polityka prywatności</h1>
      </header>
      <div className="sf-legal">
        <p>
          Robocza polityka prywatności. Koszyk i zamówienia mogą być
          przechowywane w localStorage przeglądarki. Logowanie GitHub obsługuje
          Supabase Auth.
        </p>
        <p>
          Kontakt: <Link to="/kontakt">strona kontaktu</Link>.
        </p>
      </div>
    </main>
  );
}
