# AGI Workforce — Product Requirements Document

## Section 8: Mobile Applications (iOS & Android)

**Document version**: 1.2.0
**Last updated**: 2026-02-26
**Status**: APPROVED — all UX/UI decisions locked, ready for implementation
**Owner**: Product Team
**References**: Section 1 (Vision), Section 2 (Architecture), `services/api-gateway/src/routes/mobile.ts`

## Locked Decisions (2026-02-26)

| Decision       | Choice                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| Framework      | React Native + Expo SDK 52                                                      |
| UI System      | NativeWind v4 + shadcn/ui React Native port                                     |
| Icons          | lucide-react-native (matches desktop)                                           |
| State          | Zustand v5 + MMKV persistence                                                   |
| Scope          | Full v1.0 — standalone chat + desktop companion                                 |
| Architecture   | `apps/mobile/` in monorepo → existing API gateway                               |
| Platforms      | iOS 17+ (iPhone + iPad universal) + Android 13+                                 |
| App name       | AGI Workforce · `com.agiworkforce.mobile`                                       |
| LLM providers  | ChatGPT, Claude, Gemini, Perplexity + others — no Ollama in v1                  |
| Must-haves     | All providers · Voice (Whisper) · Camera · Desktop companion + QR pairing       |
| Distribution   | Apple App Store + Google Play · TestFlight + Firebase App Distribution for beta |
| Home screen    | Blank — just the input bar (no suggestions, no recent chats)                    |
| Model selector | Inside the input bar — robot icon on left, tap → bottom sheet picker            |
| Agent approval | Inline card in chat thread (no push notification popup)                         |
| Agent activity | Inline collapsible steps in chat thread (Thinking / Searching / Coding rows)    |
| Navigation     | iPhone: hamburger → slide-in drawer · iPad: persistent sidebar                  |
| Onboarding     | Login screen straight (no carousel) — Apple / Google / Email                    |

---

## 8.1 Executive Summary

AGI Workforce Mobile extends the flagship desktop AI agent platform to iOS and Android. Unlike competing mobile AI apps (Claude, ChatGPT) which are standalone chat interfaces, AGI Workforce Mobile serves two simultaneous roles:

1. **Standalone AI assistant** — multi-LLM chat, voice, vision, and system integrations on-the-go
2. **Desktop companion** — monitor, control, and receive output from background agents running on the user's desktop via secure WebRTC pairing

The existing API gateway already includes a full mobile device management layer (`/mobile/register`, `/mobile/push-token`, `/mobile/pairing-code`) and WebRTC signaling server. The mobile apps will complete this infrastructure.

**Target platforms**:

- iOS 17.0+ (iPhone and iPad)
- Android 13+ (API level 33+)

**Target tech stack**: React Native + Expo (shared codebase, 95% code reuse)

---

## 8.2 Problem Statement

### 8.2.1 Gap in the Current Product Suite

AGI Workforce v1.x ships a desktop app (macOS/Windows/Linux), a web app, and a browser extension. Users are tethered to their desktops to interact with or monitor AI agents, even when those agents are running background tasks that could take hours.

Specific pain points:

- Background agents run on desktop but users cannot check status on mobile
- Long-running research or data-processing tasks have no mobile monitoring interface
- No push notifications when an agent completes a task or needs approval
- The multi-LLM routing engine is inaccessible on mobile devices
- Users switch to Claude or ChatGPT mobile apps as a temporary workaround — fragmenting their workflow and sending conversations to a competing vendor

### 8.2.2 Competitive Gap

| Capability                          | Claude Mobile | ChatGPT Mobile | **AGI Workforce Mobile** |
| ----------------------------------- | :-----------: | :------------: | :----------------------: |
| Multi-LLM (9+ providers)            |      No       |       No       |         **Yes**          |
| Desktop companion / pairing         |      No       |       No       |         **Yes**          |
| Background agent monitoring         |      No       |       No       |         **Yes**          |
| Push notifications for agent events |      No       |       No       |         **Yes**          |
| MCP tool access                     |      No       |       No       |         **Yes**          |
| Local model routing (Ollama)        |      No       |       No       |         **Yes**          |
| Voice mode                          |      Yes      |      Yes       |         **Yes**          |
| Camera / vision                     |      Yes      |      Yes       |         **Yes**          |
| iOS system integrations             |      Yes      |    Partial     |         **Yes**          |
| Android system integrations         |      Yes      |    Partial     |         **Yes**          |
| Home screen widgets                 | Android only  |       No       |      **Yes (both)**      |
| Swarm / multi-agent view            |      No       |       No       |         **Yes**          |

---

## 8.3 Goals & Non-Goals

### Goals

1. Ship a production-quality iOS app to the App Store and Android app to Google Play
2. Feature parity with Claude Mobile on standalone AI assistant capabilities
3. Unique desktop companion capability (no competitor has this)
4. Unified account and subscription across desktop, web, and mobile
5. Zero additional backend work — use the existing API gateway and signaling server
6. 95%+ shared codebase between iOS and Android via React Native + Expo

### Non-Goals (v1.0)

- Independent agent execution on-device (agents run on desktop, mobile is the monitor/controller)
- On-device local model inference (out of scope for v1.0 — possible in v2.0)
- Vision-based computer use on mobile (desktop-only feature)
- Custom MCP server configuration from mobile (view-only in v1.0)

---

## 8.4 Target Users

Same three segments as the desktop app, with mobile-specific usage patterns:

### 8.4.1 Developers and Power Users (Mobile Companion Segment)

- Already using AGI Workforce desktop for long-running agent tasks
- Need to step away from desk while agents work
- Want push notifications when agents complete, fail, or need approval
- Want to review agent output and continue conversations on phone

### 8.4.2 AI Enthusiasts (Standalone Mobile Segment)

- Want best-in-class multi-LLM mobile chat
- Compare Claude Sonnet vs. GPT-4o vs. Gemini in same session
- Voice-first workflows: brainstorming while commuting
- Camera workflows: photo analysis, document scanning, real-time vision

### 8.4.3 Enterprise Users (Monitoring Segment)

- Team leads monitoring multiple agents running across the fleet
- Receive approval requests (ToolGuard prompts) on mobile
- View audit logs and agent activity in real time
- Escalation path: agents that hit a permission boundary can ping the user's phone

---

## 8.5 Feature Requirements

### 8.5.1 Core Chat (Both Platforms)

| ID     | Feature                                       | Priority | Notes                              |
| ------ | --------------------------------------------- | :------: | ---------------------------------- |
| M-C-01 | Multi-LLM model selector (all 9+ providers)   |    P0    | Same model list as desktop via API |
| M-C-02 | Streaming token-by-token response display     |    P0    | SSE via API gateway                |
| M-C-03 | Conversation history (synced via Supabase)    |    P0    | Cross-device sync                  |
| M-C-04 | Projects / organized conversation grouping    |    P0    | Match desktop Projects feature     |
| M-C-05 | Image attachment (camera + photo library)     |    P0    | Vision analysis                    |
| M-C-06 | File attachment (PDF, DOCX, TXT, CSV)         |    P1    | Document analysis                  |
| M-C-07 | Voice input (Whisper STT via API)             |    P0    | Multilingual                       |
| M-C-08 | Voice output (TTS response playback)          |    P1    | Piper / OS native TTS              |
| M-C-09 | Conversational voice mode                     |    P1    | Hands-free back-and-forth          |
| M-C-10 | Code block rendering with syntax highlighting |    P0    | Inline, with copy button           |
| M-C-11 | Markdown rendering                            |    P0    | Tables, lists, headers, bold       |
| M-C-12 | Web search (when supported by model/plan)     |    P1    | Route to search-enabled models     |
| M-C-13 | Artifact / canvas view (code, HTML, SVGs)     |    P2    | Desktop parity                     |
| M-C-14 | System prompt / custom instructions           |    P1    | Per-conversation or global         |
| M-C-15 | Reasoning / extended thinking view            |    P2    | For Claude Sonnet, o3, etc.        |
| M-C-16 | Share conversation (text export, link)        |    P1    | Native share sheet                 |
| M-C-17 | Haptic feedback on responses                  |    P2    | Mobile-native polish               |
| M-C-18 | Dark mode (follows system setting)            |    P0    | Auto + manual override             |

### 8.5.2 Desktop Companion (Both Platforms — AGI Workforce Exclusive)

| ID     | Feature                                        | Priority | Notes                                             |
| ------ | ---------------------------------------------- | :------: | ------------------------------------------------- |
| M-D-01 | QR code desktop pairing (via signaling server) |    P0    | `/mobile/pairing-code` endpoint already built     |
| M-D-02 | Live agent status dashboard                    |    P0    | Shows running, queued, completed agents           |
| M-D-03 | Agent output streaming to mobile               |    P0    | WebRTC data channel from desktop                  |
| M-D-04 | Push notification: agent task completed        |    P0    | APNs (iOS) + FCM (Android) via push token         |
| M-D-05 | Push notification: agent needs approval        |    P0    | Deep link opens approval dialog                   |
| M-D-06 | Remote approve/deny ToolGuard requests         |    P0    | Security-critical — user is the human-in-the-loop |
| M-D-07 | Remote pause/resume/cancel agent               |    P1    | Full lifecycle control from phone                 |
| M-D-08 | Agent output review (scroll artifact on phone) |    P1    | View desktop agent output on mobile               |
| M-D-09 | Continue conversation on mobile                |    P1    | Continue a desktop chat thread on phone           |
| M-D-10 | Send new task to desktop agent                 |    P1    | Fire-and-forget agent dispatch from mobile        |
| M-D-11 | Multi-device: pair up to 5 devices per account |    P2    | Multiple phones/tablets                           |
| M-D-12 | Connection status indicator                    |    P0    | Desktop online/offline/reconnecting               |

### 8.5.3 iOS-Specific Features

| ID     | Feature                                           | Priority | Notes                                       |
| ------ | ------------------------------------------------- | :------: | ------------------------------------------- |
| M-I-01 | Siri Shortcut: "Hey Siri, ask AGI Workforce..."   |    P1    | App Intents framework                       |
| M-I-02 | Messages integration — draft & send               |    P1    | iOS App Intents (Messages, WhatsApp, Slack) |
| M-I-03 | Mail / Gmail integration — compose email          |    P1    | Pre-fill native mail compose sheet          |
| M-I-04 | Calendar integration — create & read events       |    P1    | EventKit                                    |
| M-I-05 | Reminders integration — add reminders             |    P2    | EventKit                                    |
| M-I-06 | Maps integration — navigate to location           |    P1    | MapKit + Apple Maps                         |
| M-I-07 | Apple Health read access                          |    P2    | HealthKit, US-only, Pro/Max                 |
| M-I-08 | iCloud Drive file picker                          |    P1    | UIDocumentPickerViewController              |
| M-I-09 | Share Extension — share any content to chat       |    P0    | Share Sheet extension target                |
| M-I-10 | Action Extension — analyze selected text          |    P2    | Context menu action                         |
| M-I-11 | iOS Live Activity — agent progress on Lock Screen |    P2    | ActivityKit                                 |
| M-I-12 | Dynamic Island indicator (iPhone 14 Pro+)         |    P3    | Live Activity island pill                   |
| M-I-13 | Spotlight Search integration                      |    P2    | CSSearchableItem — recent conversations     |
| M-I-14 | iPad multitasking / Split View                    |    P1    | Adaptive layout, sidebar + chat             |
| M-I-15 | Apple Pencil handwriting to text                  |    P3    | PencilKit on iPad                           |
| M-I-16 | CarPlay (read-only voice mode)                    |    P3    | CarPlay entitlement, audio-only             |

### 8.5.4 Android-Specific Features

| ID     | Feature                                         | Priority | Notes                                     |
| ------ | ----------------------------------------------- | :------: | ----------------------------------------- |
| M-A-01 | Home screen widget: New Chat                    |    P0    | AppWidget — 1×1 shortcut                  |
| M-A-02 | Home screen widget: Voice Query                 |    P0    | AppWidget — 1×1, launches with mic        |
| M-A-03 | Home screen widget: Agent Status                |    P1    | AppWidget — 4×2, shows active agent names |
| M-A-04 | App Shortcuts (long-press icon)                 |    P0    | New Chat, Voice, Analyze Photo            |
| M-A-05 | Share Target — share to AGI Workforce           |    P0    | Receive content from any app              |
| M-A-06 | Share Source — share response to any app        |    P0    | Share Sheet integration                   |
| M-A-07 | Google Calendar integration                     |    P1    | CalendarContract provider                 |
| M-A-08 | Google Maps navigation integration              |    P1    | Intent: geo: URI                          |
| M-A-09 | Gmail / email draft integration                 |    P1    | Intent: mailto: URI                       |
| M-A-10 | Clock / Alarm integration                       |    P1    | AlarmManager intent                       |
| M-A-11 | Health Connect integration                      |    P2    | Android 14+, US-only, Pro/Max             |
| M-A-12 | Predictive back gesture support                 |    P1    | Android 13+ predictive back API           |
| M-A-13 | Notification categories (agent events vs. chat) |    P0    | Notification channels                     |
| M-A-14 | Bubbles API (floating conversation)             |    P3    | BubbleMetadata                            |
| M-A-15 | Google Assistant integration                    |    P2    | App Actions / Google Assistant            |
| M-A-16 | Foldable phone support (Z Fold, Pixel Fold)     |    P2    | Adaptive layout for inner/outer screens   |
| M-A-17 | Work Profile / managed device support           |    P2    | Enterprise MDM compatibility              |

---

## 8.6 Technical Architecture

### 8.6.1 Tech Stack Decision: React Native + Expo

**Chosen**: React Native + Expo SDK 52 + Expo Router

**Rationale**:

- The team already has deep React/TypeScript expertise from the desktop and web apps
- Expo Router provides file-based routing matching Next.js App Router conventions already in use
- 95%+ code reuse between iOS and Android
- Native modules available for all required platform APIs (camera, audio, health, widgets via Expo Modules API)
- EAS Build + EAS Submit for automated App Store / Google Play deployment
- OTA updates via Expo Updates (no App Store review for JS-only fixes)

**Project location**: `apps/mobile/` (new workspace in the monorepo)

### 8.6.2 Architecture Layers

```
apps/mobile/
  app/                    # Expo Router — file-based routing
    (auth)/               # Unauthenticated routes (login, signup)
    (tabs)/               # Main tab bar (Chat, Agents, Desktop, Settings)
      index.tsx           # Chat tab
      agents.tsx          # Agent monitor tab
      desktop.tsx         # Desktop companion tab
      settings.tsx        # Settings tab
    conversation/[id].tsx # Individual conversation
    agent/[id].tsx        # Agent detail view
  components/             # Shared UI components
  stores/                 # Zustand stores (shared subset from desktop)
  services/               # API service layer
    api.ts                # AGI Workforce API gateway client
    supabase.ts           # Auth + realtime subscriptions
    webrtc.ts             # Desktop pairing via signaling server
    push.ts               # APNs + FCM push token management
  hooks/                  # Custom React hooks
  modules/                # Native Expo modules (health, widgets)
  assets/                 # Images, fonts, icons
```

### 8.6.3 Shared Code with Desktop/Web

The mobile app reuses from `packages/`:

- `packages/types/` — all TypeScript interfaces (model types, agent types, conversation types)
- `packages/utils/` — utility functions (token counting, model metadata, formatting)

New shared additions:

- `packages/types/mobile.ts` — MobileDevice, PairingSession, AgentNotification types

### 8.6.4 API Communication

**Chat (streaming)**:

```
Mobile → POST /api/chat/stream (API gateway) → SSE stream → Mobile
```

The API gateway proxies to the appropriate LLM provider using the same `llm_router.rs` routing engine via a Tauri-free path.

**Desktop pairing**:

```
Mobile → POST /mobile/pairing-code → Signaling Server (WebSocket) → Desktop app
Desktop → WebRTC offer → Signaling Server → Mobile
Mobile → WebRTC answer → establishes P2P DataChannel
```

The DataChannel carries: agent status events, tool approval requests, streaming output chunks.

**Push notifications**:

```
Desktop Agent Event → API Gateway (POST /push/send) → APNs / FCM → Device
Device tap → deep link → app opens Agent Detail screen
```

### 8.6.5 Authentication

- Supabase Auth (same account as desktop/web)
- JWT stored in `expo-secure-store` (Keychain / Keystore)
- OAuth (Google, GitHub, Apple Sign-In) via `expo-auth-session`
- Biometric unlock (Face ID / fingerprint) via `expo-local-authentication`

### 8.6.6 State Management

Zustand with MMKV persistence (`zustand-mmkv-storage`):

- `chatStore` — active conversation, messages, model selection
- `agentStore` — agent roster, status updates
- `desktopStore` — pairing state, WebRTC connection, remote agent list
- `settingsStore` — user preferences, notification settings, biometric

---

## 8.7 Desktop Companion — Technical Deep Dive

This is the feature that has no equivalent in any competing mobile AI app.

### 8.7.1 Pairing Flow

```
1. User opens Desktop Companion tab in mobile app
2. Mobile calls POST /mobile/pairing-code (TTL: 300 seconds)
3. API gateway calls signaling server POST /pairings → returns code + QR data
4. Mobile renders QR code with embedded wsUrl + code
5. User scans QR on desktop app
6. Desktop connects to signaling server WebSocket with code
7. Desktop sends WebRTC offer through signaling server
8. Mobile receives offer → creates answer → sends back
9. P2P DataChannel established (E2E encrypted via DTLS)
10. Mobile receives real-time agent status and events
```

### 8.7.2 Agent Status Protocol (DataChannel Messages)

```typescript
// Desktop → Mobile
type DesktopEvent =
  | { type: 'agent:started'; agentId: string; name: string; task: string }
  | { type: 'agent:progress'; agentId: string; step: number; total: number; output: string }
  | { type: 'agent:completed'; agentId: string; output: string; durationMs: number }
  | { type: 'agent:failed'; agentId: string; error: string }
  | {
      type: 'agent:approval_required';
      agentId: string;
      tool: string;
      input: unknown;
      requestId: string;
    }
  | { type: 'swarm:status'; agents: AgentSummary[] };

// Mobile → Desktop
type MobileCommand =
  | { type: 'agent:approve'; requestId: string }
  | { type: 'agent:deny'; requestId: string; reason?: string }
  | { type: 'agent:pause'; agentId: string }
  | { type: 'agent:resume'; agentId: string }
  | { type: 'agent:cancel'; agentId: string }
  | { type: 'task:dispatch'; task: string; model: string };
```

### 8.7.3 Push Notification Events

```
Event                    → Notification
─────────────────────────────────────────────
agent:completed          → "Your research agent finished. Tap to view."
agent:failed             → "Agent 'Email drafter' encountered an error."
agent:approval_required  → "Agent needs your approval to use [tool]."
swarm:all_complete       → "All 5 swarm agents completed their tasks."
```

---

## 8.8 User Interface

### 8.8.1 Navigation Structure

```
Tab Bar (bottom):
├── Chat          — New conversation, model selector, voice button
├── Agents        — Active agents, history, status badges
├── Desktop       — Pairing screen or live companion view
└── Settings      — Account, model defaults, notifications, subscription

Modal flows:
├── Model Picker Sheet — grouped by provider, search, favorites
├── Voice Mode Full Screen — waveform, transcript, hands-free
├── Tool Approval Dialog — tool name, input preview, Approve/Deny buttons
└── QR Pairing Sheet — QR code + "Waiting for desktop..." spinner
```

### 8.8.2 Key Screens

**Chat Screen**

- Message list with streaming token animation
- Floating model selector chip (tap to change)
- Input bar: text field + voice button + attachment button
- Code blocks with copy + syntax highlight
- Inline image display

**Agent Monitor Screen**

- Card-per-agent: name, status badge, elapsed time, progress bar
- Swipe agent card → pause / cancel actions
- Tap agent → detail view with full output log
- Badge count on tab for agents needing attention

**Desktop Companion Screen**

- Pre-pairing: QR code, instructions, "Learn more" link
- Post-pairing: Desktop name + OS badge, connection status indicator
- Agent list (live, from DataChannel) with approve/deny buttons for pending tools
- "Send task to desktop" text input at bottom

**Voice Mode Screen**

- Full-screen with animated waveform
- Transcript panel (scrollable)
- Model indicator
- End call button

### 8.8.3 Design System

- **Fonts**: Inter (matches web app)
- **Colors**: AGI Workforce brand palette, dark-mode adaptive
- **Component library**: `react-native-reusables` (Radix UI-inspired for RN)
- **Icons**: Lucide React Native (matches desktop)
- **Animations**: `react-native-reanimated` v3
- **Gestures**: `react-native-gesture-handler`

---

## 8.9 Subscription & Monetization

### 8.9.1 Plan Mapping

| Plan       | Desktop            | Web                | Mobile             |
| ---------- | ------------------ | ------------------ | ------------------ |
| Free       | Chat limited       | Chat limited       | Chat limited       |
| Hobby      | Economy models     | Economy models     | Economy models     |
| Pro        | Economy + balanced | Economy + balanced | Economy + balanced |
| Max        | All models + media | All models + media | All models + media |
| Team       | All + multi-seat   | All + multi-seat   | All + multi-seat   |
| Enterprise | All + SLA          | All + SLA          | All + SLA          |

### 8.9.2 In-App Purchase Strategy

- **No in-app purchases on iOS/Android** — subscriptions managed through the web app (agiworkforce.com)
- This avoids the 15–30% Apple/Google platform fee and keeps billing unified
- Mobile app shows "Manage Subscription" → opens web browser → billing portal
- Free users see upgrade prompts that link to web billing
- This matches Claude's approach (Anthropic does not sell Pro via App Store IAP)

### 8.9.3 Desktop Companion Gate

- Desktop pairing requires any paid plan (Hobby+)
- Free users see companion tab with upgrade prompt
- Rationale: companion requires a running desktop session which implies pro usage

---

## 8.10 Security & Privacy

| Requirement                     | Implementation                                                      |
| ------------------------------- | ------------------------------------------------------------------- |
| Auth tokens stored securely     | `expo-secure-store` (Keychain / AES Keystore)                       |
| Biometric lock                  | `expo-local-authentication` (Face ID / fingerprint)                 |
| WebRTC pairing E2E encrypted    | DTLS-SRTP — same as browser WebRTC standard                         |
| Pairing codes expire            | TTL 30–900 seconds, enforced by signaling server                    |
| Push notification content       | Minimal — no sensitive content in notification body                 |
| Health data                     | Never transmitted to AGI servers — read-only on-device context only |
| API keys                        | Never stored on mobile — all LLM calls proxied through API gateway  |
| Certificate pinning             | Enforced for API gateway domain                                     |
| Jailbreak / root detection      | Warning shown, desktop pairing blocked on compromised devices       |
| App Transport Security          | Enforced (iOS) — HTTPS only, TLS 1.3                                |
| Android Network Security Config | Cleartext disabled except localhost for development                 |
| Privacy manifest (iOS 17+)      | Declared for: camera, microphone, location, health, contacts        |

---

## 8.11 Offline & Performance

| Requirement         | Spec                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| Cold start time     | < 2 seconds to interactive                                               |
| Message history     | Cached locally via MMKV — available offline to read                      |
| Conversation sync   | Optimistic UI + background sync via Supabase Realtime                    |
| Voice processing    | Streamed to server; no on-device Whisper in v1.0                         |
| Bundle size         | < 60 MB (iOS IPA), < 40 MB (Android APK base)                            |
| Memory usage        | < 200 MB peak during active voice mode                                   |
| Battery: background | Push only — no background polling                                        |
| Offline state       | Graceful degradation: show cache, disable send, show "offline" indicator |

---

## 8.12 Accessibility

- Full VoiceOver (iOS) and TalkBack (Android) support
- Dynamic Type / font scaling (iOS) and system font size (Android)
- Minimum touch target: 44×44 pt (iOS HIG) / 48×48 dp (Material 3)
- Color contrast WCAG AA minimum (4.5:1)
- Reduce Motion support — disable streaming animations
- All icons have accessibility labels

---

## 8.13 Analytics & Observability

- **Crash reporting**: Sentry (React Native SDK)
- **Analytics**: PostHog (same as web/desktop, privacy-safe)
- **Key events to track**:
  - `mobile_session_start` (platform, plan, version)
  - `chat_message_sent` (model_id, has_attachment, voice_input)
  - `desktop_pairing_initiated` / `desktop_pairing_success` / `desktop_pairing_failure`
  - `agent_approval_sent` (approve/deny, tool_name)
  - `push_notification_tapped` (event_type)
  - `voice_mode_session` (duration_seconds, model_id)
  - `model_switched` (from_model, to_model)
  - `subscription_upgrade_tapped` (source_screen)

---

## 8.14 App Store & Google Play Requirements

### 8.14.1 iOS App Store

| Item                  | Requirement                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| Bundle ID             | `com.agiworkforce.mobile`                                                 |
| Minimum iOS           | 17.0                                                                      |
| Device support        | iPhone + iPad (Universal)                                                 |
| Capabilities          | Push Notifications, Background Modes (remote notifications), Siri         |
| Privacy usage strings | Camera, Microphone, Location When In Use, HealthKit, Calendars, Reminders |
| App Privacy labels    | Data linked to identity: Email; Data not linked: Diagnostics              |
| Rating                | 4+ (no objectionable content)                                             |
| Review notes          | Mention LLM provider routing; clarify no in-app purchases                 |

### 8.14.2 Google Play Store

| Item                 | Requirement                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Application ID       | `com.agiworkforce.mobile`                                                                                  |
| Minimum SDK          | API 33 (Android 13)                                                                                        |
| Target SDK           | API 35 (Android 15)                                                                                        |
| Permissions declared | CAMERA, RECORD_AUDIO, ACCESS_FINE_LOCATION, READ_CALENDAR, WRITE_CALENDAR, health connect read permissions |
| Data safety form     | Camera optional, Microphone optional, Location optional, Health optional                                   |
| Content rating       | Everyone (IARC)                                                                                            |

---

## 8.15 Release Phases

### Phase 1: MVP — Standalone AI Chat (Week 1–4)

**Goal**: Feature-parity with Claude Mobile for standalone chat

- Multi-LLM chat (all 9 providers via API gateway)
- Image attachments, PDF support
- Voice input (STT)
- Conversation history (Supabase sync)
- Projects / conversation organization
- Dark mode
- Share Extension (iOS + Android)
- App Shortcuts, home screen widget — New Chat (Android)
- iOS: Messages, Calendar, Maps integrations
- Android: Google Calendar, Maps, Gmail integrations
- Auth: email/password + Apple Sign-In + Google Sign-In

**Definition of done**: App submitted and approved on both stores, 0 crash-free sessions < 99%, cold start < 2s

---

### Phase 2: Desktop Companion (Week 5–8)

**Goal**: Ship the killer differentiator

- QR pairing flow with signaling server
- WebRTC DataChannel to desktop
- Live agent status dashboard
- Push notifications for agent events (APNs + FCM)
- Remote agent approve/deny
- Remote agent pause/cancel
- Home screen widget: Agent Status (Android)
- iOS Live Activity: agent progress on Lock Screen

**Definition of done**: Successful pairing with desktop app in CI/CD E2E test, push notifications < 5s latency

---

### Phase 3: Power Features (Week 9–12)

**Goal**: Full parity with desktop feature breadth on mobile

- Conversational voice mode (hands-free back-and-forth)
- Voice output / TTS playback
- Artifact / canvas viewer
- Reasoning / extended thinking display
- Apple Health integration (iOS, Pro/Max)
- Android Health Connect integration (Android 14+, Pro/Max)
- Siri Shortcut / App Intent
- Spotlight Search (iOS)
- iPad Split View and multitasking
- Foldable display support (Android)
- Predictive back gesture (Android 13+)
- Biometric lock (Face ID / fingerprint)

**Definition of done**: 4.5+ App Store rating, feature audit ≥ 80% PASS

---

### Phase 4: Enterprise & Polish (Week 13–16)

**Goal**: Enterprise readiness and platform-native polish

- MDM / Work Profile compatibility (Android)
- Certificate pinning
- Jailbreak / root detection with warning
- Dynamic Island Live Activity (iPhone 14 Pro+)
- CarPlay voice-only mode (iOS)
- Google Assistant integration (Android)
- Full accessibility audit (VoiceOver, TalkBack)
- Multi-device pairing (up to 5 devices per account)
- Privacy manifest finalization (iOS 17+)

---

## 8.16 Success Metrics

| Metric                               | Phase 1 Target | Phase 3 Target   |
| ------------------------------------ | -------------- | ---------------- |
| App Store rating (iOS)               | ≥ 4.3 stars    | ≥ 4.6 stars      |
| Google Play rating                   | ≥ 4.2 stars    | ≥ 4.5 stars      |
| Crash-free sessions                  | ≥ 99.0%        | ≥ 99.5%          |
| Desktop pairing success rate         | —              | ≥ 90%            |
| Push notification delivery           | —              | ≥ 98% within 10s |
| DAU / MAU ratio                      | ≥ 25%          | ≥ 40%            |
| Desktop users who pair mobile        | —              | ≥ 30%            |
| Voice mode sessions / total sessions | —              | ≥ 15%            |
| D7 retention                         | ≥ 35%          | ≥ 50%            |

---

## 8.17 Dependency Map

| Mobile Feature           | Depends On                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| Multi-LLM chat           | API gateway proxy endpoint for chat (new — reuses llm_router.rs logic)     |
| Conversation sync        | Supabase `conversations` table (already used by web app)                   |
| Desktop pairing QR       | `/mobile/pairing-code` (already built)                                     |
| Desktop companion events | WebRTC signaling server + DataChannel (already built)                      |
| Push notifications       | `/mobile/push-token` (already built) + APNs / FCM credentials              |
| Agent approval           | Desktop app must emit `agent:approval_required` events over DataChannel    |
| Health data              | HealthKit entitlement (iOS) / Health Connect (Android) — no backend needed |
| Subscription gating      | Supabase `user_subscriptions` (already used by desktop + web)              |

**Critical new backend work** (small scope):

1. `/api/push/send` endpoint — receives agent event from desktop, sends to FCM/APNs
2. `/api/chat/stream` endpoint — proxies chat requests to llm_router (no Tauri dependency)

---

## 8.18 Risks & Mitigations

| Risk                                           | Likelihood | Impact | Mitigation                                                                 |
| ---------------------------------------------- | :--------: | :----: | -------------------------------------------------------------------------- |
| Apple App Review rejection (AI content policy) |   Medium   |  High  | Pre-submission review checklist; follow Claude App Store precedent exactly |
| WebRTC pairing NAT traversal failures          |   Medium   |  High  | TURN server fallback (Cloudflare TURN or Coturn)                           |
| Push delivery failures in low-connectivity     |   Medium   | Medium | Retry with exponential backoff; in-app notification inbox as fallback      |
| React Native performance on older devices      |    Low     | Medium | Target API 33+ / iOS 17+ to ensure modern JS engine (Hermes)               |
| Health data entitlement delays                 |   Medium   |  Low   | Phase 3 feature — non-blocking for launch                                  |
| App Store IAP requirement for subscriptions    |    Low     |  High  | Web-only billing already validated by Claude App Store listing             |

---

## 8.19 Open Questions

1. **App name**: "AGI Workforce" or "Workforce AI" or shorter brand? (App Store 30-char limit on name)
2. **Icon design**: Should companion/pairing be represented in the icon?
3. **TURN server**: Will we host our own Coturn or use Cloudflare/Twilio TURN?
4. **Chat API**: Will the API gateway expose a `/chat/stream` endpoint, or will mobile chat go directly through Supabase Edge Functions?
5. **Beta distribution**: TestFlight (iOS) + Firebase App Distribution (Android) for internal testing?
6. **v2 roadmap**: On-device model inference (Core ML on iPhone, QNN on Snapdragon) — should this be scoped now?

---

_Section 8 complete. Next: Section 9 — Roadmap & Milestones (forthcoming)_
