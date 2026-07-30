# agiworkforce-licensing

Status: Current
Owner role: Rust platform
Last updated: 2026-07-15
Kind: rust-crate
Criticality: high

## Purpose

Offline, panic-free verification of enterprise-Local **licenses**
(`.agilicense`) and **org policies** (`.agipolicy`) — the Rust half of the P7
Enterprise Local licensing foundation (design
`docs/enterprise/enterprise-local-design.md` §2.1 / §2.2).

This crate is a byte-for-byte re-implementation of the TypeScript
`@agiworkforce/licensing` package (`packages/contracts/licensing`), including its
org-policy verifier (`packages/contracts/licensing/src/org-policy.ts`). It is the **verify
primitive only** — it does not sign, activate, interpret product feature flags,
or wire into any app/desktop/CLI/gateway runtime.

## Shared cross-language fixture corpus

The TS and Rust implementations share ONE language-neutral fixture corpus so
their verdicts can be proven identical — the same cross-language replay pattern
used by `sync-apply`. The container format is intentionally JWT-shaped (a base64
`payload` string plus a detached Ed25519 signature over the ASCII bytes of that
base64 string), so there is no canonical-JSON step and neither side ever
re-serializes the payload.

The corpora live with the TS package and are the single source of truth:

- `packages/contracts/licensing/src/__fixtures__/` (license corpus + `manifest.json`)
- `packages/contracts/licensing/src/__fixtures__/org-policy/` (org-policy
  corpus + `manifest.json`)

The crate's `#[cfg(test)]` suite REPLAYS those exact files (read via a path
relative to `CARGO_MANIFEST_DIR` — never copied) and asserts each fixture
produces the verdict its manifest declares. A discrepancy is a real
cross-language bug, not fixture drift: the TS side + manifest are canonical.
Regenerate the corpus from the TS side only
(`pnpm --filter @agiworkforce/licensing generate:fixtures`).

## Consumers

None yet — this is the verify primitive, deliberately unwired. Future
per-surface enforcement (desktop/CLI/gateway) will consume `verify_license` /
`verify_org_policy`; that wiring is a separate, founder-gated step.

## Public API / Exports

Rust crate `agiworkforce_licensing`. Key entry points:

- `verify_license(file_bytes, root_public_keys, now_ms) -> LicenseVerifyResult`
- `verify_org_policy(file_bytes, license_claims, now_ms, baseline) -> OrgPolicyVerifyResult`
- `verify_signed_container(...)` — the shared crypto core.
- `check_policy_tightening(...)` / `default_policy_baseline()` — the monotonic
  tightening lattice.
- `test_support` module (behind the `test-support` feature) — Ed25519 signing
  helpers for tests only; NOT part of the production verify surface.

Error taxonomies mirror the TS side exactly: license
`malformed | bad_signature | not_yet_valid | expired`; org policy
`malformed | bad_signature | org_mismatch | not_yet_valid | not_tightening`.

## What Belongs Here

- Container/license/org-policy verification that must byte-match the TS side.
- The monotonic-tightening lattice and the shared-corpus replay tests.

## What Does Not Belong Here

- License signing/issuance or activation flows.
- Product feature-flag semantics, editions, or pricing (design §4 — founder-gated).
- Any runtime wiring, enforcement points, or UI.

## Key Files

- `src/container.rs` — signed-container format + Ed25519 verify core.
- `src/verify.rs` — `verify_license` + expiry/grace logic.
- `src/org_policy.rs` — org-policy schema, tightening lattice, `verify_org_policy`.
- `src/claims.rs` — `LicenseClaims` schema.
- `src/test_support.rs` — test-only signing helpers (feature-gated).
- `src/tests.rs` — shared-corpus replay + boundary/rotation/tamper tests.

## Commands

- `cargo test -p agiworkforce-licensing`
- `cargo clippy -p agiworkforce-licensing --all-targets -- -D warnings`
- `cargo build -p agiworkforce-licensing --locked`

## Environment / Secrets

No secrets. Root public keys and license `policyKeys` are inputs, not embedded
secrets. Private keys never appear outside the test-support signing helpers.

## Security, Privacy, Data Boundaries

Security review is required for any change to signature verification, the
container format, the schema, or the tightening lattice. Invariants: never
panics on attacker-controlled input; never gates data access (an invalid license
degrades to the free Local tier via a structured verdict); the license is the
root of trust for org policy (a policy signs only with a key in the license's
`policyKeys[]`); policies may only tighten, never grant.

## Tests Required For Changes

Any change must keep the shared-corpus replay green and, if it touches
verification semantics, add a corresponding fixture on the TS side first (the
canonical corpus) before mirroring the verdict here.

## Release / Deployment Notes

Verify-only; unwired. Do not add runtime wiring or feature-flag semantics in this
crate.

## Known Caveats

`verify_strict` is used (rejects malleability/weak keys). It agrees with the TS
`@noble/curves` `verify` on the honest/tampered fixture corpus; the corpus does
not contain malleability/small-order edge cases by design, so both verifiers
agree. If such a case were ever added, re-confirm both sides before landing.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for crypto/verification.
