# Architecture Decision Records

Start with [CURRENT_DECISIONS.md](CURRENT_DECISIONS.md) for the latest cross-doc decision index and mobile-v1 launch clarifications.

This directory holds ADRs for AGI Workforce, formatted per Michael Nygard. Each ADR has Status / Context / Decision / Consequences. Once accepted, an ADR is immutable — supersede it with a new ADR rather than editing.

For higher-level architectural narrative, see `docs/architecture/foundation-2026.md`. ADRs deliberately stay narrow and decision-focused; the architecture doc connects them.

## Index

### Current integration decisions

- [2026-07-31-desktop-code-egress-boundary.md](2026-07-31-desktop-code-egress-boundary.md) — route every model-owned Desktop code execution path through fail-closed Seatbelt/Bubblewrap network isolation and delete the uncalled sandbox-profile stub module.
- [2026-07-30-mobile-store-billing-boundary.md](2026-07-30-mobile-store-billing-boundary.md) — remove the unreachable placeholder-backed IAP prototype while retaining IAP-first as a future product requirement gated by real store products and lifecycle infrastructure.
- [2026-07-30-cut-shallow-workspace-index.md](2026-07-30-cut-shallow-workspace-index.md) — remove the orphaned regex symbol/dependency index and require any future repository index to use one parser/LSP-backed authority.
- [2026-07-30-web-conversation-branching.md](2026-07-30-web-conversation-branching.md) — persist Web branches as idempotent owner-scoped conversation copies and mount direct sibling navigation at the mapped fork point.
- [2026-07-30-fail-closed-visual-baselines.md](2026-07-30-fail-closed-visual-baselines.md) — keep visual baselines as reviewed artifacts, require explicit regeneration, and block CI on pixel drift.
- [2026-07-30-web-message-surface-adapters.md](2026-07-30-web-message-surface-adapters.md) — keep Web message/thinking orchestration as a surface adapter while sharing host-neutral renderers and the canonical ToolCallCard.
- [2026-07-30-enterprise-local-verifier-retention.md](2026-07-30-enterprise-local-verifier-retention.md) — retain the zero-runtime-consumer TypeScript and Rust Enterprise Local verifiers solely as a cross-language contract-test foundation until a complete runtime trust boundary is approved.

### Foundation Sprint architectural ADRs (12)

- [2026-05-09-bridge-over-rewrite-store-migration.md](2026-05-09-bridge-over-rewrite-store-migration.md) — bridge 12 zustand stores into `appStateStore` rather than rewriting; preserves 1,622 desktop tests.
- [2026-05-09-depth-counter-circularity.md](2026-05-09-depth-counter-circularity.md) — per-call depth counter for circular-fan-out detection in `onChangeAppState`, not module-level flag.
- [2026-05-09-onchange-fires-before-listeners.md](2026-05-09-onchange-fires-before-listeners.md) — `createStore.onChange` fires before subscribers; React 19 concurrent-mode discipline.
- [2026-05-09-per-surface-queue-factory.md](2026-05-09-per-surface-queue-factory.md) — `messageQueueManager` is a per-surface factory, not a module singleton.
- [2026-05-09-dispatch-two-layer-dedup.md](2026-05-09-dispatch-two-layer-dedup.md) — two-layer dedup (TS app-level + Rust HMAC nonce) for Dispatch.
- [2026-05-09-dispatch-supabase-rpc-injection.md](2026-05-09-dispatch-supabase-rpc-injection.md) — Supabase RPC injection for key rotation, not direct client.
- [2026-05-09-sticky-retry-context.md](2026-05-09-sticky-retry-context.md) — sticky `RetryContext` is mutable to the generator, readonly to callers.
- [2026-05-09-stream-watchdog-promise-race.md](2026-05-09-stream-watchdog-promise-race.md) — per-chunk `Promise.race` + `setTimeout` for stream-idle watchdog.
- [2026-05-09-try-with-rust-context.md](2026-05-09-try-with-rust-context.md) — Rust `try_with` over `with` for incremental `tokio::task_local!` adoption.

### Strategic ADRs (6)

- [2026-05-20-openai-anthropic-application-suite-thesis.md](2026-05-20-openai-anthropic-application-suite-thesis.md) — AGI Workforce is an OpenAI/Anthropic-style application suite, differentiated by local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute.
- [2026-05-09-strategic-both-equal-customer-focus.md](2026-05-09-strategic-both-equal-customer-focus.md) — consumer (chat) and builder (worker SDK) treated as equal first-party surfaces.
- [2026-05-09-strategic-acquisition-optionality.md](2026-05-09-strategic-acquisition-optionality.md) — shared packages stay independently shippable for acquisition scenarios.
