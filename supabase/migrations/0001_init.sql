-- BuySell — initial schema
-- Money is stored in integer minor units (cents). Never floats.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.order_status as enum (
  'pending_payment',  -- order placed, no payment collected (see README: PAYMENT SCOPE)
  'processing',
  'fulfilled',
  'cancelled'
);

-- Email delivery is tracked on the order so a failed send can be retried later
-- without ever needing to create a second order.
create type public.email_status as enum ('pending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.categories (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  slug            text        not null unique,
  description     text        not null default '',
  price_cents     integer     not null check (price_cents >= 0),
  image_url       text        not null,
  category_id     uuid        references public.categories (id) on delete set null,
  stock_quantity  integer     not null default 0 check (stock_quantity >= 0),
  is_featured     boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
create index products_is_featured_idx  on public.products (is_featured);

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  -- Human-facing reference. The uuid is never shown to a customer.
  order_number    text        not null unique,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  customer_email  text        not null,
  customer_name   text        not null,
  phone           text,
  shipping_address text       not null,
  city            text        not null,
  state           text        not null,
  country         text        not null,
  subtotal_cents  integer     not null check (subtotal_cents >= 0),
  shipping_cents  integer     not null default 0 check (shipping_cents >= 0),
  total_cents     integer     not null check (total_cents >= 0),
  status          public.order_status not null default 'pending_payment',
  email_status    public.email_status not null default 'pending',
  email_sent_at   timestamptz,
  email_error     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index orders_user_id_created_at_idx on public.orders (user_id, created_at desc);

-- product_name / unit_price_cents are a deliberate snapshot so a historical
-- order stays accurate after the product is renamed or repriced.
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid        not null references public.orders (id) on delete cascade,
  product_id      uuid        references public.products (id) on delete set null,
  product_name    text        not null,
  quantity        integer     not null check (quantity > 0),
  unit_price_cents integer    not null check (unit_price_cents >= 0),
  subtotal_cents  integer     not null check (subtotal_cents >= 0)
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The catalog is public to read; everything else is owner-scoped.
-- There are deliberately NO client insert/update/delete policies on orders or
-- order_items — orders are only creatable through place_order() below, which
-- runs as the table owner and bypasses RLS. A client cannot forge an order.

alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Public catalog reads -------------------------------------------------------
create policy "categories are public to read"
  on public.categories for select
  using (true);

create policy "products are public to read"
  on public.products for select
  using (true);

-- Profiles: own row only ----------------------------------------------------
create policy "users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- full_name / avatar_url are the only self-editable columns. Column-level
-- grants mean a client cannot rewrite its own email or id even on its own row,
-- because RLS alone only controls which rows are reachable, not which columns.
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- Orders: own rows only ------------------------------------------------------
create policy "users read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

-- Order items: readable only through an order the caller owns ----------------
create policy "users read own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- New-user profile bootstrap
-- ---------------------------------------------------------------------------
-- Creates the profile row from the verified Supabase auth metadata so the
-- account page has a name and avatar without a client-side write.

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- place_order — the single source of truth for order creation
-- ---------------------------------------------------------------------------
-- Runs in one transaction. Prices are read from products here, never from the
-- caller. Stock is decremented atomically with a guard, so two concurrent
-- checkouts for the last unit cannot both succeed.

create function public.place_order(
  p_items jsonb,
  p_customer_email text,
  p_customer_name  text,
  p_phone          text,
  p_shipping_address text,
  p_city           text,
  p_state          text,
  p_country        text,
  p_shipping_cents integer default 0
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order   public.orders;
  v_item    jsonb;
  v_product public.products;
  v_qty     integer;
  v_subtotal integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  -- Insert the order shell so order_items has something to reference.
  insert into public.orders (
    order_number, user_id, customer_email, customer_name, phone,
    shipping_address, city, state, country,
    subtotal_cents, shipping_cents, total_cents
  )
  values (
    'BS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_user_id, p_customer_email, p_customer_name, p_phone,
    p_shipping_address, p_city, p_state, p_country,
    0, p_shipping_cents, p_shipping_cents
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 10 then
      raise exception 'Quantity out of range for product %', v_item ->> 'product_id';
    end if;

    -- Lock the row for the duration of the transaction.
    select * into v_product
      from public.products
      where id = (v_item ->> 'product_id')::uuid
      for update;

    if not found then
      raise exception 'Product % does not exist', v_item ->> 'product_id';
    end if;

    if v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for %: % requested, % available',
        v_product.name, v_qty, v_product.stock_quantity;
    end if;

    v_subtotal := v_subtotal + (v_product.price_cents * v_qty);

    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents
    )
    values (
      v_order.id, v_product.id, v_product.name, v_qty,
      v_product.price_cents, v_product.price_cents * v_qty
    );

    -- Guarded decrement. The WHERE clause re-checks stock, so this is safe even
    -- though the row above is already locked.
    update public.products
      set stock_quantity = stock_quantity - v_qty
      where id = v_product.id
      and stock_quantity >= v_qty;

    if not found then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;
  end loop;

  -- Recompute from the database-derived subtotal. The caller's numbers are ignored.
  update public.orders
    set subtotal_cents = v_subtotal,
        total_cents    = v_subtotal + p_shipping_cents
    where id = v_order.id
    returning * into v_order;

  return v_order;
end;
$$;

-- Only authenticated users may call this, and only on their own behalf
-- (v_user_id comes from auth.uid(), never from a parameter).
revoke execute on function public.place_order(jsonb, text, text, text, text, text, text, text, integer)
  from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- set_order_email_status — post-order email bookkeeping
-- ---------------------------------------------------------------------------
-- After an order is committed we need to record whether the confirmation email
-- was delivered. That write cannot go through the client RLS policies (which
-- deliberately allow no order updates at all), and doing it with the Supabase
-- secret key would hand the application a credential that bypasses RLS
-- everywhere.
--
-- A narrow SECURITY DEFINER function keeps the blast radius to this one
-- statement, scoped to the caller's own order. It also means this app never
-- needs SUPABASE_SECRET_KEY at all.
--
-- p_error is truncated: it is written to the orders table and surfaced in
-- logs, and a raw Mailgun response could otherwise be arbitrarily long.

create function public.set_order_email_status(
  p_order_id uuid,
  p_sent     boolean,
  p_error    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
    set email_status  = case when p_sent then 'sent'::public.email_status else 'failed'::public.email_status end,
        email_sent_at = case when p_sent then now() else null end,
        email_error   = case when p_sent then null else left(p_error, 500) end
    where id = p_order_id
      and user_id = auth.uid();
end;
$$;

revoke execute on function public.set_order_email_status(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_order_email_status(uuid, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Product image storage
-- ---------------------------------------------------------------------------
-- Products are publicly readable. If you add Supabase Storage buckets later,
-- create a read-only public bucket named `product-images` and store paths in
-- products.image_url. The storefront renders via next/image with a
-- remotePatterns allowlist rather than embedding public bucket URLs directly.