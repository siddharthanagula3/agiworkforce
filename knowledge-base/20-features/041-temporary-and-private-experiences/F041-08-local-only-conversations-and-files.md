---
id: "F041-08"
type: "feature"
title: "Local-only conversations and files"
aliases: ["Local-only conversation", "Local-only file collection", "Local Mode chats", "Local privacy mode", "Local sessions", "Keep chats on this device", "Cloud mirror switch", "S41.14", "S41.15"]
area: "41 Temporary and private experiences"
available_on: ["mobile", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "missing", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S41.14", "S41.15"]
depends_on: ["surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:web", "surface:desktop", "mode:local", "mode:cloud", "mode:own-key", "SYS-local-inference", "SYS-execution-boundaries", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "F041-09", "F041-10", "F041-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-08 Local-only conversations and files

Chats and files that stay on the device. Mobile Local Mode keeps chats and files in on-device storage; a copy to AGI Cloud needs a separate, reviewed action. CLI Local sessions run on local models and need an explicit handoff to leave. VS Code and Chrome are partial. Web and Desktop have no Local mode.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.14](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4114), [S41.15](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4115).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person keep conversations, and files used in them, on their own device so they are not uploaded to the AGI account. Each app does it differently: Mobile Local Mode runs on-device models; CLI Local privacy mode only allows local model providers; VS Code runs local models and saves developer sessions on the computer; Chrome has a switch that stops copying Managed Cloud chats to the account.

**Why it exists.** The product has three separate trust boundaries (Local, own key, Cloud). Local must stay on the device and any move to another boundary must be explicit (doc: AGENTS.md section 6; doc: docs/product/requirements.md section 7.1 and 7.4).

**Who uses it.** People who want AI help without sending chats or files to a server, and developers working on private code.

**Problems it solves**

- Chats are not silently uploaded.
- Moving to Cloud or a provider key needs a visible step with a preview.
- Works without an AGI account on Mobile.

**Use cases**

- Chat on a phone with a downloaded on-device model while offline.
- Ask the CLI about a private repo using a local model and attach files that stay on the machine.
- Keep Chrome side-panel chats in the browser only by turning the mirror off.
- Later copy selected local chats to AGI Cloud on purpose.

## 2. User experience

**Where to find it**

- Mobile: model picker and mode switch ('Local Mode' / 'AGI Cloud'); Settings, Privacy (cloud privacy screen) shows the card 'Data privacy'; Settings, Privacy, Data use & access lists 'Chat in Local Mode'; Settings, Data Controls has 'Sync Local Chats to Cloud' and 'Delete all local chats'.
- CLI: type /privacy-settings to see the mode; /privacy-mode shows or refuses changes; /files attaches files; /add-dir adds folders; /continue-with-byok and /continue-with-cloud draft a handoff.
- VS Code: settings page, card 'Where your data goes', rows 'Local models' and 'Session history'.
- Chrome: extension options page, section 'Privacy and data handling', switch 'Save Managed Cloud chats to my account'.
- Web and Desktop: no Local mode; the Web privacy page says so ('Hosted Web and Desktop have neither mode').

**Before you start**

- Mobile: an on-device model must be installed; otherwise the chat shows a 'local model unavailable' error. No account needed for Local Mode (apps/mobile/src/features/settings/Common.tsx:179).
- CLI: a local provider such as Ollama or an OpenAI-compatible server on a local address with no key.
- VS Code: Ollama or LM Studio running on the computer, per the settings text.
- Chrome: signed in to Managed Cloud for the mirror to matter.

**Screens and controls**

- Mobile mode switch dialog: title like 'Switch to AGI Cloud?', body 'Sign in to use AGI Cloud; your local chat stays on this device.', button 'Continue' (apps/mobile/src/features/chat/components/ModeSwitchModal.tsx:102).
- Mobile Data Controls alert 'Sync Local Chats to AGI Cloud?' with buttons 'Cancel' and 'Sync to Cloud' (apps/mobile/src/features/settings/data-controls/index.tsx:181).
- CLI /privacy-settings lines: 'Local file access: explicit workspace roots only', 'Attached files: never included in BYOK handoff drafts automatically' (apps/cli/src/claude_parity.rs:443).
- Chrome toggle row with status text 'Managed Cloud chats stay in this browser only.' (apps/extension/src/features/privacy/dataHandling.ts:57).

**Journey**

1. Mobile: pick a local model in the model picker; the app mode becomes Local; chat; messages are saved in the on-device database.
2. Mobile move to Cloud: pick a Cloud model on a new chat or confirm the mode switch; for old chats use Settings, Data Controls, 'Sync Local Chats to Cloud', read the counts, tap 'Sync to Cloud'.
3. CLI: start with a local provider so the session is Local; run /files <path> to attach files; run /continue-with-byok or /continue-with-cloud to get a reviewable draft; send the draft to complete the move.
4. Chrome: open options, find 'Privacy and data handling', switch off 'Save Managed Cloud chats to my account'; chats then show 'Saved on this device'.

**What the person sees and gets**

- Mobile local chat error when Cloud model chosen: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.' (apps/mobile/stores/chat/chatExecutionStore.ts:2265).
- CLI /files prints 'attached: <path>', 'already attached', 'truncated to budget' or 'failed' lines (apps/cli/src/claude_parity.rs:389).
- CLI handoff draft line 'Attached files excluded from this handoff: N' (apps/cli/src/claude_parity.rs:572).
- Chrome side panel label 'Saved on this device' with detail 'Account mirroring is off in AGI settings, so chats stay in this browser.' (apps/extension/src/side_panel.ts:598).

**Settings**

- Mobile app mode (persisted as 'chat-app-mode-store', default local) (apps/mobile/src/features/chat/store/appModeStore.ts:62).
- CLI privacy_mode in config (project or account) (apps/cli/src/config.rs:140).
- Chrome storage key agi_cloud_conversation_mirroring, default on (apps/extension/src/features/privacy/cloudMirroring.ts:1).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile Local Mode: a Local chat uses the on-device runtime and refuses Cloud models; Cloud sync only runs in cloud mode with an account (apps/mobile/stores/chat/chatExecutionStore.ts:2262; apps/mobile/services/cloudSyncEngine.ts:97).
- Mobile explicit copy of local chats to Cloud with counts, caps and exclusions of temporary chats (apps/mobile/src/features/settings/data-controls/index.tsx:181).
- Mobile local-only chat files are removed by the wipe via removeAllLocalChatAttachments (apps/mobile/services/dsarExport.ts:467); Temporary Chat explainer in Local mode says attachments never leave the device (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:14).
- CLI derives the privacy mode from the provider: local Ollama or keyless local OpenAI-compatible server is Local; ManagedCloud is Managed; everything else is own key (apps/cli/src/agent/mod.rs:3070).
- CLI refuses Cloud account calls unless the session is Managed (apps/cli/src/cloud/client.rs:368). Startup update check is skipped in Local (apps/cli/src/update_check.rs:130).
- CLI handoff is a reviewed draft: it records intent and does not flip the mode until the draft is sent; /privacy-mode refuses a Local-to-other change and points to the handoff command (apps/cli/src/claude_parity.rs:225; apps/cli/src/claude_parity.rs:470).
- CLI file collection: /files attaches files, /add-dir adds folders, handoff drafts exclude attachments (apps/cli/src/claude_parity.rs:389; apps/cli/src/claude_parity.rs:572).
- CLI sessions saved as files under the config folder in managed_sessions (apps/cli/src/platform/runtime/session_control.rs:18).
- Chrome mirror switch gates conversation upload, history pull and account deletion sync (apps/extension/src/features/cloud-bridge/conversationSync.ts:304; apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts:337).
- VS Code settings text states local models stay on the computer and sessions are saved by the CLI on this computer (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1600).

**Incomplete**

- Chrome: the mirror is on by default and only controls storage of chats; the model call still goes through AGI Managed Cloud, so chats are not 'local-only' in processing (apps/extension/src/features/privacy/cloudMirroring.ts:3; apps/extension/src/features/privacy/dataHandling.ts:36).
- VS Code: only a description in settings; the local-only behaviour comes from the CLI runtime, and the extension has no own switch. Memory text there says account memory (see F041-09).
- Web privacy copy says 'Local Mode and BYOK belong to the CLI', while Mobile also has Local Mode; the two texts disagree on which apps have Local (apps/web/features/settings/sections/PrivacySection.tsx:495).
- CLI /privacy-mode cannot select Local; the mode follows the provider, so the draft instruction 'use /privacy-mode local' does not set it (apps/cli/src/claude_parity.rs:470).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Web: no Local mode and no local-only file collection (apps/web/features/settings/sections/PrivacySection.tsx:495).
- Desktop: no Local mode or local-only file collection in the public Electron app, which shows the hosted web app (doc: AGENTS.md section 5). Internal Tauri desktop code was not assessed.
- Mobile: no local-only file collection screen; files live per chat only. Brief gives no Mobile status for S41.15.
- VS Code and Chrome: no local-only file collection (brief S41.15).

## 4. Required behaviour

**Established requirements**

- The user can keep conversations only on their device, never uploaded to the account (done on Mobile, CLI, VS Code, Chrome). (source: brief S41.14)
- The user can keep a collection of files on the device that chats can use without uploading them (done on CLI only). (source: brief S41.15)
- Local mode: no account required, local storage, no hidden provider or cloud call, no sync unless the user signs in and moves selected content. (source: doc: docs/product/requirements.md section 7.1)
- Crossing Local to BYOK or Cloud needs user action, context selection, secret scan, payload preview, label, consent and a new branch that keeps the Local original. (source: doc: docs/product/requirements.md section 7.4)
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud. (source: doc: AGENTS.md section 6)
- Local files do not leave the device in Local mode. (source: doc: docs/product/requirements.md M-FILE-003)

**Acceptance criteria**

1. Mobile Local Mode chat with a Cloud model is refused with the Local Mode message and sends nothing.
2. Mobile Local Mode with no sign-in can chat with an installed local model.
3. Mobile 'Sync Local Chats to Cloud' shows counts and only copies after 'Sync to Cloud' is tapped; local originals remain.
4. CLI Local session: /privacy-mode managed returns 'Privacy mode was not changed' and names /continue-with-cloud.
5. CLI /files attaches a file and the handoff draft states attached files were excluded.
6. CLI Local session makes no Cloud account call (admit refuses).
7. Chrome with the mirror off: new chats show 'Saved on this device' and no upload runs.
8. Web and Desktop copy does not claim a Local mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Chrome user should be told that processing still happens on AGI servers even with the mirror off. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make Web and Desktop privacy copy match Mobile by naming which apps have Local Mode.
- [proposed] Add a Mobile local file library so files can be reused across Local chats.
- [proposed] Offer a one-tap 'Local only' state in VS Code settings that shows the active CLI privacy mode.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useChatAppModeStore | `apps/mobile/src/features/chat/store/appModeStore.ts` | Mobile app mode ('local' or 'cloud'), default local, with an admission gate on every write. |
| service | conversationMode helpers | `apps/mobile/src/features/chat/utils/conversationMode.ts` | Maps model, conversation and provider to local or cloud; hides temporary chats from history. |
| store | chatExecutionStore send path | `apps/mobile/stores/chat/chatExecutionStore.ts` | Chooses on-device runtime for Local, refuses Cloud models in Local chats, requires sign-in for Cloud. |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Syncs only when cloud mode and account are present; skips temporary chats. |
| service | syncLocalConversationsToCloud | `apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts` | Explicit copy of local chat text to Cloud. |
| screen | Data Controls | `apps/mobile/src/features/settings/data-controls/index.tsx` | Sync Local Chats to Cloud and Delete all local chats alerts. |
| component | ModeSwitchModal | `apps/mobile/src/features/chat/components/ModeSwitchModal.tsx` | Confirmation when moving a chat between Local Mode and AGI Cloud. |
| screen | CloudPrivacyScreen | `apps/mobile/src/features/settings/cloud-privacy/index.tsx` | Mobile privacy card: Local chats stay on this device unless you sync them. |
| service | localChatAttachments | `apps/mobile/services/localChatAttachments.ts` | Local chat files kept on device (named by the wipe code; file contents not opened). |
| command | handle_privacy_mode / render_privacy_settings | `apps/cli/src/claude_parity.rs` | CLI /privacy-settings, /privacy-mode refusal text and handoff drafts. |
| command | handle_files / handle_add_dir | `apps/cli/src/claude_parity.rs` | CLI /files and /add-dir local file attachment. |
| service | provider_privacy_mode | `apps/cli/src/agent/mod.rs` | Maps provider to Local, own key or Managed. |
| service | arm_privacy_handoff | `apps/cli/src/agent/mod.rs` | Records reviewed handoff intent; only a Local, saved session may start one. |
| service | CloudClient::admit | `apps/cli/src/cloud/client.rs` | Refuses account calls unless the session is Managed. |
| schema | PrivacyMode | `apps/cli/src/platform/runtime/session.rs` | Enum Local, Byok, Managed with labels and descriptions. |
| service | managed session store | `apps/cli/src/sessions.rs` | Saves CLI sessions as files under the config folder. |
| component | Where your data goes card | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | VS Code text for local models and session history. |
| service | cloudMirroring | `apps/extension/src/features/privacy/cloudMirroring.ts` | Chrome mirror setting reader and watcher. |
| service | conversationSync | `apps/extension/src/features/cloud-bridge/conversationSync.ts` | Chrome upload of chats; returns mirroring-off when the switch is off. |
| component | data-handling-section | `apps/extension/src/features/options/data-handling-section.ts` | Chrome options section with the mirror switch. |
| table | conversations (Mobile local SQLite) | `apps/mobile/services/dsarExport.ts` | Local table wiped by clear-all; holds Local chats. |
| config | PrivacySection Web copy | `apps/web/features/settings/sections/PrivacySection.tsx` | Web text that says Hosted Web and Desktop have no Local Mode. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile: person picks a local model; the app mode is set to local and the turn runs on the on-device runtime. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2262; apps/mobile/src/features/chat/store/appModeStore.ts:62 |
| Mobile: messages are saved to the on-device database; cloud sync is skipped because mode is not cloud. | device | apps/mobile/services/cloudSyncEngine.ts:97 |
| Mobile: person chooses 'Sync to Cloud'; selected text is sent to AGI Cloud and acknowledged per chat. | device and our servers | apps/mobile/src/features/settings/data-controls/index.tsx:181 |
| CLI: provider decides the privacy mode; Local sessions run through a local model server on the machine, and Cloud calls are refused. | device | apps/cli/src/agent/mod.rs:3070; apps/cli/src/cloud/client.rs:368 |
| CLI: /files reads file text on the device into the session; a handoff draft redacts secrets and leaves out attached files. | device | apps/cli/src/claude_parity.rs:389; apps/cli/src/claude_parity.rs:572 |
| CLI: after the reviewed draft is sent, the session moves to the destination provider (own key or Managed). | outside service | apps/cli/src/agent/mod.rs:1590 (arm) and apps/cli/src/claude_parity.rs:225 comment; later send step not opened, so the exact switch point is unknown |
| Chrome: with mirror on, saved chats are uploaded to the account; with it off, upload, pull and share return 'mirroring-off' or disabled. | device and our servers | apps/extension/src/features/cloud-bridge/conversationSync.ts:304; apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts:337 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Mobile Local chats and messages | table:conversations and messages in the on-device SQLite database | No, unless the person runs 'Sync Local Chats to Cloud' | Until deleted with 'Delete all local chats' or the full wipe (F041-10). |
| Mobile Local chat files | app file storage via localChatAttachments | No ('Local originals, files and memory stay on this device') | Removed by the full wipe (apps/mobile/services/dsarExport.ts:467). |
| CLI sessions | managed_sessions folder under the config directory (default ~/.agiworkforce) | Sync is opt-in with agi sync (apps/cli/src/claude_parity.rs:443 area text) | Kept until deleted by the user; retention rule not found. |
| CLI attached files list | in the running session (attached_context_files) | No; excluded from handoff drafts | Session lifetime [inferred]. |
| Chrome chats | chrome.storage in the browser (100 most recent chats per the disclosure text) | Uploaded to the account only while the mirror is on | Until the person deletes them or removes the extension (apps/extension/src/features/privacy/dataHandling.ts:44). |

**Models and providers.** Mobile Local uses an on-device model only; no provider key can be stored on Mobile v1. CLI Local allows local providers such as Ollama or a keyless local OpenAI-compatible server (packages/ai/providers/ollama, packages/ai/providers/lmstudio hold the shared adapters). VS Code names Ollama and LM Studio. Chrome has no Local model: its model calls go to AGI Managed Cloud.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile Local Mode: none required. CLI Local: none needed for Local itself. VS Code local models: none stated. Chrome: needs a Managed Cloud sign-in for mirroring to be relevant. |
| Permissions | CLI file access is limited to explicit workspace roots; extra folders are opt-in with --add-dir or /add-dir (apps/cli/src/claude_parity.rs:443). Mobile file pick uses the system picker (not opened). |
| Subscription | none found in the code. Local inference is free of any paid plan per product requirement; no plan gate was found on any Local path. |
| Limits and metering | Mobile copy to Cloud is capped (conversation limit and last-N messages per chat, shown in the alert) (apps/mobile/src/features/settings/data-controls/index.tsx:181). CLI handoff has a message cap and a payload byte cap (apps/cli/src/claude_parity.rs:586). |
| Feature flags | Mobile FEATURES.cloudChat (true) gates Cloud sync (apps/mobile/lib/v1FeatureFlags.ts:4). |
| Model compatibility | Mobile Local needs an installed on-device model; with none, the send fails with a local-model-unavailable error. CLI Local needs a local model server. |
| Provider restrictions | Mobile v1 has no provider-key route. CLI Local refuses non-local providers inside a Local session. |
| Local mode | This feature is the Local mode behaviour. Mobile: chats, files and memory stay on the device and Cloud models are refused in Local chats. CLI: Cloud account calls and update checks are not made. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Mobile Local with no model installed | Send is refused with a local-model-unavailable error. | apps/mobile/stores/chat/chatExecutionStore.ts:2273 |
| Mobile Cloud mode signed out | Error 'Sign in to use AGI Cloud.' | apps/mobile/stores/chat/chatExecutionStore.ts:2294 |
| Mobile sync copy interrupted | Alert 'Copy outcome unknown' or 'Copy not fully confirmed' warns text may already be in Cloud and a second copy can duplicate. | apps/mobile/src/features/settings/data-controls/index.tsx:181 |
| Mobile offline | Banner 'You're offline. Local chats still work on this device.' | apps/mobile/src/features/edge-cases/components/copy.ts:21 |
| CLI attach failure or oversized file | Lines 'failed: <path> (<error>)' or 'truncated to budget'. | apps/cli/src/claude_parity.rs:389 |
| CLI handoff without a saved session or persistence | Draft is refused ('Save this Local session before creating a reviewed cloud continuation'). | apps/cli/src/agent/mod.rs:1601 |
| Chrome mirror turned off mid-flush | A flush that reaches the check returns mirroring-off and sends nothing. | apps/extension/src/features/cloud-bridge/conversationSync.ts:304 |
| Chrome settings read fails | Switch shows a load-failure message; mirror state falls back to on (default). | apps/extension/src/features/options/data-handling-section.ts:93; apps/extension/src/features/privacy/cloudMirroring.ts:3 |
| Accessibility | Mobile Privacy cards read as one text item; the Chrome toggle is labelled by its row label. | apps/mobile/src/features/settings/cloud-privacy/PrivacyApproachCards.tsx:36; apps/extension/src/features/options/data-handling-section.ts:74 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/local-cloud-sync-messages.test.ts`: Local chat text copy to Cloud (name-based; contents not opened).
- `apps/mobile/__tests__/local-byok-handoff.test.ts`: Local forks stay local and no remote chat APIs are touched in Mobile v1.
- `apps/mobile/__tests__/DataControlsLocalChats.test.tsx`: Delete all local chats asks first, deletes local chats and leaves Cloud chats and memory.
- `apps/mobile/__tests__/local-chat-attachments.test.ts`: Local chat file storage (name-based).
- `apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx`: Privacy screen in Local Mode without an account.
- `apps/cli/src/claude_parity.rs`: Inline tests: /files attaches, /privacy-settings output, privacy-mode refusals, BYOK draft fences history and withholds attachment paths.
- `apps/extension/__tests__/extension-privacy-disclosure.test.ts`: Mirror sends nothing once off; disclosure text.
- `apps/extension/__tests__/conversation-sync.test.ts`: Orchestrator behaviour of the account conversation mirror.
- `apps/extension-vscode/src/__tests__/privacy-control-claims.test.ts`: VS Code does not advertise absent privacy controls.

**Test scenarios**

- **Mobile Local chat stays local**
  1. Install a local model; keep mode Local; sign out; send a message.
  2. Check network traffic and the chat list.
  - Expected: Reply comes from the device; no request to AGI servers; chat is in the list.
- **Mobile Local refuses Cloud model**
  1. In an existing Local chat pick a Cloud model.
  - Expected: A mode-switch dialog appears; no send happens until confirmed.
- **Mobile explicit copy**
  1. Sign in; switch to AGI Cloud; open Settings, Data Controls; tap 'Sync Local Chats to Cloud'; read counts; tap 'Sync to Cloud'.
  - Expected: Chats copy; originals remain; temporary chats excluded.
- **CLI Local boundary**
  1. Start the CLI with a local Ollama model; run /privacy-settings; run /privacy-mode managed.
  - Expected: Active mode local; change refused with the /continue-with-cloud instruction.
- **CLI attachment exclusion**
  1. Run /files on a file; run /continue-with-byok.
  - Expected: Draft lists 'Attached files excluded from this handoff: 1' and does not include the file text.
- **Chrome mirror off**
  1. Open options; switch off 'Save Managed Cloud chats to my account'; chat in the side panel; open web history.
  - Expected: Side panel shows 'Saved on this device'; the chat is not in the account.

**Where to look when it fails**

- Mobile: error text 'This is a Local Mode chat...'; table conversations in the on-device database.
- CLI: 'Privacy mode was not changed.' and CloudError::NotManaged.
- Chrome: outcome status 'mirroring-off'; storage key agi_cloud_conversation_mirroring.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- CLI: [70-qa/test-plans/cli/041-temporary-and-private-experiences.md](../../70-qa/test-plans/cli/041-temporary-and-private-experiences.md)
- VS Code: [70-qa/test-plans/vscode/041-temporary-and-private-experiences.md](../../70-qa/test-plans/vscode/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Web and Desktop have no Local mode or local-only file collection** Affects: Web, Desktop. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495; brief S41.14, S41.15. Work needed: Decide whether the public Desktop should gain local sessions; if not, keep copy honest.
- **Chrome mirror is on by default and chats are still processed in Managed Cloud** Affects: Chrome. Evidence: apps/extension/src/features/privacy/cloudMirroring.ts:3. Work needed: Clear copy that the switch controls storage only; consider default review at first run.
- **Local-only file collection exists only on CLI** Affects: Mobile, VS Code, Chrome, Web, Desktop. Evidence: brief S41.15. Work needed: Build a reusable local file library per app or record the decision not to.
- **Web privacy copy and Mobile disagree on which apps have Local Mode** Affects: Web users. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495 vs apps/mobile/src/features/settings/cloud-privacy/index.tsx:121. Work needed: Align copy using BYOK_SURFACES style constants for Local.
- **CLI has no command to choose Local; mode follows the provider** Affects: CLI. Evidence: apps/cli/src/claude_parity.rs:470; apps/cli/src/agent/mod.rs:3070. Work needed: Document it in /privacy-mode output or add a start-up option.
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:web
- surface:desktop
- mode:local
- mode:cloud
- mode:own-key
- SYS-local-inference
- SYS-execution-boundaries
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- F041-09
- F041-10
- F041-11

## Unknown

- Where the CLI send step completes the handoff and flips the mode (not opened).
- Whether the public Electron Desktop has any local session store.
- CLI retention rule for saved sessions.
- Whether Mobile supports picking arbitrary local files beyond chat attachments.
- Exact contents of apps/mobile/services/localChatAttachments.ts (not opened).
