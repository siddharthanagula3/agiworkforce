# AGI Desktop — Volume 24 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; and the real repo paths listed in the Repository map below (grounded in `apps/desktop/src-tauri` and `apps/desktop/src`).

## Overview & stance

This volume sets the performance targets and testable requirements for AGI Desktop — the full-trust surface (Local + BYOK + Managed Cloud, each with a visible label) and the local-private compute host for the suite. The deliberate quality edge is architectural: Desktop is Tauri v2 (Rust `src-tauri`) + React + Vite, shipping against the OS system WebView, not a bundled Chromium runtime (`apps/desktop/src-tauri/Cargo.toml`, `tauri = "2.11.0"`; `apps/desktop/src-tauri/tauri.conf.json`). An Electron app pays a per-install Chromium tax and a heavy idle memory floor; a Tauri app links a small native binary against the platform WebView. That baseline edge must not be squandered.

Trust modes shape the budgets. **Local** inference puts model compute (CPU/GPU/RAM) on the user's machine — the dominant, must-degrade-gracefully cost. **BYOK** and **Managed Cloud** are network-bound: the app streams tokens and its footprint stays small. Desktop also runs a `127.0.0.1` WebSocket/IPC host for the Chrome and VS Code companions (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`), so idle background cost is a first-class metric. Local files and Local chats never move to BYOK/Cloud for performance reasons.

## Cold Start

Cold start (first launch after boot, caches empty) must render an interactive shell fast. Target: window visible ≤ 1.5 s, interactive ≤ 3 s on a 2020-class laptop. The Tauri native binary + system WebView avoids Chromium unpack, and Vite output is `esbuild`-minified with vendor code split so the first paint loads only core chunks (`apps/desktop/vite.config.ts`: `minify: 'esbuild'`, `manualChunks` isolates `react-vendor`, `ui-vendor`; heavy `markdown-vendor`, `charts-vendor`, `diagram-vendor`, `terminal-vendor` load on demand). 🟡 Built (bundling in place); budgets are not yet CI-enforced. A cold-start timing harness with a hard budget is 🔭 Planned — the existing `criterion` benches cover security/JSON micro-ops, not launch (`apps/desktop/src-tauri/benches/agi_benchmarks.rs`).

## Warm Start

Warm start (relaunch, OS caches hot) must be materially faster than cold: target interactive ≤ 1.2 s. Window state restores via `tauri-plugin-window-state` (`apps/desktop/src-tauri/Cargo.toml`), so geometry is not recomputed. 🟡 Built (window-state restore); a warm-vs-cold gate is 🔭 Planned.

## Startup Time

Startup must not block on network, sync, or the local host. The realtime WS host and Neon delta-sync are background work and must never gate first paint; Local chats load from local storage with no cloud call (`apps/desktop/AGENTS.md`, local-default gate). Requirement: no synchronous BYOK/Cloud auth, model download, or sync round-trip on the startup path; deferred init only after the shell is interactive. 🟡 Built (lazy vendor chunks, local-first load) / 🔭 startup-phase instrumentation and a published budget table.

## Memory Usage

Idle resident memory must stay well below a comparable Electron app — target ≤ 300 MB idle with one empty chat, WebView included. Rust lints forbid holding a sync `MutexGuard` across an `await` (`apps/desktop/src-tauri/Cargo.toml`, `await_holding_lock`), preventing a class of leak/stall bugs, and `parking_lot::Mutex` is used on hot paths (`apps/desktop/src-tauri/src/ui/events/tool_stream.rs`). Live memory is observable through `get_system_resources` and the resource monitor (`apps/desktop/src-tauri/src/sys/commands/agi.rs:603`; `apps/desktop/src/features/resource-monitor/index.tsx`), backed by `sysinfo = "0.30"`. Local model weights are the large allocation and must be reported before load. 🟡 Built (telemetry + lint guards); heap-growth soak tests and per-conversation budgets are 🔭 Planned.

## CPU Usage

Idle CPU must be near-zero: no busy-polling in the WS host, streaming loop, or React tree. The resource monitor polls on an interval, not a tight loop (`apps/desktop/src/features/resource-monitor/index.tsx`). Local inference is the legitimate heavy consumer and must be attributable to the model, not the shell. Requirement: idle CPU ≤ 2% with no active generation; the companion host adds no measurable idle load when no client is paired. 🟡 Built (interval polling, event-driven streaming) / 🔭 an automated idle-CPU assertion.

## GPU Usage

Rendering is delegated to the system WebView's GPU compositor (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux); Desktop does not run its own renderer, and there is no bespoke GPU-tuning path in the repo today. Requirement: animations stay compositor-friendly (transform/opacity), and Desktop must not force software rendering. Explicit GPU acceleration for local inference and GPU-usage telemetry are 🔭 Planned (not present in `src-tauri`).

## Battery Usage

Battery is protected by keeping idle CPU/GPU low and by scoping sleep prevention tightly: `SleepPrevention` holds a wake lock only while a background agent runs — `caffeinate -s -w <pid>` on macOS, `SetThreadExecutionState` on Windows, no-op elsewhere — and releasing the guard restores normal sleep (`apps/desktop/src-tauri/src/sys/power.rs`). Requirement: no wake lock outside active long-running work. ✅ Built (scoped, crash-safe wake lock) / 🔭 a battery-drain regression measurement.

## Rendering

The UI must sustain 60 fps for scroll, streaming, and panel switches. Markdown, syntax highlighting, charts, and diagrams are code-split so they never inflate the base render cost (`apps/desktop/vite.config.ts`). Gap: the V3 shell imports its AGI Work subpanels eagerly, not lazily (`apps/desktop/src/features/v3/DesktopShellV3.tsx`), so route-level code-splitting of subpanels is 🔭 Planned. Vendor-chunk splitting is ✅ Built.

## Streaming

Token and tool-call streaming must render incrementally without main-thread jank. Tool progress is delivered as structured events — `Started`, `Progress`, `OutputChunk` (final-chunk flagged) — over the Tauri event channel (`apps/desktop/src-tauri/src/ui/events/tool_stream.rs`), so the UI paints partial output as it arrives across all three trust modes. Requirement: coalesce high-frequency chunks to one paint per frame; never block on parse. ✅ Built (structured streaming events) / 🔭 explicit frame-coalescing budget.

## Large Conversations

Long threads must stay responsive via windowed rendering. `react-window` and `react-virtualized-auto-sizer` are declared dependencies (`apps/desktop/package.json`) but are **not yet imported** in `apps/desktop/src` — so conversation virtualization is 🟡 Partial (library present, message list not wired to it). Requirement: render only visible turns, cap retained DOM nodes, and summarize/collapse old turns; a 5,000-message thread must scroll at 60 fps. Wiring the list to `react-window` is the tracked gap.

## Large Projects

AGI Work Projects/Artifacts must scale to large artifact sets without loading everything into memory. Artifacts are driven by a shared `artifactStore` the V3 panels read/write (`apps/desktop/src/features/v3/DesktopShellV3.tsx`). Requirement: paginate/virtualize project and artifact lists, stream large files rather than slurp, and keep Neon delta-sync (Managed-Cloud rows only) incremental — cursor + tombstone paging, never a full re-pull. Delta-sync primitives exist upstream; list virtualization is 🔭 Planned.

## Repository map

- `apps/desktop/src-tauri/Cargo.toml` — Rust deps, lints, `sysinfo`, benches.
- `apps/desktop/src-tauri/tauri.conf.json` — window, CSP, bundle.
- `apps/desktop/vite.config.ts` — build target, `esbuild` minify, `manualChunks`, CSS split.
- `apps/desktop/src-tauri/benches/{agi_benchmarks,automation_benchmarks}.rs` — `criterion` micro-benchmarks.
- `apps/desktop/src-tauri/src/sys/commands/agi.rs` — `get_system_resources`.
- `apps/desktop/src-tauri/src/sys/power.rs` — `SleepPrevention` wake lock.
- `apps/desktop/src/features/resource-monitor/index.tsx` — live CPU/memory UI.
- `apps/desktop/src-tauri/src/ui/events/tool_stream.rs` — streaming tool events.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — companion host.
- `apps/desktop/src/features/v3/DesktopShellV3.tsx` — shell + subpanels.

## Competitor notes

Claude Desktop and ChatGPT Desktop are Electron: larger installs, higher idle memory, per-app Chromium. Codex/Claude Code lean on terminals. AGI Desktop's divergence is the Rust/Tauri native-WebView core (lighter idle footprint), plus per-trust-mode accounting: Local inference cost is surfaced honestly on the user's own hardware; BYOK and Cloud stay network-bound with a small local footprint. Unlike single-provider desktops, AGI streams uniformly across Local/BYOK/Cloud and never "optimizes" by silently shifting Local data to a faster cloud path.

## Acceptance / Definition of Done

Performance is production-ready when startup, idle, streaming, and large-thread budgets are defined, measured in CI, and green across the three trust modes on macOS/Windows/Linux, with regressions blocked.

- [ ] Build: cold/warm start, idle memory, and idle CPU budgets measured in CI with a regression gate (extend `benches/` beyond micro-ops).
- [ ] Trust: Local start does zero network/sync round-trips; BYOK/Cloud streaming stays incremental; the companion host adds no idle load unpaired.
- [ ] Security/UX: local model load reports size before allocation; wake lock is scoped to active work only (`sys/power.rs`).

## Anti-patterns

- Do not regress toward an Electron-style bundled runtime or force software rendering — the native WebView is the edge.
- Do not block startup or first paint on BYOK/Cloud auth, model download, or Neon sync.
- Do not route Local chats/files to BYOK/Cloud to "improve" latency; Local→BYOK is an explicit, consented fork only.
- Do not claim conversation virtualization as shipped — the `react-window` dep is not yet wired (🟡).
- Do not busy-poll the WS host, streaming loop, or resource monitor; keep idle CPU near zero, and hold a wake lock only during active work.
- Do not hardcode or invent model IDs (use `packages/types/src/models.json`), reference Supabase (Clerk + Neon + Stripe only), or cite removed tiers (Plus/pro_plus/Hobby) or top-ups; pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
