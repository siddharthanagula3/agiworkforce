# AGI Workforce — Single Source of Truth

> Last updated: 2026-05-03. This file is the entry point for any agent (human or AI) working on this repo. Read this first; everything else links from here.

## What this is

A multi-surface AI agent platform that wraps **10+ Providers** (cloud + local + BYOK + managed Hobby cloud) into a unified Claude-Desktop / ChatGPT / Gemini alternative. Six shipping surfaces, **one chat layout**. Tagline: *Beyond one model. Beyond one surface. AGI in your hands.* The Rust CLI (`apps/cli`) is the engine; Desktop / Web / Mobile / Chrome ext / VS Code ext wrap it.

## True differentiators (verified May 2026)

1. **Multi-provider in one UI** — 10+ Providers, switch mid-conversation. Anthropic locks to Claude only.
2. **BYOK + Local LLM (Ollama, LMStudio)** — Anthropic doesn't accept user keys.
3. **Cross-provider session continuity** — Claude → GPT → Llama in same thread.

These are the only three. Everything else (mobile dispatch, CLI with TUI, computer use, VS Code ext) — Anthropic already ships.

## Six surfaces — verified state

| Surface         | Path                     | Stack                                                                                                 | Status                                                            | Distribution path                                                            |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CLI**         | `apps/cli/`              | Rust monolith, 195 .rs / 155,029 LOC, Ratatui TUI 125 files, 22 subcommands, 19 hook events, 914 tests, 10+ Providers | Cargo green; binary at `~/.cargo/bin/agiworkforce` (5.7MB arm64)  | npm (`@agiworkforce/cli`) + Homebrew + GitHub releases + `install.sh`        |
| **Desktop**     | `apps/desktop/`          | Tauri v2 + React (Vite), 737 .rs backend / 373K LOC, 1,469 IPC commands, 84 component dirs, 84 stores | Builds clean; chat surface = `ChatInterface` from `packages/chat` | DMG (macOS, signed `D2PR62RLT4`) + EXE (Windows, EV cert pending) + AppImage |
| **Web**         | `apps/web/`              | Next.js 14 app router, 231 routes + 86 API endpoints, Vite SPA bundled into `/public/chat/`           | Vercel deployed at `agiworkforce.com/chat`                        | Hosted at agiworkforce.com                                                   |
| **Mobile**      | `apps/mobile/` + `ios/`  | Expo + RN, 41 screens, drawer nav, MMKV+biometric, dispatch (Anthropic Dispatch parity)               | Expo build profiles ready (dev/preview/prod)                      | iOS App Store + Google Play (no listings yet)                                |
| **Chrome ext**  | `apps/extension/`        | MV3 v1.2.0, autofill (LinkedIn/Lever), 14 test suites                                                 | dist/ + extension.zip (87K) ready                                 | Chrome Web Store (no listing yet)                                            |
| **VS Code ext** | `apps/extension-vscode/` | v0.3.0, 54+ commands, @agi chat participant, 13 providers                                             | out/extension.js compiled                                         | VS Code Marketplace (no listing yet)                                         |

**Backend:** `services/api-gateway/` (Express v5.2, 14 routes, Fly.io ready) + `services/signaling-server/` (WebRTC, deployed Fly.io) + `supabase/` (17 migrations, us-east-2).
**Shared TS packages:** `packages/chat` (canonical chat component), `packages/api`, `packages/types`, `packages/runtime`, `packages/utils`.
**Active Rust crates:** 12 (down from 113 — see commit `ac59e09e`). Specifically: `agiworkforce-protocol`, `agiworkforce-sandbox-policy`, plus 10 transitive path-deps needed by protocol (`async-utils`, `execpolicy`, `network-proxy`, `utils-{absolute-path,cache,home-dir,image,rustls-provider,string,template}`).

## Pricing model (locked 2026-05-03)

| Tier       | Price              | At MVP        | What                                                                                 |
| ---------- | ------------------ | ------------- | ------------------------------------------------------------------------------------ |
| Local-only | Free forever       | YES           | Run Ollama/LMStudio on your laptop. No Supabase. Desktop only.                       |
| BYOK       | Free forever       | YES           | Bring your own keys to Anthropic/OpenAI/Google/etc. Optional Supabase if Cloud mode. |
| Hobby      | TBD ($5/mo target) | YES           | Managed cloud, limited credits, basic models. Only paid MVP tier.                    |
| Pro        | TBD                | NO (waitlist) | Released after security audit clears.                                                |
| Max        | TBD                | NO (waitlist) | Released after security audit clears.                                                |
| Enterprise | Contact sales      | Contact sales | SSO, SCIM, custom retention, audit log export, dedicated support.                    |

## Local vs Cloud mode (architecture)

- **Local mode** (Desktop only): SQLite, Ollama/LMStudio, no auth, no sync, no Dispatch.
- **Cloud mode** (Desktop + Web + Mobile): Supabase, BYOK or Hobby cloud, Realtime cross-device sync, OAuth, Dispatch.
- Mode picker: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`.
- Runtime detection: `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`).

## MVP plan (3 waves, parallel where possible)

| Wave       | Timeline   | What ships                                                                                              | Status      |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **Wave 0** | 2026-05-03 | Cleanup: -1.04M LOC, SSOT created, audit P0/P1 mostly closed                                            | ✅ SHIPPED  |
| **Wave 1** | 2026-05-03 | CLI v1.0 — Homebrew + install.sh + cargo + GitHub Release (5 platforms) live; npm pending NPM_TOKEN     | ✅ SHIPPED  |
| **Wave 2** | Weeks 2-5  | Desktop v1.0 — pixel-close Claude Desktop UI, Windows EV cert, web UnifiedAgenticChat done, IPC pruning | In progress |
| **Wave 3** | Weeks 6-9  | Mobile (App Store + Play) + Chrome ext (Web Store) + VS Code ext (Marketplace) + Hobby tier launch      | Pending     |

Active sprint plan: [docs/plans/sprint1-vault-rewire.md](docs/plans/sprint1-vault-rewire.md). Master remediation: [docs/plans/master-remediation.md](docs/plans/master-remediation.md). License: PROPRIETARY (see [LICENSE](LICENSE)).

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

## What shipped on 2026-05-03 (19 commits, -1.04M LOC net)

| Commit     | What                                             | Impact        |
| ---------- | ------------------------------------------------ | ------------- |
| `61ca9205` | Root-level debris cleanup                        | -89 LOC       |
| `ac59e09e` | Deleted 102 codex-rs port crates                 | **-995K LOC** |
| `9bed1b68` | SSOT structure (this file + docs/)               | +1.2K         |
| `c45422f8` | 10-phase CLI parity work + Cargo.lock regen      | +3.9K / -9.5K |
| `fe9162c9` | apps/cli/ARCHITECTURE.md                         | +569          |
| `be78874f` | dead_code reorg + 898/898 test fixes             | +60           |
| `699a2ccd` | Wave 1 prep: npm + Homebrew + CI + launch drafts | +1.2K         |
| `361a2522` | Wave 2/3 plans                                   | +353          |
| `5db614d2` | Desktop dir triage batch 1                       | -1.5K         |
| `5f7d21cc` | WEB-4 Stripe webhook fix                         | +22 / -3      |
| `76883138` | Web UnifiedAgenticChat deleted                   | **-36K**      |
| `a26bdaf8` | Desktop+web batch 2 (21 dirs)                    | -7.5K         |
| `61d9058d` | launch-readiness-check.sh                        | +147          |
| `b409fe55` | install.sh fixes                                 | +17 / -7      |
| `c0e0ae01` | release-cli.yml linux deps                       | +25           |
| `b71ce74d` | hooks.rs windows cfg(unix) fix                   | +3            |
| `a8650d61` | Drop linux-arm64 from matrix                     | +6 / -5       |
| `7df13513` | update-homebrew-tap.sh bash 3.2 compat           | +23 / -17     |
| `8d5c8758` | 28 dead store/hook/service/lib files             | **-9.4K**     |

**v-cli-1.0.0 LIVE**: Tag `v-cli-1.0.0` triggered release-cli.yml after 3 iterations. GitHub Release with 5 platform binaries published. Homebrew tap formula auto-generated and pushed to `siddharthanagula3/homebrew-tap`. install.sh tested. Run `./scripts/launch-readiness-check.sh` anytime to verify state.

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
