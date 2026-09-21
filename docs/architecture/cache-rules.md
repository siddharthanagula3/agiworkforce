# Cache rules

Status: Current
Owner: Platform/infrastructure
Last updated: 2026-09-20

Every cache in the hosted product, with the eight facts a reviewer asks about
each one: what the value's source of truth is, how its key is built, how it is
isolated between tenants, how long it lives, what invalidates it, what happens
when the cache is unavailable, how stale a hit may be, and whether it may hold
sensitive data.

This file describes what the code does today. Where a cache has no invalidator
other than its own expiry, the row says so; that is the honest answer, not an
omission.

## 1. The store beneath most of them

The shared key-value store is resolved once, in
`packages/platform/key-value/src/factory.ts`. `selectKeyValueProvider` reads
`AGI_KV_PROVIDER` when it is set and otherwise infers the provider from the
credentials the process carries: Upstash when Upstash credentials exist, a
local Redis when `AGI_KV_REDIS_URL` is set, and `none` otherwise. `none` is a
real state: `getKeyValueStore()` returns null and every caller below takes its
no-store path.

Every store the factory builds is wrapped by
`createCircuitBreakerKeyValueStore` (`circuit-breaker.ts`). The breaker trips on
consecutive failures rather than on a windowed rate
(`KEY_VALUE_BREAKER_CONTRACT.trip`), defaults to 5 failures and a 10 second
cooldown (`DEFAULT_KEY_VALUE_BREAKER_POLICY`), and is scoped per store instance.
`AGI_KV_BREAKER_FAILURE_THRESHOLD` and `AGI_KV_BREAKER_COOLDOWN_MS` override the
two numbers. A memory fallback serves only keys the caller's `degradable`
predicate accepts, because a counter or an idempotency key answered from process
memory would become a second source of truth per instance.

## 2. Server caches

| Cache                        | Source of truth                                    | Key                                                                       | Tenant isolation                           | TTL                                                                           | Invalidator                                     | On failure                                      | Stale tolerance                             | Sensitive data                               |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| Exact response cache         | The model call it stands in for                    | `agi-xrc:<callType>:<tenantId>:sha256(prompt, model, route, release sha)` | Tenant id is a key segment                 | 7 days for conversation titles                                                | Expiry, and a release sha change rebuilds keys  | Fail-open: logged, treated as a miss            | Up to the TTL; input is in the hash         | Prompt text is hashed, never stored as a key |
| Semantic response cache      | The model call it stands in for                    | `agi-src:<callType>:<tenantId>:<digest>`                                  | Tenant id is a key segment                 | 24 hours (`DEFAULT_TTL_SECONDS`)                                              | Expiry, and a release sha change rebuilds keys  | Fail-open: logged, treated as a miss            | Up to the TTL                               | Same as above                                |
| Request context cache        | Postgres: account status, active organization      | `req-ctx:v1:<kind>:<userId>`                                              | Keyed by user id                           | 5 minutes (`REQUEST_CONTEXT_CACHE_TTL_SECONDS`)                               | Expiry; writes are deferred with `after()`      | Bounded read; an abandoned read is a miss       | Up to 5 minutes                             | Status and organization id only              |
| IP allow list cache          | `organization_ip_allow_lists` in Postgres          | In-process `Map` keyed by organization id                                 | Keyed by organization id                   | 30s fresh, 300s last-known                                                    | `invalidateIpAllowListCache(organizationId)`    | Falls back to the last known list, then refuses | 30s normally, 300s while the source is down | CIDR ranges                                  |
| Provider proxy access gate   | The managed compute access decision                | `provider-proxy:gate:v1:<sessionId>`                                      | Keyed by sandbox session id                | 30 seconds                                                                    | `delete` on the session key, plus expiry        | An in-process map mirrors the same 30s window   | 30 seconds                                  | An allow or deny decision, not credentials   |
| Connector directory snapshot | The upstream connector directory ingest            | `connectors.directory.snapshot` / `v1`, in Neon                           | Not tenant scoped: the directory is public | 7 days snapshot, 30 days sync state                                           | The ingest job overwrites the entry             | A miss re-reads the source                      | Up to 7 days                                | Public catalogue data                        |
| Plugin directory snapshot    | The plugin directory ingest                        | `plugins.directory.*`, parameterised by `CACHE_PARAMS_VERSION`            | Not tenant scoped: the directory is public | 7 days snapshot, 30 days sync state and inspections, 90 days installed skills | The ingest job overwrites the entry             | A miss re-reads the source                      | Up to the entry's TTL                       | Public catalogue data                        |
| MCP runtime discovery        | The MCP server's own tools listing                 | `organization:<organizationId>:shared:<rowId>` for a shared server        | Organization id is the first key segment   | 24 hours (`DISCOVERY_TTL_MS`)                                                 | Expiry; a schema-missing error degrades to none | Undefined table or column is tolerated          | Up to 24 hours                              | Tool names and schemas                       |
| Rendered page input          | The probe or catalogue query the page renders from | `renderCacheKey(parts)`, always carrying `locale=`                        | Only shared pages use it; no account data  | 60s for live signals, 300s for catalogue content                              | `RENDER_CACHE_TAGS`, revalidated by tag         | A missing incremental cache recomputes inline   | 60s or 300s by profile                      | None: signed-in pages do not use this path   |

`agi-xrc` and `agi-src` keys carry the release sha inside the hashed payload, so
a deploy changes every key rather than invalidating anything: entries written by
the previous release are never read again and expire on their own.

## 3. Client caches

`packages/client/client-runtime/src/cache-namespace.ts` is the isolation rule for
everything a client stores locally. A cached value belongs to a `CacheScope` of
an account and a workspace, and `namespacedCacheKey` appends `::@<account>/<workspace>`
to the base key. Personal is the segment `personal`, a workspace of its own
rather than the absence of one, which is what stops personal content appearing
inside an organization. An unauthenticated scope is `anonymous`.

On the web, `finalizeWorkspaceSwitch`
(`apps/web/features/workspaces/lib/workspace-cache-scope.ts`) cancels in-flight
queries before it re-scopes, so a response issued under the previous workspace
cannot repopulate the cache after the switch, then clears the React Query cache
and navigates away from any route whose identifier belonged to the old
workspace.

`scripts/check-workspace-cache-scope.mjs` enumerates every client source file
under `apps/web/shared`, `apps/web/features` and `apps/web/app`, collects each
literal `localStorage` and `sessionStorage` key and each persisted store name,
and requires every one of them to be swept when the account changes. One key is
exempt, with its reason recorded in the guard: `theme`.

## 4. Rules that hold for all of them

**Source of truth.** No cache is authoritative. Every row above names a store or
an upstream service that the cached value is derived from, and a cache miss is
always answerable by re-reading that source.

**Failure behaviour.** The response caches fail open, because a miss costs a
model call and nothing else. The key-value breaker fails fast for keys the
caller has not marked degradable, because a counter or a reservation answered
from memory would diverge per instance. The IP allow list is the exception that
proves the rule: it keeps a last-known list for five minutes so a database
outage does not lock every administrator out of their own workspace, and refuses
once that window passes rather than admitting everyone.

**Sensitive data.** No cache above stores credentials. Prompt and response text
reaches a key only as a sha256 digest. Route responses that carry account data
are marked `private, no-store` instead of being cached at all;
`apps/web/lib/private-cache-policy.ts` lists the route files this applies to and
is enforced per route file rather than by convention.

**Stale tolerance.** Every entry's staleness is bounded by its TTL, and no row
above serves an entry past its expiry. The two caches with an explicit
invalidator (the IP allow list and the provider proxy gate) can be cleared
sooner; the rest wait for expiry, which is why none of them holds a value whose
correctness matters within one TTL of a change.

## 5. What this document does not cover

Desktop and CLI local caches (`apps/desktop/src-tauri/src/data/cache/`,
`apps/cli/src/models_cache.rs`, `apps/cli/src/tier_cache.rs`) live on the user's
own machine, hold only that user's data, and are covered by
`docs/architecture/desktop-local-runtime.md`. Provider-side prompt caching is a
billing and latency concern rather than a store this product owns; see
`packages/contracts/types/src/prompt-cache-plan.ts`.
