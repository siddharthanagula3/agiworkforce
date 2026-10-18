# Tauri Desktop completeness and visual review

Status: Open, point-in-time review
Owner: Desktop surface maintainers
Observed: 2026-10-17, America/Chicago
Scope: Running Tauri app, its source/build provenance, Local and bundled Cloud UI, and the pending hosted-Cloud implementation.

## Decision

The open app is running an older executable than the current file on disk. Its Cloud mode still uses the bundled desktop renderer. A newer, uncommitted implementation opens the hosted website in a separate Tauri window, but that implementation is not active in the inspected process.

Keep the native Local runtime and storage/tool infrastructure. Finish the cross-cutting Local defects and configuration flow. Validate the newer hosted-Cloud build before investing in or removing the older bundled Cloud adapters. Do not discard the whole Tauri implementation because its currently running UI is behind.

No whole advanced feature is certified fully complete by this review. A screen opening, a registered command, a passing mock-based test, and a successful end-to-end user workflow are different evidence levels.

## Which application was inspected

| Item                          | Evidence                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Main workspace                | `/Users/siddhartha/Desktop/agiworkforce`, HEAD `9fc0784512` at the start of this pass                                             |
| Running app checkout          | `/private/tmp/agiworkforce-tauri-01a14b06`, HEAD `f88889526ea6` plus uncommitted changes                                          |
| Running executable            | `/private/tmp/agiworkforce-tauri-01a14b06/target/debug/agiworkforce-desktop`, PID 11420                                           |
| Process start                 | October 17, 2026, 13:34:37 CDT                                                                                                    |
| Current executable file       | Rebuilt October 17, 2026, 15:08:10 CDT                                                                                            |
| Loaded versus disk executable | Process text mapping inode 299080474; current pathname inode 301014569. The file was replaced after launch.                       |
| Live renderer                 | `tauri://localhost/index-BivQZHE3.js`; native window handle `main`                                                                |
| Current dist renderer         | `/index-CYnIcg7E.js`, built 15:05:16 CDT                                                                                          |
| Live Cloud transition         | Remains `tauri://localhost`, with one `main` window and bundled Cloud controls                                                    |
| Pending hosted Cloud          | `HostedCloudController` invokes `window_open_cloud`; Rust opens the configured origin's `/chat` in `hosted-cloud` and hides Local |

The pending architecture lives in the temporary checkout's `apps/desktop/src/features/cloud/HostedCloudController.tsx`, `apps/desktop/src-tauri/src/ui/cloud_window.rs`, and `packages/contracts/local-runtime/src/cloud-host.*`. It is present in the newer disk build, not in the inspected process. A restart/new-build acceptance pass is still required.

Eighteen key Local defect owner files were SHA-256 compared between the temporary checkout and the main workspace and were byte-identical. Source parity does not by itself prove every current file was compiled into the older running process.

## Evidence and classification

- **Observed working:** the named, bounded action succeeded in the running app.
- **Connected:** current source reaches a real handler/storage/transport; live completion may remain unverified.
- **Unconfigured:** missing runtime, model, account, folder, grant, or connector; not proof that implementation is missing.
- **Partial:** useful implementation exists, but important behavior is unfinished or intentionally limited.
- **Broken in this session:** visible failure in the running app. Root cause is not automatically a code defect.
- **Source-confirmed defect:** a concrete code path fails under the stated condition; not represented as a live reproduction.
- **Disconnected:** an owner exists but has no production caller or required wiring/input.
- **Retire candidate:** obsolete or orphan code, subject to dependency and migration checks before removal.

Computer Use inspected the current Claude Desktop Home/Cowork screen and the AGI website in Comet. It could not bind the unbundled Tauri executable. With the user's WDIO direction, a standalone WDIO session attached to the already-running debug endpoint; it did not run the repository's E2E runner, reset application data, rebuild, restart, install models, grant permissions, send prompts, upload files, create schedules, or delete data.

WDIO read rendered DOM, captured native webview screenshots, opened navigation/settings sections, inspected detected runtime status, and switched Local/Cloud. It returned the app to Local. New-chat navigation was exercised without sending a message.

The webview reported `document.visibilityState === 'hidden'` during part of inspection. Closed Radix dialogs could remain in their exit-animation DOM/rendered state. Those transient close/animation results are **not** classified as product defects. Cloud pages were recaptured after a mode round-trip removed the lingering dialog. Async loading states were allowed to settle before their resulting failures/statuses were recorded.

## What is working and should be kept

| Area                      | Live result                                                                      | Code state                                                          | Disposition                                                       |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Local/Cloud navigation    | Both modes opened and their separate histories/views appeared                    | Distinct runtime and storage boundaries                             | Keep the boundary; migrate Cloud deliberately                     |
| Cloud transcript reading  | Existing synthetic verification conversation rendered                            | Real Cloud history/streaming/persistence clients exist              | Keep shared contracts; no fresh send/stream/cancel certification  |
| Local model detection     | Picker correctly showed no models; all four runtime panels reported not detected | Real Ollama and OpenAI-compatible Local HTTP clients                | Keep; configure a runtime before judging inference                |
| Native settings reads     | Version, CPU/memory, OS permission statuses and configured agents loaded         | Native commands are connected                                       | Keep; do not infer every setting mutation is verified             |
| Local schedules           | Existing daily/weekly memory jobs and next-run labels loaded                     | Persistent scheduler, background loop, catch-up and history exist   | Keep; execution was not triggered in this audit                   |
| Automation listing        | Empty trigger list and creation entry points loaded                              | Cron, webhook and file-watch trigger implementations exist          | Keep; verify trigger-to-agent completion                          |
| Local artifacts/projects  | Empty galleries/lists loaded without inventing content                           | Native storage and CRUD owners exist                                | Keep; lifecycle defects below still apply                         |
| Local memory              | Native empty list and controls rendered                                          | Keyed database and memory handlers exist                            | Keep; correct misleading sync status copy                         |
| MCP/connector management  | Catalog and 16 configured server entries loaded                                  | Transport, discovery, credentials and approval infrastructure exist | Keep; all 16 were disconnected, so actual tools were not verified |
| Single instance/autostart | Source registration and mounted settings confirmed                               | Implemented, despite stale inventory claims                         | Keep; lifecycle/launch-at-login acceptance remains unverified     |

Relevant owners: `apps/desktop/src/runtime/{TauriRuntime,CloudRuntime}.ts`, `src/lib/cloudChatPersistence.ts`, `src/stores/{projectStore,chat/chatStore}.ts`, `src-tauri/src/lib.rs:173,191,354,830`, and `src-tauri/src/sys/commands/{mcp,terminal,scheduler}.rs`.

## Local mode: incomplete, disconnected, or broken

| Area                                         | Exact state                                                                                                                                                      | Recommended action                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Local chat on this machine                   | No model detected; setup checklist 0/3; Send disabled                                                                                                            | **Configure**, not discard. A separate model server and model are required.                   |
| Shared private model server                  | Loopback accepted; private numeric IPs require opt-in; public/named hosts rejected                                                                               | **Keep and finish** authenticated discovery and redirect containment                          |
| Authenticated LM Studio/llama.cpp/vLLM       | Chat can send a saved bearer key; `/models` availability/discovery omit it                                                                                       | **Fix** before relying on protected shared servers                                            |
| Temporary-chat Stop                          | Temporary native ID is -1; stop handler only looks up a persisted ID and returns without cancelling when none exists                                             | **Fix** native cancellation mapping                                                           |
| Local vision                                 | Runtime discovery can report vision, but both attachment gates require generated-catalog vision metadata                                                         | **Connect** runtime capability evidence to attachment admission                               |
| Local agent work                             | Live Work screen refused launch for the selected/missing model. Unknown server models lack agentic/tool metadata                                                 | **Connect** capability discovery; keep fail-closed behavior                                   |
| Terminal AI and auxiliary research inference | Local Auto candidates can receive an empty default model ID rather than a discovered/selected model                                                              | **Connect** the selected/discovered model at the shared auxiliary routing boundary            |
| Code workspace                               | Opened with “Failed to load directory” and no files in this setup. Real editor/read/write/diff exists                                                            | **Keep; finish** folder selection/error handling and dirty-buffer protection                  |
| Code folder switch                           | Source directly clears all buffers after selecting a different folder without the tab-close unsaved-change flow                                                  | **Fix** potential edit loss before broad use                                                  |
| Design/Canvas                                | Live board explicitly says session-only; shape tools, undo/redo and PNG export exist                                                                             | **Partial:** finish save/reopen/import, or label it a disposable sketchpad                    |
| Research                                     | UI promises multi-source research; document source receives no directories; memory source returns an explicit stub result; readiness uses configuration booleans | **Finish/connect** sources and truthful readiness; do not call multi-source research complete |
| Artifact gallery reopening                   | Exact React/SVG render type is persisted natively but ignored by gallery mapping                                                                                 | **Fix** the shared artifact type mapping                                                      |
| Artifact image export                        | Save-copy helper writes text content even for a `.png` extension                                                                                                 | **Fix** binary/image export                                                                   |
| Browser viewer                               | Real CDP/browser implementation; Pause sets streaming false, which the auto-start effect immediately reverses                                                    | **Keep; fix** the paused lifecycle                                                            |
| Computer use                                 | Real native execution/consent/cancellation paths exist                                                                                                           | **Connected but unverified:** depends on model route, permissions and platform behavior       |
| External database assistant tools            | UI advertises five database tools, but SQL connection pools have no production creation flow                                                                     | **Connect** an approved connection flow or hide the unsupported capability                    |
| Voice dictation                              | Live UI selected Local Whisper but warned it is not compiled; default build excludes the feature                                                                 | **Finish build/setup**, or keep clearly unavailable                                           |
| Wake phrase/system-wide dictation            | Live UI marks unavailable; backend hard-refuses these paths                                                                                                      | **Defer or finish**; not shipped capabilities                                                 |
| Spoken replies/Piper                         | System TTS/VAD status loaded; Piper voices not installed                                                                                                         | **Keep; configure/test**; no microphone or playback tests performed                           |
| Claude Code plugins page                     | Live UI explicitly says its actions change Claude Code, not AGI chat                                                                                             | **Separate or remove from core navigation**; it is not an AGI plugin system                   |
| Workflow recorder                            | UI/native recording, review and skill creation paths exist                                                                                                       | **Connected/conditional:** record-to-replay success not verified                              |

### Concrete source anchors

- Local server auth: `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs:650`; `sys/commands/llm.rs:1500,1761`.
- Local address boundary: `providers/local_endpoint.rs:30`; HTTP clients have no Local-specific redirect restriction at `providers/http_client_factory.rs:139`. A configured Local server's 307/308 redirect can forward the prompt body publicly. This conditional source-confirmed risk was not live-reproduced; do not claim bearer-key leakage.
- Temporary Stop: `apps/desktop/src/runtime/TauriRuntime.ts:783,1275,1369`.
- Vision/capabilities: `src/runtime/localChatTurn.ts:39`, `TauriRuntime.ts:522`, `src-tauri/src/sys/commands/chat/attachments.rs:12`, `sys/commands/llm.rs:1783`.
- Auxiliary model routing: `src-tauri/src/features/terminal/ai_assistant.rs:10,61`, `core/research/orchestrator.rs:386`, `core/llm/llm_router.rs:1495,2094`, `core/llm/models_config.rs:404`.
- Research sources/readiness: `core/research/agents.rs:376,580`, `core/research/orchestrator.rs:146,274`, `sys/commands/research.rs:411`. Config fields `analysis_model`, `synthesis_model`, `max_concurrent_agents` have no execution consumer in the inspected search.
- Editor data loss: `src/features/code/CodeWorkspace.tsx:164`, `src/stores/codeStore.ts:185,423`.
- Browser Pause: `src/features/browser/BrowserViewer.tsx:164`, `src/stores/browserStore.ts:400`.
- Artifact identity/export: `src/features/artifacts/openArtifactInChat.ts:19`, `publishAdapter.ts:58,81`, `src-tauri/src/core/llm/tool_executor/artifact_tools.rs:70,97`, `packages/ui/unified-chat/src/components/ArtifactPanel.tsx:885`.
- Voice: `src-tauri/Cargo.toml:301`, `sys/commands/voice.rs:472,841`, `features/speech/dictation/coordinator.rs:36`.

## Running bundled Cloud: what failed and what is missing

| Area                    | Live result / source evidence                                                                      | Disposition                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Account/profile         | Refresh banner and profile “Load failed”                                                           | **Broken in this session.** API/auth/service cause not isolated; not proof the entire implementation is absent. |
| Usage                   | Composer showed “Usage unavailable”                                                                | **Broken in this session.** Revalidate with the intended build and account.                                     |
| Skills                  | “Load failed”; source adapter also lacks authoring callbacks present on Web                        | **Connect if legacy UI remains; otherwise retire with hosted migration**                                        |
| Memory                  | “Couldn’t reach your Managed Cloud memory. Device-local memory was not used.”                      | **Broken in this session**, with a correct no-Local-fallback boundary                                           |
| Library/media jobs      | “Could not reach the server” and generations could not load                                        | **Broken in this session**, not safe to call complete                                                           |
| Projects                | “Load failed”                                                                                      | **Broken in this session**; real project clients exist                                                          |
| Cloud schedules         | Service could not be reached; separate Free-plan restriction was also displayed                    | **Blocked by both session failure and entitlement**, not an implementation-missing claim                        |
| Plugins                 | Live obsolete claim that no Cloud plugin installation/API exists                                   | **Stale/disconnected legacy UI**; Web has installation routes and a shared panel                                |
| Cloud artifact edits    | Source exposes Save even though `CloudRuntime.updateArtifact` is absent; local state still updates | **Source-confirmed missing persistence** in the legacy path; no live edit test performed                        |
| Cloud feedback/branches | Message action adapter only supplies them for Local                                                | **Disconnected in legacy Cloud**; existing Web contracts should be reused if retained                           |

Owners: `apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:31`, `DesktopCloudSettingsModal.tsx:1077`, `src/features/chat/useTauriMessageActions.ts:203`, `src/runtime/CloudRuntime.ts`, `packages/ui/unified-chat/src/components/ChatInterface.tsx:732,1092`, and `apps/web/app/api/plugins/installations/route.ts:34,77`.

These legacy adapter findings should not automatically become work items for the pending hosted-website path. The website owns that path's feature UI. Validate its actual flows first.

## Pending hosted Cloud: what remains

The rebuilt, uncommitted implementation makes Cloud a separate hosted website window and keeps Local mounted. The old bundled Cloud branches become retirement candidates only after this transition is accepted.

- Prove start, sign-in, Local-to-Cloud switch, close/return to Local, restart, and failure recovery in the new process.
- Verify native menu actions and navigation target the intended window.
- The new host does not inject the Electron `agiHost` bridge or grant Local IPC to the website. Hosted Cloud is browser-equivalent; integrated Cloud-to-device tools are **not automatically connected**.
- If Claude-like Cloud tasks operating on local files/apps are intended, implement a narrowly permissioned native bridge and validate consent, scope, errors and cancellation. Do not grant the hosted origin broad Tauri IPC access.
- Window-creation error handling exists; usable network/load-failure recovery is not established by that alone.

## Visual findings and Claude reference

Observed Tauri state: webview viewport 1470 × 923 logical pixels, screenshot 2940 × 1846. The as-found Local appearance was light chat chrome with dark purple settings/native panels.

1. **Theme split is live-confirmed.** The root had no `dark` class, `data-theme-id="catppuccin-mocha"`, generic `--background: 240 21% 15%`, and `--chat-bg: #fff`. Code/Design controls also showed dark text against the dark panel. Fix one coherent theme application path before tuning individual colors.
2. **The shell and secondary workspaces feel like different UI generations.** Chat is relatively restrained; Code/Design/Research and the long settings pages expose a separate dense treatment. Keep their functionality and consolidate typography, controls, surfaces, empty states and navigation.
3. **Settings repeat several MCP/connector management layers in one section.** Catalog, health, server exposure, integration manager, credentials/configuration and cloud storage appear together. Consolidate the user journey without deleting the underlying native transport.
4. **Misleading Local copy remains.** Local Projects promises cross-device continuity; Local Memory displayed “Synced to your account, available on every device,” while the native Local data remains separate.
5. **First-run guidance is useful but the app is not configured.** Preserve the checklist, distinguish not installed/not running/unauthorized/unsupported, and lead users to the missing runtime/folder rather than making all advanced features look ready.
6. **Do not use an old prose design rule as proof of current Claude behavior.** The live Claude Home/Cowork screen also has multiple composer control rows. Earlier reasoning that a two-row composer alone proves Tauri is outdated was too strong. Actual visual comparison should be based on the same task/state.

Claude reference was limited to the authorized installed app's current Home/Cowork navigation and composer: Home/Code modes, Projects/Artifacts/Scheduled/Design/Customize navigation, Chat/Cowork selector, project/folder scope and approval control. No blanket Claude feature-parity or performance claim is made.

## What to retire, and what not to discard

| Candidate                                                                                    | Safe decision                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Old bundled Cloud settings/auth/runtime adapters                                             | Retire after hosted-Cloud acceptance and checking remaining host/migration consumers. Do not finish obsolete adapters merely because they still exist. |
| `features/layout/TitleBar.tsx`, `UserProfile.tsx`                                            | Dead-export candidates: no current renderer consumer found. Verify with the dependency graph before deletion.                                          |
| Standalone `features/document/DocumentWorkspace.tsx`                                         | Orphan UI, only barrel export found. Remove or integrate into the existing artifact/file experience; retain real document commands.                    |
| Claude Code plugin manager                                                                   | Move to explicitly external/developer integration or remove from normal AGI extension navigation. Do not present it as AGI chat functionality.         |
| Native Local/BYOK runtime, SQLCipher store, permissions, terminal, MCP, scheduler, artifacts | Keep. These are valuable implemented foundations, not dead UI. Fix their concrete gaps.                                                                |
| Local and Cloud trust boundaries                                                             | Keep separate even if visual primitives and contracts are unified.                                                                                     |

## Recommended completion order

1. Validate the newer hosted-Cloud candidate after a controlled restart; record exact executable/renderer identity. No more Cloud-adapter work until the target architecture is settled.
2. Fix data-loss/cancellation/privacy defects: editor folder switch, temporary Stop, Local redirect containment, authenticated model discovery.
3. Connect selected-model and capability metadata across chat, Terminal AI, Research and agent work.
4. Fix artifact reopen/save/export and Research source/readiness claims.
5. Repair the theme split and consolidate secondary workspace/settings UI.
6. Decide whether persistent Canvas, wake phrase and global dictation belong in the next release; finish them or keep them explicitly unavailable.
7. Retire genuinely orphaned/legacy interfaces and update stale inventories only after the replacement is verified.

## Validation and limits

This visual pass used live WDIO navigation/DOM/screenshot observations, not mocked response fixtures. It did not run the full repository WDIO suite because its preparation resets an isolated app-data directory and several specs seed mock account responses or create data.

Earlier in this conversation, the main workspace passed 169 focused Tauri frontend tests, 4 native Local-endpoint tests, and command wiring checks (546 registrations, 538 live frontend calls, 8 reviewed orphans). The Rust egress guard passed with 35 transports awaiting migration. Those results do not certify this older running executable or the new hosted-Cloud build.

No new prompts, model downloads, connector grants, account changes, file edits, schedule runs, microphone recordings or destructive operations were performed. Implementation files were not changed. The audit produced this report and screenshots.

Remaining live acceptance: a configured Local model turn, attached-image inference, protected LAN inference, tool approvals and cancellation, restart/history recovery, file editing/save/reopen, artifact generation/edit/export, MCP tool execution, scheduled/triggered task completion, voice, new hosted Cloud and its native-device integration.

Existing inventories are not a completion percentage: the ecosystem ledger still records a September 26 audit at `21d439536`, and the recent Claude desktop implementation ledger principally concerns Electron. Existing single-instance/autostart “missing” inventory claims contradict present source. Keep `audit/registers/known-flaws.md` as the canonical defect owner and link existing IDs rather than duplicating them.

## Screenshot evidence

Screenshots are saved in the chat's artifact directory, outside the repository's source tree:

`/Users/siddhartha/.codex/visualizations/2026/10/17/01a14b76-586e-7cd0-b938-d3bf42f58bad/tauri-audit/`

Useful frames: `01-local-home.png`, `02-local-models.png`, `03-local-voice.png`, `05-local-plugins.png`, `06-local-connectors.png`, `09-local-memory.png`, `11-code.png`, `12-design.png`, `13-research.png`, `15-work.png`, `16-schedules.png`, `18-cloud-transition.png`, `20-cloud-plugins.png`, `21-cloud-skills.png`, `22-cloud-memory.png`, `23-cloud-library.png`, `24-cloud-schedules.png`, `25-cloud-projects.png`, `26-restored-local.png`.

Read these with the loading/hidden-webview caveat above. A screenshot is evidence of its captured state, not proof of the whole feature's lifecycle.
