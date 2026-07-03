# AGI Chrome Extension — Volume 22 — Analytics

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/manifest.json`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/background/memory-bridge.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/features/computer-use/{agentLoop,escalationEngine,cloudAgentClient}.ts`, `apps/extension/src/features/content/in-page-panel/setup.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume defines analytics for the **AGI Browser Companion** — the permission-gated browser agent, not a consumer assistant. Analytics here is **task-scoped, first-party, and privacy-preserving by construction**. The extension holds no provider keys and runs no inference; it is a secure window over cloud-gateway and native-bridge sessions, so its telemetry describes _agent actions and extension health_, never the _content of the pages the user visits_.

Two rules dominate every subsection. First: **never page-content exfiltration.** Page text, DOM, form values, screenshots, console, and network bodies are captured only to execute an approved task and are never emitted as analytics dimensions. Second: the manifest CSP `connect-src` allows only `self`, `localhost`, `127.0.0.1`, and `*.agiworkforce.com` (`apps/extension/manifest.json`). No PostHog/Amplitude/Segment/Sentry host is reachable; any analytics egress is **first-party to `api.agiworkforce.com` only**, or stays in `chrome.storage.local`. Trust modes still apply: the extension never touches BYOK (Desktop/CLI/VS Code only) and never runs Local inference; its analytics cover Managed-Cloud bridged chat and CDP computer-use only. There is **no third-party analytics SDK today** — most of this volume is 🔭 Planned, built on the existing storage, policy, and action-log primitives.

## Events

A single append-only event schema `{ name, ts, sessionId, surface:'chrome', taskId?, props }` where `props` is an **allowlisted, non-content** dictionary (counts, enums, durations, booleans). ✅ The primitive exists: `pageActions.ts` already assigns action IDs "used for analytics / test assertions" (`apps/extension/src/features/content/in-page-panel/pageActions.ts`) and `escalationEngine.ts` emits human-readable reasons for the action log (`apps/extension/src/features/computer-use/escalationEngine.ts`). 🔭 A unified emitter, event registry, and batched first-party sink are Planned. Requirements: every event name must be in a static registry (lint-enforced); `props` must pass an allowlist filter that rejects free-text, URLs, selectors, and DOM strings; PII/page content in `props` is a build-failing violation. Events buffer in `chrome.storage.local` and flush to `api.agiworkforce.com` only for signed-in Managed-Cloud users.

## Session tracking

A "session" is one **agent task or bridged-chat run**, not a browsing session. `sessionId` is a random per-run ID; it must **not** be a stable device or user fingerprint and must not join to browsing history. ✅ Task identity already flows through the agent loop history (`apps/extension/src/features/computer-use/agentLoop.ts`) and pairing is per-bridge via `X-Bridge-Token` (`apps/extension/src/features/native-bridge/pairing.ts`). 🔭 Session lifecycle events (start/step/approval/complete/abort) are Planned. Requirements: sessions expire with the task; no cross-task correlation IDs; remote-control windows (phone/web steering a locally-running host) reuse the host session ID but never upgrade it into a Cloud identity — compute stays on the host.

## Feature usage

Counts of _which capabilities_ run — plan approval shown/accepted/rejected, autofill invoked (LinkedIn/Lever/Greenhouse/Ashby), record-and-replay, scheduled task fired, tab-group op, region capture — as enums with durations. 🟡 Partial: the underlying features exist (`apps/extension/src/features/content/autofill/`, computer-use loop) but emit no counters yet. Requirements: usage events carry the feature enum and outcome only — never the target site, job title, or field values. Autofill telemetry records "fields filled: N", never their contents.

## Browser usage

Aggregate, **non-identifying** browser context: Chrome major version, extension version (`1.2.0`, `apps/extension/manifest.json`), granted-permission set, allowlisted-site _count_, side-panel vs in-page-panel usage, native-bridge connected (bool). 🔭 Planned. Hard prohibition: **no visited URLs, no per-domain histograms, no page titles, no tab contents.** High-risk-site _interventions_ may be counted as a bare tally (`highRiskIntervention: N`) with no domain attached. This is the sharpest edge of "never page-content exfiltration": browser usage means the _browser_, not the _browsing_.

## Errors

Structured, redacted error telemetry: `{ code, area, ts, taskId? }` for permission denials, egress-allowlist rejections (`validateGatewayUrl`, `apps/extension/src/background/policy.ts`), native-bridge/pairing failures, gateway 4xx/5xx, and CDP driver faults. 🟡 Partial: policy and bridge already throw/reject on violation; 🔭 structured capture and reporting are Planned. Requirements: error payloads carry a stable `code` and coarse `area`, never stack frames containing page data, selectors, or request bodies. A **server 429 `{kind:'paywall', requiredTier}`** is an entitlement signal, not an error (`cloudAgentClient.ts` handling) — count it separately as a paywall-shown event so it never inflates error rates.

## Performance

Latency/throughput for extension-owned spans: gateway stream first-token and total time (token accounting already exists via `tokensUsed` in `apps/extension/src/features/computer-use/agentLoop.ts`), CDP action round-trip, page-capture duration, autofill fill time, service-worker cold-start. 🟡 Partial (token counts) / 🔭 Planned (timing spans). Requirements: metrics are numeric only; no URL or content labels; percentiles computed server-side from bare durations. Budgets are testable (e.g., capture < target ms) and regressions are release-gating.

## Crash reporting

Service-worker and content-script crash/unhandled-rejection capture. 🔭 Planned — **no Sentry or third-party crash SDK**, and none may be added without a CSP change and threat-model update (`apps/extension/THREAT_MODEL.md`). Requirements: crash reports are first-party, contain redacted `code`/`area`/version/Chrome-version only, and are opt-in for signed-in users. Native-host crashes (`com.agiworkforce.browser`) surface as a bridge-disconnect error event, not a raw dump.

## Feature flags

✅ Built pattern: `chrome.storage.local` boolean flags gate features today — e.g. `in_page_panel_enabled` (`apps/extension/src/features/content/in-page-panel/setup.ts`). 🔭 Planned: a first-party flag-fetch from `api.agiworkforce.com` with local cache and safe defaults. Requirements: flags default **off/safe** when the fetch fails; flags never carry targeting keyed on browsing behavior; model-by-plan gating mirrors Claude-in-Chrome plan gating and is **verified server-side** (paywall from server 429), never client-trusted. Flag identity keys on entitlement tier and version, not on visited sites.

## Repository map

- `apps/extension/manifest.json` — CSP `connect-src` allowlist (analytics egress boundary), version.
- `apps/extension/src/background/policy.ts` — `validateGatewayUrl`, egress allowlist (error-signal source).
- `apps/extension/src/features/computer-use/agentLoop.ts` — task history, `tokensUsed` accounting.
- `apps/extension/src/features/computer-use/escalationEngine.ts` — action-log reasons.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — gateway egress + paywall 429 handling.
- `apps/extension/src/features/content/in-page-panel/{setup,pageActions}.ts` — flag pattern + action IDs.
- `apps/extension/src/features/background/conversation-history.ts` — local-only history (100 convs, 30-day TTL).
- `apps/extension/src/background/memory-bridge.ts` — device-scoped `agi_memories` (max 200, never synced).
- `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md` — permission/egress rationale.

## Competitor notes

Claude for Chrome, ChatGPT, and Codex ship product telemetry through their own first-party pipelines and gate models by plan. AGI's deliberate divergence: **per-surface trust and local-first**. Because Chrome runs no inference and holds no keys, its analytics can only describe agent actions and health, never page content — a stronger stance than a general assistant that logs conversations. AGI is **multi-provider** (model IDs from `packages/types/src/models.json`, e.g. the computer-use route), honors **BYOK only where allowed** (never in Chrome), and keeps history/memory device-local instead of syncing them. No cross-site behavioral profiling, ever.

## Acceptance / Definition of Done

Production-ready when analytics is first-party, allowlist-filtered, content-free, opt-in for signed-in users, and defaults safe when disabled — with a lint-enforced event registry and threat-model sign-off.

- [ ] Build: static event/flag registry; allowlist filter rejects free-text/URL/DOM props; `pnpm --filter @agiworkforce/extension typecheck` and `test` green; no third-party analytics/crash SDK added.
- [ ] Trust: no BYOK/Local paths in Chrome analytics; sessions are per-task and non-fingerprinting; remote-control windows never upgrade a local session into a Cloud identity; paywall 429 counted as entitlement, not error.
- [ ] Security: egress first-party to `*.agiworkforce.com` only (CSP verified); no visited URLs/titles/DOM/screenshots/form values in any event; `THREAT_MODEL.md` updated for any new sink.

## Anti-patterns

- Emitting page content, URLs, titles, DOM, selectors, screenshots, or form values as analytics dimensions.
- Adding PostHog/Amplitude/Segment/Sentry or any third-party host without a CSP + threat-model change.
- Stable device/user fingerprints or cross-task correlation that reconstruct browsing history.
- Routing Local/BYOK data into Chrome analytics, or treating a remote-control window as a Cloud session.
- Hardcoding model IDs instead of reading `packages/types/src/models.json`.
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby") or credit top-ups in usage/paywall events; referencing Supabase; using `middleware.ts` naming for the Next.js gateway (it is `proxy.ts`).
- Trusting client flags for model-by-plan gating instead of server-side entitlement (429 paywall).
