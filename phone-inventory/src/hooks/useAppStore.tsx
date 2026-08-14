import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createInitialState } from '../domain/defaults';
import {
  filterModelSummaries,
  getFinanceSummary,
  getModelStockSummaries,
} from '../domain/calculations';
import * as ops from '../domain/store';
import type {
  AddModelInput,
  AddPhoneInput,
  AppState,
  SellPhoneInput,
} from '../domain/types';
import { createDefaultRepository, type InventoryRepository } from '../storage';

interface AppStoreValue {
  ready: boolean;
  state: AppState;
  search: string;
  setSearch: (value: string) => void;
  summaries: ReturnType<typeof getModelStockSummaries>;
  filteredSummaries: ReturnType<typeof getModelStockSummaries>;
  finance: ReturnType<typeof getFinanceSummary>;
  addModel: (input: AddModelInput) => void;
  addPhone: (input: AddPhoneInput) => void;
  incrementStock: (modelId: string, purchasePrice: number) => void;
  decrementStock: (modelId: string) => void;
  sellPhone: (input: SellPhoneInput) => void;
  setCash: (cash: number) => void;
  setBank: (bank: number) => void;
  error: string | null;
  clearError: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({
  children,
  repository = createDefaultRepository(),
}: {
  children: ReactNode;
  repository?: InventoryRepository;
}) {
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await repository.load();
        if (!cancelled) {
          setState(loaded ?? createInitialState());
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setState(createInitialState());
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    if (!ready) return;
    void repository.save(state);
  }, [ready, repository, state]);

  const run = useCallback((fn: (current: AppState) => AppState) => {
    setError(null);
    setState((current) => {
      try {
        return fn(current);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Nieznany błąd';
        setError(message);
        return current;
      }
    });
  }, []);

  const summaries = useMemo(() => getModelStockSummaries(state), [state]);
  const filteredSummaries = useMemo(
    () => filterModelSummaries(summaries, search),
    [summaries, search],
  );
  const finance = useMemo(() => getFinanceSummary(state), [state]);

  const value: AppStoreValue = {
    ready,
    state,
    search,
    setSearch,
    summaries,
    filteredSummaries,
    finance,
    addModel: (input) => run((s) => ops.addModel(s, input)),
    addPhone: (input) => run((s) => ops.addPhone(s, input)),
    incrementStock: (modelId, purchasePrice) =>
      run((s) => ops.incrementStock(s, modelId, purchasePrice)),
    decrementStock: (modelId) => run((s) => ops.decrementStock(s, modelId)),
    sellPhone: (input) => run((s) => ops.sellPhone(s, input)),
    setCash: (cash) => run((s) => ops.setCash(s, cash)),
    setBank: (bank) => run((s) => ops.setBank(s, bank)),
    error,
    clearError: () => setError(null),
  };

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return ctx;
}
