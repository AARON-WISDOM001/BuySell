import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  addLine,
  changeQuantity,
  removeLine,
  removedIds,
  setQuantity,
  type CartLine,
} from './cart-rules';
import { cartForSignIn } from './cart-merge';
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
 * Find the caller's cart, creating it on first use.
 *
 * The insert races when the phone and the website both open the account for the
 * first time, so a failed insert is not treated as fatal: the row the other
 * device won is read back and used instead. The phone used to `return` here on
 * any error, which left it permanently unable to sync while still looking
 * correct on screen — every later push repeated the same failing insert.
 */
async function ensureCartId(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    console.log('[DIAG] ensureCartId: existing cart', { userId, cartId: existing.id });
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (!error) {
    console.log('[DIAG] ensureCartId: created cart', { userId, cartId: created.id });
    return created.id as string;
  }

  // Lost the race, or the insert was refused. Read whatever row exists now.
  const { data: raced } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  // This branch used to return silently, which is how a permanently broken sync
  // hid: nothing on screen changed and nothing was logged.
  console.log('[DIAG] ensureCartId: INSERT FAILED', {
    userId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    recoveredCartId: raced ? (raced.id as string) : null,
  });

  return raced ? (raced.id as string) : null;
}

/**
 * Fold this device's changes into the account cart.
 *
 * `lines` are upserted and only `removed` is deleted. This used to delete every
 * server row missing from `lines`, which made the push a wholesale replace: a
 * device holding a stale view — one that had not yet received the website's
 * realtime update — silently erased whatever the website had added. Two devices
 * signed in could therefore only ever hold whichever pushed last, so the cart
 * never converged, it lost items.
 *
 * Deletion is explicit. The caller knows which ids it removed; the server only
 * honours that list.
 *
 * `lines` must be the device's live view of the cart, not a snapshot from an
 * earlier render — see the note on `linesRef` in CartProvider.
 */
async function pushAccountCart(
  userId: string,
  lines: CartLine[],
  removed: string[] = [],
): Promise<void> {
  console.log('[DIAG] push: start', {
    userId,
    lineCount: lines.length,
    lines: lines.map((l) => `${l.productId.slice(0, 8)}x${l.quantity}`).join(','),
    removing: removed.length,
  });

  const cartId = await ensureCartId(userId);
  if (!cartId) throw new Error('Could not open the account cart for this sign-in.');

  if (lines.length > 0) {
    const { error } = await supabase.from('cart_items').upsert(
      lines.map((line) => ({
        cart_id: cartId,
        product_id: line.productId,
        quantity: line.quantity,
      })),
      { onConflict: 'cart_id,product_id' },
    );
    if (error) {
      console.log('[DIAG] push: UPSERT FAILED', {
        cartId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw error;
    }
  }

  if (removed.length > 0) {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)
      .in('product_id', removed);
    if (error) {
      console.log('[DIAG] push: DELETE FAILED', {
        cartId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw error;
    }
  }

  console.log('[DIAG] push: done', { cartId });
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

/**
 * Adopt the account cart, folding in anything this device was already holding.
 *
 * The merge/replace decision itself is `cartForSignIn`, which is pure and tested;
 * this only adds the read.
 */
async function attachAccountCart(
  userId: string,
  deviceLines: CartLine[],
  owner: string | null,
): Promise<CartLine[]> {
  const server = await readAccountCart(userId);
  const merged = cartForSignIn(deviceLines, server, owner, userId);
  console.log('[DIAG] attach', {
    userId,
    owner,
    serverCount: server.length,
    deviceCount: deviceLines.length,
    mergedCount: merged.length,
    replacedNotMerged: owner !== null && owner !== userId,
  });
  return merged;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [lines, dispatch] = useReducer(reducer, []);
  const [products, setProducts] = useState<Product[]>([]);

  /**
   * The cart as this device currently believes it, readable synchronously.
   *
   * A push has to describe the cart as it is *now*, so two taps in the same tick
   * do not both compute from the same pre-tap value and lose the first. Reading
   * `lines` from the render closure meant exactly that. Remote writes and
   * foreground re-reads update this too, so it is the freshest view available.
   *
   * ponytail: a push already in flight can still be overtaken by a tap landing
   * microseconds later; the two converge on the next event. Serialize pushes per
   * cart if that ever shows up as a real conflict.
   */
  const linesRef = useRef<CartLine[]>([]);
  /** Which account the local cart belongs to; kept across sign-out. */
  const ownerRef = useRef<string | null>(null);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  /** Write lines that came from the server: state and the live mirror together. */
  const adopt = useCallback((next: CartLine[]) => {
    linesRef.current = next;
    dispatch({ type: 'replace', lines: next });
  }, []);

  const dispatchPush = useCallback(
    (action: CartAction) => {
      // Computed from the live mirror and written back before dispatching, so a
      // second tap in this same tick builds on the first rather than on the
      // state before it.
      const before = linesRef.current;
      const next = reducer(before, action);
      linesRef.current = next;
      dispatch(action);
      // What this tap took out, and only that, is deleted on the account cart.
      const removed = removedIds(before, next);
      // willPush:false is the "session never established, cart is local-only"
      // case, which looks identical to working sync from the UI alone.
      console.log('[DIAG] action', {
        type: action.type,
        userId,
        willPush: Boolean(userId),
        removing: removed.length,
      });
      if (!userId) return;
      void pushAccountCart(userId, next, removed).catch((error) => {
        console.error('cart sync failed', error);
      });
    },
    [userId],
  );

  // Account cart is authoritative on sign-in, but the device cart folds into it.
  useEffect(() => {
    if (!userId) return;
    let active = true;

    void attachAccountCart(userId, linesRef.current, ownerRef.current).then((merged) => {
      if (!active) return;
      ownerRef.current = userId;
      adopt(merged);
      // Push the merge so the website sees the lines this device brought with it.
      // Nothing is removed: a merge only ever adds.
      void pushAccountCart(userId, merged, []).catch((error) => {
        console.error('cart merge push failed', error);
      });
    });

    return () => {
      active = false;
    };
  }, [userId, adopt]);

  /**
   * Re-read the account cart and adopt it if it genuinely differs.
   *
   * Shared by realtime, the foreground resume and the poll, so all three report
   * which path delivered a change. Only a real difference is adopted: a refresh
   * landing between a tap and its push would otherwise undo the tap.
   */
  const refresh = useCallback(
    (why: string) => {
      if (!userId) return;
      void readAccountCart(userId).then((next) => {
        if (JSON.stringify(next) === JSON.stringify(linesRef.current)) return;
        console.log('[DIAG] refresh', { userId, why, adopted: next.length });
        adopt(next);
      });
    },
    [userId, adopt],
  );

  // Live updates from the other device.
  useEffect(() => {
    if (!userId) return;
    // `carts` as well as `cart_items`: a removal on the website deletes the
    // whole cart, and watching only the items would never report it.
    const channel = supabase
      .channel(`cart:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => refresh('realtime:cart_items'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts' },
        () => refresh('realtime:carts'),
      )
      .subscribe((status, error) => {
        // A realtime channel that never connects is otherwise invisible: the
        // cart still works on this device and simply never hears from the other
        // one. 'CHANNEL_ERROR'/'TIMED_OUT' here is the whole explanation for a
        // cart that syncs in one direction and not the other.
        console.log('[DIAG] realtime', {
          userId,
          status,
          error: error?.message ?? null,
        });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Realtime is best-effort: a phone that was backgrounded through a change can
  // miss the event entirely. Re-reading on return is what guarantees the two
  // devices agree even when a notification was dropped.
  useEffect(() => {
    if (!userId) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh('foreground');
    });

    // Realtime is best-effort and has been observed not to deliver. A short
    // poll while the app is in front makes both directions converge within a
    // few seconds regardless, which is what the cross-platform cart requires.
    // ponytail: 4s forever while foregrounded. Slow it to 15s and add
    // push-notification wakeups if the read quota ever becomes a concern.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') refresh('poll');
    }, 4000);

    return () => {
      subscription.remove();
      clearInterval(poll);
    };
  }, [userId, refresh]);

  // Products are fetched once and joined against the lines. Prices live here
  // only for display; they are never sent anywhere.
  useEffect(() => {
    let active = true;
    void supabase
      .from('products')
      .select('id, slug, name, description, image_url, price_cents, stock_quantity')
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        // A failed catalogue read used to be invisible: `products` stayed empty,
        // every cart line failed to resolve, and the cart rendered as a heading
        // and a zero subtotal with no items in it.
        if (error) {
          console.log('[DIAG] products FAILED', { code: error.code, message: error.message });
          return;
        }
        console.log('[DIAG] products loaded', { count: data?.length ?? 0 });
        setProducts((data ?? []) as Product[]);
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
