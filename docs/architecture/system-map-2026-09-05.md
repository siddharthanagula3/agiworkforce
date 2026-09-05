# System map, 2026-09-05

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

Verified from code and configuration, not from prose. Where
`docs/agent-context/repo-map.json` and its generated module summaries were
checked against the implementation, agreement or disagreement is noted inline.
Every coupling line answers the same five questions for its group: what
changes if the vendor disappears, what changes if a stronger model in the same
family ships, where pricing lives, how the system learns a model lost tool
support, and whether a cheaper route for an existing model needs a frontend
change.

## Applications

Six surfaces share one contract layer. None of them hold a vendor, model, or
region literal; all six route through shared packages that other groups below
own.

| Surface                 | Entry point                                                                                | Local persistence                                                                                                           | Tests                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web`              | `apps/web/app/layout.tsx`                                                                  | browser state only (`apps/web/features/chat/stores/artifacts-store.ts`); durable data lives in Postgres                     | `apps/web/e2e`, `apps/web/__tests__`                                       |
| `apps/desktop`          | renderer `apps/desktop/src/main.tsx`; privileged host `apps/desktop/src-tauri/src/main.rs` | local SQLite (`apps/desktop/src-tauri/src/data/async_sqlite.rs`, `apps/desktop/src-tauri/src/data/database/sqlite_pool.rs`) | `apps/desktop/check-wiring.sh`, `cargo test -p agiworkforce-desktop --lib` |
| `apps/mobile`           | `apps/mobile/index.js` (Expo)                                                              | on-device SQLite (`apps/mobile/storage/db.ts`), MMKV, secure storage                                                        | `apps/mobile/__tests__`                                                    |
| `apps/cli`              | `apps/cli/src/main.rs`, binary `agi`                                                       | local config/session state (`apps/cli/src/config.rs`)                                                                       | `apps/cli/tests`                                                           |
| `apps/extension`        | MV3 `apps/extension/manifest.json`                                                         | `chrome.storage`                                                                                                            | `apps/extension/__tests__`                                                 |
| `apps/extension-vscode` | `apps/extension-vscode/src/extension.ts`                                                   | VS Code global/workspace state and secret storage                                                                           | `apps/extension-vscode/src/__tests__`                                      |

The desktop seam is real and enforced both directions: every privileged call
is registered once in `apps/desktop/src-tauri/src/lib.rs`, and
`apps/desktop/check-wiring.sh` (`apps/desktop/scripts/check-wiring.mjs`,
`apps/desktop/scripts/check-wiring.node-test.mjs`) fails if the renderer calls
a command that block does not register, or the block registers one the
renderer never calls.

Coupling: a vendor change, a model upgrade, a region move, or a cheaper route
for an existing model touches none of these six trees directly. Tool-support
loss is not tracked at the surface level; it is a routing and tool-loop
concern (below).

## Model registry and routing

The curated source is `packages/ai/model-registry/catalog/models.curation.json`
plus `packages/ai/model-registry/catalog/model-families.json` for which
release of a family is live. `pnpm sync:models`
(`packages/ai/model-registry/scripts/compile.mjs`) compiles both into
`packages/ai/model-registry/generated/registry.json`, validated against
`packages/ai/model-registry/schema/registry.schema.json`, then re-exported as
`packages/contracts/types/src/models.json` and resolved through
`packages/contracts/types/src/model-catalog.ts`. `crates/agiworkforce-model-registry`
and `apps/desktop/src-tauri/src/core/llm/models_config.rs` embed that same
generated file directly, so the Rust and TypeScript views cannot drift.

| Concern                | Owner                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle stages       | `packages/ai/model-registry/scripts/lifecycle-stages.mjs` (eleven ordered stages, discovered through removed)                                           |
| Promotion gates        | `packages/ai/model-registry/scripts/family-slots.mjs` (`pnpm models:families`, `models:families:promote`, `models:families:rollback`)                   |
| Pricing                | per-model tiers inside `models.curation.json`, drift-checked by `packages/ai/model-registry/scripts/pricing-drift.mjs` against a synced OpenRouter feed |
| Runtime liveness probe | `scripts/probe-models.mjs`, one output token, no tools, no sampling                                                                                     |
| Hardcoding guard       | `scripts/check-no-hardcoded-model-ids.mjs`, `scripts/check-model-catalog-integrity.mjs`                                                                 |

Routing is `packages/ai/routing/src/auto.ts`, a pure resolver that admits
candidates by trust mode, tier ceiling, lifecycle, harness allowlist, and
capability, then ranks by route health with an explicit circuit-open state and
an optional canary bucket. Two layers sit above it without touching admission:
`packages/ai/routing/src/task-family-routing.ts` (permutes, never drops a
candidate) and `packages/ai/routing/src/free-auto.ts` (a free-lane filter that
may strand a request rather than spend money). Session stickiness and
escalation live in `packages/ai/routing/src/task-family-continuity.ts`, driven
by `docs/architecture/execution-plan-contract.md`; this is the most recently
touched file in the group, consistent with the team roster's active
route-preview work.

Coupling: dropping a vendor means removing its rows from the curation file and
its family slots, with no routing code change since the resolver only sees
registry-shaped candidates. A stronger model in an existing family is a
one-record promotion behind a family slot; no consumer touches a literal
model ID. Pricing lives in the curation file's per-model tiers, not in
billing. A cheaper route for an existing model needs only a registry or
gateway-definition change (see the provider group below), no frontend change.

Tool-support loss is **not learned anywhere** as a durable fact. The catalog
records a static, compile-time capability flag; the one runtime probe sends no
tools at all. The only related runtime behavior is the tool-turn governor
(`apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.ts`)
withdrawing a tool for the remainder of one turn after repeated failure. That
state is scoped to the turn and is never written back to the registry or seen
by another session. This is a real gap, not an unconfirmed one.

## Provider adapters and streaming

Each provider under `packages/ai/providers/<name>` exports one
`create<Name>Adapter()` from its `index.ts` (confirmed for
`packages/ai/providers/anthropic/src/index.ts` and
`packages/ai/providers/openai/src/index.ts`; the rest follow the same shape).
`packages/ai/providers/factory/src/index.ts` holds a static map from provider
id to factory function and takes caller-owned credentials and base URLs; no
provider package reads environment variables itself.
`packages/ai/providers/factory/src/gateway.ts` builds an adapter from a
declarative gateway definition, so a new gateway needs no dedicated provider
package. Wire-format normalization with no network code lives in
`packages/ai/provider-protocol/src`; retry, failover, watchdog, and idempotency
live in `packages/ai/provider-runtime/src`.

`packages/ai/model-registry/catalog/gateways.json` currently declares exactly
one entry, and its own governance note marks it a worked example, not wired
into production route selection; the live OpenRouter path uses its own
provider package. This qualifies the routing group's claim above: the seam
for a cheaper-route swap exists in code but is exercised by nothing in
production today.

The OpenAI-compatible surface is `apps/web/app/api/llm/v1`
(`chat/completions/route.ts`, `models/route.ts`, `embeddings/route.ts`,
`audio/transcriptions/route.ts`), with the normalized stream transform in
`apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` and its own
golden and byte-parity tests alongside it. No shared, typed SSE schema package
was found for this stream; the shape is owned by that file and its tests, not
by `packages/contracts`.

Coupling: removing a vendor drops one package and its id from the factory map;
no caller changes since callers hold only the adapter interface. A stronger
model from an existing vendor changes nothing in this layer, since model
identity is registry-owned. Endpoint and region configuration is never
literal; it is passed into each adapter by the caller.

## Tools, MCP, connectors, skills, sandbox, computer use, voice

The turn loop is `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
with the governor in the adjacent `tool-turn-governor.ts`, a pure state
machine with no I/O that withdraws a tool from the offered set on
unavailability, budget, repeated identical queries, or a turn cap. Approval
and idempotency are contract-level:
`packages/contracts/types/src/tool-primitive.ts`, generated from
`crates/agiworkforce-protocol/src/tool_primitive.rs`.

MCP is two independent stacks, not one wrapping the other:
`packages/tools/mcp` for web (`apps/web/app/api/mcp/route.ts`) and desktop's
renderer (`apps/desktop/src/services/mcp.ts`), and `crates/agiworkforce-mcp`
for the CLI and the Tauri privileged host. A protocol change lands twice.
Contradicts `docs/agent-context/repo-map.json`'s implied single ownership per
surface; the two never share a runtime.

Connector OAuth lives in `apps/web/lib/connectors`, with a per-vendor scope
ceiling in `apps/web/lib/connectors/oauth-scope-allowlist.ts` that fails
closed for any vendor without a reviewed scope list. Skills are parsed in
`packages/tools/skills` and vetted separately by `tools/skill-vetting` before
install.

The sandbox has no single "gate" file; the real home is `apps/web/lib/e2b`
(`runtime.ts`, `reclaim.ts`), gated by `resolveSandboxLimits(planTier)` and a
fail-closed refusal at quota, reclaimed by a cron
(`apps/web/app/api/cron/reclaim-sandboxes/route.ts`).

Computer use is two unrelated systems that share a name: browser-level
automation in `apps/extension` (tested by
`apps/extension/__tests__/computer-use-agent-loop.test.ts` and siblings), and
OS-level automation in `apps/desktop/src-tauri/src/automation/action_router`
with tiered safety and confirmation in
`apps/desktop/src-tauri/src/automation/computer_use`.

Voice is genuinely shared, confirmed by import rather than by name alone: the
session state machine lives once, in
`packages/ui/unified-chat/src/voice/voice-session-machine.ts`, and both
`apps/web/features/chat/stores/voice-session-store.ts` and
`apps/desktop/src/features/voice/useCloudVoiceController.ts` import it.

Coupling: none of these seven areas hardcodes a vendor, model, region, or
provider cost; each operates on a generated contract or plan-tier
configuration. Tool-support loss is learned per-turn only, as stated above,
not persisted anywhere any of these areas would read.

## Files, memory, projects, database

| Area              | Storage                                                                                                                                                                                                                                            | Tests                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Files and library | metadata in Postgres, bytes behind a storage pointer (`apps/web/lib/server/media-assets.ts`, `apps/web/lib/server/object-storage-runtime.ts`)                                                                                                      | media storage and upload-policy tests beside those files                 |
| Memory            | plain-text rows, `apps/web/db/neon/0010_memory.sql`, served by `apps/web/lib/services/managed-auto-memory-service.ts` and `managed-memory-context-service.ts`                                                                                      | memory API, search, sync, and exclusion tests under `apps/web/__tests__` |
| Projects          | `apps/web/db/neon/0006_projects.sql`, files again via a storage pointer                                                                                                                                                                            | knowledge-file route and purge tests                                     |
| Database          | `packages/platform/data-layer/src/types.ts` defines the `DatabaseAdapter` port; `adapters/neon.ts` and `adapters/postgres.ts` are two working implementations selected by `AGI_DATABASE_PROVIDER` in `packages/platform/data-layer/src/factory.ts` | package-local tests plus `scripts/check-rls-boundary.mjs`                |

Memory has no embedding column and no vector index; matching is plain text
read by the requesting model, so there is no embedding-vendor lock-in in this
data.

Migration state: `apps/web/db/neon` holds numbered files whose header
comments (including a `NOT YET APPLIED` marker) are part of the checksummed
file body and can never be edited after authoring, even once a migration
ships. The real applied state lives only in the `public.schema_migrations`
table written by `scripts/neon-migrate.mjs`
(`scripts/lib/neon-migrations.mjs`), not in the header text. A header-only
read cannot tell you whether a given migration in the 0153 to 0174 range has
shipped; that requires the ledger. Row-level security is enforced by
`scripts/check-rls-boundary.mjs` against
`scripts/config/rls-boundary-allowlist.json`, which requires a stated
cross-tenant justification per entry rather than a blanket exemption.

A logical restore drill is real automation, not a documentation claim:
`scripts/db-restore-drill.mjs` and `scripts/db-restore-drill-logical.mjs` run
against a live `postgres:17` service container in
`.github/workflows/db-restore-drill.yml` on a weekly cron, each with a
matching test file.

Coupling: the database seam is clean; no route imports Neon's client
directly, and a working plain-Postgres adapter already exists as an
alternative. The same is true for object storage
(`packages/platform/object-storage/src/factory.ts` is the only caller of the
storage SDK). Neither adapter pins a region; another region is a connection
string and a bucket configuration change, not a code change.

## Auth and billing

| Area                             | Owner                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity port                    | `packages/platform/identity/src/types.ts`, `factory.ts`                                                                                                   |
| Clerk adapter                    | `packages/platform/identity/src/adapters/clerk.ts`                                                                                                        |
| Allowlisted direct Clerk imports | `scripts/config/identity-sdk-allowlist.json`, five named files, each with a stated reason, enforced by `scripts/check-boundaries.mjs`                     |
| SSO                              | `apps/web/lib/server/sso/clerk-enterprise-connections.ts`, `sso-access.ts`                                                                                |
| SCIM                             | `apps/web/app/api/scim/v2`, `apps/web/lib/server/scim/scim-auth.ts`, `apps/web/app/admin/directory-sync/page.tsx`                                         |
| Stripe client                    | one factory, `apps/web/lib/server/stripe-client.ts`                                                                                                       |
| Webhook and checkout             | `apps/web/app/api/stripe-webhook/route.ts`, `apps/web/app/api/checkout/route.ts`, `apps/web/app/api/upgrade/route.ts`, `apps/web/app/api/portal/route.ts` |
| Plan tiers and entitlements      | `apps/web/lib/entitlement.ts`, `apps/web/lib/price-tier-mapping.ts`, `apps/web/lib/services/org-entitlements.ts`                                          |
| Credits                          | `apps/web/app/api/cron/reconcile-credits/route.ts`                                                                                                        |
| Usage accounting                 | `apps/web/lib/services/managed-usage-accounting-service.ts`, `managed-usage-summary-service.ts`                                                           |
| COGS ledger                      | `apps/web/db/neon/0127_cogs_ledger.sql`, `0130_cogs_token_classes.sql`                                                                                    |
| Managed-compute metering         | `apps/web/lib/services/enterprise-usage-metering.ts`, `apps/web/lib/managed-compute-gate.ts`                                                              |
| Budget guard                     | `apps/web/lib/services/spend-limit-service.ts`, a per-organization monthly cap with a block enforcement mode                                              |

Coupling: Clerk sits behind a real port with a small, named, reviewed leak
list; a vendor swap means one new adapter plus revisiting those five files.
Stripe has no equivalent port. Its client construction is centralized to one
factory, but the webhook, checkout, upgrade, portal, and enterprise-billing
services all call the Stripe SDK directly, so a vendor swap touches every one
of those call sites. Per-model pricing is not duplicated into billing;
usage and stream-response code import cost data from the model registry
directly. No code in this group pins a Stripe customer object or a Clerk user
to a region; that is an account-configuration concern today, not a code path.
The spend-limit service is the guard that fails closed against a cost spike.

## Organizations, storage, queues, cache, observability

| Area                      | Finding                                                                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org roles                 | enforced as Postgres row-level-security predicates via a role-check function, not a separate policy-engine service (`apps/web/db/neon/0076_enterprise_control_plane_tables.sql`)                                                                                                                                |
| Audit log                 | insert-only, RLS-scoped, streamed, retained after org deletion (`apps/web/db/neon/0043_audit_log_immutability.sql`, `0123_audit_log_immutability_trigger.sql`, `0170_security_audit_logs_row_level_security.sql`, `0143_audit_event_streaming.sql`, `0167_retain_audit_events_after_organization_deletion.sql`) |
| Retention crons           | real: `apps/web/app/api/cron/enforce-workspace-retention`, `purge-deleted-organizations`, `purge-deleted-media`, `purge-temporary-chats`, `purge-security-audit-logs`                                                                                                                                           |
| Residency                 | named only in a migration's rationale comment (`apps/web/db/neon/0073_tenancy_foundation.sql`); no region-pinning enforcement exists anywhere                                                                                                                                                                   |
| DLP                       | does not exist; no PII scanning or redaction code found anywhere in the repository                                                                                                                                                                                                                              |
| Object storage            | vendor-neutral port, `packages/platform/object-storage/src/types.ts`, one S3-compatible adapter                                                                                                                                                                                                                 |
| Cache and rate limiting   | vendor-neutral port, `packages/platform/key-value/src/types.ts`, `factory.ts` auto-selects an Upstash adapter by credential detection, confirming this is still the production backend                                                                                                                          |
| Queues                    | real durable workflows, not just CLI tooling: `apps/web/lib/workflows/cloud-agent-workflow.ts`, `video-generation-workflow.ts`, `cloud-agent-operation-executor.ts`                                                                                                                                             |
| Observability, extensions | consent-gated client that scrubs message text and paths before send (`packages/platform/observability/src/client.ts`, `scrub.ts`)                                                                                                                                                                               |
| Observability, web        | a separate, app-local pipeline (`apps/web/instrumentation.ts`, `apps/web/lib/observability/otel-sdk.ts`, `otel-span-bridge.ts`) that does not scrub; it sends raw exception messages as span attributes                                                                                                         |

Coupling: object storage and cache both swap cleanly behind their ports, with
zero call-site changes. The workflow engine does not have a port; workflow
files import its primitives directly at the call site, so a queue-vendor
change means rewriting those files, not swapping an adapter. No region can be
enforced for an organization today; this is a real gap, not a deferred one.
The observability scrubbing claim in `docs/agent-context/repo-map.json` holds
for the shared extension-facing package but not for web's server-side
tracing, which is a second, independent system rather than one shared
package.

## CI, deploy, security, and package boundaries

CI runs a scoped affected-surface graph (`scripts/production-deploy-scope.mjs`)
plus a repo-guard chain in `.github/workflows/ci.yml`. Production deploy
triggers only on a green CI run and re-verifies the live apex against the
deployed commit (`scripts/verify-deployment.mjs`) in
`.github/workflows/deploy-production.yml`. A weekly, path-triggered container
drill boots the production web image with platform services detached
(`.github/workflows/web-container-drill.yml`), alongside the weekly database
restore drill named above. Both drills are scheduled automation, not
documentation claims.

Trust-boundary guards are real, separately runnable scripts, not prose:
`scripts/check-trust-boundaries.mjs`, `scripts/check-rust-egress-boundary.mjs`,
`scripts/check-db-isolation.mjs`, `scripts/check-secrets.mjs`. Desktop egress
funnels through `apps/desktop/src/lib/egressGuard.ts`, which refuses any
network call toward an owned cloud host while the app is in the local trust
boundary, using host classification from
`packages/contracts/trust-boundaries/src/egress-policy.ts`. Content-security
policy is attached in `apps/web/proxy.ts`, not in the Next.js config file.

`scripts/check-boundaries.mjs` is a hand-rolled script, not a linter plugin.
It bans deep imports past a package's published entrypoint and separately
enforces vendor-adapter ownership: only a named list of adapter files may
import a given vendor SDK, driven by a fixed array inside the script itself
rather than by the `scripts/config/*.json` allowlists below. A new vendor
integration that is not added to that array would import its SDK freely from
anywhere with no guard catching it, which is the single largest boundary risk
found in this group.

| Allowlist                                                 | Enforces                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `scripts/config/identity-sdk-allowlist.json`              | named exceptions to the Clerk-import boundary                                                   |
| `scripts/config/managed-compute-evaluator-allowlist.json` | routes exempt from the spend-evaluation-before-use order                                        |
| `scripts/config/migration-dependency-allowlist.json`      | permitted cross-references between numbered migrations                                          |
| `scripts/config/reference-integrity-allowlist.json`       | doc paths exempt from the existence check this document is itself subject to                    |
| `scripts/config/rls-boundary-allowlist.json`              | queries exempt from tenant-scoping, each with a stated reason                                   |
| `scripts/config/skipped-test-ratchet.json`                | a ceiling on skipped tests that is never allowed to grow                                        |
| `scripts/config/surface-invariants-allowlist.json`        | exemptions from the web surface-invariants guard                                                |
| `scripts/config/surface-reachability-allowlist.json`      | modules exempt from the cross-surface reachability graph                                        |
| `scripts/config/vendor-adapter-allowlist.json`            | files allowed to import a vendor SDK directly, one entry per vendor SDK, each carrying a reason |

Coupling: the CI and deploy tooling is otherwise plain Node and shell script
and would port to another CI runner; the one host-specific piece is the
production-apex probe and its host-based routing rewrite. Adding a new model
provider requires an adapter package plus, only if it reaches a new outbound
host, an addition to the trust-boundary host list; the model catalog itself
carries no egress allowlist.

## Shared UI, client, and contract packages

| Package                                  | Confirmed content and consumers                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/unified-chat`               | chat transcript, composer, stores; consumed by `apps/web` and `apps/desktop` only, not by either extension despite its package description claiming all four surfaces |
| `packages/ui/design-tokens`              | presentation-only CSS (`packages/ui/design-tokens/src/chat.css`)                                                                                                      |
| `packages/ui/i18n`                       | twelve real locale directories with translated catalogues, not aspirational                                                                                           |
| `packages/client/client-runtime`         | exports a base runtime; desktop gets its variant through a bundler alias in `apps/desktop/vite.config.ts`, not through a package export path                          |
| `packages/client/desktop-command-client` | the client side of the Tauri command seam, consumed only by desktop                                                                                                   |
| `packages/client/sync`                   | a shared, pure cursor and validation protocol; each surface (`apps/web`, `apps/desktop`, `apps/mobile`) drives its own sync loop against it                           |
| `packages/contracts/cloud-contracts`     | real wire schemas and typed clients for managed-cloud endpoints                                                                                                       |
| `packages/contracts/types`               | imported across roughly 370 files in the other package groups; the platform's actual shared-kernel package                                                            |
| `packages/contracts/trust-boundaries`    | host classification only, no network I/O                                                                                                                              |
| `packages/contracts/compliance`          | one real consumer, `apps/mobile`, not web or desktop                                                                                                                  |
| `packages/contracts/licensing`           | zero application consumers found; its Rust sibling `crates/agiworkforce-licensing` is equally unadopted                                                               |
| `packages/ai/agent-core`                 | consumed by mobile and the VS Code extension only; desktop and the CLI use the separate Rust crate `crates/agiworkforce-agent-core` for the same concept              |
| `packages/ai/search`                     | reports web-search intent and availability only; executes nothing and holds no credentials                                                                            |

`packages/ui/unified-chat/src/lib/hostBridge.ts` is a clean, surface-neutral
interface, but `packages/ui/unified-chat/src/lib/connectorPermissionStore.ts`
does a guarded dynamic import of a Tauri-only API, so the surface-neutral
claim has one real, if degraded-gracefully, exception.

Coupling: a new application surface could reuse `packages/contracts/types`,
`packages/contracts/cloud-contracts`, and most of `packages/ui/unified-chat`
without modification; it would need to avoid the Tauri-coupled path above and
would get no benefit from `packages/contracts/licensing`, which nothing uses
today.

## What this map changed from the starting index

`docs/agent-context/repo-map.json` was accurate for most units checked. Three
corrections stand: `packages/ai/agent-core` is not the shared turn loop for
desktop and the CLI, those use a separate Rust crate; MCP is two independent
stacks rather than one wrapping the other; and the observability package's
scrubbing guarantee holds for the extension-facing client only, not for web's
server-side tracing pipeline. `packages/contracts/licensing`'s
"active-partial-adoption" label is generous; no application imports it today.
