# AGI Mobile — India Launch Press Kit

**Embargo:** 2026-08-16 00:00 IST  
**Contact:** press@agiworkforce.com  
**Developer:** AGI Automation LLC (Delaware, USA)

---

## Headline options (pick one)

1. AGI brings on-device AI to India: works offline, DPDP 2023 compliant, free at inference
2. Free on-device AI for 140 crore users: AGI Mobile launches in India on 2026-08-16
3. AI that respects Indian data law: AGI Mobile ships on iOS and Android with Hindi support

---

## The story in three sentences

AGI Mobile puts a capable AI assistant on your phone that runs entirely on-device — no data leaves the handset. It is free at inference forever, validated for Hindi, and compliant with India's Digital Personal Data Protection Act 2023 from day one. AGI Automation LLC, a Delaware-incorporated company with an India-first go-to-market, launches simultaneously on the App Store and Google Play on 2026-08-16.

---

## Why India, why now

- **DPDP Act 2023 compliance by design.** AGI Mobile processes all inference locally. There is no server call during a conversation. The privacy-by-architecture approach means DPDP obligations around cross-border data transfer simply do not apply to inference data, because inference data never crosses a border.
- **Hindi quality.** The product team ran a 60-prompt Hindi validation suite covering everyday queries, formal correspondence, code explanation, and mixed-script (Hinglish) conversation. Results were reviewed by native speakers before launch sign-off.
- **Tier 2 and Tier 3 reach.** The on-device model (Qwen3-4B) runs on handsets with 4 GB RAM, covering the Redmi Note 13, Vivo Y200, and comparable mid-range devices that represent the majority of India's active smartphone base.
- **Free at inference. Not a trial.** There is no inference paywall, no per-message charge, no forced upgrade. Cloud features (larger hosted models, sync, team features) are waitlist-gated for a future release. The local experience is free and always will be.
- **India-first GTM.** The product is localized, sized for Indian hardware, and the initial community push targets Indian developer forums, regional tech YouTube, and r/india before expanding to global channels.

---

## Feature set (v1 local)

| Feature                        | Status                     |
| ------------------------------ | -------------------------- |
| On-device chat (text)          | Live                       |
| Image + question (visual QA)   | Live                       |
| Voice input                    | Live                       |
| OCR / document scan            | Live                       |
| Translate (60+ language pairs) | Live                       |
| Memory (persistent context)    | Live                       |
| Projects (topic workspaces)    | Live                       |
| Skills catalog                 | Live                       |
| HealthKit week recap (iOS)     | Live                       |
| Hindi language support         | Live — 60-prompt validated |
| Cloud models / sync            | Waitlist — future release  |

---

## On-device AI stack

**iOS:** Apple Foundation Models (Apple's own on-device inference engine, available on iPhone 15 Pro and later) with automatic fallback to Qwen3-4B via executorch/llama.rn for older hardware.

**Android:** Gemini Nano via Android AICore on supported Pixel and Galaxy flagship devices, with Gemma + LiteRT (Google's canonical local inference path) as the primary route, and Qwen3-4B as a universal fallback covering virtually all 4 GB+ Android handsets.

The Qwen3-4B universal fallback is the reason AGI works on Redmi and Vivo mid-range devices where Gemini Nano is not available.

---

## Compliance and privacy

- **DPDP Act 2023:** Inference data never leaves the device. No cross-border transfer, no retention obligation triggered.
- **Telemetry off by default.** Crash reporting (Sentry) strips strings longer than 40 characters before transmission. No session replay on AI screens. PostHog masks all text input.
- **No training on user data.** Conversations are not used to train any model, by AGI Automation LLC or any third party.
- **4K context budgeting.** The app manages context window limits transparently so conversations do not silently truncate.

---

## Boilerplate about AGI Automation LLC

AGI Automation LLC is a Delaware-registered software company building a multi-surface AI agent platform. The platform wraps 10+ AI providers (cloud and local) into a single chat layer across six surfaces: iOS, Android, Desktop (macOS, Windows, Linux), Web, CLI, VS Code extension, and Chrome extension. The company's first product, AGI Mobile, launches globally on 2026-08-16 with India as its primary market.

---

## Assets

- App icon: contact press@agiworkforce.com
- Product screenshots: contact press@agiworkforce.com
- Founder headshots: contact press@agiworkforce.com

---

_This press kit is embargoed until 2026-08-16 00:00 IST. Do not publish before the embargo lifts._
