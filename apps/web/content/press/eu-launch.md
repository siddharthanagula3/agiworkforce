# AGI Mobile — EU Launch Press Kit

**Embargo:** 2026-07-12 00:00 CET
**Contact:** press@agiworkforce.com  
**Developer:** AGI Automation LLC (Delaware, USA)  
**EU Representative:** [to be appointed per Art. 27 GDPR before launch]

---

## Headline options (pick one)

1. The on-device AI that works on the Android phone you already own — not just Pixel 9 and Galaxy S26
2. 96% of EU Android users locked out of Gemini on-device: AGI Mobile fills the gap on launch day
3. EU AI Act disclosure-ready, privacy-by-architecture, free: AGI Mobile launches on iOS and Android 2026-07-12

---

## The Gemini Nano gap — the single most important fact for EU Android coverage

Google's on-device AI (Gemini Nano, accessed via Android AICore) requires:

- Pixel 9 series (2024), Pixel 9a, or later
- Samsung Galaxy S26 series, Galaxy S26 Edge, or later (market launch: Jan 2026)
- OnePlus 15 or later (market launch: Jan 2026)
- 12 GB RAM minimum
- Android 14+

The result: fewer than 5% of EU Android handsets in active use as of mid-2026 meet all four requirements. A user with a Samsung Galaxy S23, a OnePlus 13, a Pixel 7, any Xiaomi, any Motorola, any Nokia, or virtually any device from 2024 or earlier cannot run Gemini Nano on-device.

AGI Mobile covers all of them. The path: Gemma + LiteRT (Google's own canonical local inference stack, recommended by Google for non-Nano Android devices) as primary, Qwen3-4B as a universal fallback for devices with 4 GB+ RAM. Local mode is on-device where supported and is not silently routed to BYOK or Cloud.

For iOS, Apple Foundation Models work on iPhone 15 Pro and later. AGI falls through to Qwen3-4B via executorch/llama.rn on iPhone 15 (non-Pro), 14 series, and earlier supported hardware.

---

## EU AI Act compliance

AGI Mobile v1 is a general-purpose AI system serving consumers. Applicable obligations under Regulation (EU) 2024/1689:

| Obligation                                           | AGI Mobile status                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Art. 50(1) — Disclosure that content is AI-generated | Built in: conversation interface includes persistent disclosure chip                                                    |
| Art. 50(2) — Marking of synthetic content on export  | Conversation exports include a machine-readable `x-agi-ai-generated: true` header and a human-readable disclosure block |
| Prohibited practices (Art. 5)                        | Not applicable: no biometric categorisation, no social scoring, no subliminal manipulation                              |
| High-risk classification (Annex III)                 | Not applicable to general-purpose chat assistant use case                                                               |
| GPAI model obligations (Art. 51-56)                  | AGI wraps third-party foundation models; obligations apply to model providers, not to AGI as a system integrator        |

---

## GDPR posture

- **Mode-specific processing.** Local-mode inference is on-device where supported. BYOK and Cloud use explicit provider labels and the user-selected trust boundary.
- **Crash telemetry is minimal.** Sentry strips all strings longer than 40 characters before transmission. No conversation content reaches Sentry servers.
- **No behavioural advertising.** User data is not sold, licensed, or shared with advertising platforms.
- **Analytics.** PostHog masks all text input. No session replay on AI screens. Telemetry is off by default; users opt in.
- **EU representative.** AGI Automation LLC will appoint an EU representative per Art. 27 GDPR before the 2026-07-12 launch. Name and contact to be published at agiworkforce.com/legal/eu-representative.

---

## The practical privacy advantage for EU users

Most AI assistants require users to accept one cloud path for every task. AGI Mobile separates Local, BYOK, and Cloud-invite modes so users can choose the route that fits the work. Local-mode chats are not silently moved into BYOK or Cloud.

---

## Feature set (v1 local)

| Feature                                                                | Status                    |
| ---------------------------------------------------------------------- | ------------------------- |
| On-device chat (text)                                                  | Live                      |
| Image + question (visual QA)                                           | Live                      |
| Voice input                                                            | Live                      |
| OCR / document scan                                                    | Live                      |
| Translate (60+ language pairs, including all 24 EU official languages) | Live                      |
| Memory (persistent context)                                            | Live                      |
| Projects (topic workspaces)                                            | Live                      |
| Skills catalog                                                         | Live                      |
| HealthKit week recap (iOS)                                             | Live                      |
| Cloud models / sync                                                    | Waitlist — future release |

---

## On-device AI stack (EU Android detail)

1. **Gemini Nano via AICore** — for the ~5% of EU Android users on supported 2025-2026 flagships
2. **Gemma + LiteRT** — Google's own canonical path for non-Nano Android devices; covers virtually all Android handsets with 4 GB+ RAM
3. **Qwen3-4B** — universal fallback; also the primary model on devices where Gemma is not yet available via LiteRT

The Gemma + LiteRT path is maintained by Google (see developer.android.com/ai/google-ai-edge), not a workaround. AGI integrates it as the intended non-Nano inference path for Android.

---

## Boilerplate about AGI Automation LLC

AGI Automation LLC is a Delaware-registered software company building a multi-surface AI agent platform. The platform wraps 10+ AI providers (cloud and local) into a single chat layer across six surfaces: iOS, Android, Desktop (macOS, Windows, Linux), Web, CLI, VS Code extension, and Chrome extension. AGI Mobile launches globally on 2026-07-12.

---

## Assets and contacts

- Press contact: press@agiworkforce.com
- App icon, product screenshots, founder headshots: contact press team
- EU legal queries: legal@agiworkforce.com

---

_This press kit is embargoed until 2026-07-12 00:00 CET. Do not publish before the embargo lifts._
