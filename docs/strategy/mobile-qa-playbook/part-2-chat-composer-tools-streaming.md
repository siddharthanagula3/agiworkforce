# Part 2 — Chat, Composer, Tool-calling & Streaming (Phases 6–14)

Status: Active · the core of the AGI Mobile XcodeBuildMCP QA manual
Owner: Mobile lead · Parity bar: ChatGPT iOS + Claude iOS (parity = behavior/workflow conventions only — never copied assets, text, branding, or layout-for-layout cloning)
Read first: `README.md` (spine, the 20-point per-screen template, the 44-tool map, and the bug-classification scale). Read `part-1-environment-build-launch.md` for how the simulator was booted, the app installed, and the bundle id resolved — every phase below assumes a launched, signed-in (or age-gated/onboarded) build on a booted iOS Simulator.

This is the largest part of the manual. Phases 6–14 cover everything a user actually does in a chat: navigating to it, looking at the empty state, typing into the composer, fighting (or not) the keyboard, watching tokens stream, watching tools run, scrolling a long thread, attaching files, and switching models. Phase 11 (tool-calling UI) is the deepest section because tool-call presentation is the single most-cited parity gap against ChatGPT and Claude and is treated as a **release blocker**.

Everything below is grounded in the real component tree. The chat surface is assembled in `apps/mobile/app/(app)/(tabs)/chat.tsx` (the composer-first "new chat" screen) and `apps/mobile/app/(app)/chat/[id].tsx` (the live thread). The composer is `ChatInput.tsx` (wrapped by `Composer.tsx`); the message list is `MessageList.tsx` rendering `MessageBubble.tsx`; tool calls render through `InlineToolCall.tsx` (icon resolved by `toolIconRN.ts`, deltas accumulated by `utils/toolCallAccumulator.ts`); agent runs render through `features/agents/components/ToolTimeline.tsx`; the model picker is `features/model-picker/components/ModelPickerSheet.tsx`.

---

## How to read every phase

Each phase follows the same shape so the run is mechanical and repeatable:

- **Goal** — what this phase proves.
- **Preconditions** — app state required before the first action.
- **Tool sequence** — the exact XcodeBuildMCP calls, in order, targeting by `testID` first. Never tap blind coordinates; always `snapshot_ui` → locate → act at the element frame center.
- **Expected UI** — what a correct build shows.
- **Acceptance criteria** — the pass bar, written so a failure is unambiguous.
- **Parity notes** — ChatGPT iOS and Claude iOS behavior to compare against (behavior only).
- **Bug-classification examples** — concrete failures mapped to Critical / High / Medium / Low / Cosmetic.
- **Recovery** — what to do if the phase wedges the app (so the run continues).
- **Checklist** — `- [ ]` items to tick. Apply the README 20-point template to every screen on top of these.

Two automatic Criticals are live in every phase and never relax:

1. **Any Local-mode network egress.** If a chat is in Local Mode and you observe a network request leaving the device for inference, content, or telemetry tied to the message, stop and file Critical.
2. **Any "available/public" overclaim.** If the UI presents a capability as ready (a badge, a toggle that looks armed, a model that looks selectable) but the runtime does not actually serve it, that is a Critical overclaim shipped to users.

Conventions: `screenshot` before and after every interaction; `record_sim_video` around every multi-step workflow; `wait_for_ui` instead of sleeping; run visual checks in both light and dark mode and at default + larger Dynamic Type. Name artifacts `<phase>-<screen>-<state>` (e.g. `11-thread-toolcall-running`).

---

## Phase 6 — Navigation & app shell

### Goal

Confirm the top-level navigation model is correct, switching between surfaces works, the back-swipe gesture behaves, and there are no dead, duplicate, or mislabeled navigation controls. This phase establishes how you will reach every other screen in Parts 2–4.

### Grounding: this app has NO bottom tab bar

This is the single most important navigation fact and a common source of false bugs. `app/(app)/(tabs)/_layout.tsx` mounts `<Tabs tabBar={() => null}>` with `tabBarStyle: { display: 'none' }`. The bottom tab bar is intentionally absent; navigation is an **app-level drawer**. The route group `(tabs)` is retained only for route compatibility (`chat`, `projects`, `agents`, `settings`), and `(tabs)/index.tsx` is a `Redirect` to `(tabs)/chat`. So: do **not** file "missing tab bar" as a bug. The expected pattern is a header hamburger (`Menu` icon, `accessibilityLabel="Open navigation drawer"`) that calls `openNearestDrawer(navigation)`, plus a `New chat` button (`SquarePen`, `accessibilityLabel="New chat"`) on the right of the chat header.

### Preconditions

App launched, past age-gate/onboarding/auth, landed on the Chat screen (`chat.tsx`).

### Tool sequence

1. `record_sim_video` start (`06-navigation-shell`).
2. `snapshot_ui` — capture the chat header hierarchy. Confirm the hamburger (`Open navigation drawer`), the `AGI` brand mark + wordmark, and `New chat` (`SquarePen`).
3. `screenshot` (`06-chat-header-initial`).
4. `tap` the hamburger by its `accessibilityLabel` frame center → drawer opens.
5. `wait_for_ui` for a drawer item (e.g. recents/projects/settings entry), then `snapshot_ui` + `screenshot` (`06-drawer-open`).
6. `tap` a drawer destination (e.g. Settings/Account). `wait_for_ui` for that screen's header.
7. `screenshot` (`06-drawer-destination`).
8. `swipe` from the left screen edge inward (back-swipe) OR tap the back affordance → return to prior screen. `screenshot` (`06-back-swipe-return`).
9. Return to Chat. `tap` `New chat` (`SquarePen`) → confirm it routes to a fresh composer-first chat (`router.replace` to `(tabs)/chat`). `screenshot` (`06-new-chat-reset`).
10. `record_sim_video` stop.

### Expected UI

- Header: hamburger (left), brand mark + "AGI" label (center-left), `New chat` (right). No bottom tab bar.
- Drawer slides in from the left, overlays the chat with a scrim, lists navigation destinations, and is dismissible by tapping the scrim or swiping left.
- Navigating to a destination pushes/replaces correctly; the back-swipe returns to the previous screen with the standard iOS interactive-pop animation.
- `New chat` always returns to a clean composer with the greeting and empty composer.

### Acceptance criteria

- Every navigation control resolves to a real destination — no dead taps, no duplicate controls doing the same thing.
- Drawer open/close animates smoothly (no jank, correct direction) and respects safe-area (no content under the notch or home indicator).
- Back-swipe works from screens that were pushed; it does not fire on root screens where there is nothing to pop.
- No screen leaves the user stranded with no way back.

### Parity notes

- **ChatGPT iOS / Claude iOS**: both use a left-edge drawer/sidebar for conversation history and account, with a header entry point and a new-chat affordance. AGI's drawer + hamburger + `New chat` matches that _workflow_. The bar is: does the user reach history, settings, and a fresh chat in the same number of obvious moves? Match the behavior, not the pixels.
- Interactive back-swipe is an iOS platform convention both reference apps honor; AGI must too.

### Bug-classification examples

- **High**: hamburger does nothing / drawer never opens → core navigation broken (blocked navigation).
- **High**: a drawer destination routes to a blank screen or a 404-equivalent → blocked navigation.
- **Medium**: drawer opens but the scrim is non-dismissible, trapping the user until they guess a gesture → degraded UX with recovery friction.
- **Medium**: `New chat` does not reset a stale composer draft from a prior session.
- **Low**: hamburger lacks an `accessibilityLabel` (it has one in code — verify it survives at runtime).
- **Cosmetic**: drawer slide easing slightly off, or brand mark vertically misaligned by a couple of points.

### Recovery

If a navigation action wedges the UI, `stop_app_sim` + `launch_app_sim` to relaunch to the chat root, then resume at the next phase. Log the wedge with the `snapshot_ui` that preceded it.

### Checklist

- [ ] Confirmed no bottom tab bar is expected (drawer model) — did not file a false "missing tab bar" bug.
- [ ] Hamburger opens the drawer; scrim + swipe dismiss it.
- [ ] Each drawer destination resolves to a real screen.
- [ ] Back-swipe pops pushed screens; no-ops on root.
- [ ] `New chat` returns to a clean composer.
- [ ] Drawer animation smooth, safe-area respected, both light + dark.
- [ ] Applied the 20-point template to the chat header and the drawer.

---

## Phase 7 — Chat UX & empty state

### Goal

Verify the new-chat landing experience: the greeting/empty state is present, personalized when a name is known, helpful, and gives the user an obvious next move. A blank or confusing empty state is a Medium bug by the classification scale.

### Grounding

Two distinct empty surfaces exist and must not be conflated:

1. **The new-chat screen** (`chat.tsx`): a centered block with the `ModeToggle`, the `AgiMark` (size 44), a time-of-day greeting from `getTimeOfDayGreeting()` ("How can I help you this morning/afternoon/evening/tonight?"), and — in Local mode with no installed model — a `DownloadModelBanner` (`testID="download-model-banner"`, "Download a model to chat"). In Cloud mode it shows a `modeDescription` line instead.
2. **`ChatEmptyState.tsx`** (rendered by `MessageList` when a thread has zero messages): headline `Hi, {displayName}` if a nickname/first name is known, else `Ask anything` + subtitle `How can I help you?`. It also conditionally shows a desktop-pairing banner ("Pair your desktop?" / "Scan QR to connect") gated by `FEATURES.companion` and a one-time MMKV dismissal key.

### Preconditions

On the Chat screen, no messages yet.

### Tool sequence

1. `snapshot_ui` — enumerate the centered block: mode toggle, mark, greeting, and either the download banner (local, no model) or the mode description (cloud).
2. `screenshot` (`07-empty-state-light`).
3. Toggle appearance to dark (Part 3 covers the mechanism; here just capture if already switchable) → `screenshot` (`07-empty-state-dark`).
4. Increase Dynamic Type to a larger setting → `snapshot_ui` + `screenshot` (`07-empty-state-large-type`). Confirm the greeting wraps without clipping and the mark/toggle do not overlap.
5. If `DownloadModelBanner` is present, `tap` it → confirm it routes to `/(app)/models`. `screenshot` (`07-download-banner-route`). Navigate back.
6. If a desktop-pairing banner is present, `tap` its dismiss `X` → confirm it dismisses and stays dismissed on relaunch (MMKV-backed).

### Expected UI

- A visually centered, calm landing — not a blank white screen. Greeting present.
- Local + no model → the download banner is the obvious next step. Local + model ready → just the greeting (no nagging banner).
- Cloud → a description that honestly frames cloud availability, not a fake "ready" claim.

### Acceptance criteria

- The empty state always renders something helpful; never a blank region (README item 13).
- Personalization is correct: a known name appears; an unknown name falls back gracefully (no `Hi, undefined`).
- The download banner only appears when there is genuinely no ready local model; tapping it reaches the model library.
- Larger Dynamic Type does not clip or overlap the greeting block.

### Parity notes

- **ChatGPT iOS**: new chat shows suggestion prompts / a greeting and a clearly-empty composer. **Claude iOS**: a centered mark + greeting ("good evening" style) above the composer — AGI's centered-mark + time-of-day greeting matches this _convention_. The parity bar is: does the empty state orient a first-time user and offer a next action? Do not copy ChatGPT's specific suggestion strings or Claude's mark.
- Both reference apps avoid dead-end empty states; AGI's download banner (local) / mode description (cloud) is the equivalent "what to do next."

### Bug-classification examples

- **Medium**: blank chat area with no greeting or guidance (missing empty state).
- **Medium**: `Hi, undefined` or a broken greeting token (degraded UX, looks unfinished).
- **High**: download banner shows even though a model is installed and ready, then tapping it loops back — confusing dead control on the core path.
- **Critical (overclaim)**: Cloud empty-state copy presents cloud chat as live when `FEATURES.cloudChat` is off and sends are blocked — fake availability.
- **Low**: greeting punctuation/casing nit.
- **Cosmetic**: mark-to-greeting vertical spacing slightly off.

### Recovery

If the empty state errors, relaunch. If the download banner route 404s, note it and reach the model library via the drawer for Phase 14.

### Checklist

- [ ] Greeting present and personalized/fallback-correct.
- [ ] Local-no-model shows download banner; routes to models.
- [ ] Local-with-model shows no nagging banner.
- [ ] Cloud shows honest description, not a fake "ready" badge.
- [ ] Empty state holds at larger Dynamic Type, light + dark.
- [ ] Desktop-pairing banner (if shown) dismisses and stays dismissed.
- [ ] Applied 20-point template.

---

## Phase 8 — Composer controls

### Goal

Exercise every control in the composer and verify each is present, correctly labeled, in the right enabled/disabled state, and visually sound — including multiline growth and the send button's empty-disabled behavior.

### Grounding

The composer is `ChatInput.tsx` (wrapped by `Composer.tsx`, which adds task chips on the empty chat). Its anatomy:

- **Text input** — `testID="chat.composer.input"`, multiline, `minHeight: 24`, `maxHeight: 200` (so it grows then scrolls internally), `numberOfLines={MAX_INPUT_LINES}`, placeholder that changes by state (see Phase 9), `accessibilityLabel="Message input"`.
- **Bottom toolbar**, left group: a `[+]` Add-to-Chat button (`Plus`, `accessibilityLabel="Add to chat"`) and the `ModelSelectorButton` (hidden during streaming).
- Bottom toolbar, right group: an optional connectors link (`LinkIcon`, only if `onOpenConnectors` is wired), the **mic** (`VoiceInputButton` inside `testID="chat.composer.mic"`), and the **send/stop** button (`SendButton` inside `testID="chat.composer.send"`).
- **Mode toggle** (`ModeToggle`, `testID="chat.mode-toggle"` with `.local` / `.cloud`) — on the new-chat screen this sits in the centered greeting block above the composer, not inside the composer bar. The composer's trust context comes from which mode is active there.
- **Send-button state machine** (`ChatInput`): `streaming` (shows stop) when `isStreaming`; `queued` when offline + has content; `idle` otherwise. `disabled={!hasContent && !isStreaming}` — i.e. disabled when the input is empty and nothing is streaming. `hasContent = text.trim().length > 0 || attachments.length > 0`.
- **Model selector** (`ModelSelectorButton`): a `Bot` icon + short model name (or "Auto"), a `ChevronDown`, and a small purple `Brain` dot when per-model thinking is on. `accessibilityLabel="Model: {label}"`.

### Preconditions

On the new-chat composer, input empty.

### Tool sequence

1. `record_sim_video` start (`08-composer`).
2. `snapshot_ui` — enumerate: input, `[+]`, model selector, (connectors if present), mic, send. Confirm send is **disabled** (empty input).
3. `screenshot` (`08-composer-empty`). Confirm the send button reads as disabled (visually dimmed; `disabled` prop true).
4. `type_text` a single short line into `chat.composer.input`. `snapshot_ui` → confirm send is now **enabled**. `screenshot` (`08-composer-has-text`).
5. Clear the field (select-all + delete, or backspaces). Confirm send returns to **disabled**.
6. `type_text` a long multiline string (force several wrapped lines / explicit newlines). `screenshot` (`08-composer-multiline-growth`). Confirm the input grows up to ~200pt then scrolls internally rather than pushing the toolbar off-screen.
7. `tap` `chat.composer.mic` → confirm a recording affordance/overlay appears (mic permission prompt acceptable on first run). `screenshot` (`08-mic-pressed`). Cancel out.
8. `tap` `[+]` (`Add to chat`) → confirm the `add-to-chat-sheet` bottom sheet opens (full detail in Phase 13). Close it.
9. `tap` the `ModelSelectorButton` → confirm the model picker sheet opens (full detail in Phase 14). Close it.
10. `tap` `chat.mode-toggle.local` then `chat.mode-toggle.cloud` → confirm Local selects immediately; Cloud either selects (if entitled) or opens cloud-access (if not) — never silently flips trust (full detail below + Phase 14). `screenshot` each.
11. `record_sim_video` stop.

### Expected UI

- Send disabled on empty, enabled the instant there is trimmed text or an attachment.
- `[+]`, model selector, mic, send all present and tappable; connectors link only present when wired to a real destination.
- Multiline growth is bounded and smooth; the toolbar never gets pushed off-screen.
- Model selector shows the current model honestly (real `models.json`-derived label, or "Auto").

### Acceptance criteria

- Disabled-when-empty is correct (README item 12). This is a frequent regression target.
- Every composer control has an accessibility label (README item 15) — verify the runtime labels match code (`Message input`, `Add to chat`, `Model: …`, mic via `VoiceInputButton`, send via `SendButton`).
- No control is dead: each opens its sheet/overlay or performs its action.
- The trust label / mode is visible and accurate where the composer is used; switching modes is explicit (see Phase 8 mode-toggle + Phase 14).

### Parity notes

- **ChatGPT iOS**: composer has attach (`+`), mic/dictation, and a send arrow that is disabled until input exists; a model selector affordance. **Claude iOS**: attach, a model/style affordance, and a send control gated on content. AGI's `[+]` / model / mic / send mirrors these _roles_. Parity is functional equivalence, not icon-for-icon copying.
- The send→stop morph during streaming (Phase 10) is a shared convention both reference apps use; AGI's `SendButton state="streaming"` matches it.

### Bug-classification examples

- **High**: send button enabled on empty input and tapping it sends a blank message (broken core send + disabled-state bug).
- **High**: tapping the model selector does nothing (dead control on a core path).
- **Medium**: multiline input grows unbounded and pushes the send button off-screen (no `maxHeight` clamp at runtime).
- **Medium**: a composer control missing its accessibility label at runtime (VoiceOver gap).
- **Critical (trust)**: tapping `chat.mode-toggle.cloud` silently switches an in-progress Local context to Cloud with no consent — trust-boundary violation.
- **Low**: model-selector label truncates oddly for a long model name.
- **Cosmetic**: `[+]` icon 1px off-center.

### Recovery

If a sheet opens and won't dismiss, swipe it down (pan-to-close is enabled) or relaunch. If the mic permission prompt blocks, accept/deny and continue; do not let the prompt count as a bug.

### Checklist

- [ ] Send disabled on empty, enabled with trimmed text or attachment, disabled again when cleared.
- [ ] `[+]`, model selector, mic, send all live and labeled.
- [ ] Connectors link present only when wired.
- [ ] Multiline growth bounded (~200pt) then internal scroll; toolbar stays put.
- [ ] Model selector shows a real/honest label.
- [ ] Mode toggle: Local immediate, Cloud explicit (select or gated) — never silent trust flip.
- [ ] Applied 20-point template, light + dark, larger type.

---

## Phase 9 — Keyboard handling

### Goal

Verify the software keyboard behaves: typing inserts text, the return key does the right thing, the keyboard dismisses correctly, the composer is not hidden behind the keyboard, the list scrolls with the keyboard, and paste works.

### Grounding

`ChatInput` sets `returnKeyType="default"` and `blurOnSubmit={false}` on a multiline input — i.e. **Return inserts a newline; it does not send**. Send is an explicit tap of the send button. `MessageList` (FlashList) sets `keyboardDismissMode="interactive"` (drag-to-dismiss) and `keyboardShouldPersistTaps="handled"`, plus `maintainVisibleContentPosition` so the visible message stays anchored when the keyboard shows/hides. The composer container adds bottom padding via `useSafeAreaInsets()` (`paddingBottom: Math.max(insets.bottom + 6, 16)`) so it clears the home indicator.

### Preconditions

On a chat (new-chat composer or an open thread). Software keyboard available in the Simulator (ensure "Connect Hardware Keyboard" is off so the software keyboard shows, if the run needs to see it).

### Tool sequence

1. `record_sim_video` start (`09-keyboard`).
2. `tap` `chat.composer.input` → keyboard rises. `wait_for_ui` for the keyboard / focused input. `screenshot` (`09-keyboard-up`).
3. Confirm the composer (input + toolbar + send) is **fully visible above** the keyboard, not occluded.
4. `type_text` a sentence. `key_press` Return → confirm it inserts a **newline** (input grows) and does **not** send. `screenshot` (`09-return-newline`).
5. In an open thread with messages, with the keyboard up, `swipe`/drag down over the list → confirm interactive dismissal drags the keyboard down with the gesture. `screenshot` (`09-interactive-dismiss`).
6. Scroll the list while the keyboard is up → confirm the visible message stays anchored (no jump) thanks to `maintainVisibleContentPosition`.
7. Paste: place known text on the pasteboard (via a prior copy of a message using long-press → Copy, Phase 12, or a clipboard write), then long-press the input and `tap` Paste → confirm the text inserts. `screenshot` (`09-paste`).
8. Tap outside / dismiss; confirm the keyboard goes away and the composer settles back above the home indicator.
9. `record_sim_video` stop.

### Expected UI

- Keyboard rises smoothly; composer rides above it.
- Return = newline (multiline composer); send is a deliberate button tap.
- Interactive drag-to-dismiss works; list content does not jump on keyboard show/hide.
- Paste inserts pasteboard text.

### Acceptance criteria

- The composer is never hidden behind the keyboard (a classic mobile bug). It clears both the keyboard and the home indicator.
- Return inserts a newline (matches the code contract); the run does not file "Return doesn't send" as a bug — that is intentional.
- Scroll position is stable across keyboard transitions.
- Paste works and does not crash on large clipboard contents.

### Parity notes

- **ChatGPT iOS / Claude iOS**: multiline composers where Return adds a newline and send is a button; the input bar floats above the keyboard; the transcript scrolls with the keyboard. AGI matches this behavior.
- Interactive keyboard dismissal (drag down on the transcript) is an iOS-native expectation both reference apps support.

### Bug-classification examples

- **High**: composer hidden behind the keyboard so the user can't see what they type or reach send (core flow broken on small devices).
- **Medium**: keyboard show/hide jumps the transcript to top/bottom (lost scroll position).
- **Medium**: paste crashes or mangles multibyte text.
- **Low**: keyboard appearance (light) mismatched in dark mode (minor).
- **Cosmetic**: a few points of extra gap between composer and keyboard.

### Recovery

If the keyboard gets stuck up and blocks taps, `key_press` to dismiss or tap a non-interactive region; relaunch if it persists.

### Checklist

- [ ] Composer fully visible above the keyboard on the test device size.
- [ ] Return inserts newline; send is button-only (not a bug).
- [ ] Interactive drag-to-dismiss works.
- [ ] Scroll position stable across keyboard show/hide.
- [ ] Paste inserts text without crash.
- [ ] Composer clears the home indicator after dismiss.
- [ ] Applied 20-point template.

---

## Phase 10 — Streaming lifecycle

### Goal

Verify the full send → token streaming → stop/cancel → resume/retry lifecycle, including every lifecycle state's visual: pending, streaming, stopped, completed, errored. This is a core flow; any break is High or Critical.

### Grounding

- Sending from the new-chat screen (`chat.tsx handleSend`) creates a conversation, routes to `/(app)/chat/[conversationId]`, and calls `sendMessage(...)`. In an open thread the composer sends in place.
- While a reply is generating, `MessageBubble` shows the **`StreamingIndicator`** (a spinning `AgiMark`, `accessibilityRole="progressbar"`, `accessibilityLabel="Generating response"`) appended to streaming content; the streaming assistant bubble carries `testID="chat.message.assistant.streaming"`.
- The send button morphs to a **stop** control during streaming (`SendButton state="streaming"`, `onStop` wired); the model pill is hidden during streaming to save space.
- `MessageList` auto-scrolls to the bottom as tokens arrive **only when the user is already near the bottom** (`isNearBottomRef` + `maintainVisibleContentPosition.autoscrollToBottomThreshold`). If the user scrolled up, streaming does not yank them down.
- Reasoning, if present, renders as a `ThinkingChip` ("Thinking…" while streaming, "Thought for N.Ns" after). Note (honesty): mobile **intentionally does not display chain-of-thought text** — the chip is a status affordance only.
- Retry: long-press an assistant message → action sheet includes **Retry** (`onRetryMessage`). Errored sends are recoverable from the thread.

### Preconditions

A ready local model installed (Local mode) so a real stream is produced on-device. (If no model: complete Phase 14 first to install one, or run streaming in Cloud only if entitled.)

### Tool sequence

1. `record_sim_video` start (`10-streaming`) — capture the whole lifecycle in one video.
2. On the composer, `type_text` a prompt that yields a multi-token answer (e.g. "Write three sentences about tides."). `screenshot` (`10-prestream-composer`).
3. `tap` `chat.composer.send`. `wait_for_ui` for the new thread + the streaming assistant bubble (`chat.message.assistant.streaming`). `screenshot` (`10-streaming-active`).
4. Confirm: the spinning `StreamingIndicator` is visible; the send button is now a **stop** button; the model pill is hidden; tokens are visibly accumulating.
5. While streaming, `tap` the stop button → confirm streaming halts, the partial response remains, the indicator stops, and the composer returns to idle (send button reappears, model pill returns). `screenshot` (`10-stopped-partial`).
6. Long-press the assistant message → action sheet → `tap` **Retry** → confirm a fresh stream starts for that turn. `screenshot` (`10-retry-restream`).
7. Let one stream complete fully → confirm the indicator disappears, provenance footer / performance chip / report-flag affordances appear on the finished assistant turn. `screenshot` (`10-completed`).
8. Scroll up mid-stream on a longer answer → confirm streaming does **not** force-scroll you to the bottom; the scroll-to-bottom FAB appears (Phase 12). `screenshot` (`10-stream-scroll-decoupled`).
9. Force an error path if reproducible (e.g. stop network in Cloud, or trigger a model-missing state) → confirm an error state with recovery renders (see edge-case `MessageErrorScreen` copy: "Can't connect" / "Model not installed" with a retry CTA). `screenshot` (`10-error-state`).
10. `record_sim_video` stop.

### Expected UI

- Pending → streaming → completed transitions are visible and smooth; each has a distinct, correct visual.
- Stop halts cleanly and preserves the partial answer.
- Retry re-streams the turn.
- Errors render a clear, recoverable state — never a silent failure or a spinner that never resolves.

### Acceptance criteria

- The streaming indicator is **actually visible** during streaming (there is a documented past bug where a `<Text>`-wrapped spinner collapsed to nothing; `StreamingIndicator` must be a `<View>`). If streaming produces no visible activity, that is High.
- Stop is reliable and idempotent; tapping it does not crash or leave a zombie stream.
- Auto-scroll is coupled to user intent (near-bottom only), not forced.
- Completed turns expose the post-stream affordances (provenance, perf chip on-device, report/flag).
- Error states are present with recovery (README item 14).

### Parity notes

- **ChatGPT iOS / Claude iOS**: tokens stream incrementally with a visible in-progress indicator; the send button becomes a stop button; stopping keeps the partial text; you can regenerate/retry. AGI's lifecycle matches this _behavior_.
- Both decouple auto-scroll from forced scroll when the user reads back — AGI's near-bottom gate matches.
- Honesty divergence (allowed and correct): AGI deliberately hides chain-of-thought text where some competitors show a reasoning trace. Do **not** file "missing reasoning text" as a parity bug — it is a deliberate product decision.

### Bug-classification examples

- **Critical**: a Local-mode stream triggers a network egress for inference (trust violation).
- **High**: no visible streaming indicator — user can't tell anything is happening (the `<View>` regression).
- **High**: stop button does nothing / stream can't be cancelled.
- **High**: completed stream never clears the indicator (spinner forever).
- **Medium**: auto-scroll yanks the user to the bottom while they're reading back.
- **Medium**: errored turn shows a dead bubble with no retry.
- **Low**: provenance footer label slightly wrong casing.
- **Cosmetic**: send→stop morph not animated.

### Recovery

If a stream hangs, tap stop; if stop is dead, relaunch and reopen the thread (the conversation was persisted on send). Capture the hang via `snapshot_ui` + the recorded video before relaunching.

### Checklist

- [ ] Send creates/opens the thread and starts a real stream.
- [ ] `StreamingIndicator` visibly spins during streaming.
- [ ] Send morphs to stop; model pill hides during streaming.
- [ ] Stop halts cleanly and keeps the partial answer.
- [ ] Retry re-streams the turn.
- [ ] Completed turn clears indicator and shows post-stream affordances.
- [ ] Auto-scroll near-bottom-only (not forced).
- [ ] Error state present with recovery.
- [ ] No Local-mode egress observed.
- [ ] `record_sim_video` captured the full lifecycle.

---

## Phase 11 — Tool-calling UI (DEEPEST — release-blocker parity)

### Goal

Verify that when the assistant calls a tool, the UI presents it as a first-class, legible, status-aware artifact — comparable to ChatGPT's tool-call chips + execution timeline and Claude's collapsible tool-use blocks — and **never** dumps raw JSON at the user. This is the highest-weighted parity area in the entire manual. If tool-call UI is missing, broken, or shows raw payloads, the build is **not shippable** and the issue is High-to-Critical depending on severity.

### Grounding (read carefully — the implementation is specific)

- **Where tool calls render**: `MessageBubble` renders `message.toolCalls` as a vertical stack of `InlineToolCall` cards, indented under a left border rail (`borderLeftWidth: 1`, `paddingLeft: 12`, `marginLeft: 8`, `gap: 4`) — i.e. ordered, grouped, visually subordinate to the assistant turn, like a tool-use block.
- **The collapsed card** (`InlineToolCall.tsx`): a pressable row with
  - a **status rail + dot** (a circular badge whose color is success/active/error-toned),
  - the **tool icon** resolved by `lucideRNToolIcon(toolCall.name)` from `toolIconRN.ts` — the SAME cross-surface icon registry desktop/web use (so a `web_search` tool shows the globe everywhere, a shell tool shows the terminal, etc.; unknown tools fall back to `Wrench`),
  - the **tool name** (+ optional `filePath`), truncated to one line,
  - a **status pill**: `Running` (active tone), `Done` (success tone), or `Error` (error tone) from `getStatusLabel` (`running`/`completed`/`failed`),
  - a **status icon**: `Loader2` spinner while running, `CircleCheck` when completed, `CircleX` when failed,
  - an optional one-line **command preview** under the name (`toolCall.command`),
  - a **chevron** that rotates 90° when expandable (`hasBody = input || output || command`).
- **The expanded body** is a `@gorhom/bottom-sheet` (snap points `['50%','90%']`, pan-to-close) — NOT an inline JSON blob. It has a header (icon + name) and labeled sections rendered in monospace: **Command** (`$ …`, horizontally scrollable), **Request** (the input), and **Response** (the output). The accumulator passes structured strings; the sheet shows them as readable request/response, not a dumped object.
- **The accumulator** (`utils/toolCallAccumulator.ts`) turns SSE deltas into `ToolCall[]`: it handles server tools (web_search, code execution — keyed by name, result arrives as a content block) and MCP tools (keyed by id, terminal `x_tool_result` with `is_error` → `failed`). Status maps `completed`→Done, `failed`/`error`→Error, everything else→running. `toolCallList` skips unnamed noise. So the UI should never show an empty/nameless tool card.
- **Agent runs** use a different but related component, `ToolTimeline.tsx` (`features/agents`): a true **vertical timeline** with a time label column, a connecting line + status dot per step (pulsing dot while running, `CheckCircle2`/`XCircle` terminal), a per-step icon (`searching`/`coding`/`command`/`thinking`/`success`/`error`), a step message, and an optional 3-line detail. This is AGI's analogue to ChatGPT's "execution timeline."
- **Approvals** (manual MCP mode): a pending tool surfaces as a running step and, where wired, an `ApprovalCard` (approve/reject) renders in the bubble.

### Preconditions

A model + mode that actually invokes tools. Best path: a prompt that triggers a server tool (e.g. web search if `FEATURES.webSearch` is on and enabled via the Add-to-Chat sheet), or an agent run that produces `ToolTimeline` steps. Confirm in Phase 13 that the relevant capability toggle is on before relying on it here. If no tool path is reachable in the build, record that as a **coverage gap** and a parity risk (do not fake a pass).

### Tool sequence — single tool, happy path

1. `record_sim_video` start (`11-toolcall-happy`).
2. Enable the tool capability if needed (Phase 13: open `[+]` → `add-to-chat-sheet` → toggle Web search on). Close the sheet.
3. `type_text` a prompt that forces a tool call (e.g. "Search the web for today's date and cite it."). `tap` `chat.composer.send`.
4. `wait_for_ui` for the first `InlineToolCall` card (locate by its `accessibilityLabel` `Tool call: {name}`). `screenshot` (`11-toolcall-pending`).
5. Observe the **running** state: spinner (`Loader2`) + `Running` pill + active-tone dot. `snapshot_ui` + `screenshot` (`11-toolcall-running`).
6. Wait for completion: spinner → `CircleCheck`, pill → `Done`, success tone. `screenshot` (`11-toolcall-done`).
7. `tap` the card → the bottom sheet expands. `wait_for_ui` for the sheet. Confirm labeled **Request**/**Response** (and **Command** if present) in monospace — **not** a raw JSON dump in the chat. `screenshot` (`11-toolcall-expanded-sheet`).
8. Swipe the sheet down to close (pan-to-close); confirm the chevron rotates back. `screenshot` (`11-toolcall-collapsed`).
9. `record_sim_video` stop.

### Tool sequence — multiple tools, ordering & stacking

1. `record_sim_video` start (`11-toolcall-multi`).
2. `type_text` a prompt that triggers several tools in sequence (e.g. "Search the web, then summarize what you found."). Send.
3. `wait_for_ui` for ≥2 `InlineToolCall` cards. `snapshot_ui` → confirm they are **stacked in first-seen order** under the left rail, each independently statused. `screenshot` (`11-toolcall-multi-stack`).
4. Confirm each card can be expanded independently into its own sheet. `screenshot` per expansion.
5. `record_sim_video` stop.

### Tool sequence — failing tool

1. Trigger a tool that errors (e.g. a search with no network, or an MCP tool returning `is_error`). Send.
2. `wait_for_ui` for the card to reach **Error**: `CircleX` + `Error` pill + error-tone dot + error-tone name color. `screenshot` (`11-toolcall-error`).
3. Expand → confirm the Response section shows the error content legibly (not a stack-trace dump or a blank). `screenshot` (`11-toolcall-error-expanded`).

### Tool sequence — long-running tool

1. Trigger a tool that takes several seconds. Confirm the **running** state persists (spinner keeps spinning, `Running` pill stays) without the card collapsing, freezing, or flipping prematurely to Done. `screenshot` (`11-toolcall-longrunning`).
2. Confirm streaming text and other cards remain responsive while one tool is in-flight.

### Tool sequence — agent timeline

1. Start an agent run that emits steps (`features/agents`). `wait_for_ui` for `ToolTimeline` rows.
2. Confirm: time labels, connecting line, pulsing dot on the running step, per-step icons, step messages, optional detail lines, and terminal `CheckCircle2`/`XCircle`. `screenshot` (`11-tooltimeline`).
3. Confirm steps appear in order and the timeline degrades gracefully if a step has no timestamp.

### Expected UI

- Tool calls are legible cards: icon + name + status pill + status icon + (optional) command preview, ordered and grouped under the assistant turn.
- Expansion reveals labeled Request/Response/Command in monospace inside a bottom sheet — a readable detail view, not a raw object printed in the chat.
- Multiple tools stack in order; each is independently expandable.
- Failing tools show a clear error state; long-running tools show a persistent running state.
- Agent runs render a true vertical execution timeline.

### Acceptance criteria — general

- **No raw JSON dump** is ever shown inline in the chat transcript. (Structured args/results live behind the expandable sheet, monospace-formatted with labels.) Inline raw JSON is an automatic High.
- Every tool card shows a **name and a status**; there are no empty/nameless cards (the accumulator filters unnamed noise — verify it holds at runtime).
- Status transitions are correct and visible: pending/running → success or error, with the right icon and pill each time.
- The tool icon matches the tool (globe for web, terminal for shell, etc.) via the shared registry; unknown tools fall back to a wrench, not a broken/empty glyph.
- Cards are ordered and grouped, not interleaved randomly with prose.
- Expansion and collapse work (chevron rotates; sheet pans to close).

### Dedicated tool-call UX acceptance checklist (release-blocker)

- [ ] **Chips/cards present**: every tool invocation renders an `InlineToolCall` card (not silent, not raw text).
- [ ] **Icon correct**: icon resolved via `toolIconRN`/shared registry; matches the tool; wrench fallback for unknown.
- [ ] **Name shown**: tool name (+ filePath when relevant), truncated cleanly to one line.
- [ ] **Status pill**: shows `Running` / `Done` / `Error` matching the underlying status.
- [ ] **Loading indicator**: `Loader2` spinner animates during `running`; stops on terminal state.
- [ ] **Success presentation**: `CircleCheck` + success tone on completion.
- [ ] **Error presentation**: `CircleX` + `Error` pill + error tone on failure; error content legible when expanded.
- [ ] **Collapsible output**: tapping a card with a body expands a bottom sheet; chevron rotates; pan-to-close works.
- [ ] **No raw JSON inline**: structured request/result appear only inside the sheet, labeled (Request/Response/Command) and monospace — never dumped in the transcript.
- [ ] **Ordered stacking**: multiple tools stack in first-seen order under the left rail; each independently expandable.
- [ ] **Command preview**: when a `command` exists, the one-line preview shows under the name and the full `$ command` shows in the sheet.
- [ ] **Timeline (agent runs)**: `ToolTimeline` renders ordered steps with time labels, connecting line, pulsing running dot, per-step icons, and terminal check/x.
- [ ] **Long-running**: running state persists without premature flip; UI stays responsive.
- [ ] **Approvals (manual mode)**: pending tool is at least visible; approve/reject card renders where wired.
- [ ] **Accessibility**: each card has `accessibilityLabel="Tool call: {name}"` and a "Double tap to expand" hint when expandable.

### Parity notes (explicit comparison)

- **ChatGPT iOS**: shows tool/function activity as inline chips/rows ("Searching the web", "Analyzing…") with a spinner→done state and an expandable details/execution view; an agent/Operator-style run shows a step timeline. AGI's `InlineToolCall` (chip + spinner→check + expandable sheet) and `ToolTimeline` (step timeline) match these _behaviors_. Parity bar: a user can see _that_ a tool ran, _which_ tool, its _status_, and _drill into_ the detail.
- **Claude iOS**: renders tool use as a collapsible block (a labeled, expandable section with the call and its result), keeping raw payloads tucked away. AGI's expandable bottom sheet with labeled Request/Response is the equivalent collapsible-output behavior.
- **Anti-pattern both reference apps avoid**: printing the raw function-call JSON in the conversation. AGI must avoid it too — and the architecture already routes payloads into the sheet, so any inline raw JSON at runtime is a regression.
- Copying rule: match the _interaction model_ (chip → status → expandable detail; ordered timeline). Do not copy competitor labels, icon art, or animations.

### Bug-classification examples

- **Critical**: a tool card claims `Done` (success) for a tool that actually failed or never ran — a fake-success overclaim shipped to users; also a trust/honesty issue.
- **Critical**: a Local-mode tool call performs an undisclosed network egress.
- **High**: no tool-call UI at all — tools run but the user sees nothing (missing/incorrect tool-call UI; release blocker).
- **High**: raw JSON of the tool call/result dumped inline in the transcript.
- **High**: status never leaves `Running` after the tool completed (stuck spinner) or flips to Done before completion.
- **High**: wrong/empty icon or a nameless card for a known tool.
- **Medium**: multiple tools render out of order or overwrite each other (accumulator keying bug surfaced in UI).
- **Medium**: expanded sheet shows the section labels but empty Request/Response when data exists.
- **Medium**: `ToolTimeline` running dot doesn't pulse / steps don't appear in order.
- **Low**: status pill color slightly off-tone in one theme.
- **Cosmetic**: chevron rotation easing, or 1px rail misalignment.

### Recovery

If a tool run hangs the thread, capture `snapshot_ui` + video, tap stop (Phase 10), then relaunch and reopen the persisted thread. If no tool path is reachable, do not fabricate — log a coverage gap and flag the parity risk for the end-of-run report.

### Checklist (phase-level)

- [ ] Single tool: pending → running (spinner) → done (check) verified, expandable sheet legible.
- [ ] Multiple tools stack in order, each expandable.
- [ ] Failing tool shows error state + legible error detail.
- [ ] Long-running tool keeps a persistent running state; UI responsive.
- [ ] Agent `ToolTimeline` renders ordered steps with correct dots/icons.
- [ ] No raw JSON ever inline.
- [ ] Completed the dedicated tool-call UX acceptance checklist above.
- [ ] Compared explicitly to ChatGPT chips/timeline and Claude collapsible blocks.
- [ ] Applied the 20-point template to the thread during a tool run.

---

## Phase 12 — Long conversations & list performance

### Goal

Verify the message list scrolls smoothly, virtualizes, anchors correctly, exposes a scroll-to-bottom control, and stays performant over 100+ messages — without dropping frames, losing scroll position, or leaking memory.

### Grounding

`MessageList.tsx` uses **`FlashList`** (Shopify) — a virtualized list, so a long thread should not render every row at once. It sets `maintainVisibleContentPosition` with `startRenderingFromBottom: true` and `autoscrollToBottomThreshold` (`NEAR_BOTTOM_THRESHOLD = 150`) so the thread **opens at the latest message** and only auto-follows when the user is near the bottom. A **scroll-to-bottom FAB** (a teal circular `ChevronDown`, `accessibilityLabel="Scroll to bottom"`) fades in (`fabOpacity` over 200ms) whenever the user is **not** near the bottom and fades out otherwise; tapping it `scrollToEnd({ animated: true })`. The list also supports pull-to-refresh (`RefreshControl`, if `onRefresh` is wired) and swipe-right-to-reply per row (`SwipeReplyWrapper`, medium haptic).

### Preconditions

A thread with many messages. If none exists, generate one: send ~20–30 short prompts (or use a seeded/long conversation if the build provides one). For a true 100+ test, script repeated sends via `batch`.

### Tool sequence

1. `record_sim_video` start (`12-long-convo`).
2. Open a long thread. `snapshot_ui` → confirm it opens **at the bottom** (latest message visible), not the top.
3. `screenshot` (`12-open-at-bottom`).
4. Scroll up several screens with momentum `swipe`s → confirm smooth scrolling, correct bounce at the top, no stutter/blank rows (virtualization recycling correctly). `screenshot` (`12-scrolled-up`).
5. Confirm the **scroll-to-bottom FAB** has faded in now that you're away from the bottom. `snapshot_ui` (locate `Scroll to bottom`). `screenshot` (`12-fab-visible`).
6. `tap` the FAB → confirm it animates back to the latest message and then fades out. `screenshot` (`12-fab-jump-bottom`).
7. With ~100+ messages, scroll top-to-bottom repeatedly → watch for dropped frames / jank in the video; note any blank-then-pop rows.
8. If pull-to-refresh is wired, pull down at the top → confirm the refresh spinner and that it loads earlier history (or refreshes) without duplicating or reordering messages. `screenshot` (`12-pull-refresh`).
9. Swipe one message right → confirm the reply affordance reveals and triggers quote-reply (Phase ties to composer). `screenshot` (`12-swipe-reply`).
10. `record_sim_video` stop.

### Expected UI

- Thread opens at the latest message.
- Scrolling is smooth with native momentum/bounce; long lists virtualize (no all-at-once render).
- The scroll-to-bottom FAB appears when scrolled up and jumps to bottom on tap.
- Refresh/load-earlier (if present) works without corrupting order.

### Acceptance criteria

- No sustained frame drops or stutter during 100+ message scroll (README item 9). Occasional first-render of a complex row is acceptable; persistent blank rows are not.
- Scroll position is preserved across content-height changes (new tokens, late-synced turns) via `maintainVisibleContentPosition` — the list does not jump.
- The FAB visibility logic is correct: hidden near bottom, shown when scrolled up.
- Memory does not climb unboundedly while scrolling a long thread (cross-check in Part 4's memory phase).

### Parity notes

- **ChatGPT iOS / Claude iOS**: long transcripts scroll smoothly with virtualization; a "scroll to bottom" / "jump to latest" affordance appears when you scroll up; the thread opens at the newest message. AGI matches all three behaviors.
- Pull-to-load-earlier is a common pattern; AGI's `RefreshControl` is the equivalent where wired.

### Bug-classification examples

- **High**: scrolling a long thread drops to single-digit FPS / freezes (core UX broken at scale).
- **High**: list jumps to top on every new token (broken `maintainVisibleContentPosition`).
- **Medium**: FAB never appears, or appears but doesn't scroll to bottom.
- **Medium**: persistent blank rows during fast scroll (recycling bug).
- **Medium**: pull-to-refresh duplicates or reorders messages.
- **Low**: FAB fade timing slightly off.
- **Cosmetic**: bounce overscroll a touch too elastic.

### Recovery

If scrolling wedges or the list blanks entirely, relaunch and reopen the thread; capture the pre-wedge `snapshot_ui` + video.

### Checklist

- [ ] Thread opens at the latest message.
- [ ] Smooth momentum scroll + bounce; virtualization holds (no all-at-once render).
- [ ] Scroll-to-bottom FAB shows when scrolled up, hides near bottom, jumps on tap.
- [ ] Scroll position stable across new tokens / late syncs.
- [ ] 100+ messages scroll without sustained jank.
- [ ] Pull-to-refresh (if wired) preserves order.
- [ ] Swipe-to-reply works with haptic.
- [ ] Applied 20-point template; memory sanity noted for Part 4.

---

## Phase 13 — Attachments

### Goal

Verify the Add-to-Chat sheet and the attachment pipeline: photo/camera/file/scan entry points, attachment chips with type/size, the too-large modals, and honest scoping of OCR/cloud-only capabilities (no fake "available" claims).

### Grounding

- The `[+]` button opens **`AddToChatSheet.tsx`** (`testID="add-to-chat-sheet"`, close button `add-to-chat-close`), a `@gorhom/bottom-sheet` at 75%. Sections:
  1. **Attachment row**: `Camera` and `Photos` always; **`File` only when `appMode === 'cloud'`** (file attach is cloud-scoped on mobile — this is deliberate, not a missing button in Local mode).
  2. **Session**: a **Temporary chat** toggle (`EyeOff`, "Memory will not be saved from this chat") — this only stops memory learning; it does not hide the conversation from local history (matches `TemporaryChatToggle.tsx`'s documented behavior).
  3. **Tool availability**: Web search / Image generation toggles (only when their `FEATURES` flags are on), and a **Computer use** row marked `Desktop` + lock (an honest "not on this device" status, never a fake-armed toggle).
  4. **Config links**: Project (Local only), Choose style, Connectors (only if `FEATURES.connectors`).
- Pickers (wired in `chat.tsx`): Camera (`ImagePicker.launchCameraAsync`, requests camera permission), Photos (multi-select up to 5), File (`DocumentPicker` restricted to pdf/doc/docx/txt/csv). Results are pushed into the composer via `chatInputAttachRef.addAttachments`.
- **Attachment chips** render in `AttachmentPreview` (strip above the input) and, after send, inside the user `MessageBubble`: image thumbnails (tap → full-screen) and non-image file rows (`FileText` + filename), with an optional per-file privacy short-label chip sourced from `summarizeSendPreview`.
- **Too-large modals** (`features/edge-cases/components`): `ImageTooLargeModal` (image >10MB or any dimension >8192px; copy "Image too large … ≤10MB", CTA "Got it") and `FileTooLargeModal` (file >50MB; copy "File too large … ≤50MB", CTA "Got it"). Both are inform-and-dismiss `alertdialog`s.
- **Scan/OCR**: there is a `scan` route in the app map. Treat any OCR claim honestly — verify what the runtime actually does before asserting it "reads" a document.

### Preconditions

On the composer. To test the File entry, switch to Cloud mode (if entitled) since File is cloud-scoped; otherwise note its absence in Local as expected.

### Tool sequence

1. `record_sim_video` start (`13-attachments`).
2. `tap` `[+]` → `wait_for_ui` for `add-to-chat-sheet`. `snapshot_ui` → enumerate the four sections. `screenshot` (`13-add-to-chat-sheet`).
3. Confirm **File is absent in Local mode** and present in Cloud mode (switch modes to verify both). `screenshot` each (`13-file-local-absent`, `13-file-cloud-present`).
4. `tap` **Photos** → the system photo picker opens (permission prompt acceptable). Pick 1–2 images → confirm chips appear in the `AttachmentPreview` strip with a thumbnail and (if present) a size/type/privacy label. `screenshot` (`13-photo-chips`).
5. Remove a chip (tap its remove control) → confirm it disappears and send-enabled recomputes. `screenshot` (`13-chip-removed`).
6. `tap` **Camera** → camera permission prompt → (in Simulator, camera is limited; confirm the permission flow and graceful handling rather than a real capture). `screenshot` (`13-camera-flow`).
7. In Cloud mode, `tap` **File** → document picker restricted to the allowed types → pick a file → confirm a file chip with name (+ size where shown). `screenshot` (`13-file-chip`).
8. Trigger **ImageTooLargeModal**: attempt a >10MB / >8192px image if one is available on the device → confirm the modal ("Image too large", "Got it") and that it dismisses cleanly. `screenshot` (`13-image-too-large`).
9. Trigger **FileTooLargeModal**: attempt a >50MB file → confirm the modal ("File too large", "Got it"). `screenshot` (`13-file-too-large`).
10. Send a message with an image attachment → confirm the image renders in the user bubble and taps open the full-screen viewer. `screenshot` (`13-attachment-in-bubble`).
11. Inspect the **Temporary chat** toggle and the **Computer use** `Desktop` row → confirm the latter is honestly marked unavailable-on-device (locked), not a fake-armed control. `screenshot` (`13-honesty-rows`).
12. `record_sim_video` stop.

### Expected UI

- Add-to-Chat sheet opens with the correct sections for the current mode.
- File entry is cloud-scoped; Photos/Camera always present.
- Attachment chips show type and (where available) size; chips are removable.
- Too-large content is rejected with a clear, dismissible modal naming the limit.
- Honesty: cloud/desktop-only capabilities are labeled as such, never presented as live on-device.

### Acceptance criteria

- The cloud-only File scoping is respected and not filed as a bug; the absence in Local is correct.
- Chips carry enough metadata (type/size) to be useful and are removable; removal recomputes send-enabled.
- The 10MB image / 50MB file limits trigger the right modal with the right copy; no silent failure or crash on oversized input.
- No capability is presented as available when the runtime won't serve it (Computer use = Desktop/locked; OCR scoped honestly). A fake-armed toggle is a Critical overclaim.
- Permission prompts are handled gracefully (deny → a clear message, not a crash).

### Parity notes

- **ChatGPT iOS / Claude iOS**: a `+`/attach menu offering camera, photos, and files; image thumbnails as chips with a remove affordance; full-screen image view on tap; size/type limits enforced with a message. AGI matches these behaviors.
- **Honesty divergence (a strength, not a gap)**: where a competitor might expose a capability broadly, AGI deliberately scopes File to Cloud and marks Computer use as Desktop-only. This is correct trust-boundary behavior; do not file it as a parity miss. The bar is: AGI must never _overclaim_ relative to what it serves.

### Bug-classification examples

- **Critical (overclaim)**: a Computer-use or OCR control looks armed and tappable but does nothing / silently no-ops — fake availability shipped to users.
- **Critical (trust)**: attaching a file in Local mode that then egresses off-device for processing without consent.
- **High**: picking an image crashes the app or never produces a chip.
- **Medium**: oversized image is silently dropped with no modal (missing error state).
- **Medium**: chip shows no type/size and can't be removed.
- **Medium**: File entry appears in Local mode and then fails on send (wrong scoping surfaced as a dead control).
- **Low**: privacy/size label truncation.
- **Cosmetic**: chip corner radius mismatch.

### Recovery

If the picker hangs or a permission prompt blocks, dismiss it and relaunch. If a too-large modal won't dismiss, tap "Got it" again or relaunch.

### Checklist

- [ ] Add-to-Chat sheet opens with correct sections per mode.
- [ ] File entry cloud-scoped (absent in Local — not a bug); Photos/Camera always present.
- [ ] Photo/file chips show type/size and are removable; send-enabled recomputes.
- [ ] Camera + Photos permission flows handled gracefully.
- [ ] ImageTooLargeModal (≤10MB) and FileTooLargeModal (≤50MB) fire with correct copy and dismiss.
- [ ] Sent image renders in bubble; tap opens full-screen viewer.
- [ ] Computer use marked Desktop/locked; OCR scoped honestly — no fake-armed toggle.
- [ ] No Local-mode egress on attach.
- [ ] Applied 20-point template, light + dark.

---

## Phase 14 — Search & model switching

### Goal

Verify conversation/history search (where present) and — the load-bearing part — the model picker: it is catalog-driven from `models.json`, shows honest provider labels and capability/availability states, selecting persists across relaunch, and the trust boundary (Local vs Cloud) is never silently crossed.

### Grounding

- **Model picker** = `ModelPickerSheet.tsx` (`testID="model-picker-sheet"`, search input `model-picker-search-input`, close `model-picker-close`), a `@gorhom/bottom-sheet` at `['58%','90%']`. It is **catalog-driven**: models come from the service layer (`getModelListForCloudAccess`) which is fed by `packages/contracts/types/src/models.json` — never a hardcoded list. Sections: **Auto modes** (shown when no query and scope ≠ cloud), **Favorites**, then groups **On device** (`surface: 'local'`) and **Cloud** (`surface: 'cloud_managed'`). Each `ModelRow` shows the model name, provider/runtime labels, capability/thinking affordances, a favorite star, a selected check, and an **install status** (download required / downloading / ready) for local models.
- **Selection logic** (`handleSelectModel`): a `locked` (cloud-gated) model opens the invite/cloud-access flow instead of selecting — it does **not** silently switch you to Cloud. A `download_required`/`failed` local model triggers `prepareModel` (download) before selecting. Selecting persists via the model store; the chat header/composer reflect it.
- **Scope** is passed by the caller: the new-chat screen opens the picker scoped to the active mode (`local` or `cloud`), and tapping the Cloud mode toggle when entitled opens the cloud-scoped picker. The sheet's subtitle states the trust framing ("Local models run on this device. AGI Cloud is managed separately.").
- **Persistence**: the selected model and favorites live in the model store (persisted). After relaunch, the previously selected model should still be selected.
- **Search**: the picker has its own search (`model-picker-search-input`) filtering by name/provider/runtime/id. For **conversation/history search**, check the drawer/recents — if a history search exists there, test it; if not, record its absence (do not invent a search screen that isn't in the build).

### Preconditions

On the composer. At least one local model state visible (installed or download-required).

### Tool sequence — model picker

1. `record_sim_video` start (`14-model-switching`).
2. `tap` the `ModelSelectorButton` (or `chat.mode-toggle.cloud` when entitled) → `wait_for_ui` for `model-picker-sheet`. `snapshot_ui` → enumerate Auto modes, Favorites, On-device, Cloud sections. `screenshot` (`14-model-picker-open`).
3. Confirm models are **catalog-driven**: names/providers/runtimes look like real `models.json` entries, not placeholders; capability/install badges present. `screenshot` (`14-model-rows`).
4. `tap` `model-picker-search-input`, `type_text` a known model substring → confirm the list filters; clear → confirm it restores. `screenshot` (`14-model-search`).
5. Select a **ready local** model → confirm the sheet closes, the composer's `ModelSelectorButton` updates to that name, and the active mode stays **Local**. `screenshot` (`14-local-selected`).
6. Tap a **locked/cloud-gated** model (or `chat.mode-toggle.cloud` without entitlement) → confirm it opens the **cloud-access / invite** flow and does **NOT** silently switch the chat to Cloud. `screenshot` (`14-cloud-gated-prompt`).
7. If a local model is **download-required**, select it → confirm it shows the download/prepare flow (or progress) rather than instantly "becoming" ready (no fake-ready state). `screenshot` (`14-model-download-required`).
8. **Persistence**: select a model, then `stop_app_sim` + `launch_app_sim` (relaunch) → reopen the picker → confirm the same model is still selected. `screenshot` (`14-model-persist-after-relaunch`).
9. `record_sim_video` stop.

### Tool sequence — conversation/history search

1. Open the drawer (Phase 6). `snapshot_ui` → look for a recents/history search field.
2. If present: `type_text` a query that matches a prior conversation title → confirm filtering; clear → confirm restore. `screenshot` (`14-history-search`).
3. If absent: record "no conversation/history search in this build" as a coverage note (not a fabricated pass).

### Expected UI

- Model picker lists real catalog models in honest sections with provider labels, capability/thinking affordances, and accurate install/availability states.
- Selecting a ready model persists and is reflected everywhere; selecting a locked model routes to access, not a silent cloud switch; selecting a not-downloaded model triggers download.
- Search (picker, and history if present) filters correctly.

### Acceptance criteria

- Model IDs/labels come from the catalog (`models.json` via the service) — no invented or hardcoded models. (Cross-check against the locked product rule: never invent model IDs.)
- Provider/runtime labels are accurate (Local = on-device; Cloud = AGI Cloud managed). No model is shown as selectable/ready when it isn't.
- Selection **persists across relaunch** (README/persistence requirement).
- The trust boundary holds: tapping a cloud-gated model or the Cloud toggle without entitlement opens access/invite and never silently moves the user (or their context) to Cloud.
- Capability badges are honest: a thinking/vision/etc. badge appears only for models that have it.

### Parity notes

- **ChatGPT iOS**: a model picker (GPT-4o / o-series / etc.) with short descriptions and a current selection that persists. **Claude iOS**: a model/style selector (Sonnet/Opus/Haiku, styles) persisting across sessions. AGI's catalog-driven picker with sections, search, favorites, and persisted selection matches these _behaviors_.
- **Honesty divergence (strength)**: AGI surfaces install state and Local-vs-Cloud trust framing that competitors don't need (they're cloud-only). The cloud-gated → invite flow is correct trust behavior; do not file it as a parity miss.
- The bar: a user can find, understand (provider/capability), select, and have their model remembered — matching ChatGPT/Claude — while AGI additionally tells the truth about where it runs.

### Bug-classification examples

- **Critical (trust)**: tapping a cloud model silently switches the chat (and prior Local context) to Cloud with no consent/label — trust-boundary violation.
- **Critical (overclaim)**: a model shows as ready/selectable but sending with it fails because it isn't actually installed/served — fake availability.
- **Critical (rule)**: a model row shows an invented/hardcoded model ID not in `models.json`.
- **High**: selecting a model doesn't persist across relaunch (resets to default).
- **High**: model picker is empty / fails to load the catalog.
- **Medium**: capability badge wrong (e.g. "thinking" on a model that can't think).
- **Medium**: search doesn't filter or doesn't clear.
- **Low**: provider label casing/format nit.
- **Cosmetic**: row spacing/badge alignment.

### Recovery

If the picker won't load or selection wedges, relaunch and reopen. If a download flow stalls, note it and continue; the install/storage edge cases are exercised more fully in Part 4.

### Checklist

- [ ] Model picker opens (`model-picker-sheet`) with Auto/Favorites/On-device/Cloud sections.
- [ ] Models are catalog-driven (real `models.json` labels), with honest provider/capability/install states.
- [ ] Picker search filters and clears.
- [ ] Selecting a ready local model updates the composer and stays Local.
- [ ] Cloud-gated model / Cloud toggle (unentitled) opens access — never silent trust switch.
- [ ] Download-required model triggers download, no fake-ready.
- [ ] Selection persists across relaunch.
- [ ] Conversation/history search tested if present, or absence recorded honestly.
- [ ] No invented model IDs; no overclaimed availability.
- [ ] Applied 20-point template, light + dark.

---

## Phase 6–14 exit gate

Before moving to Part 3, confirm:

- [ ] Every screen touched in Phases 6–14 has had the **20-point per-screen template** applied (presence, layout, parity ×2, animation, safe-area, Dynamic Type, dark/light, scroll, haptics, loading, disabled, empty, error, a11y labels, before/after screenshots, workflow video, runtime snapshot, deviations logged, full coverage).
- [ ] **Phase 11 tool-call UX acceptance checklist is fully completed** — this is the release-blocker gate. If any item failed, the build is flagged not-shippable in the end-of-run report with the specific failing items.
- [ ] **No Local-mode egress** was observed in any phase (streaming, tools, attachments, model switching).
- [ ] **No availability overclaims** (fake-ready model, armed-but-dead toggle, cloud presented as live when gated).
- [ ] Every classified issue is recorded with `{severity, phase, screen, testID, expected, actual, screenshot, video, repro, suggested fix}` for the Part 4 report.
- [ ] `record_sim_video` artifacts exist for navigation, composer, keyboard, streaming, the tool-call workflows, long-conversation scroll, attachments, and model switching, named `<phase>-<screen>-<state>`.
- [ ] Any unreachable path (no tool trigger available, no history search in build) is logged as a **coverage gap**, not a fabricated pass.

Tools exercised in Part 2 (carry forward to the Part 4 tool-usage matrix): `snapshot_ui`, `screenshot`, `tap`, `type_text`, `swipe`/`drag`/`gesture`, `long_press`, `key_press`/`key_sequence`/`button`, `wait_for_ui`, `record_sim_video`, `batch`, and `stop_app_sim`/`launch_app_sim` for relaunch-persistence checks. Any of the 44 tools not yet used here are closed out explicitly in Part 4.
