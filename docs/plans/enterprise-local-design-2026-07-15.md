# Enterprise Local / Self-Hosted — Design (P7)

Status: Draft for founder review
Owner: Founder + platform lead
Last updated: 2026-07-15
Workstream: `docs/plans/monorepo-restructure-2026-07-08.md` §P7; sequenced
at `docs/plans/restructure-execution-program-2026-07-15.md` W11
("design doc before code").

## 0. Relationship to prior work

This document supersedes `docs/enterprise/enterprise-local-design.md`
(2026-07-09) for the P7 workstream: same scope, re-verified against
current code with file:line evidence and two running test suites, six
days after the offline-licensing and org-policy-schema lanes landed.
Where the prior doc's design and §4 pricing recommendations were still
accurate, they are carried forward, not re-litigated.

Two corrections to the wider `docs/enterprise/` set, found by this
research — fixing them is outside this wave's write set (see the handoff
report):

- `docs/enterprise/control-plane.md:13` and `docs/enterprise/README.md:27`
  cite `supabase/migrations/20260521100000_enterprise_control_plane_
foundation.sql` as the canonical migration for organization/SSO/SCIM/
  policy/audit/usage-ledger/support tables. That path does not exist —
  Supabase was fully migrated away, no `supabase/` directory exists in
  this repo — and the tables it claims exist for SSO, SCIM, org-policy,
  audit events, and usage-ledger were never migrated under any name (§4.1).
- `docs/enterprise/enterprise-local-pricing-decisions.md` (FD-1–FD-4)
  remains the founder-decision surface for this workstream and is
  unchanged by this doc. It is still "awaiting founder decision" as of
  today — no record in `CHANGELOG.md`, `PLAN.md`, or `TODO.md` shows
  FD-1–FD-4 resolved.

## 1. Problem and positioning

Local mode's differentiator — chats, files, and developer sessions never
leave the machine — is not currently purchasable by an organization.
Everything enterprise-shaped in the repo is cloud-oriented: enterprise
types (`packages/types/src/enterprise/index.ts`), Neon control-plane
tables, gateway enterprise routes, Clerk-based identity. None of it
licenses, polices, or audits a Local deployment. The product to sell is
the zero-egress guarantee itself, made purchasable, administrable, and
provable to an org's security team.

Selling surfaces: Desktop, CLI, VS Code (the three all-mode surfaces).
Web/Chrome are cloud-only, out of scope. Mobile has no BYOK and is
consumer-first (`docs/spec/volumes/03-modes-and-trust.md:43`);
Local-mode enterprise features are a v1 non-goal (§7).

Design constraints (unchanged from the prior draft, still correct):

- Zero phone-home in Local mode; licensing verifies offline; any
  activation ping is opt-in with org consent.
- Enterprise features must not create a new silent egress path. Policy
  enforcement reuses existing trust-kernel guards; it must never itself
  transmit content.
- The self-hosted gateway is an option, not a dependency, for the
  air-gapped tier.

## 2. Offline licensing and entitlements

### 2.1 What exists today (verified, not proposed)

Both a Rust crate (`crates/agiworkforce-licensing`) and a TS package
(`packages/licensing`, `@agiworkforce/licensing`) are built and passing:
`cargo test -p agiworkforce-licensing` — 9/9 passed; `pnpm --filter
@agiworkforce/licensing test` — 40/40 passed across 2 suites (both run
2026-07-15 for this doc).

Both implement the same design independently in each language's idiom: a
JWT-shaped signed container (base64 JSON payload + detached Ed25519
signature — `crates/.../src/container.rs`, `packages/licensing/src/
container.ts`), a `LicenseClaims` type (org identity, edition, seats,
expiry/grace period, feature flags, policy-signing keys), and
`verify_license`/`verifyLicense` (expiry + grace-period + rotatable-root-
key checks, pure, no I/O). Both replay one shared fixture corpus generated
only from the TS side (`packages/licensing/src/__fixtures__/`), so a
mismatch between the two verifiers is a provable cross-language bug, not
fixture drift — the same discipline pattern as `sync-apply`.

Both say, in their own doc comments, that they are **verify-only and
unwired**: `crates/agiworkforce-licensing/src/lib.rs:23-25` ("NOT wired
into any app/desktop/CLI/gateway runtime"), `packages/licensing/
README.md:19-20` (same, TS side). Independently confirmed by grep, not
just the comment: no Rust source imports `agiworkforce_licensing::`; no
`Cargo.toml` in `apps/cli` or `apps/desktop/src-tauri` depends on it; no
TypeScript source outside `packages/licensing` calls
`verifyLicense`/`verifyOrgPolicy`. (An uncommitted `CHANGELOG.md` line
claims org policy was "migrated" to Web/Desktop/Mobile — contradicted by
this grep; the grep is the fact this doc relies on, not the prose.)

The org-policy schema this workstream needs (§3) already exists in both
languages too, same pattern: an `OrgPolicy` type covering allowed
providers/models, a BYOK stance (allowed/forbidden/allowlist), egress
rules (managed-cloud on/off, a BYOK domain allowlist), retention days, and
an audit-export requirement (`packages/licensing/src/org-policy.ts:67-84`,
`crates/agiworkforce-licensing/src/org_policy.rs:56-75`), with a monotonic
tightening check — a policy can only restrict, never grant, relative to a
baseline, verified against the license's own policy-signing keys as root
of trust. Also unconsumed anywhere — same grep, zero hits outside the
package/crate's own tests.

### 2.2 The ruling: consume, conditional on FD-1/FD-3

The workstream asks for one ruling: CLI/Desktop consume
`agiworkforce-licensing`, or it is deleted pre-release (no orphan
shipping). **Recommendation: consume — conditional on the founder landing
FD-1 (pricing/edition split) and FD-3 (identity tier for v1) before this
product ships to an external user.**

This is a conditional ruling, not a clean one, because "consume" means
wiring real enforcement, and enforcement wiring is explicitly gated on
those two decisions in the prior draft's own sequencing — FD-1 "populates
`edition`/`features[]` values," FD-3 decides "which identity path to
build first" (`enterprise-local-pricing-decisions.md:33-40`). Nothing in
the repo shows either decision made. If FD-1/FD-3 are still open when the
breaking-change window closes (first external user, per `PLAN.md`),
delete the crate and package rather than ship an unwired verify primitive
as "shipped" — passing its own tests is not evidence of a working
feature.

Reasons to prefer consume over delete given current evidence: the
implementation is real, independently tested in both languages, and the
cross-language fixture-parity discipline is expensive to rebuild if
deleted now and re-requested later. The crate has zero dependents today,
so deleting costs nothing structurally — this is a timing call against
the founder decisions, not a technical blocker either way.

### 2.3 Concrete wiring points (what "consume" means per surface)

**CLI — one proven chokepoint, needs one more call site.** CLI already
has the richest privacy-boundary enforcement in the repo:
`validate_privacy_boundary()` (`apps/cli/src/agent/mod.rs:726-744`) is
called at four real send-path sites (`agent/chat.rs:241,590,836`,
`app_server/developer_host.rs:678`), plus tool-execution gating
(`features/exec/tools/mod.rs:198-214`) and MCP-connection enforcement
(`mcp/mod.rs:878-889`, which synchronously drops connected remote MCP
servers on entering Local mode). Wiring means: on session bootstrap, call
`verify_license` once, fail closed to the free Local tier on any error
(expired-past-grace degrades, never bricks — the existing design's own
rule), then thread the resulting `OrgPolicy` into
`validate_privacy_boundary()`'s existing check as an additional
restriction, not a new gate.

**Desktop — two independent enforcement planes; a policy must plug into
both.** Desktop enforces Local/BYOK/Managed twice, in two languages, over
two different traffic types, and neither plane reads the other's decision
today:

- TS/WebView plane: `desktopChatRuntime.ts:41-48` (composition root
  choosing `WebRuntime`/`CloudRuntime`/`TauriRuntime`, fail-closed to
  `TauriRuntime`) and `egressGuard.ts:100-111` (`guardedFetch`, blocks
  cloud-host `fetch()` calls when `isPrivateTrustBoundary()`).
  Self-documented scope limit (`egressGuard.ts:27-36`): it does not
  intercept the Rust backend's own `reqwest` calls.
- Rust plane: `RouterCore::candidates()`
  (`src-tauri/src/core/llm/llm_router.rs:931-949`) filters provider
  candidates by `TrustMode` (`crates/agiworkforce-model-registry`),
  independently of the TS guard, covering the Rust backend's own provider
  dispatch.

A signed org policy restricting `allowedProviders`/`byok` must be
verified once (Rust, since the crate is Rust-only) and threaded into
both: the TS side via a Tauri command exposing the verified policy to
`guardedFetch`, the Rust side via `RouterPreferences`/
`provider_matches_trust_mode()`. Wiring only one plane leaves a real
bypass through the other.

**VS Code — no existing chokepoint found; this is new work, not
re-wiring.** No `guardedFetch`-equivalent trust-boundary gate exists in
`apps/extension-vscode`. `resolveTier()`
(`src/integrations/tierResolver.ts:87-118`) is a subscription-tier
resolver defaulting to `'byok'` (not `'local'`) when unresolved — a
materially more permissive default than every other surface's
fail-closed-to-Local. Whether VS Code's "Local" execution delegates to
the Desktop app (inheriting its enforcement, via
`features/desktop-bridge/desktopBridge.ts`) or is independently
implemented is unresolved (open question 5, §8). Until resolved, treat
VS Code as needing net-new enforcement, and do not market VS Code
Local-mode policy enforcement as available until proven.

## 3. Signed org-policy distribution

§2 covers the schema (built, tested, unconsumed) and CLI/Desktop/VS Code
wiring points. This section covers distribution and mobile's reference
pattern, corrected.

### 3.1 Mobile's enforcement stack — corrected

The planning docs describe mobile's enforcement as "appModeStore →
chatExecutionStore cross-check → egressGuard fail-closed guardedFetch →
remoteChatGate/llmGate." Accurate for the first three layers, one
correction on the fourth: `remoteChatGate`
(`services/remoteChatGate.ts:55-63`) is an entitlement/feature-flag gate,
and `llmGate` (`packages/compliance/src/llm-gate.ts:75-87`) is an EU AI
Act Article 50 disclosure + China-HQ-provider consent gate — neither is
the Local/Cloud egress boundary itself. The actual boundary is layer 3:
`egressGuard.ts:132-176` — `resolveAppMode()` fails closed to `'local'`
on any read error; if mode is `'local'` and the target host matches the
shared `OUR_CLOUD_HOSTS` allowlist (`packages/trust-boundaries/src/
egress-policy.ts:46-92`, extracted after desktop's and mobile's
independent denylists were found to have drifted), `guardedFetch` throws
before any socket opens. A signed policy's `egress.managedCloud: false`
maps directly onto this existing throw condition — no new mechanism
needed on mobile if/when mobile enterprise is pulled forward (currently a
v1 non-goal, §7).

### 3.2 Distribution and provability

File drop, MDM, or the self-hosted gateway (§6) push a `.agipolicy`
container to each seat; no new backend service is required for the
air-gapped tier; a forged policy fails `verifyOrgPolicy` because it isn't
signed by a key in the license's `policyKeys[]`. Extend the existing
fixture-replay discipline (§2.1) so each surface's enforcement wiring
(§2.3) replays the same allowed/forbidden policy matrices the crate and
package already test — this is what makes "provably zero-egress"
demonstrable to a buyer's security team, not a marketing line.

## 4. Enterprise identity without cloud chat routing

### 4.1 What exists today

`packages/types/src/enterprise/index.ts` defines `IdentityProviderConfig`
(SAML/OIDC) and `ScimUser`/`ScimGroup` (SCIM 2.0) — real types, zero
importers anywhere. Two real, migrated org-membership tables exist and
are actively duplicated: `organizations`/`organization_members`
(`apps/web/db/neon/0015_organizations.sql`) and `teams`/`team_members`
(`0007_teams.sql`), backing disjoint route families. Resolving that
duplication is W9's tracked scope (`known-flaws.md`), not this doc's —
cited as a fact this design must not deepen.

The gateway's SSO/SCIM-adjacent tables don't exist under any migration —
confirmed against `apps/web/db/neon/*.sql`: `sso_connections`,
`directory_sync_connections`, `organization_admin_policies`,
`enterprise_audit_events`, `organization_usage_ledger`, and
`support_cases` are all queried by real, running route code
(`apps/web/app/api/admin/sso/route.ts`, `.../directory-sync/route.ts`,
`services/api-gateway/src/routes/enterprise.ts:225-393`) with zero
`CREATE TABLE` anywhere. The app's own admin UI copy already says so
(`apps/web/features/admin/pages/AdminConsolePage.tsx:31-34,154-157`:
"SSO and SCIM do not yet [exist] — the admin API routes exist but query
tables with no migration"). One real webhook receiver exists
(`apps/web/app/api/webhooks/directory-sync/route.ts`, genuine HMAC-SHA256
verification for a prior WorkOS integration) but its provisioning logic
is stubbed to `501` and explicitly TODO'd, not deleted.

Clerk's Organizations/SSO/SCIM API has zero usage anywhere in this repo —
the custom `organizations` concept is 100% Neon tables, not Clerk's org
primitive; Clerk today provides individual-user authentication only. A
"connected tier" on Clerk org SSO/SCIM (§4.2) is new integration work,
not repointing an existing wire.

A genuine offline/local identity mechanism exists in Rust
(`apps/desktop/src-tauri/src/sys/security/auth.rs` — Argon2 hashing,
local HMAC-signed session JWTs, RBAC, zero network calls) but is inert:
only `auth_login` is a registered Tauri command; `register()` has no
reachable IPC command, so the in-memory user store can never be
populated in production. Treat as scaffolding, not a shipped feature — it
needs a registration path, disk persistence, and a UI first.

### 4.2 Design

Two tiers, decided per org at implementation time:

- **Connected tier:** Clerk org SSO/SCIM binds account identity only —
  sign-in provisions a seat; chats/files/sessions still never route
  through cloud (identity plane ≠ data plane, must stay documented and
  boundary-tested). Net-new Clerk integration work per §4.1, not
  already-built capability.
- **Air-gapped tier:** no cloud identity; seat identity = local OS user +
  license file (§2). LDAP/local-directory binding is an explicit v1
  non-goal (§7).

FD-3 already recommends air-gapped first — no external dependency,
exercises the offline-license path end-to-end, the stronger
differentiator. Nothing here changes that recommendation.

## 5. Local audit export

### 5.1 What "the desktop audit.jsonl pattern" actually is

Correcting the workstream's own framing: this is a per-generated-file
receipt, not a per-session log. `build_generated_document_manifest()`
(`apps/desktop/src-tauri/src/features/document/
generated_file_manifest.rs`) derives a fresh `compute_session_id` on
every call, so each `audit.jsonl` on disk today holds exactly one line.
The schema (`LocalComputeAuditEvent`) is metadata-only — id, a single
constant event type, checksum, mode strings, genuinely no message/file
content — though the mode fields are hardcoded constants today, not
derived from the session's actual trust mode, and the sibling
`manifest.json` in the same directory carries filenames/titles that
would leak if the whole directory were exported instead of just
`audit.jsonl`. It fires only on document-export tool completions
(PDF/DOCX/XLSX/PPTX), not tool calls or approvals generally. Nothing
reads, displays, or exports it today.

Desktop has three other, disconnected audit-shaped surfaces worth knowing
before generalizing anything: a SQLite `audit_events` table with per-row
HMAC-SHA256 signing and a working "Verify integrity" UI
(`sys/security/audit_logger.rs`, `features/governance/
GovernanceDashboard.tsx`); a second SQLite audit table
(`sys/permissions/audit.rs`) declared but never instantiated; and a
Zustand `actionLog` with a working CSV-export button
(`stores/chat/toolStore.ts`, `ToolHistoryTable.tsx:41-66`) backed by
webview localStorage. Reuse the CSV-export UI pattern; none of the four
storage locations talk to each other today.

CLI has a parallel gap: `apps/cli/src/approval_audit.rs` is real,
tested-in-isolation infrastructure for exactly this (JSONL to
`~/.agiworkforce/approvals.jsonl`, 0o600 permissions) — but its only
production entry point, `record_approval()`, is never called from the
real approval flow, contradicting two product-spec docs
(`docs/products/agi-cli/volume-16-security.md:51`,
`volume-21-local-storage.md:45`) that claim it's "Built" and live — a gap
this design should not silently inherit as solved. A separate,
genuinely-live mechanism, `audit_log_updated_input()`
(`features/hooks/hooks.rs:975-1002`, called from production code in
`agent/chat.rs:121,1513`), writes free-text entries including raw
tool-call arguments verbatim — already writing potentially sensitive
content locally, relevant to this design's "never content" constraint if
folded into a generalized log.

### 5.2 Design

Generalize into an actual session-scoped, append-only JSONL per seat:
session start/end, mode used (from §2/§3's verified policy),
provider/model ids, policy decisions (allowed/blocked), license/seat
claim — metadata only, matching the existing `audit.jsonl` schema's
discipline but fixing its per-session scope, hardcoded mode fields, and
single event type. `agi audit export` (CLI) / Settings → Export (Desktop)
produce a signed bundle; reuse the Tool History tab's CSV-export UI as
the interaction precedent, not its storage location.

For tamper-evidence: prefer the asymmetric Ed25519 pattern already
proven in `agiworkforce-licensing` (detached signature, cross-language
verify) over the existing HMAC pattern in `audit_logger.rs` — HMAC is
symmetric, so the app ships the verification key and a client can forge
what it also verifies. This exact weakness is why desktop's own updater
moved off a custom HMAC scheme to Tauri's Ed25519-based updater plugin
(`sys/security/updater.rs`, `SEV-DESK-14`). No hash-chaining primitive
exists anywhere in the repo today; if append-only tamper-evidence beyond
per-entry signing is wanted, that is new, straightforward work
(`SHA-256(prev_line_hash + this_line_bytes)`; `sha2` is already a
workspace dependency everywhere it would be needed).

## 6. Self-hosted gateway profile

### 6.1 What's portable today, largely unchanged

The core ask — "point the gateway at org-owned provider keys or
open-weight endpoints" — is closer to configuration than to a build.
`src/lib/providerAdapters.ts` already reads every provider credential
from server-side env vars set by whoever operates the process, and a
standing rule forbids ever threading a per-request customer key through
(`routes/llm.ts:240-245`, "GW-2... anything else is a security review
blocker"). An operator-run instance and AGI's managed instance use the
identical mechanism — "org-owned keys" is already how this works.
`ollama` (arbitrary base URL, no host allowlist) and `openai` (arbitrary
`baseUrl`) already support an open-weight endpoint at the adapter level;
the gap is that `providerAdapters.ts` doesn't wire an `OPENAI_BASE_URL`
env var through, and `routes/llm.ts`'s flagship route excludes `ollama`
from its proxied-provider set today — both small, scoped changes, not a
redesign. The Postgres schema is confirmed portable to vanilla Postgres —
`docker-compose.yml` applies all 57 `apps/web/db/neon/*.sql` migrations
against a stock `postgres:16-alpine` with no Neon-proprietary SQL; RLS
itself is standard Postgres.

### 6.2 What's genuinely coupled — the honest gaps

- **Packaging is the real structural blocker, not billing or auth.**
  `services/api-gateway` depends on 8 `workspace:*` internal packages
  (`data-layer`, `llm-normalize`, `llm-runtime`, `mcp`,
  `providers-factory` — itself pulling ~13 more provider packages —
  `skills`, `types`, `apply-patch`). It is not a standalone-cloneable
  folder today; a self-hosted deploy needs the whole monorepo checked
  out for pnpm workspace symlinks to resolve, or a bundling step that
  doesn't exist. Lead any v1 scope discussion with this, ahead of
  Dockerfile details.
- **Driver portability to non-Neon Postgres is unverified; schema
  portability is proven.** Both DB entry points (`src/lib/
neonClients.ts`) use `@neondatabase/serverless`'s HTTP/WebSocket-tunneled
  client, not a plain TCP connection; the compose file proves the schema
  applies to vanilla Postgres but doesn't exercise these driver paths
  against it. `packages/data-layer/src/adapters/postgres.ts` is a
  documented, unimplemented skeleton for exactly this gap — real work,
  not a config flip (open question 6, §8).
- **Clerk is load-bearing for gateway-JWT issuance, not runtime
  verification.** `middleware/auth.ts` can verify a gateway-self-signed
  JWT with zero Clerk calls, but that JWT can only be minted after a
  Clerk-authenticated `/approve` step (`routes/deviceAuth.ts:216-292`) —
  matching §4.1's finding that a non-Clerk identity path doesn't exist
  yet for the air-gapped tier.
- **Billing/tier gates are narrow but real.** Only 2 of 16 route files
  touch commercial-tier logic (`llm.ts`, `cloudChat.ts`), via three
  mechanisms (`planGate.ts`'s `requireProPlan`, `llm.ts`'s inline
  `enforcePlanTier`, `managedUsageBilling.ts`'s unconditional
  reserve/finalize RPC dance on every completion request). All three
  hardcode AGI's own tier vocabulary and would need to be stripped or
  made conditional for an org that doesn't want its own employees
  blocked by "upgrade to Pro." No Stripe SDK exists in the gateway at
  all — billing coupling is entirely Postgres-RPC-based.
- Server-side BYOK (a customer's end users each supplying their own key
  through the gateway, vs. the operator setting shared env-var keys)
  does not exist and is explicitly guarded against
  (`routes/llm.ts:240-245`) — net-new if ever wanted; out of scope for
  v1's "operator sets org-owned keys" model.

v1 scope: a config profile + docs + a smoke compose file; no multi-tenant
admin UI. The packaging gap above means "config profile" is not
sufficient alone — a bundling/publish step for the 8 internal
dependencies is a prerequisite.

## 7. Explicit non-goals (v1)

Central license server; remote seat revocation; usage metering for Local
mode; Mobile enterprise (Mobile is consumer-first and has no BYOK, §1);
policy-granted capabilities (policy only restricts, never grants, §3);
multi-tenant self-hosted gateway admin UI; LDAP/local-directory binding
(§4.2); server-side per-end-user BYOK passthrough through the gateway
(§6.2); fixing the org-membership table duplication or the phantom
SSO/SCIM/audit/usage-ledger/support-case tables (§4.1) — those are W9's
tracked scope, not this workstream's.

## 8. External prerequisites and open questions

**Founder decisions (blocking, carried forward from
`enterprise-local-pricing-decisions.md`, unchanged):**

1. FD-1 — pricing/edition split (populates `edition`/`features[]`
   values).
2. FD-2 — seat true-up posture (recommend honor-count + audit-export,
   unchanged).
3. FD-3 — identity tier for v1 (recommend air-gapped first, unchanged).
4. FD-4 — whether the optional activation ping exists at all (recommend
   yes, off-by-default, org-controlled, unchanged).

**New, from this pass's code verification — not settled by reading the
repo, each needs an owner:**

5. Whether Local/`ollama` execution in the VS Code extension delegates to
   the Desktop app (inheriting its enforcement) or is independently
   implemented — determines whether §2.3's "VS Code needs net-new
   enforcement" is the full picture. Needs the VS Code owner or a deeper
   trace.
6. Whether `@neondatabase/serverless`'s client can connect to a
   self-hosted vanilla Postgres without a Neon-compatible proxy in front
   of it (§6.2) — untested, don't assume either answer.
7. `services/api-gateway`'s `managedComputeGate.ts` and web's
   `managed-compute-gate.ts` implement the same env var
   (`AGI_MANAGED_COMPUTE_PRIVATE_BETA`) with inverted default semantics
   (gateway closed-by-default; web open-by-default, matching `CLAUDE.md`).
   Unrelated to self-hosting directly, but a self-hosted deploy would
   inherit the gateway's gate as currently coded; flagging for the
   gateway owner to reconcile regardless of this workstream.
8. Whether `services/api-gateway`'s `Dockerfile` two documented build
   modes (standalone vs. monorepo-root `--build-context`) actually
   work — unverified by CI. Don't assert the container builds until
   someone runs it.
9. `services/api-gateway/.env.example` was not readable during this
   research (tool-permission block); read it directly before finalizing
   the self-hosted deployment doc — §6's env-var inventory was
   reconstructed from source and may be incomplete.
10. Whether FD-1–FD-4 have been decided verbally/outside the repo.
    Nothing in `CHANGELOG.md`, `PLAN.md`, or `TODO.md` shows them
    resolved as of 2026-07-15 — treat as open until a founder-authored
    record exists.

## 9. Staged adoption sequence

Order follows the prior draft's effort sizing; this section adds the
per-stage verification the prior draft didn't specify. Every stage after
1 is blocked on FD-1/FD-3 landing (§2.2).

1. **Already done** — `packages/licensing` + `agiworkforce-licensing`
   crate + cross-language fixtures + org-policy schema (§2.1).
   Verification: `cargo test -p agiworkforce-licensing` and `pnpm
--filter @agiworkforce/licensing test` both green (confirmed
   2026-07-15). No further work here unless FD-1/FD-3 slip past release
   (§2.2 — then this stage is deleted, not carried).
2. **Enforcement wiring, one surface per PR** (§2.3): CLI first (smallest
   diff — one more call site into an existing chokepoint), then Desktop
   (both planes), then VS Code (net-new, pending open question 5).
   Verification: each PR replays the shared license/policy fixture
   corpus (§2.1) against the newly wired surface; a fixture the
   crate/package already reject must be rejected end-to-end through the
   app, not just at the verify function.
3. **Audit log generalization** (§5.2). Verification: an export produced
   by each surface round-trips through the same signature-verification
   path §2 already tests; a scan of exported bundles asserts zero
   message/file content fields.
4. **Self-hosted gateway profile** (§6). Verification: the compose smoke
   test starts the gateway against vanilla Postgres end-to-end (closing
   open question 6), a policy-declared `byokDomainsAllowlist` entry
   actually reaches an open-weight endpoint through `ollama`/`openai`
   base-URL support, and the packaging gap (§6.2) has a build/publish
   step actually exercised by CI (closing open question 8).
5. **Identity tiers** (§4.2). Verification: air-gapped tier (FD-3) first
   — a seat operates fully offline from license file to first chat with
   zero network calls, provable by the same egress-boundary tests §3.1
   references. Connected tier (Clerk org SSO/SCIM) second, with a
   boundary test asserting identity-plane sign-in never flips any
   surface's trust mode away from Local/BYOK.
