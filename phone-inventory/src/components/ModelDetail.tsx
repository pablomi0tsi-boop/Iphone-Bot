import {
  conditionLabel,
  formatPln,
  unitLabel,
} from '../domain/calculations';
import type { Model, Phone } from '../domain/types';

interface ModelDetailProps {
  model: Model;
  phones: Phone[];
  stockValue: number;
  onBack: () => void;
  onOpenPhone: (phoneId: string) => void;
  onAddPhone: () => void;
}

export function ModelDetail({
  model,
  phones,
  stockValue,
  onBack,
  onOpenPhone,
  onAddPhone,
}: ModelDetailProps) {
  return (
    <div className="view-stack">
      <button type="button" className="back-link" onClick={onBack}>
        ← Magazyn
      </button>

      <div className="model-detail-header">
        <h2>{model.name}</h2>
        <p className="page-subtitle">
          {phones.length} szt. · Łączna wartość: {formatPln(stockValue)}
        </p>
      </div>

      <button type="button" className="btn primary block" onClick={onAddPhone}>
        + Dodaj {model.name}
      </button>

      {phones.length === 0 ? (
        <p className="empty-hint">Brak telefonów tego modelu w magazynie.</p>
      ) : (
        <ul className="unit-list">
          {phones.map((phone, index) => (
            <li key={phone.id}>
              <button
                type="button"
                className="unit-card"
                onClick={() => onOpenPhone(phone.id)}
              >
                <div className="unit-title">
                  {model.name} {phone.storage}
                  <span className="unit-index">{unitLabel(index)}</span>
                </div>
                <div className="unit-line">IMEI: {phone.imei || '—'}</div>
                <div className="unit-line">🔋 {phone.batteryPercent}%</div>
                <div className="unit-line">⭐ {conditionLabel(phone.condition)}</div>
                <div className="unit-money">
                  <span>Zakup: {formatPln(phone.purchasePrice)}</span>
                  <span>Wartość: {formatPln(phone.listedValue)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
