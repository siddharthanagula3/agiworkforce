# Area 40. Instructions, preferences, and personal style

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S40.01 Preferred name or form of address.
- Should: The user can tell the assistant what to call them, and replies address them that way.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:559; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:351; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.02 Background information.
- Should: The user can give the assistant background about themselves that it keeps in mind.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:631; apps/web/lib/server/user-identity.ts:172; apps/web/lib/server/user-identity.ts:189; apps/mobile/src/features/settings/personalization/index.tsx:441; apps/mobile/services/cloudSettingsMapping.ts:150; apps/cli/src/cloud/personalization.rs:44; apps/cli/src/cloud/personalization.rs:141; apps/cli/src/cloud/personalization.rs:204

## S40.03 Role or profession.
- Should: The user can state their role or profession and replies are tailored to it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:581; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:360; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.04 Goals and interests.
- Should: The user can record their goals and interests so the assistant can take them into account.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S40.05 Desired response style.
- Should: The user can choose the response style they want, and replies follow that one choice.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:29; apps/web/features/chat/stores/style-store.ts:210; apps/web/lib/prompts/prompt-manifest.ts:113; apps/mobile/src/features/chat/components/StyleSelector.tsx:26; apps/mobile/stores/chat/chatExecutionStore.ts:394; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:62; apps/cli/src/agent/mod.rs:1264

## S40.06 Response-length preference.
- Should: The user can set how long replies should be, and replies follow it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:253; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274; apps/web/features/chat/stores/style-store.ts:179; apps/web/lib/hooks/useChatStream.ts:3444; apps/mobile/src/features/settings/personalization/index.tsx:474; apps/mobile/src/features/memory/services/personalization.ts:32

## S40.07 Formality preference.
- Should: The user can choose a more or less formal register and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:608; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:380; apps/mobile/src/features/settings/personalization/constants.ts:9; apps/mobile/app/(app)/profile/index.tsx:218

## S40.08 Tone presets.
- Should: The user can pick from named tone/style presets, and one chosen preset governs replies.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:29; apps/web/features/chat/stores/style-store.ts:210; apps/mobile/src/features/chat/components/StyleSelector.tsx:26; apps/mobile/stores/chat/chatExecutionStore.ts:394; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:62; apps/cli/src/agent/mod.rs:1264; apps/extension-vscode/src/features/personalization/personalization.ts:143

## S40.09 Warmth preference.
- Should: The user can ask for warmer or cooler tone and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:697; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:400; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.10 Enthusiasm preference.
- Should: The user can ask for more or less enthusiasm and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:697; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:400; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.11 Heading/list preference.
- Should: The user can say whether replies should use headings and lists or prose, and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:652; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:400; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.12 Emoji preference.
- Should: The user can ask for more or less emoji and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:697; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:400; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.13 Technical-depth preference.
- Should: The user can set how technical replies should be, and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:630; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:483; apps/mobile/src/features/memory/services/personalization.ts:32; apps/cli/src/cloud/personalization.rs:58

## S40.14 Language preference.
- Should: The user can set the language replies are written in (separate from the interface language), and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:674; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/features/settings/sections/GeneralSection.tsx:315; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:492; apps/mobile/src/features/memory/services/personalization.ts:32; apps/cli/src/cloud/personalization.rs:85

## S40.15 Units and formatting preferences.
- Should: The user can set units and date/number formatting preferences that replies follow.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S40.16 Persistent custom instructions.
- Should: The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:721; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/lib/server/user-identity.ts:205; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4460; apps/mobile/src/features/settings/personalization/index.tsx:369; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36; apps/mobile/services/cloudSettingsMapping.ts:111

## S40.17 Project instructions.
- Should: The user can give a project its own instructions that apply to every chat in that project.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/projects/components/ProjectSettingsDialog.tsx:222; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2751; apps/mobile/app/(app)/(tabs)/projects.tsx:180; apps/mobile/stores/chat/chatExecutionStore.ts:1340; apps/cli/src/repl/registry.rs:1490; apps/cli/src/memory.rs:61; apps/cli/src/agent/mod.rs:582; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1348

## S40.18 Agent instructions.
- Should: The user can define an agent with its own instructions that apply whenever that agent is used.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/lib.rs:5040; apps/cli/src/tui/tui_app.rs:1198; apps/cli/src/agents.rs:1; apps/cli/src/agents.rs:45

## S40.19 Conversation overrides.
- Should: For one conversation the user can override their standing style/instructions without changing their defaults.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/stores/style-store.ts:150; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1455; apps/web/features/chat/pages/WebChatPage.tsx:1541; apps/mobile/stores/chat/chatViewStore.ts:64; apps/mobile/stores/chat/chatExecutionStore.ts:106; apps/mobile/stores/chat/chatMessageStore.ts:389; apps/cli/src/claude_parity.rs:904; apps/cli/src/claude_parity.rs:921

## S40.20 Writing-style examples.
- Should: The user can give samples of their own writing so replies match their voice.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:370; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274; apps/web/features/chat/stores/style-store.ts:202; apps/web/lib/hooks/useChatStream.ts:3444

## S40.21 Connected-writing-source setup.
- Should: The user can connect a source of their writing (e.g. documents or email) for the assistant to learn their style from.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S40.22 Learned writing-style summary.
- Should: The user can read a summary of the writing style the assistant has learned from them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S40.23 Style reset.
- Should: One action returns the user's style preferences to the defaults.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:463; apps/web/features/settings/sections/GeneralSection.tsx:808; apps/mobile/src/features/settings/personalization/index.tsx:305; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:105

## S40.24 Explanatory output style.
- Should: The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:29; apps/web/features/chat/stores/style-store.ts:210; apps/mobile/src/features/chat/components/StyleSelector.tsx:26; apps/mobile/stores/chat/chatExecutionStore.ts:394; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:41; apps/cli/src/agent/mod.rs:1264; apps/extension-vscode/src/features/personalization/personalization.ts:143

## S40.25 Learning-oriented output style.
- Should: The user can choose a learning-oriented style (teaching, quizzing, step by step), and replies actually follow it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2627; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2710; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1201; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1214; apps/cli/src/tui/tui_app.rs:3334; apps/cli/src/output_styles.rs:50; apps/cli/src/agent/mod.rs:1264

## S40.26 Concise output style.
- Should: The user can choose a concise style and replies are short and direct.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:608; apps/web/features/settings/components/WebSettingsModal.tsx:189; apps/web/lib/server/user-identity.ts:205; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274; apps/web/lib/hooks/useChatStream.ts:3444; apps/mobile/src/features/settings/personalization/index.tsx:380; apps/mobile/app/(app)/profile/index.tsx:218; apps/mobile/src/features/memory/services/personalContext.ts:36

## S40.27 Custom output-style creation.
- Should: The user can create, name, edit and delete their own output style and use it in chats.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/StyleSelector.tsx:150; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274; apps/web/features/chat/stores/style-store.ts:214; apps/web/lib/hooks/useChatStream.ts:3444; apps/cli/src/output_styles.rs:178; apps/cli/src/output_styles.rs:206; apps/cli/src/output_styles.rs:135

## S40.28 Effective-instruction explanation where useful.
- Should: The user can see which instructions and preferences are currently in effect and where each comes from.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/claude_parity.rs:929; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1371; apps/extension-vscode/src/core/commandSetup.ts:741; apps/extension-vscode/src/features/settings/SettingsPanel.ts:148

## S40.29 Import preferences from another assistant.
- Should: The user can import their preferences and instructions from another assistant.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/lib.rs:3849; apps/cli/src/ecosystem.rs:567

## S40.30 Selective sharing of preferences with a Project.
- Should: For each project the user can choose which of their personal preferences and instructions apply there.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2823
