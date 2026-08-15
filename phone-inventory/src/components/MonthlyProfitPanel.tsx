import {
  formatDateOnly,
  formatPln,
  formatSignedPln,
  shortMonthLabel,
} from '../domain/calculations';
import type { MonthlyProfitSummary } from '../domain/types';

interface MonthlyProfitPanelProps {
  summary: MonthlyProfitSummary;
  prevMonth: string;
  nextMonth: string;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthlyProfitPanel({
  summary,
  prevMonth,
  nextMonth,
  onPrev,
  onNext,
}: MonthlyProfitPanelProps) {
  const profitClass =
    summary.totalProfit > 0
      ? 'positive'
      : summary.totalProfit < 0
        ? 'negative'
        : 'neutral';

  return (
    <section className="monthly-profit">
      <div className="month-nav">
        <button type="button" className="month-nav-btn" onClick={onPrev} aria-label="Poprzedni miesiąc">
          ‹ {shortMonthLabel(prevMonth)}
        </button>
        <div className="month-current" aria-live="polite">
          {summary.label}
        </div>
        <button type="button" className="month-nav-btn" onClick={onNext} aria-label="Następny miesiąc">
          {shortMonthLabel(nextMonth)} ›
        </button>
      </div>

      <div className="monthly-stats">
        <div className="monthly-stat">
          <span className="meta-label">Sprzedane</span>
          <span className="monthly-stat-value">{summary.soldCount} szt.</span>
        </div>
        <div className="monthly-stat">
          <span className="meta-label">Sprzedaż</span>
          <span className="monthly-stat-value">{formatPln(summary.totalSales)}</span>
        </div>
        <div className={`monthly-stat wide ${profitClass}`}>
          <span className="meta-label">Zysk</span>
          <span className="monthly-stat-value">
            {formatSignedPln(summary.totalProfit)}
          </span>
        </div>
      </div>

      {summary.sales.length === 0 ? (
        <p className="empty-hint">Brak sprzedaży w tym miesiącu.</p>
      ) : (
        <ul className="sale-list">
          {summary.sales.map((sale) => (
            <li key={sale.id} className="sale-item">
              <div className="sale-top">
                <strong>{sale.modelName}</strong>
                <time dateTime={sale.soldAt}>{formatDateOnly(sale.soldAt)}</time>
              </div>
              <div className="sale-meta">
                {sale.storage ? <span>{sale.storage}</span> : null}
                {sale.imei ? <span>IMEI {sale.imei}</span> : null}
                {sale.buyerName ? <span>Kupujący: {sale.buyerName}</span> : null}
              </div>
              <div className="sale-money">
                <span>{formatPln(sale.salePrice)}</span>
                <span
                  className={
                    sale.profit > 0
                      ? 'positive'
                      : sale.profit < 0
                        ? 'negative'
                        : 'neutral'
                  }
                >
                  {formatSignedPln(sale.profit)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
