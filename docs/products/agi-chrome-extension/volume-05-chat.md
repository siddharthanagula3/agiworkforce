# AGI Chrome Extension — Volume 05 — Chat

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `apps/extension/manifest.json`, `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/features/side-panel/markdown.ts`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/side_panel.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/THREAT_MODEL.md`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the **thin bridged chat** inside the AGI Browser Companion side panel. The extension is a permission-gated browser agent, not a standalone assistant, so chat here is deliberately minimal: it **holds no provider keys and runs no inference of its own**. Every token is streamed from the Managed-Cloud gateway (or the paired Desktop host over the localhost bridge). There is **no BYOK and no Local inference in the extension** — BYOK belongs to Desktop/CLI/VS Code only, and Local runs on-device on those hosts, never in a browser worker.

Chat data is **device-scoped**: history lives in `chrome.storage.local` and is **never** part of Neon delta-sync (that path is Web ↔ Mobile ↔ Desktop, Managed-Cloud chats only). Consumer conversation sync and Projects are out of scope per canon. The single hard egress rule — enforced in `cloudAgentClient.ts` and `policy.ts` — is that no provider host (openai.com, anthropic.com, …) is ever contacted from the extension; only allowlisted AGI gateway origins are.

## Conversation lifecycle

A conversation is a linear list of user/assistant turns held in side-panel state (`_ctx` in `apps/extension/src/side_panel.ts`) and persisted on demand.

- **✅ Built** — Device-local persistence: `apps/extension/src/features/background/conversation-history.ts` stores up to **100** conversations with a **30-day TTL**, crypto-UUID IDs, `saveConversation`/`listConversations`/`getConversation`/`deleteConversation`, and title derived from the first user message.
- Requirement: expired conversations are pruned on every read; deletion is immediate and non-recoverable. New-conversation reset clears `_ctx` without touching stored entries. History must never be uploaded or synced.

## Message composer

- **✅ Built** — The composer (`#sp-composer-shell`, `#sp-input` textarea, send button `#sp-send-btn`) in `apps/extension/src/side_panel.ts` supports auto-resize, `/`-command entry, paste-image and drag-drop attachments, and a persistent page-context chip that attaches page content to the next message only when the user opts in.
- Requirement: attaching page context must be explicit (never automatic), labeled with the source hostname, and cleared after send. The composer must show the active model badge and the current trust label (Managed Cloud) so the user always knows where the turn will run.

## Streaming — SSE via gateway

- **✅ Built** — `apps/extension/src/features/native-bridge/providerStreamClient.ts` streams from `POST /api/v1/providers/<id>/stream`; `apps/extension/src/features/computer-use/cloudAgentClient.ts` streams from `POST /api/llm/v1/chat/completions`. Both parse `data: …\n\n` SSE frames and emit typed chunks (`text-delta`, `thinking-delta`, `tool-use-*`, `usage`, `stop`, `paywall`).
- **✅ Built** — Egress is validated by `validateGatewayUrl` (`apps/extension/src/background/policy.ts`); requests carry the CSRF header and a Clerk bearer token; **no provider host is ever contacted**.
- Requirement: the outbound token is a short-lived Clerk session JWT from `chrome.storage.session`; the streamed model ID must come from `packages/contracts/types/src/models.json` (never hardcoded — `cloudAgentClient.ts` reads `managed_cloud.taskRouting`). Stop-generation is wired via the send button's `data-mode="stop"` toggle and `_ctx.isStreaming` (**✅ Built**, `side_panel.ts`).

## Markdown

- **✅ Built** — `apps/extension/src/features/side-panel/markdown.ts` renders headings, bold/italic, blockquotes, lists, links, and horizontal rules, then hard-sanitizes with DOMPurify. Links are forced to `rel="noopener noreferrer"`, restricted to `https?:`/`mailto:`, and `<img>`/`<script>`/event handlers are stripped.
- Requirement: all model output is rendered through `renderMarkdown` → `sanitizeHtml` before insertion; raw `innerHTML` from model text is forbidden. Page content is data, never instructions (prompt-injection defense per `THREAT_MODEL.md`).

## Code blocks

- **✅ Built** — Fenced blocks (` ``` `) render to `<pre><code>` and inline spans to `<code>` in `markdown.ts`.
- **🔭 Planned** — Syntax highlighting, language labels, and a per-block copy button are not yet built (no highlighter in the sanitizer allowlist). Track as a gap; any highlighter must run on already-sanitized text.

## Tables

- **🟡 Partial** — `sanitizeHtml` allows `table/thead/tbody/tr/th/td` with `colspan`/`rowspan` (`markdown.ts`), so HTML tables emitted by the model render. **Gap:** `renderMarkdown` has **no pipe-table parser**, so GitHub-style `| a | b |` markdown is not converted to a table. Planned: add a pipe-table pass feeding the existing sanitizer allowlist.

## Citations

- **🔭 Planned** — Inline citation chips and a per-message source list are not built. Links render as plain anchors via `markdown.ts`. When added, citations must show the real destination URL (anti-spoofing), respect the link-safety rules, and never fabricate sources. No cloud sync of citation metadata.

## Continue generation

- **🔭 Planned** — Resuming a `max_tokens`-truncated turn is not implemented. The `stop` chunk already carries `reason: 'max_tokens'` (`providerStreamClient.ts`), so the UI can detect truncation; continuation must re-issue through the same gateway path, re-checking entitlements.

## Regenerate

- **🔭 Planned** — No regenerate control exists in `side_panel.ts`. When built, it must re-run the last user turn through the gateway, preserve prior turns, and re-evaluate the paywall (a regenerate can hit the 429 cap like any new turn).

## Edit messages

- **🔭 Planned** — Editing a prior user turn and re-running is not built. Design: editing truncates the conversation at that turn, then re-streams; edits stay device-local and are never synced.

## Copy

- **✅ Built** — Per-message copy via `navigator.clipboard.writeText` with a `.sp-copy-btn` affordance and copied-state feedback (`apps/extension/src/side_panel.ts`).
- Requirement: copy yields the raw model text (not sanitized HTML); no telemetry on copy.

## Export — local export only

- **🔭 Planned** — There is no chat export today (the only download in `side_panel.ts` is the "Download AGI Desktop" link). Export must read from `conversation-history.ts` and write a local file (Markdown/JSON) via a blob download **only** — no server round-trip, no upload, no cloud sync. Exported files stay device-scoped, consistent with the removed-scope rules.

## Repository map

- `apps/extension/src/side_panel.ts` — side-panel chat UI: composer, streaming render, stop, copy, page-context chip.
- `apps/extension/src/features/side-panel/markdown.ts` — Markdown render + DOMPurify sanitizer.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — SSE stream client + paywall parsing.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — gateway chat-completions client + egress allowlist + model sourcing.
- `apps/extension/src/features/background/conversation-history.ts` — device-local history (100 convs / 30-day TTL).
- `apps/extension/src/background/policy.ts` — `validateGatewayUrl`, gateway allowlist.
- `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md` — security posture and manifest rationale.

## Competitor notes

Claude for Chrome, ChatGPT, and Codex ship rich in-extension chat (regenerate, edit, citations, code highlighting, export) backed by a single first-party model. AGI diverges deliberately: (1) **multi-provider** — chat streams through the AGI gateway which routes across catalog providers from `models.json`, not one vendor; (2) **per-surface trust** — Chrome is Managed-Cloud-only with **no keys and no local inference**, whereas Desktop/CLI/VS Code add BYOK and Local; (3) **local-first data** — history is `chrome.storage.local` and never synced, versus competitors' account-synced history; (4) **agent-first framing** — chat is a thin control surface over the browser agent, so parity features arrive behind the automation, not ahead of it. Model-by-plan gating mirrors Claude-in-Chrome plan gating, rendered from server responses.

## Acceptance / Definition of Done

- Streaming renders incrementally, stop works, sanitized Markdown/code render, copy works, history persists within limits, and paywalls render from the server 429 with the current tier ladder.

Build

- [ ] `pnpm --filter @agiworkforce/extension typecheck` and `pnpm --filter @agiworkforce/extension test` pass; `pnpm lint:extension` clean.
- [ ] Every model ID resolves from `packages/contracts/types/src/models.json`; none hardcoded.

Trust / security

- [ ] No provider host is ever contacted; all egress passes `validateGatewayUrl`.
- [ ] No chat/history row enters Neon delta-sync; history stays in `chrome.storage.local`.
- [ ] All model output passes `renderMarkdown` → `sanitizeHtml`; page content treated as data.
- [ ] 🟡 Paywall tier labels in `providerStreamClient.ts` (`hobby`/`pro_plus`) are reconciled to the canon ladder (Free / Basic / Pro / Max) — tracked billing-catalog reconciliation.

## Anti-patterns

- Adding provider API keys or running inference inside the extension (breaks the thin-client rule).
- Contacting a provider host directly, or bypassing `validateGatewayUrl`.
- Syncing chat history/memory to Neon or any server; treating extension history as cloud state.
- Auto-attaching page content without explicit consent, or feeding page text to the model as instructions.
- Hardcoding a model ID instead of reading `packages/contracts/types/src/models.json`.
- Emitting removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices; referencing Supabase; renaming Next.js `proxy.ts` to `middleware.ts`.
- Injecting model output via raw `innerHTML`, or rendering unsanitized HTML/`<img>`/event handlers.
