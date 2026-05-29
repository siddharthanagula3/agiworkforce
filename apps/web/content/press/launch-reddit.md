# AGI Mobile — Reddit Launch Drafts

**Target date:** 2026-07-12
**Per GTM playbook:** Reddit is second channel after HN.  
**Subreddits covered:** r/LocalLLaMA, r/india, r/iphone, r/android

---

---

## r/LocalLLaMA

**Title:**

```
We shipped on-device LLM inference for iOS + Android (Qwen3-4B + Gemma/LiteRT + Apple FM). Here's what we learned.
```

**Body:**

Hi LocalLLaMA. We just launched AGI Mobile — a free Local + BYOK AI assistant for iOS and Android, with Cloud by invite. Thought this community would be interested in the technical choices.

**Model stack**

iOS:

- Apple Foundation Models (on-chip, iPhone 15 Pro+, ~4K context, free inference via the Apple Intelligence APIs)
- Executorch / llama.rn for iPhone 15 (non-Pro) and earlier
- Qwen3-4B as universal fallback

Android:

- Gemini Nano via AICore for supported flagship devices (Pixel 9+, Galaxy S26+, OnePlus 15+, 12 GB+ RAM)
- Gemma + LiteRT as primary for everything else with 4 GB+ RAM — this is Google's own canonical path for non-Nano devices (developer.android.com/ai/google-ai-edge)
- Qwen3-4B universal fallback

**Why Qwen3-4B**

We evaluated several 4B-class models for the fallback slot. Qwen3-4B outperformed Llama 3.2 3B and Phi-3.5-mini on our Hindi eval suite and performed comparably on English instruction following. It is also well-quantized with existing GGUF bins that fit in the budget. If you have benchmarks that suggest a better fallback for Indian languages in the 3-5B range, genuinely interested.

**Latency numbers (preliminary)**

- Qwen3-4B Q4_K_M on Redmi Note 13 (Snapdragon 6s Gen 3, 6 GB RAM): ~11-13 tok/s
- Qwen3-4B Q4_K_M on Pixel 8 (Tensor G3, 8 GB RAM): ~16-18 tok/s
- Apple Foundation Models on iPhone 16 Pro: subjectively fast, Apple does not expose token/s metrics

**Context budgeting**

We implemented a 4K context budget manager that summarizes earlier conversation turns before they get truncated. The summary is injected at the top of the context window. We are not doing RAG for this — it is a rolling LLM-generated summary. Interested whether anyone here has data on summary quality degradation at different turn counts.

**What we did not do (yet)**

- LoRA fine-tuning on-device (blocked on Core ML training API availability; watching for iOS 27)
- Model swapping mid-conversation (next release)
- GGUF streaming downloads (users download the full model on first launch; ~2.1 GB for Qwen3-4B Q4)

App Store + Google Play: agiworkforce.com/mobile. Questions welcome, especially on inference optimization.

---

---

## r/india

**Title:**

```
Launched free AI app for Indian phones today — works offline, DPDP compliant, Hindi support, runs on Redmi Note 13
```

**Body:**

Namaste r/india. We just launched AGI Mobile on iOS and Android. Wanted to share it here because we built it specifically for the Indian market.

**What it is**

A free AI assistant — like ChatGPT or Gemini — but users choose the route: Local on the phone, BYOK with a selected provider, or AGI Cloud by invite. Local mode works offline. BYOK lets users pay providers directly.

**Why we built it for India first**

Most AI apps require a flagship phone. ChatGPT works on any phone but sends data to OpenAI servers in the US. Gemini's on-device features require Pixel 9 or Galaxy S26 — phones most people in India do not own.

We wanted an app that works on the phones people actually have. Redmi Note 13, Vivo Y200, mid-range handsets. The AI runs inside the phone itself. Tested on Redmi Note 13 (Snapdragon 6s Gen 3, 6 GB) and it works well.

**Hindi**

Hindi support is included. We ran a 60-prompt validation suite in Hindi before launch — covering everyday conversation, formal writing, mixed Hindi-English (Hinglish), and code explanation. Reviewed by native speakers.

**DPDP Act 2023**

India's new data protection law requires careful handling of personal data. Because the AI runs on your phone, your conversations are never transferred to any server during inference. This means the cross-border data transfer requirements of the DPDP Act simply do not apply to your conversations.

**Free**

No subscription to use the AI. Cloud features (bigger models, sync across devices) are on a waitlist for a later release. The local AI is free and will remain free.

Download: agiworkforce.com/mobile (iOS + Android links on page)

Happy to answer questions in the thread.

---

---

## r/iphone

**Title:**

```
Built an AI app that uses Apple Foundation Models on iPhone 15 Pro+ — free, works offline, no subscription
```

**Body:**

Hey r/iphone. Launching AGI Mobile today — thought iPhone users here would like to know about the Apple Foundation Models integration.

**What it is**

A free AI assistant that runs on your iPhone without sending your conversations to the internet. Works offline.

**How it uses your iPhone's AI**

On iPhone 15 Pro and later, AGI uses Apple Foundation Models — the same on-chip AI that Apple built for Apple Intelligence. It has about 4K usable context, runs on the Neural Engine, and is fast.

On iPhone 15 (non-Pro) and earlier iPhones down to iPhone 12, the app uses Qwen3-4B via executorch/llama.rn, which also runs on-device.

**Features**

- Chat (text)
- Image + question (take a photo, ask about it)
- Voice input
- OCR / document scan
- Translate (60+ language pairs)
- Memory (the app remembers things you've told it)
- Projects (topic-based workspaces)
- HealthKit week recap (asks Apple Health for your weekly activity and gives you a plain-English summary)
- Skills catalog

**Privacy**

Local-mode conversations stay on your iPhone where supported and are not silently routed to BYOK or Cloud. Crash reporting (Sentry) strips all strings over 40 characters before sending. Telemetry is off by default.

**Cloud**

Cloud models (Claude, GPT-5, Gemini cloud), sync, and hosted tools are available by invite. Local and BYOK are the free launch paths.

App Store link: agiworkforce.com/mobile

---

---

## r/android

**Title:**

```
AGI Mobile: free on-device AI for Android — works on mid-range phones, not just Pixel 9 and Galaxy S26
```

**Body:**

Hey r/android. We launched AGI Mobile today — an AI assistant that runs on your Android phone without an internet connection.

**The Gemini Intelligence gap**

Google's on-device AI (Gemini Nano via AICore) requires a Pixel 9 or Galaxy S26 (or newer) with 12 GB RAM. That means if you have a Pixel 8, Galaxy S24, any Xiaomi, any Motorola, any OnePlus before the 15, or any mid-range Android — you are locked out of on-device Gemini.

We covered those users.

**How AGI Mobile works on your Android**

The app detects what your device supports:

1. If you have Gemini Nano (Pixel 9+, Galaxy S26+, OnePlus 15+): uses it.
2. If not: uses Gemma + LiteRT — Google's own canonical path for non-Nano Android devices (from the Android AI Core developer docs). Covers most Androids with 4 GB+ RAM.
3. Universal fallback: Qwen3-4B — a capable 4B model we've quantized for mobile. Runs on Redmi Note 13 (Snapdragon 6s Gen 3, 6 GB RAM) at about 12 tokens/second.

**Features**

- Chat, image Q&A, voice, OCR/scan, translate
- Memory, Projects, Skills
- Works offline, no subscription
- Privacy: Local mode is not silently routed to BYOK or Cloud

**Cloud**

Cloud models, sync, and hosted tools are available by invite. Local and BYOK are the free launch paths.

Google Play link: agiworkforce.com/mobile

Happy to talk Android performance or inference stacks in the comments.
