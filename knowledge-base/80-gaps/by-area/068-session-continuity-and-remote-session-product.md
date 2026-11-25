---
id: "GAPS-AREA-068"
type: "gap-list"
title: "Gaps: Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 68. Session continuity and remote-session product

94 open gaps that touch this area. Area page: [20-features/068-session-continuity-and-remote-session-product](../../20-features/068-session-continuity-and-remote-session-product/README.md).

## CMP-C113

**Cloud session from local code when the repo has no remote**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Cloud Code starts only from a GitHub checkout; there is no upload of local files.
- Evidence: apps/cli/src/cloud/code_handoff.rs:29-37,447-463

## CMP-C364

**--desktop flag opens the directory in the desktop app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Only the /desktop command hands a running session over; there is no launch flag.
- Evidence: searched: --desktop, desktop flag in apps/cli/src/lib.rs, cli_options.rs

## CMP-CP152

**Send the current session to the cloud with an & prefix**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: No & prefix /continue-elsewhere and agi code handoff move a session to the cloud; no & prefix.
- Evidence: apps/cli/src/lib.rs:1182

## CMP-CP175

**Slash command /teleport**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: There is no slash form agi resume --teleport pulls a cloud session and checks out its branch, but there is no slash form.
- Evidence: apps/cli/src/lib.rs:925,2514

## CMP-CP73

**Notification when a session needs input or finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md), [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md), [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: The terminal does not ring or send a desktop notice on its own A Notification hook event fires, but the terminal does not ring or send a desktop notice on its own.
- Evidence: apps/cli/src/agent/chat.rs:3444; searched: bell, notify in tui

## CMP-D90

**Desktop app and IDE extension share chats and context**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The VS Code extension does not share chats with the desktop app.
- Evidence: searched: IDE context, sync in apps/extension-vscode, apps/desktop

## CMP-D91

**Hand off a running chat to another host**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: A chat or session cannot be moved from one computer to another.
- Evidence: searched: hand off, handoff, destination host in apps/web/features/code, apps/web/features/remote-dispatch, apps/desktop/electron/remote (only the browser sign-in and VS Code handoffs)

## CMP-D92

**Move a local session to the cloud**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: A session on this computer cannot be sent to a cloud session.
- Evidence: searched: move to cloud, continue in cloud, send to cloud, run in cloud in apps/web/features/code

## CMP-DP4

**Signing out turns off Remote Control but keeps pairings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: I found no saved pairing that turns back on after the next sign-in Remote Control stops when the account changes or signs out, but I found no saved pairing that turns back on after the next sign-in; the phone is paired again.
- Evidence: apps/desktop/electron/main.ts:982

## CMP-DP95

**Control another of your computers from this desktop app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: There is no Connections setting, and you send a task rather than open that computer's chats The Your computer page can send a task to another computer running Desktop after you paste its pairing link, and it opens inside the desktop window; there is no Connections setting, and you send a task rather than open that computer's chats.
- Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:33-45,118; apps/web/app/code/computer/page.tsx

## CMP-MP71

**Mobile task list across cloud and connected computers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: No connected computers exist Our task list covers cloud runs with awaiting-input and approval states; no connected computers exist.
- Evidence: apps/mobile/src/features/tasks/runPresentation.ts:24

## CMP-VP29

**Remote control of this window's sessions from a phone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Remote Control commands exist in the editor, but the phone side is hidden in mobile v1 by decision Remote Control commands exist in the editor, but the phone side is hidden in mobile v1 by decision.
- Evidence: apps/extension-vscode/package.json:remoteControl; apps/extension-vscode/src/features/remote-control/remoteControlService.ts

## CMP-VP57

**Chats come back after reloading the editor**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: The sidebar chat is not reopened and interrupted steps are not resumed Chat tabs opened in the editor are restored after a reload; the sidebar chat is not reopened and interrupted steps are not resumed.
- Evidence: apps/extension-vscode/src/providers/chatEditorPanel.ts:79-100

## CMP-VP58

**Remote Control: drive an editor session from phone or browser**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Conflicts with row 'Remote control of this window's sessions from a phone', rated Partial for the same feature; they ne… Conflicts with row 'Remote control of this window's sessions from a phone', rated Partial for the same feature; they need one label. The editor side exists (QR, pairing code, status bar: apps/extension-vscode/src/features/remote-control/index.ts:10-14,30-45,133-139). The phone entry is behind a feat
- Evidence: apps/extension-vscode/src/features/remote-control/index.ts:10-14,133-139

## GAP-AREA068-LW04

**Approval listing (GET) has no cloud-switch check, while approval decisions (POST) do. A listed approval can be shown and then refused.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-068
- Detail: Area 68. Session continuity and remote-session product
- Evidence: apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:46-57 versus :68-70

## GAP-CAP-synchronization-and-continuity-11

**Cloud work continues when the device is off: Cloud session creation depends on a production switch that is not on per the ledger; web scorecard W-18 could not run a task (GitHub not configured).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Requirement items: S68.06, S68.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-12

**Choose cloud or local for continuing work: Web, Desktop and Mobile have no explicit local-to-cloud handoff with a preview (S68.16, S68.18 missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.22, S68.13, S68.15, S68.16
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-13

**Remote Control: drive a session on your own computer from a phone or browser: Phone side hidden in v1. S68.24 (start a session in an allowed remote folder) is Missing on web and mobile and Partial on desktop; the sending screen is not verified. CLI is Missing for S110.21.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.21, S68.14, S68.24
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-synchronization-and-continuity-14

**Pair a device by QR code or code, and revoke: Live pairing check not done; CLI cannot pair (Missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Requirement items: S68.22, S68.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-15

**Device list, host cards and offline explanation: Mobile list across cloud and connected computers is Partial (MP71). Mobile screens are hidden in v1.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Requirement items: S68.19, S68.20, S68.21, S68.25
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-17

**Pull a cloud session into the terminal or desktop: Web S110.23 is Partial because cloud execution is off; CLI cannot apply results.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.23, S68.17
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-synchronization-and-continuity-18

**Send a local session to the cloud: No explicit handoff screen on Web, Desktop or Mobile; cloud session creation depends on a production switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.22, S68.16, S68.18
- Detail: Claude yes, ChatGPT no; AGI partly built

## GAP-CAP-synchronization-and-continuity-19

**Hand off a chat between hosts: No hand-off between two computers. Worktree association is Missing on Web, Desktop and Mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Requirement items: S68.05, S68.13
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-synchronization-and-continuity-20

**Move a terminal session to the desktop app and between CLI, desktop and IDE: Ledger and comparison disagree on Desktop-IDE sharing; needs a person to check. Task plan and checkpoints are not shared on Web, Desktop or Mobile (S68.07). The --desktop flag is Missing (C364).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.19, S110.20, S68.01, S68.02, S68.03, S68.04
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-21

**Approve and follow a running session from another device: Read-only attachment (S68.10) and execution-owner indicator (S68.12) are not built on most apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md), [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md), [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Requirement items: S68.08, S68.09, S68.11, S68.30, S90.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-22

**Resume after a dropped connection and resume past sessions: VS Code chat return after reload is Partial (VP57).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Requirement items: S68.26, S90.13, S90.15
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F068-01-01

**Model is not part of the session; clients can disagree.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Detail: Affects: Web, desktop, phone, CLI, VS Code users of cloud sessions. Work needed: Record the model per turn and show it on every client.
- Evidence: packages/contracts/types/src/cloud-code.ts:99-135

## GAP-F068-01-02

**No worktree, plan or checkpoint for cloud sessions on web, desktop, phone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Detail: Affects: Web, desktop, phone. Work needed: Add fields to the cloud session and render them.
- Evidence: doc: brief S68.05, S68.07

## GAP-F068-01-03

**Cloud switch needs two environment values; production state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Detail: Affects: Web and desktop. Work needed: Owner sets AGI_E2B_EXECUTION and E2B_API_KEY, redeploys, then live-checks /code.
- Evidence: apps/web/lib/e2b/gate.ts:20-28; doc: audit/partial/068-session-continuity-and-remote-session-product.md

## GAP-F068-01-04

**Brief line citations for CLI worktree and plan are stale (agent/mod.rs:1590 and 1774 are not about them).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief's code references.
- Evidence: apps/cli/src/agent/mod.rs:1741-1784

## GAP-F068-01-NOTBUILT

**One session on every client: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Requirement items: S68.05, S68.07
- Detail: Web: S68.05, S68.07; Desktop: S68.05, S68.07; Mobile: S68.05, S68.07

## GAP-F068-01-PARTLY

**One session on every client: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Requirement items: S68.06
- Detail: Web S68.06: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Desktop S68.06: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F068-02-01

**Cloud view is polling with a 4-second delay, not streaming.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Detail: Affects: Web and phone. Work needed: Server push if live streaming is required by S68.09.
- Evidence: apps/web/features/code/CloudCodePage.tsx:182; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:35

## GAP-F068-02-02

**VS Code and CLI show a snapshot of a cloud turn, not a live view, while the brief marks S68.09 done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Detail: Affects: VS Code, CLI. Work needed: Clarify that the brief item refers to the local remote host, or add refresh.
- Evidence: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:280

## GAP-F068-02-03

**CLI wait limit shorter than server turn limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Detail: Affects: CLI users with long turns. Work needed: Use the shared limit constant; [inferred] risk.
- Evidence: apps/cli/src/cloud/code_handoff.rs:14; packages/contracts/types/src/cloud-code.ts:259-266

## GAP-F068-02-04

**Phone to desktop reconnect is hidden in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Detail: Affects: Phone. Work needed: Owner decision to enable companion.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:16

## GAP-F068-02-05

**Web S68.26 is not stated in the brief; web reload re-reads the session but no reconnect logic beyond polling was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Detail: Affects: Web. Work needed: Decide if polling counts as resume.
- Evidence: apps/web/features/code/CloudCodePage.tsx:699-757

## GAP-F068-02-PARTLY

**Live view of a running turn: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Requirement items: S68.09
- Detail: Web S68.09: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F068-03-01

**Web approvals work only when cloud Code is switched on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Detail: Affects: Web and desktop. Work needed: Switch-on and live check (doc: audit/partial/068-session-continuity-and-remote-session-product.md).
- Evidence: apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:68-70

## GAP-F068-03-02

**Decision route checks the deployment flag but not the managed-compute kill switch directly; session creation checks both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Detail: Affects: All clients. Work needed: Confirm whether evaluateManagedComputeAccess covers the kill switch [unknown].
- Evidence: route.ts:68-70 versus apps/web/lib/services/cloud-code-session-open.ts:49-53

## GAP-F068-03-03

**Brief says desktop 08 and 11 not listed; desktop relies on the web page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Detail: Affects: Desktop. Work needed: State the desktop status explicitly.
- Evidence: doc: brief S68.08, S68.11

## GAP-F068-03-04

**Stop has no confirmation naming the consequence.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Detail: Affects: Phone, web. Work needed: Check against AGENTS.md section 9 and add if required.
- Evidence: apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:259-276

## GAP-F068-03-PARTLY

**Answer approvals and drive a session from another client: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Requirement items: S68.08
- Detail: Web S68.08: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F068-04-01

**No standing owner indicator outside the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: Affects: Web, desktop, phone, VS Code. Work needed: Add an owner label to each client.
- Evidence: doc: brief S68.12; ChatStateManager.ts:6491-6512 shows holder only on conflict

## GAP-F068-04-02

**Terminal only warns; the app server refuses. Behaviour differs by path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: Affects: CLI users. Work needed: Decide the intended rule and document it.
- Evidence: apps/cli/src/agent/mod.rs:2173-2221 vs developer_host.rs:1838-1890

## GAP-F068-04-03

**'Desktop app' link opens Code home, not the session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: Affects: Web users with a paired desktop. Work needed: Pass session id (the component already accepts it).
- Evidence: apps/web/features/desktop-host/hooks/use-paired-desktop.ts:80; callers pass no sessionId

## GAP-F068-04-04

**Phone has no owner indicator or hand-off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: Affects: Phone. Work needed: Not defined.
- Evidence: doc: brief S68.12

## GAP-F068-04-05

**Stale brief citations for the lease.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Detail: Affects: Docs. Work needed: Update brief.
- Evidence: apps/cli/src/agent/mod.rs:1741-1784

## GAP-F068-04-NOTBUILT

**Who owns execution and handing control: not built on Web, Desktop, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Requirement items: S68.12
- Detail: Web: S68.12; Desktop: S68.12; Mobile: S68.12; VS Code: S68.12

## GAP-F068-05-01

**No hand-off on web, desktop or phone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Detail: Affects: Web, desktop, phone. Work needed: Decide scope; build review screens.
- Evidence: doc: brief S68.16, S68.18

## GAP-F068-05-02

**VS Code sends a new task, not the session record, and has no file-level review of what moves.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Detail: Affects: VS Code. Work needed: Use the hand-off endpoint and list files.
- Evidence: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:142-164; vscode.json:229-230

## GAP-F068-05-03

**CLI wait of 330 seconds is shorter than the 800-second server turn limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Detail: Affects: CLI. Work needed: Align limits [inferred].
- Evidence: code_handoff.rs:14; cloud-code.ts:259-266

## GAP-F068-05-04

**Cloud switch needs environment values; production state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Detail: Affects: All clients. Work needed: Owner switch-on and live check.
- Evidence: apps/web/lib/e2b/gate.ts:20-28

## GAP-F068-05-05

**Secret scanning before upload not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Detail: Affects: CLI. Work needed: Confirm in session_handoff.rs and add if missing.
- Evidence: code_push.rs:95-116 (no scan seen)

## GAP-F068-05-NOTBUILT

**Hand a local session to the cloud: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Requirement items: S68.16, S68.18
- Detail: Web: S68.16, S68.18; Desktop: S68.16, S68.18; Mobile: S68.16, S68.18

## GAP-F068-05-PARTLY

**Hand a local session to the cloud: partly built on VS Code**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Requirement items: S68.16
- Detail: VS Code S68.16: Continue in the Cloud now also sits in the Sessions sheet header on the Cloud tab (044fdca03). Session creation needs AGI_E2B_EXECUTION on in production.

## GAP-F068-06-01

**Brief and code disagree on CLI bring-back (brief missing; code has agi resume --teleport).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Detail: Affects: CLI, documentation. Work needed: Correct the brief; add tests for the CLI path beyond unit tests.
- Evidence: apps/cli/src/lib.rs:917-927,2626-2671

## GAP-F068-06-02

**Web and desktop do not show the terminal command, only Continue in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Detail: Affects: Web, desktop. Work needed: Show the command if parity with the leaders is wanted.
- Evidence: apps/web/features/code/CloudCodePage.tsx:2587; no teleport text in apps/web/features

## GAP-F068-06-03

**Desktop continue needs the cloud switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Detail: Affects: Web, desktop. Work needed: Owner switch-on and live check.
- Evidence: apps/web/lib/e2b/gate.ts:20-28

## GAP-F068-06-04

**Links carry no plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Detail: Affects: VS Code. Work needed: Pass the plan if the cloud task has one.
- Evidence: apps/web/features/code/code-surface.ts:511-517

## GAP-F068-06-05

**Teleport imports goals and final messages only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Detail: Affects: CLI. Work needed: Decide if tool steps should come too.
- Evidence: apps/cli/src/cloud/code_teleport.rs:28-44

## GAP-F068-06-PARTLY

**Bring cloud results back and continue cloud work from desktop: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Requirement items: S68.15
- Detail: Web S68.15: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Desktop S68.15: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F068-07-01

**Phone side is switched off in v1, so no user can continue or start computer sessions from the phone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Detail: Affects: Mobile users. Work needed: Verify live against production relay and Desktop, then turn the flags on (owner decision; brief S68.24 note).
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app/(app)/companion/index.tsx:183

## GAP-F068-07-02

**Brief says the phone start screen is 'missing' but code has one; its behaviour is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Detail: Affects: Testers, planners. Work needed: Correct the brief row; run the start scenario on a device.
- Evidence: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:19-130

## GAP-F068-07-03

**No web client starts a session in a folder; web sends dispatch tasks only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Detail: Affects: Web users. Work needed: Add a folder-start client using code.session.start.
- Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:53,247

## GAP-F068-07-04

**No way to see which model or provider a phone-started session will use.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Detail: Affects: Mobile users; cost control. Work needed: Show the computer's current route before start.
- Evidence: service.ts:62-72 sends only rootId and text

## GAP-F068-07-05

**Command line host serves only its launch folder and only Managed sessions; others are refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Detail: Affects: Command line users on Local or own-key. Work needed: Decide whether Local and own-key sessions may ever be shared; today consent rules forbid silent routing (AGENTS.md section 6).
- Evidence: apps/cli/src/remote_control/host.rs:47,782-786

## GAP-F068-07-NOTBUILT

**Continue local work from the phone and start a task in an allowed folder: not built on Web, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, VS Code
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Requirement items: S68.24
- Detail: Web: S68.24; Mobile: S68.24; VS Code: S68.24

## GAP-F068-07-PARTLY

**Continue local work from the phone and start a task in an allowed folder: partly built on Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Requirement items: S68.24
- Detail: Desktop S68.24: The computer accepts a start-session request for a folder it has approved; the screen on the other client that sends it is not verified, and Remote Control is hidden in the first mobile release.

## GAP-F068-08-01

**Offline is a word, not an explanation, on web settings, web list and the command line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: Web, Desktop (hosted web) and command line users. Work needed: Add the explanation next to the status on every list.
- Evidence: LinkedDevicesPanel.tsx:49-53; devices.rs:64-73; explanation exists only at RemoteComputerPage.tsx:46 and apps/mobile/app/(app)/companion/code/[threadId].tsx:19-20

## GAP-F068-08-02

**Desktop always reports localModels false.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: All clients reading capabilities. Work needed: Report real local inference availability once Desktop hosts it (unknown today).
- Evidence: apps/desktop/electron/runtime/dispatcher.ts:2298

## GAP-F068-08-03

**Registry has no 'code sessions' capability; S68.21 asks for it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: All clients. Work needed: Extend the capability contract and each heartbeat.
- Evidence: apps/cli/src/cloud/devices.rs:7-18; packages/contracts/cloud-contracts/src/device-registry.ts

## GAP-F068-08-04

**Brief says command line 19, 20 and 25 are missing, but 'agi devices' lists name, platform, state and hosts; the offline explanation is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: Command line users, brief accuracy. Work needed: Update the brief; add the explanation.
- Evidence: apps/cli/src/lib.rs:1098-1104,3452-3464

## GAP-F068-08-05

**Different words for the same state (Sleeping, Asleep).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: Consistency. Work needed: One shared label table.
- Evidence: LinkedDevicesPanel.tsx:51; AccountComputersCard.tsx:22

## GAP-F068-08-06

**/code/computer hides a fetch failure behind the empty message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: Web users. Work needed: Add an error state.
- Evidence: RemoteComputerPage.tsx:149-151

## GAP-F068-08-07

**Phone card unreachable in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Detail: Affects: Mobile users. Work needed: Flag decision after live check.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16

## GAP-F068-08-NOTBUILT

**Your machines: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F068-08](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Requirement items: S68.19, S68.20, S68.25
- Detail: CLI: S68.19, S68.20, S68.25; VS Code: S68.19, S68.20, S68.25

## GAP-F068-09-01

**Live check of pairing after website deploy is owed; claim must return 200 not 503.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Run the live check and record it.
- Evidence: area brief S68.22 Unfinished

## GAP-F068-09-02

**Phone pairing screens are off in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: Affects: Mobile users. Work needed: Enable after live validation.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:12,16

## GAP-F068-09-03

**Claim route mislabels any relay 403 as another account; device_revoked is lost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: Affects: Phone and browser users with revoked devices. Work needed: Pass the relay's reason through.
- Evidence: claim/route.ts:134-146; services/signaling-server/src/index.ts:877,911

## GAP-F068-09-04

**Brief says command line has no pairing (22, 23 missing) and VS Code was listed done; code shows the command line hosts pairing and ends on device_revoked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: apps/cli/src/remote_control/mod.rs:241-281,510-520

## GAP-F068-09-05

**No evidence of a web button for 'stop-remote-work' on one device; the route exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Detail: Affects: Web users. Work needed: Confirm or add control.
- Evidence: devices/[deviceId]/route.ts:233-304 (UI not found)

## GAP-F068-09-PARTLY

**Pair and revoke a device: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F068-09](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Requirement items: S68.22
- Detail: Web S68.22: live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online | Desktop S68.22: live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online

## GAP-F068-10-01

**Reporting stops when Remote Control is off, so a person who never paired gets no alerts for local sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Detail: Affects: Desktop, command line, VS Code users. Work needed: Product decision on a separate alert switch.
- Evidence: codeSessionActivity.ts:34

## GAP-F068-10-02

**Brief says command line missing; code reports activity.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief; verify live.
- Evidence: apps/cli/src/remote_control/mod.rs:621-654

## GAP-F068-10-03

**Local-session pushes go to phones only (web false).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Detail: Affects: Web and desktop users. Work needed: Decide whether other clients should get them.
- Evidence: agent-notification-service.ts:405

## GAP-F068-10-04

**Preference read fails open.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Detail: Affects: Phone users. Work needed: Decide on fail-closed.
- Evidence: agent-notification-service.ts:79-84

## GAP-F068-10-05

**Phone tap lands on the notifications list while the Remote area is off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Detail: Affects: Mobile v1. Work needed: Open the session or explain.
- Evidence: apps/mobile/services/notifications.ts:414-418

## GAP-F068-11-01

**No export on web, Desktop or phone for coding sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Detail: Affects: Web, Desktop, Mobile users. Work needed: Add an export action to each code session screen.
- Evidence: area brief S68.27; no export code found in apps/web/features/code, apps/desktop/src, apps/mobile/src/features/cloud-code

## GAP-F068-11-02

**Export holds messages, model and token counts, not 'context' (files, environment, branch).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Detail: Affects: All exporting clients. Work needed: Define context fields and add them.
- Evidence: apps/cli/src/conversations.rs:237-262,362-400

## GAP-F068-11-03

**Brief says VS Code export is missing; code has it (Markdown only, no JSON).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Detail: Affects: Brief accuracy; VS Code users wanting JSON. Work needed: Correct the brief; decide on JSON.
- Evidence: ChatStateManager.ts:4070-4133; commandSetup.ts:1386

## GAP-F068-11-04

**Brief cites tui_app.rs:3887 and registry.rs:375 which are unrelated code; real locations differ.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Detail: Affects: Brief accuracy. Work needed: Fix the brief's code references.
- Evidence: apps/cli/src/tui/tui_app.rs:6033; apps/cli/src/repl/registry.rs:433-481

## GAP-F068-11-05

**No secret redaction found in the exported text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Detail: Affects: Command line and VS Code users who share exports. Work needed: Check and add redaction or a warning.
- Evidence: Not found in registry.rs or conversations.rs (absence)

## GAP-F068-11-NOTBUILT

**Export a session: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F068-11](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)
- Requirement items: S68.27
- Detail: Web: S68.27; Desktop: S68.27; Mobile: S68.27
