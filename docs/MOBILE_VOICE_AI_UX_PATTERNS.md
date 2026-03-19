# Mobile Voice AI UX Patterns (2026)

Research-backed guide for implementing voice AI on mobile. Covers activation models, visual design, barge-in handling, audio routing, multimodal input, accessibility, and TTS voice presets. Based on competitive analysis of ChatGPT Advanced Voice, Gemini Live, Claude Voice, Perplexity Voice, Grok Voice, and Pi as of March 2026.

---

## 1. Voice Activation Models

Three primary activation models exist. The industry consensus in 2026 favors a hybrid approach.

### 1.1 Push-to-Talk (PTT)

**How it works:** User holds a button to record; release sends audio for processing.

**Pros:**

- Zero false activations
- Clear start/end boundaries for the audio engine
- Works in noisy environments
- No always-listening privacy concern
- Lowest battery drain

**Cons:**

- Requires hands (not truly hands-free)
- Awkward for long utterances

**Implementation notes:**

- Use 300ms threshold to distinguish tap from hold (current AGI Workforce pattern in `VoiceInputButton.tsx`)
- Haptic feedback on press-in (Medium impact) and release (Light impact)
- Show pulsing ring animation during hold
- Fall back to PTT when wake word detection is unavailable

### 1.2 Tap-to-Toggle

**How it works:** User taps mic to start recording; taps again (or silence-detected) to stop.

**Pros:**

- Hands-free after initial tap
- Natural for longer dictation
- Clear user intent signal

**Cons:**

- User must remember to stop recording
- Silence detection can cut off mid-thought

**Implementation notes:**

- Combine with Voice Activity Detection (VAD) for automatic end-of-speech detection
- Use 1.5-2s silence threshold before auto-stopping
- Show recording duration timer and pulsing red dot
- Provide both cancel (X) and send (checkmark) actions

### 1.3 Wake Word / Always-Listening

**How it works:** Device listens for a trigger phrase ("Hey [Name]"), then activates.

**Pros:**

- Fully hands-free
- Most natural interaction model
- Enables ambient computing use cases

**Cons:**

- Privacy concerns (microphone always active)
- Battery drain from continuous audio processing
- False activations from similar-sounding speech, TV, background conversation
- Intrusive for AI assistants that attempt follow-up listening (the "Alexa Plus problem")

**2026 industry direction:**

- Google's "Look and Talk" uses on-device gaze + proximity detection instead of wake words
- Picovoice and Sensory promote "Smart Wakewords" that run on-device at ultra-low power with advanced noise filtering
- Wake word processing MUST run on-device (not cloud) for privacy, latency, and reliability
- Custom branded wake words are becoming a UX differentiator

**Recommendation for AGI Workforce:**

- v1: PTT (hold) + tap-to-toggle (tap) as the dual-mode system (already implemented)
- v1: Long-press opens full voice conversation mode (already implemented)
- v2: Add optional on-device wake word via Picovoice Porcupine SDK
- v2: Wake word should be configurable (default: "Hey Workforce")
- Always provide a visual/manual fallback for wake word activation

---

## 2. TTS Voice Personality & Presets

### 2.1 Competitive Landscape

| App         | Voice Count | Voice Names                              | Technology          |
| ----------- | ----------- | ---------------------------------------- | ------------------- |
| Claude      | 5           | Buttery, Airy, Mellow, Glassy, Rounded   | ElevenLabs          |
| ChatGPT     | 9           | Various character voices                 | OpenAI custom       |
| Gemini Live | 10+         | Adjustable speed, accents, 40+ languages | Google Native Audio |
| Perplexity  | 6           | Unnamed, two interaction modes           | Multi-provider      |
| Grok        | 4+          | Unnamed                                  | xAI custom          |

### 2.2 Voice Preset Architecture

A voice preset combines multiple parameters into a single user-selectable personality:

```
VoicePreset {
  id: string              // "warm-professional"
  displayName: string     // "Warm Professional"
  description: string     // "Clear, confident, and approachable"
  provider: TTSProvider   // "system" | "elevenlabs" | "openai"
  voiceId: string         // Provider-specific voice identifier
  rate: number            // 0.8 - 1.2 typical range
  pitch: number           // 0.9 - 1.1 typical range
  stability: number       // ElevenLabs: 0.0 - 1.0
  similarityBoost: number // ElevenLabs: 0.0 - 1.0
}
```

### 2.3 Recommended Preset Set (5 voices)

Following Claude's five-voice pattern with distinct personalities:

1. **Clear** -- Neutral, professional, slightly fast. Default for informational responses.
2. **Warm** -- Slower pace, lower pitch, conversational. Best for emotional support / long-form.
3. **Crisp** -- Higher pitch, energetic, precise articulation. Best for technical content.
4. **Calm** -- Slowest pace, soft tone, measured. Best for accessibility and focus.
5. **Lively** -- Dynamic range, expressive, varied pacing. Best for creative and brainstorming.

### 2.4 Emotion & Style Prompting (2026 Capability)

Gemini 2.5 and ElevenLabs now support style prompts that control tone beyond static presets:

- Style prompts: "cheerful and optimistic", "somber and serious", "excited but controlled"
- Context-aware speed adjustments: faster for simple content, slower for complex explanations
- Multi-speaker consistency: maintain character voice across conversation turns

**Implementation path:**

- v1: System TTS with 5 presets (rate/pitch combinations) -- current state
- v2: ElevenLabs Flash v2.5 integration (75ms latency, streaming, 380+ voices)
- v3: Dynamic style prompting based on response content sentiment

### 2.5 TTS Provider Comparison (2026 Benchmarks)

| Provider                 | Latency (TTFB)   | Quality (ELO) | Voices   | Languages | Cost |
| ------------------------ | ---------------- | ------------- | -------- | --------- | ---- |
| ElevenLabs Flash v2.5    | 75ms / 135ms e2e | 1,108         | 380+     | 70+       | Mid  |
| OpenAI TTS               | ~150ms           | 1,050+        | 6        | 57        | Mid  |
| Google Cloud TTS         | ~100ms           | N/A           | 380+     | 75+       | Low  |
| System TTS (iOS/Android) | <10ms            | Varies        | Platform | Platform  | Free |

For mobile, prioritize latency: System TTS for v1 (zero network dependency), ElevenLabs Flash for v2 (best quality-to-latency ratio with streaming support).

---

## 3. Voice Mode Visual Design

### 3.1 The Orb Pattern (Industry Standard)

Every major voice AI app in 2026 uses a centered animated orb as the primary visual element:

**Anatomy of the voice orb:**

- **Outer glow ring**: Ambient halo that pulses with audio energy. Opacity 0.1-0.5.
- **Main orb**: Solid circle (100-140px diameter on mobile). Scales 0.95x-1.15x with audio level.
- **Inner content**: Waveform bars, icon, or particle system inside the orb.
- **Color coding by phase**: Each conversation phase gets a distinct color.

**Phase-to-color mapping (current AGI Workforce implementation):**

| Phase     | Color            | Animation                           | Meaning                |
| --------- | ---------------- | ----------------------------------- | ---------------------- |
| Idle      | Muted gray       | Static, subtle breathe              | Waiting for user input |
| Listening | Blue (#3b82f6)   | Scale reacts to audio level         | User is speaking       |
| Thinking  | Purple (#a855f7) | Rhythmic pulse (0.95x-1.15x, 800ms) | AI processing          |
| Speaking  | Teal (#21808d)   | Scale reacts to TTS amplitude       | AI is responding       |

### 3.2 Waveform Visualization

**Bar waveform** (current implementation): 5-7 vertical bars with spring-based animation.

Design parameters:

- Bar count: 5-7 (fewer = cleaner on mobile)
- Bar width: 3-4px with 2:1 aspect ratio rounded caps
- Max height: 32-48px
- Min height: 4-6px (keeps bars visible even in silence)
- Gap: 3-5px between bars
- Animation: Spring physics (damping: 12, stiffness: 150) for organic movement
- Phase offset: Each bar gets `index * 80ms` delay for wave-like motion
- Audio-reactive: `minHeight + (maxHeight - minHeight) * audioLevel * phaseMultiplier`

**Alternative visualizations for v2:**

- **Frequency spectrum**: FFT-derived bars showing actual frequency distribution
- **Circular waveform**: Bars arranged radially around the orb perimeter
- **Particle system**: Dots/particles that scatter with audio energy
- **Gradient ring**: Smooth color gradient ring that rotates and pulses

### 3.3 Speaking Indicator Patterns

When AI is speaking back, the UI should show:

1. **Waveform inside orb** -- bars animate to TTS audio level (current approach)
2. **Real-time transcript** -- text appears word-by-word below the orb as the AI speaks
3. **Tap-to-interrupt affordance** -- subtle "Tap to interrupt" label or pulsing border

**ChatGPT's 2025 evolution (critical learning):**

- ChatGPT moved AWAY from the separate full-screen voice mode with animated blue circle
- Voice mode now stays inline in the chat view with live transcript appearing on screen
- Users can see chat history, images, and visual responses while in voice mode
- This unified approach is now the industry direction

**Recommendation:** Keep full-screen voice mode as an immersive option (long-press activation), but also support inline voice within the chat view (tap mic for inline recording with live transcript).

### 3.4 Transition Animations

Smooth transitions between phases are essential for perceived quality:

- **Idle to Listening**: Spring scale-up (200ms), color crossfade, haptic Light impact
- **Listening to Thinking**: Scale compress to 0.95x, color shift blue-to-purple, audio level drops to 0
- **Thinking to Speaking**: Color shift purple-to-teal, pulse stops, waveform resumes
- **Speaking to Listening** (auto-listen): Color shift teal-to-blue, continuous (no idle gap)
- **Any to Idle**: Spring scale-down, color fade to gray, 300ms settle

Use `react-native-reanimated` shared values for 60fps animations on the UI thread.

---

## 4. Barge-In / Interruption Handling

Barge-in is the ability to interrupt the AI while it is speaking. This is critical for natural conversation.

### 4.1 Technical Requirements (2026 Standard)

- **Detection latency**: Stop TTS playback within 200ms of user speech detection
- **VAD sensitivity**: 300-500ms silence threshold for end-of-speech detection
- **Echo cancellation**: Required to prevent TTS audio from triggering false barge-in
- **Duplex processing**: Simultaneous input/output audio stream processing

### 4.2 Barge-In UX Patterns

**Pattern A: Tap-to-Interrupt (current AGI Workforce approach)**

- User taps the orb while AI is speaking
- TTS stops immediately
- Transition to listening phase
- Simple, reliable, zero false positives
- Limitation: not hands-free

**Pattern B: Voice-Activated Barge-In**

- Microphone stays active during TTS playback
- VAD detects user speech onset
- TTS fades out over 100ms (not hard cut)
- System transitions to listening
- Requires echo cancellation to distinguish user voice from speaker output
- Risk: false positives from ambient noise

**Pattern C: Smart Barge-In (2026 best practice)**

- Combines VAD with prosodic analysis
- Distinguishes backchannel ("uh-huh", "yeah") from interruption intent
- Uses pitch change detection: sharp pitch rise = question/interruption
- Uses volume detection: louder than TTS output = likely intentional
- Retell AI's 2025 turn-taking model reduces false interruptions by 40%

**Recommendation:**

- v1: Tap-to-interrupt only (current, reliable)
- v2: Add voice-activated barge-in with echo cancellation (use `expo-audio`'s echo cancellation or native module)
- v2: Add backchannel detection to avoid false interrupts on "mm-hmm"

### 4.3 Post-Interruption Behavior

When user interrupts AI mid-sentence:

1. Stop TTS immediately (within 200ms)
2. Discard unspoken portion of AI response
3. Keep spoken portion in transcript
4. Transition directly to listening (no idle gap)
5. Include context that the user interrupted in the next prompt: "User interrupted your response after: '[last spoken words]'"
6. Haptic feedback: Light impact on interruption detection

---

## 5. Audio Routing

### 5.1 iOS Audio Session Configuration

iOS audio routing is controlled via `AVAudioSession`. Key categories and options:

**For recording (STT):**

```
Category: playAndRecord
Mode: default
Options: [.allowBluetooth, .defaultToSpeaker]
```

**For playback (TTS):**

```
Category: playback
Mode: default
Options: [.allowBluetooth]
```

**Critical iOS behaviors:**

- After recording with `allowsRecordingIOS: true`, audio may route to earpiece instead of speaker. Must reset audio mode with `allowsRecordingIOS: false` after recording stops.
- `defaultToSpeaker` only works with `playAndRecord` category.
- When user connects Bluetooth, audio automatically routes to the last connected device.
- Wired headset always takes priority when plugged in.

### 5.2 Android AudioManager

**For recording:**

```
Mode: MODE_IN_COMMUNICATION (for echo cancellation) or MODE_NORMAL
Stream: STREAM_VOICE_CALL or STREAM_MUSIC
```

**Key permissions:** `android.permission.BLUETOOTH` (in AndroidManifest.xml) for Bluetooth audio routing.

### 5.3 Audio Routing Priority (Both Platforms)

1. Wired headset (if connected) -- highest priority
2. Bluetooth device (last connected)
3. Speaker (default for media playback)
4. Earpiece (default for phone/VoIP calls)

### 5.4 Current AGI Workforce Audio Mode Config

From `services/voice.ts`:

```typescript
// Recording mode
{
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,  // Change to true for v2 background voice
  shouldDuckAndroid: true,
}

// Playback mode
{
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
}
```

### 5.5 Audio Routing Recommendations

**v1 (current):**

- Default to speaker for TTS output
- Use system routing for recording (respects Bluetooth/wired automatically)
- Reset audio mode properly after recording to prevent earpiece-only playback
- `playsInSilentModeIOS: true` is correct (voice should work even in silent mode)

**v2:**

- Add audio output device selector in voice mode UI (Speaker / Earpiece / Bluetooth)
- Listen for `AVAudioSession.routeChangeNotification` to update UI when devices connect/disconnect
- Use `react-native-nitro-audio-manager` or custom Expo module for granular control
- Handle `staysActiveInBackground: true` for background voice processing

### 5.6 Known Expo Audio Routing Issues

- expo-av issue #20943: Audio routes to earpiece after recording. Workaround: explicitly set audio mode after `stopAndUnloadAsync()`.
- expo-av issue #19298: Video/audio plays through earpiece on iOS. Root cause: `allowsRecordingIOS` was left `true`.
- Always call `Audio.setAudioModeAsync(PLAYBACK_MODE)` after stopping recording (already done in current codebase).

---

## 6. Background Voice Processing

### 6.1 Platform Constraints

**iOS:**

- Background audio requires `audio` UIBackgroundModes capability in Info.plist
- Must maintain an active AVAudioSession for background recording
- Background tasks limited to ~30 seconds without active audio session
- App will be suspended if audio session becomes inactive

**Android:**

- Foreground service with notification required for background audio
- `FOREGROUND_SERVICE` permission in manifest
- Must show persistent notification while recording
- Less restrictive than iOS for background processing

### 6.2 Background Voice Use Cases

1. **Continue voice conversation while multitasking**: User switches to another app mid-conversation. TTS continues playing, recording pauses until user returns.
2. **Background agent monitoring**: Voice notifications when an agent needs approval. Uses local push notification, not continuous recording.
3. **Voice memo to agent**: Quick voice capture from lock screen or notification shade.

### 6.3 Recommendation

- v1: No background voice processing (`staysActiveInBackground: false`). Voice conversation requires app to be in foreground.
- v2: Add background TTS playback (AI continues speaking when user switches apps). Requires `audio` background mode.
- v2: Add voice notification for agent approvals (short TTS snippet via push notification sound).
- v3: Full background voice conversation (requires significant native code and platform review).

### 6.4 Battery & Performance

- Cloud STT (Whisper/Deepgram): Minimal local CPU, battery drain from network + recording
- On-device STT: Higher CPU, ~10-15% battery/hour during active recording
- TTS playback: Minimal battery impact (system TTS is highly optimized)
- Continuous VAD for wake word: ~2-5% battery/hour with on-device models (Picovoice claims <1%)

---

## 7. Voice + Text Multimodal Input

### 7.1 The Unified Input Model (2026 Direction)

The industry is moving away from "voice mode" as a separate experience toward unified multimodal input:

**ChatGPT (November 2025 redesign):**

- Voice mode is no longer a separate screen
- Tapping the waveform button continues the interaction inline in the current chat
- Live transcript appears on screen alongside chat history
- Users can see images, code, and visual responses while speaking

**Gemini Live:**

- Consolidated attachment sheet: file uploads, image selection, camera, Drive -- all in one bottom sheet
- Voice and visual inputs can be combined in a single turn

### 7.2 Interaction Flow Patterns

**Pattern A: Sequential Multimodal (current AGI Workforce)**

- User types text OR records voice, not both simultaneously
- Voice transcription inserts text into the composer
- User can edit transcribed text before sending
- Simple, predictable, reliable

**Pattern B: Inline Voice with Live Transcript**

- User taps mic in composer
- Recording indicator appears inline (not full-screen)
- Live transcript streams into the composer as user speaks
- User can edit the transcript and add typed text
- Send button submits the combined input
- This is the ChatGPT November 2025 pattern

**Pattern C: Continuous Conversation with Visual Context**

- Full-screen voice mode with chat history visible underneath
- AI responses appear as both spoken audio AND text in the chat
- User can scroll chat while AI speaks
- Tap any message to reference it in the conversation
- This is the Gemini Live pattern

### 7.3 Recommended Implementation Path

**v1 (current):**

- Tap mic: toggle recording, transcription goes to composer (Pattern A)
- Hold mic: PTT with instant transcription (Pattern A)
- Long-press mic: full-screen voice conversation mode (separate from chat)

**v2 (inline voice):**

- Tap mic: inline recording with live transcript in composer (Pattern B)
- Waveform replaces composer text area during recording
- "Done" button finalizes transcript; user can edit before sending
- Full-screen mode remains as immersive option

**v3 (continuous multimodal):**

- Voice mode overlays on top of chat (Pattern C)
- Semi-transparent overlay shows orb + controls; chat scrollable underneath
- AI responses appear in chat AND are spoken
- Swipe down to return to text-only mode
- Attach images/files mid-voice-conversation

### 7.4 Seamless Mode Switching

Users should be able to switch between voice and text mid-conversation without losing context:

- Starting a voice turn in a text conversation: AI knows this is the same conversation
- Switching to typing mid-voice-mode: Voice mode pauses, composer appears, typing accepted
- Voice input after image attachment: Combined multimodal message sent as single turn
- Mid-sentence mode switch: User starts speaking, stops, types remainder -- system combines both

---

## 8. Haptic Feedback Patterns for Voice

### 8.1 Haptic Event Map

| Event                        | Haptic Type  | Intensity | Purpose                                      |
| ---------------------------- | ------------ | --------- | -------------------------------------------- |
| Start recording (tap)        | Impact       | Medium    | Confirm activation                           |
| Start recording (PTT hold)   | Impact       | Medium    | Confirm press registered                     |
| Stop recording               | Impact       | Light     | Confirm release                              |
| AI starts speaking           | None         | --        | No haptic (audio is the feedback)            |
| Barge-in / interrupt         | Impact       | Light     | Confirm interruption                         |
| Error (permission denied)    | Notification | Error     | Alert to problem                             |
| Mute toggle                  | Impact       | Light     | Confirm state change                         |
| End call                     | Impact       | Heavy     | Confirm conversation ended                   |
| Long-press (open voice mode) | Impact       | Heavy     | Confirm mode switch                          |
| Send transcription           | Notification | Success   | Confirm message sent                         |
| Silence timeout (5s)         | Impact       | Light     | Subtle nudge that system will stop listening |

### 8.2 Haptic Design Principles

From CHI 2025 research on voice + haptics:

- Vibrotactile feedback assures users their speech is being captured
- Haptic patterns should match the frequency and amplitude of audio cues
- Keep haptics short and intentional -- avoid disrupting conversation flow
- Issue subtle haptic after 5s of silence to indicate the system will disengage
- Never use haptics during AI speech (the audio IS the feedback)
- Haptics should be "just noticeable" -- strong enough to perceive, weak enough to not distract

### 8.3 Haptic Accessibility

- All haptic events must be optional (settings toggle -- already implemented: `hapticsEnabled`)
- Provide visual alternatives for every haptic cue
- iOS: Use `UIImpactFeedbackGenerator` (mapped by expo-haptics)
- Android: Use `VibrationEffect.createOneShot()` or `createPredefined()`
- Respect system "Do Not Disturb" and "Reduce Motion" accessibility settings

---

## 9. Accessibility Considerations

### 9.1 Screen Reader Compatibility

**VoiceOver (iOS) and TalkBack (Android) requirements:**

- All voice controls must have descriptive `accessibilityLabel` (already implemented in current codebase)
- Voice mode phase changes must be announced: "Now listening", "Processing your message", "AI is speaking"
- Use `accessibilityLiveRegion="polite"` for transcript updates (Android)
- Use `UIAccessibilityPostNotification` for phase announcements (iOS)
- Recording duration must be announced periodically (every 10s)

**Current accessibility labels in AGI Workforce (good baseline):**

- VoiceInputButton: "Tap to record, hold for push-to-talk" / "Tap to stop recording" / "Release to transcribe"
- VoiceConversationScreen: "Close voice conversation", "Mute microphone", "End voice conversation"
- Phase labels: "Listening...", "Thinking...", "Speaking..."

### 9.2 Visual Accessibility

- **Color contrast**: Phase colors must meet WCAA 4.5:1 contrast against dark background
- **Color-blind support**: Don't rely on color alone; use shape changes (orb size, animation pattern) plus text labels
- **Reduced motion**: Respect `prefers-reduced-motion`; replace spring animations with simple opacity fades
- **Text scaling**: Transcript text must respect system font size preferences
- **High contrast mode**: Provide alternative color scheme for voice mode

### 9.3 Motor Accessibility

- **Switch Control compatibility**: All voice controls must be reachable via Switch Control scanning
- **Touch target size**: Minimum 44x44pt for all buttons (current: 48x48 for mute, 56x56 for end call, 64x64 for end -- adequate)
- **Alternative activation**: Provide keyboard/switch alternative to long-press (settings option to enter voice mode via button tap)
- **One-handed operation**: All controls reachable in the bottom 1/3 of screen (current layout is correct)

### 9.4 Hearing Accessibility

- **Real-time captions**: Always show live transcript of AI speech (not just audio)
- **Transcript history**: Save voice conversation transcripts for later review
- **Visual indicators**: Waveform + text labels + color changes (never audio-only feedback)
- **Adjustable speech rate**: Already implemented (`speechRate` in settings)
- **Volume boost option**: Amplify AI speech output for users with mild hearing loss

### 9.5 Cognitive Accessibility

- **Simple mode**: Option to show only the mic button (hide waveform, phase labels) for users who find the full UI overwhelming
- **Predictable behavior**: Same tap always does the same thing; no gesture ambiguity
- **Clear status**: Always show current phase ("Listening", "Thinking", "Speaking") in text
- **Timeout warnings**: Visual + haptic warning before silence timeout ends recording
- **Undo/cancel**: Always provide a way to cancel recording or stop AI response

---

## 10. Architecture Recommendations for AGI Workforce Mobile

### 10.1 Current State Assessment

The existing voice implementation is solid:

- `VoiceInputButton.tsx`: Three-gesture model (tap/hold/long-press) is well-designed
- `VoiceConversationScreen.tsx`: Full-screen voice mode with ChatGPT-like orb
- `Waveform.tsx`: Reusable, audio-reactive bar waveform
- `RecordingOverlay.tsx`: Inline recording UI for chat input
- `services/voice.ts`: Recording + Whisper STT + Deepgram PTT
- `services/tts.ts`: System TTS with voice selection
- Settings: Voice toggle, voice ID, speech rate, speech pitch, haptics toggle

### 10.2 v2 Priorities (Next Implementation Wave)

1. **Cloud TTS integration** (ElevenLabs Flash v2.5)
   - 75ms latency streaming TTS
   - 5 branded voice presets with distinct personalities
   - Streaming audio chunks for faster perceived response
   - Fallback to system TTS when offline

2. **Inline voice mode** (ChatGPT November 2025 pattern)
   - Voice recording stays within chat view
   - Live transcript appears in composer
   - No full-screen takeover for quick voice input
   - Full-screen mode remains for extended conversations

3. **Audio routing controls**
   - Speaker/Earpiece/Bluetooth selector in voice mode
   - Route change detection and UI updates
   - Fix earpiece-routing-after-recording issue proactively

4. **Enhanced barge-in**
   - Echo cancellation for voice-activated interruption
   - Smooth TTS fade-out (100ms) instead of hard stop
   - Context preservation: tell AI what was spoken before interruption

### 10.3 v3 Priorities (Future)

1. **On-device wake word** (Picovoice Porcupine)
2. **Background TTS playback** (continue speaking when app backgrounded)
3. **Multi-turn context-aware style** (AI adjusts voice tone based on content)
4. **Simultaneous voice + vision** (speak while showing camera/screenshot to AI)
5. **Multi-language real-time** (speak in one language, AI responds in another)

### 10.4 File Structure (Proposed)

```
components/voice/
  VoiceInputButton.tsx        # Mic button in composer (existing)
  VoiceConversationScreen.tsx # Full-screen voice mode (existing)
  RecordingOverlay.tsx        # Inline recording UI (existing)
  Waveform.tsx                # Animated waveform (existing)
  VoicePresetPicker.tsx       # Voice preset selection bottom sheet (new)
  InlineVoiceMode.tsx         # Inline voice recording in chat (new)
  AudioRouteSelector.tsx      # Speaker/Earpiece/Bluetooth picker (new)

services/
  voice.ts                    # Recording + STT (existing)
  tts.ts                      # System TTS (existing)
  tts-cloud.ts                # ElevenLabs/OpenAI streaming TTS (new)
  audio-routing.ts            # Audio device management (new)
  wake-word.ts                # On-device wake word detection (new, v3)

stores/
  settingsStore.ts            # Voice settings (existing, extend)
  voiceStore.ts               # Voice session state (new)
```

---

## 11. Competitive Differentiation Opportunities

### 11.1 What Nobody Does Well Yet (2026 Gaps)

1. **Voice + Agent Dashboard**: No competitor lets you voice-control a running agent ("Stop that agent", "Show me what Agent 3 is doing"). AGI Workforce can be first.

2. **Voice Approval**: Approve/reject agent tool calls by voice ("Approve", "Deny", "Tell me more"). No typing needed for security-critical decisions.

3. **Multi-model voice routing**: Automatically route voice queries to the best model (fast model for simple questions, reasoning model for complex ones) based on voice input analysis.

4. **Cross-device voice**: Start voice conversation on phone, continue on desktop (with shared context). Requires the desktop companion pairing.

5. **Voice command shortcuts**: "Start a new chat with Claude", "Switch to GPT-4", "Run my morning briefing agent". Competitor voice modes are conversation-only, not command-aware.

### 11.2 Competitive Parity Requirements

To match market leaders, AGI Workforce voice mode needs:

| Feature                        | ChatGPT         | Gemini                   | Claude   | AGI Workforce Status         |
| ------------------------------ | --------------- | ------------------------ | -------- | ---------------------------- |
| Full-screen voice conversation | Yes             | Yes                      | Yes      | Done                         |
| Inline voice (no mode switch)  | Yes (Nov 2025)  | Yes                      | No       | Planned v2                   |
| Voice presets (3+)             | 9 voices        | 10+                      | 5        | Settings exist, need presets |
| Barge-in                       | Voice-activated | Voice-activated          | Tap only | Tap only (v1)                |
| Live transcript during TTS     | Yes             | Yes                      | Yes      | Done (transcript preview)    |
| Accent/language options        | Yes             | 40+ languages            | Limited  | Not yet                      |
| Speed control                  | Yes             | Yes (adjustable anytime) | No       | Done (settings)              |
| Background voice               | Limited         | Limited                  | No       | Not yet                      |

Sources:

- [Complete Guide to Wake Word Detection (2026) - Picovoice](https://picovoice.ai/blog/complete-guide-to-wake-word/)
- [Custom Wake Words: Branded Voice UX Guide 2026 - Sensory](https://sensory.com/custom-wake-words-branded-voice-ux-guide-2026/)
- [The Future of Voice Interaction Beyond 'Always-Listening' - Sensory](https://sensory.com/sensory-smart-wakewords-future-voice-interaction/)
- [Voice-First Computing Trends in 2026 - UMEVO](https://www.umevo.ai/blogs/ume-all-posts/the-end-of-the-keyboard-voice-first-computing-trends-in-2026)
- [2026 Voice AI Trends - Kardome](https://www.kardome.com/resources/blog/voice-ai-engineering-the-interface-of-2026/)
- [ChatGPT Voice Mode Explained 2026](https://justainews.com/companies/openai/chatgpt-voice-mode-explained/)
- [ChatGPT Voice Gets Major UX Upgrade with Unified Interface](https://www.techbuzz.ai/articles/chatgpt-voice-gets-major-ux-upgrade-with-unified-interface)
- [ChatGPT's voice mode is no longer a separate interface - TechCrunch](https://techcrunch.com/2025/11/25/chatgpts-voice-mode-is-no-longer-a-separate-interface/)
- [Voice UI Design Guide 2026 - Fuselab](https://fuselabcreative.com/voice-user-interface-design-guide-2026/)
- [Conversational AI UI Comparison 2025 - IntuitionLabs](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)
- [Improving Gemini TTS Models - Google Blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-2-5-text-to-speech/)
- [Gemini Live Expressive Update Android/iOS - 9to5Google](https://9to5google.com/2025/11/12/gemini-live-expressive-update-android-ios/)
- [Google Gemini Live Adds Accents and Characters - eWeek](https://www.eweek.com/news/google-gemini-live-mode-update-nov-2025/)
- [Claude AI Voice Mode 2026 Features - Weesper Neon Flow](https://weesperneonflow.ai/en/blog/2026-02-23-claude-ai-voice-mode-2026-features-vs-dedicated-dictation/)
- [Using Voice Mode - Claude Help Center](https://support.claude.com/en/articles/11101966-using-voice-mode)
- [Claude Code Voice Mode - TechCrunch](https://techcrunch.com/2026/03/03/claude-code-rolls-out-a-voice-mode-capability/)
- [Anthropic Launches Voice Mode for Claude - TechCrunch](https://techcrunch.com/2025/05/27/anthropic-launches-a-voice-mode-for-claude/)
- [Optimizing Voice Agent Barge-in Detection 2025 - SparkCo](https://sparkco.ai/blog/optimizing-voice-agent-barge-in-detection-for-2025)
- [Real-Time Barge-In AI - Gnani](https://www.gnani.ai/resources/blogs/real-time-barge-in-ai-for-voice-conversations-31347)
- [Voice AI's Missing Piece - Fast Company](https://www.fastcompany.com/91448246/voice-ais-missing-piece-the-ability-to-listen-while-it-talks)
- [AI Voice Recognition: Barge-In, Turn-Taking, VAD - SkyScribe](https://www.sky-scribe.com/en/blog/ai-voice-recognition-barge-in-turn-taking-and-vad)
- [Barge-In and Natural Conversation - IDT Express](https://www.idtexpress.com/blog/barge-in-interruptions-and-natural-conversation-making-ai-sound-human-on-inbound-calls/)
- [Perplexity Voice Assistant iOS - BBNT](https://www.bbntimes.com/technology/perplexity-s-ai-voice-assistant-lands-on-ios-a-game-changer-for-conversational-ai)
- [Grok AI Voice Mode Features](https://supergrok.online/grok-ai-voice-mode/)
- [Perplexity Voice Assistant - Help Center](https://www.perplexity.ai/help-center/en/articles/11132456-how-to-use-the-perplexity-voice-assistant-for-ios)
- [ElevenLabs Latency Optimization](https://elevenlabs.io/docs/developers/best-practices/latency-optimization)
- [Best TTS APIs 2026 Benchmarks - Inworld](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks)
- [ElevenLabs API 2025 Guide - Webfuse](https://www.webfuse.com/blog/elevenlabs-api-in-2025-the-ultimate-guide-for-developers)
- [Best TTS APIs 2026 Compared - Speechmatics](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)
- [Designing Multimodal AI Interfaces - Fuselab](https://fuselabcreative.com/designing-multimodal-ai-interfaces-interactive/)
- [Multimodal App Interfaces - SolidAppMaker](https://solidappmaker.com/multimodal-app-interfaces-voice-gesture-vision-in-modern-ui/)
- [Building a Voice Reactive Orb in React - Medium](https://medium.com/@therealmilesjackson/building-a-voice-reactive-orb-in-react-audio-visualization-for-voice-assistants-2bee12797b93)
- [Google AI Mode Voice Input Waveform - 9to5Google](https://9to5google.com/2025/06/02/google-ai-mode-voice-input/)
- [2025 Guide to Haptics: Mobile UX - Medium](https://saropa-contacts.medium.com/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback-676dd5937774)
- [Gesture and Audio-Haptic Guidance for Voice Interfaces - CHI 2025](https://dl.acm.org/doi/10.1145/3706598.3714310)
- [Mobile App Accessibility: VoiceOver, TalkBack - Medium](https://medium.com/@growingprot/mobile-app-accessibility-voiceover-talkback-and-inclusive-design-dc21f7eddcfc)
- [React Native Accessibility Docs](https://reactnative.dev/docs/accessibility)
- [Expo Audio Documentation](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Expo Speech Documentation](https://docs.expo.dev/versions/latest/sdk/speech/)
- [expo-speech-recognition - GitHub](https://github.com/jamsch/expo-speech-recognition)
- [Audio Session Device Switch Management - Medium](https://medium.com/simform-engineering/audio-input-device-switch-management-in-avaudiosession-4a7c4dd78eb5)
- [2026 Emotional AI Voice Generation: Scenith](https://scenith.in/blogs/emotional-ai-voice-generation-scenith-2026)
