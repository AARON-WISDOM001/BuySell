-- Integration checks for the schema: pricing integrity, stock guard, RLS
-- isolation. Run by scripts/verify-schema.sh against a real Postgres.
--
-- Note on RLS testing: a denied UPDATE does not raise, it silently affects zero
-- rows. Those assertions use GET DIAGNOSTICS rather than an exception block,
-- otherwise "the row was never touched" would read as a pass for the wrong
-- reason. Genuine permission errors (insert, column-level grants) do raise and
-- are caught explicitly.

\set ON_ERROR_STOP on

create or replace function assert_eq(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got = want then
    raise notice '  PASS  %', label;
  else
    raise exception 'FAIL: % (got %, want %)', label, got, want;
  end if;
end;
$$;

create or replace function assert_rows(label text, n int)
returns void language plpgsql as $$
begin
  if n = 0 then
    raise notice '  PASS  %', label;
  else
    raise exception 'FAIL: % (% rows affected, expected 0)', label, n;
  end if;
end;
$$;

\o /dev/null
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name":"Alice Adams"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   '{"full_name":"Bob Brown"}'::jsonb);

select assert_eq('profile bootstrapped on signup', (select count(*) from public.profiles)::text, 2::text);
select assert_eq('profile name from auth metadata', (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111')::text, 'Alice Adams'::text);

with c(n,sl) as (values ('AudioTest','audio_test'), ('DeskTest','desk_test'))
insert into public.categories (name, slug)
select n,sl from c
where not exists (select 1 from public.categories cx where cx.slug=sl);

insert into public.products (name, slug, description, price_cents, image_url, category_id, stock_quantity, is_featured)
values
  ('Studio Headphones', 'studio-headphones-test', 'Closed-back monitoring headphones.', 24900, '/p/1.jpg', (select id from public.categories where slug='audio_test'), 3, true),
  ('Desk Lamp',         'desk-lamp-test',         'Warm-dim LED task lamp.',        8900, '/p/2.jpg', (select id from public.categories where slug='desk_test'),   1, false);

-- ---------------------------------------------------------------------------
-- place_order: totals are derived from the database, not the caller
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_headphones uuid := (select id from public.products where slug = 'studio-headphones-test');
  v_lamp       uuid := (select id from public.products where slug = 'desk-lamp-test');
begin
  perform public.place_order(
    jsonb_build_array(
      jsonb_build_object('product_id', v_headphones, 'quantity', 2),
      jsonb_build_object('product_id', v_lamp,       'quantity', 1)
    ),
    'alice@example.com', 'Alice Adams', '+15550100',
    '12 Alder Way', 'Portland', 'OR', 'US', 1200
  );
end;
$$;

select assert_eq('order number is a friendly BS- reference', (select order_number like 'BS-%' from public.orders)::text, true::text);
select assert_eq('subtotal computed from product prices (24900*2 + 8900)', (select subtotal_cents from public.orders)::text, 58700::text);
select assert_eq('total = subtotal + shipping', (select total_cents from public.orders)::text, 59900::text);
select assert_eq('order has 2 snapshot items', (select count(*) from public.order_items)::text, 2::text);
select assert_eq('unit price snapshot stored', (select unit_price_cents from public.order_items where product_name = 'Studio Headphones')::text, 24900::text);
select assert_eq('item subtotal snapshot', (select subtotal_cents from public.order_items where product_name = 'Studio Headphones')::text, 49800::text);
select assert_eq('stock decremented (3 -> 1)', (select stock_quantity from public.products where slug = 'studio-headphones-test')::text, 1::text);
select assert_eq('new order defaults to pending_payment', (select status::text from public.orders)::text, 'pending_payment'::text);
select assert_eq('email defaults to pending', (select email_status::text from public.orders)::text, 'pending'::text);

-- ---------------------------------------------------------------------------
-- Stock guard: an oversell must abort the entire order
-- ---------------------------------------------------------------------------
-- The first order took the lamp's only unit, so it is at 0. Requesting 5 must
-- fail without decrementing anything further.
select assert_eq('lamp is out of stock after the first order',
  (select stock_quantity from public.products where slug = 'desk-lamp-test')::text, 0::text);

do $$
declare v_lamp uuid := (select id from public.products where slug = 'desk-lamp-test');
begin
  perform public.place_order(
    jsonb_build_array(jsonb_build_object('product_id', v_lamp, 'quantity', 5)),
    'alice@example.com', 'Alice Adams', null, '12 Alder Way', 'Portland', 'OR', 'US', 0
  );
  raise exception 'FAIL: oversell was allowed';
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'Insufficient stock%' then
      raise notice '  PASS  oversell rejected';
    else
      raise;
    end if;
end;
$$;

select assert_eq('failed order rolled back (still 1 order)', (select count(*) from public.orders)::text, 1::text);
select assert_eq('rejected order did not decrement stock further',
  (select stock_quantity from public.products where slug = 'desk-lamp-test')::text, 0::text);
select assert_eq('rejected order left no orphan order_items',
  (select count(*) from public.order_items)::text, 2::text);

-- Quantity is bounds-checked before stock, so a nonsense quantity reports the
-- range problem rather than a misleading stock problem.
do $$
declare v_lamp uuid := (select id from public.products where slug = 'desk-lamp-test');
begin
  perform public.place_order(
    jsonb_build_array(jsonb_build_object('product_id', v_lamp, 'quantity', 99)),
    'alice@example.com', 'Alice Adams', null, 'a', 'b', 'c', 'US', 0
  );
  raise exception 'FAIL: quantity 99 was allowed';
exception when sqlstate 'P0001' then
  if sqlerrm like 'Quantity out of range%' then
    raise notice '  PASS  quantity ceiling enforced';
  else
    raise;
  end if;
end;
$$;

do $$
begin
  perform public.place_order(
    '[]'::jsonb, 'alice@example.com', 'Alice Adams', null, 'a', 'b', 'c', 'US', 0
  );
  raise exception 'FAIL: empty order was allowed';
exception when sqlstate 'P0001' then
  raise notice '  PASS  empty order rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- Unauthenticated callers
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '';
do $$
declare v_lamp uuid := (select id from public.products where slug = 'desk-lamp-test');
begin
  perform public.place_order(
    jsonb_build_array(jsonb_build_object('product_id', v_lamp, 'quantity', 1)),
    'x@y.com', 'X', null, 'a', 'b', 'c', 'US', 0
  );
  raise exception 'FAIL: anonymous order was allowed';
exception
  when sqlstate '42501' then raise notice '  PASS  anonymous caller rejected';
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS isolation: Bob must not see or touch Alice's data
-- ---------------------------------------------------------------------------
-- The catalog count is recorded while still superuser, then compared after
-- dropping to the authenticated role. Asserting it against itself would pass
-- even if a policy hid every product, which is the exact failure this guards.
select set_config('test.catalog_rows', (select count(*) from public.products)::text, false);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select assert_eq('Bob sees 0 of Alice orders', (select count(*) from public.orders)::text, 0::text);
select assert_eq('Bob sees 0 of Alice order_items', (select count(*) from public.order_items)::text, 0::text);
select assert_eq('Bob reads the whole catalog, not a filtered subset',
  (select count(*) from public.products)::text, current_setting('test.catalog_rows'));
select assert_eq('Bob can read the test products specifically',
  (select count(*) from public.products where slug in ('studio-headphones-test','desk-lamp-test'))::text, 2::text);
select assert_eq('Bob can read his own profile', (select count(*) from public.profiles)::text, 1::text);
select assert_eq('Bob cannot see Alice profile row', (
  select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111')::text, 0::text);

do $$
declare n int;
begin
  update public.orders set total_cents = 1;
  get diagnostics n = row_count;
  perform assert_rows('Bob cannot modify any order total', n);
end;
$$;

do $$
declare n int;
begin
  update public.orders set status = 'fulfilled';
  get diagnostics n = row_count;
  perform assert_rows('Bob cannot change order status', n);
end;
$$;

do $$
declare n int;
begin
  delete from public.orders;
  get diagnostics n = row_count;
  perform assert_rows('Bob cannot delete orders', n);
end;
$$;

do $$
declare n int;
begin
  update public.products set stock_quantity = 99999;
  get diagnostics n = row_count;
  perform assert_rows('Bob cannot mutate stock', n);
end;
$$;

do $$
declare n int;
begin
  update public.profiles set full_name = 'Hacked'
    where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  perform assert_rows('Bob cannot rewrite Alice profile', n);
end;
$$;

do $$
begin
  update public.profiles set email = 'hacker@evil.com'
    where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FAIL: Bob rewrote his own email';
exception when insufficient_privilege then
  raise notice '  PASS  email column is not client-writable';
end;
$$;

do $$
begin
  insert into public.orders (order_number, user_id, customer_email, customer_name, shipping_address, city, state, country, subtotal_cents, total_cents)
  values ('BS-FORGED', '22222222-2222-2222-2222-222222222222', 'b@x.com', 'B', 'a', 'b', 'c', 'US', 1, 1);
  raise exception 'FAIL: Bob forged an order via direct insert';
exception when insufficient_privilege then
  raise notice '  PASS  direct order insert blocked';
end;
$$;

do $$
declare n int;
begin
  update public.profiles set full_name = 'Bob Renamed'
    where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n = 1 then
    raise notice '  PASS  Bob may update his own profile';
  else
    raise exception 'FAIL: Bob could not update his own profile (% rows)', n;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- Email bookkeeping is scoped to the caller's own order
-- ---------------------------------------------------------------------------
-- Run as Alice, who owns the order created above.
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select public.set_order_email_status(
  (select id from public.orders limit 1), true, null
);
select assert_eq('email status recorded as sent',
  (select email_status::text from public.orders)::text, 'sent'::text);
select assert_eq('email_sent_at stamped',
  (select email_sent_at is not null from public.orders)::text, 'true'::text);

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $$
begin
  -- Bob has no orders, so this must be a no-op rather than an error, and must
  -- never reach Alice's row.
  perform public.set_order_email_status(
    (select id from public.orders where user_id = '11111111-1111-1111-1111-111111111111' limit 1),
    false, 'spoofed failure'
  );
end;
$$;

reset role;
select assert_eq('Alice order email status untouched by Bob',
  (select email_status::text from public.orders where customer_email = 'alice@example.com')::text, 'sent'::text);
select assert_eq('email_error not written by Bob',
  (select coalesce(email_error, '') from public.orders where customer_email = 'alice@example.com')::text, ''::text);
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

-- place_order must attribute the order to the caller, not a supplied user id.
-- Restock as the owner first (no client role may touch stock) so Bob has
-- something to actually buy.
reset role;
update public.products set stock_quantity = 5 where slug = 'desk-lamp-test';
set role authenticated;

do $$
declare v_order uuid; v_lamp uuid := (select id from public.products where slug = 'desk-lamp-test');
begin
  v_order := (
    select id from public.place_order(
      jsonb_build_array(jsonb_build_object('product_id', v_lamp, 'quantity', 1)),
      'bob@example.com', 'Bob Brown', null, '1 Elm', 'Austin', 'TX', 'US', 0
    )
  );
end;
$$;

select assert_eq('order is attributed to the authenticated caller', (select user_id from public.orders where customer_email = 'bob@example.com')::text, '22222222-2222-2222-2222-222222222222'::text);
select assert_eq('Bob now sees only his own order', (select count(*) from public.orders)::text, 1::text);

reset role;

select assert_eq('both orders exist in the database',
  (select count(*) from public.orders)::text, 2::text);
select assert_eq('orders are split across the two users',
  (select count(distinct user_id) from public.orders)::text, 2::text);
select assert_eq('Alice order total unchanged by all of the above',
  (select total_cents from public.orders where customer_email = 'alice@example.com')::text, 59900::text);

-- A failure on Bob's own order is recorded, and the raw error is truncated
-- before it reaches the table.
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.set_order_email_status(
  (select id from public.orders where customer_email = 'bob@example.com' limit 1),
  false, repeat('x', 2000)
);
reset role;

select assert_eq('failed email recorded as failed',
  (select email_status::text from public.orders where customer_email = 'bob@example.com'), 'failed');
select assert_eq('raw error string truncated to 500 chars',
  (select length(email_error) from public.orders where customer_email = 'bob@example.com')::text, 500::text);
select assert_eq('email_sent_at left null on failure',
  (select email_sent_at is null from public.orders where customer_email = 'bob@example.com')::text, 'true'::text);

\o
\echo ''
\echo 'All schema checks passed.'