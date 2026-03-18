# Mobile UI Parity Scorecard: AGI Workforce vs Claude Mobile

_Audit date: 2026-03-18 | 140 source files | Expo 55 + React Native 0.83 + React 19_

## Scoring

- **5/5** = At parity or better than Claude
- **4/5** = Functional, minor polish gap
- **3/5** = Functional but missing features competitors have
- **2/5** = Partially implemented
- **1/5** = Stub or missing

---

## Chat UI

| Feature             | AGI Workforce                                                                     | Claude                  | Score |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------- | ----- |
| Message bubbles     | Avatar-based layout, role labels, Reanimated entry animations                     | Similar avatar layout   | 5/5   |
| Streaming text      | SSE with reconnect (3 retries, exponential backoff), thinking/reasoning accordion | SSE streaming           | 5/5   |
| Markdown rendering  | Bold, inline code, code blocks with copy button                                   | Full markdown + LaTeX   | 4/5   |
| Model selector      | Bottom sheet, 20+ models, 7 providers, favorites, auto modes                      | Single model (Claude)   | 5/5   |
| Code block copy     | CodeBlockCopyButton overlay with haptic feedback                                  | Tap to copy             | 5/5   |
| Message actions     | Long-press → Copy/Delete ActionSheet                                              | Long-press → Copy/Retry | 4/5   |
| Image attachments   | Camera + Photo Library + inline preview + fullscreen viewer                       | Camera + Photos + Files | 4/5   |
| Document upload     | expo-document-picker (PDF/DOCX/TXT/CSV)                                           | PDF + images + files    | 4/5   |
| File export         | PDF + Text export via bottom sheet, native share                                  | No export               | 5/5   |
| Conversation search | SearchBar with snippet results from messages + titles                             | Search in sidebar       | 5/5   |
| Tool call display   | ToolCallCard with icon per tool type                                              | Tool use display        | 4/5   |
| Artifacts           | InlineArtifactCard + ArtifactFullScreen modal                                     | Artifacts panel         | 4/5   |
| Image generation    | Progress indicator + generated image display + fullscreen                         | No image gen            | 5/5   |
| Approval cards      | Risk-level colored cards with countdown timer                                     | No approvals            | 5/5   |

**Chat subtotal: 4.6/5**

---

## Voice

| Feature                     | AGI Workforce                                                                     | Claude                                 | Score |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | ----- |
| Voice input (PTT)           | VoiceInputButton with push-to-talk + tap toggle                                   | Push-to-talk mic button                | 5/5   |
| Transcription               | Whisper (server) + Deepgram (client fallback)                                     | Whisper                                | 5/5   |
| Full voice mode             | VoiceConversationScreen: orb animation, phases (idle/listening/thinking/speaking) | Voice mode with 5 personalities        | 4/5   |
| TTS playback                | expo-speech with voice selector (VoiceSelector bottom sheet)                      | 5 named voices (Breeze, Juniper, etc.) | 3/5   |
| Voice personality           | System voices only (device-dependent)                                             | 5 branded AI voices                    | 3/5   |
| Auto-listen after AI speaks | Yes (autoListenRef loop)                                                          | Yes                                    | 5/5   |
| Waveform visualization      | Animated Waveform component, 5 bars                                               | Animated orb                           | 5/5   |
| Recording overlay           | RecordingOverlay with cancel/send, audio level meter                              | Inline mic UI                          | 5/5   |
| Speech rate control         | Configurable speechRate in settings                                               | No user control                        | 5/5   |

**Voice subtotal: 4.2/5**

---

## Navigation & Structure

| Feature              | AGI Workforce                                                                                         | Claude                              | Score |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- | ----- |
| Tab bar              | 5 tabs (Home/Chat/Projects/Agents/Settings)                                                           | 3 tabs (Chat/Recents/Settings)      | 5/5   |
| Home dashboard       | Quick actions, active agents, pending approvals, recent chats, connection status                      | No dashboard                        | 5/5   |
| Projects             | Full CRUD with custom instructions, active project indicator, instructions injected as system message | Projects with instructions          | 5/5   |
| Conversation sidebar | Grouped by time (Today/Yesterday/This Week/Older), swipe-to-delete, rename, pin                       | Grouped by time                     | 5/5   |
| Auth flow            | Email/password + Apple ID + Google OAuth + forgot password                                            | Apple ID + Google + email           | 5/5   |
| Onboarding           | 3-slide with skip/next, MMKV persistence                                                              | Multi-slide with feature highlights | 3/5   |
| Deep linking         | agiworkforce:// scheme for pair codes + Android share intents                                         | Claude:// scheme                    | 4/5   |
| Error boundary       | +error.tsx with retry button                                                                          | Standard error handling             | 4/5   |

**Navigation subtotal: 4.5/5**

---

## Companion & Agents (AGI Workforce Exclusive)

| Feature                 | AGI Workforce                                                            | Claude | Score |
| ----------------------- | ------------------------------------------------------------------------ | ------ | ----- |
| QR pairing              | Full camera scanner with animated scan line, flashlight, manual entry    | N/A    | 5/5   |
| WebRTC data channel     | Peer connection with ICE, data channel, signaling relay fallback         | N/A    | 5/5   |
| Agent dashboard         | Real-time agent grid with status/progress, FlashList, responsive columns | N/A    | 5/5   |
| Approve/deny tool calls | ApprovalCard with risk level coloring, countdown timer                   | N/A    | 5/5   |
| Agent commands          | Pause/resume/cancel via WebRTC control channel                           | N/A    | 5/5   |
| Connection status       | StatusBar with connected/connecting/disconnected/error states            | N/A    | 5/5   |
| Health checks           | 30-second heartbeat ping, auto-reconnect                                 | N/A    | 5/5   |

**Companion subtotal: 5.0/5 (unique advantage)**

---

## Settings & Security

| Feature               | AGI Workforce                                                       | Claude                   | Score |
| --------------------- | ------------------------------------------------------------------- | ------------------------ | ----- |
| Theme toggle          | Dark/Light/System with useTheme() hook wired to StatusBar + tab bar | Dark/Light/System        | 5/5   |
| Biometric lock        | Face ID/fingerprint with background→active re-lock                  | Biometric lock           | 5/5   |
| Auto-approve modes    | 3 modes: Ask/Smart/Full Auto with radio UI                          | N/A                      | 5/5   |
| Model selection       | 20+ models from 7 providers, favorites, thinking mode               | Single provider          | 5/5   |
| Voice settings        | Voice selector bottom sheet, speech rate control                    | Voice personality picker | 4/5   |
| Push notifications    | Android channels, tap routing, cold-start handling                  | Basic push               | 5/5   |
| Device integrations   | Calendar + Contacts with permission UI                              | Calendar + Reminders     | 4/5   |
| Haptic feedback       | Configurable toggle, used in voice, approvals, copy                 | Haptic on key actions    | 5/5   |
| Background agent sync | Background fetch for agent status polling                           | N/A                      | 5/5   |

**Settings subtotal: 4.8/5**

---

## Data & Sync

| Feature             | AGI Workforce                                                                                              | Claude                    | Score |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- | ----- |
| Conversation sync   | MobileConversationSyncService with Supabase realtime, background sync on app resume, last-write-wins merge | Cloud sync across devices | 4/5   |
| Offline persistence | MMKV with encryption (200 convos, 100 msgs/conv caps)                                                      | Limited offline           | 5/5   |
| Token storage       | SecureStore (OS keychain, CRIT-005 enforced)                                                               | Keychain                  | 5/5   |
| Memory management   | Full CRUD memory store + search + sync + settings screen                                                   | Memory with search        | 4/5   |
| Scheduling          | Full schedule CRUD + recurrence picker + toggle + run history                                              | N/A                       | 5/5   |

**Data subtotal: 4.6/5**

---

## App Store Readiness

| Feature             | AGI Workforce                                           | Claude       | Score |
| ------------------- | ------------------------------------------------------- | ------------ | ----- |
| app.json metadata   | Complete (name, icons, splash, permissions, bundleIds)  | Published    | 4/5   |
| EAS build profiles  | 3 profiles (dev/preview/production)                     | Published    | 4/5   |
| iOS permissions     | Camera, Microphone, Photos, Face ID, Calendar, Contacts | All required | 5/5   |
| Android permissions | Camera, Audio, Storage, Biometric                       | All required | 5/5   |
| TypeScript          | 0 errors (strict mode)                                  | N/A          | 5/5   |
| Expo export         | iOS + Android clean (3810 modules)                      | N/A          | 5/5   |
| Privacy manifest    | MISSING (required for App Store)                        | Present      | 2/5   |

**App Store subtotal: 4.3/5**

---

## Overall Score

| Category               | Score     |
| ---------------------- | --------- |
| Chat UI                | 4.6/5     |
| Voice                  | 4.2/5     |
| Navigation & Structure | 4.5/5     |
| Companion & Agents     | 5.0/5     |
| Settings & Security    | 4.8/5     |
| Data & Sync            | 4.6/5     |
| App Store Readiness    | 4.3/5     |
| **Overall**            | **4.6/5** |

---

## AGI Workforce Unique Advantages

1. **Multi-LLM**: 20+ models from 7 providers (Claude = Anthropic-only)
2. **Companion pairing**: QR scan → WebRTC → real-time agent control from phone
3. **Agent oversight**: Approve/deny tool calls with risk-level indicators
4. **Scheduling**: Create and manage scheduled AI tasks from mobile
5. **Image generation**: Generate images with progress tracking (Claude has none)
6. **File export**: PDF + Text export of any AI response
7. **Auto-approve modes**: 3 levels of agent autonomy control
8. **Conversation search**: Full-text search across all messages with snippets
9. **Projects with instructions**: Custom system prompts per project context
10. **Multi-model comparison**: Switch models mid-conversation

## Gaps vs Claude Mobile

1. **Voice personalities**: Claude has 5 branded AI voices (Breeze, Juniper, Ember, Sol, Cove); we have system TTS only
2. **LaTeX rendering**: Claude renders math equations; our markdown is basic
3. **Onboarding polish**: Claude's is more polished with feature highlights and animations
4. **iOS privacy manifest**: Required for App Store — we don't have it yet
5. **Retry/edit messages**: Claude lets you retry or edit sent messages; we have delete only

## File Count

- 140 TypeScript/TSX source files
- 18 service files
- 10 store files
- 5 hooks
- 63 components across 12 directories
- 20 screen files across 4 route groups
- 5 tabs (Home, Chat, Projects, Agents, Settings)
