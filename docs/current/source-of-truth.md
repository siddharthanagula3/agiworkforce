# Source Of Truth

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-06

This is the compact source of truth for what AGI is, what v1 means, where the repo stands today, and how agents should avoid stale-doc hallucination.

For feature-by-feature, option-by-option implementation detail, use `docs/current/parity-implementation-matrix.md`.

For BYOK providers, hosted open-model APIs, open-weight model priorities, and Desktop model-selector rules, use `docs/current/byok-open-model-provider-strategy.md`.

For the long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements, use `docs/current/agi-product-requirements.md`.

## Product Definition

AGI is the public product brand. AGI Workforce is the formal platform and repo name.

AGI is a leading AI application suite across six first-class surfaces:

- Mobile
- Web
- Desktop
- CLI
- Chrome extension
- VS Code extension

The v1 product target is practical parity with current leading AI application ecosystems, with one major differentiation: users can choose Local models, Bring Your Own Key provider access, or AGI managed cloud (public alpha, open by default) instead of being locked into one model lab.

Parity means user-capability parity and workflow parity, not copying proprietary code, private assets, or protected branding. Claude and ChatGPT are competitive references; AGI must implement its own design system, names, contracts, providers, and trust-boundary UX.

## Launch Lock

Public v1 launches with:

- Local Mode: local-first chat and local tools where technically available.
- BYOK Mode: direct user-owned provider keys with explicit provider labels.
- Multi-provider model selection: model IDs and capability metadata come from `packages/types/src/models.json`.
- One normal chat surface that can also work with selected files, reference files, project context, generated files, artifacts, tools, connectors, and images.

Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta launch gate has been removed.

Development is serial by surface:

1. Mobile
2. Website
3. Desktop
4. CLI
5. Chrome Extension
6. VS Code Extension

The active surface is Mobile. Mobile v1 is not considered done until it is publicly released on the App Store. Website work does not normally begin before that release. During Mobile QA, testing, App Store review, or other manual waiting periods, next-surface work can start only when the founder explicitly asks for it.

The parity ledger may track all six surfaces at all times, but tracking is not authorization to implement non-active surfaces.

Managed Cloud is in public alpha and open by default (founder decision, 2026-06-27). The private-beta/waitlist launch gate has been removed; signed-in users can use managed compute. The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. The following controls must keep pace with public usage, but they no longer gate access:

- metering and usage ledgering,
- provider price/cost snapshots,
- quota and monthly spend controls,
- abuse and fraud controls,
- refund and chargeback policy,
- retention and deletion controls,
- provider terms review,
- support and audit workflows.

## Trust Modes

| User mode     | Internal mode                                         | Product meaning                                     | Non-negotiable rule                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local         | `local_only` / `Local`                                | Runs locally or through local host/runtime.         | Never silently routes chats, files, tools, or developer sessions to BYOK or managed cloud.                                                                                                                            |
| BYOK          | `byok` / `DirectByok`                                 | Uses the user's provider key directly.              | Local to BYOK is an explicit fork with context selection, secret scan, payload preview, visible provider label, and consent.                                                                                          |
| Managed Cloud | `cloud_managed` / `ManagedGateway` or `ManagedNative` | Uses AGI-managed provider access or hosted compute. | Public alpha, open by default. Commercial, abuse, retention, deletion, and provider-term controls must keep pace but no longer gate access. Still a distinct trust boundary: never silently route Local/BYOK into it. |

The original Local thread remains Local forever. A BYOK continuation is a new reviewed branch, not a hidden mode flip.

## Surface Roles

| Surface | Role                                                                                                                                                                        | Sync boundary                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web     | Account, projects, synced app chats, artifacts, billing/waitlist, admin, web routes. Web chat is subscription-backed through Neon/account state; Web does not expose BYOK.  | Normal app chat sync allowed.                                                                                                                                                                                      |
| Desktop | Local-private compute host, rich app shell, local files, MCP/connectors, artifacts, computer/browser use, native host for Chrome/Mobile/CLI bridges.                        | Normal app chat sync allowed for app chats; local files stay local unless explicitly transferred.                                                                                                                  |
| Mobile  | Small on-device Local LLM chat, continuity, approvals, preview/share, and public-alpha Cloud chat for signed-in users (no invite/waitlist). Mobile v1 does not expose BYOK. | Cloud app chat sync is allowed only for signed-in entitled Cloud chats. Local Mode chats, memory, projects, files, profile, and personalization stay local unless the user explicitly chooses a reviewed transfer. |
| CLI     | Developer agent and terminal engine.                                                                                                                                        | Workspace/session scoped; no automatic sync into app chats.                                                                                                                                                        |
| VS Code | IDE-native developer assistant.                                                                                                                                             | Workspace scoped; handoff to app chat must be explicit and redacted.                                                                                                                                               |
| Chrome  | Browser context, page capture/action approvals, native messaging.                                                                                                           | Page data is task scoped; no default global chat memory sync.                                                                                                                                                      |

## Competitive Baseline

As of May 28, 2026, AGI's parity target is source-backed by official product docs plus the local Claude reference folder at `/Users/siddhartha/Desktop/claude_reference`.

OpenAI/ChatGPT baseline:

- ChatGPT core includes conversation, context adaptation, model choice on paid plans, web search, deep research, image input/generation/editing, file uploads, data analysis, voice, Canvas, memory, projects, scheduled tasks, custom GPTs, and GPT Store.
- ChatGPT apps/connectors support interactive app experiences, search, deep research, sync, and write actions with confirmations/admin controls.
- ChatGPT projects group chats, files, sources, instructions, app links, and project memory.
- ChatGPT desktop has a macOS Chat Bar with keyboard shortcut, file/photo/screenshot attach, voice, model/action controls, and direct conversation start.
- OpenAI Codex spans app, CLI, IDE extension, web, GitHub/Slack/Linear integrations, Chrome extension, computer use, appshots, automations, worktrees, skills, plugins, artifacts, and sidebar/task summaries.

Anthropic/Claude baseline:

- Claude web/desktop includes chat, projects, artifacts, artifacts sidebar, artifact editing/versioning/export, AI-powered artifacts, artifact MCP, artifact storage, connectors/MCP, personalization, settings, and account/team controls.
- Local Claude reference evidence, not public official documentation, includes
  visual canvas, artboard, prototype, and deck workflow patterns. AGI maps this
  to an AGI-owned visual artifact/design workspace requirement, not to a
  separate seventh surface and not to copied Claude assets or product naming.
- Claude Desktop is a native app surface for Claude chat and Claude Code/Cowork-style workflows.
- Claude Code is available in terminal, IDE, desktop app, and browser; it reads codebases, edits files, runs commands, uses MCP, supports instructions/skills/hooks, and has permission controls.
- Claude Code IDE integration supports VS Code, Cursor, Windsurf, and JetBrains-style workflows, editor context, diagnostics, diff viewing, file references, and quick launch.
- Claude in Chrome is a browser-control extension with explicit permissions and prompt-injection defenses.

Official sources used for the current baseline:

- OpenAI ChatGPT capabilities: https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview
- OpenAI ChatGPT apps/connectors: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- OpenAI ChatGPT projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- OpenAI ChatGPT apps with sync: https://help.openai.com/en/articles/10847137
- OpenAI ChatGPT macOS Chat Bar: https://help.openai.com/en/articles/9295241-accessing-the-launcher-chatgpt-macos-app
- OpenAI Codex app/docs: https://developers.openai.com/codex/app
- OpenAI Codex CLI features: https://developers.openai.com/codex/cli/features
- OpenAI Codex IDE extension: https://developers.openai.com/codex/ide
- Anthropic Claude Desktop install: https://support.anthropic.com/en/articles/10065433-installing-claude-for-desktop
- Anthropic Claude projects: https://support.anthropic.com/en/articles/9517075-what-are-projects
- Anthropic Claude artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Anthropic Claude Code overview: https://docs.anthropic.com/en/docs/claude-code/overview
- Anthropic Claude Code IDE integrations: https://docs.anthropic.com/en/docs/claude-code/ide-integrations
- Anthropic Claude Code slash commands: https://docs.anthropic.com/en/docs/claude-code/slash-commands
- Anthropic Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Anthropic Claude in Chrome: https://www.anthropic.com/news/claude-for-chrome

## UX Lock

The default empty chat state must include:

- central input box,
- plus/add control,
- file attachment control,
- model selector dropdown,
- microphone control,
- send/stop control,
- visible Local/BYOK/Managed status where routing matters.

Desktop must expose:

- Local Mode,
- BYOK Local Mode,
- Cloud Managed (public alpha, open by default) mode.

Desktop sidebar must expose:

- search,
- collapse/expand sidebar icon,
- new chat,
- projects,
- artifacts,
- relevant AGI feature links,
- recent chats,
- account area with initials, name, account/workspace, and feedback affordance.

The account menu must include:

- settings,
- language,
- get help,
- learn more,
- logout.

Settings must converge on these sections:

- General
- Account
- Privacy
- Billing
- Usage
- Capabilities
- Connectors
- AGI Code
- AGI in Chrome
- Extensions
- Developer

General settings must include profile, full name, what AGI should call the user, work description, instructions/preferences, appearance, chat font, voice, voice speed, notifications, response/completion/code settings, code permission requests, emails from AGI Code, web, dispatch, and dispatch messages.

Account settings must include logout all devices, delete account, subscription cancellation warning, organization ID when applicable, active sessions, device, location, created, and updated.

Privacy settings must include location, metadata, help improve AGI, data export, shared chats, memory preferences, reference-chat search, generated memory from chat history, view/manage memory, and import memory from other AI providers.

Capabilities must include tool access mode, connector discovery, visuals, artifacts, AI-powered artifacts, inline visualizations, code execution, file creation, network egress, domain allow list, and skills.

Billing and Usage must include plan, adjust plan, Stripe/payment link, invoices, due date, total, status, action, current session usage, weekly limits, usage credits, monthly spend limit, current balance, and auto reload.

Desktop app settings must include run on startup, quick access shortcut, voice shortcut, menu bar, keep computer awake, browser use, allow all browser actions, computer use, allowed/unhired apps, cloud/Linear-style finishing controls, accessibility, screen recording, extensions, filesystem, MCP servers, desktop commander, Apify, app notes, Excel-style local app connectors, configure/details/uninstall controls, and developer logs/config editing.

## Current Code Position

This section is based on code inspection and verification, not only docs.

Shared contracts:

- `packages/types/src/suite-contracts.ts` has `PrivacyMode`, `ProviderMode`, `ChatExecutionMode`, synced/developer surface separation, generated-file trust-boundary validation, and `assertSurfaceCanSyncChats`.
- `packages/types/src/models.json` is the canonical model catalog. Agents must not invent or hardcode model IDs.
- `packages/types/src/model-catalog.ts` now restores `requireProviderDefaultModel`, so provider defaults can be resolved from the catalog instead of scattered literals.

Web:

- The Web typecheck now passes after fixing a stale default-model helper import and a temporary-conversation array lookup bug.
- Web has chat, model/provider plumbing, artifacts/tool timelines, settings hooks, integrations, and admin/account direction, but product parity is partial. Web runtime data must be Neon-backed; no Web BYOK/free env-key chat.
- Remaining Web gaps include settings parity, connector/app directory parity, global search, and complete projects/files/memory parity. Cloud Managed is public alpha and should be presented as available (no longer waitlist-gated).

Desktop:

- Desktop has a strong v3 chat shell with sidebar, model popover, composer, artifact workbench, connectors/MCP direction, local generated files, and focused settings modals.
- `apps/desktop/src/features/v3/DesktopShellV3.tsx` no longer exposes separate
  AGI Work and AGI Code mode placeholders. It exposes chat plus AGI Work Projects,
  Artifacts, Scheduled, and Dispatch subpanels. AGI Code remains missing or
  unmounted in V3; `CodeModeHome.tsx` exists but is not mounted.
- Desktop settings currently includes General, Account,
  Personalization/Appearance, Privacy, Models & Keys, Agents, Skills,
  Connectors, Plugins, Memory, Notifications, and Voice. Legacy Capabilities
  links map to Agents; there is no current top-level Capabilities tab. It does
  not yet match the full settings IA above.
- Desktop must become the main local-private compute host for files, local tools, browser/computer-use approvals, MCP logs/config, and Chrome/native bridges.

Mobile:

- Mobile currently prioritizes Local Mode and keeps hosted sends gated unless Cloud access is explicitly unlocked.
- `apps/mobile/services/remoteChatGate.ts` fails closed when Cloud sends are disabled.
- Mobile v1 has small on-device Local LLM chat plus public-alpha Cloud (open by default). Mobile BYOK is not a v1 product path.
- Mobile should not be the first heavy local PDF/PPTX/DOCX generation surface.

CLI:

- `apps/cli/src/agent/mod.rs` has Local/BYOK/Managed privacy modes and blocks Local sessions from silently using non-local provider modes.
- CLI has Claude Code-style directions such as slash commands, memory, MCP/plugins/hooks/skills, managed sessions, workspaces, voice, and provider dispatch, but it needs a stricter parity pass against Claude Code and Codex CLI.

Chrome:

- `apps/extension` owns MV3 popup/side panel/content/background/native bridge/page capture/scheduled-task/workflow-recording direction.
- It has explicit sync-boundary comments and tests asserting Chrome is a developer surface, not a consumer chat-history sync surface.
- Remaining parity gaps are polished side panel UX, permissions UX, Chrome-to-Desktop bridge hardening, and invite-gated cloud bridge flows.

VS Code:

- `apps/extension-vscode` owns IDE chat, terminal capture, patch/checkpoint flows, model picker, and workspace-scoped context.
- It must align with Codex/Claude IDE baselines: chat/edit/agent modes, @ file
  references, editor context, diagnostics, diff review where supported,
  approvals, cloud handoff preview, and local application of remote diffs.

Services:

- Managed compute is in public alpha (open by default). Services can keep building API gateway, signaling, enterprise controls, and billing/usage scaffolding; any remaining request-access flows are only for genuinely unavailable hosted capacity, not for managed cloud itself.

## P0 Gap List

These are the highest-risk gaps before calling v1 competitive.

1. Desktop AGI Work subpanels need demo-path verification, and AGI Code must be
   mounted into the V3 shell or clearly gated before demo.
2. Desktop settings must match the locked IA: General, Account, Privacy,
   Billing, Usage, Capabilities, Connectors, AGI Code, AGI in Chrome,
   Extensions, Developer.
3. One-chat flow must support normal chat plus selected files/reference files without forcing users into separate chat experiences.
4. Local to BYOK fork flow must be end-to-end on every surface where it appears: context selection, secret scan, payload preview, provider label, consent, and preserved Local original.
5. Model selection must use catalog/provider capability metadata everywhere; remove scattered hardcoded current-model assumptions.
6. Memory must support view/manage, reference-chat search, generated memory from history, and import prompt/workflow from other AI providers.
7. Connectors/apps/plugins must support directory, categories, search, OAuth/custom MCP, per-tool permissions, per-conversation loading, and admin controls.
8. Artifacts must support creation, side panel, source/preview switch, versions/history, copy/download/export, multi-artifact selection, error-fix loop, publish/share controls, and AI-powered/MCP-backed artifact gating.
9. Global search must cover chats, projects, artifacts, files, connectors, settings, and developer sessions where allowed.
10. Web/Mobile/Desktop sync must be complete only inside app-chat boundary; CLI/VS Code/Chrome require explicit handoff.
11. Cloud Managed is public alpha and open by default (founder decision, 2026-06-27). Metering, billing, abuse, retention, deletion, and provider-term controls must keep pace with public usage but no longer gate access. The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch.
12. All six surfaces need screenshot/e2e-style UI verification for the launch-critical flows, not only typecheck/build.
13. Visual artifact/design workspace parity is not yet specified in code:
    canvas, artboards, layers/assets/files, properties panel, prototype/deck
    preview, versioning, export, and trust labels must be designed before
    claiming parity with local reference design-workspace patterns.

## Documentation Rule

Agents should read current truth in this order:

1. `AGENTS.md`
2. `docs/current/source-of-truth.md`
3. `docs/current/agi-product-requirements.md` for product/UX/surface release requirements
4. `docs/current/parity-implementation-matrix.md`
5. `docs/current/byok-open-model-provider-strategy.md` when touching model/provider/BYOK work
6. `docs/agent-context/repo-map.json`
7. `docs/agent-context/known-flaws.md`
8. `docs/agent-context/commands.json`
9. nearest path-scoped `AGENTS.md`
10. `docs/decisions/CURRENT_DECISIONS.md` when a decision conflict appears
11. `PLAN.md` and `TODO.md` when planning or queueing work

Everything else is supporting context, evidence, or historical material unless a current doc explicitly promotes it.

Treat these as evidence or working notes, not source of truth:

- `tasks/**`
- `reports/**`
- `docs/archive/**`
- old dated audit subdirectories
- local screenshot/reference corpora
- generated parity reports
- stale PRDs and launch plans

Do not delete evidence casually. Classify first, then archive, compress, externalize, or remove only when the current docs and checks no longer depend on it.

## Verification Rule

Do not mark a feature complete from build success alone.

For every feature claim:

- inspect the implementation path,
- inspect UI wiring from user action to backend/service/runtime response,
- run the smallest surface check from `docs/agent-context/commands.json`,
- run targeted tests for changed behavior,
- run visual or e2e checks for launch-critical UI,
- record unresolved risks in `docs/agent-context/known-flaws.md` or the active plan.

Last recorded verified repo baseline from the prior audit. Re-run these on the
current dirty worktree before using them as fresh verification:

- `pnpm --filter @agiworkforce/web typecheck` passes.
- `pnpm --filter @agiworkforce/web test -- core/ai/llm/unified-language-model.test.ts core/integrations/web-search-handler.test.ts` passes.
- `pnpm --filter @agiworkforce/types test` passes.
- `pnpm typecheck:all` passes.
- `pnpm lint` passes.
- `cargo check --workspace --locked` passes.
- `pnpm check:llm-operability` passes.
- `git diff --check` passes.
