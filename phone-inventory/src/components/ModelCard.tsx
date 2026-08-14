import { formatPln } from '../domain/calculations';
import type { ModelStockSummary } from '../domain/types';

interface ModelCardProps {
  summary: ModelStockSummary;
  onIncrement: () => void;
  onDecrement: () => void;
  onSell: () => void;
}

export function ModelCard({
  summary,
  onIncrement,
  onDecrement,
  onSell,
}: ModelCardProps) {
  const { model, quantity, averagePurchasePrice, stockValue } = summary;
  const canDecrement = quantity > 0;
  const canSell = quantity > 0;

  return (
    <article className="model-card">
      <div className="model-card-top">
        <h3>{model.name}</h3>
        <button
          type="button"
          className="sell-chip"
          onClick={onSell}
          disabled={!canSell}
        >
          Sprzedaj
        </button>
      </div>

      <div className="qty-controls">
        <button
          type="button"
          className="qty-btn minus"
          onClick={onDecrement}
          disabled={!canDecrement}
          aria-label={`Zmniejsz stan ${model.name}`}
        >
          −
        </button>
        <div className="qty-display" aria-live="polite">
          <span className="qty-number">{quantity}</span>
          <span className="qty-label">szt.</span>
        </div>
        <button
          type="button"
          className="qty-btn plus"
          onClick={onIncrement}
          aria-label={`Zwiększ stan ${model.name}`}
        >
          +
        </button>
      </div>

      <div className="model-meta">
        <div>
          <span className="meta-label">Śr. zakup</span>
          <span className="meta-value">
            {quantity > 0 ? formatPln(averagePurchasePrice) : '—'}
          </span>
        </div>
        <div>
          <span className="meta-label">Wartość</span>
          <span className="meta-value">{formatPln(stockValue)}</span>
        </div>
      </div>
    </article>
  );
}
