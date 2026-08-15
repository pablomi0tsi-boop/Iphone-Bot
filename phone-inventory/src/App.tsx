import { useMemo, useState } from 'react';
import { BottomNav, type TabId } from './components/BottomNav';
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

function AppShell() {
  const {
    ready,
    state,
    search,
    setSearch,
    filteredSummaries,
    totals,
    addPhone,
    updatePhone,
    removePhone,
    sellPhone,
    error,
    clearError,
  } = useAppStore();

  const [tab, setTab] = useState<TabId>('magazyn');
  const [view, setView] = useState<MagazynView>({ kind: 'home' });
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [presetModelId, setPresetModelId] = useState<string | null>(null);
  const [editPhoneId, setEditPhoneId] = useState<string | null>(null);
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
            phoneCount={totals.phoneCount}
            stockValue={totals.stockValue}
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
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
