# ADR: Maximalist surface coverage (six surfaces shipping concurrently)

## Status

Accepted — 2026-05-09.

## Context

Competitor wraps cluster around two patterns:

- **Single-surface focus**: ChatGPT desktop, Claude Desktop — bet on one surface and iterate fast.
- **Two-or-three surface coverage**: Cursor (desktop + web), Anthropic (web + iOS + Chrome ext + Cowork).

AGI Workforce targets six surfaces from day one: CLI/TUI, Desktop (Tauri), Web (Next 14), Mobile (Expo), Chrome ext (MV3), VS Code ext. The cost is real: each surface has its own build pipeline, its own test suite, its own permission model, its own bundle size budget. The benefit is ubiquity: a user moves from terminal to editor to phone without ever leaving the platform.

The alternative under serious consideration was "ship desktop and CLI, defer mobile + extensions to v2." That would shorten the sprint and reduce the surface area to maintain. It would also leave the differentiator-1 claim ("multi-provider in one UI, switch mid-conversation") trapped in a single-surface story.

## Decision

We commit to maximalist surface coverage. All six surfaces ship as first-party. The Foundation Sprint primitives (createStore, queue, context, llm-runtime, worker direction inversion, Dispatch listener) are designed to be used by every surface; per-surface adapters land in the same sprint as the primitive.

This shapes architecture in concrete ways:

- §3 queue is a per-surface factory because six surfaces cannot share one queue.
- §2 state has per-surface persistence backends.
- §6 worker protocol's four-tier auth assumes CLI, desktop, mobile clients can all register concurrently.
- §7 orphan packages have surface-specific wrappers (web SSRF-defensive routes, mobile HTTP proxies, extension translation layers).

## Consequences

**Positive**

- Differentiator-1 is real across surfaces: a user starts a chat on web, switches model on mobile, finishes on desktop, all in one thread (powered by §5 cross-provider continuity).
- A surface failure (Chrome ext review pulled, App Store rejection) does not block the platform — five other surfaces continue shipping.
- Distribution is parallelised: CLI ships via npm + Homebrew, desktop via direct download, web via Vercel, mobile via App Store + TestFlight, extensions via CWS + VS Code Marketplace. We are not single-channel-dependent.

**Negative**

- Six CI pipelines, six release cadences, six sets of platform-specific bugs. Headcount cost is real.
- Per-surface adapters must be written and maintained for every shared primitive. Mitigated by the discipline of "primitive ships with all surface adapters in the same PR" — see Wave 5 task split.
- Some primitives (e.g. Tauri-Rust IPC for §4 context, §8 dispatch HMAC) are desktop-only by their nature. Other surfaces get less of the per-primitive value. Acceptable: each surface uses what it can.
- A new surface (proposed: JetBrains plugin) is a real cost commitment, not a free addition. We will gate new-surface decisions on differentiator parity, not parity-by-default.

## References

- `docs/architecture/foundation-2026.md` §10 row 1.
- `MEMORY.md` "What This Project Is" — `10+ Providers` tagline locked at SSOT.
- Team config description `agi-foundation-integration`.
