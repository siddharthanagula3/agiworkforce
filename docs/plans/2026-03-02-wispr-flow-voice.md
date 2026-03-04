# Wispr Flow Voice Dictation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make hold-to-dictate voice input fully functional — hold hotkey → mic records → release → text appears in chat composer within 1-2 seconds, exactly like Wispr Flow.

**Architecture:** The WebView inside Tauri has full access to the browser's `MediaRecorder API`, so audio capture happens in the frontend JavaScript (no cpal needed). The recorded audio blob is sent to the existing `voice_transcribe_blob` Tauri command which already has a complete HTTP pipeline to transcription APIs. The only missing pieces are: (1) the hotkey wiring is broken in Tauri mode, (2) `voiceInputStore` never actually calls `MediaRecorder`, and (3) no direct OpenAI Whisper path exists for users with their own API key.

**Tech Stack:** TypeScript `MediaRecorder API`, Zustand store (`voiceInputStore.ts`), Tauri `invoke()`, Rust `reqwest` multipart, OpenAI Whisper API (`/v1/audio/transcriptions`), existing `voice_transcribe_blob` command.

---

## Background: What Wispr Flow Does

Research from [Wispr Flow](https://wisprflow.ai) and [open-wispr clone](https://github.com/cpiprint/open-wispr):

- **Hold hotkey** (Fn on Mac, Ctrl+Win on PC) → recording starts
- **Speak naturally** → audio buffered
- **Release hotkey** → ~1s pause → polished text injected at cursor
- **AI post-processing**: removes filler words (um, uh), handles course corrections ("meet tomorrow no wait Friday" → "meet Friday"), adds punctuation
- **Works in every app**: text insertion via clipboard paste at cursor
- **Privacy**: local Whisper option for offline use

Our frontend already has the full UX layer (overlay, hotkeys, AI cleanup). Only the audio capture and transcription wiring are missing.

---

## Root Cause Analysis

### Problem 1: Broken Tauri hotkey path

`useVoiceHotkey.ts` has an `if (isTauri)` branch that listens for `voice:hotkey:pressed` / `voice:hotkey:released` Tauri events — but **nothing ever emits these events**. The document keyboard listener (which works perfectly) is only used in the browser fallback. Fix: always use the document keyboard listener — it works fine in Tauri's WebView.

### Problem 2: voiceInputStore never records audio

`startListening()` calls `invoke('speech_start_recording')` (which is a no-op stub) but **never starts `MediaRecorder`**. `stopListening()` calls `invoke('speech_stop_and_transcribe')` which **returns an empty string**. Fix: use `navigator.mediaDevices.getUserMedia` + `MediaRecorder` in the store, then call `voice_transcribe_blob` with the captured audio bytes.

### Problem 3: No direct OpenAI Whisper path

`voice_transcribe_file` only supports `VoiceProvider::Cloud` (managed API, requires login) and `VoiceProvider::Local` (whisper.cpp, optional feature). Users with their own OpenAI key have no direct path. Fix: add `transcribe_with_openai_direct()` in Rust that reads the key from SecretManager.

---

## Task 1: Fix Tauri Hotkey Wiring

**Files:**

- Modify: `apps/desktop/src/hooks/useVoiceHotkey.ts:33-62`

**Context:** The `if (isTauri)` block registers listeners for `voice:hotkey:pressed` and `voice:hotkey:released` events that are never emitted. The browser fallback path (keydown/keyup on `document`) already works correctly and also works inside Tauri's WebView.

**Step 1: Remove the broken isTauri branch**

Replace the entire `useEffect` body with just the document listener (keep the existing browser-fallback code, delete the Tauri-specific block):

```typescript
// apps/desktop/src/hooks/useVoiceHotkey.ts
export function useVoiceHotkey() {
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);
  const hotkey = useVoiceInputStore((s) => s.hotkey);
  const isListeningViaKeyboard = useRef(false);

  useEffect(() => {
    const accelerator = hotkeyToAccelerator(hotkey);
    const isOptionHotkey = accelerator === 'Alt';
    const isCtrlSpace = accelerator === 'CommandOrControl+Space';
    const isCtrlShiftV = accelerator === 'CommandOrControl+Shift+V';

    const matchesHotkey = (e: KeyboardEvent): boolean => {
      if (isOptionHotkey) return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (isCtrlSpace)
        return (e.ctrlKey || e.metaKey) && e.code === 'Space' && !e.shiftKey && !e.altKey;
      if (isCtrlShiftV)
        return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v';
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isListeningViaKeyboard.current) return;
      if (matchesHotkey(e)) {
        e.preventDefault();
        isListeningViaKeyboard.current = true;
        void startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isListeningViaKeyboard.current) return;
      const releaseMatches =
        (isOptionHotkey && !e.altKey) ||
        (isCtrlSpace && (e.code === 'Space' || (!e.ctrlKey && !e.metaKey))) ||
        (isCtrlShiftV && (e.key.toLowerCase() === 'v' || !e.shiftKey));
      if (releaseMatches) {
        isListeningViaKeyboard.current = false;
        void stopListening();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [hotkey, startListening, stopListening]);
}
```

Also remove the unused import of `isTauri` and `listen` if they are now unused.

**Step 2: Verify the file compiles**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -i "useVoiceHotkey\|voiceHotkey"
```

Expected: no errors for that file.

**Step 3: Commit**

```bash
git add apps/desktop/src/hooks/useVoiceHotkey.ts
git commit -m "fix(desktop): voice hotkey uses document events in tauri (removes broken event-listener path)"
```

---

## Task 2: Add MediaRecorder Audio Capture to voiceInputStore

**Files:**

- Modify: `apps/desktop/src/stores/voiceInputStore.ts`

**Context:** `startListening` must capture audio via `MediaRecorder`. `stopListening` must stop the recorder, collect the audio blob, and route it to Rust for transcription via `voice_transcribe_blob` (NOT the stub `speech_stop_and_transcribe`). The `voice_transcribe_blob` command is already fully implemented and routes through the transcription pipeline.

**Step 1: Add private recording state to the interface**

Add to `VoiceInputState` (after the existing public fields):

```typescript
// Private recording state (not persisted)
_mediaStream: MediaStream | null;
_recorder: MediaRecorder | null;
_audioChunks: Blob[];
```

**Step 2: Initialize private state in the store**

In the `(set, get) => ({` object, add initial values:

```typescript
_mediaStream: null,
_recorder: null,
_audioChunks: [],
```

**Step 3: Implement startListening with MediaRecorder**

Replace the existing `startListening` implementation:

```typescript
startListening: async () => {
  set({ mode: 'listening', transcript: '', error: null, lastTranscriptIsCommand: false });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(100); // collect in 100ms chunks
    set({ _mediaStream: stream, _recorder: recorder, _audioChunks: chunks });
  } catch (e) {
    set({ mode: 'idle', error: String(e) });
  }
},
```

**Step 4: Implement stopListening with voice_transcribe_blob**

Replace the existing `stopListening` implementation:

```typescript
stopListening: async () => {
  const { mode, _recorder, _mediaStream, _audioChunks } = get();
  if (mode !== 'listening' || !_recorder) {
    console.warn('[Voice] stopListening called in wrong state:', mode);
    return;
  }
  set({ mode: 'transcribing' });

  // Stop the recorder and release mic
  await new Promise<void>((resolve) => {
    _recorder.onstop = () => resolve();
    _recorder.stop();
  });
  _mediaStream?.getTracks().forEach((t) => t.stop());

  try {
    const blob = new Blob(_audioChunks, { type: _audioChunks[0]?.type ?? 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));
    const format = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const { provider, language } = get();

    const result = await invoke<{ text: string; language?: string; duration?: number; confidence?: number }>(
      'voice_transcribe_blob',
      { audioData, format, provider, language },
    );

    const rawText = result.text?.trim() ?? '';
    if (!rawText) {
      set({ mode: 'idle', _recorder: null, _mediaStream: null, _audioChunks: [] });
      return;
    }

    const { processTranscript } = get();
    const { text: cleanText, isCommand } = await processTranscript(rawText);

    set({
      mode: 'idle',
      transcript: cleanText,
      lastTranscriptIsCommand: isCommand,
      _recorder: null,
      _mediaStream: null,
      _audioChunks: [],
    });
  } catch (e) {
    set({
      mode: 'idle',
      error: String(e),
      _recorder: null,
      _mediaStream: null,
      _audioChunks: [],
    });
  }
},
```

**Step 5: Update the persist partialize to exclude private fields**

The `partialize` function already excludes non-setting fields, but confirm it doesn't try to persist `_mediaStream`, `_recorder`, `_audioChunks` (they're not in the partialize list, so this is fine by default).

**Step 6: Update voice_transcribe_blob Rust signature to accept provider/language**

The current command signature is:

```rust
pub async fn voice_transcribe_blob(
    audio_data: Vec<u8>,
    format: String,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceTranscription, String>
```

It uses whatever provider is configured in VoiceState. Since `voiceInputStore` has its own provider setting (`local_whisper | deepgram | openai_whisper`) that may not match what Rust thinks, we need to add optional provider/language params to the command. See Task 3.

**Step 7: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -E "voiceInput|Voice" | head -20
```

Expected: no errors.

**Step 8: Commit**

```bash
git add apps/desktop/src/stores/voiceInputStore.ts
git commit -m "feat(desktop): voice capture via mediarecorder, transcribe via voice_transcribe_blob"
```

---

## Task 3: Update voice_transcribe_blob to Accept Provider Override (Rust)

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/voice.rs:205-226`

**Context:** `voice_transcribe_blob` currently uses whatever `VoiceProvider` is stored in `VoiceState.settings`. The frontend's `voiceInputStore` has three provider strings: `local_whisper`, `deepgram`, `openai_whisper`. We need to let the frontend specify which provider to use per-call.

**Step 1: Add optional provider and language params to voice_transcribe_blob**

```rust
#[tauri::command]
pub async fn voice_transcribe_blob(
    audio_data: Vec<u8>,
    format: String,
    provider: Option<String>,   // NEW: "local_whisper" | "openai_whisper" | "deepgram" | None
    language: Option<String>,   // NEW: BCP-47 language code, e.g. "en"
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceTranscription, String> {
    tracing::info!(
        "Transcribing audio blob ({} bytes, format: {}, provider: {:?})",
        audio_data.len(),
        format,
        provider
    );

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("voice_{}.{}", uuid::Uuid::new_v4(), format));
    std::fs::write(&temp_file, &audio_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Determine provider: caller override > stored setting
    let result = {
        let voice_state = state.lock().await;
        let settings = voice_state.settings.lock().await;
        let effective_provider = match provider.as_deref() {
            Some("local_whisper") | Some("local") => VoiceProvider::Local,
            Some("openai_whisper") | Some("cloud") | Some("managed_cloud") => VoiceProvider::Cloud,
            Some("deepgram") => VoiceProvider::Cloud, // deepgram batch → same managed endpoint
            None => settings.provider.clone(),
            _ => settings.provider.clone(),
        };
        // Override language if provided
        let effective_language = language.or_else(|| settings.language.clone());
        let overridden_settings = VoiceSettings {
            provider: effective_provider,
            model: settings.model.clone(),
            language: effective_language,
        };
        drop(settings);
        match overridden_settings.provider {
            VoiceProvider::Cloud => {
                transcribe_with_cloud(&temp_file, &overridden_settings, &voice_state.client).await
            }
            VoiceProvider::WebSpeech => {
                Err("Web Speech API transcription must be done from frontend".to_string())
            }
            VoiceProvider::Local => {
                let local_whisper = voice_state.local_whisper.read().await;
                transcribe_with_local_whisper(
                    &temp_file,
                    &local_whisper,
                    overridden_settings.language,
                )
                .await
            }
        }
    };

    let _ = std::fs::remove_file(temp_file);
    result
}
```

**Step 2: Make VoiceSettings fields Clone-able**

VoiceSettings needs to be cloneable for the override pattern above. Check if `#[derive(Clone)]` is already on the struct:

```bash
grep -n "derive.*Clone.*VoiceSettings\|struct VoiceSettings" apps/desktop/src-tauri/src/sys/commands/voice.rs
```

If `Clone` is missing, add it:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceSettings {
    pub provider: VoiceProvider,
    pub model: String,
    pub language: Option<String>,
}
```

Also add `Clone` to `VoiceProvider` if missing:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VoiceProvider {
    Cloud,
    WebSpeech,
    Local,
}
```

**Step 3: Compile check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | grep -E "error\[|voice_transcribe_blob"
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/voice.rs
git commit -m "feat(rust): voice_transcribe_blob accepts provider/language override per-call"
```

---

## Task 4: Add Direct OpenAI Whisper Path (for users with own API key)

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/voice.rs` (add new function)

**Context:** Users with their own OpenAI API key stored in SecretManager should be able to transcribe directly without going through the managed cloud. This is the `openai_whisper` provider path. If no key is found, fall through to managed cloud.

**Step 1: Add transcribe_with_openai_direct function**

Add after the existing `transcribe_with_managed_cloud` function (around line 378):

```rust
/// Transcribe using the user's own OpenAI API key (from SecretManager).
/// Falls back to managed cloud if the key is not stored.
async fn transcribe_with_openai_direct(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
    client: &Client,
) -> Result<VoiceTranscription, String> {
    // Try to get user's OpenAI API key
    let api_key = crate::sys::security::SecretManager::get_secret("openai_api_key")
        .unwrap_or_default();

    if api_key.is_empty() {
        // Fallback: use managed cloud
        tracing::debug!("[voice] No OpenAI key in SecretManager, falling back to managed cloud");
        return transcribe_with_cloud(audio_path, settings, client).await;
    }

    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    let extension = audio_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webm");

    let file_part = reqwest::multipart::Part::bytes(audio_data)
        .file_name(format!("audio.{}", extension))
        .mime_str(&format!("audio/{}", extension))
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1");

    if let Some(ref lang) = settings.language {
        form = form.text("language", lang.clone());
    }

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("OpenAI Whisper request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI Whisper error {}: {}", status, body));
    }

    let whisper_response: WhisperResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Whisper response: {}", e))?;

    Ok(VoiceTranscription {
        text: whisper_response.text,
        language: whisper_response.language,
        duration: whisper_response.duration,
        confidence: None,
    })
}
```

**Step 2: Route openai_whisper provider to the new function**

In `voice_transcribe_blob`, update the provider matching to call `transcribe_with_openai_direct` for `openai_whisper`:

```rust
Some("openai_whisper") => VoiceProvider::OpenAIWhisper,  // if you add this variant
```

Actually, since adding a new enum variant would require updating all match arms, the simplest approach is to keep the existing `VoiceProvider` enum unchanged and use a string flag. Modify the match in Task 3's implementation:

```rust
let effective_provider = match provider.as_deref() {
    Some("local_whisper") | Some("local") => VoiceProvider::Local,
    Some("openai_whisper") => VoiceProvider::OpenAIWhisper, // handled specially below
    Some("cloud") | Some("managed_cloud") => VoiceProvider::Cloud,
    None => settings.provider.clone(),
    _ => settings.provider.clone(),
};
```

Or simpler: just use a boolean flag in the transcription routing:

```rust
let use_openai_direct = provider.as_deref() == Some("openai_whisper");

let result = if use_openai_direct {
    transcribe_with_openai_direct(&temp_file, &overridden_settings, &voice_state.client).await
} else {
    match overridden_settings.provider {
        VoiceProvider::Cloud => {
            transcribe_with_cloud(&temp_file, &overridden_settings, &voice_state.client).await
        }
        VoiceProvider::Local => {
            let local_whisper = voice_state.local_whisper.read().await;
            transcribe_with_local_whisper(&temp_file, &local_whisper, overridden_settings.language).await
        }
        VoiceProvider::WebSpeech => {
            Err("Web Speech API must be handled in frontend".to_string())
        }
    }
};
```

**Step 3: Check SecretManager API signature**

```bash
grep -n "fn get_secret\|pub fn get\|SecretManager" apps/desktop/src-tauri/src/sys/security/mod.rs | head -10
```

Adjust the `SecretManager::get_secret("openai_api_key")` call to match the actual API. It may be async — if so, add `.await`.

**Step 4: Compile check**

```bash
cd apps/desktop/src-tauri && cargo check 2>&1 | grep "^error"
```

Expected: no errors.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/voice.rs
git commit -m "feat(rust): direct openai whisper path for voice transcription with user api key"
```

---

## Task 5: Wire Transcript to Chat Composer

**Files:**

- Modify: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx` (or wherever the composer is)

**Context:** `voiceInputStore.transcript` is set after transcription. `useVoiceInput.ts` hook likely already subscribes to the store. Verify that the chat composer inserts the transcript text when it changes.

**Step 1: Check how transcript insertion is currently wired**

```bash
grep -rn "transcript\|useVoiceInput\|voiceInputStore" apps/desktop/src/components/UnifiedAgenticChat/ | grep -v ".test." | head -20
```

**Step 2: Check useVoiceInput.ts**

```bash
cat apps/desktop/src/hooks/useVoiceInput.ts
```

Look for whether it inserts the transcript into a textarea ref or the chat store on transcript change.

**Step 3: If transcript insertion is missing, add it**

In the chat composer component, subscribe to the store and insert on transcript change:

```typescript
// In ChatInputArea.tsx or equivalent
import { useVoiceInputStore } from '../../stores/voiceInputStore';
import { useEffect, useRef } from 'react';

// Inside the component:
const transcript = useVoiceInputStore((s) => s.transcript);
const lastTranscriptIsCommand = useVoiceInputStore((s) => s.lastTranscriptIsCommand);
const clearTranscript = useVoiceInputStore((s) => s.clearTranscript);
const prevTranscriptRef = useRef('');

useEffect(() => {
  if (!transcript || transcript === prevTranscriptRef.current) return;
  prevTranscriptRef.current = transcript;

  if (lastTranscriptIsCommand) {
    // Voice command: replace entire composer text
    setInputValue(transcript);
  } else {
    // Dictation: append to existing text with a space
    setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }

  clearTranscript();
}, [transcript, lastTranscriptIsCommand, clearTranscript]);
```

**Step 4: Verify overlay renders**

The `VoiceInputOverlay` must be mounted somewhere in the app layout. Check:

```bash
grep -rn "VoiceInputOverlay\|useVoiceHotkey" apps/desktop/src/components/ apps/desktop/src/App.tsx | grep -v ".test."
```

If not mounted, add to the root layout:

```typescript
// In App.tsx or Layout component
import { VoiceInputOverlay } from './components/Voice/VoiceInputOverlay';
import { useVoiceHotkey } from './hooks/useVoiceHotkey';

function App() {
  useVoiceHotkey(); // register hotkey listener
  return (
    <>
      <VoiceInputOverlay />
      {/* rest of app */}
    </>
  );
}
```

**Step 5: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep "^src" | grep -v "\.test\." | head -20
```

**Step 6: Commit**

```bash
git add apps/desktop/src/components/ apps/desktop/src/App.tsx
git commit -m "feat(desktop): wire voice transcript into chat composer on dictation complete"
```

---

## Task 6: End-to-End Smoke Test

**Step 1: Start the app**

```bash
cd apps/desktop && pnpm dev
```

**Step 2: Manual test sequence**

1. Open the app
2. Click in the chat input area
3. Hold Option key (or Ctrl+Space)
4. **Expected**: Pulsing red mic overlay appears with "⌥ Release to transcribe"
5. Speak: "Hello this is a test of the voice input"
6. Release Option key
7. **Expected**: Overlay changes to "Transcribing..."
8. **Expected** (after 1-2s): Overlay disappears, text appears in chat input — cleaned up (no filler words, proper punctuation)

**Step 3: Check browser console for errors**

Open DevTools in Tauri (Cmd+Option+I), check Console for:

- `getUserMedia` permission errors
- `voice_transcribe_blob` invoke errors
- Any network errors from the transcription API

**Step 4: Verify transcription flow reaches Rust**

In the running Tauri window, check if you see log output:

```
Transcribing audio blob (XXXX bytes, format: webm, provider: Some("openai_whisper"))
```

If no Rust logs appear, the `invoke('voice_transcribe_blob')` call is not reaching Rust — check the frontend error.

---

## Task 7: Handle Mic Permission UX (Polish)

**Files:**

- Modify: `apps/desktop/src/stores/voiceInputStore.ts`

**Context:** `getUserMedia` throws `NotAllowedError` if the user denies mic permission. The error should show a helpful message, not just "NotAllowedError".

**Step 1: Add permission error handling to startListening**

```typescript
startListening: async () => {
  set({ mode: 'listening', transcript: '', error: null, lastTranscriptIsCommand: false });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // ...rest of implementation...
  } catch (e) {
    const err = e as Error;
    const msg = err.name === 'NotAllowedError'
      ? 'Microphone access denied. Allow mic access in System Preferences → Privacy → Microphone.'
      : err.name === 'NotFoundError'
        ? 'No microphone found. Connect a mic and try again.'
        : String(e);
    set({ mode: 'idle', error: msg });
  }
},
```

**Step 2: Commit**

```bash
git add apps/desktop/src/stores/voiceInputStore.ts
git commit -m "fix(desktop): voice dictation shows helpful mic permission error messages"
```

---

## Known Limitations (Post-MVP)

1. **System-wide hotkey** (when app is not focused): Requires native global shortcut registration. The current fix only works when the AGI Workforce window has focus. For true Wispr Flow-style global dictation in any app, a future sprint should wire the `voice_input` shortcut in `shortcuts.rs` to emit `voice:hotkey:pressed` and handle text insertion via clipboard paste.

2. **Audio format compatibility**: WebM/Opus (used on macOS/Linux) is supported by OpenAI Whisper. On some systems, `audio/mp4` may be the only format available — test on each platform.

3. **Deepgram streaming**: For lower latency, a future sprint can switch from batch transcription (MediaRecorder → blob → Whisper) to streaming Deepgram (WebSocket + real-time transcript), using the already-complete `deepgram.rs` implementation.

4. **Local Whisper**: The `local-whisper` feature gate is not enabled by default. Users can enable it by building with `--features local-whisper`. A future sprint should add a download UI in Settings.
