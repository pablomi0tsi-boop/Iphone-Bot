import { formatPln } from '../domain/calculations';
import type { ModelStockSummary } from '../domain/types';
import { SearchBar } from './SearchBar';

interface MagazynHomeProps {
  phoneCount: number;
  stockValue: number;
  search: string;
  onSearch: (value: string) => void;
  summaries: ModelStockSummary[];
  onOpenModel: (modelId: string) => void;
  onAddPhone: () => void;
}

export function MagazynHome({
  phoneCount,
  stockValue,
  search,
  onSearch,
  summaries,
  onOpenModel,
  onAddPhone,
}: MagazynHomeProps) {
  return (
    <div className="view-stack">
      <header className="page-header">
        <h1>📱 Magazyn</h1>
      </header>

      <section className="summary-strip">
        <div>
          <span className="meta-label">Liczba telefonów</span>
          <strong>{phoneCount} szt.</strong>
        </div>
        <div>
          <span className="meta-label">Wartość magazynu</span>
          <strong>{formatPln(stockValue)}</strong>
        </div>
      </section>

      <button type="button" className="btn primary block lg" onClick={onAddPhone}>
        DODAJ TELEFON
      </button>

      <SearchBar value={search} onChange={onSearch} />

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
    </div>
  );
}
