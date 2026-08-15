import { useMemo, useState } from 'react';
import { BottomNav, type TabId } from './components/BottomNav';
import { EditFinanceModal } from './components/EditFinanceModal';
import { FinancePanel } from './components/FinancePanel';
import { HistoryList } from './components/HistoryList';
import { MagazynHome } from './components/MagazynHome';
import { ModelDetail } from './components/ModelDetail';
import { MonthlyProfitPanel } from './components/MonthlyProfitPanel';
import { PhoneFormModal } from './components/PhoneFormModal';
import {
  currentYearMonth,
  getMonthlyProfit,
  getPhonesForModel,
  shiftYearMonth,
  sumStockValue,
} from './domain/calculations';
import { useAppStore } from './hooks/useAppStore';
import './App.css';

type MagazynView =
  | { kind: 'home' }
  | { kind: 'model'; modelId: string };

function tabTitle(tab: TabId): string {
  switch (tab) {
    case 'magazyn':
      return 'Magazyn';
    case 'zysk':
      return 'Zysk';
    case 'finanse':
      return 'Finanse';
    case 'historia':
      return 'Historia';
  }
}

function AppShell() {
  const {
    ready,
    state,
    search,
    setSearch,
    filteredSummaries,
    finance,
    addPhone,
    updatePhone,
    removePhone,
    sellPhone,
    setCash,
    setBank,
    error,
    clearError,
  } = useAppStore();

  const [tab, setTab] = useState<TabId>('magazyn');
  const [view, setView] = useState<MagazynView>({ kind: 'home' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [presetModelId, setPresetModelId] = useState<string | null>(null);
  const [editPhoneId, setEditPhoneId] = useState<string | null>(null);
  const [editCashOpen, setEditCashOpen] = useState(false);
  const [editBankOpen, setEditBankOpen] = useState(false);
  const [profitMonth, setProfitMonth] = useState(() => currentYearMonth());

  const sortedModels = useMemo(
    () =>
      [...state.models].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [state.models],
  );

  const activeModel =
    view.kind === 'model'
      ? state.models.find((model) => model.id === view.modelId)
      : undefined;
  const modelPhones = activeModel
    ? getPhonesForModel(state, activeModel.id)
    : [];
  const editPhone = editPhoneId
    ? state.phones.find((phone) => phone.id === editPhoneId)
    : null;

  const monthly = useMemo(
    () => getMonthlyProfit(state, profitMonth),
    [state, profitMonth],
  );

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
          <h1>{tabTitle(tab)}</h1>
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
        {tab === 'magazyn' && view.kind === 'home' ? (
          <MagazynHome
            finance={finance}
            onEditCash={() => setEditCashOpen(true)}
            onEditBank={() => setEditBankOpen(true)}
            search={search}
            onSearch={setSearch}
            summaries={filteredSummaries}
            onOpenModel={(modelId) => setView({ kind: 'model', modelId })}
            onAddPhone={() => {
              setFormMode('add');
              setPresetModelId(null);
              setEditPhoneId(null);
              setFormOpen(true);
            }}
          />
        ) : null}

        {tab === 'magazyn' && view.kind === 'model' && activeModel ? (
          <ModelDetail
            model={activeModel}
            phones={modelPhones}
            stockValue={sumStockValue(modelPhones)}
            onBack={() => setView({ kind: 'home' })}
            onOpenPhone={(phoneId) => {
              setFormMode('edit');
              setEditPhoneId(phoneId);
              setPresetModelId(null);
              setFormOpen(true);
            }}
            onAddPhone={() => {
              setFormMode('add');
              setPresetModelId(activeModel.id);
              setEditPhoneId(null);
              setFormOpen(true);
            }}
          />
        ) : null}

        {tab === 'zysk' ? (
          <MonthlyProfitPanel
            summary={monthly}
            prevMonth={shiftYearMonth(profitMonth, -1)}
            nextMonth={shiftYearMonth(profitMonth, 1)}
            onPrev={() => setProfitMonth(shiftYearMonth(profitMonth, -1))}
            onNext={() => setProfitMonth(shiftYearMonth(profitMonth, 1))}
          />
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

      <BottomNav
        active={tab}
        onChange={(next) => {
          setTab(next);
          if (next === 'magazyn') setView({ kind: 'home' });
        }}
      />

      <PhoneFormModal
        open={formOpen}
        mode={formMode}
        models={sortedModels}
        presetModelId={presetModelId}
        phone={editPhone}
        onClose={() => {
          setFormOpen(false);
          setEditPhoneId(null);
          setPresetModelId(null);
        }}
        onSubmit={(data) => {
          if (formMode === 'edit' && editPhoneId) {
            updatePhone({ phoneId: editPhoneId, ...data });
          } else {
            addPhone(data);
          }
        }}
        onSell={
          formMode === 'edit' && editPhoneId
            ? (data) => {
                sellPhone({ phoneId: editPhoneId, ...data });
                setView(
                  activeModel
                    ? { kind: 'model', modelId: activeModel.id }
                    : { kind: 'home' },
                );
              }
            : undefined
        }
        onDelete={
          formMode === 'edit' && editPhoneId
            ? () => {
                removePhone(editPhoneId);
                setFormOpen(false);
                setEditPhoneId(null);
              }
            : undefined
        }
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
