# Gemini Project: AGI Workforce

## Project Overview

This project is a desktop automation platform called AGI Workforce. It's built with Tauri, Rust, React, and TypeScript, and is designed to combine AI language models with system automation tools. The user can interact with the platform via a chat interface, describing tasks in a natural language.

The project is structured as a monorepo using pnpm workspaces, with the following key components:

- **`apps/desktop`**: The main Tauri application, with a React frontend and a Rust backend.
- **`apps/extension`**: A browser extension.
- **`apps/mobile`**: A mobile application.
- **`packages`**: Shared packages for types, UI components, and utils.
- **`services`**: API gateway and other services.

### Key Technologies

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Zustand
- **Backend**: Rust, Tauri, Tokio, Serde
- **Database**: SQLite, PostgreSQL, MySQL, MongoDB, Redis
- **Automation**: Playwright, Windows UI Automation
- **AI**: Integration with multiple LLM providers (OpenAI, Anthropic, Google, Ollama)

## Building and Running

### Prerequisites

- Node.js >= 20.11.0
- pnpm >= 9.15.0
- Rust >= 1.90

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Development

To run the desktop application in development mode:

```bash
pnpm --filter @agiworkforce/desktop dev
```

### Building

To build the desktop application for production:

```bash
pnpm --filter @agiworkforce/desktop build
```

The executable will be located at `apps/desktop/src-tauri/target/release/agiworkforce-desktop.exe`.

### Testing

- Run all tests:
  ```bash
  pnpm test
  ```
- Run Rust tests:
  ```bash
  cd apps/desktop/src-tauri && cargo test
  ```
- Run frontend tests with UI:
  ```bash
  pnpm --filter @agiworkforce/desktop test:ui
  ```

## Development Conventions

- **Linting**: ESLint and Prettier are used for code formatting and linting.
- **Type Checking**: TypeScript is used for static type checking.
- **Commits**: Conventional Commits are enforced using `commitlint`.
- **Branching**: The development workflow is based on feature branches.
- **Testing**: The project has a combination of unit, integration, and end-to-end tests. Vitest is used for frontend testing and `cargo test` for backend testing.
- **State Management**: Zustand is used for state management in the React application.
- **UI Components**: Radix UI is used for building accessible UI components.
- **Styling**: Tailwind CSS is used for styling.
- **Error Handling**: The project has a comprehensive error handling system, including error boundaries, a global error store, and integration with Sentry for error reporting.
