# Area 65. Computer-use experience

29 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S65.01 Computer-access setup.
- Should: The user turns computer use on in a guided setup that grants the needed permissions.
- Status: web missing, desktop done, cli missing, chrome done
- Code: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:132; apps/web/features/desktop-host/components/ComputerUseSettings.tsx:71; apps/desktop/electron/runtime/computerUseSession.ts:357; apps/desktop/electron/runtime/dispatcher.ts:926; apps/extension/src/features/side-panel/computerUsePanel.ts:1074; apps/extension/src/features/side-panel/computerUsePanel.ts:1135; apps/extension/src/side_panel.ts:11592; apps/extension/src/side_panel.ts:11564

## S65.02 Operating-system permission explanation.
- Should: The product explains which operating-system permissions computer use needs and how to grant them.
- Status: web missing, desktop done
- Code: apps/web/lib/hooks/useChatStream.ts:1230; apps/desktop/electron/runtime/computerUseService.ts:240; apps/desktop/electron/runtime/dispatcher.ts:413

## S65.03 Application allowlist.
- Should: The user lists which applications the agent may control.
- Status: web missing, desktop done
- Code: apps/desktop/electron/runtime/applicationControl.ts:104; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:172

## S65.04 Application blocklist.
- Should: The user lists applications the agent must never control.
- Status: web missing, desktop done
- Code: apps/desktop/electron/runtime/applicationControl.ts:111; apps/desktop/electron/runtime/dispatcher.ts:1264

## S65.05 Window selection.
- Should: The agent can be pointed at one window rather than the whole screen.
- Status: web missing, desktop missing

## S65.06 Monitor selection.
- Should: On a multi-monitor setup computer use can target a chosen display.
- Status: web missing, desktop done
- Code: apps/desktop/electron/runtime/dispatcher.ts:829; apps/desktop/electron/runtime/computerUseService.ts:287; apps/web/features/desktop-host/lib/device-steps.ts:196

## S65.07 Screen preview.
- Should: The user sees what the agent sees on screen as it works.
- Status: web missing, desktop done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:467; apps/web/lib/hooks/useChatStream.ts:1230; apps/desktop/electron/runtime/dispatcher.ts:829; apps/extension/src/features/computer-use/agentLoop.ts:135; apps/extension/src/features/side-panel/computerUsePanel.ts:1312

## S65.08 Cursor/action visualization.
- Should: The agent's pointer position or action target is shown visually as it acts.
- Status: web missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:281; apps/extension/src/background.ts:4281; apps/extension/src/content.ts:1846

## S65.09 Current-application indicator.
- Should: The product shows which application the agent is currently working in.
- Status: web missing, desktop done
- Code: apps/desktop/electron/native/macos/agi-input.swift:217; apps/desktop/electron/runtime/computerUseService.ts:325; apps/desktop/electron/runtime/computerUseSteps.ts:134; apps/web/features/desktop-host/lib/device-steps.ts:73

## S65.10 Current-window indicator.
- Should: The product shows which window the agent is currently working in.
- Status: web missing, desktop done
- Code: apps/desktop/electron/native/macos/agi-input.swift:217; apps/web/features/desktop-host/lib/device-steps.ts:73; apps/web/features/desktop-host/lib/device-steps.ts:147

## S65.11 Clipboard permission.
- Should: Clipboard access by the agent needs its own permission.
- Status: web missing, desktop done
- Code: apps/desktop/electron/runtime/computerUseSteps.ts:56

## S65.12 Local-folder permission.
- Should: The user grants the agent specific local folders and can revoke them.
- Status: desktop done, cli done, vscode done
- Code: apps/web/features/settings/sections/CapabilitiesSection.tsx:88; apps/web/features/desktop-host/components/LocalAccessSection.tsx:334; apps/desktop/electron/runtime/dispatcher.ts:759; apps/cli/src/agent/mod.rs:953; apps/cli/src/claude_parity.rs:289; apps/cli/src/claude_parity.rs:155; crates/agiworkforce-command-registry/src/lib.rs:522; apps/extension-vscode/src/extension.ts:174

## S65.13 Application launch.
- Should: The agent can open an application on the computer.
- Status: web missing, desktop done
- Code: apps/desktop/electron/runtime/dispatcher.ts:2584; apps/desktop/electron/runtime/applicationLaunch.ts:102

## S65.14 Clicking and typing.
- Should: The agent clicks and types on the computer's screen.
- Status: web missing, desktop done, cli missing
- Code: apps/desktop/electron/runtime/dispatcher.ts:837; apps/web/features/desktop-host/lib/device-steps.ts:196; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:467

## S65.15 Scrolling.
- Should: The agent scrolls on the computer's screen.
- Status: web missing, desktop done, cli missing
- Code: apps/desktop/electron/runtime/dispatcher.ts:851; apps/web/features/desktop-host/lib/device-steps.ts:196; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:467

## S65.16 Drag-and-drop actions.
- Should: The agent drags and drops on the computer's screen.
- Status: web missing, desktop done, cli missing, chrome missing
- Code: apps/desktop/electron/runtime/dispatcher.ts:844; apps/web/features/desktop-host/lib/device-steps.ts:196; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:467

## S65.17 Native file-dialog interaction.
- Should: The agent can work native open/save file dialogs.
- Status: web missing

## S65.18 Background application operation where supported.
- Should: The agent can operate an application in the background without taking over the user's screen.
- Status: web missing, desktop missing, chrome partial
- Code: apps/extension/src/features/computer-use/agentLoop.ts:565; apps/extension/src/background.ts:2805
- Unfinished: chrome: partials/privacy c46c84d983: switching tabs no longer cancels a run and steps no longer require the run tab to be active; the run enables CDP focus emulation. Live check (final pass): start a run, switch to another tab, and confirm Page.captureScreenshot and input keep working in the background tab.

## S65.19 User-input arbitration.
- Should: When the user moves the mouse or types, the agent yields rather than fighting for control.
- Status: web missing, desktop done, chrome done
- Code: apps/desktop/electron/runtime/computerUseSession.ts:137; apps/desktop/electron/runtime/computerUseSession.ts:155; apps/extension/src/content.ts:1877; apps/extension/src/background.ts:4466

## S65.20 Emergency stop.
- Should: One immediate control stops all computer control.
- Status: web missing, desktop done, chrome done
- Code: apps/desktop/electron/runtime/computerUseSession.ts:117; apps/desktop/electron/runtime/computerUseSession.ts:318; apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:55; apps/desktop/electron/appMenu.ts:123; apps/extension/src/features/side-panel/computerUsePanel.ts:662; apps/extension/src/features/side-panel/computerUsePanel.ts:770

## S65.21 Pause and takeover.
- Should: The user pauses the agent and takes control of the computer.
- Status: web missing, desktop done, chrome missing
- Code: apps/desktop/electron/appMenu.ts:115; apps/desktop/electron/runtime/computerUseService.ts:177; apps/desktop/electron/runtime/dispatcher.ts:253

## S65.22 Return control.
- Should: After taking over, the user hands control back and the agent continues.
- Status: web missing, desktop done, chrome missing
- Code: apps/desktop/electron/runtime/computerUseSession.ts:255; apps/desktop/electron/runtime/computerUseSession.ts:346; apps/desktop/electron/runtime/computerUseSteps.ts:137

## S65.23 Sensitive-action review.
- Should: Sensitive actions (payments, passwords, sending) require the user's review before the agent does them.
- Status: web missing, desktop done, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:491; apps/web/lib/device-steps/device-tools.ts:42; apps/desktop/electron/runtime/computerUseSteps.ts:82; apps/desktop/electron/runtime/computerUseSteps.ts:79; apps/extension/src/features/computer-use/approvalPolicy.ts:211; apps/extension/src/features/side-panel/computerUsePanel.ts:1092

## S65.24 Authentication handoff.
- Should: When sign-in is required the agent hands off to the user and continues afterwards.
- Status: web missing, desktop missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:805; apps/extension/src/background.ts:4480

## S65.25 Action outcome/receipt.
- Should: Each action leaves a record of what was done and whether it worked.
- Status: web missing, desktop done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:1230; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:467; apps/desktop/electron/runtime/dispatcher.ts:829; apps/extension/src/features/computer-use/agentLoop.ts:713; apps/extension/src/features/side-panel/computerUsePanel.ts:945

## S65.26 Unsupported-application explanation.
- Should: When an application cannot be controlled the product says why.
- Status: web missing, desktop done, chrome done
- Code: packages/contracts/local-runtime/src/computer-use.ts:58; apps/web/features/desktop-host/lib/device-steps.ts:73; apps/extension/src/side_panel.ts:4490; apps/extension/src/side_panel.ts:4507

## S65.27 Device-offline state.
- Should: When the target computer is offline the product says so and waits or stops clearly.
- Status: web done, desktop done, mobile done
- Code: apps/web/lib/workflows/cloud-agent-workflow.ts:27; apps/web/lib/workflows/cloud-agent-workflow.ts:38; apps/web/lib/device-steps/device-clearance-step.ts:123; apps/mobile/src/features/companion/components/StatusBanners.tsx:42

## S65.28 Permission-revoked state.
- Should: When a permission is revoked the agent stops and the user is told how to restore it.
- Status: web missing, desktop done, chrome done
- Code: apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:123; apps/desktop/electron/runtime/dispatcher.ts:470; apps/desktop/electron/runtime/permissionManager.ts:310; apps/extension/src/background.ts:2738; apps/extension/src/features/side-panel/computerUsePanel.ts:647

## S65.29 Remote access to a permitted local computer.
- Should: From another device the user directs work on their own permitted computer.
- Status: web done, desktop done, mobile partial
- Code: apps/web/app/code/computer/page.tsx:10; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:75; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:157; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:219; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:367; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:53; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:139; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:155
- Unfinished: mobile: live check: phone Dispatch to Electron after the signaling server redeploy (dispatch.task.* and dispatch.task.reply in the relay allowlist).
