---
id: "GAPS-AREA-085"
type: "gap-list"
title: "Gaps: Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 85. Personalization and data settings

107 open gaps that touch this area. Area page: [20-features/085-personalization-and-data-settings](../../20-features/085-personalization-and-data-settings/README.md).

## CMP-C461

**Local transcript retention period (cleanupPeriodDays)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Org policy has a retention_days field but the CLI never reads it, and no sweep deletes old local sessions.
- Evidence: crates/agiworkforce-licensing/src/org_policy.rs:71; searched: retention_days in apps/cli/src

## CMP-C491

**Transcript retention period**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Sessions stay until you archive or delete them; no setting deletes old transcripts after a number of days.
- Evidence: searched: cleanup_period, retention_days, expire in apps/cli/src (only org policy in crates/agiworkforce-licensing)

## CMP-C91

**Response language setting**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Ours has no setting that makes the agent reply in a chosen language.
- Evidence: searched: response_language, reply_language in apps/cli/src

## CMP-CP276

**Account choice of whether sessions are used for model improvement, reachable from the CLI**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: It has no model-improvement choice and does not open the account's data settings /privacy-settings prints the active privacy mode and provider route; it has no model-improvement choice and does not open the account's data settings.
- Evidence: apps/cli/src/claude_parity.rs:443-456

## CMP-CP279

**Delete local project data in one command (claude purge)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: There is no project-wide or all-data purge command agi session delete and history delete remove one conversation; there is no project-wide or all-data purge command.
- Evidence: apps/cli/src/conversations.rs:220; apps/cli/src/lib.rs:10335

## CMP-CP283

**One switch to disable all non-essential traffic**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: There is no single switch that also stops update checks Analytics and crash reports have separate toggles; there is no single switch that also stops update checks.
- Evidence: apps/cli/src/config.rs:1473-1477

## CMP-CP288

**Run without saving a transcript**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: There is no environment switch or transcript size cap --no-session-persistence skips saving for one run and default.keep_history turns history off; there is no environment switch or transcript size cap.
- Evidence: apps/cli/src/lib.rs:433; apps/cli/src/config.rs:205

## CMP-CP293

**Telemetry and error-report opt-outs**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: No DO_NOT_TRACK or one switch that stops all background network calls config.toml has telemetry.crash_reports (off by default) and product_analytics (on by default); no DO_NOT_TRACK or one switch that stops all background network calls.
- Evidence: apps/cli/src/config.rs:82-100

## CMP-CP294

**Turn off session history saving or cap its size**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Only the size cap is missing default.keep_history = false turns session saving off for every run (apps/cli/src/config.rs:205,1459; applied at apps/cli/src/lib.rs:6155-6157). Only the size cap is missing. The row Run without saving a transcript already says so.
- Evidence: searched: history.persistence, max_bytes in apps/cli/src

## CMP-M173

**Clear cloud browser cookies and data**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: No cloud browser exists, so no browser data or cookie control.
- Evidence: searched: cloud browser, cookies, browser data in src/features/settings

## CMP-M181

**Voice data consent sheet (Allow, Not now, close)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: No consent sheet on first voice use; voice use for improvement is a switch in Privacy and is off by default.
- Evidence: apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:64; searched: voice consent in apps/mobile/src/features/voice

## CMP-MP95

**Voice recording sharing: ask each time or always allow, and delete shared recordings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F049-08](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md), [F049-09](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: There is no per-conversation ask and no button to delete recordings already shared Privacy has one Use my voice switch, off by default. There is no per-conversation ask and no button to delete recordings already shared.
- Evidence: apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:63-67; searched: delete recording, shared recordings, voice data in apps/mobile/src/features/settings

## CMP-VP72

**Do not keep session history**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: The editor has no switch for it The engine has a keep_history setting that stops saving sessions; the editor has no switch for it.
- Evidence: apps/cli/src/lib.rs:6030-6035

## CMP-W295

**Cloud browser sign-in data and cookie clearing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: No hosted cloud browser with user cookie management.
- Evidence: searched: cloud browser in apps/web, unified-chat

## CMP-W309

**Your feedback record**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: No list of feedback you sent.
- Evidence: searched: your feedback, feedback history in apps/web/features/settings

## CMP-WP225

**Member self-export of own data (admin switch)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: No workspace switch found to allow or block member export User export route exists; no workspace switch found to allow or block member export.
- Evidence: apps/web/app/api/user/export/route.ts:133

## CMP-WP228

**Retention of deleted chats and flagged content**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: The purge schedule is not stated in the pane Delete goes to Recently deleted first; the purge schedule is not stated in the pane.
- Evidence: apps/web/features/settings/sections/DeletedChatsSection.tsx

## CMP-WP238

**Organization-wide data export by the owner**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: There is an owner route to members' content: place a legal hold, then Export records returns held messages, projects, f… There is an owner route to members' content: place a legal hold, then Export records returns held messages, projects, files and artifacts filtered by custodian and date (WorkspaceDataControls.tsx:150-160; legal-holds/[holdId]/export/route.ts; lib/services/ediscovery-export-service.ts:56-117). It is
- Evidence: searched: export organization, workspace export in apps/web/app/api/settings/organization

## GAP-AREA085-LW02

**Mobile 'Delete all local chats' copy says memory and settings stay. The wipe that the mobile storage code runs deletes memory_facts and custom_instructions. Which function the delete-all-local alert calls was not confirmed, so the copy may be wrong.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-085
- Detail: Area 85. Personalization and data settings
- Evidence: apps/mobile/src/features/settings/data-controls/index.tsx:371-376; apps/mobile/services/dsarExport.ts:431-440

## GAP-AREA085-LW03

**The temporary-chat switch comment says useConversations sends isTemporary at creation. I did not open useConversations to confirm this, so the claim is unverified.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-085
- Detail: Area 85. Personalization and data settings
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:697-720

## GAP-CAP-privacy-and-data-controls-01

**Training opt-out for personal content: No reader of the choice exists because nothing trains yet; CLI, VS Code and Chrome have no switch; lawyer review of wording open; note the 'Only use models that do not train' switch is easy to confuse with it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Requirement items: S41.18, S85.12
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-02

**Training exceptions: feedback, safety flags and trusted programs: No exceptions text and no feedback record; ledger marks feedback-data choice not applicable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Requirement items: S85.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-07

**Temporary or incognito chat: No temporary mode in CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md), [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md), [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md), [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Requirement items: S41.01, S41.02, S41.03, S41.05, S41.08, S85.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-09

**Memory controls: view, edit, delete, pause, reset, per-chat off: Web Memory switch shown as on while greyed when persistent memory is off (cosmetic defect seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md), [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Requirement items: S41.16, S85.05, S85.06, S85.07, S85.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-privacy-and-data-controls-11

**Delete chats: single, bulk, all: Defect W-13 (Free and subscribed): sidebar Delete says it cannot be undone and shows no Recently deleted or undo, which conflicts with code-read claim of recovery.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Requirement items: S85.17, S85.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-12

**Recoverable deletion (Recently deleted): Sidebar delete path unrecoverable (W-13); no stated window.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Requirement items: S85.17
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-privacy-and-data-controls-13

**Export your data: Chrome has no export; completeness against inventory not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md), [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Requirement items: S85.20, S88.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-15

**Delete account: No deletion in CLI or Chrome; purge completeness not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Requirement items: S85.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-18

**Voice and dictation audio handling: No stated provider retention for hosted speech; mobile lacks consent sheet and delete.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S85.12, S85.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-19

**Shared links: manage, revoke, search-engine privacy: Defect: shared page showed markdown as literal text (W-14 cosmetic).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Requirement items: S85.19
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-privacy-and-data-controls-28

**Local data controls: clear, keep local, no history: Desktop clear-local missing; CLI no retention or purge; VS Code no switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S41.14, S41.15, S41.16, S41.17, S85.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-29

**Diagnostics and telemetry opt-outs: CLI analytics default on; no DO_NOT_TRACK support.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Requirement items: S85.14, S88.07
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-privacy-and-data-controls-33

**Browser and computer agent data handling: No private browser session (S41.13 missing); no cookie clearing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Requirement items: S41.13, S85.10, S86.17, S86.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-10

**Response language setting: CLI has no reply-language setting.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Requirement items: S85.03
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-settings-18

**Help improve the models (training choice): Feedback-data choice (S85.13) is marked not applicable; confirm that thumbs feedback sends no conversation without a visible choice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Requirement items: S85.12, S85.13
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-settings-19

**Voice and audio recording sharing choice: Voice recording retention view or delete is marked not applicable (S85.15).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S85.15
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-settings-20

**Export your data: Organization-wide owner export is partial (WP238); Chrome missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Requirement items: S85.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-settings-21

**Archived chats management: Chrome missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Requirement items: S85.17
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-settings-22

**Archive all and delete all chats: none known beyond CLI and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Requirement items: S85.18
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-settings-23

**Shared links management: none known on the main apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Requirement items: S85.19
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-settings-24

**Temporary or incognito chat: VS Code and Chrome missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Requirement items: S85.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-25

**Delete account: none known on main apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Requirement items: S85.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-26

**Import from another assistant: No chat-history import; no settings or skills import for AGI CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md), [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Requirement items: S85.21, S85.22
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-settings-27

**Clear local data: Desktop has no local wipe despite storing local sessions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S85.23, S85.24
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-F085-01-01

**CLI has no profile or deletion control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Detail: Affects: CLI users. Work needed: Add commands or a web link.
- Evidence: S85.01 and S85.26 brief status missing; no CLI file found

## GAP-F085-01-02

**Chrome cannot edit profile or delete the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Detail: Affects: Chrome users. Work needed: Add a link or controls, or record that the web is the owner.
- Evidence: Only a read of /api/me found (capabilityDocument.ts:72)

## GAP-F085-01-03

**Email editing not inside Mobile or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Detail: Affects: Mobile and VS Code. Work needed: Native flow or accepted link.
- Evidence: index.tsx:392-420; commandSetup.ts:2527

## GAP-F085-01-04

**Brief says Chrome profile is done and deletion missing; code found shows neither.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Detail: Affects: Chrome. Work needed: Correct the brief or add the control.
- Evidence: grep of apps/extension/src found no profile editor

## GAP-F085-01-05

**Mobile has no test dedicated to the delete flow that was found by name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Detail: Affects: Mobile. Work needed: Add a test covering confirmation, 409 refusals and sign-out.
- Evidence: apps/mobile/__tests__ file search

## GAP-F085-01-NOTBUILT

**Profile and account deletion: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F085-01](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Requirement items: S85.01, S85.26
- Detail: CLI: S85.01, S85.26; Chrome: S85.26

## GAP-F085-02-01

**No one-action reset of instructions, style and memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Affects: All apps. Work needed: Design and add a confirmed reset naming what is lost.
- Evidence: S85.25 brief 'not applicable anywhere'; only style reset found (PersonalizationSection.tsx:367)

## GAP-F085-02-02

**CLI has no instructions field although the brief marks custom instructions done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Affects: CLI. Work needed: Add an instructions field or accept a link.
- Evidence: cloud/personalization.rs:27-124,178-181

## GAP-F085-02-03

**Chrome has no editor and the effect there is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Affects: Chrome. Work needed: Verify the surface sent by Chrome and add an editor or link.
- Evidence: no match in apps/extension/src

## GAP-F085-02-04

**Mobile may not carry the web on/off flag for instructions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Affects: Mobile and web users sharing an account. Work needed: Check whether a mobile save clears the web flag.
- Evidence: cloudSettingsMapping.ts:151-160 has no instructionsEnabled

## GAP-F085-02-05

**VS Code instructions are not the account instructions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Detail: Affects: VS Code. Work needed: Decide whether to sync or label them.
- Evidence: customInstructions.ts:48-76

## GAP-F085-02-NOTBUILT

**Custom instructions and reply style: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Requirement items: S85.02, S85.03, S85.25
- Detail: VS Code: S85.03; Chrome: S85.02, S85.03, S85.25

## GAP-F085-02-PARTLY

**Custom instructions and reply style: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F085-02](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Requirement items: S85.02, S85.03

## GAP-F085-03-01

**No writing-sample control on Mobile, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-03](../../20-features/085-personalization-and-data-settings/F085-03-writing-style-sample.md)
- Detail: Affects: Mobile, VS Code, Chrome. Work needed: Add a control or decide it is web-only.
- Evidence: S85.04 brief; mobile grep for sampleText found none

## GAP-F085-03-02

**Server handling of a client-sent system message for style is not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-03](../../20-features/085-personalization-and-data-settings/F085-03-writing-style-sample.md)
- Detail: Affects: Web and Desktop. Work needed: Check the request processor's treatment and moderation of client system segments.
- Evidence: useChatStream.ts:4533-4534

## GAP-F085-03-03

**No visible proof in chat that the style applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-03](../../20-features/085-personalization-and-data-settings/F085-03-writing-style-sample.md)
- Detail: Affects: Web. Work needed: Optional indicator.
- Evidence: No indicator found

## GAP-F085-03-NOTBUILT

**Writing-style sample: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F085-03](../../20-features/085-personalization-and-data-settings/F085-03-writing-style-sample.md)
- Requirement items: S85.04
- Detail: Mobile: S85.04; VS Code: S85.04; Chrome: S85.04

## GAP-F085-04-01

**Project memory choice missing on Mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Detail: Affects: Those apps. Work needed: Add control or document web-only.
- Evidence: S85.07 brief

## GAP-F085-04-02

**Import missing on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add or link to web.
- Evidence: S85.22 brief

## GAP-F085-04-03

**CLI import has no preview step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Detail: Affects: CLI. Work needed: Show the dry-run result and ask before commit.
- Evidence: cloud/mod.rs:810-850

## GAP-F085-04-04

**Chrome has no found on/off switch for memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Detail: Affects: Chrome. Work needed: Verify and add.
- Evidence: memorySheet.ts and memory-bridge.ts show add/edit/delete only

## GAP-F085-04-05

**VS Code memory switch is a local editor setting, not the account switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Detail: Affects: VS Code. Work needed: Clarify or align.
- Evidence: commandSetup.ts:2037-2050

## GAP-F085-04-NOTBUILT

**Saved memory: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Requirement items: S85.07, S85.22
- Detail: Mobile: S85.07; CLI: S85.07; VS Code: S85.07, S85.22; Chrome: S85.07, S85.22

## GAP-F085-05-01

**CLI and VS Code cannot reference past chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Detail: Affects: CLI, VS Code. Work needed: Add or document.
- Evidence: S85.06 brief

## GAP-F085-05-02

**Chrome status unverified: no control found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Detail: Affects: Chrome. Work needed: Verify the Chrome surface value and add a control or link.
- Evidence: search of apps/extension/src returned no match

## GAP-F085-05-03

**Whether archived chats may be referenced is unconfirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Detail: Affects: All. Work needed: Decide the rule.
- Evidence: filters at past-chat-context-service.ts:255-259 show deleted and temporary only

## GAP-F085-05-NOTBUILT

**Past-chat reference: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Requirement items: S85.06
- Detail: CLI: S85.06; VS Code: S85.06

## GAP-F085-06-01

**No on/off switch for keeping chats in history on web, desktop or mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Decide whether to add one or document temporary chat as the only control.
- Evidence: PrivacySection.tsx:690-701 comment; no switch

## GAP-F085-06-02

**Web default is stored per browser, not on the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: Web, Desktop. Work needed: Move to the account preferences.
- Evidence: web-settings-store.ts:210

## GAP-F085-06-03

**Mobile lacks a default-temporary preference.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: Mobile. Work needed: Add a persisted preference.
- Evidence: settingsStore.ts:137,170

## GAP-F085-06-04

**VS Code has no temporary or history control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: VS Code. Work needed: Add or document.
- Evidence: No match in apps/extension-vscode/src; brief missing

## GAP-F085-06-05

**Brief lines for CLI (config.rs:1105, lib.rs:3868) point at unrelated code; the real controls are keep_history and the flag.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: Documentation. Work needed: Correct the brief's code list.
- Evidence: config.rs:205; lib.rs:433

## GAP-F085-06-06

**Chrome default-temporary preference not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Detail: Affects: Chrome. Work needed: Add if required.
- Evidence: Only per-chat start function (side_panel.ts:8939)

## GAP-F085-06-NOTBUILT

**Chat history and temporary chats: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Requirement items: S85.11, S85.16
- Detail: VS Code: S85.11, S85.16; Chrome: S85.16

## GAP-F085-07-01

**The 30-day purge is switched off by default, so deleted chats are not permanently removed on schedule.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: Affects: All Cloud users on Web, Desktop, Mobile; the privacy promise.. Work needed: Owner decision to set the flag in production, or change the public copy.
- Evidence: apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-17; docs/security/security.md:1184; apps/web/app/privacy/page.tsx:734

## GAP-F085-07-02

**Mobile has no Recently deleted view; people must use the web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: Affects: Mobile Cloud users.. Work needed: Add a deleted list and restore using the same endpoints.
- Evidence: apps/mobile/app/(app)/settings/archived-chats.tsx:339, :369

## GAP-F085-07-03

**CLI has no cloud delete-all or cloud archived list; its archived list is local sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: Affects: CLI users.. Work needed: Decide whether CLI should manage cloud chats; add commands and confirmation.
- Evidence: apps/cli/src/lib.rs:5588-5600

## GAP-F085-07-04

**Chrome extension has no archive or delete-all control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: Affects: Chrome users.. Work needed: Decide scope; link to web settings or add controls.
- Evidence: Brief S85.17 and S85.18 status missing; no code found.

## GAP-F085-07-05

**Deleting chats does not remove memories derived from them; the copy says so, but there is no one-click path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: Affects: Privacy-minded users on all Cloud apps.. Work needed: Optional: offer a combined delete.
- Evidence: BulkConversationControls.tsx:59

## GAP-F085-07-NOTBUILT

**Archived and deleted chats: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Requirement items: S85.17, S85.18
- Detail: CLI: S85.18; Chrome: S85.17, S85.18

## GAP-F085-08-01

**VS Code has no way to see or revoke links.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Detail: Affects: VS Code users who share chats.. Work needed: Add a command that lists links or opens the web page.
- Evidence: Brief S85.19 status missing.

## GAP-F085-08-02

**Chrome can create links but cannot list or revoke them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Detail: Affects: Chrome users.. Work needed: Add list and revoke or link to web settings.
- Evidence: apps/extension/src/features/cloud-bridge/shareClient.ts:11 (create only).

## GAP-F085-08-03

**Link list is capped at 200 with no paging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Detail: Affects: Heavy sharers on every app.. Work needed: Add cursor paging.
- Evidence: apps/web/app/api/share/route.ts:64, :780

## GAP-F085-08-04

**No rate limit seen on the revoke-by-token route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Detail: Affects: Server abuse protection.. Work needed: Check the gateway policy; add withRateLimit if absent.
- Evidence: apps/web/app/api/share/[token]/route.ts:100-137

## GAP-F085-08-NOTBUILT

**Shared links: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F085-08](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Requirement items: S85.19
- Detail: VS Code: S85.19; Chrome: S85.19

## GAP-F085-09-01

**Chat history import from other assistants does not exist anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: Affects: People moving from ChatGPT or Claude, all six apps.. Work needed: Design and build parsers, a create-conversation path and UI.
- Evidence: Brief S85.21 missing on all apps; code search found only memory import.

## GAP-F085-09-02

**Chrome and VS Code cannot start or download an export.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: Affects: Chrome and VS Code users.. Work needed: Decide to link to web Settings or add a command.
- Evidence: Brief S85.20.

## GAP-F085-09-03

**Large histories are truncated at 1000 rows in some sections.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: Affects: Heavy users.. Work needed: Page or stream those sections in the archive.
- Evidence: apps/web/app/api/user/export/route.ts:762

## GAP-F085-09-04

**CLI does not distinguish failed or expired archives from none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Detail: Affects: CLI users.. Work needed: Print the status and reason.
- Evidence: apps/cli/src/lib.rs:7433-7440

## GAP-F085-09-NOTBUILT

**Data export and history import: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Requirement items: S85.20, S85.21
- Detail: Web: S85.21; Desktop: S85.21; Mobile: S85.21; CLI: S85.21; VS Code: S85.21; Chrome: S85.20, S85.21

## GAP-F085-10-01

**'Use my chats' and 'Use my voice' have no consumer; they only record a choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: Affects: People who expect an effect; all apps with the switches.. Work needed: None until own-model training exists; keep the copy honest. Legal review is listed as open in the decision doc.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:88; model-improvement-consent.ts:22 has no non-test caller.

## GAP-F085-10-02

**CLI product analytics default is on while Web defaults are off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: Affects: CLI users in managed mode.. Work needed: Owner decision on default and first-run disclosure.
- Evidence: apps/cli/src/config.rs:85-98

## GAP-F085-10-03

**No Chrome or Mobile send toggle for crash or diagnostics; export is manual.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: Affects: Chrome and Mobile users who expect a switch.. Work needed: Document as intended or add a switch.
- Evidence: apps/extension/src/options.ts:2071-2100; doc: docs/decisions/wire-or-cut.md:131

## GAP-F085-10-04

**Draft brief cites a Mobile file ProviderTrainingOptOutGroup.tsx and CLI tui_app.rs:3864 that do not hold these controls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: Affects: Documentation accuracy.. Work needed: Update the brief's code references.
- Evidence: File not found; tui_app.rs:3864 is unrelated input handling.

## GAP-F085-10-05

**Enforcement of the no-training switch for explicit-model chats on paid plans is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Detail: Affects: Paid-plan Cloud users.. Work needed: Trace the paid path and add a test.
- Evidence: request-processor.ts:3664-3674 conditions on freeAutoSelection.

## GAP-F085-11-01

**The brief's code reference for the Desktop gate is wrong.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md)
- Detail: Affects: Documentation.. Work needed: Correct the brief.
- Evidence: apps/desktop/electron/runtime/dispatcher.ts:924 is a requirements table; gate at :2155-2210.

## GAP-F085-11-02

**Desktop does not show the Chrome extension's approved sites.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md)
- Detail: Affects: Desktop users managing access.. Work needed: Optional read-only view.
- Evidence: BrowserPairingSection.tsx shows pairing state only.

## GAP-F085-11-03

**Two separate site lists (Chrome approved sites and Desktop browser pane lists) can confuse people.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md)
- Detail: Affects: Desktop plus Chrome users.. Work needed: Clarify copy.
- Evidence: options.ts and BrowserPaneSettings.tsx hold different lists.

## GAP-F085-12-01

**Desktop has no wipe of chats, memory and settings; only four clean-ups.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Affects: Desktop users.. Work needed: Define the scope and add a confirmed wipe.
- Evidence: StorageSettings.tsx:57-90; brief S85.23 missing.

## GAP-F085-12-02

**CLI and VS Code have no local wipe.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Affects: CLI and VS Code users.. Work needed: Decide scope and add commands.
- Evidence: Brief S85.23.

## GAP-F085-12-03

**Mobile wipe deletes permanently without a Trash step, while AGENTS.md section 9 says an agent never destroys user data; here the user acts explicitly, so this is allowed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Affects: Policy review only.. Work needed: None unless the owner wants a recovery path.
- Evidence: dsarExport.ts:440-458; AGENTS.md section 9.

## GAP-F085-12-04

**The brief says Clear browser data is not applicable anywhere, but Desktop offers it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Affects: Documentation accuracy.. Work needed: Update the brief.
- Evidence: BrowserPaneSettings.tsx:39-47

## GAP-F085-12-NOTBUILT

**Clear device data, and options that are not offered: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S85.23
- Detail: CLI: S85.23; VS Code: S85.23
