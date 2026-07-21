# Voice-Driven Whole-Desktop Control — Implementation Plan

Status: Proposed (founder-triggered 2026-07-20; recon complete, awaiting 2 decisions)
Owner: Platform lead
Scope: "Speak → the desktop app controls other applications and performs any
action a human could, driven by what the user says."

## Headline: this is ~80% wiring, not a greenfield build

Two independent reconnaissance passes (recon-computeruse, recon-voice-agent)
plus direct code reads confirm the capability already exists in
`apps/desktop`. Three subsystems work in isolation but are **not wired to each
other**. The feature is the seam between them plus a confirmation surface.

## What already exists (REUSE — do not rebuild)

### Speech-to-text — DONE

- `sys/commands/voice.rs:227` `voice_transcribe_blob` — fail-closed provider
  routing (managed cloud / BYOK OpenAI / local Whisper / Deepgram streaming);
  returns `VoiceTranscription { text, ... }`.
- Streaming: `voice_start_deepgram_stream` (voice.rs:942), `deepgram:transcript` events.
- Frontend PTT/recording UX: `hooks/useVoiceTranscription.ts`, `VoiceInputButton`
  (chat/InputToolbar.tsx:170), `VoiceMode.tsx`. TTS present (`voice_tts_speak`, +barge-in).
- Global OS-hotkey dictation state machine exists but is fail-closed OFF
  (`features/speech/dictation/coordinator.rs:36`, gate DESKTOP-SYSTEM-DICTATION-UNWIRED-01).

### The autonomous desktop-control agent (Path B) — DONE + HARDENED THIS SESSION

- `automation/computer_use/observe_plan_act.rs` `ComputerUseAgent::execute_task(ComputerUseTask) -> OpaLoopResult`
  — full observe→plan→act loop: vision observation (visual_reasoner.rs),
  LLM planning, action execution, termination on task_complete / no-progress /
  failure cap / user-cancel.
- Full human-input action vocabulary (`computer_use/types.rs:178` `ComputerUseAction`):
  Click, DoubleClick, TripleClick, RightClick, Type, KeyPress, Hotkey, Scroll,
  Drag, MoveMouse, … over the native AutomationService.
- Tauri command `computer_use_execute_opa_task` (computer_use.rs:825) — takes
  description, provider, model, execution_mode.
- SAFETY (already built): `computer_use/safety.rs` — `SafetyConfig`
  (`require_confirmation_for_destructive: true` by default), `SafetyDecision`
  (risk 0-10, `requires_confirmation`), `SafetyReason`, `PromptInjectionDetector`
  (treats screen/page text as untrusted — the teardown report's #1 agent risk).
  App-permission gating (`AppPermissionManager`).
- CONFIRMATION GATE — PARTIAL / STUB (corrected after full recon): the pause
  side exists (observe_plan_act.rs:409 → `session.pause` emits
  `SessionPaused { session_id, reason, action }`, session.rs:333), but the HITL
  flow is NOT functional — no resume Tauri command, no wait-loop timeout (stub
  comment observe_plan_act.rs:385), and `task.require_confirmation` is never set
  true by callers. NET TODAY: a safety-flagged action ABORTS the task
  (SafetyBlocked) instead of prompting. The working gate is real slice work
  (see gap #2), not just a dialog.
- STRONG SAFETY SUBSTRATE (already built, safety.rs:464): rate limit 120/min,
  negative-coord + system-UI (menu bar/taskbar/corners) block, dangerous-typed-
  content detection, blocked hotkeys (Alt+F4, Ctrl+Alt+Del, Meta+L), protected-
  window titles (password/keychain/security), prompt-injection scan of screen
  text. Per-app allow/deny + a HARDCODED user-unoverridable refuse-list
  ALWAYS_BLOCKED_BUNDLE_IDS (banking/crypto) + ALWAYS_BLOCKED_URL_HOSTS. IPC-level
  confirmation already gates the single-action commands; type_text surfaces only
  a char count (credential guard).
- TRUST (hardened 2026-07-20 this session): execution_mode/provider coherence
  validation (`validate_opa_execution_boundary`, computer_use.rs:786), observe-step
  trust threading (visual_reasoner.rs `VisualReasonerConfig.trust_mode`),
  fail-closed router. Frontend already sends executionMode from privacy mode
  (computerUseStore.ts).

### Intent classifier — DONE (but output currently dropped)

- `core/intent/detector.rs` → `IntentCategory` (FileOperation, WebSearch,
  CodeTask, Email, Calendar, Automation, Database, VersionControl, Media,
  Productivity, Conversation, …); pattern-match then LLM fallback.
- Exposed as `intent_detect` / `intent_detect_with_llm` (sys/commands/intent.rs).
- **Nothing consumes the classification to dispatch execution.**

## The gaps (the actual NEW work — small, bounded)

1. **Voice→agent fork** (`apps/desktop/src/stores/settings/voice.ts:402`).
   Today every transcript is sent as a chat turn. Add a branch: after
   `userText` is produced, classify (`intent_detect_with_llm`); if the intent
   is a desktop-control/action task (not Conversation), dispatch to
   `computer_use_execute_opa_task` with `{ executionMode: activeTrustMode() }`
   instead of the chat send. One fork turns dictation into agent action.

2. **Working confirmation gate (Rust + frontend) — BIGGER than first stated**.
   The pause EMITS `SessionPaused { reason, action }` but the HITL is a stub.
   Must build: (a) set `task.require_confirmation = true` for the voice path;
   (b) a resume/cancel Tauri command that flips `session.resume()`/`cancel()`;
   (c) a bounded wait with timeout in the loop (today it would busy-wait
   forever); (d) confirm `SessionEvent` reaches the webview (Tauri emit) — add
   the channel if missing; (e) a frontend preview dialog (pending action +
   reason, Approve/Cancel). Without (a)-(c), safety-flagged actions abort
   instead of prompting.

2b. **FAIL-OPEN foreground-app gate — SAFETY DEFECT to fix in this slice**
(DESKTOP-COMPUTER-USE-FOREGROUND-GATE-01). safety.rs:405 calls
get_active_window but FAILS OPEN when it can't resolve the app bundle id —
an unrecognized foreground app is permitted. For a voice "control anything"
feature this must fail CLOSED (deny + ask) instead. The anthropic_agent path
is also default-permissive for unknown apps (dormant, but note it).

3. **Autonomy policy = the SafetyConfig risk taxonomy already present.**
   Map the teardown's read_only/reversible/side_effect/destructive to
   `SafetyDecision.risk_level`; `require_confirmation_for_destructive` default
   already gives "confirm side-effecting, run reads freely." Decision #2 below
   only flips this config, not the architecture.

4. **(Latent, Path A only) ExecutorContext trust hole.** The AGI
   `UiExecutor`/`BrowserExecutor` path (executors/mod.rs) runs OS actions with
   no trust_mode in `ExecutorContext`. NOT used by this feature (we target
   Path B), but it is a real latent leak — tracked, fix if Path A is ever the
   voice target.

## Why Path B, not Path A

- Path A (AGI UiExecutor): primitive verbs (ui_click/ui_type/ui_screenshot)
  the planner sequences; ExecutorContext has NO trust field; AGI subsystem does
  not reference the OPA agent at all. Weaker for open-ended "do anything," and
  would require building execution-trust plumbing from scratch.
- Path B (OPA ComputerUseAgent): the autonomous natural-language→desktop loop,
  already trust-aware and safety-gated (this session's work). Correct target.

## Slice sequence (each independently verifiable, confirmation ON throughout)

1+2 MUST LAND TOGETHER (coupling found reading safety.rs:400): the fail-open
gate returns None (allow) when get_active_window() can't resolve the app.
Failing closed = returning `needs_confirmation` — but `requires_confirmation`
currently ABORTS the task (HITL stub). So flipping the gate BEFORE the working
HITL would hard-break computer-use on any setup where foreground detection
fails (e.g. macOS without Automation permission). Build order:

- (2) Working HITL first: set require_confirmation for the voice path, add a
  resume/cancel Tauri command + bounded wait-with-timeout in the loop, confirm
  SessionPaused reaches the webview.
- (1) THEN fail the foreground gate closed → needs_confirmation (now that
  confirmation prompts instead of aborting). safety.rs:405.

3. Confirmation preview dialog (frontend) on SessionPaused → resume/cancel.
4. Voice→intent→OPA dispatch fork in voice.ts (action intents → OPA with
   executionMode + target_application/success_indicators from intent; else chat).
5. End-to-end verify on a bounded task ("open Notes and type X") with a
   side-effecting step gated (screenshot). macOS/Windows only — Linux input
   unsupported (computer_use.rs:526).
6. Only then broaden intent coverage + connector actions.

## Extra recon facts folded in

- Platform: macOS + Windows only; Linux `ensure_supported_platform` errors.
- OCR text_regions inert (visual_reasoner.rs:572) — injection scan does NOT
  cover OCR'd screen text, only description/labels/errors. Widen if OCR enabled.
- `AnthropicComputerUseAgent` fully coded but dormant (no candidates);
  `vision_planner.rs` ActionPlanner is dead code superseded by visual_reasoner.rs.
- OPA command already accepts `target_application` + `success_indicators` — the
  intent router can populate these directly.
- Loop caps (ComputerUseConfig::default): max_iterations 100, max_duration 300s,
  max_consecutive_failures 3, planning_timeout 30s.

## Two decisions pending (asked, user away)

- **Commit checkpoint**: ~90 files (trust slice + 3 catalog waves) verified
  green but uncommitted; recommend committing as clean boundary before building
  the feature on top. (Not committing on own initiative — harness rule: commit
  only when asked.)
- **Action autonomy**: recommend "confirm side-effecting actions" (the
  SafetyConfig default). Building with confirmation ON is safe regardless and
  is relaxable to fully-autonomous by config later.
