# AGI Mobile — Hacker News Show HN Draft

**Target date:** 2026-07-12
**Per GTM playbook:** HN is the first channel, before Reddit, Discord, and YouTube.  
**Format:** Show HN (submit to https://news.ycombinator.com/submit)

---

## Title (max ~80 chars for HN display)

```
Show HN: AGI Mobile – on-device AI for iOS and Android (free, works offline)
```

**Characters:** 76

---

## URL to submit

```
https://agiworkforce.com/mobile
```

---

## Comment body (paste as first comment immediately after submission)

---

Hi HN. I am the founder of AGI Automation LLC and today we are launching AGI Mobile — a free Local AI assistant for iOS and Android, with Cloud by invite.

**What it does**

It is a chat assistant (text, image Q&A, voice, OCR, translate, memory, projects) with two explicit mobile routes: Local mode and Cloud by invite. Local mode works in airplane mode and is not silently routed to Cloud.

**On-device AI stack**

- iOS: Apple Foundation Models on iPhone 15 Pro and later. Executorch / llama.rn on older devices. Universal fallback: Qwen3-4B.
- Android: Gemini Nano via AICore on supported flagships (Pixel 9+, Galaxy S26+). Gemma + LiteRT (Google's canonical path for non-Nano Android) on everything else with 4 GB+ RAM. Universal fallback: Qwen3-4B.

The Qwen3-4B fallback is what makes this work on mid-range Android — Redmi Note 13, Vivo Y200, and similar. Those devices can not run Gemini Nano. Gemma + LiteRT covers most of them. Qwen3-4B covers the rest.

**Why we built it this way**

Every AI assistant I used forced one default cloud path. I wanted mobile users to start with local hardware when privacy or cost matters, and use AGI Cloud only when they ask for managed compute.

**Tech stack**

- Expo 53 + React Native 0.83.6
- expo-sqlite (conversation persistence)
- MMKV + expo-secure-store (keys and preferences)
- llama.rn (executorch-backed on-device inference)
- react-native-google-ai-edge (Gemma + LiteRT)
- Sentry (crash reporting, strings stripped >40 chars, no session replay)

**What is not in v1**

Cloud models, cross-device sync, and team features are invite-gated. Local is the free launch wedge.

**What I would like feedback on**

1. The inference latency on Android mid-range. We average around 12 tokens/second on Qwen3-4B on Redmi Note 13. Is that good enough? What is your threshold?
2. The memory design. We persist a rolling summary of past conversations and inject it into context. Interested whether HN readers think that is the right abstraction or whether they want something more explicit.
3. On-device models on iOS. We are using llama.rn (executorch backend) for non-Pro iPhones. If you have built with Apple Foundation Models and have opinions on when to prefer AFM vs llama.rn on Pro devices, I would like to hear them.

App Store and Google Play: agiworkforce.com/mobile

Happy to answer technical questions.

---

## Backup title (if primary is rejected)

```
Show HN: Free on-device AI for Android mid-range phones (Gemma+LiteRT+Qwen3)
```

---

## Notes on HN submission timing

- Submit on a weekday, ideally Tuesday through Thursday
- 9:00 AM or 2:00 PM Eastern US are historically higher-traffic windows for Show HN
- Do not submit multiple URLs at the same time
- The first comment (above) should be posted within 2 minutes of submission to establish context before voting begins
