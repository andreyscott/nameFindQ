# Namefinder: Audit Report (Phases 2–4)

> Audit of commit `0bb751f` on 2026-11-14. Read-only: no app code was changed.
> Context from Checkpoint 1: deploy to **both** Vercel and Docker/Alibaba FC; move to a **limited free tier** for signed-out users; Supabase **Free plan**.
> See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system map.

---

## 1. Executive summary

| Area | Health (0–10) | One-line verdict |
|---|---|---|
| **Security** | **3** | `next@16.2.4` has critical published advisories. A Google API key sits in git history. An unauthenticated AI endpoint can write AI output into the shared database. Cost controls fail on serverless. RLS on user data is correct. |
| **Code Quality** | **5** | Strict TS and a passing build, but lint fails (39 errors). AI output isn't validated. Tests don't exercise the real code. There's duplicated AI plumbing and dead code. |
| **Performance** | **6** | A small app that's fast when cached, but uncached AI responses are slow and unstreamed (up to 6 sequential model attempts). Caches are per instance. About 120 KB gzip of JS ships to every route. |
| **Accessibility** | **5** | Good intent (some aria-labels, semantic articles), but unlabeled inputs, broken login label wiring, removed focus rings, very small and low-contrast text, and hover-only controls. |
| **SEO** | **4** | Lighthouse gives the home page 100, but the site has one generic title and description, name pages render only in the browser, and there's no sitemap or OG tags. The most valuable pages (one per name) are invisible to crawlers. |

**Do these first:** upgrade Next.js (S1), revoke the leaked Google keys (S2), lock down `/api/tree` and the DB write-back (S3, S4), add shared rate limiting and budget caps (S5), and validate AI output with zod (Q2).

---

## 2. Tool results

### Lint: `npm run lint` ❌ **fails**
`56 problems (39 errors, 17 warnings)`

| Rule | Count |
|---|---|
| `@typescript-eslint/no-explicit-any` | 36 |
| `@typescript-eslint/no-unused-vars` (warnings) | 17 |
| `react-hooks/set-state-in-effect` | 2 (`EtymologyTree.tsx:49`, `NameDiscoveryCard.tsx:20`) |
| `@typescript-eslint/no-require-imports` | 1 (`test_inspect.js:1`) |

The errors are in all three API routes, `usePersistence.ts`, `results/page.tsx`, `name/[id]/page.tsx`, and both test files.

### Typecheck: `npx tsc --noEmit` ✅ passes (exit 0)
This is partly because `any` is used heavily and `scripts/` is excluded in `tsconfig.json`.

### Tests: `npx vitest run` ✅ 70/70 pass
But see Q3: the suites re-implement the code under test, so they don't verify the production modules.

### Build: `npm run build` ✅ passes (Next 16.2.4, Turbopack, 22 s)
- Warning: `The "middleware" file convention is deprecated. Please use "proxy" instead.`
- Static: `/`, `/results`, `/saved`, `/tree`, `/_not-found`. Dynamic: `/login`, `/profile`, `/name/[id]`, the 3 API routes and `/auth/callback`.

### Client JS per route (estimated from client-reference manifests, gzip)
Turbopack no longer prints per-route sizes. These numbers come from summing the chunks each route's manifest references.

| Route | Raw | Gzip |
|---|---|---|
| `/` | 439 KB | 124 KB |
| `/name/[id]` | 443 KB | 124 KB |
| `/results`, `/tree` | ~435 KB | ~123 KB |
| `/saved` | 432 KB | 122 KB |
| `/login`, `/profile` | 427 KB | 120 KB |

The largest chunks are the Supabase auth client (235 KB raw / 61 KB gz) and react-dom (222 KB / 69 KB). Framer Motion is in the shared chunks. `@next/bundle-analyzer` isn't installed; Next 16 also ships `next experimental-analyze` for Turbopack builds.

### `npm audit`: ❌ 22 vulnerabilities (1 critical, 9 high, 11 moderate, 1 low)

| Package | Severity | Direct? | Notes | Fix |
|---|---|---|---|---|
| **next 16.2.4** | **critical** | direct | 33 advisories, including **unauthenticated RCE in the Image Optimization API** (GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw), **RCE on Windows-hosted servers** (GHSA-p293-qw3h-jr36), several **Middleware/Proxy bypasses** (GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f, GHSA-6gpp-xcg3-4w24, GHSA-26hh-7cqf-hhc6), **Server Actions DoS** (GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r), SSRF in Image Optimization (GHSA-cjq9-62q9-8jv4) | `next@16.4.6` + `eslint-config-next@16.4.6` (same major; `package.json` pins `16.2.4` exactly) |
| postcss, sharp | high | via next | Fixed by the Next upgrade | — |
| **zod <4.6.6** | high | direct | Memory exhaustion on oversized collections | `zod@^4.6.7` (minor) |
| vitest, @vitest/ui, vite | high/moderate | dev only | Dev-server issues, not shipped to prod | `npm audit fix` |
| brace-expansion, browserslist, js-yaml, nanoid, source-map-js, minimatch, @typescript-eslint/*, @babel/core | low–high | transitive, dev/build | Build tooling | `npm audit fix` |

### `npm outdated`: notable **major** versions available (do NOT auto-upgrade; flag only)
`typescript 5.9 → 7.0`, `eslint 9 → 10`, `framer-motion 12 → 14`, `openai 6 → 7`, `postgres 3 → 4`, `vitest 4 → 5`, `dotenv 17 → 18`, `@supabase/ssr 0.10 → 0.12` (0.x minor bumps can break). Minor/patch updates are safe: `@supabase/supabase-js 2.119`, `react 19.3.1`, `tailwindcss 4.3.5`, `zod 4.6.7`.

### Lighthouse (live: https://namefinder-tan.vercel.app/)
Mobile **89 / 89 / 96 / 100**, desktop **98 / 89 / 100 / 100** (Perf / A11y / Best Practices / SEO). Details are in §6.

### Live checks (read-only, this session)
- Headers on prod: CSP (with `'unsafe-inline' 'unsafe-eval'`), HSTS 1y, `X-Frame-Options: DENY`, nosniff, Referrer-Policy and Permissions-Policy are all present ✅
- `POST /api/namefind` signed out → `401` ✅. `POST /api/tree` signed out → `200` (public; see S3). This probe used the name "Ada" and may have triggered one AI call or DB enrichment on prod.
- `GET /robots.txt` → `404`
- Supabase (read-only queries via `DATABASE_URL`, which points at the **pooler, port 6543** ✅):
  - RLS is **enabled** on all 4 public tables. `names` has a SELECT-only policy. `saved_names` has own-row SELECT/INSERT/DELETE policies (`auth.uid() = user_id`) → **no IDOR on saved names** ✅
  - 223 names, **only 99 have embeddings** (56% invisible to Semantic search), 8 saved rows
  - Database is 14 MB of the 500 MB Free limit (`names` is 1.7 MB)
  - `match_names` is `SECURITY INVOKER` ✅. The tables have Supabase's default broad grants to `anon`/`authenticated`; RLS is what protects them, so never disable RLS on these tables.

---

## 3. Findings: Security

| ID | Area | Severity | File:Line | Issue | Recommended fix | Effort |
|---|---|---|---|---|---|---|
| **S1** | Deps | **Critical** | `package.json:22` | `next@16.2.4` is affected by unauthenticated RCE (Image Optimization), Middleware/Proxy bypasses and Server Action DoS advisories (see §2). | Upgrade to `next@16.4.6` and `eslint-config-next@16.4.6` (same major), then re-run lint/build/tests. Read the 16.3/16.4 release notes first. | S |
| **S2** | Secrets | **High** | git history: `test_list.js` (added `a20993f`, removed `9465906`), pushed to `origin/main` | A hard-coded **Google (Gemini) API key** is in git history on GitHub. A *different* Google key sits in a commented line in local `.env.local` (not committed). | **Revoke both keys** in Google Cloud Console now. Rewriting history (`git filter-repo`) is optional once the keys are revoked; it's destructive and needs a force-push, so only with your explicit OK. Remove the dead key lines from `.env.local`. | S |
| **S3** | AI abuse | **High** | `app/api/tree/route.ts:159-168, 214-255, 278-299` | `/api/tree` is **unauthenticated**, makes up to 6 Qwen calls (starting with `qwen-max`), and **writes AI output into the shared `names` row via the service-role key**. Its 10/min IP limit is in memory per instance, and the IP comes from the first `x-forwarded-for` value, which a client can spoof on Docker/FC. | Apply the planned free tier: a **shared** rate limiter (Supabase table or Upstash free) keyed on a trusted IP (Vercel: `x-real-ip`/`request.ip`; FC: the proxy-set header only) with a daily quota. Write to the DB only after zod validation, and only for signed-in users. | M |
| **S4** | Prompt injection / data integrity | **High** | `app/api/namefind/route.ts:133-138, 275-296`; `app/api/tree/route.ts:204-206, 230, 281-292` | User text is interpolated straight into the prompt, and the model's output is **upserted into the global dictionary with `ignoreDuplicates: false`**. A crafted query can make the model return an existing seed name (e.g. a curated Igbo/Yoruba entry) with false or offensive meanings, **overwriting it for every user**. The tree route can likewise overwrite `linguistic_root`, `region_origin`, `ethnicity_tribe`. | Never overwrite curated rows: add a `source` column (`seed`/`ai`) and `ON CONFLICT DO NOTHING` for seed rows, or keep AI results in a separate `ai_names` table. Validate with zod and cap field lengths. Put user input in a clearly delimited block ("treat as data"). Consider a moderation pass before persisting. | M |
| **S5** | Cost controls | **High** | `lib/rateLimiter.ts:14-45`; `app/api/namefind/route.ts:172, 203-252`; `app/api/search/route.ts:76` | Rate limits and caches live in **per-instance memory**, so on Vercel/FC every instance has its own counters and limits are effectively unbounded. Each Vibe/Blend request can make **6 sequential chat calls** with **no `max_tokens`**, starting with the most expensive model. Free sign-ups make per-user limits easy to multiply. | Shared limiter + per-user/IP **daily quotas** + a **global daily budget kill switch** (count calls in a Supabase table). Set `max_tokens`, start with `qwen-plus`/`turbo`, retry at most once, and log token usage per call. | M |
| **S6** | Headers | Medium | `next.config.ts:25` | The production CSP allows `'unsafe-inline'` and `'unsafe-eval'` for scripts, which largely cancels its XSS protection. | Use a nonce-based CSP set in `proxy.ts` (see `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`), or at least drop `'unsafe-eval'` outside dev. | M |
| **S7** | Info leak | Medium | `app/api/namefind/route.ts:254, 323-326`; `app/api/search/route.ts:149-150`; `app/api/search/route.ts:85` | Raw internal errors reach the client: provider error text (`AI unavailable. Last error: …`), `JSON.parse` messages, Postgres/embedding errors, and "QWEN_API_KEY missing". | Return generic messages with an error ID; log details server-side only. | S |
| **S8** | Injection | Medium | `app/api/namefind/route.ts:92` | User keywords are interpolated into a PostgREST `.or()` filter string. Characters like `(` `)` `.` `*` can change the filter grammar. Impact is limited (public, read-only table under RLS), but it can break queries or widen matches. | Escape or strip non-alphanumerics from keywords, or move the search into an RPC with bound parameters. | S |
| **S9** | Dependencies / build | Medium | `Dockerfile:15, 27, 30, 56` | Docker uses **`node:18-alpine`** (EOL), but Next 16 needs **Node ≥ 20.9** (`engines`). The deps stage runs `npm ci --omit=dev`, yet the build needs dev deps (`@tailwindcss/postcss`, `typescript`), so the Docker build most likely **fails**. | Use `node:22-alpine`, install all deps in the builder (standalone output already trims the runtime), and add a CI Docker build. | S |
| **S10** | Deps | Medium | `package.json:24` | `zod@4.4.3` has a memory-exhaustion advisory. Dev-tooling advisories (vitest/vite etc.) also exist. | `zod@^4.6.7`, then `npm audit fix` (non-force). | S |
| **S11** | Auth | Low | `app/auth/callback/route.ts:7, 13` | Open redirect: `next` is concatenated to `origin`, so `?next=@evil.com` becomes `https://host@evil.com`. Exploiting it needs a valid auth code, so the risk is low. | Accept only `next` values starting with a single `/`; build the URL with `new URL(next, origin)` and check its origin. | S |
| **S12** | Auth | Low | `app/login/actions.ts:53-60` | The OAuth `redirectTo` is built from the request's `Host` header. Supabase's redirect allowlist mitigates it. | Use a configured `NEXT_PUBLIC_SITE_URL` (or `VERCEL_URL` / FC env). | S |
| **S13** | Content spoofing | Low | `app/login/page.tsx:46-50` | The `?message=` query string is shown verbatim on the login page. React escapes it, so there's no XSS, but it allows phishing text ("Your account is locked, call …"). | Map message *codes* to fixed strings. | S |
| **S14** | Validation | Low | `app/login/actions.ts:11-14, 29-32` | Email and password are read with `as string` casts and no validation. | Validate with zod and return friendly errors. | S |
| **S15** | Auth | Info | `middleware.ts:6` | The middleware guards `/history` (doesn't exist) but not `/saved`. That's acceptable because data access is RLS-protected (verified), but it's worth tidying. | Rename to `proxy.ts`; guard only real routes. | S |
| **S16** | CORS / CSRF | Info ✅ | `app/api/*` | No CORS headers are set (same-origin only). POST routes require `application/json`, which forces a CORS preflight, so cross-site form CSRF is blocked. Server Actions have Next's built-in origin check. | Keep it this way; don't add `Access-Control-Allow-Origin: *`. | — |
| **S17** | XSS | Info ✅ | `app/**` | No `dangerouslySetInnerHTML` or markdown rendering; all AI text renders as React text nodes. | Keep it this way if you add markdown later (sanitize it). | — |
| **S18** | IDOR | Info ✅ | `supabase/schema.sql:80-84` + live DB | `saved_names` RLS restricts every operation to `auth.uid() = user_id`, confirmed live. One user can't read or change another user's saved names. | — | — |

---

## 4. Findings: Code quality, error handling, testing

| ID | Area | Severity | File:Line | Issue | Recommended fix | Effort |
|---|---|---|---|---|---|---|
| **Q1** | Lint | High | many (see §2) | Lint fails with 39 errors (mostly `any`), which blocks adding lint to CI. | Type the Supabase rows (`supabase gen types`), AI responses (from zod) and catch blocks (`unknown`); delete dead files. | M |
| **Q2** | Validation | High | `app/api/namefind/route.ts:9-24, 256-262`; `app/api/tree/route.ts:266-274` | `NameResultSchema` is declared but **never used**. The tree route has **no shape check**. Valid-JSON-but-wrong-shape output crashes `EtymologyTree` (`branches` destructuring) and gets written to the DB. Model calls don't use `response_format: {type:"json_object"}`. | One `lib/ai/schemas.ts` with zod schemas; `safeParse` every response; on failure retry once or return a typed error. Also use zod for request bodies (`type` currently accepts any string). | S |
| **Q3** | Testing | Medium | `tests/unit.test.ts:10-25`, `tests/logic.test.ts:10-27` | The tests **copy** the production logic instead of importing it, so 70 passing tests can't catch regressions in the real code. There are no route, hook, component or e2e tests, and no CI. | Extract pure helpers into `lib/` and import them in tests. Add route-handler tests with mocked fetch/Supabase, plus Playwright for "Vibe search → save name". | M |
| **Q4** | Duplication | Medium | `app/api/namefind/route.ts:199-254`, `app/api/tree/route.ts:208-255`, both `getAdmin()`, three cache Maps | The Qwen retry loop, admin client and TTL cache are copy-pasted. Chat calls use raw `fetch` while embeddings use `lib/qwenClient.ts`. | `lib/ai/qwen.ts` (`chatJSON(schema, messages)`), `lib/supabase/admin.ts`, `lib/cache.ts`. | M |
| **Q5** | Data integrity | Medium | `app/api/namefind/route.ts:307-321`; `app/api/tree/route.ts:86-136` | When Qwen rate-limits, the API returns **HTTP 200 with fake names** (`"River"`, `"Riverian"`). Fallback and DB-mapped trees **invent variants** by appending letters and label them as etymology. | Return 429/503 and show an honest empty or error state. Label fallback trees as "limited data" and don't invent variants. | S |
| **Q6** | Bug: Saved | Medium | `app/hooks/usePersistence.ts:84-114`; `app/name/[id]/page.tsx:43, 54, 88-91` | (a) If the name isn't in `names` yet (the upsert is fire-and-forget), save **silently fails** while the UI shows "saved". (b) Supabase errors are ignored and the optimistic state is never rolled back. (c) The detail page capitalizes the name, but seed names are lowercase, so `isSaved` gives the wrong answer. (d) The `localStorage` branch is never written (dead). | Do saves through a server route or RPC that upserts the name and inserts `saved_names` in one go; roll back on error; compare names case-insensitively or by id. | S |
| **Q7** | Feature gap | Medium | `app/api/namefind/route.ts:275-296`; `scripts/generate-embeddings.ts` | AI-added names never get embeddings. Live: **124 of 223 rows lack one**, so Semantic search can't find them. | Embed on insert (a background step after upsert) or on a schedule; the Free tier allows `pg_cron` or a Vercel cron. | S |
| **Q8** | Dead code | Low | `app/components/{NameBlender,NameDiscoveryCard,DataCard}.tsx`, `lib/supabase.ts` (empty), `test_inspect.js`, `test-api.js`, `walkthrough.md`, unused `getQwenClient` imports (`namefind:6`, `tree:5`), `ACCENT` (`MonolithSearch.tsx:41`) | Unused files, imports and exports. | Delete them (or revive NameBlender as the Blend UI; see Phase 5). | S |
| **Q9** | Stub UI | Low | `app/results/page.tsx:264`; `app/components/EtymologyTree.tsx:225-230` | "Load More", "Save to Tree" and "Compare Names" do nothing. | Implement them or remove them. | S |
| **Q10** | Next 16 | Low | `middleware.ts` | The deprecated `middleware` convention (build warning). It also calls `auth.getUser()` (a network round-trip) on **every** request, including API routes that call it again. | Rename to `proxy.ts`; narrow the matcher; consider `getClaims()` for local JWT verification. | S |
| **Q11** | RSC boundaries | Low | `app/page.tsx:1`; `app/name/[id]/page.tsx:1, 57-81` | The home page is a client component only for a motion wrapper. The name page fetches from Supabase **in the browser**, when it could be a server component (faster and indexable; see SEO2). | Make `page.tsx` and `name/[id]/page.tsx` server components and keep the interactive parts (save button, tree) as client islands. | M |
| **Q12** | State | Low | `usePersistence` used in 3 pages; `Navbar.tsx:17-31`, `BottomNav.tsx:11-26` | Every consumer creates its own auth subscription and fetch. Navbar and BottomNav call `createClient()` on every render. | One `AuthProvider` / `SavedProvider` context in the layout. | S |
| **Q13** | Bug | Low | `app/components/MonolithSearch.tsx:55-59` | Each keystroke starts a new `setTimeout` without clearing the old one, so the typing animation flickers and timers pile up. | Debounce with a ref and clear it on change and unmount. | S |
| **Q14** | Memory | Low | `namefind:57`, `tree:62`, `search:40`, `lib/rateLimiter.ts:17` | Unbounded `Map` caches and a module-level `setInterval`. On a long-lived Docker container, memory grows without limit. | An LRU with a max size, or move to the shared cache (P2). | S |
| **Q15** | Scripts | Low | `scripts/seed.ts:31`; `scripts/run-match-function.ts:35` | Seed asks for `Igbo.json` but the file is `igbo.json` (breaks on Linux/CI). `african_names.json` is never seeded. The sample query uses 1536 dimensions. | Fix the casing and decide about `african_names.json`. | S |
| **Q16** | DX | Low | repo root | No `.env.example`. The README describes only the Docker/FC deploy, not Vercel. Naming is inconsistent (NameFindQ / Namefinder / `namefind-tmp`). | Add `.env.example` and document both deploy targets. | S |
| **Q17** | Error UX | Low | `app/results/page.tsx:144-158`; `SearchBar.tsx:150-162` | Signed-out users see a red "AUTHENTICATION REQUIRED" with no sign-in link. There's no retry button and no client-side timeout. | Friendly states (sign-in CTA, retry), an `AbortController` timeout, and `role="alert"`. | S |

---

## 5. Findings: Performance

| ID | Area | Severity | File:Line | Issue | Recommended fix | Effort |
|---|---|---|---|---|---|---|
| **P1** | AI latency | Medium | `app/api/namefind/route.ts:203-252`; `app/api/tree/route.ts:209-255` | No streaming. The worst case is 6 sequential attempts × 25 s timeouts plus 1 s backoffs (~150 s), which can exceed platform function limits and leaves users staring at a spinner. `qwen-max` (the slowest) goes first. | Start with a faster model, retry once, set `max_tokens`, use `response_format: json_object`. Optionally stream results to the UI as they parse. | M |
| **P2** | Caching | Medium | in-memory caches (see Q14) | Caches are per instance and lost on cold starts, so identical Vibe queries from different users usually miss. | A shared `query_cache` table in Supabase (normalized query + type → JSON, with a TTL). It's free and works on both Vercel and FC. | S |
| **P3** | Bundle | Medium | `app/layout.tsx:36-38`; `Navbar.tsx`, `BottomNav.tsx` | Every route ships ~120 KB gzip. The Supabase auth client (~61 KB gz) and Framer Motion load on every page because the layout's nav components need them. | Read the user on the server in the layout and pass it down; use `LazyMotion` + `m` components; load the Supabase client only where it's needed. Install `@next/bundle-analyzer` or use `next experimental-analyze`. | M |
| **P4** | Proxy cost | Low | `middleware.ts:12`, `utils/supabase/middleware.ts:30-32` | Every page and API request makes a Supabase Auth round-trip in the middleware. | Narrow the matcher (exclude `/api`, static pages); use `getClaims()`. | S |
| **P5** | DB | Low | `app/api/namefind/route.ts:88-94` | `ILIKE '%kw%'` on `primary_meaning`, `contextual_meaning` and `ethnicity_tribe` has no trigram index (only `name` has one). That's fine at 223 rows but will become sequential scans as the table grows. | Add `gin_trgm_ops` indexes on those columns, or use Postgres full-text search with a `tsvector` column. | S |
| **P6** | Rendering | Low | `app/name/[id]/page.tsx` | The page is dynamic on the server yet does all its work in the browser, adding a request waterfall (page → Supabase → `/api/tree`). | Fetch the row on the server (see Q11) and cache it per name with `revalidate`. | M |
| **P7** | Fonts / images | Info ✅ | `app/layout.tsx:2-16` | Fonts use `next/font` (self-hosted, no layout shift). There are no raster images, so `next/image` isn't needed. | — | — |
| **P8** | Embeddings | Info ✅ | `scripts/generate-embeddings.ts`; `app/api/search/route.ts:40-56` | Corpus embeddings are precomputed, and query embeddings are cached (per instance). Search is Enter-triggered, so it doesn't need debouncing. | Move the query-embedding cache into P2's shared cache. | — |

---

## 6. Findings: Accessibility & SEO

| ID | Area | Severity | File:Line | Issue | Recommended fix | Effort |
|---|---|---|---|---|---|---|
| **A1** | a11y | Medium | `app/components/MonolithSearch.tsx:133-145`; `SearchBar.tsx:67-81` | The main search inputs have no `<label>` or `aria-label`, only a placeholder. | Add a visually hidden label or `aria-label`. | S |
| **A2** | a11y | Medium | `app/login/page.tsx:54-75` | Labels use `htmlFor="email"`/`"password"` but the inputs have **no `id`**, so they aren't associated. The email field also lacks `type="email"` and `autoComplete`. | Add `id`, `type="email"`, `autoComplete="email"` / `"current-password"`. | S |
| **A3** | a11y | Medium | `app/components/Navbar.tsx:66-74, 175-183` | The hamburger and drawer-close buttons are icon-only with no accessible name. | Add `aria-label="Open menu"` / `"Close menu"`. | S |
| **A4** | a11y | Medium | `Navbar.tsx:68, 89`; inputs with `outline-none` | Focus indicators are removed and there's no `focus-visible` replacement. | A global `:focus-visible` outline in the Monolith style (e.g. 1px black, 2px offset). | S |
| **A5** | a11y | Medium | e.g. `MonolithSearch.tsx:101, 110`; `EtymologyTree.tsx:202-210` | Text is 7–10 px at `text-black/20`–`/40`, which fails WCAG AA contrast (4.5:1). | Minimum 11–12 px and at least `text-black/60` for meaningful text; keep low contrast for decoration only. | S |
| **A6** | a11y | Medium | `app/saved/page.tsx:83-89` | The "Remove" button is `opacity-0` until hover, so touch and keyboard users can't see it. | Always visible (subtle), or also show it on `group-focus-within`. | S |
| **A7** | a11y | Low | `Navbar.tsx:153-232, 87-93` | The drawer has no `role="dialog"`, `aria-modal`, focus trap or Escape handling. The avatar menu has no `aria-expanded`. | Add dialog semantics and keyboard handling. | S |
| **A8** | a11y | Low | global | Infinite and blur animations ignore `prefers-reduced-motion`. | `MotionConfig reducedMotion="user"` in the layout. | S |
| **SEO1** | SEO | Medium | `app/layout.tsx:18-21` | One title and description for the whole site ("Ultra-minimalist futuristic naming tool"); no per-page titles. | `title.template` + a real description, plus per-route `metadata` exports (pages must become server components, or use layout-level metadata). | S |
| **SEO2** | SEO | Medium | `app/name/[id]/page.tsx` | Name pages, your best organic-search content ("Chidiebere meaning"), render only in the browser and have no `generateMetadata`. Crawlers see a spinner. | Server-render with `generateMetadata` (title "Chidiebere — meaning & origin"), JSON-LD, and canonical URLs. | M |
| **SEO3** | SEO | Low | `app/` | No `robots.txt` (404 live), `sitemap.xml`, Open Graph/Twitter tags, `metadataBase` or OG image. | `app/robots.ts`, `app/sitemap.ts` (from `names`), `opengraph-image`. | S |

### Lighthouse scores (live site, home page `/`, Lighthouse 12.8.2)

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| **Mobile** | 89 | 89 | 96 | 100 |
| **Desktop** | 98 | 89 | 100 | 100 |

- Mobile: FCP 1.4 s, **LCP 3.2 s**, TBT 160 ms, CLS 0, Speed Index 3.9 s. Desktop: FCP 0.5 s, LCP 0.7 s, TBT 0 ms.
- **Accessibility failures:** `button-name` (icon-only buttons; A3) and `color-contrast` (A5).
- **Best Practices (mobile):** `font-size`: only **3.9% of the text is legible** on mobile (A5).
- **SEO 100 is misleading.** Lighthouse checks only the home page's basics (a title, a description, crawlability; a 404 robots.txt counts as "allow all"). It doesn't see that name pages render only in the browser or that there's no sitemap (SEO2/SEO3).
- The mobile LCP and Speed Index come from the entrance animation (`opacity: 0 → 1, scale 0.95` over 0.8 s on the hero, `app/page.tsx:9-14`) and the hydration JS (P3). Rendering the hero without the fade-in delay would likely bring mobile LCP under 2.5 s.

---

## 7. Decisions (Checkpoint 2)
- **S2 leaked key:** revoke only. History will **not** be rewritten (no force-push).
- **Shared rate limiting, quotas and AI cache:** a **Supabase table + atomic RPC** (no new service; works on Vercel and FC; fits the Free plan).
- **AI-generated data:** add a `source` column (`seed` | `ai`) to `names`. AI writes never modify seed rows and must pass zod validation.
- **Free tier:** signed-out visitors get **5 searches/day per IP**. Signed-in users get a higher per-user daily quota (value to be set in Phase 5).

## 8. Positive findings
- Strict TypeScript, App Router, and a clean build.
- **RLS is correct and enabled in production**; there's no IDOR on saved names.
- Secrets stay server-side: only the Supabase URL and anon key are `NEXT_PUBLIC_*`. `.env*` is gitignored and was never committed.
- Security headers are set (HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy, CSP).
- AI routes check Content-Type, cap input length, and set fetch timeouts.
- Vector search uses parameterized SQL, an HNSW index and the Supabase pooler.
- No XSS sinks; `next/font` is used.
