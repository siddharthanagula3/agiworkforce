# Area 68. Session continuity and remote-session product

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S68.01 Shared session identifier across supported clients.
- Should: One session identifier names the same coding session on every supported client.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/app/code/[sessionId]/page.tsx:16; apps/web/features/code/CloudCodePage.tsx:313; packages/contracts/types/src/product-routes.ts:21; apps/desktop/electron/runtime/developerSessionService.ts:892; apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:229; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:162; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6; apps/cli/src/lib.rs:1054

## S68.02 Same conversation history.
- Should: Opening the session on any client shows the same conversation history.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/CloudCodePage.tsx:387; packages/contracts/types/src/product-routes.ts:21; apps/desktop/electron/runtime/developerSessionService.ts:892; apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:229; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:162; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6; apps/cli/src/cloud/code_sessions.rs:184; apps/cli/src/lib.rs:2060

## S68.03 Same active branch.
- Should: Every client shows and works on the same active git branch for the session.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/components/CodeChangesPanel.tsx:142; apps/web/features/code/components/CodeChangesPanel.tsx:189; packages/contracts/types/src/product-routes.ts:21; apps/web/features/code/components/LocalSessionsSection.tsx:76; apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:229; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:162; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6; apps/cli/src/cloud/code_sessions.rs:166

## S68.04 Same repository association.
- Should: Every client associates the session with the same repository.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/CloudCodePage.tsx:1044; apps/web/features/code/code-surface.ts:461; packages/contracts/types/src/product-routes.ts:21; apps/web/features/code/components/LocalSessionsSection.tsx:80; apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:229; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:162; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6; apps/cli/src/cloud/code_sessions.rs:118

## S68.05 Same worktree association.
- Should: Every client associates the session with the same git worktree.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/agent/mod.rs:1774; apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts:14; apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts:48

## S68.06 Same model and instruction configuration.
- Should: Every client runs the session with the same model and the same instruction files.
- Status: web partial, desktop partial, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:108; apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:323; apps/cli/src/agent/mod.rs:573; apps/cli/src/app_server/developer_host.rs:590; apps/cli/src/app_server/developer_host.rs:1187; apps/cli/src/lib.rs:2434; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1534
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S68.07 Same task plan and checkpoints.
- Should: Every client shows the same task plan and the same checkpoints for the session.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/agent/mod.rs:1590; apps/cli/src/app_server/developer_host.rs:1836; apps/cli/src/app_server/developer_host.rs:1876; apps/cli/src/app_server/developer_host.rs:1556; apps/cli/src/app_server/developer_host.rs:3503; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1907; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6095; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2223

## S68.08 Same pending approvals.
- Should: An approval pending in the session shows on every attached client and can be answered from any of them.
- Status: web partial, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:108; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:224; apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:338; apps/cli/src/tui/tui_app.rs:5135; apps/cli/src/tui/tui_app.rs:3761; apps/cli/src/tui/remote_host.rs:211; apps/cli/src/tui/remote_host.rs:404
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S68.09 Same tool activity.
- Should: Tool activity of a running turn streams to every attached client.
- Status: web partial, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:323; apps/cli/src/tui/remote_host.rs:118; apps/cli/src/tui/remote_host.rs:171; apps/cli/src/tui/tui_app.rs:6724; apps/cli/src/tui/tui_app.rs:6971; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:136
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S68.10 Read-only session attachment.
- Should: A client can attach to a running session read-only, watching without being able to act.
- Status: not applicable anywhere

## S68.11 Active-control attachment.
- Should: A client attaches to a running session with full control: send turns, stop, approve.
- Status: web done, mobile done
- Code: apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:139; apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:140; apps/web/features/code/CloudCodePage.tsx:124; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:224

## S68.12 Execution-owner indicator.
- Should: Every client shows which client currently owns execution of the session.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/agent/mod.rs:1741; apps/cli/src/agent/mod.rs:1784; apps/cli/src/platform/runtime/writer_lease.rs:77; apps/cli/src/agent/mod.rs:1706

## S68.13 Transfer control between clients.
- Should: The user hands control of a session from one client to another explicitly.
- Status: web done, desktop done, cli done, vscode done
- Code: apps/web/features/code/components/CodeChangesPanel.tsx:141; apps/web/features/code/code-surface.ts:319; apps/web/features/code/components/LocalSessionPanel.tsx:221; apps/web/features/code/components/LocalSessionPanel.tsx:314; apps/web/features/code/components/LocalSessionPanel.tsx:310; apps/web/features/code/code-surface.ts:339; apps/extension-vscode/src/features/context-handoff/index.ts:236; apps/extension-vscode/src/features/context-handoff/developerSessionLink.ts:29

## S68.14 Continue local execution from mobile.
- Should: From the phone, the user continues a coding session that runs on their local machine.
- Status: desktop done, mobile done, vscode done
- Code: apps/desktop/electron/runtime/dispatcher.ts:874; apps/web/features/desktop-host/components/RemoteControlSection.tsx:74; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:74; apps/mobile/src/features/companion/remote-code/service.ts:41; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:312; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:315; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:316

## S68.15 Continue cloud execution from desktop.
- Should: From the desktop app, the user continues a coding session that runs in the cloud.
- Status: web partial, desktop partial
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S68.16 Move work to cloud through an explicit handoff.
- Should: The user explicitly hands a local session over to cloud execution, seeing what moves.
- Status: web missing, desktop missing, mobile missing, cli done, vscode partial
- Code: apps/cli/src/lib.rs:1057; apps/cli/src/lib.rs:2143; apps/cli/src/lib.rs:2229; apps/cli/src/cloud/code_handoff.rs:410; apps/cli/src/cloud/code_handoff.rs:459; apps/cli/src/cloud/code_handoff.rs:538; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4431; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:996
- Unfinished: vscode: Continue in the Cloud now also sits in the Sessions sheet header on the Cloud tab (044fdca03). Session creation needs AGI_E2B_EXECUTION on in production.

## S68.17 Bring cloud results back to local workspace.
- Should: Results of cloud work come back into the user's local workspace.
- Status: web done, desktop done, cli missing, vscode done
- Code: apps/web/features/code/components/CodeChangesPanel.tsx:142; apps/web/features/code/components/CodeChangesPanel.tsx:343; apps/web/features/code/code-surface.ts:363; apps/desktop/electron/windowPolicy.ts:54; packages/contracts/types/src/cloud-task-handoff-uri.ts:43; packages/contracts/types/src/cloud-task-handoff-uri.ts:63; apps/extension-vscode/src/features/context-handoff/index.ts:72; apps/extension-vscode/src/features/context-handoff/index.ts:202

## S68.18 File/environment transfer review.
- Should: Before a transfer, the user reviews which files, context and environment will move.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/cloud/code_handoff.rs:209; apps/cli/src/cloud/code_handoff.rs:318; apps/cli/src/cloud/code_handoff.rs:387; apps/cli/src/lib.rs:2180; apps/cli/src/lib.rs:2181; apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:97; apps/extension-vscode/src/core/commandSetup.ts:500

## S68.19 Remote-machine discovery.
- Should: The user sees which of their machines are available to run sessions.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:75; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:261; apps/mobile/src/features/companion/components/AccountComputersCard.tsx:53; apps/mobile/src/features/device-registry/computers.ts:26

## S68.20 Remote-machine card.
- Should: Each remote machine appears as a card with its name, platform and status.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/settings/components/LinkedDevicesPanel.tsx:50; apps/web/features/settings/components/LinkedDevicesPanel.tsx:104; apps/mobile/src/features/companion/components/AccountComputersCard.tsx:53

## S68.21 Host capabilities.
- Should: Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).
- Status: web done, desktop done, mobile done, cli done
- Code: apps/desktop/electron/runtime/dispatcher.ts:678; apps/mobile/src/features/companion/components/AccountComputersCard.tsx:46; apps/cli/src/lib.rs:2104; apps/cli/src/cloud/devices.rs:50; apps/cli/src/cloud/devices.rs:81

## S68.22 Device pairing.
- Should: The user pairs a phone or another client with a machine so it can reach that machine's sessions.
- Status: web partial, desktop partial, mobile done, cli missing, vscode done
- Code: apps/web/app/api/pair/claim/route.ts:70; apps/mobile/app/(app)/companion/index.tsx:257; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:92
- Unfinished: web: live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online | desktop: live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online

## S68.23 Pairing revocation.
- Should: The user revokes a pairing from either side and it stops working at once.
- Status: web done, desktop done, mobile done, cli missing, vscode done
- Code: apps/web/app/api/pair/initiate/route.ts:95; apps/web/app/api/pair/claim/route.ts:99; services/signaling-server/src/index.ts:787; apps/web/features/desktop-host/components/RemoteControlSection.tsx:83; apps/mobile/stores/connectionStore.ts:1223; apps/mobile/app/(app)/companion/index.tsx:137; apps/extension-vscode/src/features/remote-control/index.ts:206; packages/platform/utils/src/remoteControl/remoteControlHost.ts:470

## S68.24 Start a session in an allowed remote folder.
- Should: From another client, the user starts a new session on a remote machine inside a folder that machine allows.
- Status: web missing, desktop partial, mobile missing, cli missing, vscode missing
- Code: apps/desktop/electron/remote/remoteControlService.ts:257; apps/desktop/electron/remote/remoteControlService.ts:73
- Unfinished: desktop: The computer accepts a start-session request for a folder it has approved; the screen on the other client that sends it is not verified, and Remote Control is hidden in the first mobile release.

## S68.25 Device-offline explanation.
- Should: When the remote machine is offline, the client says so and explains what that means.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/settings/components/LinkedDevicesPanel.tsx:52; apps/web/features/settings/components/LinkedDevicesPanel.tsx:104; apps/mobile/app/(app)/companion/code/[threadId].tsx:15

## S68.26 Resume after reconnect.
- Should: After a dropped connection, the client reconnects and resumes the same session state.
- Status: desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/desktop-host/components/RemoteControlSection.tsx:192; apps/mobile/app/(app)/companion/code/[threadId].tsx:26; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:137; apps/cli/src/lib.rs:858; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2256; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2245; apps/cli/src/app_server/developer_host.rs:2153

## S68.27 Session export.
- Should: The user exports a coding session (transcript and context) to a file from any client.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/tui/tui_app.rs:3887; apps/cli/src/repl/registry.rs:375

## S68.28 Summary-only transfer as a separate option.
- Should: When moving a session, the user may choose to carry only a summary instead of the full transcript.
- Status: not applicable anywhere

## S68.29 Transcript branch as a separate option.
- Should: When moving a session, the user may instead branch the transcript into a new session.
- Status: not applicable anywhere

## S68.30 Cross-client activity notifications.
- Should: Activity in a session (approval needed, turn done, failure) notifies the user on their other clients.
- Status: desktop done, mobile done, cli missing, vscode done
- Code: apps/desktop/electron/runtime/codeSessionActivity.ts:52; apps/desktop/electron/main.ts:1059; apps/web/app/api/code/local-sessions/activity/route.ts:32; apps/mobile/services/notifications.ts:346; apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:19; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:149; apps/extension-vscode/src/providers/chatEditorPanel.ts:137
