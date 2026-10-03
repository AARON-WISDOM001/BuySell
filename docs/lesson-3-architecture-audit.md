# BuySell — Architecture Audit for Lesson 3 (Mobile App)

**Status:** discovery only. No production code, schema, or configuration was modified
to produce this document.

**Headline finding:** requirements 2, 3 and 5 (cross-platform cart) **cannot be built
on the current architecture**. The cart is `localStorage` on the shopper's device and
the database contains no cart table at all — the word "cart" does not appear anywhere
in the schema. There is no shared cart to sync *with*. This is a missing data model, not
a configuration gap.

Requirement 1 (shared login) is the good news: Supabase Auth is fully reusable and
Google sign-in works from any client.

---

## 1. Authentication

| Question | Answer |
|---|---|
| Supabase Auth? | **Yes** — `@supabase/supabase-js` + `@supabase/ssr` |
| Sign-in method | **Google OAuth only** (`src/app/actions/auth.ts:27`) |
| Session storage | **HTTP cookies** via `@supabase/ssr` — *not* localStorage |
| User ID access | `auth.uid()` in Postgres; `supabase.auth.getUser()` in TypeScript |

**How sign-in works.** `signInWithGoogle()` calls
`supabase.auth.signInWithOAuth({ provider: 'google' })` and redirects to the URL
Supabase returns. Supabase owns the entire token exchange — Google tokens are never
handled by this app. Google returns to `/auth/callback?code=...`
(`src/app/auth/callback/route.ts`), which calls `exchangeCodeForSession(code)` to
complete the cookie session. `signOut()` is at `src/app/actions/auth.ts:54`.

**Session mechanics.** `createServerClient` in `src/lib/supabase/server.ts:16` reads
and writes cookies. `src/proxy.ts` (Next 16's renamed middleware) is the only place that
can refresh an expiring session, because Server Components get read-only cookies. It
calls `auth.getUser()`, which revalidates the JWT against the auth server rather than
decoding it, so a revoked token cannot ride in on a stale cookie.

**User ID.** Two paths that must not be confused:

- TypeScript — `getUser()` / `requireUser()` in `src/lib/supabase/server.ts:43,52`.
  Returns a `User` or redirects to `/login`.
- Postgres — `auth.uid()`, used inside `place_order()`
  (`supabase/migrations/0001_init.sql:223`) and in every RLS policy.

`requireUser()` is a friendly redirect only. **RLS is the actual authorization
boundary** — a user ID is never accepted as a function parameter anywhere in the
codebase.

**What the mobile app needs to authenticate against:** the same Supabase project via
the publishable key, using `@supabase/supabase-js` with an explicit storage adapter
(`AsyncStorage` or `expo-secure-store`). Requirements 2 and 3 need no new auth work;
requirement 1 is essentially free.

**One real gotcha:** the Google OAuth redirect allowlist is configured for web only. A
React Native app receives the OAuth redirect through `expo-auth-session` /
`WebBrowser`, so **an additional redirect URI must be registered** in Supabase →
Authentication → URL Configuration, or Google sign-in will fail on device. Also,
`createBrowserClient` from `@supabase/ssr` is web-specific and will not run in React
Native.

---

## 2. API / data access

**There is no REST API.** There is no `src/app/api/` directory. All data access is
either a **Server Component function** (called directly, no HTTP) or a **Server
Action** (`'use server'`, invoked as a function). The only HTTP routes are
`/auth/callback` (GET) and static assets.

**This is a blocker.** Server Actions are an internal Next.js RPC protocol, not a
public API. A React Native app cannot call them.

| Domain | Location | Kind | Params | Returns | Auth |
|---|---|---|---|---|---|
| Products (list) | `src/lib/catalog.ts:101` `getProducts` | Server fn | `CatalogFilters { search?, category?, sort? }` | `Product[]` | Public |
| Products (featured) | `src/lib/catalog.ts:144` `getFeaturedProducts` | Server fn | `limit = 4` | `Product[]` | Public |
| Product detail | `src/lib/catalog.ts:157` `getProductBySlug` | Server fn | `slug: string` | `Product \| null` | Public |
| Related products | `src/lib/catalog.ts:187` `getRelatedProducts` | Server fn | `product, limit` | `Product[]` | Public |
| Products by ids | `src/lib/catalog.ts:207` `getProductsByIds` | Server fn | `ids: string[]` | `Map<string, Product>` | Public |
| Categories | `src/lib/catalog.ts:169` `getCategories` | Server fn | — | `Category[]` | Public |
| **Cart pricing** | `src/app/actions/cart.ts:37` `priceCartAction` | **Server Action** | `CartLine[]` | `PricedCartResponse` | **None** |
| Sign in (Google) | `src/app/actions/auth.ts:27` | **Server Action** | `FormData` | redirect | Public |
| Sign out | `src/app/actions/auth.ts:54` | **Server Action** | — | redirect | Required |
| OAuth callback | `src/app/auth/callback/route.ts` | **HTTP GET** | `?code&next` | 302 | Public |
| Place order | `src/app/actions/orders.ts:57` `placeOrder` | **Server Action** | `FormData` | redirect / errors | Required |
| Resend email | `src/app/actions/orders.ts:238` | **Server Action** | `FormData` | void | Required |
| Update profile | `src/app/actions/profile.ts:22` | **Server Action** | `FormData` | state object | Required |
| Order history | `src/app/account/page.tsx` | Server Component | — | `Order[]` | Required (`requireUser`) |
| Order detail | `src/app/order/[orderNumber]/page.tsx` | Server Component | `orderNumber` | `Order` | Required |

**`Product`** (`src/lib/catalog.ts:13`): `id, name, slug, description, priceCents,
imageUrl, categoryId, categoryName, categorySlug, stockQuantity, isFeatured`.
**`Category`**: `id, name, slug`.

**`PricedCartResponse`** (`src/app/actions/cart.ts:19`): `{ lines: PricedLine[],
unavailable: string[], subtotalCents, totalUnits, overStock: string[] }`.
**`PricedLine`**: `{ productId, name, slug, imageUrl, unitPriceCents, quantity,
stockQuantity }`.

**Two DB functions are directly RPC-callable** — the one genuine asset here. A mobile
client can call these today over PostgREST because they are real database functions,
not Server Actions:

- **`place_order`** (`0001_init.sql:206`) — `SECURITY DEFINER`. Takes `p_items jsonb,
  p_customer_email, p_customer_name, p_phone, p_shipping_address, p_city, p_state,
  p_country, p_shipping_cents`; returns `public.orders`. Prices and stock are read
  inside the transaction; `user_id` comes from `auth.uid()`, never a parameter.
- **`set_order_email_status`** (`0001_init.sql:330`) — `SECURITY DEFINER`, scoped to
  the caller's own order.

**Not mobile-callable:** everything in `src/app/actions/*`. A mobile app must talk to
Supabase **directly** for catalog reads (RLS already permits public `select` on
`products` and `categories`), and either call `place_order` via RPC or go through a new
server endpoint.

---

## 3. Cart architecture

### The cart is local-only. Explicitly: **there is no server-side cart.**

| Question | Answer |
|---|---|
| Primary store | **`localStorage`, key `buysell.cart.v1`** |
| React mechanism | `useSyncExternalStore` external store (`src/lib/cart-storage.ts`) |
| Context | `CartProvider` / `useCart()` (`src/components/cart/cart-context.tsx`) |
| Zustand / Redux | **Neither** — not installed, and correctly so |
| Supabase / database | **None. No cart table exists.** |

**The stored value** is the entire cart: `CartLine[]` where
`CartLine = { productId: string, quantity: number }`. That is genuinely all — no
prices, no user ID, no timestamps (`src/lib/cart.ts:9`).

### Is the cart associated with an authenticated user? **No.**

`CartProvider` (`src/components/cart/cart-context.tsx:58`) has no access to the
session. There is no `user_id`, no `getUser()` call, no merge-on-sign-in, no upload.
The context value is `{ lines, count, isEmpty, isReady, add, setQuantity,
changeQuantity, remove, clear, lastAdded }` — all operating purely on `writeCart()` →
`localStorage.setItem`.

Consequences that directly contradict the assignment:

- **A cart added on the website is invisible to the app, and vice versa.** Different
  devices have different `localStorage`. Nothing is transmitted.
- **Sign-in does not sync the cart**, by design. It survives sign-in *only* because it
  lives in the browser — see AGENTS.md rule 7.
- **Anonymous and signed-in carts are indistinguishable** on disk.
- **Signing out does not clear the cart.** The comment at
  `src/app/actions/auth.ts:53` says it drops the "cart-derived session state", meaning
  the rendered badge, not the stored cart.
- **A new device starts empty.** There is no server state to hydrate from.

### Cross-tab sync already exists — reuse it

`subscribeToCart` (`src/lib/cart-storage.ts:52`) listens for the browser `storage`
event, so **two tabs in one browser are already in sync**. This is a working,
proven sync mechanism for same-device only. It is the natural seam where a
server-backed store slots in — but a `storage` event cannot cross a device boundary,
which is exactly the gap.

### What is already correct and must be preserved

The cart deliberately stores **ids and quantities only**. Prices are always joined from
the database at read time (`src/lib/cart.ts:120`, `priceCartAction`), and the
authoritative total is computed inside `place_order()`. `src/lib/cart.ts` is **pure
functions with no React, no storage, no database** — so it is *directly portable to
React Native with zero changes*. The arithmetic layer is already platform-agnostic.

---

## 4. Supabase database

Single migration: `supabase/migrations/0001_init.sql` (360 lines). No
`database.types.ts` is generated — both Supabase clients are **untyped**
(`createBrowserClient(url, key)` with no `Database` generic).

| Table | Exists | Primary key | Foreign keys |
|---|---|---|---|
| `profiles` | Yes | `id uuid` | `id` → `auth.users` cascade |
| `categories` | Yes | `id uuid` default `gen_random_uuid()` | — |
| `products` | Yes | `id uuid` default `gen_random_uuid()` | `category_id` → `categories` `on delete set null` |
| `orders` | Yes | `id uuid` default `gen_random_uuid()` | `user_id` → `auth.users` cascade, **not null** |
| `order_items` | Yes | `id uuid` default `gen_random_uuid()` | `order_id` → `orders` cascade; `product_id` → `products` `set null` |
| **`cart`** | **NO** | — | — |
| **`cart_items`** | **NO** | — | — |

Indexes: `products_category_id_idx`, `products_is_featured_idx`,
`orders_user_id_created_at_idx`, `order_items_order_id_idx`. Triggers:
`set_updated_at()` on `profiles`/`products`/`orders`; `handle_new_user()` on
`auth.users` creating the profile row from verified metadata.

Money is `integer` cents everywhere (`price_cents`, `subtotal_cents`,
`shipping_cents`, `total_cents`, `unit_price_cents`) with `check (>= 0)`. No floats.
Enums: `order_status`, `email_status`.

### RLS policies (all five tables have RLS **enabled**)

| Policy | Table | Command | Predicate |
|---|---|---|---|
| categories are public to read | `categories` | select | `using (true)` |
| products are public to read | `products` | select | `using (true)` |
| users read own profile | `profiles` | select | `auth.uid() = id` |
| users update own profile | `profiles` | update | `auth.uid() = id` (using + with check) |
| users read own orders | `orders` | select | `auth.uid() = user_id` |
| users read own order items | `order_items` | select | `exists (orders where o.id = order_items.order_id and o.user_id = auth.uid())` |

Plus column-level hardening: `revoke update on profiles from authenticated` then
`grant update (full_name, avatar_url)` — a client cannot rewrite its own `email` or
`id` even on its own row.

**Deliberately absent: there are NO client insert/update/delete policies on `orders` or
`order_items`.** Orders are creatable *only* through `place_order()`, which runs as the
table owner and bypasses RLS. A client cannot forge an order. This is a load-bearing
design decision, not an oversight.

### Can the current schema support a shared cross-platform cart? **No.**

There is nothing to share. It needs new tables. Critically, the existing RLS model
**does** supply the pattern to copy: `auth.uid() = user_id` on `orders` is exactly the
policy shape a cart needs. The schema's *conventions* are reusable even though the
*tables* are missing.

---

## 5. Realtime

**Not used anywhere.** Grepping the entire repo for `realtime`, `postgres_changes`,
`.channel(`, `subscribe(`, `removeChannel` and `broadcast` returns **zero matches** in
both `src/` and `supabase/`.

**No publication is configured.** There is no `alter publication` /
`supabase_realtime` statement in the migration. Supabase's default
`supabase_realtime` publication ships empty, so even a correctly written client
subscription would receive nothing until tables are explicitly added.

**Can existing cart tables support realtime?** There are no cart tables, so the
question is moot. The good news is that `postgres_changes` works cleanly against any
table with RLS enabled — which this schema already does consistently on all five
tables. Realtime is low-friction once a cart table exists; the work is schema plus a
subscription, not a re-architecture.

Note for planning: `postgres_changes` respects RLS per subscriber, so a user would
receive only their own cart events. That is exactly the behaviour requirement 3 needs.

---

## 6. Environment variables

Declared centrally in `src/lib/env.ts` (lazy reads, so `next build` survives missing
values). `.env.example` exists. **Names only — no values.**

### Safe for the mobile client

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL — required by the app |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key, RLS-scoped — required by the app |
| `NEXT_PUBLIC_STORE_NAME` | Display name; falls back to `BuySell` |

These three are safe **by design**, not by accident. The `NEXT_PUBLIC_` prefix means
Next.js inlines them into the browser bundle already, and the key is the publishable
(`sb_publishable_…`) key, which is RLS-scoped. Using this exact key in React Native
grants no privilege the website does not already have.

### Server only — must NEVER be bundled into the mobile app

| Variable | Why it must stay server-side |
|---|---|
| `MAILGUN_API_KEY` | Third-party credential. Grants unrestricted outbound email as the Mailgun account. |
| `MAILGUN_DOMAIN` | Mail-sending domain |
| `MAILGUN_FROM_EMAIL` | From-address |
| `NEXT_PUBLIC_SITE_URL` | **Misleading name — treat as server-only for this project.** Read by `src/app/actions/auth.ts` to build the OAuth `redirectTo`; it is a web origin and must not become the mobile app's identity. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel-injected; used only as a `siteUrl()` fallback |

**`SUPABASE_SECRET_KEY` is the important one — and it is already correctly kept out of
application code** (AGENTS.md rule 4, enforced in `src/lib/supabase/client.ts:5`). It
bypasses RLS entirely, so bundling it in a mobile app would hand every user full
read/write access to every table. **Mobile must use the publishable key only.** Any
privileged write stays in a `SECURITY DEFINER` function scoped to the caller — exactly
how `place_order()` already works.

**Mobile gap:** there is no Expo env scheme yet and no `EXPO_PUBLIC_*` equivalents.
React Native does not read `NEXT_PUBLIC_*`.

---

## 7. Mobile recommendation

**Use React Native + Expo + TypeScript**, as suggested. The existing architecture gives
no strong reason against it and one strong reason for it.

Reasons *for*:

- **The auth and data layer is standard Supabase**, which has mature first-class React
  Native support. No adapter needed.
- **Catalog reads need no new backend at all.** RLS already permits public `select` on
  `products` and `categories`. The app can create a client with the publishable key and
  read the catalogue straight from Postgres on day one.
- **`src/lib/cart.ts` is pure and portable.** No React, no browser APIs — it drops into
  the app unchanged, so quantity clamping and cart arithmetic stay provably identical
  across platforms.
- **`place_order()` is already an RPC.** The highest-risk security surface — price
  tampering, stock races, forged orders — is already solved and reachable from any
  client.
- Shared TypeScript types mean a mobile bug and a web bug cannot disagree about what a
  `CartLine` is.

The one genuine complication is **Expo Go versus a development build**. `AsyncStorage`
and `expo-secure-store` are Expo-supported, but Google OAuth needs
`expo-auth-session` + `WebBrowser`, which requires a development build — Expo Go will
not carry it. That affects Phase 1 planning, not the framework choice.

---

## 8. Shared cart design

The requirement forces a single source of truth in Postgres, with each platform as a
subscriber. Neither platform may own the cart.

```
                    ┌──────────────────────────┐
                    │   Supabase Postgres      │
   Website ────────▶│  carts                   │
   (React)          │   id, user_id (unique),  │
                    │   created_at, updated_at │
                    │  cart_items              │
   Mobile  ────────▶│   cart_id, product_id,   │
   (Expo/RN)        │   quantity               │
                    └───────────┬──────────────┘
                                │
                    RLS: auth.uid() = user_id  ← the ONLY gate
                                │
                    Realtime postgres_changes on both tables
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
         Website cart                     Mobile cart
    (mirrors server)                  (mirrors server)
```

**Design decisions:**

1. **`carts.user_id` unique** — one cart per account, matching how a shopper thinks.
   RLS policy mirrors `orders`: `using (auth.uid() = user_id)`.
2. **Insert/update/delete policies on both tables**, unlike `orders`. A cart *must* be
   client-writable; that is the entire point. Scope every one to `auth.uid()`.
3. **Store `product_id` + `quantity` only.** No prices — identical to today's
   `CartLine`, and it keeps the existing "never trust prices from the client" rule
   intact. Prices are joined at read time.
4. **`quantity` check constraint** mirroring `place_order`'s `qty > 0 and qty <= 10`, so
   the database enforces the same ceiling as `MAX_LINE_QUANTITY`.
5. **Enforce quantity in Postgres**, not just client-side, so a malicious client cannot
   exceed the per-line cap via direct REST.
6. **Realtime on both tables**, added to the `supabase_realtime` publication in a
   migration. RLS scopes each subscriber to their own cart automatically.
7. **Website migrates localStorage → server on sign-in.** On login, if a local cart
   exists and the server cart is empty, push local lines up (capped at `MAX_LINES`);
   otherwise the server wins. This preserves every existing guest cart and is the *only*
   way current behaviour survives. Merge policy must be explicit — **union of lines,
   server wins on conflicting quantity** — then drop the local copy so the two cannot
   diverge and fight.
8. **Checkout must read from the server cart**, not localStorage, and clear the server
   cart only after the order exists. AGENTS.md rule 7 must hold for the server cart too.
9. **Optimistic UI, server is truth.** `src/lib/cart.ts` already returns new arrays
   immutably, so the local mirror updates instantly and reconciles when realtime or a
   refetch lands.
10. **Handle offline add-then-online:** queue locally, flush on reconnect, let realtime
    reconcile. The pure cart arithmetic makes replay safe.

**What this preserves:** the anonymous-guest cart (merge on sign-in),
`MAX_LINES`/`MAX_LINE_QUANTITY` semantics, prices-never-trusted, price-from-database.
**What it costs:** a new migration, a rewritten cart store, and checkout reading from
Postgres.

---

## BLOCKERS FOR LESSON 3

Ordered by severity.

1. **🔴 Cart is local-only — the core blocker.** `localStorage` `buysell.cart.v1`, no
   server component, no `user_id`. Requirements 2, 3 and 5 are **impossible** today.
   Requires new `carts` / `cart_items` tables.
2. **🔴 No cart tables and no cart RLS.** Neither table exists. New tables need new
   policies; without them a shared cart has no authorization boundary at all.
3. **🔴 No API the mobile app can call.** No `src/app/api/` exists. Every data-access
   function is a Server Action or Server Component helper — an internal Next.js
   protocol that **cannot** be invoked from React Native. Catalog reads are saved by
   RLS permitting direct Supabase access; **cart writes and checkout are not.**
4. **🟠 No realtime configuration.** No `alter publication` anywhere; the
   `supabase_realtime` publication is empty. Must be added to a migration or
   subscriptions deliver nothing.
5. **🟠 OAuth redirect allowlist is web-only.** A React Native redirect URI must be
   registered in Supabase, or Google sign-in fails on device (requirement 1).
6. **🟠 No mobile env configuration.** Zero `EXPO_PUBLIC_*` variables; React Native
   does not read `NEXT_PUBLIC_*`. Must be added without ever introducing the secret key.
7. **🟠 No generated Supabase types.** Both clients are untyped. Worth fixing in the
   same migration — a typed client is what prevents a malformed cart write from
   reaching Postgres.
8. **🟡 Website checkout reads localStorage.** `placeOrder` receives items from
   `FormData` built client-side. Once the cart moves server-side, checkout must read
   the **server** cart, and rule 7 (clear only after an order exists) must be preserved
   for it.
9. **🟡 Guest-to-account cart migration path.** Merging the existing localStorage cart
   on sign-in is required, or every current shopper loses their cart.
10. **🟡 Expo Go cannot do Google OAuth.** Needs a development build
    (`expo prebuild` / EAS), not Expo Go. Affects how Phase 1 is scaffolded.
11. **🟡 No cart RLS integration tests.** `supabase/tests/schema_test.sql` exists and
    should be extended to assert cart RLS — a mocked Postgres cannot prove a policy
    denies a row.

**Not blockers:** auth itself (fully reusable), product/category reads (public RLS),
cart arithmetic (`src/lib/cart.ts` is pure and portable), `place_order()` (already a
callable, hardened RPC).

---

## Implementation plan

### Phase 1 — Mobile foundation

Scaffold Expo + TypeScript. `npx create-expo-app`, add `@supabase/supabase-js`. Add
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (**publishable
only**). Supabase client with `AsyncStorage` session persistence and
`autoRefreshToken`. App shell, tab navigation, theme matching the web. Confirm a
development build runs on a physical phone — Expo Go will not carry the OAuth
dependency, so establish this early.

*Files:* new `mobile/` workspace; `.env.example`.

### Phase 2 — Shared authentication

`signInWithOAuth` via `expo-auth-session` + `WebBrowser`. Register the React Native
redirect URI in Supabase. Auth context/provider mirroring
`src/components/cart/cart-context.tsx`'s shape. Session restore on cold start.
**Acceptance: sign in on web and in the app as the same Google account and see the same
`profiles` row.** No schema change required.

*Files:* `mobile/src/lib/supabase.ts`, `mobile/src/auth/*`, Supabase dashboard config.

### Phase 3 — Product API

Read `products` and `categories` **directly through RLS** — no new endpoint needed. Port
`Product`/`Category` types and `src/lib/catalog.ts`'s filter/sort semantics. Add a
`database.types.ts` and type the web clients too. Add mobile-side search/filter/sort
and the product detail screen.

*Files:* `mobile/src/lib/catalog.ts`, new `src/lib/supabase/database.types.ts`,
`mobile/src/screens/*`.

### Phase 4 — Shared cart

Migration `0002_shared_cart.sql`: `carts` (unique `user_id`) + `cart_items` (FK
cascade, `quantity` check), RLS `auth.uid() = user_id` on both, insert/update/delete
policies, indexes. Server-side quantity enforcement. Rewrite the web cart store to
mirror the server while keeping `localStorage` as a write-through cache; guest→account
merge on sign-in. Move checkout to read the server cart; clear it only after the order
exists. **Add RLS tests to `supabase/tests/schema_test.sql` asserting rows-affected.**

*Files:* `supabase/migrations/0002_shared_cart.sql`, `src/lib/cart-storage.ts`,
`src/components/cart/cart-context.tsx`, `src/app/actions/cart.ts`,
`src/app/actions/orders.ts`, `src/components/checkout/*`, `mobile/src/cart/*`.

### Phase 5 — Realtime synchronization

`alter publication supabase_realtime add table public.carts, public.cart_items`.
Subscribe to `postgres_changes` filtered by `user_id` in both clients. Reconcile into
local state; optimistic writes with server reconciliation. Cover reconnect/offline
replay.

*Files:* `0002_shared_cart.sql`, new `src/lib/cart-sync.ts`, `mobile/src/cart/sync.ts`.

### Phase 6 — Physical-device testing

Verify on a real phone, not an emulator: same-account login, web→app cart sync,
app→web sync, both directions within seconds, quantity changes, removal,
sold-out/over-stock handling, checkout on both, sign-out and back in with the cart
intact. `npx expo run:android` / `run:ios` plus an EAS build. Document the device and OS
used.

*Files:* test notes; any fixes found.

### Phase 7 — Final submission verification

`npm run verify` (typecheck + lint + test + test:db) and `npm run build` green. Confirm
no secret in the mobile bundle — grep the built app for `MAILGUN_API_KEY` and
`SUPABASE_SECRET_KEY`; the publishable key is expected, anything else is not. Confirm
all five requirements with a recorded two-device demo.

### Files most likely to need modification

| File | Why |
|---|---|
| `supabase/migrations/0002_shared_cart.sql` *(new)* | carts, cart_items, RLS, realtime publication |
| `src/lib/cart-storage.ts` | localStorage → server-backed store |
| `src/components/cart/cart-context.tsx` | add sync, merge, reconcile |
| `src/app/actions/cart.ts` | read/write the server cart |
| `src/app/actions/orders.ts` | checkout from server cart; clear after order |
| `src/components/checkout/*` | build items from the server cart |
| `src/lib/supabase/database.types.ts` *(new)* | typed client, both platforms |
| `supabase/tests/schema_test.sql` | cart RLS assertions |
| `src/lib/env.ts` | mobile-safe config boundary |
| `.env.example` | document `EXPO_PUBLIC_*` |
