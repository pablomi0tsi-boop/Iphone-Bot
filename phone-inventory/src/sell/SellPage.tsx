import { useRef, useState } from 'react'
import { SellWizard } from './SellWizard'
import './sell.css'

const HOW_STEPS = [
  { n: '01', title: 'Wybierz model', text: 'Wskaż model i pojemność swojego iPhone\'a.' },
  { n: '02', title: 'Odpowiedz na kilka pytań', text: 'Stan, bateria i kluczowe kwestie techniczne.' },
  { n: '03', title: 'Otrzymaj wycenę', text: 'Od razu zobaczysz szacowaną wartość urządzenia.' },
  { n: '04', title: 'Przekaż nam telefon', text: 'Wyślij kurierem lub dostarcz osobiście do SmartFix.' },
  { n: '05', title: 'Otrzymaj pieniądze', text: 'Po weryfikacji wypłacamy uzgodnioną kwotę.' },
] as const

const PREP_STEPS = [
  {
    title: 'Wykonaj kopię zapasową',
    text: 'Zrób backup danych w iCloud lub na komputerze, zanim wyczyścisz telefon.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </svg>
    ),
  },
  {
    title: 'Wyloguj się z Apple ID / iCloud',
    text: 'Ustawienia → [Twoje imię] → Wyloguj. Telefon musi być wolny od konta.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      </svg>
    ),
  },
  {
    title: 'Wyłącz „Znajdź mój iPhone”',
    text: 'Bez wyłączenia Find My nie da się bezpiecznie sprzedać urządzenia.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    ),
  },
  {
    title: 'Wyjmij kartę SIM',
    text: 'Usuń kartę SIM (i eSIM, jeśli używasz) przed przekazaniem telefonu.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M9 7h6M9 11h6M9 15h3" />
      </svg>
    ),
  },
  {
    title: 'Wymaż zawartość i ustawienia',
    text: 'Ustawienia → Ogólne → Przenieś lub wyzeruj iPhone → Wymaż zawartość.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
      </svg>
    ),
  },
  {
    title: 'Przygotuj telefon do wysyłki',
    text: 'Zabezpiecz urządzenie w pudełku z wypełnieniem — lub umów odbiór osobisty.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
        <path d="M12 12v9M3 7.5l9 4.5 9-4.5" />
      </svg>
    ),
  },
] as const

export function SellPage() {
  const wizardRef = useRef<HTMLDivElement>(null)
  const [wizardStarted, setWizardStarted] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)

  function startQuote() {
    setWizardStarted(true)
    window.setTimeout(() => {
      wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function resetWizard() {
    setWizardKey((k) => k + 1)
    setWizardStarted(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="sell-page">
      <section className="sell-hero">
        <div className="sell-hero__glow" aria-hidden />
        <div className="sell-hero__inner">
          <p className="sell-kicker">Sprzedaż iPhone&apos;a</p>
          <h1>Sprzedaj swojego iPhone&apos;a</h1>
          <p className="sell-hero__lead">
            Sprawdź jego wartość w kilka minut i otrzymaj szybką wycenę.
          </p>
          <ul className="sell-benefits">
            <li>Darmowa wycena</li>
            <li>Szybka decyzja</li>
            <li>Bezpieczna transakcja</li>
            <li>Możliwość wysyłki lub przekazania telefonu osobiście</li>
          </ul>
          <button type="button" className="btn primary lg" onClick={startQuote}>
            Rozpocznij wycenę
          </button>
        </div>
      </section>

      <div className="sell-page__body" ref={wizardRef} id="wycena">
        {wizardStarted ? (
          <SellWizard key={wizardKey} onCancel={resetWizard} />
        ) : (
          <div className="sell-cta-hint">
            <p>Kliknij „Rozpocznij wycenę”, aby przejść przez interaktywny formularz.</p>
            <button type="button" className="btn primary" onClick={startQuote}>
              Rozpocznij wycenę
            </button>
          </div>
        )}
      </div>

      <section className="sell-section" id="jak-to-dziala">
        <div className="sell-section__head">
          <p className="sell-kicker">Proces</p>
          <h2>Jak to działa?</h2>
          <p>Od wyboru modelu do wypłaty — pięć prostych kroków.</p>
        </div>
        <ol className="sell-how">
          {HOW_STEPS.map((s) => (
            <li key={s.n} className="sell-how__card">
              <span className="sell-how__n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sell-section sell-section--prep" id="przygotowanie">
        <div className="sell-section__head">
          <p className="sell-kicker">Przed sprzedażą</p>
          <h2>Jak przygotować iPhone&apos;a do sprzedaży?</h2>
          <p>Kilka minut przygotowań przyspiesza weryfikację i wypłatę.</p>
        </div>
        <div className="sell-prep">
          {PREP_STEPS.map((s, i) => (
            <article key={s.title} className="sell-prep__card">
              <div className="sell-prep__icon">{s.icon}</div>
              <span className="sell-prep__n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
