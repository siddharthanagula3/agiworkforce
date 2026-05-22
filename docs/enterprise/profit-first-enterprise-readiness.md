# Profit-First Enterprise Readiness

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21
Purpose: lock the commercial and operational gates for becoming an OpenAI/Anthropic-style application suite without creating uncapped bootstrapped burn.

## Commercial Posture

AGI Workforce should monetize software, trust, workflow, privacy, support, and enterprise controls before it subsidizes model usage.

Launch posture:

- Free: Local + direct BYOK only.
- Pro Individual: paid software features, no AGI-paid model subsidy by default.
- Team: shared projects, policies, local/BYOK onboarding, support, and admin basics.
- Business: audit logs, retention controls, connector policy, usage visibility, and priority support.
- Enterprise: invoice-first procurement, SSO/SCIM, custom retention, legal/security review, dedicated support, and optional managed compute.
- Managed Credits: private beta, prepaid, hard-capped, non-transferable, and ledgered per customer.

## Managed Compute Gates

Managed compute stays blocked from public self-serve until all gates are green:

| Gate               | Requirement                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage ledger       | Every model call records provider, model, privacy mode, tokens, provider cost, charged amount, margin, owner, and timestamp.                                                                       |
| Hard caps          | Per-user, per-org, and per-account caps fail closed before a provider call is made.                                                                                                                |
| Margin guardrail   | Warning at 35% provider-cost share of revenue; hard review at 50%; public launch requires sustained 50%+ gross margin after provider, infra, support, processor, fraud, refund, and dispute costs. |
| Payment risk       | Enterprise defaults to invoice/ACH/wire. Card top-ups stay limited or disabled until fraud/dispute reserves are proven.                                                                            |
| Provider terms     | Each provider path records whether data retention, training, zero-data-retention, and resale terms are compatible with the customer promise.                                                       |
| Abuse/fraud        | Lost-card, resale, bot signup, credit transfer, refund abuse, and chargeback scenarios have documented controls.                                                                                   |
| Retention/deletion | Managed compute workspaces, artifacts, logs, and previews have TTL, checksum, owner, deletion, and export metadata.                                                                                |

## Public Claim Rules

Do not claim Enterprise readiness until:

- `supabase/migrations` contains the current organization, membership, SSO, SCIM, policy, audit, usage-ledger, support, and managed-credit tables.
- API Gateway exposes policy, audit, usage, and support routes behind authenticated org membership checks.
- Web has an admin control-plane entry point that does not rely on marketing pages as the enterprise surface.
- Security review verifies RLS, service-role usage, audit immutability, and support privacy labels.
- Release notes can tie support/feedback cases to PRs, commits, and shipped versions.

## Bootstrap Rule

The founder can fund product development, but public usage should not create unknown recurring liabilities. If a customer can trigger AGI-paid provider calls, AGI must know the expected provider cost and maximum loss before accepting the request.
