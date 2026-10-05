import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __setServerCartClient, pushServerCart } from '@/lib/cart-server';
import { removedIds, type CartLine } from '@/lib/cart';

/**
 * The shared cart lost products in production because the push was a wholesale
 * replace: every server row missing from the pushing device's lines was deleted,
 * so whichever device pushed last erased the other one's items. These assert the
 * replacement — a push merges, and deletes only ids the caller actually removed.
 */

type Call = { op: string; values?: string[]; rows?: unknown };

/**
 * A stand-in for the Supabase client that records what was asked of it.
 *
 * `items` is what the server already holds, which matters: the old delete-stale
 * pass only fired when the server had a row the pushing device did not, so a fake
 * with an empty server would pass against the very bug these tests exist to catch.
 */
function fakeClient(options: { cart?: { id: string } | null; items?: unknown[] | null }) {
  const calls: Call[] = [];
  const tableData: Record<string, unknown> = {
    carts: options.cart ?? null,
    cart_items: options.items ?? null,
  };

  function makeChain(table: string) {
    const result = () => ({ data: tableData[table], error: null });

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve({ data: { id: 'cart-new' }, error: null }),
      insert: () => chain,
      upsert: (rows: unknown) => {
        calls.push({ op: `${table}.upsert`, rows });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => {
        calls.push({ op: `${table}.delete` });
        return chain;
      },
      in: (_column: string, values: string[]) => {
        calls.push({ op: `${table}.in`, values });
        return Promise.resolve({ data: null, error: null });
      },
      // Thenable so `await supabase.from(t).select().eq()` resolves like the
      // real client's PostgREST builder does.
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  }

  const client = {
    from(table: string) {
      calls.push({ op: `from:${table}` });
      return makeChain(table);
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

function line(productId: string, quantity = 1): CartLine {
  return { productId, quantity };
}

/** Rows the server holds that the pushing device has never seen. */
const FOREIGN_ROWS = [
  { id: 'row-b', product_id: 'b' },
  { id: 'row-c', product_id: 'c' },
];

describe('removedIds', () => {
  it('reports only what the write actually took out', () => {
    expect(removedIds([line('a'), line('b')], [line('a')])).toEqual(['b']);
  });

  it('is empty for a pure quantity change, so a stepper never deletes anything', () => {
    expect(removedIds([line('a', 1)], [line('a', 4)])).toEqual([]);
  });

  it('is empty when the cart gained a line', () => {
    expect(removedIds([line('a')], [line('a'), line('b')])).toEqual([]);
  });

  it('reports every id on clear', () => {
    expect(removedIds([line('a'), line('b')], [])).toEqual(['a', 'b']);
  });

  it('ignores ids the device never had', () => {
    // A stale device knows nothing about what the website added, so it cannot
    // ask for those to be removed even though the server still holds them.
    expect(removedIds([line('a')], [line('a')])).toEqual([]);
  });
});

describe('pushServerCart', () => {
  const cart = { id: 'cart-1' };

  it('upserts the device lines', async () => {
    const { client, calls } = fakeClient({ cart });
    __setServerCartClient(client);

    await pushServerCart('user-1', [line('a', 3)]);

    expect(calls.find((call) => call.op === 'cart_items.upsert')?.rows).toEqual([
      { cart_id: 'cart-1', product_id: 'a', quantity: 3 },
    ]);

    __setServerCartClient(null);
  });

  it('leaves another device’s items alone when nothing was removed', async () => {
    const { client, calls } = fakeClient({ cart, items: FOREIGN_ROWS });
    __setServerCartClient(client);

    await pushServerCart('user-1', [line('a', 3)]);

    // The regression: this used to read every server row and delete the ones
    // absent from `lines`, so a device holding only `a` erased `b` and `c`.
    expect(calls.filter((call) => call.op === 'cart_items.in')).toEqual([]);
    expect(calls.filter((call) => call.op === 'cart_items.delete')).toEqual([]);

    __setServerCartClient(null);
  });

  it('deletes only the product ids it was told were removed', async () => {
    const { client, calls } = fakeClient({ cart, items: FOREIGN_ROWS });
    __setServerCartClient(client);

    await pushServerCart('user-1', [line('a')], ['b']);

    expect(calls.filter((call) => call.op === 'cart_items.in')).toEqual([
      { op: 'cart_items.in', values: ['b'] },
    ]);

    __setServerCartClient(null);
  });

  it('does not touch the server when the cart is emptied but nothing was flagged', async () => {
    const { client, calls } = fakeClient({ cart, items: FOREIGN_ROWS });
    __setServerCartClient(client);

    await pushServerCart('user-1', []);

    expect(calls.filter((call) => call.op.startsWith('cart_items'))).toEqual([]);

    __setServerCartClient(null);
  });
});
