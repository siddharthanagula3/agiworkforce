# AGI Workforce Monorepo

AGI Workforce is a comprehensive ecosystem for AI-driven workforce automation, featuring a desktop application, a web dashboard, browser extensions, and backend microservices.

## Project Structure

This is a **pnpm monorepo** with the following components:

### Applications (`apps/`)
- **`apps/desktop`**: The main desktop application built with **Tauri v2** (Rust) and **React** (TypeScript). Uses **Tailwind CSS v4** for styling and **Vite** as the build tool.
- **`apps/web`**: A web-based dashboard built with **Next.js** and **React**. Integrates with **Supabase** for authentication and data storage.
- **`apps/extension`**: A browser extension for cross-platform agent capabilities.

### Services (`services/`)
- **`services/api-gateway`**: An **Express**-based gateway serving as the primary entry point for mobile and external client integrations.
- **`services/signaling-server`**: A **WebSocket** server for real-time signaling and P2P communication, built with Express and `ws`.

### Packages (`packages/`)
- **`packages/types`**: Shared TypeScript type definitions across all applications and services.
- **`packages/utils`**: Shared utility functions and common logic.

### Infrastructure & Others
- **`supabase/`**: Database schema, migrations, and Supabase configuration.
- **`.minimax/`**: Specialized AI agent skills (e.g., PDF/Docx processing, browser automation).
- **`docs/`**: API specifications (OpenAPI), architecture diagrams, and guides.

## Key Technologies

- **Frontend**: React (v19), Next.js (v16), Tailwind CSS (v4), Radix UI, Zustand (state management), Lucide (icons).
- **Desktop**: Tauri (v2), Rust.
- **Backend**: Node.js (v22+), Express, WebSockets, Supabase.
- **Database**: PostgreSQL (via Supabase).
- **Testing**: Vitest (unit/integration), Playwright (E2E).
- **Tooling**: pnpm, ESLint, Prettier, Husky, lint-staged, TypeScript.

## Building and Running

### Prerequisites
- Node.js >= 22.12.0
- pnpm >= 9.15.0
- Rust (for desktop app)

### Root Commands
```bash
pnpm install          # Install dependencies
pnpm build            # Build all projects (except desktop)
pnpm build:desktop    # Build the desktop app
pnpm test             # Run all tests
pnpm lint             # Run linter
pnpm format           # Run formatter
```

### Component Commands
- **Desktop App**: `cd apps/desktop && pnpm dev`
- **Web App**: `cd apps/web && pnpm dev`
- **API Gateway**: `cd services/api-gateway && pnpm dev`
- **Signaling Server**: `cd services/signaling-server && pnpm dev`

## Development Conventions

- **Monorepo Management**: Always use `pnpm` for adding dependencies and running scripts.
- **Type Safety**: Prefer strict TypeScript. Shared types should reside in `packages/types`.
- **Styling**: Use Tailwind CSS v4. Avoid inline styles where possible.
- **Testing**: Fixes and new features must include tests (Vitest for logic, Playwright for critical UI paths).
- **Environment Variables**: Use `.env` files locally. Look for `.env.example` in each sub-directory for required keys.
- **Git Hooks**: Husky is used for pre-commit linting and commit message validation (conventional commits).
