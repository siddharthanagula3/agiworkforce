---
id: "F057-04"
type: "feature"
title: "Browser and computer control"
aliases: ["Browser navigation", "Browser action", "Computer action", "Computer use", "device_browser_*", "device_click", "device_screenshot", "browser_navigate", "computer_stop", "Take over", "Hand back", "S57.13", "S57.14", "S57.15"]
area: "57 Tool catalog and invocation experience"
available_on: ["desktop", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "built", mobile: "missing", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.13", "S57.14", "S57.15"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "surface:desktop", "surface:chrome", "surface:cli", "surface:vscode", "surface:web", "surface:mobile", "mode:cloud", "mode:local", "file:packages/contracts/local-runtime/src/device-steps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-04 Browser and computer control

The assistant can drive the person's paired Chrome browser (open, click, type, read, screenshot) and, on Desktop, see and control the whole screen after the person grants it. CLI and VS Code can drive the browser through the CLI bridge; Chrome has its own steps. Web and Mobile cannot.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.13](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5713), [S57.14](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5714), [S57.15](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5715).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides browser steps (read page, navigate, click, type, screenshot, download, console, network) and screen steps (screenshot, zoom, move, click, drag, scroll, type, key, wait, open app). Browser steps go through the Chrome extension paired to the Desktop; screen steps use the desktop runtime. (packages/contracts/local-runtime/src/device-steps.ts:21-60, :214-262) (apps/desktop/electron/browser/browserSteps.ts:19, :75)

**Why it exists.** Many tasks live in web pages and apps with no API. Controlling them lets the assistant finish those tasks while the person stays able to stop it.

**Who uses it.** Desktop users, CLI and VS Code developers, Chrome extension users.

**Problems it solves**

- Repeating clicks and form entry
- Testing a web app by looking at its console and network
- Working in apps with no connector

**Use cases**

- Ask Desktop to open a page and read its text.
- Ask the assistant to fill a form in the signed-in browser.
- Ask it to open Notes and type a list on the Mac.
- Ask the CLI to check a page's console errors during a test.

## 2. User experience

**Where to find it**

- Desktop settings 'Computer use' with controls 'Stop', 'Take over', 'Hand back' (apps/web/features/desktop-host/components/ComputerUseSettings.tsx:54-56).
- Desktop banner 'AGI is using your computer' with Take over or Hand back and Stop buttons (apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:30-61).
- Chrome extension side panel: activity steps, 'awaiting device' steps with a Monitor icon (apps/extension/src/features/side-panel/bubbles.ts:1100-1111).
- CLI: browser_* tools in the terminal UI (apps/cli/src/platform/runtime/tool_catalog.rs:52-61). VS Code: tool rows.

**Before you start**

- Desktop: browser steps need the Chrome extension paired and the native host installed (apps/web/features/desktop-host/components/ComputerUseSettings.tsx:~93-104).
- Desktop: computer.use capability granted; the person is asked before each app is controlled (device-steps.ts:253-257).
- Screen steps need no folder but the session must allow them (packages/contracts/local-runtime/src/device-steps.ts:84-90).
- CLI: not Local privacy mode (apps/cli/src/features/exec/tools/mod.rs:725-737).

**Screens and controls**

- Stop ends screen control and withdraws permission.
- Take over pauses it; Hand back lets it continue.
- It also pauses when the person moves the pointer or types (ComputerUseControlBar.tsx:37-40).
- Per-app refusal list ('Refused for now', 'Ask again') (ComputerUseSettings.tsx:56-60).
- Review sentence for risky steps: the model sets 'review' when a step pays, sends, deletes or enters a password and the person is asked first (apps/web/lib/device-steps/device-tools.ts:56-62).

**Journey**

1. Person asks for a browser or computer task.
2. The model asks for device_screenshot first (screen) or device_browser_read_page (browser).
3. The step goes to the Desktop; the app asks permission when needed.
4. The step runs; a screenshot or page text returns to the model.
5. The model chooses the next step; the card list grows.
6. The person can take over or press Stop at any time.

**What the person sees and gets**

- Step cards, with screenshots for screen steps (apps/web/features/desktop-host/lib/device-steps.ts:50-60).
- Chrome side panel step list with elapsed time and 'outcome unverified' label for cancelled browser steps (apps/extension/src/features/side-panel/bubbles.ts:1114-1121).
- Blocked page results are withheld by workspace website rules (apps/desktop/electron/browser/browserSteps.ts:99-118).
- Audit event types browser_action and computer_use_action (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3504-3509).

**Settings**

- Computer use on or off, per-app refusals (ComputerUseSettings.tsx).
- Browser pairing section (apps/web/features/desktop-host/__tests__/BrowserPairingSection.test.tsx).
- Workspace web domain allow and deny rules sent as siteRules (tool-loop.ts:7685-7688).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop browser steps through the paired Chrome extension, with website rules checked before and after (apps/desktop/electron/browser/browserSteps.ts:57-118).
- Desktop screen steps with limits: coordinate 0 to 20,000, wait up to 10,000 ms, up to 3 click repeats, type up to 4,000 characters, scroll up to 5,000 (packages/contracts/local-runtime/src/device-steps.ts:386-392, :776-830).
- computer_stop is a host command in the contract and the dispatcher stops screen control (packages/contracts/local-runtime/src/device-steps.ts:321) (apps/desktop/electron/runtime/dispatcher.ts:2602-2603).
- Pause on user input, Take over, Hand back (apps/desktop/electron/runtime/dispatcher.ts:2604-2611).
- CLI has ten browser tools and a browser bridge with 60 second command timeout (apps/cli/src/platform/runtime/tool_catalog.rs:52-61) (apps/cli/src/browser_bridge.rs:25).
- Chrome extension runs browser steps itself and shows steps (apps/extension/src/features/side-panel/bubbles.ts:1100-1200).

**Incomplete**

- CLI and VS Code: browser done, computer action missing (brief S57.15).
- Draft claim 'screen-control grant needed before any click': the device grants capability computer.use and the dispatcher also asks per app (device-steps.ts:253-257).

**Present but disconnected or switched off**

- Browser steps need the Chrome pairing; without it the Desktop reports the Chrome not paired or unreachable state (ComputerUseSettings.tsx:~93-104).

**Not available**

- Web (plain browser) and Mobile: no browser or computer tools; header declaration not believed from those surfaces (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3706-3711).
- Computer action on CLI, VS Code, Chrome, Web, Mobile (brief S57.15).

## 4. Required behaviour

**Established requirements**

- A tool opens a URL in a real browser tab it controls (S57.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.13)
- Tools click, type or read in a real browser page (S57.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.14)
- Tools see the screen and move, click and type on the user's computer (S57.15), done only on Desktop. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.15)
- A device tool can never reach further than the same action from the desktop UI. (source: packages/contracts/local-runtime/src/device-steps.ts:21-28)
- Computer use is experimental and present on Desktop and CLI-less rows only; Web, Mobile absent. (source: doc: docs/product/surface-feature-matrix.md line 102)

**Acceptance criteria**

1. With no Chrome pairing, a browser step is not carried out and the person sees the pairing state.
2. A click with a coordinate over 20,000 is refused.
3. Type text over 4,000 characters is refused.
4. A wait of 11,000 ms is refused or clamped.
5. Pressing Stop ends screen control and the next screen step is refused.
6. Moving the mouse during control pauses it.
7. A navigate to a blocked site (workspace rule) is withheld.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 'up to 3 click repeats' means count 1 to 3 [inferred from device-steps.ts:781].
- Brief draft says click repeats up to 3; code range is 1 to 3.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document the pairing step in the Desktop first run.
- [proposed] Say on Web and Mobile that browser control needs the Desktop app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | Tool names, scope, limits, computer_stop. |
| service | device tool builder | `apps/web/lib/device-steps/device-tools.ts` | JSON schemas for browser and screen tools; review field. |
| service | web side step executor | `apps/web/features/desktop-host/lib/device-steps.ts` | Sends steps to the desktop, shapes screenshots. |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Plans device calls, audit, egress review (3411-3560, 7660-7800). |
| service | desktop browser steps | `apps/desktop/electron/browser/browserSteps.ts` | Runs browser commands via the bridge with site rules. |
| service | desktop bridge server | `apps/desktop/electron/browser/bridgeServer.ts` | Link to the Chrome extension. |
| service | desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Capability prompts (1086-1112), computer_stop (2602). |
| service | computer use service | `apps/desktop/electron/runtime/computerUseService.ts` | Screen actions. |
| service | computer use session | `apps/desktop/electron/runtime/computerUseSession.ts` | Session state, pause and hand back. |
| component | ComputerUseControlBar | `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx` | Banner with Take over, Hand back, Stop. |
| component | ComputerUseSettings | `apps/web/features/desktop-host/components/ComputerUseSettings.tsx` | Settings, per-app refusals, Chrome pairing note. |
| service | desktop host runtime client | `apps/web/features/desktop-host/lib/runtime-client.ts` | Calls computer_stop. |
| service | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Ten browser tools and Local mode blocking. |
| service | CLI browser bridge | `apps/cli/src/browser_bridge.rs` | 60 second command timeout. |
| service | Chrome cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Chrome extension browser agent talking to the cloud. |
| component | Chrome side panel bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Activity steps and awaiting-device state. |
| service | VS Code chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Tool events from the CLI runtime (6673-6701). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Desktop declares its granted capabilities; the server offers only those tools. | device and our servers | packages/contracts/local-runtime/src/device-steps.ts:562-571 |
| The model calls a device tool; the server validates arguments against limits and plans the step; risky steps get a review sentence. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7660-7700; device-steps.ts:745-830 |
| The turn pauses and sends x_device_step_request to the app. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1344-1348 |
| The app asks the desktop runtime, which prompts the person where required and runs the step. | device | apps/web/features/desktop-host/lib/device-steps.ts:427; dispatcher.ts:1086-1112 |
| Browser steps go to the paired Chrome extension, whose reported address is checked against workspace rules. | device | apps/desktop/electron/browser/browserSteps.ts:57-118 |
| The result (text or a screenshot, up to 24,000 characters of text) returns and the turn resumes. | device and our servers | device-steps.ts:427 |
| An audit event records the tool and its status (not content). | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3504-3545 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Screenshots and page text returned to the model | the turn and transcript | with the conversation | unknown |
| Audit event (tool name, status, duration) | audit events | server | unknown |
| Chrome pairing | desktop pairingStore | no | until unpaired (apps/desktop/electron/browser/pairingStore.ts) |

**Models and providers.** The step schemas are plain function tools, so any tool-capable model can use them. Screen steps send screenshots to the model, so the model must accept images [inferred]. Computer use and browser use are an AGI harness, not an intrinsic model ability (AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop steps ride a cloud turn so a signed-in account is required; the CLI runs on the device. |
| Permissions | capability computer.use for screen steps and browser.site or browser.cdp for browser steps; each step may prompt; per-app consent; Stop withdraws permission (device-steps.ts:253-262; ComputerUseSettings.tsx:70-72). |
| Subscription | none found in the code for device steps. Platform capability rows: Desktop true for browser and desktop automation, Web false (packages/contracts/types/src/capabilities.ts:36-40, :70-73). |
| Limits and metering | Limits in device-steps.ts:386-392; CLI 60 s per command (browser_bridge.rs:25). Metering: none found. |
| Feature flags | Computer use is marked experimental (docs/product/surface-feature-matrix.md:102). Runtime switch set through computer_use_set_enabled (dispatcher.ts:2613). |
| Model compatibility | Tool-capable model; image input for screenshots [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | CLI Local privacy mode refuses browser tools (apps/cli/src/features/exec/tools/mod.rs:725-737). Desktop with an on-device model: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Chrome not paired or unreachable | Settings shows 'unreachable' or 'not paired' notes. | apps/web/features/desktop-host/components/ComputerUseSettings.tsx:93-104 |
| User moves mouse | Control pauses; Hand back resumes. | apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:37-40 |
| Blocked page | Result withheld and a tab that moved goes back. | apps/desktop/electron/browser/browserSteps.ts:99-118 |
| Refused argument | DeviceStepRefused message returned to the model. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7689-7694 |
| Unattended run with private data and untrusted content | Egress steps get a review or are denied. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3430-3440, :7680-7686 |
| Cancelled browser step in Chrome | Shows 'outcome unverified' label. | apps/extension/src/features/side-panel/bubbles.ts:1114-1121 |
| Offline or bridge down | not handled in a way I could read beyond the pairing note (unknown). | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/local-runtime/src/__tests__/device-steps.test.ts`: Argument limits and offers.
- `apps/desktop/electron/__tests__/browserSteps.test.ts`: Browser step rules.
- `apps/desktop/electron/__tests__/computerUseSteps.test.ts`: Screen steps.
- `apps/desktop/electron/__tests__/computerUseSession.test.ts`: Session, pause, hand back.
- `apps/desktop/electron/__tests__/computerUseLoop.test.ts`: Control loop.
- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Settings screen.
- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.stop.test.tsx`: Stop in the browser tools dialog.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.device-step.test.ts`: Device step handoff.
- `apps/web/lib/device-steps/__tests__/device-tools.test.ts`: Tool schemas.

**Test scenarios**

- **Navigate and read**
  1. Pair Chrome with Desktop.
  2. Ask to open a site and summarise it.
  - Expected: Navigate and read cards; summary of visible text.
- **Stop**
  1. Start a computer task.
  2. Press Stop.
  - Expected: Control ends; the banner disappears; later screen steps are refused.
- **Take over**
  1. Move the mouse during a run.
  - Expected: Paused; Hand back resumes.
- **Blocked site**
  1. Set a deny rule for a site.
  2. Ask to open it.
  - Expected: Refused or result withheld.
- **Web has none**
  1. Ask Web (plain browser) to click something.
  - Expected: No device tool is offered; the model says it cannot.

**Where to look when it fails**

- Audit events browser_action and computer_use_action.
- Desktop dialogs with reason text COMPUTER_USE_REASON (dispatcher.ts:1086).
- Pairing state fields bridgeListening, hostInstalled, paired, connected (ComputerUseSettings.tsx:93-104).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **No computer action on CLI, VS Code, Chrome, Web or Mobile.** Affects: those apps. Evidence: brief S57.15. Work needed: Decide whether any should offer it.
- **Browser control depends on Chrome pairing, which the draft did not mention.** Affects: Desktop users. Evidence: apps/desktop/electron/browser/browserSteps.ts:19, :75. Work needed: Explain in onboarding.
- **Brief cites dispatcher.ts:837 and :1072; these lines are not the cited code any more.** Affects: Documentation. Evidence: dispatcher.ts:1086-1112, :2602. Work needed: Update the brief.
- **Web has no browser tools (missing).** Affects: Web. Evidence: brief S57.13/S57.14. Work needed: Product decision (cloud browser is a different boundary).
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- surface:desktop
- surface:chrome
- surface:cli
- surface:vscode
- surface:web
- surface:mobile
- mode:cloud
- mode:local
- file:packages/contracts/local-runtime/src/device-steps.ts

## Unknown

- Per-step timeout while waiting for the desktop.
- Screenshot retention.
- Whether VS Code shows the pairing state.
- What the Chrome extension does when the cloud agent is offline.
- Whether computer_stop is exposed in the CLI.
