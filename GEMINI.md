# GEMINI.md - Project Context: agiworkforce

## Project Overview

`agiworkforce` is a comprehensive monorepo for the AGI Workforce platform, featuring a cross-platform desktop application, a web application, and supporting backend services. The platform focuses on AGI automation, workforce management, and agentic workflows.

### Core Architecture

- **Desktop Application (`apps/desktop`)**: A high-performance Tauri-based desktop shell using React for the UI and Rust for the system-level backend.
- **Web Application (`apps/web`)**: A Next.js-based web platform for management and services.
- **Backend Services (`services/`)**:
  - `api-gateway`: Express-based gateway for mobile companion and API routing.
  - `signaling-server`: WebSocket-based signaling server for P2P/WebRTC communication.
- **Shared Packages (`packages/`)**:
  - `types`: Shared TypeScript type definitions.
  - `utils`: Shared utility functions.

## Key Technologies

- **Monorepo Management**: [pnpm](https://pnpm.io/)
- **Desktop Shell**: [Tauri v2](https://tauri.app/) (Rust + React + Vite)
- **Frontend**: [React](https://react.dev/) (v18 for Desktop, v19 for Web), [Tailwind CSS](https://tailwindcss.com/)
- **Web Framework**: [Next.js](https://nextjs.org/)
- **Backend (Services)**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), [TypeScript](https://www.typescriptlang.org/)
- **Rust Backend Capabilities**:
  - **Database**: SQLite, Postgres, MongoDB, Redis, MySQL.
  - **Automation**: Screen capture (`xcap`), Input emulation (`enigo`), PTY/Terminal.
  - **AI/LLM**: MCP (Model Context Protocol), local LLM support (`llama-cpp-2`), OCR (`tesseract`).
  - **Networking**: WebRTC, WebSockets, OAuth2.
- **Database/Storage**: [Supabase](https://supabase.com/) (Web), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) (Desktop).
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) (E2E).

## Building and Running

### Prerequisites

- Node.js (>=20.11.0 <23)
- pnpm (>=9.15.0 <11)
- Rust toolchain (configured via `rust-toolchain.toml`)
- Tauri dependencies (see [Tauri docs](https://tauri.app/v1/guides/getting-started/prerequisites/))

### Common Commands

- **Install Dependencies**: `pnpm install`
- **Development (Desktop)**: `pnpm dev:desktop` (Runs `tauri dev`)
- **Development (Web)**: `cd apps/web && pnpm dev`
- **Build Desktop**: `pnpm build:desktop`
- **Linting**: `pnpm lint` (Runs ESLint)
- **Formatting**: `pnpm format` (Runs Prettier)
- **Type Checking**: `pnpm typecheck:all`
- **Testing**:
  - Run all tests: `pnpm test`
  - E2E Tests (Desktop): `cd apps/desktop && pnpm test:e2e`

## Development Conventions

- **Code Style**: enforced via ESLint and Prettier. Follow existing patterns in the codebase.
- **Git Hooks**: [Husky](https://typicode.github.io/husky/) is used for pre-commit (lint-staged) and commit-msg (commitlint) hooks.
- **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).
- **Rust Linting**: Strict linting policy in `apps/desktop/src-tauri/Cargo.toml` (`warnings = "warn"`, `unused = "deny"`).
- **Architecture**:
  - Desktop UI uses Radix UI and Tailwind for components.
  - State management in React primarily uses [Zustand](https://github.com/pmndrs/zustand).
  - Rust backend uses `tokio` for async operations and `anyhow` for error handling.

## Directory Structure Highlights

- `.github/workflows/`: CI/CD pipelines (CI, Release).
- `apps/desktop/src-tauri/`: Rust backend logic for the desktop app.
- `apps/desktop/src/`: React frontend for the desktop app.
- `apps/web/app/`: Next.js App Router structure.
- `packages/`: Workspace packages shared across apps and services.
- `dev-scripts/`: Utility scripts for environment setup and resets.

## Recent Progress (December 2025)

### Key Milestones

- **Architecture Refactor**: Standardized React component folders to PascalCase (e.g., `realtime` -> `Realtime`) and promoted `future_scope` features (`Marketplace`, `ROIDashboard`) to first-class components.

- **Browser Automation**: Implemented full-stack browser automation capabilities, including backend proxy/profile management and frontend control APIs.

- **Backend Stability**: Resolved critical issues with mutex panics in automation, removed unsafe unwraps in git modules, and fixed AGI orchestrator result extraction.

- **AI Enhancements**: Integrated RAG support for PDF/DOCX extraction and implemented `WalkDir`-based project analysis for better AI context.

- **Security**: Hardened file operations with permission checks and size limits for shell helper commands.

- **Desktop UI/UX**: Enhanced authentication flows, added privacy/legal pages, and improved desktop stability with randomized test environments.

- **Subscription & Billing**: Integrated subscription-related components and navigation logic for the desktop app.

### Current Focus

- Refactoring `chat.rs` commands and enhancing the Ollama provider implementation.
- Finalizing the subscription lock mechanism and usage dashboard analytics.
- Improving SSE parsing for more robust agent communication.
