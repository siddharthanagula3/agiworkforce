# OpenAI/Anthropic Application Suite Thesis

Status: Accepted
Owner: Founder + platform lead
Date: 2026-05-20
Last updated: 2026-05-20

## Decision

AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app and not just a CLI.

The required differentiation is locked:

- Local-first privacy.
- Explicit BYOK.
- Multi-provider routing.
- Privacy-controlled managed compute.

The six product surfaces are Web, Desktop, Mobile, CLI, VS Code, and Chrome. They must feel like one product with one runtime contract, not six unrelated apps.

## Context

OpenAI and Anthropic are no longer shipping only chat interfaces. Their current application direction includes projects, memory, artifacts/canvas, connectors/apps, desktop apps, mobile apps, code agents, cloud task execution, local/remote host control, generated files, enterprise controls, and collaboration workflows.

AGI Workforce should use those public product behaviors as the baseline feature-parity target while differentiating on privacy, portability, local compute, BYOK, and provider independence.

## Locked Surface Roles

| Surface | Locked role                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Account, projects, synced app chats, artifact library, sharing, billing/waitlist, team/admin controls, managed compute entry point.                                                                                          |
| Desktop | Primary local-private compute host, connected folders, local MCP/extensions, local generated files, computer use, artifacts, and remote-control host.                                                                        |
| Mobile  | Continuity, capture, voice/camera, approvals, notifications, generated-file preview/download/share, and remote control of Desktop/local host or future managed compute. Mobile is not the first heavy local compute surface. |
| CLI     | Developer engine, Claude Code muscle-memory parity, automation, local/BYOK workflows, session export/import, and engine protocol proving ground.                                                                             |
| VS Code | IDE-native developer surface using the same developer-session contract as CLI/Desktop Code.                                                                                                                                  |
| Chrome  | Browser-context, research/action, capture, web app automation, and connector bridge surface.                                                                                                                                 |

## Non-Negotiables

- Local chats and local developer sessions never silently route to BYOK or managed cloud.
- Local -> BYOK is an explicit fork or continuation draft with context selection, secret scan, payload preview, and visible provider label.
- Managed cloud stays waitlist/private beta until billing, fraud, quota, refunds, chargebacks, abuse controls, provider terms, retention, and deletion are proven.
- Normal chat sync is only for Web, Mobile, and Desktop.
- CLI, VS Code, and Chrome stay local/workspace/task scoped unless the user explicitly hands off a redacted preview into a synced app chat.
- OpenAI, Anthropic, Vercel, and other SDKs are adapters. AGI owns runtime schemas, event streams, privacy modes, tool contracts, provider routing, artifacts, generated-file manifests, and usage accounting.
- Feature parity claims require evidence from official docs or audited local code plus an AGI owner path and verification result.

## Required Shared Contracts

- `PrivacyMode`: `Local`, `Byok`, `Managed`.
- `ProviderMode`: `Local`, `DirectByok`, `ManagedGateway`, `ManagedNative`.
- Synced app conversation schema for Web/Mobile/Desktop.
- Separate developer session schema for CLI/VS Code/Chrome/Desktop Code.
- Explicit developer-session handoff schema into synced app chats.
- Project, project file, project memory, and project instruction schema.
- Artifact, artifact version, preview derivative, and sharing schema.
- `ComputeSession`, `GeneratedFile`, and `ArtifactManifest`.
- `ComputerAction` screenshot/action protocol.
- Connector/MCP registry and permission schema.
- Agent/subagent/task schema.
- Usage ledger, quota reservation, and future managed-credit accounting.

## Product Consequences

- Product acceptance is suite-level. A feature that exists only in one surface is incomplete until its cross-surface ownership and privacy behavior are defined.
- Desktop/local host is the safest near-term answer for private compute. Managed compute is a controlled future path, not the default launch posture.
- Mobile should provide a polished experience for requesting, monitoring, approving, previewing, downloading, and sharing work produced by Desktop/local host or future managed compute.
- BYOK must remain a trust-boundary choice, not a hidden cost-routing mechanism.
- Multi-provider support must preserve one AGI behavior contract even when provider-native capabilities differ.

## Evidence

Research summary:

- OpenAI ChatGPT Projects combine project instructions, files, project memory, connected apps, sharing, and collaboration.
- OpenAI Canvas provides a side workspace for writing/code editing, inline suggestions, sandboxed React/HTML rendering, code execution/network toggles, and shareable canvas assets.
- OpenAI ChatGPT Apps bring external tools and data into chat with interactive apps, search, deep research, sync, admin controls, and compliance logs.
- OpenAI Codex app includes local/worktree/cloud execution modes, integrated terminal, in-app browser, computer use, non-code artifact previews, IDE/CLI/web/mobile continuity, and remote connections where mobile controls a connected host.
- Anthropic Claude Projects provide self-contained workspaces with chat histories, knowledge bases, instructions, RAG on paid plans, and team sharing.
- Anthropic Artifacts provide a dedicated artifact window, versions, downloads, publishing/sharing, AI-powered artifacts, MCP integration, and persistent storage.
- Claude file creation/code execution can create PDFs, DOCX, XLSX, and PPTX from web, desktop, and mobile, using isolated sandboxed execution and plan/admin network controls.
- Claude Code spans terminal, IDE, desktop app, browser, remote/cloud sessions, GitHub automation, remote control, and mobile monitoring.
- Claude Desktop/Cowork uses native device execution for the agent loop and an isolated VM for shell/code execution, with device and organization controls.
- Claude connectors distinguish remote connectors that work across surfaces from local desktop extensions that run on Desktop and Claude Code.

Primary local evidence:

- `PLAN.md`
- `TODO.md`
- `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`
- `audit/anthropic-apps-parity/competitive-baseline-2026-05-20.md`
- `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`
- `audit/anthropic-apps-parity/compute-artifacts-2026-05-20.md`

Official source URLs:

- https://developers.openai.com/codex/app/features
- https://developers.openai.com/codex/remote-connections
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- https://help.openai.com/en/articles/11487775-apps-in-chatgpt
- https://chatgpt.com/features/desktop/
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
