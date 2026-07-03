# AGI Chrome Extension — Volume 07 — Browser Assistant

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/extension/AGENTS.md`; `apps/extension/THREAT_MODEL.md`. Grounded in real code: `apps/extension/manifest.json`; `apps/extension/src/features/content/{page-metadata,dom-helpers,nlweb,browserTool}.ts` and `in-page-panel/pageActions.ts`; `apps/extension/src/features/native-bridge/providerStreamClient.ts`; `apps/extension/src/features/computer-use/{cloudAgentClient,agentLoop}.ts`; `apps/extension/src/features/background/{conversation-history,tasks}.ts`; `apps/extension/src/background.ts`. Model facts: `packages/types/src/models.json`.

## Overview & stance

This volume specifies the comprehension-oriented "assistant" surface of the **AGI Browser Companion** — the everyday page-understanding features (ask, summarize, explain, translate, notes, research) that sit on top of the permission-gated browser agent, not a standalone consumer chatbot.

The trust model is fixed and narrow. The extension is a **thin bridged chat**: it holds **no provider keys and runs no inference**. Every model call is streamed through the AGI cloud gateway — either the OpenAI-compatible agent path (`callCloud` → `POST /api/llm/v1/chat/completions`, `cloudAgentClient.ts`) or the SSE provider proxy (`streamFromProvider` → `/api/v1/providers/<id>/stream`, `providerStreamClient.ts`). The EGRESS rule is absolute: no provider host (openai.com, anthropic.com, …) is ever contacted from the extension; requests are validated against the gateway allowlist (`validateGatewayUrl`, `background/policy.ts`). **BYOK does not exist on this surface** (Desktop/CLI/VS Code only), and there is **no Local inference** — Chrome is Managed-Cloud-backed for assistant features. Model IDs are read only from `packages/types/src/models.json` (`cloudAgentClient.ts` resolves `managed_cloud.taskRouting.computer_use`); never hardcoded. History and saved notes live in `chrome.storage.local` only (device-scoped, never synced; no Projects, no conversation sync). Page content is treated as **data, never instructions** (prompt-injection defense), and sensitive strings are redacted before entering a prompt (`redactSensitiveText`).

## Ask About Current Page

Users invoke a chat turn scoped to the active page via the in-page panel `Q&A` chip or the `ask-agi-workforce` context-menu item, which forwards selection/page text to the panel. **✅ Built** — `in-page-panel/pageActions.ts` (`qa` action builds a page-grounded prompt); `background.ts` (`ask-agi-workforce` context menu). Page context is assembled from `extractPageMetadata()` plus truncated page text (`truncatePageText`, ~30k char budget) and streamed through the gateway (`providerStreamClient.ts`). Requirements: the prompt must embed page title + URL + extracted text; text must pass `redactSensitiveText` (credit-card/password-line redaction) before send; a visible "Managed Cloud" label must show; on server `429 {kind:'paywall', requiredTier}` the panel renders the upgrade card, never a raw error.

## Summarize Page

One-tap page summary (3–5 bullets). **✅ Built** — `pageActions.ts` `summarize` action and the `summarize-page` context-menu item (`background.ts`), with site-aware templates for YouTube watch pages and GitHub PRs (`YOUTUBE_ACTIONS`, `GITHUB_PR_ACTIONS`). Requirements: summaries are generated from captured page text only; when a page exposes structured data (JSON-LD/OpenGraph via `page-metadata.ts`) the summary should prefer it; length/format is deterministic per chip.

## Explain Selection

Right-click a highlighted range → "Explain selection." **✅ Built** — `background.ts` `explain-selection` context menu; `content.ts` captures `window.getSelection()` (truncated to 2,000 chars) and dispatches an `analyze_selection` action. Requirements: only the selected text (not the whole page) is sent, redacted before send; the explanation streams into the panel with the source snippet shown.

## Rewrite Selected Text

Rewrite/rephrase a highlighted range (tone, brevity, grammar) and offer to replace it in editable fields. **🔭 Planned** — selection capture exists (`content.ts` `analyze_selection`) and the content script can type into inputs (`browserTool.ts` `type` action), but there is **no rewrite-selection menu item, no diff/preview, and no write-back approval flow** today. When built, in-DOM replacement must be an explicit, approved action (ask-before-acting), never silent, and must refuse on password/credential fields.

## Translate Page

Translate full page or a selection into the user's language. **✅ Built** — `pageActions.ts` `translate` action (whole page) and the `translate-selection` context-menu item (`background.ts`). Requirements: source language may be inferred from `PageMetadata.language`; translation runs through the gateway; output renders in the panel (no page mutation without an explicit rewrite action).

## Explain Images

Explain a screenshot, region, or on-page image via a vision-capable model. **🟡 Partial** — the agent path already sends images: `cloudAgentClient.ts` supports `image_url` message content and a `screenshot` tool, and the computer-use model is resolved from `models.json` `managed_cloud.taskRouting.computer_use` (vision-capable). Gap: there is **no dedicated "explain this image" affordance** in the assistant UI; images flow only through the computer-use agent loop. When built, region/element capture (`capture-element` menu already exists in `background.ts`) should feed the vision turn.

## Extract Tables

Pull an HTML `<table>` into clean Markdown/CSV/JSON. **🔭 Planned** — no table extraction exists today; `page-metadata.ts` extracts only JSON-LD, OpenGraph, Twitter Card, and schema types. When built, extraction must run in the content script (DOM-local), respect `redactSensitiveText`, and return structured output to the panel for copy/download — no server round-trip for the raw extraction step.

## Generate Notes

Turn a page or conversation into saved notes. **🟡 Partial** — `pageActions.ts` `key_points` produces note-style bullets, and `conversation-history.ts` persists turns to `chrome.storage.local` (max 100 conversations, 30-day TTL). Gap: **no structured "notes" artifact type**, and by canon **no Projects and no cross-device note sync** on Chrome — notes stay device-scoped. Any handoff to app chat must be explicit and redacted, never automatic.

## Compare Multiple Tabs

Read several open tabs and synthesize a comparison. **🔭 Planned** — the substrate exists: `tabs` + `tabGroups` permissions (`manifest.json`), tab queries in `side_panel.ts`/`background.ts`, and an `add-to-tab-group` context action. Gap: there is **no multi-tab read-and-synthesize flow**. When built, each tab's context must be captured under its own permission/allowlist check, each source labeled in the output, and the combined prompt kept within the gateway token cap (paywall on overflow).

## Reading Assistance

Reading-level simplification, define-in-context, glossaries, and "read this to me." **🟡 Partial** — generic comprehension chips (`summarize`, `key_points`, `qa`) exist (`pageActions.ts`) and `nlweb.ts` detects structured/agent-ready endpoints. Gap: no reading-level control, no inline definitions, and **no TTS** (any speech engine would be a non-LLM engine grounded in real code, not a `models.json` entry). Design intent only.

## Research Assistance

Multi-step, task-scoped research across a session (gather → extract → synthesize with citations). **🟡 Partial** — the multi-step agent loop exists (`agentLoop.ts`, `escalationEngine.ts`) and NLWeb discovery exists (`nlweb.ts`), but there is **no research-mode UI, no citation/source ledger, and no persisted artifact**. Research stays task-scoped: no memory sync, no Projects. Deep cross-session research is the Web/Desktop surface's job; Chrome contributes captured context via an explicit, redacted handoff only.

## Repository map

- `apps/extension/manifest.json` — permissions (`tabs`, `tabGroups`, `contextMenus`, `sidePanel`, `scripting`), host allowlist, CSP `connect-src`.
- `apps/extension/src/features/content/` — `page-metadata.ts`, `dom-helpers.ts`, `nlweb.ts`, `browserTool.ts`, `in-page-panel/pageActions.ts` (chips, `truncatePageText`, `redactSensitiveText`).
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — bridged SSE chat to `/api/v1/providers/<id>/stream`.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — gateway agent path, `image_url`/`screenshot`, model from `models.json`.
- `apps/extension/src/features/background/{conversation-history,tasks}.ts` — `chrome.storage.local` history (100/30-day) and scheduled tasks.
- `apps/extension/src/background.ts` + `src/background/policy.ts` — context menus and gateway allowlist / egress validation.
- `packages/types/src/models.json` — the only source of model IDs.

## Competitor notes

Claude for Chrome and ChatGPT's browser features run assistant chat over a single first-party provider; Codex focuses on repo/agent tasks. AGI diverges: (1) **thin bridged chat** — no keys and no inference in the extension; all traffic is gateway-mediated and allowlisted, so the trust boundary is enforced in code, not policy; (2) **multi-provider via the gateway** (`ProviderStreamProvider` spans anthropic/openai/ollama/google); (3) **per-surface trust** — no BYOK and no Local here, unlike Desktop/CLI/VS Code; (4) **local-first data** — history/notes never leave the device; no Projects/memory sync on Chrome. Model access is plan-gated server-side, mirroring Claude-in-Chrome's plan gating.

## Acceptance / Definition of Done

A feature ships only when it is gateway-mediated, permission-gated, redacted, and paywall-aware — verified by the extension gates in `apps/extension/AGENTS.md`.

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` + `test` + `pnpm lint:extension` pass; page context assembled from real `page-metadata.ts`/panel capture.
- [ ] Trust: no provider host contacted (egress hits only `validateGatewayUrl` members); no BYOK/Local path; visible "Managed Cloud" label; server `429 {kind:'paywall', requiredTier}` renders upgrade UI using the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise).
- [ ] Security: page text/selection pass `redactSensitiveText`; page content handled as data (prompt-injection defense per `THREAT_MODEL.md`); history/notes stay `chrome.storage.local`; DOM write-back is explicit and refuses credential fields.

## Anti-patterns

- Adding provider keys or on-device inference, contacting a provider host directly, or introducing BYOK/Local on Chrome — all break the EGRESS/per-surface rules.
- Syncing history, notes, or memory to Neon/cloud, or reintroducing Projects/conversation sync (`chrome.storage.local` is the only store).
- Hardcoding a model ID instead of reading `packages/types/src/models.json`.
- Rendering a paywall/tier from client guesses or naming removed tiers. Note: `providerStreamClient.ts` still types `PaywallRequiredTier` as `'hobby' | 'pro' | 'pro_plus' | 'max'` with legacy `PaywallFeature` entries — **🟡 tracked reconciliation gap**: the canon ladder has no Plus/Hobby/pro_plus; do not treat that code as authoritative for tiers.
- Writing back to the page silently, or without refusing password/credential fields.
- Referencing Supabase, or using `middleware.ts` instead of `proxy.ts` for the Next.js gateway proxy.
