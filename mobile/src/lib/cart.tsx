import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import {
  addLine,
  changeQuantity,
  removeLine,
  setQuantity,
  type CartLine,
} from './cart-rules';
import { supabase, type Product } from '@/lib/supabase';
import { useSession } from '@/lib/session';

/**
 * The cart, shared between the phone and the website.
 *
 * Ids and quantities only, exactly as on the web: a price is always read from
 * the database at the moment it is shown, and the order total is computed in
 * place_order() rather than sent from here. A stale or tampered client price
 * therefore cannot reach an order, and the two platforms cannot disagree about
 * one.
 *
 * The account cart in Postgres is the authority once there is an account. Local
 * state is the mirror that makes the UI instant and correct offline; every
 * mutation is written locally first and pushed second, and every change arriving
 * from another device overwrites the mirror. Ordering it that way means a slow
 * network never blocks a tap.
 */

type CartAction =
  | { type: 'replace'; lines: CartLine[] }
  | { type: 'add'; productId: string; quantity?: number }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'changeQuantity'; productId: string; delta: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' };

function reducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'replace':
      return action.lines;
    case 'add':
      return addLine(state, action.productId, action.quantity);
    case 'setQuantity':
      return setQuantity(state, action.productId, action.quantity);
    case 'changeQuantity':
      return changeQuantity(state, action.productId, action.delta);
    case 'remove':
      return removeLine(state, action.productId);
    case 'clear':
      return [];
  }
}

type CartValue = {
  lines: CartLine[];
  /** Products behind the lines, priced from the database. */
  priced: PricedLine[];
  count: number;
  subtotalCents: number;
  isEmpty: boolean;
  /** Lines whose quantity now exceeds what is in stock. */
  overStock: PricedLine[];
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  changeQuantity: (productId: string, delta: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export type PricedLine = CartLine & {
  name: string;
  slug: string;
  image_url: string | null;
  unitPriceCents: number;
  stockQuantity: number;
};

const CartContext = createContext<CartValue | null>(null);

/**
 * Make the account cart exactly `lines`.
 *
 * Reconciles with an upsert plus a delete of what went away, rather than
 * clearing and reinserting: clearing would briefly empty the cart for every other
 * device watching it, and would lose it entirely if the app died midway.
 */
async function pushAccountCart(userId: string, lines: CartLine[]): Promise<void> {
  const { data: cart, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (cartError) throw cartError;

  let cartId = (cart?.id as string | undefined) ?? null;

  if (!cartId) {
    const { data: created, error: createError } = await supabase
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single();
    // Losing the race against another device is fine: its row is the right one.
    if (createError) return;
    cartId = created.id as string;
  }

  if (lines.length > 0) {
    const { error } = await supabase.from('cart_items').upsert(
      lines.map((line) => ({
        cart_id: cartId,
        product_id: line.productId,
        quantity: line.quantity,
      })),
      { onConflict: 'cart_id,product_id' },
    );
    if (error) throw error;
  }

  const keep = new Set(lines.map((line) => line.productId));
  const { data: current } = await supabase
    .from('cart_items')
    .select('id, product_id')
    .eq('cart_id', cartId);

  const stale = (current ?? [])
    .filter((row) => !keep.has(row.product_id as string))
    .map((row) => row.id as string);

  if (stale.length > 0) {
    const { error } = await supabase.from('cart_items').delete().in('id', stale);
    if (error) throw error;
  }
}

async function readAccountCart(userId: string): Promise<CartLine[]> {
  const { data, error } = await supabase
    .from('carts')
    .select('id, cart_items(product_id, quantity)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return [];

  const items = (data.cart_items ?? []) as unknown as { product_id: string; quantity: number }[];
  return items.map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [lines, dispatch] = useReducer(reducer, []);
  const [products, setProducts] = useState<Product[]>([]);

  const dispatchPush = useCallback(
    (action: CartAction) => {
      dispatch(action);
      if (!userId) return;
      // Recomputed rather than read from the reducer's argument, so the push
      // always matches the state that dispatch is about to produce.
      const next = reducer(lines, action);
      void pushAccountCart(userId, next).catch((error) => {
        console.error('cart sync failed', error);
      });
    },
    [lines, userId],
  );

  // Account cart is authoritative on sign-in; local state is replaced by it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readAccountCart(userId).then((serverLines) => {
      if (active) dispatch({ type: 'replace', lines: serverLines });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // Live updates from the other device.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`cart:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => {
          void readAccountCart(userId).then((next) =>
            dispatch({ type: 'replace', lines: next }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Products are fetched once and joined against the lines. Prices live here
  // only for display; they are never sent anywhere.
  useEffect(() => {
    let active = true;
    void supabase
      .from('products')
      .select('id, slug, name, description, image_url, price_cents, stock_quantity')
      .order('name')
      .then(({ data }) => {
        if (active && data) setProducts(data as Product[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const priced = useMemo<PricedLine[]>(
    () =>
      lines.flatMap((line) => {
        const product = products.find((candidate) => candidate.id === line.productId);
        if (!product) return [];
        return [
          {
            ...line,
            name: product.name,
            slug: product.slug,
            image_url: product.image_url,
            unitPriceCents: product.price_cents,
            stockQuantity: product.stock_quantity,
          },
        ];
      }),
    [lines, products],
  );

  const value = useMemo<CartValue>(
    () => ({
      lines,
      priced,
      count: lines.reduce((total, line) => total + line.quantity, 0),
      subtotalCents: priced.reduce(
        (total, line) => total + line.unitPriceCents * line.quantity,
        0,
      ),
      isEmpty: lines.length === 0,
      overStock: priced.filter((line) => line.quantity > line.stockQuantity),
      add: (productId, quantity) => dispatchPush({ type: 'add', productId, quantity }),
      setQuantity: (productId, quantity) =>
        dispatchPush({ type: 'setQuantity', productId, quantity }),
      changeQuantity: (productId, delta) =>
        dispatchPush({ type: 'changeQuantity', productId, delta }),
      remove: (productId) => dispatchPush({ type: 'remove', productId }),
      clear: () => dispatchPush({ type: 'clear' }),
    }),
    [lines, priced, dispatchPush],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}

/** Re-exported so screens apply the same rules the web and the database do. */
export { MAX_LINE_QUANTITY } from './cart-rules';
