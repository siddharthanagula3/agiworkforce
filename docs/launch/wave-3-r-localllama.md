# Wave 3 r/LocalLLaMA draft — Ollama / LM Studio first-class

> Submit at: <https://www.reddit.com/r/LocalLLaMA/submit>
> Tag: "Tutorial · Guide" or "Discussion"
> Best time: weekday morning Pacific.

---

## Title

```
[Tool] Multi-provider chat app with first-class Ollama support — switch local Llama and cloud Claude mid-conversation
```

(151 chars)

## Body

````md
Hi r/LocalLLaMA — wanted to share AGI Workforce, a multi-provider
chat app I've been building. The reason it might be relevant here:
**local LLMs are a peer, not an afterthought**.

Most multi-provider tools treat Ollama as a "we technically
support it" checkbox. We made it equal to Claude / GPT / Gemini,
which means:

- Same chat thread, switch from `claude-haiku-4.5` to
  `llama3.3:70b` in one click
- Same tool-use surface (function calling normalized per vendor)
- Same streaming UI
- Same context-window handling (we estimate per-family if Ollama's
  /api/tags doesn't expose it)
- Falls back gracefully when the daemon isn't running

## What works today

```bash
# 1. start ollama
ollama serve
ollama pull llama3.3
ollama pull qwen3:14b

# 2. open the chat (web / desktop / mobile / vscode / chrome ext)
open https://agiworkforce.com/chat

# 3. provider picker → "Ollama (local)" → done
```

The web chat hits `localhost:11434` directly via fetch (no proxy
needed). The desktop / mobile apps speak the same protocol. The
CLI does too.

## What we built that I think r/LocalLLaMA cares about

- **OpenAI-compat replay policy** for Ollama — Ollama mimics the
  OpenAI Chat Completions API, but with quirks (num_ctx injection,
  model show metadata, etc.). We have a pure-functional replay
  helper that knows the differences. ~150 LOC, MIT-licensed in our
  `@agiworkforce/llm-normalize` package.
- **Dynamic catalog discovery** — we hit `/api/tags` and surface
  all your installed models, with per-family context-window
  estimates (Llama 3.3 → 128k, Qwen 3 → 32k, Mistral → 32k, etc.)
- **OllamaCloud support** — bring your own remote Ollama daemon
  via `OLLAMA_BASE_URL`
- **Tool calls work** — Ollama supports OpenAI-style tools as of
  v0.4. We pass through; tested with llama3.3 + qwen3.

## What's coming

- LM Studio first-class support (it's already partially there;
  same OpenAI-compat path)
- Vertex Anthropic for the cloud-routed enterprise tier
- A per-conversation provider memory so you can pin a thread to
  Llama and never accidentally route it to a cloud model

## Pricing for the local-only path

Free forever. No account, no signup, no analytics. The local-only
mode quite literally never makes a network call to our servers.

The Hobby ($5/mo) and Pro tiers are for cloud routing — irrelevant
if you're staying local.

## Source / install

- Web: https://agiworkforce.com/chat
- Desktop (Tauri): https://agiworkforce.com/download
- CLI: `npm install -g @agiworkforce/cli` (or
  `brew install siddharthanagula3/tap/agiworkforce`)
- Mobile (App Store + Play): just shipped
- VS Code: `ext install agiworkforce.agi-workforce`
- Chrome: Web Store listing live

Open to feedback on what r/LocalLLaMA wants from a multi-provider
chat app — especially around tool-use compatibility across local
models, context-window edge cases, and offline-first UX.
````

---

## Expected questions (and good answers)

**"Why not just use [Open WebUI / LibreChat / etc.]?"**

> Those are great if you already host your own LLM stack. AGI
> Workforce targets people who want a polished native app
> (Tauri/iOS/Android) that defaults to local but can scale up to
> cloud, with the cross-vendor plumbing already done. Different
> users, complementary tools.

**"Tell me about the licensing"**

> The provider adapters and normalization layer are MIT
> (open-source, in the public part of the repo). The chat app and
> brand are proprietary. We took ~10K LOC of plumbing from the
> OpenClaw project (MIT, Peter Steinberger) and adapted it; full
> attribution in `THIRD_PARTY_LICENSES.md`. The Ollama support
> path doesn't depend on any cloud provider's SDK — direct HTTP
> only.

**"Does this send any telemetry to your servers when running
local-only?"**

> No. Local-only mode talks to localhost:11434 (or wherever you
> point it) and nothing else. There's no analytics call, no
> phone-home, no version check. Verified by inspecting the
> network panel.
