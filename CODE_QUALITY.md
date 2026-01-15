# Code Quality Guide

Complete guide to code quality tools, standards, and practices in the AGI Workforce project.

## Table of Contents

- [Overview](#overview)
- [ESLint Configuration](#eslint-configuration)
- [Prettier Configuration](#prettier-configuration)
- [TypeScript Configuration](#typescript-configuration)
- [Git Hooks](#git-hooks)
- [Running Quality Checks](#running-quality-checks)
- [IDE Integration](#ide-integration)
- [Best Practices](#best-practices)

## Overview

The project uses a comprehensive code quality stack:

| Tool            | Purpose                    | Auto-fixes |
| --------------- | -------------------------- | ---------- |
| **ESLint**      | Lint JavaScript/TypeScript | Yes        |
| **Prettier**    | Format code                | Yes        |
| **TypeScript**  | Type checking              | No         |
| **Husky**       | Git hooks                  | N/A        |
| **lint-staged** | Pre-commit checks          | Yes        |
| **commitlint**  | Commit message format      | No         |

## ESLint Configuration

### Configuration File

Located at `.eslintrc.cjs`:

```javascript
module.exports = {
  root: true,
  env: { browser: true, node: true, es2021: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier', // Must be last
  ],
  rules: {
    // Custom rules
  },
};
```

### Key Rules

#### TypeScript Rules

```javascript
rules: {
  // Unused variables (errors except for _ prefix)
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],

  // Allow any type (pragmatic choice)
  '@typescript-eslint/no-explicit-any': 'off',

  // Allow namespaces
  '@typescript-eslint/no-namespace': 'off',
}
```

#### React Rules

```javascript
rules: {
  // No React import needed (React 19)
  'react/react-in-jsx-scope': 'off',

  // No prop-types (using TypeScript)
  'react/prop-types': 'off',

  // Warn on missing dependencies
  'react-hooks/exhaustive-deps': 'warn',

  // Allow quotes in JSX
  'react/no-unescaped-entities': 'off',
}
```

#### Import Rules

```javascript
rules: {
  // Disable problematic rules
  'import/no-named-as-default': 'off',
  'import/no-duplicates': 'off',
  'import/default': 'off',
}
```

### Running ESLint

```bash
# Lint all files
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Lint specific files
pnpm lint src/components/**/*.tsx

# Lint with max warnings (CI)
pnpm lint --max-warnings=15
```

### ESLint Ignore

Create `.eslintignore`:

```
dist
build
out
node_modules
**/src-tauri/**
target
.next
```

Or use ignore patterns in config:

```javascript
ignorePatterns: [
  'dist',
  'build',
  'node_modules',
  '**/src-tauri/**',
],
```

### Disabling Rules

```typescript
// Disable for one line
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = fetchData();

// Disable for block
/* eslint-disable @typescript-eslint/no-explicit-any */
const data1: any = fetchData();
const data2: any = fetchOtherData();
/* eslint-enable @typescript-eslint/no-explicit-any */

// Disable for entire file
/* eslint-disable @typescript-eslint/no-explicit-any */

// Only when absolutely necessary!
```

## Prettier Configuration

### Configuration File

Located at `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### Style Rules

| Rule                | Value     | Example        |
| ------------------- | --------- | -------------- |
| **Semicolons**      | Always    | `const x = 1;` |
| **Quotes**          | Single    | `'hello'`      |
| **Trailing Commas** | All       | `{ a, b, }`    |
| **Print Width**     | 100 chars | Auto-wrap      |
| **Tab Width**       | 2 spaces  | `  const x`    |
| **Arrow Parens**    | Always    | `(x) => x`     |
| **Line Endings**    | LF        | Unix-style     |

### Running Prettier

```bash
# Format all files
pnpm format

# Check formatting (CI)
pnpm format:check

# Format specific files
pnpm prettier --write "src/**/*.{ts,tsx}"

# Check specific files
pnpm prettier --check "src/**/*.{ts,tsx}"
```

### Prettier Ignore

Create `.prettierignore`:

```
dist
build
out
node_modules
**/src-tauri/target
.next
pnpm-lock.yaml
```

### Prettier + ESLint

Prettier runs after ESLint (via `eslint-config-prettier`):

1. ESLint fixes code issues
2. Prettier formats code style
3. No conflicts (Prettier overrides ESLint style rules)

## TypeScript Configuration

### Base Configuration

Located at `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    // Language
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",

    // Modules
    "module": "ESNext",
    "moduleResolution": "bundler",

    // Strict Mode (ENABLED)
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,

    // Path Mappings
    "baseUrl": ".",
    "paths": {
      "@/*": ["apps/desktop/src/*"],
      "@types/*": ["packages/types/src/*"]
    }
  }
}
```

### Strict Mode Benefits

Enabled strict checks:

- `noImplicitAny` - No implicit `any` types
- `strictNullChecks` - Null safety
- `strictFunctionTypes` - Function type safety
- `strictBindCallApply` - Method call safety
- `noImplicitThis` - No implicit `this`

### Type Checking

```bash
# Check all packages
pnpm typecheck:all

# Check specific package
cd apps/desktop && pnpm typecheck

# Watch mode (not built-in, use tsc directly)
cd apps/desktop && tsc --noEmit --watch
```

### Type Errors

```typescript
// ✅ Good: Explicit types
function add(a: number, b: number): number {
  return a + b;
}

// ❌ Bad: Implicit any
function add(a, b) {
  // Error: Parameter implicitly has 'any' type
  return a + b;
}

// ✅ Good: Null checking
function getName(user: User | null): string {
  if (!user) return 'Unknown';
  return user.name;
}

// ❌ Bad: Possible null reference
function getName(user: User | null): string {
  return user.name; // Error: Object is possibly 'null'
}
```

## Git Hooks

### Husky Configuration

Hooks are stored in `.husky/`:

```bash
.husky/
├── pre-commit     # Runs before commit
└── commit-msg     # Validates commit message
```

### Pre-commit Hook

Located at `.husky/pre-commit`:

```bash
pnpm exec lint-staged
```

Runs lint-staged which:

1. Lints staged files
2. Formats staged files
3. Fixes issues automatically
4. Aborts commit if errors remain

### Commit Message Hook

Located at `.husky/commit-msg`:

```bash
pnpm exec commitlint --edit "$1"
```

Validates commit message format using commitlint.

### lint-staged Configuration

Located in `package.json`:

```json
{
  "lint-staged": {
    "**/*.{ts,tsx,js,jsx,cjs,mjs}": ["eslint --fix", "prettier --write"],
    "**/*.{json,md,css,scss,html,yml,yaml}": ["prettier --write"]
  }
}
```

Runs on staged files only (fast!).

### Commit Message Format

Uses conventional commits:

```bash
# Format
type(scope?): subject

# Types
feat:      New feature
fix:       Bug fix
docs:      Documentation
style:     Formatting, missing semi colons, etc.
refactor:  Code refactoring
test:      Adding tests
chore:     Maintenance
perf:      Performance improvements
ci:        CI/CD changes
build:     Build system changes
revert:    Revert a previous commit

# Examples
feat: add chat export feature
fix: resolve login bug
docs: update README
feat(desktop): add new sidebar
fix(web): resolve subscription issue
```

### Bypassing Hooks

```bash
# Skip pre-commit (not recommended)
git commit --no-verify -m "message"

# Skip commit-msg (not recommended)
git commit --no-verify -m "quick fix"

# Only use in emergencies!
```

## Running Quality Checks

### Full Quality Check

```bash
# Before committing
pnpm lint:fix          # Fix linting issues
pnpm format            # Format code
pnpm typecheck:all     # Type check
pnpm test              # Run tests

# Or all at once
pnpm lint:fix && pnpm format && pnpm typecheck:all && pnpm test
```

### CI/CD Pipeline

GitHub Actions runs:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Lint
  run: pnpm lint --max-warnings=15

- name: Format check
  run: pnpm format:check

- name: Type check
  run: pnpm typecheck:all

- name: Test
  run: pnpm test
```

### Quality Metrics

Target metrics:

- **Lint warnings:** ≤ 15
- **Type errors:** 0
- **Format issues:** 0
- **Test coverage:** ≥ 80%

## IDE Integration

### VS Code

**Recommended Extensions:**

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss"
  ]
}
```

**Workspace Settings:**

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "eslint.workingDirectories": [{ "mode": "auto" }]
}
```

**Per-language Settings:**

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### WebStorm/IntelliJ

1. **Enable ESLint:**
   - Preferences → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
   - Check "Automatic ESLint configuration"
   - Check "Run eslint --fix on save"

2. **Enable Prettier:**
   - Preferences → Languages & Frameworks → JavaScript → Prettier
   - Check "On 'Reformat Code' action"
   - Check "On save"

3. **TypeScript:**
   - Preferences → Languages & Frameworks → TypeScript
   - Check "TypeScript Language Service"
   - Use project TypeScript version

### Vim/Neovim

Use ALE or CoC:

```vim
" ALE
let g:ale_linters = {
\   'typescript': ['eslint', 'tsserver'],
\   'typescriptreact': ['eslint', 'tsserver'],
\}
let g:ale_fixers = {
\   'typescript': ['prettier', 'eslint'],
\   'typescriptreact': ['prettier', 'eslint'],
\}
let g:ale_fix_on_save = 1

" CoC
" Install extensions:
" :CocInstall coc-eslint coc-prettier coc-tsserver
```

## Best Practices

### 1. Always Use Type Annotations

```typescript
// ✅ Good: Explicit types
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Bad: Inferred types (unclear)
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### 2. Use Const Over Let

```typescript
// ✅ Good: Const by default
const MAX_ITEMS = 100;
const items = [1, 2, 3];

// ❌ Bad: Unnecessary let
let MAX_ITEMS = 100; // Never reassigned
```

### 3. Avoid Any Type

```typescript
// ✅ Good: Specific types
function processData(data: UserData): ProcessedData {
  // ...
}

// ❌ Bad: Any type
function processData(data: any): any {
  // ...
}

// If type is truly unknown, use 'unknown'
function processData(data: unknown): ProcessedData {
  if (typeof data === 'object' && data !== null) {
    // Type guard
  }
}
```

### 4. Use Async/Await Over Promises

```typescript
// ✅ Good: Async/await
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// ❌ Avoid: Promise chains
function fetchUser(id: string): Promise<User> {
  return fetch(`/api/users/${id}`).then((response) => response.json());
}
```

### 5. Use Optional Chaining

```typescript
// ✅ Good: Optional chaining
const name = user?.profile?.name ?? 'Unknown';

// ❌ Bad: Manual null checks
const name = user && user.profile && user.profile.name ? user.profile.name : 'Unknown';
```

### 6. Use Template Literals

```typescript
// ✅ Good: Template literals
const message = `Hello, ${user.name}! You have ${count} messages.`;

// ❌ Bad: String concatenation
const message = 'Hello, ' + user.name + '! You have ' + count + ' messages.';
```

### 7. Use Destructuring

```typescript
// ✅ Good: Destructuring
const { name, email, age } = user;
const [first, second, ...rest] = items;

// ❌ Bad: Manual extraction
const name = user.name;
const email = user.email;
const age = user.age;
```

### 8. Use Array Methods

```typescript
// ✅ Good: Array methods
const names = users.map((user) => user.name);
const adults = users.filter((user) => user.age >= 18);
const total = prices.reduce((sum, price) => sum + price, 0);

// ❌ Bad: Manual loops
const names = [];
for (let i = 0; i < users.length; i++) {
  names.push(users[i].name);
}
```

### 9. Use Early Returns

```typescript
// ✅ Good: Early returns
function processUser(user: User | null): string {
  if (!user) return 'No user';
  if (!user.isActive) return 'Inactive';
  return user.name;
}

// ❌ Bad: Nested conditions
function processUser(user: User | null): string {
  if (user) {
    if (user.isActive) {
      return user.name;
    } else {
      return 'Inactive';
    }
  } else {
    return 'No user';
  }
}
```

### 10. Use Meaningful Names

```typescript
// ✅ Good: Descriptive names
const isUserAuthenticated = checkAuth();
const userProfileData = fetchProfile();

// ❌ Bad: Unclear names
const flag = checkAuth();
const data = fetchProfile();
```

## Troubleshooting

### ESLint Not Running

```bash
# Check ESLint is installed
pnpm list eslint

# Reinstall
pnpm install

# Check config
pnpm eslint --print-config src/index.ts

# Restart IDE ESLint server
# VS Code: Cmd+Shift+P → "ESLint: Restart ESLint Server"
```

### Prettier Conflicts with ESLint

```bash
# Ensure eslint-config-prettier is last in extends
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"  // Must be last!
  ]
}
```

### Git Hooks Not Running

```bash
# Reinstall hooks
rm -rf .husky
pnpm prepare

# Make hooks executable
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### Type Errors in IDE Only

```bash
# Restart TypeScript server
# VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

# Select workspace TypeScript
# VS Code: Cmd+Shift+P → "TypeScript: Select TypeScript Version"
# Choose "Use Workspace Version"

# Clear cache
rm -rf apps/*/tsconfig.tsbuildinfo
```

## Quick Reference

```bash
# Lint
pnpm lint              # Check all files
pnpm lint:fix          # Fix all files

# Format
pnpm format            # Format all files
pnpm format:check      # Check formatting

# Type check
pnpm typecheck:all     # Check all packages
cd apps/desktop && pnpm typecheck  # Check one package

# Full check
pnpm lint:fix && pnpm format && pnpm typecheck:all

# Git hooks
git commit             # Runs pre-commit automatically
git commit --no-verify # Skip hooks (emergency only)
```

## Resources

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [Prettier Documentation](https://prettier.io/docs/en/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
