# AGI Workforce Project Context

## Project Overview
AGI Workforce is a comprehensive, model-agnostic AI desktop platform designed as a monorepo. It empowers users to connect any Large Language Model (LLM)—from 9+ cloud providers to locally hosted models (Ollama, LM Studio)—and deploy them as autonomous agents with full desktop control.

### Key Components
- **Desktop App (`apps/desktop`):** The flagship product built with **Tauri v2**, **Rust**, and **React 19**. It features full desktop autonomy, including file system access, terminal control, browser automation (CDP), and vision-based "computer use."
- **Web App (`apps/web`):** A **Next.js 16** application (App Router) handling marketing, authentication (Supabase), billing (Stripe), and a collaborative multi-agent workspace called **VIBE IDE**.
- **Mobile App (`apps/mobile`):** A **React Native (Expo)** companion app for real-time agent monitoring and WebRTC-based command approval.
- **Browser Extension (`apps/extension`):** Chrome MV3 extension for DOM automation, job autofill, and native messaging bridge.
- **VS Code Extension (`apps/extension-vscode`):** Integrates AGI agents directly into the editor with LSP support and multi-file editing.
- **Shared Packages:** `@agiworkforce/types` and `@agiworkforce/utils` ensure consistency across all surfaces.

## Building and Running

### Prerequisites
- **Node.js:** v22 (managed via `.nvmrc`)
- **Package Manager:** `pnpm` >= v9.15.0
- **Rust:** v1.90.0 toolchain
- **Dependencies:** `libclang` (required for SQLCipher; `brew install llvm` on macOS)

### Key Commands
- `pnpm install`: Install all workspace dependencies.
- `pnpm dev`: Start the desktop development environment (Tauri dev).
- `pnpm build`: Build the frontend applications.
- `pnpm tauri build`: Generate production installers for the desktop app.
- `pnpm typecheck`: Run TypeScript type checking across the monorepo.
- `pnpm lint`: Execute ESLint and Rust Clippy checks.
- `pnpm format`: Format the codebase using Prettier.
- `cargo test`: Run Rust unit and integration tests.

## Development Conventions

- **Commit Strategy:** Strictly follows **Conventional Commits** (`type(scope): lowercase subject`). Common types: `feat`, `fix`, `chore`, `docs`, `refactor`.
- **TypeScript:** Strict mode enabled. Prefer functional components, named exports, and absolute imports from `src/`.
- **Rust:** High safety standards. `unsafe_code`, `dead_code`, and `unused` imports are denied at the crate level.
- **Security:** All sensitive data (API keys, secrets) must be managed via the `SecretManager` (Argon2id + AES-GCM). Never store secrets in plaintext or commit `.env` files.
- **IPC:** Tauri `invoke()` calls from TypeScript must use **camelCase** parameter keys.
- **Architecture:** Follows a **local-first** philosophy. The desktop app is fully functional offline when using local models.

## Core Architecture

### Rust Backend (`apps/desktop/src-tauri/src/`)
- **`core/llm/`:** The routing engine (`llm_router.rs`) supporting 11+ providers and SSE streaming.
- **`core/agent/`:** Runtime for autonomous agents, planners, and executors.
- **`core/agi/`:** High-level orchestration, including swarms and domain-specific executors.
- **`core/mcp/`:** Model Context Protocol implementation (stdio, SSE, HTTP).
- **`security/`:** `ToolGuard` sandboxing (1,778-line validator) and secret management.
- **`automation/`:** Screen capture, input simulation, and vision-guided automation.

### Frontend Framework (`apps/desktop/src/`)
- **UI:** React 19 + Tailwind CSS 4 + Radix UI.
- **State:** 55+ **Zustand** stores utilizing Immer and Persist middleware.
- **Events:** `useAgenticEvents.ts` serves as the central hub for Tauri event consumption.

## Important Documentation
- `CLAUDE.md`: Primary development guide, build instructions, and architecture deep-dive.
- `docs/PRD.md`: Comprehensive Product Requirements Document.
- `docs/MASTER_PLAN.md`: Current implementation status and roadmap (verified ship-ready as of March 2026).
- `AGENTS.md`: Configuration and rules for specialized AI agents within the project.
