# 9. Reverse-Engineering Notes — Mapping to ChatGPT/Claude

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-10

The product goal (master plan) is to make the six surfaces behave as closely as possible to the *current* ChatGPT and Claude apps, **for features that already exist in the repo** — no new speculative features, just make existing ones production-ready. Claude reference images are the primary UI reference. This file maps AGI's architecture onto the competitor patterns it reverse-engineers, and states what is at parity vs in progress. Parity status is a moving target — the authoritative, per-row status is `docs/current/parity-implementation-matrix.md`; this file summarizes and cites it.

## 9.1 Primary reverse-engineering sources

- `docs/research/claudeai-component-spec-2026-07-10.md` — component-for-component claude.ai spec (128 reference screenshots + a live signed-in claude.ai crawl). Includes a contamination warning: some screenshots show Perplexity Comet browser UI overlaid on claude.ai — do not copy "Open in Comet"/"Ask Gemini" chrome.
- `docs/research/claude-live-audit-2026-07-09.md`, `web-live-audit-2026-07-10.md`, `web-visual-gaps-2026-07-09.md` — live audits of the running apps.
- `docs/research/competitor-changelogs-2026-07-09.md` — sourced competitor release notes.
- Reference libraries: `/Users/siddhartha/Desktop/reference/` (400+ competitor screenshots), `/Users/siddhartha/Desktop/claude_reference/`.

**Method:** official docs win for feature existence/naming; local reference screenshots win for UI/IA. Never copy proprietary source/screenshots/layouts exactly — the references define AGI-owned parity requirements, implemented in shared packages.

## 9.2 How AGI maps to the competitor shapes

| Competitor pattern | AGI analog | Where it lives |
| ------------------ | ---------- | -------------- |
| ChatGPT/Claude single chat (files + tools + artifacts in one thread) | "One chat, not split file-chat vs normal-chat" (locked rule) | `unified-chat`, web `features/chat`, desktop `features/v3` |
| Claude artifacts side panel | artifact workbench sidecar + cards + `Download all` | `packages/stores` artifact store, `unified-chat`, `apps/sandbox` |
| ChatGPT/Claude model switcher + effort/thinking | capability-gated model picker (latest + Effort/More flyouts) | `unified-chat` `modelStore`, `packages/types` catalog |
| ChatGPT plus-menu / Claude add-menu | composer `+` plus-menu (files/tools/connectors/skills) | composer (in flight) |
| Claude/ChatGPT connectors + MCP | connector gallery + custom remote MCP + local stdio MCP | desktop `features/connectors`, `packages/mcp`, `agiworkforce-mcp` crate |
| Claude Code / Codex CLI (slash, hooks, subagents, sessions) | CLI REPL/TUI + shared Rust engine crates | `apps/cli`, `crates/agiworkforce-*` |
| Claude in Chrome (multi-tab, native nav) | Chrome extension side panel + native bridge | `apps/extension` |
| ChatGPT Work / Claude Cowork (async agent) | Cowork/Dispatch surface | desktop Cowork pages (Partial; `DesktopShellV3` placeholder for cowork/code) |
| ChatGPT Canvas | editable writing/code canvas | Partial/Missing per surface |
| Server-side sandbox (code interpreter) | E2B cloud sandbox; on-device sandbox for Local | `apps/web/lib/e2b/*`, `execpolicy`/`sandbox-policy` crates |

The **differentiators AGI adds** on top of the competitor shape (not reverse-engineered — AGI-owned): Local-first privacy, explicit BYOK (no markup), multi-provider routing, and the three-boundary trust model. Competitors route internally and silently; AGI makes routing explicit and never crosses a trust boundary without consent.

## 9.3 Parity status snapshot (cite the matrix for current truth)

Broad status from `docs/current/parity-implementation-matrix.md` (labels: Present/Partial/Missing/Gated):

**Closest to parity / strongest:**
- Desktop chat mode (Local/BYOK) — "strongest current desktop area."
- CLI privacy modes (`Present/Partial`), hooks (strong — coverage check passes).
- Provider/streaming path — one shared adapter layer, byte-stable v1 wire (this doc set areas 3–4).
- Managed cloud — public alpha, open by default (Web + Mobile).

**In progress (Partial):**
- Composer/chat shell claude.ai parity (web), model picker, message actions, artifact viewer parity.
- Streaming lifecycle unification (queued/running/tool_wait/completed/interrupted/failed) — landed: artifact live-stream + tool audit trail; to do: shared status enum + persisted interrupt/cancel/continue.
- Web search (Perplexity path exists; live audit found it non-functional, being fixed), citations, projects/project-memory, connectors, settings IA, billing/usage surfaces.

**Missing / Gated:**
- Deep research (Partial/Missing), visual design workspace + AI-powered artifacts (Missing/Gated), import-memory-from-other-providers (Missing), desktop Cloud mode ("coming soon" — DCL-1…4), enterprise sharing/admin (Gated).

## 9.4 Competitor deltas to fold in (verified 2026-07-09/10)

From `docs/current/parity-implementation-matrix.md` §"Competitor Deltas":

- **ChatGPT "Work"** (2026-07-09) — third agent mode beside Chat/Codex; nearest AGI analog is Cowork/Dispatch. Codex merged into one ChatGPT desktop app (Chat + Work + Codex modes) — validates AGI's single-window philosophy.
- **GPT-5.6 GA** (Sol/Terra/Luna tiers) replacing mini/nano — `models.json` tops out at gpt-5.5; exact API IDs pending primary-source verification before any catalog change (SSOT rule).
- **Claude in Chrome GA** (2026-07-01, all paid plans, multi-tab, native nav) — raises the Chrome-extension bar above the old "preview" target.
- **Claude Cowork on web + mobile** (2026-07-07) — both vendors converged on async-agent-with-cross-device-review; affects Dispatch/Cowork rows.
- **Claude Trusted Devices** (remote control of Claude Code from another device) — relevant to AGI remote-control spec.

Link-rot caveats: Anthropic docs soft-redirect to `platform.claude.com`; ChatGPT release notes 403 direct fetches — verify via cache/alternate hosts and mark UNVERIFIED when only cache-sourced.

## 9.5 What's fully documented vs flagged

- The mapping of AGI architecture onto ChatGPT/Claude patterns and the reverse-engineering method: **fully documented**.
- Per-feature parity status: **a moving target** — this file summarizes; `parity-implementation-matrix.md` + `known-flaws.md` are authoritative and should be re-read before treating any status as current.
