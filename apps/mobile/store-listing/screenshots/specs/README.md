# Screenshots specification — AGI v1.0.0

> Six screenshots per device class, in the locked order below. The
> first three carry the three differentiators from PRD V5 §1, the
> next three carry the killer-feature parity claims (voice, image,
> cross-device).
>
> **Real device captures are REQUIRED before submission.** Generated
> mockups are not acceptable to App Review per Guideline 2.3.10
> ("Misleading marketing") — every screenshot must be a verifiable
> capture from the actual binary being submitted. This file specs the
> intent; the founder + design must produce the captures.

---

## Apple iOS — required device classes

Per App Store Connect (May 2026), screenshots are required for
**three iPhone classes** and **two iPad classes**. The 5.5" class is
optional but recommended for older-device users.

| Device class       | Apple ref device                            | Portrait resolution | Required?                                                                                                                           |
| ------------------ | ------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **6.7" iPhone**    | iPhone 17 Pro Max / 16 Pro Max / 15 Pro Max | 1290 × 2796         | **Yes** — required by App Store Connect                                                                                             |
| **6.5" iPhone**    | iPhone 14 Plus / 11 Pro Max / XS Max        | 1242 × 2688         | **Yes**                                                                                                                             |
| **5.5" iPhone**    | iPhone 8 Plus                               | 1242 × 2208         | Recommended; required if app still supports iPhone 8 Plus class. AGI's `LSMinimumSystemVersion` is iOS 12.0+, so we keep this slot. |
| **12.9" iPad Pro** | iPad Pro 12.9" (6th gen)                    | 2048 × 2732         | **Yes** (iPadOS is supported)                                                                                                       |
| **11" iPad Pro**   | iPad Pro 11" (4th gen)                      | 1668 × 2388         | **Yes**                                                                                                                             |

**Six screenshots per class × five classes = 30 total iOS captures.**

App Store Connect accepts up to 10 per class; we ship 6 to keep the
narrative tight and to avoid forcing the user to swipe through redundancy.

---

## Google Play — phone + 7-inch tablet + 10-inch tablet

| Device class   | Recommended capture                                   | Required?                              |
| -------------- | ----------------------------------------------------- | -------------------------------------- |
| **Phone**      | 1080 × 1920 minimum, 16:9 or 9:16, JPEG or 24-bit PNG | **Yes**, 2-8 screenshots               |
| **7" tablet**  | 1024 × 600 minimum                                    | Recommended for "Tablet quality" badge |
| **10" tablet** | 1920 × 1200 minimum                                   | Recommended for "Tablet quality" badge |

**Six screenshots for phone, six for 10" tablet, six for 7" tablet = 18 Android captures.**

Plus one required asset:

- **Feature graphic** (1024 × 500 PNG / JPEG, no alpha, ≤ 1MB) — see
  `feature-graphic.md`.

---

## Locked screenshot sequence (same content across iOS and Android, re-rendered per aspect)

The order is anchored to the three differentiators from PRD V5 §1,
then the three killer-feature parity claims.

### Screenshot 1 — "One conversation. Every model." (differentiator #1: multi-provider)

**What's in frame:**

- A chat thread with three messages visible
- Each message has a different model badge in the top-right corner
  (Claude in burst-orange, GPT in green, Gemini in blue)
- Composer at bottom with the model badge tappable
- Status bar shows "AGI" in nav header

**Tagline overlay (top of screenshot, white text on translucent gradient):**

> One conversation. Every model.
> Switch between Claude, GPT, Gemini, and 9 more — mid-thread.

**Capture instructions (`apps/mobile/scripts/screenshots/01-multi-provider.md`):**

1. Launch fresh, complete onboarding via BYOK
2. Add Anthropic + OpenAI + Google keys (test keys provided in
   `.env.screenshots`)
3. Send the prompt "Explain how multi-provider chat is different from one-model chat"
4. After Claude responds, tap model badge → switch to GPT-5.4
5. Send "Now give me your version" — GPT responds
6. Switch to Gemini 3.1, send "Add one more angle" — Gemini responds
7. Capture frame with all three answers visible (scroll if needed)

---

### Screenshot 2 — "Your keys. Your billing." (differentiator #2: BYOK + Local LLM)

**What's in frame:**

- Settings → Provider Keys screen
- List shows three providers with key-status checkmarks (Anthropic,
  OpenAI, Google) and three locked providers (xAI, DeepSeek,
  Perplexity)
- A "Local — Ollama" entry at the top showing "Connected"
- Lock icon next to each entry: "Encrypted in Keychain"

**Tagline overlay:**

> Your keys. Your billing.
> Paste once. We never see them. Pay providers direct.

**Capture instructions:**

1. From the chat screen → tap menu → Settings → Provider Keys
2. Verify the visible-key states match the spec above
3. Capture at full screen

---

### Screenshot 3 — "Continue with Llama. Or Claude. Or both." (differentiator #3: cross-provider continuity)

**What's in frame:**

- A chat thread where the same question gets answered by three
  different providers in sequence
- Tool-call rendering visible: Claude's first turn includes a
  web-search tool call; GPT's next turn re-uses the search results;
  Llama wraps up
- Sidebar pull-out shows "Thread continuity: ON"

**Tagline overlay:**

> Continue with Llama. Or Claude. Or both.
> Tool calls, attachments, and context migrate automatically.

**Capture instructions:**

1. From a chat with web-search tool enabled
2. Prompt: "What did Apple announce at WWDC 2026? Cite sources."
3. Claude executes web search, cites
4. Switch to GPT, prompt: "Now write a 3-bullet summary"
5. Switch to Llama (Local mode), prompt: "Translate the summary to Spanish"
6. Capture frame showing the three turns and the provider badges

---

### Screenshot 4 — "Hold to speak." (voice transcription)

**What's in frame:**

- Composer at bottom, mid-recording state
- Waveform animation
- A faint transcript preview above the composer ("Tell me about the…")
- Time elapsed: "0:04"

**Tagline overlay:**

> Hold to speak.
> Whisper-grade on-device transcription. No audio leaves your phone.

**Capture instructions:**

1. From any chat
2. Press and hold the mic button
3. Speak the partial sentence
4. Capture mid-hold

---

### Screenshot 5 — "Vision in any provider." (image attachment + analysis)

**What's in frame:**

- A chat message with an attached photo (sample image: a hand-drawn
  whiteboard diagram of a system architecture)
- The model's response is an OCR + interpretation in markdown
- Provider badge shows GPT-5.4

**Tagline overlay:**

> Vision in any provider.
> Attach an image. Get an answer from Claude, GPT, or Gemini.

**Capture instructions:**

1. From a chat, attach a sample image (see `assets/samples/`)
2. Prompt: "Explain this diagram"
3. After model responds, capture

---

### Screenshot 6 — "Start here. Finish anywhere." (cross-device handoff)

**What's in frame:**

- Phone screen showing a chat thread
- An animated chip at top: "Sent to Desktop" / "Synced with web"
- Sidebar pull-out lists 4 device peers (this iPhone, MacBook Pro,
  iPad, web)

**Tagline overlay:**

> Start here. Finish anywhere.
> Phone → laptop → tablet → web. One thread, all devices.

**Capture instructions:**

1. From a Cloud-mode chat with sync enabled
2. After a few messages, tap the "Sync" indicator in the nav bar
3. Capture the moment when the indicator confirms sync to other peers

---

## Asset delivery checklist

For each of the 5 iOS classes × 6 screenshots = 30 captures:

| File                            | Format                         | Notes                                      |
| ------------------------------- | ------------------------------ | ------------------------------------------ |
| `ios/6.7/01-multi-provider.png` | PNG, 1290×2796, sRGB, no alpha | Real device capture from production binary |
| `ios/6.7/02-byok-keys.png`      | PNG                            | …                                          |
| … through 06                    | …                              | …                                          |
| `ios/6.5/01-…`                  | PNG, 1242×2688                 | …                                          |
| `ios/5.5/01-…`                  | PNG, 1242×2208                 | Optional but recommended                   |
| `ios/12.9/01-…`                 | PNG, 2048×2732                 | iPad                                       |
| `ios/11/01-…`                   | PNG, 1668×2388                 | iPad                                       |

Plus Android:

| File                     | Format                              | Notes       |
| ------------------------ | ----------------------------------- | ----------- |
| `android/phone/01-…`     | PNG, 1080×2400 (Pixel 8 Pro target) | …           |
| `android/tablet-10/01-…` | PNG, 1920×1200 minimum              | Recommended |
| `android/tablet-7/01-…`  | PNG, 1280×800 minimum               | Recommended |

---

## Tagline overlay — design tokens

| Token              | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| Font family        | Inter, 700 weight                                                                  |
| Heading size       | 56px (iOS 6.7), 50px (iOS 6.5), 44px (iOS 5.5), 64px (iPad)                        |
| Subhead size       | 28px / 24px / 20px / 32px                                                          |
| Heading color      | `#FFFFFF`                                                                          |
| Subhead color      | `#FFFFFFcc` (80% opacity)                                                          |
| Background         | Linear gradient from `#21808d` (teal) at top to transparent at 35% of frame height |
| Padding            | 48px horizontal, 56px top                                                          |
| Text alignment     | Left                                                                               |
| Max heading length | 3 lines                                                                            |
| Max subhead length | 2 lines                                                                            |

These tokens match `packages/design-tokens` and the brand palette
locked 2026-05-15 (teal `#21808d` + terracotta `#da7756`).

---

## App preview video (optional)

One 15-30 second video per device class, ProRes 422 HQ or H.264,
30fps, 1080p+.

Locked content: 20-second screen recording cycling through 3 provider
switches in one chat thread, ending on the model picker UI. No voice
narration. Background music is the AGI bumper from
`assets/audio/bumper-12s.m4a` looped to fit.

Skip for v1 if real captures take longer than 1 day to produce — the
six screenshots are sufficient.
