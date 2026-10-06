-- ---------------------------------------------------------------------------
-- Explicit Data API grants
-- ---------------------------------------------------------------------------
-- Supabase changelog 45329 (2026-04-28): from 2026-10-30 new tables in the
-- public schema are NOT granted to anon/authenticated automatically, which is
-- what makes them visible to PostgREST. Existing grants are left alone, so the
-- live project keeps working -- but a project rebuilt from these migrations
-- after that date would create tables the Data API returns PGRST205 for, and
-- every read would fail with "Could not find the table in the schema cache".
--
-- Grants and RLS are separate layers: the grant says the Data API may see the
-- table, the policy decides which rows survive. Granting to anon does not make
-- a row readable -- carts, orders and profiles still return zero rows for
-- anon, which supabase/tests/schema_test.sql asserts.
--
-- profiles is deliberately NOT given a table-level update here. 0001_init.sql
-- revokes it and re-grants only (full_name, avatar_url), because RLS governs
-- which rows are reachable while column grants govern which columns are
-- writable. A table-level update would let a client rewrite its own email and
-- id, which schema_test.sql:230 rejects.
--
-- Idempotent, so re-running it on the live project changes nothing.

grant select, insert, update, delete
  on public.products, public.categories,
       public.carts, public.cart_items,
       public.orders, public.order_items
  to anon, authenticated;

grant select, insert, delete on public.profiles to anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
