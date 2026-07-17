# Desktop System Dictation

Status: Planned
Owner: Desktop + speech
Last updated: 2026-07-16

## Outcome

Build AGI Dictation as a system-wide, privacy-controlled speech-to-text and
voice-action layer for AGI Desktop. A user can hold a configurable global
shortcut in another application, speak naturally, review visible progress, and
receive polished text in the exact field that was focused when dictation began.

This is not the conversational voice mode and is not limited to AGI's chat
composer. The feature is complete only when capture, transcription,
post-processing, safe injection, personalization, permissions, recovery,
settings, and signed-build verification work end to end on macOS, Windows, and
Linux. Do not expose availability from the presence of isolated commands or UI.

## Verified Reference Capabilities

The capability target is informed by Wispr Flow's current official product
material, without copying its brand, source code, or visual design:

- Dictation into any application or website.
- Automatic punctuation, filler removal, course-correction handling, lists, and
  formatting.
- Personal and shared dictionaries, snippets, and writing styles.
- App-aware tone and optional surrounding-text context.
- Developer terminology, file names, camelCase, snake_case, acronyms, CLI
  commands, and syntax-aware formatting.
- Multilingual transcription, microphone selection, privacy controls, and
  organization policy.

Sources checked 2026-07-16:

- <https://wisprflow.ai/features>
- <https://wisprflow.ai/developers>
- <https://wisprflow.ai/data-controls>

The user-provided Wispr Flow and Lemon screenshots are interaction and
capability references only. AGI keeps its own information architecture, visual
language, copy, and implementation.

## Current Repository Truth

Implemented pieces:

- Browser-window audio capture and transcription state in
  `apps/desktop/src/stores/settings/voice.ts`.
- Cloud and Local Whisper command surfaces in
  `apps/desktop/src-tauri/src/sys/commands/voice.rs`.
- A dictation overlay in
  `apps/desktop/src/features/voice/VoiceInputOverlay.tsx`.
- Global keyboard-hook and synthetic text-entry commands in
  `apps/desktop/src-tauri/src/sys/commands/voice_global.rs`.
- Microphone and Accessibility usage descriptions and macOS entitlements.
- Local Whisper model management, Deepgram-related commands, TTS, wake-word,
  VAD, and barge-in components.

Not implemented end to end:

- The global PTT events have no consumer, so they never start capture, stop
  capture, process a transcript, or inject text.
- The global listener cannot be stopped reliably; its blocking listener remains
  alive after the running flag changes.
- The live hotkey hook is scoped to the AGI webview document, not the operating
  system.
- Injection does not pin and revalidate the original target application, window,
  and field.
- The current injector types through Enigo only; it has no large-text strategy,
  clipboard save/restore transaction, secure-field refusal, or focus-race
  recovery.
- No dictionary, snippet, correction-learning, per-app style, team vocabulary,
  or usage-insight data model exists.
- Microphone selection and device-change recovery are absent.
- The backend capture path assumes an f32 input stream and does not dispatch on
  the device's actual sample format.
- Comments and UI describe the feature with a competitor's product name.
- There is no signed-build, cross-application end-to-end regression suite.

The durable defect is tracked as `DESKTOP-SYSTEM-DICTATION-UNWIRED-01` in
`docs/agent-context/known-flaws.md`.

## Boundary And Privacy Contract

AGI Dictation follows the same immutable trust boundaries as chat:

- Local: capture, transcription, cleanup, dictionary, snippets, and history stay
  on the device. No managed or BYOK fallback is allowed.
- BYOK: audio may go only to the explicitly selected provider after the user
  enables BYOK dictation and sees the provider label and retention notice.
- Managed Cloud: audio may go only after explicit managed-dictation selection,
  authentication, entitlement, metering, retention disclosure, and policy
  admission.
- Changing the dictation mode never changes an existing session silently.
- Active-app identity may be collected locally for formatting and policy.
  Surrounding text, selected text, accessibility trees, screenshots, and field
  contents are separate opt-in capabilities with a payload preview and per-app
  controls.
- Secure/password fields, deny-listed applications, lock screens, and unknown
  privileged targets fail closed.
- Raw audio and transcripts are not telemetry. Usage metrics contain counts,
  latency, error category, and coarse app category only, unless a separate
  explicit diagnostic consent is active.

## Canonical Architecture

```text
apps/desktop/src/features/dictation/
  overlay/                 visible capture, processing, preview, and error states
  settings/                shortcut, device, mode, language, privacy, personalization
  dictionary/              personal vocabulary UI
  snippets/                phrase-expansion UI
  app-profiles/            per-application behavior and context permissions
  services/                frontend orchestration over the typed command client
  stores/                  transient UI state only

apps/desktop/src-tauri/src/features/speech/dictation/
  coordinator.rs           one state machine and cancellation owner
  capture.rs               device selection, sample conversion, VAD, resampling
  hotkey.rs                platform hook lifecycle and debouncing
  target.rs                focused app/window/field snapshot and revalidation
  inject.rs                atomic insertion strategies and rollback
  context.rs               consented app/selection/surrounding-text acquisition
  postprocess.rs           deterministic correction pipeline
  persistence.rs           device-local settings, vocabulary, snippets, corrections
  policy.rs                trust boundary, secure-field, app, and enterprise policy
  events.rs                versioned progress/error/result events

packages/contracts/types/src/dictation/
  versioned settings, modes, events, permissions, profiles, dictionary, snippets

packages/client/desktop-command-client/src/dictation/
  typed Tauri commands and event subscriptions
```

Do not create a shared Rust speech crate until a second native consumer needs
the same engine. The Desktop operating-system adapter remains app-owned; pure
contracts and provider-independent processing may be extracted later with
consumer proof.

## State Machine

```text
disabled
  -> ready
  -> arming
  -> recording
  -> transcribing
  -> formatting
  -> previewing
  -> injecting
  -> completed

Any active state
  -> cancelling -> ready
  -> failed -> recoverable action -> ready
```

One coordinator owns the state machine. UI stores reflect its events and never
run a second capture or transcription pipeline. Every session has a unique ID;
late events from an older session are ignored. Start, stop, cancel, retry, and
inject are idempotent.

## Processing Pipeline

1. Capture and pin the focused target identity.
2. Admit the request through trust, application, secure-field, and enterprise
   policy.
3. Capture the selected microphone in its native sample format.
4. Apply VAD and bounded buffering; cancel on device removal or permission loss.
5. Transcribe through the explicitly selected Local, BYOK, or Managed adapter.
6. Apply deterministic normalization: spacing, punctuation commands, filler
   handling, backtracking, numbers, lists, and casing.
7. Apply personal/team dictionary and exact snippet expansion.
8. Apply the per-app profile and optional developer-aware formatting.
9. If enabled, run LLM cleanup through the same explicit trust boundary; never
   use the currently selected chat provider implicitly.
10. Show an editable preview when policy or confidence requires it.
11. Revalidate the pinned target, then inject atomically or refuse safely.
12. Persist settings/corrections allowed by the active mode; emit content-free
    operational metrics.

## Injection Strategy

Injection is a transaction, not an unguarded keyboard call:

- Snapshot application identifier, process, window, focused element, selection,
  and clipboard generation before recording.
- Revalidate them immediately before insertion. If focus changed, show a target
  chooser or copy the result; never type into the new field silently.
- Prefer the platform Accessibility text-value/selection API when permitted.
- Use clipboard paste for large or complex Unicode text only after saving the
  clipboard and restoring it if the user has not changed it concurrently.
- Use synthetic typing only as a bounded fallback for compatible fields.
- Detect secure fields and refuse before any context read or text injection.
- Preserve undo semantics, cursor location, and selected-text replacement.
- Surface a recoverable result card when insertion fails; never discard a valid
  transcript.

## Personalization Model

Device-local records:

- `dictation_settings`
- `dictation_app_profiles`
- `dictation_dictionary_entries`
- `dictation_snippets`
- `dictation_correction_events`
- `dictation_usage_daily`

Each record carries an ID, scope, version, timestamps, and deletion tombstone.
Dictionary entries distinguish preferred spelling, spoken aliases, language,
case sensitivity, and optional app scope. Snippets distinguish exact trigger,
formatted payload, language, app scope, and whether confirmation is required.

Cloud/team synchronization is a separate adapter used only in Managed mode.
Local records do not sync. Enterprise vocabulary and snippets are read-only or
policy-owned when required, with explicit precedence over user records.

## User Experience

Required surfaces:

- First-run permission and privacy setup.
- Compact floating overlay on the active monitor with recording level,
  transcribing, formatting, preview, inserting, success, cancellation, and
  actionable error states.
- Settings for global shortcut, hold/toggle behavior, microphone, input level,
  mode/provider, language/auto-detect, formatting, preview policy, context
  permissions, dictionaries, snippets, app profiles, local model downloads,
  privacy, retention, and diagnostics.
- Correction flow that can add a preferred spelling only after explicit opt-in.
- Visible Local/BYOK/Managed label during every recording and preview.
- Keyboard-only and screen-reader-operable controls, reduced motion, high
  contrast, and no color-only state communication.

AGI's overlay and settings use the existing design tokens and navigation. They
must not reproduce the reference sites' layout, typography, illustrations,
copy, or branding.

## Delivery Sequence

1. Contract and truth cleanup
   - Rename competitor-branded identifiers/comments to AGI Dictation.
   - Add versioned contracts and one capability probe.
   - Hide or label the current global control unavailable until the live path is
     proven.
2. Coordinator and platform hooks
   - Replace the non-stoppable listener with platform adapters that have real
     start/stop lifecycle, permission reporting, repeat suppression, and tests.
   - Connect shortcut events to the single coordinator.
3. Capture and transcription
   - Add microphone enumeration/selection, sample-format dispatch, device-change
     recovery, bounded audio, cancellation, and explicit mode adapters.
4. Safe target and injection
   - Add target pinning/revalidation, secure-field refusal, accessibility and
     clipboard strategies, focus-race handling, and transcript recovery.
5. Formatting and personalization
   - Add deterministic corrections, dictionary, snippets, app profiles,
     developer formatting, and optional boundary-safe LLM cleanup.
6. UX and enterprise policy
   - Complete overlay/settings/accessibility, team policy, retention, and
     content-free telemetry.
7. Release proof
   - Signed/notarized cross-app tests on all supported OS versions, upgrade and
     rollback tests, permission-reset tests, and performance/privacy review.

Do not call an earlier phase “system-wide dictation.” Availability becomes true
only after phase 7 passes for that operating system and release channel.

## Release Gates

- Global listener start/stop/restart does not leak threads or duplicate events.
- Holding and releasing the shortcut produces exactly one session.
- A focus change cannot inject into the wrong application or field.
- Secure fields receive no context read, transcript, clipboard write, or input.
- Local mode passes an offline network-denial test.
- BYOK and Managed mode show the target and never cross boundaries silently.
- Microphone removal, sleep/wake, app crash, network loss, provider timeout,
  cancellation, and relaunch preserve or recover the transcript safely.
- Unicode, emoji, RTL, CJK, code, Markdown, long text, lists, and multi-line
  content insert correctly with undo support.
- Dictionary/snippet precedence and deletion are deterministic.
- Overlay is usable on multiple monitors, full-screen apps, and reduced-motion
  settings.
- No raw audio, transcript, surrounding text, or selected text appears in logs,
  crash reports, analytics, or usage metrics.
- macOS notarization, Windows signing, Linux packaging, updater, and rollback
  checks pass for the feature-enabled build.
