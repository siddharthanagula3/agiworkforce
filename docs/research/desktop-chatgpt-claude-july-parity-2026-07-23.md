# Desktop ChatGPT / Claude July parity research

**Status:** Point-in-time research
**Last verified:** 2026-07-23
**Scope:** AGI Desktop, current ChatGPT Desktop, and Claude Cowork/Desktop

## What the benchmark is now

ChatGPT Desktop is no longer just a native chat client. The July 2026 product combines three
workflows in one shell:

- **Chat** for ordinary conversations;
- **Work** for longer research, file, browser, connector, and deliverable-producing tasks;
- **Codex** for repository work, diffs, review, and remote development sessions.

The same release line adds unified and pinnable recents, projects, cloud continuity for Work,
device-local conversations that remain local, a built-in browser, visible questions and approvals,
scheduled or triggered work, a plugin directory containing skills/apps/templates, and
Record & Replay for turning a demonstrated computer-use workflow into a reusable skill.

Primary source:
[ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes.html).

Claude's current comparison point is Cowork rather than only Claude Chat. Cowork supports remote
sandboxed execution and explicit local-device execution, project-scoped tasks, cross-device
dispatch, computer use with permission controls, reusable personal and organization skills, live
artifacts, and enterprise activity export through OpenTelemetry.

Primary sources:
[Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview),
[computer use](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork),
[projects](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork),
[cross-device dispatch](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork),
[skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude),
[live artifacts](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork), and
[OpenTelemetry activity](https://support.claude.com/en/articles/14477985-monitor-claude-cowork-activity-with-opentelemetry).

## New screenshot evidence

The 41 images supplied in `/Users/siddhartha/Desktop/untitled folder 2/` were visually inspected and
renamed by product, surface, sequence, and state. They cover:

- ChatGPT iOS Health onboarding, permissions, connected accounts, records, conditions,
  medications, family history, and dashboard states;
- ChatGPT iOS Work expanded agent activity;
- ChatGPT iOS voice onboarding, live voice, web-search activity, reasoning status, and researched
  response;
- Claude iOS Cowork cross-device continuity;
- Claude Desktop Cowork Record a skill entry, consent, capture, processing, progress/output/context
  layout, and playback.

The Claude recording sequence is also negative evidence: it accepted a capture reporting zero
steps, processed it, and only later reported that most screenshots were black and that it lacked
enough information to create a reliable skill. AGI should preflight permissions and capture health,
reject a zero-step result immediately, and let the user review sensitive captured text before
saving.

## AGI Desktop implementation findings

AGI already has a comparatively mature native foundation:

- native computer-use execution and approval policy under
  `apps/desktop/src-tauri/src/sys/commands/computer_use.rs`;
- real macOS Accessibility, Screen Recording, and Input Monitoring checks under
  `apps/desktop/src-tauri/src/sys/commands/system_permissions.rs`;
- a reusable automation executor, inspector, recorder, code generator, and persisted scripts under
  `apps/desktop/src-tauri/src/automation/`;
- a standard `SKILL.md` loader and managed/workspace skill manager under
  `apps/desktop/src-tauri/src/core/skills/`;
- the shared `@agiworkforce/unified-chat` transcript/composer instead of an independent Local chat
  renderer;
- explicit Local, BYOK, and Managed Cloud trust modes.

The parity problem is primarily incomplete wiring and duplicated or stale contracts, not a lack of
native capability.

## Gap matrix

| Priority | Capability                     | Current AGI state                                                                                                                                                 | Required closure                                                                      |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| P0       | Desktop launch/close/reopen    | Main close/black-screen path fixed and tested; packaged title-bar/tray/update paths remain                                                                        | Package-equivalent lifecycle matrix                                                   |
| P0       | Managed Cloud continuity       | Wired but persistent sign-in and Web/Mobile sync need live proof                                                                                                  | Real sign-in, stream/tool/artifact/reload/sync smoke                                  |
| P0       | Browser control                | Native host and Chrome pairing exist; real approved action remains unproven                                                                                       | Chrome profile pairing, approval, one action, denial, reconnect                       |
| P0       | Record a skill                 | Wired from the live shared composer through global input capture, review, managed `SKILL.md`, and native registry; automated native single-step save smoke passes | Real multi-app record, new-chat invocation, approved replay, and packaged-build proof |
| P0       | Retry/regenerate               | Missing from the live shared runtime                                                                                                                              | Shared truncate/replay contract for Local/BYOK/Cloud plus persistence                 |
| P0       | Release package                | Developer build works; release-equivalent signing/notarization is incomplete                                                                                      | Reproducible packaged build and clean-profile smoke                                   |
| P1       | Work as a first-class surface  | AGI Work is primarily a chat mode; no complete durable WorkRun/Plan/Step/Approval product surface                                                                 | Shared durable run model, work home, outputs/context/progress, resume                 |
| P1       | Projects and recents           | Project/folder and chat foundations exist; Chat/Work/Codex-style unified filtering and pinned continuity are incomplete                                           | Shared recent-item model and project-scoped Local/Cloud history                       |
| P1       | Record fidelity                | Click/type/scroll capture works; no per-step image, active-app identity, narration, or capture-health score                                                       | Screen/app metadata, black-frame detection, optional voice, semantic step grouping    |
| P1       | Replay resilience              | Recorded skills contain coordinate-first steps                                                                                                                    | Accessibility selectors, assertions, retry/repair, dry run, rollback                  |
| P1       | Scheduled/triggered work       | Several scheduling primitives exist, but one durable suite-wide task model is incomplete                                                                          | Shared schedule/run/history contract and notification recovery                        |
| P1       | Artifacts and deliverables     | Shared renderers and native document tools exist; live artifact and all-format persistence are incomplete                                                         | Durable manifest, editable/live artifact, reopen/export/share                         |
| P1       | Voice                          | Desktop voice/dictation primitives exist; current ChatGPT-style interruption and multimodal continuity need real parity proof                                     | Full-duplex interruption, streamed text, tool/search activity, recovery               |
| P1       | Enterprise local-device broker | Strong Local/BYOK boundary exists; organization policy distribution and device posture are incomplete                                                             | Signed policy, MDM controls, connector/tool allowlists, device inventory              |
| P1       | Enterprise observability       | Local logs and analytics exist; canonical tenant audit/OTel export is missing                                                                                     | Immutable organization audit, OTel export, retention and redaction policy             |
| P2       | Skills administration          | Personal managed/workspace skills exist                                                                                                                           | Organization publish/approve/version/revoke and marketplace lifecycle                 |
| P2       | Cross-device dispatch          | Partial Desktop/Mobile/Web concepts exist                                                                                                                         | Signed dispatch, explicit local-host approval, outputs, offline handoff               |
| P2       | Built-in browser               | Chrome control is external-extension based rather than an integrated task browser                                                                                 | Decide integrated browser vs approved extension broker; preserve policy boundary      |

## Architecture recommendation

Keep one Desktop shell and two execution families:

- **Local/BYOK:** native device host, local persistence, local tools and models, explicit provider
  labels, and no silent cloud egress.
- **Managed Cloud:** the shared Web/Mobile/Desktop conversation, run, project, artifact, entitlement,
  and organization services.

Share conversation contracts, status/event projection, model capability metadata, approvals,
artifacts, projects, settings schemas, and organization policy through packages. Keep only native
mechanics—OS permissions, keychain, file access, input capture, window management, and app
automation—inside Desktop Rust/Tauri adapters.

This preserves cross-platform reach without flattening the trust boundary or discarding the mature
Desktop implementation.
