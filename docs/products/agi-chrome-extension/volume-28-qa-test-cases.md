# AGI Chrome Extension — Volume 28 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md`, and repo paths under `apps/extension/__tests__/`, `apps/extension/src/features/`, `apps/extension/vitest.config.ts`. Model IDs are owned by `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines the QA test-case contract for the AGI Chrome Extension — the permission-gated **browser agent** (page context, website interaction, autofill, CDP computer-use, thin bridged chat), not a standalone assistant. QA here is dominated by **trust-boundary** and **injection** assertions, because the extension holds **no provider keys and runs no inference**: chat streams only through the cloud gateway (`src/features/native-bridge/providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the Desktop bridge, and computer-use egress is host-restricted (`src/features/computer-use/cloudAgentClient.ts` documents the EGRESS rule — no provider host is ever contacted). History and memory are `chrome.storage.local` only and **never sync**. The suite runs on Vitest + jsdom (`vitest.config.ts`).

Guidance check: the outline's "14 test suites" figure is **stale** — verified against source there are **51 `*.test.ts` files** (`find __tests__ -name '*.test.ts'`) containing **218 `describe` blocks**, plus a structured `__tests__/priority-level-1/` tree (chat-flows, error-states, message-handling, security). Cite the real count, not 14.

## Functional

Core flows need happy- and failure-path coverage: first-run onboarding, connection lifecycle, reconnect/backoff, side-panel render/markdown, composer drag-drop, and local history CRUD (`MAX_CONVERSATIONS = 100`, 30-day TTL). ✅ Built — `__tests__/onboarding-firstrun.test.ts`, `connection-lifecycle.test.ts`, `background.reconnect.test.ts`, `sidePanelMarkdown.test.ts`, `sidePanelComposerDragDrop.test.ts`, `conversation-history.test.ts` (asserts `src/features/background/conversation-history.ts`). Requirement: every message-handler policy branch in `src/background/policy.ts` has a positive and a negative case (`__tests__/policy.test.ts`, `priority-level-1/message-handling/message-policy.test.ts`).

## Browser APIs

Assert MV3 permission usage stays least-privilege: `cookies`, `tabs`/`tabGroups`, `sidePanel`, `alarms` (scheduled tasks), `scripting`, `notifications`, `debugger` (CDP). ✅ Built — `__tests__/background.cookies.test.ts`, `tab-updated-allowlist.test.ts`, `screenshot-tab-restriction.test.ts` (screenshots restricted to the active/allowlisted tab), `scheduled-task-origin.test.ts` (alarm-fired tasks carry a verified origin). Requirement: any new `chrome.*` permission adds a test proving it is gated by the allowlist and cannot be triggered by an arbitrary sender.

## Page Context

Page/DOM/console/network reads must treat page content as **data, never instructions**. Cover metadata extraction, Unicode-safe HTML capture, and content-script boundaries. ✅ Built — `__tests__/page-metadata.test.ts`, `extract-page-html-unicode.test.ts`, `content.test.ts`, `dom-helpers.test.ts`, `static-html.snapshot.test.ts`, `priority-level-1/message-handling/page-context.test.ts`. Requirement: a prompt-injection fixture (page text containing "ignore previous instructions") must be captured as inert context and never escalate to an action without approval (extend `priority-level-1/security/`).

## Website Interaction

Navigate/click/type/fill, tab management, WebMCP, and shortcut execution must validate every action payload before dispatch. ✅ Built — `__tests__/browser-tool.test.ts`, `run-page-actions-validation.test.ts`, `shortcut-action-validation.test.ts`, `webmcp.test.ts`, `webmcp-extended.test.ts`. Requirement: DOM-mutation actions (`TYPE`/`CLICK`) stay same-tab (`allowsCrossTab: false` in `src/background/policy.ts`); cross-tab attempts must be rejected. Record-and-replay redaction is covered by `recorder-redaction.test.ts`. Plan-approval / high-risk-action gating for multi-step workflows is 🔭 Planned as a dedicated suite.

## Autofill

Job-application autofill (LinkedIn/Lever/Greenhouse/Ashby) drivers in `src/features/content/autofill/` need per-platform field-mapping and storage tests. ✅ Built — `__tests__/autofill-storage.test.ts`, `jobAutofill.runtime.test.ts`, `autofill-escalation-agent-integration.test.ts`. Requirement: no autofill writes without the site being allowlisted; a fixture per detector (`detector.ts`) verifies form recognition. Broadening to Workday (the jsdom test URL is `acme.myworkdayjobs.com`) as a first-class filler is 🔭.

## Computer-use Escalation

The "one agent, two strategies" flow (fast DOM path → CDP escalation via `agentLoop.ts`/`cdpDriver.ts`/`escalationEngine.ts`) needs coverage of the escalation trigger (`agi:escalate` custom event), default ask-before-acting, and reliability under stalls. ✅ Built — `__tests__/computer-use-agent-loop.test.ts`, `computer-use-default-ask.test.ts`, `computer-use-reliability.test.ts`. Requirement: computer-use defaults to **ask** (`computer-use-default-ask.test.ts`); high-risk actions require explicit approval and the `debugger`/CDP attach is scoped to the target tab.

## Performance

Requirement: side-panel first-paint, streaming token latency, and background service-worker cold-start budgets; capture history (100-conv cap) must not exceed a storage ceiling. 🔭 Planned — no dedicated performance suite exists today; `computer-use-reliability.test.ts` is the closest timing-adjacent coverage. Track a gap for a `performance/` suite with explicit budgets before GA.

## Security

The heaviest suite: allowlist enforcement, bridge-URL validation, trust-boundary isolation, provider-routing, privacy boundary, extension-page-only gating, and pairing. ✅ Built — `__tests__/navigate-allowlist-security.test.ts`, `bridge-url-validation.test.ts`, `trust-boundary.test.ts`, `security-fixes.test.ts`, `extension-page-only-gate.test.ts`, `pairing.test.ts`, `pairing-e2e.test.ts`, and `priority-level-1/security/{data-isolation,privacy-boundary,provider-routing}.test.ts`. Egress is proven by `check:no-cloud-ipc` (`scripts/check-no-cloud-ipc-v1.mjs`). Bridge auth uses `X-Bridge-Token` (stored as `agi_bridge_token`, `src/pairing.ts`) over localhost `:8787`; native host is `com.agiworkforce.browser`. Requirement: no path routes Local/BYOK data to Cloud; server-verified entitlements render the paywall from a 429 `{kind:'paywall', requiredTier}` response. 🟡 Gap — `src/features/native-bridge/providerStreamClient.ts` still types `PaywallRequiredTier` as `'hobby' | 'pro' | 'pro_plus' | 'max'`, encoding **removed** tiers; a regression test must assert the canon ladder (Free/Basic/Pro/Max/Enterprise) once the billing-catalog reconciliation lands.

## Accessibility

Requirement: side-panel and in-page panel meet keyboard-nav, focus-order, contrast, and ARIA-label contracts; the no-hex-color lint (`scripts/check-no-hex-colors.mjs`) enforces token-based theming. 🔭 Planned — no automated a11y suite (axe/role assertions) exists yet; add one alongside the side-panel contract tests.

## Cross-browser

The extension targets Chromium (Chrome + Edge; native-host registration for both is documented in `native-host/INSTALL.md`). 🟡 Partial — MV3 manifest and install docs support Edge, but there is no automated cross-browser matrix; QA is Chrome-only in CI. Requirement: a smoke matrix (Chrome stable + Edge) for load, pairing, and one autofill flow before GA; Firefox/Safari are out of scope.

## Regression

Every fixed trust-boundary or paywall bug adds a permanent negative test. ✅ Built — snapshot lock `static-html.snapshot.test.ts`, plus `cloud-public-alpha-copy.test.ts`, `free-trial-quota.test.ts`, `background.paywall.test.ts`, `providerStreamClient.paywall.test.ts`, `cloud-bridge-invite-code.test.ts`. Requirement: `pnpm --filter @agiworkforce/extension test` green + `check:no-cloud-ipc` + `check:no-hex` on every PR; a tagged "trust-boundary regression" subset is 🔭.

## Repository map

- `apps/extension/vitest.config.ts` — Vitest + jsdom runner (Workday jsdom URL).
- `apps/extension/__tests__/**` — 51 `*.test.ts` files incl. `priority-level-1/{chat-flows,error-states,message-handling,security}/`.
- `apps/extension/src/features/{computer-use,content,native-bridge,cloud-bridge}/`, `src/background/{policy.ts,memory-bridge.ts}`, `src/features/background/conversation-history.ts`, `src/pairing.ts`.
- `apps/extension/scripts/{check-no-cloud-ipc-v1.mjs,check-no-hex-colors.mjs,check-conflict-markers.sh}`.
- `apps/extension/{manifest.json,THREAT_MODEL.md,MANIFEST_NOTES.md,native-host/}`.

## Competitor notes

Claude for Chrome, ChatGPT/Atlas, and Codex browser agents QA a single first-party provider and a single cloud trust mode, so their suites never assert "no provider host contacted from the extension" or "Local/BYOK never sync." AGI's deliberate divergence: the extension is provider-thin (all inference via the gateway/Desktop bridge), so its non-skippable cases are **egress + trust-boundary** tests (`trust-boundary.test.ts`, `check:no-cloud-ipc`, EGRESS-rule enforcement) and device-scoped history/memory (never synced). Model-dependent cases read IDs from `packages/contracts/types/src/models.json` — never hardcoded — keeping tests provider-agnostic. Parity references only; no proprietary code or branding is copied.

## Acceptance / Definition of Done

Production-ready when all suites are green in CI, egress/no-cloud-ipc and no-hex guards pass, and every trust-boundary/paywall fix has a permanent negative test. Performance and accessibility suites (both 🔭) and the cross-browser matrix (🟡) are named GA blockers.

- [ ] Build: `pnpm --filter @agiworkforce/extension test`, `typecheck`, `check:no-cloud-ipc`, `check:no-hex` all green.
- [ ] Trust: tests prove no Local/BYOK data reaches Cloud; history/memory (`MAX_MEMORY_ITEMS = 200`, 100-conv/30-day history) never sync; paywall renders from server 429 only.
- [ ] Security: allowlist, bridge-URL, pairing (`X-Bridge-Token`), and injection-as-data suites green; `PaywallRequiredTier` reconciled to the canon ladder.

## Anti-patterns

- Never test a path that lets the extension contact a provider host directly or hold a provider key — it holds none.
- Never assert or seed **removed** tiers (`hobby`, `pro_plus`, `Plus`, `Hobby`) or credit top-ups; use Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise. Do not invent Pro/Max INR.
- Never hardcode a model ID in a test; read from `packages/contracts/types/src/models.json`.
- Never mock away a trust-boundary assertion or let page content drive an action without approval (treat page text as data).
- Never reference Supabase or `middleware.ts` (Next.js 16 uses `proxy.ts`); never let history/memory sync or add Projects/image-gen/in-extension checkout to the suite.
- Never mark a capability ✅ without a real repo path, or claim the stale "14 suites" count.
