# AGI Product Requirements Document

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-18

This is the long-form product requirements document for AGI and AGI Workforce.
It is the durable product spec for humans and coding agents when the compact
source-of-truth docs are not enough. Use it with:

- `docs/current/source-of-truth.md` for the compact product lock.
- `docs/current/parity-implementation-matrix.md` for feature-by-feature parity status.
- `docs/current/byok-open-model-provider-strategy.md` for provider and model routing.
- `docs/decisions/CURRENT_DECISIONS.md` for conflict resolution.

This document intentionally uses AGI-owned product language. OpenAI and
Anthropic are competitive references, not sources of proprietary implementation,
visual assets, or copy.

## 1. Executive Summary

AGI is an OpenAI/Anthropic-style application suite for users who want the same
level of product capability as ChatGPT, Claude, Codex, and Claude Code, without
being locked into one model lab.

The suite has six first-class surfaces:

1. Website
2. Mobile
3. Desktop
4. Chrome Extension
5. VS Code Extension
6. CLI

The locked development order is exactly the same as the list above. AGI works on
one surface at a time. The active surface is Website. Work advances through
Mobile, Desktop, Chrome Extension, VS Code Extension, and CLI in that order,
unless the founder explicitly authorizes later-surface work during QA, review,
or another waiting period.

AGI's core differentiation is:

- Local-first privacy.
- BYOK, meaning Bring Your Own Key.
- Multi-provider routing.
- Hosted open-model and local model support.
- Public-alpha AGI Managed Cloud (open by default; subscription/entitlement-gated).
- One unified chat that can handle normal chat, files, reference material,
  images, artifacts, tools, connectors, and developer workflows without splitting
  users into separate chat products.

AGI v1 must feel like a serious modern AI application suite, not a demo, not a
model playground, and not a collection of disconnected tools. Each surface should
have its own native shape, but all surfaces should share the same trust model,
model/provider rules, session model, artifact model, memory model, and source of
truth.

## 2. Locked Product Decisions

### 2.1 Brand

- Public product name: AGI.
- Formal platform and repo name: AGI Workforce.
- User-facing CLI command: `agi`.
- Internal repo, package, crate, and database identifiers may continue to use
  `agiworkforce` unless a separate migration is approved.

### 2.2 Development Order

The development order is locked:

| Order | Surface           | Meaning                                                                             |
| ----- | ----------------- | ----------------------------------------------------------------------------------- |
| 1     | Website           | Active surface: public site, signed-in Cloud product, account, and launch support.  |
| 2     | Mobile            | Native Local/Cloud app; must pass App Store release requirements.                   |
| 3     | Desktop           | Deepest Local/BYOK host, rich app shell, local files, MCP, artifacts, computer use. |
| 4     | Chrome Extension  | Browser context, capture, native bridge, page automation.                           |
| 5     | VS Code Extension | IDE-native developer workflow.                                                      |
| 6     | CLI               | Developer engine and terminal agent.                                                |

The parity ledger may track all six surfaces at all times. Implementation does
not run on all six at once. A future agent must not start Mobile, Desktop, Chrome,
VS Code, or CLI work just because the row exists in a parity matrix. The founder
must explicitly advance the release order or authorize next-surface work during
QA or waiting periods.

### 2.3 Mobile Release Definition

Mobile v1 is done only when:

- The public iOS app is released on the App Store.
- TestFlight QA has passed.
- App Store review blockers are resolved.
- Known release risks are documented.
- Privacy and support links are live.
- The app's Local trust boundary is verified.

Internal QA or TestFlight alone is not enough to move the primary development
focus from Mobile to Desktop.

### 2.4 Trust Modes

AGI has three user-visible trust modes:

| User label | Internal meaning                                           | User promise                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local      | Local runtime, local storage, local tools where available. | AGI does not silently send chats, files, tools, or developer sessions to BYOK or managed cloud.                                                                                                                                             |
| BYOK       | User-owned provider key and direct provider route.         | AGI uses the selected provider/model with visible provider labels and disclosure.                                                                                                                                                           |
| Cloud      | AGI-managed compute and provider access.                   | Public alpha, open by default (2026-06-27); metering, abuse, billing, retention, deletion, and provider-term controls keep pace but no longer gate access. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an incident-response kill-switch only. |

The original Local thread remains Local forever. Local to BYOK or Cloud is a
fork/continuation with selected context, secret scan, payload preview, provider
label, and user consent.

### 2.5 BYOK Native First

When BYOK is active and a provider/model offers native server tools, AGI should
prefer provider-native tools by default because users want OpenAI/Claude-level
capability parity.

This decision does not weaken the trust boundary. Native First means:

- Show provider and model before use.
- Show whether the tool is provider-native or AGI-local.
- Show retention/cost/capability disclosure before risky or new feature use.
- Ask for user consent before sending files, tool payloads, browser data,
  computer-use screenshots, or local workspace context to the provider.
- Fall back to AGI-local tools when native tools are unavailable or disabled.
- Never use native tools in Local mode.

### 2.6 Visual Parity

AGI targets workflow and capability parity, not proprietary copying.

Allowed:

- Similar information architecture.
- Similar feature availability.
- Similar user workflows.
- Similar control types when they are standard product conventions.
- AGI-owned visual language that feels competitive.

Not allowed:

- Copying proprietary code.
- Copying protected product assets.
- Copying product names or branding.
- Pixel-perfect imitation that confuses users about product origin.

### 2.7 Source Of Truth

Current product truth lives in `docs/current`. Historical docs and generated
reports are evidence only unless current docs explicitly promote them.

Completion claims require evidence. A feature is not complete because a component
exists, a route compiles, or a typecheck passes. A feature is complete only when:

- The user can perform the workflow in the UI or surface.
- The backend/runtime path works.
- The response/result is visible.
- Persistence and sync behavior match the trust boundary.
- Errors and unavailable states are handled.
- Tests or manual verification evidence exist.
- The parity ledger status is updated.

## 3. Competitive Reference Baseline

The reference products are:

- ChatGPT web, mobile, and desktop.
- ChatGPT Projects, Memory, Tasks, Canvas, files, voice, search, data analysis,
  image generation/editing, apps/connectors, and custom GPT-style workflows.
- OpenAI Codex app, CLI, IDE extension, Chrome extension, cloud tasks,
  automations, skills, plugins, worktrees, browser/computer use, generated
  artifacts, and code review.
- Claude web, mobile, and desktop.
- Claude Projects, Artifacts, Memory/personalization, connectors, MCP, computer
  use, and scheduled/dispatch-style work.
- Claude Code CLI, Desktop Code tab, VS Code extension, Chrome integration,
  Remote Control, Routines, worktrees, permissions, hooks, skills, plugins,
  subagents, MCP, sessions, checkpointing, context compaction, and cloud sessions.

Official references checked for this PRD include:

| Area                       | Official source                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| OpenAI Codex app           | https://developers.openai.com/codex/app/features                             |
| OpenAI Codex CLI           | https://developers.openai.com/codex/cli/features                             |
| OpenAI Codex IDE           | https://developers.openai.com/codex/ide/features                             |
| OpenAI Codex Chrome        | https://developers.openai.com/codex/app/chrome-extension                     |
| OpenAI Responses/tools     | https://developers.openai.com/api/docs/guides/tools                          |
| OpenAI function calling    | https://developers.openai.com/api/docs/guides/function-calling               |
| OpenAI file inputs         | https://developers.openai.com/api/docs/guides/file-inputs                    |
| OpenAI background mode     | https://developers.openai.com/api/docs/guides/background                     |
| OpenAI Realtime/audio      | https://developers.openai.com/api/docs/guides/realtime                       |
| OpenAI ChatKit             | https://developers.openai.com/api/docs/guides/chatkit                        |
| Claude Code Desktop        | https://code.claude.com/docs/en/desktop                                      |
| Claude Code VS Code        | https://code.claude.com/docs/en/vs-code                                      |
| Claude Code Chrome         | https://code.claude.com/docs/en/chrome                                       |
| Claude Code Remote Control | https://code.claude.com/docs/en/remote-control                               |
| Claude Code Routines       | https://code.claude.com/docs/en/routines                                     |
| Claude Code platforms      | https://code.claude.com/docs/en/platforms                                    |
| Claude Code model config   | https://code.claude.com/docs/en/model-config                                 |
| Claude API models          | https://platform.claude.com/docs/en/about-claude/models/overview             |
| Claude tool use            | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview       |
| Claude server tools        | https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools   |
| Claude data retention      | https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention |
| Claude Managed Agents      | https://platform.claude.com/docs/en/managed-agents/overview                  |

The external Claude reference folder at
`/Users/siddhartha/Desktop/claude_reference` is evidence for product parity
research only. Do not copy proprietary assets from it.

The local Claude reference also includes a Claude Design-style visual workspace:
canvas, artboards, project files, prototype mode, and deck/design generation.
AGI treats this as a visual artifact/design workspace requirement inside the
existing Web/Desktop/Mobile artifact model, not as a seventh first-class surface
and not as permission to copy Claude assets, names, or layouts.

## 4. Product Principles

### 4.1 One Product, Six Surfaces

AGI is one product suite. A user should not feel like the Mobile app, Website,
Desktop app, CLI, Chrome extension, and VS Code extension are unrelated tools.
They may have different capabilities, but they should share:

- The same account concepts where accounts exist.
- The same Local/BYOK/Cloud trust labels.
- The same provider/model naming rules.
- The same memory and privacy concepts.
- The same file and artifact vocabulary.
- The same permissions model for tools and external actions.
- The same visible limits and unavailable states.

### 4.2 One Chat

AGI should not create a separate product route for "file chat" versus "normal
chat." Users should be able to start one chat and add files, references, images,
project context, tools, connectors, or artifacts as needed.

File-focused work is a state of a conversation, not a separate chat surface.

### 4.3 Capability Honesty

AGI should never claim that a model/provider can do something if capability
metadata does not prove it.

Examples:

- If a local model cannot call tools, hide or disable tool use for that route.
- If a provider does not support vision, do not accept image input for that
  route unless AGI adds a separate vision preprocessing path and labels it.
- If a hosted open model is routed through an aggregator, label the aggregator
  and actual upstream route when known.
- If provider retention is unknown, show "provider policy unknown" instead of
  inventing a privacy promise.

### 4.4 Trust Boundary Clarity

Every message, file, tool call, generated artifact, memory item, connector, and
browser/computer-use action must know which trust boundary it belongs to.

Users must be able to answer:

- Is this local?
- Which provider/model is used?
- Will this use my API key?
- Will AGI pay for this?
- Will a third party receive this file or prompt?
- Is this stored locally, synced, or provider-retained?
- Can I delete it?

### 4.5 Website First, One Suite

Website is the first release surface and the active development focus. Mobile
follows, then Desktop, Chrome, VS Code, and CLI. Website-first does not weaken
the suite boundaries: Desktop will eventually carry the deepest Local and BYOK
workflows, while Chrome, VS Code, and CLI carry the developer workflows suited
to their native surfaces.

Website v1 should prove AGI can ship a polished, privacy-clear, user-facing Cloud
product without pretending later native or developer surfaces are already
released.

## 5. Target Users

### 5.1 Initial Public Users

The earliest public users are privacy-conscious AI users who are frustrated by
model lock-in and want a serious alternative to ChatGPT and Claude.

They care about:

- Running locally.
- Knowing where their data goes.
- Using the model/provider they prefer.
- Getting a familiar chat experience.
- Avoiding subscription lock-in before AGI Managed Cloud is ready.

### 5.2 Developer Users

Developer users eventually become the strongest AGI audience. They care about:

- Local project context.
- CLI and IDE workflows.
- Worktrees.
- Diffs.
- Terminal output.
- Browser testing.
- MCP servers.
- Hooks, skills, plugins, and subagents.
- BYOK and local models.
- Avoiding silent cloud routing.

Developer workflows are central to the company vision, but Mobile is still the
first active release surface.

### 5.3 Power Users And Teams

Power users and teams care about:

- Projects.
- Memory.
- Shared artifacts.
- Connectors.
- Billing.
- Usage limits.
- Admin controls.
- Data retention.
- Export/delete controls.
- Audit trails.

These users require stronger account, billing, cloud, and enterprise controls
before AGI can responsibly launch Managed Cloud broadly.

## 6. Global Information Architecture

### 6.1 Universal Composer

Every chat-like surface should converge on one composer pattern:

- Input box.
- Plus/add control.
- File/attachment control.
- Model selector.
- Mic control.
- Send/stop control.
- Visible mode/provider label where routing matters.

Surface adaptations are allowed. The underlying concepts should remain stable.

### 6.2 Universal Chat Concepts

Every chat surface should support or explicitly gate:

- New chat.
- Recent chats.
- Temporary/private chat.
- Conversation title.
- Message streaming.
- Stop/cancel.
- Retry/regenerate.
- Edit/resend.
- Branch/fork.
- Copy.
- Feedback.
- Share/export where allowed.
- Attach files/images.
- Reference project files/sources.
- Show model/provider/mode labels.
- Show tool calls and results.
- Show generated artifacts.
- Show errors and recovery actions.

### 6.3 Universal Sidebar Concepts

Surfaces with a sidebar should include:

- Search.
- Collapse/expand.
- New chat.
- Projects.
- Artifacts.
- Recent chats.
- Feature links relevant to the surface.
- Account area with initials, name, workspace/account, and feedback affordance.

### 6.4 Universal Account Menu

The account menu must include:

- Settings.
- Language.
- Get help.
- Learn more.
- Logout.

### 6.5 Universal Settings Sections

The target top-level settings IA is:

- General.
- Account.
- Privacy.
- Billing.
- Usage.
- Capabilities.
- Connectors.
- AGI Code.
- AGI in Chrome.
- Extensions.
- Developer.

Not every surface needs every panel in v1, but the vocabulary and eventual IA are
locked.

## 7. Trust Modes And Data Flow

### 7.1 Local Mode

Local mode means:

- No AGI account required.
- Local storage by default.
- Local model/runtime where available.
- Local files remain local.
- Local tools run on local device or local host.
- No hidden provider/API/cloud call.
- No sync unless the user explicitly signs in and moves selected content into a
  synced app-chat boundary.

Local mode must fail closed. If a requested capability requires remote compute,
the app must show the requirement and offer a fork/continuation, not silently
route.

### 7.2 BYOK Mode

BYOK mode means:

- The user supplies the provider key or endpoint credentials.
- Prompts/files/tool payloads may go to the selected provider.
- AGI does not pay for the inference.
- AGI must label provider, model, endpoint class, and tool route.
- Provider retention/training terms must be disclosed from verified metadata or
  marked unknown.

BYOK cannot be treated as "private like Local." It is user-controlled provider
routing, not local execution.

### 7.3 Cloud Mode

Cloud mode means:

- AGI-managed provider access or AGI-managed compute.
- AGI pays or meters costs.
- User may need account, invite, billing, and abuse controls.
- Cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. The account/invite/billing/abuse controls keep pace with public usage but no longer gate access.

Public UI presents managed cloud as public alpha (open by default) and may still
offer waitlist/invite entry for genuinely unavailable hosted capacity. It should
label managed cloud as public alpha and must not over-claim full general
availability or SLA guarantees it cannot yet honor.

### 7.4 Trust Boundary Crossing

Crossing from Local to BYOK or Cloud requires:

1. User action to continue/fork.
2. Context selection.
3. Secret scan/redaction warning.
4. Payload preview.
5. Provider/model/route label.
6. Retention/cost disclosure.
7. Consent.
8. New branch/continuation, preserving the Local original.

## 8. Provider And Model Requirements

### 8.1 Provider Route Object

AGI must treat a route as:

```text
provider + endpoint class + model id + capability metadata + pricing metadata + privacy/retention claim + runtime health
```

Model name alone is not enough.

### 8.2 Capability Metadata

Each route needs metadata for:

- Text input/output.
- Image input.
- Audio input/output.
- File input.
- Video input/output where relevant.
- Function/tool calling.
- Parallel tool calls.
- Tool search/deferred tool loading.
- JSON/structured output.
- Reasoning/thinking/effort controls.
- Prompt caching.
- Context length.
- Max output.
- Code execution.
- Computer use.
- Web search/fetch.
- File search/RAG.
- Remote MCP.
- Local shell support.
- Streaming format.
- Background mode.
- Stateful server conversation support.
- Retention/storage defaults.
- Cost/pricing units.
- Rate limits and health.

### 8.3 Provider Groups

The long-term provider setup should group routes as:

1. Direct provider keys:
   - OpenAI.
   - Anthropic.
   - Google.
   - xAI.
   - Mistral.
   - DeepSeek.
   - Qwen/Alibaba Model Studio.
   - Kimi/Moonshot.
   - Z.ai/GLM.
   - Cohere.
   - AI21.
   - Azure.
   - Bedrock.
2. Hosted open-model APIs:
   - OpenRouter.
   - NVIDIA NIM.
   - Together.
   - Fireworks.
   - Groq.
   - Cerebras.
   - DeepInfra.
   - Hugging Face Inference Providers.
   - Replicate.
   - SambaNova.
3. Local runtimes:
   - Ollama.
   - LM Studio.
   - llama.cpp.
   - vLLM.
   - Text Generation Inference.
   - MLX/Apple Silicon routes.
4. AGI Managed Cloud:
   - Public alpha, open by default (2026-06-27); subscription/entitlement-gated, no longer waitlist-gated. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is a kill-switch only.

### 8.4 OpenAI-Specific Requirements

For OpenAI direct BYOK:

- Prefer the current Responses API for new OpenAI-native capability when route
  metadata supports it.
- Preserve Chat Completions fallback for OpenAI-compatible providers and older
  flows.
- Use `store: false` for Local/BYOK privacy-preserving calls where supported and
  appropriate.
- Treat background mode as non-ZDR because it requires stored response data.
- Track `previous_response_id`/conversation state consistently; do not mix state
  strategies in one conversation.
- Persist tool call/output turns, not only final text.
- Use strict schemas for safety-critical tools.
- Treat OpenAI built-in tools, local AGI tools, and remote MCP tools as separate
  execution classes with separate disclosures.

### 8.5 Anthropic-Specific Requirements

For Anthropic direct BYOK:

- Use Messages API semantics for custom agent loops.
- Distinguish client tools from server tools.
- Client tools return `tool_use` and require AGI to execute and return
  `tool_result`.
- Server tools return `server_tool_use` and execute on Anthropic infrastructure.
- Handle `pause_turn` continuation for long-running server tools.
- Preserve thinking blocks where required for tool-use continuity.
- Use model/capability metadata from official Models API/docs, not guessed model
  IDs.
- Treat code execution, Files API, Managed Agents, MCP connectors, and agent
  skills as non-ZDR or special-retention features unless official metadata says
  otherwise.

### 8.6 Tool Search

Tool search/deferred tool loading is a core AGI requirement. Large tool catalogs
must not be dumped into every prompt.

AGI should implement provider-neutral tool discovery:

- Start with a small default tool set.
- Search/load tools when relevant.
- Expose provider-native tool search where supported.
- Preserve tool source, permission, schema version, and retention label.
- Support local fallback for providers without native tool search.

## 9. Shared Agent Harness Requirements

The same conceptual harness must power every surface, even if implementation
details differ.

### 9.1 Sessions

A session must include:

- Session id.
- Surface.
- User/account state when applicable.
- Trust mode.
- Provider route.
- Model route.
- Project/workspace context.
- Messages and tool events.
- Attachments and generated files.
- Memory references.
- Artifact references.
- Approval state.
- Cancellation/interruption state.
- Sync scope.

### 9.2 Conversation Branching

AGI must support branches/forks because:

- Local to BYOK must preserve the original Local thread.
- Users need safe alternate attempts.
- Developers need multi-track debugging.
- Cloud handoff must not overwrite local context.

Branch metadata must record:

- Source session.
- Selected context.
- Trust boundary change.
- Provider/model change.
- Redaction result.
- User consent time.

### 9.3 Tool Events

Tool events must be persisted as first-class items:

- Tool name.
- Tool source: AGI local, provider-native, remote MCP, connector, browser,
  computer use, shell.
- Arguments or redacted preview.
- Approval state.
- Execution result.
- Error.
- Duration.
- Provider/runtime used.
- Retention/storage label.

### 9.4 Files

Files must have:

- File id.
- Name.
- MIME/type.
- Size.
- Source.
- Surface.
- Trust mode.
- Storage location.
- Scan/redaction status.
- Provider-upload status.
- Deletion behavior.
- Artifact relationship if generated.

### 9.5 Artifacts

Artifacts must have:

- Artifact id.
- Title.
- Type.
- Source message/tool/session.
- Generated files.
- Preview renderer.
- Source view where applicable.
- Version history.
- Copy/download/export actions.
- Share/publish state.
- Error-fix loop.
- Retention/delete behavior.

### 9.6 Memory

Memory must distinguish:

- Saved user memory.
- Chat-history reference.
- Project memory.
- Temporary chat exclusion.
- Imported memory from other AI providers.
- Surface-specific local memory.

Temporary chats must not update or reference memory unless the user explicitly
changes that behavior.

### 9.7 Approvals

Approval prompts must be used for:

- Local to BYOK/Cloud crossing.
- External connector writes.
- Browser actions on new/sensitive domains.
- Computer-use actions with real-world consequences.
- Shell/network/file operations outside safe defaults.
- Sending files/screenshots/local workspace context to a provider.
- Cloud spend or usage-credit actions.

Approval prompts must show the action, target, provider/tool, risk, scope, and
available choices.

## 10. Mobile V1 PRD

Mobile is the second release surface. Mobile implementation becomes active after
Website release readiness, unless the founder explicitly says otherwise.

### 10.1 Mobile V1 Goal

Ship a polished iOS app publicly on the App Store that proves AGI's Local-first
privacy thesis and creates demand for Cloud invite access.

Mobile v1 is not expected to be the deepest AGI surface. It must be reliable,
privacy-clear, and released.

### 10.2 Mobile V1 Scope

Mobile v1 must include:

- Native app shell.
- First-run onboarding.
- Local mode explanation and setup.
- On-device Local LLM chat path where supported by the current app/runtime.
- Unified chat composer.
- Basic model selector for available local model routes.
- Chat history local to the app.
- Attachment-ready controls with honest unavailable states.
- Mic/dictation-ready control with honest unavailable states if not fully live.
- Cloud sign-in entry (public alpha, open by default; no waitlist).
- Profile/settings/privacy basics.
- Support, privacy policy, and delete/export/account paths as required for
  release.
- QA and App Store readiness.

Mobile v1 should not publicly promise:

- Broad AGI Managed Cloud.
- Unlimited compute credits.
- Full Desktop-level BYOK provider tooling.
- Mobile BYOK in v1.
- Full developer agent capabilities.
- Full artifact generation parity.
- Full connector/app directory parity.

Mobile BYOK is not part of Mobile v1. The public Mobile path is small on-device
Local LLM chat plus public-alpha Cloud sign-in; Cloud requires signed-in
subscription/entitlement state before any hosted model request is allowed.

### 10.3 Mobile V1 Non-Goals

Mobile v1 does not need to ship:

- CLI-like agent workflows.
- Worktrees.
- Local desktop computer use.
- Chrome browser automation.
- VS Code integration.
- Full connector directory.
- Full billing/usage-credit purchase path.
- Team/admin console.
- Heavy local document generation.
- Full Claude/ChatGPT project collaboration.

These remain suite requirements for later surfaces.

### 10.4 Mobile User Stories

#### M-US-001: First-Time Local User

As a user, I can install AGI, understand that Local mode keeps work on my device,
select or install an available local model route, and start chatting without
creating an AGI account.

Acceptance criteria:

- The onboarding explains Local mode in plain language.
- The user is not forced to sign in for Local.
- The app shows whether a local model is available.
- The app handles no-model state with setup guidance.
- The first chat does not call BYOK or Cloud routes.

#### M-US-002: Cloud Sign-In User

As a user, I can sign in to unlock Cloud without being misled that Cloud is
anything beyond public alpha.

Acceptance criteria:

- Sign-in entry is visible from the Cloud toggle/model picker.
- Cloud is labeled public alpha, not general availability.
- Failed sign-in attempts produce a helpful error.
- A successful sign-in unlocks Cloud immediately — no separate invite code or waitlist step.
- Cloud use is not silently mixed into Local chats.

#### M-US-003: Returning Chat User

As a user, I can reopen AGI, see recent local chats, continue a chat, and know
which mode/provider is being used.

Acceptance criteria:

- Recent chats appear after relaunch.
- Chat titles are generated or editable.
- The active trust mode is visible.
- Temporary/private chats are clearly marked if supported.
- Errors do not erase chat history.

#### M-US-004: File-Oriented User

As a user, I can start a normal chat and add a file or image when the selected
route supports it, without switching into a separate file-chat product.

Acceptance criteria:

- File/image controls are present.
- Unsupported file types or unsupported routes show clear disabled states.
- Selected files show chips/previews.
- Removing a file before send works.
- Sending a file cannot cross Local to BYOK/Cloud without consent.

#### M-US-005: Voice User

As a user, I can use the mic affordance for dictation or see exactly why voice is
not available yet.

Acceptance criteria:

- Mic button exists.
- The app distinguishes dictation from live voice conversation.
- Permission prompts use native iOS expectations.
- Transcript/edit-before-send exists for dictation.
- If live voice is not v1, the app says unavailable without broken controls.

#### M-US-006: Privacy-Conscious User

As a user, I can inspect privacy settings, understand what is local, export or
delete data where applicable, and avoid training/retention surprises.

Acceptance criteria:

- Privacy screen exists.
- Local data behavior is explained.
- Cloud sign-in behavior (public alpha, no waitlist) is explained.
- BYOK behavior, if present, is provider-labeled.
- Data export/delete/account paths are present or clearly scoped.

### 10.5 Mobile Onboarding Requirements

Requirement IDs:

| ID        | Requirement                                                                 | Acceptance                                                                     |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| M-ONB-001 | First launch shows AGI brand, Local-first positioning, and privacy summary. | User can proceed without account.                                              |
| M-ONB-002 | Onboarding explains three modes: Local, BYOK, Cloud.                        | BYOK/Cloud unavailable states are honest and not presented as public if gated. |
| M-ONB-003 | Local model readiness is checked.                                           | App shows installed/available/unavailable state.                               |
| M-ONB-004 | User can enter main chat after onboarding.                                  | First chat opens to the unified composer.                                      |
| M-ONB-005 | Cloud sign-in entry is reachable.                                           | Sign-in flow does not block Local use.                                         |

### 10.6 Mobile Chat Requirements

| ID         | Requirement                                                        | Acceptance                                                                                                            |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| M-CHAT-001 | Empty state includes input, plus, file, model selector, mic, send. | Controls fit on mobile and do not overlap.                                                                            |
| M-CHAT-002 | Sending a Local message uses only the selected local route.        | Network/provider calls are not made for Local inference unless explicitly part of local runtime setup and documented. |
| M-CHAT-003 | Streaming response is visible.                                     | User sees running state and can stop.                                                                                 |
| M-CHAT-004 | Stop/cancel works.                                                 | Interrupted state is recorded and UI recovers.                                                                        |
| M-CHAT-005 | Message actions include copy and retry at minimum.                 | Actions work after app reload.                                                                                        |
| M-CHAT-006 | Chat history persists locally.                                     | Relaunch restores recent chats.                                                                                       |
| M-CHAT-007 | Mode/provider label is visible.                                    | User can tell Local/BYOK/Cloud state before sending.                                                                  |
| M-CHAT-008 | Error states are readable.                                         | No silent failure; no erased messages.                                                                                |

### 10.7 Mobile Composer Requirements

| Control        | V1 behavior                                                         |
| -------------- | ------------------------------------------------------------------- |
| Text input     | Multi-line capable, keyboard-safe, sends on explicit action.        |
| Plus           | Opens action sheet with file/photo/camera/tools/unavailable states. |
| File           | Opens file picker or explains unsupported route/type.               |
| Model selector | Shows available local routes first; gated routes labeled.           |
| Mic            | Starts dictation or shows voice setup/unavailable state.            |
| Send/stop      | Send when idle; stop while running.                                 |

The composer must not resize or overlap badly on small devices. It must support
dark and light appearance.

### 10.8 Mobile Model Selector Requirements

| ID          | Requirement                                                     | Acceptance                                                                    |
| ----------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M-MODEL-001 | Selector reads model/provider catalog or mobile route metadata. | No invented model IDs in UI.                                                  |
| M-MODEL-002 | Local models show availability.                                 | Installed, downloadable, unavailable, or runtime-offline states are distinct. |
| M-MODEL-003 | Locked Cloud models are labeled sign-in required.               | User cannot accidentally start Cloud.                                         |
| M-MODEL-004 | BYOK routes, if shown, are provider-labeled and gated.          | Key/consent state is visible before use.                                      |
| M-MODEL-005 | Unsupported capabilities are visible.                           | File/image/tool controls respond to selected model capability.                |

### 10.9 Mobile Files And Images Requirements

| ID         | Requirement                                                          | Acceptance                                                 |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| M-FILE-001 | User can select a file/image when route supports it.                 | Attachment chip appears with name/type/size.               |
| M-FILE-002 | Unsupported route shows reason.                                      | User sees "not supported by selected model" or equivalent. |
| M-FILE-003 | Local files do not leave device in Local mode.                       | Trust-boundary test verifies no hidden provider send.      |
| M-FILE-004 | User can remove attachment before send.                              | Removed file is not included in payload.                   |
| M-FILE-005 | Image input is supported only if selected route/runtime supports it. | No fake vision claim.                                      |

### 10.10 Mobile Voice Requirements

| ID          | Requirement                                    | Acceptance                                           |
| ----------- | ---------------------------------------------- | ---------------------------------------------------- |
| M-VOICE-001 | Mic button exists in composer.                 | Visible and accessible.                              |
| M-VOICE-002 | Dictation flow requests microphone permission. | Native permission state handled.                     |
| M-VOICE-003 | Dictated text can be edited before send.       | User can cancel or send.                             |
| M-VOICE-004 | Live voice mode is separate from dictation.    | If unavailable, UI labels it unavailable.            |
| M-VOICE-005 | Voice privacy is documented.                   | User knows whether audio is local or provider/cloud. |

### 10.11 Mobile Cloud Sign-In Requirements

| ID          | Requirement                         | Acceptance                                              |
| ----------- | ----------------------------------- | ------------------------------------------------------- |
| M-CLOUD-001 | Sign-in screen exists.              | User can sign in to unlock Cloud.                       |
| M-CLOUD-002 | Sign-in unlocks Cloud immediately.  | No separate invite code or waitlist step.               |
| M-CLOUD-003 | Cloud is labeled public alpha.      | No general-availability/SLA over-claim.                 |
| M-CLOUD-004 | Cloud access is entitlement-scoped. | Cloud features remain gated to the account's plan tier. |
| M-CLOUD-005 | Cloud cannot hijack Local chats.    | Cloud continuation is a fork/branch.                    |

### 10.12 Mobile Settings Requirements

Mobile v1 settings must include at minimum:

- Profile/account entry.
- Local privacy explanation.
- Cloud sign-in/subscription status.
- Data controls.
- Appearance.
- Model/local runtime controls.
- Voice permission/status.
- Notifications permission/status.
- Help/support.
- Learn more.
- Logout if signed in.

Mobile settings can defer full Desktop settings IA, but labels should align with
the suite-wide settings vocabulary.

### 10.13 Mobile Privacy Requirements

| ID         | Requirement                                             | Acceptance                                  |
| ---------- | ------------------------------------------------------- | ------------------------------------------- |
| M-PRIV-001 | Local mode privacy statement is in onboarding/settings. | User can find it after onboarding.          |
| M-PRIV-002 | No account required for Local.                          | App does not block Local chat behind login. |
| M-PRIV-003 | Local chat data location is explained.                  | User understands local storage scope.       |
| M-PRIV-004 | BYOK, if enabled, is not described as local.            | Provider label appears.                     |
| M-PRIV-005 | Cloud sign-in explains data may leave device when used. | Consent before Cloud send.                  |

### 10.14 Mobile App Store Requirements

Before public release:

- App name, subtitle, screenshots, description, support URL, privacy policy URL,
  age rating, and app category are complete.
- Privacy nutrition labels match actual data behavior.
- Login is not required for core Local functionality unless technically
  unavoidable and approved.
- Any payments/subscriptions are either absent or compliant.
- Cloud sign-in wording does not imply unavailable paid compute or waitlist gating.
- App handles offline/no-model/no-permission states.
- Crash-free QA threshold is acceptable.
- TestFlight external testing has passed.

### 10.15 Mobile QA Matrix

Minimum QA scenarios:

| Scenario                      | Expected result                                  |
| ----------------------------- | ------------------------------------------------ |
| Fresh install, no account     | User reaches Local chat.                         |
| Fresh install, no local model | User sees setup/unavailable guidance.            |
| Local text prompt             | Response uses Local route only.                  |
| Stop generation               | Stream stops cleanly.                            |
| Relaunch app                  | Recent local chat is visible.                    |
| Attach unsupported file       | User sees capability error.                      |
| Tap mic with no permission    | Permission prompt or unavailable state appears.  |
| Cloud sign-in                 | Sign-in success/failure states work.             |
| Failed sign-in                | Clear error.                                     |
| Successful sign-in            | Cloud unlocks immediately at the account's tier. |
| Toggle dark/light             | UI remains legible.                              |
| Offline mode                  | App fails gracefully.                            |

## 11. Website Requirements

Website is first in development order and is the active release surface.

Website's role:

- Explain AGI.
- Convert visitors to Mobile downloads and Cloud sign-ups.
- Provide privacy/support/legal links.
- Provide Cloud sign-in entry/status.
- Provide account shell for Cloud sign-in, billing, and Cloud.
- Provide docs and comparisons without overclaiming.

Website v1 should include:

- Home/product page.
- Mobile download page.
- Cloud sign-in entry.
- Pricing/plan placeholder that does not sell unready Cloud.
- Privacy policy.
- Terms.
- Support/help.
- Blog/changelog or launch notes if useful.
- Account shell when needed for Cloud sign-in.

Website must not launch a full Cloud chat product before the Cloud controls are
proven.

## 12. Desktop Requirements

Desktop is third in development order and eventually the deepest surface.

Desktop's role:

- Local-private compute host.
- Rich chat app.
- BYOK provider setup.
- Local files.
- MCP/connectors.
- Artifacts.
- Browser/computer use approvals.
- AGI Code workflows.
- Native bridge for Chrome and other surfaces.
- Cloud (public alpha) sign-in entry.

Desktop must expose:

- Local mode.
- BYOK mode.
- Cloud (public alpha) mode.
- Sidebar with search, new chat, projects, artifacts, recents, account.
- Full settings IA.
- Model/provider selector with capability metadata.
- Unified one-chat file/reference/artifact flow.
- MCP server config/logs.
- Connectors directory and permissions.
- Computer use controls.
- Browser use controls.
- Scheduled tasks/routines.
- AGI Code/Cowork-style task surfaces.

Desktop is where BYOK Native First matters most for v1 parity. It must support
native provider tools when the user enables them and capability metadata proves
support.

## 13. CLI Requirements

CLI is sixth in development order.

CLI's role:

- Developer agent engine.
- Terminal-native chat and execution.
- Local/BYOK/Cloud-gated modes.
- Sessions/resume/branch.
- Permissions.
- Shell/tool execution.
- MCP/plugins/skills/hooks.
- Subagents.
- Review flows.
- Workspaces/worktrees.
- Cloud handoff when invited.

CLI must include:

- `agi` command.
- Interactive TUI/REPL.
- Non-interactive exec.
- Slash commands.
- Model/mode selector.
- Approval modes.
- Local shell.
- Tool call trace.
- Local session transcripts.
- Resume/branch.
- Image/file input where supported.
- Web search where allowed.
- MCP server management.
- Hooks and skills.

CLI must stay local/workspace scoped unless the user explicitly hands off a
redacted preview to synced app chat or Cloud.

## 14. Chrome Extension Requirements

Chrome Extension is fourth in development order.

Chrome's role:

- Browser context.
- Page capture.
- Logged-in browser workflows.
- Native bridge to Desktop/CLI runtime.
- Site permissions.
- Automation with high-risk confirmations.

Chrome must include:

- Popup or side panel.
- Connected/native host status.
- Page context capture.
- Ask/act modes.
- Per-site allow/deny prompts.
- Allowlist/blocklist.
- Browser history access only by explicit request; no always-allow history.
- File URL access guidance.
- Prompt-injection defenses.
- High-impact action confirmation.
- Clear task-scoped memory/data boundary.

Page content is untrusted. Browser data must not enter global memory or synced
chat by default.

## 15. VS Code Extension Requirements

VS Code Extension is fifth in development order.

VS Code's role:

- IDE-native AGI assistant.
- File/selection context.
- Diff review.
- Terminal/task bridge.
- Local/BYOK developer workflows.
- Cloud handoff after invite.

VS Code must include:

- Sidebar/webview chat.
- Chat participant/command palette entry.
- Model selector.
- Mode/approval selector.
- File and selection references.
- Diagnostics/problems context.
- Terminal output capture.
- Inline diff/patch preview.
- Accept/reject hunks.
- Conversation history.
- Local session scope.
- Explicit handoff for synced app chat or Cloud.

Workspace content must not sync automatically into app chats.

## 16. Settings Requirements

### 16.1 General

General settings must include:

- Profile.
- Full name.
- What AGI should call the user.
- Work description.
- Instructions for AGI.
- Preferences.
- Appearance.
- Chat font.
- Voice.
- Voice speed.
- Notifications.
- Response/completion preferences.
- Code preferences.
- Code permission requests.
- Emails from AGI Code.
- On the web.
- Dispatch.
- Dispatch messages.

### 16.2 Account

Account settings must include:

- Log out of all devices.
- Delete account.
- Subscription cancellation warning before delete when applicable.
- Organization ID when applicable.
- Active sessions.
- Device.
- Location.
- Created.
- Updated.

### 16.3 Privacy

Privacy settings must include:

- Location.
- Metadata.
- Help improve AGI.
- Data export.
- Shared chats.
- Memory preferences.
- Search/reference chats.
- Generate memory from chat history.
- View/manage memory.
- Import memory from other AI providers.

### 16.4 Billing

Billing settings must include:

- Current plan.
- Adjust plan.
- Stripe/payment link where applicable.
- Invoices.
- Date due.
- Total.
- Status.
- Action.

Billing cannot be used to sell broad Managed Cloud before Cloud is ready.

### 16.5 Usage

Usage settings must include:

- Current session.
- Weekly limits.
- Usage credits.
- Monthly spend limit.
- Current balance.
- Auto reload.

### 16.6 Capabilities

Capabilities must include:

- Tool access mode.
- Load tools when needed.
- Connector discovery.
- Visuals.
- Artifacts.
- AI-powered artifacts.
- Inline visualizations.
- Code execution.
- File creation.
- Network egress.
- Domain allow list.
- Skills.

### 16.7 Connectors

Connectors must include:

- Directory.
- Search.
- Categories.
- Connected list.
- Details.
- Configure.
- Disconnect/uninstall.
- OAuth/custom auth.
- MCP servers.
- Per-tool permissions.
- Logs.
- Admin/policy controls where applicable.

### 16.8 AGI Code

AGI Code settings must include:

- Appearance/interface/form.
- Transcript text size.
- Session state classification.
- Local sessions allowed.
- Bypass permissions mode.
- Remote control default.
- Draw attention on notifications.
- Worktree location.
- Branch prefix.
- Preview first.
- Persist preview sessions.
- Create pull request automatically.
- Autofix pull request.
- Auto-achieve/archive after PR.
- Authorization tokens.
- Dispatch/co-dispatch.

### 16.9 AGI In Chrome

AGI in Chrome settings must include:

- Extension connected status.
- Native host status.
- Site permissions.
- Allowlist.
- Blocklist.
- Browser history permission.
- Browser action mode.
- File URL access.
- Saved prompts.
- Workflow recording.
- Memory/browser context controls.

### 16.10 Extensions

Extensions settings must include:

- Installed local extensions.
- Filesystem.
- Context7.
- Desktop commander.
- Apify.
- App notes.
- Excel/local app connectors.
- Configure.
- Details.
- Uninstall.

### 16.11 Developer

Developer settings must include:

- MCP config/logs.
- Hooks.
- Skills.
- Plugins.
- Provider diagnostics.
- Feature flags.
- Local runtime logs.
- Sandbox/network allowlist.
- Crash reports.

## 17. Files, Artifacts, And Generated Output

AGI must support generated outputs as first-class product objects.

Examples:

- Markdown documents.
- Code files.
- Images.
- PDFs.
- Spreadsheets.
- Presentations.
- Data files.
- App previews.
- Charts and inline visualizations.

Generated outputs must track:

- Source prompt.
- Source model/provider.
- Compute/session route.
- File type.
- Storage location.
- Checksum.
- Preview renderer.
- Version.
- Retention/deletion behavior.
- Privacy/trust mode.

Artifact UI must include:

- Side panel or equivalent.
- Preview/source switch when applicable.
- Copy.
- Download/export.
- Version history.
- Error-fix loop.
- Share/publish controls where allowed.

### 17.1 Visual Artifact And Design Workspace

The Claude Design reference folder introduces a deeper artifact mode that AGI
must track as a future suite requirement. It is not Mobile v1 scope unless the
founder explicitly narrows it into a small preview/share feature.

AGI's visual artifact/design workspace must support:

- Infinite or large pan/zoom canvas.
- Fixed-size artboards for screens, slides, documents, or generated views.
- Layers/assets/files panel.
- Properties panel for selected object position, size, color, typography, and
  opacity.
- Prototype/preview mode for connected screens or deck-like flows.
- Slide deck and design export where the generated format supports it.
- Multi-artboard versioning/history.
- Regenerate/iterate selected artboard or selected object.
- Trust labels for the model/provider/tool route that created each generated
  design object.
- Storage, share, publish, and delete controls that follow artifact retention
  rules.

This workspace must use AGI-owned interaction and visual design. It may follow
standard canvas/artboard conventions, but must not copy proprietary Claude
screens, icons, wording, or assets.

## 18. Memory Requirements

Memory must be explicit and controllable.

Required memory features:

- View memory.
- Add/edit/delete memory.
- Disable memory.
- Reference chat history toggle.
- Generate memory from history toggle.
- Project memory boundary.
- Temporary chat exclusion.
- Import memory from other AI providers.

Memory import should provide:

- Instructions/prompt for the other AI provider.
- Paste/upload/import screen.
- Parsed candidate memories.
- Dedupe.
- Edit before save.
- Approve all/start import.

Memory must never silently absorb Local-only sensitive data into synced/global
memory.

## 19. Connectors, MCP, Plugins, And Skills

AGI connectors should be MCP-first where possible.

Connector requirements:

- Directory.
- Search.
- Categories.
- Auth setup.
- Permissions.
- Tool list.
- Per-tool approve/deny.
- Logs.
- Disconnect/delete behavior.
- Admin policy where applicable.

Tool access modes:

- Off.
- Ask/load when needed.
- Auto-load safe tools.
- Always available for selected conversation.

Skills requirements:

- User skills.
- Project skills.
- Marketplace/plugin skills.
- Versioning.
- Invocation from slash menu or plus menu.
- Scope and permissions.

Plugins requirements:

- Install.
- Enable/disable.
- Update.
- Uninstall.
- Namespacing.
- Marketplace/source controls.
- Included MCP servers, skills, hooks, subagents, and prompts.

## 20. Scheduled Tasks, Dispatch, And Automations

AGI should support recurring and long-running work across the suite. Public
Cloud execution is public alpha and open by default (2026-06-27),
subscription/entitlement-gated rather than waitlist-gated.

Required concepts:

- Local scheduled task.
- Cloud routine (public alpha).
- Thread automation.
- Project automation.
- Dispatch from mobile/web to Desktop.
- Run history.
- Pause/resume/delete.
- Notification.
- Permission review.
- Worktree/session isolation when editing files.

Mobile v1 only needs the pieces required for Cloud sign-in and future Dispatch
readiness. Desktop and CLI carry the deeper automation workflows later.

## 21. Privacy, Security, And Safety

### 21.1 Local Privacy

Local mode must be tested for:

- No hidden provider calls.
- No hidden Cloud calls.
- No hidden sync.
- Local files stay local.
- Local chats stay local unless explicitly moved.

### 21.2 BYOK Privacy

BYOK must disclose:

- Provider.
- Model.
- Endpoint class.
- Native/server tool use.
- Retention/training claim or unknown state.
- Cost responsibility.
- Payload preview for high-risk sends.

### 21.3 Cloud Safety

Cloud must not be public until:

- Usage ledger exists.
- Provider cost snapshots exist.
- Monthly limits exist.
- Abuse and fraud controls exist.
- Refund/chargeback policy exists.
- Retention and deletion controls exist.
- Provider terms are reviewed.
- Support/audit workflows exist.

### 21.4 Browser And Computer Use

Browser/computer use must treat external content as untrusted.

Required controls:

- Site/app permission prompts.
- Allowlists/blocklists.
- High-impact confirmations.
- No sensitive action without user approval.
- Clear visible state while AGI controls browser/app.
- Logs/audit trail.
- Manual takeover path.

## 22. Analytics And Telemetry

AGI needs enough telemetry to improve product quality without violating privacy.

Allowed by default for public Local mode:

- Crash/error metadata that does not include prompt/file content, if user policy
  allows.
- App version.
- Device/platform metadata needed for debugging.
- Feature availability state.

Not allowed without consent:

- Raw prompts.
- Raw files.
- Local file paths.
- Local tool output.
- Browser history.
- Screenshots.
- Generated content from Local chats.

Telemetry settings must be visible under Privacy.

## 23. Release Management

### 23.1 Mobile Release Gate

Mobile release requires:

- Product requirements in this PRD satisfied or explicitly deferred.
- Automated checks passing.
- Manual QA matrix complete.
- App Store metadata complete.
- Privacy policy/support URL live.
- Known flaws documented.
- Trust-boundary tests complete.
- Founder signoff.

### 23.2 Surface Transition Gate

The team may move from Website to Mobile only after:

- Website release-readiness checks pass on the production-intended build.
- Release notes/changelog updated.
- Known Website v1 gaps documented.
- Mobile kickoff scope approved.

The only exception is founder-authorized next-surface work during QA, testing,
review, or other waiting periods.

### 23.3 Completion Evidence

For every PRD requirement marked complete, record:

- Repo path.
- Verification command or manual QA note.
- Date.
- Surface.
- Trust mode.
- Known residual risk.

## 24. Agent Operating Rules

Future agents must:

- Read `AGENTS.md`.
- Read `docs/current/source-of-truth.md`.
- Read this PRD when doing product or UX work.
- Read the parity matrix for feature implementation.
- Read provider strategy for model/BYOK work.
- Check known flaws before claiming a new bug.
- Work only on the active surface unless explicitly authorized.
- Avoid broad unrelated refactors.
- Avoid deleting user/unrelated changes.
- Avoid copying proprietary assets or code.
- Update docs and decisions when product behavior changes.

Agents must not:

- Invent APIs, routes, env vars, schemas, prompts, docs, model IDs, or release
  status.
- Mark features complete from build success alone.
- Start next-surface implementation just because another surface is documented.
- Route Local content to BYOK/Cloud silently.
- Treat BYOK as equivalent to Local privacy.
- Claim Managed Cloud is public before gates are met.

## 25. Open Questions And Tracked Gaps

These are not blockers to writing the PRD, but they must be answered before
later implementation phases claim release readiness:

1. Exact Mobile local runtime/model pack shipping mechanism.
2. Exact Desktop-first/developer-surface BYOK setup timing during the Desktop release phase.
3. Exact App Store privacy nutrition labels after final Mobile data audit.
4. Exact Cloud invite-code backend and abuse limits.
5. Exact provider retention metadata schema.
6. Exact local file storage/encryption behavior per platform.
7. Exact memory import prompt and import parser.
8. Exact artifact renderer and generated-file retention defaults.
9. Exact Desktop native host protocol for Chrome/Mobile/CLI bridges.
10. Exact billing/usage ledger before Cloud public launch.
11. Exact visual artifact/design workspace scope, renderer, export formats, and
    release surface.

Until resolved, these stay as tracked gaps rather than hidden assumptions.

## 26. Glossary

| Term                    | Meaning                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| AGI                     | Public product brand.                                                                                                      |
| AGI Workforce           | Formal platform and repo name.                                                                                             |
| Surface                 | One of Mobile, Website, Desktop, CLI, Chrome Extension, VS Code Extension.                                                 |
| Local                   | Local-first mode with no silent provider/cloud routing.                                                                    |
| BYOK                    | Bring Your Own Key, direct user-owned provider route.                                                                      |
| Cloud                   | AGI-managed compute/provider route, public alpha and open by default; subscription/entitlement-gated (not waitlist-gated). |
| Provider route          | Provider plus endpoint class plus model id plus capabilities and privacy/cost metadata.                                    |
| Native tool             | Tool executed by the model provider's infrastructure/API.                                                                  |
| AGI local tool          | Tool executed by AGI on local device/host/runtime.                                                                         |
| Connector               | Integration that exposes external data/actions, preferably through MCP.                                                    |
| Artifact                | Generated or editable output shown outside the normal message stream.                                                      |
| Visual design workspace | Canvas/artboard-based artifact workspace for generated designs, prototypes, slide-like flows, and visual documents.        |
| Memory                  | Saved context AGI may use in future conversations.                                                                         |
| Dispatch                | Task handoff from one surface, especially Mobile, into Desktop/local or Cloud/private-beta work.                           |

## 27. PRD Maintenance Rule

This PRD should grow as decisions become concrete. Do not split it into many
scattered PRDs unless the current docs map is updated and the compact source of
truth still points to a single read path.

When adding or changing requirements:

1. Update this PRD.
2. Update `docs/current/source-of-truth.md` if the compact product lock changes.
3. Update `docs/current/parity-implementation-matrix.md` if feature status or
   parity requirements change.
4. Update `docs/decisions/CURRENT_DECISIONS.md` if a conflict is resolved or a
   new lock is created.
5. Run doc/agent checks.
