# PRD-IOS: AGI Workforce iOS Mobile Application

> **Document version**: 1.0.0
> **Last updated**: 2026-03-09
> **Status**: Approved for implementation
> **Owner**: Product Team
> **Platform**: iOS (iPhone + iPad)
> **Framework**: React Native 0.76 + Expo SDK 52

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

The AGI Workforce iOS application is the mobile companion to the desktop AI agent platform. It is **the single most important competitive differentiator** in the AGI Workforce product suite. No competitor -- not Claude Desktop, not ChatGPT, not Gemini, not Cursor -- offers a dedicated mobile application that provides real-time oversight, control, and approval authority over AI agents running on a paired desktop machine.

The iOS app transforms AGI Workforce from a desktop-only AI tool into a **24/7 AI workforce management platform**. Users can step away from their desk, commute, attend meetings, or travel -- and their AI agents continue working autonomously on the desktop while the user monitors progress, approves sensitive tool executions, and intervenes when needed, all from their iPhone or iPad.

The app serves three distinct use cases:

1. **Companion Mode** -- Pair with a desktop running AGI Workforce via QR code scan. Monitor live agent activity, approve/deny tool calls remotely, pause/resume/cancel agents, and receive push notifications when agents need human input.

2. **Standalone Chat** -- Full-featured AI chat interface with model selection across 9+ providers (Claude, GPT-4o, Gemini, Mistral, etc.), streaming responses with thinking/reasoning display, voice input via push-to-talk, image attachments, and conversation history synced across surfaces via Supabase Realtime.

3. **Workforce Management** -- Schedule recurring agent tasks, manage agent memory, view execution history, and configure messaging platform integrations (WhatsApp, Telegram, Slack).

## 1.2 Target Users

### 1.2.1 Primary: On-the-Go Professionals

Knowledge workers, developers, and executives who run long-duration agent tasks on their desktop and need mobile oversight. They want to approve a file deletion while in a meeting, check if a research agent has completed while commuting, or start a new chat from their phone when away from their desk.

### 1.2.2 Secondary: AI Enthusiasts

Early adopters who experiment with multiple AI models and want the convenience of a polished mobile chat interface with model switching, thinking mode, and voice input. They compare Claude vs. GPT-4o vs. Gemini responses and want the same multi-model freedom on their phone.

### 1.2.3 Tertiary: Enterprise Users

Team leads and managers who need to monitor agent activity across their organization from their mobile device. They receive push notifications for high-risk tool approvals and can intervene immediately regardless of location.

## 1.3 Key Differentiators Over Competitors

| Differentiator                       | AGI Workforce iOS               | Claude iOS                      | ChatGPT iOS  | Gemini iOS   |
| ------------------------------------ | ------------------------------- | ------------------------------- | ------------ | ------------ |
| Desktop agent pairing via QR         | Yes (free)                      | No (Remote Control $100-200/mo) | No           | No           |
| Live agent dashboard on phone        | Yes                             | No                              | No           | No           |
| Remote tool approval/denial          | Yes                             | No                              | No           | No           |
| Multi-model chat (9+ providers)      | Yes                             | Claude only                     | GPT only     | Gemini only  |
| Push notifications for agent actions | Yes                             | No                              | No           | No           |
| Voice input with STT                 | Yes (Whisper + Deepgram)        | Yes (native)                    | Yes (native) | Yes (native) |
| Background agent status polling      | Yes                             | No                              | No           | No           |
| Scheduled agent tasks from mobile    | Yes                             | No                              | No           | No           |
| Agent memory management              | Yes                             | No                              | No           | No           |
| Messaging platform integrations      | Yes (WhatsApp, Telegram, Slack) | No                              | No           | No           |
| Thinking/reasoning display           | Yes                             | Yes                             | Limited      | No           |
| Offline conversation access          | Yes (MMKV cache)                | Limited                         | Limited      | No           |
| WebRTC low-latency control channel   | Yes                             | No                              | No           | No           |

## 1.4 Non-Negotiable Requirements

| ID     | Requirement                                                           | Rationale                                                                                                                                              |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MNN-01 | Zero user-visible raw error messages                                  | All errors must be translated to friendly messages. Stack traces, HTTP codes, and internal exception text must never appear in the UI.                 |
| MNN-02 | QR pairing must complete in under 5 seconds                           | The pairing experience is the first impression of the companion feature. Any delay undermines the "magical" pairing experience.                        |
| MNN-03 | Push notifications for approval requests must arrive within 3 seconds | Agent workflows stall while waiting for human approval. Notification latency directly impacts agent throughput.                                        |
| MNN-04 | Offline access to conversation history                                | Users on planes, subways, or in poor connectivity areas must be able to read their chat history. MMKV persistence is required.                         |
| MNN-05 | Auth tokens must never be stored in plaintext                         | All auth tokens, session data, and API keys must use expo-secure-store (iOS Keychain) with the >2KB chunking fix. MMKV is only for non-sensitive data. |
| MNN-06 | App cold start under 2 seconds                                        | Users opening the app to approve an urgent agent action cannot wait for a slow splash screen.                                                          |
| MNN-07 | All streaming responses must display incrementally                    | Users must see tokens appear as they stream, matching the desktop experience. No "wait for complete response" behavior.                                |

## 1.5 Success Metrics

| Metric                              | Target                            | Measurement            |
| ----------------------------------- | --------------------------------- | ---------------------- |
| App Store rating                    | 4.5+ stars                        | App Store Connect      |
| Daily active users (DAU)            | 10% of desktop DAU within 90 days | Analytics              |
| QR pairing success rate             | >95%                              | Event tracking         |
| Average approval response time      | <30 seconds from notification     | Backend measurement    |
| Crash-free sessions                 | >99.5%                            | EAS/Sentry             |
| Cold start time (P95)               | <2 seconds                        | Performance monitoring |
| Push notification delivery rate     | >98%                              | APNs delivery reports  |
| Companion session duration (median) | >30 minutes                       | Event tracking         |
| Chat message send success rate      | >99%                              | API metrics            |

---

# Section 2: Platform Requirements

## 2.1 Operating System Requirements

| Requirement             | Specification                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- |
| Minimum iOS version     | iOS 16.0                                                                        |
| Recommended iOS version | iOS 17.0+ (for Dynamic Island, Interactive Widgets)                             |
| Supported devices       | iPhone (all models supporting iOS 16+), iPad (all models supporting iPadOS 16+) |
| Device orientation      | Portrait (primary), Landscape (iPad only, for split-view multitasking)          |
| Minimum screen size     | iPhone SE 3rd gen (4.7" / 375x667 pt)                                           |
| Maximum screen size     | iPad Pro 12.9" (1024x1366 pt)                                                   |

### 2.1.1 iOS Version Distribution Rationale

iOS 16.0 minimum ensures coverage of approximately 95% of active iOS devices as of Q1 2026. Key APIs that require iOS 16+:

- `UNNotificationContent` interactive notifications
- `SwiftUI` Charts (used via Expo modules)
- `PassKit` improvements
- Background URL sessions with modern task management

iOS 17+ features that gracefully degrade on iOS 16:

- Dynamic Island (Live Activities API) -- shows agent running indicator
- Interactive Widgets (WidgetKit) -- quick message or agent status
- StandBy mode support
- Privacy manifests (required for App Store submission)

## 2.2 Hardware Requirements

| Hardware         | Required                      | Usage                                                                     |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Camera           | Optional (rear + front)       | QR code scanning for desktop pairing, photo capture for image attachments |
| Microphone       | Optional                      | Voice input (push-to-talk), voice conversations                           |
| Network          | Required (WiFi or Cellular)   | API calls, WebSocket companion connection, push notifications             |
| Storage          | Minimum 50 MB free            | App bundle + cached conversations + MMKV storage                          |
| Biometric sensor | Optional (Face ID / Touch ID) | App lock, sensitive action confirmation                                   |

## 2.3 Framework & Technology Stack

| Layer                       | Technology                   | Version           | Purpose                                             |
| --------------------------- | ---------------------------- | ----------------- | --------------------------------------------------- |
| Runtime                     | React Native                 | 0.76.9            | Cross-platform native UI rendering                  |
| Platform framework          | Expo                         | SDK 52 (~52.0.49) | Build system, native module management, OTA updates |
| Navigation                  | expo-router                  | ~4.0.22           | File-based routing with typed routes                |
| Navigation (drawer)         | @react-navigation/drawer     | ^7.3.2            | Sidebar drawer navigation                           |
| State management            | Zustand                      | ^5.0.3            | Lightweight state stores with persistence           |
| Persistence (sensitive)     | expo-secure-store            | ~14.0.1           | iOS Keychain storage for auth tokens                |
| Persistence (non-sensitive) | react-native-mmkv            | ^3.2.0            | Fast key-value storage for UI state, chat cache     |
| Styling                     | NativeWind                   | ^4.1.23           | Tailwind CSS for React Native                       |
| Animations                  | react-native-reanimated      | ~3.16.7           | 60fps UI animations, gesture responses              |
| Gestures                    | react-native-gesture-handler | ~2.20.2           | Touch gestures, swipe actions                       |
| Bottom sheets               | @gorhom/bottom-sheet         | ^5.1.2            | iOS-native bottom sheet modals                      |
| List rendering              | @shopify/flash-list          | 1.7.3             | High-performance virtualized lists                  |
| Icons                       | lucide-react-native          | ^0.474.0          | Consistent icon set matching desktop                |
| Auth                        | @supabase/supabase-js        | ^2.97.0           | Supabase Auth with PKCE flow                        |
| Real-time                   | @supabase/supabase-js        | ^2.97.0           | Supabase Realtime for cross-surface sync            |
| WebRTC                      | react-native-webrtc          | ^124.0.5          | Low-latency data channel for companion              |
| Notifications               | expo-notifications           | ~0.29.14          | Push notifications via APNs                         |
| Background tasks            | expo-background-fetch        | ~13.0.6           | Periodic agent status polling                       |
| Camera                      | expo-camera                  | ~16.0.18          | QR code scanning                                    |
| Audio                       | expo-av                      | ~15.0.2           | Voice recording and playback                        |
| Image picker                | expo-image-picker            | ~16.0.6           | Photo/image selection for attachments               |
| Haptics                     | expo-haptics                 | ~14.0.1           | Tactile feedback for approvals/denials              |
| Crypto                      | expo-crypto                  | ~14.0.2           | Secure random generation                            |
| Speech                      | expo-speech                  | ~13.0.1           | Text-to-speech for voice conversation mode          |
| OTA updates                 | expo-updates                 | ~0.27.4           | Over-the-air JavaScript bundle updates              |
| Shared types                | @agiworkforce/types          | workspace:\*      | Cross-platform type definitions                     |
| Shared utils                | @agiworkforce/utils          | workspace:\*      | Cross-platform utility functions                    |

## 2.4 Distribution

| Channel     | Method                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| App Store   | Production distribution via Apple App Store                            |
| TestFlight  | Internal/external beta testing                                         |
| EAS Build   | Cloud-based build pipeline (development, preview, production profiles) |
| OTA Updates | expo-updates for JS bundle patches without App Store review            |

## 2.5 Feature Flags

| Flag                       | Default | Description                                         |
| -------------------------- | ------- | --------------------------------------------------- |
| `companion_enabled`        | `true`  | Enable desktop companion pairing feature            |
| `voice_enabled`            | `true`  | Enable voice input and voice conversation mode      |
| `background_fetch_enabled` | `true`  | Enable background agent status polling              |
| `messaging_enabled`        | `true`  | Enable messaging platform integrations              |
| `dynamic_island_enabled`   | `true`  | Enable Dynamic Island for agent status (iOS 17+)    |
| `widgets_enabled`          | `false` | Enable home screen widgets (requires native module) |
| `biometric_lock_enabled`   | `false` | Enable Face ID / Touch ID app lock                  |
| `siri_shortcuts_enabled`   | `false` | Enable Siri Shortcuts for voice commands            |

## 2.6 Environment Variables

| Variable                        | Required | Default                            | Description                                                              |
| ------------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`           | Yes      | `https://agiworkforce.com`         | API gateway base URL                                                     |
| `EXPO_PUBLIC_WS_URL`            | Yes      | `wss://signaling.agiworkforce.com` | WebSocket signaling server for companion pairing                         |
| `EXPO_PUBLIC_SUPABASE_URL`      | Yes      | (none)                             | Supabase project URL                                                     |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes      | (none)                             | Supabase anonymous key                                                   |
| `EXPO_PUBLIC_DEEPGRAM_API_KEY`  | No       | (empty)                            | Deepgram API key for client-side STT (falls back to server-side Whisper) |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Core Chat Features

| Feature                     | Priority | Status      | Description                                                             |
| --------------------------- | -------- | ----------- | ----------------------------------------------------------------------- |
| Multi-model chat            | P0       | Implemented | Chat with any of 9+ LLM providers                                       |
| Streaming responses         | P0       | Implemented | Token-by-token SSE streaming display                                    |
| Thinking/reasoning display  | P0       | Implemented | Show Claude/model thinking content                                      |
| Conversation management     | P0       | Implemented | Create, rename, delete conversations                                    |
| Conversation history        | P0       | Implemented | Sidebar with grouped conversations (Today, Yesterday, This Week, Older) |
| Model picker                | P0       | Implemented | Bottom sheet with provider filtering, favorites, recents                |
| Thinking mode toggle        | P1       | Implemented | Enable extended thinking for supported models                           |
| Stop generation             | P0       | Implemented | Abort streaming response mid-generation                                 |
| Offline conversation access | P1       | Implemented | Read cached conversations without network                               |
| Auto-tagging                | P2       | Implemented | Automatic conversation categorization                                   |
| Image attachments           | P1       | Implemented | Send images from camera or photo library                                |
| Image generation            | P2       | Implemented | Request AI-generated images with progress tracking                      |
| Code artifacts              | P2       | Partial     | Display code blocks with syntax highlighting                            |
| Citations display           | P2       | Partial     | Show source citations from RAG/web search                               |
| Message copy                | P1       | Implemented | Long-press to copy message content                                      |
| Message retry               | P2       | Planned     | Regenerate last assistant response                                      |
| Conversation search         | P2       | Planned     | Search across all conversations                                         |
| Conversation export         | P3       | Planned     | Export conversation as text/PDF                                         |
| Pinned conversations        | P2       | Planned     | Pin important conversations to top                                      |

### 3.1.2 Desktop Companion Features

| Feature                      | Priority | Status      | Description                                         |
| ---------------------------- | -------- | ----------- | --------------------------------------------------- |
| QR code pairing              | P0       | Implemented | Scan QR from desktop to establish connection        |
| Manual code entry            | P0       | Implemented | Enter 6-12 character pairing code manually          |
| Live agent dashboard         | P0       | Implemented | Real-time view of all running agents                |
| Agent progress tracking      | P0       | Implemented | Progress bar and step-by-step status for each agent |
| Tool call approval/denial    | P0       | Implemented | Approve or deny pending tool executions             |
| Risk level indicators        | P0       | Implemented | Color-coded risk badges (low/medium/high)           |
| Agent pause/resume/cancel    | P1       | Implemented | Remote agent lifecycle control                      |
| WebRTC data channel          | P1       | Implemented | Low-latency control via direct peer connection      |
| Signaling relay fallback     | P0       | Implemented | WebSocket relay when WebRTC unavailable             |
| Connection health monitoring | P1       | Implemented | 30-second heartbeat pings                           |
| Session expiry handling      | P1       | Implemented | Graceful re-pairing when session expires            |
| Desktop metadata display     | P1       | Implemented | Show connected desktop name, platform, version      |
| Deep link pairing            | P1       | Implemented | `agiworkforce://pair/CODE` URL scheme               |
| Auto-reconnect               | P2       | Partial     | Reconnect to last paired desktop on app launch      |
| Multi-desktop support        | P3       | Planned     | Pair with multiple desktops simultaneously          |

### 3.1.3 Voice Features

| Feature                      | Priority | Status      | Description                                             |
| ---------------------------- | -------- | ----------- | ------------------------------------------------------- |
| Push-to-talk voice input     | P1       | Implemented | Hold to record, release to transcribe                   |
| Whisper STT (server-side)    | P1       | Implemented | Audio upload to API gateway for transcription           |
| Deepgram STT (client-side)   | P2       | Implemented | Direct client-side transcription when API key available |
| Voice conversation mode      | P1       | Implemented | Full-screen voice interaction with TTS response         |
| Audio metering visualization | P2       | Implemented | Real-time waveform during recording (~15fps)            |
| Text-to-speech playback      | P1       | Implemented | expo-speech for reading responses aloud                 |
| Voice playback controls      | P2       | Implemented | Play/pause/stop for TTS responses                       |
| Siri Shortcuts               | P3       | Planned     | "Hey Siri, ask AGI Workforce..."                        |

### 3.1.4 Notification Features

| Feature                           | Priority | Status      | Description                                      |
| --------------------------------- | -------- | ----------- | ------------------------------------------------ |
| Push notification registration    | P0       | Implemented | APNs token registration via Expo                 |
| Agent approval notifications      | P0       | Implemented | Push when agent needs tool approval              |
| Task completed notifications      | P1       | Implemented | Push when scheduled task finishes                |
| Schedule triggered notifications  | P1       | Implemented | Push when scheduled task starts                  |
| Companion connected notifications | P2       | Implemented | Push when desktop connects/disconnects           |
| Chat message notifications        | P2       | Implemented | Push for new messages in conversations           |
| Notification tap routing          | P0       | Implemented | Deep-link to relevant screen on tap              |
| Cold-start notification handling  | P1       | Implemented | Handle notification that launched the app        |
| Background agent status polling   | P1       | Implemented | 15-minute background fetch for pending approvals |
| Notification channels             | P1       | Implemented | Separate channels for approvals, tasks, default  |
| Badge count management            | P2       | Partial     | Update app icon badge for pending items          |
| Notification preferences          | P1       | Implemented | Per-type enable/disable in settings              |

### 3.1.5 Schedule Management

| Feature                         | Priority | Status      | Description                               |
| ------------------------------- | -------- | ----------- | ----------------------------------------- |
| View schedules                  | P1       | Implemented | List of all scheduled agent tasks         |
| Create schedule                 | P1       | Implemented | Create new recurring/one-time task        |
| Edit schedule                   | P1       | Implemented | Modify existing schedule parameters       |
| Delete schedule                 | P1       | Implemented | Remove scheduled task                     |
| Toggle schedule active/inactive | P1       | Implemented | Enable/disable without deleting           |
| Recurrence types                | P1       | Implemented | Once, daily, weekly, monthly, custom cron |
| Run history                     | P2       | Implemented | View past execution results per schedule  |
| Schedule timezone support       | P2       | Implemented | Schedule in any timezone                  |

### 3.1.6 Memory Management

| Feature         | Priority | Status      | Description                                   |
| --------------- | -------- | ----------- | --------------------------------------------- |
| View memories   | P2       | Implemented | List of all agent memory entries              |
| Add memory      | P2       | Implemented | Create new memory entry manually              |
| Edit memory     | P2       | Implemented | Modify existing memory content                |
| Delete memory   | P2       | Implemented | Remove memory entry (optimistic UI)           |
| Search memories | P2       | Implemented | Full-text search with server + local fallback |
| Sync memories   | P2       | Implemented | Manual sync between mobile and backend        |

### 3.1.7 Messaging Platform Integrations

| Feature                | Priority | Status      | Description                         |
| ---------------------- | -------- | ----------- | ----------------------------------- |
| WhatsApp integration   | P2       | Implemented | Connect/disconnect WhatsApp         |
| Telegram integration   | P2       | Implemented | Connect/disconnect Telegram         |
| Slack integration      | P2       | Implemented | Connect/disconnect Slack            |
| Platform stats         | P2       | Implemented | Messages sent/received per platform |
| Platform configuration | P2       | Implemented | Per-platform config settings        |

### 3.1.8 Settings & Account

| Feature                 | Priority | Status      | Description                         |
| ----------------------- | -------- | ----------- | ----------------------------------- |
| Auto-approve mode       | P1       | Implemented | Ask / Smart / Full auto-approve     |
| Haptic feedback toggle  | P2       | Implemented | Enable/disable haptic feedback      |
| Notification toggle     | P1       | Implemented | Enable/disable push notifications   |
| Voice features toggle   | P2       | Implemented | Enable/disable voice input          |
| Background fetch toggle | P2       | Implemented | Enable/disable background polling   |
| Sign out                | P0       | Implemented | Clear session and return to login   |
| Profile view            | P2       | Partial     | Display user email and account info |
| Subscription status     | P2       | Planned     | Show current subscription tier      |
| Connected desktop info  | P1       | Partial     | Show paired desktop details         |
| App version display     | P2       | Implemented | Show app version in settings        |
| Privacy policy link     | P0       | Planned     | Required for App Store              |
| Terms of service link   | P0       | Planned     | Required for App Store              |
| Delete account          | P1       | Planned     | GDPR/App Store requirement          |

### 3.1.9 Authentication

| Feature                    | Priority | Status      | Description                             |
| -------------------------- | -------- | ----------- | --------------------------------------- |
| Email/password sign in     | P0       | Implemented | Standard email authentication           |
| Email/password sign up     | P0       | Implemented | New account creation                    |
| Sign in with Apple         | P0       | Implemented | Apple ID OAuth (required for App Store) |
| Sign in with Google        | P1       | Implemented | Google OAuth                            |
| Session persistence        | P0       | Implemented | Secure token storage in iOS Keychain    |
| Auto session refresh       | P0       | Implemented | Background token refresh via Supabase   |
| Auth state change listener | P0       | Implemented | Real-time auth state updates            |
| PKCE auth flow             | P0       | Implemented | Secure code exchange flow               |
| Onboarding flow            | P1       | Implemented | 3-slide intro after first sign-up       |
| Face ID / Touch ID unlock  | P2       | Planned     | Biometric app lock                      |
| Magic link sign in         | P3       | Planned     | Passwordless email link auth            |

### 3.1.10 iOS-Exclusive Features (Planned)

| Feature                        | Priority | Status  | Description                                           |
| ------------------------------ | -------- | ------- | ----------------------------------------------------- |
| Dynamic Island agent indicator | P2       | Planned | Show running agent status in Dynamic Island (iOS 17+) |
| Home screen widgets            | P2       | Planned | Quick message widget, agent status widget             |
| Siri Shortcuts                 | P3       | Planned | Voice-activated AI queries                            |
| iOS Share Extension            | P3       | Planned | Share text/images from other apps to AGI Workforce    |
| Handoff support                | P3       | Planned | Continue conversation from Mac to iPhone              |
| Focus filters                  | P3       | Planned | Filter notifications by Focus mode                    |
| Lock Screen widgets            | P2       | Planned | Agent status on lock screen (iOS 16+)                 |
| App Intents                    | P3       | Planned | Spotlight search integration                          |

## 3.2 Platform-Exclusive Features

These features are exclusive to the mobile app and have no equivalent on desktop or web:

1. **QR Code Desktop Pairing** -- Scan a QR code displayed on the desktop app to establish a real-time companion connection. No other AGI Workforce surface can pair this way.

2. **Push Notification Approvals** -- Receive push notifications when agents need tool approval, even when the app is backgrounded or the phone is locked. Tap to approve/deny instantly.

3. **Background Agent Polling** -- iOS background fetch checks for pending approvals every 15 minutes, even when the app is not running. Triggers local notifications for urgent items.

4. **Voice Conversation Mode** -- Full-screen voice interface with push-to-talk, real-time metering visualization, and TTS response playback. Optimized for hands-free use while walking, driving, or multitasking.

5. **Dynamic Island Integration** (Planned) -- Shows a compact agent running indicator in the Dynamic Island on iPhone 14 Pro+ and iPhone 15+.

6. **Home Screen Widgets** (Planned) -- WidgetKit-based widgets for quick message composition or agent status at a glance.

7. **Siri Shortcuts** (Planned) -- Invoke AGI Workforce queries via Siri voice commands without opening the app.

## 3.3 Feature Parity Table vs. Competitors

| Feature                 | AGI Workforce iOS       | Claude iOS App               | ChatGPT iOS App        | Gemini iOS App   |
| ----------------------- | ----------------------- | ---------------------------- | ---------------------- | ---------------- |
| Chat with text          | Yes                     | Yes                          | Yes                    | Yes              |
| Streaming responses     | Yes                     | Yes                          | Yes                    | Yes              |
| Multi-model support     | Yes (9+ providers)      | No (Claude only)             | No (GPT only)          | No (Gemini only) |
| Thinking/reasoning      | Yes                     | Yes (Artifacts)              | Limited (o1)           | No               |
| Image input             | Yes                     | Yes                          | Yes                    | Yes              |
| Image generation        | Yes                     | No                           | Yes (DALL-E)           | Yes (Imagen)     |
| Voice input             | Yes                     | Yes                          | Yes                    | Yes              |
| Voice conversation mode | Yes                     | Yes                          | Yes                    | Yes              |
| Desktop agent pairing   | Yes (free)              | Remote Control ($100-200/mo) | No                     | No               |
| Remote tool approval    | Yes                     | No                           | No                     | No               |
| Agent monitoring        | Yes                     | No                           | No                     | No               |
| Push notifications      | Yes (agent-aware)       | Basic                        | Basic                  | Basic            |
| Background processing   | Yes (agent polling)     | No                           | No                     | No               |
| Conversation sync       | Yes (Supabase Realtime) | Yes (native)                 | Yes (native)           | Yes (native)     |
| Offline access          | Yes (MMKV cache)        | Limited                      | Limited                | No               |
| Scheduled tasks         | Yes                     | No                           | No                     | No               |
| Agent memory            | Yes                     | No (Projects)                | No (Memories)          | No               |
| Model switching         | Yes (in-chat)           | No                           | No                     | No               |
| Code execution          | No (desktop only)       | No                           | Yes (Code Interpreter) | Yes (limited)    |
| Web search              | Via desktop agent       | No                           | Yes (browsing)         | Yes (native)     |
| File upload             | Images only             | Yes                          | Yes                    | Yes              |
| Haptic feedback         | Yes                     | Limited                      | Limited                | Limited          |
| Dark mode               | Yes (default)           | Yes                          | Yes                    | Yes              |
| iPad support            | Yes (adaptive drawer)   | Yes                          | Yes                    | Yes              |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Design System Foundation

### 4.1.1 Color Palette

The iOS app uses a dark-mode-first design system that matches the desktop application:

```
Brand Colors:
  Terra Cotta:      #da7756  (accent, warm highlights)
  Teal:             #21808d  (primary actions, CTA buttons)
  Warm Peach:       #f5c1a9  (subtle warm accents)

Surface Colors:
  Background:       #0f0f0f  (root background)
  Surface Base:     #0f0f0f  (card backgrounds)
  Surface Elevated: #1a1a1a  (elevated cards, modals)
  Surface Overlay:  #242424  (overlays, hover states)
  Surface Hover:    #2e2e2e  (interactive hover)

Charcoal:
  900:              #1f2121  (sidebar background)
  800:              #2a2c2c  (input backgrounds)
  700:              #363838  (borders)

Text:
  Primary:          #f5f7fb  (headings, body text)
  Secondary:        rgba(245, 247, 251, 0.75)  (secondary labels)
  Muted:            rgba(245, 247, 251, 0.50)  (placeholders, hints)

Borders:
  Default:          rgba(255, 255, 255, 0.08)
  Light:            rgba(255, 255, 255, 0.06)

Agent Status:
  Thinking:         #a855f7  (purple, active reasoning)
  Active:           #3b82f6  (blue, running)
  Success:          #10b981  (green, completed)
  Error:            #ef4444  (red, failed)
  Warning:          #f59e0b  (amber, needs attention)

Risk Levels:
  Low:              #10b981  (emerald)
  Medium:           #f59e0b  (amber)
  High:             #ef4444  (red)
```

### 4.1.2 Typography

- **Headings**: System font (SF Pro), bold, sizes 24-32pt
- **Body text**: System font (SF Pro), regular, 16pt
- **Secondary text**: System font (SF Pro), regular, 14pt
- **Captions**: System font (SF Pro), regular, 12pt
- **Monospace**: SF Mono (code blocks, tool names)
- **Dynamic Type**: Fully supported -- all text scales with iOS accessibility settings

### 4.1.3 Spacing Scale

```
xs:   4pt
sm:   8pt
md:   12pt
lg:   16pt
xl:   20pt
2xl:  24pt
3xl:  32pt
4xl:  40pt
```

### 4.1.4 Border Radius Scale

```
sm:   6pt
md:   8pt
lg:   12pt
xl:   16pt
2xl:  24pt
3xl:  32pt
full: 9999pt (pill shapes)
```

### 4.1.5 Touch Targets

All interactive elements have a minimum touch target of **44x44pt** per Apple Human Interface Guidelines.

---

## 4.2 Splash Screen

### Purpose

First visual shown on app launch. Sets the brand tone and provides visual feedback while the app initializes.

### Layout

- Full-screen view with background color `#0f0f0f`
- Centered splash icon (`assets/splash-icon.png`)
- Splash icon uses `contain` resize mode to fit screen
- No text overlay -- icon-only for clean presentation
- Managed by `expo-splash-screen` for smooth transition to root layout

### Duration

- Shown until `isInitialized` becomes `true` in `authStore`
- After splash dismisses, shows `ActivityIndicator` with teal color if auth is still loading
- Maximum display: 3 seconds (Expo default `fallbackToCacheTimeout: 0`)

### Transition

- Fades out smoothly to either:
  - Login screen (no session)
  - Onboarding screen (first launch with session)
  - Home screen (returning user with session)

---

## 4.3 Onboarding Flow

### Purpose

Introduce new users to the three key value propositions of the app. Shown once after first sign-up, before the main app.

### Route

`/onboarding`

### Layout

Full-screen SafeAreaView with dark background (`#0f0f12`).

### Component Inventory

**Skip Button** (top-right corner):

- Label: "Skip"
- Color: `white/40` (40% opacity white)
- Size: 14pt
- Position: `absolute top-4 right-4`, padding 12pt
- Accessibility label: "Skip onboarding"
- Tap action: Set `onboarding-done` in MMKV, navigate to `/(app)`

**Slide Content** (centered, 80% width):

- Emoji icon: 80pt font size, centered
- Title: 30pt, bold, white, centered, margin-top 24pt
- Subtitle: 16pt, `white/50`, centered, margin-top 12pt, line-height 24pt

**Slides:**

| Slide | Emoji            | Title           | Subtitle                                                                  |
| ----- | ---------------- | --------------- | ------------------------------------------------------------------------- |
| 1     | (robot icon)     | "Your AI Agent" | "Chat with any AI model -- Claude, GPT-4, Gemini, and more."              |
| 2     | (lightning icon) | "Any Tool"      | "Search the web, run code, automate your desktop -- all from your phone." |
| 3     | (lock icon)      | "Full Control"  | "Approve or deny every agent action. Your AI, your rules."                |

**Progress Dots** (bottom, above CTA button):

- Horizontal row, centered, gap 8pt, padding-bottom 16pt
- Active dot: 24pt width, 8pt height, rounded-full, `bg-teal-400`
- Inactive dot: 8pt width, 8pt height, rounded-full, `bg-white/20`

**CTA Button** (bottom):

- Width: full minus 24pt horizontal margins
- Height: 56pt
- Background: `bg-teal-500`
- Border radius: 16pt (`rounded-2xl`)
- Label: "Next" (slides 1-2) / "Get Started" (slide 3)
- Label color: black, semibold, 16pt
- Active state: `opacity-90`
- Bottom margin: 32pt

### Interaction Flow

1. User sees Slide 1 on first launch
2. Tap "Next" to advance to Slide 2
3. Tap "Next" to advance to Slide 3
4. Tap "Get Started" to complete onboarding
5. `onboarding-done` key set to `"true"` in MMKV
6. Navigate to `/(app)` (home screen)
7. Onboarding never shown again (checked via MMKV key)

### State Variations

- **First launch**: Onboarding shown after successful sign-in/sign-up
- **Skip pressed**: Immediately exits to home screen, marks as done
- **App killed mid-onboarding**: Re-shown on next launch (key not yet set)

---

## 4.4 Login / Sign Up Screen

### Purpose

Authenticate the user via email/password or social OAuth (Apple, Google).

### Route

`/(auth)/login`

### Layout

SafeAreaView with KeyboardAvoidingView (behavior: `padding` on iOS). ScrollView for keyboard dismissal, `keyboardShouldPersistTaps="handled"`.

### Component Inventory

**Logo Block** (centered, top section):

- Logo container: 64x64pt, `rounded-2xl`, `bg-teal-500`, centered
- Logo text: "AG", 24pt bold, white
- App name: "AGI Workforce", heading variant, centered
- Tagline: "Your AI desktop agent, in your pocket.", 16pt, `white/50`, centered

**LoginForm Component:**

| Element        | Type              | Specification                                                                                              |
| -------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Email input    | TextInput         | Placeholder: "Email address", keyboardType: `email-address`, autoCapitalize: `none`, autoComplete: `email` |
| Password input | TextInput         | Placeholder: "Password", secureTextEntry: `true`, autoComplete: `password`                                 |
| Sign In button | Pressable         | Label: "Sign In", full width, `bg-teal-500`, 48pt height, `rounded-xl`                                     |
| Sign Up toggle | Text + Pressable  | "Don't have an account? Sign Up" -- toggles form between sign-in and sign-up modes                         |
| Error message  | Text              | Red (#ef4444), shown below inputs when auth fails, wraps to multiple lines                                 |
| Loading state  | ActivityIndicator | Replaces button text during auth request, teal color                                                       |

**Exact Error Messages:**

| Scenario                 | Message                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Invalid credentials      | "Invalid email or password. Please try again."                 |
| Email already registered | "An account with this email already exists."                   |
| Weak password            | "Password must be at least 8 characters."                      |
| Network error            | "Unable to connect. Please check your internet connection."    |
| Rate limited             | "Too many attempts. Please wait a moment before trying again." |
| Unknown error            | "Something went wrong. Please try again."                      |

**OAuthButtons Component:**

| Button              | Specification                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Divider             | Horizontal line with "or" text centered, `white/20` line color                                                                                                 |
| Sign in with Apple  | Apple-standard button style (dark background, Apple logo, "Sign in with Apple" text), full width, 48pt height, `rounded-xl`. Uses `expo-apple-authentication`. |
| Sign in with Google | White background, Google "G" logo, "Sign in with Google" text, full width, 48pt height, `rounded-xl`, `border border-white/10`                                 |

### Interaction Flow

1. User enters email and password
2. Tap "Sign In" (or "Sign Up" if toggled)
3. Button shows loading spinner
4. On success: `authStore` sets session, root layout navigates to onboarding (first time) or `/(app)` (returning)
5. On failure: Error message appears below inputs, button re-enables

### Navigation Paths

- **From**: App cold start (no session), sign out
- **To**: Onboarding (first sign-up), Home screen (returning user)

### State Variations

| State        | Behavior                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| Empty        | Email and password fields empty, Sign In button enabled                                      |
| Typing       | Keyboard raised, view scrolls to keep input visible                                          |
| Loading      | Button shows spinner, inputs disabled                                                        |
| Error        | Error message shown, inputs re-enabled                                                       |
| Sign Up mode | Button label changes to "Sign Up", toggle text changes to "Already have an account? Sign In" |

---

## 4.5 Home Screen (New Chat)

### Purpose

Primary entry point after authentication. Presents a clean, minimal interface with a chat input at the bottom. Intentionally blank -- matches the desktop's empty-state design philosophy.

### Route

`/(app)/index` (drawer index)

### Layout

SafeAreaView with dark background. Three vertical sections: minimal header, empty space, bottom chat input.

### Component Inventory

**Header Bar** (top, 48pt height):

- Hamburger menu button: `Menu` icon (lucide), 22pt, color `textSecondary`
  - Touch target: 44x44pt
  - Position: left-aligned, 16pt left padding, -8pt left margin
  - Accessibility label: "Open sidebar"
  - Accessibility role: "button"
  - Active state: `bg-white/5` with `rounded-lg`
  - Tap action: Toggle drawer via `DrawerActions.toggleDrawer()`

**Empty Space** (middle):

- Intentionally blank `View` with `flex: 1`
- No suggestions, no recent chats, no illustrations
- Design rationale: Focus attention on the input bar. Users who want history access the sidebar.

**ChatInput Component** (bottom):

| Element                | Type             | Specification                                                                                     |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Input container        | View             | `bg-charcoal-800`, `rounded-2xl`, horizontal padding 16pt, Safe Area bottom inset                 |
| Text input             | TextInput        | Placeholder: "Message...", multiline (max 6 lines), 16pt, `textPrimary` color, no border          |
| Model pill             | Pressable        | Shows current model name (e.g., "Auto (Balanced)"), teal border, 12pt font, left of input actions |
| Attachment button      | Pressable (icon) | `Paperclip` icon, 20pt, `textMuted` color, opens image picker                                     |
| Voice button           | Pressable (icon) | `Mic` icon, 20pt, `textMuted` color, opens voice mode overlay                                     |
| Send button            | Pressable (icon) | `ArrowUp` icon, 20pt, white on `bg-teal-500`, rounded-full, 36pt diameter                         |
| Send button (disabled) | Pressable (icon) | Same as above but `opacity-30`, disabled when input empty                                         |

**Model Pill Label Logic:**

| Model ID                | Display Label           |
| ----------------------- | ----------------------- |
| `auto-balanced`         | "Auto (Balanced)"       |
| `auto-economy`          | "Auto (Economy)"        |
| `auto-premium`          | "Auto (Premium)"        |
| `claude-3-5-sonnet-...` | "Claude 3.5 Sonnet"     |
| `gpt-4o`                | "GPT-4o"                |
| (other)                 | Model name from catalog |

**ModelPickerSheet Component** (bottom sheet, initially hidden):

- Trigger: Tap on model pill
- Sheet type: `@gorhom/bottom-sheet` with snap points at 50% and 90%
- Background: `surfaceElevated`
- Handle: 4pt height, 40pt width, `white/20`, centered, 8pt top margin
- Content: Scrollable list of models organized by provider

ModelPickerSheet sections:

- **Search bar**: TextInput at top, placeholder "Search models...", 40pt height
- **Provider tabs**: Horizontal ScrollView with provider pills (All, Anthropic, OpenAI, Google, Mistral, Local)
- **Favorites section**: "Favorites" header, star-filled icons, only shown if user has favorites
- **Recent section**: "Recent" header, clock icon, last 5 used models
- **All Models section**: Full model list filtered by selected provider tab

Model list item:

- Model name (16pt, bold, textPrimary)
- Provider name (12pt, textMuted)
- Tier badge: "Premium" (purple), "Balanced" (blue), "Economy" (green)
- Thinking badge: Brain icon, only if model supports thinking
- Vision badge: Eye icon, only if model supports vision
- Favorite toggle: Star icon (outline / filled), right-aligned
- Tap action: Select model, dismiss sheet

**VoiceConversationScreen Component** (full-screen overlay, initially hidden):

- Trigger: Tap on voice button in ChatInput
- Full-screen modal with dark overlay
- See Section 4.10 for detailed specification

### Interaction Flow

1. App launches, user sees empty screen with input bar
2. User taps hamburger to see sidebar with conversation history
3. User types a message in the input bar
4. User taps send (or presses return on hardware keyboard)
5. App creates a new conversation with first 40 chars of message as title
6. Navigates to `/(app)/chat/[conversationId]`
7. Message is sent via `streamChat()` with current model
8. Streaming response renders in the chat screen

### Navigation Paths

- **From**: Login (after auth), sidebar (tap "New Chat"), back from chat
- **To**: Chat screen (on message send), sidebar (hamburger tap), model picker (model pill tap), voice mode (mic tap)

### State Variations

| State             | Behavior                                            |
| ----------------- | --------------------------------------------------- |
| Empty (default)   | Blank screen with input bar, hamburger visible      |
| Keyboard open     | Input bar rises above keyboard, safe area respected |
| Model picker open | Bottom sheet overlays screen, backdrop dims         |
| Voice mode active | Full-screen voice overlay                           |
| Sending           | Input clears, navigates to new chat screen          |

---

## 4.6 Chat Screen

### Purpose

The primary conversation interface. Displays message history with streaming support, thinking/reasoning blocks, tool call status, and a bottom input bar.

### Route

`/(app)/chat/[id]`

### Layout

SafeAreaView with three sections: header bar, message list (scrollable), and bottom input bar.

### Component Inventory

**Header Bar** (top, 48pt height):

| Element            | Type      | Specification                                                |
| ------------------ | --------- | ------------------------------------------------------------ |
| Back button        | Pressable | `ChevronLeft` icon, 24pt, `textSecondary`, navigates back    |
| Conversation title | Text      | 16pt, semibold, `textPrimary`, centered, truncated to 1 line |
| Model indicator    | Text      | 12pt, `textMuted`, below title, shows current model name     |
| Options button     | Pressable | `MoreHorizontal` icon, 20pt, `textSecondary`, right-aligned  |

**Options Menu** (action sheet or bottom sheet):

- "Rename Conversation" -- opens inline text edit
- "Delete Conversation" -- confirmation dialog, then deletes
- "Clear Messages" -- confirmation dialog, then clears
- "Share Conversation" -- share sheet with text export

**Message List** (FlashList):

- Background: `surfaceBase`
- Item type: `ChatMessage`
- Inverted: No (messages flow top-to-bottom, auto-scroll to bottom)
- Estimated item size: 120pt (for FlashList optimization)
- Content padding: bottom 16pt (space above input bar)
- Pull-to-refresh: Reloads messages from API
- Keyboard dismiss mode: `on-drag` (dismiss keyboard when scrolling)

**User Message Bubble:**

| Element    | Specification                                                               |
| ---------- | --------------------------------------------------------------------------- |
| Container  | Right-aligned, max-width 80%, `bg-teal-500/10`, `rounded-2xl`, padding 12pt |
| Text       | 16pt, `textPrimary`, selectable                                             |
| Timestamp  | 12pt, `textMuted`, right-aligned below content                              |
| Long press | Copy menu (native copy action sheet)                                        |

**Assistant Message Bubble:**

| Element             | Specification                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Container           | Left-aligned, max-width 90%, no background (transparent), padding 12pt                      |
| Avatar              | 28pt circle, `bg-surfaceOverlay`, model provider icon                                       |
| Model label         | 12pt, `textMuted`, above message content                                                    |
| Text                | 16pt, `textPrimary`, selectable, markdown rendered                                          |
| Code blocks         | `bg-charcoal-900`, monospace font, `rounded-lg`, padding 12pt, horizontal scroll            |
| Thinking block      | Collapsible, `bg-purple-500/5`, border-left 2pt `agentThinking`, italic label "Thinking..." |
| Reasoning content   | 14pt, `textMuted`, italic, inside thinking block                                            |
| Streaming indicator | Blinking cursor after last token, teal color                                                |
| Timestamp           | 12pt, `textMuted`, left-aligned below content                                               |
| Citations           | Pill-shaped links below content, `bg-surfaceOverlay`, tap to open URL                       |

**Thinking Block States:**

| State                                 | Display                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Streaming thinking                    | Expanded, purple left border, italic "Thinking..." label, content streaming |
| Thinking complete, response streaming | Collapsed by default, "Thought for X seconds" label, tap to expand          |
| All complete                          | Collapsed, "Thought for X seconds" label                                    |

**Tool Call Display:**

| Element        | Specification                                                        |
| -------------- | -------------------------------------------------------------------- |
| Container      | `bg-surfaceElevated`, `rounded-lg`, padding 8pt, margin-vertical 4pt |
| Tool icon      | 16pt, based on tool type (Terminal, FileText, Globe, etc.)           |
| Tool name      | 14pt, semibold, `textPrimary`                                        |
| Status badge   | Running (blue spinner), Completed (green check), Failed (red X)      |
| Duration       | 12pt, `textMuted`, "2.3s" format                                     |
| Output preview | 12pt, `textMuted`, truncated to 2 lines, expandable                  |

**Approval Request Card:**

| Element         | Specification                                                                      |
| --------------- | ---------------------------------------------------------------------------------- |
| Container       | `bg-surfaceElevated`, `rounded-xl`, border based on risk level, padding 16pt       |
| Header          | Tool name (16pt, bold) + risk badge (colored pill: green/amber/red)                |
| Description     | 14pt, `textSecondary`, 2-3 line description of what the tool wants to do           |
| Type label      | 12pt, `textMuted`, e.g., "File Deletion", "Command Execution"                      |
| Approve button  | `bg-agentSuccess`, white text, "Approve", 44pt height, `rounded-xl`                |
| Deny button     | `bg-transparent`, border `agentError`, red text, "Deny", 44pt height, `rounded-xl` |
| Countdown       | 12pt, `textMuted`, "Auto-denies in Xs" if countdown is set                         |
| Haptic feedback | Medium impact on approve, light impact on deny                                     |

**Image Generation Display:**

| State      | Display                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| Pending    | Placeholder with `bg-surfaceElevated`, "Generating image..." text, spinner |
| Generating | Progress bar (0-100%), estimated time remaining                            |
| Completed  | Full-width image with `rounded-xl`, tap to open full-screen                |
| Failed     | Error message in red, "Retry" button                                       |

**ChatInput Component** (bottom, same as home screen):

- Identical to home screen ChatInput (Section 4.5)
- Additional: Stop button appears when `isStreaming` is true
  - Stop button: `Square` icon, 16pt, red background, replaces send button
  - Tap action: Calls `stopStreaming()` on chat store

### Interaction Flow

1. User arrives from home screen (new conversation) or sidebar (existing conversation)
2. Messages load from MMKV cache immediately, then refresh from API
3. User types message, taps send
4. User message bubble appears immediately (optimistic)
5. Assistant placeholder bubble appears with streaming indicator
6. Tokens stream in via SSE, content updates in real-time
7. Thinking content renders in collapsible block if model supports thinking
8. Tool calls appear inline as they execute
9. Approval requests render with approve/deny buttons
10. On stream completion, streaming indicator disappears

### Navigation Paths

- **From**: Home screen (new chat), sidebar (existing chat), notification tap
- **To**: Home screen (back), sidebar (hamburger), model picker (model pill)

### State Variations

| State              | Behavior                                                       |
| ------------------ | -------------------------------------------------------------- |
| Loading messages   | Centered spinner, `textMuted` "Loading messages..."            |
| Empty conversation | Just the input bar, no messages                                |
| Messages loaded    | Message list with proper grouping                              |
| Streaming          | Assistant message growing, stop button visible                 |
| Error              | Error banner at top: "Failed to load messages. Pull to retry." |
| Offline            | Shows cached messages, input disabled with "Offline" label     |
| Keyboard open      | Message list scrolls up, input bar above keyboard              |

---

## 4.7 Sidebar (Drawer)

### Purpose

Navigation hub and conversation history. Slides in from the left on iPhone, permanently visible on iPad.

### Route

Drawer component wrapping `/(app)` layout

### Layout

| Device | Drawer type                | Width | Behavior                                      |
| ------ | -------------------------- | ----- | --------------------------------------------- |
| iPhone | `front` (overlay)          | 280pt | Swipe from left edge or hamburger tap to open |
| iPad   | `permanent` (side-by-side) | 300pt | Always visible, no overlay                    |

Background: `#131514`
Border right: 1pt, `rgba(255, 255, 255, 0.08)`
Overlay color (iPhone): `rgba(0, 0, 0, 0.5)`

### Component Inventory

**SidebarContent Component:**

**Header Section:**

| Element         | Specification                                                                   |
| --------------- | ------------------------------------------------------------------------------- |
| App logo        | 32pt circle, `bg-teal-500`, "AG" text                                           |
| App name        | "AGI Workforce", 18pt, bold, `textPrimary`                                      |
| Version         | "v0.1.0", 12pt, `textMuted`                                                     |
| New chat button | `Plus` icon, 20pt, `textSecondary`, right-aligned, tap creates new conversation |

**Navigation Items** (vertical list):

| Item      | Icon                | Label       | Route              |
| --------- | ------------------- | ----------- | ------------------ |
| New Chat  | `MessageSquarePlus` | "New Chat"  | `/(app)` (index)   |
| Agents    | `Bot`               | "Agents"    | `/(app)/agents`    |
| Desktop   | `Smartphone`        | "Desktop"   | `/(app)/companion` |
| Messaging | `MessageCircle`     | "Messaging" | `/(app)/messaging` |
| Schedules | `Calendar`          | "Schedules" | `/(app)/schedules` |
| Settings  | `Settings`          | "Settings"  | `/(app)/settings`  |

Navigation item style:

- Height: 44pt
- Horizontal padding: 16pt
- Icon size: 20pt
- Label: 16pt, `textSecondary` (inactive), `textPrimary` (active)
- Background: transparent (inactive), `white/5` (active)
- Border radius: 8pt
- Left accent: 3pt `bg-teal-500` bar on active item

**Conversation List** (below navigation, scrollable):

Section headers (grouped by time):

- "Today", "Yesterday", "This Week", "Older"
- 12pt, uppercase, `textMuted`, padding 12pt horizontal, 8pt vertical

Conversation item:

- Title: 14pt, `textPrimary`, truncated to 1 line, max-width minus 40pt
- Last message preview: 12pt, `textMuted`, truncated to 1 line
- Timestamp: 12pt, `textMuted`, right-aligned ("2:30 PM", "Yesterday", "Mar 5")
- Swipe left: Delete action (red background, trash icon)
- Tap action: Navigate to `/(app)/chat/[id]`, set as current conversation
- Long press: Context menu with "Rename", "Delete", "Pin"

**Connection Status Indicator** (bottom of sidebar):

| State      | Display                                                           |
| ---------- | ----------------------------------------------------------------- |
| Not paired | "Not connected to desktop" in `textMuted`, `Smartphone` icon gray |
| Connecting | "Connecting..." in `agentWarning`, pulsing dot                    |
| Connected  | "Connected to [Desktop Name]" in `agentSuccess`, green dot        |
| Error      | Error message in `agentError`, tap to view details                |

### Time Grouping Logic

```
age = startOfToday - message.updatedAt (ms)
age < 0                    -> Today (updated since midnight)
age < 24 * 60 * 60 * 1000 -> Yesterday
age < 7 * 24 * 60 * 60 * 1000 -> This Week
else                       -> Older
```

### State Variations

| State                | Behavior                                               |
| -------------------- | ------------------------------------------------------ |
| No conversations     | Empty state: "No conversations yet. Start a new chat." |
| Loading              | Skeleton loaders for conversation items                |
| Offline              | Shows cached conversations, "Offline" badge at top     |
| Connected to desktop | Green status indicator at bottom                       |

---

## 4.8 Agent Control Screen (Desktop Companion)

### Purpose

The **killer feature** -- live dashboard showing all agents running on the paired desktop. Provides remote approval, monitoring, and lifecycle control.

### Route

`/(app)/companion` (also `/(app)/companion/index`)

### Layout

Full-screen SafeAreaView with three sections: connection header, agent list, and connection panel.

### Component Inventory

**Connection Header** (when connected):

| Element           | Specification                                                                     |
| ----------------- | --------------------------------------------------------------------------------- |
| Status dot        | 8pt circle, `agentSuccess` green, pulsing animation                               |
| Desktop name      | 16pt, bold, `textPrimary`, e.g., "Sid's MacBook Pro"                              |
| Platform/version  | 12pt, `textMuted`, e.g., "macOS 15.3 -- AGI Workforce v1.1.5"                     |
| Disconnect button | `X` icon, 20pt, `textMuted`, right-aligned, confirmation dialog before disconnect |
| Session timer     | 12pt, `textMuted`, shows how long the session has been active                     |

**QR Pairing Panel** (when disconnected):

| Element        | Specification                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Illustration   | `Smartphone` + `Monitor` icons with connecting line, 64pt, `textMuted`                                                                        |
| Title          | "Connect to Desktop", 24pt, bold, `textPrimary`, centered                                                                                     |
| Instructions   | "Open AGI Workforce on your desktop and scan the QR code, or enter the pairing code below.", 14pt, `textSecondary`, centered, max-width 300pt |
| Scan QR button | Full width, `bg-teal-500`, "Scan QR Code", 48pt height, `rounded-xl`, `Camera` icon left                                                      |
| Divider        | "or enter code manually" in `textMuted`, horizontal lines                                                                                     |
| Code input     | 6-12 character TextInput, centered, monospace font, 24pt, letter-spacing 4pt, `bg-charcoal-800`, `rounded-xl`, 56pt height                    |
| Connect button | Full width, `bg-teal-500`, "Connect", 48pt height, `rounded-xl`                                                                               |
| Error message  | Red text below input, e.g., "Invalid pairing code. Please try again."                                                                         |

**QR Scanner** (modal, opens from "Scan QR Code" button):

- Full-screen camera view via `expo-camera`
- Viewfinder overlay: Rounded square cutout with animated border
- Instructions text: "Point your camera at the QR code on your desktop", 14pt, white, bottom-center
- Cancel button: "Cancel", top-right, white text
- Auto-closes on successful scan
- Haptic feedback: Success notification on valid QR scan
- Validation: `isValidPairingCode()` checks `agiw:` prefix or raw alphanumeric

**Agent List** (when connected, scrollable):

Section: "Running Agents (N)"

Agent card:

| Element             | Specification                                                                         |
| ------------------- | ------------------------------------------------------------------------------------- |
| Container           | `bg-surfaceElevated`, `rounded-xl`, padding 16pt, margin-bottom 12pt                  |
| Agent name          | 16pt, bold, `textPrimary`                                                             |
| Model badge         | 12pt, `textMuted`, pill shape, model name (e.g., "Claude 3.5 Sonnet")                 |
| Status indicator    | Colored dot + label: Running (blue), Completed (green), Failed (red), Waiting (amber) |
| Current step        | 14pt, `textSecondary`, e.g., "Reading file: /src/index.ts"                            |
| Progress bar        | Full width, 4pt height, `bg-charcoal-700` track, colored fill based on status         |
| Progress percentage | 12pt, `textMuted`, right of progress bar, e.g., "67%"                                 |
| Time elapsed        | 12pt, `textMuted`, e.g., "Started 5 min ago"                                          |

Agent card expanded (tap to expand):

| Element         | Specification                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Steps list      | Vertical list of StatusStep items                                                                             |
| Step item       | Icon (16pt) + message (14pt) + status badge, vertical timeline connector                                      |
| Step icons      | Thinking (brain), Searching (magnifying glass), Coding (code), Command (terminal), Success (check), Error (x) |
| Tool calls list | List of executed tool calls with name, duration, output preview                                               |
| Action buttons  | Row of 3 buttons: Pause (yellow), Resume (green, hidden when running), Cancel (red)                           |

Agent action buttons:

| Button | Label    | Color             | Icon    | Action                                                  |
| ------ | -------- | ----------------- | ------- | ------------------------------------------------------- |
| Pause  | "Pause"  | `bg-agentWarning` | `Pause` | Sends `agent_command` with `pause`                      |
| Resume | "Resume" | `bg-agentSuccess` | `Play`  | Sends `agent_command` with `resume`                     |
| Cancel | "Cancel" | `bg-agentError`   | `X`     | Confirmation dialog, then `agent_command` with `cancel` |

Section: "Pending Approvals (N)"

Approval request card:

| Element         | Specification                                                                           |
| --------------- | --------------------------------------------------------------------------------------- |
| Container       | `bg-surfaceElevated`, border-left 3pt colored by risk level, `rounded-xl`, padding 16pt |
| Agent name      | 12pt, `textMuted`, "Agent: Research Assistant"                                          |
| Tool name       | 16pt, bold, `textPrimary`, e.g., "delete_file"                                          |
| Description     | 14pt, `textSecondary`, e.g., "Delete /tmp/output.csv"                                   |
| Risk badge      | Pill: "Low Risk" (green), "Medium Risk" (amber), "High Risk" (red)                      |
| Type badge      | Pill: "File Delete", "Command", "API Call", "Data Modification"                         |
| Approve button  | `bg-agentSuccess`, white "Approve" text, left half of button row                        |
| Deny button     | `bg-transparent`, border `agentError`, red "Deny" text, right half                      |
| Haptic feedback | Medium impact on approve, notification on deny                                          |

Section: "Completed Agents"

| Element        | Specification                                                    |
| -------------- | ---------------------------------------------------------------- |
| Clear button   | "Clear Completed", `textMuted`, right-aligned in section header  |
| Completed card | Same as agent card but collapsed, green status, final step shown |

### QR Pairing Protocol (Detailed)

**Step-by-step flow:**

1. **Desktop generates QR**: Desktop app generates a random 6-12 character alphanumeric code and displays it as a QR code in the companion settings. The QR encodes the string `agiw:XXXXXXXX`.

2. **Mobile scans QR**: User taps "Scan QR Code" on mobile. Camera opens with viewfinder. On successful scan, the QR string is validated via `isValidPairingCode()`.

3. **Mobile connects to signaling server**: Mobile creates a `SignalingClient` connecting to `wss://signaling.agiworkforce.com` with:
   - `code`: extracted pairing code
   - `role`: `"mobile"`
   - `metadata`: `{ deviceType: "mobile", app: "agiworkforce-mobile", version: "0.1.0" }`
   - `heartbeatIntervalMs`: 25000 (25 seconds)

4. **Signaling server registers mobile**: Server sends `registered` event with:
   - `expiresAt`: session expiry timestamp
   - `peerConnected`: boolean (whether desktop is already connected)

5. **Desktop receives `peer_ready`**: When both sides are registered, signaling server sends `peer_ready` to each with the other's metadata.

6. **Mobile receives `peer_ready`**: Mobile sets status to `connected`, stores desktop metadata (device name, platform, version, OS).

7. **WebRTC setup**: Mobile creates `RTCPeerConnection` with STUN servers (`stun.l.google.com:19302`). ICE candidates are exchanged via signaling. If WebRTC succeeds, a `DataChannel` is opened for low-latency control messages.

8. **Fallback**: If WebRTC fails (NAT/firewall), all control messages relay through the signaling server WebSocket. The user experience is identical -- only latency differs.

9. **Control messages flow**: Desktop sends `agents_update` (full refresh), `agent_update` (patch), `agent_removed` messages. Mobile sends `approval_response`, `agent_command`, `request_agents`, `ping` messages.

10. **Session expiry**: If the session expires, mobile shows "Pairing session expired. Please scan a new QR code." and returns to the pairing panel.

11. **Disconnect**: Either side can disconnect. On disconnect, agents list is cleared, status returns to `disconnected`.

**Deep link pairing**: The URL scheme `agiworkforce://pair/CODE` or `agiworkforce://pair?code=CODE` triggers automatic pairing. Handled in the root layout's `useURL` hook. If the app is not running, it launches and navigates to the companion screen with the pairing code pre-filled.

### Interaction Flow

1. User opens companion screen from sidebar
2. If not paired: sees QR pairing panel
3. Taps "Scan QR Code", camera opens
4. Points camera at desktop QR, code auto-detected
5. Haptic success feedback, camera closes
6. "Connecting..." status shown
7. Within 2-5 seconds: connected, desktop name shown
8. Agent list populates with running agents
9. User can tap agent for details, approve/deny requests
10. Notifications continue arriving even when app is backgrounded

### State Variations

| State                      | Behavior                                           |
| -------------------------- | -------------------------------------------------- |
| Disconnected               | QR pairing panel shown                             |
| Connecting                 | Spinner + "Connecting..." text, pairing code shown |
| Connected (no agents)      | Connected header + "No agents running" empty state |
| Connected (agents running) | Agent list with cards and approval requests        |
| Connection error           | Red error message, "Try Again" button              |
| Session expired            | Warning banner, "Scan New QR" button               |
| Deep link arrival          | Auto-fills pairing code, auto-connects             |

### Error Messages

| Error Code          | User-Facing Message                                          |
| ------------------- | ------------------------------------------------------------ |
| `connection_error`  | "Unable to reach the pairing server. Check your connection." |
| `connection_closed` | "Connection to pairing server lost."                         |
| `invalid_code`      | "Invalid pairing code. Please try again."                    |
| `session_full`      | "This pairing session already has two devices connected."    |
| `rate_limited`      | "Too many attempts. Please wait a moment."                   |
| (unknown)           | "An unexpected error occurred."                              |

---

## 4.9 Agent List Screen

### Purpose

Dedicated view for browsing all agents synced from the desktop companion, with filtering and detail views.

### Route

`/(app)/agents` (also `/(app)/agents/index`)

### Layout

SafeAreaView with header, filter tabs, and scrollable agent list.

### Component Inventory

**Header:**

| Element        | Specification                                                        |
| -------------- | -------------------------------------------------------------------- |
| Title          | "Agents", 24pt, bold, `textPrimary`                                  |
| Hamburger      | `Menu` icon, left-aligned, opens drawer                              |
| Refresh button | `RefreshCw` icon, right-aligned, requests agent refresh from desktop |

**Filter Tabs** (horizontal ScrollView):

| Tab       | Label           | Filter                   |
| --------- | --------------- | ------------------------ |
| All       | "All (N)"       | No filter                |
| Running   | "Running (N)"   | `status === 'running'`   |
| Waiting   | "Waiting (N)"   | `status === 'waiting'`   |
| Completed | "Completed (N)" | `status === 'completed'` |
| Failed    | "Failed (N)"    | `status === 'failed'`    |

Tab style:

- Inactive: `bg-charcoal-800`, `textSecondary`
- Active: `bg-teal-500/10`, `teal` text, `teal` bottom border
- Height: 36pt
- Border radius: 18pt (pill)
- Horizontal gap: 8pt

**Agent Cards** (same as companion screen, see Section 4.8)

### Empty States

| Condition            | Message                                                             |
| -------------------- | ------------------------------------------------------------------- |
| Not connected        | "Connect to your desktop to see running agents." + "Connect" button |
| Connected, no agents | "No agents running. Start an agent from your desktop."              |
| No agents in filter  | "No [running/waiting/completed/failed] agents."                     |

---

## 4.10 Voice Input Screen

### Purpose

Full-screen voice interaction interface. Supports push-to-talk recording with real-time audio metering, transcription via Whisper or Deepgram, and TTS response playback.

### Route

Modal overlay on home screen or chat screen (not a separate route)

### Layout

Full-screen overlay with dark semi-transparent background, centered voice interface.

### Component Inventory

**VoiceConversationScreen Component:**

**Background:**

- Full-screen absolute positioned view
- Background: `rgba(0, 0, 0, 0.95)`
- Animated fade-in on appear

**Close Button** (top-right):

- `X` icon, 24pt, white
- Touch target: 44x44pt
- Tap: Close voice mode, stop any recording

**Status Indicator** (centered, upper third):

- Current state text: "Ready", "Listening...", "Transcribing...", "Speaking..."
- Text: 18pt, `textSecondary`, centered
- Pulsing animation on active states

**Audio Metering Visualization** (centered):

- Circular waveform or bar visualization
- Responds to `metering` values from `expo-av` recording status
- Update frequency: ~15fps
- Metering range: -160dB (silence) to 0dB (maximum)
- Visual range: 60pt (silent) to 160pt diameter (loud)
- Color: `teal` gradient

**Record Button** (centered, lower third):

- Size: 80pt diameter circle
- Default state: `bg-teal-500`, `Mic` icon 32pt white
- Recording state: `bg-agentError` (red), pulsing scale animation, `Square` icon (stop)
- Touch behavior: Tap to start, tap again to stop (not hold-to-record for accessibility)
- Haptic feedback: Heavy impact on start, medium on stop

**Duration Display** (below record button):

- Format: "0:00" / "1:23"
- 14pt, `textMuted`
- Updates every second during recording

**Transcript Display** (below duration):

- Shows transcribed text after recording stops
- 16pt, `textPrimary`, centered, max 3 lines
- "Send" button appears after transcription completes

**Response Display** (when assistant responds):

- Text area showing response
- TTS playback controls: Play / Pause / Stop
- TTS speed: 1.0x default, adjustable

### Recording Flow

1. User taps record button -- haptic feedback, button turns red
2. `startRecording()` called, audio metering begins
3. Waveform visualization responds to voice
4. User taps stop -- haptic feedback, button returns to teal
5. `stopRecording()` returns file URI
6. "Transcribing..." status shown
7. `transcribe(uri)` sends audio to Whisper endpoint (or `transcribeWithDeepgram()` if API key available)
8. Transcribed text displayed
9. User taps "Send" to send as message
10. Response streams in, TTS speaks it aloud

### Recording Configuration

```
iOS Audio Settings:
  Output format: MPEG4AAC (.m4a)
  Audio quality: HIGH
  Sample rate: 44100 Hz
  Channels: 1 (mono)
  Bit rate: 128000
  Linear PCM: 16-bit, little-endian, not float
  Recording mode: allowsRecordingIOS = true, playsInSilentModeIOS = true
```

### State Variations

| State             | Display                                                 |
| ----------------- | ------------------------------------------------------- |
| Ready             | Teal record button, "Tap to record" hint                |
| Permission denied | Warning: "Microphone access required", link to Settings |
| Recording         | Red pulsing button, waveform active, duration counting  |
| Transcribing      | Spinner, "Transcribing..." text                         |
| Transcript ready  | Transcribed text + "Send" button                        |
| TTS playing       | Response text + playback controls                       |
| Error             | Red error text: "Recording failed. Please try again."   |

---

## 4.11 Settings Screen

### Purpose

App configuration, account management, connected desktop info, and legal links.

### Route

`/(app)/settings` (also `/(app)/settings/index`)

### Layout

SafeAreaView with scrollable settings sections.

### Component Inventory

**Header:**

- Title: "Settings", 24pt, bold, `textPrimary`
- Hamburger: `Menu` icon, opens drawer

**Account Section:**

| Element            | Specification                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Section header     | "Account", 12pt, uppercase, `textMuted`                                                  |
| User email         | 16pt, `textPrimary`, e.g., "user@example.com"                                            |
| Subscription badge | Pill: "Free" (gray), "Hobby" (blue), "Pro" (teal), "Max" (purple), "Enterprise" (gold)   |
| Sign out button    | "Sign Out", 16pt, `agentError` red, full width, `bg-surfaceElevated`, 48pt, `rounded-xl` |

**Desktop Connection Section:**

| Element                   | Specification                                                         |
| ------------------------- | --------------------------------------------------------------------- |
| Section header            | "Desktop Connection", 12pt, uppercase, `textMuted`                    |
| Status row                | Green/gray dot + "Connected to [name]" or "Not connected"             |
| Desktop details           | Platform, version, OS (when connected)                                |
| Disconnect/Connect button | "Disconnect" (red) or "Connect" (teal), navigates to companion screen |

**Agent Preferences Section:**

| Setting                  | Type              | Default  | Description                                                                  |
| ------------------------ | ----------------- | -------- | ---------------------------------------------------------------------------- |
| Auto-approve mode        | Segmented control | "Ask"    | Options: "Ask", "Smart", "Full"                                              |
| Auto-approve description | Text              | (varies) | "Ask: Always prompt" / "Smart: Auto-approve low risk" / "Full: Never prompt" |

**App Preferences Section:**

| Setting            | Type          | Default | Description                             |
| ------------------ | ------------- | ------- | --------------------------------------- |
| Haptic feedback    | Toggle switch | On      | Enable/disable haptic feedback          |
| Push notifications | Toggle switch | On      | Enable/disable push notifications       |
| Voice features     | Toggle switch | On      | Enable/disable voice input              |
| Background fetch   | Toggle switch | On      | Enable/disable background agent polling |

Toggle switch style:

- Teal when on, gray when off
- iOS-native `Switch` component
- Right-aligned in setting row

**Memory Section:**

| Element           | Specification                                                         |
| ----------------- | --------------------------------------------------------------------- |
| Memory management | "Manage Memories", right arrow, navigates to `/(app)/settings/memory` |
| Memory count      | "N memories stored", 12pt, `textMuted`                                |

**Legal Section:**

| Link             | Destination                                                |
| ---------------- | ---------------------------------------------------------- |
| Privacy Policy   | Opens in-app browser to `https://agiworkforce.com/privacy` |
| Terms of Service | Opens in-app browser to `https://agiworkforce.com/terms`   |
| Licenses         | Opens in-app browser or native view listing OSS licenses   |

**App Info Section:**

| Element      | Specification                      |
| ------------ | ---------------------------------- |
| App version  | "Version 0.1.0", 12pt, `textMuted` |
| Build number | "Build 1", 12pt, `textMuted`       |

**Danger Zone:**

| Element          | Specification                                                                    |
| ---------------- | -------------------------------------------------------------------------------- |
| Delete Account   | Red text, confirmation dialog: "Are you sure? This action cannot be undone."     |
| Clear Local Data | Orange text, confirmation dialog: "Clear all cached conversations and settings?" |

### Settings Memory Subscreen

### Route

`/(app)/settings/memory`

### Component Inventory

| Element      | Specification                                                                |
| ------------ | ---------------------------------------------------------------------------- |
| Search bar   | TextInput, placeholder "Search memories...", `bg-charcoal-800`, `rounded-xl` |
| Sync button  | `RefreshCw` icon, right-aligned in header, triggers `syncMemories()`         |
| Last synced  | "Last synced: 2 hours ago", 12pt, `textMuted`                                |
| Memory list  | FlashList of memory entries                                                  |
| Memory entry | Content text (14pt), category badge, created date, swipe-left to delete      |
| Add button   | FAB (floating action button), `bg-teal-500`, `Plus` icon, bottom-right       |
| Add modal    | Bottom sheet with TextInput and "Add Memory" button                          |
| Empty state  | "No memories yet. AI will remember things from your conversations."          |

---

## 4.12 Schedules Screen

### Purpose

View and manage recurring agent tasks scheduled on the backend.

### Route

`/(app)/schedules` (also `/(app)/schedules/index`)

### Layout

SafeAreaView with header, schedule list, and floating add button.

### Component Inventory

**Header:**

- Title: "Schedules", 24pt, bold, `textPrimary`
- Hamburger: `Menu` icon, opens drawer

**Schedule List** (FlashList):

Schedule card:

| Element         | Specification                                                                 |
| --------------- | ----------------------------------------------------------------------------- |
| Container       | `bg-surfaceElevated`, `rounded-xl`, padding 16pt, margin-bottom 12pt          |
| Name            | 16pt, bold, `textPrimary`                                                     |
| Prompt preview  | 14pt, `textSecondary`, truncated to 2 lines                                   |
| Model badge     | 12pt, pill, model name                                                        |
| Recurrence      | 12pt, `textMuted`, e.g., "Daily at 9:00 AM", "Every Monday", "Once on Mar 15" |
| Next run        | 12pt, `textMuted`, "Next: in 2 hours" or "Next: Tomorrow 9:00 AM"             |
| Last run status | Green dot + "Success" / Red dot + "Failed" / Gray dot + "Pending"             |
| Active toggle   | Toggle switch, right-aligned, teal when active                                |
| Swipe left      | Delete action (red background, trash icon, confirmation dialog)               |
| Tap             | Expand to show run history + edit button                                      |

**Empty State:**

- Illustration: `Calendar` icon, 64pt, `textMuted`
- Text: "No scheduled tasks yet."
- Subtext: "Create a schedule to run AI tasks automatically."
- CTA button: "Create Schedule", `bg-teal-500`

**FAB (Floating Action Button):**

- Position: bottom-right, 16pt from edges, above safe area
- Size: 56pt diameter
- Background: `bg-teal-500`
- Icon: `Plus`, 24pt, white
- Shadow: 0 4pt 12pt `rgba(0,0,0,0.3)`
- Tap: Navigate to `/(app)/schedules/create`

### Create Schedule Screen

### Route

`/(app)/schedules/create`

### Component Inventory

| Element           | Type                      | Specification                                               |
| ----------------- | ------------------------- | ----------------------------------------------------------- |
| Name input        | TextInput                 | Placeholder: "Schedule name", 16pt                          |
| Prompt input      | TextInput (multiline)     | Placeholder: "What should the AI do?", max 6 lines          |
| Model picker      | Pressable                 | Shows current model, opens model picker sheet               |
| Recurrence picker | Segmented                 | "Once", "Daily", "Weekly", "Monthly", "Custom"              |
| Time picker       | Native iOS DateTimePicker | Time selection for scheduled execution                      |
| Days of week      | Chip group                | Mon-Sun chips, visible when "Weekly" selected               |
| Day of month      | Picker                    | 1-31, visible when "Monthly" selected                       |
| Cron input        | TextInput                 | Visible when "Custom" selected, placeholder "0 9 \* \* 1-5" |
| Timezone          | Picker                    | Pre-filled with device timezone                             |
| Save button       | Pressable                 | "Create Schedule", full width, `bg-teal-500`, 48pt          |
| Cancel button     | Text                      | "Cancel", `textMuted`, in header                            |

---

## 4.13 Messaging Screen

### Purpose

Manage integrations with messaging platforms (WhatsApp, Telegram, Slack) that bridge AI interactions.

### Route

`/(app)/messaging` (also `/(app)/messaging/index`)

### Layout

SafeAreaView with header and platform cards.

### Component Inventory

**Header:**

- Title: "Messaging", 24pt, bold, `textPrimary`
- Hamburger: `Menu` icon, opens drawer

**Platform Card:**

| Element                   | Specification                                                        |
| ------------------------- | -------------------------------------------------------------------- | ------------ | --------------------------------------- |
| Container                 | `bg-surfaceElevated`, `rounded-xl`, padding 16pt, margin-bottom 12pt |
| Platform icon             | 32pt, platform-specific (WhatsApp green, Telegram blue, Slack)       |
| Platform name             | 16pt, bold, `textPrimary`                                            |
| Status                    | "Connected" (green) / "Not connected" (gray)                         |
| Connected date            | 12pt, `textMuted`, "Connected Mar 5, 2026"                           |
| Stats row                 | "Sent: 42                                                            | Received: 38 | Last active: 2h ago", 12pt, `textMuted` |
| Connect/Disconnect button | "Connect" (teal) / "Disconnect" (red), right-aligned                 |
| Config section            | Expandable, shows platform-specific config fields                    |

**Platforms:**

| Platform | ID         | Config Fields                     |
| -------- | ---------- | --------------------------------- |
| WhatsApp | `whatsapp` | Phone number, webhook URL         |
| Telegram | `telegram` | Bot token, chat ID                |
| Slack    | `slack`    | Workspace URL, bot token, channel |

### Empty State (no platforms connected):

- Text: "Connect a messaging platform to interact with AI through your favorite apps."
- Each platform card shows "Connect" button

---

## 4.14 Notification Handling

### Purpose

Handle incoming push notifications and route the user to the appropriate screen.

### Route

Not a screen -- handled by `services/notifications.ts` and root layout.

### Notification Types and Routing

| Notification Type       | Title Format                  | Body Format                         | Tap Route                  |
| ----------------------- | ----------------------------- | ----------------------------------- | -------------------------- |
| `agent_approval_needed` | "[Agent Name] needs approval" | "[Tool Name]: [Description]"        | `/(app)/companion`         |
| `task_completed`        | "Task completed"              | "[Task Name] finished successfully" | Provided route or `/(app)` |
| `schedule_triggered`    | "Schedule started"            | "[Schedule Name] is running"        | `/(app)/schedules`         |
| `companion_connected`   | "Desktop connected"           | "[Desktop Name] is now paired"      | `/(app)/companion`         |
| `chat_message`          | "New message"                 | Message preview                     | Provided route             |

### Notification Channels (iOS):

iOS does not use Android-style channels, but the app registers notification categories for actionable notifications:

| Category          | Actions           | Description                             |
| ----------------- | ----------------- | --------------------------------------- |
| `agent-approvals` | "Approve", "Deny" | Quick actions on approval notifications |
| `default`         | (none)            | Standard notification                   |

### Foreground Notification Behavior

```typescript
{
  shouldShowAlert: true,   // Show banner even when app is foreground
  shouldPlaySound: true,   // Play notification sound
  shouldSetBadge: true,    // Update app icon badge
}
```

### Cold-Start Notification Handling

When the app is launched by tapping a notification:

1. Root layout checks `isInitialized` and `session` before routing
2. `handleInitialNotification()` called after notification listeners are set up
3. `getLastNotificationResponseAsync()` retrieves the tapped notification
4. `safeNavigate()` defers navigation if navigator is not ready (100ms timeout)
5. Navigation proceeds to the appropriate route

### Background Fetch Agent Status

- Task name: `agent-status-check`
- Minimum interval: 15 minutes (iOS may delay further)
- Behavior: Calls `GET /api/mobile/agent-status` with 15-second timeout
- On pending approvals: Schedules local notification for each pending approval
- Respects settings: Only runs if `backgroundFetchEnabled` and `notificationsEnabled` are both true
- Return values: `NewData` (approvals found), `NoData` (no approvals), `Failed` (API error)

---

# Section 5: Component Architecture

## 5.1 Navigation Structure

```
RootLayout (_layout.tsx)
  |-- Slot
       |-- (auth)/_layout.tsx (Stack)
       |    |-- login.tsx
       |
       |-- onboarding.tsx
       |
       |-- (app)/_layout.tsx (Drawer)
            |-- index.tsx (Home / New Chat)
            |-- chat/[id].tsx (Chat conversation)
            |-- agents/index.tsx (Agent list)
            |-- companion/index.tsx (Desktop companion)
            |-- messaging/index.tsx (Messaging platforms)
            |-- schedules/index.tsx (Schedule list)
            |-- schedules/create.tsx (Create schedule)
            |-- settings/index.tsx (Settings)
            |-- settings/memory.tsx (Memory management)
```

### Navigation Type by Device

| Device | Primary Navigation                    | Secondary Navigation                |
| ------ | ------------------------------------- | ----------------------------------- |
| iPhone | Drawer (swipe from left or hamburger) | Stack (push/pop for nested screens) |
| iPad   | Permanent sidebar (300pt width)       | Stack (push/pop)                    |

## 5.2 Component Tree

```
app/
  _layout.tsx .......................... RootLayout (auth guard, notifications, deep links)
  onboarding.tsx ....................... OnboardingScreen (3-slide intro)

  (auth)/
    _layout.tsx ........................ AuthLayout (stack navigator)
    login.tsx .......................... LoginScreen

  (app)/
    _layout.tsx ........................ AppLayout (drawer navigator, sidebar)
    index.tsx .......................... HomeScreen (new chat)
    chat/[id].tsx ...................... ChatScreen (conversation)
    agents/index.tsx ................... AgentListScreen
    companion/index.tsx ................ CompanionScreen (QR pairing + agent dashboard)
    messaging/index.tsx ................ MessagingScreen
    schedules/index.tsx ................ ScheduleListScreen
    schedules/create.tsx ............... CreateScheduleScreen
    settings/index.tsx ................. SettingsScreen
    settings/memory.tsx ................ MemoryScreen

components/
  agents/
    AgentCard.tsx ...................... Agent status card
    AgentDetailSheet.tsx ............... Expanded agent details bottom sheet

  auth/
    LoginForm.tsx ...................... Email/password form
    OAuthButtons.tsx ................... Apple + Google sign-in buttons

  chat/
    ChatInput.tsx ...................... Message composer bar
    MessageBubble.tsx .................. User/assistant message bubble
    ThinkingBlock.tsx .................. Collapsible thinking/reasoning
    ToolCallCard.tsx ................... Tool execution display
    ApprovalCard.tsx ................... Tool approval request card
    CodeBlock.tsx ...................... Syntax-highlighted code
    CitationPill.tsx ................... Source citation link
    ImageMessage.tsx ................... Image attachment/generation
    StreamingIndicator.tsx ............. Blinking cursor for streaming
    MessageList.tsx .................... FlashList of messages
    EmptyChat.tsx ...................... Empty conversation state

  companion/
    QRPairingPanel.tsx ................. QR scan + manual code entry
    QRScanner.tsx ...................... Camera-based QR scanner
    ConnectionHeader.tsx ............... Connected desktop info

  messaging/
    PlatformCard.tsx ................... Messaging platform connection card
    PlatformConfigSheet.tsx ............ Platform configuration bottom sheet

  model-picker/
    ModelPickerSheet.tsx ............... Bottom sheet model selector
    ModelListItem.tsx .................. Individual model row
    ProviderTabs.tsx ................... Provider filter tabs

  schedules/
    ScheduleCard.tsx ................... Schedule summary card
    ScheduleForm.tsx ................... Create/edit schedule form
    RunHistoryList.tsx ................. Past execution history

  settings/
    SettingsSection.tsx ................ Grouped settings section
    SettingsToggle.tsx ................. Toggle row with label

  sidebar/
    SidebarContent.tsx ................. Drawer sidebar content
    ConversationList.tsx ............... Grouped conversation history
    ConversationItem.tsx ............... Single conversation row
    NavigationItem.tsx ................. Sidebar nav link

  ui/
    text.tsx ........................... Themed Text component with variants
    button.tsx ......................... Themed Button component
    badge.tsx .......................... Status/category badge
    divider.tsx ........................ Horizontal divider
    input.tsx .......................... Themed TextInput component
    toast.tsx .......................... Toast notification component
    skeleton.tsx ....................... Loading skeleton
    empty-state.tsx .................... Empty state illustration + text
    error-banner.tsx ................... Error message banner
    confirmation-dialog.tsx ............ Destructive action confirmation
    fab.tsx ............................ Floating action button

  voice/
    VoiceConversationScreen.tsx ........ Full-screen voice interaction
    VoiceRecordButton.tsx .............. Animated record button
    VoiceMeteringView.tsx .............. Audio level visualization
    VoicePlaybackControls.tsx .......... TTS playback controls
```

## 5.3 State Management Architecture

All state is managed via Zustand v5 stores with persistence middleware.

### Store Map

| Store                | File                        | Persistence | Storage                        | Purpose                            |
| -------------------- | --------------------------- | ----------- | ------------------------------ | ---------------------------------- |
| `useAuthStore`       | `stores/authStore.ts`       | Yes         | `secureStorage` (iOS Keychain) | Auth session, user, sign-in/out    |
| `useChatStore`       | `stores/chatStore.ts`       | Yes         | `mmkvStorage` (MMKV)           | Conversations, messages, streaming |
| `useConnectionStore` | `stores/connectionStore.ts` | Yes         | `mmkvStorage` (MMKV)           | Desktop companion connection       |
| `useAgentStore`      | `stores/agentStore.ts`      | Yes         | `mmkvStorage` (MMKV)           | Agent list, approvals              |
| `useModelStore`      | `stores/modelStore.ts`      | Yes         | `mmkvStorage` (MMKV)           | Selected model, favorites, recents |
| `useSettingsStore`   | `stores/settingsStore.ts`   | Yes         | `mmkvStorage` (MMKV)           | App preferences                    |
| `useMemoryStore`     | `stores/memoryStore.ts`     | Yes         | `mmkvStorage` (MMKV)           | Agent memory entries               |
| `useScheduleStore`   | `stores/scheduleStore.ts`   | Yes         | `mmkvStorage` (MMKV)           | Scheduled tasks                    |
| `useMessagingStore`  | `stores/messagingStore.ts`  | Yes         | `mmkvStorage` (MMKV)           | Messaging platform connections     |

### Storage Architecture

```
iOS Keychain (via expo-secure-store)
  |-- auth-store (session, user)  [encrypted at rest]
  |-- supabase-auth-*             [JWT tokens, chunked for >2KB]

MMKV (react-native-mmkv)
  |-- chat-store (conversations, messages)
  |-- connection-store (pairing code, desktop name)
  |-- agent-store (agents, approvals)
  |-- model-store (selected model, favorites, recents)
  |-- settings-store (preferences)
  |-- memory-store (memory entries)
  |-- schedule-store (schedules)
  |-- messaging-store (platform connections)
  |-- model_catalog_cache (remote model catalog)
  |-- model_catalog_ttl (cache expiry)
  |-- onboarding-done (boolean flag)
```

### Persistence Partialize Rules

Each store defines `partialize` to control what gets persisted and prevent unbounded storage growth:

| Store           | Persisted Fields                                     | Excluded Fields                                                  | Limits                                                                          |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| authStore       | `session`, `user`                                    | `isLoading`, `isInitialized`                                     | None                                                                            |
| chatStore       | `conversations`, `messages`, `currentConversationId` | `isStreaming`, `streamingContent`, `streamingReasoning`, `error` | Max 200 conversations, max 100 messages per conversation, no streaming messages |
| connectionStore | `pairingCode`, `desktopName`                         | `status`, `desktopMetadata`, `error`, `sessionExpiresAt`         | None                                                                            |
| agentStore      | (all)                                                | None                                                             | None                                                                            |
| modelStore      | (all)                                                | None                                                             | Max 5 recent models                                                             |
| settingsStore   | (all)                                                | None                                                             | None                                                                            |
| memoryStore     | `entries`, `lastSyncAt`                              | `loading`, `syncing`, `error`, `searchQuery`, `filteredEntries`  | None                                                                            |
| scheduleStore   | `schedules`                                          | `runsBySchedule`, `loading`, `error`                             | None                                                                            |
| messagingStore  | `platforms`                                          | `loading`, `error`                                               | None                                                                            |

## 5.4 Key TypeScript Interfaces

### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  reasoning?: string;
  artifacts?: Artifact[];
  toolCalls?: ToolCall[];
  approvalRequests?: ApprovalRequest[];
  steps?: StatusStep[];
  isStreaming?: boolean;
  model?: string;
  type?: 'text' | 'image';
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
```

### ConversationSummary

```typescript
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
```

### Agent

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

### ApprovalRequest

```typescript
interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  type: 'file_delete' | 'command' | 'api_call' | 'data_modification' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  countdown?: number;
}
```

### ConnectionState

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

---

# Section 6: Data Flow & API Connections

## 6.1 API Architecture Overview

```
                                     +------------------+
                                     |   Supabase       |
                                     |   (Auth + DB +   |
                                     |    Realtime)     |
                                     +--------+---------+
                                              |
     +------------------+            +--------+---------+
     |  iOS Mobile App  |---REST---->|  API Gateway     |
     |  (React Native)  |            |  (Express.js)    |
     +--------+---------+            +------------------+
              |
              |---WebSocket---->+------------------+
              |                 |  Signaling Server |
              |                 |  (WebSocket)      |
              |                 +--------+---------+
              |                          |
              |---WebRTC Data Channel--->|
              |                          |
              +-----------+--------------+
                          |
                  +-------+-------+
                  |  Desktop App  |
                  |  (Tauri v2)   |
                  +---------------+
```

## 6.2 REST API Calls

All REST calls go through the authenticated `api` client (`services/api.ts`), which automatically injects Supabase Bearer tokens.

### Chat Endpoints

| Method   | Path                          | Request Body         | Response Body                              | Purpose                        |
| -------- | ----------------------------- | -------------------- | ------------------------------------------ | ------------------------------ |
| `GET`    | `/api/chat/conversations`     | --                   | `{ conversations: ConversationSummary[] }` | List all conversations         |
| `POST`   | `/api/chat/conversations`     | `{ title: string }`  | `{ conversation: ConversationSummary }`    | Create new conversation        |
| `GET`    | `/api/chat/conversations/:id` | --                   | `{ messages: ChatMessage[] }`              | Load messages for conversation |
| `PUT`    | `/api/chat/conversations/:id` | `{ title: string }`  | `{ conversation: ConversationSummary }`    | Rename conversation            |
| `DELETE` | `/api/chat/conversations/:id` | --                   | `{ success: boolean }`                     | Delete conversation            |
| `POST`   | `/conversations/:id/tags`     | `{ tags: string[] }` | --                                         | Tag conversation               |

### Streaming Endpoint

| Method | Path                           | Request Body                                            | Response Format           | Purpose                |
| ------ | ------------------------------ | ------------------------------------------------------- | ------------------------- | ---------------------- |
| `POST` | `/api/llm/v1/chat/completions` | `{ model, messages, stream: true, thinking?: boolean }` | SSE (`text/event-stream`) | Stream chat completion |

SSE Event Format:

```
data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"choices":[{"delta":{"reasoning":"Let me think..."},"index":0}]}

data: {"choices":[{"finish_reason":"stop","index":0}]}

data: [DONE]
```

Reconnection logic:

- Max 3 reconnect attempts on network errors (TypeError from fetch)
- Exponential backoff: 1s, 2.5s, 5s
- Non-network errors (HTTP 4xx/5xx): no retry, surface error immediately
- Abort: respects caller signal and streaming timeout (120s default)

### Voice Endpoints

| Method | Path                    | Request Body                       | Response Body      | Purpose     |
| ------ | ----------------------- | ---------------------------------- | ------------------ | ----------- |
| `POST` | `/api/voice/transcribe` | `multipart/form-data` (audio file) | `{ text: string }` | Whisper STT |

### Agent Status Endpoint

| Method | Path                       | Response Body                                        | Purpose                      |
| ------ | -------------------------- | ---------------------------------------------------- | ---------------------------- |
| `GET`  | `/api/mobile/agent-status` | `{ pendingApprovals: [...], runningAgents: number }` | Background fetch agent check |

### Push Token Endpoint

| Method | Path                     | Request Body                         | Purpose                          |
| ------ | ------------------------ | ------------------------------------ | -------------------------------- |
| `POST` | `/api/mobile/push-token` | `{ token: string, platform: "ios" }` | Register push notification token |

### Schedule Endpoints

| Method   | Path                        | Purpose                |
| -------- | --------------------------- | ---------------------- |
| `GET`    | `/api/schedules`            | List all schedules     |
| `POST`   | `/api/schedules`            | Create schedule        |
| `PUT`    | `/api/schedules/:id`        | Update schedule        |
| `DELETE` | `/api/schedules/:id`        | Delete schedule        |
| `POST`   | `/api/schedules/:id/toggle` | Toggle active/inactive |
| `GET`    | `/api/schedules/:id/runs`   | Get run history        |

### Memory Endpoints

| Method   | Path                      | Purpose             |
| -------- | ------------------------- | ------------------- |
| `GET`    | `/api/memories`           | List all memories   |
| `POST`   | `/api/memories`           | Create memory       |
| `PUT`    | `/api/memories/:id`       | Update memory       |
| `DELETE` | `/api/memories/:id`       | Delete memory       |
| `GET`    | `/api/memories/search?q=` | Search memories     |
| `POST`   | `/api/memories/sync`      | Trigger memory sync |

### Messaging Endpoints

| Method | Path                        | Purpose                            |
| ------ | --------------------------- | ---------------------------------- |
| `GET`  | `/api/messaging/config`     | Get messaging platform connections |
| `POST` | `/api/messaging/connect`    | Connect a platform                 |
| `POST` | `/api/messaging/disconnect` | Disconnect a platform              |

### Model Catalog Endpoint

| Method | Path          | Purpose                                 |
| ------ | ------------- | --------------------------------------- |
| `GET`  | `/api/models` | Fetch model catalog (1-hour MMKV cache) |

### File Upload Endpoint

| Method | Path          | Request Body                 | Response Body                 | Purpose                      |
| ------ | ------------- | ---------------------------- | ----------------------------- | ---------------------------- |
| `POST` | `/api/upload` | `multipart/form-data` (file) | `{ url: string, id: string }` | Upload image/file attachment |

## 6.3 WebSocket Connection (Signaling)

Connection URL: `wss://signaling.agiworkforce.com`

### Registration Message (Mobile to Server)

```json
{
  "type": "register",
  "code": "XXXXXXXX",
  "role": "mobile",
  "metadata": {
    "deviceType": "mobile",
    "app": "agiworkforce-mobile",
    "version": "0.1.0"
  }
}
```

### Signaling Events (Server to Mobile)

| Event Type        | Payload                                         | Trigger                      |
| ----------------- | ----------------------------------------------- | ---------------------------- |
| `open`            | --                                              | WebSocket connection opened  |
| `registered`      | `{ expiresAt: number, peerConnected: boolean }` | Registration confirmed       |
| `peer_ready`      | `{ metadata: DesktopMetadata }`                 | Desktop peer connected       |
| `signal`          | `{ kind: string, payload: unknown }`            | Control or WebRTC signaling  |
| `peer_left`       | --                                              | Desktop disconnected         |
| `session_expired` | --                                              | Pairing session expired      |
| `terminated`      | --                                              | Session terminated by server |
| `error`           | `{ error: string }`                             | Server-side error            |
| `close`           | --                                              | WebSocket closed             |

### Control Messages (Mobile to Desktop via DataChannel or Signaling)

| Action              | Payload                             | Purpose                           |
| ------------------- | ----------------------------------- | --------------------------------- | ----------- | ----------------------- |
| `approval_response` | `{ approvalId, decision, reason? }` | Approve or deny tool execution    |
| `agent_command`     | `{ agentId, command: 'pause'        | 'resume'                          | 'cancel' }` | Control agent lifecycle |
| `request_agents`    | --                                  | Request full agent status refresh |
| `ping`              | `{ timestamp }`                     | Heartbeat health check            |

### Control Messages (Desktop to Mobile)

| Action          | Payload               | Purpose                 |
| --------------- | --------------------- | ----------------------- |
| `agents_update` | `{ agents: Agent[] }` | Full agent list refresh |
| `agent_update`  | `{ agentId, patch }`  | Partial agent update    |
| `agent_removed` | `{ agentId }`         | Agent removed from list |

### WebRTC Configuration

```javascript
{
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
}
```

Data channel preference:

1. Send via DataChannel (lowest latency, P2P)
2. If DataChannel unavailable or send fails, fall back to signaling WebSocket relay

## 6.4 Supabase Realtime

The app subscribes to Supabase Realtime for cross-surface sync of conversations and messages.

### Channels

| Channel                | Table           | Filter                | Events                 |
| ---------------------- | --------------- | --------------------- | ---------------------- |
| `mobile-conversations` | `conversations` | `user_id=eq.{userId}` | INSERT, UPDATE, DELETE |
| `mobile-messages`      | `messages`      | `user_id=eq.{userId}` | INSERT, UPDATE, DELETE |

### Realtime Event Handling

**Conversation INSERT**: Add to conversations array if not duplicate.
**Conversation UPDATE**: Update title, updatedAt, messageCount.
**Conversation DELETE**: Remove from conversations, clear messages, reset currentConversationId if affected.
**Message INSERT**: Append to messages array if not duplicate.
**Message UPDATE**: Update content of matching message.
**Message DELETE**: Remove from messages array.

### Subscription Lifecycle

1. Subscribe after auth session is established
2. Unsubscribe on sign out
3. Resubscribe on session refresh
4. Handle network reconnection (Supabase client auto-reconnects)

## 6.5 Auth & Session Management

### Authentication Flow

```
1. User enters credentials or taps OAuth button
2. Supabase Auth handles authentication (PKCE flow for OAuth)
3. Session (JWT tokens) stored in iOS Keychain via expo-secure-store
4. Supabase auto-refreshes tokens (autoRefreshToken: true)
5. All API calls inject Bearer token from session
6. Auth state changes trigger onAuthStateChange listener
7. Root layout reacts to session changes for navigation
```

### Session Storage Architecture

```
expo-secure-store (iOS Keychain):
  |-- supabase-auth-token (access_token, refresh_token)
  |   |-- If > 2KB: chunked into __chunk_0, __chunk_1, ..., __chunk_count
  |   |-- MMKV fallback if Keychain unavailable (simulator)
  |
  |-- auth-store (Zustand persisted session + user)
```

### Token Refresh

- Automatic via Supabase `autoRefreshToken: true`
- Manual via `refreshSession()` action on authStore
- On failure: Clear session, redirect to login

## 6.6 Offline Handling

| Feature             | Offline Behavior                                    |
| ------------------- | --------------------------------------------------- |
| Conversation list   | Read from MMKV cache (up to 200 conversations)      |
| Message history     | Read from MMKV cache (up to 100 per conversation)   |
| Send message        | Disabled -- shows "Offline" indicator               |
| Create conversation | Creates local-only conversation (syncs when online) |
| Delete conversation | Optimistic removal, syncs when online               |
| Desktop companion   | Disconnects -- "Connection lost" message            |
| Model picker        | Shows cached catalog or embedded fallback           |
| Settings            | Fully functional (local MMKV storage)               |
| Schedules           | Shows cached list, create/edit disabled             |
| Memories            | Shows cached entries, create/edit disabled          |

### Network State Detection

Uses `@react-native-community/netinfo` for network state monitoring. When network becomes unavailable:

- Toast notification: "You're offline. Some features are unavailable."
- Input bars show "Offline" badge
- Real-time subscriptions pause and auto-resume when connectivity returns

---

# Section 7: Platform-Specific Capabilities

## 7.1 iOS Keychain (expo-secure-store)

### Implementation

Auth tokens are stored in the iOS Keychain via `expo-secure-store`. The Keychain provides hardware-backed encryption at rest, accessible only by the app.

### >2KB Chunking Fix

SecureStore has a 2KB per-value limit. Supabase session JSON (which includes JWT access tokens, refresh tokens, and user metadata) can exceed this. The `services/supabase.ts` implements chunking:

1. Values <= 1900 bytes: stored directly under the key
2. Values > 1900 bytes: split into chunks stored as `key__chunk_0`, `key__chunk_1`, etc.
3. Chunk count stored as `key__chunk_count`
4. On read: check for direct value first, then reassemble chunks
5. On write: clean up stale chunks from previous writes
6. Fallback: MMKV used if SecureStore is unavailable (some simulators)

### Keychain Access Groups

- Default: app-only access (no shared Keychain group)
- Future: Share with Safari extension via `com.agiworkforce.shared` access group

## 7.2 Push Notifications (APNs)

### Registration Flow

1. Request notification permission via `expo-notifications`
2. If granted, get Expo push token via `getExpoPushTokenAsync()`
3. Send token to backend via `POST /api/mobile/push-token`
4. Backend stores token associated with user ID
5. On token refresh: re-register with backend

### Notification Categories

```typescript
// iOS notification categories (for actionable notifications)
Notifications.setNotificationCategoryAsync('agent-approvals', [
  {
    identifier: 'approve',
    buttonTitle: 'Approve',
    options: { opensAppToForeground: true },
  },
  {
    identifier: 'deny',
    buttonTitle: 'Deny',
    options: { isDestructive: true, opensAppToForeground: true },
  },
]);
```

### Notification Presentation

| Context           | Behavior                                              |
| ----------------- | ----------------------------------------------------- |
| App in foreground | Show banner alert, play sound, update badge           |
| App in background | Standard iOS notification                             |
| App not running   | Standard iOS notification, cold-start handling on tap |
| Do Not Disturb    | Respects iOS DND settings                             |

## 7.3 Background Fetch

### Configuration

```typescript
BackgroundFetch.registerTaskAsync('agent-status-check', {
  minimumInterval: 15 * 60, // 15 minutes (seconds)
  stopOnTerminate: false, // Continue after app termination
  startOnBoot: true, // Start on device boot
});
```

### iOS Background Fetch Behavior

- iOS controls actual fetch frequency based on app usage patterns
- Minimum 15-minute interval requested, but iOS may delay to conserve battery
- Task must complete within 30 seconds (iOS enforced)
- Results: `NewData` (approvals found), `NoData`, `Failed`
- Disabled when: `backgroundFetchEnabled` or `notificationsEnabled` is false in settings

## 7.4 Haptic Feedback

Uses `expo-haptics` for tactile feedback throughout the app.

| Action                 | Haptic Type                                                   | Purpose                                    |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| Approve tool execution | `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`             | Confirm positive action                    |
| Deny tool execution    | `Haptics.notificationAsync(NotificationFeedbackType.Warning)` | Warning for negative action                |
| Start voice recording  | `Haptics.impactAsync(ImpactFeedbackStyle.Heavy)`              | Confirm recording started                  |
| Stop voice recording   | `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`             | Confirm recording stopped                  |
| QR code scanned        | `Haptics.notificationAsync(NotificationFeedbackType.Success)` | Confirm successful scan                    |
| Delete conversation    | `Haptics.impactAsync(ImpactFeedbackStyle.Light)`              | Light feedback for destructive swipe       |
| Pull to refresh        | `Haptics.impactAsync(ImpactFeedbackStyle.Light)`              | Refresh feedback                           |
| Disabled globally      | No-op                                                         | When `hapticsEnabled` is false in settings |

## 7.5 Camera Access (QR Scanning)

### Permission Handling

```
NSCameraUsageDescription: "Used for scanning QR codes and sending images to AI"
```

### QR Scanner Implementation

- Uses `expo-camera` with barcode scanning mode
- Scans for `qr` barcode type
- Validates scanned string against pairing code patterns:
  - `agiw:` prefix + 6-12 alphanumeric chars
  - Raw 6-12 alphanumeric chars
- Auto-closes camera on successful scan
- Falls back to manual code entry if camera denied

## 7.6 Microphone Access (Voice Input)

### Permission Handling

```
NSMicrophoneUsageDescription: "Used for voice input and voice conversations"
```

### Audio Session Management

- Recording mode: `allowsRecordingIOS: true`, `playsInSilentModeIOS: true`
- Playback mode: `allowsRecordingIOS: false`, `playsInSilentModeIOS: true`
- Audio ducking on Android: `shouldDuckAndroid: true`
- Background audio: `staysActiveInBackground: false` (no background recording)

## 7.7 Photo Library Access

### Permission Handling

```
NSPhotoLibraryUsageDescription: "Used for selecting images to send to AI"
```

### Image Picker Configuration

- Media types: Images only
- Quality: 80% compression for upload efficiency
- Allow editing: Yes (crop)
- Allow multiple: Yes (up to 4 images)

## 7.8 Deep Linking / URL Scheme

### Registered Schemes

```
agiworkforce://
```

### Supported Deep Links

| URL                                   | Action                                               |
| ------------------------------------- | ---------------------------------------------------- |
| `agiworkforce://pair/CODE`            | Navigate to companion screen, auto-connect with CODE |
| `agiworkforce://pair?code=CODE`       | Same as above (query param format)                   |
| `agiworkforce://chat/CONVERSATION_ID` | Open specific conversation                           |
| `agiworkforce://`                     | Open app home screen                                 |

### Implementation

Root layout uses `expo-linking`'s `useURL()` hook to detect incoming URLs. Parsing extracts hostname and path segments:

```typescript
const parsed = Linking.parse(url);
if (parsed.hostname === 'pair' || parsed.path?.startsWith('pair')) {
  const code = parsed.queryParams?.code ?? parsed.path?.split('/').pop();
  if (code) {
    router.push(`/(app)/companion?pairingCode=${encodeURIComponent(code)}`);
  }
}
```

## 7.9 Dynamic Island (Planned -- iOS 17+)

### Concept

When an agent is running on the paired desktop, the Dynamic Island on iPhone 14 Pro+ shows a compact indicator:

**Compact View** (always visible when agent running):

- Left: Teal pulsing dot
- Right: "1 agent" or "3 agents" text

**Expanded View** (long-press on Dynamic Island):

- Agent name and current step
- Progress bar
- "Approve" / "Deny" quick actions if approval pending

### Implementation Path

Requires a native Swift module (Expo custom dev client) using the `ActivityKit` framework. The React Native bridge sends agent status updates to the Live Activity.

## 7.10 Home Screen Widgets (Planned -- iOS 16+)

### Widget Types

**Quick Message Widget** (small, 2x2):

- Tap to open app with keyboard ready
- Shows last conversation title

**Agent Status Widget** (medium, 4x2):

- Shows number of running agents
- Pending approvals count
- "No agents running" default state

**Recent Conversations Widget** (large, 4x4):

- Last 3 conversations with titles and timestamps
- Tap to open specific conversation

### Implementation Path

Requires a WidgetKit extension built with SwiftUI. Shared data via App Group (`group.com.agiworkforce.mobile`). Widget configuration via `IntentConfiguration`.

## 7.11 Siri Shortcuts (Planned)

### Shortcut Types

| Shortcut     | Phrase              | Action                           |
| ------------ | ------------------- | -------------------------------- |
| Quick Ask    | "Ask AGI Workforce" | Opens app with voice mode active |
| Check Agents | "Check my agents"   | Opens companion screen           |
| New Chat     | "Start a new chat"  | Opens home screen with keyboard  |

### Implementation Path

Requires `Intents` framework integration via Expo custom native module. Defines `INIntent` subclasses for each shortcut type. Donated interactions after each use for Siri Suggestions.

## 7.12 iOS Share Extension (Planned)

### Purpose

Allow users to share text, URLs, and images from other apps directly into an AGI Workforce conversation.

### Flow

1. User selects text/image in Safari, Notes, etc.
2. Tap Share -> "AGI Workforce"
3. Share extension opens: shows text preview + model picker + "Send" button
4. Creates new conversation with shared content as first message
5. Closes extension, opens main app to conversation

### Implementation Path

Requires a Share Extension target in the Xcode project. Shared data via App Group. Uses SwiftUI for the extension UI.

---

# Section 8: Build, Deploy & Distribution

## 8.1 EAS Build Pipeline

### Build Profiles

| Profile       | Purpose                               | Distribution          | iOS Config                                          |
| ------------- | ------------------------------------- | --------------------- | --------------------------------------------------- |
| `development` | Local development + debugging         | Internal              | `simulator: true`, dev client enabled               |
| `preview`     | Internal testing + stakeholder review | Internal (TestFlight) | Release build, `preview` channel                    |
| `production`  | App Store release                     | External (App Store)  | Release build, `production` channel, auto-increment |

### EAS Configuration (`eas.json`)

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
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "buildConfiguration": "Release"
      }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "APPLE_ID_REQUIRED",
        "ascAppId": "ASC_APP_ID_REQUIRED",
        "appleTeamId": "APPLE_TEAM_ID_REQUIRED"
      }
    }
  }
}
```

### Build Commands

```bash
# Development build (simulator)
cd apps/mobile && pnpm build:dev
# Equivalent: eas build --profile development

# Preview build (TestFlight)
cd apps/mobile && pnpm build:preview
# Equivalent: eas build --profile preview

# Production build (App Store)
cd apps/mobile && pnpm build:prod
# Equivalent: eas build --profile production
```

## 8.2 Code Signing

### Certificates Required

| Certificate        | Purpose                | Management                          |
| ------------------ | ---------------------- | ----------------------------------- |
| Apple Development  | Development builds     | EAS managed (recommended) or manual |
| Apple Distribution | App Store + TestFlight | EAS managed (recommended) or manual |

### Provisioning Profiles

| Profile     | Type         | Purpose                       |
| ----------- | ------------ | ----------------------------- |
| Development | Development  | Install on registered devices |
| Ad Hoc      | Distribution | TestFlight internal testing   |
| App Store   | Distribution | App Store submission          |

### Entitlements

```xml
<dict>
  <key>aps-environment</key>
  <string>production</string>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:agiworkforce.com</string>
  </array>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>group.com.agiworkforce.mobile</string>
  </array>
  <key>keychain-access-groups</key>
  <array>
    <string>$(AppIdentifierPrefix)com.agiworkforce.mobile</string>
  </array>
</dict>
```

### Capabilities

| Capability            | Purpose                                 |
| --------------------- | --------------------------------------- |
| Push Notifications    | APNs for agent approvals and updates    |
| Background Fetch      | Periodic agent status polling           |
| Background Processing | Extended background task support        |
| Associated Domains    | Universal links for deep linking        |
| App Groups            | Shared data with widgets and extensions |
| Keychain Sharing      | Secure token storage                    |

## 8.3 OTA Updates

### expo-updates Configuration

```json
{
  "updates": {
    "fallbackToCacheTimeout": 0
  }
}
```

- Updates are downloaded in the background on app launch
- Applied on next cold start (not force-applied mid-session)
- `fallbackToCacheTimeout: 0` means the app uses the cached bundle immediately, never waits for a download
- Critical updates can be forced via EAS Update with `isEmbeddedUpdate: false`

### Update Channels

| Channel      | Purpose                             | Audience     |
| ------------ | ----------------------------------- | ------------ |
| `preview`    | Preview builds for internal testing | Team members |
| `production` | Production releases                 | All users    |

### OTA Update Commands

```bash
# Publish update to preview channel
eas update --channel preview --message "Fix: streaming reconnection"

# Publish update to production channel
eas update --channel production --message "Fix: QR pairing timeout"
```

## 8.4 App Store Submission Checklist

### App Metadata

| Field              | Value                                             |
| ------------------ | ------------------------------------------------- |
| App Name           | AGI Workforce                                     |
| Subtitle           | AI Agent Control from Your Phone                  |
| Bundle ID          | `com.agiworkforce.mobile`                         |
| Primary Category   | Productivity                                      |
| Secondary Category | Business                                          |
| Content Rating     | 4+                                                |
| Price              | Free                                              |
| In-App Purchases   | Subscriptions (Hobby, Pro, Max, Team, Enterprise) |

### App Store Screenshots (Required)

| Device                          | Size         | Count Required   |
| ------------------------------- | ------------ | ---------------- |
| iPhone 6.7" (iPhone 15 Pro Max) | 1290x2796 px | 5-10 screenshots |
| iPhone 6.1" (iPhone 15)         | 1179x2556 px | 5-10 screenshots |
| iPad Pro 12.9" (6th gen)        | 2048x2732 px | 5-10 screenshots |

### Required Screenshots (Suggested Order)

1. **Chat Screen** -- Multi-model conversation with Claude/GPT-4o
2. **QR Pairing** -- Scanning desktop QR code
3. **Agent Dashboard** -- Live agents with approval cards
4. **Voice Mode** -- Voice conversation interface
5. **Model Picker** -- Model selection bottom sheet
6. **Companion Connected** -- Desktop paired with agent running
7. **Schedules** -- Scheduled task list
8. **Settings** -- Clean settings interface

### Privacy Manifest (iOS 17+ Required)

```xml
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeDeviceID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>E174.1</string>
      </array>
    </dict>
  </array>
</dict>
```

### App Store Review Guidelines Compliance

| Guideline                 | Compliance                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1.1 Safety                | No objectionable content. AI responses may generate user-reported content -- moderation handled server-side. |
| 2.1 App Completeness      | All features functional. No placeholder screens.                                                             |
| 2.3 Accurate Metadata     | App description matches functionality.                                                                       |
| 3.1.1 In-App Purchase     | Subscription tiers use Apple's in-app purchase system.                                                       |
| 3.1.2 Subscriptions       | Auto-renewable subscriptions with proper disclosure.                                                         |
| 4.2 Minimum Functionality | App provides unique value beyond a web wrapper.                                                              |
| 5.1 Privacy               | Data collection disclosed in privacy manifest.                                                               |
| 5.1.1 Data Collection     | Email, device ID, usage data. No tracking.                                                                   |
| 5.1.2 Data Use            | Authentication, functionality, analytics.                                                                    |
| Sign in with Apple        | Implemented (required when other social login offered).                                                      |

### App Store Description (Draft)

```
AGI Workforce: Your AI Desktop Agent, In Your Pocket

Control your AI agents from anywhere. AGI Workforce is the mobile companion
to the most powerful AI desktop platform — giving you real-time oversight
of autonomous agents, multi-model AI chat, and voice interaction on the go.

KEY FEATURES:

--- Desktop Companion ---
Pair with your desktop via QR code. Monitor live agent activity, approve or
deny tool executions remotely, and receive push notifications when agents
need your input. No other AI app offers this level of mobile control.

--- Multi-Model Chat ---
Chat with Claude, GPT-4o, Gemini, Mistral, and more — all in one app.
Switch models mid-conversation. Compare responses. Choose the best AI
for every task.

--- Voice Input ---
Hold to record, release to transcribe. Full voice conversation mode with
text-to-speech responses. Hands-free AI interaction while you walk,
drive, or multitask.

--- Smart Scheduling ---
Schedule recurring AI tasks from your phone. Daily reports, weekly
summaries, custom workflows — running automatically on your desktop.

--- Real-Time Sync ---
Conversations sync across your desktop, phone, and web. Start on one
device, continue on another.

REQUIREMENTS:
- AGI Workforce desktop app for companion features
- Account at agiworkforce.com (free tier available)
- iOS 16.0 or later

PRIVACY:
Your conversations are encrypted in transit and at rest. API keys and
auth tokens are stored in the iOS Keychain. We never sell your data.
```

---

# Section 9: Testing Strategy

## 9.1 Test Framework

| Tool                          | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| Jest                          | Unit test runner (via jest-expo)                  |
| @testing-library/react-native | Component rendering and interaction testing       |
| Detox                         | End-to-end testing on real devices and simulators |

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterSetup: ['<rootDir>/__tests__/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/flash-list|lucide-react-native|@gorhom/bottom-sheet|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|react-native-webrtc|nativewind)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

## 9.2 Unit Test Targets

| Module               | Test File Pattern                            | Coverage Target | Priority |
| -------------------- | -------------------------------------------- | --------------- | -------- |
| Auth store           | `stores/__tests__/authStore.test.ts`         | 90%             | P0       |
| Chat store           | `stores/__tests__/chatStore.test.ts`         | 85%             | P0       |
| Connection store     | `stores/__tests__/connectionStore.test.ts`   | 85%             | P0       |
| Agent store          | `stores/__tests__/agentStore.test.ts`        | 85%             | P0       |
| Model store          | `stores/__tests__/modelStore.test.ts`        | 80%             | P1       |
| Settings store       | `stores/__tests__/settingsStore.test.ts`     | 80%             | P1       |
| Schedule store       | `stores/__tests__/scheduleStore.test.ts`     | 75%             | P1       |
| Memory store         | `stores/__tests__/memoryStore.test.ts`       | 75%             | P1       |
| Messaging store      | `stores/__tests__/messagingStore.test.ts`    | 75%             | P2       |
| API service          | `services/__tests__/api.test.ts`             | 85%             | P0       |
| Streaming service    | `services/__tests__/streaming.test.ts`       | 85%             | P0       |
| Companion service    | `services/__tests__/companion.test.ts`       | 80%             | P0       |
| Voice service        | `services/__tests__/voice.test.ts`           | 75%             | P1       |
| Notification service | `services/__tests__/notifications.test.ts`   | 75%             | P1       |
| Background fetch     | `services/__tests__/backgroundFetch.test.ts` | 80%             | P1       |
| Secure storage       | `lib/__tests__/secureStorage.test.ts`        | 90%             | P0       |
| Constants            | `lib/__tests__/constants.test.ts`            | 80%             | P1       |
| Model catalog        | `services/__tests__/modelCatalog.test.ts`    | 80%             | P1       |

### Key Test Scenarios by Store

**authStore:**

- Initialize loads session from Keychain
- signInWithEmail sets session on success
- signInWithEmail surfaces error on failure
- signInWithApple passes idToken and nonce
- signInWithGoogle passes accessToken
- signOut clears session even on network failure
- refreshSession updates session on success
- refreshSession clears session on failure
- Auth subscription cleaned up on re-initialization

**chatStore:**

- loadConversations populates list from API
- loadConversations keeps cached data on failure
- createConversation creates local-only on API failure
- sendMessage adds optimistic user + assistant messages
- sendMessage streams tokens into assistant message
- stopStreaming finalizes message with partial content
- deleteConversation optimistic removal
- renameConversation optimistic update
- Persistence caps: 200 conversations, 100 messages per conversation

**connectionStore:**

- connect parses pairing code with/without prefix
- connect creates SignalingClient with correct config
- peer_ready sets status to connected with metadata
- peer_left resets to disconnected, clears agents
- session_expired shows error, clears code
- sendControl prefers DataChannel, falls back to signaling
- disconnect cleans up WebRTC + signaling
- Error messages mapped to friendly text

## 9.3 Integration Test Scenarios

| Scenario           | Description                                                           | Priority |
| ------------------ | --------------------------------------------------------------------- | -------- |
| Auth flow E2E      | Sign up -> Onboarding -> Home -> Sign out -> Sign in                  | P0       |
| Chat flow E2E      | New chat -> Send message -> Stream response -> Stop -> Delete         | P0       |
| Companion pairing  | Scan QR -> Connect -> See agents -> Approve request -> Disconnect     | P0       |
| Offline resilience | Load cached conversations -> Show offline banner -> Reconnect -> Sync | P1       |
| Push notification  | Receive notification -> Tap -> Navigate to correct screen             | P1       |
| Voice input        | Record -> Transcribe -> Send as message                               | P1       |
| Model switching    | Open picker -> Select model -> Send message with new model            | P1       |
| Schedule CRUD      | Create schedule -> Edit -> Toggle -> Delete                           | P2       |
| Memory CRUD        | Add memory -> Search -> Edit -> Delete -> Sync                        | P2       |

## 9.4 E2E Test Scenarios (Detox)

| Test               | Steps                                                    | Assertions                                                           |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Login flow         | Launch -> Enter email/password -> Tap "Sign In"          | Home screen visible, hamburger menu present                          |
| New chat           | Home -> Type message -> Tap send                         | Chat screen opens, user message visible, streaming indicator appears |
| Sidebar navigation | Home -> Tap hamburger -> Tap "Agents"                    | Agents screen visible                                                |
| Model picker       | Home -> Tap model pill -> Select "GPT-4o" -> Close       | Model pill shows "GPT-4o"                                            |
| Settings           | Home -> Open sidebar -> Tap "Settings" -> Toggle haptics | Toggle state persists after restart                                  |
| Deep link          | Open `agiworkforce://pair/TEST123`                       | Companion screen with code "TEST123"                                 |

## 9.5 Device Test Matrix

| Device              | iOS Version | Priority | Notes                           |
| ------------------- | ----------- | -------- | ------------------------------- |
| iPhone 15 Pro Max   | iOS 17.x    | P0       | Primary flagship device         |
| iPhone 15           | iOS 17.x    | P0       | Standard size device            |
| iPhone SE (3rd gen) | iOS 16.x    | P0       | Smallest supported screen       |
| iPhone 13 mini      | iOS 16.x    | P1       | Compact device                  |
| iPhone 14 Pro       | iOS 17.x    | P1       | Dynamic Island testing          |
| iPad Pro 12.9"      | iPadOS 17.x | P1       | Largest iPad, permanent sidebar |
| iPad Air            | iPadOS 16.x | P2       | Mid-size iPad                   |
| iPad mini           | iPadOS 16.x | P2       | Smallest iPad                   |
| iPhone 12           | iOS 16.x    | P2       | Older device performance        |
| Simulator           | iOS 16.0+   | P0       | Development testing             |

---

# Section 10: Performance Requirements

## 10.1 Cold Start Time

| Metric                                | Target | Measurement Method                      |
| ------------------------------------- | ------ | --------------------------------------- |
| Time to splash screen                 | <500ms | Instruments Time Profiler               |
| Time to interactive (cached session)  | <2s    | First frame rendered + touch responsive |
| Time to interactive (fresh login)     | <3s    | Login screen fully rendered             |
| Time to first message (existing chat) | <1.5s  | Message list rendered from MMKV cache   |

### Cold Start Budget Breakdown

```
Splash screen display:     100ms
JS bundle load:            300ms
React tree mount:          200ms
Auth store rehydration:    100ms
MMKV cache read:           50ms
Navigation resolution:     100ms
First frame render:        150ms
                          --------
Total budget:             1000ms (1s target, 2s maximum)
```

## 10.2 Memory Footprint

| State                               | Memory Target | Maximum |
| ----------------------------------- | ------------- | ------- |
| Idle (home screen)                  | <80 MB        | 120 MB  |
| Active chat (streaming)             | <120 MB       | 180 MB  |
| Companion connected (agents synced) | <100 MB       | 150 MB  |
| Voice recording active              | <130 MB       | 200 MB  |
| Model picker open (full list)       | <100 MB       | 160 MB  |
| Background (suspended)              | <50 MB        | 80 MB   |

### Memory Management Strategies

- FlashList for all lists (virtualized rendering, off-screen recycling)
- MMKV persistence caps: 200 conversations, 100 messages per conversation
- Image thumbnails capped at 300x300 pixels in lists
- WebRTC peer connection closed immediately on disconnect
- Signaling client destroyed (not held) when disconnected
- No global event listeners -- all cleaned up in effect destructors

## 10.3 Battery Impact

| Activity                 | Battery Impact Target | Notes                              |
| ------------------------ | --------------------- | ---------------------------------- |
| Idle (app in foreground) | Negligible            | No active network polling          |
| Active chat (streaming)  | Low                   | Single HTTP connection, SSE stream |
| Companion connected      | Low-Medium            | WebSocket + optional WebRTC        |
| Voice recording          | Medium                | Audio hardware active              |
| Background fetch         | Negligible            | 15-minute intervals, 15s timeout   |
| Location services        | None                  | App does not use location          |

### Battery Optimization Strategies

- WebSocket heartbeat: 25s interval (not more frequent)
- Background fetch: iOS-managed scheduling (may defer based on battery)
- No continuous polling -- all real-time data via push/WebSocket/Realtime
- Audio session deactivated when not recording
- Wakelock: Never used
- Network requests: timeout enforcement (30s default, 120s streaming)

## 10.4 Bundle Size

| Metric                         | Target | Maximum |
| ------------------------------ | ------ | ------- |
| App binary (IPA, compressed)   | <30 MB | 50 MB   |
| JS bundle (uncompressed)       | <5 MB  | 8 MB    |
| JS bundle (compressed, Hermes) | <2 MB  | 4 MB    |
| Total app install size         | <80 MB | 120 MB  |

### Bundle Optimization Strategies

- Hermes engine enabled (bytecode compilation, smaller JS bundle)
- Tree-shaking via Metro bundler
- lucide-react-native: import individual icons, not entire package
- No large embedded assets -- images lazy-loaded from CDN
- Model catalog: embedded fallback is minimal, full catalog fetched from API
- NativeWind: Tailwind CSS compiled at build time, no runtime overhead

## 10.5 Rendering Performance

| Metric                           | Target           |
| -------------------------------- | ---------------- |
| UI frame rate                    | 60 fps sustained |
| Scroll frame rate (message list) | 60 fps           |
| Animation frame rate             | 60 fps           |
| Touch response latency           | <100ms           |
| Keyboard show/hide animation     | 60 fps           |

### Performance Tools

| Tool                             | Purpose                             |
| -------------------------------- | ----------------------------------- |
| React Native Performance Monitor | Frame rate, JS thread, UI thread    |
| Instruments (Xcode)              | CPU, memory, energy profiling       |
| Flipper                          | Network inspector, layout inspector |
| react-native-reanimated worklets | Offload animations to UI thread     |

---

# Section 11: Security

## 11.1 Threat Model

### Attack Surfaces

| Surface             | Threats                              | Mitigations                                                                 |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| Local storage       | Stolen device accessing chat history | MMKV is sandboxed, auth tokens in Keychain, optional biometric lock         |
| Network (API)       | Man-in-the-middle interception       | TLS 1.3, certificate pinning (planned), Bearer token auth                   |
| Network (WebSocket) | Session hijacking, replay attacks    | TLS WebSocket (wss://), time-limited session codes, expiry enforcement      |
| Network (WebRTC)    | Data channel eavesdropping           | DTLS encryption (built into WebRTC), STUN-only (no TURN credentials stored) |
| Push notifications  | Spoofed notifications                | Expo push token validation, server-side token registration                  |
| Auth session        | Token theft, session fixation        | Keychain storage, auto-refresh, PKCE flow, session rotation                 |
| QR code             | Code guessing, brute force           | 6-12 char alphanumeric space, rate limiting, session expiry                 |
| Deep links          | URL injection                        | Strict URL parsing, allowlist of valid routes                               |
| Clipboard           | Sensitive content copied             | No auto-copy of auth tokens, user-initiated copy only                       |

## 11.2 Secret Storage

### Storage Hierarchy

```
MOST SECURE: iOS Keychain (expo-secure-store)
  |-- Auth session tokens (access_token, refresh_token)
  |-- Supabase session data (with >2KB chunking)
  |-- Future: user-configured API keys

STANDARD: MMKV (app sandbox)
  |-- Chat history (messages, conversations)
  |-- App preferences (settings)
  |-- Connection state (pairing code)
  |-- Agent data (synced from desktop)
  |-- Model preferences (favorites, recents)

NEVER STORED:
  |-- Passwords (handled by Supabase, never persisted client-side)
  |-- Desktop API keys (never leave the desktop app)
  |-- Deepgram API key (build-time env var only, not persisted)
```

### Keychain Configuration

```typescript
SecureStore.setItemAsync(key, value, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
```

- `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: Data accessible only when device is unlocked, never migrated to other devices via backup.

## 11.3 Authentication Security

| Mechanism           | Implementation                                               |
| ------------------- | ------------------------------------------------------------ |
| Auth flow           | PKCE (Proof Key for Code Exchange) via Supabase              |
| Token storage       | iOS Keychain via expo-secure-store                           |
| Token refresh       | Automatic via Supabase `autoRefreshToken: true`              |
| Session detection   | No URL-based session detection (`detectSessionInUrl: false`) |
| Sign in with Apple  | ID token + nonce verification                                |
| Sign in with Google | Access token verification                                    |
| Auth state listener | Cleaned up on re-initialization to prevent leaks             |
| Session persistence | Hydrated from Keychain on app launch                         |

## 11.4 Network Security

| Layer               | Protection                                                |
| ------------------- | --------------------------------------------------------- |
| HTTPS               | TLS 1.3 for all REST API calls                            |
| WSS                 | TLS for WebSocket signaling connection                    |
| DTLS                | Built-in WebRTC encryption for data channels              |
| Auth headers        | Bearer token injected on every API request                |
| Timeout enforcement | 30s default, 120s streaming, 60s upload                   |
| Abort controller    | All network requests have timeout-based abort controllers |
| Certificate pinning | Planned -- pin API gateway and Supabase certificates      |

## 11.5 Data at Rest

| Data Type           | Storage            | Encryption                                   |
| ------------------- | ------------------ | -------------------------------------------- |
| Auth tokens         | iOS Keychain       | Hardware-backed encryption                   |
| Chat messages       | MMKV (app sandbox) | iOS app sandbox encryption (Data Protection) |
| App preferences     | MMKV (app sandbox) | iOS app sandbox encryption                   |
| Model catalog cache | MMKV (app sandbox) | iOS app sandbox encryption                   |
| Audio recordings    | Temp directory     | Not encrypted, deleted after transcription   |
| Images              | Temp directory     | Not encrypted, deleted after upload          |

### Data Protection Class

All app data falls under the `NSFileProtectionComplete` class by default, meaning data is encrypted when the device is locked.

## 11.6 Permission Enforcement

| Permission       | Usage                      | Fallback                                       |
| ---------------- | -------------------------- | ---------------------------------------------- |
| Camera           | QR scanning, image capture | Manual code entry, image picker (library only) |
| Microphone       | Voice recording            | Voice features disabled                        |
| Photo Library    | Image attachments          | Camera-only capture                            |
| Notifications    | Push notifications         | In-app polling only                            |
| Background Fetch | Agent status polling       | No background checks                           |

### Permission Request Timing

- **Camera**: Requested when user first taps "Scan QR Code" or camera button
- **Microphone**: Requested when user first taps voice record button
- **Photo Library**: Requested when user first taps image attachment button
- **Notifications**: Requested after first sign-in (in root layout)
- **Background Fetch**: Registered on app initialization (no user prompt)

## 11.7 Input Validation

| Input           | Validation                                           |
| --------------- | ---------------------------------------------------- |
| Pairing code    | `^[A-Za-z0-9]{6,12}$` (with optional `agiw:` prefix) |
| Email           | Standard email format validation by Supabase         |
| Password        | Minimum 8 characters (enforced by Supabase)          |
| Chat message    | Non-empty, trimmed, max 32,000 characters            |
| Schedule name   | Non-empty, max 100 characters                        |
| Memory content  | Non-empty, max 10,000 characters                     |
| Cron expression | Validated against cron syntax                        |

## 11.8 Biometric Authentication (Planned)

### Implementation Plan

```
1. User enables biometric lock in Settings
2. On next app launch, FaceID/TouchID prompt appears
3. On success: app loads normally
4. On failure: retry or fall back to password
5. After 5 failed attempts: force re-authentication via email/password
```

### expo-local-authentication Integration

```typescript
import * as LocalAuthentication from 'expo-local-authentication';

const result = await LocalAuthentication.authenticateAsync({
  promptMessage: 'Unlock AGI Workforce',
  cancelLabel: 'Use Password',
  disableDeviceFallback: false,
  fallbackLabel: 'Use Passcode',
});
```

---

# Section 12: Accessibility

## 12.1 VoiceOver Support

### General Requirements

- All interactive elements have `accessibilityLabel` and `accessibilityRole`
- All images have `accessibilityLabel` descriptions
- Custom components implement `accessible={true}` where appropriate
- Focus order follows visual layout (top-to-bottom, left-to-right)
- Modal screens trap focus within the modal
- Bottom sheets announce themselves when opened

### Screen-Specific VoiceOver Annotations

**Home Screen:**

- Hamburger button: "Open sidebar"
- Chat input: "Message input, text field"
- Model pill: "Current model: [model name], button. Double tap to change."
- Send button: "Send message" (enabled) / "Send message, disabled" (disabled)
- Attachment button: "Attach image"
- Voice button: "Start voice input"

**Chat Screen:**

- Message bubbles: "You said: [content]" / "[Model] responded: [content]"
- Thinking block: "Thinking: [content], collapsed. Double tap to expand."
- Tool call: "[Tool name], [status]. Duration: [time]."
- Approval card: "[Tool name] needs approval. Risk level: [level]. Description: [text]. Approve button. Deny button."
- Streaming indicator: "Response loading"

**Companion Screen:**

- QR scan button: "Scan QR code from desktop"
- Code input: "Pairing code input, text field"
- Agent card: "[Agent name], [status], [progress] percent complete. Current step: [step]. Double tap for details."
- Approve button: "Approve [tool name]"
- Deny button: "Deny [tool name]"

**Sidebar:**

- Navigation items: "[Label], tab, [selected/unselected]"
- Conversation items: "[Title], last updated [time]. Double tap to open. Swipe left to delete."

### VoiceOver Gestures

| Gesture             | Action                   |
| ------------------- | ------------------------ |
| Swipe right         | Move to next element     |
| Swipe left          | Move to previous element |
| Double tap          | Activate element         |
| Three-finger scroll | Scroll lists             |
| Two-finger tap      | Stop TTS speech          |
| Escape gesture (Z)  | Dismiss modal/sheet      |

## 12.2 Dynamic Type

All text uses the system font (SF Pro) with Dynamic Type support. Font sizes adapt to the user's preferred text size in iOS Settings.

### Text Size Scaling

| Text Element     | Default Size | Minimum (Accessibility) | Maximum (Accessibility) |
| ---------------- | ------------ | ----------------------- | ----------------------- |
| Heading          | 24-32pt      | 20pt                    | 64pt                    |
| Body             | 16pt         | 14pt                    | 36pt                    |
| Secondary        | 14pt         | 12pt                    | 32pt                    |
| Caption          | 12pt         | 11pt                    | 28pt                    |
| Monospace (code) | 14pt         | 12pt                    | 28pt                    |

### Layout Adaptations

- Message bubbles expand vertically to accommodate larger text
- Navigation items increase height for larger text
- Bottom sheets increase snap points for larger text
- Horizontal layouts switch to vertical when text would overflow

## 12.3 Touch Targets

All interactive elements meet the **44x44pt minimum** touch target requirement per Apple Human Interface Guidelines.

| Element            | Visual Size | Touch Target             |
| ------------------ | ----------- | ------------------------ |
| Hamburger button   | 22pt icon   | 44x44pt                  |
| Send button        | 36pt circle | 44x44pt                  |
| Attachment button  | 20pt icon   | 44x44pt                  |
| Voice button       | 20pt icon   | 44x44pt                  |
| Model pill         | varies      | 44pt height minimum      |
| Toggle switch      | 51x31pt     | 44x44pt (iOS default)    |
| Agent card         | varies      | Full width, 44pt+ height |
| Approval buttons   | varies      | 44pt height minimum      |
| Sidebar nav items  | varies      | Full width, 44pt height  |
| Conversation items | varies      | Full width, 44pt+ height |

## 12.4 Color Contrast

All text meets **WCAG AA** contrast requirements (4.5:1 for normal text, 3:1 for large text).

| Text                                         | Background             | Contrast Ratio | Passes    |
| -------------------------------------------- | ---------------------- | -------------- | --------- |
| `#f5f7fb` (primary)                          | `#0f0f0f` (background) | 18.3:1         | Yes (AAA) |
| `rgba(245,247,251,0.75)` (secondary)         | `#0f0f0f`              | 13.4:1         | Yes (AAA) |
| `rgba(245,247,251,0.50)` (muted)             | `#0f0f0f`              | 8.7:1          | Yes (AA)  |
| `#21808d` (teal) on `#0f0f0f`                | --                     | 4.8:1          | Yes (AA)  |
| `#000000` (black) on `#21808d` (teal button) | --                     | 4.8:1          | Yes (AA)  |
| `#ef4444` (error) on `#0f0f0f`               | --                     | 5.2:1          | Yes (AA)  |
| `#10b981` (success) on `#0f0f0f`             | --                     | 6.1:1          | Yes (AA)  |

## 12.5 Motion & Animation

- All animations respect `UIAccessibilityIsReduceMotionEnabled`
- When Reduce Motion is enabled:
  - Page transitions use cross-dissolve instead of slide
  - Pulsing indicators become static
  - Waveform metering visualization is replaced with a simple level meter
  - Skeleton loaders use opacity change instead of shimmer
- `react-native-reanimated` animations configured with `reduceMotion: ReduceMotion.System`

## 12.6 Color Blindness Considerations

- Risk levels use both color AND text labels (not color alone)
  - Low: Green circle + "Low Risk" text
  - Medium: Amber circle + "Medium Risk" text
  - High: Red circle + "High Risk" text
- Agent status uses both color AND icon/text
  - Running: Blue + spinning icon
  - Completed: Green + check icon
  - Failed: Red + X icon
  - Waiting: Amber + clock icon
- Approve/Deny buttons use shape difference (filled vs. outline) in addition to color

## 12.7 Keyboard Navigation (External Keyboard on iPad)

| Key            | Action                                |
| -------------- | ------------------------------------- |
| `Cmd + N`      | New conversation                      |
| `Cmd + Return` | Send message                          |
| `Cmd + K`      | Open model picker                     |
| `Escape`       | Dismiss modal/sheet, cancel recording |
| `Tab`          | Move between input fields             |
| `Cmd + ,`      | Open settings                         |
| `Cmd + D`      | Open companion screen                 |

---

# Section 13: Competitive Analysis

## 13.1 Competitor Overview

### 13.1.1 Claude iOS App (Anthropic)

**Version analyzed**: Claude for iOS (March 2026)

**What they do well:**

- Clean, minimal chat interface with excellent typography
- Artifacts rendering (code, documents, visualizations)
- Thinking/reasoning display with collapsible blocks
- Smooth streaming animation with cursor
- Projects feature for organizing conversations with custom instructions
- Smooth voice conversation mode
- Dark mode with warm tones

**What they lack:**

- Single model only (Claude) -- no model switching
- No desktop agent pairing (Remote Control requires Max tier at $100-200/month)
- No live agent dashboard
- No remote tool approval
- No push notifications for agent actions
- No background processing
- No scheduled tasks
- No voice input transcription (voice mode is limited to conversation)
- No messaging platform integrations

**UI patterns worth noting:**

- Conversation list in a bottom tab (not sidebar drawer)
- Bottom tabs: Chats, Artifacts, Projects
- Message input at bottom with attachment and voice buttons
- Clean white-on-dark text with good readability
- Settings accessible from profile icon

### 13.1.2 Claude Remote Control (Anthropic, Max Tier)

**Price**: $100-200/month (Claude Max subscription)

**What it offers:**

- Mobile access to Claude computer use agent
- View agent actions remotely
- Limited intervention capability

**Why AGI Workforce wins:**

- AGI Workforce companion is **free** -- not gated behind $100-200/month
- AGI Workforce supports **any LLM**, not just Claude
- AGI Workforce provides **real-time agent dashboard** with full lifecycle control (pause/resume/cancel)
- AGI Workforce provides **push notifications** for approval requests
- AGI Workforce provides **background polling** for agent status
- AGI Workforce supports **WebRTC data channel** for low-latency control
- AGI Workforce pairs via **QR code** -- simple, instant, no account linking required

### 13.1.3 ChatGPT iOS App (OpenAI)

**Version analyzed**: ChatGPT for iOS (March 2026)

**What they do well:**

- Voice conversation mode with natural voice synthesis
- GPT-4o multimodal (images, voice, text in one input)
- Code Interpreter for running Python code
- Web browsing for current information
- DALL-E image generation inline
- Memory feature for personalization
- Smooth, polished animations
- Large user base and ecosystem

**What they lack:**

- Single model family only (GPT-4/4o/o1/o3) -- no external models
- No desktop agent pairing
- No live agent dashboard
- No tool approval workflow
- No scheduled tasks
- No messaging integrations
- No thinking/reasoning display (except o1/o3 summary)

**UI patterns worth noting:**

- Bottom tab with Chats and Explore (GPT Store)
- Floating compose button for new chat
- Inline image generation with progress indicator
- Voice mode with full-screen animated orb
- Settings in profile sidebar

### 13.1.4 Gemini iOS App (Google)

**Version analyzed**: Google Gemini for iOS (March 2026)

**What they do well:**

- Deep Google ecosystem integration (Gmail, Calendar, Maps, YouTube)
- Real-time information via Google Search
- Image generation via Imagen
- Conversational UI with suggestions
- Google account single sign-on

**What they lack:**

- Single model family only (Gemini) -- no external models
- No desktop agent pairing
- No agent monitoring or control
- No scheduled tasks
- No voice input transcription (limited to voice queries)
- No thinking/reasoning display
- No tool approval workflow
- No messaging integrations
- Limited conversation history management

## 13.2 Feature-by-Feature Comparison Table

| Feature                    | AGI Workforce iOS        | Claude iOS                | ChatGPT iOS            | Gemini iOS    |
| -------------------------- | ------------------------ | ------------------------- | ---------------------- | ------------- |
| **Chat**                   |                          |                           |                        |               |
| Multi-model chat           | 9+ providers             | Claude only               | GPT only               | Gemini only   |
| Model switching            | In-chat, any time        | N/A                       | GPT-4/4o/o1 only       | N/A           |
| Streaming responses        | Yes                      | Yes                       | Yes                    | Yes           |
| Thinking/reasoning         | Yes (collapsible)        | Yes (Artifacts)           | Limited (o1 summary)   | No            |
| Code blocks                | Yes (syntax highlight)   | Yes                       | Yes                    | Yes           |
| Image input                | Yes (camera + library)   | Yes                       | Yes (multimodal)       | Yes           |
| Image generation           | Yes                      | No                        | Yes (DALL-E)           | Yes (Imagen)  |
| Voice input (STT)          | Yes (Whisper + Deepgram) | Voice mode only           | Voice mode             | Voice query   |
| Voice conversation         | Yes (TTS)                | Yes                       | Yes (advanced)         | Yes (basic)   |
| Web search                 | Via desktop agent        | No                        | Yes (browsing)         | Yes (native)  |
| Code execution             | No (desktop only)        | No                        | Yes (Code Interpreter) | Limited       |
| File upload                | Images                   | Yes (PDF, text)           | Yes (all types)        | Yes (limited) |
| Citations                  | Yes                      | No                        | Yes                    | Yes           |
| **Agent Control**          |                          |                           |                        |               |
| Desktop pairing            | Yes (QR, free)           | Remote Control ($100+/mo) | No                     | No            |
| Live agent dashboard       | Yes                      | No                        | No                     | No            |
| Remote tool approval       | Yes                      | No                        | No                     | No            |
| Agent pause/resume/cancel  | Yes                      | No                        | No                     | No            |
| Push notifications (agent) | Yes                      | No                        | No                     | No            |
| Background agent polling   | Yes                      | No                        | No                     | No            |
| **Organization**           |                          |                           |                        |               |
| Conversation history       | Yes (grouped by time)    | Yes                       | Yes                    | Yes           |
| Conversation search        | Planned                  | Yes                       | Yes                    | Yes           |
| Pinned conversations       | Planned                  | No                        | No                     | No            |
| Tags/categories            | Yes (auto-tag)           | No (Projects)             | No                     | No            |
| Scheduled tasks            | Yes                      | No                        | No                     | No            |
| Agent memory               | Yes (CRUD)               | No (Projects context)     | Yes (Memory)           | No            |
| **Platform**               |                          |                           |                        |               |
| Offline access             | Yes (MMKV cache)         | Limited                   | Limited                | No            |
| Messaging integrations     | Yes (3 platforms)        | No                        | No                     | No            |
| Dark mode                  | Yes (default)            | Yes                       | Yes                    | Yes           |
| iPad support               | Yes (adaptive sidebar)   | Yes                       | Yes                    | Yes           |
| Widgets (planned)          | Yes                      | No                        | No                     | Yes (Google)  |
| Siri Shortcuts (planned)   | Yes                      | No                        | No                     | No            |
| Dynamic Island (planned)   | Yes                      | No                        | No                     | No            |
| Share Extension (planned)  | Yes                      | No                        | No                     | No            |
| **Pricing**                |                          |                           |                        |               |
| Free tier                  | Yes                      | Yes (limited)             | Yes (limited)          | Yes (limited) |
| Agent control price        | Free                     | $100-200/mo (Max)         | N/A                    | N/A           |

## 13.3 Where AGI Workforce Leads

1. **Desktop Agent Pairing (free)** -- The only mobile app that pairs with a desktop AI agent platform for free. Claude's Remote Control requires a $100-200/month subscription. ChatGPT and Gemini have no equivalent.

2. **Live Agent Dashboard** -- Real-time monitoring of multiple concurrent agents with progress tracking, step-by-step status, and tool execution history. No competitor offers this on mobile.

3. **Remote Tool Approval** -- Push-notification-driven approve/deny workflow for sensitive tool executions. Users can authorize file deletions, command executions, and API calls from their phone while away from their desk.

4. **Multi-Model Freedom** -- Chat with Claude, GPT-4o, Gemini, Mistral, and local models all in one app. Every competitor locks users to their own model family.

5. **Background Agent Polling** -- iOS background fetch checks for pending approvals every 15 minutes, even when the app is terminated. No competitor monitors agent activity in the background.

6. **Scheduled Agent Tasks** -- Create and manage recurring AI tasks directly from mobile. No competitor offers mobile-based task scheduling.

7. **WebRTC Low-Latency Control** -- Direct peer-to-peer data channel between phone and desktop for sub-100ms control latency. Falls back to WebSocket relay gracefully.

## 13.4 Where Parity is Needed

1. **Voice Conversation Quality** -- ChatGPT's voice mode (with GPT-4o's native voice) is significantly ahead. AGI Workforce uses Whisper STT + expo-speech TTS, which is functional but lacks the natural, conversational feel of native voice synthesis. **Plan**: Integrate ElevenLabs or Deepgram TTS for higher-quality voice output.

2. **Code Execution on Mobile** -- ChatGPT offers Code Interpreter directly on mobile. AGI Workforce delegates code execution to the desktop agent. **Plan**: Add cloud-based sandboxed code execution via API gateway.

3. **File Upload Variety** -- ChatGPT and Claude support PDF, text, and other document types. AGI Workforce currently supports images only. **Plan**: Add document upload via the file upload API.

4. **Conversation Search** -- All competitors offer in-conversation search. AGI Workforce has this planned but not yet implemented. **Plan**: Add full-text search across conversations using Supabase full-text search.

5. **Rich Artifacts** -- Claude's Artifacts feature renders interactive visualizations, React components, and documents. AGI Workforce displays code blocks and text. **Plan**: Add a WebView-based artifact renderer for interactive content.

## 13.5 Strategic Gaps to Own

These are capabilities that no competitor offers on mobile and where AGI Workforce can establish category leadership:

1. **Agent Orchestration from Mobile** -- Future: Create and launch new agent tasks directly from the phone, selecting tools, model, and parameters. Currently, agents can only be monitored (not created) from mobile.

2. **Multi-Desktop Management** -- Future: Pair with multiple desktops simultaneously (home + office + cloud VM). Monitor and control agents across all connected machines from a single mobile dashboard.

3. **Agent Analytics Dashboard** -- Future: Mobile-optimized charts showing agent success rates, cost per task, token usage, and time-to-completion trends.

4. **Collaborative Agent Control** -- Future: Team-based agent monitoring where multiple team members can view and approve agent actions from their individual phones.

5. **Offline Agent Queuing** -- Future: Queue agent tasks while offline. When connectivity returns, tasks are dispatched to the desktop automatically.

6. **iOS Shortcuts Automation** -- Future: Create iOS Shortcuts that trigger AGI Workforce agent tasks. Example: "When I arrive at the office, start the morning briefing agent."

7. **Watch App** -- Future: Apple Watch companion for quick approve/deny actions on the wrist, agent status glances, and voice quick-ask.

---

# Appendix A: Mobile-First UX Patterns

## A.1 Bottom Sheet Modals

All modal interactions use `@gorhom/bottom-sheet` instead of full-screen modals:

- Model picker: 50% and 90% snap points
- Agent details: 60% and 90% snap points
- Schedule form: 70% and 90% snap points
- Memory add/edit: 40% and 70% snap points
- Confirmation dialogs: 30% snap point

Bottom sheet style:

- Background: `surfaceElevated` (`#1a1a1a`)
- Handle: 4pt height, 40pt width, `white/20`, centered
- Border radius: 16pt (top corners)
- Backdrop: 50% black opacity, tap to dismiss
- Gesture: Swipe down to dismiss

## A.2 Swipe Actions

| Element           | Swipe Direction | Action       | Visual                     |
| ----------------- | --------------- | ------------ | -------------------------- |
| Conversation item | Left            | Delete       | Red background, trash icon |
| Memory entry      | Left            | Delete       | Red background, trash icon |
| Schedule card     | Left            | Delete       | Red background, trash icon |
| Message bubble    | Left            | Copy / Reply | Gray background, copy icon |

## A.3 Pull to Refresh

| Screen      | Refresh Action                     |
| ----------- | ---------------------------------- |
| Home screen | Reload conversations               |
| Chat screen | Reload messages                    |
| Agent list  | Request agent refresh from desktop |
| Schedules   | Reload schedules from API          |
| Memories    | Reload memories from API           |
| Messaging   | Reload platform connections        |

## A.4 Infinite Scroll

- Conversation list: Loads 50 at a time, paginated on scroll
- Message list: Loads 50 at a time, older messages loaded on scroll-to-top
- Memory list: Loads 50 at a time
- Schedule runs: Loads 20 at a time

## A.5 Safe Area Insets

All screens wrapped in `SafeAreaView` from `react-native-safe-area-context`:

- Top: Status bar + notch/Dynamic Island
- Bottom: Home indicator bar
- Left/Right: Not applicable (portrait only on iPhone)

## A.6 Keyboard Avoidance

- Login screen: `KeyboardAvoidingView` with `behavior="padding"` on iOS
- Chat input: Input bar rises above keyboard naturally (flexbox layout)
- Create schedule: `KeyboardAvoidingView` with scroll
- All forms: `keyboardShouldPersistTaps="handled"` on ScrollView
- Dismiss on scroll: `keyboardDismissMode="on-drag"` on message list

## A.7 Dark Mode

The app ships with dark mode as the only theme (matching the desktop app's design philosophy). The `userInterfaceStyle` in `app.json` is set to `"dark"`.

- Status bar: `style="light"` (white status bar text)
- Splash screen background: `#0f0f0f`
- No light mode toggle (intentional design decision)
- System appearance is overridden -- app is always dark

Future: Light mode may be added as a setting if user demand warrants it.

---

# Appendix B: Data Models Reference

## B.1 Supabase Tables

### conversations

| Column          | Type          | Description                 |
| --------------- | ------------- | --------------------------- |
| `id`            | `uuid`        | Primary key                 |
| `user_id`       | `uuid`        | Foreign key to auth.users   |
| `title`         | `text`        | Conversation title          |
| `model`         | `text`        | Model used for conversation |
| `message_count` | `integer`     | Number of messages          |
| `created_at`    | `timestamptz` | Creation timestamp          |
| `updated_at`    | `timestamptz` | Last update timestamp       |

### messages

| Column            | Type          | Description                     |
| ----------------- | ------------- | ------------------------------- |
| `id`              | `uuid`        | Primary key                     |
| `conversation_id` | `uuid`        | Foreign key to conversations    |
| `user_id`         | `uuid`        | Foreign key to auth.users       |
| `role`            | `text`        | 'user' / 'assistant' / 'system' |
| `content`         | `text`        | Message content                 |
| `model`           | `text`        | Model used for this message     |
| `created_at`      | `timestamptz` | Creation timestamp              |

### RLS Policies

Both tables have Row Level Security (RLS) policies that filter by `user_id = auth.uid()`, ensuring users can only access their own data. The Realtime subscription filters are also scoped by user ID.

---

# Appendix C: Error Message Catalog

## C.1 Authentication Errors

| Context                   | Message                                                        |
| ------------------------- | -------------------------------------------------------------- |
| Invalid credentials       | "Invalid email or password. Please try again."                 |
| Email already registered  | "An account with this email already exists."                   |
| Weak password             | "Password must be at least 8 characters."                      |
| Network error during auth | "Unable to connect. Please check your internet connection."    |
| Rate limited              | "Too many attempts. Please wait a moment before trying again." |
| Session expired           | "Your session has expired. Please sign in again."              |
| Unknown auth error        | "Something went wrong. Please try again."                      |

## C.2 Chat Errors

| Context                   | Message                                                |
| ------------------------- | ------------------------------------------------------ |
| Send failed (network)     | "Failed to connect. Check your network and try again." |
| Send failed (other)       | "Something went wrong. Please try again."              |
| Stream error              | "Something went wrong. Please try again."              |
| Load conversations failed | "Failed to load conversations"                         |
| Load messages failed      | "Failed to load messages"                              |
| Rename failed             | "Failed to rename conversation"                        |
| Delete failed             | "Failed to delete conversation"                        |

## C.3 Companion Errors

| Context           | Message                                                      |
| ----------------- | ------------------------------------------------------------ |
| Connection error  | "Unable to reach the pairing server. Check your connection." |
| Connection closed | "Connection to pairing server lost."                         |
| Invalid code      | "Invalid pairing code. Please try again."                    |
| Session full      | "This pairing session already has two devices connected."    |
| Rate limited      | "Too many attempts. Please wait a moment."                   |
| Session expired   | "Pairing session expired. Please scan a new QR code."        |
| Unknown           | "An unexpected error occurred."                              |

## C.4 Voice Errors

| Context              | Message                                         |
| -------------------- | ----------------------------------------------- |
| Permission denied    | "Microphone permission denied"                  |
| Already recording    | "Recording already in progress"                 |
| No recording active  | "No recording in progress"                      |
| Recording failed     | "Recording failed: no URI returned"             |
| Transcription failed | "Transcription failed: HTTP [status] -- [body]" |

## C.5 General Errors

| Context               | Message                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| Upload failed         | "Upload failed: HTTP [status]: [body]"                                 |
| Schedule CRUD failure | "Failed to [create/update/delete/load] schedule"                       |
| Memory CRUD failure   | "Failed to [add/update/delete/fetch/search/sync] memories"             |
| Messaging failure     | "Failed to [load/connect/disconnect] messaging [connections/platform]" |

---

# Appendix D: Analytics Events

## D.1 Event Taxonomy

| Event                           | Properties                                                | Trigger                          |
| ------------------------------- | --------------------------------------------------------- | -------------------------------- | ---------------------- | ------------------------- |
| `app_opened`                    | `source: 'cold_start'                                     | 'background'                     | 'notification'`        | App becomes active        |
| `user_signed_in`                | `method: 'email'                                          | 'apple'                          | 'google'`              | Successful authentication |
| `user_signed_out`               | --                                                        | Sign out button tapped           |
| `onboarding_completed`          | `slides_viewed: number`                                   | Onboarding finish                |
| `onboarding_skipped`            | `slide_index: number`                                     | Onboarding skip                  |
| `conversation_created`          | `model: string`                                           | New conversation created         |
| `message_sent`                  | `model: string, conversation_id: string`                  | User message sent                |
| `message_streamed`              | `model: string, token_count: number, duration_ms: number` | Streaming complete               |
| `streaming_stopped`             | `tokens_received: number`                                 | Stop button tapped               |
| `model_selected`                | `model_id: string, provider: string`                      | Model changed in picker          |
| `companion_paired`              | `method: 'qr'                                             | 'manual_code'                    | 'deep_link'`           | Desktop paired            |
| `companion_disconnected`        | `duration_ms: number`                                     | Desktop disconnected             |
| `agent_approval_approved`       | `tool_name: string, risk_level: string`                   | Approval button tapped           |
| `agent_approval_denied`         | `tool_name: string, risk_level: string`                   | Deny button tapped               |
| `agent_command_sent`            | `command: 'pause'                                         | 'resume'                         | 'cancel'`              | Agent lifecycle command   |
| `voice_recording_started`       | --                                                        | Record button tapped             |
| `voice_recording_completed`     | `duration_ms: number`                                     | Recording stopped                |
| `voice_transcription_completed` | `method: 'whisper'                                        | 'deepgram', duration_ms: number` | Transcription returned |
| `schedule_created`              | `recurrence: string, model: string`                       | Schedule created                 |
| `notification_received`         | `type: string`                                            | Push notification arrived        |
| `notification_tapped`           | `type: string, route: string`                             | User tapped notification         |
| `settings_changed`              | `setting: string, value: string`                          | Settings toggle changed          |

---

# Appendix E: Glossary

| Term                 | Definition                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **Agent**            | An AI model instance running autonomously on the desktop, executing a multi-step task with tool access. |
| **Approval Request** | A pending tool execution that requires user authorization before proceeding.                            |
| **Companion**        | The mobile-to-desktop pairing feature that enables remote agent monitoring and control.                 |
| **DataChannel**      | A WebRTC peer-to-peer data channel for low-latency control messages between mobile and desktop.         |
| **Deep Link**        | A URL (`agiworkforce://...`) that opens the app to a specific screen or triggers a specific action.     |
| **EAS**              | Expo Application Services -- cloud-based build and update infrastructure.                               |
| **FlashList**        | Shopify's high-performance virtualized list component for React Native.                                 |
| **Keychain**         | Apple's secure storage system for sensitive data, backed by hardware encryption.                        |
| **MMKV**             | A fast key-value storage library (WeChat's MMKV) used for non-sensitive app data.                       |
| **OTA Update**       | Over-the-air JavaScript bundle update delivered without App Store review.                               |
| **Pairing Code**     | A 6-12 character alphanumeric string used to establish a companion connection.                          |
| **PKCE**             | Proof Key for Code Exchange -- a secure OAuth extension used for mobile auth flows.                     |
| **Signaling Server** | WebSocket server that mediates the initial connection between mobile and desktop peers.                 |
| **SSE**              | Server-Sent Events -- the protocol used for streaming LLM responses.                                    |
| **STT**              | Speech-to-Text -- converting voice recording to text (via Whisper or Deepgram).                         |
| **TTS**              | Text-to-Speech -- reading AI responses aloud (via expo-speech).                                         |
| **WebRTC**           | Web Real-Time Communication -- used for peer-to-peer data channels between mobile and desktop.          |

---

_End of PRD-IOS.md_

_Document version 1.0.0 -- Generated 2026-03-09_
