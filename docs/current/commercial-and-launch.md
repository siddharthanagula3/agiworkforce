# Commercial And Launch Model

Status: Current
Owner: Founder + commercial/platform lead
Last updated: 2026-05-21

## Bootstrap Rule

AGI should not burn founder money on unmanaged cloud usage. Local and BYOK can launch first because users bring their own compute or provider key. Managed compute and managed credits stay waitlisted/private beta until the business can meter cost, prevent abuse, and survive refunds and disputes.

## Launch Posture

| Area               | Current posture                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Local              | Core differentiation. Free to use where technically available.                                                |
| BYOK               | Explicit provider trust boundary. User pays provider directly.                                                |
| Managed cloud      | Waitlist/private beta only.                                                                                   |
| Mobile v1          | Small on-device Local LLMs + Cloud invite/waitlist. No Mobile BYOK in v1.                                     |
| Web                | Subscription-backed account/chat state through Neon. No Web BYOK. Cloud is invite/waitlist only.              |
| Desktop            | Local and BYOK-local store locally. Desktop Cloud requires invite/subscription and Neon-backed account state. |
| CLI/VS Code/Chrome | Developer/workspace scoped; no silent global chat sync.                                                       |

## Managed Credit Requirements

Do not sell broad public managed credits until AGI has:

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
