# Research-Agent Prompt — AGI Workforce parity feature specs

Hand the block below to a research agent that has **no repo access**. It will
return build-ready reference specs; paste those back to the coding agent.

---

You are a **senior product-architecture researcher**. Produce **implementation-ready reference documentation** for a set of features in a product called **AGI Workforce** — a multi-surface AI assistant suite competing with **Claude** (claude.ai, Claude Desktop, Claude Code, Claude in Chrome, Claude mobile) and **ChatGPT** (chatgpt.com, ChatGPT desktop/mobile, Codex). You do **not** have access to the source code, so write your specs from public product behavior, official docs, and best-in-class engineering practice — not from any assumed internal file layout.

## Product context (so your specs fit)

- **Six surfaces:** Web (Next.js 16, React 19), Desktop (Tauri 2 + Vite, React 19 — same design system as web), Mobile (Expo / React Native — UI patterned on the ChatGPT mobile app), CLI (Rust + Ratatui, patterned on Claude Code), Chrome extension, VS Code extension. Web + desktop share React UI packages; mobile + CLI share only logic/contract packages (they can't render web DOM).
- **Three trust modes:** **Local** (on-device models, nothing leaves the device), **BYOK** (user's own provider keys, no markup), **Managed Cloud** (hosted, metered — public alpha). These are strict boundaries: local/BYOK data must never silently go to cloud.
- **Stack:** Neon Postgres, Clerk auth, Upstash rate-limiting, Vercel hosting, an MCP-based connector/tool system, a shared cross-language model catalog. Multi-model (Anthropic, OpenAI, Google, open-weights).
- **North star:** parity-or-better with Claude/ChatGPT while reusing one design system + shared logic across all surfaces (like Claude/ChatGPT do), and being model-agnostic.

## What I need from you

For **each feature below**, write a self-contained spec a senior engineer can implement from **without further research**. Use this exact structure per feature:

1. **What it is** — one-paragraph definition + how Claude and/or ChatGPT expose it today (2026), with concrete behavior.
2. **UX flow & states** — screens, entry points, empty/loading/error/success states, keyboard/mobile/responsive behavior where relevant. Describe the mobile layout explicitly when the feature is user-facing.
3. **Data model** — tables/collections, key fields, relationships, indexes. Note multi-tenant / per-user scoping.
4. **API & events** — endpoints (method, path, request/response JSON shapes), streaming/event contracts (SSE/NDJSON), webhooks. Version notes.
5. **Architecture & algorithms** — the non-obvious engineering (chunking/embeddings, event-sourcing, OAuth/PKCE flow, state machines, retries/idempotency).
6. **Trust/security/privacy** — how it must respect the Local / BYOK / Managed-Cloud boundary; auth; data-egress rules; PII.
7. **Edge cases & failure modes** — the ones that bite in production.
8. **Acceptance criteria** — a checklist an engineer can verify against.
9. **References** — public URLs (official docs, credible engineering write-ups). Mark each claim **[verified]** (from an official source) or **[inferred]** (best practice). Use current 2026 information; do not invent APIs, endpoints, model IDs, or pricing.

Prioritize depth over breadth. If a feature is genuinely ambiguous, state the 2–3 viable designs and recommend one with rationale.

## Features to research (grouped)

### A. Chat & content

1. **Mobile-responsive web chat.** How chatgpt.com and claude.ai serve a phone-browser chat UI from the same domain that looks like their native mobile app: responsive breakpoints, mobile composer + attachment sheet, on-screen-keyboard handling, safe-area insets, scroll/virtualization, PWA/install behavior, and how the sidebar collapses to a drawer.
2. **Document attachments in chat.** Claude/ChatGPT file upload: accepted types (PDF/DOCX/CSV/XLSX/TXT/images), per-file and per-message count/size limits, text/table extraction pipeline, preview UI, how extracted content is fed to the model (inline vs retrieval), and token/cost handling.
3. **Artifacts.** Claude Artifacts in full: artifact types, versioning/history, edit-in-place vs regenerate, the split-view UI, and **publishing/sharing an artifact to a public URL** (permissions, revocation). How ChatGPT Canvas compares.

### B. Search & knowledge

4. **Global search** across chats, projects, files, and artifacts — indexing model, ranking, result grouping, keyboard nav.
5. **Semantic/vector RAG** for project knowledge + long-term memory — embedding model choice, chunking strategy, vector store options (incl. Postgres/pgvector), retrieval + re-ranking, and how Claude Projects and ChatGPT "knowledge"/memory work in practice.

### C. Agent runtime & durability

6. **Durable agent-run journal** — event-sourced runs that survive restarts: event log + command log + transactional outbox, exactly-once side-effects/approvals, and cross-surface replay (start on desktop, resume on web). Reference patterns (Temporal/durable execution) adapted to a Postgres-backed app.
7. **Anthropic `pause_turn` / long server-tool turns** — how the Messages API `pause_turn` stop-reason works and the exact protocol to resume a paused turn instead of ending it.
8. **Checkpoints & worktrees in a coding host** — how Claude Code checkpoints/rewind and git-worktree isolation work; data model + UX for restore points in an agentic coding session.

### D. Enterprise & account

9. **Workspace/organization switcher** — multi-org account model, switcher UI, active-org scoping of data, invitations/roles. How Claude Team and ChatGPT workspaces do it.
10. **SCIM directory-sync provisioning** — SCIM 2.0 schema (Users/Groups), push-provisioning flow, deprovisioning, and how it maps to an org/role model.

### E. Connectors / MCP

11. **Connector + MCP management UI and lifecycle** — the full connect/authorize/health/disconnect state machine (a ~9-state MCP lifecycle), **PKCE OAuth** for connectors, a browsable/searchable connector directory, and per-connector tool permissioning. How Claude "Connectors" and MCP servers present to users.
12. **Broad connector catalog via MCP aggregators** — how a product exposes ~40 SaaS connectors (Slack, Notion, Jira, Google, etc.) through MCP: the tradeoffs of an aggregator like **Composio** vs. per-provider native OAuth vs. self-hosted MCP servers; the config/credential surface each requires.

### F. CLI (Claude Code parity)

13. **Claude Code command/skill/hook/tool surface** — the complete, current inventory of Claude Code slash-commands (built-in + skill-shaped), hook events, and agent-callable tools, with each one's purpose, inputs, and behavior. Include `/goal` (persistent goal across turns) semantics and the plan-mode + MCP-resource tool forms.
14. **Headless CLI event contract** — the JSON/NDJSON streaming event schema a headless coding CLI emits (Claude Code `--output-format stream-json` / print mode), and whether/how it should match a web/mobile SSE contract.
15. **Remote handoff** (`/teleport`-style) — architecture for handing a local CLI/desktop session to the cloud or a phone (signaling, transport, security).

### G. Extensions

16. **VS Code AI-coding extension parity** (Claude Code / Codex extension) — the webview chat, MCP-tools-in-IDE management, plugin manager, skills discovery, inline diff/apply, and device-code/OAuth sign-in.
17. **Claude-in-Chrome parity** — the agentic browser extension: **Watch Mode** (sensitive-site pause) and **Takeover Mode** (screenshot suppression), the server-side prompt-injection classifier / safety architecture, connectors/native-messaging bridge, and permissioning.

### H. Voice (roadmap — reference: Wispr Flow, Lemon)

18. **Voice dictation / voice agent** — how Wispr Flow and Lemon deliver low-latency (~700 ms), auto-formatting dictation "in every app": model/serving choices, streaming STT + cleanup, personal dictionary/snippets, and the always-available push-to-talk UX. What a cross-surface voice layer needs.

### I. Small

19. **"Notify me about the stable release" opt-in** — the standard pattern for an alpha app: capture email/consent, store it, confirmation UX, and (optionally) how it differs from a gated waitlist.

## Output

One markdown section per numbered feature, in order, each following the 9-part structure above. Lead each with a 2-sentence TL;DR. At the very end, add a **"Confidence & gaps"** list flagging any feature where public information was thin and you had to infer.
