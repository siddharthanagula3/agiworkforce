---
id: "F064-10"
type: "feature"
title: "Hand off sign-in, human checks and takeover"
aliases: ["Login handoff", "Human verification handoff", "Take over", "Return control to agent", "ask_user_to_take_over", "Take over button", "Continue", "Your turn"]
area: "64 Browser-assistant experience"
available_on: ["chrome"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S64.21", "S64.22", "S64.23", "S64.24"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-authentication-and-identity", "F064-08", "F064-09", "F064-12", "file:apps/extension/src/features/computer-use/agentLoop.ts", "file:apps/extension/src/background.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-10 Hand off sign-in, human checks and takeover

When a page needs a sign-in, a CAPTCHA or a password or card, the Chrome assistant hands the page to the person and waits. The person can also press Take over at any time, and Continue hands the page back. A handed-over run ends after fifteen minutes. Only Chrome has this; Desktop, CLI and VS Code have no browser handoff.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.21](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6421), [S64.22](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6422), [S64.23](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6423), [S64.24](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6424).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pauses a Chrome browser task so the person can use the page themselves (sign in, solve a check, enter a password or card), then resumes the same task with the new page state.

**Why it exists.** The assistant must never solve human checks or handle credentials and payments. The handoff keeps those with the person without losing the task.

**Who uses it.** Chrome extension users running a browser task on a site that needs a login or a check.

**Problems it solves**

- Sites that block automation with a CAPTCHA.
- Credentials and card numbers passing through a model.
- A person who wants to step in without ending the whole task.

**Use cases**

- The assistant reaches a sign-in page, calls ask_user_to_take_over, the person signs in, presses Continue, the task goes on.
- The person sees the assistant about to do something wrong and presses Take over on the page dock.
- The person starts clicking on the page; the assistant stops acting automatically and waits.
- A purchase step is reached; the assistant hands over so the person checks the amount and pays.

## 2. User experience

**Where to find it**

- Chrome side panel: buttons 'Take over' (visible while a run is active and not paused) and 'Continue' (visible while paused), banner titled 'Your turn' (apps/extension/src/features/side-panel/computerUsePanel.ts:1220-1240, 1313-1320, 796-805).
- Chrome page dock: 'Take over' beside 'Stop' (apps/extension/src/features/content/browserRunOverlay.ts:55).

**Before you start**

- A running Chrome browser task owned by the current panel and tab.
- Not an unattended run: an unattended run reports the step as unfinished instead (apps/extension/src/features/computer-use/agentLoop.ts:1481-1486).

**Screens and controls**

- 'Take over' button with tooltip naming the time limit (computerUsePanel.ts:1223-1227).
- 'Continue' button with tooltip 'Hand the page back so AGI continues the task' (computerUsePanel.ts:1230-1234).
- Handoff banner text: '<reason> Choose Continue when you are done.' (computerUsePanel.ts:1330-1338).
- Dock button shows 'You have the page.' while paused and the pointer and glow are hidden (browserRunOverlay.ts:118-123).

**Journey**

1. The model calls ask_user_to_take_over with a one-sentence reason, or the person presses Take over, or the person types or clicks on the task tab.
2. The background creates a takeover, starts a fifteen-minute timer, watches user input on the tab and broadcasts a paused state with the reason (apps/extension/src/background.ts:1053-1085).
3. The panel shows the banner, switches Take over to Continue and focuses Continue.
4. The person signs in or solves the check on the page.
5. The person presses Continue.
6. The background re-reads the tab URL, re-checks that the site is still approved and consented, commits the new page as the intended page, activates the tab and resumes (apps/extension/src/background.ts:7088-7146).
7. The model receives 'The user handed the page back...' with a fresh page reading (apps/extension/src/features/computer-use/agentLoop.ts:1488-1496).

**What the person sees and gets**

- Banner 'Your turn' with the reason and the sentence 'If the page is not handed back within 15 minutes, the task ends.' (apps/extension/_locales/en/messages.json cuTakeoverLimit).
- 'You have the page.' when the person pressed Take over; 'You started using the page, so AGI stopped acting on it.' when input was detected (messages.json cuTakeoverByUserReason, cuTakeoverByInputReason).
- If time runs out: 'The page was not handed back within 15 minutes, so the task ended and AGI let go of the tab. Start the task again to continue.' (computerUsePanel.ts:826).
- If handing back fails: 'AGI could not take the page back. Try Continue again, or use Stop.' (computerUsePanel.ts:1355-1358).

**Settings**

- none found in the code for the handoff itself; the time limit is a constant (runOwnership.ts:17).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome tool ask_user_to_take_over is defined and described for sign-in, CAPTCHA, password and card entry (apps/extension/src/features/computer-use/browserToolDefinitions.ts:49-68).
- The agent loop waits for the person: handToUser calls requestTakeover and then re-reads the page (apps/extension/src/features/computer-use/agentLoop.ts:1476-1496).
- While taken over, other tool calls are skipped with 'Not done: the user took over the page.' (agentLoop.ts:1553-1565).
- The system prompt tells the model never to solve a CAPTCHA or guess a credential and to hand over for purchases (agentLoop.ts:1129-1137).
- Manual Take over from the panel and from the page dock, and automatic takeover when the person clicks or types on the task tab more than 750 ms after the last agent action (apps/extension/src/background.ts:1014, 7005-7024, 7088-7102).
- Fifteen-minute limit ends the run with the takeover_expired reason (runOwnership.ts:17-18; background.ts:1053-1064).
- Resume re-checks site approval and consent and cancels with site_access_withdrawn if they are gone (background.ts:7118-7135).
- The brief marks Take over and Return control as 'missing' for Chrome; the code has both, so the brief is out of date.

**Incomplete**

- The takeover applies to the run's single task tab; handoff on other task tabs was not found (background.ts uses lease.tabId).
- No tests were found that name the takeover flow end to end; 'takeover' appears in computer-use-stop-ui.test.ts, composer-browser-task.test.ts, browser-control-contract.test.ts and background-security-guards.test.ts only by text search [not opened].

**Present but disconnected or switched off**

- In unattended runs the handoff is switched off and replaced by 'This step needs a person...' (agentLoop.ts:1481-1486).

**Not available**

- Desktop: computer takeover exists for screen control only (apps/desktop/electron/runtime/dispatcher.ts:2604-2606); the paired-browser path and the pane have no handoff; 'Sign in' in Desktop (browserSignIn.ts) signs the person into AGI itself, not into a site.
- Web, Mobile, CLI, VS Code: none found.

## 4. Required behaviour

**Established requirements**

- When a site needs the user to sign in, the assistant pauses, lets them sign in, then continues. (source: brief S64.21)
- When a site shows a CAPTCHA or human check, the assistant hands it to the user and resumes after. (source: brief S64.22)
- The user takes over the browser mid-task without ending the assistant's run. (source: brief S64.23)
- After taking over, the user hands control back and the assistant continues the same task. (source: brief S64.24)
- Browser and computer use needs a manual takeover path. (source: doc: docs/product/requirements.md (section 21.4))

**Acceptance criteria**

1. On a sign-in page the assistant calls ask_user_to_take_over instead of typing a credential.
2. While paused the Take over button is hidden and Continue is shown.
3. The assistant takes no action while the person has the page.
4. After Continue the next model turn includes a fresh reading of the page.
5. If nothing is handed back for 15 minutes the run ends with the takeover_expired sentence.
6. Clicking on the task tab by hand pauses the assistant and shows 'You started using the page'.
7. If the site was removed from approved sites during the takeover, Continue ends the run instead of resuming.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'missing' for S64.23 and S64.24 on Chrome is outdated because the code and locale strings exist [inferred from the code].
- Handoff on Desktop and CLI would need a visible place for the person to act, which the paired Chrome tab already is [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer ask_user_to_take_over on the paired-browser path so Desktop chat and the CLI can hand a login to the person.
- [proposed] Make the limit configurable instead of a constant.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | ask_user_to_take_over tool | `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Defines the tool and its description. |
| service | Agent loop handoff | `apps/extension/src/features/computer-use/agentLoop.ts` | handToUser (1476), skip while taken over (1553), prompt text (1129). |
| service | Run ownership | `apps/extension/src/features/computer-use/runOwnership.ts` | USER_TAKEOVER_MAX_MS, beginTakeover, endTakeover, takeover_expired reason. |
| service | Background takeover control | `apps/extension/src/background.ts` | handComputerUseTabToUser (1066), time limit (1053), AGI_CU_USER_INPUT (6993), PAUSE/RESUME (7088). |
| component | Computer use panel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Take over and Continue buttons, banner, expiry copy. |
| component | Run overlay | `apps/extension/src/features/content/browserRunOverlay.ts` | Dock Take over button and paused state. |
| service | User input watch | `apps/extension/src/features/computer-use/inputWatch.ts` | Detects the person's input on the task tab (name; contents not opened). |
| config | Locale strings | `apps/extension/_locales/en/messages.json` | cuTakeoverByUserReason, cuTakeoverByInputReason, cuTakeoverLimit, spBrowserTakeOver. |
| service | Browser control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Consent re-checked on resume. |
| service | Approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Protected-field and purchase refusals that lead to handoff. |
| service | Desktop computer-use takeover | `apps/desktop/electron/runtime/dispatcher.ts` | computer_take_over and computer_hand_back for screen control only (2604-2606). |
| service | Desktop sign-in | `apps/desktop/electron/browserSignIn.ts` | Signs the person into AGI through their browser; not a site handoff. |
| test | Run ownership test | `apps/extension/__tests__/computer-use-run-ownership.test.ts` | Ownership and cancellation. |
| test | Stop UI test | `apps/extension/__tests__/computer-use-stop-ui.test.ts` | Stop lifecycle; mentions takeover by text search. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model calls ask_user_to_take_over (or the person presses Take over, or the person's own click or key is detected). | device and our servers | agentLoop.ts:1521-1545; background.ts:7005-7024, 7088-7102 |
| The background begins a takeover, sets a 15-minute timer, starts watching input and broadcasts the paused state. | device | background.ts:1053-1085 |
| The agent loop waits until the person hands back or the run is cancelled; the model call is not made in between. | device | agentLoop.ts:1130-1140, 1476-1496 |
| The person acts on the real page; the extension does not read or relay what they type. | device | agentLoop.ts:1553-1565 skips tools; no code forwards input text [inferred] |
| On Continue the background re-reads the tab URL, re-checks approved site and consent, commits the new page intent and resumes. | device | background.ts:7104-7146 |
| The loop reads the page again and sends it to AGI Cloud as the tool result. | device and our servers | agentLoop.ts:1488-1496 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Takeover state (reason, handBack function) | the run lease in the background worker memory | no | dropped when the run ends (runOwnership.ts:41-44) |
| Page reading after sign-in | sent to AGI Cloud as model context | yes, as part of the model call | not traced |

**Models and providers.** The model only decides when to hand over (a tool call). The wait and the return are model independent. Credentials typed by the person go to the site, not to the model, but the page reading after handback is sent to AGI Cloud; the extension runs a content check for injection on it (agentLoop.ts:285-299).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI Cloud account for the run (agentLoop.ts:268-281). |
| Permissions | Takeover messages are accepted only from the run's own panel (runId match) or its tab's top frame (background.ts:6996-7003, 7092-7098). Resume needs the site still approved and consented (background.ts:7118-7135). |
| Subscription | none found in the code for the handoff. |
| Limits and metering | 15 minutes per takeover (runOwnership.ts:17). |
| Feature flags | none found in the code |
| Model compatibility | The model must call tools; same requirement as the rest of the Chrome agent (cloudAgentClient.ts:96-101). |
| Provider restrictions | none found for the handoff. |
| Local mode | No Local or own-key path for the Chrome agent; the handoff is part of that cloud-model run. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Paused | Take over hidden, Continue shown and focused; banner shown; overlay pointer hidden. | computerUsePanel.ts:1313-1337; browserRunOverlay.ts:118-123 |
| Timeout | Run cancelled with takeover_expired and a restart message. | background.ts:1053-1064; computerUsePanel.ts:826 |
| Handback fails | Banner 'AGI could not take the page back...'; buttons re-enabled. | computerUsePanel.ts:1338-1359 |
| Run replaced or ended while paused | Resume returns running false when the lease is not current. | background.ts:7116-7117, 7127-7129 |
| Site withdrawn during takeover | Resume cancels with site_access_withdrawn. | background.ts:7130-7135 |
| Unattended run | No handoff; step reported unfinished. | agentLoop.ts:1481-1486 |
| Nobody watching | 'Nobody is watching this run, so the page cannot be handed over. Stop and say what the user must do.' | agentLoop.ts:1473-1474 |
| Accessibility | Continue is focused when paused; dock has role group and a label; minimum touch size on coarse pointers. | computerUsePanel.ts:1337; browserRunOverlay.ts:42-43, 30 |
| Offline | not handled in the code beyond the 15-minute limit. | searched background.ts takeover paths |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/computer-use-run-ownership.test.ts`: Run ownership and cancellation, which the takeover relies on.
- `apps/extension/__tests__/computer-use-stop-ui.test.ts`: Panel run lifecycle; text search shows it mentions takeover (not opened in detail).
- `apps/extension/__tests__/composer-browser-task.test.ts`: Browser task from the composer; mentions takeover by text search (not opened).
- `apps/extension/__tests__/background-security-guards.test.ts`: Background guards; mentions takeover by text search (not opened).
- `apps/extension/__tests__/browser-control-contract.test.ts`: Tool list and element addressing; mentions takeover by text search (not opened).

**Test scenarios**

- **Sign-in handoff**
  1. Start a task that needs a login on an approved site.
  2. Wait for the 'Your turn' banner.
  3. Sign in on the page.
  4. Press Continue.
  - Expected: The assistant resumes with the signed-in page and no credential appears in the step log.
- **Manual take over**
  1. Start a task.
  2. Press Take over on the dock.
  - Expected: Dock reads 'You have the page.', panel shows Continue; the assistant makes no more calls until Continue.
- **Detected input**
  1. Start a task.
  2. Click on the task tab by hand between agent actions.
  - Expected: Run pauses with 'You started using the page, so AGI stopped acting on it.'
- **Takeover expiry**
  1. Take over and leave for 15 minutes.
  - Expected: Run ends with the takeover_expired message and the tab is let go.
- **Withdrawn site**
  1. Take over.
  2. Remove the site from approved sites.
  3. Press Continue.
  - Expected: Run ends with the site-access-withdrawn message.
- **Unattended**
  1. Start an unattended task on a login page.
  - Expected: The model reports the step as unfinished; no pause appears.

**Where to look when it fails**

- AGI_CU_STATE messages with status paused or stopped and reason.
- Cancellation reason takeover_expired (runOwnership.ts:12).
- Error text 'AGI could not hand you the page. Use Stop to end the run.' (computerUsePanel.ts:1352-1354).

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No handoff on Desktop (browser), Web, Mobile, CLI or VS Code.** Affects: All apps but Chrome. Evidence: brief S64.21-S64.24 (missing); dispatcher.ts:2604-2606 is screen control only. Work needed: Add a handoff to the paired-browser tools or document that Chrome is the only supported surface.
- **The brief lists Take over and Return control as missing for Chrome, though both are in the code.** Affects: Knowledge base accuracy. Evidence: background.ts:7088-7146; browserRunOverlay.ts:55. Work needed: Update the brief.
- **Fixed 15-minute limit.** Affects: Chrome users with long checks. Evidence: runOwnership.ts:17. Work needed: Decide if configurable.
- **No test found that exercises the whole sign-in handoff.** Affects: Chrome. Evidence: test names seen only by text search. Work needed: Write an end-to-end handoff test.
- Not built on: Web, Desktop, Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:chrome
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-authentication-and-identity
- F064-08
- F064-09
- F064-12
- file:apps/extension/src/features/computer-use/agentLoop.ts
- file:apps/extension/src/background.ts

## Unknown

- Whether any test covers handback end to end was not established (only text-search hits).
- Contents of inputWatch.ts and the content script input detector were not read.
- Whether handoff works on multi-tab task runs was not established.
- Whether the extension keeps the paused page reading anywhere beyond the model call.
- Whether the handoff copy is localized beyond English was not checked.
