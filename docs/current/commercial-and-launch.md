# Commercial And Launch Model

Status: Current
Owner: Founder + commercial/platform lead
Last updated: 2026-06-27

## Bootstrap Rule

AGI should not burn founder money on unmanaged cloud usage. Local and BYOK can launch first because users bring their own compute or provider key. Managed compute and managed credits are in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. The ability to meter cost, prevent abuse, and survive refunds and disputes must keep pace with public usage but no longer gates access.

## Launch Posture

| Area               | Current posture                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local              | Core differentiation. Free to use where technically available.                                                                                       |
| BYOK               | Explicit provider trust boundary. User pays provider directly.                                                                                       |
| Managed cloud      | Public alpha, open by default (2026-06-27); subscription/entitlement-gated, not waitlist-gated. Env kill-switch only.                                |
| Mobile v1          | Small on-device Local LLMs + Cloud public alpha (open by default). No Mobile BYOK in v1.                                                             |
| Web                | Subscription-backed account/chat state through Neon. No Web BYOK. Cloud is public alpha, open by default (subscription/entitlement-gated).           |
| Desktop            | Local and BYOK-local store locally. Desktop Cloud requires a subscription/entitlement (public alpha, open by default) and Neon-backed account state. |
| CLI/VS Code/Chrome | Developer/workspace scoped; no silent global chat sync.                                                                                              |

## Managed Credit Requirements

Managed cloud is open by default in public alpha (2026-06-27), so these controls must keep pace with public usage rather than gate access. They remain required GA-hardening work — build and prove them as usage scales:

- usage ledger,
- provider price table,
- quota reservation and settlement,
- provider discount accounting,
- fraud/risk controls,
- refund and chargeback policy,
- dispute reserve,
- tax/fee model,
- provider terms review,
- customer-visible retention/deletion rules.

## Payment Guidance

Cards and Stripe are acceptable for low-risk subscriptions and waitlist capture, but managed top-ups can attract fraud, disputes, stolen-card abuse, and margin loss. For enterprise managed credits, prefer invoice/ACH/wire and signed order forms before card top-ups.

## Profit Target

AGI can target modest margin on managed usage, but only after all processor fees, refunds, chargebacks, taxes, provider cost, support cost, and abuse reserves are accounted for. The product should remain valuable without managed cloud because Local and BYOK are first-class.

## Enterprise Path

Enterprise launch needs:

- organization policy,
- audit logs,
- SSO/SCIM,
- role-based admin,
- provider/connector policy,
- managed-credit ledger,
- support and feedback links,
- release-fix traceability.

The current enterprise control-plane foundation is the first step, not the final enterprise product.
