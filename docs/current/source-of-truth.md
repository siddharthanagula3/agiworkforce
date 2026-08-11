# Source Of Truth

Status: Current
Owner: Founder + platform lead
Last updated: 2026-08-09

This is the compact source of truth for what AGI is, what v1 means, where the repo stands today, and how agents should avoid stale-doc hallucination.

For feature-by-feature, option-by-option implementation detail, use `docs/current/parity-implementation-matrix.md`.

For BYOK providers, hosted open-model APIs, open-weight model priorities, and Desktop model-selector rules, use `docs/current/byok-open-model-provider-strategy.md`.

For the long-form PRD, serial surface order, per-surface release bars, and decision-complete feature requirements, use `docs/current/agi-product-requirements.md`.

## Product Definition

AGI is the public product brand. AGI Workforce is the formal platform and repo name.

AGI is a leading AI application suite across six first-class surfaces:

- Web
- Mobile
- Desktop
- Chrome extension
- VS Code extension
- CLI

The v1 product target is practical parity with current leading AI application ecosystems, with one major differentiation: users can choose Local models, Bring Your Own Key provider access, or AGI managed cloud (public alpha, open by default) instead of being locked into one model lab.

Parity means user-capability parity and workflow parity, not copying proprietary code, private assets, or protected branding. Claude and ChatGPT are competitive references; AGI must implement its own design system, names, contracts, providers, and trust-boundary UX.

## Launch Lock

Public v1 launches with:

- Local Mode: local-first chat and local tools where technically available.
- BYOK Mode: direct user-owned provider keys with explicit provider labels.
- Multi-provider model selection: hand-maintained model knowledge lives only in
  `packages/ai/model-registry/catalog`; compatibility catalogs are generated.
- One normal chat surface that can also work with selected files, reference files, project context, generated files, artifacts, tools, connectors, and images.

Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta launch gate has been removed.

Development is serial by surface, ordered shortest-remaining-work-first (founder decision 2026-08-05 — supersedes the prior fixed Website-first order here and Decision #20's earlier Mobile-first order): estimate the remaining Class-1 (partial/unwired/stub/broken) work per surface, complete the fastest surface first, then the next fastest, until all six surfaces are at zero. One surface is active at a time. A later surface does not become active until the founder advances the sequence or explicitly authorizes work during QA, review, or another waiting period. The routing substrate (registry dated pricing and cache-write billing, ExecutionPlan/CPST design, CPST telemetry, rules-based router) completes before surface closure begins.

The founder explicitly authorized a cross-surface capability sequence on
2026-08-09, which is the current exception to that one-surface rule: first make
Max 15x image and video generation work end to end on Web, Mobile, and both
Desktop shells; next prove the tool loop, artifact rendering, and web search on
Web/Mobile/Desktop; then make skills, plugins, and connectors work on Web,
Mobile, Desktop, CLI, and VS Code. The competitive floor for this sequence is
the official ChatGPT product state from 2026-07-09 through 2026-08-09. This also
supersedes the prior Mobile-only scope decision that represented plugins solely
through Connectors.

For Web capability closure, rendered behavior is a release requirement, not a
later QA follow-up. Media proof must traverse the shipping composer and model
picker with a real prompt and the cheapest currently live Google model, then
prove terminal rendering, reload/resume, Library persistence, authorized
download, and failure/retry behavior. Skills, plugins, and connectors require
the same installed/connected-to-invoked UI proof. Popular open-source additions
must have current popularity evidence, compatible licensing, pinned provenance,
permission review, and working install/update/remove paths. Founder-only
credential, billing, OAuth, signing, publication, and production configuration
steps must be handed off explicitly rather than represented as complete.

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

| Surface | Role                                                                                                                                                                                                     | Sync boundary                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Account, projects, synced app chats, artifacts, billing, admin, web routes, and capacity-specific access requests. Web chat is subscription-backed through Neon/account state; Web does not expose BYOK. | Normal app chat sync allowed.                                                                                                                                                                                               |
| Desktop | Local-private compute host, rich app shell, local files, MCP/connectors, artifacts, computer/browser use, native host for Chrome/Mobile/CLI bridges.                                                     | Normal app chat sync allowed for app chats; local files stay local unless explicitly transferred.                                                                                                                           |
| Mobile  | Small on-device Local LLM chat, continuity, approvals, preview/share, and public-alpha Cloud chat for signed-in users (no invite/waitlist). Mobile v1 does not expose BYOK.                              | Signed-in Cloud chats, projects, memory, settings, and personalization share the app continuity contract with Web and Desktop. Local Mode data and files stay local unless the user explicitly chooses a reviewed transfer. |
| CLI     | Developer agent, terminal engine, and canonical local developer-session host used by VS Code.                                                                                                            | Workspace/session scoped; no automatic sync into app chats.                                                                                                                                                                 |
| VS Code | IDE-native thin client and presentation adapter over the CLI-hosted Rust developer session.                                                                                                              | One local-runtime process per trusted workspace; handoff to app chat must be explicit and redacted.                                                                                                                         |
| Chrome  | Browser context, page capture/action approvals, native messaging, and browser-local conversations.                                                                                                       | Conversations persist in extension-local storage and never join consumer app-chat sync implicitly; transfer requires explicit selected/redacted handoff.                                                                    |

## Continuity And Reuse Lock

- Web, Mobile, and Desktop are adapters over one signed-in Cloud continuity domain for app chats, projects, Cloud memory, profile instructions/personalization, and synchronized settings. Surface-specific stores may cache or render that data, but they must not define competing schemas, merge policies, or server routes. Local Desktop/Mobile state remains inside the Local trust boundary.
- CLI is the canonical local developer-session host and VS Code is a thin client over the same workspace runtime, transcript/session store, permission pipeline, and extension discovery service. Resuming a session appends to the same session ID; forking creates a new ID. Neither surface silently joins consumer app-chat history.
- Developer extension discovery is folder-aware. `.agi` is the canonical AGI project configuration; compatibility loaders may read supported `.agents`, `.claude`, `AGENTS.md`, `CLAUDE.md`, skills, plugins, connectors/MCP, hooks, and agent definitions through one precedence-aware loader. CLI and VS Code must show the same discovered inventory for the same trusted workspace. Compatibility does not authorize moving, deleting, or rewriting another tool&rsquo;s files.
- Managed usage UI is one percentage/reset-time contract. Web, Mobile, Desktop, CLI, and VS Code render percentage progress bars without exposing private plan-allowance units, token-to-credit conversion, or provider cost. The explicit top-up checkout is the narrow exception: it displays the founder-set public purchase denomination (50 top-up units per $1), not the private plan allowance. Chrome has no usage dashboard; it still receives honest limit/upgrade errors from the shared server policy.
- Shared contracts own identity and behavior; each surface owns only transport, platform permissions, offline/cache policy, and presentation. New work must extend an existing owner before adding a surface-local duplicate.

## Competitive Baseline

POINT-IN-TIME SNAPSHOT, captured 2026-05-28 and not refreshed since. Competitor
surfaces move monthly, so treat every claim below as a historical record of what
was true that day, not as current fact. Re-verify against official product docs
before using any of it to justify scope. The parity target was source-backed by
those docs plus the local Claude reference folder at
`/Users/siddhartha/Desktop/claude_reference`. The most recent dated competitor
re-verification lives in `docs/current/parity-implementation-matrix.md`
("Competitor Deltas", verified 2026-07-09); where the two disagree, the newer
dated entry wins.

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

Official sources as they stood when this snapshot was captured (several have
since moved or redirected — re-fetch before citing):

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

Billing and Usage must include plan, adjust plan, Stripe/payment link, invoices, due date, total, status, action, current-session percentage, rolling-week percentage, billing-period percentage, reset times, and auto reload. Public clients must not receive or reconstruct private internal allowance units, provider-cost value, ledger cents, or the internal unit-to-currency conversion.

Billing plan lock (founder decision, 2026-07-18):

| Plan       | Public price                               | Public usage position | Projects  | Custom MCP | Managed developer surfaces | Image generation | Video generation | Shared controls |
| ---------- | ------------------------------------------ | --------------------- | --------- | ---------- | -------------------------- | ---------------- | ---------------- | --------------- |
| Free       | Free                                       | Small daily allowance | 1         | 1          | No                         | No               | No               | No              |
| Basic      | $7/month; India ₹399/month                 | Base paid usage       | 5         | 5          | No                         | No               | No               | No              |
| Pro        | $20/month or $200/year; India ₹1,999/month | 5x Basic              | 25        | 25         | CLI, Chrome, VS Code       | Yes              | No               | No              |
| Max 5x     | $100/month; India ₹9,999/month             | 5x Pro                | Unlimited | Unlimited  | CLI, Chrome, VS Code       | Yes              | No               | No              |
| Max 15x    | $200/month; India ₹24,999/month            | 15x Pro               | Unlimited | Unlimited  | CLI, Chrome, VS Code       | Yes              | Yes              | No              |
| Team       | $25/seat/month or $240/seat/year           | Same as Pro per seat  | 25        | 25         | CLI, Chrome, VS Code       | Yes              | No               | Yes             |
| Enterprise | Contract                                   | Contract              | Contract  | Contract   | Contract                   | Yes              | Yes              | Yes             |

Basic is available on Web, Mobile, and Desktop. Free and Basic do not include managed-cloud CLI, Chrome, or VS Code access; Local/BYOK developer use remains available inside its separate trust boundary. Skills and chat tools remain available in Free chat, while AGI Work and managed developer surfaces are Pro+ capabilities.

Subscriptions are globally available (founder, 2026-08-05) — no country is excluded; every region can purchase, with localized amounts where configured and USD everywhere else. Location pricing is server-derived. The Website uses the trusted deployment country header and the configured Stripe Price currency options; it never trusts a browser-supplied currency. India-specific amounts render only for India. Other supported currencies use the matching Stripe currency option, with USD as the honest fallback when no localized Stripe amount is configured.

Paid usage is enforced as overlapping billing-period, rolling seven-day, rolling five-hour, and flagship rolling-week windows. The five-hour allowance is 20% of that plan's weekly allowance and the flagship sub-limit is 30% of the weekly allowance. These are spend windows, not seven daily buckets: usage ages out from its original transaction timestamp. Rolling spend windows warn at 80% and hard-stop at 100%; there is no downgrade or 150% financial grace band. The server-owned reservation includes the estimated in-flight request before provider work and serializes concurrent reservations for one tenant.

An immediate paid-plan upgrade preserves the existing renewal date. Stripe previews and invoices only the prorated price/seat difference for the remaining time in the current period, using the exact same signed proration timestamp for preview and apply. AGI carries already-consumed billing-period and rolling-window usage into the higher plan; usage never resets on upgrade, and purchased top-ups remain separate. If payment is incomplete or fails, the old plan and its counters remain active until the canonical paid webhook provisions the upgrade.

Self-serve top-ups are available only to active Stripe-billed paid plans. They are whole-dollar purchases at 50 public top-up units per $1, with a $10 minimum and $100 ordinary self-serve maximum. Stripe Checkout shows and collects tax separately; the managed-usage ledger receives only the pre-tax purchased balance. Unused purchased balance carries across subscription renewals and purchases older than 12 months are excluded from the next carry.

Desktop app settings must include run on startup, quick access shortcut, voice shortcut, menu bar, keep computer awake, browser use, allow all browser actions, computer use, allowed/unhired apps, cloud/Linear-style finishing controls, accessibility, screen recording, extensions, filesystem, MCP servers, desktop commander, Apify, app notes, Excel-style local app connectors, configure/details/uninstall controls, and developer logs/config editing.

## Current Code Position

This section is based on code inspection and verification, not only docs.

Shared contracts:

- `packages/contracts/types/src/suite-contracts.ts` has `PrivacyMode`, `ProviderMode`, `ChatExecutionMode`, synced/developer surface separation, generated-file trust-boundary validation, and `assertSurfaceCanSyncChats`.
- `packages/ai/model-registry/catalog/models.curation.json`, `models.synced.json`,
  `harnesses.json`, and `routing-policies.json` are the authoring inputs for
  model identity, provider-model keys, routes, capabilities, harnesses, runtime
  profiles, and policy. The compiler owns
  `packages/ai/model-registry/generated/registry.{json,ts}`,
  `packages/contracts/types/src/models.json`, and the generated protocol/model-registry
  Rust projections. Agents must never edit those generated files directly,
  invent IDs, or maintain an application-specific managed-model list.
- `packages/contracts/types/src/model-catalog.ts` now restores `requireProviderDefaultModel`, so provider defaults can be resolved from the catalog instead of scattered literals.

Web:

- The Web typecheck now passes after fixing a stale default-model helper import and a temporary-conversation array lookup bug.
- Web has chat, model/provider plumbing, artifacts/tool timelines, settings hooks, integrations, and admin/account direction, but product parity is partial. Web runtime data must be Neon-backed; no Web BYOK/free env-key chat.
- The managed Web chat API now admits Auto aliases and explicit model selections
  through `@agiworkforce/routing` with the implemented `web/cloud-chat` runtime
  profile before quota reservation or provider dispatch. Unknown models and
  partially implemented harness requirements fail closed. The unused
  `apps/web/lib/modelRouter.ts` and
  `apps/web/core/ai/orchestration/model-router.ts` policy copies were removed.
- Clear natural-language image-generation requests in the shipping Web chat UI
  dispatch to the existing managed media flow. The generic text-chat API rejects
  media harnesses before billing/provider execution instead of sending an image
  model through a text adapter.
- `/chat` still mounts `WebChatPage`; `UnifiedChatPage`/`WebShellV3` are internal
  convergence code and are not a second public Web chat route. Their existence
  must not be mistaken for production adoption of the shared chat shell.
- Remaining Web gaps include settings parity, connector/app directory parity, global search, and complete projects/files/memory parity. Cloud Managed is public alpha and should be presented as available (no longer waitlist-gated).

Desktop:

- Desktop has a strong v3 chat shell with sidebar, model popover, composer, artifact workbench, connectors/MCP direction, local generated files, and focused settings modals.
- Desktop is one product surface with two installed shells (founder decision, 2026-08-03): the Tauri shell owning Local, BYOK, and Managed Cloud workspaces, and a cloud-only Electron shell (`apps/desktop/electron/`) that loads the hosted cloud web app by default (Claude-desktop model; the desktop cloud web build remains as a bundled fallback renderer) and lives entirely inside the Managed Cloud trust boundary. In the Tauri shell the workspace/storage plane is `local` or `cloud`; every conversation separately persists an immutable `execution_mode` (`local_only`, `byok`, or `cloud_managed`). Local-to-BYOK creates a new `byok` fork, and Rust provider admission rejects providers outside that conversation boundary. The shipping shared-chat selector and send preflight also filter by `execution_mode`; managed and canonical BYOK selections pass through the registry-backed route, lifecycle, harness, and runtime-profile policy before persistence or dispatch. Dynamic host-discovered Local/BYOK models remain privileged-runtime admitted. Desktop managed Cloud is live for signed-in users through the shared `CloudRuntime`; `desktop/cloud-chat` is registry-admitted while Local and BYOK remain isolated.
- Desktop model routing is owned by `@agiworkforce/routing` through the shared
  chat send pipeline. The unused Desktop-only `lib/modelRouter.ts`, its orphaned
  Zustand routing methods, and tests of that parallel policy were removed; do
  not recreate application-specific model pools or keyword routers.
- Desktop model discovery is reachability-based: Rust advertises a catalog
  model only when that exact provider is configured; registering Managed Cloud
  never makes direct BYOK providers appear available. IPC/API discovery payloads
  are runtime-validated, canonical capability/lifecycle metadata comes from the
  generated registry, and discovery failure produces an explicit empty state
  instead of synthesized models or universal capabilities. Runtime capability
  probing is reserved for dynamically discovered Ollama models.
- `apps/desktop/src/features/v3/DesktopShellV3.tsx` no longer exposes separate
  AGI Work and AGI Code mode placeholders. It exposes chat plus AGI Work
  Projects, Artifacts, Scheduled, Code, Tasks, Library, and Cloud Schedules
  panels, each gated by privacy mode. There is no Dispatch subpanel; the
  `sidebar.nav.dispatch` translation keys survive in the i18n corpus but no
  component reads them. `CodeModeHome.tsx` was deleted in `c39eba06c`. AGI Code
  is now mounted as `apps/desktop/src/features/code/CodeWorkspace.tsx`, reached
  from the sidebar `code` nav entry and rendered **Local-only**: the nav entry is
  absent in Managed Cloud, the navigate guard refuses the panel outside Local,
  and switching a session to Managed Cloud evicts an open workspace back to
  chat. It edits real device files, so it must never render over a cloud
  session.
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
- `apps/cli/src/app_server/developer_host.rs` is the canonical local
  developer-session runtime used by both the CLI and VS Code. The shared
  app-server protocol owns admission and transport; the CLI host owns
  workspace-scoped persistence, live turns, streaming, approvals,
  cancellation, tool execution, and MCP attachment.
- MCP discovery is asynchronous and status-bearing (`mcp/loading`,
  `mcp/ready`, `mcp/unavailable`). Failure or timeout degrades the session
  without blocking startup.
- App-server capabilities currently report `checkpoints: false` and
  `worktrees: false`. Legacy UI or commands do not prove those shared runtime
  capabilities; keep them gated until implemented and verified in the Rust
  owner.
- CLI has Claude Code-style directions such as slash commands, memory, MCP/plugins/hooks/skills, managed sessions, workspaces, voice, and provider dispatch, but it needs a stricter parity pass against Claude Code and Codex CLI.

Chrome:

- `apps/extension` owns MV3 popup/side panel/content/background/native bridge/page capture/scheduled-task/workflow-recording direction.
- `apps/extension/src/features/background/conversation-history.ts` owns the
  browser conversation store in `chrome.storage.local`, including migration,
  active-conversation selection, bounded retention, mutation serialization,
  and CRUD used by the side panel. This is intentionally separate from
  Web/Mobile/Desktop app-chat sync.
- Remaining parity gaps are polished side panel UX, permissions UX,
  Chrome-to-Desktop bridge hardening, and the explicit selected/redacted handoff
  flow.

VS Code:

- `apps/extension-vscode` owns IDE context and presentation. Its typed JSONL
  client and `LocalRuntimePool` connect to one CLI app-server process per
  trusted workspace. The former extension-owned `ConversationStore`,
  checkpoint manager, and agent loop were removed; do not recreate a second
  execution or persistence owner in the extension.
- It must align with Codex/Claude IDE baselines: chat/edit/agent modes, @ file
  references, editor context, diagnostics, diff review where supported,
  approvals, cloud handoff preview, and local application of remote diffs.

Build and release ownership:

- `turbo.json` is the Node workspace task graph. Root lint/typecheck/test/build
  commands delegate to package-owned tasks, and CI uses Turbo affected
  selection plus a static graph regression check.
- CLI releases use `v-cli-*` tags, validate Cargo/npm version agreement, and
  publish Sigstore-verified checksum bundles. Desktop releases use
  `v-desktop-*` tags and Tauri updater signatures. These are separate product
  channels; no workflow or installer may resolve an unfiltered latest release.
- This does not establish all-platform release readiness. Desktop macOS and
  Windows signing/notarization and a green full-repo verification baseline
  remain required.

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

- `docs/agent-context/known-flaws.md` findings not yet promoted into a current doc
- `docs/research/**` dated research summaries
- local screenshot/reference corpora
- generated parity reports
- stale PRDs and launch plans

(The former `tasks/**`, `reports/**`, and `docs/archive/**` directories were
removed repo-wide on 2026-06-28 — do not cite them as existing. `audit/` was
removed then too but has since been reintroduced and is live again: it is the
current triage queue, and `audit/capability-gaps.csv` is cited as the source of
truth by `docs/current/parity-implementation-matrix.md`. Cite it, but treat its
contents as a queue of claims to verify in code, never as evidence that work is
done.)

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

Do not reuse any prior green baseline as current evidence. Re-run
`pnpm check:llm-operability`, the relevant tier, surface, and native commands
from `docs/agent-context/commands.json`, and the repository diff checks against
the current tree. Record their exact output before making any completion or
release-readiness claim; one passing umbrella command does not prove every
required OS- and surface-specific CI job is green.
