# Enterprise

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21
Purpose: durable enterprise-readiness plans, commercial guardrails, admin-control specs, and managed-compute launch gates.

## Read First

1. [`profit-first-enterprise-readiness.md`](./profit-first-enterprise-readiness.md) - bootstrapped enterprise posture and launch gates.
2. [`control-plane.md`](./control-plane.md) - shared contracts, database tables, API routes, and Web admin entry point.
3. [`enterprise-local-design.md`](./enterprise-local-design.md) - Enterprise Local edition design (offline licensing, signed org policy, audit export, self-hosted gateway); verify primitive built (TS `@agiworkforce/licensing` + Rust `agiworkforce-licensing`), implementation gated on founder §4 decisions.
4. [`enterprise-local-pricing-decisions.md`](./enterprise-local-pricing-decisions.md) - Recommended answers to the four §4 decisions (editions/pricing, seat true-up, identity tier, activation ping) for founder sign-off.
5. [`../current/commercial-and-launch.md`](../current/commercial-and-launch.md) - commercial, payment-risk, and managed-compute gates.
6. [`../current/technical-architecture.md`](../current/technical-architecture.md) - enterprise control-plane architecture and ownership.
7. [`../decisions/CURRENT_DECISIONS.md`](../decisions/CURRENT_DECISIONS.md) - current managed-cloud and mobile-v1 decisions.

## Rules

- Local and direct BYOK can be public because AGI does not carry model COGS.
- Managed compute is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed. Usage ledger, hard limits, fraud controls, refund/dispute reserves, provider terms, retention, and deletion controls must keep pace with public usage, but they no longer gate access.
- Enterprise-specific commitments (org policy, SSO/SCIM, seats, contracts) still need tenant isolation, policy enforcement, auditability, support workflow, and incident/release evidence before public claims — this is an Enterprise-tier requirement, not a managed-cloud-wide gate.
- Public pricing must never imply unlimited AGI-paid model usage.

## Ownership

Enterprise work crosses product, data, billing, security, support, and release. Treat changes in `packages/contracts/types/src/enterprise`, `apps/web/db/neon` (the canonical migrations root — note the enterprise foundation tables have no migration yet, a tracked gap), `services/api-gateway/src/routes/enterprise.ts`, and `apps/web/app/admin` as shared control-plane changes requiring founder/platform review until teams exist.
