# Anthropic Applications Parity TODO

Status: Current
Owner: Platform lead
Last updated: 2026-05-21.

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
- [x] Consolidate current docs into compact `docs/current/` source-of-truth layer.
- [x] Archive former top-level PRD, roadmap, pricing, architecture, scaling, handoff, and strategy docs under `docs/archive/2026-05-21-docs-consolidation/`.
- [x] Replace the oversized root `AGI_WORKFORCE.md` with an LLM-readable current entry point and archive the legacy long version.
- [x] Lock naming conventions for product names, CLI command names, root control docs, file/folder names, package/crate names, branches, commits, versions, and release artifacts.
- [x] Make `agi` the primary CLI command while keeping `agiworkforce` as the compatibility alias.
- [x] Add Husky hook policy and `pnpm check:hooks` so commit, pre-commit, and pre-push gates stay wired.
- [x] Move the living audit fire log from root `AUDIT_LOG.md` to `audit/audit-log.md`.
- [x] Remove stale root/mobile Expo `app.json` files and enforce `apps/mobile/app.config.js` as canonical.
- [ ] Begin per-file AGI audit ledger by surface, starting with CLI and shared engine files.
- [x] Lock the long-term agent-native development thesis for AGI Workforce.
- [x] Implement first enterprise control-plane wave: shared contracts, canonical migrations, API gateway routes, Web admin readiness page, docs, and provisional CODEOWNERS.

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
- [x] Decide root `ios/` belongs at root for tracked Xcode-consumed output, with `apps/mobile/native/ios` for custom native modules.
- [x] Move raw `reference-index/` under `audit/repo-organization/reference-index/` as historical evidence.
- [x] Move root scratch markdown files to a dated archive/report folder.
- [x] Move root scratch image files to a dated report folder.
- [x] Move root `downloads/` scratch artifact to the dated archive/report folder.
- [x] Move root reference catalog markdown files to `docs/reference/`.
- [x] Move historical root master plan and implementation log to `docs/archive/`.
- [x] Untrack local-only generated files while leaving them on disk for the current machine.
- [x] Add root clutter allowlist check.
- [x] Add docs status header check for active plans.
- [x] Add import-boundary lint so apps cannot import apps, services cannot import UI packages, and packages cannot import apps.
- [x] Add locked naming convention doc and enforce the primary `agi` CLI command in structure checks.
- [x] Add hook wiring guardrail to `pnpm check:llm-operability`.
- [x] Add canonical `docs/agent-context/` with repo map, risk map, command map, doc-status map, bug-finding guide, and known-flaws ledger.
- [x] Make root `AGENTS.md` the canonical tool-neutral coding-agent entry point.
- [x] Convert `CLAUDE.md` into a Claude-specific mirror of `AGENTS.md`.
- [x] Add `pnpm check:agent-context`, `pnpm check:repo-organization`, `pnpm check:boundaries`, and `pnpm check:llm-operability`.
- [x] Grade current monorepo developer-friendliness and record path to A+.
- [x] Commit repo-organization script fix and monorepo grade report.
- [x] Add or update README files for each shared package.
- [x] Add P0/P1 README ownership files for Web, Desktop, Chrome extension, API gateway, signaling server, types, runtime, providers, and unified-chat.
- [x] Add provisional `.github/CODEOWNERS` routed to founder/platform ownership.
- [ ] Replace provisional `.github/CODEOWNERS` owner with real GitHub teams/handles after org ownership names are available.
- [x] Make `apps/web/features` the canonical Web product-domain root and remove the remaining `apps/web/src/features` split.
- [x] Add `pnpm check:structure-conventions` for Web feature-root, retired docs folder, and backslash-path naming drift.
- [x] Expand `CONTRIBUTING.md` into a real engineering workflow guide.
- [x] Add PR templates by change type.
- [x] Normalize `docs/plans` vs `docs/planning` and archive superseded plans.
- [x] Create `docs/marketing/`.
- [x] Create `docs/support/`.
- [x] Create `docs/legal/`.
- [x] Execute the Web `src/features` -> `features` consolidation from `docs/plans/domain-first-reorg.md`.
- [x] Complete the Mobile waitlist pilot cleanup by migrating callers to `apps/mobile/src/features/waitlist` and removing old waitlist barrels.
- [x] Start the Mobile projects domain by moving `ProjectCard` into `apps/mobile/src/features/projects`.
- [x] Start the Mobile billing domain by moving `UpsellCard` into `apps/mobile/src/features/billing`.
- [x] Move the Mobile schedules domain into `apps/mobile/src/features/schedules` and remove old schedule component/service/store paths.
- [x] Require ownership READMEs for every top-level Web, Mobile, and Desktop feature folder.
- [x] Remove the duplicate CLI release workflow and enforce the canonical `release-cli.yml` / stable `v-cli-*` artifact contract.
- [x] Freeze legacy `apps/web/supabase/migrations` with `pnpm check:supabase-migrations` so new migrations can only land in root `supabase/migrations`.
- [x] Add report-retention READMEs and `pnpm check:report-retention` for `reports/` and `audit/reports/`.
- [x] Add `pnpm check:ci-guardrails` for the CI baseline and explicit Semgrep advisory debt.
- [x] Add `pnpm check:codeowners` for provisional CODEOWNERS coverage before real GitHub teams exist.
- [x] Move the Mobile billing service into `apps/mobile/src/features/billing`.
- [x] Move the first Desktop small-domain wave into `apps/desktop/src/features`: quick query, voice, simple mode, subscription, pricing, planning, reminders, messaging, mobile companion, teams, terminal, tools, vision, and workflows.
- [x] Move Mobile component-heavy domains into `apps/mobile/src/features`: agents, auth, chat, companion, connectors, drawer, edge cases, image, integrations, messaging, model picker, onboarding, paywall, settings, sidebar, and voice.
- [x] Move Mobile voice and messaging services/state into their feature domains and guard the old service/store paths.
- [x] Move Mobile model-picker state, model catalog service, and provider-switch guard into `apps/mobile/src/features/model-picker`.
- [x] Move Mobile project state into `apps/mobile/src/features/projects`.
- [x] Move Mobile integration state and device/HealthKit integration services into `apps/mobile/src/features/integrations`.
- [x] Move Mobile image generation, OCR, and vision services into `apps/mobile/src/features/image`.
- [x] Move Mobile auth state, age gate, and biometric gate into `apps/mobile/src/features/auth`.
- [x] Move Mobile subscription tier state into `apps/mobile/src/features/billing`.
- [x] Move Mobile memory state, import, context budgeting, compaction, and RAG services into `apps/mobile/src/features/memory`.
- [x] Move Mobile skills catalog service and installed-skill state into `apps/mobile/src/features/skills`.
- [x] Move Desktop Settings and MCP domains into `apps/desktop/src/features/settings` and `apps/desktop/src/features/mcp`.
- [x] Move Desktop Unified Agentic Chat into `apps/desktop/src/features/chat`.
- [x] Move Desktop execution, execution sidecar, memory, memory panel, and tool-calling domains into `apps/desktop/src/features`.
- [x] Move Desktop artifacts, browser, canvas, computer-use, connectors, marketplace, research, and skill-marketplace domains into `apps/desktop/src/features`.
- [x] Complete the Desktop component-domain migration: `apps/desktop/src/components` now contains only shared UI primitives.
- [ ] Continue Mobile domain ownership by moving remaining feature-specific hooks/services/stores out of layer-first roots when a domain has a clear owner.
- [x] Execute Desktop component-domain moves into `apps/desktop/src/features` from `docs/plans/domain-first-reorg.md`.

## Agent-Native Development Tasks

- [x] Add external and local-reference evidence for agentic development as the expected future workflow.
- [x] Add `PLAN.md` rules for agent-native repo design.
- [x] Add path-scoped agent rules for high-risk surfaces after root cleanup.
- [x] Add agent task templates for exploration, implementation, review, and verification.
- [x] Add worktree/session isolation guidance for parallel AGI development.
- [x] Add CI enforcement for docs and LLM-operability checks on docs-only changes.
- [x] Add debt-aware README ownership coverage enforcement for apps, packages, crates, and services.
- [x] Add debt-aware generated artifact drift check.
- [x] Tighten README ownership check after README coverage is created.
- [x] Tighten generated artifact check after root scratch and `.playwright-mcp` debt are moved.
- [x] Tighten current-doc metadata check after adding required status headers.
- [x] Add machine-readable parallel-agent lane map for 15+ writer agents.
- [x] Add shared-file collision policy for manifests, locks, root docs, CI, schemas, migrations, and native projects.
- [x] Add `pnpm check:lane-ownership` and include it in `pnpm check:llm-operability`.
- [x] Add parallel-agent PR template and playbook.
- [x] Add autonomous feedback-to-patch software-company roadmap.
- [x] Add 100 delegated research prompts for the agentic company operating model.

## Autonomous Company Tasks

- [x] Document the long-term feedback -> triage -> issue -> agent patch -> PR -> release -> customer update loop.
- [x] Define canonical customer feedback schema and persistence tables.
- [ ] Add support intake API shared by Web/Desktop/Mobile.
- [ ] Add message-level feedback persistence for app chat surfaces.
- [ ] Build feedback-to-GitHub issue bridge with dedupe, severity, owner lane, and privacy scrub.
- [ ] Add agent patch queue with lane selection, worktree isolation, evidence bundles, and human approval gates.
- [ ] Add verification artifact store for screenshots, logs, test output, and reproduction metadata.
- [x] Add release-fix links so customer feedback can be closed by release notes and in-app notifications.
- [ ] Evaluate Fin/Zendesk-style support agents, Vapi-style voice intake, and internal runbooks before managed support launch.

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
- [x] Design usage ledger and provider-price table.
- [ ] Design quota reservation/settlement.
- [ ] Design chargeback/refund/dispute handling.
- [x] Prefer invoice/ACH for enterprise managed credits.
- [ ] Revisit Stripe/card top-ups only after fraud and margin model is finished.

## Documentation Rules

- [x] `PLAN.md` is the current strategy.
- [x] `TODO.md` is the current work queue.
- [x] `CHANGELOG.md` records each completed implementation/exploration slice.
- [x] `docs/` stores durable specs and surface guides.
- [x] `tasks/` stores execution logs and historical working notes.
- [x] `audit/` stores evidence ledgers and generated inventories.
- [x] Archive superseded top-level docs instead of adding new competing docs.
- [ ] Continue moving any newly discovered stale historical docs to archive or updating them to point at `docs/current/`.
