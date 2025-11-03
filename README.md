# AGI Workforce Monorepo

Project codename: agiworkforce

This repository hosts the desktop app (Tauri + React), mobile companion, browser extension, shared packages, and backend services. Phase 1 established the project foundation and development environment per the PRD and Development Plan.

## Prerequisites
- Node.js 20 LTS
- pnpm 8.x (`npm i -g pnpm@8`)
- Rust (stable) + rustup (nightly toolchain may be required later)
- Windows 11 with WebView2 runtime (desktop target)
- Git with LF line endings preferred

## Setup
- Install dependencies: `pnpm install`
- Initialize Git hooks (runs automatically via the `prepare` script)
- Validate setup:
  - Lint: `pnpm lint`
  - Format check: `pnpm format:check`
  - Type check: `pnpm typecheck`

## Workspace Layout
- `apps/` - desktop, mobile, extension
- `packages/` - shared TypeScript libs (`@utils`, `@types`)
- `services/` - backend / servers
- `infrastructure/` - docker and related config

## Documents
- Product Requirements: `AGI_Workforce_PRD_v4_0.md` (supersedes v3.x; older versions are under `_ARCHIVE/`)
- Complete Development Plan: `AGI_Workforce_Complete_Development_Plan.md`

Phase 1 delivered repository initialization, monorepo workspaces, TypeScript base config, build tooling (Vite), and code quality (ESLint, Prettier, Husky, lint-staged, Commitlint).

Phase 2 introduces the Tauri desktop shell: window persistence, docking, system tray controls, keyboard shortcuts, and a custom React title bar that bridges to the Rust command layer via `@tauri-apps/api`.

### Desktop Shell Controls
- Pin or unpin from the title bar or context menu to keep the window visible when it loses focus.
- Docking shortcuts: `Ctrl+Alt+Left/Right` snap to screen edges, `Ctrl+Alt+Up/Down` undock.
- The system tray menu mirrors the window controls (pin, always-on-top, docking, show/hide).
