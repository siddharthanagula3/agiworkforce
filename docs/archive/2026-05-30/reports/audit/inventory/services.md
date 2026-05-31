# Inventory Audit — Backend Services (api-gateway + signaling-server)

Slice: `services/api-gateway`, `services/signaling-server`
Auditor mode: RECON, read-only. Date: 2026-05-29.
Anchors read: `services/AGENTS.md`, `docs/agent-context/known-flaws.md` (CLOUD-01), README of each service.

Overall: **Both services are genuinely written, well-structured, security-conscious code — not stubs.** This is some of the most mature code in the repo. The headline issues are (1) a database-client abstraction whose "RLS defense-in-depth" comments describe protection that does not actually exist, and (2) a per-token revocation/logout feature that is dead for the tokens the gateway actually mints. Neither is an open IDOR (ownership is enforced at the app layer), so severities are P1/P2, not P0.

---

## 1. Purpose & Architecture

### api-gateway (`services/api-gateway`)
Node/Express 5 + `ws` HTTP/WebSocket gateway for the mobile companion and future managed/private compute. Entry point `src/index.ts`. Mounts ~17 route groups under `/api/*`, an outbound-worker protocol at `/`, a WS server at `/ws`, plus `/health` and `/api/v1/status`.

- **Auth**: `src/middleware/auth.ts` — JWT (HS256, issuer `agiworkforce-api-gateway`, audience `agiworkforce`) verified with `JWT_SECRET`; Clerk tokens verified via `@clerk/backend` when issuer differs. Adds a per-jti revocation check (fail-closed on DB error) and a 60s-cached `account_status` kill-switch (fail-closed).
- **LLM proxy**: `src/routes/llm.ts` (`/api/llm/v1/chat/completions`) and `src/routes/cloudChat.ts` (`/api/cloud-chat/send`) — proxy to Anthropic/OpenAI/Google with server-held keys, normalize to OpenAI shape, stream SSE. Provider resolution is catalog-driven via `@agiworkforce/types` `getModelMetadataById` (no hardcoded model IDs — complies with the models.json lock).
- **Managed compute gate**: `src/middleware/managedComputeGate.ts` — fails CLOSED; requires `AGI_MANAGED_COMPUTE_PRIVATE_BETA=1` env AND `x-agi-managed-compute-beta: 1` header. Correctly enforces CLOUD-01 on the actual compute paths.
- **Credits/metering**: `src/routes/credits.ts` (balance/check/deduct via RPCs), `src/routes/usage.ts`.
- **Rate limiting**: `src/middleware/rateLimit.ts` — per-endpoint configs, user-id-keyed (IP fallback), optional Redis store via `RATE_LIMIT_REDIS_URL`/`UPSTASH_REDIS_REST_URL`.
- **Outbound worker protocol**: `src/worker/{registration,assignment,heartbeat,types}.ts` — direction-inversion bridge; 4-tier auth ladder (OAuth / environment_secret / session_ingress / trusted_device).
- **MCP proxy**: `src/mcp/*` — config-allowlisted stdio/http MCP servers with SSRF guards.
- **DB access**: `src/lib/neonClients.ts` — a hand-rolled Supabase-PostgREST-lookalike query builder over `@neondatabase/serverless`.

### signaling-server (`services/signaling-server`)
WebRTC signaling relay for desktop↔mobile pairing. Entry `src/index.ts` (~1686 lines, single file). Pairing code keyspace 36^8, per-role HMAC `pairToken` (C2), constant-time secret comparison, origin allow-listing on WS, per-IP connection + message rate limits with auto-blacklist (DDoS), Zod-validated WS messages with strict control-action allowlist, graceful shutdown, Prometheus metrics, admin endpoints behind API key. DB in `src/db.ts`, connection lifecycle in `src/connection-manager.ts`, middleware in `src/middleware/*`.

### Boundary check
No service imports a UI package. Dependencies are providers/types/llm-* workspace packages only (verified in both `package.json`). Complies with the services boundary rule.

---

## 2. Alive vs Dead

**api-gateway — all route modules are ALIVE** (imported and mounted in `src/index.ts:18-49,116-137`): auth, deviceAuth, desktop, sync, mobile, credits, providerHealth, models, cloudChat, llm, providerStream, usage, enterprise, agents, mcp, plus worker registration/assignment/heartbeat. `src/routes/chat.ts`, `src/routes/dotfile.ts`, `src/routes/pair.ts` are NOT mounted in `index.ts` (see below).

- **`src/routes/chat.ts` — DEAD (not mounted).** Defines a full chat router but `index.ts` has no `app.use('/api/chat', chatRouter)`. No import. Orphan.
- **`src/routes/dotfile.ts` — DEAD (not mounted).** Full router, never imported in `index.ts`. Orphan.
- **`src/routes/pair.ts` — DEAD (not mounted).** Full pairing router, never imported in `index.ts`. (Mobile pairing flows through `mobile.ts` → signaling instead.) Orphan.
- `src/tools/file_edit.ts` — present with its own test; not referenced from any mounted route. Appears to be a tool helper not wired into a live path (orphan-ish; low risk).
- `src/middleware/planGate.ts` (`requireProPlan`) — ALIVE, used by `cloudChat.ts:34`.
- `src/services/approvalRouting.ts`, `approvalPolicy.ts`, `skillsCatalog.ts` — referenced by mounted routes/mcp; treat as alive (not individually traced line-by-line).

**Revocation infrastructure is effectively DEAD CODE for issued tokens** — see Issue P1-A: the only `jwt.sign` (deviceAuth.ts:165) omits `jti`, so the H7 revocation check (auth.ts:124-168), the `revoked_jwts` table, and `/auth/logout` revocation (auth.ts:87-113) never fire for real tokens.

**signaling-server — all source ALIVE**: index, db, logger, metrics, constants, connection-manager, and all of `middleware/*` are imported from `index.ts`.

`apps`/`packages` do not import service internals (boundary respected); these are deployable boundaries, so "alive" means reachable from the service's own entry point.

---

## 3. Test Coverage

- **api-gateway**: 16 `*.test.ts` files, ~113 `it/test` cases. Covers auth middleware, rate limit, managedComputeGate, ids validation, and routes auth/enterprise/deviceAuth/llm/cloudChat/usage, integration app test, worker test, provider stream (live, likely network-gated), MCP sharedClient, file_edit tool. Good negative-path coverage on auth and managed gate. Gaps: no dedicated test seen for `neonClients.ts` query-builder correctness (the PostgREST-shim is the riskiest untested unit — see Issue P2-B/P2-D), credits deduct idempotency, or sync ownership.
- **signaling-server**: 4 `*.test.ts` files, ~52 cases — connection-manager, websocket/messages, http/pairings, http/health. Reasonable for the surface.

Honest note: I did not run the suites (RECON is read-only / no builds). Counts are static greps of `it(`/`test(`.

---

## 4. Panic / Crash Sites

TypeScript, so no Rust `panic!/unwrap/expect`. Crash-equivalents are uncaught throws.

- 184 `throw new (Error|AppError)` sites in api-gateway src (non-test). Express 5 natively forwards async-handler rejections to the error handler (`asyncHandler.ts` is `@deprecated` and confirms this), and `errorHandler.ts` converts `AppError`→its statusCode and everything else→500. So these throws are **handled, not user-reachable crashes**. Raw `throw new Error` sites (env.ts:7, websocket.ts:563, mcpProxy.ts:421, sharedClient.ts:122, neonClients.ts:66, deviceAuth.ts:216, worker/types.ts:211-223) are all inside try/catch or request handlers.
- `process.exit(1)` only at startup env-validation failure (`index.ts:55`) — intended.
- signaling-server installs `uncaughtException` and `unhandledRejection` handlers that trigger graceful shutdown (index.ts:1207-1216) — defensive, not a crash bug.

No user-reachable panic/crash on a common path found.

---

## 5. TODO / FIXME / HACK

- **api-gateway non-test**: 1 match, and it is a FALSE POSITIVE — `deviceAuth.ts:34` "user code formatted as XXXX-XXXX" (a format string, not an XXX marker).
- **signaling-server**: 0.
- No genuine TODO/FIXME/HACK debt markers in shipping service src. (The `models.ts:67` "hardcoded, later migrated to database" comment is a static-catalog note, not a stub — see AI-slop §7.)

This is unusually clean.

---

## 6. Security-Sensitive Code & Concerns

### Strong / correct
- **Managed-compute gate fails closed** (managedComputeGate.ts:82-110) and is applied on the real compute paths: `llm.ts:701`, `cloudChat.ts:467`, `providerStream.ts:184`. CLOUD-01 honored on the inference paths.
- **Upstream key leak guardrail** (llm.ts:363-370): every upstream `fetch` builds a fresh header object; the code explicitly forbids copying `req.headers` so the user's JWT is never forwarded to the provider. Google key passed via header not query (no key-in-URL logging).
- **Auth kill-switch & revocation fail closed** on DB error (auth.ts:139-166, 192-199) → 503, not fail-open.
- **SQL identifier hardening** (neonClients.ts:63-68 `assertIdentifier`): table/column names regex-validated and quoted; values are always parameterized (`$n`). No string-concatenated user values into SQL. RPC arg names also validated.
- **MCP SSRF defense** (mcpConfig.ts:78-88): HTTP transport URLs reject loopback/private/link-local; stdio commands restricted to a fixed allowlist with shell-metacharacter and path-separator rejection (mcpConfig.ts:48-59). MCP config is operator-supplied (`mcp-servers.json`), not user-supplied — bounded surface.
- **signaling-server**: per-role HMAC pairToken bound to `(code, role, expiresAt)` with constant-time compare; uniform 404s to prevent code-enumeration oracle; WS origin allowlist + internal-secret fallback for no-Origin clients; `TRUST_PROXY`-gated XFF (spoof-resistant rate limits); rejection-sampled random pairing codes (no modulo bias).
- **CORS**: explicit allowlists in both services (api-gateway index.ts:75-101; signaling index.ts:264-283). Helmet on api-gateway; OWASP security headers middleware on signaling.

### Concerns (detailed in §8)
- **No per-user RLS actually applied** despite ~50 comments claiming "RLS defense-in-depth" (P1/P2).
- **Issued JWTs carry no `jti`** → logout/revocation dead (P1).
- **session_ingress "JWT" is unsigned base64 JSON** → forgeable integrity (P2, reachability-limited).
- **No pino `redact` paths** in either logger (defense-in-depth gap, no confirmed exposure site) (P3).
- **Credits routes are NOT behind the managed-compute gate** (P3 / open question — CLOUD-01 boundary).
- **Outbound-worker protocol mounted at `/` with no managed-compute gate** (open question — managed-adjacent surface vs CLOUD-01).
- **In-memory rate limiting** is per-instance unless Redis configured (P1-23, known, surfaced loudly at startup).

---

## 7. AI-Slop

- **Misleading "RLS defense-in-depth" comments (pervasive).** `getUserScopedClient(_userId)` (neonClients.ts:476-478) **ignores its argument and returns the service-role client**. There is no `SET LOCAL`, no `request.jwt.claims`, no role switch anywhere (grep confirms the only `auth.uid()` mention is a comment in llm.ts:746). Yet ~50 call sites and comments (credits.ts:71-73, llm.ts:144-148/745-748, planGate.ts:54-56, cloudChat.ts:70-72, agents.ts/desktop.ts ownership helpers, etc.) assert "RLS-bound client … RLS adds defense in depth so a missing-filter regression cannot leak." That backstop **does not exist** through this client. This is confident-sounding documentation describing a security control that isn't implemented. (Severity is P1/P2 because explicit `.eq('user_id', …)`/ownership checks DO carry the load — see §8.)
- **`enterprise.ts:152` PostgREST embedded-join syntax silently broken.** The select string `organization:organizations ( … )` is Supabase resource-embedding syntax, but `assertColumnList` (neonClients.ts:71-79) collapses any select containing `(` to `SELECT *`, so the embedded relation is never returned. `row.organization` is always undefined and `.filter((row) => row.organization)` drops every row → `GET /api/v1/enterprise/organizations` always returns `{ organizations: [] }`. The shim mimics Supabase's API shape but not its relational-embedding semantics; this is a copy-of-Supabase-patterns slip. (Only this one site uses embedded joins — verified by grep `[a-z_]+:\s*[a-z_]+ \(`.)
- **session_ingress token called a "JWT" but is unsigned base64 JSON** (worker/assignment.ts:53-61 mint, :88-102 verify; worker/types.ts:29-30,55 docstrings repeatedly call it a "JWT"). It is `base64url(JSON)` with no signature — the name oversells the guarantee.
- **Three fully-built but unmounted routers** (`chat.ts`, `dotfile.ts`, `pair.ts`) — substantial dead code that duplicates concerns handled elsewhere (mobile pairing, etc.). Looks like superseded-but-not-removed surface area.
- `models.ts:67` "Static model catalog (hardcoded, later migrated to database)" — large in-file `MODEL_CATALOG`. This is a public, unauthenticated catalog endpoint returning static data; not user-deceptive (it's real catalog data, not fabricated metrics), but it is a hardcoded blob with a deferred-migration note.

No fabricated metrics/RNG values rendered to users were found in non-test paths.

---

## 8. Severity-Ranked Issues

### P1-A — Per-token revocation & logout are dead for every token the gateway issues
- **Evidence**: The only `jwt.sign` in the service is `deviceAuth.ts:165` (`jwt.sign({ userId, email }, JWT_SECRET, { expiresIn, issuer, audience })`) — **no `jti`**. `auth.ts:124` only runs the revocation check `if (typeof payload.jti === 'string' && payload.jti.length > 0)`. `/auth/logout` (auth.ts:87-96) explicitly bails to `{ ok: true, revoked: false }` and logs "legacy token without jti — no revocation possible" when jti is absent — which is *always*. So the `revoked_jwts` table, the H7 check, and logout-revocation are non-functional for current tokens.
- **Window**: `ACCESS_TOKEN_EXPIRES_SECONDS = 604800` (deviceAuth.ts:27) → a leaked token is valid for **7 days** and cannot be individually revoked. Mitigation that DOES work: the `account_status` kill-switch (auth.ts:170-208) disables a whole account within ~60s. So account-level revocation works; per-token sign-out does not.
- **Fix hint**: add `jti: crypto.randomUUID()` to the `jwt.sign` payload in deviceAuth.ts; then logout/H7 begin functioning. Consider shortening the 7-day access token and adding refresh-token rotation.

### P1-B — "RLS defense-in-depth" is asserted everywhere but not implemented; tenant isolation rests entirely on explicit filters
- **Evidence**: `getUserScopedClient` (neonClients.ts:476-478) `return getServiceClient();` — userId ignored, no session role/claims set. No `SET LOCAL`/`set_config`/`request.jwt` anywhere (grep). The comments in credits.ts, llm.ts, planGate.ts, cloudChat.ts, agents.ts, desktop.ts claim a Postgres-RLS backstop that this client cannot provide (the `@neondatabase/serverless` HTTP call carries no per-user identity).
- **Why P1 not P0**: I verified the by-id / user-scoped routes all enforce ownership at the application layer — `cloudChat` `verifyConversationOwnership` (compares `conversation.user_id !== userId`, masks 404), `agents` `verifyDesktopOwnership`, `desktop.ts:219-222`/:272-273 (`desktop.user_id !== user.userId → 404`), `sync.ts:96` validates body `user_id` matches the token, and writes carry `.eq('user_id', …)`. **No open IDOR found.** The risk is latent: the moment any future query fetches a tenant resource by id alone trusting the (nonexistent) RLS, it becomes a P0 cross-tenant leak.
- **Fix hint**: either (a) actually scope the client (set a per-request Postgres role / JWT claims and rely on RLS), or (b) delete the false "RLS defense-in-depth" comments and document that explicit `.eq('user_id', …)` + ownership checks are the *sole* isolation mechanism, and add a lint/test asserting every user-scoped query carries the filter.

### P1-C — In-memory rate limiting is per-instance (multi-instance bypass)
- **Evidence**: rateLimit.ts:5-6,165-220 — without `RATE_LIMIT_REDIS_URL`/`UPSTASH_REDIS_REST_URL`, `express-rate-limit` uses MemoryStore; with N instances the effective limit is N×max. Acknowledged (P1-23) and surfaced loudly at startup (`warnIfMultiInstanceWithoutRedis`, called from index.ts:60). Signaling-server has the same shape (no Redis store).
- **Fix hint**: provision Redis before paid-tier / managed launch; the wiring already exists (rateLimit.ts:39-49). Until then financial limits (credits-deduct 5/min) are only nominal under horizontal scale.

### P2-A — `session_ingress_token` is an unsigned base64 JSON blob (forgeable integrity), mislabeled "JWT"
- **Evidence**: `mintSessionIngressToken` (worker/assignment.ts:53-61) emits `base64url(JSON.stringify({environment_id, work_id, iat, exp}))` with NO HMAC/signature; `verifySessionIngressToken` (:88-102) only checks field equality + expiry. Anyone who can supply matching `environment_id`+`work_id` forges a valid Tier-3 token for `/work/:wid/ack` and `/work/:wid/complete`.
- **Reachability (limits severity)**: `work_id` is only handed out by the poll endpoint, which requires the hashed `environment_secret` (Tier 2). So it is not blind-forgeable from nothing; the exposure is integrity of ack/complete for a party who has already observed valid IDs (e.g., via logs, a compromised worker, or replay).
- **Fix hint**: HMAC-sign the token with `JWT_SECRET` (or mint a real signed JWT) and verify the signature in `verifySessionIngressToken`. The `hashSecret` pattern at assignment.ts:47-51 shows the keyed-hash primitive is already available.

### P2-B — Enterprise `/organizations` always returns empty (PostgREST embedded-join unsupported by the Neon shim)
- **Evidence**: enterprise.ts:147-184 selects `organization:organizations ( … )`; neonClients.ts:71-79 collapses any parenthesized select to `*`, so the embedded relation is absent; the `.filter((row) => row.organization)` then drops every row. Enterprise routes are documented as "foundation endpoints only" and are CLOUD-01-gated, so user impact is presently limited.
- **Fix hint**: replace the embedded join with an explicit second query / JOIN, or teach the shim to parse embeds. Add a test that asserts a non-empty result for a member with an org.

### P2-C — Misleading "RLS"/security comments at scale (documentation rot, security-relevant)
- Same root as P1-B but tracked separately as a code-quality/AI-slop item: ~50 comments assert a control that doesn't exist. These actively mislead future maintainers into dropping ownership filters. Fix = remove or make true (see P1-B fix).

### P2-D — Hand-rolled `neonClients` query builder is untested and silently lossy on unsupported features
- **Evidence**: neonClients.ts implements a broad Supabase-lookalike (`.from().select().eq()….single()/.maybeSingle()/.rpc()`). It silently degrades on embedded selects (P2-B) and the `.not(col,'in',value)` mapping (neonClients.ts:246-248) maps `not in` to `!=` (a single-value inequality, NOT a NOT IN list) — a subtle semantic bug if any caller uses it. No dedicated unit test seen for the builder.
- **Fix hint**: add unit tests for select/insert/update/delete/upsert/rpc + the `.not()` operator mappings; fix or remove the `not('…','in',…)` case.

### P3-A — No log redaction configured (defense-in-depth)
- **Evidence**: `lib/logger.ts` (api-gateway) and `src/logger.ts` (signaling) construct pino with no `redact` paths. No confirmed secret-logging site was found — mobile.ts does NOT log `SIGNALING_INTERNAL_SECRET` or `pairTokens` (verified), and llm.ts truncates upstream error bodies to 500 chars. Risk is future accidental logging of `authorization`/`token`/`secret` fields.
- **Fix hint**: add `redact: ['req.headers.authorization', 'authorization', '*.token', '*.secret', '*.pairToken*']`.

### P3-B — Credits routes are not behind the managed-compute gate (CLOUD-01 scope question)
- **Evidence**: `/api/credits/*` (index.ts:122) is auth + rate-limited but has no `requireManagedComputeEligibility`/`requireProPlan`. Credit deduct/balance is billing/metering, which CLOUD-01 lists among controls that must be solved before public managed launch. Likely intentional (deduction is post-hoc metering, and the actual compute is gated), but worth an explicit decision.
- **Fix hint**: confirm with backend/billing whether credit-ledger endpoints should be private-beta gated alongside the compute paths; document the decision.

### P3-C — Three unmounted routers (`chat.ts`, `dotfile.ts`, `pair.ts`) — dead code
- **Evidence**: none are imported in index.ts. They carry full auth + handlers and bit-rot risk.
- **Fix hint**: delete, or mount + test, or move behind a feature flag with a tracked gap.

---

## 9. Open Questions / Uncertainty

1. **Neon role / RLS at the DB layer**: From `services/` alone I cannot see the role the `NEON_DATABASE_URL` connection uses or whether RLS policies exist on `conversations`/`subscriptions`/`usage_events`/etc. The *client-side* fact is certain (no SET LOCAL / no JWT claims → no per-user RLS via this client). Whether the DB has RLS that would catch a service-role connection (it would not, service-role bypasses RLS) and what the connection string's role is — open. Migrations live in `apps/web/db/neon` (NEON-01), outside this slice.
2. **Outbound-worker subsystem and CLOUD-01**: `worker/{registration,assignment,heartbeat}` are mounted at `/` (index.ts:135-137) with their own Tier-2/3 auth but **no managed-compute gate**. This is a managed-adjacent execution surface (it assigns work units and hands out `api_base_url` for LLM/CCR calls). Should it be private-beta gated like llm/cloudChat under CLOUD-01? Needs a product/security decision; flagged as a potential finding, not asserted as a violation.
3. **`pairTokens` round-trip**: mobile.ts:300-307 returns BOTH the desktop and mobile pair tokens in the mobile client's response, with an in-code admission that the desktop token "should NOT round-trip through the mobile response" once persistent device routing exists. Is this Wave-3 transitional shape acceptable, or a token-leak to verify against the mobile surface?
4. **`providerStream.ts` live test** (`src/__tests__/providerStream.live.test.ts`) — appears network-gated; coverage of the streaming path under CI is uncertain (not run here).
5. Test suites were not executed (RECON / no-build constraint); pass/fail state is unknown — counts are static.
