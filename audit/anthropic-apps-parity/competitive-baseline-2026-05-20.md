# Competitive Baseline: Anthropic And OpenAI Applications

Status: Current evidence
Owner: Product/platform
Last updated: 2026-05-20.

This ledger records the current public application baseline for Anthropic and OpenAI. It is a product behavior reference only. Do not copy proprietary source, private prompts, unique UI copy, endpoint names, telemetry names, or internal schemas.

## Locked AGI Product Decision

Normal chat sync is only for:

- Web
- Mobile
- Desktop

Developer and context-capture surfaces do not silently join global chat history:

- CLI: local/workspace sessions by default.
- VS Code: workspace sessions by default.
- Chrome: browser/task sessions by default.

Those surfaces may later support explicit handoff to Web/Mobile/Desktop through a preview, redaction, privacy-label, and consent flow.

## Why This Is The Right Boundary

Anthropic and OpenAI both treat consumer app surfaces as continuity surfaces, while coding agents and local integrations use stronger context boundaries.

| Surface class              | Expected AGI behavior                                                             | Rationale                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Web/Mobile/Desktop chat    | Shared conversation/project/artifact history                                      | Users expect normal chat continuity across app surfaces.                                          |
| Desktop local work         | Sync ordinary chat if it is an app chat; keep local computer/code sessions scoped | Desktop spans both consumer chat and local machine access.                                        |
| CLI                        | Do not sync by default                                                            | Terminal sessions may include repo files, shell output, secrets, local paths, and tool approvals. |
| VS Code                    | Do not sync by default                                                            | IDE state and codebase context are workspace-sensitive.                                           |
| Chrome                     | Do not sync by default                                                            | Browser/page context can include private, account, or work data.                                  |
| Remote/cloud coding agents | Separate task/session history with explicit links into app surfaces               | These are agent jobs, not ordinary chat threads.                                                  |

## Anthropic Application Baseline

| Area                  | Current public baseline                                                                                                                                                                                                                                    | AGI implication                                                                                                                                          | Source                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Claude Projects       | Projects are self-contained workspaces with their own chat histories, knowledge bases, uploaded files, and project instructions.                                                                                                                           | AGI Web/Mobile/Desktop synced projects need chats, files, instructions, and privacy labels.                                                              | `https://support.claude.com/en/articles/9517075-what-are-projects`                    |
| Project management    | Claude supports moving chats into/out of projects; project memory from chat history is available on web, Claude Desktop, and Claude Mobile for eligible plans. Context is not automatically shared across project chats unless added to project knowledge. | AGI should separate project chat history from project knowledge. Moving a chat into a project should affect future project memory only with clear rules. | `https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects` |
| Artifacts             | Artifacts have a dedicated space in the Claude app; users can browse, customize, build from scratch, organize, share, and create AI-powered artifacts. Availability includes web, iOS/Android, and desktop for supported plans/features.                   | AGI artifacts should be a synced Web/Mobile/Desktop object with versions, rendering, sharing, and optional AI-powered app mode.                          | `https://claude.com/blog/build-artifacts`                                             |
| Connectors            | Claude supports remote web connectors across Claude, Claude Desktop, and Claude Mobile for paid plans; local desktop extensions exist on Claude Desktop.                                                                                                   | AGI connectors need a distinction between remote connectors synced to account and local desktop extensions bound to a device.                            | `https://support.anthropic.com/it/articles/11725091`                                  |
| Claude Code terminal  | Claude Code is a terminal coding agent with project awareness, MCP, CLAUDE.md, auto memory, skills, and hooks.                                                                                                                                             | AGI CLI should be the engine and developer workflow surface, but not a default global chat-sync surface.                                                 | `https://code.claude.com/docs/en/overview`                                            |
| Claude Code web/cloud | Claude Code on the web delegates parallel coding tasks to isolated cloud environments with real-time progress and PR creation.                                                                                                                             | AGI managed cloud coding should be separate task/session history, launched only after cloud policy and billing risk are solved.                          | `https://claude.com/blog/claude-code-on-the-web`                                      |
| Claude Code Desktop   | Claude Desktop Code has panes for chat, diff, preview, terminal, file, plan, tasks, and subagent; supports local/SSH/remote sessions, computer use, connectors, skills, plugins, preview servers, side chats, and continue-to-web/IDE.                     | AGI Desktop should sync normal chat, but Code/Cowork sessions should be workspace/task scoped with explicit continuation.                                | `https://code.claude.com/docs/en/desktop`                                             |
| Claude Mobile actions | Claude on Android can use system apps for messages, email, calendar, alarms/timers, location, and maps with preview cards.                                                                                                                                 | AGI Mobile can become an action surface, but app actions need previews and user confirmation.                                                            | `https://support.claude.com/en/articles/11869629-using-claude-with-android-apps`      |
| Claude Design         | Anthropic is expanding beyond chat/code into specialized creative/prototype/design application surfaces.                                                                                                                                                   | AGI should keep room for specialized app modes, but not make them v1 blockers.                                                                           | `https://www.anthropic.com/news`                                                      |

## OpenAI Application Baseline

| Area                       | Current public baseline                                                                                                                                                                            | AGI implication                                                                                                                 | Source                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ChatGPT Desktop            | ChatGPT desktop supports screenshots, files, web search, voice, and IDE edits from desktop.                                                                                                        | AGI Desktop should be a first-class app surface, not only a wrapper around web chat.                                            | `https://chatgpt.com/features/desktop/`                                            |
| ChatGPT Projects           | Projects organize chats, files, and custom instructions; users can switch devices between phone and web; apps links can be project sources; project sharing exists for teams and broad user plans. | AGI synced projects should prioritize Web/Mobile/Desktop continuity and team-ready sharing later.                               | `https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt`           |
| ChatGPT Apps               | OpenAI renamed connectors to apps. Apps include interactive UI, file search, deep research, sync, and write actions; app directory and custom app publishing are part of the product direction.    | AGI connector marketplace should support both data connectors and interactive apps, with workspace/admin action controls.       | `https://help.openai.com/en/articles/11487775`                                     |
| ChatGPT Canvas             | Canvas is available on Web, Windows, and macOS for writing/coding work, with editable side workspace, sandboxed React/HTML rendering, code execution controls, and network access admin toggles.   | AGI artifacts/canvas should be editable, versioned, sandboxed, and governed by admin network/code-execution policy.             | `https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt` |
| Codex web/cloud            | Codex web delegates coding tasks to cloud environments, can work in parallel, connects GitHub, and can create PRs.                                                                                 | AGI cloud coding should be a task plane, not ordinary chat sync.                                                                | `https://developers.openai.com/codex/cloud`                                        |
| Codex mobile remote access | ChatGPT mobile can connect to Codex running on a Mac host, showing project context, approvals, plugins, screenshots, terminal output, diffs, and test results.                                     | AGI Mobile should eventually be a controller for active local/remote developer sessions, not a silent copy of CLI chat history. | `https://help.openai.com/en/articles/6825453-chatgpt-release-notes`                |

## AGI Positioning

AGI should compete with both:

- Anthropic's application suite: Claude chat, Projects, Artifacts, Connectors, Claude Code, Claude Desktop Code, Claude Mobile actions, and specialized creative/design surfaces.
- OpenAI's application suite: ChatGPT Web/Mobile/Desktop, Projects, Canvas, Apps/App Directory, Codex Web, Codex Desktop, Codex Mobile remote access, and IDE/CLI coding agents.

AGI's differentiation should stay clear:

- Local-first and private by default.
- Explicit BYOK trust boundary.
- Multi-provider and model-routing friendly.
- Web/Mobile/Desktop chat sync only.
- CLI/VS Code/Chrome remain local/workspace/task scoped unless explicitly handed off.
- Shared engine contracts across all surfaces.
- Managed cloud delayed until billing, fraud, quotas, refunds, chargebacks, provider terms, and security posture are ready.

## Implementation Priorities From This Baseline

1. Create a shared conversation schema for Web/Mobile/Desktop only.
2. Create a separate developer session schema for CLI/VS Code/Chrome/Code Desktop sessions.
3. Add explicit `handoff` records from developer sessions into synced app chats.
4. Attach `PrivacyMode` to every conversation, message, artifact, project, session, and handoff.
5. Add a synced artifact/canvas contract for Web/Mobile/Desktop.
6. Add app/connector marketplace vocabulary that can represent MCP connectors, synced sources, interactive apps, and write actions.
7. Keep cloud coding/task execution out of v1 unless it is waitlisted/private beta.
