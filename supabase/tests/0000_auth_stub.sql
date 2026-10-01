-- Minimal Supabase stand-in so the real migration can run against stock Postgres.
-- Only the surface 0001_init.sql actually touches.

create schema if not exists auth;

create role anon nologin noinherit;
create role authenticated nologin noinherit;

create table auth.users (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- auth.uid() reads GUC "request.jwt.claim.sub" in production. Here the test
-- harness sets that GUC per session, which is exactly how a real request scopes
-- identity.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase's baseline grants table privileges broadly to anon/authenticated and
-- relies on RLS as the actual security boundary. Mirroring that here is
-- deliberate: it means the checks below prove RLS is doing the work, rather
-- than passing accidentally because a table was never granted.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;