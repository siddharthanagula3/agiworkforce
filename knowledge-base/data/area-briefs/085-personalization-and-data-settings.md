# Area 85. Personalization and data settings

26 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S85.01 Profile details.
- Should: The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/GeneralSection.tsx:542; apps/web/app/settings/_lib/preferences-client.ts:122; apps/web/app/api/me/route.ts:309; apps/mobile/src/features/settings/personalization/index.tsx:333; apps/mobile/src/features/settings/index.tsx:233; apps/extension-vscode/src/core/commandSetup.ts:2262; apps/extension/src/side_panel.ts:12239

## S85.02 Custom instructions.
- Should: The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/api/models/free-quota/completions/route.ts:595; apps/web/lib/services/turn-context-service.ts:186; apps/web/features/models/lib/free-offering-request.ts:69; apps/web/features/chat/components/Composer/FreeQuotaModelSection.tsx:118; apps/mobile/app/(app)/settings/personalization.tsx:1; apps/mobile/src/features/settings/personalization/index.tsx:338; apps/mobile/services/cloudSettingsMapping.ts:111; apps/web/lib/server/user-identity.ts:205

## S85.03 Communication style.
- Should: The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome unverified
- Code: apps/web/lib/services/turn-context-service.ts:186; apps/web/lib/server/user-identity.ts:263; apps/web/app/api/models/free-quota/completions/route.ts:595; apps/mobile/src/features/settings/personalization/index.tsx:380; apps/mobile/services/cloudSettingsMapping.ts:111; apps/web/lib/server/user-identity.ts:214; apps/mobile/stores/chat/chatExecutionStore.ts:1364; apps/cli/src/tui/tui_app.rs:3334

## S85.04 Writing-style personalization.
- Should: The user can give the assistant a sample of their own writing (or a named custom style) and replies imitate that writing style.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:138; apps/web/features/chat/components/Composer/StyleSelector.tsx:333; apps/web/features/chat/stores/style-store.ts:214; apps/web/lib/hooks/useChatStream.ts:3444; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4969

## S85.05 Saved Memory.
- Should: The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/services/turn-context-service.ts:186; apps/web/app/api/models/free-quota/completions/route.ts:606; apps/web/features/models/lib/free-offering-request.ts:69; apps/mobile/app/(app)/settings/memory.tsx:98; apps/mobile/services/preferences.ts:27; apps/cli/src/cloud/personalization.rs:274; apps/cli/src/lib.rs:3175; apps/extension-vscode/src/core/commandSetup.ts:1863

## S85.06 Past-chat reference.
- Should: The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/turn-context-service.ts:186; apps/web/app/api/models/free-quota/completions/route.ts:606; apps/mobile/services/cloudSettingsMapping.ts:208; apps/mobile/services/cloudSettingsMapping.ts:140; apps/extension/src/side_panel.ts:11191; apps/extension/src/features/cloud-bridge/memoryClient.ts:251; apps/web/lib/services/turn-context-service.ts:93

## S85.07 Project Memory preferences.
- Should: The user can choose, per project, whether project chats also use account-wide memories or only that project's memories.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/chat/projects/[id]/page.tsx:1261; apps/web/features/projects/components/ProjectSettingsDialog.tsx:250; apps/web/features/projects/components/ProjectSettingsDialog.tsx:99; apps/web/app/api/projects/[id]/route.ts:171; apps/web/lib/services/managed-memory-context-service.ts:956

## S85.08 Connected personalization sources.
- Should: The user can connect outside sources (mail, calendar, docs) that the assistant reads in the background to personalize answers, and disconnect them.
- Status: not applicable anywhere

## S85.09 Location-use preference.
- Should: The user can allow or block use of their location to personalize answers.
- Status: not applicable anywhere

## S85.10 Browsing-context preference.
- Should: The user controls which websites or browser the assistant may read or act in, and can revoke that access.
- Status: desktop done, chrome done
- Code: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:88; apps/desktop/electron/runtime/dispatcher.ts:924; apps/extension/src/options.ts:1100; apps/extension/src/features/options/site-allowlist.ts:84

## S85.11 Activity-history preference.
- Should: The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/app/api/search/route.ts:262; apps/web/app/api/search/route.ts:313; apps/web/lib/services/retrieval-search-service.ts:241; apps/web/lib/hooks/useConversations.ts:461; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:85; apps/web/lib/server/persist-free-offering-user.ts:36; apps/web/shared/components/CommandPalette/CommandPalette.tsx:100; apps/web/app/api/projects/route.ts:84

## S85.12 Training/improvement choice.
- Should: The user can choose whether their content may be used to train or improve models.
- Status: web done, desktop done, mobile done
- Code: apps/web/lib/server/side-call-training-policy.ts:31; apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:153; apps/web/lib/services/model-memory-extraction.ts:105; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3585; apps/mobile/src/features/settings/cloud-privacy/ProviderTrainingOptOutGroup.tsx:41; apps/mobile/src/features/settings/cloud-privacy/index.tsx:162

## S85.13 Feedback-data choice.
- Should: When sending feedback (thumbs, reports), the user can choose whether the conversation content is shared with it.
- Status: not applicable anywhere

## S85.14 Diagnostic-sharing choice.
- Should: The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/PrivacySection.tsx:51; apps/web/features/settings/sections/PrivacySection.tsx:211; apps/web/lib/sentry-shared.ts:81; apps/mobile/src/features/settings/index.tsx:615; apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:15; apps/cli/src/tui/tui_app.rs:3864; apps/cli/src/config.rs:1126; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1563

## S85.15 Voice recording retention.
- Should: The user can see and control how long voice recordings are kept, or delete them.
- Status: not applicable anywhere

## S85.16 Temporary-chat preferences.
- Should: The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/lib/hooks/useChatStream.ts:3364; apps/web/lib/server/persist-free-offering-user.ts:24; apps/cli/src/config.rs:1105; apps/cli/src/lib.rs:3868

## S85.17 Archived-chat management.
- Should: The user can list archived chats, restore them, and delete them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/ArchivedChatsSection.tsx:110; apps/web/features/settings/services/conversation-data-service.ts:131; apps/mobile/app/(app)/settings/archived-chats.tsx:128; apps/mobile/src/features/archived-chats/service.ts:69; apps/cli/src/lib.rs:3483; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:148; apps/extension-vscode/src/features/trees/sessionPickers.ts:161

## S85.18 Delete all chats.
- Should: One action deletes every chat in the user's history (active and archived) after confirmation, and the copy states truthfully whether they can be restored.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/settings/sections/PrivacySection.tsx:303; apps/web/features/settings/sections/PrivacySection.tsx:668; apps/web/features/settings/services/conversation-data-service.ts:181; apps/web/app/api/chat/conversations/bulk/route.ts:53; apps/mobile/src/features/settings/data-controls/index.tsx:189; apps/mobile/src/features/archived-chats/service.ts:27

## S85.19 Shared-link management.
- Should: The user can list the chat links (and published pages) they have shared and revoke any of them.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/SharedLinksSection.tsx:82; apps/web/features/settings/services/conversation-data-service.ts:194; apps/mobile/app/(app)/settings/shared-links.tsx:82; apps/mobile/src/features/shared-links/service.ts:43; apps/cli/src/cloud/shares.rs:29; apps/cli/src/cloud/shares.rs:33; apps/cli/src/lib.rs:5535

## S85.20 Data export.
- Should: The user can download a copy of their account data (chats, memory, files, settings) from the surface.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/PrivacySection.tsx:817; apps/web/features/settings/components/DataExportRow.tsx:205; apps/mobile/src/features/settings/cloud-account/index.tsx:332; apps/mobile/src/features/settings/cloud-account/index.tsx:132; apps/mobile/services/cloudDataExport.ts:28; apps/cli/src/cloud/data_export.rs:52; apps/cli/src/cloud/client.rs:379

## S85.21 Import history.
- Should: The user can import chat history from another assistant (e.g. a ChatGPT or Claude export) into their conversation list.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S85.22 Import Memory.
- Should: The user can import memories exported from another assistant and they become saved memories.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/MemorySection.tsx:205; apps/web/features/settings/components/ImportMemoryDialog.tsx:84; apps/web/app/api/memory/import/route.ts:184; apps/mobile/app/(app)/settings/memory.tsx:170; apps/mobile/app/(app)/settings/memory-import.tsx:128; apps/cli/src/lib.rs:2617; apps/cli/src/cloud/mod.rs:498

## S85.23 Clear local storage.
- Should: The user can wipe the data the app keeps on this device (local chats, cache, settings) from within the app.
- Status: desktop missing, mobile done, cli missing, vscode missing
- Code: apps/mobile/app/(app)/settings/storage.tsx:173; apps/mobile/app/(app)/settings/storage.tsx:440; apps/mobile/services/dsarExport.ts:431

## S85.24 Clear browser data.
- Should: The user can clear cookies and browsing data held by an AGI-controlled browser.
- Status: not applicable anywhere

## S85.25 Reset personalization.
- Should: One action resets personalization (instructions, style, memory) to defaults after confirmation.
- Status: not applicable anywhere

## S85.26 Delete account.
- Should: The user can delete their account (and its data) from the surface after an explicit confirmation.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/AccountSection.tsx:448; apps/web/features/settings/hooks/use-settings-queries.ts:436; apps/web/app/api/user/delete-account/route.ts:416; apps/mobile/src/features/settings/cloud-account/index.tsx:182; apps/mobile/src/features/settings/cloud-account/index.tsx:370
