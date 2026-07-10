# License fixture corpus

Status: Current
Owner role: Platform lead
Last updated: 2026-07-09

Language-neutral golden fixtures for offline license verification (design §2.1).
Every implementation — the TS `verifyLicense` here and the future Rust
`agiworkforce-licensing` crate — MUST produce the identical verdict for each
file. The machine-readable replay contract is `manifest.json`.

## Replay contract

For each case: `verifyLicense(readFileBytes(file), manifest.rootPublicKeys,
case.nowMs)` must equal `case.expect`.

- `rootPublicKeys` — the two base64 Ed25519 root public keys (root key 1 and the
  rotation root key 2). Held in the manifest, not in test code, so replays share
  them.
- `referenceNowMs` = `1782864000000` (2026-07-01T00:00:00Z). Every fixture's
  timestamps are relative to this instant; each case pins the `nowMs` it is
  judged at.
- Keys derive from fixed labelled seeds (`agi-license-root-key-1`,
  `agi-license-root-key-2`, `agi-attacker-key`, `agi-org-policy-key-1`). An
  Ed25519 secret key IS its 32-byte seed, so generation is byte-reproducible. A
  labelled seed is used instead of committing a private key so no secret scanner
  trips; these keys are FIXTURE keys with no production authority.

## Fixtures and expected verdicts

| File                            | nowMs     | Verdict                                                                |
| ------------------------------- | --------- | ---------------------------------------------------------------------- |
| `valid.agilicense`              | reference | ok, graceActive=false — honest sig by root key 1, inside term          |
| `valid-rotated-key.agilicense`  | reference | ok — signed by root key 2 (rotation); accepted from the rotatable list |
| `wrong-key.agilicense`          | reference | bad_signature — signed by a non-root key                               |
| `tampered.agilicense`           | reference | bad_signature — payload byte-flipped after signing                     |
| `expired-past-grace.agilicense` | reference | expired — now is past expiresAt + graceDays                            |
| `expired-in-grace.agilicense`   | reference | ok, graceActive=true — past expiresAt but within grace                 |
| `not-yet-valid.agilicense`      | reference | not_yet_valid — issuedAt is in the future                              |
| `malformed-json.agilicense`     | reference | malformed — not a JSON container                                       |
| `malformed-schema.agilicense`   | reference | malformed — valid sig, but claims omit a required field                |
| `wrong-format.agilicense`       | reference | malformed — format is `agipolicy-v1`, not `agilicense-v1`              |

Regenerate with `pnpm --filter @agiworkforce/licensing generate:fixtures` (also
regenerates the org-policy corpus under `packages/services`).
