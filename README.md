# BuySell

A small, deliberately curated storefront. Catalogue, cart, Google sign-in,
checkout, order history, and transactional order creation with email
confirmation.

Built with Next.js 16 (App Router), Supabase (Postgres + Auth), Tailwind CSS v4,
and Mailgun.

## Requirements

- Node.js 20.9+ (developed on 24.x)
- npm 10+
- Docker or a local PostgreSQL 14+ — only needed to run the database tests
- A Supabase project
- A Mailgun sending domain
- Google OAuth credentials, configured in Supabase

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase + Mailgun values
npm run dev
```

The app runs at http://localhost:3000. Without Supabase credentials it renders
a setup screen listing exactly what is missing, rather than a stack trace.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable (anon) key |
| `MAILGUN_API_KEY` | for email | Mailgun sending key |
| `MAILGUN_DOMAIN` | for email | Sending domain, e.g. `mg.example.com` |
| `MAILGUN_FROM_EMAIL` | for email | Verified sender address |
| `NEXT_PUBLIC_SITE_URL` | yes | Public origin, used for OAuth redirects |
| `NEXT_PUBLIC_STORE_NAME` | no | Name shown in the header and emails |

There is deliberately no `SUPABASE_SECRET_KEY` in use. Privileged writes go
through narrow `SECURITY DEFINER` functions scoped to the caller, so no
service-role key is ever needed by the application and cannot leak from it.

## Database setup

Apply the migration, then the catalogue:

```bash
supabase db push
supabase db execute --file supabase/seed.sql
```

Or paste both into the Supabase SQL editor, in order:
`supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.

### Google OAuth

1. In Google Cloud, create an OAuth 2.0 Web client.
2. Add `<NEXT_PUBLIC_SITE_URL>/auth/callback` as an authorised redirect URI.
3. In Supabase → Authentication → Providers → Google, enable it and paste the
   client ID and secret.
4. Set the Site URL in Supabase to your deployed origin.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Schema, RLS, and transaction tests against real Postgres |
| `npm run verify` | `typecheck` + `lint` + `test` + `test:db` |

`npm run test:db` starts a throwaway PostgreSQL container on port 55432, applies
the migrations, and drops it afterwards. It needs Docker.

## How it works

**Pricing is never trusted from the client.** The browser sends product ids and
quantities only. `place_order()` in Postgres reads the current prices, locks the
product rows, checks stock, computes totals, writes the order and its line
items, and decrements inventory — all in one transaction. A failure rolls the
whole thing back, so stock can never be sold twice.

**Order access is enforced by RLS.** The browser talks to Supabase with the
user's own JWT, so `orders` and `order_items` policies return a shopper only
their own orders. Reading somebody else's order reference returns nothing rather
than an error, which avoids confirming that a reference exists.

**Email failures cannot lose an order.** The order commits first. Email is sent
afterwards with a plain `fetch` to the Mailgun API, and success or failure is
recorded on the row. A failed send can be retried from the confirmation page.

**The cart is local, prices are not.** The cart persists to `localStorage` as
ids and quantities and survives sign-in, so authenticating at checkout does not
wipe it. It is cleared only once an order exists. Prices are always read from
the database at render time.

**No payment is taken.** Orders are created as `pending_payment` and the UI
says so plainly.

## Project layout

```
src/app/            routes, layouts, server actions
src/components/     UI, grouped by feature
src/lib/            catalog reads, cart logic, validation, email, Supabase clients
supabase/           migrations, seed data, integration tests
scripts/            database verification harness
```

## Accessibility and design

Keyboard-operable throughout, visible focus rings, labelled form fields with
errors tied to inputs, and a live region for cart updates. Respects
`prefers-reduced-motion`. Verified against a warm stone palette with a single
gold accent, hairline borders, and no gradients or glass effects.

## Deployment

Vercel, with the environment variables from the table above set in the project
settings. The build needs no secrets; Supabase is contacted at runtime.
