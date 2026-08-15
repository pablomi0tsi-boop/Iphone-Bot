import type { FinanceSummary, ModelStockSummary } from '../domain/types';
import { FinancePanel } from './FinancePanel';
import { SearchBar } from './SearchBar';

interface MagazynHomeProps {
  finance: FinanceSummary;
  onEditCash: () => void;
  onEditBank: () => void;
  search: string;
  onSearch: (value: string) => void;
  summaries: ModelStockSummary[];
  onOpenModel: (modelId: string) => void;
  onAddPhone: () => void;
}

export function MagazynHome({
  finance,
  onEditCash,
  onEditBank,
  search,
  onSearch,
  summaries,
  onOpenModel,
  onAddPhone,
}: MagazynHomeProps) {
  return (
    <>
      <FinancePanel
        finance={finance}
        compact
        onEditCash={onEditCash}
        onEditBank={onEditBank}
      />

      <SearchBar value={search} onChange={onSearch} placeholder="Szukaj modelu..." />

      <div className="action-row">
        <button type="button" className="btn primary" onClick={onAddPhone}>
          + Dodaj telefon
        </button>
      </div>

      <ul className="model-rows">
        {summaries.map((item) => (
          <li key={item.model.id}>
            <button
              type="button"
              className="model-row"
              onClick={() => onOpenModel(item.model.id)}
            >
              <span className="model-row-name">{item.model.name}</span>
              <span className="model-row-qty">{item.quantity} szt.</span>
            </button>
          </li>
        ))}
      </ul>

      {summaries.length === 0 ? (
        <p className="empty-hint">Brak modeli pasujących do wyszukiwania.</p>
      ) : null}
    </>
  );
}
