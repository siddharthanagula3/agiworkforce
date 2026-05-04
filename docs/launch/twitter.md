# Twitter / X launch thread draft

> Post on launch day from `@siddharthanagul`.
> 8-tweet thread, each ≤280 chars.

---

## Tweet 1 (hook)

```
Just shipped AGI Workforce CLI v1.0.

It's Claude Code, but you can use any of 10+ Providers — Anthropic,
OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Ollama (local), LM Studio
(local), and more.

BYOK. No vendor lock. Switch model mid-conversation.

🧵
```

## Tweet 2 (the problem)

```
The problem with Claude Code / Codex CLI / Gemini CLI:

You pick one and you're locked in.

Want to use Claude for code review and GPT for unit tests in the same
session? Tough. Want a local Llama fallback when you hit rate limits? Nope.

I built AGI Workforce so you don't have to choose.
```

## Tweet 3 (install)

```
Three install paths:

  npm install -g @agiworkforce/cli
  brew install siddharthanagula3/tap/agiworkforce
  curl -fsSL agiworkforce.com/install.sh | bash

Single 5.7 MB Rust binary. Zero deps. Works offline (with Ollama).
```

## Tweet 4 (the multi-provider magic)

```
The magic command:

agiworkforce -m "claude-opus-4-6,gpt-5.4,llama3.1:8b" exec "..."

Claude first. If it rate-limits → tries GPT-5.4. If GPT fails → falls back
to local Llama. All in the same session, with the same context.

This is what "no vendor lock" actually means.
```

## Tweet 5 (the engineering)

```
Under the hood:

- 195 .rs files / 155,029 LOC / 914 unit tests
- Ratatui TUI (125 files)
- 22 subcommands, 19 hook events, 10+ Providers
- MCP support (client + server)
- Sandbox: Seatbelt / Bubblewrap / Landlock / Restricted Token
- Daemon: cron + webhook + file-watcher

Architecture deep-dive in repo.
```

## Tweet 6 (what's next)

```
What's coming in the next 4 weeks:

- Desktop app (Tauri v2, signed for macOS + Windows)
- Web at agiworkforce.com/chat
- iOS + Android mobile companion (with Anthropic-Dispatch parity for
  mobile→desktop task handoff)
- Chrome extension
- VS Code extension

All wrapping the same Rust engine.
```

## Tweet 7 (pricing)

```
Pricing:

🆓 Local-only (Ollama / LM Studio) — free forever
🆓 BYOK (your own API keys) — free forever
💰 Hobby ($5/mo) — managed cloud, limited credits, coming soon
⏳ Pro / Max — waitlist (post-security-audit)

I'd rather have 100K BYOK users than extract from 10K early.
```

## Tweet 8 (CTA)

```
If you ship code from the terminal — try it:

🔗 github.com/siddharthanagula3/agiworkforce
📚 agiworkforce.com
💬 PRs welcome (license caveat in repo)

Built solo over the last few months. Feedback / bugs / feature requests
appreciated. RT to help me find the right early users 🙏
```

---

## Why this thread works

1. **Tweet 1 hook**: declares ship, names the wedge ("any of 25"), promises detail
2. **Tweet 2 problem**: positions against named competitors (Claude Code, Codex CLI, Gemini)
3. **Tweet 3 install**: shows install IS the demo (3 lines, copy-paste)
4. **Tweet 4 magic**: ONE command shows the whole product
5. **Tweet 5 cred**: hard numbers prove engineering substance
6. **Tweet 6 roadmap**: shows it's not just a CLI, it's a platform
7. **Tweet 7 pricing**: honest, no upsell, builds trust
8. **Tweet 8 CTA**: clear next steps, polite ask

## Pinned tweet (replace whatever's pinned)

Pin Tweet 1 of this thread.

## Profile bio (optional update)

```
Building @agiworkforce — multi-provider AI agent for your terminal.
BYOK + local Ollama + 10+ Providers. github.com/siddharthanagula3/agiworkforce
```

## Reply hooks

When someone says **"how is this different from cursor / aider?"**:

> Cursor is an IDE; Aider is single-provider Python. AGI Workforce is a Rust CLI/TUI like Claude Code, but works with any of 10+ Providers in the same session. Different category, different value prop.

When someone says **"this should be open source"**:

> The code IS in a public repo. Current license is proprietary because there's a planned managed-cloud tier. Local + BYOK use is unrestricted. OSI license migration is on the roadmap. PRs welcome with that caveat.

When someone DMs **"can you do X feature?"**:

> File an issue with use-case detail at github.com/siddharthanagula3/agiworkforce/issues — easier to track and other users can chime in.
