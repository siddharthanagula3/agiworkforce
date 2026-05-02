# AGI Workforce

Multi-provider, local-first agentic workspace. One Tauri desktop app, one Next.js web mirror, one Expo mobile companion, one Rust CLI, plus VS Code and Chrome extensions — all wired into the same chat layer with 24+ LLM providers, MCP, browser automation, and computer-use.

> **Status:** active development. The remediation plan at `~/.claude/plans/make-a-plan-to-purrfect-papert.md` is the single source of truth for what's blocking the next release. CI on `main` should always be green; if it isn't, that's the highest-priority bug.

## Repository layout

```
apps/
  desktop/        Tauri v2 + Vite + React (apps/desktop/src-tauri is the Rust backend)
  web/            Next.js mirror at agiworkforce.com/chat (Vite SPA bundled into /public/chat)
  mobile/         Expo / React Native companion
  cli/            agiworkforce CLI + ratatui TUI
  extension/      Chrome extension (manifest v3)
  extension-vscode/  VS Code extension

crates/           ~115 Rust crates ported from codex-rs (most are workspace dead-weight today;
                  Sprint 5 of the remediation plan prunes the unused ones)

packages/         Shared TS packages (api, chat, runtime, types, utils)
services/         Node services (api-gateway, signaling-server)
supabase/         Supabase migrations (us-east-2 region)
```

See [BUILD.md](./BUILD.md) for prerequisites and build commands, and [CONTRIBUTING.md](./CONTRIBUTING.md) for the PR + branch-protection conventions.

## Quick start

```bash
# 1. Install Node 22 + pnpm 9.15.3 + Rust 1.94.0 (see BUILD.md for OS-specific deps)
nvm use            # respects .nvmrc → Node 22
corepack enable    # enables pnpm via packageManager
pnpm install

# 2. Run the desktop app in dev mode
pnpm dev:desktop

# 3. Or run the CLI
cargo run -p agiworkforce-cli -- exec "Hello, world"
```

## Documentation

- [BUILD.md](./BUILD.md) — prerequisites, build commands, signing requirements per platform
- [CONTRIBUTING.md](./CONTRIBUTING.md) — PR conventions, branch protection, commit format, code review
- [AUDIT_REPORT.md](./AUDIT_REPORT.md) — codebase-health audit (2026-05-01)
- [FIX_QUEUE.md](./FIX_QUEUE.md) — queue of remediation fixes (FIX-001 .. FIX-047)

## License

PROPRIETARY. See [LICENSE](./LICENSE) for terms.
