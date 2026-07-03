# AGI Chrome Extension — Volume 09 — Website Interaction

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, `apps/extension/THREAT_MODEL.md`, and the shipped surfaces this volume grounds in: `apps/extension/src/features/content/autofill/{detector,filler,linkedin,lever,greenhouse,ashby}.ts`, `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts`, `apps/extension/src/features/content/{browserTool,page-metadata}.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/manifest.json`. Model-by-plan gating for the bridged chat draws model facts only from `packages/types/src/models.json`.

## Overview & stance

Website interaction is the core of the AGI Browser Companion: reading a page and acting on it on the user's behalf. Every capability here runs inside the browser as a **permission-gated browser agent**, not a standalone assistant. Two execution strategies cooperate: a deterministic **content-script fast-path** (autofill by known selectors) and a **CDP computer-use agent loop** (`agentLoop.ts` + `cdpDriver.ts`) that takes over when the fast-path stalls — the "one agent, two strategies" boundary in `escalationEngine.ts`.

Trust boundaries constrain the whole surface. The extension holds **no provider keys and runs no inference**; the bridged chat and the agent loop stream only through the cloud gateway (`cloudAgentClient.ts` egresses to `api.agiworkforce.com` only; `manifest.json` `connect-src` blocks every other host). There is **no BYOK and no Local inference on Chrome** — those modes belong to Desktop/CLI/VS Code. Interaction is scoped to a **per-site allowlist** (`agi_site_allowlist`, read in `cdpDriver.ts`/`policy.ts`): the loop refuses to act, navigate, or capture on an origin the user has not approved, and aborts if a click or redirect lands off-allowlist. Page content is always treated as **untrusted data, never instructions** (content fencing + injection heuristic in `cdpDriver.getPageContent`).

## Fill Forms — incl. job autofill (LinkedIn/Lever/Greenhouse/Ashby)

✅ Built — `apps/extension/src/features/content/autofill/detector.ts` detects application forms on LinkedIn, Lever, Greenhouse, and Ashby; `filler.ts` writes values with React/Vue/Angular-compatible native setters, sanitizes each value (strips control chars/HTML, 2000-char cap), and **never auto-submits** (`filler.ts` header contract). Generic (non-ATS) fields are fillable via the CDP `type` tool (`cdpDriver.type`). Requirements: map only fields resolvable to a profile key (`inferProfileKey`); skip file inputs (they escalate); require read-back verification (see Read Inputs); never write to a hidden/submit/button input.

## Click Buttons

✅ Built — `cdpDriver.click(tabId, target)` accepts an element **index**, a CSS selector, or `{x,y}` coordinates, dispatched via `Input.dispatchMouseEvent`; the model is instructed to prefer index-based targeting rebuilt on every `read_dom` (`agentLoop.ts` system prompt). `browserTool.ts` additionally bridges Anthropic Computer Use `left/right/middle/double/triple_click` onto native page actions. Requirements: resolve stale indices by re-reading the DOM; after any click, re-verify the tab URL against the allowlist (`agentLoop` post-click check) and abort on off-allowlist navigation; the fast-path/escalation must **never** click a Submit/apply button without approval.

## Read Inputs

🟡 Partial — `cdpDriver.getFieldValue` reads a committed input/textarea/select value; `escalationEngine.verifyReadback` compares intended vs committed value (case-insensitive for selects) to detect events React swallowed; `read_dom` lists inputs with `name`/`type`/`placeholder`. Gap: there is no single "harvest all field values as structured JSON" tool exposed to the model — reads are per-selector or embedded in the DOM summary. Requirement: any fill of a required field must be read-back-verified and escalate on mismatch.

## Read Tables

🔭 Planned — `cdpDriver.getPageContent` returns interactable elements plus `document.body.innerText` fenced as untrusted content, so table text is captured but **flattened**, not structured into rows/columns. `page-metadata.ts` extracts JSON-LD/microdata `@type` when present. Requirement (planned): a structured `read_table` extractor that emits header + row arrays with a size cap; until built, tables are read as fenced text only.

## Read Lists

🔭 Planned — same mechanism as tables: list items appear in the fenced `innerText` summary and via `og:`/JSON-LD metadata (`page-metadata.ts`), but there is no structured list extractor (ordered/unordered, `role="list"`, virtualized lists). 🟡 today only insofar as visible list text is captured. Requirement (planned): `read_list` returning item arrays with source-selector provenance, bounded by `DOM_SUMMARY_MAX_CHARS`-style caps.

## Read Dynamic Content

✅ Built — `cdpDriver.waitForStable` polls `document.readyState` plus a hash of the interactable-element snapshot until it is quiet for N consecutive polls (default 2), capped by timeout; `agentLoop` calls it before every `screenshot`/`read_dom`/`find` and after `click`/`navigate`. SPA re-render invalidation is handled by rebuilding the index→selector map on each `getPageContent`. Requirement: never read or act on a page mid-mutation; treat late-injected DOM (banners, modals) as new untrusted content.

## Handle Infinite Scroll

🟡 Partial — `cdpDriver.scroll` supports both `{dy}` wheel scrolling and `scrollIntoView({toSelector})`; the agent loop exposes `scroll` as a tool. Gap: there is no autonomous scroll-until-stable **harvest loop** — the model must issue repeated `scroll` + `read_dom` steps manually, bounded by the 20-step `MAX_STEPS` cap. Requirement (planned): a bounded infinite-scroll helper that scrolls, waits-for-stable, dedupes newly revealed items, and stops on no-growth or step budget.

## Multi-step Navigation

✅ Built — the `navigate` tool enforces the allowlist **before** the CDP `Page.navigate` (`cdpDriver.navigate`) and **re-verifies the actual URL after** (`agentLoop`), throwing `NavigationOffAllowlistError` on redirect to an unapproved origin and hard-aborting the loop. Multi-page wizards (e.g. LinkedIn Easy Apply steps 2+) are recognized as the `multi_page_flow` escalation reason (`escalationEngine.ts`). Requirement: every hop re-checks the allowlist; the loop is capped at `MAX_STEPS` (default 20) to prevent runaway navigation.

## Confirmation Flows

🟡 Partial / 🔭 — the escalation goal explicitly instructs the agent to **never click Submit** and to stop-and-report at login walls (`escalationEngine.makeEscalationDecision`), and the `onBeforeAction` gate can require approval before any single action. Gap: native browser dialog handling (`confirm()`/`beforeunload`/JS alerts) is not wired, and there is no dedicated "confirm before irreversible submit" UI. Requirement (planned): route irreversible actions (submit, purchase, delete) through an explicit confirmation step surfaced in the side panel.

## User Approval — ask-before-acting plans + high-risk approvals

🟡 Partial — `agentLoop.onBeforeAction` is a per-action gate that is **fail-closed**: a 30s timeout or callback error resolves DENY, and approval is bound to the specific pending action (no spam-approve). Escalation hand-offs are surfaced via `emitEscalationEvent` for the side panel banner. Gaps: the default gate is `undefined` (allow-all) and the side-panel confirmation dialog is still a documented "seam for day-2"; **whole-plan** approval (approve a multi-step plan up front) and **high-risk-action classification** are not yet built; **high-risk-site detection/intervention** is 🔭 (no such classifier exists in `apps/extension/src`). Entitlement/plan gating for the bridged chat is server-side: a 429 `{kind:'paywall', requiredTier}` renders the paywall (tiers Free / Basic / Pro / Max / Enterprise), with model-by-plan gating from `packages/types/src/models.json`.

## Repository map

- `apps/extension/src/features/content/autofill/{detector,filler,linkedin,lever,greenhouse,ashby,index}.ts` — job-form detection + deterministic fill.
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts` — CDP computer-use loop, action layer, escalation boundary, gateway egress.
- `apps/extension/src/features/content/{browserTool,page-metadata,dom-helpers,nlweb,webmcp}.ts` — action bridge + page context extraction.
- `apps/extension/src/background/policy.ts` — message/origin allowlist, gateway/bridge URL validation, scheduled-task gating.
- `apps/extension/manifest.json`, `apps/extension/THREAT_MODEL.md` — permissions, CSP egress lock, threat model.

## Competitor notes

Claude for Chrome and OpenAI's Operator/Codex browser both run a screenshot-plus-DOM agent that clicks, types, and navigates with human approval on risky steps. AGI's deliberate divergences: (1) **egress lock** — the extension holds no keys and can reach only `api.agiworkforce.com`, so no page data is ever posted to a provider host directly; (2) **two-strategy execution** — a deterministic autofill fast-path runs first and only escalates to computer-use on read-back/structural failure, cutting token cost and error surface; (3) **per-surface trust** — Chrome is Cloud-bridged only (no BYOK, no Local), unlike Desktop/CLI/VS Code; (4) **allowlist-gated, task-scoped** interaction with no consumer conversation/memory sync. Multi-provider and BYOK live on the surfaces where they are safe, not here.

## Acceptance / Definition of Done

The domain is production-ready when interaction is deterministic-first, allowlist-bounded, read-back-verified, and never submits or navigates off-allowlist without explicit approval, with all page content treated as untrusted.

- [ ] Build: autofill fills LinkedIn/Lever/Greenhouse/Ashby without auto-submit; click/type/scroll/navigate execute by index/selector/coords; `waitForStable` gates every read; escalation fires on read-back mismatch, required-empty, file-upload, typeahead, CAPTCHA, login-wall, and multi-page triggers.
- [ ] Trust: no provider host is contacted from the extension; no BYOK/Local path; every navigation re-checks the site allowlist and aborts on off-allowlist redirect; bridged-chat gating renders from server 429 paywall with model IDs sourced from `models.json`.
- [ ] Security: `onBeforeAction` fail-closed approval is wired to a real side-panel dialog before any submit/purchase/delete; injection heuristic hard-stops the loop; profile values sanitized; `read_dom`/`getPageContent` capped and fenced.

## Anti-patterns

- Contacting any provider host from the extension, or adding a BYOK/Local inference path on Chrome.
- Acting, navigating, or capturing on a non-allowlisted origin; continuing after an off-allowlist redirect instead of aborting.
- Auto-submitting forms, or clicking Submit/purchase/delete without explicit approval.
- Treating fenced page text as instructions; ignoring a `SECURITY WARNING` injection prefix.
- Claiming structured table/list extraction, whole-plan approval, or high-risk-site intervention as shipped — they are 🔭.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`); referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups; referencing Supabase; renaming `proxy.ts` to `middleware.ts`.
