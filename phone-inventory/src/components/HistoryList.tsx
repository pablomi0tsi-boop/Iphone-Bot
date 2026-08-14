import {
  formatDateTime,
  formatPln,
  formatSignedPln,
} from '../domain/calculations';
import type { HistoryEntry } from '../domain/types';

interface HistoryListProps {
  entries: HistoryEntry[];
}

function typeLabel(type: HistoryEntry['type']): string {
  switch (type) {
    case 'purchase':
      return 'Zakup';
    case 'sale':
      return 'Sprzedaż';
    case 'remove':
      return 'Usunięcie (−)';
    case 'finance':
      return 'Finanse';
    default:
      return type;
  }
}

export function HistoryList({ entries }: HistoryListProps) {
  if (entries.length === 0) {
    return <p className="empty-hint">Brak operacji w historii.</p>;
  }

  return (
    <ul className="history-list">
      {entries.map((entry) => {
        const profitClass =
          typeof entry.profit === 'number'
            ? entry.profit > 0
              ? 'positive'
              : entry.profit < 0
                ? 'negative'
                : 'neutral'
            : '';

        return (
          <li key={entry.id} className={`history-item type-${entry.type}`}>
            <div className="history-top">
              <span className={`history-badge type-${entry.type}`}>
                {typeLabel(entry.type)}
              </span>
              <time dateTime={entry.date}>{formatDateTime(entry.date)}</time>
            </div>
            <div className="history-model">{entry.modelName}</div>
            <div className="history-meta">
              {typeof entry.purchasePrice === 'number' ? (
                <span>Zakup: {formatPln(entry.purchasePrice)}</span>
              ) : null}
              {typeof entry.salePrice === 'number' ? (
                <span>Sprzedaż: {formatPln(entry.salePrice)}</span>
              ) : null}
              {typeof entry.profit === 'number' ? (
                <span className={profitClass}>
                  Zysk: {formatSignedPln(entry.profit)}
                </span>
              ) : null}
            </div>
            {entry.note ? <div className="history-note">{entry.note}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
