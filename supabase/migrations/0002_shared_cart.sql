-- ---------------------------------------------------------------------------
-- Shared cart — the cross-platform cart for Lesson 3
-- ---------------------------------------------------------------------------
-- Additive only. Creates two new tables and touches no existing table, so no
-- production row is read, rewritten or dropped by this migration.
--
-- The cart is the ONE piece of state that moves to the database. Everything
-- else about the cart is deliberately unchanged:
--
--   * product_id + quantity only, never a price. Prices are joined from
--     products at read time, which is the same rule orders already follows --
--     a stale or tampered client price cannot survive to checkout.
--   * one cart per account (unique user_id), because that is how a shopper
--     thinks about "my cart".
--
-- Authorization mirrors orders exactly: auth.uid() = user_id. A client cannot
-- name another user's cart, because the policy reads the JWT, not the request.

create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  -- Unique, so "get or create my cart" is a race that resolves to one row
  -- rather than two carts appearing from two devices.
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid        not null references public.carts (id) on delete cascade,
  -- cascade, not set null: a line for a deleted product carries no meaning,
  -- and the shopper is better served by the product disappearing than by a
  -- line they cannot check out.
  product_id uuid        not null references public.products (id) on delete cascade,
  -- The database enforces the same ceiling as MAX_LINE_QUANTITY in the app, so
  -- a client bypassing the UI cannot exceed it.
  quantity   integer     not null check (quantity > 0 and quantity <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per product. "Add to cart" twice increments quantity rather than
  -- creating a second line, which is what the UI already implies.
  unique (cart_id, product_id)
);

create index cart_items_cart_id_idx on public.cart_items (cart_id);

create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Unlike orders, carts ARE client-writable: that is the entire point of them.
-- Every policy is scoped to the caller's own cart, so two accounts can never
-- see or touch each other's cart even though both hold the same publishable
-- key. There is no policy for anon: auth.uid() is null there, so no row is
-- reachable and an unauthenticated client cannot read or write any cart.

alter table public.carts     enable row level security;
alter table public.cart_items enable row level security;

create policy "users read own cart"
  on public.carts for select
  using (auth.uid() = user_id);

-- with check is what stops a user creating a cart owned by someone else.
create policy "users create own cart"
  on public.carts for insert
  with check (auth.uid() = user_id);

create policy "users update own cart"
  on public.carts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own cart"
  on public.carts for delete
  using (auth.uid() = user_id);

-- cart_items has no user_id of its own; ownership is reached through the cart.
create policy "users read own cart items"
  on public.cart_items for select
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.user_id = auth.uid()
    )
  );

create policy "users create own cart items"
  on public.cart_items for insert
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.user_id = auth.uid()
    )
  );

create policy "users update own cart items"
  on public.cart_items for update
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.user_id = auth.uid()
    )
  );

create policy "users delete own cart items"
  on public.cart_items for delete
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Both tables are published so a website change reaches the phone and a phone
-- change reaches the website over postgres_changes. RLS is applied per
-- subscriber, so each client only ever receives events for its own cart.
--
-- Guarded because stock Postgres (and therefore scripts/verify-schema.sh) has no
-- supabase_realtime publication. On real Supabase the publication exists and the
-- tables are added.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.carts;
    alter publication supabase_realtime add table public.cart_items;
  end if;
end;
$$;
