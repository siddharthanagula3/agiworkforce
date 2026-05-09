# ADR: Two-layer dedup for Dispatch (TS app-level + Rust HMAC nonce)

## Status

Accepted — 2026-05-09.

## Context

The desktop Dispatch listener (`apps/desktop/src/services/dispatch.ts`, see architecture doc §8) verifies HMAC-signed messages from mobile via the Rust crypto module. Replay defense lives in the Rust nonce cache: a sliding window of 1,000 nonce IDs over a 60-second TTL. That is sufficient against a strict cryptographic replay attacker.

In practice the channel also carries duplicate messages that are not malicious replays — they have new nonces but the same application-level message ID, because the signaling-server sometimes re-broadcasts on connection blips, and because the old transitional unsigned-message path could send the same payload twice during the cutover window. Letting these reach the Rust verifier wastes a verify call and pollutes the nonce cache with valid-but-duplicate entries that crowd out genuine messages.

## Decision

We add a TypeScript-side dedup cache at `dispatch.ts:88-110` keyed on the application-level message ID (`InboundDispatchMessage.id`), with a max of 1,000 entries and a 60-second TTL that matches the Rust nonce TTL. `verifyInbound(rawJson)` checks the TS cache first; on hit, it returns without calling Rust. On miss, it adds the ID and forwards to Rust verify.

This produces two layers:

- **Layer 1 (TS, app-level):** keyed on `id` (assigned by the sender). Catches forwarded duplicates with identical IDs.
- **Layer 2 (Rust, cryptographic):** keyed on the HMAC nonce. Catches replay attacks where the attacker reuses a signed envelope.

## Consequences

**Positive**

- The Rust nonce cache stays clean: only first-time-seen messages reach it. Genuine 1,000-message bursts are not crowded out by duplicate replay.
- Forwarded duplicates short-circuit before any IPC overhead. Faster reject path on the common signaling-server hiccup.
- The two layers are independent: the cryptographic guarantee is unchanged; the TS layer is purely an optimisation.

**Negative**

- Two caches to maintain. The TS cache lives in module-level state and is reset on `resetDispatchSession()`; the Rust cache is reset by Rust state changes. Mismatched TTLs could let one layer accept what the other rejects. Mitigated by hardcoding identical 60-second TTLs in both layers and asserting in tests (`dispatch.test.ts`) that the TS dedup window matches Rust.
- Memory cost: 1,000 strings + 1,000 timestamps in the TS heap. Negligible.
- Sender-controlled `id` field means a malicious sender could engineer collisions. The Rust HMAC nonce is what provides cryptographic dedup; the TS layer does not weaken that guarantee, only reduces work.

## References

- `docs/architecture/foundation-2026.md` §8.3.
- `apps/desktop/src/services/dispatch.ts:88-110` (dedup cache implementation).
- `apps/desktop/src/services/__tests__/dispatch.test.ts` (26 dispatch tests including dedup coverage).
