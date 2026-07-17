# AGI Web — Volume 18 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`. Grounded in real repo paths: `apps/web/next.config.ts`, `apps/web/proxy.ts`, `apps/web/instrumentation.ts`, `apps/web/app/loading.tsx`, `apps/web/lib/hooks/useChatStream.ts`, `apps/web/lib/providerStreamClient.ts`, `apps/web/app/api/v1/providers/[providerId]/stream/route.ts`, `apps/web/lib/prompt-cache-helper.ts`, `apps/web/features/chat/hooks/use-chat-queries.ts`, `apps/web/features/chat/components/messages/AdvancedMessageList.tsx`, `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/lib/rate-limit.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the performance budget and mechanics of AGI Web: initial load, token streaming, caching, DOM rendering, memory, network efficiency, and long-conversation scale. AGI Web is the **cloud-only** surface — no Local runtime, no BYOK (never add either). Every byte rendered comes from a Managed-Cloud session tied to Neon/account state, so performance work never branches on trust mode, but it MUST respect the trust boundary: sync only pulls the caller's own Managed-Cloud rows, and no cache may cross-populate another user or leak Local/BYOK content (Web has none). Model IDs referenced by any perf heuristic come only from `packages/contracts/types/src/models.json` — never hardcoded. Performance is plan-agnostic: Free through Enterprise get the same client budget; entitlement gating lives upstream, not in the render path.

## Initial Load

✅ Built — `apps/web/next.config.ts` runs Turbopack (Next.js 16 default) with `optimizePackageImports` for heavy UI libs (`lucide-react`, `framer-motion`, Radix, `react-markdown`, `date-fns`), `@next/bundle-analyzer` wired for bundle inspection, and Turbopack `resolveAlias` stubs (`@webcontainer/api`, `node:async_hooks`) that keep Node-only code out of the client bundle. Route-level `loading.tsx` Suspense boundaries exist across public and app routes (`apps/web/app/loading.tsx`, `apps/web/app/pricing/loading.tsx`, and others) so navigation shows instant skeletons. Requirements (testable): first-load JS for the chat route stays under an agreed budget (track via `pnpm --filter web analyze`); no route ships a Node-only module to the browser; every top-level route has a `loading.tsx` or streamed shell. 🟡 Partial — client Web-Vitals RUM is not wired: `apps/web/instrumentation.ts` covers server instrumentation, but there is no `web-vitals`/`useReportWebVitals` reporter in `package.json`, so LCP/INP/CLS are not measured in production. 🔭 Planned — a client vitals reporter feeding an internal analytics sink, and a CI bundle-size regression gate.

## Streaming

✅ Built — chat responses stream over SSE. `apps/web/lib/hooks/useChatStream.ts` consumes the stream, parses both OpenAI-compatible (`choices[0].delta.content`) and Anthropic (`content_block_delta`) shapes, holds back bytes in a `contentBuffer` so a `<thinking>` marker split across chunks is detected, and shows a pulsing caret while `isStreaming`. `apps/web/lib/providerStreamClient.ts` is the low-level SSE consumer, yielding canonical `StreamChunk` objects and honoring an `AbortSignal`; the proxy route is `apps/web/app/api/v1/providers/[providerId]/stream/route.ts`. Requirements: first token renders as soon as it arrives (no wait-for-complete); user Stop aborts the fetch and preserves partial content; `[DONE]` flushes the buffer and persists idempotently; backpressure never blocks the main thread. 🔭 Planned — token-batched flushing (coalesce rapid deltas to one paint per frame) to cut re-render churn on fast streams.

## Caching

✅ Built — client server-state caching uses `@tanstack/react-query` (`apps/web/features/chat/hooks/use-chat-queries.ts` and sibling hooks for history, branches, reactions, billing), giving deduped fetches, background refetch, and stale-while-revalidate for conversation lists and metadata. Server-side, `apps/web/lib/prompt-cache-helper.ts` prepares provider prompt-cache breakpoints so repeated system/context prefixes are cached at the provider, cutting latency and cost. Release/model routes use Next.js caching/revalidation (`apps/web/app/api/models/route.ts`, `apps/web/app/api/releases/*`). Requirements: query caches are user-scoped and cleared on sign-out; no authenticated chat payload is cached in a shared/CDN layer; prompt-cache keys never mix users or trust modes. 🔭 Planned — offline-capable read cache (service worker) for recent conversations.

## Rendering

✅ Built — the full Markdown renderer `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx` is wrapped in `React.memo` with module-level memoized remark/rehype plugin arrays and memoized element components to cut re-render cost. Heavy blocks load lazily via `next/dynamic` (`apps/web/features/chat/components/messages/MessageBubble.tsx`, `ArtifactBlock.tsx`, `InlineToolResults/index.tsx`), so Mermaid, artifacts, and tool results are code-split out of the initial chat bundle. Requirements: completed messages never re-render on new tokens for other messages; lazy chunks show a lightweight fallback; no layout shift when a lazy block resolves. 🟡 Partial — the streaming path re-parses the **entire accumulated string** per token (see Volume 05); there is no block-level incremental parser, so very long single responses re-tokenize O(n) per chunk. 🔭 Planned — block-segmented rendering that memoizes finished blocks and only re-parses the trailing open block.

## Memory

✅ Built — message-list virtualization (`react-window` v2) in `apps/web/features/chat/components/messages/AdvancedMessageList.tsx` caps mounted DOM to the visible window even for 1000+ messages, bounding heap growth. Streaming uses `AbortController` (`apps/web/lib/providerStreamClient.ts`) so aborted/unmounted streams release their reader; react-query garbage-collects inactive cache entries. Requirements (testable): scrolling a long transcript keeps mounted rows bounded (heap stable across scroll in a DevTools memory profile); navigating away from chat detaches SSE readers and listeners with no retained detached DOM; no unbounded in-memory accumulation of full transcripts outside the virtualized store. 🔭 Planned — automated leak-detection (heap-snapshot diff) in CI for the chat route.

## Network

✅ Built — delta sync (`apps/web/app/api/chat/sync/route.ts`) is cursor-based (`?since=<server_version>`) with tombstones and idempotent upsert, and bounds each page with explicit caps (`MAX_CONVERSATIONS_PULL`, `MAX_MESSAGES_PULL`, push limits), so devices transfer only changed rows instead of full snapshots. Endpoints are rate-limited (`apps/web/lib/rate-limit.ts`) and CSRF-guarded; `apps/web/proxy.ts` sets a per-request nonce CSP and security headers, and `apps/web/next.config.ts` sets HSTS. Requirements: sync pulls only rows with `server_version > cursor`; large syncs paginate rather than time out; SSE and sync requests are compressed and reuse HTTP/2 connections; no polling loop tighter than the documented interval. 🔭 Planned — request coalescing/debounce for rapid metadata writes and adaptive sync backoff on 429.

## Large Conversations

✅ Built — virtualization (`AdvancedMessageList.tsx`) plus paginated history hooks (`apps/web/features/chat/hooks/use-conversation-history.ts`) keep a 1000-message thread responsive; sync pull caps (`MAX_MESSAGES_PULL = 1000`) prevent one thread from monopolizing a page. Requirements: opening a very long conversation loads a recent window first and lazy-loads older history on scroll-up; scroll-to-bottom on new message stays O(1); the composer never blocks on transcript size. 🟡 Partial — the O(n) per-token re-parse (see Rendering) still degrades a single **very long streaming** answer. 🔭 Planned — windowed persistence and summarization/handoff for threads beyond a size threshold.

## Repository map

- `apps/web/next.config.ts` — Turbopack config, `optimizePackageImports`, bundle analyzer, header/HSTS config.
- `apps/web/proxy.ts` — per-request nonce CSP and security headers (Next.js 16 `proxy`, never `middleware.ts`).
- `apps/web/instrumentation.ts` — server instrumentation entry.
- `apps/web/app/loading.tsx` (+ per-route `loading.tsx`) — Suspense skeletons.
- `apps/web/lib/hooks/useChatStream.ts`, `apps/web/lib/providerStreamClient.ts`, `apps/web/app/api/v1/providers/[providerId]/stream/route.ts` — SSE streaming.
- `apps/web/lib/prompt-cache-helper.ts` — provider prompt-cache breakpoints.
- `apps/web/features/chat/hooks/use-chat-queries.ts` (+ sibling hooks) — react-query server-state cache.
- `apps/web/features/chat/components/messages/AdvancedMessageList.tsx` — `react-window` virtualization.
- `apps/web/features/chat/components/messages/EnhancedMarkdownRenderer.tsx` — memoized renderer; lazy blocks via `next/dynamic`.
- `apps/web/app/api/chat/sync/route.ts` — cursor delta sync with page caps.
- `apps/web/lib/rate-limit.ts` — endpoint rate limiting.

## Competitor notes

Claude, ChatGPT, and Codex all ship fast SSE token streaming, virtualized transcripts, and code-split chat surfaces, and cache conversation lists client-side. AGI Web matches that envelope but diverges deliberately: (1) the streaming path is **provider-neutral**, parsing both OpenAI- and Anthropic-shaped streams in one hook so multi-provider Managed-Cloud output performs identically; (2) network efficiency is built on the same Neon delta-sync APIs AGI hosts (cursor + tombstones), not an opaque proprietary sync; (3) per-surface trust holds — the same shared rendering/virtualization components are reused on Mobile and Desktop, but Web caches and syncs only cloud content, with no Local/BYOK path to optimize. Competitor implementations are parity references only; no competitor code or branding is copied.

## Acceptance / Definition of Done

Production-ready when the chat route loads within its JS budget, streams first token promptly, keeps a 1000-message thread scroll-responsive with bounded heap, syncs only deltas, and shows no console/network errors under load.

- [ ] Build: bundle-analyzer run recorded; every top-level route has a Suspense/`loading.tsx` fallback; heavy blocks are `next/dynamic`; a 1000-message thread scrolls at 60fps with bounded mounted rows.
- [ ] Trust: react-query and prompt caches are user-scoped and cleared on sign-out; sync pulls only the caller's Managed-Cloud rows; no authenticated payload cached in a shared/CDN layer; no Local/BYOK code path exists.
- [ ] Security: SSE and sync endpoints rate-limited and CSRF-guarded; `proxy.ts` nonce CSP + HSTS active; abort releases stream readers with no retained detached DOM.

## Anti-patterns

- Buffering the whole response before rendering, or blocking the main thread on stream parsing instead of first-token streaming.
- Caching an authenticated chat payload in a shared/CDN cache, or letting a react-query/prompt cache survive sign-out or cross users.
- Rendering an unvirtualized 1000-message list, or re-rendering completed messages on every incoming token.
- Full-snapshot sync instead of cursor deltas; polling tighter than the documented interval; ignoring 429 backoff.
- Adding any Local or BYOK optimization path, provider-key cache, or "run locally" affordance to AGI Web — Web is cloud-only.
- Hardcoding or inventing a model ID in a perf heuristic instead of reading `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby"), credit top-ups, or Supabase; using `middleware.ts` instead of `proxy.ts`.
