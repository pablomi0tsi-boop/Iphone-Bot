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
  addPhone: (input: AddPhoneInput) => void;
  updatePhone: (input: UpdatePhoneInput) => void;
  removePhone: (phoneId: string) => void;
  sellPhone: (input: SellPhoneInput) => void;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await repo.load();
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
  }, [repo]);

  useEffect(() => {
    if (!ready) return;
    void repo.save(state);
  }, [ready, repo, state]);

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
  const totals = useMemo(() => getWarehouseTotals(state), [state]);

  const value: AppStoreValue = {
    ready,
    state,
    search,
    setSearch,
    summaries,
    filteredSummaries,
    totals,
    addPhone: (input) => run((s) => ops.addPhone(s, input)),
    updatePhone: (input) => run((s) => ops.updatePhone(s, input)),
    removePhone: (phoneId) => run((s) => ops.removePhone(s, phoneId)),
    sellPhone: (input) => run((s) => ops.sellPhone(s, input)),
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
