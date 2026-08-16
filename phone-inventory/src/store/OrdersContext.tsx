import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StoreOrder } from './types';

const ORDERS_KEY = 'smartfix-store:orders:v1';

interface OrdersContextValue {
  orders: StoreOrder[];
  ready: boolean;
  addOrder: (order: StoreOrder) => void;
  ordersForUser: (userId?: string | null) => StoreOrder[];
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

function loadOrders(): StoreOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoreOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<StoreOrder[]>(() =>
    typeof window !== 'undefined' ? loadOrders() : [],
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrders(loadOrders());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders, ready]);

  const addOrder = useCallback((order: StoreOrder) => {
    setOrders((prev) => [order, ...prev]);
  }, []);

  const ordersForUser = useCallback(
    (userId?: string | null) => {
      if (!userId) return orders;
      return orders.filter((o) => !o.userId || o.userId === userId);
    },
    [orders],
  );

  const value = useMemo(
    () => ({ orders, ready, addOrder, ordersForUser }),
    [orders, ready, addOrder, ordersForUser],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider');
  return ctx;
}
