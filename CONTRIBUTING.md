# Contributing to AGI Workforce

Thank you for your interest in contributing to AGI Workforce! This guide will help you get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)

---

## Code of Conduct

By participating in this project, you agree to:

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please:

1. **Check existing issues** to avoid duplicates
2. **Use the latest version** to verify the bug still exists
3. **Collect information**:
   - OS and version
   - App version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/logs if applicable

**Submit via**: [GitHub Issues](https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues/new?template=bug_report.md)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:

1. **Check existing feature requests** to avoid duplicates
2. **Provide clear use cases** and examples
3. **Explain the problem** this solves
4. **Describe the proposed solution**

**Submit via**: [GitHub Issues](https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues/new?template=feature_request.md)

### Contributing Code

We welcome pull requests for:

- Bug fixes
- New features
- Documentation improvements
- Performance optimizations
- Test coverage improvements

---

## Development Setup

### Prerequisites

- Node.js ≥20.11.0
- pnpm ≥9.15.0
- Rust ≥1.90.0
- Git

See [INSTALLATION.md](./INSTALLATION.md#build-from-source) for detailed setup instructions.

### Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/agiworkforce-desktop-app.git
cd agiworkforce-desktop-app

# Add upstream remote
git remote add upstream https://github.com/original/agiworkforce-desktop-app.git
```

### Install Dependencies

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev:desktop
```

The app will open with hot-reload enabled.

### Project Structure

```
agiworkforce-desktop-app/
├── apps/
│   ├── desktop/              # Main Tauri app
│   │   ├── src/              # React frontend
│   │   │   ├── components/   # UI components
│   │   │   ├── stores/       # Zustand state stores
│   │   │   ├── services/     # Business logic
│   │   │   └── utils/        # Utilities
│   │   ├── src-tauri/        # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── commands/ # Tauri commands
│   │   │   │   ├── router/   # LLM routing
│   │   │   │   └── agi/      # Tool system
│   │   └── package.json
│   └── extension/            # Browser extension (future)
├── packages/
│   ├── types/                # Shared TypeScript types
│   └── utils/                # Shared utilities
├── .github/
│   └── workflows/            # CI/CD pipelines
└── docs/                     # Documentation
```

---

## Pull Request Process

### 1. Create a Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming convention:
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring
- `test/description` - Test improvements

### 2. Make Changes

- Write clear, concise code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm --filter @agiworkforce/desktop build
```

All checks must pass before submitting PR.

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add amazing feature"
```

See [Commit Message Guidelines](#commit-message-guidelines) below.

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub:

1. Go to your fork on GitHub
2. Click "Pull Request"
3. Select your branch
4. Fill in the PR template
5. Submit for review

### PR Requirements

- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ Linting passes
- ✅ Documentation updated
- ✅ Commits follow convention
- ✅ PR description explains changes
- ✅ Linked to related issue (if applicable)

---

## Coding Standards

### TypeScript/React

```typescript
// Use functional components with hooks
import { useState, useEffect } from 'react';

export function MyComponent({ prop }: MyComponentProps) {
  const [state, setState] = useState(0);

  useEffect(() => {
    // Effect logic
  }, []);

  return <div>{state}</div>;
}

// Use proper TypeScript types
interface MyComponentProps {
  prop: string;
}

// Prefer const over let
const value = 42;

// Use meaningful names
const userCount = users.length; // Good
const x = users.length; // Bad
```

### Rust

```rust
// Follow Rust naming conventions
pub struct MyStruct {
    field_name: String,
}

impl MyStruct {
    pub fn new() -> Self {
        Self {
            field_name: String::new(),
        }
    }
}

// Use Result for error handling
pub fn operation() -> Result<(), String> {
    Ok(())
}

// Document public APIs
/// Performs an important operation
///
/// # Arguments
/// * `arg` - Description of argument
pub fn documented_function(arg: i32) -> i32 {
    arg * 2
}
```

### File Organization

- One component per file
- Colocate related files (component, styles, tests)
- Use index files for clean imports
- Keep files under 300 lines when possible

### State Management

- Use Zustand for global state
- Use React state for component-local state
- Use immer middleware for immutable updates
- Avoid prop drilling - use stores or context

---

## Testing Guidelines

### Frontend Tests (Vitest)

```typescript
// src/components/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent prop="test" />);
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    // Test user events
  });
});
```

### Backend Tests (Cargo)

```rust
// src-tauri/src/commands/my_command.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function();
        assert_eq!(result, expected);
    }
}
```

### E2E Tests (Playwright)

```typescript
// e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test('user can complete workflow', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // Test user flow
});
```

### Test Coverage Goals

- Unit tests: >80% coverage
- Critical paths: 100% coverage
- All bug fixes: Add regression test

---

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```bash
# Feature
feat(chat): add streaming support for responses

# Bug fix
fix(auth): resolve JWT token expiry validation

# Breaking change
feat(api)!: change tool execution API

BREAKING CHANGE: ToolExecutor.execute() now returns Result<Json, Error>
```

### Rules

- Use imperative mood ("add" not "added")
- Don't capitalize first letter
- No period at the end
- Keep subject under 72 characters
- Reference issues: `fix(ui): resolve dropdown issue (#123)`

---

## Documentation

### Code Comments

```typescript
// Good: Explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming the API
const delay = Math.pow(2, retryCount) * 1000;

// Bad: States the obvious
// Multiply by 1000
const delay = retryCount * 1000;
```

### JSDoc/TSDoc

```typescript
/**
 * Executes a tool with rate limiting and retry logic
 *
 * @param toolName - Name of the tool to execute
 * @param args - Tool arguments as JSON
 * @returns Promise resolving to tool execution result
 * @throws {RateLimitError} If rate limit exceeded
 * @throws {TimeoutError} If operation times out
 */
export async function executeTool(
  toolName: string,
  args: Json
): Promise<ToolResult> {
  // Implementation
}
```

---

## Release Process

Releases are automated via GitHub Actions:

1. Update version in `apps/desktop/src-tauri/tauri.conf.json`
2. Update `CHANGELOG.md`
3. Create and push version tag:
   ```bash
   git tag -a v5.1.0 -m "Release v5.1.0"
   git push origin v5.1.0
   ```
4. GitHub Actions builds and publishes release automatically

---

## Getting Help

- **Questions**: [GitHub Discussions](https://github.com/siddharthanagula3/agiworkforce-desktop-app/discussions)
- **Chat**: [Discord Server](https://discord.gg/agiworkforce)
- **Email**: developers@agiworkforce.com

---

## Recognition

Contributors will be:

- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Credited in the app's About page

Thank you for contributing! 🎉
