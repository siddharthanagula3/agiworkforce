# Rust Multi-Provider LLM Client + No-Panic Patterns

Research report for AGI Workforce
Date: 2026-05-29
Author: Research analyst (live-verified)
Scope: reqwest streaming SSE, tokio async, no-panic error handling (thiserror/anyhow), retry/backoff, provider abstraction traits. Framed against AGI's Rust CLI surface (`apps/cli`, `crates/`), which today pins reqwest 0.12, tokio 1, mixed thiserror 1/2, anyhow 1.

> Note on dates: version *numbers* below are taken from the crates.io API (authoritative) and are reliable. Some patch-release *dates* disagreed by up to a year across sources (a GitHub-releases scrape read years one year behind the crates.io API). Where sources conflicted I trust the crates.io year and avoid printing a precise day. Treat single-day precision on patch releases as approximate.

---

## Summary

The 2026 best-practice Rust LLM client is a thin, panic-free wrapper over `reqwest` with a provider-abstraction trait, SSE parsing delegated to a dedicated frame-reassembling crate (not a hand-rolled `chunk()` loop), transparent retry middleware for transient HTTP failures, and a two-tier error model (`thiserror` enums at library boundaries, `anyhow` at the application top level). The biggest single mistake in this domain is treating one network chunk as one SSE event — SSE frames routinely split across TCP reads, so robust parsing means either using `eventsource-stream`/`reqwest-eventsource` or correctly buffering and splitting on the `\n\n` frame boundary yourself.

Headline version facts as of 2026-05-29: `reqwest 0.13.4` is current (AGI is on 0.12); `tokio 1.52.3` is current and **there is no Tokio 2.0** (blog posts claiming "Tokio 2.0 dominates 2026" are not backed by a published crate — crates.io shows `max_stable_version = 1.52.3`). `thiserror` is at 2.x. The `backoff` crate is **unmaintained (RUSTSEC-2025-0012)**; the maintained replacement is `backon`. reqwest's own built-in retry feature is **still unmerged** (PR #2763), so retries today come from `reqwest-retry` middleware.

For AGI specifically: the reqwest 0.12 → 0.13 upgrade is the main decision. It is internally consistent (`reqwest 0.13` + `reqwest-middleware 0.5` + `reqwest-retry 0.9.1` all align), but 0.13 changes the default TLS/crypto provider to `aws-lc-rs`, which has C/CMake build requirements that complicate cross-compilation across AGI's six surfaces (notably mobile and Windows). AGI's existing `crates/agiworkforce-utils-rustls-provider` is the right place to pin this deliberately.

Confidence: **medium-high**. Versions and the SSE/async-trait/error guidance are well-sourced from official docs and crates.io. The "current bar" framing draws on community best-practice writing (2025–2026 blogs) which is reputable but not specification.

---

## Current bar (what best practice requires as of 2026-05-29)

1. **SSE parsing must reassemble frames, not assume one chunk = one event.** A `data:` line can arrive split across two TCP reads. The bar is to use a parser that buffers bytes and yields complete events on the `\n\n` boundary. `eventsource-stream` is the building block; `reqwest-eventsource` wraps it over a reqwest request and also handles last-event-id and retry. ([eventsource-stream docs](https://docs.rs/eventsource-stream/), [reqwest-eventsource docs](https://docs.rs/reqwest-eventsource/))
2. **Provider normalization across SSE dialects.** Anthropic emits *typed* events (`event: content_block_delta`, `event: message_stop`); OpenAI emits data-only frames terminated by a `data: [DONE]` sentinel. A multi-provider abstraction must normalize both into one internal delta type. (Provider-format difference; verify exact field names against each provider's live streaming docs before coding.)
3. **No `unwrap()`/`expect()`/`panic!()` on user-reachable paths**, enforced by Clippy `restriction` lints, not by discipline alone. ([Clippy restriction lints](https://rust-lang.github.io/rust-clippy/master/index.html))
4. **Two-tier errors:** `thiserror` enums for matchable library errors; `anyhow` (type-erased) only at the application/CLI top level. Preserve the chain with `#[source]`/`#[from]`. ([oneuptime: thiserror & anyhow](https://oneuptime.com/blog/post/2026-01-25-error-types-thiserror-anyhow-rust/view), [Luca Palmieri: Error Handling in Rust](https://www.lpalmieri.com/posts/error-handling-rust/))
5. **Transient HTTP failures retried with exponential backoff + jitter, scoped and budgeted.** reqwest has no built-in retry yet, so use `reqwest-retry` middleware (429/503/connect/timeout) and/or `backon` for arbitrary futures. ([reqwest-retry docs](https://docs.rs/reqwest-retry), [seanmonstar: reqwest retries](https://seanmonstar.com/blog/reqwest-retries/))
6. **One reused `Client`** with explicit `timeout` / `connect_timeout` / `read_timeout` and a tuned connection pool — never a fresh client per request. ([reqwest Client docs](https://docs.rs/reqwest/))
7. **`async_trait` (or manual `Pin<Box<dyn Future>>`) for any provider trait used behind `dyn`.** Native `async fn` in traits is stable but still **not dyn-compatible** in 2026. ([async-trait docs](https://docs.rs/async-trait), [async-fundamentals initiative](https://rust-lang.github.io/async-fundamentals-initiative/explainer/async_fn_in_dyn_trait.html))

---

## Version-specific facts (exact versions + dates)

All versions from the crates.io API unless noted.

| Crate | Current stable | Date (approx.) | Notes |
|---|---|---|---|
| `reqwest` | **0.13.4** | May 2026 | AGI is on 0.12. 0.13.0 shipped late 2025. |
| `reqwest` (0.12 line) | 0.12.x (final patch in the 0.12 series) | late 2024 | AGI's current pin. |
| `tokio` | **1.52.3** | 2026 | **No 2.0 exists.** LTS lines: 1.47.x (LTS to ~Sep 2026), 1.51.x (LTS to ~Mar 2027). |
| `thiserror` | **2.x** | 2024+ | AGI mixes thiserror 1 and 2 across crates — should converge on 2. |
| `anyhow` | 1.x | — | Application-level error type. |
| `reqwest-middleware` | **0.5** | 2025–2026 | reqwest-retry 0.9.1 requires `^0.5` (note: 0.4.2 still floats around in older threads). |
| `reqwest-retry` | **0.9.1** | Feb 2026 | Depends on `reqwest ^0.13.1` **and** `reqwest-middleware ^0.5`. (0.9.0 = Jan 2026; 0.8.0 = Nov 2025.) |
| `backon` | latest (actively maintained) | 2026 | Replacement for deprecated `backoff`. Supports `Retry-After` header, wasm, no-std. |
| `backoff` | **UNMAINTAINED** | advisory 2025-03-07 | RUSTSEC-2025-0012. Do not use in new code. |
| `eventsource-stream` | current | — | Low-level SSE frame parser over a `Stream<Bytes>`. |
| `reqwest-eventsource` | current | — | reqwest + eventsource-stream + retry/last-event-id. |
| `async-trait` | current | — | Still required for dyn-compatible async traits in 2026. |

### reqwest 0.13.0 breaking changes (relevant to an upgrade)
- **rustls is the default TLS backend** (was native-tls).
- **rustls now defaults to `aws-lc-rs`** as crypto provider (was `ring`).
- Feature **`rustls-tls` renamed to `rustls`**.
- rustls roots features removed; **`rustls-platform-verifier` used by default**.
- **`query` and `form` are now optional crate features**, disabled by default — must opt in if you build query/form bodies.
- native-tls now includes ALPN (`native-tls-no-alpn` to disable).
- Long-deprecated methods (trust-dns, non-wasm-cors) removed.

Source: [seanmonstar/reqwest releases](https://github.com/seanmonstar/reqwest/releases).

### Upgrade-path consistency (verified)
`reqwest-retry 0.9.1` declares `reqwest = "^0.13.1"` and `reqwest-middleware = "^0.5"`. So the resilient-client stack — **reqwest 0.13.x + reqwest-middleware 0.5 + reqwest-retry 0.9.1** — is mutually compatible. If AGI stays on reqwest 0.12, it must pin an older reqwest-retry/reqwest-middleware pair; the two cannot be mixed. ([crates.io reqwest-retry 0.9.1 deps](https://crates.io/api/v1/crates/reqwest-retry))

---

## Known pitfalls & gotchas

1. **SSE chunk-loop footgun.** The naive `while let Some(chunk) = response.chunk().await? { ... }` (and `bytes_stream()`) is correct for file downloads but **wrong for SSE** — a single event commonly spans two chunks, and a chunk can contain multiple events. Hand-rolling requires buffering across reads and splitting on `\n\n`. Prefer `eventsource-stream`/`reqwest-eventsource`. ([reqwest streaming docs](https://docs.rs/reqwest/), [eventsource-stream](https://docs.rs/eventsource-stream/))
2. **`[DONE]` sentinel + typed-event divergence.** OpenAI-style: ignore `data: [DONE]`, parse other `data:` lines as JSON. Anthropic-style: switch on the `event:` name. Treating them identically drops the final message or mis-parses control frames.
3. **Malformed/partial JSON deltas.** Even after correct frame reassembly, a `data:` payload can be invalid JSON (truncated stream, provider hiccup). Best practice: **log a warning and continue** rather than aborting the whole stream; surface a typed error only on unrecoverable conditions.
4. **`async fn` in trait is not dyn-compatible.** `Box<dyn LlmProvider>` (needed for runtime provider routing) requires `#[async_trait]` or manual `Pin<Box<dyn Future + Send>>`. Returning `impl Stream` from a trait method also breaks behind `dyn` — return `Pin<Box<dyn Stream<Item = ...> + Send>>`. The alternative to `dyn` is enum-dispatch over a closed provider set (faster, no boxing, but every provider must be known at compile time). ([async-trait](https://docs.rs/async-trait), [async-fundamentals initiative](https://rust-lang.github.io/async-fundamentals-initiative/explainer/async_fn_in_dyn_trait.html))
5. **`backoff` is unmaintained.** RUSTSEC-2025-0012 (2025-03-07). New retry code should use `backon` (futures) and/or `reqwest-retry` (HTTP middleware). ([RUSTSEC-2025-0012](https://rustsec.org/advisories/RUSTSEC-2025-0012.html), [backon](https://github.com/Xuanwo/backon))
6. **reqwest still has no built-in retry.** PR #2763 (July 2025) proposes composable retry policies with budgets and per-host scoping, but it is **not released**. Don't assume `Client::builder().retry(...)`. ([seanmonstar: reqwest retries](https://seanmonstar.com/blog/reqwest-retries/))
7. **Don't retry non-idempotent or already-streamed requests blindly.** reqwest can auto-clone non-streaming bodies, but an LLM streaming response that already emitted tokens cannot be safely "retried" mid-stream — retry belongs at connect/pre-first-byte, not after partial output.
8. **`aws-lc-rs` cross-compile cost (reqwest 0.13).** The new default crypto provider needs a C toolchain/CMake, which complicates builds for mobile and Windows targets. Pin `ring` or a chosen provider explicitly via rustls features if cross-compilation breaks.
9. **`unwrap_used`/`expect_used` Clippy lints fire in test modules too** unless `allow-unwrap-in-tests`/`allow-expect-in-tests` are set in `clippy.toml`; they live in the `restriction` group (cherry-pick, don't enable the whole group). ([Clippy issue #9612](https://github.com/rust-lang/rust-clippy/issues/9612), [Clippy lints index](https://rust-lang.github.io/rust-clippy/master/index.html))
10. **Over-erasing errors loses matchability.** Don't expose `anyhow::Error` from a library/provider crate — callers (the router, retry classifier) can't match on it to decide retry vs. fail. Keep `anyhow` at the binary boundary only. ([Palmieri](https://www.lpalmieri.com/posts/error-handling-rust/))
11. **Date/version drift in secondary sources.** Blogs claim a "Tokio 2.0"; crates.io says 1.52.3. Always confirm versions against crates.io, not changelog scrapes or trend posts.

---

## Implications / gaps for AGI Workforce

AGI is a six-surface suite (Web, Desktop/Tauri2, Mobile/Expo, **CLI/Rust**, Chrome ext, VS Code ext); v1 is Local + BYOK with multi-provider routing and local-first privacy. The Rust surface is `apps/cli` + the `crates/` workspace. Current pins (from `Cargo.toml` grep): `reqwest 0.12` (features `stream, json, multipart`), `tokio 1`, mixed `thiserror 1` and `2.0.17`, `anyhow 1`.

1. **SSE robustness is the highest-value fix.** If AGI's BYOK streaming path parses provider SSE with a hand-rolled `bytes_stream()`/`chunk()` loop, it is at risk of dropped/merged events under network fragmentation — which manifests as occasional truncated or garbled assistant output that is hard to reproduce. Recommendation: route SSE through `eventsource-stream`/`reqwest-eventsource`, with a provider-normalization layer mapping Anthropic typed events and OpenAI `[DONE]` frames into one internal delta enum.
2. **Provider abstraction trait — pick the dispatch model now.** For BYOK with runtime-selectable providers, `Box<dyn LlmProvider>` + `#[async_trait]` is the flexible choice; enum-dispatch is faster and simpler if the provider set is closed. Streaming methods must return `Pin<Box<dyn Stream<Item = Result<Delta, ProviderError>> + Send>>`. Either way, the trait's error type should be a `thiserror` enum the router/retry layer can match on.
3. **reqwest 0.12 → 0.13 is a deliberate, surface-aware call — not an automatic bump.** Upgrading unlocks the maintained `reqwest-middleware 0.5` + `reqwest-retry 0.9.1` retry stack, but pulls in the `aws-lc-rs` default. Because AGI cross-compiles to mobile and Windows, **drive the TLS/crypto provider explicitly through the existing `crates/agiworkforce-utils-rustls-provider` crate** and verify cross-target builds before merging. If the upgrade is deferred, pin a reqwest-retry/reqwest-middleware pair that supports 0.12.
4. **Adopt transparent retry, scoped and budgeted.** Add `reqwest-retry` middleware classifying 429/503/connect/timeout with exponential backoff + jitter; honor `Retry-After` (where `backon` helps for non-HTTP futures). Critically, **only retry before first byte** of an LLM stream — never resend after partial tokens. This matters doubly for BYOK where the user pays per request.
5. **Converge error crates and ban panics on reachable paths.** Standardize on `thiserror 2` across `crates/`, keep `anyhow` only at the CLI binary entry. Add cherry-picked Clippy `restriction` lints (`unwrap_used`, `expect_used`, `panic`) with `allow-*-in-tests`, wired into the CLI's CI gate. A panicking BYOK request handler is a privacy-relevant crash (could surface partial prompts in a backtrace) and a UX failure.
6. **Local vs BYOK trust boundary in error types.** AGI's locked rule forbids silently routing Local → BYOK. The provider error enum and any retry/fallback policy must **not** include cross-boundary fallback (e.g., "Local failed → retry on cloud") — encode the boundary in the type system so a misrouted retry won't compile.

### Open gaps to verify in-repo before acting (not verified in this research)
- How AGI currently parses provider SSE in the Rust CLI (hand-rolled vs. a crate) — inspect `crates/agiworkforce-network-proxy` and `crates/agiworkforce-protocol`.
- Whether a provider-abstraction trait already exists and its dispatch model.
- Current Clippy config and whether unwrap/expect are already denied on the CLI.
- Exact live SSE field names per provider (Anthropic/OpenAI/others) — confirm against each provider's current streaming docs at implementation time.

---

## Sources

- Reqwest releases (breaking changes 0.13.0; release list) — https://github.com/seanmonstar/reqwest/releases — accessed 2026-05-29 (version dates approximate per note above)
- crates.io API: reqwest (max_stable 0.13.4) — https://crates.io/api/v1/crates/reqwest — 2026-05-29
- crates.io API: tokio (max_stable 1.52.3, no 2.0) — https://crates.io/api/v1/crates/tokio — 2026-05-29
- crates.io API: reqwest-retry 0.9.1 deps (reqwest ^0.13.1, reqwest-middleware ^0.5) — https://crates.io/api/v1/crates/reqwest-retry — 2026-05-29
- reqwest docs (Client, streaming, timeouts, pooling, error classification) — https://docs.rs/reqwest/ — 2026-05-29
- reqwest-retry docs — https://docs.rs/reqwest-retry — 2026-05-29
- seanmonstar, "reqwest retries" (built-in retry still a PR, #2763) — https://seanmonstar.com/blog/reqwest-retries/ — 2025-07-15
- eventsource-stream docs (SSE frame parser) — https://docs.rs/eventsource-stream/ — 2026-05-29
- reqwest-eventsource docs (reqwest SSE wrapper + retry) — https://docs.rs/reqwest-eventsource/ — 2026-05-29
- RUSTSEC-2025-0012 (backoff unmaintained, use backon) — https://rustsec.org/advisories/RUSTSEC-2025-0012.html — advisory 2025-03-07
- backon (maintained retry crate) — https://github.com/Xuanwo/backon — 2026-05-29
- async-trait docs (type erasure for async trait methods) — https://docs.rs/async-trait — 2026-05-29
- Rust async-fundamentals initiative: async fn in dyn trait (not dyn-compatible) — https://rust-lang.github.io/async-fundamentals-initiative/explainer/async_fn_in_dyn_trait.html — 2026-05-29
- Clippy lints index (restriction group: unwrap_used/expect_used/panic) — https://rust-lang.github.io/rust-clippy/master/index.html — 2026-05-29
- Clippy issue #9612 (unwrap/expect lints fire in tests) — https://github.com/rust-lang/rust-clippy/issues/9612 — 2026-05-29
- oneuptime, "How to Design Error Types with thiserror and anyhow in Rust" — https://oneuptime.com/blog/post/2026-01-25-error-types-thiserror-anyhow-rust/view — 2026-01-25
- Luca Palmieri, "Error Handling In Rust — A Deep Dive" — https://www.lpalmieri.com/posts/error-handling-rust/ — accessed 2026-05-29
