# AGI Workforce

> **Beyond one model. Beyond one surface. AGI in your hands.**

[![CLI Release](https://img.shields.io/github/v/release/siddharthanagula3/agiworkforce?filter=v-cli-*&label=cli&color=blue)](https://github.com/siddharthanagula3/agiworkforce/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Homebrew](https://img.shields.io/badge/brew-siddharthanagula3%2Ftap%2Fagiworkforce-orange)](https://github.com/siddharthanagula3/homebrew-tap)

Multi-provider, local-first AI agent platform. One Tauri desktop app, one Next.js web at agiworkforce.com/chat, one Expo mobile companion, one Rust CLI, plus VS Code and Chrome extensions — all wired into the same chat layer with **10+ Providers**, MCP, browser automation, and computer-use.

> **Launch-readiness wave 1+2 complete** — 57 commits, all surfaces verified green (2026-05-15). All six surfaces (CLI / Desktop / Web / Mobile / Chrome ext / VS Code ext) are launch-ready. See [docs/design/design-spec-2026-05-15.md](docs/design/design-spec-2026-05-15.md) for the canonical UI spec the wave was driven from.
>
> **CLI v1.0 SHIPPED** (2026-05-03). Install: `brew install siddharthanagula3/tap/agiworkforce` or see [Quick start](#quick-start) below.
>
> **Foundation Sprint shipped** at tag [`v0.7.0-foundation`](https://github.com/siddharthanagula3/agiworkforce/releases/tag/v0.7.0-foundation) (2026-05-13): central state pattern, message-queue priority lane, `packages/llm-runtime` (retry + stream watchdog + error classifier), outbound-worker direction inversion (`worker_registrations` + `work_units` live in Supabase), HKDF dispatch-key rotation (`rotate_dispatch_keys` RPC live), Stripe webhook idempotency RPC live in prod. All four tiers (Hobby / Pro / **Pro+** / Max) wired in Stripe.
>
> **For contributors and AI agents:** [AGI_WORKFORCE.md](AGI_WORKFORCE.md) is the single source of truth.
> **For builds and deployment:** [BUILD.md](BUILD.md).
> **For PR conventions:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Why AGI Workforce

| You want                                  | Anthropic Claude | OpenAI ChatGPT | AGI Workforce              |
| ----------------------------------------- | ---------------- | -------------- | -------------------------- |
| One model family                          | ✅ Claude only   | ✅ GPT only    | ✅ Pick from 10+ Providers |
| Bring your own API key                    | ❌               | ❌             | ✅                         |
| Run local LLMs (Ollama / LM Studio)       | ❌               | ❌             | ✅                         |
| Switch model mid-conversation             | ❌               | Limited        | ✅ Across providers        |
| Desktop + Web + Mobile + CLI + extensions | ✅               | Partial        | ✅ All six                 |
| Computer use, MCP, browser automation     | ✅ Cowork        | Limited        | ✅                         |
| Mobile-to-desktop task dispatch           | ✅ Dispatch      | ❌             | ✅                         |

The unique slice: **multi-provider + BYOK + local LLM all in one app, on every surface**. No competitor offers all three.

## Pricing

| Tier                                                                   | Price         | Available now |
| ---------------------------------------------------------------------- | ------------- | ------------- |
| Local-only (run Ollama / LM Studio yourself)                           | Free forever  | ✅            |
| BYOK (bring your own API keys)                                         | Free forever  | ✅            |
| Hobby (managed cloud, limited credits)                                 | $10/mo        | ✅            |
| Pro (full models, higher caps)                                         | $29.99/mo     | ✅            |
| **Pro+** (Pro pool + Opus 4.7 + GPT-5.5 daily caps + 60s Runway Gen-4) | $49.99/mo     | ✅            |
| Max (highest caps, computer use)                                       | $299.99/mo    | ✅            |
| Enterprise (SSO, SCIM, custom retention)                               | Contact sales | Contact sales |

See [docs/PRICING.md](docs/PRICING.md) for details.

## Quick start

### Install the CLI

```bash
# Homebrew (macOS, Linux)
brew install siddharthanagula3/tap/agiworkforce

# cargo (any platform)
cargo install agiworkforce-cli

# Universal installer (macOS, Linux, WSL)
curl -fsSL https://agiworkforce.com/install.sh | bash

# npm — coming soon (pending NPM_TOKEN)
# npm install -g @agiworkforce/cli
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
- [docs/design/design-spec-2026-05-15.md](docs/design/design-spec-2026-05-15.md) — canonical 2026-05-15 design spec (composer, sidebar, inline tool-call, icons) shipped across all 6 surfaces
- [docs/PRICING.md](docs/PRICING.md) — tier model
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — cross-surface architecture
- [apps/cli/ARCHITECTURE.md](apps/cli/ARCHITECTURE.md) — CLI deep-dive
- [docs/audit/](docs/audit/) — security audits (P0/P1 status)
- [docs/plans/](docs/plans/) — active sprint plans
- [docs/api/](docs/api/) — Postman + OpenAPI 3.0

## License

This is proprietary software. © 2026 AGI Workforce. All rights reserved.

## Status

Active development. Pre-v1.0 MVP. CI on `main` should always be green; if it isn't, that's the highest-priority bug.
