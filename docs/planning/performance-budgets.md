# Performance Budgets

> Last updated: 2026-03-19

Canonical performance budgets for all AGI Workforce surfaces. Every metric has a budget, measurement methodology, and alerting thresholds.

**Alerting thresholds** apply to all metrics:
- **Green**: Within budget
- **Yellow**: 1.5x budget (warning)
- **Red**: 2x budget (critical)

---

## Desktop (Tauri v2)

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| App startup (cold) | < 3s | < 4.5s | < 6s | Time from process launch to first interactive paint. Measured via Rust `std::time::Instant` from `main()` to `app.ready` event |
| First chat render | < 500ms | < 750ms | < 1s | Time from chat view mount to first message bubble visible. Measured via `PerformanceTracker.start('chat-render')` in component mount |
| Tool execution feedback | < 100ms | < 150ms | < 200ms | Time from tool call dispatch to UI indicator appearing. Measured via Tauri event timestamps |
| Stream first-token | < 1s | < 1.5s | < 2s | Time from send button click to first streamed token rendered. Measured via SSE event timing in `sse_parser.rs` |
| IPC round-trip | < 50ms | < 75ms | < 100ms | Time for a `invoke()` call to return. Measured via `measureAsync()` wrapper around `invoke()` |
| Memory (idle) | < 300MB | < 450MB | < 600MB | RSS after 5 minutes idle. Measured via `process.memoryUsage()` + Rust `sysinfo` crate |
| Memory (active, 10 tools) | < 500MB | < 750MB | < 1GB | RSS during active agent session with 10 concurrent tool calls |

## Mobile (Expo / React Native)

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| App launch (cold) | < 2s | < 3s | < 4s | Time from tap to first interactive screen. Measured via `expo-splash-screen` hide timestamp minus app start |
| Companion connect | < 3s | < 4.5s | < 6s | Time from QR scan to confirmed WebRTC data channel. Measured via signaling server round-trip + ICE negotiation |
| Approval render | < 200ms | < 300ms | < 400ms | Time from push notification tap to approval dialog visible. Measured via `PerformanceTracker` in approval screen mount |
| Chat message render | < 100ms | < 150ms | < 200ms | Time from message received to rendered in FlatList. Measured via `onLayout` callback timing |
| Model picker open | < 300ms | < 450ms | < 600ms | Time from button press to picker sheet fully visible. Measured via BottomSheet `onAnimate` callback |
| JS bundle size | < 5MB | < 7.5MB | < 10MB | Hermes bytecode bundle size. Measured via `npx expo export` output |

## Web (Next.js 16)

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| Page load (LCP) | < 2s | < 3s | < 4s | Largest Contentful Paint. Measured via `web-vitals` library or Lighthouse |
| First interaction (FID) | < 500ms | < 750ms | < 1s | First Input Delay. Measured via `web-vitals` library |
| Layout shift (CLS) | < 0.1 | < 0.15 | < 0.2 | Cumulative Layout Shift. Measured via `web-vitals` library |
| Time to interactive (TTI) | < 3s | < 4.5s | < 6s | Time until page is reliably interactive. Measured via Lighthouse |
| Chat SSR hydration | < 1s | < 1.5s | < 2s | Time from server HTML to React hydration complete. Measured via `performance.mark()` in layout |
| JS bundle (initial) | < 200KB | < 300KB | < 400KB | Gzipped initial JS bundle. Measured via `next build` output |
| API response (chat) | < 500ms | < 750ms | < 1s | Server-side response time for chat API routes. Measured via server middleware timing |

## VS Code Extension

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| Extension activation | < 1s | < 1.5s | < 2s | Time from VS Code activation event to `activate()` function return. Measured via `PerformanceTracker` |
| Context retrieval | < 500ms | < 750ms | < 1s | Time to gather workspace context for a prompt. Measured via `measureAsync()` around LSP queries |
| Patch application | < 200ms | < 300ms | < 400ms | Time from AI suggestion accept to file edits applied. Measured via `workspace.applyEdit` timing |
| Inline completion | < 300ms | < 450ms | < 600ms | Time from keystroke to inline completion suggestion visible. Measured via `InlineCompletionItemProvider` timing |
| Chat response start | < 1s | < 1.5s | < 2s | Time from chat panel send to first streamed token. Measured via chat participant handler timing |

## CLI (Rust)

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| Startup | < 500ms | < 750ms | < 1s | Time from process launch to prompt display. Measured via `std::time::Instant` from `main()` |
| First response | < 2s | < 3s | < 4s | Time from user input to first streamed token. Measured via SSE stream timing in Rust |
| Tool execution | < 5s | < 7.5s | < 10s | Time for a single tool call to complete. Measured via `Instant::elapsed()` around tool dispatch |
| File read (10MB) | < 200ms | < 300ms | < 400ms | Time to read and parse a 10MB file. Measured via `Instant::elapsed()` |
| Binary size | < 20MB | < 30MB | < 40MB | Release binary size. Measured via `ls -la target/release/` |
| Memory (idle) | < 30MB | < 45MB | < 60MB | RSS while waiting for input. Measured via `/proc/self/statm` or `sysinfo` |

## API Gateway (Express)

| Metric | Budget | Yellow | Red | Measurement |
|--------|--------|--------|-----|-------------|
| p50 latency | < 100ms | < 150ms | < 200ms | Median response time across all endpoints. Measured via `pino-http` response time logging |
| p99 latency | < 500ms | < 750ms | < 1s | 99th percentile response time. Measured via `PerformanceTracker` aggregation |
| Sync success rate | > 99% | > 98% | > 95% | Percentage of sync operations that complete without error. Measured via error rate in structured logs |
| Health check response | < 50ms | < 75ms | < 100ms | Response time for `/health` endpoint. Measured via `pino-http` |
| Provider health check | < 10s | < 15s | < 20s | Full provider health sweep (all 11 providers). Measured via `checkAllProviders()` timing |
| WebSocket message latency | < 50ms | < 75ms | < 100ms | Time from message send to ack. Measured via signaling server timestamps |
| Request throughput | > 1000 req/s | > 500 req/s | > 200 req/s | Sustained request handling capacity. Measured via load testing (k6/autocannon) |

---

## Measurement Methodology

### Automated (CI/CD)
1. **Lighthouse CI** — runs on every PR for web surface (LCP, FID, CLS, TTI)
2. **Bundle size check** — `next build` and `expo export` output parsed in CI
3. **Binary size check** — Rust release build size tracked per commit
4. **API load tests** — k6 scripts run nightly against staging

### Manual / Development
1. **`PerformanceTracker`** from `@agiworkforce/utils` — instrument code paths with `start()`/`end()`
2. **`measureAsync()` / `measureSync()`** — wrap individual operations for one-off measurements
3. **Rust `std::time::Instant`** — native timing in CLI and Tauri backend
4. **React DevTools Profiler** — component render timing for desktop and web
5. **Flipper** — React Native performance profiling for mobile

### Production Monitoring
1. **Structured logs** — all API responses include `responseTimeMs` via pino-http
2. **`PerformanceTracker.getMetrics()`** — aggregated stats exposed via internal `/metrics` endpoint
3. **Provider health cache** — health check results cached and exposed via `/api/providers/health`

---

## Budget Review Cadence

- **Weekly**: Review p99 latency and error rates from production logs
- **Per-release**: Run full Lighthouse audit and bundle size check
- **Monthly**: Review and update budgets based on feature growth and user expectations
- **Quarterly**: Benchmark against competitors (Claude Desktop, ChatGPT, Cursor)
