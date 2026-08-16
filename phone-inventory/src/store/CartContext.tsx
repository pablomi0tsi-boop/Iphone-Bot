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
  lines: { product: StoreProduct; quantity: number }[];
  itemCount: number;
  productsTotal: number;
  ready: boolean;
  addItem: (productId: string) => boolean;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
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
    let added = false;
    setItems((prev) => {
      if (prev.some((i) => i.productId === productId)) return prev;
      // Each physical unit is unique — quantity is always 1.
      added = true;
      return [...prev, { productId, quantity: 1 }];
    });
    void getStoreProduct(productId).then((product) => {
      if (product) {
        setCatalog((prev) =>
          prev.some((p) => p.id === product.id) ? prev : [...prev, product],
        );
      }
    });
    return added;
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    // Physical units stay at qty 1.
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: 1 } : i,
      ),
    );
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

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const productsTotal = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      lines,
      itemCount,
      productsTotal,
      ready,
      addItem,
      removeItem,
      setQuantity,
      clear,
    }),
    [
      items,
      lines,
      itemCount,
      productsTotal,
      ready,
      addItem,
      removeItem,
      setQuantity,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
