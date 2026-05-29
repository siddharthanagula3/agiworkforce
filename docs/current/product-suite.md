# Product Suite

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21

## Thesis

AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app and not just a CLI. The product baseline is Anthropic/OpenAI application parity across Web, Desktop, Mobile, CLI, VS Code, Chrome, shared engines, and future managed compute.

AGI does not try to be the next frontier-model lab. It tries to be the application layer users choose because it gives them Claude/ChatGPT-style workflows with local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute.

## Differentiation

- Local-first privacy: local chats do not silently leave the device.
- Explicit BYOK: user-owned provider keys are a separate trust boundary.
- Multi-provider routing: AGI-owned provider adapters, not one model family.
- Privacy-controlled managed compute: waitlist/private beta until billing, fraud, refunds, chargebacks, quota, and provider terms are solved.
- Six-surface continuity: Web, Desktop, Mobile, CLI, VS Code, and Chrome share contracts while keeping the right sync boundary.

## Surfaces

| Surface | Current role                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Account, projects, synced app chats, artifacts, billing/waitlist, admin, web API routes.                                           |
| Desktop | Local-first compute host, MCP/connectors, local files, artifacts, generated files, desktop approvals.                              |
| Mobile  | Small on-device Local LLM experience, Cloud invite/waitlist, preview/share for generated files, Desktop/local-host steering later. |
| CLI     | Developer agent surface and Rust engine proving ground. Workspace/session scoped by default.                                       |
| VS Code | IDE-native developer assistant. Workspace scoped unless explicit handoff is built.                                                 |
| Chrome  | Browser-side assistant, page context, extension/native-host bridge. Workspace/task scoped unless explicit handoff is built.        |

## Suite Requirements

Every surface must expose the same product contract even when the native implementation differs.

| Surface | Must ship before broad launch                                                                                                                       | Must not do                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Web     | Synced app chats, projects, artifacts, account/admin, Neon-backed subscription/waitlist state, generated-file preview/download.                     | Expose BYOK/free env-key chat or pretend Local compute is available in-browser without a connected host. |
| Desktop | Local-first chat, BYOK handoff preview, MCP/connectors, local files, generated-file manifests, computer-use approvals, Mobile/Desktop handoff host. | Silently upload Local chats or local generated files.                                                    |
| Mobile  | Small Local LLM default, Cloud invite/waitlist, preview/share generated files received from Desktop or managed compute, clear privacy labels.       | Expose Mobile BYOK in v1 or make heavy PDF/PPTX/DOCX generation the first local mobile compute battle.   |
| CLI     | Developer sessions, workspace-scoped tools, MCP/skills/hooks/plugins/subagents, privacy-mode commands, reproducible session/fork/replay contracts.  | Sync developer work into app chats without explicit handoff.                                             |
| VS Code | IDE chat participant/sidebar, workspace context, provider labels, tier/usage source, Desktop bridge, safe command execution.                        | Trust workspace settings for tier/API endpoint/security-sensitive config.                                |
| Chrome  | Browser context assistant, page-action approvals, native-host bridge, connector import, explicit page data boundary.                                | Treat browser page data as synced app-chat memory by default.                                            |

## Trust Modes

| Mode    | Meaning                                             | Rule                                                                                     |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local   | Runs on local device/local host.                    | Never silently routes to BYOK or managed cloud.                                          |
| BYOK    | Uses the user's provider key directly.              | Requires explicit provider label, consent, and payload preview when crossing from Local. |
| Managed | Uses AGI-managed provider access or hosted compute. | Waitlist/private beta until commercial and abuse controls are ready.                     |

Surface UI must source trust-boundary labels and descriptions from `@agiworkforce/types`
suite contracts instead of hardcoding new Local/BYOK/Managed wording.

Local to BYOK is a fork, not a mode flip. The original Local thread remains Local forever.

## Sync Boundary

Normal app chat sync is for Web, Mobile, and Desktop only.

CLI, VS Code, and Chrome stay local/workspace/task scoped unless the user explicitly hands off selected, redacted context into a synced app chat.

## Current Product Direction

- Build Anthropic/OpenAI application parity as the starting point.
- Keep local and BYOK useful without requiring users to pay AGI.
- Keep managed cloud gated until AGI can avoid burning founder money.
- Treat enterprise admin, audit, policy, SSO/SCIM, and managed-credit controls as required before broad managed compute.
- Prefer fewer, clearer current docs over many long competing specs.

## Not Current

Historical PRD, roadmap, pricing, and strategy docs in `docs/archive/2026-05-21-docs-consolidation/` are source material only. They do not override this folder, `PLAN.md`, `TODO.md`, or `docs/decisions/CURRENT_DECISIONS.md`.
