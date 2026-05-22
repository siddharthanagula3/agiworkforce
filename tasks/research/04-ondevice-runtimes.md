# 04 — On-device runtimes and hardware roadmap first pass

**Recommendation:** keep the PRD V3 runtime hierarchy: Apple Foundation Models on iOS, Gemini Nano/AICore on Android, React Native ExecuTorch as cross-platform fallback, and llama.rn as broad GGUF fallback. Do not make a GGUF runtime the launch-critical primary path.

## Why

- Native platform runtimes give the best privacy, update, and app-store story.
- React Native ExecuTorch fits the locked Expo/RN/native-module constraint better than a Swift/Kotlin rewrite.
- llama.rn is valuable for model breadth but has enough device/OS edge-case risk that it should be T3.
- LiteRT-LM is strategically important because MediaPipe LLM mobile is excluded/deprecated in the brief, but integration should not block v1.

## Runtime matrix

| Runtime                 | Tier                          | Type                          | Platform                         | Strength                                               | Launch risk                                       | Decision                            | Evidence        |
| ----------------------- | ----------------------------- | ----------------------------- | -------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------------------------------- | --------------- |
| Apple Foundation Models | iOS T1                        | Native Apple framework        | iOS / Apple Intelligence devices | Best privacy/App Review fit                            | OS/device eligibility; feature opacity            | Keep T1                             | S003            |
| Gemini Nano / AICore    | Android T1                    | Android AICore + ML Kit GenAI | Supported Android devices        | Offline, AICore model distribution, no direct internet | Device/API availability                           | Keep T1                             | S013            |
| React Native ExecuTorch | T2 fallback                   | RN package over ExecuTorch    | iOS/Android RN                   | Fits Expo/RN native module stack                       | Model conversion/perf validation needed           | Keep T2                             | S014            |
| ExecuTorch native       | Infra substrate               | PyTorch edge framework        | iOS/Android/edge                 | Upstream mobile deployment path                        | Native integration work                           | Use under RN wrapper where possible | S016            |
| llama.rn                | T3 fallback                   | RN binding for llama.cpp      | iOS/Android                      | GGUF/model breadth, Metal iOS                          | Open issue volatility, Android accel experimental | Keep T3                             | S015            |
| llama.cpp               | Runtime substrate             | C/C++ GGUF inference          | Broad desktop/mobile             | Massive ecosystem                                      | Native binding burden                             | Use via llama.rn or desktop         | S015            |
| LiteRT-LM               | Future Android/edge candidate | Google AI Edge LLM runtime    | Android/edge                     | Apache-2.0, edge-focused, KV/spec decode               | Not RN-first; integration work                    | Track, not v1 primary               | S017            |
| MLX Swift               | iOS/macOS candidate           | Apple MLX ecosystem           | Apple devices                    | Strong Apple local inference path                      | Swift/native rewrite risk                         | Post-v1 research                    | needs_full_pass |
| whisper.cpp             | Speech local runtime          | C/C++ ASR                     | iOS/Android/desktop              | Local voice path                                       | Separate from LLM runtime                         | Use for voice after launch          | needs_full_pass |
| Google AI Edge Gallery  | Reference app                 | On-device app template        | Android/mobile                   | Offline/private UX reference                           | Reference, not runtime                            | Use for UX/testing ideas            | S018            |
| PocketPal AI            | Reference app                 | Mobile GGUF local app         | iOS/Android                      | Consumer local UX reference                            | Need current listing/code review                  | Reference only                      | needs_full_pass |
| Jan AI                  | Desktop reference             | Local/private desktop app     | Desktop                          | Open-source local UX                                   | Not mobile v1                                     | Reference only                      | needs_full_pass |

## Device test matrix

Minimum launch matrix:

1. iPhone 15 Pro: Apple Foundation Models path, RN ExecuTorch smoke, llama.rn smoke.
2. Pixel 8 Pro: Gemini Nano/AICore path, RN ExecuTorch smoke, llama.rn smoke.
3. One older iPhone without Apple Intelligence eligibility: fallback UX and cloud/BYOK route.
4. One midrange Android without AICore model availability: fallback UX and model install denial.
5. One low-storage device: model download/storage failure path.

## Acceptance criteria

- Local model route never blocks onboarding.
- Capability detection runs before showing local-model claims.
- Crash-free local route >=99.5% on locked hardware.
- First-token latency and tokens/sec recorded per runtime/device/model.
- Local unavailable state is explicit, not silent cloud fallback.
- Model files are deletable and storage impact is visible.

## Hardware roadmap implication

Native acceleration will improve faster than a solo founder can maintain custom kernels. The architecture should ride platform-managed AI where possible and keep cross-platform runtimes modular. If Apple or Android expands native model APIs, AGI should upgrade T1 paths without touching product-level conversation state or LLM routing contracts.

## Sources

- **S003 — Apple Foundation Models framework** (Apple, 2026-05). https://developer.apple.com/documentation/FoundationModels. Framework access to Apple Intelligence on-device language model; web.run refs turn375646search1/10.
- **S013 — Gemini Nano on Android** (Google/Android, 2026-04-02). https://developer.android.com/ai/gemini-nano. AICore, ML Kit GenAI, offline/private, no direct internet, managed model distribution; web.run ref turn254275view4.
- **S014 — React Native ExecuTorch** (Software Mansion, 2026-05). https://github.com/software-mansion/react-native-executorch. RN on-device AI powered by ExecuTorch, MIT license; web.run refs turn150822search0/4.
- **S015 — llama.rn** (mybigday, 2026-05). https://github.com/mybigday/llama.rn. RN binding for llama.cpp, iOS Metal, Android experimental acceleration; web.run refs turn150822search1/9/17.
- **S016 — ExecuTorch** (PyTorch, 2026-05). https://github.com/pytorch/executorch. Unified on-device deployment for mobile/edge; packages for iOS/Android; web.run refs turn150822search2/6/10.
- **S017 — LiteRT-LM** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/LiteRT-LM. Open-source high-performance edge LLM inference, Apache-2.0; web.run refs turn150822search3/11/27.
- **S018 — Google AI Edge Gallery** (Google AI Edge, 2026-05). https://github.com/google-ai-edge/gallery. On-device offline/private LLM mobile app; web.run ref turn150822search15.
- **S024 — Google Play AI-generated content policy** (Google Play, 2026-05). https://support.google.com/googleplay/android-developer/answer/13985936. Developers responsible for safe AI-generated content and user feedback/reporting; web.run refs turn520427search3/14.
- **S026 — Meta Prompt Guard 2** (Meta/Hugging Face, 2026-05). https://huggingface.co/meta-llama/Prompt-Guard-86M. 86M/22M prompt-injection classifier variants, license constraints; web.run refs turn520427search2/10/16.
- **S035 — NIST AI Risk Management Framework** (NIST, 2026-05). https://www.nist.gov/itl/ai-risk-management-framework. Govern/Map/Measure/Manage functions; web.run refs turn237196search0/4/27.
