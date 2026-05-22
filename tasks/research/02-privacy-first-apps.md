# 02 — Privacy-first / local-first apps first pass

**Recommendation:** AGI should borrow the trust signals from local-first products but avoid exposing developer-grade runtime complexity to mobile users. The product should feel like a private workspace, not a model runner.

## Why

- LM Studio and Ollama prove demand for local/private model control, but their core UX assumes technically capable users.
- Google AI Edge Gallery proves that on-device LLM UX can be framed as private/offline on mobile.
- BYOK and local-first apps often fail at policy clarity: users do not know which model ran, where data went, or which telemetry exists.
- AGI can win by making privacy and routing legible: local vs BYOK vs managed cloud, model, cost, retention, and telemetry state visible per conversation.

## Matrix

| App                    | Surface                         | Positioning                                           | Evidence        | AGI implication                                                                        |
| ---------------------- | ------------------------------- | ----------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| PocketPal AI           | Mobile local LLM                | Local/offline assistant pattern                       | needs_full_pass | Strong direct comparator for mobile GGUF UX; verify safety/moderation.                 |
| Google AI Edge Gallery | Mobile local LLM reference      | Offline/private on-device LLM reference app           | S018            | Important reference for Android/Gemini/Gemma local UX.                                 |
| Private Mind           | Mobile private AI               | Privacy-first local assistant candidate               | needs_full_pass | Needs official listing verification.                                                   |
| LM Studio              | Desktop local LLM               | Run local models privately on user hardware           | S043            | Desktop benchmark for local model discovery and server mode.                           |
| Ollama                 | Local model runtime             | Build/run open models locally while keeping data safe | S044            | Great developer mental model; AGI should avoid exposing raw server risks to consumers. |
| Jan AI                 | Desktop local/private assistant | Open-source local AI assistant                        | needs_full_pass | Useful for desktop UX and open-source trust model.                                     |
| Msty                   | Desktop multi-model             | Local/cloud model UX                                  | needs_full_pass | Needs current official verification.                                                   |
| TypingMind             | Web/BYOK multi-provider         | BYOK/multi-model chat UX                              | needs_full_pass | Useful BYOK and folder/prompt UX comparator.                                           |
| OpenWebUI              | Self-hosted web UI              | Ollama/OpenAI-compatible web UI                       | needs_full_pass | Important for admin/self-hosted UX and security risk boundaries.                       |
| LibreChat              | Self-hosted multi-provider      | Open-source multi-provider chat                       | needs_full_pass | Relevant for provider adapter patterns.                                                |
| Cherry Studio          | Desktop multi-provider          | Open-source desktop AI client                         | needs_full_pass | Relevant for model routing and BYOK UX.                                                |
| Faraday/Backyard AI    | Local character/chat app        | Local model consumer UX                               | needs_full_pass | Relevant for local model installation and content moderation.                          |

## Product lessons

### Local model install

Local-first apps win when model installation is simple and reversible. AGI should not ask mobile users to understand quantization names. The model chooser should show compatibility, expected storage, expected latency, and privacy mode. For iOS and Android native T1 paths, the user should not have to download or manage a model manually.

### BYOK

BYOK is a power-user retention feature and a legal/commercial risk reducer. It should be first-class in AGI, but not forced on non-technical users. Store API keys in secure platform storage, never send them to AGI servers unless the user explicitly opts into a proxy route, and display which provider receives each request.

### Local output safety

Local apps often rely on the model and the user. That is insufficient for app stores. AGI needs a report/feedback path, safety copy, policy restrictions, and at least prompt-injection controls for tool routes.

### Self-hosted/web UI comparators

OpenWebUI and LibreChat-style products are important for provider adapters and admin UX, but they are not ideal mobile consumer references. They also show that self-hosted tools can create trust-boundary and remote-server risks. AGI should hide the complexity and expose safe defaults.

## Launch positioning

“Private AI workspace” is stronger than “local LLM runner.” The app should promise: private by default, local when supported, BYOK when you choose cloud, managed cloud only with explicit consent and usage limits.

## Sources

- **S018 — Google AI Edge Gallery** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/gallery. On-device offline/private LLM mobile app; web.run ref turn150822search15.
- **S043 — LM Studio** (LM Studio, 2026-05). https://lmstudio.ai/. Local/private local LLM desktop app; web.run ref turn614778search3.
- **S044 — Ollama** (Ollama, 2026-05). https://ollama.com/. Build/run open models locally while keeping data safe; web.run ref turn614778search5.
- **S013 — Gemini Nano on Android** (Google/Android, 2026-04-02). https://developer.android.com/ai/gemini-nano. AICore, ML Kit GenAI, offline/private, no direct internet, managed model distribution; web.run ref turn254275view4.
- **S014 — React Native ExecuTorch** (Software Mansion, 2026-05). https://github.com/software-mansion/react-native-executorch. RN on-device AI powered by ExecuTorch, MIT license; web.run refs turn150822search0/4.
- **S015 — llama.rn** (mybigday, 2026-05). https://github.com/mybigday/llama.rn. RN binding for llama.cpp, iOS Metal, Android experimental acceleration; web.run refs turn150822search1/9/17.
- **S017 — LiteRT-LM** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/LiteRT-LM. Open-source high-performance edge LLM inference, Apache-2.0; web.run refs turn150822search3/11/27.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S029 — Sentry React Native docs** (Sentry, 2026-05). https://docs.sentry.io/platforms/react-native/. PII scrubbing/source maps/session replay masking; web.run refs turn760064search3/7/23.
- **S030 — PostHog privacy controls** (PostHog, 2026-05). https://posthog.com/docs/privacy. EU hosting, IP capture controls, sensitive autocapture controls, cookieless/opt-out; web.run refs turn760064search2/6/14.
