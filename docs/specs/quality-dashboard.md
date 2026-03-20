# AGI Workforce — Quality Dashboard Specification

_Created: March 19, 2026_

## Overview

The Quality Dashboard is a cross-surface telemetry and release-gate system that provides real-time visibility into AGI Workforce product health. It consolidates KPIs from Desktop, Mobile, Web, CLI, and Extension surfaces into a single source of truth for release decisions.

**Q2 2026 Requirement**: First implementation ships by end of Week 6 (May 16, 2026) to unblock Train 1 release gates.

---

## Design Principles

1. **One dashboard, one source of truth** — All surfaces report to the same schema
2. **Gate-driven metrics** — Every KPI directly maps to a release gate pass/fail criterion
3. **Conservative thresholds** — Red bars appear before bugs reach users, not after
4. **Per-surface isolation** — A broken extension does not block desktop train
5. **Historical trending** — 7-day and 30-day windows for regression detection

---

## Surface Definitions

| Surface | Definition | Owns What | Target Users |
| --- | --- | --- | --- |
| **Desktop** | Tauri v2 app on macOS / Windows / Linux | Chat, agents, browser, workflows, MCP | Power users, professionals, teams |
| **Mobile** | Expo + React Native on iOS / Android | Chat, companion, approvals, schedules | Mobile-first users, oversight |
| **Web** | Next.js SPA on vercel.app | Chat, dashboard, billing, workforce, admin | Casual users, admin, team leads |
| **CLI** | Rust binary (agiworkforce) on macOS / Linux / Windows | Sessions, agents, REPL, tools | Engineers, automation, batch work |
| **Extension (VS Code)** | TypeScript extension on VS Code Marketplace | Chat, code edit, retrieval | Developers during coding |
| **Extension (Chrome)** | MV3 extension, native messaging to desktop | Page capture, autofill, tool discovery | Power users across web |

---

## Per-Surface KPIs

### PRIMARY KPIs (Release-gate tied, must all be green)

#### Desktop

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Startup Time** | Time from app launch to main shell loaded (99th percentile) | < 4.0s | Tauri telemetry + performance logs | Nightly builds | > 6.0s | 4.5s–6.0s | < 4.5s |
| **Crash-Free Sessions** | Percentage of user sessions that complete without crash | ≥ 99.2% | Desktop error tracking (Sentry) | Weekly | < 98% | 98%–99.2% | ≥ 99.2% |
| **Approval Timeout Rate** | % of desktop-to-mobile approvals that time out without resolution | ≤ 2% | Signaling server + API Gateway logs | Weekly | > 5% | 2%–5% | ≤ 2% |
| **Browser Automation Success** | % of browser automation tasks that complete without hung state | ≥ 95% | Desktop background agent logs | Weekly | < 93% | 93%–95% | ≥ 95% |
| **Tool Execution Success** | % of approved tool calls that execute without error | ≥ 98% | ToolGuard audit + invoke logs | Weekly | < 96% | 96%–98% | ≥ 98% |

#### Mobile

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Crash-Free Sessions** | % of user sessions without crash or ANR | ≥ 99.0% | Expo EAS logs + Firebase Crashlytics | Weekly | < 97% | 97%–99% | ≥ 99% |
| **Pairing Reliability** | % of QR pairing attempts that succeed within 10s | ≥ 96% | Signaling server + mobile bridge logs | Weekly | < 94% | 94%–96% | ≥ 96% |
| **Message Send Latency** | Time from tap send to server ack (p95) | < 2.5s | Mobile API client telemetry | Nightly | > 4.0s | 2.5s–4.0s | < 2.5s |
| **Approval Delivery Time** | Time from desktop approval → mobile notification (p95) | < 3.0s | Signaling server event logs | Nightly | > 5.0s | 3.0s–5.0s | < 3.0s |
| **Offline Sync Success** | % of offline-queued actions that sync on reconnect | ≥ 98% | Mobile queue + sync logs | Weekly | < 96% | 96%–98% | ≥ 98% |

#### Web

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Crash-Free Sessions** | % of web sessions without client error | ≥ 99.5% | Vercel Web Analytics + Sentry | Weekly | < 98.5% | 98.5%–99.5% | ≥ 99.5% |
| **Page Load Time (Chat)** | Time to interactive on chat page (p95) | < 2.5s | Web Vitals (Next.js) | Nightly | > 4.0s | 2.5s–4.0s | < 2.5s |
| **Auth Flow Success** | % of login attempts that complete without error | ≥ 99.5% | Auth route logs (api-gateway) | Weekly | < 99% | 99%–99.5% | ≥ 99.5% |
| **Billing Flow Success** | % of billing page loads without error | ≥ 98.5% | Stripe webhook logs + web errors | Weekly | < 97% | 97%–98.5% | ≥ 98.5% |

#### CLI

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **REPL Startup Time** | Time from launch to first prompt (p95) | < 1.5s | CLI instrumentation + perf logs | Nightly | > 2.5s | 1.5s–2.5s | < 1.5s |
| **One-Shot Success** | % of one-shot invocations that return output without error | ≥ 96% | CLI error logs | Weekly | < 94% | 94%–96% | ≥ 96% |
| **Session Resume Success** | % of session resume attempts that load state correctly | ≥ 99% | Session DB + audit logs | Weekly | < 98% | 98%–99% | ≥ 99% |

#### VS Code Extension

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Extension Activation Time** | Time from open to first chat ready (p95) | < 1.5s | VS Code extension telemetry | Nightly | > 3.0s | 1.5s–3.0s | < 1.5s |
| **Chat Stability** | % of chat interactions without crash | ≥ 98% | Extension error logs | Weekly | < 96% | 96%–98% | ≥ 98% |
| **Code Edit Success** | % of proposed edits accepted in 1st attempt | ≥ 85% | VS Code extension audit (beta) | Weekly | < 75% | 75%–85% | ≥ 85% |

#### Chrome Extension

| KPI | Definition | Target | Data Source | Threshold | Red | Yellow | Green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Native Bridge Stability** | % of desktop bridge requests that complete without error | ≥ 98% | Extension background logs | Weekly | < 96% | 96%–98% | ≥ 98% |
| **Autofill Accuracy** | % of autofill actions that match expected output | ≥ 90% | Extension test logs | Weekly | < 85% | 85%–90% | ≥ 90% |

---

## SECONDARY KPIs (Trend monitoring, not release gates)

| KPI | Definition | Surface | Data Source | Cadence |
| --- | --- | --- | --- | --- |
| **LLM Response Quality (User Rating)** | Average 1–5 star rating on chat messages | Desktop, Mobile, Web | User feedback widget | Weekly |
| **Tool Execution Time (p95)** | Time from approval to completion | Desktop | Background agent logs | Weekly |
| **Desktop-Mobile Sync Lag** | Time for state change on desktop to appear on mobile | Mobile | Signaling server logs | Nightly |
| **API Gateway Latency (p95)** | Time from request to response | All | Gateway logs | Nightly |
| **Model Fallback Rate** | % of requests failing primary model, succeeding on fallback | All | LLM router logs | Weekly |
| **Memory/Retrieval Hit Rate** | % of context queries that find relevant results | Desktop, Web | RAG system logs | Weekly |

---

## Dashboard Layout Proposal

### 1. **Release Readiness Summary** (Top, full width)

Large status indicator showing Train readiness:
- **RED**: Any primary KPI is red across any surface
- **YELLOW**: Any primary KPI is yellow across any surface
- **GREEN**: All primary KPIs are green

Text: "Ready for Train X release: [date]" or "Hold: Fix [KPI name] on [surface]"

### 2. **Per-Surface Statusboard** (3-column grid)

For each of the 6 surfaces, a card showing:
- Surface name + version (e.g., "Desktop v1.1.5")
- Last 5 primary KPIs as mini bars (red/yellow/green)
- Trend arrow (↑ improving, ↓ declining, → stable)
- Link to detailed view

**Order**: Desktop | Mobile | Web | CLI | VS Code Ext | Chrome Ext

### 3. **Detailed Metric View** (Collapsible per surface)

When clicking a surface card, expand to show:
- **7-day trend chart** (line graph) for each primary KPI
- **Historical data table** (last 10 measurements)
- **Incidents timeline** (when KPI crossed into yellow/red)
- **Data source link** (jump to logs, telemetry dashboard)

### 4. **Release Gate Status** (Bottom, full width)

Table showing each active train:

| Train | Status | Gate 1 (Startup) | Gate 2 (Crash) | Gate 3 (Approvals) | Cleared | Blocked Until |
| --- | --- | --- | --- | --- | --- | --- |
| Train 1 Desktop | BLOCKED | ✓ | ✓ | ✗ Approval timeout > 5% | 2 of 3 | Desktop Approval Timeout fix |
| Train 1 Mobile | READY | ✓ | ✓ | ✓ | 3 of 3 | Release now |
| Train 2 Web | BLOCKED | ✗ Page Load 4.2s | ✓ | N/A | 1 of 2 | Web perf optimization |

---

## Data Sources and Pipelines

### Desktop (Tauri)
- **Startup**: Desktop telemetry channel → JSON → dashboard DB
- **Crashes**: Sentry integration (configured)
- **Approvals**: Signaling server event logs (structured JSON)
- **Browser**: Desktop background agent logs (file-based, queried nightly)
- **Tools**: ToolGuard audit table (SQLite → query nightly)

### Mobile (Expo)
- **Crashes**: Firebase Crashlytics export → nightly batch
- **Pairing**: Signaling server logs (event stream)
- **Latency**: Mobile API client telemetry (custom instrumentation)
- **Approvals**: Signaling server event logs
- **Offline Sync**: Mobile queue table (MMKV export on sync)

### Web (Next.js)
- **Crashes**: Sentry integration
- **Page Load**: Web Vitals API + Next.js telemetry
- **Auth**: API Gateway auth route logs (nightly query)
- **Billing**: Stripe webhook log query + web error tracking

### CLI (Rust)
- **Startup**: CLI instrumentation (--profile flag output parsed nightly)
- **One-Shot**: Exit code logs written to `~/.agiworkforce/logs/`
- **Sessions**: SQLite session DB query (resume table)

### Extensions
- **Activation**: Extension telemetry API (VS Code) → custom logger
- **Chat Stability**: Extension error logs (structured)
- **Code Edits**: Test suite results (weekly from CI)
- **Bridge**: Extension background logs → structured JSON
- **Autofill**: Test harness logs (weekly from CI)

---

## Release Gate Criteria

### Train Gate Template

Each train (Train 1 Desktop, Train 1 Mobile, etc.) must pass ALL of the following:

```
Gate 1 (Performance):
  ✓ Startup Time ≤ 4.5s AND Crash-Free ≥ 99.2% AND Message Latency ≤ 2.5s

Gate 2 (Reliability):
  ✓ Tool Success ≥ 98% AND Offline Sync ≥ 98% AND Auth Success ≥ 99.5%

Gate 3 (Feature Completeness):
  ✓ Approval Timeout ≤ 2% AND Pairing ≥ 96% AND Browser Success ≥ 95%

PASS/FAIL Decision:
  PASS → Deploy to staging, run 48h smoke suite
  FAIL → Block train, route to issue triage
```

### Weekly Release Cadence

- **Monday 0600 UTC**: Nightly telemetry aggregation runs
- **Monday 0700 UTC**: Dashboard refreshes with 7-day trend
- **Monday 0800 UTC**: Team reviews gates, makes Train decision
- **Trains clear by Monday 1000 UTC** or issue is filed + priority assigned
- **Wednesday 1600 UTC**: Smoke suite runs on cleared trains
- **Friday 1000 UTC**: Approved trains deploy to production (Friday-10am rule to catch issues before weekend)

---

## Status Color Scheme

| Color | Meaning | Action |
| --- | --- | --- |
| **GREEN** | Metric is within target, no action needed | Monitor for trends |
| **YELLOW** | Metric is approaching threshold, investigate | File low-priority issue, schedule fix |
| **RED** | Metric exceeds threshold, blocks release | File high-priority issue, assign to on-call |
| **GRAY** | No data collected yet / data source offline | Re-enable data source, backfill if possible |

---

## Implementation Roadmap

### Week 1–2 (April 6–17)
- [ ] Design DB schema for KPI storage (PostgreSQL)
- [ ] Implement telemetry collectors for all 6 surfaces (Rust, TypeScript, Next.js)
- [ ] Integrate Sentry, Firebase Crashlytics, Web Vitals APIs

### Week 3–4 (April 20 – May 3)
- [ ] Build backend API routes (`GET /api/quality/*`)
- [ ] Create React dashboard component (statusboard + detail views)
- [ ] Wire up historical trend charts

### Week 5–6 (May 6–17)
- [ ] Integrate with release gate system
- [ ] Add train status table + gate decision logic
- [ ] Documentation and team training
- [ ] **Dashboard live for Train 1 decision** (May 16)

### Week 7+ (Continuous)
- [ ] Tuning thresholds based on real usage
- [ ] Additional secondary KPIs
- [ ] Automated alerting when gates change color

---

## Ownership and SLA

| Component | Pod | SLA |
| --- | --- | --- |
| Desktop KPI collection | Desktop Shell | 99% data freshness (nightly) |
| Mobile KPI collection | Mobile Chat & Projects | 99% data freshness (nightly) |
| Web KPI collection | Web Chat & App Shell | 99% data freshness (nightly) |
| CLI KPI collection | CLI | 98% data freshness (weekly) |
| Dashboard UI + gates logic | Quality, Release & Observability | Critical P1 if gates go red |
| Telemetry aggregation pipeline | Platform, Auth & Sync | Critical P1 if pipeline fails |

---

## Success Criteria (End of Q2)

- [ ] All primary KPIs collecting data for all 6 surfaces
- [ ] Historical 7-day trend visible for each KPI
- [ ] Release gates tied to dashboard metrics, no manual override needed
- [ ] Train 1 release decisions are data-driven (gates + decision log)
- [ ] Team confidence in release readiness ≥ 95% (measured in post-release incident rate)
- [ ] Dashboard updated nightly, visible to all pods, linked from Slack

---

## Appendix: Metric Justification

### Why These Thresholds?

**Startup Time (< 4.5s)**: Users abandon apps that take > 5s to start. 4.5s is 90th percentile of production Tauri startup times (measured 2026-03-18).

**Crash-Free (≥ 99.2%)**: 99.2% means < 1 crash per 500 sessions. Matches Claude Desktop baseline.

**Approval Timeout (≤ 2%)**: Users expect approvals within 5–30s. Timeouts above 2% suggest infrastructure issues.

**Tool Success (≥ 98%)**: Tool failures break agent progress. 98% keeps user trust high.

**Browser Automation (≥ 95%)**: Browser state is inherently fragile. 95% is realistic without breaking desktop runtime.

**Pairing (≥ 96%)**: QR pairing is a first-use experience. Low success here bounces users immediately.

**Message Latency (< 2.5s)**: Users notice delays > 3s. 2.5s gives headroom for network variance.

**Auth (≥ 99.5%)**: Auth failure blocks all users. Must be near-perfect.

### Why Not Other Metrics?

- **Test Coverage**: Not a KPI — code is not running on user devices
- **CI/CD Time**: Not a KPI — only matters if it blocks deployment
- **API Response Time**: Covered by downstream KPIs (message latency, page load)
- **Model Quality**: Too subjective — covered by user rating (secondary KPI)
