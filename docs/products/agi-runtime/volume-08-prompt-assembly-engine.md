# AGI Runtime — Volume 08 — Prompt Assembly Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `services/AGENTS.md` (nearest scoped runtime AGENTS.md), and grounded in real repo paths: `crates/agiworkforce-protocol/src/prompts/base_instructions/default.md`, `crates/agiworkforce-protocol/src/custom_prompts.rs`, `crates/agiworkforce-protocol/src/config_types.rs`, `crates/agiworkforce-protocol/src/dynamic_tools.rs`, `crates/agiworkforce-protocol/src/tool_name.rs`, `crates/agiworkforce-protocol/src/plan_tool.rs`, `crates/agiworkforce-protocol/src/memory_citation.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-utils-string/src/truncate.rs`, `packages/client/client-runtime/src/context/agentContext.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

The Prompt Assembly Engine is the internal runtime service that turns a turn request into the exact instruction + tool + context payload sent to a provider. It lives in AGI Runtime — not a user surface, not a seventh app — and is compiled into the surfaces that host a session (Desktop, CLI, VS Code today) or invoked through the Managed-Cloud gateway (Web/Mobile Cloud chats).

Trust mode is the dominant constraint. Assembly is **per-trust-mode and never blended.** A Local session assembles instructions and tools on-device and sends them only to the local runtime; a BYOK session (Desktop/CLI/VS Code only) assembles for the user's direct provider call; a Managed-Cloud session assembles for the AGI gateway. The engine must never fold Local project instructions, file excerpts, or tool outputs into a BYOK or Cloud payload without the explicit Local→BYOK fork (context selection, secret scan, payload preview, visible provider label, consent). Cross-surface handoffs (CLI/VS Code/Chrome → app chat) are explicit and redacted, never automatic. Model IDs used to size or route the assembled prompt come **only** from `packages/contracts/types/src/models.json` — never invented, never hardcoded — resolved through `AgentContext.activeModelId` (`packages/client/client-runtime/src/context/agentContext.ts`, which documents the field as "resolved from models.json").

Today, real assembly is CLI/Rust-first (the app-server tool host is "consumed ONLY by the CLI"). A unified cross-surface engine is the TARGET; every gap below is labeled.

## System Prompt Assembly — construct runtime instructions

The base runtime instructions exist as a real, versioned document: `crates/agiworkforce-protocol/src/prompts/base_instructions/default.md` (277 lines) with structured sections — personality, AGENTS.md spec, responsiveness/preamble, planning, task execution, validation, tool guidelines. **✅ Built** for the CLI runtime.

Requirements: the assembled system prompt is base instructions + sandbox/approval posture + resolved model capabilities (from `models.json`) + surface identity, composed in a fixed, testable order. It must state the active trust mode and provider label verbatim. The `default.md` filename implies a variant selector (per-surface/per-mode base documents); a surface-aware selector and a Managed-Cloud gateway equivalent are **🔭 Planned** — only the CLI default document ships today.

## Project Instructions — project-level guidance

Two real mechanisms exist. First, the AGENTS.md contract is specified in the base instructions themselves: nearest-scoped `AGENTS.md` wins, root/CWD-chain files are folded into the developer message, deeper files take precedence — **✅ Built** as a documented protocol (`base_instructions/default.md`, "AGENTS.md spec" section). Second, `developer_instructions` is a first-class settings field with set/clear/keep semantics (`crates/agiworkforce-protocol/src/config_types.rs`) — **✅ Built** as plumbing.

Requirements: project instructions layer above user instructions and below direct turn instructions; they are workspace/task-scoped and never sync (CLI/VS Code/Chrome stay local per canon). A structured Project-record → prompt binding (`crates/agiworkforce-protocol/src/projects.rs` mirrors `ProjectRecord`) that injects per-project guidance into Cloud app chats is **🔭 Planned**; the wiring from a `ProjectRecord` to the assembled prompt is not yet built.

## User Instructions — user preferences

Custom user prompts load from disk with a real loader: `CustomPrompt { name, path, content, description, argument_hint }`, `$PLACEHOLDER` substitution, and the `/prompts:<name>` slash prefix (`crates/agiworkforce-protocol/src/custom_prompts.rs`, `PROMPTS_CMD_PREFIX = "prompts"`, sourced from `~/.agiworkforce/prompts/`). **✅ Built.**

Requirements: user preferences (tone, output format, standing instructions) are the lowest-precedence instruction layer and are overridden by project and turn instructions. Placeholder expansion must be injection-safe — untrusted argument text is data, never re-interpreted as instructions. A synced, allowlist-gated user-preference layer that follows the Neon settings path is **🔭 Planned** and, per canon, settings sync lands last.

## Tool Definitions — available tools

Tools are described by `DynamicToolSpec { namespace, name, description, input_schema, defer_loading }` (`crates/agiworkforce-protocol/src/dynamic_tools.rs`) and named through `ToolName` with the `mcp__{server}__{name}` namespace split (`crates/agiworkforce-protocol/src/tool_name.rs`). The host exposes them via the `ToolDispatch` trait — `tools/list` returns MCP-style `{name, description, inputSchema}`, `tools/call` dispatches — over JSON-RPC/WebSocket in `crates/agiworkforce-app-server/src/lib.rs`. `update_plan` is a concrete built-in (`crates/agiworkforce-protocol/src/plan_tool.rs`). **✅ Built** for the CLI host.

Requirements: the tool block is assembled from the dispatch catalog filtered by trust mode and surface capability (e.g., no host-filesystem tools in a Web Cloud chat). `defer_loading` must gate large/rarely-used specs out of the initial prompt. Tool availability must match the surface trust matrix; a unified cross-surface tool-manifest resolver is **🔭 Planned** (the app-server host is CLI-only today).

## Context Ordering — optimize prompt order

Deterministic layering is required: base system → project (AGENTS.md/developer) → user preferences → tool definitions → curated memory/citations → conversation history → current turn. Memory injection has a real carrier — `MemoryCitation { entries[{path, line_start, line_end, note}], rollout_ids }` (`crates/agiworkforce-protocol/src/memory_citation.rs`) — so retrieved context is attributable. **🟡 Partial**: the citation data structure is built, but a single ordering policy enforced across all six surfaces is not — CLI assembly and the Cloud gateway order independently today. A shared, testable ordering contract is **🔭 Planned**.

## Token Optimization — maximize effective context usage

A real budget primitive ships: `truncate_middle_with_token_budget` and `truncate_middle_chars` with `APPROX_BYTES_PER_TOKEN = 4`, preserving prefix/suffix on UTF-8 boundaries and reporting the original token count when truncation occurs (`crates/agiworkforce-utils-string/src/truncate.rs`). **✅ Built** for output/segment truncation.

Requirements: the engine sizes the assembled prompt to the active model's real context window (from `models.json`), truncating lowest-priority layers first (old history, verbose tool output) while never dropping system/trust-boundary or safety instructions. `defer_loading` tool specs and citation-based memory (pointers, not full dumps) are the primary levers. A model-window-aware assembly budgeter that composes truncation + deferral + memory selection into one pass is **🔭 Planned**; today truncation is applied piecewise, not as a whole-prompt budget.

## Repository map

- `crates/agiworkforce-protocol/src/prompts/base_instructions/default.md` — base system instructions.
- `crates/agiworkforce-protocol/src/custom_prompts.rs` — user custom-prompt loader + `/prompts:` commands.
- `crates/agiworkforce-protocol/src/config_types.rs` — `developer_instructions` settings field.
- `crates/agiworkforce-protocol/src/projects.rs` — `ProjectRecord` mirror (project binding, 🔭).
- `crates/agiworkforce-protocol/src/dynamic_tools.rs`, `tool_name.rs`, `plan_tool.rs` — tool specs, namespacing, built-in plan tool.
- `crates/agiworkforce-protocol/src/memory_citation.rs` — attributable memory carrier.
- `crates/agiworkforce-app-server/src/lib.rs` — `ToolDispatch` host, `tools/list`/`tools/call` (CLI-only).
- `crates/agiworkforce-utils-string/src/truncate.rs` — token-budget truncation.
- `packages/client/client-runtime/src/context/agentContext.ts` — per-command context; `activeModelId` from `models.json`.

## Competitor notes

Claude Code, ChatGPT, and Codex each assemble a single-provider system prompt + tool schema + context window server-side, with hosted memory and proprietary tool sets. AGI's deliberate divergence: assembly is **multi-provider** (model IDs from `models.json`, provider chosen by trust mode), **per-surface and per-trust-mode** (Local/BYOK/Cloud never blended; BYOK only on Desktop/CLI/VS Code), and **local-first** — Local sessions assemble and run entirely on the host, mirroring Claude Code Remote Control / Codex "nothing moves to the cloud." Where a competitor silently unifies context across devices, AGI requires explicit, redacted handoff and consent-gated Local→BYOK forks. Tool naming reuses the interoperable `mcp__{server}__{name}` convention rather than a closed schema.

## Acceptance / Definition of Done

Production-ready when: assembly is deterministic and unit-testable given (model, trust mode, surface); the system prompt always carries the correct trust-mode and provider label; instruction precedence (turn > project > user > base) is enforced by tests; tool blocks are trust-filtered with `defer_loading` honored; the prompt is sized to the real model window without dropping safety/boundary layers; and no assembled payload crosses a trust boundary without the fork gate.

- [ ] Build: golden-file tests pin base + project + user + tool ordering; `defer_loading` verified; truncation reports original token counts.
- [ ] Trust: Local assembly proven never to emit BYOK/Cloud identity; Local→BYOK fork enforces context-selection + secret-scan + payload-preview + provider label + consent; no cross-surface auto-injection.
- [ ] Security: `$PLACEHOLDER`/argument text treated as data (no prompt injection); memory injected as citations, not raw secrets; model IDs resolved from `models.json` only.

## Anti-patterns

- Blending trust modes: folding Local project/user instructions or tool output into a BYOK or Cloud payload without the explicit fork.
- Hardcoding or inventing a model ID, context-window size, route, env var, or command instead of reading `models.json` / `AgentContext.activeModelId`.
- Claiming a unified cross-surface assembler, project→prompt binding, or synced preferences as shipped — they are 🔭; the app-server host is CLI-only.
- Dropping system, trust-boundary, or safety instructions to fit a token budget (truncate history/tool output first).
- Auto-syncing CLI/VS Code/Chrome context into app chat, or syncing Local/BYOK instruction rows through Neon.
- Referencing removed tiers (Plus/Hobby/pro_plus), inventing Pro/Max INR prices, adding credit top-ups, or referencing Supabase. Stack is Clerk + Neon + Stripe; Next.js uses `proxy.ts`.
