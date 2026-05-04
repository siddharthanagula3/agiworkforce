# Wave 3 Show HN draft — multi-provider chat + Hobby tier

> Submit at: <https://news.ycombinator.com/submit>
> Use after Wave 3 ships (Mobile + Chrome ext + VS Code ext + Hobby tier all live).
> Best Tuesday–Thursday morning Eastern.

---

## Title

```
Show HN: AGI Workforce – switch GPT, Claude, Gemini mid-conversation. $5/mo.
```

(78 chars)

## URL

```
https://agiworkforce.com/chat
```

## First comment (the pitch)

```
Hi HN — I built AGI Workforce because I was tired of paying ChatGPT Plus
*and* Claude Pro *and* Gemini Advanced every month, with no way to use
them in the same conversation.

The pitch: one chat app, 10+ providers (Anthropic, OpenAI, Google, xAI,
DeepSeek, Mistral, Qwen, Moonshot, Ollama, more). Switch mid-conversation.
Same thread.

Three ways to use it:

  1. BYOK — paste your own API keys, free forever. Keys stored in your
     browser / keychain, never on our servers. You pay providers directly,
     no markup.

  2. Local-only — run Ollama or LM Studio on your laptop, point AGI
     Workforce at it. Free forever, fully offline, no account needed.

  3. Hobby — $5/mo for managed cloud routing if you don't want to mess
     with API keys. Limited credits, basic models (Haiku, GPT-4o-mini,
     Gemini Flash). The cheapest paid tier in this space, on purpose.

Surfaces:

  - Web chat at agiworkforce.com/chat
  - macOS/Windows/Linux desktop app (Tauri)
  - iOS + Android (just hit the App Store / Play Store)
  - Chrome extension (browser side panel + LinkedIn autofill)
  - VS Code extension (@agi chat participant + inline completions)
  - Rust CLI shipped in v1.0 last week

What makes the multi-provider story actually work — the hard part —
is that every model has different payload quirks: Azure drops
service_tier, Cerebras rejects store, DeepSeek's reasoning format is
weird, Vertex Anthropic gates 1-hour cache TTL by hostname, Gemini's
schema validator strips half of JSON Schema. So the conversation
doesn't just "switch" — the request shape gets normalized per vendor
on the way out, and the streaming response gets translated back to a
canonical shape on the way in. ~10K LOC of TypeScript dedicated to
this. Open source plumbing? No, but the philosophy is the same as
LiteLLM, just with a real product on top.

How it's different from the alternatives:

  - vs Cursor / Copilot — those are coding-focused; we're general-
    purpose chat with a coding mode
  - vs Poe — Poe is a marketplace; we're the product, BYOK gives you
    cost control they don't
  - vs t3.chat — t3 is great, similar BYOK story, mostly the same
    pitch. We've got broader provider coverage (we wired Vertex
    Anthropic + Bedrock paths) and a desktop-app-first surface.
  - vs raw Anthropic / OpenAI / Google chat — we're the only one that
    lets you use all three in the same conversation

The Hobby tier is launching today. Feedback welcome — especially
"actually I just want X" feature requests. Pro and Max tiers are
waitlist while we finish a security audit.

Tech stack for the curious: Tauri v2 + React (desktop), Next.js 14
(web at agiworkforce.com), Expo (mobile), Rust monolith (CLI engine,
~155K LOC), Express on Fly.io (api gateway), Supabase (auth + sync).
TypeScript packages for the LLM provider adapters live in a public
section of the repo.

Source / docs / install: https://agiworkforce.com
```

---

## Counter-arguments to expect (and good responses)

**"Just use OpenRouter"**

> OpenRouter is excellent for routing — that's why we ship it as a
> provider option. But OpenRouter is a routing API, not a chat app.
> AGI Workforce is the surface (web + desktop + mobile + ext + CLI)
> with multi-provider support natively, with a $5/mo "I don't want
> to think about routing" tier on top. They're complementary, not
> competitors.

**"Why $5? Just use the free tier of [whatever]"**

> Free tiers of Anthropic / OpenAI / Google are nonexistent or
> heavily rate-limited. Hobby tier ($5) is the cheapest paid
> multi-provider tier on the market — explicitly priced lower than
> ChatGPT Plus / Claude Pro / Gemini Advanced individually. If you
> want to skip even that, BYOK is free.

**"How do I trust you with my API keys?"**

> You don't have to. BYOK keys live in your browser's localStorage
> (web), Keychain (macOS), or whatever your OS provides. They never
> hit our servers — the request goes browser → provider directly.
> The Hobby tier is the only path where we hold provider keys, and
> in that case yours are never sent anywhere.
