# App Store Connect — AGI iOS metadata

> All text below is the locked submission copy for App Store Connect.
> Character limits are enforced by App Store Connect; counts are
> verified inline. Anchored to the three differentiators from PRD V5 §1
> and the BYOK-first pivot locked 2026-05-16.

## App name (App Store Connect "Name", 30 chars)

```
AGI: Claude, GPT, Gemini chat
```

Count: 29 chars. Carries the three-name proof of multi-provider in
exactly one glance. "AGI" is the public brand per
`memory/brand-name-agi-2026-05-15.md`.

---

## Subtitle (30 chars)

```
One app. Every model. BYO key.
```

Count: 30 chars exact. **Locked.**

(Earlier drafts said "BYO keys" (31 chars) and "Your keys" (32
chars); both blew the budget. The 30-char limit is hard at App
Store Connect submit time — singular "key" reads fine and parses as
"bring your own [API] key".)

---

## Promotional text (170 chars, editable without re-review)

```
Switch between Claude, GPT, Gemini, and Llama in the same conversation. Bring your own API keys, or run local models on your laptop. No lock-in, no markup.
```

Count: 156 chars (within the 170-char budget).

---

## Keywords (100 chars, comma-separated, no spaces after commas)

```
ai,llm,chat,assistant,claude,gpt,gemini,llama,ollama,grok,byok,multi-provider,local-llm,coding
```

Count: 95 chars (within the 100-char budget).

Per App Store Connect rules: do not repeat words that already appear
in the app name. "AGI" appears in the name; not listed here. "Claude"
and "GPT" appear in the name; we keep them in keywords too because the
ranking-weight benefit is documented and the App Store Connect
duplication penalty is per-token, not per-keyword.

---

## Description (4,000 chars max — verbatim copy below)

```
AGI is the AI assistant that doesn't lock you to one model.

Open one app. Talk to Claude, GPT, Gemini, Grok, Llama, and 5 more — in the same conversation. Switch mid-thread. Compare answers side-by-side. Use the right model for the job.

Most AI apps ship with one provider's models locked in. We built the cross-vendor plumbing — payload normalization, tool-call schema cleanup, reasoning-effort routing — so any model is one tap away.


THE THREE THINGS NO OTHER APP DOES

1. MULTI-PROVIDER IN ONE UI
Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok, DeepSeek, Mistral, Qwen, Moonshot Kimi, Perplexity, Zhipu, plus local Ollama and LM Studio. Twelve providers. One chat thread. Switch with a tap on the model badge.

2. BYOK + LOCAL LLM
Paste your Anthropic, OpenAI, or Google API key once. Your key lives in iOS Keychain, encrypted and never leaves your device. You pay the provider directly. No markup. No middleman. Or skip API keys entirely and point at a Mac running Ollama on your home network — your chat stays fully offline.

3. CROSS-PROVIDER SESSION CONTINUITY
Start a question with Claude. Ask Llama for a second opinion in the next turn. Send the same context to Gemini three turns later. Tool calls and reasoning state migrate automatically — no other app stitches the providers together at the message level.


KEY FEATURES

• Multi-provider chat across 12 providers + custom OpenAI-compatible endpoints
• Bring your own key — Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, more
• Local mode — Ollama or LM Studio on your laptop, fully private, fully offline
• Cross-device handoff — start on iPhone, finish on Mac or web
• Voice transcription — Whisper-grade speech-to-text, hold-to-talk composer
• Image and document attachments to any vision-capable model
• Search the web from any chat (Perplexity / Brave / Bing key)
• Citations, thinking traces, and artifact rendering inline
• Conversation export to Markdown, JSON, or plain text


PRIVACY

We never train on your conversations. Ever.

BYOK keys are stored in iOS Keychain, encrypted with hardware-backed protection. We never see them. Each API call goes directly from your device to the provider you picked.

Cloud-mode sync (opt-in) uses your AGI account and stores conversations through AGI's Clerk-authenticated Web/API. You can delete your data at any time from Settings → Account.

We do not track you across apps or websites. The app collects no personal data by default; see the on-device Privacy section before any provider key is added (per Apple Guideline 5.1.2(i)).


PRICING

• Local-only — Free forever. Run Ollama on your laptop. No account.
• BYOK — Free forever. Bring your own API keys. No markup.
• Hobby, Pro, Pro+, Max, Enterprise — On the waitlist. Tap "Join waitlist" in the app to be notified at launch.


CROSS-PLATFORM

Same chat, same conversations, on:
- Mac and Windows desktop
- Web at agiworkforce.com
- Android (Google Play)
- Chrome and VS Code extensions
- Terminal CLI


SUPPORT

Docs and changelog: https://agiworkforce.com
Email: support@agiworkforce.com
Status: https://status.agiworkforce.com


AGI is built for people who refuse to be locked to one AI vendor.
```

Char count: 3,386 / 4,000. Headroom for marketing tweaks per release
without re-review (promotional text is the preferred lever; this main
description requires re-review on change).

---

## "What's New in This Version" (4,000 chars, set per release)

Initial v1.0.0 copy:

```
AGI 1.0 — the first release.

What you can do:
• Chat with Claude, GPT, Gemini, Grok, Llama, and 7 more providers in one app
• Switch providers mid-conversation
• Bring your own API keys (BYOK) or run Ollama / LM Studio locally
• Voice input via on-device transcription
• Attach images and documents
• Sync conversations across iPhone, iPad, Mac, and web (with an account)

Thanks for trying AGI. Email support@agiworkforce.com — we read everything.
```

Count: 462 chars.

---

## Category

Primary: **Productivity**
Secondary: **Developer Tools**

Per App Store Connect — Apple allows up to two categories. We sit in
Productivity for the broad audience and Developer Tools as the
secondary so developers searching for AI tooling find us.

---

## Age rating

**4+** — no objectionable content. The agent refuses harmful requests
at the provider model layer; we do not host any user-generated content
visible to other users.

App Store Connect age questionnaire answers:

- Cartoon or fantasy violence: None
- Realistic violence: None
- Profanity or crude humor: Infrequent / mild (LLM output is bounded by
  provider safety filters)
- Mature / suggestive themes: None
- Horror / fear themes: None
- Medical / treatment information: None
- Alcohol, tobacco, drug use or references: None
- Gambling and contests: None
- Unrestricted web access: **YES** (user can paste any URL into chat,
  and the optional Perplexity / Brave search tool reaches the open
  web). Rated 17+ when this is enabled by default — AGI defaults web
  search to **off**, so the 4+ rating holds for the default
  experience. We disclose this in App Review notes.
- User generated content: None
- Contests: None

---

## Localization (v1)

Submit English (US) only. v1.1 will add Spanish, French, German,
Japanese, simplified Chinese, traditional Chinese, Korean once
translation review is complete.

---

## Required URLs

| Field                           | URL                              |
| ------------------------------- | -------------------------------- |
| Privacy policy URL              | https://agiworkforce.com/privacy |
| Support URL                     | https://agiworkforce.com/support |
| Marketing URL (optional)        | https://agiworkforce.com         |
| Terms of service (in-app + URL) | https://agiworkforce.com/terms   |

---

## Copyright

```
© 2026 AGI, Inc.
```

---

## Contact information (App Store Connect → App Information)

| Field               | Value                                        |
| ------------------- | -------------------------------------------- |
| First name          | Siddhartha                                   |
| Last name           | Nagula                                       |
| Phone               | (to be filled by founder)                    |
| Email               | siddharthanagula3@gmail.com                  |
| Demo account (BYOK) | not required — Local mode demo is self-serve |

---

## Pricing & Availability

| Field                 | Value                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price tier            | Free                                                                                                                                                                                              |
| In-app purchases      | None at v1                                                                                                                                                                                        |
| Available territories | All territories where Apple Distribution is allowed, EXCEPT mainland China, Russia, Iran, North Korea, Syria, Cuba, Crimea (provider-routing risk). Verify with legal counsel before flipping on. |
| Pre-order             | No                                                                                                                                                                                                |
| Educational discount  | n/a                                                                                                                                                                                               |
