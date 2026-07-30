# @agiworkforce/licensing

Status: Current
Owner role: Platform lead
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

`@agiworkforce/licensing` is the pure, offline-verifiable primitive for
Enterprise Local licensing (design `docs/enterprise/enterprise-local-design.md`
§2.1–§2.2). It verifies signed `.agilicense` and `.agipolicy` files with
**zero I/O and zero network** so Local deployments license offline, and it NEVER throws and NEVER
gates data access — only enterprise _features_ are gated, and any invalid or
expired-past-grace license resolves to a structured verdict the caller uses to
degrade to the free Local tier.

This package is the mechanism only. It is NOT wired into any app runtime, UI, or
enforcement path — that is a later, separately-scoped step. Editions, per-seat
pricing, the concrete `features[]` flag list, seat true-up posture, and the
activation-ping option are founder decisions (design §4) and are intentionally
absent: `features[]` is validated as an OPEN string array and never enumerated.

## Consumers

- `@agiworkforce/services` — transitional compatibility re-export for the
  `./org-policy` subpath.
- `crates/agiworkforce-licensing` is the Rust counterpart and replays the same
  fixture corpus; app enforcement remains deliberately unwired.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`
  - `LicenseClaimsSchema`, `EditionSchema`, `LicenseClaims`, `Edition`
  - `verifyLicense(fileBytes, rootPublicKeys, nowMs) => LicenseVerifyResult`
  - `verifySignedContainer(fileBytes, authorizedPublicKeysB64, expectedFormat)`
  - `LICENSE_CONTAINER_FORMAT`, error/result types
- `./org-policy` -> `./src/org-policy.ts`
  - Signed policy schema, monotonic-tightening rules, and offline verifier.
- `./test-support` -> `./src/test-support.ts`
  - **Test / fixture-generation only.** Deterministic keypair derivation and
    container signing so fixtures are REAL signatures, not hand-forged bytes.
    Not re-exported from the main entry point; production code only ever
    verifies (issuers sign out of band).

## Container format (`agilicense-v1`)

A `.agilicense` file is a single UTF-8 JSON object — intentionally JWT-shaped so
there is no canonical-JSON requirement and a Rust re-implementation can
byte-match without a JSON canonicalizer:

```json
{
  "format": "agilicense-v1",
  "payload": "<base64(standard) of the exact UTF-8 claims JSON bytes>",
  "signature": "<base64(standard) of the 64-byte Ed25519 signature>"
}
```

The signature is computed over the **ASCII bytes of the `payload` base64
string** (not the decoded JSON). Verifiers verify the signature against
`utf8Bytes(container.payload)`, then decode and parse — eliminating every
cross-language serialization ambiguity. Public keys (root keys and license
`policyKeys`) are base64 of the raw 32-byte Ed25519 public key.
`issuedAt`/`expiresAt` are integer Unix epoch **milliseconds**.

Verification order (each step yields a structured verdict, never a throw):
container shape/format → base64 decode → signature (against any root key) →
UTF-8/JSON parse → Zod schema → `issuedAt <= now` → `now <= expiresAt +
graceDays`. Distinct `expired` verdict when past grace.

## Fixture corpus

`src/__fixtures__/` holds the language-neutral corpus plus `manifest.json` (the
replay contract: root public keys, per-case `nowMs`, expected verdict).
Regenerate deterministically with `pnpm --filter @agiworkforce/licensing
generate:fixtures`. See `src/__fixtures__/README.md` for the per-file verdict
table. The org-policy corpus lives with its contract in
`packages/contracts/licensing/src/__fixtures__/org-policy/` and is generated
by the same script.

## Testing

```
pnpm --filter @agiworkforce/licensing typecheck
pnpm --filter @agiworkforce/licensing test
```
