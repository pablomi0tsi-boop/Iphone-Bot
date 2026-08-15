import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createInitialState } from '../domain/defaults';
import {
  filterModelSummaries,
  getFinanceSummary,
  getModelStockSummaries,
  getWarehouseTotals,
} from '../domain/calculations';
import * as ops from '../domain/store';
import type {
  AddPhoneInput,
  AppState,
  SellPhoneInput,
  UpdatePhoneInput,
} from '../domain/types';
import { createDefaultRepository, type InventoryRepository } from '../storage';

interface AppStoreValue {
  ready: boolean;
  state: AppState;
  search: string;
  setSearch: (value: string) => void;
  summaries: ReturnType<typeof getModelStockSummaries>;
  filteredSummaries: ReturnType<typeof getModelStockSummaries>;
  totals: ReturnType<typeof getWarehouseTotals>;
  finance: ReturnType<typeof getFinanceSummary>;
  addPhone: (input: AddPhoneInput) => void;
  updatePhone: (input: UpdatePhoneInput) => void;
  removePhone: (phoneId: string) => void;
  sellPhone: (input: SellPhoneInput) => void;
  setCash: (cash: number) => void;
  setBank: (bank: number) => void;
  refresh: () => void;
  error: string | null;
  clearError: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: InventoryRepository;
}) {
  const repositoryRef = useRef<InventoryRepository | null>(null);
  if (repositoryRef.current === null) {
    repositoryRef.current = repository ?? createDefaultRepository();
  }
  const repo = repositoryRef.current;

  const [state, setState] = useState<AppState>(() => createInitialState());
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const persistGeneration = useRef(0);

  const loadFromRepo = useCallback(async () => {
    try {
      const loaded = await repo.load();
      setState(loaded ?? createInitialState());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nie udało się wczytać danych.';
      setError(message);
      setState(createInitialState());
    } finally {
      setReady(true);
    }
  }, [repo]);

  useEffect(() => {
    void loadFromRepo();
  }, [loadFromRepo]);

  // Pull latest cloud data when returning to the tab (computer ↔ phone sync).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadFromRepo();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadFromRepo]);

  const run = useCallback(
    (fn: (current: AppState) => AppState) => {
      setError(null);
      setState((current) => {
        let next = current;
        try {
          next = fn(current);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Nieznany błąd';
          setError(message);
          return current;
        }

        const generation = ++persistGeneration.current;
        void (async () => {
          try {
            await repo.save(next);
            if (generation !== persistGeneration.current) return;
            // Reload from source of truth so peer devices stay consistent after refresh.
            const fresh = await repo.load();
            if (generation !== persistGeneration.current) return;
            if (fresh) setState(fresh);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Nie udało się zapisać danych.';
            setError(message);
            // Roll back optimistic state on persistence failure.
            void loadFromRepo();
          }
        })();

        return next;
      });
    },
    [repo, loadFromRepo],
  );

  const summaries = useMemo(() => getModelStockSummaries(state), [state]);
  const filteredSummaries = useMemo(
    () => filterModelSummaries(summaries, search),
    [summaries, search],
  );
  const totals = useMemo(() => getWarehouseTotals(state), [state]);
  const finance = useMemo(() => getFinanceSummary(state), [state]);

  const value: AppStoreValue = {
    ready,
    state,
    search,
    setSearch,
    summaries,
    filteredSummaries,
    totals,
    finance,
    addPhone: (input) => run((s) => ops.addPhone(s, input)),
    updatePhone: (input) => run((s) => ops.updatePhone(s, input)),
    removePhone: (phoneId) => run((s) => ops.removePhone(s, phoneId)),
    sellPhone: (input) => run((s) => ops.sellPhone(s, input)),
    setCash: (cash) => run((s) => ops.setCash(s, cash)),
    setBank: (bank) => run((s) => ops.setBank(s, bank)),
    refresh: () => {
      void loadFromRepo();
    },
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
