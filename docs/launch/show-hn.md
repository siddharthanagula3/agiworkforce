# Show HN draft

> Submit at: <https://news.ycombinator.com/submit>
> Format: Title (≤80 chars) + URL + first comment (the pitch).

---

## Title

```
Show HN: AGI Workforce CLI – multi-provider AI agent for the terminal (BYOK)
```

(78 chars — under HN's 80-char title limit)

## URL

```
https://github.com/siddharthanagula3/agiworkforce
```

## First comment (pitch)

```
Hi HN — I built AGI Workforce CLI because I was tired of having a separate
terminal tool for every model provider.

If you use Claude Code, you're locked to Anthropic. If you use OpenAI Codex
CLI, you're locked to OpenAI. Gemini CLI = Google only. I wanted ONE tool
that lets me switch from Claude → GPT → local Llama mid-conversation, with
my own API keys, including local Ollama for sensitive work.

This is what I built:

- 10+ Providers in one CLI: Anthropic, OpenAI, Google, xAI, DeepSeek,
  Perplexity, Qwen, Moonshot, Zhipu, plus local Ollama and LM Studio,
  plus OllamaCloud, plus user-defined Custom BYO endpoints
- BYOK — bring your own API keys, no markup, your data goes to the
  provider directly
- Local-first option — run Ollama or LM Studio on your machine, fully offline
- Multi-provider fallback chain: `agiworkforce -m "claude-opus-4-7,gpt-5.5,llama3.1:8b" "..."`
  rotates on rate limit / failure / etc
- Ratatui TUI with streaming markdown, slash commands, syntax highlighting
- MCP support (both client and server modes)
- Sandbox: Seatbelt (macOS), Bubblewrap/Landlock (Linux), Restricted Token
  (Windows)
- Daemon mode with cron + webhook + file-watcher triggers
- 22 subcommands, 22 hook events, 999 unit tests, single 5.7 MB Rust binary

Install:
- npm: `npm install -g @agiworkforce/cli`
- brew: `brew install siddharthanagula3/tap/agiworkforce`
- curl: `curl -fsSL https://agiworkforce.com/install.sh | bash`

Architecture deep-dive (14 subsystems mapped):
https://github.com/siddharthanagula3/agiworkforce/blob/main/apps/cli/ARCHITECTURE.md

It's free forever for local + BYOK. There's a Hobby tier (managed cloud)
coming for users who don't want to deal with API keys. Pro / Max are
waitlist until I clear the security audit (see docs/audit/).

Vision: <https://github.com/siddharthanagula3/agiworkforce/blob/main/docs/VISION.md>

Happy to answer anything. The Rust source is 200 files / ~155K LOC, the
agentic loop and provider dispatch are in apps/cli/src/{agent,models}.rs
if you want to dig in.

The desktop app, mobile companion (with Anthropic-Dispatch parity for
mobile→desktop task handoff), web at agiworkforce.com/chat, Chrome
extension, and VS Code extension all wrap this same Rust engine. CLI is
shipping today, Desktop ships in 4 weeks, the rest follow.
```

## Why this works on HN

1. **Show HN format** is the right tag (working software, not a pitch deck)
2. **Direct comparison** to Claude Code / Codex CLI / Gemini CLI sets the frame
3. **Concrete numbers** (10+ Providers, 999 tests, 5.7 MB, 155,029 LOC) are credible
4. **Architecture link** rewards engineers who want to dig
5. **Honest pricing** (free for BYOK + local; waitlist for Pro/Max) is HN-friendly
6. **No "AI changes everything" hyperbole** — just what it does

## Timing

Best HN submission time: Tue–Thu, 7–9am Eastern. Avoid weekends.

## Follow-ups in thread

If asked **"how is this different from LiteLLM / Open WebUI?"**:

> LiteLLM is a Python library — programmatic access. Open WebUI is a self-hosted web UI. AGI Workforce is a desktop-class CLI agent (Rust binary, single install, zero deps) with the agentic loop / TUI / sandbox / MCP all native, plus a desktop app + mobile companion that share the same engine.

If asked **"why proprietary license?"**:

> The CLI source is in the public repo and you can build it yourself. The proprietary license protects against someone forking and shipping a paid version of the Hobby tier (managed cloud) without contributing back. Local + BYOK use is unrestricted. Open-source compatible license is on my roadmap once the business model is validated.

If asked **"how do you make money?"**:

> Hobby tier ($5/mo) for users who want managed cloud + don't want to deal with API keys. Pro/Max tiers (TBD) for power users with computer-use, longer agent loops, higher caps. Local + BYOK stays free forever — I'd rather have 100 K BYOK users I can convert later than 10 K I'm extracting from now.

If accused of being **a Claude Code clone**:

> Not really — Claude Code is single-provider (Anthropic) and the source is
> closed. AGI Workforce is multi-provider, BYOK-first, and the engine is
> open-source-readable Rust. The convergent design (Ratatui TUI, MCP support,
> 22 subcommands, sandbox) is because we're solving the same problem space —
> "AI agent in your terminal" — but the value props are orthogonal.
