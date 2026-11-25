# Area 74. Browser extension

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S74.01 Toolbar action.
- Should: Clicking the extension's toolbar button (or its shortcut) opens the assistant.
- Status: chrome done
- Code: apps/extension/manifest.json:51; apps/extension/src/background.ts:806

## S74.02 Popup interface.
- Should: A small popup opens from the toolbar button for quick actions.
- Status: chrome missing

## S74.03 Side panel.
- Should: A side panel hosts the assistant beside the page.
- Status: chrome done
- Code: apps/extension/manifest.json:78; apps/extension/src/side_panel.ts:4802

## S74.04 Selection context menu.
- Should: Right-clicking selected text offers assistant actions.
- Status: chrome done
- Code: apps/extension/src/background.ts:4526; apps/extension/src/background.ts:4602

## S74.05 Ask about selected text.
- Should: The user asks about the text they selected and gets an answer in the extension.
- Status: chrome done
- Code: apps/extension/src/background.ts:4526; apps/extension/src/background.ts:4602; apps/extension/src/side_panel.ts:10950

## S74.06 Ask about current page.
- Should: The user asks a question about the current page from the extension.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:9881; apps/extension/src/side_panel.ts:4507; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:280

## S74.07 Summarize current page.
- Should: One action summarizes the current page.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:6869; apps/extension/src/side_panel.ts:4556; apps/extension/src/side_panel.ts:4507

## S74.08 Ask about a video.
- Should: The user asks about a video on the page and the answer uses its content.
- Status: chrome done
- Code: apps/extension/src/features/content/in-page-panel/pageActions.ts:58; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:290

## S74.09 Tab context picker.
- Should: The user picks which open tabs to add as context.
- Status: chrome missing

## S74.10 Multi-tab comparison.
- Should: The extension compares content across several tabs.
- Status: chrome missing

## S74.11 Multiple side conversations.
- Should: The user keeps several separate conversations in the extension and switches between them.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:6357; apps/extension/src/side_panel.ts:6852

## S74.12 Page-context chips.
- Should: Attached page context shows as a visible chip the user can see and remove.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:8121; apps/extension/src/side_panel.ts:8174

## S74.13 Explicit site-access request.
- Should: Before reading a site, the extension asks Chrome for that site's access explicitly.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:7640; apps/extension/src/features/options/site-allowlist.ts:86

## S74.14 Per-site permission settings.
- Should: The user reviews and changes which sites the extension may use and how.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:7578; apps/extension/src/features/options/site-permission-policy.ts:236; apps/extension/src/features/site-policy/store.ts:12

## S74.15 Agent action indicator.
- Should: While the agent acts, the extension clearly shows it is acting.
- Status: chrome done
- Code: apps/extension/src/features/side-panel/computerUsePanel.ts:685; apps/extension/src/side_panel.ts:9388

## S74.16 Browser-control mode.
- Should: The user switches the extension into a mode where it controls the browser for a goal they give.
- Status: chrome done
- Code: apps/extension/src/features/side-panel/computerUsePanel.ts:1115; apps/extension/src/background.ts:4087

## S74.17 Stop/takeover control.
- Should: A visible control stops the agent or lets the user take over.
- Status: chrome done
- Code: apps/extension/src/features/side-panel/computerUsePanel.ts:821; apps/extension/src/features/computer-use/agentLoop.ts:622

## S74.18 Desktop-app pairing.
- Should: The extension pairs with the desktop app.
- Status: desktop done, chrome done
- Code: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:131; apps/desktop/electron/runtime/dispatcher.ts:924; apps/extension/src/side_panel.ts:7228; apps/extension/src/features/native-bridge/pairing.ts:1

## S74.19 Native-host connection status.
- Should: The extension shows whether its desktop native host is connected and lets the user reconnect.
- Status: desktop done, cli done, chrome done
- Code: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:131; apps/desktop/electron/browser/bridgeServer.ts:421; apps/cli/src/agent/mod.rs:810; apps/extension/src/side_panel.ts:5068; apps/extension/src/side_panel.ts:10115; apps/extension/src/background.ts:3131

## S74.20 Account/workspace switching.
- Should: The user switches account or workspace inside the extension.
- Status: not applicable anywhere

## S74.21 Voice entry where supported.
- Should: The user dictates a message by voice where the browser supports it.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:9529; apps/extension/src/features/side-panel/voice.ts:42

## S74.22 Page-to-Project saving.
- Should: The user saves the current page into a Project.
- Status: chrome missing

## S74.23 Page-to-Library saving.
- Should: The user saves the current page into their Library.
- Status: chrome missing

## S74.24 Extension update notice.
- Should: After an update the extension tells the user what changed.
- Status: chrome missing

## S74.25 Unsupported-page explanation.
- Should: On pages the extension cannot use it says why.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:8705; apps/extension/src/side_panel.ts:4490

## S74.26 Private/incognito controls.
- Should: The extension has clear controls or messaging for private/incognito windows.
- Status: chrome missing

## S74.27 Browser-specific feature differences.
- Should: The extension explains which features differ between supported browsers.
- Status: chrome missing

## S74.28 Recovery after background-worker suspension.
- Should: After Chrome suspends the background worker, chats and agent runs recover or report clearly.
- Status: chrome done
- Code: apps/extension/src/side_panel.ts:4652; apps/extension/src/side_panel.ts:918; apps/extension/src/features/side-panel/computerUsePanel.ts:740
