# ADR: Four-tier auth ladder enforced per-endpoint, not via single middleware

## Status

Accepted — 2026-05-09.

## Context

The api-gateway worker direction-inversion protocol (architecture doc §6) defines four authentication tiers used by different endpoint groups:

| Tier | Credential                                                       | Endpoints                                               |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | `Authorization: Bearer <gateway-jwt>` (OAuth)                    | registration, trusted-device enrollment                 |
| 2    | `X-Environment-Secret` (SHA-256 hashed + server secret)          | archive, poll, stop, worker-level heartbeat, epoch bump |
| 3    | `Authorization: Bearer <session-ingress-token>` (base64url JSON) | ack, complete, work-level heartbeat                     |
| 4    | `X-Trusted-Device-Token` (optional, alongside Tier 1 or Tier 3)  | logged but not yet enforced                             |

Two designs:

1. **Single auth middleware** that detects which tier the endpoint expects and runs the matching check.
2. **Per-endpoint enforcement**: each endpoint's handler explicitly checks its required tier before doing work.

A single middleware needs a routing table mapping endpoints to expected tiers — either string-matched (fragile) or annotated via decorators (heavier infra). Worse, the four schemes have different failure modes: Tier 1 returns 401 with WWW-Authenticate; Tier 2 returns 401 with no challenge; Tier 3 may return 409 on epoch mismatch; Tier 4 logs but never blocks. A single middleware would need to encode all of those.

## Decision

Each endpoint enforces exactly one auth tier directly in its handler. Implementation:

- Tier 1 endpoints use the existing `authenticateToken` middleware.
- Tier 2 endpoints call `validateEnvironmentSecret(req, environmentId)` inline.
- Tier 3 endpoints call `validateSessionIngressToken(req, environmentId, workId)` inline.
- Tier 4 reads the optional header `req.get('X-Trusted-Device-Token')` and logs it; no enforcement yet.

Tiers are not interchangeable. A Tier 2 endpoint receiving a Tier 1 token rejects with 401 even if the user is authenticated.

## Consequences

**Positive**

- Each handler is self-contained — readers see exactly which auth is required without consulting a middleware table.
- Failure modes stay specific to the tier: 401 with proper challenge for Tier 1, 401 plain for Tier 2, 409 for Tier 3 epoch mismatch.
- Adding a new tier (Tier 5 for example) is additive: write the validator, call it in the new endpoints. No middleware refactor.
- Tests assert tier behaviour endpoint-by-endpoint (35 tests in `worker.test.ts`).

**Negative**

- Duplication: every Tier 2 endpoint contains a `validateEnvironmentSecret(req, ...)` call. Mitigated by the small endpoint count (under a dozen) and the fact that the validators are one-line calls.
- A new endpoint that forgets to call a validator is silently unauthenticated. Mitigated by code review and by the test convention "every endpoint has a 401 test for missing credentials" — five out of fifteen tests in `worker.test.ts` are exactly this.
- Cross-cutting concerns (request ID, log envelope) still need either middleware or per-handler boilerplate. We accept per-handler today; if it becomes painful, a logging middleware can be added without touching auth.

## References

- `docs/architecture/foundation-2026.md` §6.3.
- `services/api-gateway/src/worker/{registration,assignment,heartbeat}.ts`.
- `tasks/research/exec/1.7-report.md` §3.4.
