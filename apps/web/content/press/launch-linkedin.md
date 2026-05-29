# AGI Mobile — LinkedIn Launch Post Drafts

**Target date:** 2026-07-12
**Platform:** LinkedIn (personal + company page variants)

---

## Company page post

**Headline:** AGI Mobile is live — free, on-device AI for iOS and Android

---

We are launching AGI Mobile today.

It is an AI assistant with Local, BYOK, and Cloud-invite modes. Local mode works in airplane mode. BYOK lets you use your own provider accounts. Cloud unlocks hosted sync and managed compute by invite.

**What is on-device AI, and why does it matter?**

Modern phones ship with AI inference hardware built in. Apple Foundation Models run on the Neural Engine in iPhone 15 Pro and later. Android has Gemini Nano for flagships and Gemma via LiteRT for virtually every other Android with 4 GB+ RAM. The hardware is already there. We built the front door.

The implication: a free Local + BYOK AI assistant that works when your internet is spotty, in countries with data sovereignty concerns, in regulated industries where cloud AI is not the default, and on the 95%+ of Android devices that do not qualify for Gemini Intelligence.

**v1 feature set:**

- Chat, image Q&A, voice, OCR / document scan
- Translate (60+ language pairs)
- Memory, Projects, Skills catalog
- HealthKit week recap (iOS)
- Hindi support, validated against a 60-prompt suite
- DPDP Act 2023 compliant (India), EU AI Act Art. 50 disclosures built in

**India-first.** We sized the product for Redmi Note 13 and Vivo Y200 class hardware. AI should not be a flagship feature.

**Transparent roadmap.** Cloud models, sync, and team features are invite-gated. The Local and BYOK experiences are the free acquisition paths.

App Store and Google Play: agiworkforce.com/mobile

---

AGI Automation LLC  
agiworkforce.com

---

## Founder / personal post variant

Today we shipped AGI Mobile. Here is what it took and what it is.

**What it is:** a free AI assistant for iOS and Android with Local, BYOK, and Cloud-invite modes. Local mode works offline. BYOK uses the provider account the user chooses.

**Why we built it this way:** I kept reading that on-device AI is only for flagships. Pixel 9, Galaxy S26, iPhone 15 Pro. Devices that most people, especially in India, do not own.

That is not a technical constraint. It is a product decision. Gemma + LiteRT works on a 4 GB Redmi Note 13. Qwen3-4B fits in the same budget. We made the product decision to cover those users first.

**What it took:** 90 days from first Expo commit to simultaneous App Store and Play Store approval. The hardest problem was not AI — it was latency. On-device models can be slow. We spent more time on inference scheduling than on feature development.

**What is next:** cloud features on a waitlist. We will not launch them until the local experience is polished enough that cloud feels like an upgrade, not a repair.

Download: agiworkforce.com/mobile

Feedback welcome, especially from developers integrating on-device models in React Native.

#AGI #OnDeviceAI #MobileDevelopment #ReactNative #India #PrivacyByDesign
