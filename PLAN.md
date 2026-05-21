# Anthropic Applications Parity Transition Plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21.

## Mission

Locked product thesis: AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app and not just a CLI.

AGI Workforce is not trying to become the next frontier-model lab. The target is to become the next Anthropic/OpenAI-style application platform: Claude Code, Claude Desktop, Claude Web, Claude Mobile, Claude connectors, Claude artifacts, Claude-for-work style admin controls, ChatGPT Projects, Canvas, Apps, Desktop, Codex app, and Codex remote/mobile workflows, but with AGI Workforce differentiation.

The baseline is feature parity. The reason users should stay is:

- Local-first privacy.
- Explicit BYOK trust boundary.
- Privacy-controlled managed compute.
- Future managed cloud only after billing, fraud, quota, and provider-term risk are solved.
- Multi-provider routing instead of one model family.
- Cross-surface continuity across CLI, Desktop, Mobile, Web, VS Code, and Chrome.
- One shared Rust/TypeScript engine contract instead of six drifting apps.

## Non-Negotiables

- Do not copy proprietary Anthropic code unless it becomes open source under a compatible license and legal review clears it.
- Public behavior, official docs, user-visible workflows, and compatible migration paths are fair implementation targets.
- MIT/Apache open-source references can inform architecture, but copied code must preserve license obligations.
- Local chats must never silently route to BYOK or managed cloud.
- Local to BYOK is an explicit fork or continuation draft with context selection, redaction, and preview.
- Normal cloud chat sync is only for Web, Mobile, and Desktop.
- CLI, VS Code, and Chrome do not silently join global chat history; they stay local/workspace/task scoped unless the user explicitly hands off a redacted preview into a synced app chat.
- SDKs are adapters, not architecture. AGI owns runtime schemas, event streams, privacy modes, tool contracts, routing, and usage accounting.
- Actions, routes, and command handlers own domain policy; repeated operational mechanics move behind explicit service-layer functions only when reuse or risk justifies it.
- Vercel AI Gateway is never a default path for Local or strict BYOK. It can only appear behind explicit Managed mode labeling and consent.
- Managed cloud remains waitlist/private beta until usage metering, fraud controls, refunds, chargebacks, and provider terms are settled.
- Every parity claim needs a source, an AGI file path, and verification evidence.
- Do not claim full file-by-file completion unless the file path, owner area, parity relevance, and verification result are recorded in an evidence ledger.
- Naming is locked by `docs/engineering/naming-conventions.md`: public brand `AGI`, formal platform `AGI Workforce`, primary CLI command `agi`, compatibility CLI alias `agiworkforce`, and internal repo/package/crate identifiers `agiworkforce`.
- Local hooks are part of repo operability: commit messages, pre-commit checks, and pre-push checks must stay wired and enforced by `pnpm check:hooks`.

## Source Corpus

Locked AGI product decision:

- OpenAI/Anthropic application suite thesis: `docs/decisions/2026-05-20-openai-anthropic-application-suite-thesis.md`
- Suite thesis evidence: `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`

Official Anthropic feature sources to keep current:

- Claude Code overview: `https://docs.anthropic.com/en/docs/claude-code/overview`
- Claude Code desktop: `https://code.claude.com/docs/en/desktop`
- Claude Code web/cloud sessions: `https://code.claude.com/docs/en/claude-code-on-the-web`
- Claude Code slash commands: `https://docs.anthropic.com/en/docs/claude-code/slash-commands`
- Claude Code MCP: `https://docs.anthropic.com/en/docs/claude-code/mcp`
- Claude Code hooks: `https://docs.anthropic.com/en/docs/claude-code/hooks`
- Claude Code subagents: `https://docs.anthropic.com/en/docs/claude-code/sub-agents`
- Claude Code output styles: `https://docs.anthropic.com/en/docs/claude-code/output-styles`
- Claude Code settings: `https://docs.anthropic.com/en/docs/claude-code/settings`
- Claude projects help: `https://support.claude.com/en/articles/9517075-what-are-projects`
- Claude artifacts help: `https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them`
- Claude artifact publishing/sharing help: `https://support.claude.com/en/articles/9547008-publishing-and-sharing-artifacts`
- Claude computer use tool: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`
- Claude file creation help: `https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude`
- Claude mobile iOS app actions: `https://support.claude.com/en/articles/11869619-using-claude-with-ios-apps`
- Claude connectors help: `https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities`
- Claude desktop/web connector split: `https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors`

Official OpenAI feature sources to keep current:

- OpenAI Codex app features: `https://developers.openai.com/codex/app/features`
- OpenAI Codex remote connections: `https://developers.openai.com/codex/remote-connections`
- ChatGPT Projects: `https://help.openai.com/en/articles/10169521-projects-in-chatgpt`
- ChatGPT Canvas: `https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it`
- Apps in ChatGPT: `https://help.openai.com/en/articles/11487775-apps-in-chatgpt`
- ChatGPT desktop: `https://chatgpt.com/features/desktop/`
- OpenAI computer use: `https://developers.openai.com/api/docs/guides/tools-computer-use`
- OpenAI Code Interpreter: `https://developers.openai.com/api/docs/guides/tools-code-interpreter`
- OpenAI file inputs: `https://developers.openai.com/api/docs/guides/file-inputs`
- OpenAI Codex artifacts: `https://developers.openai.com/codex/app/features#work-with-non-code-artifacts`
- ChatGPT data analysis: `https://help.openai.com/en/articles/8437071-advanced-data-analysis`
- ChatGPT agent: `https://help.openai.com/en/articles/11752874-chatgpt-agent`

Local reference corpus:

- `/Users/siddhartha/Desktop/reference/src`
- `/Users/siddhartha/Desktop/reference/codex-cli`
- `/Users/siddhartha/Desktop/reference/claw-code`
- `/Users/siddhartha/Desktop/reference/openclaw`
- `/Users/siddhartha/Desktop/reference/opencode`
- `/Users/siddhartha/Desktop/reference/gemini-cli`
- `/Users/siddhartha/Desktop/reference/ui`
- Latest Claude desktop modal references:
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/extended`
  - `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15`

AGI Workforce surface corpus:

- `apps/cli`
- `apps/desktop`
- `apps/mobile`
- `apps/web`
- `apps/extension-vscode`
- `apps/extension`
- `apps/sandbox`
- `packages`
- `crates`
- `services`
- `supabase`
- `docs`
- `tasks`

## Current Implementation Baseline

The CLI now has the first enforceable parity foundation:

- Claude-style tool aliases such as `Read`, `Bash`, `Grep`, `TodoWrite`.
- 83 registered slash commands in the shared command registry.
- Shared TUI/REPL parity dispatcher in `apps/cli/src/claude_parity.rs`.
- `/add-dir` and `--add-dir` additional workspace roots.
- `/files` file attachment into context with budget/truncation.
- Claude migration imports prompts, skills, agents, hooks, settings, MCP configs, and legacy Claude config.
- Local/BYOK/Managed privacy modes in `AgentSession`.
- Send-time block when Local mode would route to a cloud/BYOK provider.
- `/privacy-mode` and `/continue-with-byok` for explicit trust-boundary changes.
- Shared suite chat execution contracts now define `ChatExecutionMode`, `ChatIntent`, connector status snapshots, permission decisions, and compact tool events for all six surfaces.
- VS Code sidebar model switching now has a host-backed inline popover instead of a broken pill click path.
- Mobile remote chat now fails closed while v1 is Local Mode + Local LLMs, including attachment upload avoidance and a typed error path until secure Mobile BYOK key storage or Cloud Managed access is enabled.
- Mobile chat, drawer, settings, onboarding, model picker, add-to-chat, and task-chip surfaces now express the locked three-mode product model: Local Mode + Local LLMs active, Mobile BYOK disabled until secure key storage ships, and Cloud Managed visible as waitlist.
- Mobile model selection is local-first from `@agiworkforce/local-llm`; cloud provider rows are locked display rows and cannot become active model ids in v1.
- Mobile local model selection now has preparation/readiness state, selected-model runtime resolution, ExecuTorch preset install records, and local token streaming for installed models.
- Mobile Artifacts and Code Sessions now exist as Claude-inspired preview/control surfaces. Mobile previews and shares artifacts, and it controls Desktop/future Cloud Managed code environments instead of running heavy compute locally.

This is not enough to claim Claude Code parity. It is the foundation.

## Parity Matrix

| Anthropic application area   | AGI target                                                                                                     | Engine owner                                                                                                                    | Surface owners            | Status          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| Claude Code slash commands   | Built-in commands, aliases, dynamic custom commands, MCP slash prompts                                         | `apps/cli`, `crates/agiworkforce-command-registry`                                                                              | CLI/TUI, REPL             | Partial         |
| Claude Code tools            | Read/write/edit/bash/search/web/todo/task with Claude-compatible names                                         | `apps/cli/src/features/exec/tools`                                                                                              | CLI, Desktop, VS Code     | Partial         |
| Claude Code permissions      | Read-only, accept edits, bypass, plan mode, per-tool allow/deny                                                | `apps/cli`, `crates/sandbox-policy`                                                                                             | CLI, Desktop              | Partial         |
| Claude Code memory           | Project/user/local memory files and migration                                                                  | `apps/cli/src/memory*`, `packages/skills`                                                                                       | All surfaces              | Partial         |
| Claude Code settings         | Hierarchical settings, local project settings, output style persistence                                        | `apps/cli/src/config.rs`                                                                                                        | CLI/Desktop/Web           | Partial         |
| Claude Code hooks            | PreToolUse/PostToolUse/UserPromptSubmit/Stop/SubagentStop/PreCompact/SessionStart/SessionEnd                   | `apps/cli/src/features/hooks`                                                                                                   | CLI, future cloud runners | Partial         |
| Claude Code subagents        | Agent definitions, tool-scoped agents, task delegation, separate context                                       | `apps/cli/src/agents.rs`, task runtime crates                                                                                   | CLI/Desktop/VS Code       | Partial         |
| Claude MCP/connectors        | MCP servers, OAuth, prompts as slash commands, marketplace                                                     | `apps/cli/src/mcp`, `packages/mcp`, Desktop MCP commands                                                                        | CLI/Desktop/Web           | Partial         |
| Claude artifacts             | Dedicated artifact workspace, runnable previews, sandboxed rendering, sharing                                  | `apps/desktop`, `apps/web`, `apps/sandbox`, `packages/unified-chat`                                                             | Desktop/Web/Mobile        | Partial         |
| Claude/ChatGPT file creation | Compute sessions, generated-file manifests, native PDF/DOCX/XLSX/PPTX creation, preview, download, app library | `packages/types`, `crates/agiworkforce-task-runtime`, `apps/desktop/src-tauri/src/features/document`, `apps/web`, `apps/mobile` | Desktop/Web/Mobile/CLI    | Partial         |
| Claude/ChatGPT computer use  | Screenshot/action loop over isolated browser or desktop session                                                | `packages/browser-tool`, future computer session protocol                                                                       | Desktop/Web/CLI/Chrome    | Partial         |
| Claude projects              | Project instructions, files, memory, shared chats, model/provider defaults                                     | `packages/stores`, `apps/*`                                                                                                     | Desktop/Web/Mobile        | Partial/unclear |
| Claude mobile                | Chat, files, voice, camera, privacy mode, local/BYOK onboarding                                                | `apps/mobile`, `packages/local-llm`                                                                                             | Mobile                    | Partial         |
| Claude desktop               | Rich chat shell, MCP, local files, artifacts, connectors                                                       | `apps/desktop`, `src-tauri`                                                                                                     | Desktop                   | Partial         |
| Claude web                   | Chat, projects, artifacts, sharing, account, onboarding                                                        | `apps/web`                                                                                                                      | Web                       | Partial         |
| Claude enterprise            | Admin policy, audit logs, SSO, team billing, compliance                                                        | `services`, `supabase`, `packages/compliance`                                                                                   | Web/Desktop               | Early           |
| Claude GitHub automation     | PR/issue mention workflow, review comments, CI action                                                          | `services`, GitHub app future                                                                                                   | Web/Cloud/CLI             | Early           |

## Transition Workstreams

### 1. Exploration And Evidence

Goal: build an evidence-backed parity ledger before making broad claims.

Tasks:

- Inventory every AGI surface file excluding generated/build directories.
- Inventory every local reference repo with license notes.
- Build a Claude/Anthropic official feature ledger from official docs.
- Map every feature to AGI paths and current status.
- Record unknowns explicitly.

Deliverables:

- `docs/decisions/2026-05-20-openai-anthropic-application-suite-thesis.md`
- `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`
- `audit/anthropic-apps-parity/feature-ledger.md`
- `audit/anthropic-apps-parity/file-inventory.md`
- `audit/anthropic-apps-parity/reference-notes.md`
- `audit/anthropic-apps-parity/surface-gap-ledger.md`
- `audit/anthropic-apps-parity/competitive-baseline-2026-05-20.md`
- `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`
- `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`
- Agentic development outlook: `audit/repo-organization/agentic-development-outlook-2026-05-20.md`
- Parallel-agent lane map: `docs/agent-context/lanes.json`
- Shared-file collision policy: `docs/agent-context/shared-files.md`
- Parallel-agent workflow: `docs/engineering/parallel-agent-playbook.md`
- Autonomous software-company roadmap: `docs/engineering/autonomous-software-company-roadmap.md`
- Delegated research prompt bank: `docs/research/agentic-company-research-prompts.md`
- Updates to this `PLAN.md` and root `TODO.md`.

### 1A. Root Document Contract

Goal: stop competing plans from drifting.

Rules:

- `PLAN.md` is the live strategy and execution plan.
- `TODO.md` is the live actionable queue.
- `CHANGELOG.md` records completed implementation and exploration slices only.
- `AGI_WORKFORCE.md` is a compact repo entry point; its former long wave-history version is archived.
- `docs/README.md` is the durable documentation index.
- `docs/current/` is the compact current source-of-truth layer for product, architecture, commercial posture, and repo operability.
- `audit/anthropic-apps-parity/` stores evidence, inventories, ledgers, and source-backed claims.
- `tasks/` stores execution logs and historical working notes.
- Superseded plans should be archived or clearly marked historical rather than competing with this plan.
- Former top-level long-form PRD, roadmap, pricing, architecture, hosting, scaling, ownership, handoff, and strategy docs stay in `docs/archive/2026-05-21-docs-consolidation/`.

### 1B. Pre-Release Repo Organization

Goal: make AGI Workforce simple for future engineers, marketing, GTM, support, and release operators before public release.

Rules:

- Treat this as a pre-release cleanup window. There are no public users, release promises, or migration commitments yet, so structural cleanup is allowed when it preserves behavior and history.
- Keep the product code root shape: `apps/`, `packages/`, `crates/`, `services/`, `supabase/`, `docs/`, `audit/`, `tasks/`, `reports/`, `examples/`, `scripts/`.
- Remove root clutter by moving scratch markdown/images and generated reports into dated archive/report folders.
- Keep tool-required folders such as `.claude`, `.codex`, `.cursor`, `.opencode`, and `.agents` until each tool contract is documented.
- Use the existing domain-first app reorganization plan as a sub-plan, not the whole repo strategy.
- Add ownership, naming, import-boundary, docs-status, and root-clutter guardrails before hiring engineers.
- Keep `apps/web/features` as the canonical Web product-domain root; `apps/web/src` is reserved for layer primitives, and `apps/web/src/features` is forbidden.
- Make the repo LLM-operable through canonical `AGENTS.md`, `docs/agent-context/`, machine-readable repo/risk/command/doc-status maps, and known-flaws tracking.
- Keep report retention, CI baselines, and provisional CODEOWNERS coverage enforced through `pnpm check:llm-operability`.

Deliverable:

- `docs/plans/pre-release-repo-organization-2026-05-20.md`
- `docs/agent-context/`
- `scripts/check-structure-conventions.mjs`

### 1C. Agent-Native Development

Goal: build the repo for a future where humans direct, review, and release while LLM agents do most exploration, implementation, refactoring, and verification work.

Long-term assumption:

- Development will become increasingly agentic: multiple agents in isolated sessions/worktrees, scoped tasks, evidence-backed edits, resumable context, generated PRs, and human approval gates.
- The repo itself must become part of the product. If the repo is hard for agents to navigate, AGI Workforce will move slower than competitors even if the product idea is strong.
- Humans still own product judgment, architecture, privacy, safety, billing risk, and final review. Agents accelerate work; they do not replace accountability.

Rules:

- Treat `AGENTS.md`, `docs/agent-context/`, `PLAN.md`, `TODO.md`, and `CHANGELOG.md` as the agent operating system.
- Keep agent instructions layered: root instructions stay short; path-specific rules live close to code.
- Make every workstream splittable by owner path so parallel agents can work without overlapping writes.
- Keep smallest-useful and pre-merge verification commands close to each app/package/crate/service.
- Require evidence for broad claims: source link, AGI path, test/check result, and status.
- Keep local/BYOK/managed trust boundaries explicit in code owners, docs, schemas, and tests.
- Add CI guardrails that catch stale docs, root clutter, missing README ownership, generated artifact drift, and import-boundary breaks.
- Use `/Users/siddhartha/Desktop/reference/src` and the wider `/Users/siddhartha/Desktop/reference` corpus for architecture lessons, not unreviewed code copying.

Deliverable:

- `audit/repo-organization/agentic-development-outlook-2026-05-20.md`
- `docs/engineering/agent-native-development.md`

### 1D. Parallel Agent Operating Model

Goal: make AGI Workforce easy to split across 15+ parallel coding agents, Claude Code TeamCreate-style teammates, Codex subagents, Cursor agents, opencode tasks, and future internal agents.

Rules:

- Every implementation task gets one `laneId` from `docs/agent-context/lanes.json`.
- Lane-owned paths are the only write paths for feature agents.
- Shared files such as lockfiles, root docs, CI, shared schemas, migrations, and native projects go through a named integrator lane.
- Each lane states required checks and escalation owners before work begins.
- Exploration agents can read broadly, but implementation agents write narrowly.
- The integrator owns `PLAN.md`, `TODO.md`, `CHANGELOG.md`, `docs/agent-context/**`, shared manifests, and final commits.
- Parallel work should prefer 18 writer lanes plus 4 review/verification lanes when the task pool is large enough.

Deliverables:

- `docs/agent-context/lanes.json`
- `docs/agent-context/shared-files.md`
- `docs/agent-context/task-manifest.schema.json`
- `docs/engineering/parallel-agent-playbook.md`
- `docs/engineering/service-layer-architecture.md`
- `.github/PULL_REQUEST_TEMPLATE/parallel-agent-change.md`
- `scripts/check-lane-ownership.mjs`

### 1E. Autonomous Software Company Loop

Goal: design AGI Workforce so customer feedback, bug reports, support cases, telemetry, and release outcomes can eventually create a reviewed patch flow without depending on a large manual team.

Target loop:

1. User feedback enters through Web, Desktop, Mobile, CLI, support email, voice intake, or app-store review.
2. Intake scrubs secrets and classifies privacy risk.
3. Triage groups duplicates, maps issue to a repo lane, estimates severity, and opens an internal case.
4. The case creates a GitHub issue or queue item with reproduction evidence.
5. A patch agent works in an isolated branch/worktree inside the assigned lane.
6. Verification agents run tests, screenshots, static checks, and regression probes.
7. A human or trusted release gate reviews high-risk changes.
8. Merge links to release notes, app update channels, and customer follow-up.

Rules:

- This automation is future product infrastructure, not a reason to remove human review from privacy, billing, security, release, or data-retention changes.
- Managed cloud compute for users remains waitlisted/private beta until abuse, refunds, disputes, quota, provider costs, and retention are solved.
- Support automation should assist humans first: classify, route, draft, reproduce, and close loops; it should not promise refunds, credits, or legal answers without policy gates.

Deliverables:

- `docs/engineering/autonomous-software-company-roadmap.md`
- `docs/research/agentic-company-research-prompts.md`
- Future schemas under `packages/types` for feedback, support, release-fix links, and agent-patch tasks.

### 2. CLI As Engine

Goal: make CLI the canonical engine that every surface can reuse.

Tasks:

- Finish slash-command runtime unification.
- Add custom project/user slash commands from `.agiworkforce/commands` and imported `.claude/commands`.
- Add MCP prompt slash-command discovery.
- Add `/agents` interactive management equivalent for CLI/TUI.
- Add hook matcher compatibility with Claude tool names.
- Persist output styles and privacy mode in project-local settings.
- Add privacy labels to session exports and managed session metadata.

### 3. Local And BYOK Onboarding

Goal: users can start private/local and intentionally escalate to BYOK.

Tasks:

- Build first-run flow: Local, BYOK, managed waitlist.
- Add key setup UX for OpenAI/Anthropic/Gemini/Ollama/LM Studio.
- Add Local model health check and install guidance.
- Add provider smoke test before saving key config.
- Add Local -> BYOK fork UI on Desktop/Mobile/Web.
- Add secret scan and payload preview before any Local -> BYOK handoff.
- Local -> BYOK forks must store the accepted redacted preview payload and hash evidence only; they must not clone original Local messages into the BYOK conversation.

### 3A. Chat Sync Boundary

Goal: match user expectations without leaking developer context.

Rules:

- Web, Mobile, and Desktop share normal chat history, projects, artifacts, and user-visible app settings.
- CLI sessions are local/workspace scoped by default.
- VS Code sessions are workspace scoped by default.
- Chrome sessions are browser/task scoped by default.
- Developer sessions may be explicitly handed off to Web/Mobile/Desktop only through preview, redaction, privacy labels, and user confirmation.
- Synced app chat and developer session history must use separate schemas, even if a unified UI can search both later.

### 3B. Provider SDK Boundary

Goal: use OpenAI, Anthropic, and Vercel SDKs without surrendering AGI's runtime.

Rules:

- AGI owns the provider adapter interface, normalized event stream, tool schema, conversation schema, and privacy boundary.
- OpenAI and Anthropic official SDKs are allowed inside provider adapters for transport, streaming, retries, and error handling.
- Vercel AI SDK is allowed in Web/Next.js streaming and UI paths when converted into AGI-owned schemas.
- OpenAI Agents SDK, Anthropic Agent SDK, and Vercel `ToolLoopAgent` are research/prototype references, not the core AGI agent loop.
- OpenAI Responses should become the preferred native OpenAI path for modern reasoning/tool/multimodal work, with `store: false` by default for Local/BYOK.
- Chat Completions remains supported for OpenAI-compatible endpoints and legacy proxy surfaces.
- Vercel AI Gateway belongs only in explicit Managed mode experiments, not default BYOK or Local.

Deliverable:

- `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`

### 4. Artifacts

Goal: match Claude artifacts as a baseline and exceed with cross-surface continuity.

Tasks:

- Define artifact schema in shared packages.
- Ensure Desktop and Web render artifacts through sandboxed origins.
- Make CLI able to list/export/open artifacts.
- Make Mobile request, view, download, and share artifacts; local on-device heavy compute can be deferred.
- Add artifact versioning, diff, file tree, and share/export controls.
- Web chat artifacts should render as compact inline cards and open in the sidecar artifact workbench, not duplicate full previews below the assistant message.
- Claude desktop is the preferred UI baseline. Settings, connectors, plugin browsing, global search, project file preview, and project edit flows should open as focused modals or overlays first; route-sized/full-screen surfaces are reserved for deep workflows such as artifact split-pane viewing, code dashboards, projects indexes, and long-running research traces.
- Before copying any reference behavior from screenshots, verify the path, filename, dimensions/type, and visible screen content match the intended surface. Mismatched or stale captures are evidence only after a fresh visual check.

### 4A. Compute, Computer Use, And Generated Files

Goal: match Claude and ChatGPT's practical file-generation and computer-use behavior without compromising AGI's Local/BYOK boundary.

Rules:

- File creation is a compute-session feature, not a loose UI export button.
- Generated files must have a manifest with owner, source session, privacy mode, checksum, storage location, preview, and expiry when applicable.
- Local mode writes files locally and never uploads them silently.
- BYOK mode may use provider models, but generated files should remain local unless the user explicitly approves a transfer.
- Managed compute is future-only until billing, abuse, quota, retention, and deletion controls exist.
- Computer use is a screenshot/action loop behind an AGI-owned protocol that can map to Playwright, local desktop, VNC, Anthropic tools, or OpenAI tools.
- Mobile is a full request/preview/download/share surface for generated files, but not the first local heavy-compute runtime. It should delegate heavy generation to Desktop/local host or future Managed compute.

Tasks:

- Define `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` in shared types.
- Extend `SharedArtifact` to reference generated native files and preview derivatives.
- [x] Wrap `packages/browser-tool` behind a shared `ComputerAction` protocol.
- [x] Convert Desktop PDF/DOCX/XLSX/PPTX tools into generated-file manifest producers.
- [x] Add local compute-session work directories with TTL metadata and audit events.
- [x] Add shared generated-file presentation helpers and first-pass Desktop/Web/Mobile status, preview, download, share, source, checksum, and privacy labels.
- Add generated-file request, status, preview, download, and share controls to Web, Mobile, and Desktop.
- [x] Add provider-container adapters that convert OpenAI Code Interpreter-style file annotations into AGI `GeneratedFile` records.
- [x] Add tests proving Local mode does not upload generated files, BYOK transfer requires explicit approval, and Managed mode files carry TTL/quota/deletion metadata.

Deliverable:

- `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`

### 5. Projects, Memory, And Files

Goal: make projects feel like Claude Projects plus developer-grade local trust.

Tasks:

- Define project schema: instructions, files, memory, privacy mode, provider defaults.
- Support project-level memory and imported Claude project instructions.
- Add file inclusion policy and per-file privacy labels.
- Add project export/import bundle.
- Add visible "what will be sent" previews for cloud/BYOK turns.

### 6. Connectors And MCP Marketplace

Goal: Claude connectors parity through MCP and browser/IDE bridges.

Tasks:

- Unify Desktop/CLI MCP server registry.
- Add OAuth status and refresh UX.
- Add MCP prompts as slash commands.
- Add connector install/uninstall across Desktop/Web/CLI.
- Keep connector customization modal-first: browse in the connector gallery, add custom remote MCP servers through a focused modal, and escalate to settings only for deep MCP/server management.
- Add Chrome and VS Code bridge status to connector hub.

### 7. Agents, Tasks, And Automation

Goal: Claude subagents plus AGI cross-provider/task runtime.

Tasks:

- Add visual agent manager.
- Add queryable subagent runtime snapshots for status, model, prompt, and execution metadata.
- Add per-agent tool and model restrictions.
- Add task execution history and background task UI.
- Add GitHub PR/issue automation design for private beta.
- Add cloud runners only after managed cloud policy is approved.

### 8. Teams, Admin, And Compliance

Goal: enterprise-grade trust without creating uncapped bootstrapped burn.

Tasks:

- Admin policy model for Local/BYOK/Managed availability. First shared contract and database foundation exists in `packages/types/src/enterprise` and `supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql`.
- Audit log schema. Enterprise audit events and audit export request tables now exist in the canonical migration path.
- Team key vault / BYOK policy. Provider policy tables exist; key vault implementation remains open.
- SSO/SAML/OIDC. Existing Web SSO/SCIM tables are now backfilled into root migrations so fresh environments no longer depend on legacy `apps/web/supabase` migrations.
- Billing waitlist and invoice-first enterprise option. Managed credit accounts default to `public_launch_blocked = true` and `billing_mode = invoice_ach`.
- Support and feedback loops. Support cases, feedback cases, and release-fix links now have shared schema foundations.

## Execution Phases

### Phase 0: Control Plane

- Create root `PLAN.md`.
- Create root `TODO.md`.
- Add CHANGELOG entry for the transition.
- Start parallel exploration agents.
- Freeze the rule: root docs are current control plane; old docs become references.

### Phase 1: Evidence Ledger

- Produce a complete file inventory excluding generated directories.
- Produce Anthropic feature ledger from official docs.
- Produce local reference ledger with license notes.
- Produce AGI surface gap table.
- Track per-file audit completion only when each path has evidence.

### Phase 1 Status As Of 2026-05-20

- Scoped repo inventory exists: 6118 files excluding generated/build directories.
- Local reference architecture/license notes exist for Codex CLI, Gemini CLI, OpenClaw, opencode, claw-code, and `reference/src`.
- Surface gap ledger exists for projects, artifacts, MCP/connectors, agents/subagents, hooks, memory, privacy, onboarding/import, and teams/admin/billing.
- The current exploration was targeted and file-backed. It is not yet a complete line-by-line audit of all 6118 files.

### Phase 2: CLI Parity Hardening

- Finish runtime slash parity.
- Add custom commands and MCP prompt commands.
- Persist privacy/output settings.
- Add tests for every registered slash command having TUI/REPL behavior.

### Phase 3: Cross-Surface Privacy

- Carry Local/BYOK/Managed mode through Desktop, Mobile, Web, VS Code, Chrome.
- Add visible labels and route previews.
- Make Local -> BYOK an explicit fork everywhere.
- Ensure Local -> BYOK forks are preview-only transfers, not hidden full-thread copies.
- Implement Web/Mobile/Desktop-only chat sync.
- Keep CLI/VS Code/Chrome out of global chat sync unless explicit handoff is implemented.
- Define provider modes and SDK boundaries so Local/BYOK/Managed cannot route through an unintended SDK or gateway.

### Phase 4: Artifacts And Projects

- Normalize artifact and project contracts.
- Wire Desktop/Web first.
- Mobile view-only and CLI export/list follow.

### Phase 5: Connectors And Agents

- MCP marketplace and OAuth status.
- Agent manager and subagent execution.
- Background tasks and GitHub automation prototype.

### Phase 6: Managed Cloud Readiness

- Usage ledger. First canonical table: `organization_usage_ledger`.
- Provider price table. First canonical table: `provider_cost_snapshots`.
- Quota and balance reservation.
- Fraud/risk controls.
- Invoice/ACH-first enterprise private beta. First canonical table: `managed_credit_accounts`.

## Definition Of Done

AGI Workforce can claim Anthropic Applications parity only when:

- The parity ledger has no unclassified Anthropic app features.
- Every baseline feature has an AGI implementation or explicit product exception.
- Local/BYOK/Managed privacy labels are visible across all user-facing surfaces.
- A Claude user can import settings, memory, commands, agents, skills, and MCP configs.
- A developer can use CLI/VS Code/Desktop without losing Claude Code muscle memory.
- Artifacts and projects work across at least Desktop and Web.
- Mobile can start private/local and explicitly continue with BYOK.
- Tests cover migration, privacy boundaries, and command parity.
