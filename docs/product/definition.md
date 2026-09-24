# Source Of Truth

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-21

This is the compact source of truth for what AGI is, what v1 means, where the repo stands today, and how agents should avoid stale-doc hallucination.

For feature-by-feature, option-by-option implementation detail, use `docs/work/implementation-status.md`.

For BYOK providers, hosted open-model APIs, open-weight model priorities, and developer-surface model-selector rules, use `docs/architecture/byok-provider-strategy.md`.

For the long-form PRD, serial surface order, per-surface release bars, and decision-complete feature requirements, use `docs/product/requirements.md`.

## Product Definition

AGI is the public product brand. AGI Workforce is the formal platform and repo name.

AGI is a leading AI application suite across six first-class surfaces:

- Web
- Mobile
- Desktop
- Chrome extension
- VS Code extension
- CLI

The v1 product target is practical parity with current leading AI application
ecosystems, with one major differentiation: users can choose Local models,
Bring Your Own Key provider access, or AGI Managed Cloud. Managed Free is a
public alpha available after sign-in; paid upgrades remain
waitlist/access-code gated.

Parity means user-capability parity and workflow parity, not copying proprietary code, private assets, or protected branding. Claude and ChatGPT are competitive references; AGI must implement its own design system, names, contracts, providers, and trust-boundary UX.

## Launch Lock

Public v1 launches with:

- Local Mode: local-first chat and local tools where technically available.
- BYOK Mode: direct user-owned provider keys with explicit provider labels.
- Multi-provider model selection: hand-maintained model knowledge lives only in
  `packages/ai/model-registry/catalog`; compatibility catalogs are generated.
- One normal chat surface that can also work with selected files, reference files, project context, generated files, artifacts, tools, connectors, and images.

Managed Free is in public alpha and enabled after sign-in (founder decision,
2026-06-27). Paid acquisition remains waitlist/access-code gated.

Development is serial by surface in the founder's 2026-09-21 order: Website,
Mobile, Desktop, Chrome, CLI, then VS Code. One surface is active at a time, and
the next begins only after the active surface passes its release gates. Shared
contract work required by the active surface is allowed, but cross-surface
implementation does not run as a parallel product program. Connection and
continuity checks follow each surface pass. This direction supersedes the
2026-08-05 shortest-remaining-work-first order and the 2026-08-09 cross-surface
capability exception.

The routing substrate (registry-dated pricing and cache-write billing,
ExecutionPlan/CPST design, CPST telemetry, and rules-based routing) remains a
shared prerequisite. Each surface consumes its canonical contracts instead of
forking account, entitlement, conversation, memory, tool, OAuth, file, context,
or event ownership.

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

Managed Cloud Free access is in public alpha and open by default (founder
decision, 2026-06-27). The private-beta waitlist gate does not apply to the Free
experience; signed-in Free users can use the enabled managed routes. Paid
upgrades remain waitlist/access-code gated until the founder opens purchasing.
The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response
kill-switch. The following controls must keep pace with public usage, but they
no longer gate Free access:

- metering and usage ledgering,
- provider price/cost snapshots,
- quota and monthly spend controls,
- abuse and fraud controls,
- refund and chargeback policy,
- retention and deletion controls,
- provider terms review,
- support and audit workflows.

## Trust Modes

| User mode     | Internal mode                                         | Product meaning                                     | Non-negotiable rule                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local         | `local_only` / `Local`                                | Runs locally or through local host/runtime.         | Never silently routes chats, files, tools, or developer sessions to BYOK or managed cloud.                                                                                                                                                                    |
| BYOK          | `byok` / `DirectByok`                                 | Uses the user's provider key directly.              | Local to BYOK is an explicit fork with context selection, secret scan, payload preview, visible provider label, and consent.                                                                                                                                  |
| Managed Cloud | `cloud_managed` / `ManagedGateway` or `ManagedNative` | Uses AGI-managed provider access or hosted compute. | Free public alpha is enabled after sign-in; paid acquisition remains waitlist/access-code gated. Commercial, abuse, retention, deletion, and provider-term controls must keep pace. Still a distinct trust boundary: never silently route Local/BYOK into it. |

The original Local thread remains Local forever. A BYOK continuation is a new reviewed branch, not a hidden mode flip.

## Surface Roles

| Surface | Role                                                                                                                                                                                                                                                                         | Sync boundary                                                                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Account, projects, synced app chats, artifacts, billing, admin, web routes, and capacity-specific access requests. Web chat is subscription-backed through Neon/account state; Web does not expose BYOK.                                                                     | Normal app chat sync allowed.                                                                                                                                                                                                                               |
| Desktop | Account-synced Cloud app plus the trusted local developer host for Desktop Code, approved folders, device tools, artifacts, computer/browser use, voice control, and native bridges. Consumer Cloud chat and local developer sessions remain visibly separate trust domains. | Cloud app state syncs with Web, Mobile Cloud, and eligible Chrome chats. Developer sessions, tools, credentials, repositories, and files share the host-owned runtime used by CLI and VS Code; local data leaves the host only through an explicit handoff. |
| Mobile  | Unpublished client with small on-device Local LLM and public-alpha Cloud work in the codebase. Mobile v1 does not expose BYOK.                                                                                                                                               | When released, signed-in Cloud chats, projects, memory, settings, and personalization share the app continuity contract with Web and Desktop. Local Mode data and files stay local unless explicitly transferred.                                           |
| CLI     | Developer agent, terminal engine, and canonical local developer-session host used by VS Code.                                                                                                                                                                                | Workspace/session scoped; no automatic sync into app chats.                                                                                                                                                                                                 |
| VS Code | IDE-native thin client and presentation adapter over the CLI-hosted Rust developer session.                                                                                                                                                                                  | One local-runtime process per trusted workspace; handoff to app chat must be explicit and redacted.                                                                                                                                                         |
| Chrome  | Cloud-only browser assistant with page context, capture/action approvals, native messaging, and a browser-local authoritative conversation cache.                                                                                                                            | Every signed-in conversation whose turns all ran in Managed Cloud automatically mirrors to the shared account store and appears in Web, Mobile Cloud, and Desktop. Unknown/Local/BYOK provenance stays browser-local.                                       |

## Continuity And Reuse Lock

- One AGI account has one effective suite entitlement. Free access and any paid subscription, regardless of billing owner, resolve through the same canonical account/organization entitlement contract on every surface. A user never needs a separate Web, Mobile, Desktop, Chrome, CLI, or VS Code subscription. Surface stores may initiate or manage a purchase, but they do not create a second entitlement.
- Web, Mobile Cloud, Desktop Cloud, and provenance-eligible Chrome Managed Cloud participate in one signed-in Cloud continuity domain. The canonical account state includes chats and messages, projects, Cloud files and artifacts, Cloud memory, profile instructions and personalization, connected tools/apps, OAuth connection metadata, settings, and plan entitlements, subject to platform capability and workspace policy. A change made on one connected Cloud surface must converge on the others; surface caches are replicas, not private product owners.
- Desktop Code, CLI, and VS Code participate in one host-owned developer continuity domain. They use the same workspace/runtime identity, session IDs and transcripts, tool and extension inventory, permission decisions, approved repositories/files, and local provider/tool authentication through a host credential broker. Secrets remain in the operating-system credential store and are referenced, never copied into Cloud sync or surface-local plaintext stores. Resuming a session appends to the same session ID; forking creates a new ID.
- Desktop is the explicit bridge between the two domains. It may present both, but it must not merge them implicitly. Moving selected context between a Cloud conversation and a local developer session is an explicit, provenance-preserving handoff with payload preview, secret scanning, consent, and a new destination record where the trust boundary changes.
- Mobile Local state remains on device. Browser-task state remains browser-scoped. Neither is silently promoted into the Cloud or developer domain; only provenance-eligible Cloud conversations and explicit handoffs cross those boundaries.
- Developer extension discovery is folder-aware. `.agi` is the canonical AGI project configuration; compatibility loaders may read supported `.agents`, `.claude`, `AGENTS.md`, `CLAUDE.md`, skills, plugins, connectors/MCP, hooks, and agent definitions through one precedence-aware loader. CLI and VS Code must show the same discovered inventory for the same trusted workspace. Compatibility does not authorize moving, deleting, or rewriting another tool&rsquo;s files.
- Managed usage UI is one percentage/reset-time contract. Web, Mobile, Desktop, CLI, and VS Code render percentage progress bars without exposing private plan-allowance units, token-to-credit conversion, or provider cost. The explicit top-up checkout is the narrow exception: it displays the founder-set public purchase denomination (50 top-up units per $1), not the private plan allowance. Chrome has no usage dashboard; it still receives honest limit/upgrade errors from the shared server policy.
- Shared contracts own identity and behavior; each surface owns only transport, platform permissions, offline/cache policy, and presentation. New work must extend an existing owner before adding a surface-local duplicate.

## Competitive Ecosystem Synthesis Lock

ChatGPT and Claude are the two primary application references. AGI targets a
deliberate mixture of their verified ecosystem behavior, not a visual or branded
clone.

- From ChatGPT, preserve one account/subscription across devices; searchable
  account history; shared projects, files, memory and connected apps; durable
  scheduled/cloud work; and continuity between Web, Mobile and Desktop while
  keeping local developer work visibly local.
- From Claude, preserve one conversational home that can answer directly or
  become a longer-running task; project-scoped memory; first-class artifacts and
  editable outputs; remote connectors that follow the account; Desktop-hosted
  local extensions/files/browser/computer use; and the ability to steer Cloud
  work from another surface while the trusted host remains authoritative for
  local access.
- AGI adds multi-provider Local/BYOK/Managed routing, one explicit two-domain
  continuity model, and shared Desktop Code/CLI/VS Code sessions. It must use
  the most precise available execution path in this order: typed connector or
  tool, controlled browser automation, then screen-level computer use. A less
  precise path never bypasses a permission, confirmation, workspace policy or
  trust boundary.

Parity is measured by outcomes and continuity: the same eligible account object
opens on every supported Cloud client, the same local developer session resumes
through every host client, and mutations converge with correct deletion,
revocation, conflict and offline behavior. Matching navigation labels or copying
competitor layouts is not parity.

## Competitive Baseline

The current baseline was re-verified against first-party documentation on
2026-09-21. The dated evidence, July-to-September change log, and source links
live in `docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md`. Older
screenshots and research files remain historical observations; they do not
override this section.

OpenAI/ChatGPT baseline:

- One signed-in account spans Web, Mobile, and Desktop, including the effective
  subscription. Account history is searchable across supported chats, projects,
  images, and documents.
- Projects group chats, files, instructions, app links, tools, and scoped
  memory. Saved memory and referenced chat history are separate controls;
  temporary chats neither read nor write memory.
- Library indexes uploaded, generated, and connected-source content. Connected
  apps can participate in search, deep research, interactive experiences, and
  confirmed write actions, subject to plan, region, role, workspace, interface,
  route, and connection policy.
- Chat and longer-running Work share one account and can continue across Web,
  Mobile, and Desktop. Local work remains on the computer, and developer work
  retains distinct history and permissions.
- Work exposes progress, questions, direction, approvals, and durable document,
  spreadsheet, presentation, report, and site deliverables.
- Reusable plugins combine instructions with apps/tools. Custom GPTs and the GPT
  Store are a migration source, not AGI's enduring target architecture.
- Multiple connected accounts per supported app, a first-class Privacy Center,
  scheduled tasks, browser execution, voice, media generation/editing, and
  shareable developer-task snapshots establish the current continuity floor.

Anthropic/Claude baseline:

- Chat and longer-running work share one home. A request can receive a direct
  answer or become a durable task without sending the user to a disconnected
  product.
- Cloud sessions and their files are account-saved and resumable across
  supported Web, Mobile, and Desktop clients. The trusted Desktop host remains
  authoritative for approved local files, local extensions, browser control,
  and computer use.
- Remote connectors follow the account; Desktop connectors and host tools do
  not become Cloud credentials merely because the same account is signed in.
- Memory is composed of inspectable, editable topics shared across supported
  Cloud chat and work contexts. Sensitive topics, workspace defaults, project
  scope, deletion, and opt-in behavior remain explicit.
- Projects, Artifacts, generated files, voice, schedules, reports, connectors,
  skills, plugins, and computer use are first-class workflows. Installable
  extensions require provenance, permission review, scanning, update, and
  removal controls.
- Claude Code spans terminal, IDE, Desktop, and browser contexts with local
  sessions, files, commands, MCP, instructions, skills, hooks, permission
  controls, and remote projection where supported.

AGI synthesis:

- Preserve ChatGPT-style account continuity, search, projects, Library, apps,
  scheduled work, and Cloud/local separation.
- Preserve Claude-style one-home escalation, project memory, artifacts,
  cross-device cloud work, remote connectors, and Desktop-hosted local tools.
- Add AGI's multi-provider Local/BYOK/Managed routing and the Host Developer
  continuity domain shared by Desktop Code, CLI, and VS Code.
- Prefer typed connectors/tools, then controlled browser automation, then
  screen-level computer use. No fallback bypasses permissions, confirmations,
  policy, or trust boundaries.
- Measure parity by completed workflows, continuity, revocation, deletion,
  conflict recovery, and honest availability, not by copied labels or layouts.

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
- Cloud Managed mode, with enabled Free routes and separately gated paid routes.

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

Paid plan prices are configured on Web, but new paid subscriptions and upgrades
remain waitlist/access-code gated. Existing paid entitlements resolve on Mobile
and Desktop, although those clients are not publicly obtainable until their
verified releases are published. Free and Basic do not include managed-cloud
CLI, Chrome, or VS Code access; Local/BYOK developer use remains available
inside its separate trust boundary. Skills and chat tools remain available in
Free chat, while AGI Work and managed developer surfaces are Pro+ capabilities.

The billing catalog supports global acquisition with configured localized
amounts and USD fallback, but the catalog does not open purchasing. The Website
uses the trusted deployment country header and configured Stripe Price currency
options; it never trusts a browser-supplied currency. The same
waitlist/access-code policy gates every supported country until the founder
opens self-serve paid acquisition.

Paid usage is enforced as overlapping billing-period, rolling seven-day, rolling five-hour, and flagship rolling-week windows. The five-hour allowance is 20% of that plan's weekly allowance and the flagship sub-limit is 30% of the weekly allowance. These are spend windows, not seven daily buckets: usage ages out from its original transaction timestamp. Rolling spend windows warn at 80% and hard-stop at 100%; there is no downgrade or 150% financial grace band. The server-owned reservation includes the estimated in-flight request before provider work and serializes concurrent reservations for one tenant.

An immediate paid-plan upgrade preserves the existing renewal date. Stripe previews and invoices only the prorated price/seat difference for the remaining time in the current period, using the exact same signed proration timestamp for preview and apply. AGI carries already-consumed billing-period and rolling-window usage into the higher plan; usage never resets on upgrade, and purchased top-ups remain separate. If payment is incomplete or fails, the old plan and its counters remain active until the canonical paid webhook provisions the upgrade.

Top-ups are available only to active Stripe-billed paid plans through the same
gated commercial policy. They are whole-dollar purchases at 50 public top-up
units per $1, with a $10 minimum and $100 ordinary self-serve maximum. Stripe
Checkout shows and collects tax separately; the managed-usage ledger receives
only the pre-tax purchased balance. Unused purchased balance carries across
subscription renewals and purchases older than 12 months are excluded from the
next carry.

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
- `/chat` mounts `WebChatRoot` (`apps/web/app/chat/page.tsx:1`), which renders
  `features/chat/pages/WebChatPage.tsx`. The former convergence copies
  `UnifiedChatPage.tsx` and `v3/WebShellV3.tsx` were deleted on 2026-08-22; the
  shared shell now arrives through the `@agiworkforce/unified-chat` components
  rather than through a parallel Web-only shell. There is still exactly one
  public Web chat route.
- Remaining Web gaps include settings parity, connector/app directory parity,
  global search, and complete projects/files/memory parity. Managed Free is
  public alpha and available after sign-in; paid upgrades remain
  waitlist/access-code gated.

Desktop:

- Electron remains the sole public Desktop shell. `apps/desktop/electron` loads
  the signed-in Cloud account surface and must also expose Desktop Code through
  the same host-owned developer-session engine used by CLI and VS Code.
- Consumer Cloud chat remains Managed Cloud. Desktop Code is a separate local
  developer trust domain and may use Local or BYOK execution through the shared
  host runtime. Local sessions, tools, permissions, repositories, files, and
  credentials do not become Cloud chat state merely because both domains appear
  in Desktop.
- The retained Tauri/React/Rust tree is implementation evidence and reusable
  engine code, not a second public Desktop shell. Any reused local capability
  must be exposed through the canonical host protocol and Electron presentation;
  retained screens alone are not release or marketing evidence.
- Desktop has no published installer yet. A successful signing workflow is not
  proof that a downloadable asset exists; the release API and verified asset are
  the availability authority.

Mobile:

- Mobile is not published. Its code currently prioritizes Local Mode and keeps hosted sends gated unless Cloud access is explicitly unlocked.
- `apps/mobile/services/remoteChatGate.ts` fails closed when Cloud sends are disabled.
- Mobile v1 has small on-device Local LLM chat plus signed-in Managed Free
  public alpha. Paid upgrades remain gated, and Mobile BYOK is not a v1 product
  path.
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
  and CRUD used by the side panel. It stays authoritative. Conversations whose
  every turn carries Managed Cloud provenance automatically mirror to the
  shared account conversation store for Web, Mobile Cloud, and Desktop;
  unknown/Local/BYOK provenance fails closed.
- Remaining parity gaps are polished side panel UX, permissions UX,
  Chrome-to-Desktop bridge hardening, and explicit selected/redacted handoff for
  data that is not already inside a Managed Cloud conversation.

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

- Managed Free compute is in public alpha and enabled after sign-in. Services
  can keep building API gateway, signaling, enterprise controls, and
  billing/usage scaffolding. Paid upgrade entry remains waitlist/access-code
  gated; capacity-specific access requests remain separate.

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
10. Web, Mobile Cloud, Desktop Cloud, and provenance-eligible Chrome Managed
    Cloud must converge inside the account domain. Desktop Code, CLI, and VS
    Code must converge inside the host-owned developer domain. Crossing between
    those domains requires an explicit handoff.
11. Managed Free is public alpha and enabled after sign-in (founder decision,
    2026-06-27). Paid upgrades remain waitlist/access-code gated. Metering,
    billing, abuse, retention, deletion, and provider-term controls must keep
    pace with Free usage and gate paid launch. The
    `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response
    kill-switch.
12. All six surfaces need screenshot/e2e-style UI verification for the launch-critical flows, not only typecheck/build.
13. Visual artifact/design workspace parity is not yet specified in code:
    canvas, artboards, layers/assets/files, properties panel, prototype/deck
    preview, versioning, export, and trust labels must be designed before
    claiming parity with local reference design-workspace patterns.

## Documentation Rule

Agents should read current truth in this order:

1. `AGENTS.md`
2. `docs/product/definition.md`
3. `docs/product/requirements.md` for product/UX/surface release requirements
4. `docs/work/implementation-status.md`
5. `docs/architecture/byok-provider-strategy.md` when touching model/provider/BYOK work
6. `docs/agent-context/repo-map.json`
7. `docs/agent-context/known-flaws.md`
8. `docs/agent-context/commands.json`
9. nearest path-scoped `AGENTS.md`
10. `docs/decisions/README.md` when a decision conflict appears
11. `PLAN.md` for strategy and `docs/work/` for dated queues

Everything else is supporting context, evidence, or historical material unless a current doc explicitly promotes it.

Treat these as evidence or working notes, not source of truth:

- `docs/agent-context/known-flaws.md` findings not yet promoted into a current doc
- `docs/research/**` dated research summaries
- local screenshot/reference corpora
- generated parity reports
- stale PRDs and launch plans

(The former `tasks/**`, `reports/**`, and `docs/archive/**` directories were
removed repo-wide on 2026-06-28, do not cite them as existing. `audit/` was
removed then too but has since been reintroduced and is live again: it is the
current triage queue, and `audit/capability-gaps.csv` is cited as the source of
truth by `docs/work/implementation-status.md`. Cite it, but treat its
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
