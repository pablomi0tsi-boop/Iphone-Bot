import { Link } from 'react-router-dom';
import { POPULAR_STORE_MODELS } from '../../domain/catalog';
import { STORE_MODEL_OPTIONS } from '../types';

export function ModelsPage() {
  return (
    <main className="sf-page">
      <header className="sf-page-header">
        <p className="sf-eyebrow">iPhone&apos;y</p>
        <h1>Wybierz model</h1>
        <p className="sf-muted">
          SmartFix sprzedaje wyłącznie używane iPhone&apos;y — bez innych marek
          i bez akcesoriów.
        </p>
      </header>

      <section className="sf-section" style={{ width: '100%', padding: '0 0 24px' }}>
        <h2>Popularne</h2>
        <div className="sf-model-grid">
          {POPULAR_STORE_MODELS.map((model) => (
            <Link
              key={model}
              to={`/sklep?model=${encodeURIComponent(model)}`}
              className="sf-model-tile"
            >
              <span>{model}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sf-section" style={{ width: '100%', padding: 0 }}>
        <h2>Wszystkie modele</h2>
        <div className="sf-model-grid">
          {STORE_MODEL_OPTIONS.map((model) => (
            <Link
              key={model}
              to={`/sklep?model=${encodeURIComponent(model)}`}
              className="sf-model-tile"
            >
              <span>{model}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

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
