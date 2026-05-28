# AGI

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-28

> **All the AIs you already pay for, in one place. Beyond one model. Beyond one surface.**
>
> _(Public brand: **AGI** — repo path + internal packages remain `agiworkforce`. Brand simplified 2026-05-15.)_

[![CLI Release](https://img.shields.io/github/v/release/siddharthanagula3/agiworkforce?filter=v-cli-*&label=cli&color=blue)](https://github.com/siddharthanagula3/agiworkforce/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Homebrew](https://img.shields.io/badge/brew-siddharthanagula3%2Ftap%2Fagiworkforce-orange)](https://github.com/siddharthanagula3/homebrew-tap)

Multi-provider, local-first AI application suite. AGI is being built as a
ChatGPT/Claude-style product across Mobile, Website, Desktop, CLI, Chrome
Extension, and VS Code Extension, with Local, BYOK, and invite-gated Cloud
trust modes.

> **Current product lock (2026-05-28)** — development is serial by surface:
> **Mobile → Website → Desktop → CLI → Chrome Extension → VS Code Extension**.
> Mobile is the active release surface and is not done until public App Store
> release. Future-surface work only starts during QA/review waiting periods
> when explicitly requested.
>
> **Launch posture** — public v1 is Local-first with explicit BYOK paths where
> supported. Managed Cloud remains waitlist/private beta until metering,
> provider cost snapshots, abuse/fraud controls, refunds/chargebacks,
> retention/deletion, provider terms, and support/audit workflows are proven.
>
> **Source of truth** — the long-form PRD is
> [docs/current/agi-product-requirements.md](docs/current/agi-product-requirements.md).
> The compact product lock is
> [docs/current/source-of-truth.md](docs/current/source-of-truth.md), and the
> implementation-facing parity map is
> [docs/current/parity-implementation-matrix.md](docs/current/parity-implementation-matrix.md).
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

## Commercial Posture

| Mode          | Public posture               | Billing posture                                                                                                  |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Local         | Public v1 direction          | No AGI-managed inference charge.                                                                                 |
| BYOK          | Explicit user-provider route | User pays their provider directly with their own key.                                                            |
| Managed Cloud | Waitlist/private beta        | No broad public paid launch until commercial, abuse, retention, deletion, and provider-term controls are proven. |

See [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md)
for the current commercial posture.

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

Desktop is the planned deep Local/BYOK host and third surface in the locked
development order. See [BUILD.md](BUILD.md) for local development commands.

### Use it on the web

Website is second in the locked development order. Its launch role is product,
download, docs, waitlist, invite status, and account shell support.

### Use it on mobile

Mobile is the active release surface. Mobile v1 targets Local-first chat,
Cloud waitlist/invite entry, privacy-clear onboarding, and public App Store
release.

### Add the Chrome extension

Chrome Extension is fifth in the locked development order and remains the
planned browser-context and native-bridge surface.

### Add the VS Code extension

VS Code Extension is sixth in the locked development order and remains a planned
IDE-native developer surface.

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
- [docs/current/source-of-truth.md](docs/current/source-of-truth.md) — compact product lock, trust modes, current repo position, and P0 gaps
- [docs/current/agi-product-requirements.md](docs/current/agi-product-requirements.md) — long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete requirements
- [docs/current/parity-implementation-matrix.md](docs/current/parity-implementation-matrix.md) — feature/component parity matrix for implementation agents
- [docs/current/byok-open-model-provider-strategy.md](docs/current/byok-open-model-provider-strategy.md) — BYOK, hosted open-model, local runtime, and provider/model strategy
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

Active development. Pre-v1.0 MVP. Current focus is Mobile v1 through public
App Store release. CI on `main` should always be green; if it is not, that is
the highest-priority bug.

The source-backed product status now lives in
[docs/current/agi-product-requirements.md](docs/current/agi-product-requirements.md),
[docs/current/source-of-truth.md](docs/current/source-of-truth.md), and
[docs/current/parity-implementation-matrix.md](docs/current/parity-implementation-matrix.md).
