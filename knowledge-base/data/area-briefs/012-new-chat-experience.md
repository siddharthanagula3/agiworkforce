# Area 12. New-chat experience

24 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S12.01 Empty conversation canvas.
- Should: Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5648; apps/web/features/chat/pages/WebChatPage.tsx:4943; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/(tabs)/chat.tsx:816; apps/mobile/app/(app)/(tabs)/chat.tsx:902; apps/cli/src/tui/tui_app.rs:1442; apps/cli/src/lib.rs:4609

## S12.02 Personalized greeting where appropriate.
- Should: The new-chat screen greets the signed-in user by their (preferred) name when one is known.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/GreetingBanner/useGreeting.ts:27; apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:10; apps/web/features/chat/pages/WebChatPage.tsx:5650; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatEmptyState.tsx:53

## S12.03 Neutral greeting when personalization is disabled.
- Should: When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:606; apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:14; apps/web/features/chat/components/GreetingBanner/useGreeting.ts:34; apps/mobile/src/features/chat/components/ChatEmptyState.tsx:35; apps/mobile/services/cloudSettingsMapping.ts:222; apps/cli/src/tui/tui_app.rs:1460; apps/cli/src/tui/tui_app.rs:1448; apps/cli/src/lib.rs:4636
- Unfinished: chrome: Add a greeting to the empty side panel; today it shows only the mark, and the composer placeholder "How can I help you today?" is the only neutral prompt.

## S12.04 Suggested prompts.
- Should: The new-chat screen offers clickable suggested prompts that fill or send a message.
- Status: web unverified, desktop unverified, mobile missing, cli missing, vscode missing, chrome done
- Code: apps/extension/src/side_panel.ts:10674; apps/extension/src/side_panel.ts:10684

## S12.05 Task-category shortcuts.
- Should: The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:6315; apps/mobile/src/features/chat/components/TaskChips.tsx:33; apps/mobile/app/(app)/(tabs)/chat.tsx:484; apps/mobile/app/(app)/(tabs)/chat.tsx:417; apps/mobile/app/(app)/(tabs)/chat.tsx:891; apps/extension/src/features/content/in-page-panel/pageActions.ts:122; apps/extension/src/features/content/in-page-panel/panel.ts:426; apps/extension/src/side_panel.ts:10668

## S12.06 Recent Project shortcuts.
- Should: The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:191; packages/ui/ui/src/sidebar/Sidebar.tsx:647; apps/web/features/chat/pages/WebChatPage.tsx:5313; apps/web/app/api/projects/route.ts:74; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/pages/WebChatPage.tsx:5348; apps/cli/src/lib.rs:2585

## S12.07 Recent-file suggestions.
- Should: When starting a chat the user is offered their recently used files to attach in one step.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:980; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:716; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:723; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4756; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:396; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:171; apps/mobile/app/(app)/(tabs)/chat.tsx:927; apps/cli/src/mentions.rs:78

## S12.08 Recommended Skills.
- Should: The new-chat screen recommends Skills relevant to the user, which can be applied to the next message.
- Status: vscode done, chrome missing
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6458; apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:28

## S12.09 Recommended connected apps.
- Should: The new-chat screen recommends apps/connectors worth connecting or using for the next message.
- Status: web unverified, desktop unverified, mobile done, vscode done
- Code: apps/mobile/src/features/chat/components/ChatEmptyState.tsx:153; apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx:39; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6463; apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:37; apps/extension/src/side_panel.ts:9905
- Unfinished: chrome: Recommend connectors in the panel; the attach menu's Connectors item only opens the web Connectors page.

## S12.10 Search entry.
- Should: From the new-chat screen the user can explicitly start a web search for the next message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/lib/slashCommands.ts:31; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:147; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2503; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4131; apps/mobile/src/features/chat/components/TaskChips.tsx:33

## S12.11 Research entry.
- Should: From the new-chat screen the user can switch on a deep-research mode for the next message.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:860; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2062; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2961; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4408; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:728

## S12.12 Image-creation entry.
- Should: From the new-chat screen the user can enter an image-creation mode whose send generates an image.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:854; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2082; apps/web/features/chat/pages/WebChatPage.tsx:5688; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4408; apps/mobile/src/features/chat/components/TaskChips.tsx:34

## S12.13 Video-creation entry.
- Should: From the new-chat screen the user can enter a video-creation mode whose send starts a video generation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:855; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2136; apps/web/features/chat/pages/WebChatPage.tsx:5688; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4408; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:532

## S12.14 Voice entry.
- Should: From the new-chat screen the user can start a spoken (voice-mode) conversation.
- Status: web done, desktop done, mobile done, cli done, vscode missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5181; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1640; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1215; apps/mobile/app/(app)/(tabs)/chat.tsx:903; apps/mobile/app/(app)/(tabs)/chat.tsx:763

## S12.15 Agentic-work entry.
- Should: From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4562; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2237; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2956; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/(tabs)/chat.tsx:852; apps/cli/src/tui/tui_app.rs:1485

## S12.16 Coding entry.
- Should: From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:475; packages/ui/ui/src/sidebar/Sidebar.tsx:555; apps/web/features/chat/pages/WebChatPage.tsx:5275; apps/web/features/chat/pages/WebChatPage.tsx:5290; apps/web/app/code/page.tsx:10; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/pages/WebChatPage.tsx:5348

## S12.17 Temporary-chat control.
- Should: Before or during a new chat the user can switch it to a temporary chat that is not kept in history.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1097; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1411; apps/web/features/chat/pages/WebChatPage.tsx:3855; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4408; apps/mobile/app/(app)/(tabs)/chat.tsx:803

## S12.18 Default-model display.
- Should: The new-chat screen shows which model the next message will use before the user sends.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1296; apps/web/features/chat/components/Composer/ComposerFooter.tsx:931; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4963; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:1126; apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:42

## S12.19 Default-workspace display.
- Should: The new-chat screen shows which workspace (personal or organization) the new chat will belong to.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:22; apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx:28; apps/web/features/chat/pages/WebChatPage.tsx:6175; apps/mobile/app/(app)/(tabs)/chat.tsx:990

## S12.20 Default-Project selection.
- Should: Before sending, the user can pick the project a new chat will be created in.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2211; apps/web/features/chat/pages/WebChatPage.tsx:3863; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:752; apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx:89

## S12.21 Mode explanation and examples.
- Should: The new-chat screen explains the available modes and gives examples of what each is for.
- Status: web unverified, desktop unverified, cli done, vscode done, chrome done
- Code: apps/cli/src/tui/tui_app.rs:1807; apps/cli/src/tui/tui_app.rs:1822; apps/extension-vscode/src/core/commandSetup.ts:1749; apps/extension/_locales/en/messages.json:1358; apps/extension/_locales/en/messages.json:1278; apps/extension/_locales/en/messages.json:1286; apps/extension/_locales/en/messages.json:2428

## S12.22 First-use feature education.
- Should: First-time users are shown a short introduction to the product's key features before or at their first chat.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/welcome/page.tsx:24; apps/web/features/onboarding/components/OnboardingWizard.tsx:38; apps/web/app/signup/complete/page.tsx:12; apps/mobile/app/index.tsx:4; apps/mobile/app/(public)/onboarding.tsx:647; apps/cli/src/lib.rs:3041; apps/cli/src/onboarding.rs:261; apps/extension-vscode/package.json:671

## S12.23 Resumption of an unsent draft.
- Should: An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3315; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3283; apps/web/features/chat/components/Composer/composer-draft-storage.ts:188; apps/mobile/src/features/chat/components/ChatInput.tsx:143; apps/mobile/src/features/chat/components/ChatInput.tsx:280; apps/mobile/app/(app)/(tabs)/chat.tsx:903; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4261; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4273

## S12.24 Guest limitations and sign-in conversion.
- Should: A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.
- Status: web partial, desktop partial, mobile done, cli done
- Code: apps/web/lib/guest-chat/guest-chat-access.ts:33; apps/mobile/app/(app)/(tabs)/chat.tsx:553; apps/mobile/app/(public)/onboarding.tsx:647; apps/mobile/app/(app)/(tabs)/chat.tsx:1022; apps/mobile/app/(public)/onboarding.tsx:345; apps/cli/src/onboarding.rs:261; apps/cli/src/lib.rs:3041; apps/cli/src/onboarding.rs:420
- Unfinished: web: web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in | desktop: web: switch-on AGI_BOT_CHALLENGE_ENFORCED=1 and flag guest.chat (surface web), off by owner decision for now. desktop: declined (lead ruling 2026-09-28): guest chat is web-only; the ChatGPT and Claude desktop apps require sign-in
