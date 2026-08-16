import { useState } from 'react';
import { Link } from 'react-router-dom';
import App from '../App';
import { LoginScreen } from '../components/LoginScreen';
import { useAuth } from '../hooks/useAuth';
import { AppStoreProvider } from '../hooks/useAppStore';

/**
 * Warehouse panel at /magazyn — same auth gate + inventory UI as before.
 * Public store routes live outside this component.
 */
export function MagazynRoute() {
  const {
    loading,
    session,
    error,
    cloudAuthRequired,
    signInWithGitHub,
    clearError,
  } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Sprawdzanie sesji…</p>
      </div>
    );
  }

  if (cloudAuthRequired && !session) {
    return (
      <div>
        <LoginScreen
          error={error}
          busy={signingIn}
          onClearError={clearError}
          onSignIn={() => {
            setSigningIn(true);
            void signInWithGitHub().finally(() => setSigningIn(false));
          }}
        />
        <p className="magazyn-gate-link" style={{ textAlign: 'center' }}>
          <Link to="/">← Wróć do sklepu SmartFix</Link>
        </p>
      </div>
    );
  }

  return (
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  );
}
