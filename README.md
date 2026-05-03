# AGI Workforce

Multi-provider, local-first AI agent platform. One Tauri desktop app, one Next.js web at agiworkforce.com/chat, one Expo mobile companion, one Rust CLI, plus VS Code and Chrome extensions — all wired into the same chat layer with **25 LLM providers**, MCP, browser automation, and computer-use.

> **For contributors and AI agents:** [AGI_WORKFORCE.md](AGI_WORKFORCE.md) is the single source of truth.
> **For builds and deployment:** [BUILD.md](BUILD.md).
> **For PR conventions:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Why AGI Workforce

| You want                                  | Anthropic Claude | OpenAI ChatGPT | AGI Workforce             |
| ----------------------------------------- | ---------------- | -------------- | ------------------------- |
| One model family                          | ✅ Claude only   | ✅ GPT only    | ✅ Pick from 25 providers |
| Bring your own API key                    | ❌               | ❌             | ✅                        |
| Run local LLMs (Ollama / LMStudio)        | ❌               | ❌             | ✅                        |
| Switch model mid-conversation             | ❌               | Limited        | ✅ Across providers       |
| Desktop + Web + Mobile + CLI + extensions | ✅               | Partial        | ✅ All six                |
| Computer use, MCP, browser automation     | ✅ Cowork        | Limited        | ✅                        |
| Mobile-to-desktop task dispatch           | ✅ Dispatch      | ❌             | ✅                        |

The unique slice: **multi-provider + BYOK + local LLM all in one app, on every surface**. No competitor offers all three.

## Pricing

| Tier                                        | Price          | Available now |
| ------------------------------------------- | -------------- | ------------- |
| Local-only (run Ollama / LMStudio yourself) | Free forever   | ✅            |
| BYOK (bring your own API keys)              | Free forever   | ✅            |
| Hobby (managed cloud, limited credits)      | $5/mo (target) | ✅            |
| Pro / Max (full models, higher caps)        | TBD            | Waitlist      |

See [docs/PRICING.md](docs/PRICING.md) for details.

## Quick start

### Install the CLI

```bash
# npm
npm install -g @agiworkforce/cli

# Homebrew
brew install agiworkforce/tap/agiworkforce

# Or universal installer
curl -fsSL https://agiworkforce.com/install.sh | bash
```

Then:

```bash
agiworkforce login            # OAuth via Anthropic / OpenAI / Google, or BYOK
agiworkforce exec "hello"     # one-shot
agiworkforce                  # interactive TUI
```

### Use the desktop app

Download from [agiworkforce.com/download](https://agiworkforce.com/download) — DMG (macOS), EXE (Windows), AppImage (Linux). Auto-update built in.

### Use it on the web

[agiworkforce.com/chat](https://agiworkforce.com/chat) — sign in with Google or email, choose Hobby tier or BYOK.

### Use it on mobile

iOS App Store + Google Play — see [agiworkforce.com/mobile](https://agiworkforce.com/mobile).

### Add the Chrome extension

[Chrome Web Store listing](https://agiworkforce.com/chrome).

### Add the VS Code extension

Search for "AGI Workforce" in VS Code Marketplace, or `code --install-extension agi-workforce`.

## Build from source

See [BUILD.md](BUILD.md) for prerequisites (Node 22, pnpm 9.15.3, Rust 1.94.0) and per-surface build commands.

```bash
git clone git@github.com:siddharthanagula3/agiworkforce.git
cd agiworkforce
nvm use && corepack enable && pnpm install
pnpm dev:desktop                  # Tauri dev mode
# Or:
cargo run -p agiworkforce-cli -- exec "hello"
```

## Documentation

- [AGI_WORKFORCE.md](AGI_WORKFORCE.md) — single source of truth (start here)
- [docs/VISION.md](docs/VISION.md) — product vision (ONE chat layout, multi-provider)
- [docs/ROADMAP.md](docs/ROADMAP.md) — live wave/sprint status
- [docs/DESIGN.md](docs/DESIGN.md) — UI principles (Claude Desktop as north star)
- [docs/PRICING.md](docs/PRICING.md) — tier model
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — cross-surface architecture
- [apps/cli/ARCHITECTURE.md](apps/cli/ARCHITECTURE.md) — CLI deep-dive
- [docs/audit/](docs/audit/) — security audits (P0/P1 status)
- [docs/plans/](docs/plans/) — active sprint plans
- [docs/api/](docs/api/) — Postman + OpenAPI 3.0

## License

PROPRIETARY. See [LICENSE](LICENSE).

## Status

Active development. Pre-v1.0 MVP. CI on `main` should always be green; if it isn't, that's the highest-priority bug.
