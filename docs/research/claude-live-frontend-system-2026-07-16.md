# Claude live frontend system — 2026-07-16

Status: Point-in-time research evidence  
Owner: Product architecture  
Observed: 2026-07-16  
Last updated: 2026-07-16  
Scope: Authenticated Claude web product, current official Anthropic product material, and a read-only comparison with the mounted AGI frontends

This document records the current frontend system that was directly observed in Claude and the implementation consequences for AGI. It is not a request to copy Anthropic's source, text, icons, or exact visual design. It separates verified behavior from inference and from AGI requirements.

The live inspection was read-only. No prompts were sent, no settings were changed, and no account identifiers, device names, locations, billing amounts, private conversation text, private project memory, connector names, or authorization-token details are reproduced here.

Related evidence:

- `docs/research/claudeai-component-spec-2026-07-10.md`
- `docs/research/claude-live-audit-2026-07-09.md`
- `docs/research/competitor-capability-session-architecture-2026-07-15.md`
- `docs/current/frontend-experience-contract.md`
- `docs/current/parity-implementation-matrix.md`

## 1. Architectural conclusion

Claude is not implemented as one universal chat screen reused unchanged everywhere. The product shares a recognizable shell, typography, tokens, composer language, message/event grammar, permissions, and account capability catalog, then composes different products:

- **Chat** is a cloud conversation surface.
- **Cowork** is a goal/task surface with projects, approvals, skills, schedules, deliverables, and remote or local execution.
- **Code** is a developer-session surface with repositories, environments, diffs, terminals, context usage, routines, and session state.
- **Chrome** is a browser-side agent and browser capability adapter.
- **Mobile** is a cloud chat/Cowork surface and a remote projection/controller for developer sessions.
- **Remote Control** projects a local Code session; it does not turn the session into a normal cloud chat.

The reusable unit is therefore not "the Chat page." The reusable units are:

1. design tokens and primitives;
2. shell navigation grammar;
3. composer parts;
4. typed transcript/event rendering;
5. artifact/file presentation;
6. capability, permission, and approval controls;
7. account/project/memory contracts;
8. surface-specific compositions.

## 2. Visual system

### 2.1 Design language

Observed characteristics:

- Warm neutral backgrounds rather than pure black/white.
- Near-black primary text, muted warm-gray secondary text, and restrained accent colors.
- A serif display face for greetings and major editorial headings.
- A neutral sans-serif face for controls, navigation, metadata, and settings.
- Monospace only for code, terminal output, request/response payloads, identifiers, and shortcuts.
- Thin borders and tonal elevation instead of heavy shadows.
- Rounded surfaces, normally in the 12–20 px family, with smaller nested radii.
- Dense information hierarchy without ornamental gradients.
- Line icons with consistent stroke weight, normally 18–20 px visually.
- Filled icons or checkmarks only for selection, success, warning, and active state.
- Visible focus states, semantic headings, named regions, toolbars, menus, feeds, articles, status regions, and dialogs in the accessibility tree.

AGI should adopt the hierarchy and restraint, not the literal palette, font, copy, or icon drawings.

### 2.2 Layout grammar

Claude repeatedly uses these layouts:

- **Application shell:** resizable/collapsible left sidebar plus one main workspace.
- **Conversation:** constrained transcript column with a bottom composer.
- **Conversation with output:** transcript compressed left plus a resizable right file/artifact pane.
- **Settings:** centered large modal with fixed left settings navigation and scrollable right detail pane.
- **Collection:** heading/action row, search/filter row, then a table or card grid.
- **Empty state:** explanation plus real starter templates or suggested actions.
- **Code workspace:** composable pane/tile layout rather than a consumer-chat column.

## 3. Global application shell

### 3.1 Sidebar anatomy in Home mode

Top to bottom:

1. Claude logo/home link.
2. Collapse control.
3. Global search.
4. Segmented top-level mode switch: Home and Code.
5. New.
6. Quick task.
7. Chats and tasks.
8. Projects.
9. Artifacts.
10. Scheduled.
11. Customize.
12. Expandable Pinned group.
13. Expandable Recents group.
14. View-all and filter/group actions for recents.
15. Optional pinned product/project shortcut.
16. Account/plan chip.
17. Apps and extensions action.

Each recent row has a title and overflow action. The full Chats and tasks screen adds timestamps, search, filtering, and bulk selection; the sidebar intentionally remains compact.

### 3.2 Sidebar anatomy in Code mode

Code changes the navigation composition rather than merely changing the composer:

1. Home/Code switch remains.
2. New becomes **New session** and exposes a keyboard shortcut.
3. Artifacts remains.
4. Routines appears.
5. Customize remains.
6. More navigation is available.
7. Routines, Pinned, and Recents groups show Code-specific sessions/status.
8. Session rows may carry unread, pull-request, merged, or routine status.
9. Account/plan remains at the bottom.

This is evidence for separate Chat/Cowork and Code information architectures over shared primitives.

### 3.3 Sidebar behavior

- Resizable through a visible separator.
- Collapsible by pointer and keyboard shortcut.
- Sections expand/collapse independently.
- Rows expose hover/focus overflow actions.
- Drag-to-pin affordance is present.
- Search is global, not limited to the current list.
- Navigation state is preserved while the main workspace changes.

## 4. Home and composer

### 4.1 Empty Chat state

The empty-state main area contains:

- Incognito control in the upper-right.
- Time-aware greeting.
- Large rounded prompt surface.
- Contextual empty hint.
- Plus menu.
- Chat/Cowork segmented control.
- Model/effort trigger.
- Per-conversation settings control.
- Press-and-hold dictation.
- Voice-mode control.
- Suggested prompt categories: Code, Write, Learn, Life stuff, and a general suggestion category.

The suggestions disappear after the conversation starts. The composer remains available at the bottom of the transcript.

### 4.2 Plus menu

Observed menu order:

1. Add files or photos, with shortcut.
2. Take a screenshot.
3. Add to project, with submenu.
4. Add from GitHub.
5. Divider.
6. Skills, with submenu.
7. Connectors, with status count and submenu.
8. Plugins, with submenu.
9. Divider.
10. Research toggle.
11. Web search toggle with checked state.

The important behavior is not the item count. Items are capability-aware, persistent where appropriate, and grouped by purpose: context, extension system, then execution/research mode.

### 4.3 Model and effort menu

Observed structure:

- Current primary models appear as radio items with one-line role descriptions.
- The current model is checked.
- Temporary entitlement/promotion labels can appear beside a model.
- Effort is a first-class submenu, not buried in settings.
- More/legacy models are separated from the primary roster.

The effort submenu explains the cost/latency tradeoff and exposes Low, Medium, High, Extra, and Max where the selected model supports them. A Thinking control is shown in the same reasoning group and can be forced/disabled by the selected model.

AGI implication: model, effort, thinking, entitlement, capability, and rollout status must come from the canonical model/capability catalog. The UI must not hardcode them.

### 4.4 Chat-specific controls

- Incognito is visible before sending.
- Chat does not show project selection and approval mode as permanent toolbar items.
- Research and web search are selected through the plus menu.
- Voice and dictation are separate controls.
- A caution note appears below an active conversation; its wording changes when citations are present.

### 4.5 Cowork-specific controls

Switching the same composer to Cowork changes its contract:

- Beta status is visible.
- A `/` hint advertises skills.
- Project selector is shown.
- Approval-mode selector is shown.
- Usage/entitlement notice may be shown.
- Cowork-specific starter ideas are shown.
- The composer still shares files, connectors, skills, model, effort, dictation, and account primitives.

Observed approval default is Manual. Official material also documents Auto and Skip modes with different policy behavior. These are policy modes, not cosmetic labels.

### 4.6 Code-specific composer/workspace

The Code home is structurally different:

- Developer-oriented heading.
- Environment/runtime selector.
- Repository selector.
- Task prompt editor.
- Send state.
- Permission/edit mode, such as Accept edits.
- Context/add control.
- Dictation and dictation settings.
- Model selector.
- Effort selector.
- Context/plan usage meter.
- Pane/tile keyboard instructions.

The surrounding Code product adds session lists, repository/worktree status, terminal, editor, browser/preview, diff review, routines, pull-request state, and unread/review state. It should not be implemented as consumer Chat with a code icon.

## 5. Conversation screen

### 5.1 Header

- Editable/renameable chat title.
- Overflow menu.
- Files toggle when generated or attached files exist.
- Share action.
- Optional project/breadcrumb context.

Observed conversation overflow actions:

- Pin.
- Mark unread.
- Rename.
- Add to project.
- Delete.

The menu exposes shortcuts for frequent actions.

### 5.2 Transcript semantics

- Transcript is an accessible feed.
- Each turn is an article with ordinal position.
- User and assistant turns have semantic headings.
- Keyboard instructions explain moving between messages.
- Stream/tool status is announced through status regions.
- The composer remains interactive below the feed.

### 5.3 User message

Persistent or hover/focus actions:

- Timestamp/date.
- Retry.
- Edit.
- Copy.

Editing must preserve branches rather than destructively replacing history.

### 5.4 Assistant message

Persistent actions:

- Copy.
- Read aloud.
- Positive feedback.
- Negative feedback.
- Retry/regenerate.

Assistant content supports prose, headings, lists, code, tables, inline citations, generated-file cards, artifacts, images, and interactive visuals when available.

### 5.5 Conversation states

The frontend contract needs explicit states for:

- Draft.
- Queued.
- Connecting.
- Streaming text.
- Thinking/reasoning.
- Discovering tools.
- Calling a tool.
- Awaiting approval.
- Running a tool.
- Retrying/backing off.
- Waiting for user input.
- Generating a file/artifact.
- Completed.
- Completed with warnings.
- Interrupted.
- Cancelled.
- Failed with retry.
- Failed without retry.
- Offline/reconnecting.
- Rate-limited.
- Usage exhausted.
- Capability unavailable.
- Host/device unavailable.

These states must not be inferred from display strings.

## 6. Inline tool calls and event history

### 6.1 Collapsed event summary

Tool and reasoning work appears above the final answer as a durable, collapsible summary such as:

- Searched the web.
- Viewed, created, or read files.
- Used a connector.
- Loaded tools.
- Ran code.
- Searched prior chats.

The summary remains after completion. It is not replaced by the final prose.

### 6.2 Expanded event history

Expanded tool work is an ordered history containing typed steps:

- Plan/reasoning summary.
- Tool discovery/loading.
- Search query.
- Search result group with result count.
- Connector invocation.
- File open/read/write/present.
- Shell/code execution.
- Subagent/task delegation.
- Approval request and decision.
- Retry/backoff.
- Warning/error.
- Completion marker.

Each row can expose more detail. Request/response payloads belong in nested, monospace disclosure panels and must be redacted according to trust policy.

### 6.3 Web-search presentation

Observed expanded search event:

- One row per query.
- Result count per query.
- List of result title and domain.
- Completion marker.
- Final response below the event history.
- Per-claim inline citation chips in prose.
- Multiple sources may collapse into `source + N`.
- Citation-aware caution wording.

Required rendering states:

- Searching.
- Partial results.
- Query retry.
- Empty results.
- Source blocked/unavailable.
- Complete.
- Citation unavailable after generation.

### 6.4 File/tool presentation

Observed expanded file activity:

- Explanatory planning/skill row.
- Creation/action row.
- Named file row.
- Presented-file row.
- Completion marker.
- Generated-file card after the prose.

The file name, MIME/type, storage/trust scope, scan state, preview ability, and download ability must be structured data.

### 6.5 Required event contract for AGI

AGI should render a shared event union instead of provider-specific prose:

```text
turn.started
turn.delta
reasoning.started
reasoning.summary
tool.discovery.started
tool.discovery.completed
tool.call.started
tool.call.progress
tool.call.approval_requested
tool.call.approved
tool.call.denied
tool.call.completed
tool.call.failed
search.query.started
search.results.updated
search.query.completed
subagent.started
subagent.progress
subagent.completed
file.created
file.updated
artifact.created
artifact.version_created
usage.updated
turn.completed
turn.interrupted
turn.failed
```

Every event needs a stable id, turn id, sequence number, timestamp, status, surface/runtime provenance, permission domain, redaction classification, and resumable-stream cursor.

## 7. Files and artifacts

### 7.1 In-message file card

Observed file card anatomy:

- Type icon.
- Display title.
- Kind and file type.
- View/preview action when renderable.
- Download action when downloadable.

Preview and download are distinct actions. The card is not interactive when no handler exists.

### 7.2 Split-pane viewer

Opening a file/artifact adds a right pane and keeps the conversation available:

- Resizable separator between transcript and viewer.
- Preview/source segmented control when code is available.
- Title and type in the viewer header.
- Copy action.
- Type-specific overflow actions.
- Expand/fullscreen.
- Back/close.
- Loading/error states.
- Sandboxed interactive iframe for HTML-style artifacts.

Observed HTML overflow actions include download and publish. Other types require different action sets; one universal toolbar is wrong.

### 7.3 Viewer types

AGI needs renderer registration for:

- Markdown/document.
- Plain text.
- Source code.
- Diff.
- HTML/React application.
- SVG/diagram/Mermaid.
- PDF.
- Image.
- Audio.
- Video.
- Spreadsheet.
- Presentation.
- JSON/XML.
- Table/chart.

Each renderer declares preview, source, edit, annotate, copy, download, export, publish, print, fullscreen, mobile, and sandbox support.

### 7.4 Separate object classes

Do not merge these into one `Artifact` boolean:

- Conversation attachment.
- Generated downloadable file.
- Conversation artifact/version.
- Persistent published app/site.
- Inline interactive visualization.
- Project knowledge file.

They have different persistence, permissions, retention, sharing, and execution behavior.

## 8. Collection screens

### 8.1 Chats and tasks

- Heading.
- Bulk Select mode.
- Type/status filter.
- New action.
- Search.
- List/table rows with type icon, title, updated time, and overflow.
- Loading, no-results, empty, error, and pagination states.

### 8.2 Projects list

- Heading.
- Sort.
- New project.
- Search with live-result status.
- Responsive project-card grid.
- Card title, optional badge/description, updated time, and overflow.

### 8.3 Project detail

- Breadcrumb back to Projects.
- Renameable title.
- Pin and overflow.
- Description.
- Project-scoped composer.
- Recent chats/tasks.
- Context/knowledge section with search and add.
- Separate synthesized project Memory section with scope and update time.
- Scheduled tasks/add-task section.

Project context and project memory are separate products and separate backend data.

### 8.4 Artifacts gallery

- Heading.
- Filter.
- New artifact.
- Search.
- Tabs: all, owned, shared.
- Responsive card grid.
- Card preview, source/type, title, excerpt, privacy/share state, edited time, views, and overflow.

### 8.5 Scheduled tasks

- Heading.
- Sort by next run or status.
- New task menu.
- Search.
- Empty state.
- Starter templates with icon, title, purpose, cadence, and mini preview.

Observed starter categories cover monitoring, periodic review, briefing, content ideas, meeting preparation, and inbox triage. AGI should create its own templates and language.

## 9. Settings modal

### 9.1 Shell

- Centered large modal over a dimmed/blurred application.
- Approximately two-column layout on desktop.
- Fixed left navigation.
- Search settings input.
- Scrollable right content.
- Close action.
- Hash/deep-linkable section state.
- Responsive full-screen or sheet treatment on smaller surfaces.

Observed navigation:

**Settings**

- General.
- Account.
- Privacy.
- Billing.
- Usage.
- Capabilities.
- Claude Code.
- Cowork.
- Claude in Chrome.

**Customize**

- Skills.
- Connectors.
- Plugins.

### 9.2 General

**Profile**

- Avatar/randomize.
- Full name.
- Display name.
- Work description.
- Global instructions.

**Preferences**

- Appearance: system, light, dark.
- Chat font.
- Motion: system, reduced.

**Voice**

- Language.
- Voice/style.
- Speed.

**Notifications**

- Response completion.
- Code completion/status.
- Code permission requests.
- Code-web emails.
- Dispatch messages.

### 9.3 Account

- Log out all devices.
- Delete account.
- Organization/account identifier copy.
- Trusted devices table.
- Active sessions table.
- Per-session/device revoke action.

### 9.4 Privacy

- Privacy Center and policy.
- Expandable data-protection explanation.
- Coarse location preference.
- Model-improvement/training preference.
- Export data.
- Manage shared chats.
- Manage shared artifacts.
- Manage uploaded files.
- Manage memory preferences.

### 9.5 Billing and usage

The structural requirements are:

- Current plan and entitlement.
- Upgrade/change plan.
- Credit/balance or included usage where applicable.
- Usage broken down by relevant time window/product/model family.
- Reset times.
- Overage or spend controls.
- Invoice/payment history where applicable.
- Honest unavailable/loading/error state.

Account-specific values were intentionally not recorded.

### 9.6 Capabilities

**Memory**

- Search/reference chats.
- Synthesized memory from history.
- View/manage memory and update time.
- Import memory from other providers.

**General**

- Tool access mode.
- Connector search.
- Safety fallback/model switch.

**Visuals**

- Artifacts availability.
- AI-powered artifacts.
- Inline visualizations.

**Code execution and files**

- Cloud execution/file creation.
- Network egress.
- Domain allowlist.

These controls require server-enforced policy. Local UI state alone is not an implementation.

### 9.7 Claude Code settings

Observed groups:

- Session-state classification.
- Safety fallback behavior for flagged messages.
- Light and dark code themes with preview.
- Custom code font.
- High-contrast dark appearance.
- Interface font.
- Transcript text size.
- Transcript width.
- Branch prefix.
- Automatic pull-request creation for remote sessions.
- Draft pull requests.
- Pull-request autofix/monitoring.
- Authorization tokens/devices and revoke controls.
- Delete server-side session copies without deleting local copies.
- Web-session sharing settings.

The settings explicitly distinguish local session data from Anthropic server-side copies. AGI must do the same for Local/BYOK/Managed data.

### 9.8 Cowork settings

- Run new tasks in cloud vs on this computer.
- Global Cowork instructions.

Runtime location is a visible choice. It must not be inferred from a generic Chat/Cowork label.

### 9.9 Browser settings

- Beta/rollout label.
- Enable browser integration.
- Default site policy.
- Allowed or blocked site lists.
- Add/manage website rules.
- Shared policy scope with the desktop in-app browser where documented.

Browser access is a site-scoped permission domain, not one generic `toolsAllowed` flag.

### 9.10 Skills

- Heading.
- Search.
- Browse.
- Add menu.
- Table with skill name, update time, and author.
- Detail/manage actions.

### 9.11 Connectors

- Heading.
- Search.
- Add.
- All/Connected/Not connected filters.
- Table with connector, type, and status.
- Status values for connected, reconnect, connection issue, and connect.
- Detail and authorization flow.

### 9.12 Plugins

- Heading.
- Search.
- Browse.
- Add.
- Table with plugin, author, bundled skill count, and last update.
- Detail/install/manage flow.

Connector connection state, plugin installation, and skill availability are distinct concepts.

## 10. Search, quick task, and command surfaces

### 10.1 Global search

Global search must span supported object classes rather than only chat titles:

- Chats.
- Cowork tasks.
- Projects.
- Artifacts/files.
- Code sessions.
- Routines/automation runs.

Results need type icons, highlighting, recent/direct matches, deeper asynchronous results, keyboard navigation, loading, empty, and error states.

### 10.2 Quick task

Quick task is a fast entrypoint into work without navigating through a collection screen. AGI needs to define whether its equivalent creates a cloud work run, a local desktop task, or an ordinary chat. It must not be a second unlabeled conversation store.

### 10.3 Keyboard and command behavior

Observed product patterns include:

- Sidebar toggle.
- Global search.
- New session/task.
- Upload.
- Conversation menu shortcuts.
- Slash commands/skills.
- Message navigation.
- Code pane/tile manipulation.
- Dictation shortcuts.

Every shortcut needs discoverability, conflict handling, platform mapping, and a Settings entry where user-configurable.

## 11. Responsive and native compositions

Official product material confirms these are composed differently:

- Web/Desktop Chat share cloud conversations and projects.
- Mobile uses native navigation, sheets, previews, camera/photos, voice, and remote Code controls.
- Desktop brokers local folders, extensions, Code workspaces, browser/computer use, and quick entry.
- CLI renders transcript/events/approvals in a TUI, not DOM cards.
- VS Code renders the same developer-session semantics in native editor/webview components.
- Chrome renders browser tasks in a side panel with site permissions and browser state.

AGI should share contracts and headless state across these surfaces, not force DOM components into React Native, Rust TUI, or browser content scripts.

## 12. AGI mounted-source comparison

Status terms:

- **Live:** mounted and connected to a real path.
- **Partial:** mounted, but the contract or backend is incomplete.
- **Dead:** source exists without a production mount.
- **Absent:** no user path was found.

| Area                     | Current AGI evidence                                                       | Status                                       | Required action                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shared UI primitives     | `packages/ui/ui`                                                           | Live                                         | Keep as the token/primitive owner; do not add product stores here.                                                |
| Shared DOM chat          | `packages/ui/unified-chat`                                                 | Live on Desktop, selectively consumed on Web | Split reusable headless contracts/state from DOM presentation.                                                    |
| Web production chat      | `apps/web/features/chat/pages/WebChatPage.tsx`                             | Live                                         | Make this the explicit production owner or migrate atomically to one replacement.                                 |
| Web duplicate chat shell | `UnifiedChatPage.tsx`, `features/chat/v3/WebShellV3.tsx`, `WebSidebar.tsx` | Dead/unmounted                               | Remove mechanically or migrate; do not maintain two shells.                                                       |
| Desktop shell            | `apps/desktop/src/features/v3/DesktopShellV3.tsx`                          | Live, Chat-only mode                         | Add real Work/Code compositions only after their protocols exist.                                                 |
| Mobile shell             | `apps/mobile/app/(app)/_layout.tsx` and drawer feature                     | Live                                         | Keep native presentation; share headless contracts.                                                               |
| CLI                      | `apps/cli/src/tui/tui_app.rs`                                              | Live                                         | Consume generated event/session contracts.                                                                        |
| VS Code                  | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`     | Live but monolithic/duplicated               | Replace the 2,000-line static view with modular native/webview presenters over shared headless contracts.         |
| Chrome                   | `apps/extension/src/side_panel.ts`                                         | Live but monolithic/duplicated               | Split the 7,728-line file into browser task, transcript, workflows, permissions, settings, and transport modules. |
| Model/harness truth      | `packages/ai/model-registry/catalog/harnesses.json`                        | Partial/unwired profiles                     | Affordances must be blocked by the registry's effective runtime state.                                            |

### 12.1 Confirmed high-risk frontend defects

1. **Desktop system-wide dictation is not working end to end.** The current hotkey is WebView-scoped, recording bypasses the native path, and the transcript is not inserted into the composer or another active app. Tracked as `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`.
2. **Chrome Quick mode was cosmetic; fixed 2026-07-16.** Both side-panel send paths now snapshot the preference into `CHAT_MESSAGE`; the privileged Managed Cloud handler maps it to the admitted `auto-economy` profile, while leaving the user's saved picker selection unchanged. The extension suite (1,096 tests), typecheck, and lint passed after the change.
3. **Mobile Code is a static shell.** `CODE_SESSIONS` is empty and no session service feeds it.
4. **Remote developer control is not shipped.** Mobile routes are feature-off and Desktop companion components are not mounted.
5. **Chrome page restriction UI was dead; fixed 2026-07-16.** Restricted browser pages now show an accessible, compact “Page access unavailable” notice. Managed Cloud chat stays enabled; only page context and browser automation are disabled. This replaces the prior impossible branch that removed the notice for both restricted and unrestricted pages.
6. **VS Code has competing execution stacks.** Primary chat uses the CLI app-server while inline/provider-stream settings configure a second path.
7. **Web primary composer accepts images but not the promised general document ingestion path.**
8. **Work/Cowork is not a first-class durable run.** Current labels are project-scoped chat affordances, not resumable task graphs with typed progress, approvals, and deliverables.
9. **CLI MCP elicitation UI appears uninstalled in the live TUI path.** Source exists without the handler being wired.
10. **Capability profiles remain partial or unwired.** UI parity cannot be claimed while the registry says the runtime cannot execute the feature.

## 13. Backend contracts required by the UI

The frontend cannot be completed with components alone. It needs these canonical services/contracts:

### 13.1 Conversation service

- Create/list/search/load/rename/pin/unread/project/delete/share.
- Branch graph and message versions.
- Temporary/incognito retention policy.
- Cloud sync only for Web/Desktop Cloud/Mobile Cloud.

### 13.2 Work-run service

- Goal and constraints.
- Plan/steps/subagents.
- Typed event log.
- Approval requests.
- Pause/resume/cancel/retry.
- Schedules/triggers.
- Deliverables/artifacts.
- Remote/local execution location.
- Device/host presence.

### 13.3 Developer-session service

- Workspace/repository/worktree.
- Local/cloud/SSH environment.
- Thread/turn/item/event.
- Diff/checkpoint/review.
- Terminal/test/CI state.
- Permission mode.
- Model/effort/context usage.
- Remote projection and trusted device.

### 13.4 Artifact/file service

- File metadata and storage scope.
- Version graph.
- Renderer manifest.
- Preview token/sandbox policy.
- Download/export/publish/share.
- Annotation/edit request.
- Retention/deletion.

### 13.5 Capability/policy service

Effective capability must be the intersection of:

- Product status: GA, beta, research preview, rolling, experimental, disabled, unsupported.
- Surface.
- Runtime/trust mode.
- Plan and credits.
- Model/provider.
- Region.
- Operating system.
- Host/device presence.
- Organization/admin policy.
- User preference.
- Tool/site/data sensitivity.

### 13.6 Memory service

- Global cloud-chat memory.
- Project-scoped cloud memory.
- Cowork/work-project memory.
- Local developer memory.
- Local consumer memory.
- Incognito exclusion.
- Provenance, update time, import/export/delete.

These stores must remain scoped; one undifferentiated `memory` table is incorrect.

## 14. Implementation rule for AGI

AGI should reproduce the capability quality, information hierarchy, accessibility, transparent execution, and responsive behavior while keeping an original visual identity.

Do not:

- copy proprietary icons, source, wording, screenshots, or exact layout dimensions;
- expose controls because a component exists;
- merge cloud chats with local developer/browser sessions;
- use one generic approval boolean;
- treat tool progress as transient strings;
- call a static project-scoped chat "Work";
- claim remote control until device pairing, resumable event transport, approvals, and host-presence failure states work;
- claim system-wide dictation until a signed desktop build can capture and safely insert text into another application.

## 15. Verification checklist

For every screen or component migrated from this reference:

- [ ] Route is mounted in production.
- [ ] Empty, loading, error, disabled, success, offline, and permission-denied states exist.
- [ ] Visible controls have real handlers.
- [ ] Capability and rollout state come from the effective capability contract.
- [ ] Trust/runtime/provider labels are visible where behavior can cross a boundary.
- [ ] Stream cancellation and reconnect are tested.
- [ ] Event ordering and idempotent resume are tested.
- [ ] Keyboard navigation and focus return are tested.
- [ ] Screen reader names and live regions are tested.
- [ ] Reduced motion and high-contrast modes are tested.
- [ ] Narrow/mobile and wide/split-pane layouts are visually checked.
- [ ] Persistence/reload behavior is verified.
- [ ] No account-private data appears in logs, analytics, screenshots, or docs.

## 16. Official sources

- [Claude release notes](https://support.claude.com/en/articles/12138966-release-notes)
- [Claude Cowork across web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- [Claude Cowork getting started and permissions](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Claude Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
- [Claude Code Desktop](https://code.claude.com/docs/en/desktop)
- [Claude Code IDE integrations](https://code.claude.com/docs/en/ide-integrations)
- [Claude Code Remote Control](https://code.claude.com/docs/en/remote-control)
- [Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome)
- [Claude in Chrome permissions](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide)
- [Claude models, effort, and thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)
- [Claude projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Claude artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Claude artifact publishing and sharing](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)
- [Claude web search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search)
- [Claude Research](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- [Claude memory and chat search](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [Claude voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode)
- [Claude file creation](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
