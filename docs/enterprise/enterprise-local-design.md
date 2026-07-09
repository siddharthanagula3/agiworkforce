# Enterprise Local Edition — Design (P7)

Status: Design for review (implementation gated on founder pricing/edition decisions)
Owner: Platform lead
Last updated: 2026-07-09
Source requirement: founder, 2026-07-08 — "sell Local mode to teams/enterprises for private on-prem usage." Workstream defined in `docs/plans/monorepo-restructure-2026-07-08.md` §P7 (design doc before code).

## 1. Problem and positioning

Everything enterprise-shaped in the repo today is cloud-oriented: `packages/types/src/enterprise/`, the Neon control-plane tables (`docs/enterprise/control-plane.md`), the gateway enterprise routes. None of it licenses or administers **Local** deployments — the mode where chats, files, and developer sessions never leave the machine. The product to sell is exactly that guarantee: _your models, no markup, private, everywhere_ (GTM wedge), made purchasable by orgs.

Selling surfaces per the trust-mode matrix: Desktop, CLI, VS Code extension (the three all-mode surfaces). Web/Chrome are cloud-only and out of scope; Mobile Local is consumer-first and follows later if pulled.

Design constraints (locked):

- Local mode must keep working with **zero phone-home**. Licensing must verify offline; any activation ping is opt-in with org consent.
- Trust boundaries unchanged: enterprise features must not create a new silent egress path. Policy _enforcement_ reuses the existing trust-kernel guards; it must never itself transmit content.
- No new backend service required for the air-gapped tier. The self-hosted gateway is an option, not a dependency.

## 2. Components

### 2.1 `packages/licensing` (new)

Offline-verifiable signed license files.

- **Format:** a JSON claims document + Ed25519 detached signature, distributed as one `.agilicense` file. Claims: `licenseId`, `orgId`, `orgName`, `edition` (`team` | `enterprise`), `seats`, `issuedAt`, `expiresAt`, `graceDays`, `features[]` (capability flags, e.g. `org-policy`, `audit-export`, `self-hosted-gateway`), `policyKeys[]` (public keys authorized to sign org policy — see 2.2).
- **Verification:** pure function, no I/O — `verifyLicense(fileBytes, rootPublicKeys, now) → { claims } | { error }`. Root public keys are baked into each app build (rotatable list, ≥2 keys so one can be retired). Expiry uses local clock with `graceDays` tolerance; expired-past-grace degrades to the free Local tier, never bricks — data access is never license-gated, only enterprise _features_ are.
- **Seat model (offline):** seat _counting_ cannot be enforced without a server; the license is per-org honor-count with per-seat audit visibility (each install records its seat claim in the local audit log, exportable for true-up). This matches how offline enterprise licensing works commercially (JetBrains offline, GitLab offline) and is a deliberate business decision, not a technical gap.
- **Consumers:** Desktop (Rust) and CLI (Rust) via a small `agiworkforce-licensing` crate; VS Code (TS) via the TS package. Same fixture corpus for both implementations (cross-language golden fixtures, same pattern as sync-apply): a set of signed/tampered/expired/wrong-key license files that every implementation must accept/reject identically.
- **Activation ping (optional):** off by default; if the org enables it, a minimal `licenseId + seatHash + version` POST to the org's own endpoint (from policy, 2.2) — never to our cloud, never content.

### 2.2 Org policy as signed data (suite-contracts extension)

A signed org policy document that admins distribute (file drop, MDM, or self-hosted gateway) and the apps enforce locally.

- **Schema (new in `packages/types/src/suite-contracts.ts` + Zod mirror in `packages/services/cloud-contracts` conventions):** `OrgPolicy` = `{ policyId, orgId, version, issuedAt, allowedProviders[], allowedModels[] (ids from models.json | 'local:*'), byok: 'allowed' | 'forbidden' | 'allowlist', egress: { managedCloud: boolean, byokDomainsAllowlist[] }, retentionDays?, auditExport: { required: boolean, path? }, updateChannel? }`.
- **Signature:** Ed25519 by a key listed in the license's `policyKeys[]` — the license is the root of trust for policy, so a forged policy can't loosen anything the license didn't authorize. Policy can only _restrict_ relative to product defaults, never grant (e.g. it cannot re-enable managed cloud on a build where the org forbade it — monotonic tightening keeps reasoning simple and auditable).
- **Enforcement points (all existing guards, no new kernel):**
  - Desktop: runtime gates where Local→BYOK fork consent fires; a forbidden provider never reaches the consent dialog.
  - CLI: privacy-mode checks in the session bootstrap.
  - VS Code: the extension's provider selection layer.
  - Mobile (later): the `egressGuard` pattern.
- **Provability:** extend the existing policy test corpus so each surface replays the same policy fixtures (allowed/forbidden matrices) — the auditable zero-egress claim is the selling point.

### 2.3 Enterprise identity

Two tiers, decided at implementation time per org:

- **Connected tier:** Clerk org SSO/SCIM for _account identity only_ — sign-in binds a seat, but chats/files/sessions still never route through cloud (identity plane ≠ data plane; must be documented in the trust-boundary docs and guarded by the boundary tests).
- **Air-gapped tier:** no cloud identity at all; seat identity = local OS user + license file. Optional local directory (LDAP) binding is a follow-on, not v1.

### 2.4 Local audit and export

Generalize the desktop per-session `audit.jsonl` pattern into an org-readable audit log: append-only JSONL per seat — session start/end, mode used, provider/model ids, policy decisions (allowed/blocked), license/seat claim — **never message content, never file content**. `agi audit export` (CLI) / Settings → Export (Desktop) produce a signed bundle for the org's compliance intake. Retention honors `policy.retentionDays`.

### 2.5 Self-hosted gateway profile

A deployment profile of the existing `services/api-gateway` (not a fork): org runs it on their infra with org-owned provider keys or open-weight endpoints; desktop/CLI/VS Code point at it via policy (`byokDomainsAllowlist`). This composes with the self-hosted open-weights GTM direction. v1 scope: config profile + docs + a smoke compose file; no multi-tenant admin UI.

## 3. Sequencing and effort

Order (each its own PR set, after the P2 provider consolidation which is now done):

1. `packages/licensing` + `agiworkforce-licensing` crate + cross-language fixtures (M).
2. OrgPolicy schema + signature verify + fixture corpus (S–M).
3. Enforcement wiring: Desktop → CLI → VS Code, one surface per PR, each with the policy replay tests (M).
4. Audit log generalization + export (S–M).
5. Self-hosted gateway profile + docs (S).
6. Identity tiers (Clerk org wiring for the connected tier) (M, needs founder call on which tier ships first).

## 4. Founder decisions required before implementation (blocking)

1. **Pricing and edition split** — what `team` vs `enterprise` include; per-seat price; whether Team is self-serve. (Owns the `features[]` flag list.)
2. **Seat true-up posture** — pure honor-count vs audit-export-required-for-renewal.
3. **Identity tier for v1** — connected (Clerk SSO) first, or air-gapped first. Air-gapped is the stronger differentiator; connected is the easier sale.
4. **Whether the activation ping option exists at all** (some buyers require its absence).

## 5. Explicit non-goals (v1)

Central license server, remote seat revocation, usage metering for Local mode, mobile enterprise, policy-granted capabilities (policy only restricts), multi-tenant self-hosted gateway admin.
