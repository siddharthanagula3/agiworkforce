# AGI Workforce — Single Source of Truth

> Last updated: 2026-05-03. This file is the entry point for any agent (human or AI) working on this repo. Read this first; everything else links from here.

## What this is

A multi-surface AI agent platform that wraps **25 LLM providers** (cloud + local + BYOK + managed Hobby cloud) into a unified Claude-Desktop / ChatGPT / Gemini alternative. Six shipping surfaces, **one chat layout**. The Rust CLI (`apps/cli`) is the engine; Desktop / Web / Mobile / Chrome ext / VS Code ext wrap it.

## True differentiators (verified May 2026)

1. **Multi-provider in one UI** — 25 providers, switch mid-conversation. Anthropic locks to Claude only.
2. **BYOK + Local LLM (Ollama, LMStudio)** — Anthropic doesn't accept user keys.
3. **Cross-provider session continuity** — Claude → GPT → Llama in same thread.

These are the only three. Everything else (mobile dispatch, CLI with TUI, computer use, VS Code ext) — Anthropic already ships.

## Six surfaces — verified state

| Surface         | Path                     | Stack                                                                                                 | Status                                                            | Distribution path                                                            |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CLI**         | `apps/cli/`              | Rust monolith, 192 .rs / 152K LOC, Ratatui TUI 125 files, 22 subcommands, 1,848 tests, 8 providers    | Cargo green; binary at `~/.cargo/bin/agiworkforce` (5.7MB arm64)  | npm (`@agiworkforce/cli`) + Homebrew + GitHub releases + `install.sh`        |
| **Desktop**     | `apps/desktop/`          | Tauri v2 + React (Vite), 737 .rs backend / 373K LOC, 1,469 IPC commands, 84 component dirs, 84 stores | Builds clean; chat surface = `ChatInterface` from `packages/chat` | DMG (macOS, signed `D2PR62RLT4`) + EXE (Windows, EV cert pending) + AppImage |
| **Web**         | `apps/web/`              | Next.js 14 app router, 231 routes + 86 API endpoints, Vite SPA bundled into `/public/chat/`           | Vercel deployed at `agiworkforce.com/chat`                        | Hosted at agiworkforce.com                                                   |
| **Mobile**      | `apps/mobile/` + `ios/`  | Expo + RN, 41 screens, drawer nav, MMKV+biometric, dispatch (Anthropic Dispatch parity)               | Expo build profiles ready (dev/preview/prod)                      | iOS App Store + Google Play (no listings yet)                                |
| **Chrome ext**  | `apps/extension/`        | MV3 v1.2.0, autofill (LinkedIn/Lever), 14 test suites                                                 | dist/ + extension.zip (87K) ready                                 | Chrome Web Store (no listing yet)                                            |
| **VS Code ext** | `apps/extension-vscode/` | v0.3.0, 54+ commands, @agi chat participant, 13 providers                                             | out/extension.js compiled                                         | VS Code Marketplace (no listing yet)                                         |

**Backend:** `services/api-gateway/` (Express v5.2, 14 routes, Fly.io ready) + `services/signaling-server/` (WebRTC, deployed Fly.io) + `supabase/` (17 migrations, us-east-2).
**Shared TS packages:** `packages/chat` (canonical chat component), `packages/api`, `packages/types`, `packages/runtime`, `packages/utils`.
**Active Rust crates:** 11 (down from 113 — see commit `ac59e09e`).

## Pricing model (locked 2026-05-03)

| Tier       | Price              | At MVP        | What                                                                                 |
| ---------- | ------------------ | ------------- | ------------------------------------------------------------------------------------ |
| Local-only | Free forever       | YES           | Run Ollama/LMStudio on your laptop. No Supabase. Desktop only.                       |
| BYOK       | Free forever       | YES           | Bring your own keys to Anthropic/OpenAI/Google/etc. Optional Supabase if Cloud mode. |
| Hobby      | TBD ($5/mo target) | YES           | Managed cloud, limited credits, basic models. Only paid MVP tier.                    |
| Pro        | TBD                | NO (waitlist) | Released after security audit clears.                                                |
| Max        | TBD                | NO (waitlist) | Released after security audit clears.                                                |

## Local vs Cloud mode (architecture)

- **Local mode** (Desktop only): SQLite, Ollama/LMStudio, no auth, no sync, no Dispatch.
- **Cloud mode** (Desktop + Web + Mobile): Supabase, BYOK or Hobby cloud, Realtime cross-device sync, OAuth, Dispatch.
- Mode picker: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`.
- Runtime detection: `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`).

## MVP plan (3 waves, parallel where possible)

| Wave       | Timeline  | What ships                                                                                                      | Status            |
| ---------- | --------- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Wave 1** | Week 1    | CLI v1.0 — npm + Homebrew + GitHub releases                                                                     | Pending Wave 1 GO |
| **Wave 2** | Weeks 1-4 | Desktop v1.0 — pixel-close Claude Desktop UI, Windows EV cert, web UnifiedAgenticChat → packages/chat migration | Pending           |
| **Wave 3** | Weeks 5-8 | Mobile (App Store + Play) + Chrome ext (Web Store) + VS Code ext (Marketplace) + Hobby tier launch              | Pending           |

Active sprint plan: [docs/plans/sprint1-vault-rewire.md](docs/plans/sprint1-vault-rewire.md). Master remediation: [docs/plans/master-remediation.md](docs/plans/master-remediation.md).

## Documentation map

| Doc                                                  | What                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **THIS FILE**                                        | Single source of truth, entry point                                    |
| [README.md](README.md)                               | User-facing quick start (download, install)                            |
| [BUILD.md](BUILD.md)                                 | Prerequisites, build commands per surface                              |
| [CONTRIBUTING.md](CONTRIBUTING.md)                   | PR conventions, branch protection, commit format                       |
| [docs/VISION.md](docs/VISION.md)                     | Product vision (ONE chat layout, multi-provider)                       |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Cross-surface architecture                                             |
| [docs/ROADMAP.md](docs/ROADMAP.md)                   | Live wave/sprint status (this is what changes weekly)                  |
| [docs/DESIGN.md](docs/DESIGN.md)                     | UI principles. Reference: `~/Desktop/reference/ui/`                    |
| [docs/PRICING.md](docs/PRICING.md)                   | Tier model details                                                     |
| [apps/cli/ARCHITECTURE.md](apps/cli/ARCHITECTURE.md) | CLI deep-dive (will be folded into docs/ARCHITECTURE.md in v2)         |
| [docs/audit/](docs/audit/)                           | Historical audits (AUDIT_REPORT.md, FIX_QUEUE.md, AUDIT_2026-05-03.md) |
| [docs/plans/](docs/plans/)                           | Active sprint plans (only — stale plans deleted 2026-05-03)            |
| [docs/api/](docs/api/)                               | Postman + OpenAPI 3.0 + curl/JS/Python examples                        |

## Build verification (this snapshot, 2026-05-03)

```bash
cargo check --workspace      # GREEN (1.4s after dep cleanup)
cargo build -p agiworkforce-cli   # GREEN (7.5s)
pnpm typecheck:all            # not re-run since memory consolidation
pnpm lint                     # not re-run
```

## Audit status

- AUDIT_2026-05-03 results: **P0 13/14 closed**, **P1 20/25 closed**, P2/P3 in queue.
- Remaining P0: CLI-5 (auth.json plaintext, mitigated by 0o600).
- Remaining P1: DESK-5 (Vite env vars in Rust process env), DESK-8 (in-RAM remembered choices), WEB-4 (Stripe webhook body-read), WEB-5 (CSRF for Bearer), WEB-11 (CSP unsafe-inline style).

## What was just cleaned up (2026-05-03)

| Commit        | What                                       | Impact                           |
| ------------- | ------------------------------------------ | -------------------------------- |
| `61ca9205`    | Removed 5 root-level debris files          | -89 LOC                          |
| `ac59e09e`    | Deleted 102 codex-rs port crates           | **-995K LOC across 4,624 files** |
| (this commit) | Created SSOT structure (this file + docs/) | +N LOC docs                      |

Original codex-cli source preserved at `~/Desktop/reference/codex-cli/` for future re-port if needed.

## How to use this file

- **New contributor?** Read this top to bottom, then [BUILD.md](BUILD.md) + [docs/VISION.md](docs/VISION.md).
- **Picking up where someone left off?** Check [docs/ROADMAP.md](docs/ROADMAP.md) for current sprint.
- **Designing UI?** [docs/DESIGN.md](docs/DESIGN.md) → `~/Desktop/reference/ui/claude ui/` for the design north star.
- **AI agent (Claude Code, etc.)?** This file + your `~/.claude/projects/.../memory/MEMORY.md` are your context.

## Update cadence

Update this file when:

- A wave/milestone ships
- A surface's status changes (file count, build state, distribution status)
- Pricing or vision changes
- A major cleanup happens
- The audit baseline changes

Don't update this file for: in-progress work (use [docs/ROADMAP.md](docs/ROADMAP.md)), individual fixes (use commit messages + [docs/audit/FIX_QUEUE.md](docs/audit/FIX_QUEUE.md)).
