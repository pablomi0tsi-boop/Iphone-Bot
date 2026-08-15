import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AppStoreProvider } from './hooks/useAppStore';
import './index.css';

function Root() {
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
      <LoginScreen
        error={error}
        busy={signingIn}
        onClearError={clearError}
        onSignIn={() => {
          setSigningIn(true);
          void signInWithGitHub().finally(() => setSigningIn(false));
        }}
      />
    );
  }

  return (
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
