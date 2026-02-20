# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is a monorepo containing a desktop automation application (Tauri + React + Rust), a web frontend (Next.js), browser extension, and backend services. The project uses pnpm workspaces and spans multiple technologies.

## Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:desktop          # Run desktop app in dev mode
pnpm dev:docs            # Run documentation site

# Building
pnpm build               # Build all packages (excludes desktop)
pnpm build:all          # Build web and packages
pnpm build:desktop      # Build desktop app (includes Tauri build)
pnpm build:web          # Build web app only

# Testing
pnpm test                # Run all tests
pnpm test -r            # Run tests recursively across packages
pnpm test:e2e           # Run Playwright e2e tests
pnpm test:ui            # Run tests with UI (vitest --ui)

# Linting & Formatting
pnpm lint                # Run ESLint
pnpm lint:fix           # Fix lint issues
pnpm format             # Format with Prettier
pnpm format:check       # Check formatting

# Type Checking
pnpm typecheck          # Type check desktop app
pnpm typecheck:all      # Type check all packages
```

## Architecture

### Apps

- **desktop** (`apps/desktop`): Tauri 2.x desktop app with React 19, Vite, and Rust backend. Features include terminal emulation (xterm.js), Monaco code editor, browser automation, AI agent execution, and system integration (clipboard, notifications, file system).

- **web** (`apps/web`): Next.js 16 web application using App Router. Authentication via Supabase, Stripe payments, rate limiting with Upstash Redis.

- **extension** (`apps/extension`): Browser extension (not fully built out).

### Packages

- **types** (`packages/types`): Shared TypeScript type definitions
- **utils** (`packages/utils`): Shared utility functions

### Services

- **api-gateway** (`services/api-gateway`): Node.js/TypeScript API gateway
- **signaling-server** (`services/signaling-server`): WebRTC signaling server

### Backend

The Rust backend (`apps/desktop/src-tauri`) includes:
- Database: PostgreSQL (via tokio-postgres), SQLite (rusqlite), MongoDB, MySQL
- Cache: Redis
- File processing: PDF extraction, document parsing (docx, xlsx)
- Automation: UI automation via enigo, clipboard, screenshot capture
- AI: Local LLM support (llama.cpp), Whisper STT, VAD
- Email: IMAP/SMTP support
- MCP: Model Context Protocol server (rmcp crate)

## Database

Supabase (PostgreSQL) is used for the main database with migrations in `supabase/migrations`.

## Tech Stack

- **Frontend**: React 19, Next.js 16, Tailwind CSS 4, Radix UI, Zustand, Monaco Editor, xterm.js
- **Desktop**: Tauri 2.x, Vite 7, Rust
- **Backend**: Rust (Tauri), Node.js services
- **Database**: PostgreSQL (Supabase), SQLite, MongoDB, Redis
- **Testing**: Vitest, Playwright, MSW
