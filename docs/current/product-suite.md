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

| Surface | Current role                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Web     | Account, projects, synced app chats, artifacts, billing/waitlist, admin, web API routes.                                    |
| Desktop | Local-first compute host, MCP/connectors, local files, artifacts, generated files, desktop approvals.                       |
| Mobile  | Local/private mobile experience, explicit BYOK fork, preview/share for generated files, Desktop/local-host steering later.  |
| CLI     | Developer agent surface and Rust engine proving ground. Workspace/session scoped by default.                                |
| VS Code | IDE-native developer assistant. Workspace scoped unless explicit handoff is built.                                          |
| Chrome  | Browser-side assistant, page context, extension/native-host bridge. Workspace/task scoped unless explicit handoff is built. |

## Trust Modes

| Mode    | Meaning                                             | Rule                                                                                     |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local   | Runs on local device/local host.                    | Never silently routes to BYOK or managed cloud.                                          |
| BYOK    | Uses the user's provider key directly.              | Requires explicit provider label, consent, and payload preview when crossing from Local. |
| Managed | Uses AGI-managed provider access or hosted compute. | Waitlist/private beta until commercial and abuse controls are ready.                     |

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
