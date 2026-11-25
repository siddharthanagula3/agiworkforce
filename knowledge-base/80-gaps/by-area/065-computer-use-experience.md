---
id: "GAPS-AREA-065"
type: "gap-list"
title: "Gaps: Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 65. Computer-use experience

50 open gaps that touch this area. Area page: [20-features/065-computer-use-experience](../../20-features/065-computer-use-experience/README.md).

## CMP-C147

**Computer use: operate desktop apps by screen**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: The CLI cannot see or click the screen; the device registry reports computer use as false.
- Evidence: apps/cli/src/device_registry.rs:14,87; searched: computer use in apps/cli/src

## CMP-D27

**Computer use on Windows**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Computer use is Mac only: off Mac the app says controlling the mouse and keyboard is supported on macOS only.
- Evidence: apps/desktop/electron/runtime/computerUseService.ts:227-231

## CMP-D30

**Secure sign-in form and saved-card purchases for the agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: The browser agent leaves password and payment fields for you and always asks before purchases; there is no secure form or password manager hand-off.
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5; apps/desktop/electron/browser/commandGate.ts:249

## CMP-D32

**Computer History: opt-in activity timeline turned into memories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No computer history feature.
- Evidence: searched: computer history, activity timeline, screen history in apps/desktop/electron and apps/web/features/desktop-host

## CMP-D33

**Computer use blocked for trading and crypto apps**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: The refused-apps list starts empty and holds only what you add; no built-in block for finance apps.
- Evidence: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:50 (NO_REFUSED_APPS: None yet); searched: crypto, trading, brokerage in computerUse files

## CMP-D36

**Per-app permission tiers for computer use (view-only browsers, click-only terminals)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: An allowed app gets full mouse and keyboard control; there are no view-only or click-only levels for sensitive app types.
- Evidence: searched: tier, view-only, click-only in apps/desktop/electron/runtime, apps/web/features/desktop-host

## CMP-DP25

**Agent prefers a connector, then shell, then browser, then screen control**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: I found no rule that orders them with screen control last Connectors, the Chrome extension and screen control all exist, but I found no rule that orders them with screen control last.
- Evidence: searched: connector first, screen control last in apps/web/app/api/llm, apps/desktop/electron/runtime

## CMP-DP26

**Apple Messages send approval per chat (Allow once or Always allow)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No per-chat approval for sending messages in Messages Computer use has allowed and refused apps, but no per-chat approval for sending messages in Messages.
- Evidence: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:47

## CMP-DP29

**Custom rules and approval tiers for a personal agent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No free-text custom rules Three approval levels and per-tool Always allow, Needs approval or Blocked exist, but no free-text custom rules.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52

## CMP-DP35

**Send a task from the phone to run on the paired desktop (Dispatch)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread Desktop can pair a phone or a signed-in browser to send tasks to this computer; the phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread.
- Evidence: apps/web/features/desktop-host/components/RemoteControlSection.tsx:37; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:33

## CMP-DP36

**Stop shortcut that halts every agent from any app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: It does not halt every agent: stopAgents interrupts only local coding turns and takes the screen back (apps/desktop/ele… The always-on chord is real (packages/contracts/local-runtime/src/host-bridge.ts:167,178; apps/desktop/electron/garnishCore.ts:101-103) but it does not halt every agent: stopAgents interrupts only local coding turns and takes the screen back (apps/desktop/electron/main.ts:1771-1782). A hosted chat o
- Evidence: apps/desktop/electron/garnishCore.ts:101 ALWAYS_ON_SHORTCUTS; apps/desktop/electron/shortcuts.ts:140-169; apps/desktop/electron/main.ts:1783

## CMP-M78

**Take control of the cloud browser and hand back**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No take-over or hand-back of an agent browser.
- Evidence: searched: take over, take control, hand back in app, src

## CMP-MP53

**Website sign-in through a secure form unseen by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: A task can ask for input or open a link to finish in the browser, with no secure credential form A task can ask for input or open a link to finish in the browser, with no secure credential form.
- Evidence: apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx:60,428

## CMP-W170

**Take over a dot's cloud browser and hand control back**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md), [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Take over exists for local Code sessions only; no cloud browser to take over.
- Evidence: apps/web/features/code/local-code.ts:318; searched: takeOver in features/work, tasks

## CMP-WP124

**Send a task to your own computer and follow it from the browser (Dispatch, Remote)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Desktop is not yet released The Code page has Your computer: paste a pairing link from Desktop to send tasks; Desktop is not yet released.
- Evidence: apps/web/features/remote-dispatch/lib/browser-pairing.ts:3; apps/web/lib/surface-status.ts:8

## CMP-WP130

**Computer use started from the web**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: The device tools run only with the Desktop app, which is not yet released A Your computer page sends a task to a paired Desktop; the device tools run only with the Desktop app, which is not yet released.
- Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:40; apps/web/lib/surface-status.ts:8

## CMP-WP141

**Take control of the browser or computer, then hand back**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Only in the Desktop app and for your own computer, not on the web Computer use has Take over and Hand back, but only in the Desktop app and for your own computer, not on the web.
- Evidence: apps/web/features/desktop-host/components/ComputerUseControlBar.tsx; apps/web/content/support/computer-use.md:59

## CMP-X13

**Password manager sign-in (1Password) approved by biometrics**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No password manager sign-in; searched: 1password, passwordManager.
- Evidence: searched: 1password, passwordManager in apps/extension/src (only a sensitive-site label in approvalPolicy.ts)

## CMP-XP10

**Always asks before downloads, sensitive input and granting access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341) The row text is also wrong: these steps ask in every mode including Full access (apps/extension/src/features/computer-use/askBeforeActing.ts:36, crucialActions.ts:11-30), not only outside it. But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341)
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:11-28

## CMP-XP11

**Approval mode: skip all approvals**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Still asks for protected steps and never completes a purchase Full access skips routine confirmations but still asks for protected steps and never completes a purchase.
- Evidence: apps/extension/src/side_panel.ts:14785-14795; apps/extension/src/features/options/site-permission-policy.ts:12

## CMP-XP19

**Approval history in settings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Nothing in apps/extension/src writes browser decisions The list is not the extension's permission history. It fetches cloud tool approvals from /api/settings/approvals (apps/extension/src/features/options/approval-history-section.ts:196; hint text at 90 says tool requests in chats on every device). Nothing in apps/extension/src writes browser decisions
- Evidence: apps/extension/src/features/options/approval-history-section.ts:81-163

## CMP-XP20

**Approval mode: automatic with pauses for risky steps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: It does not run a model safety review Auto is the default and asks before crucial steps by fixed rules; it does not run a model safety review.
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:1-45; apps/extension/src/side_panel.ts:14773-14783

## CMP-XP24

**Notice shown when Auto or Full access is on**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: A dismissible notice appears for Full access only, not for Auto A dismissible notice appears for Full access only, not for Auto.
- Evidence: apps/extension/src/side_panel.ts:14909

## GAP-CAP-agent-actions-04

**Long-running work that continues when the device is off: On Web the first turn of every new cloud coding task was cancelled and no live progress showed (W-18).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.34, S65.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-05

**Choose where a task runs: Only Desktop offers the choice. The Web Your computer page needs a paired Desktop link; the phone cannot add a file to a computer session.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.07, S65.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-14

**Approval modes and per-tool permission levels: No notice when Auto is on in Chrome; no free-text standing rules; no per-chat approval for sending messages.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.19, S63.32, S65.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-16

**Take over and hand back the browser or screen: S64.23 and S64.24 are missing on every app including Chrome; the Chrome extension row is listed Same elsewhere. No take over for a cloud browser.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.23, S64.24, S65.21, S65.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-17

**Sign-in and human-check handoff: No secure sign-in form, no saved login with confirmation, no password manager.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.21, S64.22, S65.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-23

**Computer use in desktop apps with per-app permission: Windows computer use is missing; no native file-dialog support; window selection missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S65.01, S65.02, S65.03, S65.04, S65.06, S65.12, S65.13, S65.14, S65.15, S65.16, S65.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-24

**Computer use safety controls: Allowed apps get full mouse and keyboard control; the refuse list starts empty; the stop chord is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S65.05, S65.07, S65.09, S65.10, S65.18, S65.19, S65.20, S65.25, S65.26, S65.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-26

**Visible agent activity, replay and receipts: No live browser preview on Web, Mobile or Desktop; Chrome approval history shows cloud tool approvals, not extension permissions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.18, S64.19, S64.20, S65.25
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-27

**Send a task from phone or web to your own computer: Phone cannot attach a photo or file to a computer session; one pairing per phone; no sleep prevention while a phone is not connected.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S65.27, S65.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-F065-01-01

**Setup is a switch and status rows, not a guided flow**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Detail: Affects: Desktop users on a Mac. Work needed: Add a guided checklist that detects each permission and needed relaunch.
- Evidence: ComputerUseSettings.tsx:171-233 versus S65.01 Should

## GAP-F065-01-02

**No setup on Web outside Desktop or on CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Detail: Affects: Web and CLI users. Work needed: Decide whether those surfaces should show an explanation or hand off to Desktop.
- Evidence: Brief S65.01 web missing, cli missing; ComputerUseSettings.tsx:159

## GAP-F065-01-03

**Windows and Linux are unsupported**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Detail: Affects: Non-Mac desktop users. Work needed: Native input helper per platform, or hide the section.
- Evidence: computerUseService.ts:226-232

## GAP-F065-01-04

**Chrome and Desktop pairing setup is split across two sections**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Detail: Affects: Users of both. Work needed: Unify or link clearly.
- Evidence: ComputerUseSettings.tsx:198-212

## GAP-F065-01-05

**Free-plan behaviour unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Detail: Affects: Free users. Work needed: State and test what a Free user sees.
- Evidence: model-catalog.ts free tier lists no computer_use slot

## GAP-F065-01-NOTBUILT

**Turn on and permissions: not built on Web, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, CLI
- Features: [F065-01](../../20-features/065-computer-use-experience/F065-01-turn-on-and-permissions.md)
- Requirement items: S65.01, S65.02
- Detail: Web: S65.01, S65.02; CLI: S65.01

## GAP-F065-99-01

**No window selection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Desktop and web users. Work needed: Add a window target to capture and input steps.
- Evidence: Brief S65.05 missing on web and desktop; helper returns a windowId but steps take no window argument in dispatcher.ts:2555-2594

## GAP-F065-99-02

**No native file-dialog handling**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Desktop users. Work needed: Design and test open/save dialog flows, including secure prompts.
- Evidence: Brief S65.17; no dedicated code found

## GAP-F065-99-03

**No background operation on Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Desktop users, who lose their screen during a run. Work needed: Background-capable input or virtual display; Chrome background live check still owed.
- Evidence: Brief S65.18 desktop missing; run pauses when the user touches input (computerUseSession.ts:146-168)

## GAP-F065-99-04

**No authentication handoff on Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Desktop users. Work needed: A handoff tool like the Chrome ask_user_to_take_over.
- Evidence: Brief S65.24 desktop missing; macOS password prompts are refused with advice to answer them manually (computer-use.ts:58-62)

## GAP-F065-99-05

**No pointer or action overlay on Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Desktop users. Work needed: Overlay window drawn at the action point.
- Evidence: Brief S65.08 lists only chrome done; content.ts AGI_CU_SHOW_ACTION is extension only

## GAP-F065-99-06

**Web outside Desktop and CLI have no controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Web and CLI users. Work needed: Decide scope; at least explain and hand off to Desktop.
- Evidence: Brief web missing for most items; CLI missing for S65.14-S65.16

## GAP-F065-99-07

**Brief status for Chrome pause, take over, return control and drag looks out of date**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Planning accuracy. Work needed: Re-audit and update the brief; live-test.
- Evidence: computerUsePanel.ts:1224-1240; agentLoop.ts:710-725,1468

## GAP-F065-99-08

**Mobile remote dispatch needs live validation after relay redeploy**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Mobile users. Work needed: Run the live check named in the brief.
- Evidence: Brief S65.29 note

## GAP-F065-99-09

**Local mode behaviour is not defined in the code read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Users of Local and own-key modes. Work needed: State whether Local and own-key can use computer use and enforce consent for screenshots sent to a provider.
- Evidence: No local driver found; doc: docs/product/requirements.md:133

## GAP-F065-99-10

**Free plan treatment unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Affects: Free users. Work needed: Define and test the Free experience.
- Evidence: Catalog lists no computer_use slot for Free

## GAP-F065-99-NOTBUILT

**Other items in Computer-use experience: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S65.03, S65.04, S65.05, S65.06, S65.07, S65.08, S65.09, S65.10, S65.11, S65.12, S65.13, S65.14, S65.15, S65.16, S65.17, S65.18, S65.19, S65.20, S65.21, S65.22, S65.23, S65.24, S65.25, S65.26, S65.27, S65.28, S65.29
- Detail: Web: S65.03, S65.04, S65.05, S65.06, S65.07, S65.08, S65.09, S65.10, S65.11, S65.13, S65.14, S65.15, S65.16, S65.17, S65.18, S65.19, S65.20, S65.21, S65.22, S65.23, S65.24, S65.25, S65.26, S65.28; Desktop: S65.05, S65.18, S65.24; CLI: S65.03, S65.04, S65.05, S65.06, S65.07, S65.08, S65.09, S65.10, S65.11, S65.12, S65.13, S65.14, S65.15, S65.16, S65.17, S65.18, S65.19, S65.20, S65.21, S65.22, S65.23, S65.24, S65.25, S65.26, S65.27, S65.28, S65.29; VS Code: S65.03, S65.04, S65.05, S65.06, S65.07, S65.08, S65.09, S65.10, S65.11, S65.12, S65.13, S65.14, S65.15, S65.16, S65.17, S65.18, S65.19, S65.20, S65.21, S65.22, S65.23, S65.24, S65.25, S65.26, S65.27, S65.28, S65.29; Chrome: S65.16, S65.21, S65.22

## GAP-F065-99-PARTLY

**Other items in Computer-use experience: partly built on Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S65.18, S65.29
- Detail: Mobile S65.29: live check: phone Dispatch to Electron after the signaling server redeploy (dispatch.task.* and dispatch.task.reply in the relay allowlist). | Chrome S65.18: partials/privacy c46c84d983: switching tabs no longer cancels a run and steps no longer require the run tab to be active; the run enables CDP focus emulation. Live check (final pass): start a run, switch to another tab, and confirm Page.captureScreenshot and input keep working in the background tab.
