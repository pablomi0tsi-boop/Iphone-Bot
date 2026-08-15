import { useState, type FormEvent } from 'react';
import { CATALOG_MODELS } from '../../domain/catalog';

const ISSUES = [
  'Ekran / wyświetlacz',
  'Bateria',
  'Face ID / Touch ID',
  'Aparat',
  'Ładowanie / port',
  'Obudowa / tylna szyba',
  'Inne',
] as const;

interface ServiceForm {
  model: string;
  issue: string;
  description: string;
  name: string;
  email: string;
  phone: string;
}

const INITIAL: ServiceForm = {
  model: 'iPhone 13',
  issue: ISSUES[0],
  description: '',
  name: '',
  email: '',
  phone: '',
};

export function ServicePage() {
  const [form, setForm] = useState<ServiceForm>(INITIAL);
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
  };

  return (
    <main className="store-page">
      <header className="store-page-header">
        <p className="hero-eyebrow">Serwis</p>
        <h1>Zgłoś naprawę</h1>
        <p>
          Opisz usterkę — odezwiemy się z wyceną i terminem. Na tym etapie
          formularz działa jako UI (bez wysyłki do backendu).
        </p>
      </header>

      {sent ? (
        <div className="estimate-card" role="status">
          <p className="hero-eyebrow">Zgłoszenie</p>
          <h2>Dziękujemy!</h2>
          <p>
            Twoje zgłoszenie serwisowe zostało zapisane lokalnie w tej sesji.
            Podłączenie do systemu powiadomień pojawi się później.
          </p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setSent(false);
              setForm(INITIAL);
            }}
          >
            Nowe zgłoszenie
          </button>
        </div>
      ) : (
        <form className="store-form" onSubmit={onSubmit}>
          <label className="filter-field">
            <span>Model</span>
            <select
              value={form.model}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, model: e.target.value }))
              }
              required
            >
              {[...CATALOG_MODELS, 'Samsung Galaxy', 'Inny'].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Rodzaj usterki</span>
            <select
              value={form.issue}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, issue: e.target.value }))
              }
              required
            >
              {ISSUES.map((issue) => (
                <option key={issue} value={issue}>
                  {issue}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Opis problemu</span>
            <textarea
              rows={5}
              required
              value={form.description}
              placeholder="Co się dzieje z telefonem?"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </label>

          <label className="filter-field">
            <span>Imię i nazwisko</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </label>

          <label className="filter-field">
            <span>E-mail</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </label>

          <label className="filter-field">
            <span>Telefon</span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
          </label>

          <button type="submit" className="btn primary block">
            Wyślij zgłoszenie
          </button>
        </form>
      )}
    </main>
  );
}
