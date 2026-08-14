import { useMemo, useState } from 'react';
import { AddModelModal } from './components/AddModelModal';
import { AddPhoneModal } from './components/AddPhoneModal';
import { BottomNav, type TabId } from './components/BottomNav';
import { EditFinanceModal } from './components/EditFinanceModal';
import { FinancePanel } from './components/FinancePanel';
import { HistoryList } from './components/HistoryList';
import { ModelCard } from './components/ModelCard';
import { SearchBar } from './components/SearchBar';
import { SellPhoneModal } from './components/SellPhoneModal';
import { useAppStore } from './hooks/useAppStore';
import './App.css';

function AppShell() {
  const {
    ready,
    state,
    search,
    setSearch,
    filteredSummaries,
    finance,
    addModel,
    addPhone,
    decrementStock,
    sellPhone,
    setCash,
    setBank,
    error,
    clearError,
  } = useAppStore();

  const [tab, setTab] = useState<TabId>('magazyn');
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [presetModelId, setPresetModelId] = useState<string | null>(null);
  const [sellModelId, setSellModelId] = useState<string | null>(null);
  const [editCashOpen, setEditCashOpen] = useState(false);
  const [editBankOpen, setEditBankOpen] = useState(false);

  const sortedModels = useMemo(
    () =>
      [...state.models].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [state.models],
  );

  const sellModel = state.models.find((model) => model.id === sellModelId);
  const sellPhones = sellModelId
    ? state.phones.filter((phone) => phone.modelId === sellModelId)
    : [];

  if (!ready) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Ładowanie magazynu…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Phone Inventory</p>
          <h1>Magazyn</h1>
        </div>
        <div className="header-stats">
          <span>{finance.phoneValue.toLocaleString('pl-PL')} zł</span>
          <small>wartość telefonów</small>
        </div>
      </header>

      {error ? (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Zamknij">
            ✕
          </button>
        </div>
      ) : null}

      <main className="app-main">
        {tab === 'magazyn' ? (
          <>
            <FinancePanel
              finance={finance}
              compact
              onEditCash={() => setEditCashOpen(true)}
              onEditBank={() => setEditBankOpen(true)}
            />
            <SearchBar value={search} onChange={setSearch} />
            <div className="action-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setPresetModelId(null);
                  setAddPhoneOpen(true);
                }}
              >
                + Dodaj telefon
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAddModelOpen(true)}
              >
                + Model
              </button>
            </div>
            <div className="model-list">
              {filteredSummaries.length === 0 ? (
                <p className="empty-hint">Brak modeli pasujących do wyszukiwania.</p>
              ) : (
                filteredSummaries.map((summary) => (
                  <ModelCard
                    key={summary.model.id}
                    summary={summary}
                    onIncrement={() => {
                      setPresetModelId(summary.model.id);
                      setAddPhoneOpen(true);
                    }}
                    onDecrement={() => decrementStock(summary.model.id)}
                    onSell={() => setSellModelId(summary.model.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : null}

        {tab === 'finanse' ? (
          <FinancePanel
            finance={finance}
            onEditCash={() => setEditCashOpen(true)}
            onEditBank={() => setEditBankOpen(true)}
          />
        ) : null}

        {tab === 'historia' ? (
          <HistoryList entries={state.history} />
        ) : null}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      <AddPhoneModal
        open={addPhoneOpen}
        onClose={() => {
          setAddPhoneOpen(false);
          setPresetModelId(null);
        }}
        models={sortedModels}
        presetModelId={presetModelId}
        onSubmit={(data) => addPhone(data)}
      />

      <AddModelModal
        open={addModelOpen}
        onClose={() => setAddModelOpen(false)}
        onSubmit={(name) => addModel({ name })}
      />

      <SellPhoneModal
        open={Boolean(sellModelId)}
        onClose={() => setSellModelId(null)}
        phones={sellPhones}
        modelName={sellModel?.name ?? ''}
        onSubmit={(data) => sellPhone(data)}
      />

      <EditFinanceModal
        open={editCashOpen}
        title="Gotówka"
        label="Stan gotówki (zł)"
        value={finance.cash}
        onClose={() => setEditCashOpen(false)}
        onSubmit={setCash}
      />

      <EditFinanceModal
        open={editBankOpen}
        title="Stan konta"
        label="Stan konta (zł)"
        value={finance.bank}
        onClose={() => setEditBankOpen(false)}
        onSubmit={setBank}
      />
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
