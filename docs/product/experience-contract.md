# Frontend Experience Contract

Status: Current target; implementation incomplete
Owner: Product + frontend platform
Last updated: 2026-08-13

This is the canonical frontend architecture and experience contract for AGI across Web, Desktop, Mobile, CLI, VS Code, and Chrome. It converts the current Claude/ChatGPT product evidence into AGI-owned behavior, component boundaries, screen ownership, and completion rules.

It does not authorize cloning proprietary source, icons, copy, screenshots, or exact visual design.

If a visible control conflicts with the effective runtime capability, the control is the bug. If this document conflicts with `docs/product/definition.md` or `docs/architecture/trust-boundaries.md`, those documents win and this file must be corrected.

## 1. Product composition

AGI is one suite, not one universal interface and not six unrelated products.

| Product domain     | Primary surfaces                                       | Canonical data                                                       | Execution                              | Sync rule                                                                                                                         |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Conversation | Web, Desktop Cloud, Mobile Cloud, Chrome Managed Cloud | Account conversations, messages, projects, cloud files, cloud memory | Managed Cloud                          | Shared across account Cloud surfaces; Chrome contributes eligible conversation replicas while local storage remains authoritative |
| Cloud Work         | Web, Desktop Cloud, Mobile Cloud                       | Goals, runs, steps, approvals, schedules, deliverables               | Managed sandbox and connected tools    | Shared only across supported cloud surfaces                                                                                       |
| Local Consumer     | Desktop Local, Mobile Local                            | Local conversations, files, local memory                             | On device                              | Never automatically synced                                                                                                        |
| Developer Session  | CLI, VS Code, Desktop Code                             | Repository/workspace sessions, turns, diffs, terminal, checkpoints   | Local, worktree, approved remote/cloud | CLI and VS Code share host-owned sessions; not consumer chat history                                                              |
| Browser Task       | Chrome, Desktop browser adapters                       | Browser-scoped task history, page context, site policy               | Browser/native host/managed browser    | Browser task state stays separate; eligible Chrome chat transcripts mirror to Cloud Conversation                                  |
| Remote Projection  | Mobile/Web to a trusted local host                     | Device/session projection, approvals, event cursor                   | Host remains authority                 | Projection only; no implicit conversation migration                                                                               |
| Handoff Snapshot   | Explicit source and destination                        | Redacted selected context with provenance                            | Destination runtime                    | User-approved copy/fork, never background sync                                                                                    |

Desktop Local and Desktop Cloud remain modes in one Desktop application. Separate applications are not required.

## 2. Frontend principles

1. **Share semantics before pixels.** Contracts, state machines, policy, event types, tokens, and accessibility behavior are shared more broadly than rendered components.
2. **Compose products; do not boolean-toggle one giant chat component.** Chat, Work, Code, and Browser have different information architecture.
3. **Native presentation is allowed.** Mobile, CLI, VS Code, Chrome content scripts, and Tauri-native boundaries must not be forced through React DOM.
4. **Capability honesty is absolute.** A hidden or disabled control is better than an enabled no-op.
5. **Trust is visible.** Local, BYOK, Managed Cloud, host device, provider, project, and site scope are visible when they affect behavior.
6. **Progress is data.** Tool calls, reasoning summaries, subagents, approvals, retries, files, and failures are typed durable events.
7. **Files are first-class.** Attachments, project knowledge, generated files, artifacts, and published apps have separate object models.
8. **Every async flow has complete states.** Loading, empty, disabled, error, warning, success, offline, retry, cancellation, and permission denial are designed and tested.
9. **One mounted owner per route.** Dead alternative shells are removed after migration proof.
10. **AGI has its own visual identity.** Competitive references set quality and behavior, not brand imitation.

## 3. Canonical ownership

### 3.1 Existing shared packages

| Owner                                 | Responsibility                                                                                    | Must not own                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/ui/design-tokens`           | Color, typography, spacing, radius, elevation, motion, z-index, responsive tokens                 | Product state, routes, provider policy                                |
| `packages/ui/ui`                      | Stateless accessible primitives and low-level patterns                                            | Account stores, runtime clients, surface navigation                   |
| `packages/ui/unified-chat`            | Web/Desktop DOM chat composition, message/artifact/tool renderers, adapters over shared contracts | React Native, Rust TUI, Chrome content-script DOM, provider SDK logic |
| `packages/contracts/types`            | Session, message, event, capability, artifact, approval, memory, project, and surface DTOs        | React components, network calls                                       |
| `packages/contracts/cloud-contracts`  | Versioned Cloud API schemas                                                                       | Surface-specific UI state                                             |
| `packages/contracts/trust-boundaries` | Egress, trust transition, handoff, and policy vocabulary                                          | Visual confirmation components                                        |
| `packages/ai/model-registry`          | Model/capability/price/rollout source of truth and generated outputs                              | Picker layout or provider-specific display hacks                      |
| `packages/ai/routing`                 | Auto-routing policy and continuity decisions                                                      | UI-local model conditionals                                           |
| `packages/ai/provider-runtime`        | Provider execution/normalization                                                                  | Toasts, dialogs, route navigation                                     |
| `packages/client/client-runtime`      | Shared client coordination and runtime adapters where portable                                    | Native platform APIs                                                  |
| `packages/client/sync`                | Shared Cloud sync mechanics and conflict contracts                                                | Local-mode background egress                                          |
| `packages/platform/artifacts`         | Artifact derivation, versions, publish/state/sync mechanics                                       | Rendering every file type in every surface                            |

### 3.2 Required internal layering

Shared frontend code should be separated into three layers even when it remains in the same package initially:

1. **Contracts/headless**
   - Event reducers.
   - Conversation draft state.
   - Branch state.
   - Capability calculation inputs.
   - Selection state.
   - Artifact renderer manifest types.
   - Approval state machine.
   - No DOM, React Native, VS Code, or TUI dependency.

2. **Presentation adapters**
   - DOM renderers in `packages/ui/unified-chat`.
   - React Native renderers under Mobile.
   - TUI widgets under CLI.
   - VS Code presenters/webview modules under the extension.
   - Browser side-panel/content-script presenters under Chrome.

3. **Surface composition**
   - Routes.
   - Navigation shell.
   - Runtime/session client selection.
   - Native APIs.
   - Surface settings.
   - Release/update integration.

The dependency direction is `surface composition -> presentation adapter -> headless/contracts`. It must never reverse.

## 4. Design system

### 4.1 AGI visual language

AGI will use:

- An editorial display face for greetings, artifact titles, and high-level product moments.
- A highly legible sans-serif interface face for dense controls and settings.
- A configurable monospace for code/terminal.
- Warm or neutral foundations with AGI blue as an intentional accent, not a universal fill.
- Thin tonal borders, limited elevation, and restrained surfaces.
- Rounded controls with a documented radius scale.
- An original AGI icon set or a consistently configured licensed/open icon library.
- Motion that communicates hierarchy and progress, with a complete reduced-motion path.

### 4.2 Token groups

Required token families:

- Color: canvas, surface, elevated, inset, border, text, muted, accent, info, success, warning, danger, focus.
- Typography: display, heading, body, compact, label, metadata, code, terminal.
- Space: 2/4/6/8/12/16/20/24/32/40/48.
- Radius: control, card, panel, modal, pill.
- Size: icon, hit target, sidebar, transcript widths, composer, panels.
- Layer: base, sticky, dropdown, popover, modal, notification, permission/approval.
- Motion: fast, normal, deliberate, streaming, progress; reduced alternatives.
- Breakpoints: compact phone, phone, tablet, narrow desktop, desktop, wide desktop.

### 4.3 Icon rules

- Every icon-only control has an accessible name and tooltip where discoverability matters.
- Icons are semantic; the same action uses the same symbol across surfaces when native convention does not override it.
- Status never depends on color alone.
- Provider logos, model marks, file types, tools, trust modes, and generic actions are different icon namespaces.
- Brand/vendor marks are not reused as generic action icons.
- Filled state is reserved for active selection/status.
- Minimum pointer hit target is 40 px; native touch targets follow platform guidance.

## 5. Layout system

### 5.1 Canonical layouts

| Layout                | Use                                                                       |
| --------------------- | ------------------------------------------------------------------------- |
| Consumer shell        | Web/Desktop Cloud Chat, Projects, Artifacts, Scheduled                    |
| Local consumer shell  | Desktop/Mobile Local with explicit local status                           |
| Conversation          | Transcript plus sticky composer                                           |
| Conversation split    | Transcript plus resizable artifact/file pane                              |
| Work run              | Goal/plan/activity plus deliverables and approvals                        |
| Code workspace        | Session navigation plus draggable chat/diff/terminal/editor/browser panes |
| Browser side panel    | Browser-task transcript, page context, approvals, site policy             |
| Collection table      | Chats/tasks, devices, sessions, connectors, skills, plugins               |
| Collection grid       | Projects, artifacts, templates                                            |
| Settings modal        | Desktop/web settings navigation plus detail pane                          |
| Native settings stack | Mobile and platform-native settings routes/sheets                         |
| TUI workspace         | CLI transcript, composer, overlays, status/footer                         |

### 5.2 Responsive rules

- Persistent desktop sidebars become modal drawers on narrow screens.
- Split panes collapse to a full-screen viewer or native stack on phone.
- Dense tables become cards or horizontally scrollable semantic tables.
- Composer controls collapse by priority; trust/mode/provider state must remain visible.
- Hover-only actions also appear on keyboard focus and have touch alternatives.
- Modals become full-screen sheets/routes when two-column content is not usable.
- No fixed element may cover route headings, send controls, or system safe areas.

## 6. Navigation and screen inventory

### 6.1 Shared cloud consumer screens: Web, Desktop Cloud, Mobile Cloud

- Home/new chat.
- Chats and tasks/history.
- Search.
- Conversation.
- Projects list.
- Project detail.
- Artifacts/files library.
- Artifact/file viewer.
- Scheduled tasks.
- Notifications/activity where supported.
- Models/capabilities where user-selectable.
- Settings.
- Profile/account.
- Usage/credits/billing.
- Data controls/privacy/security.
- Connectors/plugins/skills where supported.

Only Cloud data syncs across these surfaces. Layouts are not required to be identical.

### 6.2 Cloud Work screens

- Work home/goal composer.
- Active run.
- Plan and step timeline.
- Subagent/workstream panel.
- Approval queue.
- Deliverables/files.
- Run history.
- Schedules/templates.
- Project context/memory.
- Runtime/host status.

These screens remain unavailable until a first-class work-run protocol exists.

### 6.3 Desktop Local screens

- Local chat.
- Local projects/files.
- Local models.
- BYOK keys/providers inside Local mode.
- Local tools/MCP/skills.
- Local memory.
- Local sandbox/runtime status.
- Privacy/storage controls.
- Explicit handoff/fork to BYOK or Cloud.
- Global quick entry.
- System-wide dictation.
- Screenshot/window context.

### 6.4 Developer screens: CLI, VS Code, Desktop Code

- New/resume/fork/archive developer session.
- Workspace/repository/worktree selection.
- Transcript and typed activity.
- Model/effort/context usage.
- Permission/approval mode.
- Plan/goal.
- Files/context/diagnostics.
- Diff review/apply/revert.
- Terminal/test output.
- Checkpoint/rewind.
- MCP/skills/tools status.
- Background/subagent sessions.
- Remote Control pairing/status.
- Routines/schedules where the host supports them.

### 6.5 Chrome screens

- Side-panel chat/task.
- Browser workflows.
- Computer/browser use.
- Page context and selection.
- Screenshot capture.
- Tool/event transcript.
- Approval and permission cards.
- Site allowlist/blocklist.
- Saved workflow/recording.
- Browser-task history.
- Local extension memory.
- Settings/options.
- Native-host pairing/status.

Chrome's browser-task state remains separate. Signed-in Chrome conversations
whose turns all ran in Managed Cloud automatically mirror into the shared Cloud
Conversation history; unknown/Local/BYOK provenance stays browser-local.

### 6.6 Settings information architecture

Shared account settings:

- General.
- Profile.
- Appearance and motion.
- Language.
- Voice.
- Notifications.
- Account/devices/sessions.
- Privacy/data controls.
- Billing.
- Usage.
- Capabilities.
- Memory.
- Connectors.
- Plugins.
- Skills.

Surface settings:

- Desktop Local/Cloud/runtime/storage/update/dictation/browser/computer use.
- Code themes/font/transcript width/branch/PR/CI/remote sessions.
- Mobile notifications/biometrics/storage/offline/native permissions.
- VS Code editor behavior/runtime/permissions/context/review.
- Chrome site permissions/capture/recording/native host.
- CLI TUI/theme/keymap/status line/runtime/sandbox.

Shared sections may use one schema, but each surface renders only supported controls.

## 7. Composer architecture

### 7.1 Shared composer parts

- Draft editor.
- Attachment/context trigger.
- Mode/surface selector when the product genuinely supports it.
- Model selector.
- Effort/thinking selector.
- Tool/research/search selector.
- Runtime/trust/provider indicator.
- Project/context chips.
- Dictation.
- Voice.
- Send/stop.
- Approval mode where applicable.
- Usage/context meter where applicable.

### 7.2 Composer variants

| Variant    | Required additions                                                  | Forbidden shortcuts                                 |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Cloud Chat | Temporary/incognito, project, search/research, account model/effort | Local/BYOK without explicit handoff                 |
| Local Chat | Local provider/runtime, local storage, handoff                      | Silent cloud fallback                               |
| BYOK Chat  | Provider/key label, direct-egress disclosure, cost source           | Presenting as AGI Managed Cloud                     |
| Work       | Project, approval mode, runtime location, goal/task semantics       | Treating a chat metadata flag as a durable work run |
| Code       | Repo/environment, permission/edit mode, context usage               | Consumer-project memory and normal chat sync        |
| Browser    | Current tab/site scope, ask/act policy                              | Hiding site permission or capture scope             |

### 7.3 Model selector

The selector reads generated catalog output and shows only effective options. It renders:

- Display name.
- Provider.
- Capability role.
- Context/tool/multimodal support where useful.
- Effort values and default.
- Runtime availability.
- Plan/credit lock.
- Local install/running state.
- BYOK key state.
- Rollout status.
- Disabled reason.
- Auto route profile and resulting concrete model after selection.

No surface owns a model list.

## 8. Transcript and message components

### 8.1 Message components

- User message.
- Assistant message.
- System/trust transition notice.
- Temporary/incognito notice.
- Provider/model/routing provenance.
- Attachment card.
- Generated-file card.
- Artifact card.
- Code block.
- Diff block.
- Table/chart/visual.
- Citation chip and sources disclosure.
- Thinking/reasoning disclosure.
- Tool/event group.
- Approval card.
- Error/retry card.
- Usage/context update.

### 8.2 Message actions

- Copy.
- Edit.
- Retry/regenerate.
- Continue.
- Branch/fork.
- Read aloud.
- Feedback.
- Share where allowed.
- Export/download where allowed.
- Add to project/context where allowed.
- Delete subject to ownership/retention policy.

Actions are generated from capability, ownership, retention, and trust policy, not shown universally.

### 8.3 Branching

Message edits and retries preserve a branch graph:

- Parent message id.
- Branch id.
- Version ordinal.
- Active branch pointer.
- Model/provider/runtime provenance.
- Trust transition/handoff metadata.
- Previous/next branch UI.

Replacing message text in place is not acceptable when later turns depend on the old message.

## 9. Typed event and approval rendering

### 9.1 Event requirements

Every event includes:

- Event id.
- Schema version.
- Session/run/turn identifiers.
- Monotonic sequence.
- Timestamp.
- Event kind.
- Status.
- Summary safe for display.
- Structured details safe for an authorized disclosure.
- Surface/runtime/provider/tool provenance.
- Permission domain.
- Sensitivity/redaction classification.
- Retry/idempotency linkage.
- Parent/child relationship.

### 9.2 Rendered event families

- Planning/reasoning summary.
- Tool discovery.
- Tool call.
- Search and citations.
- Connector/app call.
- File operation.
- Shell/code execution.
- Browser/computer action.
- Subagent/delegation.
- Approval.
- Retry/backoff.
- Usage/cost.
- Artifact/file creation.
- Completion/failure.

### 9.3 Approval domains

Do not use one generic approval setting. Required domains include:

- Filesystem read.
- Filesystem write/delete.
- Shell/process.
- Network/domain egress.
- Browser site and action.
- Computer-use application and action.
- Connector read/write.
- Credential/secret access.
- External communication.
- Purchase/financial/high-impact action.
- Schedule/automation creation.
- Managed compute/cost escalation.
- Trust-boundary handoff.

The same policy engine may serve all domains, but the presentation and remembered scope differ.

## 10. Files, artifacts, and rendering

### 10.1 Renderer manifest

Each renderer declares:

- Supported MIME/file types.
- Surface support.
- Preview capability.
- Source/code capability.
- Edit/annotate capability.
- Streaming capability.
- Sandbox requirement.
- Network policy.
- Copy/download/export/publish/print actions.
- Mobile fallback.
- Accessibility strategy.

### 10.2 Viewer contract

- Resizable split pane on capable desktop/web surfaces.
- Full-screen/native route on mobile.
- Independent transcript and viewer scroll.
- Preview/source tabs only when real.
- Type-specific actions.
- Loading/error/unsupported/expired states.
- Sandboxed interactive content.
- Version selector when multiple versions exist.
- Annotation/edit request into the conversation.
- No nested interactive controls.

### 10.3 Artifact security

- Cross-origin sandbox for untrusted HTML/app content.
- CSP and network policy derived from artifact manifest.
- No host credentials in the renderer.
- Expiring scoped preview URLs.
- Explicit public publish operation.
- Tenant and ownership checks on every version/download/share.
- Content scanning and size limits.

## 11. Projects, memory, and search

### 11.1 Project composition

A project owns or references:

- Name/description/instructions.
- Membership and permissions.
- Conversations/work runs.
- Knowledge files and extraction status.
- Connected sources.
- Project-scoped memory.
- Artifacts/deliverables.
- Schedules.

Project context must include actual extracted/retrieved content when claimed. A filename manifest alone is not project knowledge parity.

### 11.2 Memory scopes

- Cloud global memory.
- Cloud project memory.
- Work-project memory.
- Local Desktop consumer memory.
- Mobile local memory.
- Developer workspace memory.
- Browser extension local memory.

Each memory entry needs scope, provenance, update time, user controls, deletion, export, and incognito exclusion.

### 11.3 Search scopes

- Chat/task title and full text.
- Project.
- File/artifact metadata and extracted content.
- Code/developer session.
- Browser-task history where allowed.
- Memory.

Cross-scope search respects data boundaries. A global UI must not imply a global index that violates Local separation.

## 12. Surface contracts

### 12.1 Web

- Managed Cloud only.
- Production route owner must remain singular.
- Server-rendered shell where appropriate; client boundaries kept narrow.
- Full cloud conversation, project, work, artifact, search, settings, billing, and admin surfaces.
- General document ingestion required before claiming file parity.

### 12.2 Desktop

- One Tauri application with Local and Cloud modes.
- Shared DOM components may be used for cloud chat and suitable local chat rendering.
- Tauri owns privileged filesystem, keychain, updater, global shortcuts, microphone, accessibility insertion, native notifications, browser/computer-use bridge, and local host.
- System-wide dictation is a separate native subsystem, not a composer-only microphone.
- Code workspace is a distinct composition over the developer-session protocol.

### 12.3 Mobile

- Expo React Native presentation.
- Local and Cloud only; no BYOK.
- Native navigation, sheets, camera/photos, voice, biometrics, notifications, offline queue, and file preview.
- Shared cloud conversations/projects only in Cloud mode.
- Developer Code view is a remote projection, not a static mock and not local repository execution.

### 12.4 CLI

- Rust TUI over the canonical developer-session engine.
- Local/BYOK/Managed options subject to trust policy.
- Typed transcript, tools, approvals, diffs, checkpoints, subagents, goals, and MCP elicitation.
- No requirement to render consumer artifact galleries or settings modals.

### 12.5 VS Code

- Uses the same developer-session engine and host state as CLI.
- Native VS Code views/diffs/commands where possible; webview only where necessary.
- Local/BYOK/Managed claims must match the real execution stack.
- Remove the secondary provider-stream settings path or explicitly isolate it as a separate feature.

### 12.6 Chrome

- Cloud-only browser-task product with isolated history.
- Side panel plus content-script overlays only where necessary.
- Page/site context is untrusted data.
- Browser, native host, and cloud permissions are explicit.
- Quick mode is a per-turn Auto Economy override; it must preserve the saved picker selection and pass through normal account admission and canonical routing.
- Browser-internal/restricted pages keep Managed Cloud chat available while showing an accessible notice and disabling only page context and browser automation.
- The monolithic side panel must be split by domain before major feature growth.

## 13. Current implementation reality, 2026-07-16 snapshot, cells corrected 2026-08-09

| Capability                        | Web            | Desktop                                                  | Mobile                   | CLI                    | VS Code                | Chrome                                   |
| --------------------------------- | -------------- | -------------------------------------------------------- | ------------------------ | ---------------------- | ---------------------- | ---------------------------------------- |
| Primary shell                     | Live           | Live                                                     | Live                     | Live                   | Live                   | Live                                     |
| Consumer cloud chat               | Live           | Partial                                                  | Live                     | N/A                    | N/A                    | Separate browser chat                    |
| Local consumer chat               | N/A            | Live                                                     | Live                     | N/A                    | N/A                    | N/A                                      |
| AGI Work run (composer mode)      | Live           | Live                                                     | Live                     | N/A                    | N/A                    | Workflow UI is not Cloud Work            |
| Standalone Cowork session surface | Missing        | Missing                                                  | Missing                  | N/A                    | N/A                    | N/A                                      |
| Developer sessions                | N/A            | Local-only `CodeWorkspace` mounted; no remote projection | Static/unwired remote UI | Live                   | Live with split stack  | Not developer-session remote control     |
| Artifacts/files                   | Partial        | Live/partial                                             | Partial                  | Developer files only   | Developer files/diffs  | Image/screenshot only                    |
| Tools/approvals                   | Live/partial   | Live/partial                                             | Live/partial             | Live                   | Live                   | Live/partial                             |
| Search/research                   | Live/partial   | Live/partial                                             | Partial                  | Tool-driven            | Workspace search       | Page operations only                     |
| Voice                             | Dictation only | In-window dictation; system-wide gated off               | Live conversation        | Live (REPL voice)      | Absent                 | Speech input only                        |
| Remote control                    | Absent         | Host/companion UI not mounted                            | Static/feature-off       | Host transport missing | Host transport missing | Native bridge is not Code remote control |

This table is not a release claim. `packages/ai/model-registry/catalog/harnesses.json` remains authoritative for runtime wiring status.

CORRECTED 2026-08-09 (four cells the 2026-07-16 snapshot got wrong or that later
work superseded; mirrors the same corrections in
`docs/work/implementation-status.md`):

- The single "Work/Cowork run: Missing/Missing/Missing" row conflated two
  capabilities and is split, matching the parity matrix's 2026-08-06 split.
  **AGI Work**: composer-mode dispatch, is mounted and wired end to end on all
  three consumer surfaces (`apps/web/lib/workflows/start-cloud-agent-workflow.ts`,
  `apps/web/app/tasks/page.tsx`, `apps/mobile/app/(app)/agents/index.tsx`,
  `AgiWorkProjects`/`AgiWorkArtifacts`/`AgiWorkScheduled` rendered from
  `apps/desktop/src/features/v3/DesktopShellV3.tsx`). Only the **standalone
  Cowork session surface**, a dedicated resumable async workspace rather than a
  mode inside chat, is still Missing.
- Desktop developer sessions are no longer "missing from current shell":
  `CodeWorkspace` is lazy-mounted in `DesktopShellV3.tsx` (Local-only, since
  2026-08-04). What is still missing is the remote projection, which the
  "Remote control" row already records.
- Desktop voice no longer carries a broken system-wide claim. The settings
  control is gated on the `systemDictationAvailable` probe
  (`apps/desktop/src/api/voice.ts`, consumed in
  `apps/desktop/src/features/settings/VoiceSettings.tsx`) and reads "Not
  available in this build" while the probe is false, pinned by
  `VoiceSettings.test.tsx`. The underlying capability is still unbuilt.
  `DESKTOP-SYSTEM-DICTATION-UNWIRED-01` in `docs/agent-context/known-flaws.md`
  stays open, but the UI does not advertise it.
- CLI voice is present, not absent: `apps/cli/src/voice.rs` (`cpal` capture,
  Whisper API/local binary, Local-mode egress gate) is reached from both
  `apps/cli/src/repl/mod.rs` and `apps/cli/src/tui/tui_app.rs` via `/voice`.

## 14. Immediate remediation order

### P0: remove deception and complete foundations

1. Complete Desktop system-wide dictation end to end. **The availability-claim
   branch of this item is done (2026-07-17, `dcb14ca97`)**, the settings control
   is gated on the `systemDictationAvailable` probe and says "Not available in
   this build" while it is false. Building the feature is still open
   (`DESKTOP-SYSTEM-DICTATION-UNWIRED-01`).
2. Define and implement one developer-session remote protocol from CLI/Desktop host through signaling to Mobile/Web projection.
3. Replace Mobile's static Code shell with that protocol or keep the routes unavailable.
4. **Completed 2026-07-16:** Chrome Quick now travels with both side-panel send paths and routes the turn through the admitted `auto-economy` profile without mutating the saved model selection.
5. Gate every control from the effective harness/capability result.
6. Select one Web chat shell and mechanically delete the unmounted alternative after proof.

### P1: shared frontend health

1. Extract headless transcript/event/approval state from DOM renderers.
2. Split Chrome `side_panel.ts` into domain modules.
3. Modularize VS Code's static webview content and remove/reconcile the second execution stack.
4. Implement Web document ingestion and project knowledge extraction/retrieval.
5. Wire CLI MCP elicitation into the live TUI.
6. Reconcile Mobile sync flags/naming with actual Cloud sync behavior.

### P2: product parity

1. Implement first-class Work runs and screens.
2. Implement artifact renderer manifests and versions across supported surfaces.
3. Add typed resumable subagent/tool/approval progress.
4. Add global search over permitted object classes.
5. Complete settings schema/capability-driven rendering.
6. Complete remote host/device, notification, attachment transfer, and recovery states.

## 15. Frontend release and update discipline

### 15.1 Shared package changes

- Version contracts with additive migrations.
- Generate TypeScript/Rust schemas from one source where cross-language.
- Test every supported presentation adapter against golden event fixtures.
- Use affected builds; do not rebuild every application for an isolated surface change unless shared dependencies changed.
- Changes to tokens/primitives require Web, Desktop, and visual-regression checks.
- Changes to event contracts require Web, Desktop, Mobile, CLI, VS Code, and Chrome fixture checks as applicable.

### 15.2 Surface delivery

- Web: continuous deploy with preview, migration compatibility, canary/feature rollout, and rollback.
- Desktop: signed/notarized Tauri bundle, staged updater manifest, schema compatibility, rollback/previous-version support.
- Mobile: store release plus Expo update only for changes permitted by platform policy; native-module changes require store builds.
- CLI: signed binaries/package releases with protocol compatibility and self-update policy.
- VS Code: marketplace prerelease/stable channels and minimum CLI/app-server protocol version.
- Chrome: Manifest V3 store release, migration of storage schema, host-version compatibility, and permission-change review.

### 15.3 Compatibility window

Cloud APIs, sync, remote control, and developer-session protocols must support an explicit version window so older Desktop/Mobile/CLI/extension releases fail gracefully instead of corrupting state.

## 16. Definition of done

A frontend capability is complete only when:

- The production route or native entrypoint is mounted.
- The visible control reaches a real handler.
- The handler reaches the correct runtime/service.
- Runtime capability is verified before enabling the control.
- Trust/provider/execution location is visible where relevant.
- The result and all intermediate typed states render correctly.
- Cancellation, retry, timeout, reconnect, and approval are handled.
- Persistence/reload/sync behavior matches the surface contract.
- Empty/loading/error/disabled/success/offline states are present.
- Keyboard, screen reader, focus, touch, reduced motion, and contrast are verified.
- Responsive/native layouts are visually tested.
- A regression test proves the fixed or added behavior.
- The parity matrix and known-flaw ledger are updated.
- No capability is claimed solely because source files or mock screens exist.

## 17. Evidence

- `docs/research/competitor-capability-session-architecture-2026-07-15.md`
- `docs/work/implementation-status.md`
- `docs/architecture/trust-boundaries.md`
- `docs/agent-context/known-flaws.md`
- `packages/ai/model-registry/catalog/harnesses.json`
- `packages/contracts/types/src/sessions/taxonomy.ts`
