# Contributing to AGI Workforce

Thank you for your interest in contributing to AGI Workforce! This document outlines our development workflow, code quality standards, and the process for submitting contributions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Testing](#testing)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Build Verification](#build-verification)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you start contributing, ensure you have the required tools installed and the correct versions. Version pinning is critical for reproducible builds across the team.

### Node.js 22.x

AGI Workforce requires Node.js 20.11.0 or higher (compatible with v20.x and v22.x):

**Windows:**

- Download from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
- Verify: `node --version` should output `v20.11.0+` or `v22.x.x`

**macOS:**

- Install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`
- Or use Homebrew: `brew install node@22`

**Linux:**

- Install via [nvm](https://github.com/nvm-sh/nvm) or your package manager
- Ensure you have v20.11.0 or higher

### pnpm 9.x

This monorepo uses pnpm for workspace management. Version 9.x is required:

```bash
npm install -g pnpm@9.x.x
```

Verify: `pnpm --version` should output `9.x.x`

### Rust 1.90.0

The Tauri backend requires Rust 1.90.0. Version pinning is configured in `rust-toolchain.toml`, and rustup will automatically use the correct version:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify: `rustc --version` should output `rustc 1.90.0`

### Platform-Specific Requirements

#### Windows (Primary Development Target)

- **Visual Studio Build Tools 2022** with "Desktop development with C++" workload
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
  - Required for linking Rust binaries
- **WebView2 Runtime**
  - Pre-installed on Windows 11
  - Download if needed: [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- **Optional: Ollama for Windows** for local model experimentation
  - Download from [ollama.com](https://ollama.com/download)

#### macOS

- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```
- **Optional: Ollama for macOS**
  - Download from [ollama.com](https://ollama.com/download)

#### Linux (Ubuntu/Debian)

- **Required system libraries**
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```
- **Optional: Ollama for Linux**
  - Download from [ollama.com](https://ollama.com/download)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/siddharthanagula3/agiworkforce.git
cd agiworkforce
```

### 2. Install Dependencies

```bash
# Use the correct Node.js version (reads from .nvmrc)
nvm use

# Install pnpm dependencies (includes Husky hooks)
pnpm install
```

This command automatically installs and configures Husky pre-commit hooks.

### 3. Verify Your Setup

```bash
node --version    # Should output v20.11.0+, v22.x.x, or compatible
pnpm --version    # Should output 9.x.x
rustc --version   # Should output rustc 1.90.0
```

### 4. Run the Development Server

```bash
# Start the desktop app in dev mode (Vite + Tauri hot reload)
pnpm --filter @agiworkforce/desktop dev
```

The app will open with hot-reload enabled for rapid iteration.

## Development Workflow

### Available Scripts

Run commands from the repository root. Use `pnpm --filter <package>` for workspace-specific operations.

```bash
# Lint all TypeScript/JavaScript code
pnpm lint

# Fix linting errors automatically
pnpm lint:fix

# Type-check TypeScript (must pass before PRs)
pnpm typecheck

# Format code with Prettier
pnpm format

# Check formatting without modifying files
pnpm format:check

# Run all tests (Vitest for TypeScript, cargo test for Rust)
pnpm test

# Run desktop app tests with interactive UI
pnpm --filter @agiworkforce/desktop test:ui

# Run desktop app tests with coverage report
pnpm --filter @agiworkforce/desktop test:coverage

# Run E2E tests with Playwright
pnpm --filter @agiworkforce/desktop test:e2e

# Build desktop app for production
pnpm --filter @agiworkforce/desktop build
```

### Pre-Commit Hooks

Husky automatically runs checks before commits and pushes. These hooks ensure code quality standards are met before code enters the repository.

#### Pre-Commit Hook (Staged Files)

Runs on every commit for staged files:

```bash
pnpm exec lint-staged
```

This runs:

- ESLint on TypeScript/JavaScript files (must pass)
- Prettier formatting on all supported files

#### Commit Message Hook

Validates commit messages against Conventional Commits format:

```bash
pnpm exec commitlint --edit "$1"
```

See [Commit Conventions](#commit-conventions) for requirements.

#### Pre-Push Hook

Runs before pushing to remote to catch issues early:

```bash
pnpm typecheck          # TypeScript type-checking (must pass)
cargo fmt --check       # Rust formatting check (must pass)
```

If these checks fail, your push is blocked. Fix issues and try again:

```bash
# Fix TypeScript errors
pnpm typecheck          # Review errors
pnpm lint:fix           # Auto-fix linting issues

# Fix Rust formatting
cd apps/desktop/src-tauri
cargo fmt               # Auto-format Rust code
```

## Code Quality Standards

All contributions must meet these standards. CI/CD will verify them before merging.

### TypeScript / JavaScript

- **Zero type errors**: `pnpm typecheck` must pass with no errors
- **ESLint compliance**: All rules must pass (no warnings on max-warnings: 0)
- **Prettier formatting**: Code must be formatted according to `.prettierrc`
- **Module resolution**: Use workspace protocol in imports: `@agiworkforce/package-name`

**Example:**

```typescript
// Good: explicit imports with proper resolution
import type { WorkflowConfig } from '@agiworkforce/types';
import { useAppStore } from '../../stores/appStore';

// Avoid: relative paths for workspace packages
import type { WorkflowConfig } from '../../../packages/types/src/types';
```

### Rust

- **Zero clippy warnings**: `cargo clippy --all-targets` must pass
- **Formatting**: Code must be formatted with `cargo fmt`
- **Module organization**: Organize code in appropriate MCP modules (automation, browser, filesystem, etc.)
- **Error handling**: Use Result types; avoid unwrap() unless explicitly documented
- **Comments**: Document public functions and non-obvious logic

**Example:**

```rust
// Good: explicit error handling
pub async fn automate_action(action: &Action) -> Result<ActionResult, AutomationError> {
    // Implementation
    Ok(result)
}

// Avoid: unwrap() in library code
pub async fn automate_action(action: &Action) -> ActionResult {
    some_operation().unwrap() // BAD: panics on error
}
```

### General Standards

- **Tests are mandatory** for new features
- **Documentation updates** required if you change public APIs or workflows
- **No secrets** in code (API keys, credentials, tokens) - use environment variables or Windows Credential Manager
- **Accessibility**: UI components must be keyboard-navigable and screen-reader-friendly
- **Performance**: Use Lighthouse audits for desktop app; profile Rust code for bottlenecks

## Testing

### TypeScript / JavaScript (Vitest)

Tests are located in `apps/desktop/src/__tests__/` and co-located as `*.test.ts` files.

```bash
# Run all tests
pnpm test

# Run tests in interactive UI mode
pnpm --filter @agiworkforce/desktop test:ui

# Run tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage

# Run specific test file
pnpm test -- src/__tests__/chat.test.ts
```

**Test Example:**

```typescript
import { describe, it, expect } from 'vitest';
import { useAppStore } from '../stores/appStore';

describe('AppStore', () => {
  it('should initialize with default state', () => {
    const store = useAppStore();
    expect(store.isReady).toBe(false);
  });
});
```

### Rust (Cargo Tests)

Tests are co-located in module files using `#[cfg(test)]` modules.

```bash
cd apps/desktop/src-tauri

# Run all Rust tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test automation::
```

**Test Example:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_validation() {
        let action = Action::new("test");
        assert_eq!(action.name, "test");
    }
}
```

### E2E Tests (Playwright)

End-to-end tests verify the full desktop app workflow:

```bash
# Run all E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Run with UI
pnpm --filter @agiworkforce/desktop test:e2e:ui

# Run smoke tests only
pnpm --filter @agiworkforce/desktop test:smoke
```

**Coverage Requirements:**

- New features should include unit tests
- Complex workflows should include E2E tests
- Aim for >80% coverage on critical modules

## Commit Conventions

This repository enforces [Conventional Commits](https://www.conventionalcommits.org/) using commitlint and Husky hooks.

### Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **chore**: Routine tasks, dependency updates, build config
- **docs**: Documentation updates
- **test**: Adding or updating tests
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **ci**: CI/CD configuration changes

### Scope

Specify the component or module affected (optional but recommended):

```
feat(chat): add message streaming support
fix(automation): handle window not found error
chore(deps): upgrade React to 18.3.1
docs(readme): add Ollama setup instructions
test(router): add LLM provider selection tests
```

### Examples

```bash
git commit -m "feat(desktop): add dark mode toggle to settings"
git commit -m "fix(router): prevent infinite retry loop on provider timeout"
git commit -m "docs(contributing): add E2E testing guide"
git commit -m "chore(deps): update Tauri to 2.0.1"
git commit -m "test(automation): add UI automation error handling tests"
```

### Validation

Commitlint automatically validates your commit message on `git commit`. If the format is invalid:

```
husky > commit-msg hook failed (exit code 1)
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]

Your commit message:
fix automation bug

The commit-msg hook failed! You can modify the message and try again.
```

Fix the message and retry:

```bash
git commit --amend -m "fix(automation): handle missing window in UIA query"
```

## Pull Request Process

### Before You Submit

1. **Create a feature branch** off `main`:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and add tests:

   ```bash
   # Edit code
   # Add tests
   pnpm test          # Verify tests pass
   pnpm typecheck      # Verify no type errors
   pnpm lint          # Verify no linting errors
   ```

3. **Commit with proper messages**:

   ```bash
   git commit -m "feat(scope): description"
   ```

4. **Push to your fork**:
   ```bash
   git push -u origin feat/your-feature-name
   ```

### Pull Request Checklist

When you create a PR, ensure:

- [ ] All commits follow Conventional Commits format
- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm test` passes (all tests green)
- [ ] `cargo test` passes for any Rust changes
- [ ] `cargo clippy --all-targets` passes with zero warnings
- [ ] New features include tests and documentation updates
- [ ] No API keys, credentials, or secrets in code or commits
- [ ] Linked related GitHub issues if applicable

### PR Title and Description

Use a clear, descriptive title following Conventional Commits:

```
feat(chat): add streaming response support
```

In the description, explain:

- What problem does this solve?
- How does it work?
- Any relevant context or decisions made
- Link to related issues: `Closes #123`

**Example:**

```markdown
## Summary

Implements streaming support for LLM responses, reducing perceived latency
and improving user experience with real-time token output.

## Changes

- Add `StreamingChat` component with token buffering
- Implement Tauri IPC channel for response streams
- Add router fallback for non-streaming providers

## Testing

- [x] Unit tests for StreamingChat component
- [x] E2E tests for streaming workflow
- [x] Manual testing with OpenAI and local Ollama

## Related

Closes #234
```

### Review and Feedback

- Respond to reviewer feedback promptly
- Re-request review after pushing changes
- If CI fails, fix issues and push new commits (don't force-push unless asked)

## Build Verification

Before merging, ensure your code builds successfully on all platforms.

### Desktop App Build (Windows)

```bash
# From repository root
pnpm --filter @agiworkforce/desktop build
```

Build artifacts are located in:

```
apps/desktop/src-tauri/target/release/
```

Verify the `.exe` is generated:

```
apps/desktop/src-tauri/target/release/agiworkforce.exe
```

### Desktop App Build (Linux)

```bash
# From repository root (requires Linux system or WSL)
pnpm --filter @agiworkforce/desktop build
```

Verify the binary is generated:

```
apps/desktop/src-tauri/target/release/agiworkforce
```

### Rust Build Verification

```bash
cd apps/desktop/src-tauri

# Check compilation
cargo check

# Run all tests
cargo test

# Verify formatting
cargo fmt --check

# Verify clippy (zero warnings required)
cargo clippy --all-targets -- -D warnings
```

## Troubleshooting

### TypeScript Type Errors

If `pnpm typecheck` fails:

```bash
# 1. Verify versions
node --version    # Should match .nvmrc
pnpm --version    # Should be 9.x
rustc --version   # Should be 1.90.0

# 2. Reinstall dependencies
pnpm install

# 3. Check specific package
pnpm --filter @agiworkforce/types typecheck

# 4. Review error output for module resolution issues
pnpm typecheck 2>&1 | tee typecheck.log
```

Common issues:

- Missing `tsconfig.json` in workspace packages
- Dependencies listed in root `package.json` instead of package's `package.json`
- Module resolution: use workspace protocol (`@agiworkforce/package-name`) for internal imports

### ESLint / Prettier Failures

```bash
# Automatically fix issues
pnpm lint:fix

# Format all code
pnpm format

# Check specific file
pnpm lint -- apps/desktop/src/MyComponent.tsx
```

### Rust Clippy Warnings

```bash
cd apps/desktop/src-tauri

# See warnings
cargo clippy --all-targets

# Common fixes:
# - Remove unused imports: clippy-fix
# - Simplify error types
# - Add documentation for public items

# Auto-fix where possible
cargo clippy --all-targets --fix --allow-dirty
```

### Husky Hooks Not Running

```bash
# Reinstall Husky
pnpm install

# Verify hooks are executable (Unix/Linux/macOS)
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
chmod +x .husky/commit-msg

# Test manually
pnpm exec lint-staged
pnpm exec commitlint --edit
```

### Build Failures (LNK1318 on Windows)

This is already fixed in the repository via `Cargo.toml` profile settings, but if you encounter it:

```bash
# Clean and rebuild
cd apps/desktop/src-tauri
cargo clean
cd ../..
pnpm --filter @agiworkforce/desktop dev
```

The fix prevents debug info generation that exceeds Windows PDB limits:

```toml
[profile.dev]
debug = 0
incremental = false
opt-level = 0
```

### Module Resolution Errors

The repository uses `moduleResolution: "bundler"`. When imports fail:

```bash
# Check workspace protocol usage
grep -r "from ['\"]\.\./" apps/desktop/src | head -20

# Correct examples:
# ✓ import { useChat } from '@agiworkforce/desktop/stores'
# ✗ import { useChat } from '../../../stores'

# ✓ import type { Config } from '@agiworkforce/types'
# ✗ import type { Config } from '../../../../packages/types'

# Verify package.json dependencies
cat apps/desktop/package.json | grep "@agiworkforce"
```

### Playwright E2E Test Failures

```bash
# Install Playwright browsers (one-time setup)
pnpm --filter @agiworkforce/desktop exec playwright install

# Run tests with debug output
PWDEBUG=1 pnpm --filter @agiworkforce/desktop test:e2e

# Run single test file
pnpm --filter @agiworkforce/desktop test:e2e -- smoke.spec.ts
```

### Pre-Push Hook Failures

If your push is blocked:

```bash
# The pre-push hook runs:
# 1. pnpm typecheck
# 2. cargo fmt --check

# Fix TypeScript errors
pnpm typecheck       # View errors
pnpm lint:fix        # Fix linting
# Address remaining type errors

# Fix Rust formatting
cd apps/desktop/src-tauri
cargo fmt            # Auto-format
cd ../..

# Try pushing again
git push
```

## Additional Resources

- **Project Architecture**: See [CLAUDE.md](./CLAUDE.md) for detailed development guidance
- **Project Status**: See [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) for current implementation status
- **Design Decisions**: See `docs/` for architecture and design documentation
- **Security**: See `SECURITY.md` for threat modeling and security guidelines

## Questions?

If you have questions about contributing:

1. Check existing [GitHub Issues](https://github.com/siddharthanagula3/agiworkforce/issues)
2. Review [CLAUDE.md](./CLAUDE.md) and [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
3. Open a GitHub Discussion or Issue with your question

## Code of Conduct

Please follow our community standards:

- Be respectful and inclusive
- Give credit for ideas and contributions
- Report issues through GitHub, not publicly
- Focus on the code, not the person

Thank you for contributing to AGI Workforce!
