# Competitive Mobile Research — AGI Workforce vs Claude vs ChatGPT vs Gemini vs Perplexity

_Generated: 2026-03-18 | Sources: 60+ web searches across 3 parallel research agents_

## Feature Matrix

| Feature                         |        Claude         |      ChatGPT       |          Gemini           |       Perplexity        |     AGI Workforce     |
| ------------------------------- | :-------------------: | :----------------: | :-----------------------: | :---------------------: | :-------------------: |
| **Chat**                        |                       |                    |                           |                         |                       |
| Text chat                       |           Y           |         Y          |             Y             |            Y            |           Y           |
| Streaming response              |           Y           |         Y          |             Y             |            Y            |           Y           |
| Markdown rendering              |           Y           |         Y          |             Y             |            Y            |           Y           |
| Code blocks + syntax highlight  |           Y           |         Y          |             Y             |            Y            |     Y (monospace)     |
| Copy message/code               |           Y           |         Y          |             Y             |            Y            |           Y           |
| Message editing                 |           Y           |         Y          |             N             |            N            |           Y           |
| Conversation branching          |           Y           |         Y          |           Soon            |    Thread follow-ups    |           N           |
| Extended thinking mode          |           Y           |       Y (o3)       |      Y (Deep Think)       |            N            |           Y           |
| Web search in chat              |       Y (Brave)       |         Y          |        Y (Google)         |    Y (core product)     |      Via desktop      |
| Citations/sources               |       Sometimes       |     Sometimes      |         Sometimes         |      Always inline      |           N           |
| File creation (docx/xlsx/pdf)   |     Y (all plans)     |         Y          |             Y             |            N            |           N           |
| **Vision / Camera**             |                       |                    |                           |                         |                       |
| Camera capture → LLM            |           Y           |         Y          |             Y             |            Y            |           Y           |
| Photo library upload            |           Y           |         Y          |             Y             |            Y            |           Y           |
| Multi-image per message         |      Y (20 max)       |         Y          |             Y             |            Y            |           Y           |
| Document/PDF upload             |    Y (30MB, 100pg)    | Y (tier-dependent) |         Y (100MB)         |        Y (40MB)         |           Y           |
| Real-time camera during voice   |           N           |         Y          |         Y (free)          |            N            |           N           |
| Screen sharing to AI            |           N           |      Limited       |         Y (free)          |        Via Comet        |           N           |
| **Voice**                       |                       |                    |                           |                         |                       |
| Voice input (STT)               |           Y           |         Y          |             Y             |            Y            |           Y           |
| Real-time voice conversation    |     Y (5 voices)      | Y (Advanced Voice) |   Y (Gemini Live, free)   |            Y            |           Y           |
| TTS response playback           | Y (14 neural voices)  |         Y          |             Y             |            Y            |           Y           |
| Push-to-talk mode               |           Y           |         Y          |             N             |            N            |           Y           |
| Hands-free continuous mode      |           Y           |         Y          |             Y             |            Y            |           N           |
| Voice language detection        |   Y (38 languages)    | Y (50+ languages)  |             Y             |    Y (15 languages)     |           N           |
| **Agent/Agentic**               |                       |                    |                           |                         |                       |
| Desktop agent oversight         |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| QR pair with desktop            |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Approve/deny tool calls         |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Agent pause/resume/cancel       |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Real-time agent progress        |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Background agent polling        |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Agentic tasks (browse/code/buy) |           N           | Y (ChatGPT Agent)  |     Y (AppFunctions)      | Y (Perplexity Computer) |      Via desktop      |
| **Organization**                |                       |                    |                           |                         |                       |
| Projects/context                |           Y           |  Y (Custom GPTs)   |         Y (Gems)          |       Y (Spaces)        |           N           |
| Memory/personalization          |      Y (2-layer)      |    Y (2-layer)     | Y (Personal Intelligence) |        Y (Comet)        |           Y           |
| Conversation sync cross-device  |           Y           |         Y          |             Y             |            Y            | Y (Supabase Realtime) |
| Auto-tagging                    |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Chat search                     |       Y (paid)        |         Y          |             Y             |            Y            |           Y           |
| **Model Selection**             |                       |                    |                           |                         |                       |
| Multi-model support             |    N (Claude only)    |    N (GPT only)    |      N (Gemini only)      |    Multi (via Comet)    | **Y (9+ providers)**  |
| Model picker UI                 |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| Thinking mode toggle            |           Y           |         Y          |             Y             |            N            |           Y           |
| **Scheduling**                  |                       |                    |                           |                         |                       |
| Scheduled recurring tasks       |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| **Platform Integration**        |                       |                    |                           |                         |                       |
| Push notifications              |           Y           |         Y          |             Y             |            Y            |           Y           |
| Share TO app (receive intents)  |           Y           |         Y          |             Y             |            Y            |           Y           |
| Share FROM app                  |           Y           |         Y          |             Y             |            Y            |           Y           |
| Android home screen widget      |           Y           |    Y (testing)     |             Y             |            N            |           N           |
| iOS home screen widget          |           Y           |         Y          |             N             |            N            |           N           |
| Siri/Shortcuts                  |           Y           |         Y          |             N             |            N            |           N           |
| iOS Lock Screen/Control Center  |      Y (iOS 18+)      |         Y          |             N             |            N            |           N           |
| Android default assistant       |           N           |         N          |     Y (replacing GA)      |     Y (Android 14+)     |           N           |
| Haptic feedback                 |           Y           |         Y          |             Y             |            Y            |           Y           |
| Dark mode                       | Y (light/dark/system) |         Y          |             Y             |            Y            |    Y (always dark)    |
| Biometric unlock                |           Y           |         N          |             N             |            N            |           N           |
| **Offline**                     |                       |                    |                           |                         |                       |
| Offline cached conversations    |           Y           |         Y          |             Y             |            N            |       Y (MMKV)        |
| Offline voice (planned)         |      Y (Q1 2026)      |         N          |             N             |            N            |           N           |
| **Security**                    |                       |                    |                           |                         |                       |
| Keychain token storage          |           Y           |         Y          |             Y             |            Y            |           Y           |
| Auto-approve modes              |           N           |         N          |             N             |            N            |    **Y (unique)**     |
| **Health**                      |                       |                    |                           |                         |                       |
| Apple Health integration        |      Y (Pro/Max)      |         N          |             N             |            N            |           N           |
| Health Connect (Android)        |      Y (Pro/Max)      |         N          |             N             |            N            |           N           |
| **Commerce**                    |                       |                    |                           |                         |                       |
| In-app purchasing/shopping      |           N           |         N          |             N             |    Y (Buy with Pro)     |           N           |

## AGI Workforce Unique Advantages (Zero Competitors)

1. **Desktop Companion Pairing** — QR code scan to pair with desktop agent platform
2. **Live Agent Oversight** — Monitor running agents, see tool calls, progress, steps
3. **Approve/Deny from Phone** — Approve or reject tool executions remotely
4. **Agent Commands** — Pause, resume, cancel agents from mobile
5. **Multi-Model Selection** — Switch between 30+ models from 9+ providers (all competitors locked to own model)
6. **Scheduling** — Create recurring AI tasks from mobile
7. **Auto-Tagging** — Automatic conversation categorization
8. **Model Picker with Provider Status** — Visual model selection UI (no competitor has this)

## Competitive Gaps Analysis

**Note (March 19, 2026)**: Document/PDF upload, conversation search, and message editing have all shipped and are now marked in the feature matrix above (rows 15, 25, 48). The gaps list below reflects remaining work only.

### CRITICAL (Must match to compete)

| Gap                            | Who Has It                            | Effort | Status      |
| ------------------------------ | ------------------------------------- | ------ | ----------- |
| Projects/context on mobile     | Claude, ChatGPT (GPTs), Gemini (Gems) | L      | Not started |

### HIGH (Strong competitive advantage)

| Gap                             | Who Has It        | Effort | Status           |
| ------------------------------- | ----------------- | ------ | ---------------- |
| Android home screen widget      | Claude, Gemini    | L      | Not started      |
| iOS home screen widget          | Claude, ChatGPT   | L      | Not started      |
| Biometric unlock (FaceID/Touch) | Claude            | S      | Not started      |
| Light/dark/system theme toggle  | All 4 competitors | S      | Not started      |
| Web search integration          | All 4 competitors | L      | Via desktop only |

### MEDIUM (Nice-to-have polish)

| Gap                            | Who Has It      | Effort | Status      |
| ------------------------------ | --------------- | ------ | ----------- |
| Siri/Shortcuts                 | Claude, ChatGPT | M      | Not started |
| iOS Lock Screen/Control Center | Claude          | M      | Not started |
| Conversation branching         | Claude, ChatGPT | L      | Not started |
| File creation (docx/xlsx/pdf)  | Claude          | L      | Not started |
| Dyslexic-friendly font option  | Claude          | S      | Not started |
| Health data integration        | Claude          | L      | Not started |

## Technical Recommendations from Research

### Streaming Chat UI

- **Adopt `react-native-streamdown`** (Software Mansion, Mar 2026) for off-thread markdown streaming via worklets
- Alternative: `@ronradtke/react-native-markdown-display` for static markdown
- Code highlighting: `react-native-syntax-highlighter` with Prism backend
- Defer code block highlighting until closing fence arrives during streaming

### Performance

- Already using FlashList (correct choice, 5x faster than FlatList)
- Buffer incomplete markdown before rendering

### Haptic Patterns (from research)

| Action               | Haptic                       |
| -------------------- | ---------------------------- |
| Message sent         | `impactAsync(Light)`         |
| Agent task completed | `notificationAsync(Success)` |
| Approval needed      | `notificationAsync(Warning)` |
| Pull-to-refresh      | `impactAsync(Medium)`        |
| Long-press message   | `selectionAsync()`           |
| Delete chat          | `notificationAsync(Error)`   |

### Platform Adaptations

- Use `react-native-safe-area-context` v5.6+ for Dynamic Island + edge-to-edge
- `Platform.select()` for shadows (iOS shadowColor vs Android elevation)
- KeyboardAvoidingView: `behavior="padding"` iOS, `behavior="height"` Android

## User Base Context

- Claude mobile: ~7.4M MAU (Dec 2025), briefly #1 iPhone app (Mar 2026)
- ChatGPT: dominant market share, deep Apple Intelligence integration
- Gemini: becoming Android default assistant (replacing Google Assistant)
- Perplexity: ~15M MAU, differentiated by search-first + shopping
- AGI Workforce differentiator: the only app that controls a desktop AI agent platform from mobile
