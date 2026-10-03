# AGENTS.md

Guidance for AI agents and humans working in this repository.

## Project

BuySell — a small curated storefront: catalogue, cart, Google sign-in, checkout,
order history, and order creation with email confirmation. Next.js 16 App
Router, Supabase (Postgres + Auth), Tailwind CSS v4, Mailgun, Vitest.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest
npm run test:db      # schema/RLS tests, needs Docker
npm run verify       # typecheck + lint + test + test:db
```

Run `npm run verify` before claiming anything works. It needs Docker for the
database half; without it, run the other three individually and say so.

The phone app is a separate project with its own toolchain. It is excluded from
the root `tsconfig.json` and `eslint.config.mjs`, and has its own gates:

```bash
cd mobile
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint (eslint-config-expo)
npx expo-doctor      # dependency and config sanity
npx expo start       # dev server
```

Google OAuth in the app **requires a development build** (`npx expo run:ios` /
`run:android`, or an EAS build). Expo Go cannot: it installs one fixed app
scheme, so the authorization code has no `buysell://` URL to return to.

## Layout

```
src/app/            routes, layouts, server actions ("use server")
src/components/     UI grouped by feature (ui/, cart/, checkout/, product/, nav/)
src/lib/            catalog reads, cart logic, validation, email, Supabase clients
supabase/
  migrations/       schema, applied in order
  seed.sql          catalogue, idempotent, safe to re-run
  tests/            integration tests against real Postgres
scripts/            verify-schema.sh, the database harness
mobile/src/app/     Expo Router routes; every file is a screen
mobile/src/lib/     session, cart store, Supabase client, design tokens
```

## Architecture rules

These are load-bearing. Breaking one is a security or correctness bug, not a
style choice.

1. **Never trust prices from the client.** Accept product ids and quantities
   only. All arithmetic belongs in `place_order()` in Postgres, inside the
   transaction that locks the product rows, checks stock, and writes the order.

2. **Derive identity from the session.** `user_id` comes from the caller's JWT
   via `auth.uid()`. Never accept a user id as an action parameter.

3. **RLS is the authorization boundary.** Pages use `requireUser()` for a
   friendly redirect; RLS is what actually prevents cross-account reads. Do not
   filter by `user_id` in application code and assume that is the protection —
   it implies the query could return someone else's rows.

4. **No `SUPABASE_SECRET_KEY` in application code.** Privileged writes go
   through narrow `SECURITY DEFINER` functions scoped to the caller. If you find
   yourself wanting the secret key, the design needs a scoped function instead.

5. **Never read cookies to write them.** Session refresh lives in
   `src/proxy.ts` because Server Components get read-only cookies. That file is
   not an authorization boundary and must not be trusted to protect a route.

6. **A `"use server"` module may only export async functions.** Exporting a type
   is fine (it is erased). Exporting a value, such as a `useActionState`
   initial state object, is a build error — put it in `src/lib/`.

7. **Clear the cart only after an order exists.** The cart is localStorage ids
   and quantities; it survives sign-in on purpose. Orders clear it explicitly.

## Supabase conventions

- Use `createClient()` from `src/lib/supabase/server.ts` — it carries the
  caller's JWT, so RLS applies. Never construct a client with a secret key.
- Server Components, Server Actions, and Route Handlers all use it. The browser
  uses `src/lib/supabase/client.ts` for direct reads only, and only where RLS
  already permits it.
- Money is integer cents everywhere, including the database. No floats.
- RLS tests assert on rows-affected, not on exceptions: a denied update silently
  affects zero rows rather than raising.

## Design

Minimalism and Swiss style: warm stone palette, one gold accent, hairline
borders, near-square corners, no gradients, no glassmorphism, no large radii.
Motion is 200–250ms and respects `prefers-reduced-motion`.

The colour tokens in `src/app/globals.css` are the source of truth. Do not
hardcode hex values in components — use the `bg-surface`, `text-ink-soft`,
`border-line` style utilities.

## Conventions

- TypeScript strict. No `any` in new code; no non-null assertions to silence the
  compiler.
- Server Actions validate input with Zod at the boundary. Anything from
  `FormData` or the client is untrusted.
- Errors shown to a shopper are actionable. Log the raw detail server-side,
  translate for the UI.
- Comments explain *why*, not what. Do not narrate the code.
- Prefer the platform: native `<input>` over a picker library, `fetch` over an
  SDK, CSS over JavaScript. Do not add a dependency for something a few lines
  can do.

## Testing

Pure logic goes in `src/lib/__tests__` with Vitest. Anything involving RLS,
transactions, or stock goes in `supabase/tests/schema_test.sql`, which runs
against a real PostgreSQL container — a mocked Postgres cannot prove that a
policy denies a row.

## Before you finish

`npm run verify` passes, `npm run build` passes, and no secret is staged. Then
say what you verified and what you did not.
