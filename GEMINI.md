# GEMINI.md: AGI Workforce

This document provides a comprehensive overview of the AGI Workforce project, its structure, and development workflows. It is intended to be used as a primary context file for AI-assisted development.

## Project Overview

AGI Workforce is a developer-preview desktop application that provides an agentic workspace for interacting with Large Language Models (LLMs). It is built as a monorepo containing several components, with the main focus on the desktop application.

The core application is a Tauri-based desktop app, which combines a Rust backend with a React/TypeScript frontend. This architecture allows for powerful native capabilities (like file system access and shell commands) controlled by a modern web-based UI.

The project emphasizes safety through a tool approval system, where "dangerous" operations require user consent. It supports multiple LLM providers (OpenAI, Anthropic, Google, Ollama) and is highly configurable.

### Key Technologies

- **Desktop Framework:** [Tauri](https://tauri.app/) (Rust backend, webview frontend)
- **Frontend:** [React](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend (Rust):** [Tokio](https://tokio.rs/) for async runtime, [Serde](https://serde.rs/) for serialization, and numerous other crates for specific functionalities (see `apps/desktop/src-tauri/Cargo.toml`).
- **Package Management:** [pnpm workspaces](https://pnpm.io/workspaces)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Testing:** [Vitest](https://vitest.dev/) for frontend unit/integration tests, [Playwright](https://playwright.dev/) for End-to-End tests, and `cargo test` for Rust tests.
- **CI/CD:** GitHub Actions

### Repository Structure

The project is a monorepo organized using pnpm workspaces.

```
/
├── apps/
│   ├── desktop/              # Main Tauri desktop application
│   │   ├── src/              # React frontend source
│   │   └── src-tauri/        # Rust backend source
│   ├── extension/            # Minimal browser extension scaffold
│   └── _future_mobile/       # Placeholder for a future mobile app
├── packages/
│   ├── types/                # Shared TypeScript types for the monorepo
│   └── utils/                # Shared utility functions
├── services/
│   ├── api-gateway/          # Experimental backend services
│   └── signaling-server/
└── ... (config files, docs, etc.)
```

## Building and Running

### Prerequisites

- Node.js (version specified in `package.json` `engines` field)
- pnpm (version specified in `package.json` `engines` field)
- Rust toolchain (version specified in `rust-toolchain.toml`)
- Platform-specific build tools (see `INSTALLATION.md`)

### Development

To run the desktop application in a live-reloading development environment:

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```
2.  **Run the development server:**
    ```bash
    pnpm dev:desktop
    ```

### Building

To build the application for production:

1.  **Build the desktop app:**
    ```bash
    pnpm build:desktop
    ```
    The output artifacts will be located in `apps/desktop/src-tauri/target/release`.

## Testing

The project has a comprehensive testing strategy.

- **Run all tests:**
  ```bash
  pnpm test
  ```
- **Linting:**
  ```bash
  pnpm lint
  ```
- **TypeScript Type Checking:**
  ```bash
  pnpm typecheck
  ```
- **Frontend Unit/Integration Tests (Vitest):**
  ```bash
  pnpm --filter @agiworkforce/desktop test
  ```
- **End-to-End Tests (Playwright):**
  ```bash
  pnpm --filter @agiworkforce/desktop test:e2e
  ```
- **Rust Tests:**
  ```bash
  cd apps/desktop/src-tauri
  cargo test
  ```

## Development Conventions

### Commits and Pull Requests

- **Commit Messages:** The project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. This is enforced by `commitlint`.
  - Examples: `feat(chat): add new feature`, `fix(ui): correct a styling bug`.
- **Branching:** Feature branches should be named according to their purpose (e.g., `feature/new-sidebar`, `fix/login-bug`).
- **Pull Requests:** A PR template is provided to ensure all necessary information is included. All CI checks (linting, testing, building) must pass before a PR can be merged.

### Coding Style

- **Formatting:** Code is automatically formatted using [Prettier](https://prettier.io/). A pre-commit hook is set up via `husky` and `lint-staged` to enforce this.
- **Linting:** [ESLint](https://eslint.org/) is used for the TypeScript/React codebase, and `clippy` is used for the Rust codebase.
- **State Management:** Global state is managed with Zustand. Component-local state should use React's built-in hooks (`useState`, `useReducer`).

### Configuration

- API keys and other secrets are managed via a `.env` file in the `apps/desktop` directory. Copy `.env.example` to `.env` to get started.
- The application can be configured to use different LLM providers and custom servers.
