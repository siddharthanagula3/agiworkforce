# Anthropic Applications Parity TODO

Last updated: 2026-05-20.

This is the active checklist for the transition described in `PLAN.md`. Keep it short enough to operate from daily; move evidence and long analysis to `audit/anthropic-apps-parity/`.

## Active Now

- [x] Create root `PLAN.md` as the current transition control plane.
- [x] Create root `TODO.md` as the active transition checklist.
- [x] Lock AGI Workforce as an OpenAI/Anthropic-style application suite, not just a chat app or CLI.
- [x] Record local-first, explicit BYOK, multi-provider, privacy-controlled managed compute as the core differentiation.
- [x] Add official OpenAI/Anthropic suite research evidence for the locked thesis.
- [x] Add pre-release repo organization plan for folder/file naming, ownership, docs, root cleanup, and team onboarding.
- [x] Add LLM-operability layer so coding agents can find repo maps, risk areas, known flaws, and canonical commands.
- [x] Start parallel exploration tracks for AGI surfaces, local references, and docs organization.
- [x] Add CLI Local/BYOK/Managed privacy mode foundation.
- [x] Add `/privacy-mode` and `/continue-with-byok`.
- [x] Expand CLI slash palette to 83 commands.
- [x] Create `audit/anthropic-apps-parity/` evidence folder.
- [x] Add Anthropic official feature ledger.
- [x] Add AGI surface file inventory.
- [x] Add local reference architecture/license notes.
- [x] Add cross-surface parity matrix with owner paths.
- [x] Update `docs/README.md` to point to `PLAN.md` as the active transition plan.
- [x] Complete full `reference/src` read pass and record coverage in `audit/anthropic-apps-parity/reference-notes.md`.
- [x] Lock chat sync to Web/Mobile/Desktop only.
- [x] Add Anthropic/OpenAI application baseline ledger.
- [x] Add OpenAI/Anthropic/Vercel SDK strategy ledger.
- [x] Add Claude/ChatGPT compute, computer-use, and generated-file architecture ledger.
- [ ] Begin per-file AGI audit ledger by surface, starting with CLI and shared engine files.
- [x] Lock the long-term agent-native development thesis for AGI Workforce.

## Exploration Tasks

- [ ] CLI: audit `apps/cli/src` end to end for Claude Code parity and engine contracts.
- [ ] Desktop: audit `apps/desktop/src` and `apps/desktop/src-tauri` for Claude Desktop/artifacts/connectors parity.
- [ ] Mobile: audit `apps/mobile` for local-first/BYOK onboarding and Claude Mobile parity.
- [ ] Web: audit `apps/web` for Claude Web/projects/artifacts/account/waitlist parity.
- [ ] VS Code: audit `apps/extension-vscode` for IDE-native Claude Code parity.
- [ ] Chrome: audit `apps/extension` for browser connector/research parity.
- [ ] Shared packages: audit `packages/*` for common contracts that should become source of truth.
- [ ] Rust crates: audit `crates/*` for engine/runtime/protocol contracts.
- [ ] Services: audit `services/*` and `supabase/` for future managed cloud readiness.
- [x] References: audit `reference/src`, `codex-cli`, `claw-code`, `openclaw`, `opencode`, and `gemini-cli` for reusable patterns.
- [x] References: read all 1902 scoped files in `/Users/siddhartha/Desktop/reference/src`.
- [ ] References: verify root/license status for `claw-code` and `reference/src` before any reuse beyond architecture.
- [ ] Evidence: convert targeted AGI surface findings into per-file audit rows.

## Pre-Release Repo Organization Tasks

- [x] Create root file classification ledger.
- [x] Create hidden AI/tool folder ledger for `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.agent`, `.minimax`, `.superpowers`, `.remember`, and `.playwright-mcp`.
- [x] Create docs status ledger: current, superseded, archive, scratch, or generated.
- [x] Create package/service/crate README coverage ledger.
- [x] Create generated artifact policy.
- [x] Create full package/service/crate ownership ledger and CODEOWNERS map.
- [ ] Decide whether root `ios/` belongs at root or under `apps/mobile/ios`.
- [ ] Decide whether `reference-index/` belongs under `audit/`, `docs/reference/`, or `_archive/`.
- [ ] Move root scratch markdown files to a dated archive/report folder.
- [ ] Move root scratch image files to a dated report folder.
- [x] Add root clutter allowlist check.
- [x] Add docs status header check for active plans.
- [x] Add import-boundary lint so apps cannot import apps, services cannot import UI packages, and packages cannot import apps.
- [x] Add canonical `docs/agent-context/` with repo map, risk map, command map, doc-status map, bug-finding guide, and known-flaws ledger.
- [x] Make root `AGENTS.md` the canonical tool-neutral coding-agent entry point.
- [x] Convert `CLAUDE.md` into a Claude-specific mirror of `AGENTS.md`.
- [x] Add `pnpm check:agent-context`, `pnpm check:repo-organization`, `pnpm check:boundaries`, and `pnpm check:llm-operability`.
- [x] Grade current monorepo developer-friendliness and record path to A+.
- [x] Commit repo-organization script fix and monorepo grade report.
- [ ] Add or update README files for each shared package.
- [ ] Add `.github/CODEOWNERS` with real GitHub teams/handles after org ownership names are available.
- [ ] Expand `CONTRIBUTING.md` into a real engineering workflow guide.
- [ ] Add PR templates by change type.
- [ ] Normalize `docs/plans` vs `docs/planning` and archive superseded plans.
- [ ] Create `docs/marketing/`.
- [ ] Create `docs/support/`.
- [ ] Create `docs/legal/`.
- [ ] Execute Web/Mobile/Desktop domain-first moves from `docs/plans/domain-first-reorg.md` after root/docs/package contracts are stable.

## Agent-Native Development Tasks

- [x] Add external and local-reference evidence for agentic development as the expected future workflow.
- [x] Add `PLAN.md` rules for agent-native repo design.
- [ ] Add path-scoped agent rules for high-risk surfaces after root cleanup.
- [x] Add agent task templates for exploration, implementation, review, and verification.
- [ ] Add worktree/session isolation guidance for parallel AGI development.
- [x] Add CI enforcement for docs and LLM-operability checks on docs-only changes.
- [x] Add debt-aware README ownership coverage enforcement for apps, packages, crates, and services.
- [x] Add debt-aware generated artifact drift check.
- [ ] Tighten README ownership check after P0/P1 READMEs are created.
- [ ] Tighten generated artifact check after root scratch and `.playwright-mcp` debt are moved.

## CLI Engine Tasks

- [x] Claude-style tool alias canonicalization.
- [x] `/add-dir` workspace-root handling.
- [x] `/files` context attachment.
- [x] Claude migration import for prompts/skills/agents/hooks/settings/MCP.
- [x] Shared TUI/REPL Claude-parity dispatcher.
- [x] Local privacy guard before cloud/BYOK sends.
- [ ] Custom slash commands from `.agiworkforce/commands` and imported `.claude/commands`.
- [ ] MCP prompts as dynamic slash commands.
- [ ] Full `/agents` management UI in TUI/REPL.
- [ ] Hook matcher compatibility with Claude tool names.
- [ ] Persist output style and privacy mode in project-local settings.
- [ ] Define typed CLI event stream for future Desktop/Web/Mobile clients.
- [ ] Define durable session/fork/replay contract for parent and child sessions.
- [ ] Split CLI tool declarations from executors with schema, diagnostics, permissions, and owner metadata.
- [ ] Add `agi doctor --json` covering runtime deps, auth, sandbox, MCP, plugins, model access, writable state dirs, stale branches, and transport health.
- [ ] Test that every registered slash command has runtime behavior in both TUI and REPL.

## Cross-Surface Product Tasks

- [ ] Define suite-level product requirements for Web, Desktop, Mobile, CLI, VS Code, and Chrome using the locked application-suite thesis.
- [ ] Define shared `PrivacyMode` contract for Desktop/Mobile/Web/VS Code/Chrome.
- [ ] Add visible Local/BYOK/Managed labels to every surface.
- [ ] Define `ProviderMode`: `Local`, `DirectByok`, `ManagedGateway`, `ManagedNative`.
- [ ] Add provider capability matrix for Responses, Chat Completions, reasoning, tools, native tools, vision, files, structured output, server state, and ZDR compatibility.
- [ ] Define synced app conversation schema for Web/Mobile/Desktop.
- [ ] Define separate developer session schema for CLI/VS Code/Chrome.
- [ ] Define Desktop/local-host remote-control schema for Mobile approvals, notifications, generated-file preview, and task steering.
- [ ] Define explicit developer-session handoff schema into synced app chats.
- [ ] Add Local -> BYOK fork flow on Desktop.
- [ ] Add Local -> BYOK fork flow on Mobile.
- [ ] Add Local -> BYOK fork flow on Web.
- [ ] Add payload preview and secret scan UI before BYOK handoff.
- [ ] Define shared project schema.
- [ ] Define shared artifact schema.
- [ ] Define shared `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` schemas.
- [ ] Define shared `ComputerAction` protocol for screenshot/action computer use.
- [ ] Define connector/MCP registry schema.
- [ ] Define agent/subagent schema.
- [ ] Define cross-surface data ownership for projects, artifacts, memory, teams, and billing.
- [ ] Mount or explicitly disable API gateway `agents` and `mcp` routes.
- [ ] Replace desktop hook stats placeholder with real stats or visible unsupported state.
- [ ] Replace VS Code managed-plan usage stub with real usage-source reporting.
- [ ] Finish Chrome native host installer automation, including Windows.
- [ ] Fix docs drift found by surface audit: CLI MCP transports, desktop onboarding paths, outdated HMAC comments.

## Compute And Generated Artifact Tasks

- [x] Research public Claude and ChatGPT/OpenAI behavior for computer use, code execution, generated files, downloads, and artifact previews.
- [x] Record AGI implementation implications in `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`.
- [ ] Extend shared artifact contracts so artifacts can reference native generated files and preview derivatives.
- [ ] Convert Desktop document creation tools into generated-file manifest producers.
- [ ] Wrap `packages/browser-tool` behind the shared `ComputerAction` protocol.
- [ ] Add local compute-session work directories with manifest, TTL metadata, checksum, and audit events.
- [ ] Add Web/Mobile/Desktop generated-file request, status, preview, download, share, source session, and privacy-label UI.
- [ ] Add Mobile generated-file delegation path to Desktop/local host or future Managed compute instead of requiring local on-device heavy generation.
- [ ] Add provider-container adapter for OpenAI Code Interpreter-style generated file annotations.
- [ ] Add Local-mode tests proving generated files are not uploaded.
- [ ] Add BYOK-mode tests proving file transfer requires explicit preview and approval.
- [ ] Add Managed-mode tests for TTL, quota, owner, checksum, retention, and deletion metadata.

## Provider SDK Tasks

- [x] Research current OpenAI official SDK, OpenAI Responses, OpenAI Agents SDK, Vercel AI SDK, and Vercel AI Gateway guidance.
- [x] Record decision that SDKs are adapter/UI-edge dependencies, not AGI runtime architecture.
- [ ] Make `packages/providers/openai` prefer Responses for native OpenAI endpoints when capability metadata supports it.
- [ ] Keep Chat Completions fallback for OpenAI-compatible providers and legacy proxy surfaces.
- [ ] Add tests proving OpenAI `store: false` remains default for Local/BYOK turns.
- [ ] Add tests proving Vercel AI Gateway is unreachable unless provider mode is explicitly Managed.
- [ ] Add Web AI SDK event-to-AGI-event adapter.
- [ ] Consolidate `openai`, `@anthropic-ai/sdk`, `ai`, and `@ai-sdk/*` versions after adapter tests exist.

## Cloud Later

- [ ] Keep managed cloud waitlisted/private beta.
- [ ] Design usage ledger and provider-price table.
- [ ] Design quota reservation/settlement.
- [ ] Design chargeback/refund/dispute handling.
- [ ] Prefer invoice/ACH for enterprise managed credits.
- [ ] Revisit Stripe/card top-ups only after fraud and margin model is finished.

## Documentation Rules

- [x] `PLAN.md` is the current strategy.
- [x] `TODO.md` is the current work queue.
- [x] `CHANGELOG.md` records each completed implementation/exploration slice.
- [x] `docs/` stores durable specs and surface guides.
- [x] `tasks/` stores execution logs and historical working notes.
- [x] `audit/` stores evidence ledgers and generated inventories.
- [ ] Archive superseded plans instead of adding new competing plans.
