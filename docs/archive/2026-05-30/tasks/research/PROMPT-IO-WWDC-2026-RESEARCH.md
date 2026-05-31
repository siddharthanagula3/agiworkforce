# Research Prompt: Google I/O 2026 + WWDC 2026 — Mobile AI Landscape

**Authored:** 2026-05-18 · **Owner:** Founder, AGI Automation LLC · **Due:** before WWDC keynote (2026-06-08) so v1 launch plan can react

---

## Why this research

I'm shipping AGI mobile v1 on **2026-08-16** — local-only, on-device LLM (Apple Foundation Models / executorch / llama.rn three-tier router), India-first GTM, cloud as waitlist gate. Two platform-level events between now and launch reshape the competitive ground:

- **Google I/O 2026** — keynote already happened (May 12-15 window); we have early reads but not the full developer-session digest.
- **WWDC 2026** — June 8-12, three weeks pre-launch. Whatever Apple announces for Foundation Models / Apple Intelligence / iOS 19 directly affects our Tier 1 routing.

What I already know (don't re-derive):

- Gemini Intelligence requires Android 17 + 12 GB RAM + Nano v3 chip + 2026 flagship (Pixel 10, Galaxy S26, OnePlus 15/15R, Honor Magic 8 Pro, iQOO 15, Oppo Find X9, Vivo X300). Excludes Pixel 9, Pixel 10a, Z Fold 7, OnePlus 13. Excludes under-18, Workspace/School, EU/UK/Switzerland, Nigeria.
- Apple Intelligence is iPhone 15 Pro+ today; my Tier 1 routes to Apple FM there.
- Claude mobile shipped voice mode free for all tiers early 2026, HealthKit integration Jan 2026, Remote Control Feb 2026, offline voice packs Q1 2026.
- ChatGPT shipped Codex on mobile May 14, 2026.
- Perplexity Comet browser launched globally Mar 18, 2026 and went free with ad-targeting.

---

## Deliverable

A single markdown report `tasks/research/IO-WWDC-2026-REPORT.md`, **3,000–5,000 words**, structured in three sections + verification checklist. Primary-source-cited throughout.

### Section 1 — Google I/O 2026: what shipped (factual)

For each item below, produce: **claim** (1 sentence) · **primary source URL** · **AGI v1 implication** (1 sentence).

1. **Gemini family** — every new/updated model: parameter counts where disclosed, context window changes, multimodal capability changes, API pricing changes
2. **Gemini Nano v3 / AICore SDK** — exact device matrix beyond what's already public; on-device-vs-cloud split per capability; rate limits; whether non-Gemini-Intelligence-eligible devices can still call AICore for _any_ local model use
3. **Android 17 AI surfaces** — App Functions / App Intents / system-level AI hooks that third-party apps can register against; whether AGI could register as a Siri-equivalent target
4. **Android 17 privacy + permission changes** — new on-device data classes, anything affecting our HealthKit-equivalent / Photos / Files / Calendar / Contacts tool wiring
5. **ML Kit / LiteRT / TensorFlow Lite / MediaPipe updates** — what's available for non-Pixel mid-range devices to do on-device AI; how this compares to react-native-executorch + llama.rn
6. **Google Play Store policies for AI apps** — new restrictions; required disclosures; age-gating rules specifically applicable to apps like AGI (local LLM + cloud waitlist); risk of Play Store rejection
7. **Pixel hardware** announced — Pixel 10a successor? Pixel Watch 4? Pixel Tablet 2? folding Pixel 11 leaks?
8. **Genkit / AI Studio / Vertex AI mobile tooling** — anything competing with our `@agiworkforce/llm-normalize` + three-tier-router
9. **Gemini Intelligence regional rollout schedule** — confirmed launch dates per market; specific India / EU / UK / Nigeria / Brazil / Indonesia status; whether under-18/Workspace rules will change
10. **Project Astra / Astra-on-device** — anything mobile-relevant
11. **Memory + cross-device personalization** — scope, data residency, opt-out mechanics
12. **Regulatory / antitrust signals** — anything in EU DMA compliance, DPDP-India compliance, Brazil ANPD, that opens or closes doors for AGI
13. **What Google said about third-party local-LLM apps on Android** — any explicit position (positive, hostile, neutral)
14. **Gemini Web vs App parity** — what features mobile users get vs lose vs desktop

### Section 2 — WWDC 2026: predictions (signal-based)

Time horizon: signals through 2026-05-31. Each prediction needs: **the prediction** (1 sentence) · **signal/leak source URL** (or "no signal — based on Apple's typical pattern") · **confidence** (low / medium / high) · **AGI v1 implication if true** (1 sentence).

1. **Apple Intelligence device expansion** — will Apple extend to iPhone 14 Pro / iPhone 16 / iPhone 16 Plus / iPhone SE 4 / iPad Air M2 / MacBook M1? Per-device prediction
2. **Apple Foundation Models API changes** — context window (current ~4K → expansion?); larger on-device models (current ~3B → ~7B?); new modalities on-device (vision, voice); pricing/quota for developer use
3. **iOS 19 / iPadOS 19 AI surfaces** — App Intents for AI; "Ask any AI app via Siri" routing; new system-level entry points
4. **Vision framework updates** — anything affecting our OCR/Scan tool (better text-region detection, handwriting, charts, tables)
5. **Translate framework updates** — Hindi quality improvement; new language pairs; on-device-vs-cloud split changes; offline pack sizes
6. **Speech framework updates** — longer dictation, better local recognition, language coverage, multi-speaker
7. **Core ML / ML Compute updates** — new Core ML model formats; Neural Engine performance jumps; affecting our Tier 1 + custom-model paths
8. **HealthKit changes** — new data classes (mental health? glucose? hearing?); new aggregation APIs; new permission models affecting our `query_health` tool
9. **Siri + Apple Intelligence assistant overhaul** — how much of "general AI chat" does Apple internalize? Is "Hey Siri, ask AGI…" possible via App Intents in v1.0?
10. **App Store policies for AI apps** — new disclosure requirements; new pricing rules; EU external-link entitlement changes; on-device-vs-cloud labeling; minimum-age restrictions
11. **StoreKit / IAP / subscription changes** — affecting our future Cloud waitlist→paid economics; Small Business Program threshold changes; family-sharing for AI subscriptions
12. **Privacy nutrition label changes** — new categories for on-device AI vs cloud AI
13. **Hardware leaks for iPhone 17 Pro lineup** (fall 2026) — RAM tier, Neural Engine generation, anything that affects three-tier routing logic
14. **Visualintelligence / Apple search** — does Apple ship a Perplexity-equivalent on-device search experience?
15. **WatchOS / Apple Watch AI** — any companion-mode surface AGI should target
16. **Foundation Models pricing tier** — expansion of free quota for indie developers; rev-share changes

### Section 3 — Implications for AGI v1 (decision matrix)

For each scenario, three rows: **best case for AGI** (1 sentence + how to capitalize) · **worst case for AGI** (1 sentence + how to mitigate) · **what would change in v1** (specific file/screen/feature reference where possible).

1. Apple expands Foundation Models to iPhone 14 Pro / iPad Air M2 / MacBook M1 → does our Tier 1 routing logic stay valid? Do we ship Mac/iPad targets in v1?
2. Apple ships a Hindi-quality Translate update → does our local Translate feature value prop weaken? Should we lean harder on Multi-model Compare?
3. Google announces a Q3 2026 Gemini Intelligence expansion to mid-range Android → does our "Gemini-excluded" India pitch erode? What's plan B positioning?
4. Apple adds an "on-device AI" vs "cloud AI" privacy nutrition label → what new disclosure must AGI make on App Store listing?
5. iOS 19 ships App Intents for "ask any AI app via Siri" → should AGI ship AppIntents support in v1.0?
6. Google Play tightens AI-app age-gating to 18+ → does our v1 (no account, all-ages, local-only) survive Play Store review? What disclosures pre-empt rejection?
7. Apple ships Foundation Models with >32K context → should we drop Llama 3.2 3B as Tier 2 default on Apple-FM-capable devices? Tier router logic change.
8. Anthropic ships fully-local Claude 4.6 Haiku on-device → does our "no frontier locally" honesty framing change? How does Compare screen react?
9. Google ships a free, no-cloud-required Gemini Nano app sideloadable on excluded devices → does our India launch advantage compress? Counter-positioning?
10. Apple ships per-app IAP rate change (e.g., 7% small-business for sub-$1M-revenue apps) → does Cloud waitlist→paid economics improve enough to accelerate Cloud open date?
11. Google announces Android-equivalent of Apple Foundation Models on Pixel 10a / mid-range → are we obsoleted on Tier 2 Android? How does executorch survive?
12. Either platform ships "AI app uninstall sweep" that flags third-party local-LLM apps as redundant → reputational + discoverability risk; mitigation?

---

## Source requirements

- **Section 1:** every factual claim must cite a primary source URL — Google blog, developer docs, official I/O keynote video timestamp, I/O session recording timestamp, or a Tier-1 publisher (9to5Google, Android Authority, Ars Technica, The Verge) within 48h of the announcement
- **Section 2:** every prediction must cite either (a) a primary leak source (Bloomberg/Gurman, MacRumors, The Information) or (b) be explicitly marked "no signal — pattern-based"
- **Section 3:** no citations needed — these are reasoned implications

Non-English sources OK and encouraged where they have better access (Chinese tech press for Honor/iQOO/Vivo, Korean tech press for Samsung/LG, Indian tech press for India-specific rollout timing).

---

## Anti-deliverables

Do NOT produce:

- A general "state of AI" overview
- Praise / criticism / editorializing on Google or Apple strategy
- Marketing copy or pitch suggestions
- Recommendations not tied to a specific AGI v1 file / screen / launch decision
- Predictions for events post-2026-12-31

---

## Verification checklist

Run before submitting:

- [ ] All Section 1 claims have primary-source URLs (no aggregator-of-aggregator)
- [ ] All Section 2 predictions have either a leak source or an explicit "pattern-based" tag
- [ ] All Section 3 scenarios cite at least one specific AGI v1 artifact (a file path, a screen name from `docs/design/mobile-screen-design-prompt-2026-05-18.md`, a memory lock, or a roadmap milestone)
- [ ] Gemini Intelligence vs Gemini Nano vs Gemini App vs Gemini API are not conflated
- [ ] Apple Intelligence vs Apple Foundation Models vs Core ML vs Vision/Translate/Speech frameworks are not conflated
- [ ] EU / India / Nigeria / Brazil / Indonesia regulatory specifics are each addressed at least once
- [ ] Total word count 3,000–5,000
- [ ] Report dates references (e.g. "Q3 2026") use absolute calendar terms, not relative ("soon", "later")

---

## Output destination

`tasks/research/IO-WWDC-2026-REPORT.md` in the repo. Also produce a 200-word executive summary at the top labeled `## TL;DR for the founder` — what changed since the May 18 baseline, which 3 decisions need to be made before WWDC keynote (Jun 8).
