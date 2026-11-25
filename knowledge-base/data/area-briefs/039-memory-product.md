# Area 39. Memory product

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S39.01 Memory onboarding.
- Should: A first-run flow introduces Memory: what it stores, that it is off by default, and how to turn it on or manage it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S39.02 Memory enable/disable control.
- Should: A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing, api done
- Code: apps/web/features/settings/sections/MemorySection.tsx:184; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/lib/services/managed-memory-context-service.ts:203; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2903; apps/web/lib/services/managed-memory-context-service.ts:546; apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:42; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/stores/chat/chatExecutionStore.ts:1364

## S39.03 Separate past-chat-reference control.
- Should: A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/MemorySection.tsx:285; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1223; apps/web/lib/services/managed-memory-context-service.ts:218; apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:61; apps/mobile/stores/chat/chatExecutionStore.ts:1369; apps/mobile/services/cloudSettingsMapping.ts:140

## S39.04 Saved-Memory list.
- Should: The user can open a list of every memory the assistant has saved about them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/stores/memoryStore.ts:153; apps/web/app/api/memory/route.ts:76; apps/mobile/app/(app)/settings/memory.tsx:406; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:69; apps/mobile/services/cloudSyncEngine.ts:525; apps/cli/src/lib.rs:2058; apps/cli/src/lib.rs:4058

## S39.05 Memory search.
- Should: The user can search or filter their saved memories by text.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/MemoryEditor.tsx:211; apps/web/features/settings/components/WebSettingsModal.tsx:206; packages/ui/unified-chat/src/components/MemoryEditor.tsx:69; apps/mobile/app/(app)/settings/memory.tsx:334; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:314; apps/extension-vscode/src/memory/memoryTreeProvider.ts:67; apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:72

## S39.06 Topic grouping.
- Should: Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/MemoryEditor.tsx:29; apps/mobile/app/(app)/settings/memory.tsx:200; apps/cli/src/lib.rs:2506; apps/extension-vscode/src/memory/memoryTreeProvider.ts:37; apps/extension-vscode/src/memory/memoryTreeProvider.ts:162

## S39.07 Profile summary.
- Should: The user can read a summary of what the assistant has learned about them as a person (a profile summary).
- Status: web missing, desktop missing, cli missing, vscode missing, chrome missing

## S39.08 Preference summary.
- Should: The user can read a summary of the preferences the assistant has learned from memory.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S39.09 Ongoing-work summary.
- Should: The user can read a summary of the ongoing work or projects the assistant knows they are pursuing.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/reflect-service.ts:97; apps/web/features/settings/sections/ReflectSection.tsx:319; apps/mobile/app/(app)/settings/reflect.tsx:452

## S39.10 Add Memory manually.
- Should: The user can type a new fact and save it to their memory, where later chats can use it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/stores/memoryStore.ts:232; packages/ui/unified-chat/src/stores/memoryStore.ts:399; apps/mobile/app/(app)/settings/memory.tsx:433; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:122; apps/mobile/services/cloudSyncEngine.ts:544; apps/cli/src/lib.rs:2058; apps/cli/src/lib.rs:4058

## S39.11 Explicit “remember this” action.
- Should: From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1248; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3133; apps/mobile/src/features/memory/services/memoryCommands.ts:166; apps/mobile/src/features/memory/services/memoryCommands.ts:151; apps/cli/src/tui/tui_app.rs:3792; apps/cli/src/repl/registry.rs:1490; apps/cli/src/lib.rs:2078; apps/extension-vscode/src/core/commandSetup.ts:1922

## S39.12 Automatic Memory update.
- Should: After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/MemorySection.tsx:274; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278; apps/web/lib/services/managed-auto-memory-service.ts:110; apps/web/lib/services/managed-memory-context-service.ts:1091; apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:65; apps/mobile/src/features/memory/services/consolidation.ts:25; apps/mobile/src/features/memory/services/consolidation.ts:134

## S39.13 Edit Memory.
- Should: The user can change the text of a saved memory and the corrected text is what later chats use.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/stores/memoryStore.ts:288; apps/mobile/app/(app)/settings/memory.tsx:222; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:192; apps/cli/src/lib.rs:2536; apps/cli/src/cloud/mod.rs:414; apps/extension-vscode/src/core/commandSetup.ts:1973; apps/extension/src/side_panel.ts:7815

## S39.14 Delete individual Memory.
- Should: The user can delete one saved memory so the assistant stops using it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/stores/memoryStore.ts:327; apps/mobile/app/(app)/settings/memory.tsx:205; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:235; apps/cli/src/lib.rs:2058; apps/cli/src/lib.rs:4058; apps/cli/src/lib.rs:2095; apps/cli/src/cloud/mod.rs:374

## S39.15 Delete all Memory.
- Should: One action deletes every saved memory, after a confirmation, and afterwards none remain.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/app/api/memory/route.ts:215; packages/ui/unified-chat/src/stores/memoryStore.ts:346; apps/web/features/settings/sections/MemorySection.tsx:78; apps/mobile/app/(app)/settings/memory.tsx:250; apps/mobile/src/features/memory/store.ts:319; apps/extension-vscode/src/core/commandSetup.ts:1886; apps/extension-vscode/src/memory/accountMemoryStore.ts:182; apps/extension-vscode/src/memory/accountMemoryClient.ts:159

## S39.16 Prioritize Memory.
- Should: The user can mark a memory as important (pin) so it is kept and preferred over others.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/MemoryEditor.tsx:317; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/app/api/memory/[id]/route.ts:120; apps/web/lib/services/managed-memory-context-service.ts:866; apps/mobile/app/(app)/settings/memory.tsx:164; apps/mobile/app/(app)/profile/index.tsx:222; apps/mobile/src/features/memory/store.ts:275; apps/mobile/src/features/memory/store.ts:512

## S39.17 Memory source/provenance.
- Should: Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/MemoryEditor.tsx:442; apps/web/app/api/memory/route.ts:58; apps/mobile/src/features/settings/components/MemoryItem.tsx:54; apps/cli/src/cloud/memory.rs:58; apps/cli/src/lib.rs:3111; apps/extension-vscode/src/memory/memoryTreeProvider.ts:28; apps/extension-vscode/src/memory/memoryTreeProvider.ts:67; apps/extension/src/side_panel.ts:10319

## S39.18 Last-updated information.
- Should: Each saved memory shows when it was last added or changed.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/MemoryEditor.tsx:307; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/app/api/memory/route.ts:72; apps/mobile/src/features/settings/components/MemoryItem.tsx:47; apps/cli/src/lib.rs:2526; apps/extension-vscode/src/memory/memoryTreeProvider.ts:15; apps/extension-vscode/src/core/commandSetup.ts:1809; apps/extension-vscode/src/memory/accountMemoryStore.ts:104

## S39.19 Correction of stale information.
- Should: When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/app/api/memory/route.ts:140; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278; apps/web/lib/services/managed-memory-context-service.ts:750; apps/web/lib/services/managed-memory-context-service.ts:720; apps/mobile/src/features/memory/services/localMemoryWriter.ts:17

## S39.20 Conflicting-Memory resolution.
- Should: When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/app/api/memory/conflicts/route.ts:26; apps/web/app/api/memory/[id]/restore/route.ts:19; apps/web/features/settings/components/MemoryConflicts.tsx:11; apps/web/features/settings/sections/MemorySection.tsx:384; apps/mobile/src/features/memory/services/localMemoryWriter.ts:17; apps/mobile/app/(app)/settings/memory-conflicts.tsx:48; apps/extension/src/side_panel.ts:10613; apps/extension/src/side_panel.ts:10647

## S39.21 Memory import.
- Should: The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/MemorySection.tsx:208; apps/web/features/settings/components/WebSettingsModal.tsx:206; apps/web/features/settings/components/ImportMemoryDialog.tsx:19; apps/web/app/api/memory/import/route.ts:134; apps/web/lib/memory/import-store.ts:47; apps/mobile/src/features/memory/store.ts:438; apps/mobile/app/(app)/settings/memory-import.tsx:206; apps/cli/src/lib.rs:2617

## S39.22 Memory export.
- Should: The user can download their saved memories in a readable file.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:199; apps/web/app/api/user/export/route.ts:2096; apps/mobile/src/features/settings/data-controls/index.tsx:43; apps/mobile/app/(app)/profile/index.tsx:232; apps/mobile/services/dsarExport.ts:284; apps/mobile/src/features/settings/cloud-account/index.tsx:160; apps/mobile/services/cloudDataExport.ts:28; apps/cli/src/lib.rs:2592

## S39.23 Memory-capacity display where relevant.
- Should: Where memory has a limit, the user can see how much of it is used and which memories fall outside it.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/memory_pipeline.rs:115; apps/cli/src/tui/widgets/memories_settings.rs:53; apps/cli/src/tui/tui_app.rs:4824

## S39.24 Project-scoped Memory.
- Should: Memories can be confined to one project, are used only in that project, and the user can tell which memories are project-only.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/projects/components/ProjectMemoryPanel.tsx:17; apps/web/features/projects/components/ProjectSettingsDialog.tsx:274; apps/web/app/api/memory/route.ts:153; apps/cli/src/tui/tui_app.rs:3791; apps/cli/src/repl/registry.rs:1460; apps/cli/src/repl/registry.rs:1490; apps/cli/src/memory.rs:61; apps/cli/src/agent/mod.rs:582

## S39.25 Agent-specific Memory.
- Should: A custom agent or assistant can keep its own memory, separate from the user's personal memory, and the user can review it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S39.26 Organization knowledge distinct from personal Memory.
- Should: Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/MemorySection.tsx:28; apps/web/features/settings/sections/MemorySection.tsx:327; apps/web/app/workspace/sharing/page.tsx:16; apps/web/features/settings/sections/OrganizationSharingSection.tsx:178; apps/web/app/api/memory/route.ts:52; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1208; apps/mobile/app/(app)/settings/memory.tsx:54; apps/mobile/app/(app)/settings/memory.tsx:169

## S39.27 Memory-used indication.
- Should: When saved memory or past chats shaped a reply, the reply shows it (and which memories), so the user can tell remembered facts from invented ones.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/chat/components/research/ResearchPanel.tsx:175; apps/web/features/chat/components/messages/MessageBubble.tsx:3406; apps/web/lib/services/turn-context-service.ts:177; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5408; apps/web/lib/chat-project-sources.ts:55; apps/web/app/api/models/free-quota/completions/route.ts:690; apps/web/lib/hooks/useChatStream.ts:1530; apps/web/lib/hooks/useChatStream.ts:2180

## S39.28 Temporary-chat exclusions.
- Should: In a temporary chat nothing is read from or saved to memory, and the temporary chat is never used later as past-chat context.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/db/neon/0339_temporary_chat_media_jobs.sql:18; apps/web/app/api/cron/purge-temporary-chats/route.ts:87; apps/web/app/api/cron/purge-temporary-chats/route.ts:112; apps/web/lib/server/media-job-history.ts:91; apps/mobile/stores/chat/chatExecutionStore.ts:2223; apps/mobile/stores/chat/chatExecutionStore.ts:1250

## S39.29 Sensitive-Memory controls.
- Should: The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/MemoryExclusions.tsx:135; apps/web/features/settings/components/MemoryExclusions.tsx:312; apps/web/features/settings/sections/MemorySection.tsx:345; apps/web/lib/services/memory-write-service.ts:34; apps/web/lib/services/managed-memory-context-service.ts:1070; apps/web/lib/services/managed-memory-context-service.ts:501; apps/mobile/src/features/memory/services/localMemoryWriter.ts:25; apps/mobile/src/features/memory/services/memoryCommands.ts:74

## S39.30 Memory reset independent from chat deletion.
- Should: The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/settings/sections/MemorySection.tsx:92; apps/web/features/settings/sections/PrivacySection.tsx:323; apps/mobile/app/(app)/settings/memory.tsx:455; apps/mobile/src/features/memory/store.ts:319; apps/extension-vscode/src/memory/accountMemoryStore.ts:182; apps/extension-vscode/src/memory/accountMemoryClient.ts:159

## S39.31 Cross-model personalization.
- Should: Saved memory and personalization apply the same way whichever model the user picks.
- Status: web done, desktop done, cli done, vscode done, chrome done, api done
- Code: apps/web/app/api/memory/local-context/route.ts:22; apps/web/lib/services/turn-context-service.ts:303; apps/web/features/chat/lib/local-personal-context.ts:34; apps/web/features/chat/pages/WebChatPage.tsx:1670; apps/web/lib/hooks/useChatStream.ts:3700; apps/web/features/chat/components/messages/MessageBubble.tsx:3450; apps/web/app/api/models/free-quota/completions/route.ts:610; apps/cli/src/tui/tui_app.rs:3791

## S39.32 Cross-surface Memory continuity.
- Should: A memory saved on one client appears and is used on every other client signed in to the same account.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/stores/memoryStore.ts:153; packages/ui/unified-chat/src/stores/memoryStore.ts:232; apps/cli/src/lib.rs:2083; apps/cli/src/cloud/mod.rs:322; apps/cli/src/agent/mod.rs:577; apps/extension-vscode/src/core/commandSetup.ts:1896; apps/extension-vscode/src/memory/accountMemoryStore.ts:104; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2648
