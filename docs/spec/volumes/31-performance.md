# Volume 31 — Performance

Status: Canonical depth for Master Spec Vol 31
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 31, `docs/strategy/04-scaling-to-1M-architecture.md` §7 (reliability targets) + §4 (cost model), `packages/contracts/types/src/models.json` (caching capability), per-surface plans `docs/strategy/12–14`.

## Philosophy & Cloud/Local stance

Performance is two linked disciplines: **latency** (how fast the product feels) and **cost** (how much each request burns). For an inference-renting business they are the same lever pulled from two ends — routing, caching, and batching cut both the wait and the bill. Budgets are per-surface and enforced, not aspirational: a target without a measured gate is decoration.

The Cloud/Local stance splits the budgets. Cloud performance is gateway latency, provider failover, prompt caching, and batch economics (`docs/strategy/04` §4–7); the cost model spans ~75× ($0.03–$2.30 per Managed MAU/month) driven by engagement and model tier, so routing defaults are a margin control, not just UX. Local performance is device-bound: startup, memory, battery, thermal, and on-device first-token — the user's hardware is the budget, so the tier ladder must pick the heaviest model that still fits (`packages/platform/local-llm/src/selector.ts`). Caching is free money on Cloud and irrelevant cost-wise on Local; both still owe a fast first token.

## Binding rules

1. Per-surface budgets are enforced with a measured gate: Web LCP < 2.5 s; chat send → first token (Managed) p95 < 2.5 s (`04` §7).
2. Prompt caching + batch are on by default wherever the model supports them (`models.json` `capabilities.caching`; cache hit ≈ 0.1× input, batch ≈ 50% off — `04` §4).
3. Route casual/simple Managed traffic to economy models by default; reserve frontier for tasks that need it (the $27K-vs-$2.3M difference — `04` §4).
4. Lazy-load heavy modules (artifact renderers, code editors, vision/voice pipelines); never block first paint or first token on them.
5. Stream-stall and completion SLOs hold: completion success > 99.5%, gateway availability 99.9%, failover < 1 request (`04` §7).
6. Local runtime respects device limits: thermal/RAM checks gate model size; never ship a path that OOMs or melts a mid-tier phone.
7. Measure before claiming: Lighthouse/axe thresholds (web), crash-free + first-token instrumentation (mobile), smoke perf (desktop) gate each release.
8. Caching and batching never cross a trust boundary: a Local prompt is never cached on AGI infra; cache keys are tenant-scoped.

## Repository map

- **Cloud latency/cost path:** `services/api-gateway/src/routes/providerStream.ts` (SSE), `packages/ai/provider-runtime/src/{gateway,retry,fallback,watchdog}.ts`; routing/pricing in `packages/ai/routing/src/{classify,pricing}.ts`; tier logic per `models.json` (`tierAllowedModels`, `auto-economy`/`-balanced`/`-premium`).
- **Caching/batch metadata:** `packages/contracts/types/src/models.json` `capabilities.caching`, `cached_input`, `tokenMultiplier`, `tokenizer_drift_warning`.
- **Local performance:** `packages/platform/local-llm/src/{selector,capabilities,catalog}.ts`; mobile `apps/mobile/services/{llmGate,modelDownload}.ts` (thermal, resumable downloads).
- **Web perf gates:** `apps/web` (`playwright.config.ts`, `e2e/`, Lighthouse/axe in `docs/strategy/12` Stage E, WEB-13).
- **Mobile perf gates:** `apps/mobile` (Detox, `screenshots:*`, crash-free instrumentation, `docs/strategy/13` MOB-8).
- **Desktop perf gates:** `apps/desktop` (`test:smoke`, cargo, computer-use MCP, `docs/strategy/14` DESK-10).

## Competitor notes

Both incumbents bake caching/batch tiers and autoscaling inference into the platform (`docs/strategy/01` §4): Anthropic ships prompt caching (0.1× on hit) + Batch API (50% off input _and_ output); OpenAI runs a continuously-trained auto-router choosing Instant vs. Thinking. AGI's divergence is **routing as an explicit, user-visible margin/latency control across providers** (ADR-2, `04` §6) plus a **local fast path** with no network round-trip at all — a latency win incumbents structurally don't offer. The cost insight to internalize: inference prices fall ~50×/year for fixed capability, but the frontier floor stays ~$1–5/MTok, so premium stays premium — defaults matter permanently (`04` §4).

## Checklists

### Web budgets

- [ ] LCP < 2.5 s on core routes (Lighthouse gate in CI, WEB-13).
- [ ] First token (Managed) p95 < 2.5 s on the chat flow.
- [ ] Heavy modules (artifact renderer, code editor) code-split and lazy-loaded.
- [ ] Zero console errors on core flows; bundle budget enforced.
- [ ] axe/WCAG 2.1 AA pass (a11y is part of perceived quality).

### Mobile budgets

- [ ] Cold start within target; first paint not blocked on model load.
- [ ] On-device first-token measured on sim + real device; tier ladder picks the heaviest fitting model.
- [ ] Memory/battery/thermal within budget; large models gated by RAM + thermal checks.
- [ ] Model downloads resume and don't block the UI (`modelDownload.ts`).
- [ ] Crash-free > 99.5% in beta (instrumented).

### Desktop budgets

- [ ] App startup + window-ready within target (Tauri/Rust advantage over Electron — `docs/strategy/14`).
- [ ] Streaming render stays smooth for long sessions (no main-thread jank).
- [ ] Local model serving picks a fitting model ("what-fits-this-machine", DESK-7).
- [ ] Memory steady-state bounded over long-running agent sessions.

### Cloud cost & caching

- [ ] Prompt caching enabled where `models.json` `caching` is true; cache hit ratio monitored.
- [ ] Batch used for eligible non-interactive workloads (≈50% off).
- [ ] Default routing sends casual traffic to economy; frontier reserved for need.
- [ ] Tokenizer drift budgeted in estimates (Claude Opus 4.8 +0–35%) to avoid overshoot + waste.
- [ ] Cache keys tenant-scoped; Local prompts never cached on AGI infra.

### Reliability targets (`04` §7)

- [ ] Stream completion success > 99.5%; gateway availability 99.9% monthly.
- [ ] Provider failover < 1 request, transparent to the user.
- [ ] Metering accuracy > 99.99%, drift-audited daily (perf of the billing path, Vol 28).
- [ ] Stream stalls + provider error rates alert via OpenTelemetry (Vol 29).

## Definition of Done

Performance is production-ready when: each surface meets its measured budget gate (Web LCP < 2.5 s + first-token p95 < 2.5 s via Lighthouse/Playwright; mobile cold-start + on-device first-token + crash-free > 99.5% via Detox/instrumentation; desktop startup + smooth long-session streaming via smoke + computer-use MCP); prompt caching + batch are on by default with monitored hit ratios; default routing sends casual traffic to economy models; and the `04` §7 reliability targets (completion > 99.5%, availability 99.9%, failover < 1 request, metering > 99.99%) hold under load test — with caching/batching never crossing a trust boundary.

## Anti-patterns

- Publishing a budget with no measured CI gate behind it.
- Defaulting casual Managed traffic to frontier models and absorbing a 75× cost blowup.
- Shipping caching/batch off by default and paying full input price on every repeat prompt.
- Blocking first paint or first token on a heavy lazy-loadable module.
- A local model path that ignores RAM/thermal limits and OOMs or throttles the device.
- Caching a Local-mode prompt on AGI infra, or using a cache key that isn't tenant-scoped.
- Optimizing latency while ignoring the inference bill (or vice versa) — they are one lever.
