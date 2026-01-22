# Contributing to AGI Workforce

Thank you for your interest in contributing to AGI Workforce! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behaviors include:**

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behaviors include:**

- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: 22.12.0 or higher ([Download](https://nodejs.org/))
- **pnpm**: 9.15.3 or higher (`npm install -g pnpm`)
- **Rust**: 1.75 or higher ([Install](https://rustup.rs/))
- **Git**: Latest version ([Download](https://git-scm.com/))

**Optional but recommended:**

- **VS Code**: With Rust Analyzer and TypeScript extensions
- **Docker**: For running PostgreSQL locally

### Fork and Clone

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

```bash
git clone https://github.com/YOUR_USERNAME/agiworkforce.git
cd agiworkforce
```

3. **Add upstream remote:**

```bash
git remote add upstream https://github.com/siddhartha/agiworkforce.git
```

4. **Create a branch** for your work:

```bash
git checkout -b feature/your-feature-name
```

## Development Setup

### Initial Setup

1. **Install dependencies:**

```bash
pnpm install
```

2. **Set up environment variables:**

```bash
# Desktop app
cp apps/desktop/.env.example apps/desktop/.env.local

# Web app
cp apps/web/.env.example apps/web/.env.local

# Services
cp services/api-gateway/.env.example services/api-gateway/.env
cp services/signaling-server/.env.example services/signaling-server/.env
```

3. **Configure API keys in .env.local files**

4. **Run type check to verify setup:**

```bash
pnpm typecheck:all
```

### Running Development Servers

**Desktop app:**

```bash
pnpm dev:desktop
```

**Web app:**

```bash
cd apps/web
pnpm dev
```

**Backend services:**

```bash
# Terminal 1
pnpm --filter @agiworkforce/api-gateway dev

# Terminal 2
pnpm --filter @agiworkforce/signaling-server dev
```

## How to Contribute

### Types of Contributions

We welcome various types of contributions:

1. **Bug Reports**: Found a bug? Open an issue with detailed reproduction steps
2. **Feature Requests**: Have an idea? Open an issue to discuss it
3. **Code Contributions**: Fix bugs, implement features, improve performance
4. **Documentation**: Improve docs, add examples, fix typos
5. **Testing**: Write tests, improve test coverage
6. **Design**: UI/UX improvements, icons, graphics
7. **Review**: Review pull requests, provide feedback

### Finding Issues to Work On

- Check the [Issues](https://github.com/siddhartha/agiworkforce/issues) page
- Look for issues labeled `good first issue` for beginner-friendly tasks
- Issues labeled `help wanted` are ready for contribution
- Comment on an issue to indicate you're working on it

### Asking Questions

- **Usage questions**: Use GitHub Discussions
- **Bug reports**: Use GitHub Issues
- **Feature discussions**: Use GitHub Discussions or Issues
- **Security issues**: Email security@agiworkforce.com (do not open public issues)

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

Branch naming conventions:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Build/tooling changes

### 2. Make Your Changes

- Write clean, maintainable code
- Follow the project's code style
- Add tests for new functionality
- Update documentation as needed
- Keep commits focused and atomic

### 3. Test Your Changes

```bash
# Type check
pnpm typecheck:all

# Lint
pnpm lint

# Run tests
pnpm test

# E2E tests (if applicable)
pnpm --filter @agiworkforce/desktop test:e2e
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature"
```

See [Commit Guidelines](#commit-guidelines) for commit message format.

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Code Style Guidelines

### TypeScript

**General Principles:**

- Use TypeScript's strict mode
- Prefer explicit types over `any`
- Use functional programming patterns where appropriate
- Keep functions small and focused

**Naming Conventions:**

```typescript
// PascalCase for types, interfaces, classes, components
interface UserProfile {}
class DatabaseManager {}
function MyComponent() {}

// camelCase for variables, functions, properties
const userName = 'John';
function getUserData() {}

// UPPER_SNAKE_CASE for constants
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.example.com';

// Private properties with underscore prefix
class MyClass {
  private _privateField: string;
}
```

**React Components:**

```typescript
// Functional components with TypeScript
interface MyComponentProps {
  title: string;
  count?: number;
  onUpdate?: (value: string) => void;
}

export function MyComponent({ title, count = 0, onUpdate }: MyComponentProps) {
  // Hooks at the top
  const [state, setState] = useState<string>('');
  const { data } = useQuery(['key'], fetcher);

  // Event handlers
  const handleClick = () => {
    setState('new value');
    onUpdate?.('new value');
  };

  // Render
  return (
    <div className="my-component">
      <h2>{title}</h2>
      <p>Count: {count}</p>
      <button onClick={handleClick}>Update</button>
    </div>
  );
}
```

**Zustand Stores:**

```typescript
interface MyStore {
  data: MyData[];
  loading: boolean;
  fetchData: () => Promise<void>;
  updateData: (id: string, updates: Partial<MyData>) => void;
}

export const useMyStore = create<MyStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        data: [],
        loading: false,

        fetchData: async () => {
          set({ loading: true });
          try {
            const data = await api.fetchData();
            set({ data, loading: false });
          } catch (error) {
            set({ loading: false });
            console.error('Failed to fetch data:', error);
          }
        },

        updateData: (id, updates) => {
          set((state) => ({
            data: state.data.map((item) => (item.id === id ? { ...item, ...updates } : item)),
          }));
        },
      })),
      { name: 'my-store' },
    ),
    { name: 'MyStore', enabled: import.meta.env.DEV },
  ),
);

// Export selectors
export const selectData = (state: MyStore) => state.data;
export const selectLoading = (state: MyStore) => state.loading;
```

**Settings Store Pattern:**

When adding new user-configurable settings, follow the pattern used for features like "Always Use Agent Mode":

```typescript
// 1. Add to interface
interface ChatPreferences {
  promptCompletionEnabled: boolean;
  alwaysUseAgentMode: boolean; // New setting
}

// 2. Add setter to store interface
setAlwaysUseAgentMode: (enabled: boolean) => void;

// 3. Set default value
alwaysUseAgentMode: false,

// 4. Implement setter
setAlwaysUseAgentMode: (enabled) => {
  set((state) => ({
    chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
  }));
},

// 5. Add migration for existing users (bump version)
if (state.chatPreferences.alwaysUseAgentMode === undefined) {
  state.chatPreferences.alwaysUseAgentMode = false;
}
```

### Rust

**General Principles:**

- Follow the official Rust style guide
- Use `rustfmt` for formatting
- Run `clippy` for linting
- Write documentation comments for public APIs

**Naming Conventions:**

```rust
// snake_case for functions, variables, modules
fn calculate_total() {}
let user_count = 0;

// PascalCase for types, structs, enums, traits
struct UserProfile {}
enum Status {}
trait Executor {}

// SCREAMING_SNAKE_CASE for constants
const MAX_CONNECTIONS: usize = 100;
```

**Error Handling:**

```rust
use anyhow::{Result, Context};

// Use Result for operations that can fail
pub fn risky_operation() -> Result<String> {
    let data = read_file("config.json")
        .context("Failed to read config file")?;

    let parsed = parse_config(&data)
        .context("Failed to parse config")?;

    Ok(parsed)
}

// Use custom errors for domain-specific errors
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyError {
    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Database error")]
    Database(#[from] rusqlite::Error),
}
```

**Async Code:**

```rust
use tokio::task;

// Async functions
pub async fn async_operation() -> Result<()> {
    // Spawn concurrent tasks
    let (result1, result2) = tokio::join!(
        fetch_data_1(),
        fetch_data_2()
    );

    // Spawn background task
    task::spawn(async move {
        background_work().await;
    });

    Ok(())
}

// Use timeout for long operations
use tokio::time::{timeout, Duration};

pub async fn with_timeout() -> Result<()> {
    timeout(
        Duration::from_secs(30),
        long_operation()
    )
    .await??;

    Ok(())
}
```

### Formatting

**Prettier (TypeScript/JavaScript):**

- Single quotes
- Semicolons
- Trailing commas
- Print width: 100
- Tab width: 2

**rustfmt (Rust):**

- Default configuration
- Max width: 100

**Run formatters:**

```bash
# Format all code
pnpm format

# Check formatting
pnpm format:check

# Format Rust code
cd apps/desktop/src-tauri
cargo fmt
```

## Testing Guidelines

### Testing Principles

- **Write tests for new features**: All new code should have tests
- **Maintain test coverage**: Aim for >80% coverage
- **Test behavior, not implementation**: Focus on what, not how
- **Keep tests simple**: One assertion per test when possible
- **Use descriptive test names**: Clearly state what is being tested

### TypeScript/React Tests (Vitest)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render with title', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should call onUpdate when button is clicked', () => {
    const onUpdate = vi.fn();
    render(<MyComponent title="Test" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onUpdate).toHaveBeenCalledWith('new value');
  });

  it('should display count when provided', () => {
    render(<MyComponent title="Test" count={5} />);
    expect(screen.getByText('Count: 5')).toBeInTheDocument();
  });
});
```

### Rust Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_operation() {
        let result = basic_operation(5);
        assert_eq!(result, 10);
    }

    #[tokio::test]
    async fn test_async_operation() {
        let result = async_operation().await.unwrap();
        assert!(result.is_ok());
    }

    #[test]
    fn test_error_handling() {
        let result = operation_that_fails();
        assert!(result.is_err());
    }
}
```

### E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chat Feature', () => {
  test('should send message and receive response', async ({ page }) => {
    await page.goto('/');

    // Navigate to chat
    await page.click('text=Chat');

    // Send message
    await page.fill('[placeholder="Type a message"]', 'Hello');
    await page.click('button:has-text("Send")');

    // Wait for response
    await expect(page.locator('.message-response')).toBeVisible({
      timeout: 10000,
    });
  });
});
```

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @agiworkforce/desktop test
pnpm --filter web test

# Single test file
cd apps/desktop && pnpm vitest run src/__tests__/path/to/test.test.ts
cd apps/web && pnpm vitest run __tests__/api/checkout.test.ts

# Watch mode (re-runs on file changes)
cd apps/desktop && pnpm vitest

# With coverage
pnpm --filter @agiworkforce/desktop test:coverage
pnpm --filter web test:coverage

# E2E tests (requires build first: cd apps/desktop && pnpm build && pnpm preview)
pnpm --filter @agiworkforce/desktop test:e2e

# E2E specific project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat
pnpm --filter @agiworkforce/desktop test:e2e -- --project=agi

# E2E with UI (useful for debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Rust tests
cd apps/desktop/src-tauri && cargo test

# Single Rust test
cd apps/desktop/src-tauri && cargo test test_name
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, tooling, or dependency updates
- `ci`: CI/CD changes

### Scope (Optional)

The scope can be anything specifying the place of the commit change:

- `desktop` - Desktop app changes
- `web` - Web app changes
- `agi` - AGI system changes
- `mcp` - MCP integration changes
- `ui` - UI/component changes
- `api` - API changes
- `docs` - Documentation changes

### Examples

```bash
# Feature
git commit -m "feat(agi): add process reasoning with DAG support"

# Bug fix
git commit -m "fix(desktop): resolve SQLite connection pool exhaustion"

# Documentation
git commit -m "docs: update MCP integration guide with examples"

# Breaking change
git commit -m "feat(api)!: change authentication endpoint structure

BREAKING CHANGE: Auth endpoint now returns user object at root level
instead of nested under 'data' key."
```

### Commit Best Practices

- **Keep commits atomic**: One logical change per commit
- **Write clear messages**: Be descriptive but concise
- **Use present tense**: "add feature" not "added feature"
- **Reference issues**: Include issue number in footer (e.g., "Fixes #123")
- **Sign your commits**: Use GPG signatures for verified commits

## Pull Request Process

### Before Submitting

1. **Update your branch** with latest main:

```bash
git fetch upstream
git rebase upstream/main
```

2. **Run all checks**:

```bash
pnpm typecheck:all
pnpm lint
pnpm test
```

3. **Update documentation** if needed

4. **Write/update tests** for your changes

### PR Title and Description

**Title format:**

```
<type>(<scope>): <description>
```

**Description should include:**

- What changes were made and why
- How to test the changes
- Screenshots/videos for UI changes
- Breaking changes (if any)
- Related issues

**Example:**

```markdown
## Description

Adds process reasoning capabilities to the AGI system, allowing it to decompose complex goals into DAGs with parallel execution support.

## Changes

- Added `ProcessReasoner` struct and implementation
- Implemented DAG validation and topological sorting
- Added parallel execution for independent tasks
- Updated AGI core to use process reasoning

## Testing

1. Start desktop app: `pnpm dev:desktop`
2. Navigate to AGI tab
3. Set a complex goal like "Create a web scraper and analyze data"
4. Observe task decomposition and parallel execution

## Screenshots

[Include screenshots if applicable]

## Breaking Changes

None

## Related Issues

Closes #456
```

### Review Process

1. **Automated checks** must pass:
   - Type checking
   - Linting
   - Tests
   - Build

2. **Code review** by maintainers:
   - Code quality
   - Architecture fit
   - Test coverage
   - Documentation

3. **Address feedback**:
   - Make requested changes
   - Push updates to your branch
   - Respond to comments

4. **Approval and merge**:
   - Once approved, maintainers will merge
   - Your commits may be squashed

### After Merge

1. **Delete your branch**:

```bash
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

2. **Update your fork**:

```bash
git checkout main
git pull upstream main
git push origin main
```

## Documentation

### Types of Documentation

1. **Code comments**: Explain complex logic
2. **JSDoc/RustDoc**: Document public APIs
3. **README files**: Setup and usage instructions
4. **Architecture docs**: System design and patterns
5. **User guides**: End-user documentation

### Documentation Standards

**TypeScript/JSDoc:**

````typescript
/**
 * Calculates the total price including tax.
 *
 * @param basePrice - The base price before tax
 * @param taxRate - The tax rate as a decimal (e.g., 0.1 for 10%)
 * @returns The total price including tax
 * @throws {Error} If basePrice or taxRate is negative
 *
 * @example
 * ```typescript
 * const total = calculateTotal(100, 0.1);
 * console.log(total); // 110
 * ```
 */
export function calculateTotal(basePrice: number, taxRate: number): number {
  if (basePrice < 0 || taxRate < 0) {
    throw new Error('Price and tax rate must be non-negative');
  }
  return basePrice * (1 + taxRate);
}
````

**Rust Documentation:**

````rust
/// Executes an AGI goal and returns the result.
///
/// This function runs the AGI reasoning loop until the goal is achieved,
/// the maximum iterations are reached, or a timeout occurs.
///
/// # Arguments
///
/// * `goal` - The goal to achieve
///
/// # Returns
///
/// Returns `Ok(GoalResult)` if the goal completes (success or failure),
/// or `Err` if an internal error occurs.
///
/// # Examples
///
/// ```
/// let goal = Goal::new("Create a web scraper");
/// let result = agi.execute_goal(goal).await?;
/// assert!(result.success);
/// ```
///
/// # Safety
///
/// This function has built-in safety limits:
/// - Maximum 1000 iterations
/// - 5-minute timeout
/// - 3 consecutive failure limit
pub async fn execute_goal(&self, goal: Goal) -> Result<GoalResult> {
    // Implementation
}
````

## Community

### Communication Channels

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: Questions, ideas, general discussion
- **Pull Requests**: Code contributions
- **Email**: security@agiworkforce.com (security issues only)

### Getting Help

- Check existing issues and discussions first
- Provide detailed information when asking questions
- Include code snippets, error messages, and reproduction steps
- Be patient and respectful

### Recognition

Contributors are recognized in:

- CHANGELOG.md for significant contributions
- GitHub contributors page
- Release notes

Thank you for contributing to AGI Workforce!

---

**Questions?** Open a discussion or reach out to the maintainers.
