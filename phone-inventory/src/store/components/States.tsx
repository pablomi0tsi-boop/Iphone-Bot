import type { ReactNode } from 'react';

export function LoadingState({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <div className="sf-state" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="sf-state empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="sf-state error" role="alert">
      <h2>Coś poszło nie tak</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn primary" onClick={onRetry}>
          Spróbuj ponownie
        </button>
      ) : null}
    </div>
  );
}
