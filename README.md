# AGI

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-27

> **All the AIs you already pay for, in one place. Beyond one model. Beyond one surface.**
>
> _(Public brand: **AGI** — repo path + internal packages remain `agiworkforce`. Brand simplified 2026-05-15.)_

[![CLI Release](https://img.shields.io/github/v/release/siddharthanagula3/agiworkforce?filter=v-cli-*&label=cli&color=blue)](https://github.com/siddharthanagula3/agiworkforce/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Homebrew](https://img.shields.io/badge/brew-siddharthanagula3%2Ftap%2Fagiworkforce-orange)](https://github.com/siddharthanagula3/homebrew-tap)

Multi-provider, local-first AI agent platform. One Tauri desktop app, one Next.js web at agiworkforce.com/chat, one Expo mobile companion, one Rust CLI, plus VS Code and Chrome extensions — all wired into the same chat layer with **10+ Providers**, MCP, browser automation, and computer-use.

> **BYOK-first launch posture (2026-05-16 → 2026-08-01)** — v1 ships as **BYOK + Local only**. All paid tiers are on **email-only waitlist** until **August 1, 2026 graduation**, when caps will be set from real BYOK telemetry instead of guesses. No subscription you can be over-charged on yet.
>
> **R29 — Claude parity + launch readiness in flight** (2026-05-27): 368-screenshot Claude audit complete. 173 features verified end-to-end (95.4% passing). Wave 1 shipped: effort/thinking slider, language selector (Hindi + i18n), file preview, mobile LaTeX rendering. 3 bugs found via line-by-line code tracing and fixed (effort API wiring, incognito DB persistence leak, edit message prop chain). 20-artboard Claude Design prototype extracted. 13 parity gaps + 9 design prototype screens remaining across 6 parallel lanes. See `PLAN.md` R29 section.
>
> **CLI v1.0 SHIPPED** (2026-05-03). Install: `brew install siddharthanagula3/tap/agiworkforce` or see [Quick start](#quick-start) below.
>
> **Apple notarization unblocked** (2026-05-16): PLA renewed; macOS signed + notarized builds re-enabled. Signing identity `D2PR62RLT4`.
>
> **Foundation Sprint shipped** at tag [`v0.7.0-foundation`](https://github.com/siddharthanagula3/agiworkforce/releases/tag/v0.7.0-foundation) (2026-05-13): central state pattern, message-queue priority lane, `packages/llm-runtime`, outbound-worker direction inversion, HKDF dispatch-key rotation, Stripe webhook idempotency RPC live in prod. Stripe wired but **dormant during waitlist period** — flips live Aug 1.
>
> **For contributors:** [AGI_WORKFORCE.md](AGI_WORKFORCE.md) is the product entry point and [docs/README.md](docs/README.md) gives the organized docs map.
> **For coding agents:** read [AGENTS.md](AGENTS.md) first, then the relevant scoped `AGENTS.md` and [docs/agent-context/](docs/agent-context/).
> **For builds and deployment:** [BUILD.md](BUILD.md).
> **For PR conventions:** [CONTRIBUTING.md](CONTRIBUTING.md).

## Why AGI

| You want                                  | Anthropic Claude | OpenAI ChatGPT | AGI                        |
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

| Tier                                                                                 | Monthly       | Available now (until 2026-08-01)    |
| ------------------------------------------------------------------------------------ | ------------- | ----------------------------------- |
| Local-only (run Ollama / LM Studio yourself)                                         | Free forever  | ✅ Live                             |
| BYOK (bring your own API keys to Anthropic/OpenAI/Google/etc.)                       | Free forever  | ✅ Live                             |
| Hobby (managed cloud, limited credits)                                               | $10           | 📝 Waitlist — graduates Aug 1, 2026 |
| Pro (full models, higher caps)                                                       | $29.99        | 📝 Waitlist — graduates Aug 1, 2026 |
| **Pro+** (Pro pool + Opus 4.7 + GPT-5.5 daily caps + 60s Runway Gen-4 + voice 1500m) | $49.99        | 📝 Waitlist — graduates Aug 1, 2026 |
| **Pro Max** (NEW — uninterrupted deep-work tier, 4-model compare, priority routing)  | **$99**       | 📝 Waitlist — graduates Aug 1, 2026 |
| Max (highest caps, computer use, voice unlimited)                                    | $299.99       | 📝 Waitlist — graduates Aug 1, 2026 |
| Enterprise (SSO, SCIM, custom retention)                                             | Contact sales | Contact sales                       |

**Why waitlist?** We're collecting 60-90 days of real BYOK telemetry before committing to per-tier caps. No subscription is sold during the waitlist period — pay your AI providers directly with your own keys. See [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md) for the current commercial posture.

## Quick start

### Install the CLI

```bash
# Homebrew (macOS, Linux)
brew install siddharthanagula3/tap/agiworkforce

# cargo (any platform)
cargo install agiworkforce-cli --bin agi

# Universal installer (macOS, Linux, WSL)
curl -fsSL https://agiworkforce.com/install.sh | bash

# npm — coming soon (pending NPM_TOKEN)
# npm install -g @agiworkforce/cli
```

Then:

```bash
agi login            # OAuth via Anthropic / OpenAI / Google, or BYOK
agi exec "hello"     # one-shot
agi                  # interactive TUI
```

`agi` is the primary command. `agiworkforce` remains installed as a backward-compatible alias.

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
cargo run -p agiworkforce-cli --bin agi -- exec "hello"
```

## Documentation

- [docs/current/](docs/current/) — compact current product, architecture, commercial, and repo-operability docs
- [docs/current/product-suite.md](docs/current/product-suite.md) — product thesis, surfaces, trust modes, and sync boundary
- [docs/current/technical-architecture.md](docs/current/technical-architecture.md) — monorepo shape, runtime boundaries, providers, generated files, and enterprise control plane
- [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md) — waitlist, BYOK, managed-compute, payments, and enterprise launch rules
- [docs/current/agent-and-repo-operability.md](docs/current/agent-and-repo-operability.md) — repo organization, agent workflow, and A+ docs rules
- [docs/decisions/CURRENT_DECISIONS.md](docs/decisions/CURRENT_DECISIONS.md) — locked decision index and conflict rules
- [AGI_WORKFORCE.md](AGI_WORKFORCE.md) — product source of truth for humans and high-level context
- [AGENTS.md](AGENTS.md) — coding-agent source of truth (start here for Codex, Claude Code, Cursor, opencode, VS Code agents, and future agents)
- [docs/README.md](docs/README.md) — organized documentation map
- [docs/design/design-spec-2026-05-15.md](docs/design/design-spec-2026-05-15.md) — canonical 2026-05-15 design spec (composer, sidebar, inline tool-call, icons) shipped across all 6 surfaces
- [apps/cli/ARCHITECTURE.md](apps/cli/ARCHITECTURE.md) — CLI deep-dive
- [docs/audit/](docs/audit/) — security audits (P0/P1 status)
- [docs/plans/](docs/plans/) — active sprint plans
- [docs/api/](docs/api/) — Postman + OpenAPI 3.0

## License

This is proprietary software. © 2026 AGI Workforce. All rights reserved.

## Status

Active development. Pre-v1.0 MVP. CI on `main` should always be green; if it isn't, that's the highest-priority bug.

**R29 parity status** (2026-05-27): 149 Claude features audited — 100 at parity (67%), 68 AGI-ahead features, 13 gaps remaining. 15 providers and 84 models in the canonical catalog (`packages/types/src/models.json`). 165/173 total features verified working via end-to-end code tracing. 3557+ tests passing across all surfaces.
