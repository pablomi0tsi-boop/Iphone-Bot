import { useRef, useState } from 'react'
import { RepairWizard } from './RepairWizard'
import type { RepairIssueId } from './types'
import './repair.css'

const HOW_STEPS = [
  { n: '01', title: 'Opisz usterkę', text: 'Wybierz model i wskaż, co nie działa.' },
  { n: '02', title: 'Otrzymaj wstępną wycenę', text: 'Od razu zobaczysz orientacyjny koszt naprawy.' },
  { n: '03', title: 'Przekaż telefon', text: 'Dostarcz osobiście lub wyślij kurierem.' },
  { n: '04', title: 'Diagnozujemy urządzenie', text: 'Potwierdzamy zakres i ostateczną cenę.' },
  { n: '05', title: 'Naprawiamy', text: 'Używamy sprawdzonych części i procedur.' },
  { n: '06', title: 'Odbierasz sprawnego iPhone\'a', text: 'Gotowe urządzenie z gwarancją na naprawę.' },
] as const

const POPULAR: {
  issue: RepairIssueId
  title: string
  text: string
}[] = [
  { issue: 'screen', title: 'Wymiana ekranu', text: 'Pęknięta szyba lub niesprawny wyświetlacz.' },
  { issue: 'battery', title: 'Wymiana baterii', text: 'Szybkie rozładowanie lub spuchnięta bateria.' },
  { issue: 'back_glass', title: 'Wymiana tylnej szyby', text: 'Uszkodzony tył bez ingerencji w elektronikę.' },
  { issue: 'charging', title: 'Naprawa gniazda ładowania', text: 'Luźne łączenie, brak ładowania lub brud.' },
  { issue: 'camera', title: 'Naprawa aparatu', text: 'Rozmazany obraz, brak ostrości lub czarny ekran.' },
  { issue: 'face_id', title: 'Naprawa Face ID', text: 'Brak rozpoznawania twarzy lub komunikaty błędów.' },
]

const WHY = [
  'Profesjonalna diagnoza',
  'Doświadczenie w naprawach iPhone',
  'Jasna wycena przed naprawą',
  'Gwarancja',
  'Bezpieczne dane klienta',
  'Kontakt z serwisem',
] as const

export function RepairPage() {
  const wizardRef = useRef<HTMLDivElement>(null)
  const [wizardStarted, setWizardStarted] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)
  const [initialIssues, setInitialIssues] = useState<RepairIssueId[]>([])

  function startRepair(issues: RepairIssueId[] = []) {
    setInitialIssues(issues)
    setWizardKey((k) => k + 1)
    setWizardStarted(true)
    window.setTimeout(() => {
      wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function resetWizard() {
    setWizardKey((k) => k + 1)
    setWizardStarted(false)
    setInitialIssues([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="repair-page">
      <section className="repair-hero">
        <div className="repair-hero__glow" aria-hidden />
        <div className="repair-hero__inner">
          <p className="repair-kicker">Serwis iPhone&apos;a</p>
          <h1>Napraw swojego iPhone&apos;a</h1>
          <p className="repair-hero__lead">
            Szybka diagnoza, profesjonalna naprawa i jasna wycena.
          </p>
          <ul className="repair-benefits">
            <li>Darmowa wstępna diagnoza</li>
            <li>Oryginalne i sprawdzone części</li>
            <li>Profesjonalny serwis</li>
            <li>Gwarancja na wykonaną naprawę</li>
          </ul>
          <button type="button" className="btn primary lg" onClick={() => startRepair()}>
            Rozpocznij zgłoszenie
          </button>
        </div>
      </section>

      <div className="repair-page__body" ref={wizardRef} id="zgloszenie">
        {wizardStarted ? (
          <RepairWizard
            key={wizardKey}
            onCancel={resetWizard}
            initialIssues={initialIssues}
          />
        ) : (
          <div className="repair-cta-hint">
            <p>Kliknij „Rozpocznij zgłoszenie”, aby przejść przez formularz naprawy.</p>
            <button type="button" className="btn primary" onClick={() => startRepair()}>
              Rozpocznij zgłoszenie
            </button>
          </div>
        )}
      </div>

      <section className="repair-section" id="jak-dziala-serwis">
        <div className="repair-section__head">
          <p className="repair-kicker">Proces</p>
          <h2>Jak działa serwis?</h2>
          <p>Od opisu usterki do odbioru sprawnego iPhone&apos;a.</p>
        </div>
        <ol className="repair-how">
          {HOW_STEPS.map((s) => (
            <li key={s.n} className="repair-how__card">
              <span className="repair-how__n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="repair-section" id="popularne-naprawy">
        <div className="repair-section__head">
          <p className="repair-kicker">Oferta</p>
          <h2>Najczęściej wykonywane naprawy</h2>
          <p>Wybierz usługę, a od razu przejdziemy do formularza zgłoszenia.</p>
        </div>
        <div className="repair-popular">
          {POPULAR.map((item) => (
            <article key={item.issue} className="repair-popular__card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => startRepair([item.issue])}
              >
                Sprawdź cenę
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="repair-section repair-section--why" id="dlaczego-smartfix">
        <div className="repair-section__head">
          <p className="repair-kicker">SmartFix</p>
          <h2>Dlaczego SmartFix?</h2>
        </div>
        <ul className="repair-why">
          {WHY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
