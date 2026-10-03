'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import type { CartLine } from '@/lib/cart';

/**
 * The account cart in Postgres, and the realtime channel that keeps two devices
 * in step.
 *
 * Only ids and quantities cross this boundary — a price never leaves the
 * database, and the client never sends one. Every read and write goes through
 * the caller's JWT, so RLS decides what this module is even able to see.
 *
 * The browser client uses the publishable key. There is no privileged path here:
 * a cart is the caller's own row, so nothing needs to bypass RLS, and a cart
 * table that needs the secret key to write would mean the policies were wrong.
 */


/** One client for the tab. Creating one per call would spawn a new realtime connection. */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabasePublishableKey } = publicEnv();
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

type ItemRow = { product_id: string; quantity: number };

/**
 * Find the caller's cart, creating it on first use.
 *
 * The insert races when two devices open the account for the first time, so a
 * unique-violation is treated as success: the other device won, and its id is
 * the one we want.
 */
async function ensureCartId(userId: string): Promise<string | null> {
  const supabase = getClient();

  const { data: existing } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (!error) return created.id as string;

  // Lost the race. Read the row the winner created.
  const { data: raced } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  return raced ? (raced.id as string) : null;
}

/** The caller's cart as cart lines. Returns null when there is no cart yet. */
export async function fetchServerCart(userId: string): Promise<CartLine[] | null> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('carts')
    .select('id, cart_items(product_id, quantity)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  const items = (data.cart_items ?? []) as unknown as ItemRow[];
  return items
    .filter((item) => typeof item.product_id === 'string')
    .map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) }));
}

/**
 * Make the account cart exactly `lines`.
 *
 * Reconciles by upserting the lines that were added and deleting the ones that
 * went, rather than clearing and reinserting: a wholesale delete would briefly
 * empty the cart for every other device watching it, and would lose the cart if
 * the tab died midway.
 */
export async function pushServerCart(userId: string, lines: CartLine[]): Promise<void> {
  const cartId = await ensureCartId(userId);
  if (!cartId) return;

  const supabase = getClient();

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

/** Delete the account cart wholesale. Used by the order confirmation page. */
export async function clearServerCart(userId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from('carts').delete().eq('user_id', userId);
  if (error) throw error;
}

/**
 * Report changes to the caller's cart as cart lines.
 *
 * No `filter` is set on purpose. Realtime applies the caller's RLS policies to
 * postgres_changes, so the cart_items policies already scope the stream to the
 * caller's own cart — filtering by cart_id here would be a second, weaker copy
 * of the same rule, and would silently drop every event if the cart had not
 * been created yet.
 *
 * Subscribing to both tables is what makes a removal on one device disappear on
 * the other: `cart_items` alone would broadcast additions but not the deletes
 * that emptying a cart produces.
 *
 * Each event triggers a re-read rather than applying the payload, because a
 * delete event carries only the row id and an update can arrive out of order
 * against the insert it supersedes.
 */
export function subscribeServerCart(
  userId: string,
  onChange: (lines: CartLine[]) => void,
): () => void {
  const supabase = getClient();
  const refresh = () => {
    void fetchServerCart(userId).then((lines) => lines && onChange(lines));
  };

  const channel = supabase
    .channel(`cart:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cart_items' },
      refresh,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'carts' },
      refresh,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
