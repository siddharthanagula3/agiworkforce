# Rust Fixes Needed

## Desktop chat: explicit model selection should bypass implicit agent routing

### Why this follow-up exists

The desktop surface now avoids forcing `enableAgentMode` when the user explicitly selects a concrete model in the React UI. That fixes the frontend-side regression where `Always Use Agent Mode` overrode normal LM chat.

There is still a backend-only gap in the Tauri chat command:

- [mod.rs](/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs#L218)
- [mod.rs](/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs#L2753)

`detect_agent_mode()` currently derives agent execution from:

- `request.enable_agent_mode == Some(true)`, or
- `detect_agentic_intent(content)`

That means a user who explicitly selected a concrete model can still be diverted into agent mode if their prompt is classified as an action request.

### Product impact

This creates a cross-layer inconsistency:

- Frontend intent: "use the model I selected"
- Backend behavior: "ignore that and run the agent orchestrator"

In practice this can still produce:

- delayed/non-streaming chat replies
- `Executing agent plan...` behavior for prompts that should be normal model chat
- mismatch between the selected model UX and actual execution path

### Recommended Rust patch

Extend backend agent-mode detection so explicit model selection suppresses implicit agent routing.

Suggested approach:

1. Add an explicit-model signal to the request handling path.
   The backend already receives `model_override`.

2. Treat `model_override` as explicit if it is:
   - not empty
   - not `auto`
   - not prefixed with `auto-`

3. Change `detect_agent_mode()` usage so implicit `detect_agentic_intent(content)` is skipped when an explicit model is selected.

Conceptually:

```rust
fn is_explicit_model_selection(model_override: Option<&str>) -> bool {
    matches!(
        model_override.map(str::trim),
        Some(model) if !model.is_empty() && model != "auto" && !model.starts_with("auto-")
    )
}
```

Then:

```rust
let explicit_model = is_explicit_model_selection(request.model_override.as_deref());

let agent_mode = if explicit_model {
    request.enable_agent_mode == Some(true)
} else {
    detect_agent_mode(request.enable_agent_mode, &request.content, &app_handle)
};
```

### Expected behavior after Rust patch

- Explicit concrete model selected:
  normal LLM chat path unless the user explicitly enabled agent mode for that request.

- Auto model selected:
  current agent-intent behavior preserved.

- Global "Always Use Agent Mode":
  still respected when intentionally enabled from the frontend, but no longer inferred indirectly for explicit model chat.

### Validation to run after Rust change

1. Select `gpt-4o` or `claude-sonnet-4.6` in desktop chat and send:
   `hi`
   Expected: normal chat streaming, no agent-plan path.

2. Select `gpt-4o` and send an action-heavy prompt like:
   `find the issue in this repo`
   Expected: still normal model chat unless agent mode was explicitly enabled.

3. Select `auto-balanced` and send the same action-heavy prompt.
   Expected: existing agent/autonomous behavior unchanged.

---

## CodeRabbit: productivity_executor.rs test uses `::new()` instead of `::default()`

### File

`apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs` (line 756)

### Issue

The `test_default_impl` test calls `ProductivityExecutor::new()` instead of `ProductivityExecutor::default()`. The struct derives `#[derive(Default)]`, so the test should verify the `Default` trait implementation works correctly. Using `::new()` tests the constructor but not the derived trait, making the test name misleading.

### Fix

Change `::new()` to `::default()` in the test:

```rust
// Before
let executor = ProductivityExecutor::new();

// After
let executor = ProductivityExecutor::default();
```

### Validation

```bash
cargo test --package agi-desktop -p agi-desktop -- core::agi::executors::productivity_executor::tests::test_default_impl
```

---

## CodeRabbit: file_executor_tests.rs test uses `::new()` instead of `::default()`

### File

`apps/desktop/src-tauri/src/core/agi/executors/tests/file_executor_tests.rs` (line 78)

### Issue

The `test_file_executor_default` test calls `FileExecutor::new()` instead of `FileExecutor::default()`. Same inconsistency as the productivity executor test above — the struct derives `#[derive(Default)]` but the test does not exercise the derived trait.

### Fix

Change `::new()` to `::default()` in the test:

```rust
// Before
let executor = FileExecutor::new();

// After
let executor = FileExecutor::default();
```

### Validation

```bash
cargo test --package agi-desktop -p agi-desktop -- core::agi::executors::tests::file_executor_tests::test_file_executor_default
```

---

## Wispr Flow Voice Dictation — Tauri Command Stubs

**Workstream H (voice-agent)** — User has authorized direct Rust edits but the
pre-commit hook prevents edits to `.rs` files. Add these two stubs manually.

### What to add

**File:** `apps/desktop/src-tauri/src/sys/commands/voice.rs` — append after the
`voice_tts_is_playing` function at line 1727.

```rust
// =============================================================================
// Wispr Flow Voice Dictation Commands
// =============================================================================

/// Result returned by speech_stop_and_transcribe
#[derive(Debug, Serialize, Deserialize)]
pub struct SpeechTranscriptResult {
    pub text: String,
    pub confidence: f32,
}

/// Start recording audio from the microphone for Wispr Flow dictation.
///
/// Stub: returns Ok(()) immediately. Wire to a `cpal` audio capture stream in
/// a future iteration once the audio pipeline is fully plumbed end-to-end.
#[tauri::command]
pub async fn speech_start_recording(provider: String) -> Result<(), String> {
    tracing::info!("[speech] start_recording provider={}", provider);
    Ok(())
}

/// Stop recording and transcribe the captured audio.
///
/// Stub: returns an empty transcript. Wire to `WhisperLocal` or the Deepgram
/// client in a follow-up once `cpal` audio capture is plumbed end-to-end.
#[tauri::command]
pub async fn speech_stop_and_transcribe(
    provider: String,
    language: String,
) -> Result<SpeechTranscriptResult, String> {
    tracing::info!(
        "[speech] stop_and_transcribe provider={} language={}",
        provider,
        language
    );
    Ok(SpeechTranscriptResult {
        text: String::new(),
        confidence: 0.0,
    })
}
```

**File:** `apps/desktop/src-tauri/src/lib.rs` — inside the `generate_handler![...]`
macro, add two new lines alongside the other voice commands (near line 1727):

```rust
crate::sys::commands::voice::speech_start_recording,
crate::sys::commands::voice::speech_stop_and_transcribe,
```

### Validation

```bash
cargo check --package agi-desktop
```

Expected: no errors. The two new commands compile cleanly as simple async stubs.
