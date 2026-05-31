# AGI Mobile — Product Requirements Document

**Status:** canonical mobile PRD. First-implementation product. **Date:** 2026-05-17. **Supersedes:** the mobile column of `docs/PRD.md` §6 surface matrix, and any prior mobile draft in the repo or local cache. **Parent (platform):** [`docs/PRD.md`](PRD.md) for cross-surface concerns (billing SSOT, branding, provider catalog).

**Docs audit note, 2026-05-20:** founder clarification narrowed the 2026-05-18 local-first/cloud-waitlist locks to the mobile application first. Mobile v1 is **Local + explicit BYOK**: Local is the default trust boundary, BYOK is a separate provider trust boundary, Local -> BYOK creates a new fork, and AGI-managed cloud credits stay waitlisted or private beta. See [`docs/decisions/CURRENT_DECISIONS.md`](decisions/CURRENT_DECISIONS.md) before editing mobile launch posture.

This PRD is build-spec grade for **one product, one surface**: the AGI mobile app shipping to iOS App Store and Google Play. It assumes the existing monorepo (Expo SDK 55 + RN 0.84.0 + the shared TS packages) is the host. It does **not** require Web or Desktop to ship first. It locks every decision required to one-shot build the mobile app.

---

## §1 — Executive summary

AGI is a private, mobile-first AI app. It runs on your phone whether you're connected or not. Local mode runs a downloadable on-device model and is free forever, no account required. BYOK mode lets a user explicitly continue selected context with their own provider key (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral, plus home Ollama / LM Studio over local network or any OpenAI-compatible endpoint). Memory stays on the device by default; cross-device sync is opt-in and end-to-end encrypted.

**Three concrete differentiators on mobile, May 2026:**

1. **Works without internet.** No other mainstream mobile AI app ships a downloadable on-device model. Claude Mobile, ChatGPT Mobile, Perplexity Mobile, Gemini Mobile are all 100 % cloud. AGI Mobile works on a plane, on a mountain, with no SIM.
2. **BYOK + multi-provider with explicit forks on mobile.** Continue selected Local context with Claude, GPT, Gemini, or local Llama only after the user chooses what leaves the device. No competitor lets you do this on mobile.
3. **Privacy by architecture, not policy.** Local mode never sends a prompt off the device. No telemetry by default. SQLCipher-encrypted storage. Apple Keychain / Android Keystore for keys. We physically cannot see your Local-mode chats.

**Five sharpest calls in this PRD:**

1. **iOS ships first** (May → July 2026), Android within 4-6 weeks after. App Review on iOS is the harder gate; clearing it early de-risks Android.
2. **Stack stays Expo + native modules.** No Swift/Kotlin rewrite. Decision rationale in §8.
3. **Free Local mode requires no account.** A privacy product that demands a sign-up is a contradiction. Accounts are optional, only required for cross-device sync.
4. **BYOK is explicit on day 1; Managed Cloud is waitlisted.** BYOK uses the user's provider key and never becomes an automatic route from Local. Managed-cloud paid tiers, AGI Compute Credits, and top-ups are waitlist or private beta only until ledgering, payment-rail, fraud, refund, chargeback, and provider-term risk are designed and verified.
5. **Two-tab home, not four.** Mobile UX is brutally simple: a chat list and a settings drawer. No Connectors tab, no Skills tab, no Dispatch tab in v1. The platform PRD's broader feature set lives on Desktop / Web until mobile retention says otherwise.

**Success criteria, first 90 days post-launch:** ≥25K App Store + Play installs combined; ≥50 % of installs complete onboarding to first message; ≥30 % activate Local mode (download a model); ≥4.3 star rating; <2 % crash-free regression; ≥3 repeatable acquisition channels (HN, X, YouTube reviewers, Reddit privacy subs).

---

## §2 — Strategic positioning

**Hypothesis.** Privacy-paranoid and off-grid mobile users are an underserved segment that's been priced out by cloud-only AI apps. Claude Mobile, ChatGPT Mobile, Perplexity Mobile, Gemini Mobile require an account, require internet, and route every prompt through their cloud. There's no mainstream mobile product where (a) you can use AI on a plane, (b) sensitive prompts never leave the phone, (c) you can pick which provider answers each question. AGI Mobile owns that segment.

**Why this is a real moat.** Anthropic's app is by definition Claude-only. OpenAI's is GPT-only. Cursor doesn't ship a mobile chat at all. Perplexity is search-first. The structural lock-in of single-vendor apps means none of them can ship BYOK or Local LLM without breaking their own pricing model. The only category that can credibly offer all three is the multi-provider aggregator client — and AGI is the only such app at consumer scale targeting non-coders.

**Why mobile first, not Desktop/Web first.**

1. **App Review is the binding constraint** for the long-term local-AI thesis. Better to discover and resolve the BYOK consent / model-download policy issues now than after building three other surfaces.
2. **Distribution.** Apple's App Store and Google Play give us a free acquisition channel that web doesn't. A 4-star "private AI that works offline" mobile app climbs charts in the Productivity / Utilities categories.
3. **Real-world use cases that prove privacy.** The "I asked AI on a plane" demo is the most viral marketing artifact we'll ever have. Mobile is the right venue for it.
4. **Smallest unit of value to ship.** A mobile app with two modes is one product. Building Desktop + Web + Mobile + CLI + extensions concurrently is six products; that's how velocity dies.

**What we explicitly are not on mobile (v1):** a coding agent, a deep-research assistant, a connectors hub (Gmail/Drive/Notion/etc.), a Dispatch control plane for desktop, a CLI, an MCP server registry. All those live in the broader platform spec or in later mobile waves.

---

## §3 — Target users & personas

Four primary personas. Each has a verbatim "I want…" quote and a JTBD profile.

### Persona A — Privacy-Paranoid Professional (primary)

> "I draft contracts and discuss client cases on my phone. The day a screenshot of my prompt ends up in OpenAI's training data, I lose my license. I want AI that doesn't phone home."

- **Real users in this segment:** lawyers, doctors, therapists, financial advisors, journalists, defense / intel personnel, IP / patent attorneys.
- **Stack today:** they avoid AI on phone entirely; some use Ollama on their laptop and copy text back.
- **Top-3 pains:** sensitive prompts in cloud logs; mandatory account signup; no offline option.
- **Top-3 JTBD:** "summarize this PDF without uploading it"; "rewrite this email without my client's name leaving the device"; "ask a quick legal/medical reasoning question without it being attributable to me."
- **Conversion path:** download AGI → enable Local mode → never enable Cloud. Free forever user.
- **Retention signal:** ≥3 Local-mode sessions per week, zero outbound prompts.

### Persona B — Off-Grid / Traveler

> "I fly twice a month. I hike. I sail. I want AI that works without WiFi or cell signal."

- **Real users:** pilots, sailors, mountaineers, frequent business travelers, rural users, photographers, expedition workers.
- **Stack today:** they don't have AI on their phone because it doesn't work without signal. They miss out.
- **Top-3 pains:** no offline AI; cellular data is expensive when roaming; flight mode kills AI.
- **Top-3 JTBD:** "explain something I'm reading offline"; "summarize the chapter of this book in the seat-back tray"; "draft an email I'll send when I land."
- **Conversion path:** download AGI → download the 1.5B model → use it on flights. Free forever.
- **Retention signal:** ≥1 chat session per long-haul flight visible from device telemetry (when opted in).

### Persona C — Mobile-First Power User (non-coder)

> "I live on my phone. I want quick rewrites, email drafts, resume polish, and to point my camera at a thing and ask what it is. I don't want to pay $20/mo for the privilege."

- **Real users:** small-business owners, consultants, creatives, students, job seekers, parents.
- **Stack today:** ChatGPT Free Mobile (limited), bouncing between Gemini and Claude apps.
- **Top-3 pains:** $20/mo for Plus is too much for casual use; switching apps to compare models; image analysis requires Plus.
- **Top-3 JTBD:** "rewrite this email professionally"; "polish this paragraph of my resume"; "what is this thing I'm pointing my camera at."
- **Conversion path:** BYOK with cheap provider (Gemini Flash-Lite at $0.25/$1.50/MTok is ~$1-3/mo of typical use) → maybe Hobby once paid tiers ship.
- **Retention signal:** ≥1 active provider key + ≥10 messages per week.

### Persona D — Curious Tinkerer (secondary)

> "I have Ollama running on my Mac mini at home. I want my phone to chat with it when I'm in the house. And when I'm out, I want a backup model on the phone."

- **Real users:** indie developers, AI hobbyists, homelab enthusiasts.
- **Stack today:** Open WebUI on their LAN; janky on mobile.
- **Top-3 pains:** no native iOS/Android client for their home Ollama; phone needs separate offline option.
- **Top-3 JTBD:** point AGI at `http://192.168.1.50:11434` and chat with Llama 3.3 70B running at home; switch to on-device 3B when away from home.
- **Conversion path:** Custom endpoint config + Local mode. Free forever; possibly converts to a tier when paid features ship.
- **Retention signal:** "Custom endpoint" or "Ollama (local network)" configured.

---

## §4 — User journeys

Three canonical journeys.

### Journey 1 — First-time install → first message in Local mode (under 3 minutes)

1. User taps icon → onboarding screen 1: "Private AI that runs on your phone."
2. Pick a mode card: **Local / BYOK / Decide later**.
3. Picks Local → screen shows three model options: System (if Apple Foundation Models / Gemini Nano available — zero download), Fast (Qwen 2.5 1.5B, ~1.0 GB download), Capable (Llama 3.2 3B, ~1.8 GB download). On supported devices, System is selected by default.
4. If user picks System: chat is ready immediately. If user picks a download: progress bar (resumable), "We'll let you know when it's ready" + the app is still usable in BYOK / wait-mode.
5. Once model is ready: composer opens, placeholder "Ask anything…", "On device" badge top of screen.
6. User types, sends, gets streamed response on-device.
7. **No account asked at any point.** No email, no name, no signup.

### Journey 2 — Adding a BYOK provider key

1. From Settings (drawer) → Keys → "Add provider key."
2. **Apple 5.1.2(i) consent modal appears** (iOS only; web banner equivalent on Android Play): explicit disclosure that "your prompts will be sent to the provider when you use this key." Modal lists every provider in the picker with their privacy policy link.
3. User taps "I understand and accept" → provider list unlocks.
4. Picks Anthropic → paste key (`sk-ant-...`) → "Test key" button → green check.
5. Returns to chat. Existing Local chats remain Local; the key does not change their trust boundary.
6. User starts a new BYOK chat or taps **Continue with BYOK** from a Local chat. The app shows what context will be sent before any provider call.

### Journey 3 — Continue a Local chat with BYOK

1. User in an active Local-mode chat, has been asking the on-device 1.5B model about a problem.
2. Realizes the answer needs a smarter model.
3. Taps **Continue with BYOK** → picks "Claude Opus 4.7 via Anthropic."
4. Disclosure: "Selected context will be sent to Anthropic using your key." [Cancel] [Choose context].
5. Chooses full chat / last N messages / selected messages, plus whether to include attachments and tool outputs.
6. App runs a local secret/API-key redaction scan and shows a preview of the exact payload.
7. User confirms → app creates a new BYOK fork labeled "Claude via your Anthropic key." The original Local thread remains unchanged and never sends data off-device.
8. Tool-call schemas if any are normalized by `@agiworkforce/llm-normalize` inside the new BYOK fork.

---

## §5 — Competitive matrix (mobile-only)

| Capability                                                 | AGI Mobile                    | Claude Mobile        | ChatGPT Mobile      | Perplexity Mobile        | Gemini Mobile        |
| ---------------------------------------------------------- | ----------------------------- | -------------------- | ------------------- | ------------------------ | -------------------- |
| Works without internet                                     | ✅ on-device model            | ❌                   | ❌                  | ❌                       | ❌                   |
| Free forever, no signup                                    | ✅ Local mode                 | ❌ account required  | ❌ account required | ❌ account required      | ❌ Google account    |
| BYOK                                                       | ✅ any provider               | ❌                   | ❌                  | ❌                       | ❌                   |
| Multi-provider in one chat                                 | ✅ 10+                        | ❌ Claude only       | ❌ GPT only         | ⚠️ picker, no continuity | ❌ Google only       |
| Connect to home Ollama / LM Studio                         | ✅                            | ❌                   | ❌                  | ❌                       | ❌                   |
| Local image analysis                                       | ✅ Gemma 3 4B vision (opt-in) | ❌                   | ❌                  | ❌                       | ❌                   |
| Local voice transcription                                  | ✅ whisper.cpp + platform STT | ❌                   | ❌                  | ❌                       | ❌                   |
| Memory on-device by default                                | ✅                            | ❌                   | ❌                  | ❌                       | ❌                   |
| Cross-device memory sync (E2EE, opt-in)                    | ✅                            | ✅ (Anthropic cloud) | ✅ (OpenAI cloud)   | ✅ (Perplexity cloud)    | ✅ (Google cloud)    |
| Cost on flight / off-grid                                  | $0, works                     | $0, doesn't work     | $0, doesn't work    | $0, doesn't work         | $0, doesn't work     |
| Apple Foundation Models / Gemini Nano on supported devices | ✅ as Tier 1 routing          | n/a                  | ⚠️ rumored          | ✅ Pixel Gemini Nano     | ✅ Pixel Gemini Nano |

**Top-5 day-1 gaps we accept on mobile:**

1. No connectors directory (Gmail/Drive/Notion/etc.) on mobile v1. BYOK and Managed Cloud users can use those connectors on Web / Desktop; mobile is chat-first.
2. No Dispatch / cross-surface task delegation in mobile v1.
3. No video generation (BYOK or otherwise) in mobile v1.
4. No agentic computer-use on mobile (it's a phone — there's no desktop to control).
5. No deep research multi-step orchestration on mobile v1. Single-message Q&A only.

---

## §6 — Privacy Modes (Local vs BYOK vs Managed Cloud)

Mobile has **three trust boundaries**. Mode is **per-conversation**, not app-wide. A user can have a Local chat about taxes and a BYOK chat about travel planning open at once, but those histories do not silently merge.

### Local mode

- Runs on the device. Prompt never leaves the phone.
- No internet required after model is downloaded once (or zero-download with Apple Foundation Models / Gemini Nano).
- No account required.
- Free forever.
- **Available even on flight mode, no signal, no SIM.**
- Storage: SQLCipher-encrypted SQLite + MMKV (encrypted) on device.
- Memory: sqlite-vec embeddings on-device.
- Voice: Apple Speech / Android SpeechRecognizer (Tier 1) or whisper.cpp (Tier 2).
- Image analysis: Gemma 3 4B vision (Tier 2; opt-in download).
- Tools / connectors: not available in Local mode v1.
- Per-message UI badge: **On device**.

### BYOK mode

- BYOK by default (free; user pays provider directly).
- Internet required.
- Account optional (only required for cross-device sync).
- Providers: Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral (Codestral 2508), home Ollama / LM Studio on local network, any OpenAI-compatible endpoint.
- Cross-provider session continuity via `@agiworkforce/llm-normalize`.
- Per-message UI badge: **BYOK · [provider]** or **[model] via your [provider] key**.

### Managed Cloud mode

- Future AGI-hosted credits/subscription path.
- Waitlist or private beta only in mobile v1.
- Requires account, billing controls, pre-call balance reservation, post-call settlement from actual token/tool usage, provider-rate tables, refund/chargeback handling, fraud controls, and admin support before public launch.
- No public free credits or unlimited managed-cloud plans in mobile v1.
- Per-message UI badge once enabled: **AGI Cloud · [provider]**.

### Local -> BYOK fork rules

- Default mode for new conversations: user picks in onboarding (Local / BYOK / Ask each time). Setting changeable later.
- Local chats never auto-route to BYOK or Managed Cloud.
- Continuing with BYOK creates a new fork; it does not mutate the original Local thread.
- The user chooses what context moves: full chat, last N messages, selected messages, attachments yes/no, and tool outputs yes/no.
- The app runs a local secret/API-key scan before sending anything to the provider.
- The user sees a preview of the exact payload before the BYOK fork is created.
- Header always shows current mode in plain language.
- Settings → Privacy → "Show mode warning on every send" toggle (default on for the first 30 days, then off).
- Every message stores `privacy_mode: local | byok | managed`.

### Provider-key per-mode rules

- Local mode uses **no keys** (everything is on-device or system-resident).
- BYOK mode requires at least one user-managed provider key.
- Managed Cloud mode uses AGI provider accounts only after the future managed-cloud launch gate.
- Keys are stored in iOS Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) / Android Keystore / encrypted MMKV. Never in plaintext at rest. Never logged.

---

## §7 — Feature inventory + effort

Effort scale: **XS** = ≤1 dev-day, **S** = 2-4 dev-days, **M** = 1 dev-week, **L** = 2 dev-weeks, **XL** = ≥1 dev-month. "Wave" column maps to §18 timeline.

### F1 — Chat core

| Subfeature                                                                                                                           | Effort | Wave |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---- |
| Composer (text, model picker pill, mode badge, send button)                                                                          | M      | M1   |
| Message bubbles with role (user / assistant / tool / system), markdown render, code block, copy-to-clipboard, retry, edit-and-resend | M      | M1   |
| Conversation list (left swipe to delete, pin, archive, search)                                                                       | M      | M1   |
| Streaming token rendering (60 fps target on flagship; degrade gracefully on older)                                                   | S      | M1   |
| Thinking blocks collapsible                                                                                                          | S      | M2   |
| Per-message badge: On device / BYOK · [provider]                                                                                     | XS     | M1   |
| Local -> BYOK fork confirmation + context picker                                                                                     | M      | M1   |
| Cross-conversation search (text + semantic via sqlite-vec)                                                                           | M      | M3   |

### F2 — Local LLM runtime

| Subfeature                                                                                               | Effort | Wave |
| -------------------------------------------------------------------------------------------------------- | ------ | ---- |
| `@agiworkforce/local-llm` TS interface package (TypeScript types, Provider interface, runtime detection) | M      | M1   |
| iOS native module wrapping Apple Foundation Models (iOS 26+, supported devices)                          | M      | M1   |
| Android native module wrapping Gemini Nano via AICore (supported devices)                                | M      | M1   |
| iOS + Android native modules wrapping `react-native-executorch` (Tier 2: Qwen 2.5, Llama 3.2, Gemma 3)   | L      | M2   |
| iOS + Android native modules wrapping `llama.rn` (Tier 3 universal fallback)                             | M      | M1   |
| Runtime selection logic (Tier 1 if available, Tier 2 if installed, Tier 3 fallback)                      | S      | M2   |
| Per-device capability detection (RAM, OS version, NPU presence)                                          | S      | M2   |
| Background load / unload, memory pressure response, thermal throttle awareness                           | M      | M2   |

### F3 — Model catalog & downloads

| Subfeature                                                                                                                                  | Effort | Wave |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| `model_catalog.json` schema (typed runtime, sha256, sizeBytes, minRamGB, capabilities) modeled after Google AI Edge Gallery                 | S      | M1   |
| Versioned remote allowlist (CDN-hosted JSON, signed)                                                                                        | S      | M2   |
| Download manager: resumable, background, integrity check (sha256), unzip / decompress, progress UI (bytes / s, ETA, paused / failed states) | L      | M1   |
| Per-model UI card (size, RAM requirement, capabilities, accelerator default, license, "Download" / "Delete" / "Update")                     | M      | M2   |
| Storage manager screen (per-model size, total storage, delete with confirm)                                                                 | M      | M2   |
| Auto-prefetch of system / default model on first run (after consent)                                                                        | S      | M2   |
| OTA model update flow (silent download in background, prompt user to switch)                                                                | M      | M3   |

### F4 — Cloud (BYOK) mode

| Subfeature                                                                                         | Effort | Wave |
| -------------------------------------------------------------------------------------------------- | ------ | ---- |
| Provider key management (add, test, rotate, delete, store in Keychain)                             | M      | M1   |
| `/api/llm/v1/chat/completions` client (SSE streaming, OpenAI-shape, retries with backoff)          | S      | M1   |
| `@agiworkforce/llm-normalize` integration for cross-provider continuity                            | S      | M2   |
| Provider catalog (read from platform `/api/models` cached, updated weekly)                         | XS     | M2   |
| Custom endpoint config (URL + optional API key for OpenAI-compatible)                              | S      | M2   |
| Home Ollama / LM Studio discovery on local network (Bonjour / mDNS)                                | M      | M3   |
| Managed cloud tier subscription (Hobby+ post-Aug-1, via Stripe on Web — mobile shows current tier) | M      | M4   |

### F5 — Voice

| Subfeature                                                                            | Effort | Wave |
| ------------------------------------------------------------------------------------- | ------ | ---- |
| Push-to-talk button in composer (hold to record, release to transcribe)               | S      | M2   |
| iOS: SFSpeechRecognizer (Tier 1, free, no download)                                   | S      | M2   |
| Android: SpeechRecognizer + RecognitionListener (Tier 1)                              | S      | M2   |
| whisper.cpp native module (iOS + Android), whisper-base.en download (~140 MB, opt-in) | L      | M3   |
| Voice quality toggle in Settings: Fast (platform) / Best (Whisper)                    | XS     | M3   |
| Recording UI: timer, waveform, cancel, retry                                          | S      | M2   |

### F6 — Image analysis

| Subfeature                                                                                | Effort | Wave |
| ----------------------------------------------------------------------------------------- | ------ | ---- |
| Plus menu → Camera / Gallery / File                                                       | S      | M1   |
| Image attachment in composer (preview thumbnail, remove)                                  | S      | M2   |
| Cloud-mode image routing to provider (Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro)       | S      | M2   |
| Local-mode image routing to Gemma 3 4B vision (Tier 2; "Download vision model to enable") | M      | M3   |
| EXIF strip on send (privacy: location data removed)                                       | XS     | M2   |

### F7 — Memory & history

| Subfeature                                                                               | Effort | Wave                 |
| ---------------------------------------------------------------------------------------- | ------ | -------------------- |
| SQLCipher-encrypted SQLite for conversation history                                      | M      | M1                   |
| MMKV (encrypted) for preferences + session cache                                         | XS     | M1 (already in repo) |
| sqlite-vec extension for semantic memory store                                           | M      | M3                   |
| Local embedding model: nomic-embed-text-v1.5 (137M, ~150 MB, opt-in for memory features) | M      | M3                   |
| "Memory" view in chat: pinned facts, custom instructions, project memories               | M      | M3                   |
| Cross-device sync (opt-in, E2EE, Supabase mirror, user-derived key never sent to server) | XL     | M4                   |
| Memory export (JSON / Markdown download)                                                 | S      | M3                   |
| Memory import (from another AI app's export)                                             | M      | M4                   |

### F8 — Onboarding

| Subfeature                                                            | Effort | Wave |
| --------------------------------------------------------------------- | ------ | ---- |
| Welcome carousel (3 screens: "Private", "Fast", "Yours")              | S      | M1   |
| Mode picker (Local / BYOK / Decide later)                             | S      | M1   |
| Local mode setup: model picker, download progress                     | M      | M1   |
| BYOK setup: Apple 5.1.2(i) consent modal → provider list → first key  | M      | M1   |
| Optional account creation (skipable, for cross-device sync only)      | S      | M2   |
| "Skip everything, just chat" path → System model on supported devices | XS     | M1   |

### F9 — Settings & drawer

| Subfeature                                                                                                                                         | Effort | Wave |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| Drawer (slide-from-left): Models, Keys, Account (optional), Memory, Settings, About                                                                | M      | M1   |
| Models: list installed, download new, delete, update                                                                                               | S      | M2   |
| Keys: list configured providers, add, test, rotate, delete                                                                                         | S      | M2   |
| Account: optional sign-in (Supabase OAuth) for cross-device sync only                                                                              | S      | M2   |
| Memory: view stored facts, custom instructions, export, clear                                                                                      | S      | M3   |
| Settings: appearance (dark/light/system), default mode, voice quality, telemetry (off by default), Wi-Fi-only downloads, storage manager, language | M      | M2   |
| About: version, build, license, privacy policy, terms, brand mark                                                                                  | XS     | M1   |
| In-app content reporting (flag inappropriate AI output; required by Google Play AI-content policy)                                                 | S      | M2   |

### F10 — Network & connectivity

| Subfeature                                                                                        | Effort | Wave |
| ------------------------------------------------------------------------------------------------- | ------ | ---- |
| "Network: Off" mode (force Local-only; UI never shows Cloud picker; opt-in toggle in Settings)    | XS     | M2   |
| Wi-Fi-only download toggle (default on; cellular downloads require explicit per-download confirm) | XS     | M1   |
| Background downloads (resume on app launch, finish in background)                                 | M      | M2   |
| Local-network Ollama / LM Studio discovery (Bonjour / mDNS)                                       | M      | M3   |

### F11 — Polish & quality bar

| Subfeature                                                                                                                         | Effort | Wave |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| Light / dark theme matching `packages/design-tokens` palette                                                                       | M      | M2   |
| Haptic feedback on send, error, BYOK fork                                                                                          | XS     | M2   |
| Empty states (no chats yet, no models downloaded, no internet in BYOK mode, etc.)                                                  | S      | M2   |
| Error handling (model load failure, low storage, low RAM, provider key invalid, network error, etc.) — friendly copy in every case | M      | M2   |
| Accessibility: VoiceOver / TalkBack labels on every interactive, dynamic type support, RTL layout pass                             | M      | M3   |
| Localization: en (M1), es (M3)                                                                                                     | M      | M3   |
| Crash reporting (Sentry, off by default; opt-in in Settings)                                                                       | S      | M2   |

**Aggregate effort:** the locked feature set totals approximately **180-260 dev-hours** to reach M3 (TestFlight-ready beta). Sequencing in §18.

---

## §8 — Tech stack (locked)

The full rationale, alternatives considered, and license review for this stack live in the conversation transcript that preceded this PRD (three converging research reports). The decisions below are final for v1.

### Shell

- **Expo SDK 55** + **React Native 0.84.0** + **Expo Router (file-based routing)** + **NativeWind 4.2** (Tailwind for RN).
- **Dev build via `expo-dev-client` + `expo-build-properties`.** Not Expo Go (we ship native modules).
- **EAS Build** for iOS + Android binaries; managed credentials (`credentialsSource: remote`).
- **No Swift/Kotlin rewrite in v1.** A native rewrite was evaluated and rejected: it doesn't solve the hard problems (model UX, downloads, thermals, store policy), and a solo founder spending 200-350 hours on a rewrite gives up the ability to ship.

### Runtime tiers — Local mode

| Tier                                          | iOS                                                                                                      | Android                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** (free, OS-resident, zero download) | Apple Foundation Models (iOS 26+, Apple-Intelligence devices, ~3B params) via custom Swift native module | Gemini Nano via AICore (Pixel 8+, Galaxy S24+, expanding to MediaTek/Qualcomm 2026) via custom Kotlin native module |
| **Tier 2** (downloadable, modern OS, fast)    | `react-native-executorch` (iOS 17+) + Expo resource fetcher                                              | `react-native-executorch` (Android 13+) + Expo resource fetcher                                                     |
| **Tier 3** (universal fallback)               | `llama.rn` (iOS 15+) via Expo config plugin                                                              | `llama.rn` (Android 10+) via Expo config plugin                                                                     |

**Selection logic:** at runtime, the `@agiworkforce/local-llm` provider picks the highest available tier per device, with fallback chain. Tier 1 is preferred when available because zero download. Tier 2 is preferred over Tier 3 for new device cohorts (better perf, more modern format). Tier 3 ships for everyone as the safety net.

**Excluded** (license / risk reasons documented in transcript):

- Cactus / cactus-react-native: engine license has funding/revenue thresholds (>$2M); telemetry flags in some SDK surfaces.
- RunAnywhere: raw LICENSE imposes free-use thresholds (<$1M funding/revenue) despite README claiming Apache-2.0; default-on anonymous analytics in Swift docs.
- MediaPipe LLM Inference: Google has deprecated this mobile API; current guidance is LiteRT-LM.
- MLX-Swift directly: iOS-only and would force a separate Swift native module wrapping MLX into RN. Marginal perf vs `react-native-executorch` doesn't justify the second native runtime to maintain.

### BYOK mode

- **Provider SDKs:** `@anthropic-ai/sdk` 0.96.x, `openai` 6.38.x, `@google/generative-ai`, or provider HTTPS endpoints called direct-to-provider from the app by default. BYOK prompts, attachments, and keys do not route through AGI infrastructure unless the user explicitly enables a future **AGI Relay** option with separate disclosure.
- **Cross-provider continuity:** `@agiworkforce/llm-normalize` (already in monorepo, 2,633 LOC).
- **Streaming:** SSE via `react-native-event-source` polyfill or `EventSource` native on iOS 17+.

### Voice

- **Tier 1 platform STT:** iOS `SFSpeechRecognizer`, Android `SpeechRecognizer` + `RecognitionListener`. Free, no download.
- **Tier 2:** `whisper.cpp` native module with `whisper-base.en` (140 MB, opt-in download). Used when user picks "Best" in voice settings.
- TTS deferred to M4 (Piper local — same approach as Desktop).

### Storage

- **MMKV 4.3.1** (encrypted; 256-bit key in Keychain / Keystore). Already in repo.
- **SQLite + SQLCipher** for full conversation history. SQLCipher key derived from device-specific key in Keychain.
- **sqlite-vec extension** for vector search / memory. Open source, cross-platform, no extra dependency.
- **Model files** in app sandbox (`Documents/models/` on iOS, app-private dir on Android). Never iCloud-backed for privacy.

### Crypto / security

- **iOS:** Keychain access class `WHEN_UNLOCKED_THIS_DEVICE_ONLY` for keys; no iCloud sync of secrets. Privacy manifest declares only `UserDefaults`, `SystemBootTime`, `DiskSpace`, `FileTimestamp`.
- **Android:** Keystore for key wrap; `EncryptedSharedPreferences` for biometric flag; SQLCipher for DB.
- **Cross-device sync (opt-in):** user-derived key (Argon2 from a passphrase the user picks during opt-in), used for E2EE wrap of memory rows before Supabase upsert. Key never sent to server.
- **HMAC v2 envelope** for any control-plane messages (matches platform spec).

### Locked versions (May 2026)

| Item                                            | Pin                                                          |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Expo SDK                                        | 55.0.23                                                      |
| React Native                                    | 0.84.0                                                       |
| React                                           | 19.2.6                                                       |
| Reanimated                                      | 4.3.1                                                        |
| MMKV                                            | 4.3.1                                                        |
| NativeWind                                      | 4.2.3                                                        |
| `expo-dev-client`                               | latest stable                                                |
| `llama.rn`                                      | latest stable May 2026 release (v0.10+ for New Architecture) |
| `react-native-executorch`                       | latest stable (ExecuTorch 1.0+)                              |
| `react-native-executorch-expo-resource-fetcher` | latest stable                                                |
| `expo-file-system`                              | SDK 55 default                                               |
| `expo-asset`                                    | SDK 55 default                                               |
| `whisper.cpp`                                   | latest stable (Core ML / NNAPI accel builds)                 |
| `sqlite-vec`                                    | latest stable                                                |
| Jest                                            | preset `jest-expo`                                           |
| Detox                                           | latest stable for e2e                                        |

---

## §9 — Model picks (locked)

Default download is **Qwen 2.5 1.5B Instruct Q4_K_M**. On devices that support Apple Foundation Models or Gemini Nano, the system model is preferred and no download is needed.

| Use case                 | Default model                                               | Size    | Opt-in alternatives                                                   |
| ------------------------ | ----------------------------------------------------------- | ------- | --------------------------------------------------------------------- |
| Local chat — fast        | Qwen 2.5 1.5B Instruct Q4_K_M                               | ~1.0 GB | Llama 3.2 1B Q4 (~0.8 GB), TinyLlama 1.1B (~0.7 GB) for older devices |
| Local chat — capable     | Llama 3.2 3B Instruct Q4                                    | ~1.8 GB | Qwen 2.5 3B (~1.8 GB), SmolLM 1.7B (~1.1 GB)                          |
| Local image analysis     | Gemma 3 4B vision Q4                                        | ~2.5 GB | (no smaller multimodal option that's good in 2026)                    |
| Local voice (best)       | whisper-base.en                                             | ~140 MB | whisper-tiny.en (~75 MB) for old devices                              |
| Local embedding (memory) | nomic-embed-text-v1.5 Q8                                    | ~150 MB | (platform-native where available: NLContextualEmbedding on iOS)       |
| Cloud chat               | per BYOK key, model picker shows current provider's catalog | n/a     | n/a                                                                   |

**Why Qwen 2.5 1.5B as the default downloadable:** strongest balance of size, speed, quality in the 1-2B class as of May 2026. Multilingual. Q4_K_M is the sweet spot for mobile (good quality preservation, ~1 GB on disk, fits in 4 GB RAM phones). Llama 3.2 1B is a strong runner-up but slightly weaker on non-English. Qwen 3 class is newer but the 1.5B equivalent isn't as battle-tested on mobile yet.

**Why Llama 3.2 3B as the "capable" upgrade:** the natural step up from 1.5B. Strong English quality, conversational, ships in GGUF Q4 at ~1.8 GB. Comfortable on iPhone 14+ / Pixel 8+ with 8 GB RAM.

**Why Gemma 3 4B vision and not Qwen 2.5-VL 3B:** Gemma 3 4B vision is more battle-tested as of May 2026; ExecuTorch has explicit support; license is permissive (with Google's usage terms — verify final checkpoint license before redistribute). Qwen 2.5-VL is also viable; we ship Gemma first and consider adding Qwen-VL in M4.

**Per-checkpoint license review is required** before redistribute. The catalog stores `license: string` per model and the model card screen must surface it. No model ships in the catalog without a verified license entry.

---

## §10 — Information architecture & UX

**Brutally simple v1.** Two screens, one drawer. No bottom tab bar.

### Home (Chat list)

- Header: AGI logo (left) + new-chat button (right) + drawer hamburger (far left).
- Body: list of chats (most recent at top). Each row: title (auto-generated from first message), last-message snippet, mode badge (small "On device" or "BYOK · Claude"), timestamp.
- Swipe left on a row: Delete / Pin / Archive.
- Empty state: "No chats yet. Tap + to start." with hero text and a "Try a sample prompt" chip.
- Pull to refresh (if signed in: triggers Supabase sync).

### Conversation view

- Header: mode badge (tappable to start a BYOK fork from Local), model name (tappable to switch model within the current trust boundary), back button, kebab menu (rename, share, export, delete).
- Body: message bubbles. Streaming tokens render at 60 fps target.
- Composer (bottom-anchored): plus button (left) + text field + mic (push-to-talk) + send button.
- Plus menu: Camera, Gallery, File, Voice mode toggle.
- Long-press composer: paste as file, import file, photo.

### Drawer

Six items, no more in v1:

1. **Models** — installed list + download new
2. **Keys** — configured providers + add new (BYOK setup)
3. **Memory** — pinned facts, custom instructions, export, clear
4. **Account** — sign-in / sign-up (optional; only required for cross-device sync)
5. **Settings** — appearance, default mode, voice quality, telemetry, downloads, language, network mode
6. **About** — version, privacy, terms, brand

### Design tokens

Inherited from `packages/design-tokens` (platform-locked):

- Primary: teal `#21808d`
- Secondary: terracotta `#da7756`
- Light canvas: `#faf9f7`
- Dark canvas: `#1a1915`
- Type: Inter (sans), JetBrains Mono (mono), IBM Plex Serif (long-form rendering)
- Radii: 12-16 px (cards), 24-28 px (sheets), 20 px (composer)
- Spacing: 4 / 8 / 12 / 16 / 24 px scale

### Locked UI strings (English; localize for es in M3)

| Token                          | Copy                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.name`                     | AGI                                                                                                                                                                                                                                                                                                   |
| `app.tagline`                  | Private AI on your phone                                                                                                                                                                                                                                                                              |
| `onboarding.welcome.title`     | Welcome to AGI                                                                                                                                                                                                                                                                                        |
| `onboarding.welcome.body`      | Private AI that runs on your phone. Works offline. Your keys, your provider, your choice.                                                                                                                                                                                                             |
| `onboarding.mode.local.title`  | Local — fully on device                                                                                                                                                                                                                                                                               |
| `onboarding.mode.local.body`   | Free forever. No account. No internet needed after one download. Best for sensitive prompts.                                                                                                                                                                                                          |
| `onboarding.mode.cloud.title`  | BYOK — bring your own keys                                                                                                                                                                                                                                                                            |
| `onboarding.mode.cloud.body`   | Use Claude, GPT, Gemini and more with your own API keys. We charge $0. Pay providers directly.                                                                                                                                                                                                        |
| `onboarding.mode.decide_later` | Decide later                                                                                                                                                                                                                                                                                          |
| `composer.placeholder`         | Ask anything…                                                                                                                                                                                                                                                                                         |
| `mode.local.badge`             | On device                                                                                                                                                                                                                                                                                             |
| `mode.cloud.badge.template`    | BYOK · {provider}                                                                                                                                                                                                                                                                                     |
| `mode.switch.warning.title`    | Continue with BYOK?                                                                                                                                                                                                                                                                                   |
| `mode.switch.warning.body`     | Selected context will be sent to {provider} using your key.                                                                                                                                                                                                                                           |
| `download.title`               | Download model                                                                                                                                                                                                                                                                                        |
| `download.size_warning`        | {size} download. Wi-Fi recommended.                                                                                                                                                                                                                                                                   |
| `download.verifying`           | Verifying…                                                                                                                                                                                                                                                                                            |
| `download.unpacking`           | Preparing model…                                                                                                                                                                                                                                                                                      |
| `consent.byok.title`           | Bring your own keys — disclosure                                                                                                                                                                                                                                                                      |
| `consent.byok.body`            | When you add a provider key (Anthropic, OpenAI, Google, etc.), selected prompts and attachments are sent to that provider so it can generate a response. Each provider stores and processes your data under its own terms. By default, AGI does not see the contents of BYOK messages or attachments. |
| `consent.byok.accept`          | I understand and accept                                                                                                                                                                                                                                                                               |
| `consent.byok.cancel`          | Cancel                                                                                                                                                                                                                                                                                                |
| `empty.chats.title`            | No chats yet                                                                                                                                                                                                                                                                                          |
| `empty.chats.body`             | Tap + to start                                                                                                                                                                                                                                                                                        |
| `empty.models.title`           | No models downloaded                                                                                                                                                                                                                                                                                  |
| `empty.models.body`            | Download one to use AGI offline, or use a system model if available.                                                                                                                                                                                                                                  |
| `state.network_off`            | Network off                                                                                                                                                                                                                                                                                           |
| `state.private`                | On device                                                                                                                                                                                                                                                                                             |
| `error.model_load`             | Couldn't load this model. Try a smaller one.                                                                                                                                                                                                                                                          |
| `error.network`                | Can't reach the cloud. Try Local mode?                                                                                                                                                                                                                                                                |
| `error.storage_low`            | Not enough free space for this model.                                                                                                                                                                                                                                                                 |
| `error.key_invalid`            | This key didn't work. Double-check it with your provider.                                                                                                                                                                                                                                             |
| `report.title`                 | Report this message                                                                                                                                                                                                                                                                                   |
| `report.reason.harmful`        | Harmful or unsafe content                                                                                                                                                                                                                                                                             |
| `report.reason.inaccurate`     | Inaccurate or misleading                                                                                                                                                                                                                                                                              |
| `report.reason.other`          | Other                                                                                                                                                                                                                                                                                                 |

---

## §11 — Onboarding & first-run flow

**Target: under 90 seconds from app open to first message on supported devices.**

```
Screen 1 — Welcome (skippable after 2 s)
  hero text "Welcome to AGI" + tagline "Private AI on your phone"
  [Continue]

Screen 2 — Mode picker
  three cards: Local / BYOK / Decide later
  collapsible "How is this private?" detail under each
  user taps Local OR Cloud (or Decide later)

Branch A: Local
  Screen 3a — Model picker
    System (Apple Foundation / Gemini Nano) — selected by default if available, "Zero download"
    Fast (Qwen 2.5 1.5B, 1.0 GB) — selected if no system model
    Capable (Llama 3.2 3B, 1.8 GB)
    [Download & Continue] / [Skip and use System]

  Screen 4a — Download progress (skippable; app continues)
    progress bar, ETA, "Use AGI now" button takes user to chat with System model

  Screen 5a — Ready
    "You're set. AGI runs on your device."
    [Open chat]

Branch B: Cloud
  Screen 3b — Apple 5.1.2(i) BYOK consent (iOS only; web banner on Android)
    full disclosure modal per §13 + Appendix B §B.7 of platform PRD
    [I understand and accept] / [Cancel]

  Screen 4b — Provider picker
    Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral, Custom
    user picks one to start with

  Screen 5b — Add key form
    paste key (with show/hide), [Test], [Save]

  Screen 6b — Ready
    "You're set. Pick Claude or any model in the composer."
    [Open chat]

Branch C: Decide later
  → drop directly into chat with empty state; user picks mode on first send
```

**Account is never required in onboarding.** Account creation is offered later only when the user opts into cross-device sync.

**Telemetry consent** is shown after first message, not in onboarding (don't gate the first message on a consent dialog). Default is opt-out.

---

## §12 — Data model (mobile-side)

Mirrors `docs/PRD-APPENDIX-A-DATA-MODELS.md` §A.2 for SQLite + adds mobile-specific tables.

### Local SQLite (encrypted via SQLCipher)

```sql
-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,                    -- uuid v7
  title TEXT NOT NULL DEFAULT 'New chat',
  default_mode TEXT NOT NULL CHECK (default_mode IN ('local','cloud')),
  default_provider TEXT,                  -- for cloud: anthropic, openai, …
  default_model TEXT,                     -- e.g., 'qwen2.5-1.5b' or 'claude-sonnet-4.6'
  created_at INTEGER NOT NULL,            -- unix ms
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,
  pinned BOOLEAN NOT NULL DEFAULT 0
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL,                  -- JSON serialized (parts)
  mode TEXT NOT NULL CHECK (mode IN ('local','cloud')),
  provider TEXT,                          -- null when mode='local'
  model TEXT,                             -- e.g., 'qwen2.5-1.5b' or 'claude-sonnet-4.6'
  runtime TEXT,                           -- 'foundation_models'|'aicore'|'executorch'|'llama_rn'|'cloud'
  tokens_in INTEGER,
  tokens_out INTEGER,
  duration_ms INTEGER,
  attachments TEXT,                       -- JSON array
  created_at INTEGER NOT NULL,
  parent_message_id TEXT REFERENCES messages(id)
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

-- Memory (semantic + structured facts)
CREATE TABLE memory_facts (
  id TEXT PRIMARY KEY,
  fact TEXT NOT NULL,
  source_conversation_id TEXT REFERENCES conversations(id),
  pinned BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Vector index for memory (via sqlite-vec)
CREATE VIRTUAL TABLE memory_vectors USING vec0(
  fact_id TEXT PRIMARY KEY,
  embedding FLOAT[768]                   -- nomic-embed-text-v1.5 dim
);

-- Installed models
CREATE TABLE installed_models (
  id TEXT PRIMARY KEY,                    -- catalog model ID
  display_name TEXT NOT NULL,
  runtime TEXT NOT NULL,                  -- foundation_models | aicore | executorch | llama_rn
  format TEXT NOT NULL,                   -- gguf | pte | system | litertlm
  size_bytes INTEGER,
  sha256 TEXT,
  local_path TEXT,
  installed_at INTEGER NOT NULL,
  last_used_at INTEGER,
  capabilities TEXT                       -- JSON: vision, audio, tools, etc.
);

-- Provider keys (encrypted secret stored in Keychain; this table holds metadata only)
CREATE TABLE provider_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,                 -- anthropic | openai | google | …
  prefix TEXT,                            -- visible prefix (e.g., 'sk-ant-...12ab')
  display_name TEXT,
  keychain_ref TEXT NOT NULL,             -- pointer to Keychain entry
  scopes TEXT,                            -- optional, JSON
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

-- Custom instructions
CREATE TABLE custom_instructions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- 'default' or per-project
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Settings (key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                     -- JSON
);

-- Telemetry queue (opt-in; flushed to backend when user has consented)
CREATE TABLE telemetry_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,                  -- JSON
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
```

### MMKV (encrypted, fast-access)

- `auth_session` — Supabase session token (only if user signed in)
- `mmkv_encryption_key` — 256-bit key (also in Keychain; MMKV is the fast-access cache)
- `biometric_enabled` — bool
- `default_mode` — 'local'|'cloud'|'ask'
- `voice_quality` — 'fast'|'best'
- `telemetry_opted_in` — bool, default false
- `wifi_only_downloads` — bool, default true
- `byok_consent_accepted_at` — timestamp (Apple 5.1.2(i) consent)
- `network_off_mode` — bool, default false
- `theme` — 'light'|'dark'|'system'
- `language` — 'en'|'es'|…

### Keychain entries (iOS) / Keystore (Android)

- `mmkv_encryption_key` — 256-bit (regenerated on first launch via `expo-secure-store`)
- `sqlcipher_db_key` — derived from device-specific entropy + user passphrase if cross-device sync enabled
- `byok_keys.<provider>.<id>` — provider API keys (one entry per registered key)

### Cross-device sync (opt-in only) — Supabase mirror

When `cross_device_sync = true` AND user has account:

- Mobile encrypts each `conversations` + `messages` + `memory_facts` row with user-derived key (Argon2 from passphrase).
- Encrypted rows pushed to Supabase tables: `conversations`, `messages`, `memory_facts` (RLS-scoped, mirroring platform schema in `docs/PRD-APPENDIX-A-DATA-MODELS.md` §A.1).
- Server stores ciphertext only; keys never sent.
- On other devices, user enters same passphrase → derives same key → decrypts.

---

## §13 — Security & privacy

### Principles (locked)

1. **Local mode never sends a prompt off the device.** Period. Not in telemetry, not in crash reports, not in error logs. Crash reports redact message content. Telemetry events log counts and durations, never content.
2. **No account required to use the app.** Account is only for cross-device sync.
3. **Telemetry off by default.** Opt-in toggle in Settings.
4. **Encryption at rest:**
   - Provider keys: iOS Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` / Android Keystore.
   - Conversation history: SQLCipher-encrypted SQLite, key in Keychain.
   - Prefs: MMKV with 256-bit key (also in Keychain).
   - Models: in app sandbox, not iCloud-backed.
5. **No iCloud / Google Backup of secrets.** Provider keys, encryption keys, and chat history are excluded from system backups.
6. **Apple 5.1.2(i) compliance:** explicit consent modal before any BYOK key is added (§11 onboarding branch B; copy in `docs/PRD-APPENDIX-B-API-CONTRACTS.md` §B.7). Local mode is exempt from 5.1.2(i) — no third-party data sharing.
7. **No model "phones home."** Downloaded model files do not contain network code. Inference runtimes are sandboxed by OS.
8. **Crash reports are opt-in.** Sentry initialized only after user opts in. Stack traces redact any string with `>40` chars to avoid leaking message content.

### Network policy

| State                                  | What can leave the device                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local mode + Telemetry off + Crash off | **Nothing.** App update checks are OS-level (App Store / Play Store), not our traffic.                                                                                                                                    |
| Local mode + Telemetry on              | counts only (event names, timestamps, anonymized device class). No content.                                                                                                                                               |
| BYOK mode                              | prompts + attachments explicitly selected for the BYOK fork are sent direct-to-provider by default. AGI does not receive BYOK prompts, attachments, or keys unless the user explicitly enables a future AGI Relay option. |
| Cross-device sync on                   | E2EE-encrypted chat rows to Supabase. Server never sees plaintext.                                                                                                                                                        |

### "Network: Off" state

A user can toggle Settings → Network: Off. In this state:

- All BYOK and Managed Cloud UI is hidden.
- Model picker only shows Local options.
- Even if user somehow triggers a BYOK or Managed Cloud call (deep link, etc.), it's blocked at the request layer.

This is the **trust mode** for high-sensitivity users. The state is shown prominently in the app header.

### Apple Privacy Manifest

Declares only:

- `NSPrivacyAccessedAPICategoryUserDefaults` (reason: app preferences)
- `NSPrivacyAccessedAPICategorySystemBootTime` (reason: cache invalidation)
- `NSPrivacyAccessedAPICategoryDiskSpace` (reason: model download size check)
- `NSPrivacyAccessedAPICategoryFileTimestamp` (reason: model file integrity)

No tracking domains. No data-collection categories. No third-party SDKs that collect personally identifying data.

### Android Play Data Safety

Declares: no data collected by default. If telemetry enabled by user: "Diagnostics — app interaction events, no personal info."

---

## §14 — Store-policy compliance

### Apple App Store

| Concern                                                      | How AGI complies                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.5.2 (downloaded code changes app behavior)**             | Model weights are data, not code. Inference runtime ships in-bundle. Every feature is visible to reviewers at install. We disclose model download size to user before each download. App is fully functional at launch (System model on supported devices, or BYOK on others — Local download is for offline use, not for unlocking hidden features). |
| **5.1.1(i) (privacy practices)**                             | Privacy manifest filed. No tracking SDKs. Cross-device sync is opt-in with E2EE.                                                                                                                                                                                                                                                                      |
| **5.1.2(i) (third-party AI data sharing — Nov 2025 update)** | Explicit consent modal before first BYOK key add (§11 branch B, §13 principle 6). Disclosure lists every supported provider with privacy policy link. Tap-to-accept required; no pre-checked checkboxes.                                                                                                                                              |
| **2.3.7 (metadata accuracy)**                                | Marketing copy in store listing matches actual functionality. We don't claim AI capabilities we don't ship.                                                                                                                                                                                                                                           |
| **4.3 (spam / clone)**                                       | Distinctive brand (teal `#21808d` + terracotta `#da7756`), unique multi-provider value prop. We don't mimic Claude's, ChatGPT's, or Gemini's interface elements.                                                                                                                                                                                      |
| **4.0 (design)**                                             | Native iOS UI patterns: bottom-anchored sheets, swipe gestures, haptic feedback, dynamic type, dark/light support, VoiceOver.                                                                                                                                                                                                                         |
| **App Review Notes (submission)**                            | Reviewer test account NOT required (Local mode demonstrates the core value). We include a written walkthrough explaining the BYOK consent flow and the Local mode model download UX.                                                                                                                                                                  |

### Google Play

| Concern                            | How AGI complies                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic code / hidden features** | Model weights are data assets. Runtime in-bundle. All features visible at install.                                                                                                          |
| **AI-generated content policy**    | In-app content reporting in every chat message (long-press → Report). Reports route to a moderation pipeline (logs only; no AI-driven moderation v1). User can also flag specific messages. |
| **Data Safety section**            | Declares no data collected by default. If telemetry on: only diagnostics, no personal info, no identifiers.                                                                                 |
| **Asset download disclosure**      | Pre-download dialog shows size, "OK to use cellular data?" with default Wi-Fi-only toggle.                                                                                                  |
| **Financial features declaration** | None on mobile v1. Stripe is web-only.                                                                                                                                                      |

---

## §15 — Pricing & monetization

### Mobile v1 (launch through Aug 1, 2026) — V4 LOCKED

| Mode                                               | Price                         | Account      | Mobile purchase path                              |
| -------------------------------------------------- | ----------------------------- | ------------ | ------------------------------------------------- |
| Local                                              | Free forever                  | Not required | n/a — no purchase                                 |
| BYOK                                               | Free forever                  | Optional     | n/a — user pays provider directly                 |
| Managed Cloud (Hobby / Pro / Pro+ / Pro Max / Max) | **Waitlist until 2026-08-01** | Required     | **StoreKit IAP after Aug 1 graduation** (V4 lock) |

Managed credits/top-ups are not part of mobile v1. Future AGI Compute Credits must be closed-loop, non-transferable, payment-rail-aware, and backed by pre-call balance reservation plus post-call settlement from actual provider usage. No public free credits or unlimited managed-cloud plans ship until fraud, refunds, chargebacks, taxes, provider terms, and support runbooks are verified.

### Managed Cloud on mobile, post-Aug-1 — V4 REVISION

**V3 was wrong:** PRD V3 said "Subscribe routes user to Web via deep link to complete Stripe checkout." Research pack §06 + §07 (and direct primary-source verification of [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) + [Apple EU DMA support](https://developer.apple.com/support/dma-and-apps-in-the-eu/)) disproved this for global storefronts. The corrected default:

| Storefront                | Default purchase path | Allowed alternative                                                                                                                                                                                                       | Effective commission to AGI                                                                                                                                                                                             |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **US**                    | StoreKit IAP          | External purchase link allowed without entitlement; Apple still polices "steering" copy                                                                                                                                   | StoreKit at 15 % (Apple [Small Business Program](https://developer.apple.com/app-store/small-business-program/), AGI qualifies <$1M proceeds/year). External path: 100 % of revenue but Stripe takes ~3 %.              |
| **EU**                    | StoreKit IAP          | External purchase link requires the [StoreKit External Purchase Link Entitlement Addendum](<https://developer.apple.com/contact/request/download/external/StoreKit-External-Purchase-Link-(EU)-Entitlement-Addendum.pdf>) | StoreKit at 15 % (SBP). External path: 2 % initial acquisition + 5-13 % store services + 5 % Core Technology Commission = **12-20 % combined**, plus Stripe ~3 %. Net: external is roughly the same as StoreKit at SBP. |
| **All other storefronts** | StoreKit IAP          | Generally no external link allowed                                                                                                                                                                                        | StoreKit at 15 % (SBP).                                                                                                                                                                                                 |
| **Google Play**           | Google Play Billing   | Alternative billing in EU per DMA-equivalent (rare)                                                                                                                                                                       | Play Billing at 15 % small-developer rate.                                                                                                                                                                              |

**Why StoreKit IAP is now the default (not the workaround):**

1. **Apple Small Business Program brings the effective rate to 15 %**, not 30 %. AGI pre-revenue qualifies automatically; re-qualification each calendar year while proceeds <$1M ([Apple SBP page](https://developer.apple.com/app-store/small-business-program/)).
2. **Global storefront safety.** US storefront external links are permitted today but Apple has rejected apps for "steering" copy; the safe default is StoreKit everywhere with the external link as a region-gated alternative.
3. **EU economics work out.** EU external-purchase combined fees of 12-20 % are competitive with StoreKit 15 %; the operational complexity of running two purchase paths is not worth saving 0-5 percentage points.
4. **Apple manages refunds, tax, regional pricing, family sharing, parental controls.** Avoiding Apple's tax-and-refund machinery means we'd have to build it — that's weeks of work pre-launch.
5. **App Review predictability.** A StoreKit IAP submission has known Review behavior. An external-link-default submission is a coin flip and a launch-date risk.

### Tier prices in StoreKit (V4 LOCKED)

Same prices as web; Apple's 15 % SBP commission means lower net per mobile user vs web user, but Apple's checkout + tax + refund machinery is included. Math (assuming AGI qualifies for SBP at <$1M annual proceeds):

| Tier    | Monthly USD | StoreKit price (mobile)      | Apple takes 15 % | Net to AGI per month |
| ------- | ----------- | ---------------------------- | ---------------- | -------------------- |
| Hobby   | $10.00      | $9.99 (App Store price tier) | $1.50            | **$8.50**            |
| Pro     | $29.99      | $29.99                       | $4.50            | **$25.49**           |
| Pro+    | $49.99      | $49.99                       | $7.50            | **$42.49**           |
| Pro Max | $99.00      | $99.99 (App Store tier)      | $15.00           | **$84.99**           |
| Max     | $299.99     | $299.99                      | $45.00           | **$254.99**          |

**Cohort policy:** users who subscribe on web (Stripe checkout) get the full web rate net to AGI (~97 % after Stripe fees). Users who subscribe on iOS get the StoreKit-net rate. Both cohorts get the same product features; AGI eats the Apple cut for mobile-acquired users. This is the cost of mobile distribution.

**EU AI Act gate:** EU launches must satisfy the AI Act's general-purpose-AI-deployer obligations active from 2026-08-02 (see [Appendix D](PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md)). Mobile EU paid-tier flip aligned to that date.

### No ads, ever (unchanged)

Confirmed in App Review notes, privacy manifest, and home-screen copy ("Free forever. No ads."). Ads would contaminate the privacy positioning irreparably.

### No ads, ever

Confirmed in App Review notes, in privacy manifest, and in copy on the home screen ("Free forever. No ads."). Ads would contaminate the privacy positioning irreparably.

---

## §16 — Analytics & telemetry posture

### Default: OFF

A fresh install has zero outbound telemetry. Crash reporting is off. Analytics are off. The only network traffic is:

- App Store / Play Store update checks (OS-level, not ours)
- User-initiated model downloads
- User-initiated Cloud-mode requests

### Opt-in: granular toggles

Settings → Privacy:

- **Diagnostics & crash reports** (Sentry): default off, opt-in. Stack traces with content >40 chars redacted.
- **Anonymous usage analytics**: default off, opt-in. Events listed below.
- **Wi-Fi-only downloads**: default ON.

### Events (when telemetry is opted in)

| Event                    | Payload                                                                   | Reason                         |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------ |
| `install`                | install_source, app_version, os_version                                   | Funnel start                   |
| `onboarding_complete`    | mode_picked (local/cloud/decide_later)                                    | Funnel measure                 |
| `local_model_downloaded` | model_id, size_bytes, duration_ms                                         | Health check on download infra |
| `byok_consent_accepted`  | (no payload)                                                              | Compliance audit trail         |
| `first_message_sent`     | mode (local/cloud), runtime (foundation/aicore/executorch/llama_rn/cloud) | Activation                     |
| `chat_session_completed` | message_count, total_duration_ms, mode                                    | Engagement                     |
| `model_load_error`       | model_id, error_class                                                     | Health                         |
| `mode_switched`          | from_mode, to_mode                                                        | UX measure                     |
| `crash`                  | stack trace (redacted)                                                    | via Sentry only                |

Never logged: message content, key contents, file contents, file names, user identifiers (no device fingerprint, no email).

### Dashboards

Self-hosted on `services/api-gateway` admin endpoint (`/admin/metrics`), Prometheus + Grafana. Plausible considered but adds a third-party dependency; defer to M4.

---

## §17 — Risk register (mobile-specific)

Top 12 risks. Each: description → blast → mitigation → escalation trigger.

1. **Apple 5.1.2(i) consent modal rejected in App Review** for insufficient disclosure or pre-checked acceptance. Blast: iOS launch blocked. Mitigation: copy in §13 + Appendix B §B.7 reviewed by legal; Detox e2e test asserts the modal renders and accept-only-on-tap; submission notes cite Apple's guideline directly. Trigger: any rejection citing 5.1.2(i) → file Apple Developer support ticket within 24 h.
2. **App Review treats local model download as hidden feature** (2.5.2). Blast: iOS rejection. Mitigation: bundle a tiny demo model + System model fallback so the app is "complete" at install; disclose download size in onboarding; document in submission notes that downloads are data assets, not executable code. Trigger: rejection citing 2.5.2 → resubmit with stronger disclosure copy + demo-model preload.
3. **Local model quality disappoints users** (1.5B-3B can feel weak vs cloud GPT-4 class). Blast: 1-star reviews, churn. Mitigation: onboarding clearly explains tradeoff ("Smaller and private vs larger and online"); model picker shows "System / Fast / Capable" with copy expectations; explicit Continue with BYOK path is always visible; default provider list includes free-tier-friendly options (Google Gemini Flash-Lite). Trigger: <3.5-star avg → ship a clearer BYOK fork UI.
4. **Battery drain from sustained on-device inference.** Blast: phone gets hot, user blames AGI. Mitigation: thermal-aware throttle in native module (auto-pause if device thermal state hits `serious` or `critical`); UI badge "Phone is warm — slowing down to protect battery"; default models are 1.5-3B class which is well within sustained-inference budget on flagship phones. Trigger: any review citing thermal issues → tune throttling thresholds and ship a hotfix.
5. **Storage pressure on user phones.** Blast: download fails, app blamed. Mitigation: pre-download free-space check (must have 2× model size free); storage manager screen lets user delete models with one tap; default model is 1.0 GB (small enough that most phones can fit it). Trigger: >5 % of downloads fail due to storage → reduce default model size or compress more.
6. **Cross-device sync E2EE key loss** (user forgets passphrase). Blast: data unrecoverable. Mitigation: sync is opt-in with explicit "We can't recover this passphrase" warning; encourage user to save passphrase in their password manager during opt-in; show passphrase recovery hint in Settings. Trigger: support tickets about lost passphrases → consider adding optional encrypted backup of passphrase to Keychain (still doesn't reach Supabase).
7. **BYOK key leak** (e.g., via screenshot, accidental sharing). Blast: user's provider bill explodes. Mitigation: keys masked in UI (only prefix shown); "Test key" button doesn't log full key; recommend low-quota keys in onboarding ("Set a $10/mo limit at your provider"); keys are stored on-device and sent only to the selected provider endpoint unless the user explicitly enables a future AGI Relay option. Trigger: any user report of a leaked key → review UI surfaces.
8. **Provider API breaking change** (e.g., Anthropic deprecates a model overnight). Blast: BYOK mode partly broken. Mitigation: mobile translates provider-specific errors into a stable app-level shape; friendly "Model unavailable — try another" message; weekly check of `/api/models` catalog updates the local cache. Trigger: any 4xx surge on a provider → alert + fallback messaging.
9. **App size bloat** from native modules + bundled runtimes. Blast: install conversion drops on tighter data plans. Mitigation: target binary <50 MB; runtimes are downloadable on first Local-mode toggle, not bundled (`llama.rn` downloads native artifacts on postinstall — verify this works in production builds); audit binary size each release. Trigger: binary >75 MB → trim or defer features.
10. **Foundation Models / Gemini Nano output safety regression.** Blast: harmful content rendered. Mitigation: every model output passes through a local safety filter layer (basic deny list for self-harm, violence, sexual minors, etc.); content reporting in every chat message (Play policy compliance); user-blockable phrases in Settings. Trigger: any reported harmful output → root-cause + filter update.
11. **iPad split-view / tablet UX broken.** Blast: poor iPad experience hurts reviews. Mitigation: NativeWind + RN's responsive layout means basic iPad support comes free; explicit tablet QA pass in M3; sidebar / drawer behavior tuned for ≥768 px. Trigger: any iPad-specific reviews <3 stars → dedicated tablet polish sprint.
12. **`llama.rn` config plugin breaks on Expo SDK upgrade.** Blast: build pipeline stops. Mitigation: pin Expo SDK + RN + `llama.rn` versions in lockfile; CI tests build a fresh dev client on every push; manual QA on Expo SDK upgrades before adopting. Trigger: any CI build break → revert to last-known-good version pinning.

---

## §18 — Waves & timeline

Mobile development assumes the platform monorepo + shared TS packages exist (they do, per platform PRD V3). Effort below is **net additional** mobile work.

### Milestone M0 — Spike (this week, May 17-23)

8-12 dev-hours. Validates the runtime choice on real devices.

- Create isolated Expo dev-build branch off `apps/mobile/`
- Wire `llama.rn` via Expo config plugin
- Download Qwen 2.5 1.5B Q4_K_M and TinyLlama 1.1B Q4 GGUFs
- Measure on iPhone 15 Pro: cold-start to first token, decode tok/s, peak RSS, battery delta over 10 generations, thermal note
- Measure on Pixel 8 Pro: same metrics + `adb dumpsys batterystats / meminfo`
- Second branch: same test with `react-native-executorch`
- **Go/no-go on runtime selection by data, not aesthetics**

### Milestone M1 — Local mode hidden alpha (3-4 weeks, May 24 - Jun 21)

~80 dev-hours. Internal-only, no public TestFlight yet.

- `@agiworkforce/local-llm` TS interface package
- iOS native module wrapping Foundation Models (Tier 1) + `llama.rn` (Tier 3)
- Android native module wrapping AICore (Tier 1) + `llama.rn` (Tier 3)
- Model catalog JSON schema + remote allowlist + signed integrity
- Download manager: resumable, background, sha256 verify, progress UI
- Composer + chat list + conversation view (basic)
- SQLCipher SQLite schema (conversations, messages, installed_models, provider_keys, settings)
- Onboarding screens 1-3a + 5a (Local path)
- Apple 5.1.2(i) consent modal (built but only triggered when user opts to add Cloud key later)

### Milestone M2 — BYOK + polish, TestFlight open (3-4 weeks, Jun 22 - Jul 19)

~80 dev-hours. TestFlight + Play Internal Testing.

- BYOK: provider key add/test/rotate/delete, Keychain integration
- Onboarding BYOK branch (3b-6b)
- `/api/llm/v1/chat/completions` client + streaming + `@agiworkforce/llm-normalize` cross-provider continuity
- Voice (Tier 1 platform STT only — whisper.cpp deferred to M3)
- Image attachment (BYOK mode only — local Gemma deferred to M3)
- Drawer with Models, Keys, Account (optional), Settings, About
- Light/dark theming
- Empty states, error handling, content reporting
- Detox e2e tests for: onboarding (both branches), BYOK key add + first message, Local mode model download + first message, Local -> BYOK fork confirmation modal
- Beta on TestFlight + Play Internal: target 100 beta testers, 4-star rating from first 30 reviews

### Milestone M3 — Public launch (3-4 weeks, Jul 20 - Aug 16)

~60 dev-hours. App Store + Play public submission.

- whisper.cpp Tier 2 voice
- Gemma 3 4B vision (Local image analysis)
- sqlite-vec memory + embeddings
- Memory view in drawer + custom instructions
- Cross-device sync (opt-in, E2EE) — pushes/pulls encrypted rows to Supabase
- Wi-Fi-only download policy
- "Network: Off" mode toggle
- Spanish localization (`es`)
- Tablet polish
- App Store submission + Play submission

### Milestone M4 — Post-launch iteration (Aug+)

- Home Ollama / LM Studio local-network discovery
- TTS via Piper local
- Memory import (from other AI apps)
- Managed cloud tier subscription UI (post-platform-Aug-1)
- Additional locales (ja, de, fr, pt-br)
- Watch app (iOS) and Wear OS (Android) explore

### Aggregate effort

- M0 spike: 8-12 hours
- M1 hidden alpha: ~80 hours
- M2 TestFlight: ~80 hours
- M3 public launch: ~60 hours
- M0-M3 total: **~230 hours = ~10-12 solo-founder weeks at 20-25 hours/week**

Public launch realistic: **late July to mid-August 2026.** Submission to App Store typically gets reviewed in 24-72 hours but resubmission cycles (5.1.2(i) clarification, etc.) can add 1-2 weeks.

---

## §19 — Success metrics & kill criteria

### Week 1-2 post-launch

- ≥5,000 installs across iOS + Android
- ≥50 % of installs complete onboarding to first message
- ≥30 % activate Local mode (download a model or use system model)
- 4.3 star rating floor in App Store + Play
- <2 % crash-free regression vs M2 TestFlight

### Month 1

- ≥25,000 installs
- ≥3 acquisition sources contributing ≥10 % each (HN, Reddit, X, YouTube reviewers, Product Hunt)
- ≥25 % 7-day retention on Local mode users
- ≥15 % activate BYOK
- App Store + Play featured (or top-50 in Productivity)

### Month 3

- ≥75,000 installs
- ≥50K monthly active users
- 4.4 star rating sustained
- ≥10 % paid conversion among BYOK users when managed tiers ship

### Kill / pivot triggers

- **Star rating <3.5 in week 1:** stop marketing, root-cause, ship hotfix.
- **App Review rejection that takes >3 cycles to resolve:** escalate to Apple Developer support, possibly reduce ambition (drop BYOK from v1 and ship Local-only).
- **<10 % Local-mode activation by Month 1:** the privacy thesis isn't landing. Re-examine messaging or feature surfacing.
- **<10K installs by Month 1:** acquisition channels aren't working. Re-evaluate marketing positioning.

---

## §20 — Out of scope (intentional)

Things explicitly **not** in mobile v1 — listed so reviewers (human or AI) don't add scope creep:

- **Coding agent / code-aware features.** Mobile is non-coder focused.
- **Connectors directory** (Gmail / Drive / Notion / GitHub / Slack / etc.). BYOK and Managed Cloud users can use them on Web / Desktop.
- **Dispatch / cross-surface task delegation.** Mobile v1 is a chat app, not a control plane.
- **MCP server browsing / install.** MCP is Desktop / CLI territory.
- **Image generation.** BYOK users can prompt their provider; no native AGI image-gen surface on mobile v1.
- **Video generation.** Same as above.
- **Computer use.** No "control your phone" agent — phones aren't desktops.
- **Multi-step agentic / deep research.** Single-message Q&A only in v1.
- **Plug-ins ecosystem on mobile.** Plug-ins live on Desktop / CLI.
- **Apple Watch / Wear OS apps.** Maybe M4+, not before.
- **iPad-specific multi-window layouts.** Tablet support is "make it not break" in v1; dedicated iPad UI in a later wave.
- **Push notifications.** None in v1. Local notifications maybe in M4 (e.g., model download complete).
- **In-app purchase via Apple IAP / Google Billing.** Subscriptions route to Web via deep link.
- **Web search.** No mobile-side web search v1; user can ask their provider in BYOK mode.

---

## §21 — Governance & cross-links

**Authority hierarchy:**

1. `docs/PRD-MOBILE.md` (this file) — canonical for mobile-specific implementation and product decisions.
2. `docs/PRD.md` — canonical for cross-surface platform concerns (branding, pricing tier definitions, vendor partnership reality, shared SSOTs).
3. `docs/PRD-APPENDIX-A-DATA-MODELS.md`, `docs/PRD-APPENDIX-B-API-CONTRACTS.md`, `docs/PRD-APPENDIX-C-MONOREPO-LAYOUT.md` — locked appendices to the platform PRD; this mobile PRD inherits all definitions there.
4. `AGI_WORKFORCE.md` — platform SSOT, verified state, sprint history.
5. 18 ADRs in `docs/decisions/` — durable architectural decisions; remain in force unless this PRD overrides explicitly.

**Conflict resolution:** when this mobile PRD conflicts with `docs/PRD.md` on a mobile-specific concern (UX, mobile tech stack, mobile timeline), this file wins. On a platform-wide concern (billing tier definitions, brand register, provider catalog, security posture), `docs/PRD.md` wins.

**Amendment process:** PR against `docs/PRD-MOBILE.md` with §-level note in PR body. If amendment changes a LOCKED item, cite the upstream decision (memory file, ADR, founder sign-off in PR comment, or chat-transcript link). Conventional Commits: `docs(prd-mobile): …`. Lowercase, ≤100 chars header, `Co-Authored-By:` footer.

**Review cadence:** every milestone close (M0, M1, M2, M3). Adjust for actual telemetry post-launch.

**Supersedence:** the mobile section of `docs/PRD.md` V3 §6 surface matrix is superseded by this PRD on mobile-specific details. Platform PRD remains canonical for cross-surface concerns.

**Out-of-scope items (§20) become candidates for future mobile PRDs:** mobile coding agent, mobile Dispatch, mobile connectors, etc. Each gets its own scoped PRD when prioritized — not bolted onto this one.

---

_End of PRD-MOBILE. Generated 2026-05-17. First-implementation mobile spec for AGI. Targets late July to mid-August 2026 public launch on iOS App Store + Google Play. ~9,500 words. All cross-references to platform PRD V3 verified against `docs/PRD.md` 2026-05-17 build._
