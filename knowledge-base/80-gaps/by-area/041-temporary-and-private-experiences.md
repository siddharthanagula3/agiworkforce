---
id: "GAPS-AREA-041"
type: "gap-list"
title: "Gaps: Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 41. Temporary and private experiences

90 open gaps that touch this area. Area page: [20-features/041-temporary-and-private-experiences](../../20-features/041-temporary-and-private-experiences/README.md).

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

## CMP-CP288

**Run without saving a transcript**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: There is no environment switch or transcript size cap --no-session-persistence skips saving for one run and default.keep_history turns history off; there is no environment switch or transcript size cap.
- Evidence: apps/cli/src/lib.rs:433; apps/cli/src/config.rs:205

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

## CMP-MP21

**Save a temporary chat into history**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: There is no general Save chat control in the chat menu A temporary chat can be saved only when you try to share it; there is no general Save chat control in the chat menu.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:2051-2066

## CMP-MP90

**Approval cards before the assistant sends, pays, signs or deletes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Not for payments, signatures or sends on a user account Cloud tasks show approval cards for tool actions, but not for payments, signatures or sends on a user account.
- Evidence: src/features/cloud-code/components/CloudCodeApprovalCard.tsx; src/features/settings/tool-approvals

## CMP-MP92

**Apps with access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: There is no separate 'apps with access' row in privacy Settings > Connectors lists connected tools and approvals; there is no separate 'apps with access' row in privacy.
- Evidence: apps/mobile/src/features/settings/index.tsx:853

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

## CMP-WP226

**Privacy Center hub**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Detail: There is no separate hub page in the Help menu Settings Privacy carries the controls and explanations and links to a rights-request page, but there is no separate hub page in the Help menu.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:423,486-548; apps/web/app/privacy/requests/page.tsx

## CMP-WP228

**Retention of deleted chats and flagged content**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-07](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Detail: The purge schedule is not stated in the pane Delete goes to Recently deleted first; the purge schedule is not stated in the pane.
- Evidence: apps/web/features/settings/sections/DeletedChatsSection.tsx

## GAP-AREA041-LW04

**Mobile new-chat temporary default is not stored across launches. The web default is stored, so the two apps behave differently for the 'by default' promise.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-041
- Detail: Area 41. Temporary and private experiences
- Evidence: apps/mobile/stores/settingsStore.ts:170 and 174 versus apps/web/features/settings/sections/PrivacySection.tsx:717-726

## GAP-AREA041-LW06

**The web composer labels the same feature 'Use incognito' or 'Exit incognito', while the header says 'Temporary chat'. A person may read 'incognito' as private browsing, which is the separate, unbuilt item S41.12.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-041
- Detail: Area 41. Temporary and private experiences
- Evidence: apps/web/lib/temporary-chat-policy.ts:3-5; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:495-497

## GAP-AREA041-LW07

**The web attach copy says the file is deleted with the temporary chat. The purge job deletes it 30 days after the chat's creation, not when the chat ends or is closed.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-041
- Detail: Area 41. Temporary and private experiences
- Evidence: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:157-158 versus apps/web/app/api/cron/purge-temporary-chats/route.ts:44-45

## GAP-AREA041-LW10

**Mobile clear-all-data alert says it deletes downloaded models, but the code read deletes only the installed_models rows. Deletion of model files on disk was not seen.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-041
- Detail: Area 41. Temporary and private experiences
- Evidence: apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:12; apps/mobile/services/dsarExport.ts:440

## GAP-AREA041-LW12

**Mobile chatMessageStore.ts:1158 (cited for history) is the voice-turn append, and consolidation.ts:30 (cited for local memory) is a display grouping helper. Neither stores or excludes data.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-041
- Detail: Area 41. Temporary and private experiences
- Evidence: apps/mobile/stores/chat/chatMessageStore.ts:1158; apps/mobile/src/features/memory/services/consolidation.ts:30

## GAP-CAP-conversations-and-history-13

**Temporary chat (not saved): No temporary-chat shortcut on web (comparison row without id). VS Code none. CLI and Chrome unclear.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md), [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Requirement items: S12.17, S18.10, S41.01, S41.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-14

**What a temporary chat leaves out, and how it is explained: Mobile lacks the plugin note and generated-output saving choice (S41.07, S41.09). A purge job deletes temporary rows after 30 days; whether that conflicts with 'no safety copy' is not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md), [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md), [F041-04](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md), [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Requirement items: S41.03, S41.04, S41.05, S41.06, S41.07, S41.08, S41.09
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-15

**Choose personalised or plain at the start of a temporary chat: The product definition says temporary chats neither read nor write memory; the code allows reading. Owner to align (see unresolved).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Requirement items: S41.04, S41.05, S41.06
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-16

**Save a temporary chat: Mobile has no review before conversion (S41.11, MP21).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Requirement items: S41.10, S41.11
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-21

**Local-mode chats stay on the device: No clear-local-data action on web, desktop, CLI, VS Code or Chrome (S41.17).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Requirement items: S41.14, S41.17
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-privacy-and-data-controls-01

**Training opt-out for personal content: No reader of the choice exists because nothing trains yet; CLI, VS Code and Chrome have no switch; lawyer review of wording open; note the 'Only use models that do not train' switch is easy to confuse with it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Requirement items: S41.18, S85.12
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-04

**Retention periods stated and honoured: Purge schedule text missing; CLI cannot age out local sessions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Requirement items: S41.08, S41.20
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-07

**Temporary or incognito chat: No temporary mode in CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md), [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md), [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md), [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md), [F085-06](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Requirement items: S41.01, S41.02, S41.03, S41.05, S41.08, S85.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-08

**Temporary chat: personalization choice and save: Mobile cannot save a temporary chat; end-confirmation says nothing can be restored, so save must come before ending.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md), [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Requirement items: S41.04, S41.06, S41.10, S41.11
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-09

**Memory controls: view, edit, delete, pause, reset, per-chat off: Web Memory switch shown as on while greyed when persistent memory is off (cosmetic defect seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F085-04](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md), [F085-05](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Requirement items: S41.16, S85.05, S85.06, S85.07, S85.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-privacy-and-data-controls-17

**Privacy Center hub: No hub page; CLI and VS Code reach privacy through commands.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Requirement items: S41.19, S41.20
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-26

**Connected app data sharing and approvals: Mobile lacks a privacy row for apps with access; no approvals for payments or signatures.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Requirement items: S41.20, S86.12, S86.13, S86.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-privacy-and-data-controls-27

**Execution boundary disclosure and Local-to-Cloud crossing: Full crossing flow not verified on each app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Requirement items: S41.14, S41.20
- Detail: Claude no, ChatGPT unknown; AGI partly built

## GAP-CAP-privacy-and-data-controls-28

**Local data controls: clear, keep local, no history: Desktop clear-local missing; CLI no retention or purge; VS Code no switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Requirement items: S41.14, S41.15, S41.16, S41.17, S85.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-33

**Browser and computer agent data handling: No private browser session (S41.13 missing); no cookie clearing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Requirement items: S41.13, S85.10, S86.17, S86.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F041-01-01

**Brief says Chrome has no temporary chat; code has one. The brief and the first draft are wrong for Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Detail: Affects: Chrome extension; any status report built from the brief. Work needed: Update the brief and parity table; add Chrome tests for the menu item.
- Evidence: apps/extension/src/side_panel.ts:8939-8946

## GAP-F041-01-02

**Web default switch lives only in browser storage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Detail: Affects: Web people using several browsers or devices. Work needed: Decide whether to store it on the account.
- Evidence: apps/web/shared/stores/web-settings-store.ts:209-211

## GAP-F041-01-03

**CLI and VS Code have no control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Detail: Affects: CLI, VS Code. Work needed: Build or cut by decision.
- Evidence: No match in apps/cli/src or apps/extension-vscode/src

## GAP-F041-01-04

**Mobile has only a global pill, no per-chat control, and the setting resets each launch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Detail: Affects: Mobile. Work needed: Decide whether session-only is the intended rule and document it.
- Evidence: apps/mobile/stores/settingsStore.ts:170-175

## GAP-F041-01-05

**Desktop Tauri has no first-class way to save a temporary chat or a header switch in Cloud mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Detail: Affects: Desktop Tauri build. Work needed: Confirm Tauri parity target given the public Desktop is the hosted web app (AGENTS.md section 5).
- Evidence: apps/desktop/src/features/v3/ComposerContextControls.tsx:119-147

## GAP-F041-01-NOTBUILT

**Start a temporary chat: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Requirement items: S41.01
- Detail: CLI: S41.01; VS Code: S41.01

## GAP-F041-02-01

**Mobile banner is session-once and dismissible, so the indicator is not on screen for as long as the chat is open.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Detail: Affects: Mobile. Work needed: Add a persistent mark or re-show per chat.
- Evidence: apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:24,44-47

## GAP-F041-02-02

**Short header text omits Library, search and connector behaviour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Detail: Affects: Web. Work needed: Use the shared retention note or link to it.
- Evidence: packages/ui/i18n/locales/en/chat.json:250

## GAP-F041-02-03

**Texts do not mention the kept rating or the in-flight record described on the support page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Detail: Affects: All apps. Work needed: Align short texts with the support page or add a link.
- Evidence: apps/web/content/support/temporary-chats.md

## GAP-F041-02-04

**CLI and VS Code have no indicator and no mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Detail: Affects: CLI, VS Code. Work needed: Follows F041-01 decision.
- Evidence: no match in apps/cli/src, apps/extension-vscode/src

## GAP-F041-02-NOTBUILT

**Temporary-mode indicator and explainer: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Requirement items: S41.02, S41.03, S41.19
- Detail: CLI: S41.02, S41.03, S41.19; VS Code: S41.02, S41.03, S41.19; Chrome: S41.02, S41.03

## GAP-F041-03-01

**First-draft claim that the app refuses memory commands is not in the code; the command is silently skipped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Detail: Affects: Web, mobile. Work needed: Decide whether to show a notice.
- Evidence: WebChatPage.tsx:2628-2638; chatExecutionStore.ts:2962

## GAP-F041-03-02

**Mobile Local mode ignores the Personalized choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Detail: Affects: Mobile Local. Work needed: Honour or hide consistently.
- Evidence: chatExecutionStore.ts:2816

## GAP-F041-03-03

**No memory-read choice is offered (brief says where offered).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Detail: Affects: All apps. Work needed: Record that none is offered by design.
- Evidence: turn-context-service.ts:126-130

## GAP-F041-03-04

**Chrome has no Personalized switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Detail: Affects: Chrome. Work needed: Add or decide.
- Evidence: no match for personalization in side_panel temporary code

## GAP-F041-03-05

**Switch is global, not per chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Detail: Affects: Web, mobile. Work needed: Decide scope.
- Evidence: web-chat-store.ts:787

## GAP-F041-03-NOTBUILT

**Memory and custom-instruction choices in temporary chat: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F041-03](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Requirement items: S41.04, S41.05, S41.06
- Detail: CLI: S41.04, S41.05, S41.06; VS Code: S41.04, S41.05, S41.06

## GAP-F041-04-01

**Mobile has no statement and no confirmed behaviour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-04](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md)
- Detail: Affects: Mobile. Work needed: Add text and verify the server rule applies to mobile requests.
- Evidence: No connector wording in TemporaryChatBanner.tsx

## GAP-F041-04-02

**Statement lives only in a tooltip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-04](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md)
- Detail: Affects: Web, Chrome. Work needed: Make visible.
- Evidence: ComposerPlusMenu.tsx:502

## GAP-F041-04-03

**CLI and VS Code have no temporary chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-04](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md)
- Detail: Affects: CLI, VS Code. Work needed: Follows F041-01.
- Evidence: no match

## GAP-F041-04-NOTBUILT

**Plugins and connectors in temporary chat: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F041-04](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md)
- Requirement items: S41.07
- Detail: Mobile: S41.07; CLI: S41.07; VS Code: S41.07

## GAP-F041-05-01

**Brief and draft call mobile Save to Library missing; it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Detail: Affects: Mobile. Work needed: Update the brief.
- Evidence: apps/mobile/src/features/image/services/keepMedia.ts

## GAP-F041-05-02

**Draft says 30 days after the chat was created; files use their own created_at.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Detail: Affects: Documentation. Work needed: Correct docs and user text if needed.
- Evidence: purge.ts:61-63

## GAP-F041-05-03

**No keep control for generated video or non-image outputs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Detail: Affects: Web, mobile. Work needed: Add or decide.
- Evidence: Only ImageGenerationCard and mobile keepMedia call the endpoint

## GAP-F041-05-04

**Mobile Cloud explainer says nothing about files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Detail: Affects: Mobile. Work needed: Add a files sentence.
- Evidence: TemporaryChatBanner.tsx:12-13

## GAP-F041-05-05

**Migration 0218 header says not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Detail: Affects: Operations. Work needed: Check applied state with the migration tool and fix the stale header.
- Evidence: 0218_temporary_chat_attachments.sql:3

## GAP-F041-05-NOTBUILT

**Files and generated images in temporary chats: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F041-05](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Requirement items: S41.08, S41.09
- Detail: Mobile: S41.09; CLI: S41.08, S41.09; VS Code: S41.08, S41.09

## GAP-F041-06-01

**Mobile alert does not show what will be kept.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: Affects: Mobile. Work needed: List counts like the web dialog.
- Evidence: chat/[id].tsx:2140-2143

## GAP-F041-06-02

**Mobile entry only through Share link, and drops image-only replies and attachment metadata.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: Affects: Mobile. Work needed: Add Save chat action and match web filtering.
- Evidence: chatMessageStore.ts:1034-1040; chat/[id].tsx:2189-2196

## GAP-F041-06-03

**No save on Chrome or Tauri desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: Affects: Chrome, Desktop Tauri. Work needed: Decide.
- Evidence: side_panel.ts:8959-8970

## GAP-F041-06-04

**First draft says turning on in a chat with messages asks Save this chat?; the question appears when turning off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: Affects: Documentation. Work needed: Correct the draft; decide whether turning ON with existing saved messages needs a question about what happens to them.
- Evidence: WebChatPage.tsx:4973-4990

## GAP-F041-06-05

**Brief says desktop done; no desktop code found for save.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Detail: Affects: Desktop. Work needed: Check the Electron path through the hosted web app and update the brief.
- Evidence: no match in apps/desktop/src

## GAP-F041-06-NOTBUILT

**Save a temporary chat to history: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F041-06](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Requirement items: S41.10, S41.11
- Detail: CLI: S41.10, S41.11; VS Code: S41.10, S41.11; Chrome: S41.10, S41.11

## GAP-F041-07-01

**No incognito search on any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Design a private flag on search calls, skip recording, add a visible marker and tests.
- Evidence: brief S41.12; apps/web/features/chat/services/global-search-service.ts:318

## GAP-F041-07-02

**No private browser session for the agent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)
- Detail: Affects: Desktop (internal Tauri), CLI, Chrome, Web agent browsing. Work needed: Throwaway profile created per run and deleted at the end; explicit user choice; tests that nothing remains.
- Evidence: brief S41.13; apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs:331

## GAP-F041-07-03

**The word 'incognito' on Temporary chat could be read as covering search or browsing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)
- Detail: Affects: Web users. Work needed: Keep the Temporary chat copy clear about what it covers, once private search exists.
- Evidence: apps/web/lib/temporary-chat-policy.ts:3

## GAP-F041-07-NOTBUILT

**Private search and private browsing (not built): not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)
- Requirement items: S41.12, S41.13
- Detail: Web: S41.12, S41.13; Desktop: S41.12, S41.13; Mobile: S41.12, S41.13; CLI: S41.12, S41.13; VS Code: S41.12, S41.13; Chrome: S41.12, S41.13

## GAP-F041-08-01

**Web and Desktop have no Local mode or local-only file collection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Detail: Affects: Web, Desktop. Work needed: Decide whether the public Desktop should gain local sessions; if not, keep copy honest.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495; brief S41.14, S41.15

## GAP-F041-08-02

**Chrome mirror is on by default and chats are still processed in Managed Cloud**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Detail: Affects: Chrome. Work needed: Clear copy that the switch controls storage only; consider default review at first run.
- Evidence: apps/extension/src/features/privacy/cloudMirroring.ts:3

## GAP-F041-08-03

**Local-only file collection exists only on CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Detail: Affects: Mobile, VS Code, Chrome, Web, Desktop. Work needed: Build a reusable local file library per app or record the decision not to.
- Evidence: brief S41.15

## GAP-F041-08-04

**Web privacy copy and Mobile disagree on which apps have Local Mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Detail: Affects: Web users. Work needed: Align copy using BYOK_SURFACES style constants for Local.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495 vs apps/mobile/src/features/settings/cloud-privacy/index.tsx:121

## GAP-F041-08-05

**CLI has no command to choose Local; mode follows the provider**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Detail: Affects: CLI. Work needed: Document it in /privacy-mode output or add a start-up option.
- Evidence: apps/cli/src/claude_parity.rs:470; apps/cli/src/agent/mod.rs:3070

## GAP-F041-08-NOTBUILT

**Local-only conversations and files: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Requirement items: S41.15
- Detail: Web: S41.15; Desktop: S41.15; VS Code: S41.15; Chrome: S41.15

## GAP-F041-09-01

**No local-only memory on Web, Desktop, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md)
- Detail: Affects: Web, Desktop, VS Code, Chrome. Work needed: Decide per app; at least state account memory clearly (VS Code already does).
- Evidence: brief S41.16; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1608

## GAP-F041-09-02

**CLI pruning removes summaries, not merged facts, so 'older than 30 days are pruned' is partly true**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md)
- Detail: Affects: CLI users reading the draft claim. Work needed: Clarify copy or prune merged file facts by age.
- Evidence: apps/cli/src/memory_pipeline.rs:627

## GAP-F041-09-03

**No tested guarantee that a Mobile Local fact never reaches Cloud paths such as the explicit chat copy or export**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md)
- Detail: Affects: Mobile. Work needed: Add a test that the explicit copy sends no memory.
- Evidence: apps/mobile/src/features/settings/data-controls/index.tsx:182 says memory stays on device; no dedicated test found

## GAP-F041-09-NOTBUILT

**Local-only memory: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md)
- Requirement items: S41.16
- Detail: Web: S41.16; Desktop: S41.16; VS Code: S41.16; Chrome: S41.16

## GAP-F041-10-01

**No equivalent on Web, Desktop, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Detail: Affects: Those five apps. Work needed: Define the set of local data per app and add a confirm-then-clear action, e.g. CLI config and sessions folder, Chrome storage.
- Evidence: brief S41.17

## GAP-F041-10-02

**Alert says 'all conversations, memory' without saying Cloud copies stay**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Detail: Affects: Mobile signed-in users. Work needed: Add a sentence naming Cloud data and how to delete it.
- Evidence: apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:12; apps/mobile/services/dsarExport.ts:425

## GAP-F041-10-03

**No Trash or recovery step**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Detail: Affects: Mobile. Work needed: Confirm with the owner whether the user-initiated wipe may stay permanent.
- Evidence: apps/mobile/services/dsarExport.ts:460

## GAP-F041-10-NOTBUILT

**Clear all data on this device: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Requirement items: S41.17
- Detail: Web: S41.17; Desktop: S41.17; CLI: S41.17; VS Code: S41.17; Chrome: S41.17

## GAP-F041-11-01

**Retention and training wording is written separately per app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Detail: Affects: All apps. Work needed: Single shared source and a drift test.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:519; apps/mobile/src/features/settings/cloud-privacy/ChatPrivacyScreen.tsx:18; apps/cli/src/claude_parity.rs:455

## GAP-F041-11-02

**Web copy omits Mobile Local Mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Detail: Affects: Web readers. Work needed: Update the sentence.
- Evidence: apps/web/features/settings/sections/PrivacySection.tsx:495

## GAP-F041-11-03

**Desktop privacy page not separately verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Detail: Affects: Desktop. Work needed: Run the Electron app and check the page.
- Evidence: brief marks Desktop done per brief only

## GAP-F041-11-04

**No verified record that retention claims match actual deletion jobs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Detail: Affects: All apps. Work needed: Trace the purge jobs and add tests tied to the 30-day statements.
- Evidence: apps/web/app/api/cron/purge-temporary-chats/route.ts:43 is cited in the brief for temporary chats; the Recently deleted purge was not traced
