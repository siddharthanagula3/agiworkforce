# Enterprise

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21
Purpose: durable enterprise-readiness plans, commercial guardrails, admin-control specs, and managed-compute launch gates.

## Read First

1. [`profit-first-enterprise-readiness.md`](./profit-first-enterprise-readiness.md) - bootstrapped enterprise posture and launch gates.
2. [`control-plane.md`](./control-plane.md) - shared contracts, database tables, API routes, and Web admin entry point.
3. [`../current/commercial-and-launch.md`](../current/commercial-and-launch.md) - commercial, payment-risk, and managed-compute gates.
4. [`../current/technical-architecture.md`](../current/technical-architecture.md) - enterprise control-plane architecture and ownership.
5. [`../decisions/CURRENT_DECISIONS.md`](../decisions/CURRENT_DECISIONS.md) - current managed-cloud and mobile-v1 decisions.

## Rules

- Local and direct BYOK can be public because AGI does not carry model COGS.
- Managed compute is private beta only until usage ledger, hard limits, fraud controls, refund/dispute reserves, provider terms, retention, and deletion evidence are tested.
- Enterprise commitments need tenant isolation, policy enforcement, auditability, support workflow, and incident/release evidence before public claims.
- Public pricing must never imply unlimited AGI-paid model usage.

## Ownership

Enterprise work crosses product, data, billing, security, support, and release. Treat changes in `packages/types/src/enterprise`, `supabase/migrations`, `services/api-gateway/src/routes/enterprise.ts`, and `apps/web/app/admin` as shared control-plane changes requiring founder/platform review until teams exist.
