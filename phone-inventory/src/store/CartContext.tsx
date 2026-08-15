import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getStoreProduct, listStoreProducts } from './catalog';
import type { CartItem, StoreProduct } from './types';

const CART_KEY = 'smartfix-store:cart:v1';

interface CartContextValue {
  items: CartItem[];
  /** Resolved products for cart rows (missing ids are dropped). */
  lines: { product: StoreProduct; quantity: number }[];
  itemCount: number;
  total: number;
  ready: boolean;
  addItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.productId === 'string' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    typeof window !== 'undefined' ? loadCart() : [],
  );
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listStoreProducts().then((products) => {
      if (!cancelled) {
        setCatalog(products);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((productId: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      // Each physical unit is unique — quantity stays 1.
      if (existing) return prev;
      return [...prev, { productId, quantity: 1 }];
    });
    void getStoreProduct(productId);
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const lines = useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    return items
      .map((item) => {
        const product = byId.get(item.productId);
        if (!product) return null;
        return { product, quantity: item.quantity };
      })
      .filter((line): line is { product: StoreProduct; quantity: number } =>
        Boolean(line),
      );
  }, [items, catalog]);

  const itemCount = lines.length;
  const total = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      lines,
      itemCount,
      total,
      ready,
      addItem,
      removeItem,
      clear,
    }),
    [items, lines, itemCount, total, ready, addItem, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
