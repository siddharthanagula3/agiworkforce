# React 19.2 + Next.js 16 + Vercel — Best Practices, Versions & Pitfalls

Research date: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: React 19.2.x, Next.js 16 (16.0 → 16.2.6) App Router, and Vercel platform features (Fluid Compute / Active CPU, AI Gateway). Framed against AGI Workforce's Web surface (`apps/web`, Next.js 16 / React 19), v1 = Local + BYOK, multi-provider routing, local-first privacy.

> Confidence: **high**. Framework facts below are sourced from official release blogs and versioned official docs (`nextjs.org/docs` pages carry `version: 16.2.6` / `lastUpdated: 2026-05-28`), plus the official React 19.2 announcement, all accessed 2026-05-29. AGI repo facts come from direct file reads of `apps/web/package.json`, `apps/web/next.config.ts`, and `apps/web/proxy.ts` (high confidence). The one claim that rests on secondary sources (AI Gateway "no markup" pricing) is flagged inline and softened. Model IDs seen in Vercel doc examples are **not** treated as canonical — AGI's SSOT is `packages/types/src/models.json`.

---

## Summary

Next.js 16 shipped **2025-10-21** with React 19.2 (released **2025-10-01**) as its baseline; the App Router runs on React Canary to pick up incrementally-stabilizing features ([Next.js 16 blog](https://nextjs.org/blog/next-16), 2025-10-21). The 16.x line is at **16.2.6** as of the **2026-05-07 May 2026 security release**, which patched 13 advisories ([Vercel changelog](https://vercel.com/changelog/next-js-may-2026-security-release), 2026-05-07). The four headline shifts are: (1) **Turbopack is the default bundler** for dev and build; (2) **Cache Components** — an opt-in, explicit caching model built on `"use cache"` + Partial Prerendering (PPR), replacing the old implicit App Router caching; (3) **`proxy.ts` replaces `middleware.ts`** (rename file + rename the export to `proxy`, runs on Node.js); (4) **React Compiler support is stable** (opt-in, not default). React 19.2 adds `<Activity>`, `useEffectEvent`, `cacheSignal`, View Transitions, and Partial Pre-rendering server APIs ([React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2), 2025-10-01).

**The single most important finding for AGI:** `apps/web/package.json` pins **`react": "19.2.5"`** and **`react-dom": "19.2.4"`** (read 2026-05-29). **CVE-2026-23870** — an unauthenticated React Server Components DoS (CVSS 7.5) in the server-function endpoint handler — affects **React 19.2.0 → 19.2.5** and is fixed only in **19.2.6** ([NVD CVE-2026-23870](https://nvd.nist.gov/vuln/detail/CVE-2026-23870); [Next.js May 2026 security release](https://vercel.com/changelog/next-js-may-2026-security-release), 2026-05-07). Because AGI runs the Next.js App Router (which uses RSC server functions / Server Actions), the web surface is in the affected range. The fix is a bump to `react@19.2.6` + `react-dom@19.2.6`. `next` is already on `^16.2.6` (patched), so the Next.js half is covered; the React peer is the gap.

AGI's web posture is otherwise modern and clean: it already uses **`proxy.ts`** (no lingering `middleware.ts`), Turbopack config is top-level (not under `experimental`), there are **no** uses of removed APIs (`experimental.ppr`, `dynamicIO`, `serverRuntimeConfig`, AMP, `next/legacy/image`, `images.domains`) anywhere in source, and the CSP is per-request nonce-based built in `proxy.ts`. The main forward-looking gap is that **Cache Components are not enabled** (`cacheComponents` is absent from `next.config.ts`), so AGI runs fully dynamic by default and is not yet using `use cache` / PPR — acceptable for a dynamic, auth-gated chat app, but it leaves prerender/instant-navigation performance on the table for public/marketing routes.

---

## Current bar (what best practice requires as of 2026-05-29)

1. **Be on a security-patched line.** Next.js **16.2.6** and React **19.2.6** (or `19.1.7` / `19.0.6` on older lines) are the floor after the 2026-05-07 release; "patching is the only complete mitigation" for the 13 advisories ([Vercel changelog](https://vercel.com/changelog/next-js-may-2026-security-release), 2026-05-07). **AGI: `next ^16.2.6` ✅; `react 19.2.5` / `react-dom 19.2.4` ⚠️ below the patched `19.2.6`.**

2. **Use `proxy.ts`, not `middleware.ts`.** Rename the file to `proxy.ts` and the exported function to `proxy`; it runs on the **Node.js runtime**. `middleware.ts` still works for Edge-runtime cases but is deprecated and slated for removal ([Next.js 16 blog](https://nextjs.org/blog/next-16), 2025-10-21). **AGI: already on `proxy.ts` ✅.**

3. **Treat caching as explicit and opt-in.** With Cache Components, all dynamic code runs at request time by default; you cache deliberately with `"use cache"` and shape lifetimes with `cacheLife`. This is the inverse of the old implicit App Router fetch cache ([Next.js 16 blog](https://nextjs.org/blog/next-16); [use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache), v16.2.6). **AGI: Cache Components not yet enabled (default all-dynamic).**

4. **Adopt async dynamic APIs.** `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are async-only in 16 — you must `await` them. Codemod available via `npx @next/codemod@canary upgrade latest` ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

5. **Let Turbopack be the default; only opt into webpack if you have custom loaders.** `next build --webpack` / `next dev --webpack` are the escape hatches; a stray Babel config silently re-enables Babel ([Next.js 16 blog](https://nextjs.org/blog/next-16)). **AGI: top-level `turbopack` config present ✅.**

6. **Consider React Compiler for automatic memoization** once you accept slower builds (it relies on Babel). It is stable but **off by default**; enable with `reactCompiler: true` + `babel-plugin-react-compiler@latest` ([Next.js 16 blog](https://nextjs.org/blog/next-16)). **AGI: not enabled (acceptable).**

7. **Lint outside Next.** `next lint` is removed and `next build` no longer lints; run Biome or ESLint directly. `@next/eslint-plugin-next` now defaults to ESLint Flat Config; `eslint-plugin-react-hooks@6` defaults to flat config and its `recommended` preset now includes React-Compiler-powered rules ([Next.js 16 blog](https://nextjs.org/blog/next-16); [React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2)).

8. **Provide `default.js` for every parallel-route slot.** Builds now fail without them; the old implicit behavior is gone ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

9. **Use the new mutation/refresh APIs correctly.** `updateTag(tag)` (Server-Actions-only, read-your-writes), `refresh()` (Server-Actions-only, uncached data only), and `revalidateTag(tag, profile)` (SWR; now requires a `cacheLife` profile as 2nd arg) ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

10. **On Vercel, lean on Fluid Compute + Active CPU for streaming/AI workloads.** Fluid is the default compute model; Active CPU pricing bills CPU only while code actively runs, claiming up to ~90% additional savings for idle-heavy AI inference ([Vercel: Active CPU pricing](https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute), 2025-06-25). **AGI v1 is Local + BYOK — relevant only if/when web routes proxy provider calls.**

---

## Version-specific facts (exact versions + dates)

| Component | Fact | Source |
|---|---|---|
| **React 19.2.0** | Released **2025-10-01**. Adds `<Activity>`, `useEffectEvent`, `cacheSignal`, View Transitions, Performance Tracks, PPR server APIs, Web Streams SSR for Node. | [React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2) |
| **React patched line** | **19.2.6** (also `19.1.7`, `19.0.6`) — fixes CVE-2026-23870, released alongside the Next.js May 2026 security release. | [Vercel changelog](https://vercel.com/changelog/next-js-may-2026-security-release) (2026-05-07) |
| **Next.js 16.0.0** | Released **2025-10-21**. Turbopack default, Cache Components, `proxy.ts`, React Compiler stable, DevTools MCP, new caching APIs. | [Next.js 16 blog](https://nextjs.org/blog/next-16) |
| **Next.js 16.1** | Introduced `next dev --inspect`; enhanced prefetching. | [Next.js 16.2 blog](https://nextjs.org/blog/next-16-2) |
| **Next.js 16.2.0** | Released **2026-03-18**. ~400% faster `next dev` time-to-URL, ~50% faster rendering (RSC payload deserialization, contributed upstream to React), Adapters API **stable**, `--inspect` for `next start`, `transitionTypes` on `<Link>`, faster `ImageResponse`, 200+ Turbopack fixes. | [Next.js 16.2 blog](https://nextjs.org/blog/next-16-2) (2026-03-18) |
| **Next.js 16.2.6** | Released **2026-05-07** as the May 2026 security release (with 15.5.18). Patched 13 advisories: 3 DoS, 5 middleware/proxy bypass, 1 SSRF, 2 cache poisoning, 2 XSS. Documents upstream React **CVE-2026-23870**. | [Vercel changelog](https://vercel.com/changelog/next-js-may-2026-security-release) (2026-05-07) |
| **Min versions (Next 16)** | Node.js **20.9+** (Node 18 dropped), TypeScript **5.1+**, browsers Chrome/Edge/Firefox **111+**, Safari **16.4+**. | [Next.js 16 blog](https://nextjs.org/blog/next-16) |
| **React Compiler** | `1.0` shipped; `reactCompiler` config promoted to stable in Next 16, off by default; install `babel-plugin-react-compiler@latest`. | [Next.js 16 blog](https://nextjs.org/blog/next-16) |
| **eslint-plugin-react-hooks** | **v6**: default flat config; `recommended` now includes Compiler-powered rules; legacy path = `recommended-legacy`. | [React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2) |
| **Vercel Active CPU pricing** | Launched **2025-06-25**; Fluid is the default compute model; Active CPU = $0.128/hr-vCPU class, Provisioned Memory $0.0106/GB-hr. | [Vercel: Active CPU pricing](https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute) (2025-06-25) |

### React 19.2 feature specifics ([React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2), 2025-10-01)

- **`<Activity mode="visible" | "hidden">`** — `hidden` unmounts Effects and defers updates but **preserves state**, so you can pre-render likely-next UI and restore back-navigation state.
- **`useEffectEvent`** — extracts non-reactive logic from Effects; must NOT be in the dependency array, must be declared in the same component/Hook, enforced by `eslint-plugin-react-hooks@latest`. Always sees latest props/state.
- **`cacheSignal()`** (RSC only) — returns an `AbortSignal` that fires when a `cache()` lifetime ends (render complete / aborted / failed); pair with `cache(fetch)` for cancellation.
- **Partial Pre-rendering server APIs** — `prerender()` (returns `prelude` + `postponed`), `react-dom/server`'s `resume()` / `resumeToPipeableStream()`, `react-dom/static`'s `resumeAndPrerender()` / `resumeAndPrerenderToNodeStream()`.
- **Web Streams SSR for Node** — `renderToReadableStream`, `prerender`, `resume`, `resumeAndPrerender` now available in Node (React still recommends the Node-stream APIs for perf/compression).
- **Suspense boundary reveals are now batched** server-side (heuristic stops batching if approaching the 2.5s LCP threshold) — aligns SSR with CSR and enables `<ViewTransition>` during SSR.
- **`useId` prefix changed to `_r_`** (was `:r:` in 19.0, `«r»` in 19.1) so IDs are valid for `view-transition-name` and XML 1.0 names — a real breaking change for any code that string-matches generated IDs.

### Cache Components / `use cache` / `cacheLife` mechanics

- **Enable with top-level `cacheComponents: true`** in `next.config.ts`. The old `experimental.dynamicIO` was **renamed** to `cacheComponents`; `experimental.ppr` flag and `export const experimental_ppr` were **removed** — PPR is now subsumed by Cache Components ([Next.js 16 blog](https://nextjs.org/blog/next-16)).
- **`"use cache"`** marks a file / component / function cacheable; cache key = build ID + function-location hash + serialized args + (dev) HMR hash. Closed-over variables are auto-captured into the key ([use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache), v16.2.6, 2026-05-28).
- **`cacheTag(tag)`** (from `next/cache`) tags a cached scope; tags ≤256 chars, case-sensitive. `fetch(url, { next: { tags: [...] } })` is the fetch-side equivalent ([cacheTag/updateTag docs](https://nextjs.org/docs/app/api-reference/functions/updateTag), v16.2.6).
- **`cacheLife` preset profiles** (`stale` / `revalidate` / `expire`) ([cacheLife docs](https://nextjs.org/docs/app/api-reference/functions/cacheLife), v16.2.6, 2026-05-28):

  | Profile | stale | revalidate | expire |
  |---|---|---|---|
  | `default` | 5 min | 15 min | never |
  | `seconds` | 30 s | 1 s | 1 min |
  | `minutes` | 5 min | 1 min | 1 hr |
  | `hours` | 5 min | 1 hr | 1 day |
  | `days` | 5 min | 1 day | 1 week |
  | `weeks` | 5 min | 1 week | 30 days |
  | `max` | 5 min | 30 days | 1 year |

  Client `stale` is enforced to a **30-second minimum** (so prefetched links stay usable). Custom profiles go in `next.config.ts` under `cacheLife: { ... }`; omitted props inherit from `default`.

### Vercel AI Gateway (relevant to AGI's multi-provider routing)

- **OpenAI-compatible endpoint** at `https://ai-gateway.vercel.sh/v1` — drop-in for the OpenAI SDK with `AI_GATEWAY_API_KEY` ([Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway)).
- **BYOK** is supported per-provider via `providerOptions.gateway.byok` (request-scoped) or dashboard config; per-provider **timeouts** (`providerTimeouts.byok`) trigger fast failover ([Vercel AI Gateway BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)).
- **Provider failover / routing order** via `providerOptions.gateway.order: ['vertex','anthropic',...]` or `provider.sort: 'tps'` ([Vercel AI Gateway advanced docs](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/advanced)).
- **Zero Data Retention** via `providerOptions.gateway.zeroDataRetention: true` routes only to ZDR-compliant providers ([Vercel AI Gateway capabilities](https://vercel.com/docs/ai-gateway/capabilities)).
- AI Gateway runs on Fluid Compute and is observable via Vercel Observability (latency, provider health, token counts, cost). The widely-cited "no per-token markup with BYOK" claim appears in secondary sources ([folding-sky](https://folding-sky.com/blog/vercel-ai-gateway-hundreds-ai-models-zero-data-retention); [truefoundry](https://www.truefoundry.com/blog/understanding-vercel-ai-gateway-pricing)) — confirm against the [official AI Gateway pricing page](https://vercel.com/docs/ai-gateway/pricing) before relying on it. *(Model IDs shown in Vercel's own docs — e.g. `anthropic/claude-opus-4.7`, `openai/gpt-5.5` — are documentation examples and are NOT to be treated as AGI's canonical model list; AGI's SSOT remains `packages/types/src/models.json`.)*

---

## Known pitfalls & gotchas

1. **The React patch lag is a live security gap, not cosmetic.** Pinning `react@19.2.5` while `next@16.2.6` is patched leaves CVE-2026-23870 (RSC server-function DoS, CVSS 7.5, unauth, low complexity) open. Next.js's patch does not fix the bundled React server-dom packages — you must bump React itself to `19.2.6` ([NVD CVE-2026-23870](https://nvd.nist.gov/vuln/detail/CVE-2026-23870)).

2. **Dynamic APIs inside `use cache` cause build hangs, not just runtime errors.** Calling `cookies()`/`headers()` directly inside `use cache` errors immediately; but passing a *Promise* of runtime data (props, closures, shared `Map`s) into a cached scope causes a **50-second build timeout** ("Filling a cache during prerender timed out…"). Read runtime values *outside* the cached scope and pass plain values as args ([use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache), v16.2.6).

3. **Serverless in-memory `use cache` does not persist across requests.** Each request may hit a different instance, so runtime caching effectively doesn't dedupe across requests on serverless (build-time caching works normally). For real cross-request runtime cache you need `"use cache: remote"` (network roundtrip + platform fees) or self-hosting ([use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache), v16.2.6). This directly affects any plan to cache provider/model metadata on Vercel.

4. **Short-lived nested caches silently poison the parent — Next throws to stop it.** A `seconds`-profile cache (or any `revalidate: 0` / `expire < 5 min`) becomes a "dynamic hole" excluded from prerender; nesting it inside a `use cache` without an explicit `cacheLife` errors during prerender. Always set an explicit `cacheLife` on outer caches ([cacheLife docs](https://nextjs.org/docs/app/api-reference/functions/cacheLife)).

5. **`revalidateTag(tag)` single-arg form is deprecated.** It now wants `revalidateTag(tag, profile)` (e.g. `'max'`) for SWR. For read-your-writes in Server Actions use `updateTag(tag)`; for uncached data use `refresh()`. Mixing these up gives users stale UI after mutations ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

6. **`React.cache` is isolated inside `use cache`.** Data stored via `React.cache()` outside a cached scope is invisible inside it — you cannot smuggle request context in that way; pass args instead ([use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache)).

7. **`useId` prefix change (`_r_`) breaks ID string-matching.** Any test, selector, or DOM logic that hard-codes `:r:` / `«r»` patterns will break on 19.2 ([React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2)).

8. **Removed config will fail the build.** `experimental.ppr`, `experimental.dynamicIO` (renamed), `serverRuntimeConfig`/`publicRuntimeConfig`, AMP, `experimental.turbopack` (moved to top-level), and `next lint` are all gone. `images.domains` and `next/legacy/image` are deprecated. A leftover Babel config now silently switches Turbopack into Babel mode ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

9. **Every parallel-route slot needs `default.js`** or the build fails — a new hard requirement ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

10. **Image defaults changed.** `minimumCacheTTL` 60s → 4h; `qualities` default → `[75]` (quality prop coerced to nearest); `imageSizes` dropped `16`; local IP optimization blocked by default; local `src` with query strings now needs `images.localPatterns`; redirects capped at 3 ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

11. **`proxy.ts` runs on Node.js, not Edge.** If you relied on Edge-only behavior in old `middleware.ts`, that's a semantics change; `middleware.ts` is retained specifically for Edge cases but deprecated ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

---

## Implications / gaps for AGI Workforce

Grounded in direct reads of `apps/web/package.json`, `apps/web/next.config.ts`, and `apps/web/proxy.ts` (2026-05-29):

1. **[Action — security] Bump React to 19.2.6.** `apps/web` pins `react": "19.2.5"` and `react-dom": "19.2.4"`, both inside the CVE-2026-23870 affected range (19.2.0–19.2.5). AGI's App Router uses RSC/Server Actions, so the unauth DoS endpoint is exposed. `next` is already `^16.2.6` (patched). Fix: pin `react@19.2.6` + `react-dom@19.2.6`. This is the web analogue of the desktop tauri-pin finding — concrete and actionable.

2. **[Healthy] `proxy.ts` is correct and matches the locked rule.** `apps/web/proxy.ts` exists (Clerk middleware + per-request nonce CSP via `buildCspWithNonce()`), and there is **no** `middleware.ts`. This satisfies the repo's locked "proxy.ts not middleware.ts" rule and the Next 16 requirement. No change needed.

3. **[Healthy] No removed/deprecated APIs in source.** Grep across `apps/web` source found zero uses of `unstable_cache`, `experimental.ppr`, `dynamicIO`, `serverRuntimeConfig`/`publicRuntimeConfig`, AMP, `next/legacy/image`, or `images.domains` (the only `unstable_cache` hits were in `.next/` generated type re-exports, not source). Turbopack config is top-level. The 16 migration surface is clean.

4. **[Opportunity] Cache Components are off — default all-dynamic.** Neither `cacheComponents` nor `reactCompiler` is set in `next.config.ts`, so every route renders at request time. For an auth-gated chat product this is defensible (chat is inherently dynamic and user-scoped). But public/marketing/docs routes would benefit from `"use cache"` + PPR for instant navigation. If AGI adopts it: enable `cacheComponents: true`, set explicit `cacheLife` on every outer cache, and **never** cache user/session-scoped chat — keep Local/BYOK/Managed as separate trust boundaries (a cached scope leaking another user's chat would violate the locked trust-boundary rule).

5. **[Privacy/architecture caution] `use cache` runtime caching is wrong for AGI's privacy model.** Because serverless in-memory `use cache` doesn't persist across requests, any cross-request caching needs `"use cache: remote"` (Redis/KV + platform fees). For AGI's local-first, privacy-by-default posture, caching prompts/responses/provider payloads server-side is an anti-pattern — restrict `use cache` to non-user, non-secret data (model catalog metadata, static pages). Telemetry-off and no-replay rules reinforce this.

6. **[BYOK alignment] Vercel AI Gateway maps cleanly onto AGI's multi-provider/BYOK routing — but it's optional and waitlist-adjacent.** Gateway gives an OpenAI-compatible endpoint, per-provider BYOK with timeouts/failover (`order`, `providerTimeouts`), and ZDR routing. This matches AGI's "multi-provider routing + BYOK" design and could back the future Managed Cloud tier. However, per the locked rules, Managed Cloud / provider-funded compute stays waitlist-gated until ledgering/abuse/refunds/retention are proven, and BYOK keys must never silently route Local chats to cloud. If AGI uses Gateway, the visible-provider-label + explicit-consent rules still apply. **Do not** adopt the model IDs from Vercel's docs — keep `packages/types/src/models.json` as SSOT.

7. **[Cost lever, when applicable] Fluid Compute + Active CPU fits streaming AI.** If AGI ever proxies provider streaming through Vercel functions, Active CPU pricing (bills CPU only during active compute) is well-suited to idle-heavy LLM streaming. Not relevant to v1 (Local + BYOK, no server-side provider proxying), but worth noting for the Managed Cloud roadmap.

8. **[DX] Adopt the new lint/compiler posture deliberately.** Since `next lint` is gone, confirm CI runs ESLint/Biome directly (not via `next build`). `eslint-plugin-react-hooks@6` flat config + Compiler rules are the current bar; React Compiler itself can stay off until build-time cost is measured against AGI's CI budget.

---

## Sources

- React 19.2 — https://react.dev/blog/2025/10/01/react-19-2 — 2025-10-01
- Next.js 16 — https://nextjs.org/blog/next-16 — 2025-10-21
- Next.js 16.2 — https://nextjs.org/blog/next-16-2 — 2026-03-18
- Next.js May 2026 security release (Vercel changelog) — https://vercel.com/changelog/next-js-may-2026-security-release — 2026-05-07
- NVD CVE-2026-23870 (React Server Components DoS) — https://nvd.nist.gov/vuln/detail/CVE-2026-23870 — May 2026
- use cache directive (docs, v16.2.6) — https://nextjs.org/docs/app/api-reference/directives/use-cache — updated 2026-05-28
- cacheLife (docs, v16.2.6) — https://nextjs.org/docs/app/api-reference/functions/cacheLife — updated 2026-05-28
- cacheTag / updateTag (docs, v16.2.6) — https://nextjs.org/docs/app/api-reference/functions/updateTag — v16.2.6
- Vercel: Introducing Active CPU pricing for Fluid compute — https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute — 2025-06-25
- Vercel AI Gateway (docs) — https://vercel.com/docs/ai-gateway — accessed 2026-05-29
- Vercel AI Gateway BYOK (docs) — https://vercel.com/docs/ai-gateway/authentication-and-byok/byok — accessed 2026-05-29
- Vercel AI Gateway capabilities (ZDR) — https://vercel.com/docs/ai-gateway/capabilities — accessed 2026-05-29
- Vercel AI Gateway pricing (docs) — https://vercel.com/docs/ai-gateway/pricing — accessed 2026-05-29
- AI Gateway pricing commentary (secondary, "no markup" claim) — https://folding-sky.com/blog/vercel-ai-gateway-hundreds-ai-models-zero-data-retention ; https://www.truefoundry.com/blog/understanding-vercel-ai-gateway-pricing — 2026
- AGI repo reads: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/proxy.ts` — read 2026-05-29
