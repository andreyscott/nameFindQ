# Namefinder: Improvement Roadmap (Phase 5)

> Based on [AUDIT_REPORT.md](./AUDIT_REPORT.md) (finding IDs in brackets) and the decisions from Checkpoints 1–2:
> both **Vercel + Docker/Alibaba FC**, Supabase **Free plan**, a **Supabase-table** limiter, a **`source` column** for AI rows, and **5 searches/day per IP** for signed-out users.
>
> Effort: **S** ≈ under 2 h · **M** ≈ half a day to 1 day · **L** ≈ several days.
> 🎨 = changes the visual design, so it needs your approval of the exact look before I implement it.
> Each item becomes its own branch (`fix/…` or `feat/…`) with tests first where practical. Lint, typecheck, tests and build get re-run after every change.

---

## 1. Fix now: security and broken functionality

| # | Item | Why it matters | Files | Effort |
|---|---|---|---|---|
| **F1** | **Upgrade Next.js 16.2.4 → 16.4.6, zod → 4.6.7, `npm audit fix` (non-force)** [S1, S10] | Closes the critical RCE, middleware-bypass and DoS advisories. Same major version; I'll read the 16.3/16.4 release notes and the bundled docs first and flag anything breaking. | `package.json`, `package-lock.json` | S |
| **F2** | **Leaked keys cleanup** [S2] | *You* revoke both Google keys. I delete the dead key lines and old provider comments from `.env.local` (local only) and add `.env.example`. History stays untouched, as you decided. | `.env.local` (local), new `.env.example` | S |
| **F3** | **Shared quota and rate limiting + free tier** [S3, S5] | Makes limits real across serverless instances and opens Vibe/Blend/Semantic/Tree to signed-out users under a cap. Proposed limits: **5/day per IP** signed out, **50/day per user** signed in, plus a **global daily AI-call budget** (kill switch, e.g. 1,000/day) and a short burst limit (10/min). Uses a trusted client IP per platform: Vercel's `x-real-ip`/`request.ip`; on FC, only the proxy-set header. | new `supabase/migrations/*_api_usage.sql` (table + `consume_quota()` RPC), `lib/quota.ts` (replaces `lib/rateLimiter.ts`), `lib/clientIp.ts`, all 3 `app/api/*/route.ts` | M |
| **F4** | **Protect the curated dictionary** [S4] | Stops prompt-injected AI output from overwriting seed names for everyone. Adds `names.source` (`seed`\|`ai`, existing rows → `seed`). AI upserts skip seed rows, and tree enrichment only updates `ai` rows. User input goes in a delimited "data, not instructions" block, with length caps on every stored field. | migration, `app/api/namefind/route.ts:275-296`, `app/api/tree/route.ts:204-299`, `supabase/schema.sql` | M |
| **F5** | **One validated AI client** [Q2, Q4, P1, S5] | A single `chatJSON(schema, messages)` helper: zod `safeParse` on every response, `response_format: json_object`, `max_tokens`, `qwen-plus` first, then `qwen-turbo`, one retry, and a 20 s total budget. This removes ~100 duplicated lines, prevents crashes from malformed output, cuts worst-case latency from ~150 s to ~20 s, and lowers cost. | new `lib/ai/qwen.ts`, `lib/ai/schemas.ts`; both chat routes; `lib/qwenClient.ts` | M |
| **F6** | **Stop showing fabricated data** [Q5] | A provider 429 becomes a real 503 with a friendly message instead of fake names with a 200. The fallback tree says "limited data" instead of making up variants by adding letters. | `app/api/namefind/route.ts:307-321`, `app/api/tree/route.ts:86-136`, `EtymologyTree.tsx` | S |
| **F7** | **Fix saving** [Q6] | Saving currently fails silently when the name isn't in the DB yet, the UI never rolls back on error, and the name page's capitalization breaks `isSaved`. Moves the save into one `save_name()` RPC (ensure the name row exists, then insert, all under RLS), with rollback on error and case-insensitive matching by id. | migration (RPC), `app/hooks/usePersistence.ts`, `app/name/[id]/page.tsx`, `app/results/page.tsx` | S–M |
| **F8** | **Fix the Docker build** [S9] | The current image uses Node 18 and omits dev deps, so the build is likely broken. Switches to `node:22-alpine`, installs full deps in the builder and keeps the runner slim. I'll verify with a local `docker build` if Docker is available. | `Dockerfile`, `.dockerignore`, `README.md` | S |
| **F9** | **Don't leak internals in errors** [S7] | Clients get generic messages plus an error ID; details are logged server-side. | 3 API routes | S |
| **F10** | **Auth hardening** [S11–S14] | Fixes the `/auth/callback` open redirect (accept only same-origin `next`). Builds OAuth `redirectTo` from `NEXT_PUBLIC_SITE_URL`. Login messages become fixed codes, and form inputs are validated with zod. | `app/auth/callback/route.ts`, `app/login/actions.ts`, `app/login/page.tsx` | S |

---

## 2. Quick wins: low effort, high impact

| # | Item | Why it matters | Files | Effort |
|---|---|---|---|---|
| **W1** | **Lint to zero** [Q1, Q8] | Unblocks CI. Generated Supabase types and zod-inferred types replace `any`. Deletes dead code: `NameDiscoveryCard`, `DataCard`, empty `lib/supabase.ts`, `test_inspect.js`, `test-api.js`, `walkthrough.md`, and unused imports. (NameBlender is kept until you decide on FN6.) | ~15 files, new `types/supabase.ts` | M |
| **W2** | **Accessibility fixes (non-visual)** [A1–A4, A6–A8] | Labels and `aria-label`s, login `id`/`type="email"`/autocomplete, a `:focus-visible` ring, drawer dialog semantics and Escape-to-close, "Remove" visible on focus, and `MotionConfig reducedMotion="user"`. This fixes Lighthouse `button-name`. | `MonolithSearch`, `SearchBar`, `Navbar`, `login/page`, `saved/page`, `layout` | S |
| **W3** 🎨 | **Readable text and contrast** [A5] | Mobile Lighthouse says only **3.9% of text is legible**. I'd raise meaningful labels from 7–10 px to 11–12 px and their opacity to `black/60`+, keeping the tiny-mono aesthetic for purely decorative text. It's a visible change, so I'll show you before/after first. | many components | S |
| **W4** | **SEO basics** [SEO1, SEO3] | A `title.template`, a real description, `metadataBase`, OG/Twitter tags, `app/robots.ts`, `app/sitemap.ts` (generated from `names`), and a simple `opengraph-image` in the Monolith style. | `app/layout.tsx`, new `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx` | S |
| **W5** | **`middleware.ts` → `proxy.ts`, narrow matcher** [Q10, P4] | Clears the deprecation warning and drops an Auth round-trip from every API and static request. | `middleware.ts` → `proxy.ts` | S |
| **W6** 🎨 | **Faster mobile LCP** | Starts the hero at full opacity and keeps a subtle motion only for secondary parts. Mobile LCP is 3.2 s now, with a target under 2.5 s. | `app/page.tsx` | S |
| **W7** | **Friendly states: signed out, quota, errors** [Q17] | Instead of a red "AUTHENTICATION REQUIRED": "3 of 5 free searches left today · Sign in for more", a retry button, a client timeout, and `role="alert"`. | `results/page`, `SearchBar`, `EtymologyTree` | S |
| **W8** | **Shared AI response cache** [P2] | Identical Vibe/Blend/Tree/embedding queries hit a Supabase `ai_cache` table (TTL 7 days) instead of calling Qwen again. That's cheaper and faster on both deploy targets, and it uses the same table infrastructure as F3. | migration, `lib/cache.ts`, 3 routes | S |
| **W9** | **Embed AI-added names + backfill** [Q7] | 124 of 223 names are invisible to Semantic search. This embeds new rows right after upsert and backfills the existing ones with `npm run db:embed`. | `app/api/namefind/route.ts`, `scripts/generate-embeddings.ts` | S |
| **W10** | **Repo hygiene** [Q15, Q16] | Fixes the seed filename casing, decides on `african_names.json`, and corrects the stale 1536-dimension example. Updates the README for both deploy targets. | `scripts/*`, `README.md` | S |
| **W11** | **Supabase keep-alive** | Free projects pause after about a week of inactivity, which takes the live site down. Adds a daily cheap ping (Vercel cron, or an FC timer trigger). | new `app/api/health/route.ts`, `vercel.json` (cron) | S |

---

## 3. Functionality improvements

| # | Item | Why it matters | Files | Effort |
|---|---|---|---|---|
| **FN1** | **Better AI results** | A rewritten prompt with few-shot examples and an explicit **`is_real_name`** flag, so the UI can honestly mark "traditional" vs "AI-coined". Adds IPA plus a plain respelling for pronunciation, gender, origin/culture, and a one-line "given when…". It also asks for names that match the cultures named in the query. | `lib/ai/schemas.ts`, prompts, results UI | M |
| **FN2** | **Search filters + history** | Culture / gender / origin filters for Vibe (sent into the prompt) and Semantic (SQL `WHERE` on `match_names`). Recent searches for signed-in users go in the existing `search_history` table, and semantic queries move into the URL so they can be shared. 🎨 for the filter UI. | `MonolithSearch`, `SearchBar`, `/api/search`, `match_names()` | M |
| **FN3** | **Server-rendered, shareable name pages** [SEO2, Q11, P6] | `/name/[id]` becomes a server component with `generateMetadata` ("Chidiebere: meaning & origin"), JSON-LD, a per-name OG image and a **Share** button (Web Share API / copy link). It's your biggest SEO and sharing upside. | `app/name/[id]/page.tsx`, new `opengraph-image.tsx`, client islands for save/tree | M |
| **FN4** | **Saved: notes, collections, export/share** | Per-name notes (the column already exists). Collections (e.g. "Girl names", "Shortlist"). Export to CSV or copy, and a read-only share link for a collection (useful when parents choose together). 🎨 | migration (`collections`, `collection_items`), `saved/page`, `usePersistence` → provider | M–L |
| **FN5** | **Tree page with name input** (decided) | `/tree` gets a name input and keeps the Lucius demo as the starting state. Either implements "Compare Names" (two trees side by side) or removes it; "Save to Tree" is removed. 🎨 for the input. | `app/tree/page.tsx`, `EtymologyTree.tsx` | M |
| **FN6** 🎨 | **Real two-root Blend UI** | Blend today is one text box ("Root + Root"). Option: revive `NameBlender`'s two-input layout inside the Blend tab and wire it to the current API (dropping its random "match %" and IDs). Otherwise delete it. | `MonolithSearch`, `NameBlender` | M |
| **FN7** | **Working "Load More"** | Asks for 5 more results, excluding the names already shown (uses quota). | `results/page`, `/api/namefind` | S–M |
| **FN8** 🎨 | **Mobile UX pass** | The 5xl/7xl input text overflows on small screens, the fixed bottom nav overlaps content, and touch targets are below 44 px. I'll do a screenshot-driven pass at 375 px width. | layout, `MonolithSearch`, `results`, `saved` | M |

---

## 4. Longer-term

| # | Item | Why it matters | Files | Effort |
|---|---|---|---|---|
| **L1** | **Real test setup** [Q3] | Rewrites the tests to import the production helpers. Adds route-handler tests with mocked Qwen and Supabase, plus **Playwright** e2e for "Vibe search → save name" and the signed-out quota flow. | `tests/**`, `playwright.config.ts`, `package.json` | M |
| **L2** | **CI (GitHub Actions)** | Lint, typecheck, tests and build on every PR, plus a Docker build to keep the FC path from breaking again. | `.github/workflows/ci.yml` | S |
| **L3** | **Error tracking** | Sentry's free tier works on both Vercel and FC and covers the client, server and AI failures. | `instrumentation.ts`, `sentry.*.config.ts` | S |
| **L4** | **AI cost tracking** | Logs model, tokens and latency per call into the F3 usage table, with a small daily summary query or admin page. | `lib/ai/qwen.ts`, migration | S–M |
| **L5** | **Analytics** | Privacy-friendly and works on both targets (Umami or Plausible). Vercel Analytics only covers the Vercel deployment. | `app/layout.tsx` | S |
| **L6** | **Nonce-based CSP** [S6] | Removes `'unsafe-inline'` and `'unsafe-eval'` from `script-src`. Needs dynamic rendering for pages, so do it after FN3. | `proxy.ts`, `next.config.ts` | M |
| **L7** | **Smaller client bundle** [P3, Q12] | Reads the user on the server in the layout, adds one `AuthProvider`, `LazyMotion`, and loads the Supabase client only where needed. Target: well under the current ~120 KB gzip per route. | `layout`, `Navbar`, `BottomNav`, hooks | M |
| **L8** | **Streaming results** [P1] | Streams names into the results list as the model produces them. Do it after F5 if latency still feels slow. | `/api/namefind`, `results/page` | M |
| **L9** | **Trigram/FTS indexes** [P5] | `gin_trgm_ops` indexes or a `tsvector` column for meaning search. Only worth it once the table grows past a few thousand rows. | migration | S |
| **L10** | **Major dependency upgrades** (flag only) | TypeScript 7, ESLint 10, framer-motion 14, openai 7, postgres 4, vitest 5. Each has breaking changes; do them one at a time with release-note review, after CI exists. | `package.json` | M each |

---

## 5. Suggested order

1. **Batch A, security (this week):** F1 → F2 (you revoke) → F5 → F4 → F3 → F9 → F10 → F6 → F7 → F8
   F5 comes before F3/F4 because the quota and data-protection code builds on the shared AI client.
2. **Batch B, quick wins:** W1, W2, W5, W7, W8, W9, W11, W4, W10, then the 🎨 items W3 and W6 after a design check.
3. **Batch C, product:** FN3 (SEO and sharing) → FN1 → FN5 → FN2 → FN4 → FN6 → FN7 → FN8
4. **Batch D, platform:** L2 + L1 early (ideally alongside Batch A), then L3, L4, L7, L6, L8, L5, L9, L10.

**Proposed signed-in quota:** 50 AI searches per day per user, with a global cap of 1,000 AI calls per day. You can tune these in one config file (`lib/quota.ts`).
