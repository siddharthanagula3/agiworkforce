# Scripts Reference

Complete reference guide for all pnpm scripts available in the AGI Workforce monorepo.

## Table of Contents

- [Root Scripts](#root-scripts)
- [Desktop App Scripts](#desktop-app-scripts)
- [Web App Scripts](#web-app-scripts)
- [API Gateway Scripts](#api-gateway-scripts)
- [Signaling Server Scripts](#signaling-server-scripts)
- [Workspace Filtering](#workspace-filtering)

## Root Scripts

Located in `/package.json`. These commands run from the repository root.

### Development

| Command            | Description                             | Usage                   |
| ------------------ | --------------------------------------- | ----------------------- |
| `pnpm dev:desktop` | Start desktop app in development mode   | Most common dev command |
| `pnpm dev:docs`    | Start documentation site (if available) | For docs development    |

**Example:**

```bash
# Start desktop development
pnpm dev:desktop

# The app will open automatically with hot reload enabled
# Vite dev server runs on port 5173 (or next available)
# Rust backend recompiles on changes
```

### Building

| Command              | Description                          | When to Use         |
| -------------------- | ------------------------------------ | ------------------- |
| `pnpm build`         | Build all non-desktop packages       | Before deployment   |
| `pnpm build:all`     | Same as `pnpm build`                 | Alias for clarity   |
| `pnpm build:desktop` | Build desktop app (DMG/EXE/AppImage) | Release builds only |
| `pnpm build:docs`    | Build documentation site             | Deploy docs         |

**Example:**

```bash
# Build everything except desktop
pnpm build

# Build desktop app for production
pnpm build:desktop
# Output: apps/desktop/src-tauri/target/release/bundle/
```

**Note:** Desktop builds take 5-15 minutes depending on platform.

### Code Quality

| Command             | Description                          | Pre-commit Use |
| ------------------- | ------------------------------------ | -------------- |
| `pnpm lint`         | Lint all TypeScript/JavaScript files | Manual check   |
| `pnpm lint:fix`     | Lint and auto-fix issues             | Before commit  |
| `pnpm format`       | Format all files with Prettier       | Before commit  |
| `pnpm format:check` | Check formatting without changes     | CI only        |

**Example:**

```bash
# Fix linting issues
pnpm lint:fix

# Format all files
pnpm format

# Check if files are formatted (CI)
pnpm format:check
```

**Lint Configuration:**

- Max warnings: 15 (enforced in CI)
- Auto-fixes common issues
- Integrates with Prettier

### Type Checking

| Command              | Description                     | Usage         |
| -------------------- | ------------------------------- | ------------- |
| `pnpm typecheck`     | Check types in desktop app only | Quick check   |
| `pnpm typecheck:all` | Check types in all packages     | Before commit |

**Example:**

```bash
# Check all packages for type errors
pnpm typecheck:all

# Should output: "0 errors" for all packages
```

### Testing

| Command     | Description                   | Usage |
| ----------- | ----------------------------- | ----- |
| `pnpm test` | Run all tests in all packages | CI/CD |

**Example:**

```bash
# Run all unit tests across monorepo
pnpm test

# This runs:
# - Desktop unit tests (Vitest)
# - Web unit tests (Vitest)
# - Service tests
```

### Cleanup

| Command            | Description                 | When to Use  |
| ------------------ | --------------------------- | ------------ |
| `pnpm clean:build` | Remove all dist directories | Build issues |
| `pnpm clean`       | Remove dist + node_modules  | Fresh start  |

**Example:**

```bash
# Clean build artifacts only
pnpm clean:build

# Full clean (requires reinstall after)
pnpm clean
pnpm install
```

### Setup

| Command        | Description               | Auto-runs          |
| -------------- | ------------------------- | ------------------ |
| `pnpm prepare` | Install Git hooks (Husky) | After pnpm install |

## Desktop App Scripts

Located in `/apps/desktop/package.json`. Run with `cd apps/desktop` or use filters.

### Development

| Command         | Description                | Port |
| --------------- | -------------------------- | ---- |
| `pnpm dev`      | Start Tauri dev mode       | 5173 |
| `pnpm dev:vite` | Start Vite dev server only | 5173 |
| `pnpm preview`  | Preview production build   | 4173 |

**Example:**

```bash
cd apps/desktop

# Start full development mode
pnpm dev

# Or just Vite dev server (no Tauri window)
pnpm dev:vite

# Preview production build
pnpm preview
```

### Building

| Command          | Description                      | Output                      |
| ---------------- | -------------------------------- | --------------------------- |
| `pnpm build`     | Build Vite + create Tauri bundle | `.dmg`, `.exe`, `.AppImage` |
| `pnpm build:web` | Build Vite frontend only         | `dist/`                     |

**Example:**

```bash
# Build for current platform
pnpm build

# Output locations:
# macOS: src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/msi/
# Linux: src-tauri/target/release/bundle/appimage/
```

### Tauri Commands

| Command            | Description                 | Usage              |
| ------------------ | --------------------------- | ------------------ |
| `pnpm tauri dev`   | Start Tauri dev mode        | Same as `pnpm dev` |
| `pnpm tauri build` | Build Tauri app             | Production builds  |
| `pnpm tauri info`  | Show Tauri environment info | Debugging          |

**Example:**

```bash
# Check Tauri environment
pnpm tauri info

# Output: OS, Rust version, dependencies, etc.
```

### Testing

| Command              | Description              | Coverage                   |
| -------------------- | ------------------------ | -------------------------- |
| `pnpm test`          | Run unit tests           | All `*.test.ts(x)` files   |
| `pnpm test:ui`       | Run tests with UI        | Interactive mode           |
| `pnpm test:coverage` | Generate coverage report | HTML report in `coverage/` |
| `pnpm test:e2e`      | Run Playwright E2E tests | All `e2e/*.spec.ts`        |
| `pnpm test:e2e:ui`   | E2E tests with UI        | Best for debugging         |
| `pnpm test:smoke`    | Run smoke tests only     | Quick sanity check         |

**Example:**

```bash
# Run unit tests
pnpm test

# Watch mode (re-run on changes)
pnpm test -- --watch

# Run with coverage
pnpm test:coverage
open coverage/index.html

# E2E tests with UI
pnpm test:e2e:ui

# Specific E2E project
pnpm test:e2e -- --project=chat
pnpm test:e2e -- --project=automation
```

### Code Quality

| Command          | Description            | Usage            |
| ---------------- | ---------------------- | ---------------- |
| `pnpm lint`      | Lint TypeScript files  | Check for errors |
| `pnpm lint:fix`  | Fix linting issues     | Before commit    |
| `pnpm typecheck` | Check TypeScript types | Quick type check |

**Example:**

```bash
# Fix linting issues
pnpm lint:fix

# Type check
pnpm typecheck
```

## Web App Scripts

Located in `/apps/web/package.json`. Run with `cd apps/web` or use filters.

### Development

| Command      | Description              | Port |
| ------------ | ------------------------ | ---- |
| `pnpm dev`   | Start Next.js dev server | 3000 |
| `pnpm start` | Start production server  | 3000 |

**Example:**

```bash
cd apps/web

# Development mode
pnpm dev

# Visit http://localhost:3000
```

### Building

| Command      | Description       | Output   |
| ------------ | ----------------- | -------- |
| `pnpm build` | Build Next.js app | `.next/` |

**Example:**

```bash
# Build for production
pnpm build

# Then start production server
pnpm start
```

### Testing

| Command              | Description         | Coverage    |
| -------------------- | ------------------- | ----------- |
| `pnpm test`          | Run unit tests      | Vitest      |
| `pnpm test:ui`       | Interactive test UI | Debug tests |
| `pnpm test:coverage` | Coverage report     | `coverage/` |
| `pnpm test:e2e`      | Run E2E tests       | Playwright  |
| `pnpm test:e2e:ui`   | E2E with UI         | Debug E2E   |

**Example:**

```bash
# Run unit tests
pnpm test

# Specific test file
pnpm vitest run __tests__/api/checkout.test.ts

# E2E tests
pnpm test:e2e
```

### Code Quality

| Command          | Description              | Usage        |
| ---------------- | ------------------------ | ------------ |
| `pnpm lint`      | Lint with Next.js ESLint | Check errors |
| `pnpm typecheck` | Type check TypeScript    | Verify types |

**Example:**

```bash
# Lint Next.js app
pnpm lint

# Type check
pnpm typecheck
```

## API Gateway Scripts

Located in `/services/api-gateway/package.json`.

### Development

| Command      | Description             | Port |
| ------------ | ----------------------- | ---- |
| `pnpm dev`   | Start with tsx watch    | 3000 |
| `pnpm start` | Start production server | 3000 |

**Example:**

```bash
cd services/api-gateway

# Development with auto-reload
pnpm dev

# Production mode
pnpm build && pnpm start
```

### Building

| Command      | Description        | Output  |
| ------------ | ------------------ | ------- |
| `pnpm build` | Compile TypeScript | `dist/` |

**Example:**

```bash
# Build
pnpm build

# Output: dist/index.js
```

### Testing

| Command     | Description        | Coverage           |
| ----------- | ------------------ | ------------------ |
| `pnpm test` | Run tests (Vitest) | If tests exist     |
| `pnpm lint` | Lint TypeScript    | Check code quality |

## Signaling Server Scripts

Located in `/services/signaling-server/package.json`.

### Development

| Command      | Description             | Port |
| ------------ | ----------------------- | ---- |
| `pnpm dev`   | Start with tsx watch    | 4000 |
| `pnpm start` | Start production server | 4000 |

**Example:**

```bash
cd services/signaling-server

# Development mode
pnpm dev

# WebSocket server runs on ws://localhost:4000
```

### Building

| Command      | Description        | Output  |
| ------------ | ------------------ | ------- |
| `pnpm build` | Compile TypeScript | `dist/` |

## Workspace Filtering

Use `--filter` to run commands in specific workspaces from the root.

### Basic Filtering

```bash
# Run command in specific package
pnpm --filter @agiworkforce/desktop dev
pnpm --filter @agiworkforce/web build
pnpm --filter @agiworkforce/api-gateway test

# Run in multiple packages
pnpm --filter "@agiworkforce/desktop" --filter "@agiworkforce/web" test
```

### Pattern Filtering

```bash
# All packages in apps/
pnpm --filter "./apps/*" build

# All services
pnpm --filter "./services/*" build

# All packages (recursive)
pnpm -r test
```

### Examples

```bash
# Start desktop from root
pnpm --filter @agiworkforce/desktop dev

# Build web from root
pnpm --filter @agiworkforce/web build

# Test all apps
pnpm --filter "./apps/*" test

# Lint everything
pnpm -r lint
```

## Common Workflows

### Full Development Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Type check everything
pnpm typecheck:all

# 3. Start desktop app
pnpm dev:desktop

# 4. In another terminal, start web app
cd apps/web && pnpm dev

# 5. In another terminal, start API gateway
pnpm --filter @agiworkforce/api-gateway dev
```

### Pre-commit Workflow

```bash
# 1. Lint and fix
pnpm lint:fix

# 2. Format code
pnpm format

# 3. Type check
pnpm typecheck:all

# 4. Run tests
pnpm test

# 5. Commit
git add .
git commit -m "feat: add new feature"
```

### Build for Production

```bash
# 1. Clean previous builds
pnpm clean:build

# 2. Install fresh dependencies
pnpm install --frozen-lockfile

# 3. Type check
pnpm typecheck:all

# 4. Run tests
pnpm test

# 5. Build web and services
pnpm build

# 6. Build desktop (separate step)
pnpm build:desktop
```

### Debugging Workflow

```bash
# 1. Start desktop with verbose logging
cd apps/desktop
VITE_LOG_LEVEL=debug pnpm dev

# 2. Run specific test with UI
pnpm test:ui

# 3. Run E2E test with debugging
pnpm test:e2e -- --debug

# 4. Check environment
pnpm tauri info
```

### Fresh Start Workflow

```bash
# 1. Stop all dev servers
# Ctrl+C in all terminals

# 2. Clean everything
pnpm clean

# 3. Reinstall dependencies
pnpm install

# 4. Rebuild
pnpm build

# 5. Type check
pnpm typecheck:all

# 6. Start fresh
pnpm dev:desktop
```

## Environment Variables

Some scripts can be customized with environment variables:

### Development

```bash
# Custom dev port
VITE_DEV_PORT=5174 pnpm dev:desktop

# Custom Next.js port
PORT=3001 pnpm --filter @agiworkforce/web dev

# Debug mode
TAURI_DEBUG=1 pnpm dev:desktop

# Verbose logging
VITE_LOG_LEVEL=debug pnpm dev:desktop
```

### Building

```bash
# Production build
NODE_ENV=production pnpm build

# Debug build (with source maps)
TAURI_DEBUG=1 pnpm build:desktop
```

### Testing

```bash
# CI mode (with retries)
CI=1 pnpm test:e2e

# Coverage threshold
COVERAGE_THRESHOLD=80 pnpm test:coverage
```

## Performance Tips

### Faster Development

```bash
# Skip type checking in Vite (faster startup)
cd apps/desktop
pnpm dev:vite

# Use turbo cache
pnpm install --frozen-lockfile

# Parallel test runs
pnpm test -- --threads
```

### Faster Builds

```bash
# Skip unused workspaces
pnpm build --filter="!@agiworkforce/docs"

# Use Rust release profile
cd apps/desktop/src-tauri
cargo build --release
```

### Faster Type Checking

```bash
# Type check only desktop
cd apps/desktop && pnpm typecheck

# Incremental mode (default)
pnpm typecheck:all
```

## Troubleshooting

### Scripts Not Found

```bash
# Ensure you're in the right directory
pwd

# Or use --filter from root
pnpm --filter @agiworkforce/desktop dev
```

### Permission Denied

```bash
# Fix Husky hooks
chmod +x .husky/*

# Fix scripts
chmod +x scripts/*
```

### Port Already in Use

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
VITE_DEV_PORT=5174 pnpm dev:desktop
```

### Build Failures

```bash
# Clean and rebuild
pnpm clean:build
pnpm install
pnpm build
```

## Quick Reference

### Most Used Commands

```bash
pnpm dev:desktop          # Start desktop development
pnpm test                 # Run all tests
pnpm lint:fix             # Fix linting issues
pnpm format               # Format code
pnpm typecheck:all        # Type check everything
pnpm build                # Build all packages
pnpm clean:build          # Clean build artifacts
```

### Desktop Specific

```bash
pnpm test:e2e:ui          # E2E tests with UI
pnpm test:coverage        # Coverage report
pnpm build:desktop        # Build app bundle
```

### Web Specific

```bash
cd apps/web && pnpm dev   # Start Next.js
cd apps/web && pnpm test  # Run web tests
```

### Workspace Commands

```bash
pnpm -r <command>                    # Run in all workspaces
pnpm --filter @agiworkforce/desktop <command>  # Specific workspace
pnpm --filter "./apps/*" <command>   # Pattern filter
```
