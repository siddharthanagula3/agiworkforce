# ADR: `WorkSecret` codec lives in `types.ts` (no class)

## Status

Accepted — 2026-05-09.

## Context

The api-gateway worker direction-inversion protocol (architecture doc §6) issues `WorkSecret` envelopes — base64url-encoded JSON containing `version`, `session_ingress_token`, `expires_at`, `environment_id`, `work_id`. Workers (CLI, desktop, mobile) decode the envelope on every incoming work unit; the gateway encodes it on every assignment.

Two implementations were possible:

1. **`WorkSecret` class** in a dedicated module with `encode()` and `decode()` methods.
2. **Codec functions in `types.ts`** alongside the type definition, with no class.

A class buys nothing here: there is no instance state, no inheritance, no polymorphism. It does add a serialisation problem — class instances do not survive `JSON.stringify` cleanly across the Tauri invoke boundary or the Express request/response cycle. They become plain objects, which then fail `instanceof` checks.

## Decision

`encodeWorkSecret(payload)` and `decodeWorkSecret(base64url)` are exported functions in `services/api-gateway/src/worker/types.ts`. The `WorkSecret` type is a plain interface. There is no class, no `instanceof` check, no method bag.

`decodeWorkSecret` validates:

- `version === WORK_SECRET_VERSION` (= 1) — rejects any other value to block downgrade attacks.
- `session_ingress_token` is non-empty — rejects malformed envelopes.
- `expires_at > now` — rejects expired envelopes.
- base64url parsing failure throws with "malformed" message.

## Consequences

**Positive**

- Zero serialisation friction. The envelope round-trips cleanly across HTTP, Tauri invoke, and Express middleware.
- Type-only checks are straightforward: `if (!isWorkSecret(value))` versus `instanceof WorkSecret`.
- The codec is trivially tree-shakable. A Mobile bundle that only decodes (does not encode) drops `encodeWorkSecret` automatically.
- Unit tests are simple function calls (`encode → decode → assert equal`).

**Negative**

- No method-style ergonomics: callers write `decodeWorkSecret(envelope)` not `envelope.decode()`. Acceptable; the function names are short.
- Validation logic is bag-of-functions, not encapsulated. Mitigated by colocating all `WorkSecret`-related functions and constants in `types.ts:1-220` with shared `validateBridgeId`.
- Adding a new field to `WorkSecret` requires updating both `encodeWorkSecret` and `decodeWorkSecret` plus the type. With a class, the constructor would centralise. We accept the duplication; the codec is small.

## References

- `docs/architecture/foundation-2026.md` §6.4.
- `services/api-gateway/src/worker/types.ts:1-220`.
- `tasks/research/exec/1.7-report.md` §3.1.
