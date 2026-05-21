# Onboarding — start here

Status: Current
Owner: Platform lead
Last updated: 2026-05-20

> The single entry point for any new person on this project. Whoever you are — engineer, founder, investor, designer, lawyer, advisor — read this file first. It routes you to the right deeper doc for your role.
>
> **Date:** 2026-05-18. **Project:** AGI (public brand) / AGI Workforce (legal entity). **Status:** pre-launch, mobile-first, August 2026 target.

---

## What AGI is, in 60 seconds

A single app where someone using AI on their phone or laptop gets to **(a) bring their own API keys** to 10+ providers (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral, Qwen, plus Ollama / LM Studio local) and **(b) run a private downloadable LLM on-device** that works offline. One chat thread flows across all of them. Six surfaces share the same chat layer.

We are the only consumer-shipping product that combines **multi-provider** × **multi-surface** × **on-device LLM** × **BYOK pricing model**. Every individual axis has competitors; nobody owns the intersection.

**Tagline (locked):** _Beyond one model. Beyond one surface. AGI in your hands._
**Strapline (locked):** _AGI — your AI team: Claude, GPT, Gemini, and your local models, in one app._

## The six surfaces, one line each

| #   | Surface                                  | Code path                | Deep doc                                                               |
| --- | ---------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| 1   | **Desktop** (Tauri + React)              | `apps/desktop/`          | [docs/surfaces/desktop.md](docs/surfaces/desktop.md)                   |
| 2   | **Web** (Next.js 14, Vercel)             | `apps/web/`              | [docs/surfaces/web.md](docs/surfaces/web.md)                           |
| 3   | **Mobile** (Expo + RN, **lead surface**) | `apps/mobile/`           | [docs/surfaces/mobile.md](docs/surfaces/mobile.md)                     |
| 4   | **CLI** (Rust + Ratatui)                 | `apps/cli/`              | [docs/surfaces/cli.md](docs/surfaces/cli.md)                           |
| 5   | **Chrome extension** (MV3)               | `apps/extension/`        | [docs/surfaces/chrome-extension.md](docs/surfaces/chrome-extension.md) |
| 6   | **VS Code extension**                    | `apps/extension-vscode/` | [docs/surfaces/vscode-extension.md](docs/surfaces/vscode-extension.md) |

Mobile is the **lead surface** — first to ship publicly (target Aug 6, 2026), drives the release cadence for everything else. See [docs/PRD.md](docs/PRD.md) §20 lock #17 for why.

## Where to look based on your role

### If you're a new engineer

1. **Build everything once.** Follow [BUILD.md](BUILD.md). It covers Node 22 / pnpm 9.15.3 / Rust 1.94.0 prerequisites + per-surface build commands.
2. **Pick your surface.** Read its doc in `docs/surfaces/`. Each has file layout, key components, build/test commands, current open work, and known gotchas.
3. **Read the PRD.** [docs/PRD.md](docs/PRD.md) V5 is the canonical product spec — 22 sections, ~15K words. The first 6 sections give you the product picture; §10 (anti-pattern locks) tells you what NOT to do.
4. **Read the architecture.** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers how the 6 surfaces share state via shared packages.
5. **Read CLAUDE.md.** [CLAUDE.md](CLAUDE.md) is the AI-agent operating manual for this repo. Even if you're not an AI agent, it tells you the locked workflow conventions (commit format, lint enforcement, test gates).

### If you're a new founder taking over

1. Read this file, then [docs/README.md](docs/README.md) and [docs/decisions/CURRENT_DECISIONS.md](docs/decisions/CURRENT_DECISIONS.md). `docs/HANDOFF.md` is historical Wave 1 state, not the current handoff.
2. Read [docs/VISION.md](docs/VISION.md) for the long-term thesis.
3. Read [docs/PRD.md](docs/PRD.md) §1–§3 (executive summary, strategic positioning, personas) — covers the bet in plain language.
4. Read [docs/PRICING.md](docs/PRICING.md) for the pricing strategy and [packages/types/src/billing-catalog.ts](packages/types/src/billing-catalog.ts) for the code SSOT.
5. Read [docs/PRD.md](docs/PRD.md) §17 (risk register) — 23 risks with severity, blast radius, mitigation, escalation trigger.
6. Read [docs/PRD.md](docs/PRD.md) §20 (locked decisions) — 21 decisions you cannot quietly reverse without a PR amendment.

### If you're a new investor or advisor

1. Read [README.md](README.md) for the 1-page pitch.
2. Read [docs/PRD.md](docs/PRD.md) §1, §5 (competitive matrix), §17, §18 (success metrics) — that's the diligence package.
3. Read [docs/BILLION_DOLLAR_PLAYBOOK.md](docs/BILLION_DOLLAR_PLAYBOOK.md) only as historical long-arc strategy; it predates the 2026-05-20 mobile Local/BYOK trust-boundary clarification.
4. Verifiable engineering numbers are in [docs/design/pitch-deck-verified-numbers-2026-05-17.md](docs/design/pitch-deck-verified-numbers-2026-05-17.md) — 16-auditor verification of 1.5M LOC / 3,988 commits / 19 Rust crates / 18 TS packages / 6 surfaces.

### If you're a new designer

1. Read [docs/design/design-spec-2026-05-15.md](docs/design/design-spec-2026-05-15.md) for the design spec.
2. Brand palette is **locked**: teal `#21808d` (primary) + terracotta `#da7756` (secondary) + `#faf9f7` warm off-white canvas + `#1a1915` dark canvas. Type: Inter, JetBrains Mono.
3. Existing reference screenshots: `~/Desktop/reference/ui/` (219 PNGs from competitors, mapped in `memory/reference/competitive/ui-screenshots-index.md`).

### If you're a new lawyer or compliance reviewer

1. Read [docs/PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md](docs/PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md) §D.4 — the privacy launch checklist + EU AI Act gate.
2. Read the locked anti-pattern enforcers in [docs/PRD.md](docs/PRD.md) §10 #19 (no API-resale framing), #20 (telemetry scrubbing), #21 (StoreKit IAP), #22 (three-tier router), #25 (no in-app code execution UI on iOS), #26 (Article 50 disclosure).
3. Outstanding consults: [tasks/research/PROMPT-DSAR-E2EE-RESEARCH.md](tasks/research/PROMPT-DSAR-E2EE-RESEARCH.md) (GDPR DSAR memo) + [tasks/research/PROMPT-APPLE-LORA-ADAPTER-RESEARCH.md](tasks/research/PROMPT-APPLE-LORA-ADAPTER-RESEARCH.md) (Apple App Review consultation prep).

## Repo tour — top-level directories in one line each

```
/
├── apps/             6 shipping surfaces, one dir each (desktop, web, mobile, cli, extension, extension-vscode)
├── packages/         18 shared TS packages (chat, api, types, llm-normalize, providers, mcp, skills, ...)
├── crates/           19 active Rust workspace crates
├── services/         api-gateway (Express) + signaling-server (WebRTC)
├── supabase/         43 canonical SQL migrations (paid-tier launch blocker before Aug 1)
├── docs/             specs, decisions, surface deep docs, operations runbooks
├── tasks/            todo.md, research/, lessons.md (CLAUDE.md mandate)
├── scripts/          release, homebrew, install.sh, check-pricing.ts
├── ios/              native iOS shell wrapping apps/mobile (Expo prebuild output)
├── android/          native Android shell wrapping apps/mobile (if present)
├── memory/           ⚠️ NOT in this repo — lives at ~/.claude/projects/.../memory/ (AI agent durable memory)
├── .github/          10 GitHub Actions workflows (CI + Release Desktop/CLI/Windows + CodeQL + bot)
├── _archive/         dated cleanup archives (e.g., _archive/2026-05-17-cleanup/)
├── examples/         tutorial code (google-batch-api.ts, multi-provider-chat.ts, fullstack-saas/)
├── reports/          frontend-parity reports (active Wave 6 input)
├── audit/            scan outputs (scan_dead.txt, scan_xss.txt, etc.) — actively cited
└── tools/            (if present) repo-level CLI tools
```

**Top-level files you'll touch:**

| File                                                                  | What                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `README.md`                                                           | 1-page pitch + install paths                                   |
| `ONBOARDING.md`                                                       | this file — entry point                                        |
| `BUILD.md`                                                            | per-surface build prerequisites + commands                     |
| `AGENTS.md`                                                           | canonical coding-agent operating manual                        |
| `CLAUDE.md`                                                           | Claude-specific mirror of `AGENTS.md`                          |
| `CONTRIBUTING.md`                                                     | PR conventions + commit format                                 |
| `AGI_WORKFORCE.md`                                                    | platform SSOT — verified state, sprint history, decision trail |
| `docs/archive/2026-05-14-reverse-engineering-campaign/MASTER_PLAN.md` | historical per-surface reverse-engineering decision trail      |
| `CHANGELOG.md`                                                        | every shipping wave                                            |
| `AUDIT_LOG.md`                                                        | audit findings + closure trail                                 |
| `LICENSE`                                                             | proprietary                                                    |
| `THIRD_PARTY_LICENSES.md`                                             | OpenClaw + other lifted-from-open-source attribution           |

## Your first day, explicit steps

```bash
# 1. Clone + install
git clone git@github.com:siddharthanagula3/agiworkforce.git
cd agiworkforce
nvm use && corepack enable && pnpm install
rustup show   # auto-installs Rust 1.94.0 from rust-toolchain.toml

# 2. Verify everything builds
pnpm typecheck:all                          # all TS workspaces
cargo check --workspace                     # all 19 active Rust crates
pnpm test                                   # vitest across every TS workspace
cargo test --workspace --lib                # all crate unit tests

# 3. Run the CLI (fastest "is it alive" check)
cargo build --release -p agiworkforce-cli
./apps/cli/target/release/agiworkforce --help
./apps/cli/target/release/agiworkforce exec "Hello, world"

# 4. Run desktop in dev (Tauri hot-reload)
pnpm dev:desktop

# 5. Run web in dev
pnpm --filter web dev   # localhost:3000

# 6. Read the canonical product spec
$EDITOR docs/PRD.md     # V5, ~15K words, 22 sections

# 7. Pick your surface, read its deep doc
$EDITOR docs/surfaces/mobile.md     # or whichever
```

By end of Day 1 you should be able to: build all 6 surfaces, run the CLI + desktop + web, name the 10+ providers from memory, and explain BYOK + Local + Managed-cloud in one sentence each.

## Operational realities (honest)

- **Pre-launch.** No public mobile app yet. Web is live at agiworkforce.com but behind a chat-V3 default-on flag. Desktop v1.2.0 shipped Linux-only; macOS + Windows builds were blocked on Apple PLA renewal (unblocked 2026-05-16) + missing Windows EV cert (still pending).
- **Solo founder.** One person — Siddhartha Nagula — owns engineering, design, product, ops. No employees. Hiring plan: technical co-founder + mobile + growth in Q4 2026.
- **No paid customers.** All 6 paid tiers ($10–$300/mo) are on email-only waitlist until Aug 1, 2026 graduation. Stripe products created and dormant. Revenue is $0 by design.
- **Mobile is the lead.** PRD V5 §20 lock #17 says: "mobile-first in time, web parity same week, desktop W6-stable before mobile launches." Target: late July → public launch Aug 6-16, 2026.
- **The codebase is real.** 1.5M production LOC. 3,988 commits in 6.5 months. 19 active Rust crates. 18 shared TS packages. 6 surfaces with shared chat layer. Verified by 16-auditor sweep on 2026-05-17 ([docs/design/pitch-deck-verified-numbers-2026-05-17.md](docs/design/pitch-deck-verified-numbers-2026-05-17.md)).
- **Two unblocked external consults pending.** GDPR DSAR memo (1-hour privacy attorney consult, ~$400-800) + Apple App Review LoRA-adapter consultation (free, book via Apple Developer portal). Prompts ready at `tasks/research/PROMPT-{DSAR-E2EE,APPLE-LORA-ADAPTER}-RESEARCH.md`. First-pass research memos already in hand.

## The next 90 days

1. **Now → June 8** (pre-WWDC): Mobile M0 spike validates runtime tiers on real iPhone 15 Pro + Pixel 8 Pro. Kimi K2 deprecation deadline 2026-05-25 (already locked in `packages/types/src/models.json` per PRD V5 lock #24). DeepSeek V4-Pro promo cliff 2026-05-31 (auto-reroute logic already in `packages/routing/`).
2. **June 8–12** (WWDC 2026): Watch keynote for iOS 27 / Foundation Models v2 / code-execution entitlement. If material, append addendum to PRD V5 per V6-sweep abort condition.
3. **June 13 → Aug 2** (EU AI Act gate): Implement Article 50 disclosure + machine-readable AI-generated content marking. Already locked per PRD V5 §10 lock #26.
4. **Aug 6, 2026** — Mobile public launch (iOS App Store + Google Play).
5. **Aug 1, 2026** — Paid tiers graduate from waitlist. Stripe checkout activates. Hobby $10 / Pro $29.99 / Pro+ $49.99 / Pro Max $99 / Max $299.99 go live.

## Who's running this

**Siddhartha Nagula** — Founder & CEO of AGI Automation LLC. 6 years AI/ML engineering. MS Computer Science, University of Texas at Arlington (2025). Indian national, Texas-based, O-1A visa pathway in progress. Solo build of all six surfaces in nine months.

**Contact:** ceo@agiagentautomation.com · linkedin.com/in/siddharthanagula · x.com/agiworkforce · agiworkforce.com

**GitHub org:** github.com/siddharthanagula3
**Homebrew tap:** github.com/siddharthanagula3/homebrew-tap

## Reading order if you only read 5 files

1. **This file** (`ONBOARDING.md`)
2. **`docs/PRD.md`** — canonical product spec (V5, ~15K words)
3. **The surface doc you'll touch** — e.g., `docs/surfaces/mobile.md`
4. **`BUILD.md`** — get a working build
5. **`docs/decisions/CURRENT_DECISIONS.md`** — latest decision index + mobile-v1 launch clarification

If you only read 3, drop `BUILD.md` and `docs/decisions/CURRENT_DECISIONS.md`. If only 2, drop the surface doc. If only 1, read the PRD.

---

_Updated 2026-05-18. If this file goes stale, that's the highest-priority bug in the repo — every new person reads it first._
