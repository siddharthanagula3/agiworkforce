# Volume 04 — Tenancy, Identity, Entitlement

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 4)
Authority: `docs/current/source-of-truth.md`, `docs/enterprise/` (control plane), this manual

## Philosophy & Cloud/Local stance

Tenancy is where the trust boundary meets the org chart. Every persisted record carries org/workspace/user scope, and isolation is enforced at the database with Row-Level Security — not in application code that an agent or a refactor could bypass. Managed access is **subscription/entitlement-gated, not waitlist-gated** (founder decision 2026-06-27): the private-beta gate is removed; signed-in entitled users can use managed compute. The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env survives only as an incident-response kill-switch.

Cloud vs Local reshapes tenancy materially. In **Managed Cloud**, identity is the AGI account (Clerk), and entitlement (tier, quota, spend limit) is enforced server-side before any compute runs. In **Local** mode, AGI must never _require_ an account: local-first chat and local tools work without sign-in, and Local data stays on-device regardless of tenant state. In **BYOK**, the tenant pays the provider directly — AGI gates the _software/governance layer_, never the user's own tokens. Quotas, spend caps, and metering therefore apply to Managed; they do not gate Local or BYOK execution.

## Binding rules

1. **Every record carries org/workspace/user scope**; RLS is enforced at the DB (Operating Law-adjacent; `source-of-truth.md`).
2. **Managed access is subscription/entitlement-gated, not waitlist-gated.** The private-beta gate is removed; the env flag is a kill-switch only.
3. **Never require an AGI account for Local.** Local-first execution must work signed-out (Vol 6).
4. **Quotas and monthly spend limits are enforced server-side**, before compute, and idempotently on retries (Vol 28).
5. **RBAC is fail-closed and deny-beats-allow.** Absence of a grant is a denial, not a default-allow.
6. **Shared projects/workspaces isolate by member RBAC** (Vol 13); a member sees only what their role grants.
7. **Enterprise controls** — SSO/SCIM, audit logs, data residency, retention/deletion — are first-party requirements that must keep pace with public managed usage (Vol 28/30), even though they no longer gate access.
8. **Local/BYOK are never silently routed into managed cloud** regardless of org policy (Vol 3).

## Repository map

- `packages/contracts/types/src/enterprise/` and `packages/contracts/types/src/auth.ts`, `user.ts`, `workspace-analytics.ts` — org/team/workspace/user and entitlement contracts.
- `packages/contracts/types/src/billing-catalog.ts` — subscription tiers and entitlement metadata (Free, Plus, Pro, Max, Enterprise).
- `packages/contracts/compliance/` — compliance helpers feeding enterprise controls.
- `services/api-gateway` — server-side entitlement, quota, and spend-limit enforcement for managed compute; the only place managed access is gated.
- `apps/web/db/neon` — canonical migrations; RLS policies and append-only audit tables live here.
- `docs/enterprise/` — admin policy, identity, audit, support, usage-ledger docs (`repo-map.json` Enterprise Control Plane); managed access stays subscription/entitlement-gated.

## Competitor notes

- **Both incumbents** ship the full enterprise stack: SSO/SCIM, audit logs, a Compliance API, OTel/SIEM streaming, RBAC, spend limits, data residency, customer-managed keys, HIPAA-readiness, retention/deletion (`docs/strategy/01` §4). This is "the ongoing tax," not a differentiator.
- **OpenAI/ChatGPT** connectors respect _per-user_ source permissions ("Company knowledge") with admin controls — AGI mirrors this: connectors read third-party data only with explicit per-user permission and a visible context label (Vol 20).
- **AGI divergence:** AGI's tenancy must additionally encode the trust boundary — entitlement and RBAC never become a path to silently route Local/BYOK into managed cloud (`repo-map.json` Enterprise rule). The sovereign/privacy-first enterprise wedge (data residency + local-first + no-egress) is the deliberate divergence (`docs/strategy/01` §5).

## Checklists

### Multi-tenant isolation review

- [ ] Every new table has an org/workspace/user scope column and an RLS policy.
- [ ] No query can return another tenant's rows even if the app layer is buggy (RLS, not app-only checks).
- [ ] Conversation/project/artifact routes are IDOR-safe (verified, not assumed).
- [ ] Audit-log writes are append-only and immutable.

### RBAC & permissions

- [ ] Permission checks are fail-closed; missing grant = deny.
- [ ] Shared project/workspace access is gated by member role.
- [ ] Admin-only actions reject non-admin callers server-side, not just in the UI.
- [ ] Role changes are audited.

### Entitlement & quotas

- [ ] Managed compute is gated by subscription/entitlement, server-side, before execution.
- [ ] Monthly spend limit and quota enforced server-side and idempotent on retries.
- [ ] Tier resolved from `billing-catalog.ts`; no hardcoded tier logic in surfaces.
- [ ] Local and BYOK execution are NOT blocked by managed quotas.
- [ ] The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch path is tested (re-gate works) but defaults open.

### Identity & enterprise

- [ ] Local mode works fully signed-out (no account required).
- [ ] SSO/SCIM provisioning maps to org/workspace scope correctly (where shipped).
- [ ] Data-residency and retention/deletion controls are honored for managed tenants.
- [ ] Org policy cannot create a Local/BYOK→Managed silent route.

## Definition of Done

Tenancy is "production-ready" when: every record is org/workspace/user scoped and RLS-enforced at the DB; RBAC is fail-closed with audited role changes; managed access is gated by entitlement (not waitlist) server-side; quotas/spend limits are enforced idempotently and apply only to managed; Local works signed-out; enterprise controls (SSO/SCIM/audit/residency/retention) keep pace with public usage; and no tenancy path can silently cross a trust boundary.

## Anti-patterns

- Enforcing tenant isolation only in application code, leaving the DB open if a query is wrong (use RLS).
- Re-introducing a waitlist gate for managed access (it was removed; the env flag is a kill-switch only).
- Requiring an AGI account to use Local mode.
- Letting managed quota/spend limits block Local or BYOK execution.
- Treating BYOK tokens as a billable AGI line item — the business is the software/governance layer, not resold tokens (Vol 28, Vol 37).
- Mutable or app-deletable audit logs.
