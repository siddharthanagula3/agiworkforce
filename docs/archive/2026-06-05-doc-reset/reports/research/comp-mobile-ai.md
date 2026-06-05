# Competitive Research: Mobile AI Apps + On-Device LLM Bar (iOS)

Topic: Current mobile AI app feature bar (iOS) for ChatGPT / Claude / Gemini / Perplexity, and the realistic state of on-device LLM inference on iOS.
Author: Research analyst (subagent)
Date compiled: 2026-05-29
Confidence: Medium overall. App feature bar leans on dated secondary press (9to5Mac/9to5Google/MacRumors/VentureBeat), not first-party changelogs — flagged "(press)" inline. On-device LLM technical limits are high-confidence (Apple ML Research + framework docs + multiple independent practitioner sources agree, including the corrected 4K framework context window). Forward-looking items (WWDC 2026, vendor benchmarks) are unverified and flagged. Low-confidence items are flagged inline.

> Verification note: All external facts below carry an inline source tag `[Sn]` mapping to the Sources section. Where a claim rests only on secondary press (not first-party docs/changelogs), it is marked "(press)". Training data was treated as unverified; every fact here was pulled live on 2026-05-29.

---

## 1. Summary

As of May 2026, the four leading consumer mobile AI apps on iOS (ChatGPT, Claude, Gemini, Perplexity) have converged on a common feature bar that a credible competitor must match: inline (in-thread) voice mode, persistent cross-chat memory, projects/organization, multimodal input (camera/photo/file/PDF), image generation, deep research, and OS-level integration (Siri / App Intents / widgets / share sheet). The differentiators are now agentic task execution (Perplexity Comet's browser-agent, Claude's connectors/MCP, ChatGPT's connected-app memory) and first-party OS hooks.

Separately, on-device LLM inference on iOS in 2026 is real but bounded. Apple's Foundation Models framework exposes a ~3B-parameter on-device model (free, offline, private) for summarization / extraction / structured output / tool calling — explicitly **not** a general-knowledge chatbot [S6][S7][S8]. Critically, the framework caps usable context at only **~4,096 tokens per session** (instructions + all prompts + all responses combined) — the 65K figure in Apple's research paper is the model's *training* sequence length, not what apps get [S20][S21]. iOS 26.4 added APIs to manage that budget (`contextSize`, `tokenCount`) but did **not** raise it [S21]. For anything larger or model-of-your-choice, third-party runtimes (MLX, llama.cpp/GGUF, ExecuTorch, Core ML) run 1B–4B quantized models locally, but the binding constraint is the iOS per-app memory ceiling (~3–5 GB on an 8 GB phone before jetsam kills the app) [S10][S11]. The practical local ceiling today is a ~3–4B 4-bit model.

For AGI Workforce (v1 = Local + BYOK, multi-provider, local-first): the mobile feature **table stakes** are inline voice, memory, projects, multimodal, share-sheet/App-Intents entry, and offline behavior. The realistic local-first story on iOS is: Foundation Models for free zero-cost on-device tasks (iOS 26+, Apple-Intelligence devices) + a bundled/downloadable 1–4B quantized model via MLX or llama.cpp for BYO-local — with hard memory/thermal limits that AGI must design around, not around the model the user wishes they could run.

---

## 2. Current bar — what the market requires as of 2026-05-29

These are features present in 2+ of the four leading apps and therefore "expected" by users. A new entrant that lacks several of these will read as behind.

### 2.1 Voice
- **Inline (in-thread) voice is now the default UX.** Both ChatGPT and Gemini have moved voice out of a separate full-screen "orb" and into the chat thread, letting users switch between talking and typing without a mode change [S1][S3] (press). Gemini Live "no longer opens a fullscreen interface" [S3].
- **Push-to-talk** is now offered (Claude's mobile voice update added a push-to-talk mode, mirroring Claude Code's hold-space mechanic) [S2] (press).
- **Multilingual / on-the-fly language switching.** Claude's mobile voice update added 18 languages with mid-conversation switching, powered by Claude Haiku 4.5 [S2] (press). ChatGPT lists nine named voices [S1] (press).
- **Voice can call tools / connectors.** Claude voice can query Google Calendar, Gmail, and Google Docs and read results back audibly [S4][S5] (press). Perplexity Comet voice works across open browser tabs [S15].
- **Lock-screen / widget voice entry.** ChatGPT ships lock-screen widgets to start a voice conversation [S12].

### 2.2 Memory & personalization
- **Persistent cross-chat memory is standard.** ChatGPT retains name/role/preferences/projects across chats, is now "smarter about what to remember," supports per-project memory scoping, and lets users search/sort what it knows [S1] (press).
- **Memory pulls from connected data** (past chats, saved memories, files, connected Gmail) for Plus/Pro [S1] (press).
- Claude's organizing primitive is **Projects** (persistent context for related conversations) [S2].

### 2.3 Projects / organization
- ChatGPT, Claude all expose Projects (and ChatGPT scopes memory per project) [S1][S2].
- Claude exposes **Artifacts** (interactive code previews, documents, visual outputs) on mobile [S2].

### 2.4 Multimodal input
- **Camera / photo capture + image understanding** (transcribe handwriting, identify landmarks/objects) is table stakes — ChatGPT [S1], Claude (screenshots/photos/diagrams) [S2], Gemini (show-and-tell with "Nano Banana") [S3].
- **File / PDF / CSV / code upload.** Claude accepts PDFs, CSVs, code files up to 30 MB [S2] (press).
- **Drag-and-drop images** into the assistant (Perplexity Comet, May 2026) [S16].

### 2.5 Image (and video) generation
- In-app image generation from text, plus edit-by-prompt — ChatGPT [S1], Gemini ("Nano Banana") [S3].
- Gemini added conversational **video** creation/editing ("Gemini Omni", "Nano Banana for videos"), announced at Google I/O 2026 (2026-05-19) [S3][S14] (press).

### 2.6 Deep research / agentic tasks
- **Deep Research** (multi-source ingestion + synthesized report) — Perplexity [S15], and broadly across the field.
- **Agentic task completion** is the 2026 frontier: Perplexity Comet's iOS assistant summarizes emails, searches/compares products and prices, and completes web tasks across tabs [S15][S13]; Gemini's "24/7 Spark agent" + "Daily Brief" announced at I/O 2026 [S14] (press).
- **Connectors / app integrations.** Claude connectors (mobile in beta) cover AllTrails, Instacart, Audible, Tripadvisor, Uber, Spotify and surface contextually [S9]; Claude can draft calendar events, find locations, manage reminders via iOS apps [S9].

### 2.7 OS-level integration (iOS-specific table stakes)
- **Apple Intelligence / Siri handoff.** ChatGPT integrates with Apple Intelligence (since iOS 18.2): Siri routes complex queries to ChatGPT, plus Writing Tools and Visual Intelligence [S17].
- **App Intents** is Apple's sanctioned way to expose app actions to Siri / Spotlight / Shortcuts / Apple Intelligence; the major Siri + App Intents overhaul is reportedly slated for iOS 26.4 / spring 2026 [S18] (press, Gurman/Bloomberg via secondary).
- **Widgets, lock-screen entry, share sheet** are expected entry points (ChatGPT widgets [S12]).
- **Cross-device continuity** (start on one device, resume on another) — Perplexity Comet [S15].
- **Health data access** (Claude reads HealthKit activity/sleep on Pro/Max, US-only) [S9].

### 2.8 Pricing / packaging context
- Free tier with capped capability is universal. ChatGPT iOS: free with IAP — Go $8, Plus $19.99, Pro up to $200 (App Store listing, as of 2026-04-11) [S1] (press). Perplexity Comet free with Pro/Max from $20/mo [S13][S15] (press). All use StoreKit IAP.

---

## 3. Version-specific facts (exact versions + dates)

### 3.1 The four apps (iOS)
| App | iOS requirement | Notable dated facts |
|---|---|---|
| **ChatGPT** | iOS 17.0+ (App Store listing) [S17-context]. Note: one secondary source cited iOS 18 for some Apple-Intelligence features; the base app requires iOS 17. | App Store lists free + IAP (Go $8 / Plus $19.99 / Pro up to $200) as of 2026-04-11 [S1]. Apple Intelligence + ChatGPT integration shipped in iOS 18.2 (2024-12) [S17]. |
| **Claude (by Anthropic)** | iOS 18.0+ [S9-context] | Voice update: 18 languages + push-to-talk, powered by **Claude Haiku 4.5** [S2]. Connectors mobile-beta; HealthKit on Pro/Max US-only [S9]. App Store ID 6473753684 [S2]. |
| **Gemini (via Google app on iOS)** | (Google app) | **Gemini 3.5 Flash**, "Neural Expressive" redesign, 24/7 Spark agent, Daily Brief, Gemini Omni (video) all announced/rolling out from **Google I/O 2026, keynote 2026-05-19** [S3][S14]. Gemini 3.5 Flash claims to surpass 3.1 Pro on coding/agentic/multimodal and be ~4x faster output tok/s than other frontier models [S3] (vendor claim). |
| **Perplexity Comet** | iOS (iPhone + iPad) | Comet browser launched on iOS **2026-03-18** [S13]. 8-feature update reported **2026-05-21** (phone-number actions, iPad sidebar, Finance Deep Dive tab, drag images, etc.) [S16]. Voice Mode uses **OpenAI GPT Realtime 1.5** (~25% more reliable, per changelog) [S16] (press). |

### 3.2 Apple Foundation Models framework (on-device)
- **Availability:** iOS 26, iPadOS 26, macOS 26; any Apple-Intelligence-compatible device with Apple Intelligence enabled (iPhone 15 Pro line and newer per practitioner reports) [S6][S7]. Framework unveiled WWDC 2025; newsroom post **2025-09-29** [S7].
- **Model size:** ~**3 billion parameters** on-device [S6][S7][S8].
- **Context window — IMPORTANT distinction:** the model was *trained* on sequences up to **65K tokens** [S6], but the **framework exposes only ~4,096 tokens per `LanguageModelSession`** to apps — instructions + all prompts + all responses must fit in that budget, else the framework throws `.exceededContextWindowSize` [S20][S21]. **4,096 is the load-bearing number** for "what can it do on-device," not 65K. This matches AGI's own locked platform-facts note ("Apple FM ... 4K context") [internal lock]. **iOS 26.4** (RC 2026-03-23) added `contextSize` (available capacity) and `tokenCount(for:)` APIs to manage the budget dynamically — but did **not** raise the limit [S21]. (APIs are `@backDeployed` to all FM-supporting iOS versions.)
- **Languages:** designed to support **15 languages** [S6].
- **Quantization (on-device):** decoder weights **2 bpw** (Quantization-Aware Training), embedding table **4 bpw**, KV cache **8 bpw**; KV-cache memory reduced ~37.5% via a 2-block 5:3-depth design [S6].
- **Capabilities:** summarization, entity extraction, text understanding/refinement, short dialog, creative generation; **guided generation** (constrained decoding via `@Generable` Swift macro), **tool calling**, streaming [S6][S8].
- **Cost:** free, on-device, offline, no per-request inference cost [S7].
- **Explicit limitation (Apple's own words):** "not designed to be a chatbot for general world knowledge" [S6].
- **Benchmarks (Apple):** performs favorably vs Qwen-2.5-3B across languages; competitive with Qwen-3-4B / Gemma-3-4B in English; ~4.6% MGSM regression from compression, +1.5% MMLU [S6]. (Tech report dated 2025-07-17 [S6].)
- **WWDC 2026:** keynote **2026-06-08** (runs through 06-12); iOS 27 / redesigned LLM-based Siri expected — i.e., a Foundation Models update is plausible but **unverified** as of 2026-05-29 [S5b]. Do not assume new capabilities until the keynote.

### 3.3 Third-party on-device runtimes (iOS)
- **MLX / MLX-Swift (Apple):** Apple-Silicon-optimized, unified-memory CPU/GPU. Apple's `LLMEval` reference runs Llama 3, Qwen 2.5, Phi-2 on-device via Metal; reported live on an **iPhone 13 Pro (6 GB)**; HF models like `Qwen3-4B-4bit` load by HF ID [S10].
- **llama.cpp / GGUF:** "go-to for CPU inference"; GGUF is the de-facto quantized distribution format; supports mmap loading (critical on iOS, see pitfalls) [S11][S12b].
- **ExecuTorch (Meta):** reached **1.0 GA October 2025**, ~50 KB base footprint, 12+ hardware backends, "80%+ of popular edge LLMs on HuggingFace work out of the box" — recommended as the mobile-production runtime [S12b].
- **Core ML:** Apple's compiled-model path (ANE/GPU/CPU); used for converted models, but for general LLMs MLX/llama.cpp dominate the practitioner guides.
- **Practical model ceiling:** 1B–4B 4-bit is the convergence point for on-device phones; "4-bit is the new default" with ~1–3% quality drop and 4x memory reduction [S12b]. A 125M model can hit ~50 tok/s on iPhone; decode is **memory-bandwidth-bound** (mobile ~50–90 GB/s vs datacenter 2–3 TB/s) [S12b].
- **NPU TOPS (context):** A19 Pro ~35 TOPS; Snapdragon 8 Elite Gen 5 ~60; Dimensity 9400+ ~50 [S12b].

---

## 4. Known pitfalls & gotchas

1. **iOS per-app memory ceiling is the hard wall.** An 8 GB iPhone realistically gives an app only ~3–4 GB (sometimes a ~5 GB "dirty memory" jetsam ceiling); exceed it and iOS silently kills the app [S10][S11]. This caps practical local models at ~3–4B 4-bit.
2. **mmap is mandatory, not optional.** Memory-mapped (mmap) model loading makes weight pages count as **clean** (pageable) rather than **dirty** memory, which is the difference between running and being jetsam-killed. llama.cpp supports this natively [S11].
3. **The `Increased Memory Limit` entitlement is unreliable for the App Store.** `com.apple.developer.kernel.increased-memory-limit` raises the ceiling in dev/sideload (reports up to ~15 GB), but App-Store builds have been observed crashing near ~6 GB anyway, and it's device-model-gated and approval-gated [S19]. Do not architect around it for App Store distribution.
4. **Foundation Models is not a chatbot, and its 4K context is the real wall.** Apple explicitly scopes the on-device model to summarization/extraction/structured tasks, not general world knowledge — using it as a free "local ChatGPT" will disappoint [S6]. The **~4,096-token per-session window** [S20][S21] means it **cannot** summarize a long chat thread, a long PDF, or hold a multi-turn conversation of any length in one session — you must chunk/window inputs and it throws `.exceededContextWindowSize` when exceeded. Plan FM usage around small, bounded inputs (one message, one short doc section, one classification call), not long-context work. It's also gated to Apple-Intelligence-eligible devices with the feature enabled [S7].
5. **Device + OS gating fragments the install base.** Foundation Models needs iOS 26 + Apple-Intelligence hardware (iPhone 15 Pro-class and up). Older/cheaper iPhones (important for AGI's India-first GTM) get **none** of this — a local-first plan that assumes Foundation Models excludes much of the target market.
6. **Decode is bandwidth-bound, and thermals throttle.** TOPS headline numbers overstate sustained throughput; real utilization is far below peak and sustained inference triggers thermal throttling on phones [S12b][S11].
7. **KV cache can exceed model weights for long context.** Long-context on-device blows the memory budget via KV cache, not just weights — quantize the KV cache (Apple uses 8 bpw) or cap context [S6][S12b].
8. **Voice "powered by" model matters.** Free-tier voice often runs a smaller/cheaper model (e.g., ChatGPT free voice on GPT-4o-mini with a ~2 hr/day cap [S1]); quality parity claims must specify tier.
9. **Vendor benchmark claims are not independent.** Gemini 3.5 Flash "beats 3.1 Pro" and Apple's "favorable vs Qwen-2.5-3B" are first-party; treat as directional, not verified [S3][S6].
10. **Many "2026 feature" claims live only in secondary press / changelogs, not first-party docs.** Items tagged "(press)" above should be re-verified against the app's own changelog before AGI cites them in product copy.

---

## 5. Implications / gaps for AGI Workforce

AGI Workforce mobile = Expo 55 / React Native, v1 Local + BYOK, multi-provider routing, local-first privacy. Framing the bar against that:

### 5.1 Table-stakes AGI must match (or it reads as behind)
- **Inline voice mode** with push-to-talk (the field has standardized on in-thread, not full-screen-orb) [S1][S2][S3]. RN path: native speech + a streaming STT/TTS provider; for local-first, on-device STT (Whisper-class) is feasible but heavy.
- **Persistent memory + Projects** as the organizing primitive [S1][S2]. Local-first angle: store memory on-device (differentiator vs cloud-memory competitors).
- **Multimodal input**: camera capture, photo/screenshot understanding, PDF/file upload [S1][S2][S3].
- **OS entry points**: share sheet, widgets, and **App Intents** so AGI actions are reachable from Siri/Spotlight/Shortcuts [S18]. This is the cheapest way to feel native and is squarely compatible with local-first.
- **Deep Research** flow [S15] — fits AGI's multi-provider routing (route the heavy synthesis step to a BYOK frontier model).

### 5.2 Where local-first is a genuine edge (lean in)
- **Foundation Models = free, private, offline *bounded* tasks** (extract entities, classify intent, structured output, refine/rewrite one short message, summarize one short chunk) at **zero inference cost** on iOS 26 + AI-capable devices [S6][S7]. AGI's best fits given the **~4K context** [S20][S21]: **routing/intent-detection** (short input, ideal), on-device **redaction/secret-scan classification** before a Local→BYOK fork, and per-message rewrite/format — *not* whole-thread summarization or long-doc work (those exceed 4K and must be chunked or routed to BYOK). Never send these to BYOK/cloud (aligns with the locked Local-vs-BYOK trust boundary).
- **Bundled/downloadable local model** (MLX or llama.cpp, 1–4B 4-bit GGUF) for "truly local chat" — a differentiator vs ChatGPT/Claude/Gemini, which are all cloud-dependent. This is the literal embodiment of AGI's local-first promise on mobile.
- **Visible provider labels + explicit Local→BYOK fork** map cleanly onto a "this answer was generated on-device / this one went to your BYOK provider" UX — a trust feature the incumbents don't offer.

### 5.3 Hard constraints AGI must design around
- **Memory ceiling**: default local model must be ≤~3–4B 4-bit, loaded via **mmap**; do **not** rely on the increased-memory entitlement for App Store [S10][S11][S19]. Pick a default like a 1–3B 4-bit (e.g., Qwen3-/Llama-3.2-class) and gate larger models behind explicit user opt-in + device check.
- **Device gating**: Foundation Models excludes pre-iPhone-15-Pro and non-iOS-26 devices — critical given AGI's **India-first GTM** where mid-range Androids and older iPhones dominate. Local-first on mobile must have a graceful tier: (a) Foundation Models where available, (b) bundled small GGUF where RAM allows, (c) BYOK/cloud fallback elsewhere. (Android local path — Gemma + LiteRT — is Google's canonical route per project memory; mirror this structure.)
- **Thermal/battery budget**: sustained local inference throttles and drains battery; cap context, quantize KV cache, and prefer Foundation Models (NPU-optimized, Apple-managed) for short tasks [S6][S12b].

### 5.4 Concrete gaps to track (suggested follow-ups, not asserted facts)
- Verify whether AGI mobile already wires **App Intents** and a **share extension** (repo has `apps/mobile/ios/` and `native/` — needs a code check, out of scope for this research file).
- Confirm AGI's mobile **voice** plan is inline + push-to-talk, not full-screen.
- Decide the **default bundled local model** + size and the **device-capability gate** for enabling Foundation Models vs bundled GGUF vs BYOK.
- Re-verify all "(press)"-tagged competitor features against first-party changelogs before using in marketing/parity claims.
- Watch **WWDC 2026 (2026-06-08)** for a Foundation Models / on-device update that could move the bar [S5b].

---

## 6. Sources

Each: title — url — date (publication or last-updated where known; "accessed 2026-05-29" for live pages without a clear date).

- [S1] ChatGPT iOS 2026 features (voice inline, 9 voices, GPT-4o-mini free voice 2hr cap, memory/projects, image gen, App Store pricing as of 2026-04-11) — synthesized from ChatGPT release notes & 2026 feature guides — https://help.openai.com/en/articles/6825453-chatgpt-release-notes and https://apps.apple.com/us/app/chatgpt/id6448311069 — accessed 2026-05-29 (press/secondary corroboration).
- [S2] Claude mobile voice upgrade (18 languages, push-to-talk, Claude Haiku 4.5; Artifacts & Projects on mobile) — TechnoSports — https://technosports.co.in/claude-voice-mode-getting-biggest-upgrade/ — 2026 (press).
- [S3] Gemini app at I/O 2026 (Gemini Live inline, Neural Expressive redesign, Gemini 3.5 Flash, Nano Banana image, Gemini Omni video) — 9to5Google — https://9to5google.com/2026/05/19/gemini-app-google-io-2026/ — 2026-05-19 (press).
- [S4] Anthropic conversational voice searches Google Docs/Drive/Calendar — VentureBeat — https://venturebeat.com/ai/anthropic-debuts-conversational-voice-mode-for-claude-mobile-apps — 2026 (press).
- [S5] Anthropic voice mode for Claude app (spoken conversations) — CXO DigitalPulse — https://www.cxodigitalpulse.com/anthropic-launches-voice-mode-for-claude-app-enabling-seamless-spoken-conversations/ — 2026 (press).
- [S5b] WWDC 2026 keynote date (2026-06-08, through 06-12); iOS 27 / Siri-LLM expectations — MacRumors WWDC roundup — https://www.macrumors.com/roundup/wwdc/ — accessed 2026-05-29.
- [S6] Updates to Apple's On-Device and Server Foundation Language Models (~3B params, 65K-token training context, 15 languages, 2/4/8 bpw quantization, "not a general-knowledge chatbot," benchmarks) — Apple Machine Learning Research — https://machinelearning.apple.com/research/apple-foundation-models-2025-updates — updated 2025-07-17.
- [S7] Apple's Foundation Models framework unlocks new intelligent app experiences (3B on-device, offline, free, privacy; iOS/iPadOS/macOS 26; 25+ apps) — Apple Newsroom — https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/ — 2025-09-29.
- [S8] Foundation Models — Apple Developer Documentation (guided generation `@Generable`, tool calling, structured output, streaming; iOS 26) — https://developer.apple.com/documentation/FoundationModels — accessed 2026-05-29 (JS-rendered; corroborated via S6/S7 and practitioner guides).
- [S9] Use Claude with iOS apps / Claude release notes (connectors beta: AllTrails/Instacart/Audible/Uber/Spotify etc.; calendar/reminders/locations; HealthKit on Pro/Max US-only; iOS 18.0+) — Claude Help Center — https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps — accessed 2026-05-29.
- [S10] iOS on-device LLM inference with MLX-Swift + Qwen 3.0 (LLMEval on iPhone 13 Pro 6GB; Qwen3-4B-4bit by HF ID) — Said Marouf, LinkedIn — https://www.linkedin.com/pulse/take-2-ios-on-device-llm-inference-mlx-swift-qwen-30-said-marouf-qp1ce — accessed 2026-05-29 (practitioner).
- [S11] On-device LLM via KMP and llama.cpp (mmap clean vs dirty memory, jetsam, thermal budget, 3B production patterns) — MVP Factory — https://mvpfactory.io/blog/on-device-llm-inference-via-kmp-and-llama-cpp-memory-mapped-model-loading-ane — accessed 2026-05-29 (practitioner).
- [S12] How to run LLMs locally on iPhone in 2026 (offline, Q4_K_M, ~5GB dirty-memory jetsam ceiling, 3–4GB app RAM on 8GB iPhone) — DEV Community (Ali Chherawalla) — https://dev.to/alichherawalla/how-to-run-llms-locally-on-your-iphone-in-2026-completely-offline-no-subscription-4b3a — 2026 (practitioner).
- [S12b] On-Device LLMs: State of the Union 2026 (4-bit default, ExecuTorch 1.0 GA Oct 2025, llama.cpp/GGUF, MLX, memory-bandwidth-bound decode 50–90 GB/s, NPU TOPS A19 Pro ~35) — V. Chandra — https://v-chandra.github.io/on-device-llms/ — 2026 (practitioner/researcher).
- [S13] Perplexity Comet AI browser for iPhone launch (built-in assistant, free + Pro/Max from $20) — MacRumors — https://www.macrumors.com/2026/03/18/perplexity-comet-browser-iphone/ — 2026-03-18 (press).
- [S14] Everything Google announced at I/O 2026 (Gemini, 24/7 Spark agent, Daily Brief, Omni video) — 9to5Google — https://9to5google.com/2026/05/19/google-io-2026-news/ — 2026-05-19 (press).
- [S15] Comet is now available on iOS (voice mode, hybrid search across tabs, Deep Research, task completion, cross-device) — Perplexity blog — https://www.perplexity.ai/hub/blog/meet-comet-for-ios — 2026-03 (first-party).
- [S16] Perplexity Comet for iOS upgraded with 8 improvements (phone-number actions, iPad sidebar, Finance Deep Dive tab, drag images; GPT Realtime 1.5 voice) — 9to5Mac — https://9to5mac.com/2026/05/21/perplexitys-comet-ai-browser-for-ios-upgraded-with-8-major-improvements/ — 2026-05-21 (press).
- [S17] Use ChatGPT with Apple Intelligence on iPhone (Siri handoff, Writing Tools, Visual Intelligence; iOS 18.2 integration); ChatGPT iOS App Store listing (iOS 17.0+) — Apple Support — https://support.apple.com/guide/iphone/use-chatgpt-with-apple-intelligence-iph00fd3c8c2/ios and https://apps.apple.com/us/app/chatgpt/id6448311069 — accessed 2026-05-29.
- [S18] Integrating actions with Siri and Apple Intelligence (App Intents as action layer; Siri/App Intents overhaul targeted iOS 26.4 / spring 2026 per Gurman) — Apple Developer Documentation + AppleMagazine — https://developer.apple.com/documentation/appintents/integrating-actions-with-siri-and-apple-intelligence — accessed 2026-05-29 (docs first-party; timeline press).
- [S19] Increased Memory Limit entitlement (`com.apple.developer.kernel.increased-memory-limit`): dev up to ~15GB but App Store builds crash ~6GB; device-gated, approval-gated — Apple Developer Forums thread 777370 — https://developer.apple.com/forums/thread/777370 — accessed 2026-05-29.
- [S20] Making the most of Apple Foundation Models: Context Window (framework-exposed limit = 4096 tokens per session; combined instructions + prompts + responses; `.exceededContextWindowSize` error) — zats.io (Boris Bügling) — https://zats.io/blog/making-the-most-of-apple-foundation-models-context-window/ — accessed 2026-05-29 (practitioner).
- [S21] Apple Improves Context Window Management for its Foundation Models (4096-token limit unchanged; iOS 26.4 RC 2026-03-23 adds `contextSize` + `tokenCount(for:)`, `@backDeployed`; on-device = relatively small context that fills fast) — InfoQ — https://www.infoq.com/news/2026/03/apple-foundation-models-context/ — 2026-03.
- [internal lock] AGI repo locked platform-facts ("Apple FM already exists w/ 4K context + free inference") — `locks/research-corrected-platform-facts-2026-05-18.md` (project memory) — 2026-05-18. Corroborates S20/S21 from inside the project.

---

### Confidence & caveats
- **App feature bar:** medium-high. Many specifics come from reputable tech press (9to5Mac, 9to5Google, MacRumors, VentureBeat) rather than first-party changelogs; flagged "(press)" and should be re-verified before product/marketing use.
- **On-device technical limits:** high. Apple ML Research + framework docs + multiple independent practitioner sources converge on the same numbers (3B model, 65K *training* context but **~4,096 framework-exposed** session context, ~3–5GB app RAM ceiling, 4-bit default, mmap requirement). The 65K-vs-4K distinction was a real trap — the *usable* number for app design is 4K [S20][S21].
- **Unverified / forward-looking:** WWDC 2026 (2026-06-08) outcomes; any Foundation Models capability bump; vendor benchmark claims (Gemini 3.5 Flash, Apple vs Qwen). Do not treat as settled.
- Apple's `FoundationModels` doc page is JS-rendered and could not be fetched as plain text; its specifics here are corroborated via Apple ML Research [S6] and Newsroom [S7].
