---
id: "F013-02"
type: "feature"
title: "Send and Stop buttons"
aliases: ["Send button", "Stop button", "Send and Stop", "Send message", "Stop generation", "Stop the current response", "Stop generating", "S13.06", "S13.07"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.06", "S13.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F013-01", "F013-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-02 Send and Stop buttons

A visible round button sends the message. While a reply is running the same slot turns into Stop on web, mobile and Chrome; VS Code shows a separate Stop button beside a Queue or Steer send; the CLI uses Esc or Ctrl-C. Send is disabled when blocked. The web holds a message that looks like it contains a key or password once.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.06](../../10-requirements/capabilities/013-composer-text-interaction.md#s1306), [S13.07](../../10-requirements/capabilities/013-composer-text-interaction.md#s1307).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Submits the composed message and ends a running reply on demand. The control shows Send, a busy spinner, or Stop according to the turn state, and is disabled when sending is blocked.

**Why it exists.** A person needs a clear way to send and a clear way to stop a long or wrong reply. The requirements ask for send and stop controls on every composer (doc: docs/product/requirements.md section 6.1, section 10.7: Send when idle, stop while running).

**Who uses it.** Every person on all six apps.

**Problems it solves**

- Stopping a long reply saves cost and time.
- Sending an unsupported mix (attachment and tool) is prevented instead of failing later.
- Pasting a credential into a chat by mistake is caught once on web.

**Use cases**

- Click the arrow to send; click the square to stop a reply that is going the wrong way.
- Press Escape in the web composer to stop when no menu is open.
- See the send arrow greyed out while offline.
- Send a message that contains an API key: the web holds it with a warning; send again to continue.

## 2. User experience

**Where to find it**

- Web and Desktop: round button at the right end of the composer, labelled 'Send message' or 'Stop the current response' (apps/web/features/chat/components/Composer/SendButton.tsx:49-50, :95-96).
- Mobile: round button in the composer, labelled 'Send message', 'Stop generating' or 'Queued' (apps/mobile/src/features/chat/components/SendButton.tsx:53).
- CLI: no button; footer hint '… working, Esc or Ctrl-C to cancel' (apps/cli/src/tui/tui_app.rs:2074).
- VS Code: 'Send' button and a separate 'Stop response' button (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3365-3366).
- Chrome: round button 'sp-send-btn' that swaps between send, stopping and stop (apps/extension/src/side_panel.ts:9894-9930).

**Before you start**

- Something to send: text or an attachment (SendButton.tsx:81 hasContent).
- Web: online, no attachment conflict, no usage block (ChatComposerNew.tsx:6962-6975).
- Chrome: signed-in managed cloud chat ready (side_panel.ts:9945).

**Screens and controls**

- Web: SendButton in send and stop modes, and a queue mode the composer does not use (SendButton.tsx:5); an optional 'Queued' chip when follow-ups wait (SendButton.tsx:111-118).
- Web: voice-entry button replaces Send when the box is empty and voice is available (ChatComposerNew.tsx:6951-6957).
- Mobile: send, stop square, queue clock, plus a voice button when empty (ChatInput.tsx:2269-2314).
- VS Code: Send label changes to 'Queue' or 'Steer' while a turn runs (webviewContent.ts:5101-5120).
- Chrome: Escape is not bound; Enter queues while streaming (side_panel.ts:9899).

**Journey**

1. 1. Type a message or attach a file; the Send arrow becomes active.
2. 2. Click Send (or press Enter). The button shows a spinner while the send is pending (SendButton.tsx:98).
3. 3. While the reply streams the slot shows Stop.
4. 4. Click Stop (or press Escape on web). The reply ends.
5. 5. The slot returns to Send or the voice button.

**What the person sees and gets**

- Disabled Send exposes a reason to screen readers only (SendButton.tsx:101, class sr-only).
- Offline: a visible notice 'You are offline. Your draft is saved here and can be sent after you reconnect.' appears on a send attempt (ChatComposerNew.tsx:3588-3590).
- Secret hold-back notice: 'This message looks like it contains an API key or credential. Send again to continue, or edit it first.' (ChatComposerNew.tsx:3660-3664).
- Chrome: Stop shows a stopping spinner state and then clears (side_panel.ts:9903-9908).
- VS Code Stop shows 'Stopping…' (webviewContent.ts:5866-5871).

**Settings**

- VS Code: agiWorkforce.composer.escapeStops (default off) lets Escape stop the reply (apps/extension-vscode/package.json:1264; webviewContent.ts:5939).
- VS Code: the follow-up behaviour setting (queue or steer) decides what Send does mid-turn; see F013-03 for keys.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: sendButtonMode is 'stop' while a turn is active, otherwise 'send' (ChatComposerNew.tsx:4764); click calls handleStop or handleSubmit (:6977).
- Web Stop path: handleStop calls onStop (:3443); WebChatPage supplies handleStopGeneration (apps/web/features/chat/pages/WebChatPage.tsx:4336) which cancels image generation or calls stopGeneration (apps/web/lib/hooks/useChatStream.ts:5391): it aborts the request, records the event 'generation_stopped', stops streaming and, for a managed cloud run, asks the server to cancel and warns if it is not confirmed.
- Web Escape: stops the turn when no menu is open and the box is not expanded (ChatComposerNew.tsx:4665-4678).
- Web disabled reasons: offline, usage block, trial exhausted, unavailable, media model unavailable, attachment conflict, local project conflict, search allowance checking or exhausted, tool conflict (ChatComposerNew.tsx:708-718, :4805-4830).
- Web secret hold-back: first send of text matched by containsSecrets is held; the acknowledged flag lets the next send go; it resets for a new draft (ChatComposerNew.tsx:882, :2161, :3660).
- Mobile: states idle, streaming, queued (SendButton.tsx:7); Stop calls onStop when streaming (ChatInput.tsx:1591-1597); send disabled with no content or usage block unless streaming (ChatInput.tsx:2314).
- CLI: Esc or Ctrl-C during a turn cancels it; partial output is kept and committed, session history is reconciled (tui_app.rs:8446-8453, :8713-8721).
- Chrome: Stop calls cancelCurrentManagedStream(true), which keeps partial output and marks the message interrupted (side_panel.ts:14598-14601, :7584, :7615-7625).
- VS Code: Stop posts a 'cancel' message to the extension (webviewContent.ts:5866-5871).

**Incomplete**

- Web SendButton has a 'queue' mode, but the composer only ever passes 'send' or 'stop' (ChatComposerNew.tsx:4764), so the clock icon is not reachable from it.
- Mobile Stop: whether partial text is kept is not established in the code read.
- Secret hold-back exists only in the web composer: containsSecrets is imported only in ChatComposerNew.tsx and apps/web/lib/security/secrets-audit.ts (search of apps and packages).

**Present but disconnected or switched off**

- VS Code Escape-to-stop is off by default (apps/extension-vscode/package.json:1264).

**Not available**

- CLI has no clickable button (terminal only).
- VS Code and Chrome have no secret hold-back; mobile and CLI: none found.

## 4. Required behaviour

**Established requirements**

- A visible send button submits the composed message and is disabled with a reason when sending is blocked (S13.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.06)
- While a reply is generating, a stop control ends it and keeps what was produced (S13.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.07)
- Send/stop control is part of the universal composer; mobile: Send when idle, stop while running. (source: doc: docs/product/requirements.md (section 6.1, section 10.7))
- Prevent duplicate sends; explain incompatible attachments or unavailable capabilities and offer a compatible alternative. (source: doc: docs/product/competitive-guidance.md (section 5.3, item 24))

**Acceptance criteria**

1. Web: with text typed, the button reads 'Send message'; during a reply it reads 'Stop the current response'.
2. Web: with the network off, Send is disabled and a send attempt shows the offline notice.
3. Web: Escape during a reply with no menu open stops it; with a menu open it only closes the menu.
4. Web: a message containing a credential-looking string is held once; sending again sends it.
5. Mobile: the stop square appears while streaming and tapping it ends the reply.
6. CLI: Esc or Ctrl-C during a reply stops it and the text streamed so far stays in the transcript.
7. Chrome: the button changes to stop while streaming and Stop keeps the partial answer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app should show why Send is blocked in text a sighted person can see, not only for screen readers [inferred from the brief wording 'disabled with a reason'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the disabled reason visibly (tooltip or line) on web; today only the offline case is visible.
- [proposed] Extend the secret hold-back to mobile, VS Code, Chrome and CLI or document why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SendButton (web) | `apps/web/features/chat/components/Composer/SendButton.tsx` | Send, stop and queue render; sr-only disabled reason; Queued chip. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | sendButtonMode (:4764), disabled logic (:6962), sendDisabledReason (:4805), submitMessage (:3581), secret hold-back (:3660), Escape stop (:4665). |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Supplies onStop via handleStopGeneration (:4336, :7674). |
| hook | useChatStream stopGeneration | `apps/web/lib/hooks/useChatStream.ts` | Aborts the stream, records generation_stopped, cancels managed cloud runs (:5391). |
| service | secrets-audit containsSecrets | `apps/web/lib/security/secrets-audit.ts` | Detects credential-looking text before send. |
| integration | managed cloud agent run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Cloud run cancel call used by web Stop (created at useChatStream.ts:5410). |
| component | SendButton (mobile) | `apps/mobile/src/features/chat/components/SendButton.tsx` | idle, streaming, queued states and labels. |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | sendButtonState (:1583), handleSendButtonPress (:1591), queue button (:2269). |
| component | TUI turn loop | `apps/cli/src/tui/tui_app.rs` | Esc or Ctrl-C cancel (:8446), cancel_turn and persist (:8713-8721), hint text (:2064). |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | sendBtn, stopBtn (:3365), syncSendState (:4277), stop click (:5866). |
| config | composer.escapeStops setting | `apps/extension-vscode/package.json` | Setting that lets Escape stop a reply (:1264). |
| component | Chrome send/stop button | `apps/extension/src/side_panel.ts` | updateSendButton (:9894), click handler (:14598), cancelCurrentManagedStream (:7584), canAdmitComposerMessage (:9945). |
| config | Chrome locale strings | `apps/extension/_locales/en/messages.json` | spSendStop 'Stop generating', spSendSend 'Send' (:275-279). |
| test | web SendButton test | `apps/web/features/chat/components/Composer/SendButton.test.tsx` | Send and stop mode behaviour. |
| test | web Escape stop e2e | `apps/web/e2e/composer-escape-stop.spec.ts` | Escape stops the turn when no menu is open; closes a menu otherwise. |
| test | mobile SendButton test | `apps/mobile/__tests__/SendButton.test.tsx` | Unavailable send disabled while Stop stays reachable (:51). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks Send or presses Enter; the composer checks blockers (offline, conflicts, usage, secrets). | device | ChatComposerNew.tsx:3581-3665 |
| The composer calls onSend with text, attachments and options; the turn pipeline sends to the chosen route (Cloud or own key or Local). | device and our servers | ChatComposerNew.tsx:3905-3960; SYS-chat-turn-pipeline |
| Person clicks Stop; the page aborts the browser request and records an event. | device | apps/web/lib/hooks/useChatStream.ts:5391-5405 |
| For a managed cloud agent run, the browser asks our servers to cancel and checks the confirmation. | our servers | useChatStream.ts:5410-5420 (cancelCloudRunAndConfirm) |
| CLI Stop breaks out of the running request, keeps the partial answer, reconciles session history, records 'generation_stopped'. | device | tui_app.rs:8713-8730 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Stopped-turn event 'generation_stopped' | Product analytics (web trackProductEvent, CLI product_analytics::record) | Sent to analytics service; details unknown | unknown |
| Partial reply | Chrome: message marked interrupted in memory (side_panel.ts:7622); CLI: transcript and persisted session (tui_app.rs:8722); web, mobile, VS Code: unknown | unknown | unknown |

**Models and providers.** The button is model-neutral. Whether a stop reaches the provider depends on the route; only the managed cloud run cancel was read (useChatStream.ts:5410). Own-key and Local stop effects are unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: a trial-exhausted state calls the upgrade request instead of sending (ChatComposerNew.tsx:3602). Chrome needs a signed-in cloud owner (side_panel.ts:9945). Others: none found for the button itself. |
| Permissions | none found in the code. |
| Subscription | Usage block and trial states disable the web composer and name the reason (ChatComposerNew.tsx:4751, :4805-4810). Free web-search allowance can block Send (:4821-4824). The plan rules themselves live in SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Daily free web-search allowance state 'checking' or 'exhausted' disables Send (ChatComposerNew.tsx:4821-4824). Other limits: none found in this control. |
| Feature flags | VS Code escapeStops and follow-up behaviour settings (package.json:1264). Web: none found. |
| Model compatibility | Send is disabled when an attachment conflicts with the chosen mode or tools, or the chosen media model is not enabled (ChatComposerNew.tsx:6962-6975). |
| Provider restrictions | none found in the code for the button. |
| Local mode | Web disables Send for a local-model attachment conflict or project conflict (ChatComposerNew.tsx:4817-4819). Mobile stop and send work with no sign-in check in the button code (ChatInput.tsx:2314). CLI Stop works the same. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sending | Web shows a spinner and disables the arrow while the send is pending. | SendButton.tsx:81, :98 |
| Stopping | Chrome disables the button with a loader; VS Code sets aria-busy and 'Stopping'. Web sets a 'stopping' stream phase for cloud runs. | side_panel.ts:9903; webviewContent.ts:5866; useChatStream.ts:5405 |
| Stop not confirmed | Web toasts 'The Cloud task has not confirmed it stopped. Check its activity before retrying.' | useChatStream.ts:5427-5431 |
| Offline | Send disabled; visible notice on attempt (web); mobile shows the queued clock state when offline with content. | ChatComposerNew.tsx:3588; ChatInput.tsx:1585 |
| Attachment uploading | Web defers the send; mobile holds the message until the upload ends. | ChatComposerNew.tsx:3598-3601; ChatInput.tsx:874-878 |
| Voice entry | Empty box with voice available shows a voice button instead of Send (web, mobile). | ChatComposerNew.tsx:6951; ChatInput.tsx:2277-2282 |
| Accessibility | Web reason is announced via an sr-only span; mobile uses accessibilityLabel and disabled state; touch targets grow on coarse pointers. | SendButton.tsx:101; apps/mobile/src/features/chat/components/SendButton.tsx:53; SendButton.tsx:47 |
| Timeout | not handled in the code read for the button. | searched SendButton.tsx and the send/stop code in ChatComposerNew.tsx (:3581-3665, :4764-4830); no timeout state found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/SendButton.test.tsx`: Send mode icon, disabled with no content, spinner while sending; stop mode label and always enabled.
- `apps/web/e2e/composer-escape-stop.spec.ts`: Escape stops the turn when no menu is open; escape closes a menu and leaves the turn running.
- `apps/web/features/chat/components/Composer/ChatComposerNew.sendContract.test.tsx`: Send contract of the composer (exact cases not read).
- `apps/web/features/chat/components/Composer/ChatComposerNew.usageBlock.test.tsx`: Usage block state of the composer (exact cases not read).
- `apps/mobile/__tests__/SendButton.test.tsx`: Unavailable send is disabled while Stop stays reachable.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.followUpQueue.test.tsx`: Stop control stays reachable while a follow-up is composed.
- `apps/extension/__tests__/side-panel-stop.test.ts`: Foreground Stop confirmation around sign-out and retry (selected cases read).
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: Keeps input enabled, queues with Enter, Stop kept separate (:64).
- `apps/cli/src/tui/tui_app.rs`: Inline test a_stopped_turn_returns_its_queued_prompts_to_the_composer (:13672).

**Test scenarios**

- **Stop a reply on web**
  1. Send a long request.
  2. Wait for the square button.
  3. Click it.
  - Expected: The reply ends, the button returns to Send or voice, and the partial text is still on screen (record what actually remains; unknown today).
- **Offline send**
  1. Turn off the network.
  2. Type text.
  3. Try to send.
  - Expected: Send is disabled and the offline notice is shown.
- **Secret hold-back**
  1. Type a fake credential string.
  2. Press Enter twice.
  - Expected: First press shows the warning and sends nothing; second press sends.
- **CLI cancel**
  1. Send a long request in the terminal UI.
  2. Press Esc.
  - Expected: 'stopped the turn' notice; streamed text stays.
- **Chrome stop**
  1. Start a reply in the side panel.
  2. Click the stop square.
  - Expected: A stopping state, then the partial answer marked interrupted.
- **Attachment conflict**
  1. Attach a file the chosen mode cannot take.
  2. Look at Send.
  - Expected: Send is disabled; a screen reader reads the reason.

**Where to look when it fails**

- Web: product event 'generation_stopped'; toast text 'The Cloud task has not confirmed it stopped.'
- Web: data-testid composer-send-disabled-reason (SendButton.tsx:101).
- CLI: footer notice 'stopped the turn' (tui_app.rs:8727).
- Chrome: data-mode attribute on #sp-send-btn (side_panel.ts:9907-9925).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Disabled reason is not visible to sighted users except offline.** Affects: Web and Desktop users with blocked Send.. Evidence: SendButton.tsx:101 (sr-only); ChatComposerNew.tsx:3588 (only offline sets a visible notice). Work needed: Show the reason visibly.
- **Secret hold-back only on web.** Affects: Mobile, CLI, VS Code, Chrome users.. Evidence: containsSecrets found only in apps/web/features/chat/components/Composer/ChatComposerNew.tsx and apps/web/lib/security/secrets-audit.ts. Work needed: Decide scope per app, share the detector.
- **Whether Stop keeps the partial answer is not established for web, mobile and VS Code.** Affects: Those apps.. Evidence: Only CLI (tui_app.rs:8713-8721) and Chrome (side_panel.ts:7622) were read. Work needed: Read stopStreaming and the mobile and extension handlers, or test.
- **No test found for the secret hold-back flow in the composer or the visible/reader disabled reasons.** Affects: Testers.. Evidence: Search of apps/web tests found containsSecrets only in lib/security/secret-patterns.test.ts. Work needed: Add composer tests.
- **VS Code Escape-to-stop is off by default while web has it on.** Affects: VS Code users expecting parity.. Evidence: package.json:1264; ChatComposerNew.tsx:4665. Work needed: Owner decision.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F013-01
- F013-03

## Unknown

- The cancel endpoint path used by web Stop (the client was not read), so no api name is listed.
- Whether Stop keeps partial text on web, mobile and VS Code.
- What the host does after the VS Code 'cancel' message.
- Whether the Cmd/Ctrl+Shift+Enter default steers or queues on web: the settings store default is 'queue' (apps/web/shared/stores/web-settings-store.ts:136) but an e2e title says Enter steers by default (apps/web/e2e/composer-follow-up-and-shortcuts.spec.ts:22).
