interface LoginScreenProps {
  error: string | null;
  busy?: boolean;
  onSignIn: () => void;
  onClearError?: () => void;
}

/** Login gate only — warehouse UI unchanged. */
export function LoginScreen({
  error,
  busy = false,
  onSignIn,
  onClearError,
}: LoginScreenProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SmartFix</p>
          <h1>Logowanie</h1>
        </div>
      </header>

      {error ? (
        <div className="toast error" role="alert">
          <span>{error}</span>
          {onClearError ? (
            <button type="button" onClick={onClearError} aria-label="Zamknij">
              ✕
            </button>
          ) : null}
        </div>
      ) : null}

      <main className="app-main">
        <section className="finance-card" style={{ padding: 20 }}>
          <p className="finance-hint" style={{ marginTop: 0 }}>
            Zaloguj się przez GitHub, aby otworzyć magazyn SmartFix.
          </p>
          <button
            type="button"
            className="btn primary block"
            disabled={busy}
            onClick={onSignIn}
          >
            {busy ? 'Przekierowanie…' : 'Zaloguj przez GitHub'}
          </button>
        </section>
      </main>
    </div>
  );
}
