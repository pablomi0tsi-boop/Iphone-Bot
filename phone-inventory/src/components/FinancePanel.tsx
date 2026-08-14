import {
  formatPln,
  formatSignedPln,
} from '../domain/calculations';
import type { FinanceSummary } from '../domain/types';

interface FinancePanelProps {
  finance: FinanceSummary;
  onEditCash: () => void;
  onEditBank: () => void;
  compact?: boolean;
}

export function FinancePanel({
  finance,
  onEditCash,
  onEditBank,
  compact = false,
}: FinancePanelProps) {
  const profitClass =
    finance.totalProfit > 0
      ? 'positive'
      : finance.totalProfit < 0
        ? 'negative'
        : 'neutral';

  return (
    <section className={`finance-panel ${compact ? 'compact' : ''}`}>
      <div className="finance-grid">
        <button type="button" className="finance-card editable" onClick={onEditCash}>
          <span className="finance-label">💵 Gotówka</span>
          <span className="finance-value">{formatPln(finance.cash)}</span>
          <span className="finance-hint">Dotknij, aby zmienić</span>
        </button>
        <button type="button" className="finance-card editable" onClick={onEditBank}>
          <span className="finance-label">🏦 Stan konta</span>
          <span className="finance-value">{formatPln(finance.bank)}</span>
          <span className="finance-hint">Dotknij, aby zmienić</span>
        </button>
        <div className="finance-card">
          <span className="finance-label">📱 Wartość telefonów</span>
          <span className="finance-value">{formatPln(finance.phoneValue)}</span>
        </div>
        <div className="finance-card highlight">
          <span className="finance-label">💰 Łączna wartość</span>
          <span className="finance-value">{formatPln(finance.totalAssets)}</span>
        </div>
        <div className={`finance-card wide ${profitClass}`}>
          <span className="finance-label">📈 Łączny zysk ze sprzedaży</span>
          <span className="finance-value">{formatSignedPln(finance.totalProfit)}</span>
        </div>
      </div>
    </section>
  );
}
