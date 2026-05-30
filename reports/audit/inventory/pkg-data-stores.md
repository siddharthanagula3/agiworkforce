# Inventory Audit — TS data + stores + services packages

Slice: `packages/data-layer`, `packages/stores`, `packages/services`
Auditor pass: read-only recon. No source edited. No builds run.
Date: 2026-05-29

Anchor docs consulted: `docs/agent-context/known-flaws.md` (NEON-01, BOUNDARY-01, CLOUD-01, PRIVACY-01) and `docs/engineering/service-layer-architecture.md`. Their claims verified against code; staleness noted inline.

---

## Purpose & Architecture

### packages/data-layer (`@agiworkforce/data-layer`, v0.0.1, private)
Cloud-provider-portable persistence/auth/storage/realtime boundary. The stated goal (index.ts:17-22) is to keep provider seams explicit so migration/compat code cannot silently select a legacy backend — this aligns with NEON-01 ("Neon is the only managed database path").

Modules:
- `src/types.ts` — vendor-neutral interfaces (`DatabaseAdapter`, `AuthAdapter`, `StorageAdapter`, `RealtimeAdapter`), `VerifiedJwt`, error classes (`NotImplementedError`, `DataLayerConfigError`). Pure types + 2 error classes; no runtime logic beyond error message construction.
- `src/factory.ts` — `create{Database,Auth,Storage,Realtime}Client()` entry points. Reads explicit opts or env (`AGI_DATABASE_PROVIDER` default `neon`, `AGI_AUTH_PROVIDER` default `clerk`; storage/realtime have NO default and fail-closed). Browser-safe `readEnv` (factory.ts:55-58).
- `src/adapters/neon.ts` — the ONE live DB adapter. Backed by `@neondatabase/serverless` `Pool`, lazy-loaded (neon.ts:103-116) so import never opens a socket. Implements `query/execute/transaction/withUser/dispose` plus `raw()`. RLS binding via `SET LOCAL request.jwt.claim.sub = $1` inside a one-shot transaction. Child adapters from `withUser()` share the parent pool and do NOT end it on dispose (ownsPool flag, neon.ts:201-222, 362-377). Inner `NeonTransactionAdapter` (neon.ts:403-434) forbids nested transactions and `withUser` on a tx.
- `src/adapters/clerk.ts` — the ONE live auth adapter. `verifyJwt()` delegates to `@clerk/backend` `verifyToken` (lazy-loaded), normalizes `sub`→`userId`. `refreshToken()` is an intentional `NotImplementedError` (clerk.ts:99-106) — Clerk handles refresh via cookies/native SDK.
- `src/adapters/postgres.ts` — explicit, documented SKELETON. Every method throws `NotImplementedError` with a migration guide (postgres.ts:114-138). This is the `pg`-based path; `pg` is intentionally NOT a dependency yet.

Auth/storage/realtime non-default providers (`auth0`, `cognito`, `s3`, `r2`, `b2`, `pusher`, `ably`, `self-hosted`) all throw `DataLayerConfigError` from the factory (factory.ts:179-237) — documented targets, no adapters shipped. Fail-closed by design.

### packages/stores (`@agiworkforce/stores`, v0.0.1, private)
EMPTY PLACEHOLDER. `src/index.ts` is 16 lines, all comments ("Stores will be exported here as they are created in subsequent waves."). Declares runtime deps `zustand`, `immer`, `@agiworkforce/api`, `@agiworkforce/runtime`, `@agiworkforce/types`. No store code exists.

### packages/services (`@agiworkforce/services`, v0.0.1, private)
Shared cross-surface service layer. Currently ONE service:
- `src/artifacts.ts` — `publishArtifact(input)`. v1 LOCAL-ONLY artifact publish boundary. `privacyMode==='local'` → writes via injected `LocalFileWriter`, validates trust boundary, returns `file://` `LocalPublishResult`. `byok|managed` → returns `{kind:'waitlist'}` with NO network call (artifacts.ts:218-220), correctly honoring the v1-local-only / CLOUD-01 lock. Enforces `assertSurfaceCanSyncChats` (rejects cli/vscode/chrome) and `assertGeneratedFileTrustBoundary` from `@agiworkforce/types`.

Conforms to `service-layer-architecture.md`: explicit params, structured discriminated-union return, host adapter injected (no platform dependency in the service), failures explicit.

---

## Alive vs Dead

| Package | Status | Evidence |
| --- | --- | --- |
| data-layer | ALIVE (shipping) | Imported by 15+ non-test files in `apps/web` incl. `lib/server/neon-db.ts`, stripe-webhook handlers, `app/api/llm/v2/chat/route.ts`, audit/credit/subscription/api-key/org/waitlist services. `getNeonDb()` is a real singleton (neon-db.ts:8-16). |
| data-layer / NeonDatabaseAdapter | ALIVE | Selected by `createDatabaseClient({provider:'neon'})`. |
| data-layer / ClerkAuthAdapter | **DEAD in current closure** | Repo-wide grep for `createAuthClient(` and `ClerkAuthAdapter` returns ZERO production call sites (only the package + tests). Web routes use `@clerk/nextjs/server` `auth()` directly (neon-chat.ts:2). The data-layer auth adapter is built + tested but not wired into any shipping path. |
| data-layer / createStorageClient + createRealtimeClient | **DEAD in current closure** | Zero call sites repo-wide. |
| data-layer / PostgresDatabaseAdapter | DEAD-by-design (skeleton) | Reachable from factory only if `AGI_DATABASE_PROVIDER=postgres`; default is neon. Throws everywhere. Intentional. |
| data-layer / Storage+Realtime factories | DEAD-by-design | No adapters; factory throws. Documented future targets. |
| **stores** | **DEAD / ORPHAN** | Empty source. ZERO `from '@agiworkforce/stores'` import statements exist anywhere in the repo. The 56 store imports use the `@shared/stores` alias → `apps/web/shared/stores/` (a DIFFERENT location, NOT this package). Yet both `apps/web/package.json:33` and `apps/desktop/package.json:36` declare `"@agiworkforce/stores": "workspace:*"` as a runtime dependency. |
| services / publishArtifact | ALIVE | Imported by `apps/web/lib/artifact-publisher.ts`, `apps/desktop/src/features/artifacts/{publishAdapter,ArtifactPanel}.tsx`, `packages/unified-chat/src/components/ArtifactPanel.tsx`. |

Key disambiguation result (the prior P0 "incognito/chat-store collision" lives in `apps/web/shared/stores/`, OUTSIDE this slice): the `@shared/stores` alias is the live store layer; `packages/stores` is an unrelated empty shell. The collision risk is NOT in my slice.

---

## Test Coverage

| File | Tests | Quality |
| --- | --- | --- |
| `data-layer/src/__tests__/neon-adapter.test.ts` (378 LOC) | Mocks `@neondatabase/serverless`; asserts BEGIN/SET LOCAL/COMMIT/ROLLBACK ordering, pool reuse on `withUser`, dispose semantics, rowCount fallback. | Strong — exercises the RLS-binding and transaction codepaths directly. |
| `data-layer/src/__tests__/clerk-adapter.test.ts` (60 LOC) | Uses `verifyToken` test hook; empty-token, bad-signature→null, sub-normalization. | Adequate for the verify path. `refreshToken` NotImplemented path likely covered minimally. |
| `data-layer/src/__tests__/factory.test.ts` (197 LOC) | Env resolution, default selection, fail-closed throws for unknown/unimplemented providers. | Good. |
| `services/src/__tests__/artifacts.test.ts` (157 LOC) | Local file:// result, waitlist (byok/managed) no-network, trust-boundary throw on non-file:// URI, sync-rule throw for dev surfaces, missing-writer throw. | Good — covers the 5 declared branches. |
| **stores** | NONE | No source → nothing to test (`typecheck`-only package.json; no `test` script). |

`data-layer` test script uses `--passWithNoTests` and a `posttest: pnpm build`. `services` runs `vitest run`. No integration test hits a real Neon socket (by design — driver mocked).

---

## Panic / Crash sites

This is TypeScript — no `panic!/unwrap()/expect()/todo!/unimplemented!`. The equivalent is `throw`. ~34 throw sites across the three `src` trees (excluding tests):
- ~10 in `postgres.ts` / factory storage+realtime+auth0/cognito branches → intentional fail-closed `NotImplementedError` / `DataLayerConfigError`. NOT user-reachable crashes on the default neon+clerk path.
- `clerk.ts:99-106` `refreshToken` `NotImplementedError` — only thrown if a caller wrongly invokes it; web uses Clerk cookies instead. Low reachability.
- `neon.ts` `decodeJwtSub` (neon.ts:128-171) throws `DataLayerConfigError` on a malformed JWT in `withUser()`. This is reachable IF `withUser` is called with attacker-influenced input — but it throws a typed error, not a process crash, and surfaces config bugs loudly (documented intent). Not a panic.
- `artifacts.ts:224-227` throws when `privacyMode==='local'` but no `localFileWriter` supplied — programmer error, surfaced loudly. Acceptable.
- Adapter `query/execute/transaction` re-throw DB errors after best-effort ROLLBACK (neon.ts:254-263, 284-293, 317-326) — correct error propagation, not a crash bug.

No unhandled-crash sites on a common user path identified in this slice.

---

## TODO / FIXME / HACK

Only 3, all benign/documented:
- `data-layer/src/types.ts:228` — `TODO: add QueueAdapter when we ship background jobs` (forward-looking interface note).
- `services/src/artifacts.ts:30` and `services/src/index.ts:11` — `TODO: EXEC-SUMMARY-r2 hours` deferring artifact versioning (always 1 in v1) and inline editor. Documented v1 scope cut, consistent with locks.

No FIXME / HACK / XXX in any of the three `src` trees.

---

## Security-sensitive code

1. **JWT decode without signature verification** (`neon.ts:118-171`, `decodeJwtSub`). The Neon adapter base64url-decodes the JWT payload and reads `sub` WITHOUT verifying the signature, then binds it as `SET LOCAL request.jwt.claim.sub`. This is documented (neon.ts:38-41, 335-337): verification is the AuthAdapter's job and must happen BEFORE `withUser(jwt)`. The contract is sound, BUT it means RLS safety depends entirely on every caller verifying first. If any caller passes an unverified/attacker-controlled token to `withUser`, RLS would be bound to an attacker-chosen subject. Mitigating fact: see finding #4 — `withUser` is essentially never called in production routes, so this exposure is currently theoretical.

2. **SQL injection surface — LOW/clean.** All adapter methods are parameterized (`$1` placeholders). The one piece of dynamically-constructed SQL is `SET LOCAL request.jwt.claim.sub = $1` (neon.ts:250, 280, 311) — the value is bound as a parameter, NOT string-concatenated, so no injection via the JWT sub. The `sql` string itself is caller-supplied (interface contract documents "never concatenate user input into SQL", types.ts:63); injection risk lives at call sites, not in this package.

3. **Secrets handling** (`factory.ts:169-177`, `clerk.ts:62-69`). `CLERK_SECRET_KEY` / `CLERK_JWT_KEY` read from env and passed into `ClerkAuthAdapter`. No logging of secret values; constructor fail-closed when none present. Clean.

4. **RLS is built but DORMANT in the shipping web app (defense-in-depth gap).** Grep shows `.withUser(` appears ONLY in doc comments (`organization-service.ts:8`, `subscription-service.ts:8,71`, `api-key-service.ts:8,13,263`, `waitlistService.ts:93`) and test mocks — NOT in any real production route. The v2 chat route (`app/api/llm/v2/chat/route.ts:539`) gets `userClient = getNeonDb()` (the UNSCOPED service adapter) and passes `userId` from Clerk as an explicit query parameter to service functions. So tenant isolation currently relies on application-level `WHERE user_id = $1` filtering, and the Postgres-RLS `SET LOCAL` layer the data-layer provides is not engaged. This is a config/usage gap in `apps/web` (outside my slice), but it materially changes the data-layer's real-world security posture: the package's headline RLS feature is unused. Flag as P2 for the platform/web owners.

5. **Connection lifecycle / pool exhaustion.** `getNeonDb()` is a module-level singleton (neon-db.ts:6-16) — one shared pool per server process, never disposed. That is the correct serverless pattern. `withUser()` children correctly share the parent pool and never end it (neon.ts:208-210, 365-368), avoiding a "child dispose kills shared pool" bug. Transaction/query paths always `client.release()` in `finally` (neon.ts:261-263, 291-293, 324-326). No leak found.

No `exec/spawn/shell/eval`, no network egress (`fetch`), no filesystem writes in any of the three packages (the artifact local-write is delegated to an injected host `LocalFileWriter`, never performed here).

---

## AI-slop

Largely ABSENT — these three packages are unusually clean and well-documented (extensive accurate JSDoc, real implementations, real tests). Specific notes:

- `services/artifacts.ts:117-128` `makeShareToken` is a djb2 hash explicitly labeled "not a security primitive; just a correlation handle." It self-references "same pattern as artifactSharing.ts" — duplicated-logic smell, but honestly labeled. Not slop, but a candidate for dedup into one shared helper. (P3)
- `services/artifacts.ts:140-191` `buildTrustBoundaryInput` synthesizes a `ComputeSession`/`GeneratedFile`/`ArtifactManifest` tuple with hardcoded `ownerUserId:'local'`, `sourceSurface:'desktop'`, `checksumSha256:''`, `previewDerivatives:[]` purely to satisfy `assertGeneratedFileTrustBoundary`. The empty checksum and synthetic IDs are NOT rendered to users (they exist only to pass an internal assertion), so this is defensive validation scaffolding, not user-facing fabricated data. Comment (artifacts.ts:22-29) explains the intent. Acceptable, but slightly over-engineered for what it guards.
- No hallucinated APIs found: `@neondatabase/serverless` `Pool/PoolClient/QueryResult`, `@clerk/backend` `verifyToken` are real and used per their real signatures (verified against peerDeps `@neondatabase/serverless >=1.0.0`, `@clerk/backend >=3.0.0`).
- The `postgres.ts` "reference implementation sketch" in JSDoc (postgres.ts:48-99) is example-only inside a comment — not dead executable code.

---

## Broken / half-built features

1. **`packages/stores` is an empty shell still declared as a workspace dependency by two apps.** `src/index.ts` exports nothing. `apps/web/package.json:33` and `apps/desktop/package.json:36` both list `@agiworkforce/stores: workspace:*`. Nothing imports the package (zero bare-specifier imports). It also pulls `zustand`+`immer`+`@agiworkforce/api`+`@agiworkforce/runtime` as runtime deps for code that doesn't exist. Either wire the planned stores or drop the dependency + deps. (P2)
2. **PostgresDatabaseAdapter — skeleton, all methods throw.** This is intentional and documented (skeleton for a future migration), not a regression. Only reachable via `AGI_DATABASE_PROVIDER=postgres`, which the default never selects. Note, not a bug. (P3 — track so it isn't mistaken for live.)
3. **Storage / Realtime adapters do not exist** — factory throws for every provider value. Documented future work. Note. (P3)
4. **Artifact versioning + inline editor deferred** — `publishedArtifact.version` always 1; edit-in-place not wired (artifacts.ts:30-34). Documented v1 scope cut. (P3)
5. **data-layer RLS path unused in production** — see Security #4. (P2, but ownership is apps/web.)

---

## Severity-ranked issues

### P2
- **stores package is an orphan with phantom dependencies.** `packages/stores/src/index.ts` (empty) + `apps/web/package.json:33` + `apps/desktop/package.json:36`. Fix: remove the `@agiworkforce/stores` workspace dependency from both apps and the unused `zustand/immer/api/runtime` deps from `packages/stores/package.json`, OR populate the package and migrate `@shared/stores` consumers to it. Until then it's dead weight that misleads the dependency graph.
- **data-layer RLS (`withUser` / `SET LOCAL request.jwt.claim.sub`) is built + tested but never engaged in production routes** (`app/api/llm/v2/chat/route.ts:539` uses unscoped `getNeonDb()`; `.withUser(` only in comments/mocks). Fix hint (apps/web owners): either adopt `getNeonDb().withUser(verifiedJwt)` so Postgres RLS is the second line of defense, or explicitly document that app-level `WHERE user_id=$1` is the sole tenancy mechanism and remove/deprecate the `withUser` RLS feature to avoid a false sense of layered security.

### P3
- **`decodeJwtSub` (`neon.ts:128-171`) trusts an unverified JWT.** Contract requires callers verify first. Fix hint: add a runtime assertion or a clearly-named `withUserVerified(verifiedSub: string)` overload so the unsafe ordering is harder to misuse; or add a test asserting callers verify before binding. Low priority because `withUser` is currently unused (see P2).
- **`makeShareToken` djb2 duplicated** between `services/artifacts.ts:117-128` and `artifactSharing.ts` (self-referenced). Fix: extract one shared token helper.
- **Skeleton/future adapters (postgres, storage, realtime) should stay clearly flagged** so audits don't misread them as live. Already well-documented; no action beyond keeping NEON-01 row accurate.
- **ClerkAuthAdapter + auth/storage/realtime factories are dead in the current closure** (zero production call sites; only neon DB path is live). Tested scaffolding, not a defect, but the data-layer is effectively Neon-DB-only today. Fix hint: either wire `createAuthClient` into a real verify path or mark the auth/storage/realtime surface as explicitly forward-looking in the README so future audits don't assume it's load-bearing.

No P0 / P1 issues found in this slice. The packages are fail-closed, parameterized, and well-tested; the most consequential finding (dormant RLS) is an apps/web usage gap, not a defect in the package code.

---

## Open questions / uncertainty

1. RESOLVED: `createAuthClient()`, `ClerkAuthAdapter`, `createStorageClient()`, `createRealtimeClient()` have ZERO production call sites repo-wide (grep confirmed). Only `createDatabaseClient` (neon) is live. The data-layer is, in practice, a Neon-only DB adapter; its auth/storage/realtime surface is dead-but-tested scaffolding. Logged as P3 dead-code below.
2. **Is the `@agiworkforce/stores` workspace dependency load-bearing for build/typecheck ordering** (e.g., turbo/pnpm graph), or purely vestigial? Removing it should be validated against `pnpm check:boundaries` and the workspace build graph before deletion.
3. **Whether any consumer relies on `withUser` outside `apps/web`** (mobile/desktop server code, services/). I scoped the `.withUser(` grep to `apps/web`; a repo-wide confirmation would harden the "RLS unused" claim.
4. I did NOT run typecheck/build (instructed not to), so the "tests are strong" assessment is from reading test bodies, not from observing a green run.
