---
id: "F110-10"
type: "feature"
title: "Moving work between devices"
aliases: ["Moving work between devices", "Web conversation to mobile continuation (S110.18)", "CLI session to desktop continuation (S110.19)", "Desktop session to IDE continuation (S110.20)", "Mobile request to authorized local-host execution (S110.21)", "Chat sync", "Local sessions", "Remote Control", "Dispatch", "Companion"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S110.18", "S110.19", "S110.20", "S110.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "api:GET /api/chat/sync", "api:POST /api/chat/sync", "table:web_conversations", "table:web_messages", "store:cloud sync state"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-10 Moving work between devices

Cloud chats sync between web, desktop and mobile with a version cursor. Terminal, desktop and VS Code sessions for one folder share the CLI's local session store through the app server. Sending a request from the phone to a paired computer exists in code but is switched off in the v1 phone build.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.18](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11018), [S110.19](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11019), [S110.20](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11020), [S110.21](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11021).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets work follow the person across devices: a web chat shows on the phone and replies sync back; a terminal coding session is listed and resumable in the desktop app and in VS Code; the phone can send a task to a paired computer under that computer's approvals.

**Why it exists.** The brief wants the same conversation or session to continue on another device (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.18-S110.21).

**Who uses it.** Signed-in people with more than one AGI app; developers who switch between terminal, desktop and editor.

**Problems it solves**

- Losing a chat when changing device
- Re-explaining a coding session when moving from terminal to editor
- Starting work from the phone on a computer at home

**Use cases**

- Start a chat on the web, continue it on the phone.
- Start a session in the terminal, resume it from the desktop app's local sessions.
- Open the same folder in VS Code and resume the thread.
- Pair the phone and dispatch a task to the computer (not in the v1 build).

## 2. User experience

**Where to find it**

- Web and mobile chat list: conversations appear in the chat list after sync (apps/mobile/src/features/chat/ChatsListScreen.tsx:327; apps/mobile/services/cloudSyncEngine.ts).
- Desktop (hosted web Code area): LocalSessionsSection lists local sessions for approved folders (apps/web/features/code/components/LocalSessionsSection.tsx:161).
- VS Code: sidebar session list and resume (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:939, 1571; commandSetup.ts:458).
- Phone: companion screens at companion/index.tsx, hidden from the drawer navigation and unavailable in v1 (apps/mobile/app/(app)/_layout.tsx:110-112; companion/index.tsx:183).
- CLI: sessions are created and resumed with `agi resume` (apps/cli/src/lib.rs:917-926).

**Before you start**

- Chat sync: signed in, mobile in Cloud mode with FEATURES.cloudChat on and a cloud account (apps/mobile/services/cloudSyncEngine.ts:97-108); workspace policy allows chat sync (apps/web/lib/managed-compute-gate.ts:262-281).
- Local sessions: folder approved in the desktop app or VS Code workspace; the CLI binary runs as an app server (developerSessionService.ts:1453, 2575; localRuntimeClient.ts:2575).
- Remote control: paid plan tier (billing-catalog.ts:352 remote_control PAID_TIERS), FEATURES.companion and FEATURES.dispatch on, relay host reachable (apps/desktop/electron/config.ts:19, 135-143).

**Screens and controls**

- Mobile sync status in the cloud sync store with states idle, syncing and error (cloudSyncEngine.ts:1007-1060).
- Local sessions list with rename, archive and pin menus (LocalSessionsSection.tsx:56-130).
- Companion screen scanner, pairing code, 'Show the full result' and dispatch composer (companion/index.tsx; DispatchTaskComposer.tsx:184).

**Journey**

1. Chat: send a message on the web; the server stores it with a server version.
2. The phone's sync loop runs every 30 seconds while the app is active and on return to the foreground; it pushes local changes then pulls changes after its cursor (cloudSyncEngine.ts:993-1080).
3. The conversation and messages appear on the phone; a follow-up is pushed and appears on the web on its next pull.
4. Sessions: in the terminal run the CLI; the session is saved in the CLI's store.
5. In desktop or VS Code the app starts the CLI app server and lists threads with thread/list; choose a thread and the app resumes it with thread/resume (developerSessionService.ts:2559-2580; localRuntimeClient.ts:1652-1670).
6. Phone dispatch (when on): scan or enter a pairing code, send a task; the computer shows its normal approvals and relays the result (codeRemoteController.ts; remoteControlService.ts).

**What the person sees and gets**

- Mobile sync status and a chat-sync-off reason when workspace policy refuses (cloudSyncEngine.ts:993-1004, 1019-1022).
- Session lists grouped per folder.
- Remote result shown with 'Show the full result' toggle (DispatchTaskComposer.tsx:170-190).

**Settings**

- agiWorkforce.cliPath in VS Code (localRuntimeClient.ts:104).
- FEATURES.cloudChat, companion, dispatch in the phone build (apps/mobile/lib/v1FeatureFlags.ts:4, 12, 16).
- Mobile app mode Cloud versus Local (cloudSyncEngine.ts:97-108).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chat sync API with version cursor, push and pull (apps/web/app/api/chat/sync/route.ts:105-160, 542, 1020-1021).
- Mobile sync engine: push, pull, memory, projects and settings steps; 30 s loop; foreground trigger (apps/mobile/services/cloudSyncEngine.ts:1007-1080).
- Desktop local sessions listing through the app server's thread/list with pagination guard (apps/desktop/electron/runtime/developerSessionService.ts:2559-2580).
- VS Code thread list, resume and read through the same kind of app server (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1652-1676).
- CLI app server implements thread/list with cursor checks (apps/cli/src/app_server/developer_host.rs:2915).
- Desktop and VS Code remote-control hosts exist (apps/desktop/electron/remote/remoteControlService.ts; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:320-340).

**Incomplete**

- Both desktop and VS Code start the CLI binary as an app server, so they share the CLI's session store [inferred from developerSessionService.ts:2575 and localRuntimeClient.ts:2575]; the store location is the same only if both point at the same configuration directory (not verified).
- Chat sync excludes temporary chats (chat/sync/route.ts:131).

**Present but disconnected or switched off**

- Phone remote control: FEATURES.companion and FEATURES.dispatch are false in the v1 build, and the companion screen returns an unavailable notice (apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/index.tsx:108, 183). The brief marks mobile done.

**Not available**

- CLI cannot send a task to a paired computer (brief: missing; not searched further).
- Chat sync does not run in mobile Local mode (cloudSyncEngine.ts:97-108).
- Chrome: not applicable (brief n/a).

## 4. Required behaviour

**Established requirements**

- A web conversation appears on the phone with full history, a follow-up there syncs back to web. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.18)
- A terminal coding session appears in the desktop app's local sessions for that folder and can be resumed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.19)
- A desktop session is listed in VS Code for the same folder and can be continued there. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.20)
- A phone request runs on the paired computer under its approvals and the result is shown on the phone. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.21)
- The sync cursor must be a valid server version. (source: apps/web/app/api/chat/sync/route.ts:113-119)
- Remote Control is hidden in v1 phone builds. (source: apps/mobile/lib/v1FeatureFlags.ts:12, 16; owner decision recorded in project memory (not a repo file))

**Acceptance criteria**

1. A chat created on web appears in the phone chat list within about 30 seconds of the phone being in the foreground in Cloud mode.
2. A message sent from the phone appears in the web conversation after the next web load or pull.
3. A temporary chat does not sync.
4. An invalid since value returns a validation error 'Invalid chat sync cursor'.
5. A session started in the terminal for a folder appears in the desktop local sessions list for that folder.
6. The same thread can be resumed in VS Code with thread/resume.
7. On the v1 phone build the companion screen shows 'Remote' unavailable and cannot send a dispatch.
8. When workspace policy refuses chat sync, mobile shows the off reason and web returns the policy refusal.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-mode phone chats should never leave the device (AGENTS.md section 6 forbids silent routing) [inferred; engine returns early outside Cloud mode].
- Terminal and editor sessions share state only on the same machine because the store is local; cross-machine continuation of terminal sessions is not part of this feature [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a last-synced time and a manual sync control on web and desktop.
- [proposed] Add a test that the desktop and VS Code resolve the same session store path.
- [proposed] Record a decision on when companion and dispatch return to the phone build.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Pull and push conversations, messages and artifacts by server version (lines 105-160, 542, 1020-1021). |
| service | buildChatSyncGateResponse | `apps/web/lib/managed-compute-gate.ts` | Workspace policy gate for chat sync (line 262). |
| table | web_conversations / web_messages / web_artifacts | `apps/web/app/api/chat/sync/route.ts` | Rows read by the pull with server_version columns (lines 125-160). |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Mobile sync loop for chats, memory, projects, settings (lines 97, 433, 448, 993, 1007, 1068). |
| store | useCloudSyncStateStore | `apps/mobile/services/cloudSyncEngine.ts` | Holds cursor, status and last sync time (used at lines 434-445, 1013-1058). |
| screen | ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile chat list (brief cites line 327). |
| component | LocalSessionsSection | `apps/web/features/code/components/LocalSessionsSection.tsx` | Lists local sessions with rename, archive and pin. |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Starts the app server and pages thread/list (lines 1749, 2559-2580). |
| service | developer_host (app server) | `apps/cli/src/app_server/developer_host.rs` | CLI app server implementing thread methods including thread/list (line 2915). |
| service | localRuntimeClient | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code client: listThreads, resumeThread, readThread (lines 1652-1676). |
| service | ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sidebar session list and resume handling (brief cites lines 939, 1571). |
| service | desktop remoteControlService | `apps/desktop/electron/remote/remoteControlService.ts` | Desktop host for phone requests; relay URL allow-list from config.ts (lines 19, 135-143). |
| service | vscode remoteControlService | `apps/extension-vscode/src/features/remote-control/remoteControlService.ts` | Relays session events to the phone (lines 320-340). |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Shared remote controller logic. |
| screen | Companion screen | `apps/mobile/app/(app)/companion/index.tsx` | Pairing and dispatch UI; returns FeatureUnavailable when off (lines 99-112, 183). |
| component | DispatchTaskComposer | `apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx` | Task input and result list. |
| config | v1FeatureFlags | `apps/mobile/lib/v1FeatureFlags.ts` | cloudChat true, dispatch false, companion false (lines 4, 12, 16). |
| config | remote_control entitlement | `packages/contracts/types/src/billing-catalog.ts` | remote_control limited to paid tiers (line 352). |
| test | cloud-sync-engine test | `apps/mobile/__tests__/cloud-sync-engine.test.ts` | Covers the mobile sync engine. |
| test | developerSessionService test | `apps/desktop/electron/__tests__/developerSessionService.test.ts` | Covers the desktop session service. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web or mobile writes messages; mobile marks them for sync and the loop pushes them to POST /api/chat/sync. | device and our servers | cloudSyncEngine.ts:448, 1095-1110; chat/sync/route.ts:542 |
| The server gate checks workspace policy and stores rows with a server_version. | our servers | chat/sync/route.ts:110-112; managed-compute-gate.ts:262-281 |
| The other device pulls rows with server_version greater than its cursor, in pages, and advances the cursor. | device and our servers | chat/sync/route.ts:113-160; cloudSyncEngine.ts:433-446 |
| Desktop or VS Code starts the CLI as a local app server and asks it to list or resume threads. | device | developerSessionService.ts:2559-2580; localRuntimeClient.ts:1652-1676 |
| Phone dispatch (switched off) would pair via a relay host and send the task to the computer, which asks for approvals locally. | outside service | apps/desktop/electron/config.ts:19, 135-143 (relay on a fly.dev host); remoteControlService.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chats, messages, artifacts | Tables web_conversations, web_messages, web_artifacts on our servers | Yes, by server_version cursor; temporary chats excluded | Deleted rows come back as tombstones with deleted_at (chat/sync/route.ts:127-160) |
| Sync cursor and status | Mobile cloud sync state store on the device | No | Per account epoch; stale epochs are dropped (cloudSyncEngine.ts:1007-1040) |
| Local coding sessions | CLI session store on the device | No cloud sync | User files; archive and rename supported in the list |

**Models and providers.** No model is called by sync itself. A follow-up on the phone uses whichever route the chat is set to (Cloud, own key or Local); in Local mode the engine does not sync (cloudSyncEngine.ts:97-108).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chat sync needs a signed-in Cloud account (captureCloudAccountEpoch). Local sessions need no account for listing; remote control needs an account and pairing. |
| Permissions | Workspace policy resource chat_sync (managed-compute-gate.ts:262-281); desktop folder approval for sessions [inferred from listRoots in developerSessionService.ts:2550-2553]. |
| Subscription | remote_control is limited to paid tiers (billing-catalog.ts:352). Chat sync has no plan rule found; only workspace policy. |
| Limits and metering | Pull page limits MAX_CONVERSATIONS_PULL, MAX_MESSAGES_PULL, MAX_ARTIFACTS_PULL (chat/sync/route.ts:125-150); mobile guard of 50 pull pages (cloudSyncEngine.ts:92); artifact push batch 500 (line 95). |
| Feature flags | FEATURES.cloudChat, FEATURES.companion, FEATURES.dispatch. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Remote control relay host is limited to the first-party host and one named relay host by isAllowedRelayUrl (apps/desktop/electron/config.ts:135-143). |
| Local mode | Mobile Local mode keeps chats on the device and does not sync (cloudSyncEngine.ts:97-108). Local coding sessions on desktop, CLI and VS Code stay on the computer. Local inference is free of any plan; sign-in is a separate question: listing local sessions needs none [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid cursor | Validation error 'Invalid chat sync cursor'. | chat/sync/route.ts:113-119 |
| Workspace refuses sync | Server returns policy refusal; mobile stores an off reason. | chat/sync/route.ts:110-112; cloudSyncEngine.ts:993-1004 |
| Sync running | One sync per account key at a time. | cloudSyncEngine.ts:1007-1017 |
| Step failure | Status error naming the failed steps; next loop retries. | cloudSyncEngine.ts:1023-1052 |
| Account switched mid-sync | Operation dropped silently. | cloudSyncEngine.ts:1020-1022, 1053-1060 |
| Large backlog | hasMore with cursor; mobile loops up to 50 pages. | chat/sync/route.ts:160-175; cloudSyncEngine.ts:92 |
| Session list does not advance | Error 'The session list stopped advancing.' | developerSessionService.ts:2570-2577 |
| Session list unreadable | Error 'The session list could not be read.' | developerSessionService.ts:2565-2568 |
| Remote control off | Companion shows an unavailable notice; plan without remote control shows an entitlement notice. | companion/index.tsx:183-185 |
| Offline | The mobile loop retries every 30 seconds and on return to the foreground, so local changes wait until the network returns [inferred from the push/pull design]; empty state texts for the lists were not reviewed. | apps/mobile/services/cloudSyncEngine.ts:1068-1080 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/cloud-sync-engine.test.ts`: Mobile sync engine.
- `apps/mobile/__tests__/cloud-sync-wiring.test.ts`: Sync wiring.
- `apps/mobile/__tests__/cloud-sync-turn-order.test.ts`: Turn order in sync.
- `apps/web/app/api/chat/sync/route.artifact-index.test.ts`: Sync route artifact index.
- `apps/web/app/api/chat/sync/route.compaction-cache.test.ts`: Sync route compaction cache.
- `apps/web/features/code/components/LocalSessionsSection.test.tsx`: Local sessions list.
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Desktop session service.
- `apps/desktop/electron/__tests__/remoteControlService.test.ts`: Desktop remote control.
- `apps/extension-vscode/src/__tests__/developerSessionHandoff.test.ts`: VS Code session hand-off.
- `apps/web/features/desktop-host/__tests__/RemoteControlSection.test.tsx`: Remote control settings section.

**Test scenarios**

- **Web to phone**
  1. Cloud mode on both.
  2. Send a web message.
  3. Foreground the phone.
  - Expected: Conversation and message appear within one loop.
- **Phone to web**
  1. Send a follow-up on the phone.
  2. Reload the web chat.
  - Expected: The message is present with its role.
- **Temporary chat**
  1. Make a temporary chat on web.
  2. Sync the phone.
  - Expected: It does not appear.
- **Terminal to desktop**
  1. Start the CLI in a folder and send a message.
  2. Open the desktop local sessions for that folder.
  - Expected: The thread is listed and resumes.
- **Desktop to VS Code**
  1. Open the same folder in VS Code.
  2. List threads and resume the desktop thread.
  - Expected: The thread opens with history.
- **Phone dispatch in v1**
  1. Open the companion route on a v1 build.
  - Expected: Unavailable notice; no dispatch.

**Where to look when it fails**

- Server: 'Invalid chat sync cursor', workspace policy log '[chat-sync] denied by workspace policy' (managed-compute-gate.ts:276-279).
- Mobile: cloud sync state store error and failed step names.
- Desktop: DeveloperRuntimeUnavailableError messages for the session list.
- Tables web_conversations server_version column.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)
- VS Code: [70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Phone dispatch cannot run in the v1 build although the brief says mobile done.** Affects: Mobile. Evidence: v1FeatureFlags.ts:12, 16; companion/index.tsx:183. Work needed: Correct the brief; re-enable only by owner decision.
- **No test found that desktop and VS Code read the same session store as the CLI.** Affects: Desktop, VS Code, CLI. Evidence: Searches of the desktop and VS Code test folders found session service tests but none named for cross-app store parity. Work needed: Add a cross-app test or a recorded manual check.
- **CLI cannot start a task on another computer.** Affects: CLI. Evidence: Brief S110.21 cli missing. Work needed: Decide; the CLI decision list may rule it out (not checked).
- **Empty, waiting and failure states for the session lists were not established.** Affects: Desktop, VS Code. Evidence: Not opened. Work needed: Review and record.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- api:GET /api/chat/sync
- api:POST /api/chat/sync
- table:web_conversations
- table:web_messages
- store:cloud sync state

## Unknown

- Whether the desktop and VS Code point the CLI app server at the same session directory in every install.
- How the web app on desktop reacts when the CLI binary is missing.
- Whether desktop-to-web chat sync for the Electron window differs from the browser (it shows the hosted web app).
- The relay's rate and approval behaviour (relay not deployed per owner memory; not a repo fact).
- Empty and error states of the VS Code session list.
- Whether the chat sync route enforces any plan limit beyond workspace policy.
