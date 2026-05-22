# Three differentiators — single source of truth

> Pinned from `AGI_WORKFORCE.md` and PRD V5 §1, verified May 2026.
> The iOS description, Android description, screenshot taglines, and
> App Review walkthrough all lead with these three. They are the
> anchor of every public claim AGI makes about itself.

## 1. Multi-provider in one UI

Twelve providers registered in the CLI provider matcher today
(`apps/cli/src/models.rs:287-310` — Anthropic, OpenAI, Google,
Ollama, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio

- user-defined Custom). Mobile v1 ships parity for the cloud
  providers and Ollama (Tier 2/3 local).

**What competitors don't have:**

- Claude Desktop and the Claude mobile app lock to Anthropic only.
- ChatGPT mobile locks to OpenAI only.
- Gemini mobile locks to Google only.
- Perplexity routes across providers internally but does not expose
  a user-switchable badge per message.

**Public-facing claim:** "Switch between Claude, GPT, Gemini, Grok,
Llama, and 7 more — in the same conversation."

## 2. BYOK + Local LLM

The user can:

- **BYOK**: paste an Anthropic / OpenAI / Google / xAI / DeepSeek /
  Mistral / Perplexity / Moonshot / Zhipu API key once. Key lives in
  iOS Keychain / Android Keystore with hardware-backed protection.
  Every API call goes device → provider, never device → AGI servers
  → provider. We never see the key.
- **Local**: point at Ollama or LM Studio on the user's laptop. The
  chat runs fully offline.

**What competitors don't have:**

- Anthropic does not accept user API keys for its consumer apps.
- ChatGPT and Gemini do not accept user API keys either.
- Wrapper apps (Poe, OpenRouter) typically resell credits rather
  than route BYOK directly to providers.

**Public-facing claim:** "Paste your Anthropic, OpenAI, or Google
key once. Pay providers direct. No markup. No middleman."

## 3. Cross-provider session continuity

The user can start a question with Claude, get a second opinion
from Llama in the next turn, and send the same context to Gemini
three turns later. The cross-vendor plumbing —
`packages/llm-normalize` (2,633 LOC) — handles:

- Tool-call schema normalization across Anthropic's `tool_use` /
  OpenAI's `function_call` / Google's `functionCall` formats.
- Reasoning-trace migration (Claude's extended thinking, OpenAI's
  o1-series, Gemini's deep-think) across providers that support
  reasoning.
- Attachment re-encoding (image MIME / file ID translation) per
  provider's wire format.
- Cache-control header translation (Anthropic prompt caching ↔
  OpenAI Responses API caching).

**What competitors don't have:**

The other multi-provider wrappers (Poe, OpenRouter, Cline) ship a
single-provider chat at a time; switching means starting a new
thread. AGI is the only product (to our knowledge as of May 2026)
that migrates tool calls and reasoning state across providers in
the same thread.

**Public-facing claim:** "Start with Claude. Continue with GPT.
Finish with Llama. Tool calls and context migrate automatically."

---

## How these three drive the screenshot order

1. Screenshot 1 = differentiator 1 (the "look, three model badges in
   one thread" demo).
2. Screenshot 2 = differentiator 2 (the Keys settings screen
   showing all 12 providers as add-able).
3. Screenshot 3 = differentiator 3 (the tool-call migration shot).
4. Screenshots 4-6 = parity features (voice, vision, sync). These
   are not differentiators; they are the floor competitors set.

Do not reorder. The first three screenshots are what 90% of users
swipe through before deciding whether to install.
