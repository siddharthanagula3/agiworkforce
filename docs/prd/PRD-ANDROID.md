# PRD-ANDROID: AGI Workforce Android Mobile Application

> **Platform**: Android Mobile (phones and tablets)
> **Version**: 0.1.0 (initial release)
> **Status**: SDLC-grade specification — approved for implementation
> **Last updated**: 2026-03-09
> **Owner**: Product Team
> **Framework**: React Native 0.76.9 + Expo SDK 52 (shared codebase with iOS)
> **Companion PRD**: See `PRD-IOS.md` for shared feature specifications

---

## Table of Contents

1. [Executive Summary](#section-1-executive-summary)
2. [Platform Requirements](#section-2-platform-requirements)
3. [Feature Matrix](#section-3-feature-matrix)
4. [Screen-by-Screen UI Specification](#section-4-screen-by-screen-ui-specification)
5. [Component Architecture](#section-5-component-architecture)
6. [Data Flow & API Connections](#section-6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#section-7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#section-8-build-deploy--distribution)
9. [Testing Strategy](#section-9-testing-strategy)
10. [Performance Requirements](#section-10-performance-requirements)
11. [Security](#section-11-security)
12. [Accessibility](#section-12-accessibility)
13. [Competitive Analysis](#section-13-competitive-analysis)

---

# Section 1: Executive Summary

## 1.1 Platform Vision

AGI Workforce for Android is a companion mobile application that transforms any Android phone or tablet into a live command center for AI agents running on the user's desktop. It is built on the same React Native + Expo codebase as the iOS app, ensuring feature parity while fully embracing Android's unique platform capabilities: Material You dynamic theming, notification channels, Quick Settings tiles, home screen widgets, and the full breadth of the Google Play ecosystem.

Android represents the world's largest mobile operating system by market share (approximately 72% globally as of early 2026). Launching AGI Workforce on Android ensures the platform reaches the broadest possible user base, including markets in Asia, Latin America, Africa, and Eastern Europe where Android dominates with 85%+ market share.

The Android app is not a simplified chat client. It is a full mobile agent control surface that provides:

1. **QR pairing with the desktop app** -- scan a code displayed in the Tauri desktop app to establish a WebRTC data channel for real-time agent oversight
2. **Live agent dashboard** -- monitor running agents, view tool execution timelines, approve or deny sensitive operations from your phone
3. **Multi-model chat** -- converse with 9+ cloud LLM providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Moonshot, Qwen, ZhipuAI, Perplexity) directly from your Android device
4. **Voice I/O** -- hold-to-record speech input with Whisper or Deepgram transcription, system TTS for spoken responses
5. **Push notification control** -- FCM-powered notifications with Android notification channels, actionable approve/deny buttons on the lock screen
6. **Background agent polling** -- periodic background fetch checks for pending agent approvals even when the app is closed
7. **Cross-device sync** -- conversations and messages sync in real-time via Supabase Realtime across desktop, web, and mobile

## 1.2 Target Users

### 1.2.1 Android-First Developers and Power Users

Developers who use Android as their primary mobile device and want to monitor desktop AI agents on the go. They value the openness of the Android ecosystem, side-loading capabilities, and deeper system integration (Quick Settings, widgets, split-screen multitasking).

### 1.2.2 Global Market Users

Users in regions where Android dominates (India, Brazil, Southeast Asia, Africa). These users may have mid-range devices with 4-6GB RAM and need the app to perform well on less powerful hardware. Economy model routing (GPT-5 Nano, Claude Haiku, Gemini Flash) is particularly important for cost-conscious users.

### 1.2.3 Enterprise Android Users

Organizations using Android Enterprise or Samsung Knox for managed device fleets. They need the app to work within managed profiles, respect DPC (Device Policy Controller) restrictions, and integrate with enterprise MDM solutions.

### 1.2.4 Tablet Users

Android tablet users (Samsung Galaxy Tab, Pixel Tablet, Lenovo Tab) who want a productivity-oriented layout with a permanent sidebar, split-screen chat and agent views, and landscape orientation support.

## 1.3 Key Differentiators Over Competitors

| Differentiator           | AGI Workforce Android                  | Claude Android | ChatGPT Android          |
| ------------------------ | -------------------------------------- | -------------- | ------------------------ |
| Desktop QR pairing       | Yes -- real-time WebRTC control        | No             | No                       |
| Live agent dashboard     | Yes -- approve/deny from phone         | No             | No                       |
| Multi-model support      | 9+ providers, 30+ models               | Anthropic only | OpenAI only              |
| Lock screen actions      | Yes -- approve/deny notifications      | No             | No                       |
| Background agent polling | Yes -- expo-background-fetch           | No             | No                       |
| Notification channels    | 3 channels (default, approvals, tasks) | Single channel | Single channel           |
| Voice I/O (PTT)          | Whisper + Deepgram + system TTS        | No (text only) | Voice mode (OpenAI only) |
| Cross-device sync        | Real-time via Supabase                 | Limited        | Limited                  |
| Side-loading APK         | Yes -- direct APK distribution         | No             | No                       |
| Quick Settings tile      | Yes -- agent status at a glance        | No             | No                       |

## 1.4 Non-Negotiable Requirements

These requirements are inherited from the platform-wide PRD (see `docs/PRD.md` Section 1.8) and are mandatory for the Android app:

| ID    | Requirement                                         | Android-Specific Notes                                                                                                               |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| NN-01 | Zero user-visible raw error messages                | All errors must use friendly messages. No stack traces, no HTTP status codes, no Java/Kotlin exceptions visible to the user.         |
| NN-02 | `stream_watchdog_timeout` must never surface        | Mobile streaming uses the API gateway, not Tauri IPC. The gateway must handle watchdog timeouts internally.                          |
| NN-03 | Auto-approve mode must have zero friction           | When auto-approve is enabled in settings, agent tool executions must proceed without mobile confirmation prompts.                    |
| NN-04 | Multi-LLM routing must work across all providers    | The mobile app routes through the web API gateway. Provider failures must not crash the app -- circuit breaker logic is server-side. |
| NN-06 | API keys and secrets must never appear in plaintext | Auth tokens stored in Android Keystore via expo-secure-store. MMKV used only for non-sensitive data.                                 |
| NN-07 | Proprietary license must be enforced                | APK must be obfuscated with ProGuard/R8. No source maps in production builds.                                                        |

## 1.5 Success Metrics

| Metric                                   | Target (v0.1.0) | Target (v1.0.0) |
| ---------------------------------------- | --------------- | --------------- |
| Play Store rating                        | >= 4.0 stars    | >= 4.5 stars    |
| Crash-free rate                          | >= 99.0%        | >= 99.5%        |
| QR pairing success rate                  | >= 90%          | >= 98%          |
| Cold start time (Pixel 6)                | < 3 seconds     | < 2 seconds     |
| Background approval notification latency | < 60 seconds    | < 15 seconds    |
| Daily active users (DAU)                 | 500             | 10,000          |
| Desktop pairing retention (7-day)        | >= 40%          | >= 65%          |
| ANR rate                                 | < 0.5%          | < 0.1%          |
| Play Store policy compliance             | 100%            | 100%            |

---

# Section 2: Platform Requirements

## 2.1 Android Version Requirements

| Requirement | Value                     | Rationale                                                                                                                                              |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Minimum SDK | API 26 (Android 8.0 Oreo) | Notification channels (required for structured notifications), background execution limits, autofill framework. Covers ~97% of active Android devices. |
| Target SDK  | API 34 (Android 14)       | Play Store requirement as of August 2024. Includes predictive back gesture, per-app language preferences, photo picker, foreground service types.      |
| Compile SDK | API 35 (Android 15)       | Latest stable SDK for build toolchain.                                                                                                                 |
| Recommended | API 33+ (Android 13+)     | Predictive back gesture, per-app notifications permission (`POST_NOTIFICATIONS`), themed app icons, per-app language.                                  |

## 2.2 Hardware Requirements

| Component   | Minimum                      | Recommended                                 |
| ----------- | ---------------------------- | ------------------------------------------- |
| RAM         | 3 GB                         | 6 GB+                                       |
| Storage     | 150 MB (app) + 100 MB (data) | 500 MB available                            |
| Display     | 720p (320dp minimum width)   | 1080p+                                      |
| Network     | Wi-Fi or cellular data       | Wi-Fi for QR pairing, LTE/5G for mobile use |
| Camera      | Rear camera for QR scanning  | Auto-focus camera                           |
| Microphone  | Required for voice input     | Noise-cancelling preferred                  |
| Processor   | ARM64 (arm64-v8a)            | Snapdragon 8 Gen 2+ / Tensor G3+            |
| ABI support | arm64-v8a, armeabi-v7a       | arm64-v8a only for optimal performance      |

## 2.3 Framework and Tech Stack

| Layer                    | Technology                      | Version      | Notes                                                                                  |
| ------------------------ | ------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| Cross-platform framework | React Native                    | 0.76.9       | New Architecture available (currently disabled: `newArchEnabled: false`)               |
| Development platform     | Expo                            | SDK 52       | Managed workflow with config plugins                                                   |
| Language                 | TypeScript                      | 5.8.3        | Strict mode enabled                                                                    |
| Navigation               | expo-router                     | 4.0.22       | File-based routing with typed routes                                                   |
| Drawer navigation        | @react-navigation/drawer        | 7.3.2        | Side menu navigation                                                                   |
| State management         | Zustand                         | 5.0.3        | 9 stores (auth, chat, connection, agent, model, memory, messaging, schedule, settings) |
| Styling                  | NativeWind                      | 4.1.23       | Tailwind CSS for React Native                                                          |
| Animations               | react-native-reanimated         | 3.16.7       | 60fps native animations                                                                |
| Gestures                 | react-native-gesture-handler    | 2.20.2       | Native gesture system                                                                  |
| Lists                    | @shopify/flash-list             | 1.7.3        | Performant recycler list for messages                                                  |
| Bottom sheets            | @gorhom/bottom-sheet            | 5.1.2        | Model picker, voice UI                                                                 |
| Icons                    | lucide-react-native             | 0.474.0      | Consistent icon set across platforms                                                   |
| SVG                      | react-native-svg                | 15.8.0       | Vector graphics rendering                                                              |
| Auth                     | @supabase/supabase-js           | 2.97.0       | PKCE flow, secure token storage                                                        |
| Secure storage           | expo-secure-store               | 14.0.1       | Android Keystore integration                                                           |
| Fast storage             | react-native-mmkv               | 3.2.0        | Non-sensitive persisted state                                                          |
| Push notifications       | expo-notifications              | 0.29.14      | FCM on Android                                                                         |
| Background fetch         | expo-background-fetch           | 13.0.6       | Agent status polling                                                                   |
| Task manager             | expo-task-manager               | 12.0.6       | Background task registration                                                           |
| Camera                   | expo-camera                     | 16.0.18      | QR code scanning                                                                       |
| Audio recording          | expo-av                         | 15.0.2       | Voice input (M4A, AAC encoder)                                                         |
| Speech synthesis         | expo-speech                     | 13.0.1       | System TTS                                                                             |
| Image picker             | expo-image-picker               | 16.0.6       | Photo attachment                                                                       |
| Image display            | expo-image                      | 2.0.7        | Optimized image rendering                                                              |
| Haptics                  | expo-haptics                    | 14.0.1       | Tactile feedback                                                                       |
| WebRTC                   | react-native-webrtc             | 124.0.5      | Desktop companion data channel                                                         |
| OTA updates              | expo-updates                    | 0.27.4       | Over-the-air JS bundle updates                                                         |
| Linking                  | expo-linking                    | 7.0.5        | Deep link handling                                                                     |
| Web browser              | expo-web-browser                | 14.0.2       | In-app browser for OAuth                                                               |
| Crypto                   | expo-crypto                     | 14.0.2       | Secure random generation                                                               |
| Network info             | @react-native-community/netinfo | 12.0.1       | Connectivity detection                                                                 |
| Splash screen            | expo-splash-screen              | 0.29.24      | Launch screen management                                                               |
| Shared types             | @agiworkforce/types             | workspace:\* | Cross-platform type definitions                                                        |
| Shared utils             | @agiworkforce/utils             | workspace:\* | SignalingClient, validation                                                            |

## 2.4 Distribution Formats

| Channel                   | Format                   | Audience                |
| ------------------------- | ------------------------ | ----------------------- |
| Google Play Store         | AAB (Android App Bundle) | General public          |
| Internal testing          | APK (direct install)     | Team, beta testers      |
| EAS Build                 | APK/AAB                  | CI/CD distribution      |
| Side-loading              | APK                      | Enterprise, power users |
| Firebase App Distribution | APK                      | Beta program            |

## 2.5 Feature Flags

Feature flags applicable to the Android mobile app:

| Flag                       | Default | Description                                         |
| -------------------------- | ------- | --------------------------------------------------- |
| `MOBILE_VOICE_ENABLED`     | `true`  | Enable/disable voice input and TTS                  |
| `MOBILE_BACKGROUND_FETCH`  | `true`  | Enable/disable background agent polling             |
| `MOBILE_COMPANION_ENABLED` | `true`  | Enable/disable desktop companion pairing            |
| `MOBILE_IMAGE_GEN`         | `true`  | Enable/disable image generation features            |
| `MOBILE_REALTIME_SYNC`     | `true`  | Enable/disable Supabase Realtime subscriptions      |
| `MOBILE_DEEPGRAM_PTT`      | `false` | Use Deepgram for client-side STT (requires API key) |
| `MOBILE_ANDROID_WIDGETS`   | `false` | Enable home screen widgets (P2)                     |
| `MOBILE_QUICK_SETTINGS`    | `false` | Enable Quick Settings tile (P2)                     |

## 2.6 Environment Variables

The Android app reads environment variables at build time via Expo's `process.env.EXPO_PUBLIC_*` convention:

| Variable                        | Required | Description                                                                  |
| ------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`           | Yes      | API gateway URL (default: `https://agiworkforce.com`)                        |
| `EXPO_PUBLIC_WS_URL`            | Yes      | WebSocket signaling server URL (default: `wss://signaling.agiworkforce.com`) |
| `EXPO_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL                                                         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase anonymous key                                                       |
| `EXPO_PUBLIC_DEEPGRAM_API_KEY`  | No       | Deepgram API key for client-side STT                                         |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Core Chat Features

| Feature                                                 | Priority | Status      | Android-Specific Notes                              |
| ------------------------------------------------------- | -------- | ----------- | --------------------------------------------------- |
| Multi-model chat (text)                                 | P0       | Implemented | SSE streaming via API gateway                       |
| Model selection picker                                  | P0       | Implemented | Bottom sheet with provider filter                   |
| Auto-mode routing (Economy/Balanced/Premium)            | P0       | Implemented | Server-side routing                                 |
| Conversation list (sidebar)                             | P0       | Implemented | Drawer navigation with swipe gesture                |
| Conversation grouping (Today/Yesterday/This Week/Older) | P0       | Implemented | Time-based grouping                                 |
| Create new conversation                                 | P0       | Implemented | Empty home screen with input bar                    |
| Delete conversation                                     | P0       | Implemented | Swipe-to-delete or long press                       |
| Rename conversation                                     | P0       | Implemented | Inline editing                                      |
| Markdown rendering in messages                          | P0       | Implemented | Custom markdown renderer                            |
| Code block rendering with syntax highlighting           | P1       | Implemented | Monospace font, copy button                         |
| Thinking/reasoning display                              | P0       | Implemented | Collapsible reasoning section                       |
| Message streaming with abort                            | P0       | Implemented | Stop button, abort controller                       |
| Offline message persistence                             | P0       | Implemented | MMKV-backed chat store with 200 conv / 100 msg caps |
| Image attachment (camera/gallery)                       | P1       | Implemented | expo-image-picker                                   |
| Image generation display                                | P1       | Implemented | Progress indicator, revised prompt                  |
| Citation display                                        | P2       | Implemented | Expandable citation cards                           |
| Auto-tagging conversations                              | P2       | Implemented | Server-side, tag display in sidebar                 |
| Copy message content                                    | P0       | Implemented | Long-press context menu                             |
| Share message                                           | P1       | Implemented | Android Share intent                                |
| Network reconnection with retry                         | P0       | Implemented | 3 reconnect attempts with exponential backoff       |

### 3.1.2 Desktop Companion Features

| Feature                                   | Priority | Status      | Android-Specific Notes                       |
| ----------------------------------------- | -------- | ----------- | -------------------------------------------- |
| QR code scanning for pairing              | P0       | Implemented | expo-camera with `agiw:` prefix validation   |
| Manual pairing code entry                 | P0       | Implemented | 6-12 alphanumeric code input                 |
| WebRTC data channel (low-latency control) | P0       | Implemented | react-native-webrtc, STUN via Google servers |
| Signaling relay fallback                  | P0       | Implemented | WebSocket fallback when WebRTC fails         |
| Live agent status display                 | P0       | Implemented | Real-time progress, step-by-step view        |
| Tool execution timeline                   | P0       | Implemented | Tool calls with status, duration, output     |
| Approve/deny tool execution               | P0       | Implemented | Risk-level badges (green/yellow/red)         |
| Agent commands (pause/resume/cancel)      | P0       | Implemented | Control message via data channel             |
| Connection health monitoring              | P0       | Implemented | 30-second heartbeat ping                     |
| Session expiry handling                   | P0       | Implemented | Friendly error + re-scan prompt              |
| Desktop metadata display                  | P1       | Implemented | Device name, platform, version, OS           |
| Reconnection on pairing code              | P1       | Implemented | Persisted pairing code in MMKV               |
| Multi-agent view                          | P1       | Implemented | List of all active agents                    |
| Clear completed agents                    | P1       | Implemented | Batch removal                                |

### 3.1.3 Voice Features

| Feature                              | Priority | Status      | Android-Specific Notes                     |
| ------------------------------------ | -------- | ----------- | ------------------------------------------ |
| Hold-to-record voice input           | P0       | Implemented | expo-av, AAC encoder, M4A format, 44.1kHz  |
| Whisper transcription (server-side)  | P0       | Implemented | Upload to `/api/voice/transcribe`          |
| Deepgram transcription (client-side) | P1       | Implemented | Nova-3 model, requires API key             |
| System TTS (spoken responses)        | P0       | Implemented | expo-speech, configurable rate/pitch/voice |
| Voice conversation mode              | P0       | Implemented | Full-screen overlay, push-to-talk          |
| Metering visualization               | P1       | Implemented | Real-time dB level display at ~15fps       |
| Available voice listing              | P1       | Implemented | Platform-specific voice enumeration        |
| Microphone permission request        | P0       | Implemented | Runtime permission dialog                  |
| Audio ducking during recording       | P0       | Implemented | `shouldDuckAndroid: true`                  |

### 3.1.4 Notification Features

| Feature                              | Priority | Status      | Android-Specific Notes                                  |
| ------------------------------------ | -------- | ----------- | ------------------------------------------------------- |
| Push notification registration (FCM) | P0       | Implemented | Expo push token via FCM                                 |
| Notification permission request      | P0       | Implemented | Android 13+ runtime permission (`POST_NOTIFICATIONS`)   |
| Default notification channel         | P0       | Implemented | "Default" channel, HIGH importance                      |
| Agent approvals notification channel | P0       | Implemented | "Agent Approvals" channel, MAX importance               |
| Tasks notification channel           | P0       | Implemented | "Tasks & Schedules" channel, DEFAULT importance         |
| Notification tap navigation          | P0       | Implemented | Deep link to relevant screen                            |
| Cold-start notification handling     | P0       | Implemented | `getLastNotificationResponseAsync()`                    |
| Push token refresh handling          | P0       | Implemented | Auto re-register on token change                        |
| Background fetch for agent approvals | P0       | Implemented | 15-minute interval, `startOnBoot: true`                 |
| Lock screen notification actions     | P1       | Planned     | Approve/deny buttons on notification                    |
| Notification LED color               | P1       | Implemented | Teal (#21808d) for default, red (#ff6b6b) for approvals |
| Vibration patterns                   | P0       | Implemented | [0,250,250,250] default, [0,500,250,500] approvals      |
| Heads-up notifications for approvals | P0       | Implemented | MAX importance triggers heads-up display                |

### 3.1.5 Settings and Configuration

| Feature                            | Priority | Status      | Android-Specific Notes                    |
| ---------------------------------- | -------- | ----------- | ----------------------------------------- |
| Auto-approve mode (ask/smart/full) | P0       | Implemented | Three modes with explanatory descriptions |
| Haptic feedback toggle             | P1       | Implemented | Android vibration API                     |
| Push notification toggle           | P0       | Implemented | Controls both FCM and background fetch    |
| Voice features toggle              | P1       | Implemented | Disables PTT and TTS                      |
| Background fetch toggle            | P1       | Implemented | Controls 15-min agent status polling      |
| Account info display               | P1       | Implemented | Email, subscription tier                  |
| Sign out                           | P0       | Implemented | Clears session, unsubscribes listeners    |
| Memory management                  | P1       | Implemented | View/delete stored agent memories         |

### 3.1.6 Android-Specific Features (Not on iOS)

| Feature                               | Priority | Status      | Notes                                                 |
| ------------------------------------- | -------- | ----------- | ----------------------------------------------------- |
| Hardware back button handling         | P0       | Implemented | Double-press to exit with Toast confirmation          |
| Notification channels (3 channels)    | P0       | Implemented | Per-channel importance, vibration, LED                |
| Quick Settings tile (agent status)    | P2       | Planned     | Shows connected/disconnected, pending approvals count |
| Home screen widget (agent dashboard)  | P2       | Planned     | Glance API via Expo, shows active agents              |
| Lock screen notification actions      | P1       | Planned     | Inline approve/deny without unlocking                 |
| Split-screen multitasking             | P1       | Planned     | `android:resizeableActivity="true"`                   |
| Picture-in-picture (PiP) for voice    | P3       | Planned     | PiP window during voice conversation                  |
| Android Share intent (receive)        | P2       | Planned     | Share text/images from other apps to AGI chat         |
| App shortcuts (launcher shortcuts)    | P2       | Planned     | Long-press icon: New Chat, Voice Mode, Agents         |
| Predictive back gesture (Android 13+) | P1       | Planned     | Back-to-home animation preview                        |
| Themed app icon (Material You)        | P1       | Planned     | Monochrome icon for themed icon support               |
| Per-app language (Android 13+)        | P2       | Planned     | Language override independent of system               |
| Autofill integration                  | P3       | Planned     | Suggest AI-generated responses in text fields         |
| Foldable device support               | P2       | Planned     | Samsung Galaxy Z Fold layout adaptation               |
| Chromebook (Chrome OS) support        | P3       | Planned     | Windowed mode, keyboard shortcuts                     |
| Android Auto integration              | P3       | Planned     | Voice-only chat while driving                         |

### 3.1.7 Scheduling Features

| Feature                        | Priority | Status      | Notes                                 |
| ------------------------------ | -------- | ----------- | ------------------------------------- |
| View scheduled tasks           | P1       | Implemented | List view with next-run time          |
| Create scheduled task          | P1       | Implemented | Cron schedule builder                 |
| Edit/delete scheduled task     | P1       | Implemented | Inline editing                        |
| Schedule trigger notifications | P1       | Implemented | Push notification when schedule fires |

### 3.1.8 Messaging Features

| Feature               | Priority | Status      | Notes                              |
| --------------------- | -------- | ----------- | ---------------------------------- |
| In-app messaging      | P2       | Implemented | Team messaging panel               |
| Message notifications | P2       | Implemented | Push notification for new messages |

## 3.2 Feature Parity Table vs Competitors

| Feature                  | AGI Workforce Android    | Claude Android               | ChatGPT Android  | Gemini Android   |
| ------------------------ | ------------------------ | ---------------------------- | ---------------- | ---------------- |
| Text chat                | Yes                      | Yes                          | Yes              | Yes              |
| Streaming responses      | Yes (SSE)                | Yes                          | Yes              | Yes              |
| Model selection          | 30+ models, 9+ providers | Claude 4.5 Sonnet/Haiku only | GPT-4o/o3 only   | Gemini 3 only    |
| Voice input              | PTT + Whisper + Deepgram | No                           | Voice mode       | Voice mode       |
| Voice output (TTS)       | System TTS               | No                           | OpenAI TTS       | Google TTS       |
| Image attachment         | Camera + gallery         | Camera + gallery             | Camera + gallery | Camera + gallery |
| Image generation         | Yes (via API)            | No                           | Yes (DALL-E)     | Yes (Imagen)     |
| Desktop companion        | QR pairing + WebRTC      | No                           | No               | No               |
| Agent monitoring         | Real-time dashboard      | No                           | No               | No               |
| Tool approval            | Approve/deny from phone  | No                           | No               | No               |
| Background notifications | Agent approvals          | No                           | No               | No               |
| Notification channels    | 3 channels               | 1 channel                    | 1 channel        | 1 channel        |
| Lock screen actions      | Approve/deny (planned)   | No                           | No               | No               |
| Offline chat history     | Yes (MMKV)               | No                           | Limited          | Limited          |
| Cross-device sync        | Real-time Supabase       | Limited                      | Limited          | Yes              |
| Reasoning/thinking       | Yes (collapsible)        | Yes                          | Yes (o3)         | Yes              |
| Citations                | Yes                      | No                           | No               | Yes              |
| Code highlighting        | Yes                      | Yes                          | Yes              | No               |
| Conversation management  | Full CRUD + groups       | Basic                        | Basic            | Basic            |
| Quick Settings tile      | Planned                  | No                           | No               | No               |
| Home screen widget       | Planned                  | No                           | Yes (widget)     | Yes (widget)     |
| Side-loading APK         | Yes                      | No                           | No               | No               |
| Tablet optimization      | Drawer + responsive      | Limited                      | Yes              | Yes              |
| Dark mode                | Yes (default)            | Yes                          | Yes              | Yes              |
| Material You theming     | Planned                  | No                           | Yes              | Yes              |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Design System: Android Adaptations

The AGI Workforce Android app uses a dark-first design language adapted for Android conventions. While the iOS app follows Human Interface Guidelines, the Android app adapts to Material Design 3 (Material You) conventions where appropriate, while maintaining brand consistency.

### 4.1.1 Color System

| Token                         | Value                   | Usage                                            |
| ----------------------------- | ----------------------- | ------------------------------------------------ |
| `background` / `surface-base` | `#0f1012`               | Primary background, splash screen                |
| `surface-elevated`            | `#131514`               | Sidebar/drawer background, cards                 |
| `surface-overlay`             | `#1a1b1d`               | Bottom sheets, modals                            |
| `teal` (brand primary)        | `#21808d`               | Primary actions, active states, notification LED |
| `teal-400`                    | Tailwind teal-400       | Active dot indicators, primary buttons           |
| `teal-500`                    | Tailwind teal-500       | CTA buttons (Get Started, Send)                  |
| `text-primary`                | `#ffffff`               | Primary text                                     |
| `text-secondary`              | `rgba(255,255,255,0.5)` | Secondary text, labels, placeholders             |
| `text-tertiary`               | `rgba(255,255,255,0.4)` | Disabled text, skip buttons                      |
| `border`                      | `#2a2b2d`               | Dividers, card borders, drawer border            |
| `risk-low`                    | `#10b981` (emerald)     | Low-risk tool badges                             |
| `risk-medium`                 | `#f59e0b` (amber)       | Medium-risk tool badges                          |
| `risk-high`                   | `#ef4444` (red)         | High-risk tool badges, approval notifications    |
| `error`                       | `#ef4444`               | Error states, destructive actions                |
| `success`                     | `#10b981`               | Connected states, completed agents               |

### 4.1.2 Typography

| Style      | Font                      | Size | Weight         | Usage                        |
| ---------- | ------------------------- | ---- | -------------- | ---------------------------- |
| H1         | System (Roboto)           | 30sp | Bold (700)     | Onboarding titles            |
| H2         | System (Roboto)           | 24sp | Bold (700)     | Screen titles                |
| H3         | System (Roboto)           | 20sp | Semibold (600) | Section headers              |
| Body       | System (Roboto)           | 16sp | Regular (400)  | Chat messages, descriptions  |
| Body Small | System (Roboto)           | 14sp | Regular (400)  | Secondary labels, timestamps |
| Caption    | System (Roboto)           | 12sp | Regular (400)  | Metadata, badge text         |
| Code       | System Mono (Roboto Mono) | 14sp | Regular (400)  | Code blocks, tool output     |
| Button     | System (Roboto)           | 16sp | Semibold (600) | CTA buttons                  |
| Input      | System (Roboto)           | 16sp | Regular (400)  | Text input fields            |

Note: All text sizes use `sp` (scale-independent pixels) to respect user font size preferences (Android accessibility setting).

### 4.1.3 Android-Specific UI Patterns

| Pattern                  | iOS                     | Android                                                         |
| ------------------------ | ----------------------- | --------------------------------------------------------------- |
| Navigation back          | Swipe from left edge    | System back gesture (bottom edge swipe) or hardware back button |
| Bottom navigation        | Tab bar                 | Navigation drawer (hamburger menu)                              |
| Action sheets            | iOS-style action sheet  | Bottom sheet (Material 3)                                       |
| Haptic feedback          | Taptic Engine           | Android Vibration API                                           |
| Status bar               | Light content on dark   | Light content on dark, system-colored status bar                |
| Navigation bar (Android) | N/A                     | Transparent or surface-colored bottom nav bar                   |
| Toast messages           | Custom snackbar         | `ToastAndroid.show()` for system toast                          |
| Keyboard behavior        | Adjusts viewport        | `windowSoftInputMode="adjustResize"`                            |
| Pull to refresh          | UIRefreshControl        | SwipeRefreshLayout (via RN)                                     |
| Long press context       | Not primary interaction | Primary for context menus                                       |
| Back button exit         | Swipe to dismiss        | Double-press back to exit (with Toast confirmation)             |
| Splash screen            | Static launch image     | Adaptive icon splash with `#0f0f0f` background                  |

### 4.1.4 Touch Targets

All interactive elements follow Android's minimum touch target guidelines:

| Element           | Minimum Size      | Recommended Size  |
| ----------------- | ----------------- | ----------------- |
| Buttons           | 48dp x 48dp       | 56dp x 48dp       |
| Icon buttons      | 48dp x 48dp       | 48dp x 48dp       |
| List items        | Full width x 56dp | Full width x 72dp |
| Toggle switches   | 48dp x 48dp       | 48dp x 48dp       |
| Text input        | Full width x 48dp | Full width x 56dp |
| Drawer menu items | Full width x 48dp | Full width x 56dp |

### 4.1.5 Spacing and Layout

| Token         | Value | Usage                             |
| ------------- | ----- | --------------------------------- |
| `spacing-xs`  | 4dp   | Inline element gaps               |
| `spacing-sm`  | 8dp   | Compact padding                   |
| `spacing-md`  | 16dp  | Standard padding, section gaps    |
| `spacing-lg`  | 24dp  | Section separators                |
| `spacing-xl`  | 32dp  | Major section gaps                |
| `spacing-2xl` | 48dp  | Screen-level padding              |
| `radius-sm`   | 8dp   | Small cards, badges               |
| `radius-md`   | 12dp  | Cards, inputs                     |
| `radius-lg`   | 16dp  | Bottom sheets, large cards        |
| `radius-xl`   | 24dp  | Buttons, FABs                     |
| `radius-full` | 999dp | Circular elements (avatars, dots) |

---

## 4.2 Splash Screen

**Purpose**: Display the AGI Workforce brand during app initialization.

**Android-Specific Behavior**:

- Uses Android 12+ Splash Screen API (`SplashScreen` compat library via expo-splash-screen)
- Adaptive icon foreground: `./assets/adaptive-icon.png` (centered logo)
- Background color: `#0f0f0f` (near-black)
- Displayed until auth state is resolved (`isInitialized && !isLoading`)
- On Android 12+, the splash icon animates with a scale/fade transition automatically
- On Android 8-11, a static splash image is shown

**Duration**:

- Maximum: until `initialize()` completes (session recovery from SecureStore)
- Typical: 500ms-1500ms depending on Keystore access time
- If SecureStore is slow (rare, usually on first launch after reboot): up to 3 seconds

**Transition**: Fade-out to either:

1. Auth screen (`/(auth)/login`) if no session
2. Onboarding screen (`/onboarding`) if session exists but onboarding not completed
3. Home screen (`/(app)`) if fully authenticated

---

## 4.3 Authentication Screens

### 4.3.1 Login Screen (`/(auth)/login`)

**Route**: `/(auth)/login`
**Purpose**: Authenticate the user via email/password, Google, or Apple sign-in.

**Layout**:

```
+------------------------------------------+
|          [Status Bar - light text]        |
|                                          |
|                                          |
|              [App Logo]                  |
|          "AGI Workforce"                 |
|                                          |
|  +------------------------------------+ |
|  | Email                              | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | Password                           | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  |          Sign In                    | |
|  +------------------------------------+ |
|                                          |
|         "Don't have an account?"         |
|            [Sign Up] link                |
|                                          |
|  ----------- or continue with ---------- |
|                                          |
|  +------------------------------------+ |
|  |    [G] Continue with Google         | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  |    [] Continue with Apple          | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Component Inventory**:

| Component      | Type      | Properties                                                                                         |
| -------------- | --------- | -------------------------------------------------------------------------------------------------- |
| App Logo       | Image     | 80x80dp, centered                                                                                  |
| App Name       | Text      | "AGI Workforce", H2, white, centered                                                               |
| Email Input    | TextInput | placeholder: "Email", keyboardType: "email-address", autoCapitalize: "none", autoComplete: "email" |
| Password Input | TextInput | placeholder: "Password", secureTextEntry: true, autoComplete: "password"                           |
| Sign In Button | Pressable | Full width, teal-500 background, "Sign In" text, 16dp vertical padding, 16dp radius                |
| Sign Up Link   | Pressable | Text: "Don't have an account? Sign Up", teal-400 color for "Sign Up"                               |
| Divider        | View      | "or continue with" text, horizontal lines on each side, text-tertiary color                        |
| Google Sign In | Pressable | Full width, bordered, "Continue with Google" text, Google icon                                     |
| Apple Sign In  | Pressable | Full width, bordered, "Continue with Apple" text, Apple icon                                       |

**Interaction Flows**:

1. **Email sign in**: User enters email and password, taps "Sign In" -> `signInWithEmail()` -> on success, router replaces to `/(app)` or `/onboarding`
2. **Google sign in**: User taps "Continue with Google" -> opens in-app browser for Google OAuth -> receives access token -> `signInWithGoogle(accessToken)` -> on success, router replaces
3. **Apple sign in**: User taps "Continue with Apple" -> triggers `expo-apple-authentication` native flow -> receives ID token + nonce -> `signInWithApple(idToken, nonce)` -> on success, router replaces
4. **Sign up navigation**: User taps "Sign Up" link -> navigates to sign-up screen (same layout with "Sign Up" as primary action using `signUpWithEmail()`)

**Android-Specific Behavior**:

- Google Sign In uses `expo-web-browser` to open Chrome Custom Tab for OAuth (not a WebView)
- Apple Sign In via `expo-apple-authentication` works on Android via a web-based Apple Sign In flow
- Keyboard dismiss: tapping outside input fields dismisses the keyboard
- `autoComplete` attributes enable Android autofill framework integration (credential manager, password managers)
- Input fields have `android:imeOptions="actionNext"` (email) and `actionDone"` (password) for keyboard navigation
- On Android 14+, Credential Manager API may be used for passkey support (P3)

**State Variations**:

| State                       | UI Change                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Default                     | All inputs empty, Sign In button enabled                                            |
| Loading                     | Sign In button shows ActivityIndicator, inputs disabled                             |
| Error (invalid credentials) | Red error text below password field: "Invalid email or password. Please try again." |
| Error (network)             | Red error text: "Unable to connect. Check your internet connection."                |
| Error (rate limited)        | Red error text: "Too many attempts. Please try again in a few minutes."             |

**Error Messages (exact wording)**:

| Error Code            | Displayed Message                                       |
| --------------------- | ------------------------------------------------------- |
| `invalid_credentials` | "Invalid email or password. Please try again."          |
| `email_not_confirmed` | "Please check your email to confirm your account."      |
| `user_not_found`      | "No account found with this email address."             |
| `network_error`       | "Unable to connect. Check your internet connection."    |
| `rate_limited`        | "Too many attempts. Please try again in a few minutes." |
| `oauth_error`         | "Sign in failed. Please try again."                     |
| Default/unknown       | "Something went wrong. Please try again."               |

### 4.3.2 Sign Up Screen

**Route**: `/(auth)/signup` (or modal within login)
**Purpose**: Create a new account.

**Layout**: Same as Login Screen with these differences:

- Title text: "Create Account"
- Primary button text: "Create Account"
- Link text: "Already have an account? Sign In"
- Additional field: "Confirm Password" input between Password and button

**Android-Specific**: Same as Login Screen.

---

## 4.4 Onboarding Screen (`/onboarding`)

**Route**: `/onboarding`
**Purpose**: Introduce new users to the app's three key value propositions.
**Entry condition**: Session exists but `storage.getString('onboarding-done')` returns null.

**Layout**:

```
+------------------------------------------+
|                                [Skip]    |
|                                          |
|                                          |
|                                          |
|               [Emoji]                    |
|              80sp size                   |
|                                          |
|            [Slide Title]                 |
|          30sp, bold, white               |
|                                          |
|           [Slide Subtitle]               |
|        16sp, white/50, centered          |
|                                          |
|                                          |
|                                          |
|                                          |
|            [o] [o] [o]                   |
|          Dot indicators                  |
|                                          |
|  +------------------------------------+ |
|  |            Next                     | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Slides**:

| Slide | Emoji           | Title           | Subtitle                                                                  |
| ----- | --------------- | --------------- | ------------------------------------------------------------------------- |
| 1     | Robot emoji     | "Your AI Agent" | "Chat with any AI model -- Claude, GPT-4, Gemini, and more."              |
| 2     | Lightning emoji | "Any Tool"      | "Search the web, run code, automate your desktop -- all from your phone." |
| 3     | Lock emoji      | "Full Control"  | "Approve or deny every agent action. Your AI, your rules."                |

**Component Inventory**:

| Component               | Type      | Properties                                                                                                                             |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Skip Button             | Pressable | "Skip" text, text-tertiary color, top-right corner, 12dp padding, 3dp horizontal padding                                               |
| Emoji                   | Text      | 80sp font size, centered                                                                                                               |
| Title                   | Text      | 30sp, bold, white, centered, 24dp top margin from emoji                                                                                |
| Subtitle                | Text      | 16sp, white/50 opacity, centered, 12dp top margin, 24dp leading                                                                        |
| Dot Indicators          | View row  | 3 dots, active: 24dp wide teal-400, inactive: 8dp wide white/20, 8dp gap, 2dp height, full radius                                      |
| Next/Get Started Button | Pressable | Full width minus 48dp margins, teal-500 background, 16dp vertical padding, 16dp radius, "Next" or "Get Started" text (black, semibold) |

**Interaction Flows**:

1. **Swipe through slides**: User swipes horizontally or taps "Next" to advance
2. **Skip**: User taps "Skip" at any point -> sets `onboarding-done` in MMKV -> navigates to `/(app)`
3. **Complete**: On final slide, button text changes to "Get Started" -> sets `onboarding-done` -> navigates to `/(app)`

**Android-Specific Behavior**:

- Back button on first slide shows double-press-to-exit Toast (via root layout BackHandler)
- Back button on slides 2-3 goes to previous slide
- Slide transitions use `react-native-reanimated` for 60fps animation
- `active:opacity-90` provides touch feedback on the CTA button

---

## 4.5 Home Screen (`/(app)/index`)

**Route**: `/(app)/index` (drawer root)
**Purpose**: Starting point for new conversations. Intentionally minimal -- matches the desktop app's empty-state design.

**Layout**:

```
+------------------------------------------+
|  [=]                                      |
|  hamburger                               |
|                                          |
|                                          |
|                                          |
|          (intentionally empty)           |
|                                          |
|                                          |
|                                          |
|                                          |
|                                          |
|                                          |
|                                          |
|  +------------------------------------+ |
|  | [model] Message AGI Workforce [mic] | |
|  | [+]                         [send] | |
|  +------------------------------------+ |
+------------------------------------------+
```

**Component Inventory**:

| Component          | Type      | Properties                                                                                                                                                 |
| ------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hamburger Button   | Pressable | Menu icon (Lucide `Menu`), 22dp size, text-secondary color, top-left, 48dp touch target, `accessibilityLabel="Open sidebar"`, `accessibilityRole="button"` |
| Header             | View      | 48dp height, horizontal padding 16dp                                                                                                                       |
| Empty Content Area | View      | `flex: 1`, intentionally blank                                                                                                                             |
| ChatInput          | Component | Bottom-anchored, model picker trigger, voice mode trigger, send action                                                                                     |

**ChatInput Sub-Components**:

| Component           | Type      | Properties                                                                                        |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Model Selector Chip | Pressable | Shows current model name or "Auto (Balanced)", left side, opens model picker bottom sheet         |
| Text Input          | TextInput | placeholder: "Message AGI Workforce", multiline, max 6 lines (`MAX_INPUT_LINES`), 16sp, auto-grow |
| Attachment Button   | Pressable | `+` icon, opens image picker (camera/gallery selection)                                           |
| Voice Mode Button   | Pressable | Microphone icon, opens full-screen voice conversation overlay                                     |
| Send Button         | Pressable | Arrow-up icon, teal-500 background, circular, appears only when text is non-empty                 |

**Interaction Flows**:

1. **Send first message**:
   - User types text in ChatInput
   - Send button appears (animated)
   - User taps send
   - `createConversation(title)` is called (title = first 40 chars of text + "...")
   - Router pushes to `/(app)/chat/[conversationId]`
   - `sendMessage(conversationId, text, selectedModel)` fires the streaming request

2. **Open model picker**:
   - User taps model selector chip
   - ModelPickerSheet bottom sheet snaps to first snap point
   - User selects a model or auto-mode
   - Sheet dismisses, chip updates

3. **Open voice mode**:
   - User taps microphone button
   - VoiceConversationScreen full-screen overlay appears
   - User holds PTT button to record
   - On release: audio uploaded for transcription, response spoken via TTS

4. **Open sidebar**:
   - User taps hamburger button OR swipes from left edge (phones) / sidebar is permanent (tablets >= 768dp)
   - Drawer slides in showing conversation list and navigation

**Android-Specific Behavior**:

- Hamburger button is the primary navigation entry (Android convention, vs iOS tab bar)
- Swipe-from-left-edge opens drawer (enabled on phones, disabled on tablets where drawer is permanent)
- Hardware back button on home screen: first press shows Toast "Press back again to exit", second press within 2 seconds exits app
- Keyboard behavior: `windowSoftInputMode="adjustResize"` -- content scrolls up when keyboard opens
- The empty content area provides no suggestions, hints, or recent chats -- this is intentional design matching the desktop

**State Variations**:

| State                                  | UI Change                                                  |
| -------------------------------------- | ---------------------------------------------------------- |
| Not authenticated                      | Redirected to `/(auth)/login` (never seen)                 |
| Onboarding not done                    | Redirected to `/onboarding` (never seen)                   |
| Default (authenticated)                | Empty screen with ChatInput                                |
| Streaming active (from quick nav back) | ChatInput disabled, shows "Streaming..."                   |
| No network                             | ChatInput enabled but send creates local-only conversation |

---

## 4.6 Chat Screen (`/(app)/chat/[id]`)

**Route**: `/(app)/chat/[id]`
**Purpose**: Full conversation view with streaming responses, tool execution display, and message history.

**Layout**:

````
+------------------------------------------+
|  [=]           Chat Title         [...] |
|                                          |
|  +------------------------------------+ |
|  | User message                        | |
|  | "Tell me about quantum computing"   | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | [model icon] Claude 4.6 Sonnet      | |
|  |                                      | |
|  | [v] Thinking...                      | |
|  |   > Analyzing the query about...     | |
|  |                                      | |
|  | Quantum computing is a paradigm      | |
|  | of computation that harnesses...     | |
|  |                                      | |
|  | ```python                            | |
|  | def quantum_circuit():               | |
|  |     ...                              | |
|  | ```                     [Copy Code]  | |
|  |                                      | |
|  | [Citation 1] [Citation 2]            | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | [model] Message AGI Workforce [mic] | |
|  | [+]                         [send] | |
|  +------------------------------------+ |
+------------------------------------------+
````

**Component Inventory**:

| Component                | Type                  | Properties                                                                         |
| ------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| Header                   | View                  | 48dp height, hamburger left, title center, overflow menu right                     |
| Chat Title               | Text                  | Truncated conversation title, 16sp semibold, center-aligned                        |
| Overflow Menu            | Pressable             | Three-dot icon (`MoreVertical`), opens context menu                                |
| Message List             | FlashList             | `@shopify/flash-list`, inverted, estimated item size 100, keyboard-dismiss-on-drag |
| User Message Bubble      | View                  | Right-aligned, dark surface background, 12dp padding, 12dp radius                  |
| Assistant Message Bubble | View                  | Left-aligned, no background (transparent), model icon + name header                |
| Model Badge              | View                  | Small icon + model name, 12sp caption text                                         |
| Thinking Section         | Collapsible View      | Chevron toggle, "Thinking..." label when streaming, shows reasoning text           |
| Markdown Renderer        | Component             | Renders markdown with custom heading, paragraph, code block, link, list styles     |
| Code Block               | View                  | Monospace font, dark surface background, copy button, language label               |
| Copy Code Button         | Pressable             | "Copy" text or clipboard icon, top-right of code block                             |
| Citation Cards           | Horizontal ScrollView | Tappable cards with URL, title, snippet preview                                    |
| Streaming Indicator      | View                  | Pulsing cursor at end of streaming text                                            |
| Stop Button              | Pressable             | Square icon, appears during streaming, triggers `stopStreaming()`                  |
| ChatInput                | Component             | Same as home screen, with current conversation context                             |

**Tool Execution Display** (when message contains `toolCalls`):

| Component         | Type             | Properties                                                          |
| ----------------- | ---------------- | ------------------------------------------------------------------- |
| Tool Call Card    | View             | Bordered card, tool name, status badge, duration                    |
| Tool Status Badge | View             | "Running" (blue pulse), "Completed" (green check), "Failed" (red x) |
| Tool Output       | Collapsible View | Monospace text, expandable on tap                                   |

**Approval Request Display** (when message contains `approvalRequests`):

| Component       | Type      | Properties                                               |
| --------------- | --------- | -------------------------------------------------------- |
| Approval Card   | View      | Tool name, description, risk badge, approve/deny buttons |
| Risk Badge      | View      | Color-coded: green (low), amber (medium), red (high)     |
| Approve Button  | Pressable | Green background, "Approve" text, 48dp touch target      |
| Deny Button     | Pressable | Red bordered, "Deny" text, 48dp touch target             |
| Countdown Timer | Text      | Seconds remaining for auto-approval (if applicable)      |

**Image Generation Display**:

| Component          | Type       | Properties                                                  |
| ------------------ | ---------- | ----------------------------------------------------------- |
| Image Gen Progress | View       | Circular progress indicator, percentage, status text        |
| Generated Image    | expo-image | Full-width, aspect-ratio preserved, tap to view full screen |
| Revised Prompt     | Text       | Italic, secondary text below image                          |

**Interaction Flows**:

1. **Send message**: User types and sends -> optimistic user message + placeholder assistant message added -> streaming starts -> content updates in real-time -> on done: message finalized
2. **Stop streaming**: User taps stop button -> abort controller fires -> streaming text preserved at current state -> message marked as not streaming
3. **Copy code**: User taps copy button on code block -> text copied to clipboard -> haptic feedback + Toast "Copied to clipboard"
4. **Copy message**: User long-presses message -> context menu with "Copy" option -> full message content copied
5. **Share message**: User long-presses message -> context menu with "Share" option -> Android Share intent opens system share sheet
6. **Approve tool**: User taps "Approve" on approval card -> `approveRequest(id)` -> sends control message to desktop via WebRTC
7. **Deny tool**: User taps "Deny" -> `rejectRequest(id)` -> sends control message
8. **Expand thinking**: User taps thinking chevron -> reasoning text expands/collapses with animation
9. **Navigate to citation**: User taps citation card -> opens URL in `expo-web-browser` (Chrome Custom Tab)
10. **Rename conversation**: User taps overflow menu -> "Rename" -> inline text input appears in title area -> on submit: `renameConversation(id, newTitle)`
11. **Delete conversation**: User taps overflow menu -> "Delete" -> confirmation dialog -> `deleteConversation(id)` -> navigates back to home

**Android-Specific Behavior**:

- Hardware back button navigates back to home screen or previous chat
- Long-press on messages shows Android-style context menu (Copy, Share, Delete)
- Keyboard dismiss: ScrollView has `keyboardDismissMode="interactive"` (drag down to dismiss)
- FlashList uses `drawingMode="flatList"` on older Android versions for compatibility
- Android Share intent: creates share action with message text, includes conversation title as subject
- Clipboard operations use `@react-native-clipboard/clipboard` which maps to Android `ClipboardManager`
- Code blocks use `Roboto Mono` system font (pre-installed on Android)

**State Variations**:

| State                    | UI Change                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Loading messages         | ActivityIndicator centered, "Loading messages..."                                                                   |
| Empty conversation       | "Send a message to get started" centered text                                                                       |
| Streaming                | Stop button visible, cursor pulses at end of text, ChatInput send button disabled                                   |
| Error (streaming failed) | Last assistant message shows: "Something went wrong. Please try again." or partial content                          |
| Error (network)          | Last assistant message shows: "Failed to connect. Check your network and try again."                                |
| Offline                  | Banner at top: "You're offline. Messages will sync when connected." ChatInput still works (local-only conversation) |
| Image generating         | Progress circle, "Generating image..." text, percentage                                                             |
| Tool executing           | Tool cards with running/completed/failed states                                                                     |
| Approval pending         | Approval card with approve/deny buttons, risk badge, optional countdown                                             |

---

## 4.7 Sidebar / Drawer (`SidebarContent`)

**Component**: `components/sidebar/SidebarContent`
**Purpose**: Navigation and conversation history.

**Layout**:

```
+------------------------------+
| [New Chat]  [Search]         |
|------------------------------|
|  Today                       |
|  > "Tell me about quantum..."|
|  > "Help with Python code"   |
|                              |
|  Yesterday                   |
|  > "Draft email to client"   |
|                              |
|  This Week                   |
|  > "Research AI trends"      |
|                              |
|  Older                       |
|  > "Budget analysis Q1"     |
|------------------------------|
|  [Agents]   [Desktop]        |
|  [Messages] [Schedules]      |
|  [Settings]                  |
+------------------------------+
```

**Component Inventory**:

| Component                  | Type          | Properties                                                                                              |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| New Chat Button            | Pressable     | `MessageSquarePlus` icon, "New Chat" label, navigates to home                                           |
| Search Input               | TextInput     | placeholder: "Search conversations", filter conversations in real-time                                  |
| Time Group Header          | Text          | "Today", "Yesterday", "This Week", "Older" -- 12sp, uppercase, text-tertiary                            |
| Conversation Item          | Pressable     | Title (14sp, single line truncated), last message preview (12sp, text-secondary), tap navigates to chat |
| Conversation Swipe Actions | Swipeable     | Swipe right to reveal delete (red), swipe left to reveal pin (teal)                                     |
| Navigation Items           | Drawer.Screen | Icon + label: New Chat, Agents, Desktop, Messaging, Schedules, Settings                                 |

**Drawer Configuration**:

| Property                      | Phone (<768dp)      | Tablet (>=768dp)               |
| ----------------------------- | ------------------- | ------------------------------ |
| `drawerType`                  | `"front"` (overlay) | `"permanent"` (always visible) |
| `drawerStyle.width`           | 280dp               | 300dp                          |
| `drawerStyle.backgroundColor` | `#131514`           | `#131514`                      |
| `borderRightColor`            | `#2a2b2d`           | `#2a2b2d`                      |
| `swipeEnabled`                | `true`              | `false` (not needed)           |
| `overlayColor`                | `rgba(0,0,0,0.5)`   | N/A (permanent)                |

**Conversation Grouping Logic**:

Conversations are grouped by `updatedAt` relative to the start of the current day:

- **Today**: `age < 0` (updated after midnight today)
- **Yesterday**: `0 <= age < 86,400,000ms` (24 hours)
- **This Week**: `86,400,000 <= age < 604,800,000ms` (7 days)
- **Older**: `age >= 604,800,000ms`

Where `age = startOfToday - Date.parse(updatedAt)`.

**Android-Specific Behavior**:

- Drawer opens with swipe-from-left-edge gesture on phones
- On tablets (768dp+), drawer is permanent and cannot be swiped away
- Hardware back button while drawer is open: closes drawer
- Drawer items use Lucide icons matching the brand color scheme
- Conversation items support long-press for context menu (Rename, Delete, Pin)
- Android swipe gesture uses `react-native-gesture-handler` for native performance

---

## 4.8 Agents Screen (`/(app)/agents/index`)

**Route**: `/(app)/agents/index`
**Purpose**: View and manage active AI agents synced from the desktop companion.

**Layout**:

```
+------------------------------------------+
|  [=]          Agents              [Clear]|
|                                          |
|  +------------------------------------+ |
|  | [Running] Research Agent            | |
|  | claude-sonnet-4.6  |  78% complete  | |
|  | Step: Analyzing web results...      | |
|  | [==============-------]             | |
|  | Started: 2 min ago                  | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | [Waiting] Code Review Agent         | |
|  | gpt-5.2  |  Needs Approval          | |
|  | Tool: file_delete (/tmp/old.log)    | |
|  | Risk: [HIGH]                        | |
|  | [Approve]  [Deny]                   | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | [Completed] Email Draft Agent       | |
|  | claude-haiku-4.5  |  100%           | |
|  | Completed 5 min ago                 | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Component Inventory**:

| Component              | Type             | Properties                                                                                           |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| Header                 | View             | Hamburger left, "Agents" title center, "Clear" button right (removes completed)                      |
| Agent Card             | Pressable        | Border card, 12dp radius, 16dp padding, tap to select for detail view                                |
| Status Badge           | View             | Running (blue, pulsing dot), Waiting (amber, exclamation), Completed (green, check), Failed (red, x) |
| Agent Name             | Text             | 16sp semibold, white                                                                                 |
| Model Badge            | View             | Provider-colored dot + model name, 12sp caption                                                      |
| Progress Bar           | View             | Animated horizontal bar, teal fill on dark track, percentage label                                   |
| Current Step           | Text             | 14sp, text-secondary, truncated to 2 lines                                                           |
| Time Label             | Text             | "Started: X ago" / "Completed: X ago", 12sp, text-tertiary                                           |
| Tool Calls Section     | Collapsible List | Each tool call with name, status badge, duration, expandable output                                  |
| Approval Card          | View             | Inside agent card when status is "waiting", approve/deny buttons                                     |
| Clear Completed Button | Pressable        | "Clear" text, text-secondary, removes all completed agents                                           |

**Interaction Flows**:

1. **View agent detail**: Tap agent card -> `selectAgent(id)` -> card expands (or navigates to detail view on phone)
2. **Approve tool**: Tap "Approve" on approval card -> `approveRequest(id)` -> sends to desktop, agent resumes
3. **Deny tool**: Tap "Deny" -> `rejectRequest(id, reason)` -> sends to desktop, agent receives rejection
4. **Pause agent**: In expanded view, tap "Pause" button -> `sendAgentCommand(agentId, 'pause')` -> agent pauses on desktop
5. **Resume agent**: Tap "Resume" -> `sendAgentCommand(agentId, 'resume')` -> agent resumes
6. **Cancel agent**: Tap "Cancel" -> confirmation dialog -> `sendAgentCommand(agentId, 'cancel')` -> agent terminated on desktop
7. **Clear completed**: Tap "Clear" header button -> `clearCompleted()` -> removes all agents with status "completed"
8. **Pull to refresh**: Pull down on list -> `requestAgentRefresh()` via companion -> desktop sends fresh `agents_update`

**State Variations**:

| State                      | UI Change                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| No agents                  | Empty state: "No active agents. Pair with your desktop to monitor agents." + illustration |
| Not connected to desktop   | Banner: "Not connected to desktop. Scan QR to pair." + [Pair Now] button                  |
| Connected, agents running  | Agent cards with real-time updates                                                        |
| Connection lost            | Banner: "Desktop connection lost. Reconnecting..."                                        |
| Agent has pending approval | Approval card visible, notification badge on Agents drawer item                           |

**Android-Specific Behavior**:

- FlashList for agent list (recycler for performance)
- Pull-to-refresh uses Android `SwipeRefreshLayout`
- Approval card buttons have 48dp minimum touch targets
- Hardware back button goes to home screen

---

## 4.9 Desktop Companion Screen (`/(app)/companion/index`)

**Route**: `/(app)/companion/index`
**Purpose**: QR pairing, connection status, and desktop metadata display.

**Layout (Disconnected)**:

```
+------------------------------------------+
|  [=]       Desktop Companion             |
|                                          |
|                                          |
|           [Smartphone Icon]              |
|                                          |
|     "Pair with your desktop"             |
|                                          |
|  "Scan the QR code shown in the"         |
|  "AGI Workforce desktop app to"          |
|  "connect."                              |
|                                          |
|  +------------------------------------+ |
|  |          Scan QR Code               | |
|  +------------------------------------+ |
|                                          |
|  --- or enter code manually ---          |
|                                          |
|  +------------------------------------+ |
|  | Pairing code                        | |
|  +------------------------------------+ |
|  +------------------------------------+ |
|  |            Connect                  | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Layout (Connected)**:

```
+------------------------------------------+
|  [=]       Desktop Companion             |
|                                          |
|  +------------------------------------+ |
|  | [green dot] Connected               | |
|  |                                      | |
|  | Desktop: MacBook Pro                 | |
|  | Platform: macOS 15.4                 | |
|  | App Version: 1.1.5                   | |
|  |                                      | |
|  | Session expires: 23:45:00            | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | Active Agents: 2                     | |
|  | Pending Approvals: 1                 | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  |          Disconnect                 | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Component Inventory**:

| Component              | Type                | Properties                                                               |
| ---------------------- | ------------------- | ------------------------------------------------------------------------ |
| Smartphone Icon        | Lucide `Smartphone` | 64dp, text-secondary                                                     |
| Title                  | Text                | "Pair with your desktop", 20sp semibold, white                           |
| Description            | Text                | Explanatory text, 14sp, text-secondary, centered                         |
| Scan QR Button         | Pressable           | Full width, teal-500 background, "Scan QR Code" text, opens camera       |
| Divider                | View                | "or enter code manually" text                                            |
| Pairing Code Input     | TextInput           | placeholder: "Pairing code", autoCapitalize: "characters", maxLength: 12 |
| Connect Button         | Pressable           | Full width, bordered, "Connect" text                                     |
| Connection Status Card | View                | Green/red dot, "Connected"/"Disconnected" text                           |
| Desktop Info           | Text list           | Device name, platform, version, OS                                       |
| Session Timer          | Text                | Countdown to session expiry                                              |
| Agent Stats            | View                | "Active Agents: N", "Pending Approvals: N"                               |
| Disconnect Button      | Pressable           | Full width, red bordered, "Disconnect" text                              |

**Interaction Flows**:

1. **Scan QR code**:
   - User taps "Scan QR Code" -> camera opens with QR scanner overlay
   - QR content validated: must match `agiw:XXXXXX` or raw `XXXXXX` pattern (6-12 alphanumeric)
   - On valid scan: `connect(code)` called -> status changes to "connecting" -> WebRTC setup + signaling
   - On invalid scan: error message "Invalid QR code. Please scan the code from your AGI Workforce desktop app."

2. **Manual code entry**:
   - User types pairing code in input field
   - User taps "Connect" -> `isValidPairingCode()` validates format
   - If valid: `connect(code)` -> same connection flow as QR
   - If invalid: error text below input: "Invalid code format. Enter 6-12 letters and numbers."

3. **Deep link pairing**:
   - App receives `agiworkforce://pair/CODE` or `agiworkforce://pair?code=CODE` deep link
   - Root layout handles: extracts code, navigates to companion screen with `?pairingCode=CODE` query param
   - Companion screen auto-connects on mount if `pairingCode` is present

4. **Disconnect**: User taps "Disconnect" -> `disconnect()` -> closes signaling client, cleans up WebRTC, clears agent store

**Connection States**:

| State          | Status    | UI                                      |
| -------------- | --------- | --------------------------------------- |
| `disconnected` | Default   | Pairing UI (QR + manual code)           |
| `connecting`   | Signaling | "Connecting..." with ActivityIndicator  |
| `connected`    | Active    | Connection info card, disconnect button |
| `error`        | Failed    | Error message with retry option         |

**Error Messages (from `friendlyErrorMessage`)**:

| Raw Error           | Displayed Message                                            |
| ------------------- | ------------------------------------------------------------ |
| `connection_error`  | "Unable to reach the pairing server. Check your connection." |
| `connection_closed` | "Connection to pairing server lost."                         |
| `invalid_code`      | "Invalid pairing code. Please try again."                    |
| `session_full`      | "This pairing session already has two devices connected."    |
| `rate_limited`      | "Too many attempts. Please wait a moment."                   |
| Session expired     | "Pairing session expired. Please scan a new QR code."        |
| Default             | "An unexpected error occurred."                              |

**Android-Specific Behavior**:

- QR scanner uses `expo-camera` with `CameraView` and `onBarCodeScanned` callback
- Camera permission requested at runtime with rationale: "Allow AGI Workforce to access your camera for QR scanning and photo features."
- Android `android:exported="true"` required on the activity for deep link intent handling
- Deep link intent filter: `scheme="agiworkforce"`, `host="pair"`, `pathPattern=".*"`
- Hardware back button on companion screen goes to home

---

## 4.10 Schedules Screen (`/(app)/schedules/index`)

**Route**: `/(app)/schedules/index`
**Purpose**: View and manage scheduled agent tasks.

**Layout**:

```
+------------------------------------------+
|  [=]       Schedules             [+]     |
|                                          |
|  +------------------------------------+ |
|  | Daily Standup Summary               | |
|  | Every day at 9:00 AM                | |
|  | Next run: Tomorrow, 9:00 AM        | |
|  | Model: claude-sonnet-4.6            | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | Weekly Report                        | |
|  | Every Monday at 8:00 AM             | |
|  | Next run: Mon Mar 16, 8:00 AM       | |
|  | Model: gpt-5.2                      | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Component Inventory**:

| Component        | Type      | Properties                                                                   |
| ---------------- | --------- | ---------------------------------------------------------------------------- |
| Header           | View      | Hamburger left, "Schedules" center, "+" create button right                  |
| Schedule Card    | Pressable | Title, cron description, next run time, model, tap to edit                   |
| Schedule Title   | Text      | 16sp semibold, white                                                         |
| Cron Description | Text      | Human-readable ("Every day at 9:00 AM"), 14sp, text-secondary                |
| Next Run         | Text      | "Next run: [date/time]", 12sp, text-tertiary                                 |
| Model Badge      | View      | Provider dot + model name                                                    |
| Create Button    | Pressable | "+" icon, navigates to `schedules/create`                                    |
| Empty State      | View      | "No schedules yet. Create one to automate tasks." + [Create Schedule] button |

**Interaction Flows**:

1. **View schedule**: Tap card -> navigate to edit screen
2. **Create schedule**: Tap "+" -> navigate to `schedules/create` -> cron builder + prompt input + model selection
3. **Delete schedule**: Long-press card -> "Delete" option -> confirmation -> removes schedule

**Android-Specific Behavior**:

- Cards have Material 3 elevation shadow (subtle)
- FAB-style "+" button in header (could be migrated to floating action button in future)

---

## 4.11 Create Schedule Screen (`/(app)/schedules/create`)

**Route**: `/(app)/schedules/create`
**Purpose**: Create a new scheduled agent task with cron schedule, prompt, and model selection.

**Layout**:

```
+------------------------------------------+
|  [<]       Create Schedule        [Save] |
|                                          |
|  Schedule Name                           |
|  +------------------------------------+ |
|  | e.g., Daily Standup Summary         | |
|  +------------------------------------+ |
|                                          |
|  Frequency                               |
|  [Daily] [Weekly] [Monthly] [Custom]     |
|                                          |
|  Time                                    |
|  +------------------------------------+ |
|  | 09:00 AM                            | |
|  +------------------------------------+ |
|                                          |
|  Prompt                                  |
|  +------------------------------------+ |
|  | Summarize the team's progress...    | |
|  |                                      | |
|  +------------------------------------+ |
|                                          |
|  Model                                   |
|  +------------------------------------+ |
|  | Auto (Balanced)                 [>] | |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Android-Specific Behavior**:

- Time picker uses Android `TimePickerDialog` (Material 3 style)
- Day-of-week selector for weekly uses chip group pattern
- Save button in header is disabled until all required fields are filled
- Hardware back button acts as cancel (with discard confirmation if form is dirty)

---

## 4.12 Settings Screen (`/(app)/settings/index`)

**Route**: `/(app)/settings/index`
**Purpose**: App configuration and account management.

**Layout**:

```
+------------------------------------------+
|  [=]          Settings                    |
|                                          |
|  Account                                 |
|  +------------------------------------+ |
|  | Email: user@example.com             | |
|  | Plan: Pro                           | |
|  +------------------------------------+ |
|                                          |
|  Agent Behavior                          |
|  +------------------------------------+ |
|  | Auto-Approve Mode         [Ask  v] | |
|  |   Ask: Always ask before           | |
|  |   executing tools                  | |
|  +------------------------------------+ |
|                                          |
|  Preferences                             |
|  +------------------------------------+ |
|  | Haptic Feedback          [toggle]  | |
|  | Push Notifications       [toggle]  | |
|  | Voice Features           [toggle]  | |
|  | Background Agent Polling  [toggle]  | |
|  +------------------------------------+ |
|                                          |
|  Data                                    |
|  +------------------------------------+ |
|  | Memory                          [>] | |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  |           Sign Out                  | |
|  +------------------------------------+ |
|                                          |
|  v0.1.0                                 |
+------------------------------------------+
```

**Component Inventory**:

| Component           | Type            | Properties                                                                          |
| ------------------- | --------------- | ----------------------------------------------------------------------------------- |
| Section Header      | Text            | "Account", "Agent Behavior", "Preferences", "Data" -- 12sp uppercase, text-tertiary |
| Account Info        | View            | Email, plan tier from auth store                                                    |
| Auto-Approve Picker | Dropdown/Select | Three options: Ask, Smart, Full                                                     |
| Toggle Items        | View + Switch   | Label, optional description, toggle switch                                          |
| Memory Navigation   | Pressable       | "Memory" label, chevron right, navigates to `settings/memory`                       |
| Sign Out Button     | Pressable       | Full width, red text, "Sign Out"                                                    |
| Version Label       | Text            | "v0.1.0", 12sp, text-tertiary, centered                                             |

**Auto-Approve Mode Options**:

| Mode    | Label   | Description                                      |
| ------- | ------- | ------------------------------------------------ |
| `ask`   | "Ask"   | "Always ask before executing tools"              |
| `smart` | "Smart" | "Auto-approve low-risk tools, ask for high-risk" |
| `full`  | "Full"  | "Auto-approve all tool executions"               |

**Toggle Items**:

| Setting                  | Default | Description                                                      |
| ------------------------ | ------- | ---------------------------------------------------------------- |
| Haptic Feedback          | On      | "Enable vibration feedback for interactions"                     |
| Push Notifications       | On      | "Receive notifications for agent approvals and tasks"            |
| Voice Features           | On      | "Enable voice input and text-to-speech"                          |
| Background Agent Polling | On      | "Check for pending approvals in the background every 15 minutes" |

**Interaction Flows**:

1. **Change auto-approve**: User taps dropdown -> selects mode -> `setAutoApproveMode(mode)` -> persists to MMKV
2. **Toggle setting**: User flips toggle -> setter called -> persists to MMKV -> immediate effect
3. **View memory**: Tap "Memory" -> navigates to `settings/memory` -> list of stored agent memories with delete
4. **Sign out**: Tap "Sign Out" -> confirmation dialog -> `signOut()` -> clears session, unsubscribes auth listeners, navigates to login

**Android-Specific Behavior**:

- Toggle switches use Android-style switch (rounded track + thumb)
- Auto-approve picker uses Android-style dropdown or bottom sheet picker
- Sign out has confirmation dialog (AlertDialog)
- "Sign Out" text is red (#ef4444)
- Version number from `app.json` version field

---

## 4.13 Memory Screen (`/(app)/settings/memory`)

**Route**: `/(app)/settings/memory`
**Purpose**: View and manage stored agent memories (key-value pairs synced from desktop).

**Layout**:

```
+------------------------------------------+
|  [<]          Memory                      |
|                                          |
|  +------------------------------------+ |
|  | "User prefers Python for scripting" | |
|  | Created: Mar 8, 2026               | |
|  |                             [Delete] |
|  +------------------------------------+ |
|                                          |
|  +------------------------------------+ |
|  | "Project uses PostgreSQL 16"        | |
|  | Created: Mar 7, 2026               | |
|  |                             [Delete] |
|  +------------------------------------+ |
|                                          |
+------------------------------------------+
```

**Android-Specific Behavior**:

- Delete uses swipe-to-reveal pattern (swipe left to show delete button)
- Alternatively, long-press to show delete option in context menu
- Empty state: "No memories stored yet. Memories are synced from your desktop agent."

---

## 4.14 Messaging Screen (`/(app)/messaging/index`)

**Route**: `/(app)/messaging/index`
**Purpose**: In-app team messaging panel.

**Layout**: Standard messaging interface with conversation list and message detail view.

**Android-Specific Behavior**:

- Uses FlashList for message rendering
- Keyboard handling with `adjustResize`
- Notification channel: uses "default" channel for message notifications

---

## 4.15 Voice Conversation Overlay (`VoiceConversationScreen`)

**Component**: `components/voice/VoiceConversationScreen`
**Purpose**: Full-screen voice conversation interface with push-to-talk.

**Layout**:

```
+------------------------------------------+
|                             [X] Close    |
|                                          |
|                                          |
|              [Waveform]                  |
|           /\/\/\/\/\/\/\                 |
|                                          |
|         "Recording... 0:03"              |
|                                          |
|                                          |
|                                          |
|           +------------+                 |
|           |            |                 |
|           | Hold to    |                 |
|           |  Record    |                 |
|           |            |                 |
|           +------------+                 |
|            Push-to-talk                  |
|                                          |
+------------------------------------------+
```

**Component Inventory**:

| Component        | Type          | Properties                                                    |
| ---------------- | ------------- | ------------------------------------------------------------- |
| Close Button     | Pressable     | "X" icon, top-right, dismisses overlay                        |
| Waveform         | Animated View | Real-time metering visualization (~15fps), dB-based amplitude |
| Recording Status | Text          | "Recording... 0:03" or "Processing..." or "Speaking..."       |
| PTT Button       | Pressable     | Large circular button (80dp), hold to record, release to stop |
| PTT Label        | Text          | "Hold to Record" or "Release to Send"                         |

**Interaction Flows**:

1. **Start recording**: User presses and holds PTT button -> `startRecording(onMetering)` -> waveform animates
2. **Stop recording**: User releases PTT -> `stopRecording()` -> returns URI -> "Processing..." shown
3. **Transcribe**: Audio uploaded to Whisper endpoint (or Deepgram if key available) -> text returned
4. **Send message**: Transcribed text sent as chat message -> response streamed
5. **Speak response**: Response text spoken via `expo-speech` TTS -> "Speaking..." shown
6. **Cancel**: User taps close button -> `cancelRecording()` if recording -> overlay dismisses

**Android-Specific Behavior**:

- Audio recording format: M4A, AAC encoder, 44.1kHz, 128kbps, mono
- `shouldDuckAndroid: true` -- other audio sources duck during recording
- `allowsRecordingIOS: false` for playback mode (Android equivalent: release audio focus)
- Microphone permission checked before recording; if denied, shows permission rationale dialog
- PiP mode (P3): when user navigates away during voice conversation, could enter picture-in-picture

---

## 4.16 Model Picker Bottom Sheet (`ModelPickerSheet`)

**Component**: `components/model-picker/ModelPickerSheet`
**Purpose**: Select an AI model or auto-mode for the current/next conversation.

**Layout**:

```
+------------------------------------------+
|  -------- (handle) --------              |
|                                          |
|  Auto Modes                              |
|  +--------+ +--------+ +--------+       |
|  |Economy | |Balanced| |Premium |       |
|  |Fastest | |Best all| |Most    |       |
|  |cheapest| |around  | |capable |       |
|  +--------+ +--------+ +--------+       |
|                                          |
|  Provider: [All] [OpenAI] [Anthropic]... |
|                                          |
|  +------------------------------------+ |
|  | [*] GPT-5.2             [Premium]  | |
|  |     OpenAI  |  400K ctx  |  Vision  | |
|  +------------------------------------+ |
|  | [*] Claude 4.6 Opus      [Premium]  | |
|  |     Anthropic | 200K ctx | Vision   | |
|  +------------------------------------+ |
|  | [*] Gemini 3 Pro         [Balanced] | |
|  |     Google | 2M ctx | Vision        | |
|  +------------------------------------+ |
|  ...                                     |
+------------------------------------------+
```

**Component Inventory**:

| Component         | Type                  | Properties                                                                                     |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| Handle            | View                  | 40dp wide, 4dp tall, rounded, centered, for drag gesture                                       |
| Auto Mode Cards   | Pressable row         | 3 cards: Economy, Balanced, Premium with icon + description                                    |
| Provider Filter   | Horizontal ScrollView | Chips: "All", then one per provider (OpenAI, Anthropic, Google, etc.)                          |
| Model Item        | Pressable             | Model name, provider, context window formatted (e.g., "200K"), capabilities (Vision, Thinking) |
| Tier Badge        | View                  | "Economy" (green), "Balanced" (blue), "Premium" (purple)                                       |
| Favorite Star     | Pressable             | Star icon, toggles favorite status                                                             |
| Recent Section    | View                  | "Recently Used" header + last 5 models                                                         |
| Favorites Section | View                  | "Favorites" header + user-favorited models                                                     |

**Model Catalog** (30+ models across 9 providers):

| Provider   | Models                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| OpenAI     | GPT-5.2, GPT-5.2 Codex (Low/Medium/High/XHigh), GPT-5 Pro, GPT-5 Nano, o3 |
| Anthropic  | Claude 4.6 Opus, Claude 4.6 Sonnet, Claude 4.5 Sonnet, Claude 4.5 Haiku   |
| Google     | Gemini 3 Pro, Gemini 3 Flash                                              |
| xAI        | Grok 4, Grok 4 Fast Reasoning, Grok 4 Fast (Non-Reasoning)                |
| DeepSeek   | DeepSeek Chat (V3), DeepSeek R1                                           |
| Moonshot   | Kimi K2.5, Kimi K2.5 Thinking                                             |
| Qwen       | Qwen Max, Qwen Flash                                                      |
| ZhipuAI    | GLM-4.7, GLM-4.6V (Vision), GLM-4.6V Flash (FREE)                         |
| Perplexity | Sonar, Sonar Reasoning, Sonar Pro, Sonar Deep Research                    |

**Interaction Flows**:

1. **Select auto-mode**: Tap auto mode card -> `setModel(autoModeId)` -> sheet dismisses -> chip updates
2. **Filter by provider**: Tap provider chip -> model list filters to that provider only
3. **Select model**: Tap model item -> `setModel(modelId)` -> pushes to recents -> sheet dismisses
4. **Favorite model**: Tap star -> `toggleFavorite(modelId)` -> star fills/unfills
5. **Dismiss**: Swipe down or tap outside -> sheet dismisses

**Remote Model Catalog**:

- On app launch, `fetchModelCatalog()` is called
- Checks MMKV cache: if cache exists and is < 1 hour old, uses cached data
- Otherwise, fetches from `GET /api/models` with 10-second timeout
- On failure, falls back to embedded `MODEL_LIST` (30+ models)
- Response shape: `{ models: ApiModelEntry[], version: string, lastUpdated: string }`

**Android-Specific Behavior**:

- Bottom sheet uses `@gorhom/bottom-sheet` with reanimated for smooth gestures
- Snap points: 50% screen height (compact), 85% (expanded)
- Provider filter chips have horizontal fling gesture
- Background dimming: semi-transparent overlay
- Handle drag gesture for resize

---

# Section 5: Component Architecture

## 5.1 Component Hierarchy

```
RootLayout (app/_layout.tsx)
  |-- GestureHandlerRootView
  |   |-- SafeAreaProvider
  |   |   |-- StatusBar (style="light")
  |   |   |-- Slot (expo-router)
  |   |       |-- (auth)/_layout.tsx
  |   |       |   |-- login.tsx
  |   |       |
  |   |       |-- onboarding.tsx
  |   |       |
  |   |       |-- (app)/_layout.tsx (Drawer)
  |   |           |-- index.tsx (Home)
  |   |           |   |-- ChatInput
  |   |           |   |   |-- ModelSelectorChip
  |   |           |   |   |-- TextInput (multiline)
  |   |           |   |   |-- AttachmentButton
  |   |           |   |   |-- VoiceModeButton
  |   |           |   |   |-- SendButton
  |   |           |   |-- ModelPickerSheet
  |   |           |   |   |-- AutoModeCards
  |   |           |   |   |-- ProviderFilterChips
  |   |           |   |   |-- ModelList (FlashList)
  |   |           |   |       |-- ModelItem
  |   |           |   |-- VoiceConversationScreen
  |   |           |       |-- WaveformVisualizer
  |   |           |       |-- PTTButton
  |   |           |
  |   |           |-- chat/[id].tsx
  |   |           |   |-- ChatHeader (title, overflow menu)
  |   |           |   |-- MessageList (FlashList, inverted)
  |   |           |   |   |-- UserMessageBubble
  |   |           |   |   |-- AssistantMessageBubble
  |   |           |   |       |-- ModelBadge
  |   |           |   |       |-- ThinkingSection (collapsible)
  |   |           |   |       |-- MarkdownRenderer
  |   |           |   |       |   |-- CodeBlock (syntax highlight, copy)
  |   |           |   |       |   |-- InlineCode
  |   |           |   |       |   |-- Heading
  |   |           |   |       |   |-- ListItem
  |   |           |   |       |   |-- Link
  |   |           |   |       |   |-- Blockquote
  |   |           |   |       |-- ToolCallCards
  |   |           |   |       |   |-- ToolStatusBadge
  |   |           |   |       |   |-- ToolOutput (collapsible)
  |   |           |   |       |-- ApprovalCards
  |   |           |   |       |   |-- RiskBadge
  |   |           |   |       |   |-- ApproveButton
  |   |           |   |       |   |-- DenyButton
  |   |           |   |       |-- CitationCards (horizontal scroll)
  |   |           |   |       |-- ImageGenDisplay
  |   |           |   |       |-- StreamingCursor
  |   |           |   |-- StopButton
  |   |           |   |-- ChatInput
  |   |           |   |-- ModelPickerSheet
  |   |           |
  |   |           |-- agents/index.tsx
  |   |           |   |-- AgentCard
  |   |           |   |   |-- AgentStatusBadge
  |   |           |   |   |-- ProgressBar
  |   |           |   |   |-- ToolCallList
  |   |           |   |   |-- ApprovalCard (inline)
  |   |           |   |-- EmptyAgentState
  |   |           |
  |   |           |-- companion/index.tsx
  |   |           |   |-- QRScanner (expo-camera)
  |   |           |   |-- PairingCodeInput
  |   |           |   |-- ConnectionStatusCard
  |   |           |   |-- DesktopInfoCard
  |   |           |
  |   |           |-- messaging/index.tsx
  |   |           |   |-- MessageList
  |   |           |   |-- MessageInput
  |   |           |
  |   |           |-- schedules/index.tsx
  |   |           |   |-- ScheduleCard
  |   |           |   |-- EmptyScheduleState
  |   |           |
  |   |           |-- schedules/create.tsx
  |   |           |   |-- ScheduleForm
  |   |           |   |   |-- FrequencyPicker
  |   |           |   |   |-- TimePicker
  |   |           |   |   |-- PromptInput
  |   |           |   |   |-- ModelSelector
  |   |           |
  |   |           |-- settings/index.tsx
  |   |           |   |-- AccountSection
  |   |           |   |-- AutoApproveSelector
  |   |           |   |-- ToggleItem (haptics, notifications, voice, bgfetch)
  |   |           |   |-- MemoryNavItem
  |   |           |   |-- SignOutButton
  |   |           |
  |   |           |-- settings/memory.tsx
  |   |               |-- MemoryItem (swipe-to-delete)
  |   |               |-- EmptyMemoryState
  |   |
  |   |-- SidebarContent (drawer content)
  |       |-- NewChatButton
  |       |-- SearchInput
  |       |-- ConversationGroupList
  |       |   |-- TimeGroupHeader
  |       |   |-- ConversationItem (swipeable)
  |       |-- NavigationItems
```

## 5.2 Shared Components (Cross-Platform with iOS)

These components are fully shared between Android and iOS via the React Native + NativeWind codebase:

| Component                 | Path                                           | Description                                                 |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `Text`                    | `components/ui/text.tsx`                       | Base text component with theme-aware styling                |
| `ChatInput`               | `components/chat/ChatInput.tsx`                | Multi-line input with model picker, voice, attachment, send |
| `ModelPickerSheet`        | `components/model-picker/ModelPickerSheet.tsx` | Bottom sheet model selector                                 |
| `SidebarContent`          | `components/sidebar/SidebarContent.tsx`        | Drawer content with conversation list                       |
| `VoiceConversationScreen` | `components/voice/VoiceConversationScreen.tsx` | Full-screen voice overlay                                   |
| `MarkdownRenderer`        | (implied from chat components)                 | Custom markdown rendering                                   |
| All stores                | `stores/*.ts`                                  | Zustand stores are fully cross-platform                     |
| All services              | `services/*.ts`                                | API, streaming, notifications, etc.                         |
| All lib utilities         | `lib/*.ts`                                     | Constants, models, helpers                                  |

## 5.3 Android-Specific Platform Modules

These modules have Android-specific code paths or configurations:

| Module                        | Android Specifics                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `app/_layout.tsx`             | `BackHandler` for hardware back button, `ToastAndroid.show()`                         |
| `services/notifications.ts`   | `setNotificationChannelAsync()` for 3 Android channels, LED color, vibration patterns |
| `services/voice.ts`           | `AndroidOutputFormat.MPEG_4`, `AndroidAudioEncoder.AAC`, `shouldDuckAndroid`          |
| `services/backgroundFetch.ts` | `startOnBoot: true` for Android (survives app process death)                          |
| `services/supabase.ts`        | Android Keystore via expo-secure-store (chunked for >2KB values)                      |
| `lib/secureStorage.ts`        | Android Keystore-backed encryption at rest                                            |
| `app.json` (android section)  | `adaptiveIcon`, `package`, `permissions`                                              |

## 5.4 State Management Architecture

### 5.4.1 Store Inventory

| Store                | File                        | Storage                    | Sensitive | Description                        |
| -------------------- | --------------------------- | -------------------------- | --------- | ---------------------------------- |
| `useAuthStore`       | `stores/authStore.ts`       | `secureStorage` (Keystore) | Yes       | Session, user, auth methods        |
| `useChatStore`       | `stores/chatStore.ts`       | `mmkvStorage`              | No        | Conversations, messages, streaming |
| `useConnectionStore` | `stores/connectionStore.ts` | `mmkvStorage`              | No        | Desktop companion connection       |
| `useAgentStore`      | `stores/agentStore.ts`      | `mmkvStorage`              | No        | Agent status, approvals            |
| `useModelStore`      | `stores/modelStore.ts`      | `mmkvStorage`              | No        | Selected model, favorites, recents |
| `useMemoryStore`     | `stores/memoryStore.ts`     | `mmkvStorage`              | No        | Agent memories                     |
| `useMessagingStore`  | `stores/messagingStore.ts`  | `mmkvStorage`              | No        | In-app messaging                   |
| `useScheduleStore`   | `stores/scheduleStore.ts`   | `mmkvStorage`              | No        | Scheduled tasks                    |
| `useSettingsStore`   | `stores/settingsStore.ts`   | `mmkvStorage`              | No        | App preferences                    |

### 5.4.2 Storage Strategy

| Data Type                 | Storage                      | Encryption                   | Rationale                         |
| ------------------------- | ---------------------------- | ---------------------------- | --------------------------------- |
| Auth session (JWT tokens) | expo-secure-store (Keystore) | AES-256 via Android Keystore | Tokens are sensitive credentials  |
| Supabase session          | expo-secure-store (chunked)  | AES-256 via Android Keystore | Session JSON can exceed 2KB limit |
| Chat history              | MMKV                         | None (not sensitive)         | Fast read/write for UI state      |
| User preferences          | MMKV                         | None                         | Toggle states, model selection    |
| Pairing code              | MMKV                         | None                         | Re-connection convenience         |
| Agent state               | MMKV                         | None                         | Transient, synced from desktop    |
| Model catalog cache       | MMKV                         | None                         | 1-hour TTL, refreshed from API    |
| Onboarding flag           | MMKV                         | None                         | Simple boolean                    |

### 5.4.3 MMKV Persistence Limits

To prevent unbounded storage growth:

| Store                     | Limit      | Implementation                                               |
| ------------------------- | ---------- | ------------------------------------------------------------ |
| Conversations             | 200 max    | `partialize` in chatStore trims to 200                       |
| Messages per conversation | 100 max    | `partialize` slices to last 100, excludes streaming messages |
| Recent models             | 5 max      | `MAX_RECENT` constant in modelStore                          |
| Model catalog cache       | 1 hour TTL | `TTL_MS` in modelCatalog service                             |

## 5.5 TypeScript Interfaces

### 5.5.1 Chat Types (`types/chat.ts`)

```typescript
type MessageRole = 'user' | 'assistant' | 'system';
type MessageType = 'text' | 'image';
type RiskLevel = 'low' | 'medium' | 'high';
type AutoApproveMode = 'ask' | 'smart' | 'full';
type ConversationGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older';

interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  reasoning?: string;
  artifacts?: Artifact[];
  toolCalls?: ToolCall[];
  approvalRequests?: ApprovalRequest[];
  steps?: StatusStep[];
  isStreaming?: boolean;
  model?: string;
  type?: MessageType;
  imageUrl?: string;
  revisedPrompt?: string;
  isGeneratingImage?: boolean;
  imageGenProgress?: number;
  imageGenStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  imageGenEstimatedTime?: number;
  imageGenError?: string;
  imageGenPrompt?: string;
  citations?: Array<{ url: string; title?: string; snippet?: string }>;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  pinned: boolean;
  lastMessage?: string;
  model?: string;
  tags?: string[];
}

interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  type: 'file_delete' | 'command' | 'api_call' | 'data_modification' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  countdown?: number;
}

interface ToolCall {
  id: string;
  name: string;
  command?: string;
  filePath?: string;
  input?: string;
  output?: string;
  status: 'running' | 'completed' | 'failed';
  duration?: number;
}
```

### 5.5.2 Connection Types (`stores/connectionStore.ts`)

```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface DesktopMetadata {
  deviceName?: string;
  platform?: string;
  version?: string;
  os?: string;
  [key: string]: unknown;
}
```

### 5.5.3 Agent Types (`stores/agentStore.ts`)

```typescript
interface Agent {
  id: string;
  name: string;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  currentStep: string;
  progress: number; // 0-100
  steps: StatusStep[];
  toolCalls: ToolCall[];
  startedAt: string;
  updatedAt: string;
}
```

### 5.5.4 Model Types (`lib/models.ts`)

```typescript
type ModelTier = 'economy' | 'balanced' | 'premium';

interface ModelDef {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: ModelTier;
}

interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface AutoModeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: ModelTier;
}
```

---

# Section 6: Data Flow & API Connections

## 6.1 API Architecture Overview

The Android app communicates with three backend systems:

```
+---------------------+      HTTPS      +---------------------+
| Android App         | <-------------> | API Gateway          |
| (React Native)      |                 | (Express.js)         |
|                     |      WSS       |                     |
|                     | <-------------> | Signaling Server     |
|                     |                 | (WebSocket)          |
|                     |      HTTPS      |                     |
|                     | <-------------> | Supabase             |
|                     |                 | (Auth + Realtime)    |
+---------------------+                 +---------------------+
```

## 6.2 Authentication Flow

### 6.2.1 Email/Password Sign In

```
User enters email + password
  |
  v
supabase.auth.signInWithPassword({ email, password })
  |
  v
Supabase returns { session, user }
  |
  v
Session stored in Android Keystore via expo-secure-store
  (chunked if >2KB, Keystore-backed AES-256 encryption)
  |
  v
Auth state updated: session, user, isLoading=false
  |
  v
onAuthStateChange listener fires -> updates store on any change
```

### 6.2.2 Google Sign In (Android)

```
User taps "Continue with Google"
  |
  v
expo-web-browser opens Chrome Custom Tab
  -> Google OAuth consent screen
  -> User authorizes
  -> Redirect back to app with access token
  |
  v
supabase.auth.signInWithIdToken({ provider: 'google', token: accessToken })
  |
  v
Same session storage flow as email sign-in
```

### 6.2.3 Session Refresh

```
App comes to foreground / periodic timer
  |
  v
supabase.auth.refreshSession()
  |
  v
If successful: updated session stored in Keystore
If failed: session cleared, user redirected to login
```

### 6.2.4 Token Flow for API Calls

```
Every API request:
  |
  v
getAuthHeaders()
  |
  v
supabase.auth.getSession() -> extracts access_token
  |
  v
Headers: { Authorization: 'Bearer <access_token>', Content-Type: 'application/json' }
  |
  v
Request sent to API_URL with auth headers
```

## 6.3 Chat API Endpoints

### 6.3.1 Load Conversations

```
GET /api/chat/conversations
Authorization: Bearer <token>

Response: {
  conversations: ConversationSummary[]
}
```

### 6.3.2 Create Conversation

```
POST /api/chat/conversations
Authorization: Bearer <token>
Body: { title: string }

Response: {
  conversation: ConversationSummary
}
```

### 6.3.3 Load Messages

```
GET /api/chat/conversations/:id
Authorization: Bearer <token>

Response: {
  messages: ChatMessage[]
}
```

### 6.3.4 Rename Conversation

```
PUT /api/chat/conversations/:id
Authorization: Bearer <token>
Body: { title: string }

Response: { success: true }
```

### 6.3.5 Delete Conversation

```
DELETE /api/chat/conversations/:id
Authorization: Bearer <token>

Response: { success: true }
```

### 6.3.6 Stream Chat Completion

```
POST /api/llm/v1/chat/completions
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream

Body: {
  model: string,
  messages: Array<{ role: string, content: string }>,
  stream: true,
  thinking?: boolean
}

Response: SSE stream
  data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
  data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}
  data: {"choices":[{"delta":{"finish_reason":"stop"}}]}
  data: [DONE]
```

**Streaming Implementation Details**:

- Uses native `fetch()` + `ReadableStream` (React Native 0.76+ supports this natively)
- SSE lines parsed incrementally: split by `\n`, filter `data: ` prefix, handle `[DONE]` sentinel
- Reconnection: up to 3 attempts with exponential backoff (1s, 2.5s, 5s)
- Timeout: 120 seconds (`TIMEOUTS.STREAMING`)
- Abort: `AbortController` allows user to cancel via stop button
- Combined signals: caller signal + timeout signal merged via `combineAbortSignals()`

### 6.3.7 Tag Conversation

```
POST /conversations/:id/tags
Authorization: Bearer <token>
Body: { tags: string[] }

Response: void (204)
```

## 6.4 Voice API Endpoints

### 6.4.1 Whisper Transcription (Server-Side)

```
POST /api/voice/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body: FormData with 'audio' field (m4a file)

Response: {
  text: string
}

Timeout: 60 seconds (TIMEOUTS.UPLOAD)
```

### 6.4.2 Deepgram Transcription (Client-Side)

```
POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true
Authorization: Bearer <deepgram_api_key>
Content-Type: multipart/form-data

Body: FormData with 'audio' field (m4a file)

Response: {
  results: {
    channels: [{
      alternatives: [{
        transcript: string
      }]
    }]
  }
}
```

## 6.5 File Upload

```
POST /api/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data (auto-set by fetch with boundary)

Body: FormData with 'file' field ({ uri, name, type })

Response: {
  url: string,
  id: string
}

Timeout: 60 seconds (TIMEOUTS.UPLOAD)
```

## 6.6 Push Notification Token Registration

```
POST /api/mobile/push-token
Authorization: Bearer <token>
Body: {
  token: string (Expo push token),
  platform: "android"
}

Response: { success: true }
```

## 6.7 Agent Status Polling (Background Fetch)

```
GET /api/mobile/agent-status
Authorization: Bearer <token>

Response: {
  pendingApprovals: Array<{
    id: string,
    agentName: string,
    toolName: string,
    description: string
  }>,
  runningAgents: number
}

Timeout: 15 seconds (background tasks have limited execution time)
```

## 6.8 Model Catalog

```
GET /api/models
Accept: application/json

Response: {
  models: Array<{
    id: string,
    name: string,
    provider: string,
    category: string,
    contextWindow: number,
    maxOutputTokens: number | null,
    capabilities: {
      vision: boolean,
      tools: boolean,
      streaming: boolean,
      thinking: boolean,
      imageGen: boolean,
      videoGen: boolean,
      codeExecution: boolean,
      search: boolean
    },
    speed: string | null,
    quality: string | null,
    bestFor: string[],
    released: string | null
  }>,
  version: string,
  lastUpdated: string
}

Cache: MMKV, 1-hour TTL
Timeout: 10 seconds
Fallback: Embedded MODEL_LIST (30+ models)
```

## 6.9 WebRTC Signaling (Desktop Companion)

### 6.9.1 Signaling WebSocket Connection

```
WSS connection to: WS_URL (wss://signaling.agiworkforce.com)

Registration message:
{
  code: string (pairing code),
  role: "mobile",
  metadata: {
    deviceType: "mobile",
    app: "agiworkforce-mobile",
    version: "0.1.0"
  }
}

Heartbeat: every 25 seconds
```

### 6.9.2 Signaling Events

| Event Type        | Direction        | Description                                                      |
| ----------------- | ---------------- | ---------------------------------------------------------------- |
| `open`            | Server -> Mobile | WebSocket connection opened                                      |
| `registered`      | Server -> Mobile | Registration confirmed, includes `expiresAt` and `peerConnected` |
| `peer_ready`      | Server -> Mobile | Desktop peer connected, includes metadata                        |
| `signal`          | Bidirectional    | WebRTC signaling (offer/answer/ice) or control messages          |
| `peer_left`       | Server -> Mobile | Desktop disconnected                                             |
| `session_expired` | Server -> Mobile | Pairing session expired                                          |
| `terminated`      | Server -> Mobile | Session terminated by peer                                       |
| `error`           | Server -> Mobile | Error (invalid_code, session_full, rate_limited, etc.)           |
| `close`           | Server -> Mobile | WebSocket closed                                                 |

### 6.9.3 Control Messages (via WebRTC Data Channel or Signaling Relay)

| Message             | Direction         | Payload                                                                                   |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------ | ----------- |
| `agents_update`     | Desktop -> Mobile | `{ agents: Agent[] }`                                                                     |
| `agent_update`      | Desktop -> Mobile | `{ agentId: string, patch: Partial<Agent> }`                                              |
| `agent_removed`     | Desktop -> Mobile | `{ agentId: string }`                                                                     |
| `approval_response` | Mobile -> Desktop | `{ requestId: string, approved: boolean }` or `{ approvalId: string, decision: 'approved' | 'rejected', reason?: string }` |
| `request_agents`    | Mobile -> Desktop | (no payload -- triggers agents_update response)                                           |
| `agent_command`     | Mobile -> Desktop | `{ agentId: string, command: 'pause'                                                      | 'resume'                       | 'cancel' }` |
| `ping`              | Mobile -> Desktop | `{ timestamp: number }`                                                                   |

### 6.9.4 WebRTC Configuration

```typescript
const config: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};
```

- **Transport**: Data channel for low-latency control messages
- **Fallback**: If WebRTC connection fails, control messages are relayed through the signaling WebSocket
- **Priority**: Data channel preferred (lower latency), signaling relay as fallback
- **ICE candidates**: Exchanged via signaling server

## 6.10 Supabase Realtime (Cross-Device Sync)

### 6.10.1 Conversations Channel

```
Channel: 'mobile-conversations'
Table: 'conversations'
Schema: 'public'
Filter: user_id=eq.{userId}
Events: INSERT, UPDATE, DELETE

Behavior:
  INSERT: Add new conversation to store (dedup check)
  UPDATE: Update title, updatedAt, messageCount
  DELETE: Remove conversation and its messages
```

### 6.10.2 Messages Channel

```
Channel: 'mobile-messages'
Table: 'messages'
Schema: 'public'
Filter: user_id=eq.{userId}
Events: INSERT, UPDATE, DELETE

Behavior:
  INSERT: Append message to conversation (dedup check)
  UPDATE: Update message content
  DELETE: Remove message from conversation
```

## 6.11 Offline Behavior

| Operation           | Offline Behavior                                                               |
| ------------------- | ------------------------------------------------------------------------------ |
| View conversations  | Served from MMKV cache (up to 200 conversations)                               |
| View messages       | Served from MMKV cache (up to 100 per conversation)                            |
| Send message        | Creates local-only conversation with `conv_` prefix ID                         |
| Load conversations  | Shows cached data, logs warning, sets error state                              |
| Create conversation | Falls back to local ID, persists to MMKV                                       |
| Delete conversation | Optimistic removal from state, server delete retried when online               |
| Companion pairing   | Fails with error: "Unable to reach the pairing server. Check your connection." |
| Push notifications  | Not received (requires network)                                                |
| Voice transcription | Fails (requires server or Deepgram API)                                        |
| Model catalog       | Uses embedded MODEL_LIST (30+ models)                                          |

---

# Section 7: Platform-Specific Capabilities

## 7.1 Android Keystore (expo-secure-store)

### 7.1.1 How It Works

On Android, `expo-secure-store` uses the Android Keystore system to encrypt values at rest:

1. A symmetric AES key is generated and stored in the Android Keystore (hardware-backed on devices with StrongBox or TEE)
2. Values are encrypted with AES-256 before being stored in SharedPreferences
3. Decryption requires the Keystore key, which is protected by the device lock screen

### 7.1.2 Chunking for Large Values

Android Keystore has a practical limit of ~2KB per value. Supabase session JSON can exceed this (JWTs + metadata). The `supabase.ts` service implements chunking:

```
Value <= 1900 bytes: stored directly under key
Value > 1900 bytes: split into chunks
  key__chunk_0: first 1900 bytes
  key__chunk_1: next 1900 bytes
  ...
  key__chunk_count: number of chunks (string)
```

### 7.1.3 Fallback

If Android Keystore is unavailable (rare -- some emulators, very old custom ROMs), the storage falls back to MMKV. This is logged as a warning:

```
[secureStorage] Failed to persist to secure store: <error>
```

## 7.2 Firebase Cloud Messaging (FCM)

### 7.2.1 Push Token Registration

```
1. App requests POST_NOTIFICATIONS permission (Android 13+)
2. If granted, Expo Notifications SDK retrieves FCM token
3. Token sent to backend: POST /api/mobile/push-token { token, platform: "android" }
4. Backend stores token for push delivery
5. Token refresh listener auto-re-registers on token change
```

### 7.2.2 Notification Channels (Android 8.0+)

Android notification channels are created at registration time and cannot be modified by the app after creation (user controls them in system settings):

| Channel ID        | Name              | Importance | Vibration          | LED            | Use                                 |
| ----------------- | ----------------- | ---------- | ------------------ | -------------- | ----------------------------------- |
| `default`         | Default           | HIGH       | [0, 250, 250, 250] | #21808d (teal) | General notifications               |
| `agent-approvals` | Agent Approvals   | MAX        | [0, 500, 250, 500] | #ff6b6b (red)  | Urgent approval requests (heads-up) |
| `tasks`           | Tasks & Schedules | DEFAULT    | System default     | #21808d (teal) | Task completion, schedule triggers  |

### 7.2.3 Notification Content by Type

| Type                    | Title                        | Body                         | Channel           | Action on Tap                  |
| ----------------------- | ---------------------------- | ---------------------------- | ----------------- | ------------------------------ |
| `agent_approval_needed` | "{agentName} needs approval" | "{toolName}: {description}"  | `agent-approvals` | Navigate to `/(app)/companion` |
| `task_completed`        | "Task Completed"             | Task name + summary          | `tasks`           | Navigate to route or `/(app)`  |
| `schedule_triggered`    | "Schedule Triggered"         | Schedule name                | `tasks`           | Navigate to `/(app)/schedules` |
| `companion_connected`   | "Desktop Connected"          | "Your desktop is now paired" | `default`         | Navigate to `/(app)/companion` |
| `chat_message`          | "New Message"                | Message preview              | `default`         | Navigate to message route      |

### 7.2.4 Foreground Notification Handling

```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // Show heads-up notification even when app is foreground
    shouldPlaySound: true, // Play notification sound
    shouldSetBadge: true, // Update app badge count
  }),
});
```

### 7.2.5 Cold-Start Notification Handling

When the app is launched by tapping a notification:

1. `getLastNotificationResponseAsync()` retrieves the notification that launched the app
2. `handleNotificationResponse()` parses the `data.type` field
3. `safeNavigate()` navigates to the appropriate screen
4. Navigation is deferred if the navigator is not yet mounted (100ms `setTimeout`)

## 7.3 Background Fetch (Agent Status Polling)

### 7.3.1 Implementation

```
Task name: 'agent-status-check'
Minimum interval: 15 minutes (900 seconds)
stopOnTerminate: false  (task continues after app process death)
startOnBoot: true       (task re-registers after device reboot)
```

### 7.3.2 Execution Flow

```
1. Android JobScheduler wakes the app process
2. TaskManager invokes the defined task
3. Task checks settings: backgroundFetchEnabled && notificationsEnabled
4. If disabled: return BackgroundFetchResult.NoData
5. Fetch agent status: GET /api/mobile/agent-status (15s timeout)
6. If pending approvals exist:
   - Schedule local notification for each approval
   - Return BackgroundFetchResult.NewData
7. If no approvals: return BackgroundFetchResult.NoData
8. If fetch fails: return BackgroundFetchResult.Failed
```

### 7.3.3 Android-Specific Considerations

- Android's Doze mode can delay background fetch execution when the device is idle
- On Android 12+, background fetch is subject to App Standby Buckets
- Apps in the "Rare" bucket may only execute background tasks once per day
- The 15-minute interval is a minimum -- Android may delay execution further
- `startOnBoot: true` requires `RECEIVE_BOOT_COMPLETED` permission (implicitly granted by expo-background-fetch)

## 7.4 Deep Link Handling

### 7.4.1 URL Scheme

```
Scheme: agiworkforce
Examples:
  agiworkforce://pair/ABC123
  agiworkforce://pair?code=ABC123
```

### 7.4.2 Android Intent Filter

In `app.json` (Expo config):

```json
{
  "expo": {
    "scheme": "agiworkforce"
  }
}
```

This generates the following in `AndroidManifest.xml`:

```xml
<intent-filter android:exported="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="agiworkforce" />
</intent-filter>
```

### 7.4.3 Deep Link Processing

```
1. App receives deep link via expo-linking
2. useURL() hook fires with the URL
3. Root layout parses: Linking.parse(url)
4. Checks if hostname === 'pair' or path starts with 'pair'
5. Extracts code from query params or path segments
6. Navigates to /(app)/companion?pairingCode={code}
7. Companion screen auto-connects with the code
```

### 7.4.4 Android App Links (Future)

For verified deep links (HTTPS):

```
Domain: agiworkforce.com
Path: /pair/{code}
Asset links: /.well-known/assetlinks.json
```

This would allow `https://agiworkforce.com/pair/ABC123` to open the app directly without a disambiguation dialog.

## 7.5 Android Share Intent (Receive)

### 7.5.1 Current Status: Planned (P2)

When implemented, the app will receive shared text and images from other Android apps:

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
  <data android:mimeType="image/*" />
</intent-filter>
```

### 7.5.2 Behavior

When receiving shared content:

1. App opens to home screen
2. Shared text is pre-filled in ChatInput
3. Shared image is attached as an image attachment
4. User can select model and send

## 7.6 Quick Settings Tile (Planned P2)

### 7.6.1 Design

A Quick Settings tile in the Android notification shade showing:

- **Icon**: AGI Workforce app icon
- **Label**: "AGI Workforce"
- **Subtitle**: "Connected" / "Disconnected" / "2 approvals pending"
- **Tap action**: Opens the companion screen

### 7.6.2 Implementation

Requires a native Android module (Kotlin) extending `TileService`:

- `onTileAdded()`: Tile placed in Quick Settings
- `onStartListening()`: Update tile state from connectionStore
- `onClick()`: Launch app to companion screen
- State updates pushed from JS via Native Modules bridge

## 7.7 Home Screen Widget (Planned P2)

### 7.7.1 Design

A 2x2 or 4x2 home screen widget showing:

- **AGI Workforce logo**
- **Connection status**: Connected to [Desktop Name] / Not connected
- **Active agents**: Count of running agents
- **Pending approvals**: Count with badge
- **Quick action**: Tap to open app

### 7.7.2 Implementation

Options:

1. **Expo Widgets module** (when available) -- declarative widget via React Native
2. **Glance API** (Jetpack Glance) -- Kotlin composable widgets, requires custom native module
3. **RemoteViews** (traditional) -- XML layout, native module bridge

## 7.8 Lock Screen Notification Actions (Planned P1)

### 7.8.1 Design

When an agent approval notification is displayed on the lock screen:

- **Approve** button: green, approves the tool execution
- **Deny** button: red, denies the tool execution
- Actions work without unlocking the device (for low-risk approvals)

### 7.8.2 Implementation

```javascript
Notifications.setNotificationCategoryAsync('agent-approvals', [
  {
    identifier: 'approve',
    buttonTitle: 'Approve',
    options: { isAuthenticationRequired: false }, // works on lock screen
  },
  {
    identifier: 'deny',
    buttonTitle: 'Deny',
    options: { isDestructive: true, isAuthenticationRequired: false },
  },
]);
```

Response handler:

```javascript
Notifications.addNotificationResponseReceivedListener((response) => {
  const actionId = response.actionIdentifier;
  const data = response.notification.request.content.data;

  if (actionId === 'approve') {
    sendApprovalResponse(data.approvalId, true);
  } else if (actionId === 'deny') {
    sendApprovalResponse(data.approvalId, false);
  }
});
```

## 7.9 Predictive Back Gesture (Android 13+)

### 7.9.1 Current Status: Planned (P1)

Android 13+ supports predictive back gesture, which shows an animated preview of where the user will navigate before they complete the back gesture.

### 7.9.2 Implementation

Requires `react-native-screens` to support the new back gesture API:

- `android:enableOnBackInvokedCallback="true"` in `AndroidManifest.xml`
- Screens must use `onBackHandler` to register predictive back callbacks
- Currently, the app uses `BackHandler.addEventListener` for the classic back button

## 7.10 Material You Theming (Planned P1)

### 7.10.1 Dynamic Color

Android 12+ supports dynamic color extraction from the user's wallpaper (Material You). While the AGI Workforce brand colors (teal, dark backgrounds) are primary, accent elements could adopt the user's dynamic color palette:

- **Option A**: Use dynamic color for accent elements (toggle tracks, selection highlights)
- **Option B**: Maintain brand teal for all accents, use dynamic color only for adaptive icon background

### 7.10.2 Themed App Icon

Android 13+ supports themed (monochrome) app icons that adapt to the user's color palette. Requirements:

- Monochrome version of the AGI Workforce logo
- Defined in `adaptiveIcon.monochromeImage` in `app.json`

## 7.11 Foldable Device Support (Planned P2)

### 7.11.1 Samsung Galaxy Z Fold / Z Flip

For foldable devices:

- **Outer screen (Z Flip)**: Compact layout, essential controls only
- **Inner screen (Z Fold unfolded)**: Tablet-like layout with permanent sidebar (768dp+ width)
- **Fold detection**: Use `react-native-device-info` or Jetpack WindowManager to detect fold state
- **Continuity**: Seamless transition when folding/unfolding mid-conversation

---

# Section 8: Build, Deploy & Distribution

## 8.1 EAS Build Configuration

### 8.1.1 Build Profiles (`eas.json`)

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "buildConfiguration": "Release" }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-services.json",
        "track": "internal"
      }
    }
  }
}
```

### 8.1.2 Build Profiles Explained

| Profile       | Purpose                           | Distribution         | Signing                           |
| ------------- | --------------------------------- | -------------------- | --------------------------------- |
| `development` | Local development with dev client | Internal (team only) | Debug keystore                    |
| `preview`     | QA testing, beta users            | Internal             | Release keystore                  |
| `production`  | Play Store release                | Play Store           | Play App Signing (Google-managed) |

### 8.1.3 Build Commands

```bash
# Development build (includes dev tools, Expo DevClient)
eas build --platform android --profile development

# Preview build (release mode, internal distribution)
eas build --platform android --profile preview

# Production build (Play Store ready)
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android --profile production
```

## 8.2 Android App Signing

### 8.2.1 Play App Signing

Google Play App Signing is the recommended (and required for new apps) signing method:

1. **Upload key**: Generated by EAS or locally, used to sign the AAB before uploading to Play Console
2. **App signing key**: Managed by Google, used to sign the APK delivered to users
3. **Key rotation**: Google manages key upgrades

### 8.2.2 Keystore Management

| Key             | Location                                      | Purpose                                       |
| --------------- | --------------------------------------------- | --------------------------------------------- |
| Debug keystore  | `~/.android/debug.keystore`                   | Local development builds                      |
| Upload keystore | EAS managed (cloud) or `android/keystore.jks` | Sign production AABs for Play Store upload    |
| App signing key | Google Play Console (managed)                 | Google signs the final APK delivered to users |

### 8.2.3 SHA-256 Fingerprint

Required for:

- Google OAuth (web client ID + Android client ID)
- Firebase project configuration
- App Links verification (`assetlinks.json`)

## 8.3 Play Store Submission

### 8.3.1 App Listing

| Field             | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Package name      | `com.agiworkforce.mobile`                                                                |
| App name          | "AGI Workforce"                                                                          |
| Short description | "AI agent platform -- chat with any model, control your desktop agents from your phone." |
| Full description  | [See Play Store Listing section below]                                                   |
| Category          | Productivity                                                                             |
| Content rating    | PEGI 3 / Everyone                                                                        |
| Target audience   | 18+ (AI tools)                                                                           |
| Countries         | All (global)                                                                             |

### 8.3.2 Full Play Store Description

```
AGI Workforce is a multi-model AI agent platform that puts the power of 30+ AI models
at your fingertips -- and connects directly to your desktop for real-time agent control.

KEY FEATURES:
- Chat with 30+ models from OpenAI, Anthropic, Google, xAI, DeepSeek, and more
- QR pair with your desktop to monitor and control AI agents in real-time
- Approve or deny agent tool executions from your phone
- Voice input with hold-to-record and AI-powered transcription
- Background notifications when agents need your attention
- Cross-device sync -- your conversations follow you everywhere

MULTI-MODEL AI:
Choose from Economy, Balanced, or Premium tiers -- or select a specific model:
GPT-5.2, Claude 4.6 Opus, Gemini 3 Pro, Grok 4, DeepSeek R1, and many more.

DESKTOP COMPANION:
Scan a QR code to pair with your AGI Workforce desktop app. Monitor running agents,
view their progress step-by-step, and approve or deny sensitive operations -- all from
your phone.

VOICE CONVERSATIONS:
Hold to record, release to send. Your voice is transcribed and sent to the AI.
Responses are spoken back to you using text-to-speech.

SECURITY:
Your auth tokens are stored in the Android Keystore with hardware-backed encryption.
All API communication uses HTTPS with bearer token authentication.
```

### 8.3.3 Screenshots Specification

| Screenshot | Content                                   | Dimensions                    |
| ---------- | ----------------------------------------- | ----------------------------- |
| 1          | Home screen with ChatInput                | 1080x1920 (9:16) or 1440x2560 |
| 2          | Chat conversation with streaming response | 1080x1920                     |
| 3          | Model picker bottom sheet                 | 1080x1920                     |
| 4          | Desktop companion -- QR pairing           | 1080x1920                     |
| 5          | Agent dashboard with running agents       | 1080x1920                     |
| 6          | Voice conversation mode                   | 1080x1920                     |
| 7          | Settings screen                           | 1080x1920                     |
| 8          | Notification example (agent approval)     | 1080x1920                     |

Tablet screenshots (7-inch, 10-inch): Same screens at 1200x1920 and 1600x2560.

### 8.3.4 Data Safety Form

| Question                                  | Answer                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share user data? | Yes                                                                                                           |
| **Data collected**:                       |                                                                                                               |
| Email address                             | Collected: Authentication. Not shared.                                                                        |
| Chat messages (text)                      | Collected: Core functionality (AI chat). Not shared with third parties. Sent to LLM providers for processing. |
| Voice recordings                          | Collected: Transcription. Not shared. Sent to Whisper/Deepgram for processing, then deleted.                  |
| Photos/images                             | Collected: User-initiated attachment. Not shared. Sent to LLM for vision processing.                          |
| Push notification tokens                  | Collected: Push notification delivery. Not shared.                                                            |
| Device information                        | Collected: Crash reporting, analytics. Not shared.                                                            |
| Is data encrypted in transit?             | Yes (HTTPS/TLS)                                                                                               |
| Is data encrypted at rest?                | Yes (Android Keystore for sensitive data)                                                                     |
| Can users request data deletion?          | Yes (account deletion via settings or support)                                                                |
| Data retention                            | Chat history: until user deletes. Auth tokens: until sign out.                                                |

### 8.3.5 Permissions Justification

| Permission                         | Declared                                           | Justification                                                            |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `CAMERA`                           | Yes                                                | QR code scanning for desktop pairing, photo capture for image attachment |
| `RECORD_AUDIO`                     | Yes                                                | Voice input (hold-to-record) and voice conversation mode                 |
| `READ_EXTERNAL_STORAGE`            | Yes (legacy, pre-Android 13)                       | Image picker for chat attachments                                        |
| `POST_NOTIFICATIONS` (Android 13+) | Yes (runtime)                                      | Agent approval alerts, task completion, schedule triggers                |
| `RECEIVE_BOOT_COMPLETED`           | Yes (implicit via expo-background-fetch)           | Re-register background agent polling after device reboot                 |
| `INTERNET`                         | Yes (implicit)                                     | All network communication                                                |
| `ACCESS_NETWORK_STATE`             | Yes (implicit via @react-native-community/netinfo) | Detect online/offline status                                             |
| `VIBRATE`                          | Yes (implicit via expo-haptics)                    | Haptic feedback, notification vibration                                  |
| `WAKE_LOCK`                        | Yes (implicit via expo-background-fetch)           | Background task execution                                                |

### 8.3.6 Target SDK Compliance

As of Android 14 (API 34) target SDK requirements:

- `android:exported` explicitly declared for all activities with intent filters
- Foreground service types declared for any foreground services
- `POST_NOTIFICATIONS` runtime permission requested before sending notifications
- Photo picker used for media access (instead of `READ_MEDIA_*` permissions)
- Exact alarm restrictions respected (not used by this app)

## 8.4 Over-the-Air Updates (expo-updates)

### 8.4.1 Configuration

```json
{
  "updates": {
    "fallbackToCacheTimeout": 0
  }
}
```

### 8.4.2 Update Channels

| Channel      | Purpose         | Audience             |
| ------------ | --------------- | -------------------- |
| `preview`    | QA/beta updates | Internal testers     |
| `production` | Stable updates  | All Play Store users |

### 8.4.3 Update Behavior

- OTA updates deliver new JavaScript bundles without a Play Store submission
- Native code changes (new Expo plugins, native modules) require a full build + Play Store update
- `fallbackToCacheTimeout: 0` means the app loads immediately from cache, then checks for updates in the background
- Users get the new version on the next cold start

### 8.4.4 Limitations

OTA updates CANNOT change:

- Android permissions
- Native module configurations
- Expo plugin configurations
- `app.json` native values (package, versionCode, etc.)

## 8.5 CI/CD Pipeline

### 8.5.1 GitHub Actions Workflow

```yaml
# .github/workflows/mobile-android.yml
name: Mobile Android Build

on:
  push:
    branches: [main]
    paths: ['apps/mobile/**']
  pull_request:
    branches: [main]
    paths: ['apps/mobile/**']

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: cd apps/mobile && pnpm typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: cd apps/mobile && pnpm lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: cd apps/mobile && pnpm test

  build-preview:
    needs: [typecheck, lint, test]
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --platform android --profile preview --non-interactive
```

### 8.5.2 Release Process

1. **Development**: Feature branches merged to `main` via PR (typecheck + lint + test gates)
2. **Preview**: Automatic EAS build on merge to `main` with `preview` profile
3. **QA Testing**: Preview APK distributed to internal testers via EAS
4. **Production Build**: Manual trigger: `eas build --platform android --profile production`
5. **Play Store Submission**: `eas submit --platform android --profile production`
6. **Internal Track**: First submitted to internal testing track
7. **Closed Alpha/Beta**: Promoted to closed testing after QA approval
8. **Production**: Promoted to production after beta validation

## 8.6 Side-Loading (APK Distribution)

### 8.6.1 When to Use

- Enterprise deployments without Play Store access
- Beta testing outside EAS internal distribution
- Countries where Play Store is restricted
- Direct distribution to power users

### 8.6.2 APK Generation

```bash
# Build APK (not AAB) for side-loading
eas build --platform android --profile preview --output-format apk
```

### 8.6.3 Installation

Users must enable "Install unknown apps" in Android settings for the browser or file manager they use to open the APK.

---

# Section 9: Testing Strategy

## 9.1 Unit Tests

### 9.1.1 Framework

- **Runner**: Jest 29.7.0 with `jest-expo` preset
- **Assertions**: Jest built-in + `@testing-library/react-native` 12.9.0
- **Configuration**: `jest.config.js` with Babel transforms for TypeScript

### 9.1.2 Test Targets

| Module                        | Priority | Focus Areas                                                                |
| ----------------------------- | -------- | -------------------------------------------------------------------------- |
| `stores/authStore.ts`         | P0       | Sign in/out, session persistence, auth state transitions                   |
| `stores/chatStore.ts`         | P0       | Conversation CRUD, message streaming, offline fallback, persistence limits |
| `stores/connectionStore.ts`   | P0       | Connection state machine, pairing code parsing, error handling             |
| `stores/agentStore.ts`        | P0       | Agent CRUD, approval flow, clear completed                                 |
| `stores/modelStore.ts`        | P1       | Model selection, favorites, recents, thinking mode guard                   |
| `stores/settingsStore.ts`     | P1       | All setting toggles, persistence                                           |
| `services/companion.ts`       | P0       | Pairing code validation, control message builders, risk colors             |
| `services/streaming.ts`       | P0       | SSE parsing, reconnection logic, abort handling, timeout                   |
| `services/notifications.ts`   | P0       | Channel creation, navigation routing, cold-start handling                  |
| `services/backgroundFetch.ts` | P1       | Task execution, settings gates, notification scheduling                    |
| `services/voice.ts`           | P1       | Permission checking, recording lifecycle, transcription                    |
| `services/modelCatalog.ts`    | P1       | Cache TTL, fetch fallback, model mapping                                   |
| `lib/secureStorage.ts`        | P0       | Key sanitization, Keystore read/write                                      |
| `lib/models.ts`               | P1       | Model lookup, provider lookup, auto-mode detection, display names          |
| `lib/constants.ts`            | P1       | Environment variable defaults, timeout values                              |
| `types/chat.ts`               | P1       | Type validation (compile-time only)                                        |

### 9.1.3 Test Commands

```bash
cd apps/mobile && pnpm test                     # Run all tests
cd apps/mobile && pnpm test -- --watch           # Watch mode
cd apps/mobile && pnpm test -- stores/           # Run store tests only
cd apps/mobile && pnpm test -- --coverage        # With coverage report
```

### 9.1.4 Coverage Targets

| Module        | Target                                        |
| ------------- | --------------------------------------------- |
| Stores        | >= 80% line coverage                          |
| Services      | >= 75% line coverage                          |
| Lib utilities | >= 90% line coverage                          |
| Components    | >= 60% line coverage (snapshot + interaction) |
| Overall       | >= 70% line coverage                          |

## 9.2 Integration Tests

### 9.2.1 Key Integration Scenarios

| Scenario                | Description                                                              | Components                             |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Auth flow               | Login -> session persist -> app restart -> session recovery              | authStore, secureStorage, supabase     |
| Chat flow               | Create conv -> send message -> receive streaming response                | chatStore, streaming, api              |
| Companion pairing       | Scan QR -> connect signaling -> establish WebRTC -> receive agent update | connectionStore, agentStore, companion |
| Voice flow              | Permission -> record -> transcribe -> send as message                    | voice service, chatStore               |
| Background notification | Background fetch -> API call -> local notification schedule              | backgroundFetch, notifications, api    |
| Offline resilience      | Disconnect network -> view cached data -> reconnect -> sync              | chatStore (MMKV), realtime             |

## 9.3 E2E Tests

### 9.3.1 Framework

- **Maestro** (recommended for Expo): YAML-based UI testing
- **Detox** (alternative): JavaScript-based E2E testing for React Native
- **Appium** (alternative): Cross-platform mobile testing

### 9.3.2 E2E Test Scenarios

| Test ID | Scenario                | Steps                                           | Expected Result                                     |
| ------- | ----------------------- | ----------------------------------------------- | --------------------------------------------------- |
| E2E-001 | Login with email        | Open app -> Enter email/password -> Tap Sign In | Navigate to onboarding or home                      |
| E2E-002 | Complete onboarding     | Login -> View slide 1 -> Tap Next x3            | Navigate to home, onboarding-done set               |
| E2E-003 | Skip onboarding         | Login -> Tap Skip on slide 1                    | Navigate to home, onboarding-done set               |
| E2E-004 | Send chat message       | Home -> Type message -> Tap Send                | Navigate to chat, message appears, streaming starts |
| E2E-005 | Stop streaming          | During streaming -> Tap Stop                    | Streaming stops, partial content preserved          |
| E2E-006 | Select model            | Home -> Tap model chip -> Select model          | Model picker opens, model selected, chip updates    |
| E2E-007 | Open sidebar            | Home -> Tap hamburger OR swipe from left        | Drawer opens with navigation items                  |
| E2E-008 | Navigate to agents      | Sidebar -> Tap Agents                           | Agents screen displayed                             |
| E2E-009 | Navigate to companion   | Sidebar -> Tap Desktop                          | Companion screen with pairing UI                    |
| E2E-010 | Change settings         | Settings -> Toggle haptics off                  | Setting persists, toggle state updates              |
| E2E-011 | Sign out                | Settings -> Tap Sign Out -> Confirm             | Navigate to login, session cleared                  |
| E2E-012 | Back button exit        | Home -> Press back -> Press back within 2s      | App exits (Android only)                            |
| E2E-013 | Back button toast       | Home -> Press back once                         | Toast "Press back again to exit" shown              |
| E2E-014 | Deep link pairing       | Open agiworkforce://pair/CODE                   | App opens to companion with code pre-filled         |
| E2E-015 | Conversation management | Create conv -> Rename -> Delete                 | All CRUD operations work                            |

## 9.4 Device Testing Matrix

### 9.4.1 Physical Devices

| Device                  | Android Version     | Screen            | RAM   | Category            |
| ----------------------- | ------------------- | ----------------- | ----- | ------------------- |
| Google Pixel 6          | Android 15 (API 35) | 1080x2400, 6.4"   | 8 GB  | Reference device    |
| Google Pixel 8a         | Android 14 (API 34) | 1080x2400, 6.1"   | 8 GB  | Mid-range           |
| Samsung Galaxy S24      | Android 14 (API 34) | 1080x2340, 6.2"   | 8 GB  | Flagship            |
| Samsung Galaxy A54      | Android 13 (API 33) | 1080x2340, 6.4"   | 6 GB  | Mid-range (popular) |
| Samsung Galaxy Z Fold 5 | Android 14 (API 34) | 1768x2208 (inner) | 12 GB | Foldable            |
| OnePlus 12              | Android 14 (API 34) | 1440x3168, 6.82"  | 12 GB | Flagship            |
| Samsung Galaxy Tab S9   | Android 14 (API 34) | 1600x2560, 11"    | 8 GB  | Tablet              |
| Google Pixel Tablet     | Android 14 (API 34) | 1600x2560, 10.95" | 8 GB  | Tablet              |
| Samsung Galaxy A14      | Android 13 (API 33) | 1080x2408, 6.6"   | 4 GB  | Low-end             |

### 9.4.2 Emulators

| Configuration           | API Level | Use                   |
| ----------------------- | --------- | --------------------- |
| Pixel 6 API 34          | 34        | Primary development   |
| Pixel 6 API 26          | 26        | Minimum SDK testing   |
| Pixel_C API 34 (tablet) | 34        | Tablet layout testing |
| Foldable 7.6in API 34   | 34        | Fold/unfold testing   |

### 9.4.3 Key Test Dimensions

| Dimension       | Variants to Test                                                 |
| --------------- | ---------------------------------------------------------------- |
| Android version | API 26, 28, 30, 33, 34, 35                                       |
| Screen density  | mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi                               |
| Screen size     | 5.0" (compact), 6.4" (standard), 7.6" (foldable), 10" (tablet)   |
| Navigation mode | 3-button nav, 2-button nav, gesture nav                          |
| Dark mode       | Dark (default), Light (if supported)                             |
| Font size       | Default, Large (200%), Maximum                                   |
| Language        | English, RTL languages (Arabic), CJK (Chinese, Japanese, Korean) |
| Network         | Wi-Fi, LTE, 3G, Airplane mode, Poor connectivity                 |

---

# Section 10: Performance Requirements

## 10.1 Startup Performance

| Metric                                  | Target       | Measurement                                         |
| --------------------------------------- | ------------ | --------------------------------------------------- |
| Cold start (first launch after install) | < 4 seconds  | Time from tap to interactive home screen            |
| Cold start (subsequent)                 | < 3 seconds  | Time from tap to interactive home screen            |
| Warm start (from background)            | < 1 second   | Time from tap to restored screen                    |
| Time to first chat input                | < 3 seconds  | Time from cold start to ChatInput being interactive |
| Auth session recovery                   | < 500ms      | Time for Keystore read + session validation         |
| Splash screen duration                  | 500ms-1500ms | Time splash is displayed                            |

## 10.2 Runtime Performance

| Metric                 | Target               | Measurement                            |
| ---------------------- | -------------------- | -------------------------------------- |
| Message list scroll    | 60fps                | No frame drops during FlashList scroll |
| Keyboard open/close    | No layout shift      | Content repositions smoothly           |
| Bottom sheet gesture   | 60fps                | reanimated + gesture handler           |
| Chat input typing      | < 16ms per keystroke | No lag during text input               |
| Model picker filter    | < 100ms              | Filter response time after chip tap    |
| Streaming token render | < 50ms per delta     | Time to render each incoming SSE delta |
| Voice metering         | 15fps stable         | Waveform updates without jank          |
| Drawer open/close      | 60fps                | Native-driven animation                |

## 10.3 Memory Budget

| Metric                     | Target   | Notes                              |
| -------------------------- | -------- | ---------------------------------- |
| Initial heap (post-launch) | < 80 MB  | Measured after home screen render  |
| Active chat (100 messages) | < 120 MB | With markdown rendered             |
| Peak during streaming      | < 150 MB | Including buffer allocations       |
| Background (app minimized) | < 30 MB  | After Android trim memory callback |
| Maximum working set        | < 200 MB | Under no circumstances exceed this |

### 10.3.1 Memory Management Strategies

- FlashList with recycling (estimated item size: 100) -- reuses views instead of creating new ones
- Conversation list capped at 200 (partialize in chatStore)
- Messages per conversation capped at 100
- Image caching via `expo-image` (Coil on Android) with LRU cache
- MMKV persistence prevents need to hold all data in JS heap
- `onTrimMemory` callback to release caches when system is low on memory

## 10.4 Bundle Size

| Component                           | Target  | Notes                                  |
| ----------------------------------- | ------- | -------------------------------------- |
| APK download size (from Play Store) | < 25 MB | AAB allows per-ABI delivery            |
| APK installed size                  | < 60 MB | Including all native libraries         |
| JavaScript bundle                   | < 3 MB  | Metro bundler output                   |
| Assets (images, fonts)              | < 2 MB  | Splash, icons, notification icon       |
| Native libraries                    | < 40 MB | React Native, WebRTC, reanimated, etc. |
| OTA update bundle                   | < 3 MB  | JS-only updates                        |

### 10.4.1 Bundle Size Optimization

- AAB (Android App Bundle) enables Play Store to deliver only the ABIs and resources the device needs
- ProGuard/R8 shrinks and obfuscates Java/Kotlin code
- `android.enableR8.fullMode=true` in `gradle.properties`
- Hermes engine reduces JS bundle size and improves startup time
- Tree shaking via Metro bundler
- SVG icons (lucide-react-native) instead of raster images

## 10.5 Battery Impact

| Scenario                            | Target             | Notes                           |
| ----------------------------------- | ------------------ | ------------------------------- |
| Active chat (30 min session)        | < 5% battery drain | Normal usage with streaming     |
| Background (app minimized, 8 hours) | < 2% battery drain | Background fetch every 15 min   |
| Voice recording (5 min continuous)  | < 3% battery drain | Microphone + UI                 |
| Companion connected (1 hour idle)   | < 3% battery drain | WebRTC data channel + heartbeat |

### 10.5.1 Battery Optimization Strategies

- Background fetch uses Android JobScheduler (Doze-mode aware)
- WebRTC data channel is low-bandwidth (control messages only, no audio/video)
- Heartbeat ping interval: 25 seconds (signaling), 30 seconds (health check) -- optimized for battery
- No continuous location tracking, Bluetooth, or sensor access
- `WAKE_LOCK` is released immediately after background task completes
- `shouldDuckAndroid` instead of full audio focus during recording

## 10.6 Network Performance

| Metric                        | Target       | Notes                            |
| ----------------------------- | ------------ | -------------------------------- |
| API request latency (p50)     | < 200ms      | From device to API gateway       |
| API request latency (p95)     | < 1000ms     | Including DNS + TLS              |
| Streaming first token         | < 2 seconds  | Time from send to first delta    |
| WebSocket connect             | < 3 seconds  | Signaling server connection      |
| WebRTC data channel setup     | < 5 seconds  | ICE + DTLS handshake             |
| Image upload                  | < 10 seconds | For typical phone photo (2-5 MB) |
| Voice transcription roundtrip | < 5 seconds  | Record + upload + transcribe     |

### 10.6.1 Network Optimization

- HTTP/2 via OkHttp (React Native default on Android)
- Connection pooling (keep-alive)
- Gzip compression for API responses
- Streaming uses chunked transfer encoding
- Abort controllers prevent wasted bandwidth on cancelled requests
- Exponential backoff for retries (1s, 2.5s, 5s)
- 30-second default timeout, 120-second streaming timeout

---

# Section 11: Security

## 11.1 Threat Model

### 11.1.1 Threat Actors

| Actor                        | Capability                          | Motivation                          |
| ---------------------------- | ----------------------------------- | ----------------------------------- |
| Malicious app on same device | Read shared storage, screen overlay | Steal auth tokens, API keys         |
| Network attacker (MITM)      | Intercept HTTP traffic              | Steal tokens, modify API responses  |
| Physical device access       | Unlock device, access apps          | Read chat history, impersonate user |
| Compromised API gateway      | Full server access                  | Access all user data                |
| Rogue notification listener  | Read notification content           | Extract approval details            |

### 11.1.2 Assets to Protect

| Asset                   | Classification | Storage                                |
| ----------------------- | -------------- | -------------------------------------- |
| Supabase session (JWT)  | Critical       | Android Keystore (encrypted)           |
| Auth refresh token      | Critical       | Android Keystore (encrypted)           |
| Chat message content    | Sensitive      | MMKV (device-encrypted storage)        |
| Pairing code            | Low            | MMKV (not a long-lived secret)         |
| Push notification token | Low            | Sent to backend, not persisted locally |
| Voice recordings        | Sensitive      | Temporary file, deleted after upload   |
| User preferences        | Low            | MMKV                                   |

## 11.2 Secret Storage

### 11.2.1 Android Keystore Architecture

```
+-------------------+     +------------------+
|  expo-secure-store | --> | Android Keystore |
|  (React Native)    |     | (TEE / StrongBox)|
+-------------------+     +------------------+
         |                         |
         v                         v
  +--------------+          +-----------+
  |  Encrypted   |          |  AES Key  |
  |  SharedPrefs |          |  (HW-backed)|
  +--------------+          +-----------+
```

- Keys generated in the Keystore are non-extractable (cannot be exported)
- On devices with StrongBox (Pixel 3+, Samsung Galaxy S10+), keys are stored in a dedicated security chip
- On devices with TEE (Trusted Execution Environment), keys are stored in the secure world
- Keystore access may require device authentication (PIN/pattern/biometric) depending on key configuration

### 11.2.2 What Is Stored Where

| Data                  | Storage                                  | Encryption                  | Accessible Without Unlock |
| --------------------- | ---------------------------------------- | --------------------------- | ------------------------- |
| Auth session JSON     | Keystore-encrypted SharedPrefs           | AES-256 (hardware-backed)   | Yes (app process)         |
| Supabase session      | Keystore-encrypted SharedPrefs (chunked) | AES-256 (hardware-backed)   | Yes (app process)         |
| Chat history          | MMKV                                     | Device encryption (FBE)     | Yes (app process)         |
| Settings              | MMKV                                     | Device encryption (FBE)     | Yes (app process)         |
| Temporary audio files | Cache directory                          | File-based encryption (FBE) | Yes (app process)         |

### 11.2.3 What Is NOT Stored

- LLM API keys (user does not enter API keys on mobile -- all routing through API gateway)
- Deepgram API key (build-time environment variable, not stored at runtime)
- Supabase anon key (build-time, public knowledge)
- Passwords (never stored -- Supabase handles auth server-side)

## 11.3 Network Security

### 11.3.1 Transport Layer

| Connection          | Protocol        | Certificate Pinning     |
| ------------------- | --------------- | ----------------------- |
| API Gateway         | HTTPS (TLS 1.3) | Not implemented (P2)    |
| Supabase            | HTTPS (TLS 1.3) | Managed by Supabase SDK |
| Signaling Server    | WSS (TLS 1.3)   | Not implemented (P2)    |
| Deepgram API        | HTTPS (TLS 1.3) | Not implemented         |
| STUN servers        | STUN over UDP   | N/A (public protocol)   |
| WebRTC Data Channel | DTLS + SCTP     | Peer-to-peer encrypted  |

### 11.3.2 Authentication

- All API requests include `Authorization: Bearer <jwt>` header
- JWT tokens are short-lived (1 hour) with automatic refresh
- PKCE (Proof Key for Code Exchange) flow used for OAuth to prevent authorization code interception
- `detectSessionInUrl: false` prevents session fixation via URL manipulation

### 11.3.3 Data in Transit

| Data Type                             | Encryption          |
| ------------------------------------- | ------------------- |
| Chat messages (to API)                | TLS 1.3             |
| Voice recordings (to Whisper)         | TLS 1.3             |
| Images (to upload endpoint)           | TLS 1.3             |
| Control messages (WebRTC)             | DTLS (peer-to-peer) |
| Control messages (signaling fallback) | WSS (TLS 1.3)       |
| Push notification content             | FCM uses TLS        |

## 11.4 Application Security

### 11.4.1 Code Protection

| Measure                        | Implementation                               |
| ------------------------------ | -------------------------------------------- |
| JavaScript obfuscation         | Metro bundler minification in release builds |
| ProGuard/R8                    | Java/Kotlin code shrinking and obfuscation   |
| No source maps in production   | `sourceMaps: false` in release builds        |
| No debug logging in production | `__DEV__` guard on console statements        |
| API URL not hardcoded          | Environment variable (`EXPO_PUBLIC_API_URL`) |

### 11.4.2 Input Validation

| Input            | Validation                                                     |
| ---------------- | -------------------------------------------------------------- |
| Pairing code     | Regex: `[A-Za-z0-9]{6,12}`                                     |
| Email            | `keyboardType: "email-address"`, server-side validation        |
| Chat messages    | No client-side limit (server enforces token limits)            |
| File uploads     | Type check (image MIME types), size limit enforced server-side |
| Deep link URLs   | Scheme validation (`agiworkforce://`), path whitelist (`pair`) |
| SecureStore keys | Sanitized: `key.replace(/[^A-Za-z0-9._-]/g, '_')`              |

### 11.4.3 WebRTC Security

- STUN servers: Google public STUN (no credentials, no data relayed)
- No TURN server configured (data channel is control-only, not media-heavy)
- Data channel encrypted via DTLS (mandatory in WebRTC)
- Signaling messages validated before processing (type check on `kind` field)
- ICE candidate validation: only `RTCIceCandidate` objects accepted

## 11.5 Android-Specific Security

### 11.5.1 Play Protect

- App will be scanned by Google Play Protect during and after installation
- No dynamic code loading (eval, require from network, etc.)
- No reflection-based API access
- All permissions declared in manifest and used as documented

### 11.5.2 SafetyNet / Play Integrity

- P2: Integrate Play Integrity API to verify device is genuine and not rooted
- Can be used to reject API requests from tampered devices

### 11.5.3 Network Security Config

On Android 9+ (API 28), cleartext traffic is blocked by default. The app:

- Does NOT allow cleartext HTTP traffic
- Does NOT add custom CA certificates
- Relies on the Android system trust store

### 11.5.4 Backup Rules

```xml
<application android:allowBackup="false">
```

Or with selective backup:

```xml
<application android:dataExtractionRules="@xml/data_extraction_rules">
```

Sensitive data (Keystore-encrypted SharedPrefs) should be excluded from cloud backups.

---

# Section 12: Accessibility

## 12.1 TalkBack Support

TalkBack is Android's built-in screen reader. All interactive elements must be accessible:

### 12.1.1 Accessibility Labels

| Element             | `accessibilityLabel`                                     | `accessibilityRole` |
| ------------------- | -------------------------------------------------------- | ------------------- |
| Hamburger button    | "Open sidebar"                                           | "button"            |
| Send button         | "Send message"                                           | "button"            |
| Stop button         | "Stop generating"                                        | "button"            |
| Model selector chip | "Select model. Current: {modelName}"                     | "button"            |
| Voice mode button   | "Open voice mode"                                        | "button"            |
| Attachment button   | "Attach file"                                            | "button"            |
| Conversation item   | "{title}. {messageCount} messages. Last updated {time}"  | "button"            |
| Agent card          | "{name}. Status: {status}. Progress: {progress} percent" | "button"            |
| Approve button      | "Approve {toolName}"                                     | "button"            |
| Deny button         | "Deny {toolName}"                                        | "button"            |
| Settings toggle     | "{settingName}. Currently {on/off}"                      | "switch"            |
| QR scan button      | "Scan QR code to pair with desktop"                      | "button"            |
| Close button        | "Close"                                                  | "button"            |
| Skip button         | "Skip onboarding"                                        | "button"            |
| Next button         | "Next slide" / "Get started"                             | "button"            |
| Onboarding dot      | "Slide {n} of 3"                                         | "image"             |
| Thinking section    | "AI thinking process. Tap to {expand/collapse}"          | "button"            |
| Code block          | "Code block. {language}. Tap to copy"                    | "button"            |

### 12.1.2 Focus Order

TalkBack traverses elements in the following order per screen:

**Home Screen**: Hamburger -> (empty area skipped) -> Model Selector -> Text Input -> Attachment -> Voice -> Send

**Chat Screen**: Hamburger -> Title -> Overflow Menu -> Messages (oldest to newest) -> ChatInput components

**Agents Screen**: Hamburger -> Title -> Clear button -> Agent cards (top to bottom, with approval buttons within)

### 12.1.3 Content Descriptions for Dynamic Content

- Chat messages: `accessibilityLabel="{role} message: {content}. {model}. {time}"`
- Streaming messages: `accessibilityLabel="Assistant is typing..."`
- Tool calls: `accessibilityLabel="{toolName}: {status}. {duration}"`
- Images: `accessibilityLabel="Generated image: {revisedPrompt || 'AI-generated image'}"`

## 12.2 Touch Targets

All interactive elements meet Android's 48dp minimum touch target:

| Element              | Touch Target          | Visual Size        | Notes                      |
| -------------------- | --------------------- | ------------------ | -------------------------- |
| Hamburger button     | 48x48dp               | 22x22dp icon       | Padding extends touch area |
| Send button          | 48x48dp               | 40x40dp            | Circular with padding      |
| Model selector chip  | 48dp height           | 32dp height        | Vertical padding extends   |
| Toggle switches      | 48x48dp               | 28x20dp            | System switch with padding |
| List items           | Full width x 56dp min | Content-determined | Generous vertical padding  |
| Approve/Deny buttons | 80x48dp min           | 60x36dp            | Padded for ease of tap     |
| Drawer items         | Full width x 48dp     | Full width x 48dp  | Match guideline exactly    |

## 12.3 Font Scaling

The app uses `sp` (scale-independent pixels) for all text sizes, which means text scales with the user's Android font size setting:

| System Font Size | Scale Factor | Body Text (16sp) | H1 (30sp)       |
| ---------------- | ------------ | ---------------- | --------------- |
| Small            | 0.85x        | 13.6sp rendered  | 25.5sp rendered |
| Default          | 1.0x         | 16sp rendered    | 30sp rendered   |
| Large            | 1.15x        | 18.4sp rendered  | 34.5sp rendered |
| Largest          | 1.3x         | 20.8sp rendered  | 39sp rendered   |
| Maximum (200%)   | 2.0x         | 32sp rendered    | 60sp rendered   |

### 12.3.1 Layout Behavior at Large Font Sizes

- Chat messages: text wraps, message bubble height increases
- Navigation items: text may truncate with ellipsis
- Bottom sheet: increased height to accommodate larger text
- Buttons: height increases to maintain padding proportions
- Headers: title may truncate with ellipsis at very large sizes

### 12.3.2 Testing Requirement

All screens must be tested at 200% font size to ensure:

- No text overlaps
- No elements are pushed off screen
- All buttons remain tappable
- Scrollable areas still function

## 12.4 Color Contrast

All text meets WCAG 2.1 AA contrast requirements:

| Text                        | Foreground            | Background | Contrast Ratio | Requirement            |
| --------------------------- | --------------------- | ---------- | -------------- | ---------------------- |
| Primary text                | #ffffff               | #0f1012    | 18.5:1         | Passes AAA             |
| Secondary text              | rgba(255,255,255,0.5) | #0f1012    | 7.8:1          | Passes AA              |
| Tertiary text               | rgba(255,255,255,0.4) | #0f1012    | 5.9:1          | Passes AA              |
| Teal on dark                | #21808d               | #0f1012    | 4.6:1          | Passes AA (large text) |
| Button text (black on teal) | #000000               | teal-500   | 5.2:1          | Passes AA              |
| Risk-low (emerald)          | #10b981               | #0f1012    | 5.7:1          | Passes AA              |
| Risk-medium (amber)         | #f59e0b               | #0f1012    | 8.2:1          | Passes AA              |
| Risk-high (red)             | #ef4444               | #0f1012    | 4.9:1          | Passes AA (large text) |

## 12.5 Motion and Animation

### 12.5.1 Reduce Motion

When the user has enabled "Remove animations" in Android accessibility settings:

- All `react-native-reanimated` animations should check `AccessibilityInfo.isReduceMotionEnabled()`
- Drawer open/close: instant instead of slide animation
- Bottom sheet: instant snap instead of spring animation
- Onboarding slides: instant transition instead of slide
- Streaming cursor: static cursor instead of pulsing animation
- Waveform: static bar instead of animated waveform

### 12.5.2 Implementation

```typescript
import { AccessibilityInfo } from 'react-native';

const [reduceMotion, setReduceMotion] = useState(false);
useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
  return () => subscription.remove();
}, []);
```

## 12.6 Keyboard Navigation

While Android primarily uses touch input, external keyboard support (Bluetooth keyboards, Chromebook keyboard, DeX mode) should be considered:

| Key         | Action                                               |
| ----------- | ---------------------------------------------------- |
| Enter       | Send message (in chat input, when text is non-empty) |
| Shift+Enter | New line in chat input                               |
| Escape      | Close bottom sheet / overlay                         |
| Tab         | Move focus to next element                           |
| Shift+Tab   | Move focus to previous element                       |
| Arrow keys  | Navigate within lists                                |
| Space/Enter | Activate focused element                             |

---

# Section 13: Competitive Analysis

## 13.1 Claude Android App

### 13.1.1 Feature Comparison

| Feature                  | AGI Workforce Android     | Claude Android                                  |
| ------------------------ | ------------------------- | ----------------------------------------------- |
| AI Models                | 30+ models, 9+ providers  | Claude 4.5 Sonnet, Haiku, Opus (Anthropic only) |
| Voice input              | PTT + Whisper + Deepgram  | No                                              |
| Voice output             | System TTS                | No                                              |
| Desktop companion        | QR pairing + WebRTC       | No                                              |
| Agent monitoring         | Real-time dashboard       | No (no agent concept)                           |
| Tool approval            | Approve/deny from phone   | No                                              |
| Background notifications | Agent approvals           | No                                              |
| Notification channels    | 3 channels                | 1 channel                                       |
| Image generation         | Yes (via API)             | No                                              |
| Thinking/reasoning       | Yes (collapsible)         | Yes                                             |
| Artifacts                | Code, research, email     | Yes (Claude artifacts)                          |
| Cross-device sync        | Supabase Realtime         | Limited (account-based)                         |
| Offline chat history     | Yes (MMKV)                | No                                              |
| Conversation management  | Full CRUD + groups + tags | Basic                                           |
| Material You theming     | Planned                   | No                                              |
| Quick Settings tile      | Planned                   | No                                              |

### 13.1.2 Claude Android Strengths

- Polished, focused UI (single-model simplicity)
- Deep integration with Claude's artifact system
- Professional-grade markdown rendering
- Strong brand recognition

### 13.1.3 Where AGI Workforce Leads

1. **Multi-model**: 30+ models vs. Claude-only
2. **Desktop control**: No competitor has mobile-to-desktop agent control
3. **Voice I/O**: Hold-to-record + TTS
4. **Background notifications**: Proactive agent approval alerts
5. **Offline resilience**: Full chat history cached locally

## 13.2 ChatGPT Android App

### 13.2.1 Feature Comparison

| Feature            | AGI Workforce Android          | ChatGPT Android                       |
| ------------------ | ------------------------------ | ------------------------------------- |
| AI Models          | 30+ models, 9+ providers       | GPT-4o, o3, GPT-4o mini (OpenAI only) |
| Voice mode         | PTT + Whisper + TTS            | Advanced Voice Mode (real-time)       |
| Desktop companion  | QR pairing + WebRTC            | No                                    |
| Agent monitoring   | Real-time dashboard            | No                                    |
| Image generation   | Yes (via API)                  | DALL-E 3                              |
| Memory             | Agent memory from desktop      | ChatGPT memory (conversation-based)   |
| Home screen widget | Planned                        | Yes (Android widget)                  |
| Custom GPTs        | N/A (skills system on desktop) | Yes (GPT Store)                       |
| Search (web)       | Perplexity Sonar models        | ChatGPT Search                        |
| Canvas             | Desktop (not mobile)           | Yes (Canvas)                          |
| Projects           | Desktop (not mobile)           | Yes (Projects)                        |
| File upload        | Images                         | Images, documents                     |
| Cross-device sync  | Supabase Realtime              | OpenAI account sync                   |

### 13.2.2 ChatGPT Strengths

- Advanced Voice Mode (real-time, natural conversation)
- DALL-E 3 image generation
- GPT Store / Custom GPTs ecosystem
- Canvas for document editing
- Larger user base and brand recognition
- Native Android widget

### 13.2.3 Where AGI Workforce Leads

1. **Model freedom**: Not locked to OpenAI
2. **Desktop agent control**: Unique to AGI Workforce
3. **Cost flexibility**: Economy models (Claude Haiku, Gemini Flash) for cheaper usage
4. **Notification channels**: Structured Android notifications with per-category control
5. **Side-loading**: APK distribution for enterprise

## 13.3 Google Gemini Android App

### 13.3.1 Feature Comparison

| Feature             | AGI Workforce Android    | Gemini Android                                 |
| ------------------- | ------------------------ | ---------------------------------------------- |
| AI Models           | 30+ models, 9+ providers | Gemini 2.0 Flash, Pro, Ultra (Google only)     |
| System integration  | App-level                | Deep Android OS integration                    |
| Voice mode          | PTT + Whisper + TTS      | Google Assistant-style voice                   |
| Desktop companion   | QR pairing + WebRTC      | Cross-device via Google account                |
| Extensions          | MCP tools (via desktop)  | Gemini Extensions (Gmail, Maps, YouTube, etc.) |
| Material You        | Planned                  | Full Material You                              |
| Home screen widget  | Planned                  | Yes                                            |
| Quick Settings tile | Planned                  | No (Assistant replacement)                     |
| Image generation    | Yes                      | Imagen 3                                       |
| Multimodal input    | Camera/image attachment  | Camera, audio, video, screen share             |
| Default assistant   | No                       | Can replace Google Assistant                   |

### 13.3.2 Gemini Strengths

- Deep Android OS integration (can replace Google Assistant)
- Material You native design
- Google Extensions (Gmail, Drive, Maps, Calendar, YouTube)
- Multimodal input (screen sharing, live video)
- Massive distribution (pre-installed on some devices)

### 13.3.3 Where AGI Workforce Leads

1. **Model agnostic**: Not locked to Google
2. **Desktop agent control**: No Gemini equivalent
3. **Background agent monitoring**: Proactive notifications
4. **Privacy**: Can use local models (via desktop) -- no data sent to Google
5. **Tool approval workflow**: Enterprise-grade security controls

## 13.4 Strategic Analysis

### 13.4.1 Android-Specific Competitive Advantages

1. **Notification Channels**: Three distinct channels (default, approvals, tasks) give users granular control. No competitor offers this level of notification structure.

2. **Background Agent Polling**: Proactive 15-minute checks for pending approvals. No competitor has background agent monitoring.

3. **Side-Loading / APK Distribution**: Enterprise customers in restricted environments (government, healthcare, defense) can deploy via MDM without Play Store dependency.

4. **Quick Settings Tile (Planned)**: Instant agent status at a glance from the notification shade. No competitor has a Quick Settings integration.

5. **Lock Screen Actions (Planned)**: Approve or deny agent operations without unlocking the device. Critical for time-sensitive approvals.

6. **Foldable Device Support (Planned)**: Optimized layouts for Samsung Galaxy Z Fold / Z Flip. First AI agent app to support foldable form factors.

### 13.4.2 Where Parity Is Needed

| Gap                       | Competitor with Feature  | Priority |
| ------------------------- | ------------------------ | -------- |
| Real-time voice mode      | ChatGPT (Advanced Voice) | P1       |
| Home screen widget        | ChatGPT, Gemini          | P2       |
| Material You theming      | Gemini                   | P1       |
| File upload (documents)   | ChatGPT                  | P2       |
| On-device model inference | None (opportunity)       | P3       |
| Predictive back gesture   | All modern Android apps  | P1       |

### 13.4.3 Strategic Gaps to Own

1. **Mobile-to-Desktop Agent Control**: No competitor allows controlling desktop AI agents from a mobile phone. This is the killer differentiator.

2. **Multi-Model Mobile Chat**: All competitors are single-provider. AGI Workforce is the only mobile app offering 9+ providers.

3. **Enterprise Android Deployment**: Side-loading, MDM compatibility, Quick Settings tile, and lock screen actions make AGI Workforce uniquely positioned for enterprise Android deployments.

4. **Background Agent Intelligence**: The combination of background fetch + notification channels + lock screen actions creates a genuinely proactive AI companion that no competitor has.

5. **Global Market Model Access**: Economy models (DeepSeek, Qwen, ZhipuAI, Gemini Flash) at low cost per token make AGI Workforce accessible in price-sensitive markets where Android dominates.

---

# Appendix A: Glossary

| Term         | Definition                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| AAB          | Android App Bundle -- Google Play's app publishing format                  |
| ABI          | Application Binary Interface (arm64-v8a, armeabi-v7a, x86_64)              |
| APK          | Android Package -- installable app format                                  |
| Companion    | The desktop-to-mobile pairing feature via WebRTC                           |
| Data Channel | WebRTC peer-to-peer data channel for control messages                      |
| Doze         | Android power-saving mode that restricts background activity               |
| EAS          | Expo Application Services -- cloud build and submission                    |
| FCM          | Firebase Cloud Messaging -- push notification delivery                     |
| FBE          | File-Based Encryption (Android's default storage encryption)               |
| FlashList    | Shopify's high-performance list component for React Native                 |
| ICE          | Interactive Connectivity Establishment (WebRTC)                            |
| Keystore     | Android's hardware-backed cryptographic key storage                        |
| MMKV         | High-performance key-value storage by WeChat (used for non-sensitive data) |
| PKCE         | Proof Key for Code Exchange (OAuth 2.0 extension)                          |
| PTT          | Push-to-Talk (hold-to-record voice input)                                  |
| R8           | Android code shrinking and obfuscation tool                                |
| SSE          | Server-Sent Events (streaming protocol)                                    |
| StrongBox    | Hardware security module on supported Android devices                      |
| STUN         | Session Traversal Utilities for NAT (WebRTC)                               |
| TEE          | Trusted Execution Environment                                              |
| TTS          | Text-to-Speech                                                             |
| WebRTC       | Web Real-Time Communication (peer-to-peer)                                 |

---

# Appendix B: File Map

| File                                         | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `apps/mobile/app.json`                       | Expo configuration (package, permissions, plugins)               |
| `apps/mobile/eas.json`                       | EAS Build profiles (development, preview, production)            |
| `apps/mobile/package.json`                   | Dependencies and scripts                                         |
| `apps/mobile/app/_layout.tsx`                | Root layout (auth guard, notifications, deep links, back button) |
| `apps/mobile/app/onboarding.tsx`             | 3-slide onboarding flow                                          |
| `apps/mobile/app/(auth)/login.tsx`           | Email/Google/Apple sign-in                                       |
| `apps/mobile/app/(app)/_layout.tsx`          | Drawer navigation with 7 screens                                 |
| `apps/mobile/app/(app)/index.tsx`            | Home screen (empty + ChatInput)                                  |
| `apps/mobile/app/(app)/chat/[id].tsx`        | Chat conversation view                                           |
| `apps/mobile/app/(app)/agents/index.tsx`     | Agent dashboard                                                  |
| `apps/mobile/app/(app)/companion/index.tsx`  | QR pairing + connection                                          |
| `apps/mobile/app/(app)/schedules/index.tsx`  | Schedule list                                                    |
| `apps/mobile/app/(app)/schedules/create.tsx` | Create schedule form                                             |
| `apps/mobile/app/(app)/settings/index.tsx`   | Settings                                                         |
| `apps/mobile/app/(app)/settings/memory.tsx`  | Memory management                                                |
| `apps/mobile/app/(app)/messaging/index.tsx`  | Team messaging                                                   |
| `apps/mobile/stores/authStore.ts`            | Auth state (Keystore-backed)                                     |
| `apps/mobile/stores/chatStore.ts`            | Chat state (MMKV-backed)                                         |
| `apps/mobile/stores/connectionStore.ts`      | Companion connection (MMKV-backed)                               |
| `apps/mobile/stores/agentStore.ts`           | Agent state (MMKV-backed)                                        |
| `apps/mobile/stores/modelStore.ts`           | Model selection (MMKV-backed)                                    |
| `apps/mobile/stores/memoryStore.ts`          | Agent memories (MMKV-backed)                                     |
| `apps/mobile/stores/messagingStore.ts`       | Messaging state (MMKV-backed)                                    |
| `apps/mobile/stores/scheduleStore.ts`        | Schedule state (MMKV-backed)                                     |
| `apps/mobile/stores/settingsStore.ts`        | App preferences (MMKV-backed)                                    |
| `apps/mobile/services/api.ts`                | Authenticated HTTP client                                        |
| `apps/mobile/services/streaming.ts`          | SSE streaming consumer                                           |
| `apps/mobile/services/notifications.ts`      | FCM push + channels                                              |
| `apps/mobile/services/backgroundFetch.ts`    | Agent status polling task                                        |
| `apps/mobile/services/companion.ts`          | Desktop companion utilities                                      |
| `apps/mobile/services/realtime.ts`           | Supabase Realtime subscriptions                                  |
| `apps/mobile/services/voice.ts`              | Audio recording + transcription                                  |
| `apps/mobile/services/tts.ts`                | Text-to-speech (expo-speech)                                     |
| `apps/mobile/services/modelCatalog.ts`       | Remote model catalog fetcher                                     |
| `apps/mobile/services/supabase.ts`           | Supabase client (Keystore-backed auth)                           |
| `apps/mobile/lib/secureStorage.ts`           | Keystore adapter for Zustand persist                             |
| `apps/mobile/lib/mmkv.ts`                    | MMKV adapter for Zustand persist                                 |
| `apps/mobile/lib/constants.ts`               | Environment variables, timeouts                                  |
| `apps/mobile/lib/models.ts`                  | Embedded model catalog (30+ models)                              |
| `apps/mobile/lib/theme.ts`                   | Color and spacing tokens                                         |
| `apps/mobile/lib/abortSignal.ts`             | AbortSignal combiner utility                                     |
| `apps/mobile/lib/cn.ts`                      | className merge utility                                          |
| `apps/mobile/lib/markdown.ts`                | Markdown parsing utilities                                       |
| `apps/mobile/lib/clipboard.ts`               | Clipboard access utility                                         |
| `apps/mobile/lib/imageGenHelpers.ts`         | Image generation helpers                                         |
| `apps/mobile/lib/tagUtils.ts`                | Conversation tag utilities                                       |
| `apps/mobile/types/chat.ts`                  | Chat, agent, tool, approval types                                |
| `apps/mobile/types/navigation.ts`            | Navigation type definitions                                      |
| `apps/mobile/hooks/useVoicePlayback.ts`      | TTS playback hook                                                |
| `apps/mobile/components/chat/`               | Chat UI components (19 files)                                    |
| `apps/mobile/components/voice/`              | Voice conversation components                                    |
| `apps/mobile/components/companion/`          | Companion/pairing components                                     |
| `apps/mobile/components/agents/`             | Agent dashboard components                                       |
| `apps/mobile/components/model-picker/`       | Model selection components                                       |
| `apps/mobile/components/sidebar/`            | Drawer sidebar components                                        |
| `apps/mobile/components/ui/`                 | Base UI components                                               |
| `apps/mobile/components/settings/`           | Settings components                                              |
| `apps/mobile/components/schedules/`          | Schedule components                                              |
| `apps/mobile/components/messaging/`          | Messaging components                                             |
| `apps/mobile/components/auth/`               | Auth form components                                             |

---

# Appendix C: Android Version Coverage

| API Level | Android Version | Release Year | Global Market Share (approx.) | Supported                      |
| --------- | --------------- | ------------ | ----------------------------- | ------------------------------ |
| 26        | 8.0 Oreo        | 2017         | 1.5%                          | Yes (minimum)                  |
| 27        | 8.1 Oreo        | 2017         | 1.2%                          | Yes                            |
| 28        | 9 Pie           | 2018         | 4.8%                          | Yes                            |
| 29        | 10              | 2019         | 8.2%                          | Yes                            |
| 30        | 11              | 2020         | 12.1%                         | Yes                            |
| 31        | 12              | 2021         | 13.5%                         | Yes                            |
| 32        | 12L             | 2022         | 3.2%                          | Yes                            |
| 33        | 13              | 2022         | 18.7%                         | Yes (notifications permission) |
| 34        | 14              | 2023         | 25.4%                         | Yes (target SDK)               |
| 35        | 15              | 2024         | 11.4%                         | Yes (compile SDK)              |

**Total supported**: ~97% of active Android devices.

---

# Appendix D: Notification Channel Reference

## Default Channel

```javascript
{
  id: 'default',
  name: 'Default',
  importance: AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#21808d',
}
```

- **Heads-up**: Yes (HIGH importance)
- **Sound**: Default notification sound
- **Badge**: Yes
- **User can**: Disable, change sound, toggle vibration, toggle badge

## Agent Approvals Channel

```javascript
{
  id: 'agent-approvals',
  name: 'Agent Approvals',
  importance: AndroidImportance.MAX,
  vibrationPattern: [0, 500, 250, 500],
  lightColor: '#ff6b6b',
}
```

- **Heads-up**: Yes (MAX importance -- always shown as heads-up)
- **Sound**: Default notification sound (urgent)
- **Badge**: Yes
- **User can**: Disable (but channel importance is MAX by default)
- **Lock screen actions**: Approve / Deny (planned P1)

## Tasks & Schedules Channel

```javascript
{
  id: 'tasks',
  name: 'Tasks & Schedules',
  importance: AndroidImportance.DEFAULT,
  lightColor: '#21808d',
}
```

- **Heads-up**: No (DEFAULT importance -- appears in shade)
- **Sound**: Default notification sound
- **Badge**: Yes
- **User can**: Disable, change importance

---

# Appendix E: Migration Plan from iOS PRD

The following features are shared with the iOS app and are documented in detail in `PRD-IOS.md`. This PRD focuses on Android-specific adaptations. For the canonical specification of these shared features, refer to the iOS PRD:

| Feature                                 | iOS PRD Section   | Android Adaptation                                |
| --------------------------------------- | ----------------- | ------------------------------------------------- |
| Chat UI (messages, streaming, markdown) | Section 4.6       | Same UI, FlashList recycler, Roboto Mono for code |
| Model picker                            | Section 4.16      | Same bottom sheet, same model catalog             |
| Voice recording                         | Section 4.15      | M4A/AAC format, `shouldDuckAndroid`               |
| Companion pairing                       | Section 4.9       | Same WebRTC + signaling, Android deep links       |
| Auth flow                               | Section 4.3       | Google Sign In via Chrome Custom Tab, no Face ID  |
| Onboarding                              | Section 4.4       | Same slides, hardware back button handling        |
| Agent dashboard                         | Section 4.8       | Same UI, same store                               |
| Settings                                | Section 4.12      | Same toggles, Android-style switches              |
| Schedules                               | Section 4.10-4.11 | Same UI, Android time picker                      |
| Offline behavior                        | Section 6.11      | Same MMKV caching strategy                        |
| API endpoints                           | Section 6         | Same endpoints, same auth                         |

---

_End of PRD-ANDROID.md_

_Document version: 1.0.0_
_Total sections: 13 (+ 5 appendices)_
_Generated: 2026-03-09_
