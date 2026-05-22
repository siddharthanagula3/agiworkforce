# Application Suite Thesis Research

Status: Current evidence
Owner: Product/platform
Last updated: 2026-05-20.

## Locked Thesis

AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI.

Differentiation is locked:

- Local-first.
- Explicit BYOK.
- Multi-provider.
- Privacy-controlled managed compute.

## Research Conclusion

The market baseline is now a suite:

- OpenAI is combining ChatGPT, Projects, Canvas, Apps/connectors, Desktop, Codex app, Codex CLI/IDE/web/mobile, remote host control, computer use, generated artifacts, and enterprise controls.
- Anthropic is combining Claude chat, Projects, Artifacts, Connectors/MCP, Claude Desktop, Claude Mobile, Claude Code CLI/IDE/desktop/web, cloud sessions, file creation, computer use, Cowork, and team/admin controls.

AGI Workforce should therefore ship parity as an application platform while preserving a different trust model: local/private first, BYOK as an explicit trust boundary, multi-provider choice, and managed compute only after risk controls exist.

## Official Evidence Table

| Product area         | OpenAI evidence                                                                                                                                                                                                                | Anthropic evidence                                                                                                                                                                                                                                                             | AGI implication                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects/workspaces  | ChatGPT Projects include project instructions, files, project memory, connected apps, sharing, branching, and collaboration.                                                                                                   | Claude Projects are self-contained workspaces with chat histories, knowledge bases, instructions, paid-plan RAG, and team sharing.                                                                                                                                             | Define one `Project` contract shared by Web/Desktop/Mobile and referenced by developer sessions.                                                   |
| Canvas/artifacts     | ChatGPT Canvas is an editing workspace for writing/code, inline suggestions, sandboxed React/HTML rendering, code execution/network controls, and sharing.                                                                     | Claude Artifacts use a dedicated artifact window, versioning, copy/download, publishing/sharing, AI-powered artifacts, MCP integration, and persistent storage.                                                                                                                | `Artifact`, `ArtifactVersion`, preview, sandbox, sharing, and generated-file links must be platform contracts.                                     |
| Apps/connectors      | ChatGPT Apps bring external tools/data into conversation with interactive apps, search, deep research, sync, admin controls, and compliance logs.                                                                              | Claude connectors work across Claude, Desktop, Mobile, Claude Code, and API; remote connectors are cross-surface, desktop extensions are local/Desktop/Code.                                                                                                                   | Build a connector/MCP registry that records surface availability, local-vs-remote trust, per-user auth, org policy, and permissions.               |
| Desktop/local host   | ChatGPT Desktop offers screen/file/screenshot workflows, desktop shortcut access, IDE edits, and voice. Codex App provides local worktrees, integrated terminal, in-app browser, computer use, and non-code artifact previews. | Claude Desktop has Chat, Cowork, and Code tabs. Claude Code Desktop supports local/remote/SSH sessions, panes, terminal, file editor, previews, PR monitoring, computer use, and shared CLI config. Cowork runs the agent loop on-device and code execution in an isolated VM. | Desktop is AGI's primary private compute host and remote-control anchor.                                                                           |
| Mobile               | Codex remote connections let mobile send prompts, approvals, and follow-ups to a connected host while the host supplies projects, files, credentials, plugins, MCP, browser, Computer Use, tools, and sandboxing.              | Claude Mobile supports chat, iOS app actions, file creation downloads via system preview/apps, and monitoring Code web/cloud tasks.                                                                                                                                            | Mobile should capture intent, approve actions, steer host/cloud work, preview/share artifacts and files, and avoid first-wave heavy local compute. |
| CLI/IDE/code         | Codex spans app, web, CLI, IDE extension, GitHub/Slack/Linear integrations, local environments, remote connections, browser, computer use, shell, MCP/connectors, and code interpreter.                                        | Claude Code is available in terminal, IDE, desktop app, and browser with CLI, VS Code, web cloud sessions, desktop code tab, Chrome extension beta, computer use, and GitHub automation.                                                                                       | CLI is the canonical developer engine; VS Code and Desktop Code must reuse the same developer-session protocol.                                    |
| Cloud/remote compute | Codex supports local, worktree, and cloud modes, remote connected hosts, SSH hosts, managed devboxes, remote mobile control, and non-code artifact previews.                                                                   | Claude Code web runs on Anthropic-managed cloud infrastructure with isolated VMs, setup scripts, network access controls, session sharing, PR automation, and move-between-web-terminal flows.                                                                                 | AGI needs `ComputeSession` abstraction with providers: LocalDesktop, UserSSH, ManagedRunner. Managed stays waitlist/private beta.                  |
| Generated files      | Codex app can preview PDFs, spreadsheets, documents, and presentations produced by tasks.                                                                                                                                      | Claude file creation creates Excel, PowerPoint, Word, and PDF files on web/Desktop/Mobile using isolated sandboxed execution and admin network controls.                                                                                                                       | Generated files need manifests, previews, downloads, retention, privacy mode, checksum, and source session tracking.                               |
| Computer use         | Codex computer use operates macOS apps by seeing, clicking, and typing with permissions because it can affect system state.                                                                                                    | Claude Desktop computer use controls real desktop apps after explicit enablement and app permissions; cloud sessions use isolated VMs.                                                                                                                                         | AGI needs a `ComputerAction` protocol that supports local desktop, browser, VNC/devbox, and provider-native tools with approvals.                  |
| Enterprise/admin     | ChatGPT Apps and Projects include app controls, RBAC, compliance logs/API, project sharing access levels, and enterprise controls.                                                                                             | Claude has org controls for connectors, project sharing, code execution/network egress, desktop extension restrictions, and managed-device policies.                                                                                                                           | Admin policy must govern privacy modes, connectors, network egress, managed compute, audit logs, and billing.                                      |

## Six-Surface Product Lock

| AGI surface | Must become                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Web         | The account/project/artifact/team/admin/managed-compute command center.                                    |
| Desktop     | The local-first private compute host and richest app shell.                                                |
| Mobile      | The continuity, capture, approval, notification, preview, and remote-control surface.                      |
| CLI         | The developer engine and Claude Code-compatible terminal surface.                                          |
| VS Code     | The IDE-native developer surface with inline edits, diffs, session history, and shared tools.              |
| Chrome      | The browser-context and web-action surface for research, capture, connector flows, and browser automation. |

## Platform Contracts To Build First

- `PrivacyMode`: `Local`, `Byok`, `Managed`.
- `ProviderMode`: `Local`, `DirectByok`, `ManagedGateway`, `ManagedNative`.
- `Conversation`: synced app chat for Web/Mobile/Desktop.
- `DeveloperSession`: local/workspace/task scoped session for CLI/VS Code/Chrome/Desktop Code.
- `Handoff`: explicit redacted transfer from developer session into synced app chat.
- `Project`: instructions, files, memory, sharing, privacy labels, provider defaults.
- `ArtifactManifest`: artifact type, versions, previews, generated files, share policy, storage policy.
- `ComputeSession`: local desktop, user SSH, local VM, or managed runner.
- `GeneratedFile`: owner, source session, privacy mode, checksum, MIME/type, preview derivative, storage URI, expiry.
- `ComputerAction`: observe/click/type/scroll/drag/keypress/set-value with permission and audit events.
- `Connector`: remote/local, MCP transport, OAuth, tool capabilities, surface availability, permission policy.
- `UsageLedger`: provider cost, quotas, reservation, settlement, refund/chargeback state, managed-mode owner.

## Locked Product Modes

| Mode             | Meaning                                                                            | Release posture                                         |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Local            | Runs on device/local host with local files and local model/tooling where possible. | Default trust posture.                                  |
| BYOK             | User uses their own provider key directly, after explicit setup and consent.       | Supported as a separate privacy/provider boundary.      |
| User remote host | User's SSH host, devbox, or always-on desktop provides compute.                    | Preferred bridge before managed cloud.                  |
| Managed compute  | AGI-controlled remote environment or gateway.                                      | Waitlist/private beta until risk controls are complete. |

## What AGI Should Not Do

- Do not position as a frontier LLM lab.
- Do not let cloud routing hide inside a "smart" auto-router.
- Do not subsidize broad public managed compute before metering and fraud controls exist.
- Do not sync CLI/VS Code/Chrome developer sessions into global app chat by default.
- Do not build six separate product contracts.
- Do not make Vercel/OpenAI/Anthropic SDKs the core architecture.

## Sources

OpenAI:

- https://developers.openai.com/codex/app/features
- https://developers.openai.com/codex/remote-connections
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- https://help.openai.com/en/articles/11487775-apps-in-chatgpt
- https://chatgpt.com/features/desktop/

Anthropic:

- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://support.claude.com/en/articles/9547008-publishing-and-sharing-artifacts
- https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
- https://support.claude.com/en/articles/11869619-using-claude-with-ios-apps
- https://code.claude.com/docs/en/overview
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/desktop
- https://support.claude.com/en/articles/14479288-claude-cowork-desktop-architecture-overview
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities
- https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors
- https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude
