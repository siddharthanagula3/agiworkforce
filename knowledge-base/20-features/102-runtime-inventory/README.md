---
id: "AREA-102"
type: "area"
title: "Runtime inventory"
features: ["F102-01", "F102-02", "F102-03", "F102-04", "F102-05", "F102-06", "F102-07", "F102-08", "F102-09", "F102-10", "F102-11", "F102-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 102. Runtime inventory

This area describes where each part of AGI Workforce runs: in the browser, on our servers, in background workers, on the user's computer, in the command-line app, in the editor and Chrome extensions, and on the phone. A person gets one assistant that behaves the same way on each surface, and can choose to keep some work on their own device. Knowing which runtime does what is how an engineer finds the right code, and how a tester tells a real local run from a cloud run.

**Who uses it.** Every signed-in user uses the cloud chat path. Deep research is paid only: the route comment says free requests are rejected in processRequest (apps/web/app/api/llm/v1/chat/completions/route.ts:561-566). Published-artifact connectors need a plan with the artifact_connectors capability (apps/web/lib/services/artifact-connector-gate.ts:26). Cloud code sandboxes need a server flag and the managed-compute private beta (apps/web/lib/e2b/gate.ts:20-28; apps/web/lib/managed-compute-gate.ts:55). Desktop and CLI users work on folders they grant. Developers run the CLI headless or interactively. Phone users can run a model on the phone (Local mode). Scheduled runs, background jobs and indexing run with no user present. The brief shows platform status only, so it does not say which roles are admins.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F102-01](F102-01-cloud-chat-answers-streamed.md) | Cloud chat answers, streamed | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-02](F102-02-durable-agent-runs-and-deep-research.md) | Durable agent runs and deep research | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-03](F102-03-background-jobs-schedules-connector-sync-and-index.md) | Background jobs, schedules, connector sync and indexing | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-04](F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md) | Cloud code sandbox, cloud browser and cloud computer | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-05](F102-05-desktop-app-shell-and-its-local-helper.md) | Desktop app shell and its local helper | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-06](F102-06-local-commands-and-their-sandbox.md) | Local commands and their sandbox | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-07](F102-07-command-line-app.md) | Command-line app | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-08](F102-08-on-device-model-on-the-phone.md) | On-device model on the phone | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-09](F102-09-editor-and-browser-extensions.md) | Editor and browser extensions | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-10](F102-10-mobile-app-and-phone-to-desktop-relay.md) | Mobile app and phone-to-desktop relay | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-11](F102-11-live-voice-sessions.md) | Live voice sessions | n/a | n/a | n/a | n/a | n/a | n/a |
| [F102-12](F102-12-published-artifacts-and-their-sandbox.md) | Published artifacts and their sandbox | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/102-runtime-inventory.md](../../10-requirements/capabilities/102-runtime-inventory.md).

## How this area works in the code

1. **1. The person sends a message.** A chat message creates or updates a conversation. The server checks the user owns any project it names before saving. (`apps/web/app/api/chat/conversations/route.ts:236-240`)
2. **2. The model route decides the path.** The model route checks the plan and the request mode. Deep research starts a cloud agent run; ordinary chat streams directly. A free request is refused for deep research. (`apps/web/app/api/llm/v1/chat/completions/route.ts:161`, `apps/web/app/api/llm/v1/chat/completions/route.ts:561-566`)
3. **3. Ordinary chat streams back.** The model output is transformed into the streaming shape and wrapped with the keepalive layer, so the connection survives quiet periods. (`apps/web/app/api/llm/v1/chat/completions/route.ts:786`, `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:29-50`)
4. **4. A long turn becomes a durable run.** The turn is queued on the cloud-agent-turn queue and the workflow runs it. The workflow waits for a device if one is needed, then runs the invocation step. (`apps/web/lib/workflows/start-cloud-agent-workflow.ts:63`, `apps/web/lib/workflows/start-cloud-agent-workflow.ts:264`, `apps/web/lib/workflows/cloud-agent-workflow.ts:69-100`)
5. **5. The invocation runs the model.** The workflow step opens a stream, parses the input, and runs the model and tools. Research runs its loop of search and fetch rounds. (`apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:534-545`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2762-2772`)
6. **6. Usage is settled.** After the run ends, the work plan is settled and cost is recorded by outcome. (`apps/web/lib/workflows/steps/settle-workflow-invocation.ts:203-212`, `apps/web/lib/workflows/cloud-agent-workflow.ts:88-93`)
7. **7. Background jobs drain.** A cron drains queued background jobs for up to 250 seconds, running up to 12 at once, using the handler registry. (`apps/web/app/api/cron/drain-background-jobs/route.ts:17-38`, `apps/web/lib/jobs/job-handlers.ts:347-367`, `apps/web/lib/jobs/job-drain.ts:209`)
8. **8. Schedules and stuck runs are swept.** The schedule cron runs due schedules in waves. The reaper ends orphaned agent runs. (`apps/web/app/api/cron/run-schedules/route.ts:43-63`, `apps/web/app/api/cron/reap-agent-runs/route.ts:23`, `apps/web/lib/services/cloud-agent-run-reaper.ts:90`)
9. **9. Desktop and CLI run local work.** The desktop dispatcher receives a command from the window and runs native services. Shell commands go through a policy check and, where present, a sandbox. The CLI does the same for its run_command tool. (`apps/desktop/electron/runtime/dispatcher.ts:3496`, `apps/desktop/electron/runtime/shellService.ts:575-585`, `apps/desktop/electron/runtime/shellSandbox.ts:189-202`, `apps/cli/src/sandbox.rs:196-217`, `apps/cli/src/features/exec/tools/bash/mod.rs:85-100`)
10. **10. Phone runs local inference or sends to the cloud.** In Local mode a conversation is answered on the phone by the local model package. Otherwise it goes to the cloud route. The desktop refuses local inference. (`apps/mobile/app/_layout.tsx:187-196`, `packages/platform/local-llm/src/selector.ts:105`, `apps/desktop/electron/runtime/dispatcher.ts:3242`, `apps/desktop/electron/runtime/dispatcher.ts:3367`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | The main model route: plan checks, the cloud chat path, the deep research branch and streaming (maxDuration 300 at :161). |
| `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Wraps a stream so a keepalive line is sent every 2 seconds of silence and a dropped client is logged. |
| `apps/web/lib/workflows/start-cloud-agent-workflow.ts` | Starts a durable cloud agent turn on the queue and attaches the run (runCloudAgentTurn at :264). |
| `apps/web/lib/workflows/cloud-agent-workflow.ts` | The durable workflow loop: device wait, invocation, settle, close the stream. |
| `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts` | The workflow step that opens the durable stream and runs one model invocation (:534). |
| `apps/web/app/api/cron/drain-background-jobs/route.ts` | Cron entry that drains background jobs under a 250-second budget. |
| `apps/web/lib/jobs/job-handlers.ts` | The registry of background job types (media, file purge, export, email, schedules). |
| `apps/web/lib/e2b/gate.ts` | Switches for the cloud code sandbox (AGI_E2B_EXECUTION and E2B_API_KEY). |
| `apps/desktop/electron/runtime/dispatcher.ts` | Desktop privileged host: every renderer command goes through here; refuses on-device inference at :3242. |
| `apps/desktop/electron/runtime/shellSandbox.ts` | Detects the macOS Seatbelt or Linux bubblewrap sandbox and plans sandboxed shell commands. |
| `apps/cli/src/sandbox.rs` | CLI sandbox detection and policy (Seatbelt, bubblewrap, or none with a warning). |
| `apps/mobile/app/_layout.tsx` | Mobile app root; decides whether a conversation is local (on-device) or cloud. |
| `packages/platform/local-llm/src/tier3.ts` | Loads the on-device model runtime on the phone. |
| `apps/extension/src/background.ts` | Chrome extension MV3 service worker: site allow list, messaging and gateway calls. |
| `packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx` | The sandboxed iframe that renders interactive artifacts. |
| `apps/web/lib/services/artifact-connector-gate.ts` | Plan and release gate for connectors in published artifacts. |

## What is stored

- Conversations, messages and cloud agent runs (their state while a turn runs): Server database, through the data-layer adapter and the cloud-agent-run service (apps/web/app/api/llm/v1/chat/completions/route.ts:140-146 imports it)
- Durable workflow frames for a cloud agent run (open frame and stream data): Written by the durable step writeDurableFrames (apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:538-541)
- Background job rows (type, payload, attempts): Server database; read and written by drainBackgroundJobs (apps/web/lib/jobs/job-drain.ts:209)
- Cloud sandbox session state and compute reservations: Server side, in the E2B runtime (apps/web/lib/e2b/runtime.ts:880-900 area)
- Desktop coding session threads and approvals: Developer session service on the desktop, through the CLI app-server (apps/desktop/electron/runtime/developerSessionService.ts:1453-1458)
- On-device model files and loaded model state on the phone: Device storage, loaded by packages/platform/local-llm (tier3.ts:26-40)
- Chrome extension site allow list: Browser extension storage under SITE_ALLOWLIST_STORAGE_KEY (apps/extension/src/background.ts:200-215; key defined in the background policy module)
- Voice session records: Server, created by apps/web/app/api/voice/live/sessions/route.ts

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Set to 1 to turn on the cloud code sandbox. Default is 0 in the example file. (apps/web/lib/e2b/gate.ts:6, :12, :17; apps/web/.env.example:384)
- **E2B_API_KEY**: Sandbox key. Together with the flag, enables provisioning. e2bProvisioningReady needs the flag and a key. (apps/web/lib/e2b/gate.ts:7, :10, :21-25)
- **AGI_E2B_COMPUTE_MICROUSD_PER_SECOND**: Compute price for sandbox seconds (example file only; its reader was not opened). (apps/web/.env.example:386)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA**: Private beta gate for managed compute; the cloud code sandbox also requires it. Read as on when unset. (apps/web/lib/managed-compute-gate.ts:40, :55)
- **CONNECTOR_RELEASE_STATE**: Global connector release state. Set to coming_soon, so connectorsReleased() is false and all artifact connectors are refused. (packages/contracts/types/src/connector-release.ts:14, :46-50)
- **SELECTIVELY_RELEASED_CONNECTOR_IDS**: Thirteen connector IDs that are released one by one (used by connectorReleased). (packages/contracts/types/src/connector-release.ts:16-28)
- **artifact_connectors plan capability**: Plan tier needed for connected apps in published artifacts. (apps/web/lib/services/artifact-connector-gate.ts:26)
- **Deep research paid-only rule**: Free requests cannot start deep research. (apps/web/app/api/llm/v1/chat/completions/route.ts:561-566)
- **Cron authorization and low-power skip**: Cron routes refuse requests that fail the cron check, and skip work in low-power mode. (apps/web/app/api/cron/drain-background-jobs/route.ts:21, :26; apps/web/app/api/cron/run-schedules/route.ts:23, :28)
- **SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET**: Address and secret of the relay. Missing or insecure values refuse pairing. (apps/web/app/api/pair/claim/route.ts:70-71)
- **voice_live routing slot**: Chooses the live voice model. It must resolve to a live, managed model. (apps/web/app/api/voice/live/sessions/route.ts:189-195)
- **Desktop API base URL rule**: Desktop API address must be first-party HTTPS, or localhost for development. (apps/desktop/electron/config.ts:46-50)
- **CLI sandbox mode and --no-sandbox**: Sandbox mode (read-only, contained, unrestricted) and the no-sandbox flag, chosen by the user or trust settings. (apps/cli/src/sandbox.rs:23, :596-620)
- **CLI full-screen mode**: Turns the full-screen screen off and uses the plain line-based mode. (apps/cli/src/lib.rs:362)
- **VS Code shell approval setting**: Requires approval before a shell command runs in the editor agent. (apps/extension-vscode/package.json:78)

## Shared between apps

Shared across apps: the server routes and workflows (apps/web) serve the web app, the desktop app's hosted window, the extensions and mobile through the same API. The UI for the chat artifacts is in packages/ui/unified-chat, shared by desktop, web, the Chrome extension and VS Code. Contracts for connectors, billing and artifact security are in packages/contracts/types. The phone and desktop share the device-steps contract in packages/contracts/local-runtime. The protocol types are generated from crates/agiworkforce-protocol. Separate per app: the desktop main process and dispatcher (apps/desktop/electron), the CLI (apps/cli, Rust), the VS Code extension host (apps/extension-vscode), the Chrome service worker and content scripts (apps/extension), the phone app (apps/mobile, with the local model package packages/platform/local-llm), and the relay (services/signaling-server).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's vercel.json line numbers are stale. The real lines: drain-background-jobs is at vercel.json:150 (brief says :110), index-retrieval-documents at :62 (brief :38), reap-agent-runs at :70 (brief :42), run-schedules at :50 (brief :26). (vercel.json:50, :62, :70, :150)
- The brief cites apps/desktop/electron/runtime/dispatcher.ts:799 as the local model runtime. That line is a capability reason text; desktop refuses on-device inference. (apps/desktop/electron/runtime/dispatcher.ts:799; apps/desktop/electron/runtime/dispatcher.ts:3242, :3367)
- The brief cites apps/desktop/electron/main.ts:884 for the desktop renderer and config.ts:39 for the hosted URL. main.ts:884 is a screen-capture picker. config.ts:39 is the localhost check. The window load is at main.ts:345 and main.ts:745. (apps/desktop/electron/main.ts:884, :345, :745; apps/desktop/electron/config.ts:39, :46)
- The brief cites apps/desktop/electron/main.ts:1345 for the privileged host. That line is cloud-request telemetry. (apps/desktop/electron/main.ts:1340-1350)
- The brief cites developerSessionService.ts:686 for the local daemon. That line is a terminal cleanup. The app-server spawn is at :1453-1458. (apps/desktop/electron/runtime/developerSessionService.ts:686, :1453)
- The brief cites apps/cli/src/lib.rs:3115 for the headless runtime. That line renders pending approvals. The real headless entry was not confirmed. (apps/cli/src/lib.rs:3112-3118)
- The web layout is an async server component, which contradicts the brief's claim that the web app runs as a client-side React application. (apps/web/app/layout.tsx:117)
- e2bExecutionEnabled() is true when the key is set alone, unlike the other gates that need the flag. No caller outside gate.ts was found, so it looks unused. (apps/web/lib/e2b/gate.ts:9-14)
- Connectors are globally coming soon, so the artifact connector route refuses every connector. The file also lists thirteen individually released connector IDs, and the artifact gate never uses them. (packages/contracts/types/src/connector-release.ts:14, :16-28; apps/web/lib/services/artifact-connector-gate.ts:20)
- The artifact iframe combines allow-scripts with allow-same-origin. Safety depends on the sandbox origin being separate from the app origin; this was not verified. (packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx:148; apps/web/lib/artifact-sandbox.ts:158)
- The brief says the CLI runs commands in an OS sandbox by default. The code warns and runs without one when no sandbox tool is found. Which path is the default was not confirmed. (apps/cli/src/sandbox.rs:455-470, :536-541)

## Not established

- Cloud browser (S102.09) and cloud virtual computer (S102.10): no runtime found in the code. Only the extension's cloud agent client was found (apps/extension/src/features/computer-use/cloudAgentClient.ts), which is not a browser or computer runtime. Treated as missing, as the brief says.
- Connector sync (S102.28): no worker for mail or drive content was found. The cron at vercel.json:162 refreshes a connector directory; its handler was not opened.
- Whether the sandbox is on in production: the brief says it is off unless the flag is set, and the example file ships 0, but production values were not visible.
- What the desktop shell does when detectShellSandbox returns none (shellSandbox.ts:189-203): the shell path after that choice was not traced.
- Whether the CLI's default sandbox mode is on: sandbox.rs:536-541 bails when no sandbox is found, but which constructor the default path uses was not confirmed.
- Scheduled-run and drain behaviour under failure: the handler bodies were only partly read.
- The chat stream's exact fallback when a provider fails mid-answer: the route code is large (1535 lines) and only the streaming and research parts were read.
- Per-app status: the brief gives only a platform status for each item, so the per-app parts of each feature are based on which code exists, not on the brief.
- No builds, tests or servers were run. The task was read-only, so nothing here was executed or verified in a running app.
