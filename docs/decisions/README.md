# Architecture Decision Records

This directory holds ADRs for AGI Workforce, formatted per Michael Nygard. Each ADR has Status / Context / Decision / Consequences. Once accepted, an ADR is immutable — supersede it with a new ADR rather than editing.

For higher-level architectural narrative, see `docs/architecture/foundation-2026.md`. ADRs deliberately stay narrow and decision-focused; the architecture doc connects them.

## Index

### Foundation Sprint architectural ADRs (12)

- [2026-05-09-bridge-over-rewrite-store-migration.md](2026-05-09-bridge-over-rewrite-store-migration.md) — bridge 12 zustand stores into `appStateStore` rather than rewriting; preserves 1,622 desktop tests.
- [2026-05-09-depth-counter-circularity.md](2026-05-09-depth-counter-circularity.md) — per-call depth counter for circular-fan-out detection in `onChangeAppState`, not module-level flag.
- [2026-05-09-onchange-fires-before-listeners.md](2026-05-09-onchange-fires-before-listeners.md) — `createStore.onChange` fires before subscribers; React 19 concurrent-mode discipline.
- [2026-05-09-per-surface-queue-factory.md](2026-05-09-per-surface-queue-factory.md) — `messageQueueManager` is a per-surface factory, not a module singleton.
- [2026-05-09-dispatch-two-layer-dedup.md](2026-05-09-dispatch-two-layer-dedup.md) — two-layer dedup (TS app-level + Rust HMAC nonce) for Dispatch.
- [2026-05-09-dispatch-supabase-rpc-injection.md](2026-05-09-dispatch-supabase-rpc-injection.md) — Supabase RPC injection for key rotation, not direct client.
- [2026-05-09-sticky-retry-context.md](2026-05-09-sticky-retry-context.md) — sticky `RetryContext` is mutable to the generator, readonly to callers.
- [2026-05-09-stream-watchdog-promise-race.md](2026-05-09-stream-watchdog-promise-race.md) — per-chunk `Promise.race` + `setTimeout` for stream-idle watchdog.
- [2026-05-09-worksecret-codec-in-types.md](2026-05-09-worksecret-codec-in-types.md) — `WorkSecret` codec lives in `types.ts` (no class) for FFI portability.
- [2026-05-09-per-endpoint-auth-ladder.md](2026-05-09-per-endpoint-auth-ladder.md) — four-tier auth ladder enforced per-endpoint, not via single middleware.
- [2026-05-09-try-with-rust-context.md](2026-05-09-try-with-rust-context.md) — Rust `try_with` over `with` for incremental `tokio::task_local!` adoption.
- [2026-05-09-zoom-unsupported-until-tabs-permission.md](2026-05-09-zoom-unsupported-until-tabs-permission.md) — `browser-tool` `zoom` action emits `unsupported` step until `tabs` permission lands.

### Strategic ADRs (5)

- [2026-05-09-strategic-maximalist-surface-coverage.md](2026-05-09-strategic-maximalist-surface-coverage.md) — ship six surfaces concurrently rather than consolidate.
- [2026-05-09-strategic-3-vm-parallel.md](2026-05-09-strategic-3-vm-parallel.md) — Foundation Sprint runs 7 branches concurrently across 3 worktrees.
- [2026-05-09-strategic-foundation-first-sprint.md](2026-05-09-strategic-foundation-first-sprint.md) — primitives land before any feature work that depends on them.
- [2026-05-09-strategic-both-equal-customer-focus.md](2026-05-09-strategic-both-equal-customer-focus.md) — consumer (chat) and builder (worker SDK) treated as equal first-party surfaces.
- [2026-05-09-strategic-acquisition-optionality.md](2026-05-09-strategic-acquisition-optionality.md) — shared packages stay independently shippable for acquisition scenarios.
