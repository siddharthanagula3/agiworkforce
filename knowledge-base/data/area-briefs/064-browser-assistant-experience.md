# Area 64. Browser-assistant experience

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S64.01 Current-page context.
- Should: The assistant reads the page open in the user's browser and answers with it as context.
- Status: desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:745; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:89; apps/desktop/electron/runtime/dispatcher.ts:594; apps/mobile/src/features/share-preview/index.tsx:126; apps/mobile/stores/chat/chatExecutionStore.ts:2300; apps/cli/src/platform/runtime/tool_catalog.rs:961; apps/cli/src/features/exec/tools/mod.rs:1236; apps/cli/src/platform/runtime/tool_catalog.rs:181

## S64.02 Selected-text context.
- Should: Text the user highlights on a web page reaches the assistant as context for a question.
- Status: desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/desktop/electron/browser/bridgeServer.ts:525; apps/desktop/electron/main.ts:352; apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift:296; apps/cli/src/lib.rs:4401; apps/extension/src/side_panel.ts:11075; apps/extension-vscode/src/features/context-handoff/index.ts:211; apps/extension/src/side_panel.ts:11067; apps/extension/src/background.ts:4526

## S64.03 Open-tab picker.
- Should: The user picks one or more open tabs to give the assistant as context.
- Status: desktop missing, chrome missing

## S64.04 Multi-tab comparison.
- Should: The assistant compares content from two or more open tabs in one answer.
- Status: desktop missing, cli missing, chrome missing

## S64.05 Page summary.
- Should: One action summarizes the page the user is viewing.
- Status: desktop done, mobile done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:201; apps/web/features/desktop-host/lib/device-steps.ts:196; apps/mobile/src/features/share-preview/index.tsx:126; apps/extension/src/side_panel.ts:6869; apps/extension/src/side_panel.ts:4556; apps/extension/src/side_panel.ts:4507

## S64.06 Question about page.
- Should: The user asks a free-form question and the answer uses the current page's content.
- Status: desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:745; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:89; apps/desktop/electron/runtime/dispatcher.ts:594; apps/mobile/src/features/share-preview/index.tsx:141; apps/mobile/stores/chat/chatExecutionStore.ts:2300; apps/cli/src/platform/runtime/tool_catalog.rs:961; apps/cli/src/features/exec/tools/mod.rs:1236; apps/cli/src/platform/runtime/tool_catalog.rs:181

## S64.07 Question about video/transcript.
- Should: The assistant answers questions about a video on the page using its transcript.
- Status: desktop missing, mobile missing, cli missing, chrome done
- Code: apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:290; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:164; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:270; apps/extension/src/features/content/in-page-panel/panel.ts:456; apps/extension/src/features/content/in-page-panel/panel.ts:438

## S64.08 Browser side conversation.
- Should: A chat sits beside the page in the browser and keeps its own conversation while the user browses.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:4802; apps/extension/manifest.json:78; apps/extension/src/side_panel.ts:6861

## S64.09 Browser history context where explicitly enabled.
- Should: When the user turns it on, the assistant can use their browsing history as context.
- Status: desktop missing, cli missing, chrome missing

## S64.10 Open URL.
- Should: The assistant opens a web address in the browser for the user.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:205; apps/desktop/electron/runtime/dispatcher.ts:1072; apps/cli/src/platform/runtime/tool_catalog.rs:961; apps/cli/src/features/exec/tools/mod.rs:1236; apps/cli/src/platform/runtime/tool_catalog.rs:181; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5654; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948; apps/cli/src/agent/chat.rs:688

## S64.11 Back/forward/reload.
- Should: The assistant can go back, go forward or reload the page it is working on.
- Status: web missing, desktop partial, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/desktop/electron/browser/commandGate.ts:265; apps/desktop/electron/browserPane.ts:351
- Unfinished: desktop: The assistant can go back and forward in a paired browser tab, and the built-in pane has back, forward and reload controls; the assistant has no reload command for the page it is working on.

## S64.12 Create or close tab.
- Should: The assistant can open a new tab or close one as part of a task.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S64.13 Organize tabs.
- Should: The assistant groups, sorts or tidies the user's open tabs.
- Status: desktop missing, cli missing, vscode missing

## S64.14 Website search.
- Should: The assistant runs a search on a website and reads the results back.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome done
- Code: apps/cli/src/platform/runtime/tool_catalog.rs:53; apps/extension/src/features/content/pageElements.ts:161; apps/extension/src/features/side-panel/computerUsePanel.ts:1091; apps/extension/src/side_panel.ts:11528; apps/extension/src/background.ts:4268

## S64.15 Form filling.
- Should: The assistant fills in a web form on the user's behalf.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:213; apps/web/lib/device-steps/device-tools.ts:324; apps/desktop/electron/browser/browserSteps.ts:71; apps/cli/src/platform/runtime/tool_catalog.rs:56; apps/extension/src/features/content/pageElements.ts:250; apps/extension/src/side_panel.ts:11620; apps/extension/src/background.ts:4268

## S64.16 Multi-step website task.
- Should: The user gives a goal and the assistant carries it out over several steps on websites.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome done
- Code: apps/cli/src/platform/runtime/tool_catalog.rs:58; apps/extension/src/features/native-bridge/desktopCommands.ts:194; apps/extension/src/features/side-panel/computerUsePanel.ts:1149; apps/extension/src/side_panel.ts:11528

## S64.17 Structured site-tool invocation.
- Should: The assistant calls tools a website declares (e.g. WebMCP) instead of clicking through the page.
- Status: desktop missing, cli missing, vscode missing, chrome done
- Code: apps/extension/src/background.ts:1379; apps/extension/src/background.ts:4271; apps/extension/src/features/computer-use/agentLoop.ts:525

## S64.18 Visible action timeline.
- Should: Each browser action the assistant takes is listed for the user as it happens.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: apps/desktop/electron/browser/bridgeServer.ts:866; apps/desktop/electron/browser/bridgeServer.ts:894; apps/desktop/electron/runtime/dispatcher.ts:1074; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:318; apps/cli/src/platform/runtime/tool_catalog.rs:181; apps/cli/src/features/exec/tools/mod.rs:1236; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5654; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948

## S64.19 Live browser preview.
- Should: The user can watch the browser the assistant is driving while it works.
- Status: web missing, mobile missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:135; apps/extension/src/features/side-panel/computerUsePanel.ts:1312

## S64.20 Active-tab indicator.
- Should: A visible marker shows which tab the assistant is working in.
- Status: web missing, desktop missing, mobile missing, chrome done
- Code: apps/extension/src/background.ts:1426; apps/extension/src/background.ts:4300; apps/extension/src/content.ts:1846

## S64.21 Login handoff.
- Should: When a site needs the user to sign in, the assistant pauses, lets them sign in, then continues.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:587; apps/extension/src/features/computer-use/agentLoop.ts:805; apps/extension/src/background.ts:339; apps/extension/src/features/side-panel/computerUsePanel.ts:877

## S64.22 Human verification handoff.
- Should: When a site shows a CAPTCHA or human check, the assistant hands it to the user and resumes after.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:587; apps/extension/src/background.ts:4480

## S64.23 Take over.
- Should: The user takes over the browser mid-task without ending the assistant's run.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S64.24 Return control to agent.
- Should: After taking over, the user hands control back and the assistant continues the same task.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S64.25 Pause/stop.
- Should: The user can pause or stop the assistant's browser task at any moment.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3999; apps/extension/src/features/side-panel/computerUsePanel.ts:805; apps/extension/src/features/side-panel/computerUsePanel.ts:892; apps/extension/src/background.ts:4480

## S64.26 Download review.
- Should: Files the assistant downloads are approved and listed so the user can review them.
- Status: web missing, desktop done, mobile missing, cli missing, chrome done
- Code: apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:347; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:366; apps/desktop/electron/browser/browserSteps.ts:71; apps/extension/src/features/computer-use/approvalPolicy.ts:217; apps/extension/src/features/computer-use/agentLoop.ts:426; apps/extension/src/side_panel.ts:11620

## S64.27 Upload review.
- Should: Before the assistant uploads a file to a website the user reviews and approves it.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome done
- Code: apps/extension/src/features/computer-use/approvalPolicy.ts:221; apps/extension/src/side_panel.ts:11620

## S64.28 Website permission controls.
- Should: The user decides which websites the assistant may read or act on.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:7640; apps/extension/src/features/options/site-permission-policy.ts:236; apps/extension/src/features/site-policy/store.ts:12

## S64.29 Browser-session persistence setting.
- Should: A setting decides whether the assistant's browser keeps cookies and sign-ins between tasks.
- Status: web missing, mobile missing

## S64.30 Clear website data.
- Should: The user can clear the cookies and site data the assistant's browser holds.
- Status: web missing, desktop done, mobile missing, chrome missing
- Code: apps/desktop/electron/browserPane.ts:417; apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:39; apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:98

## S64.31 Isolated agent browser versus user browser choice.
- Should: The user chooses whether the assistant works in an isolated browser or in their own signed-in browser.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S64.32 Browser-task result summary.
- Should: When a browser task ends the assistant reports what it did and what still needs the user.
- Status: web missing, desktop done, mobile missing, cli done, vscode done, chrome done
- Code: apps/web/features/desktop-host/lib/device-steps.ts:186; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:318; apps/cli/src/features/exec/tools/mod.rs:1236; apps/cli/src/platform/runtime/tool_catalog.rs:181; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5654; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948; apps/cli/src/agent/chat.rs:688; apps/cli/src/agent/mod.rs:771
