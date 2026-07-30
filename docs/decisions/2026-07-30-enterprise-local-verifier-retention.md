# Retain Cross-Language Enterprise Local Verifiers Without Runtime Claims

Status: Accepted

Date: 2026-07-30

Owners: Platform, security/privacy, and Enterprise

## Context

AGI has two offline, pure verification implementations for the proposed
Enterprise Local file formats:

- `packages/contracts/licensing` for TypeScript control-plane consumers;
- `crates/agiworkforce-licensing` for Rust local-runtime consumers.

They replay the same signed fixture corpus, but neither implementation currently
has a production runtime consumer. The Enterprise Local activation, identity,
seat, distribution, and org-policy decisions have not been approved or backed
by a live database/control-plane path. Wiring either verifier into a product
surface now would manufacture an entitlement boundary that the product and
schema do not yet support. Deleting one implementation would also discard the
cross-language compatibility oracle needed before signed files can safely cross
the Web/Rust boundary.

## Decision

Retain both verifier packages as contract-test foundations, with their
zero-runtime-consumer status explicitly accepted by this ADR.

Until a follow-up ADR approves the Enterprise Local runtime:

1. Neither verifier is evidence that Enterprise Local licensing, signed org
   policy, offline activation, or managed configuration is shipped.
2. Both implementations must continue replaying the same fixtures and must
   remain free of network, filesystem, environment, and clock I/O at the
   verification boundary.
3. Product code must not add a partial license gate. The first production
   consumer must land with the authoritative key-distribution, revocation,
   identity/seat, policy-precedence, audit, and recovery design.
4. If the approved design needs only one runtime language, the unused
   implementation must be deleted in that implementation change rather than
   retained indefinitely.

## Consequences

- The two zero-consumer modules are intentional contract fixtures, not orphaned
  product features.
- Cross-language fixture parity remains testable before a trust boundary is
  activated.
- Public and internal capability inventories must continue to mark Enterprise
  Local runtime enforcement as unavailable.
- A future production integration requires a superseding ADR and end-to-end
  enforcement tests; importing a verifier alone is insufficient.
