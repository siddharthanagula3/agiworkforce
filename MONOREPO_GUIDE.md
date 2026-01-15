# Monorepo Management Guide

Complete guide to managing the AGI Workforce monorepo using pnpm workspaces.

## Table of Contents

- [Monorepo Structure](#monorepo-structure)
- [Workspace Configuration](#workspace-configuration)
- [Working with Workspaces](#working-with-workspaces)
- [Dependency Management](#dependency-management)
- [Adding New Packages](#adding-new-packages)
- [Sharing Code](#sharing-code)
- [Publishing Packages](#publishing-packages)
- [Best Practices](#best-practices)

## Monorepo Structure

The repository follows a standard monorepo layout:

```
agiworkforce/
├── apps/                    # Application packages
│   ├── desktop/            # Tauri desktop app
│   ├── web/                # Next.js web app
│   └── extension/          # Browser extension
├── services/               # Backend services
│   ├── api-gateway/        # REST API server
│   └── signaling-server/   # WebSocket server
├── packages/               # Shared packages
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Shared utilities
├── tools/                  # Development tools
├── package.json            # Root package.json
└── pnpm-workspace.yaml     # Workspace configuration
```

### Package Naming Convention

All packages use the `@agiworkforce` scope:

- `@agiworkforce/desktop`
- `@agiworkforce/web`
- `@agiworkforce/api-gateway`
- `@agiworkforce/signaling-server`
- `@agiworkforce/types`
- `@agiworkforce/utils`

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
  - 'tools/*'
```

This tells pnpm to treat all directories under these paths as workspaces.

### Root package.json

```json
{
  "name": "agiworkforce",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.15.3",
  "engines": {
    "node": ">=22.12.0",
    "pnpm": ">=9.15.0"
  }
}
```

Key fields:

- `private: true` - Prevents accidental publishing
- `packageManager` - Enforces pnpm version
- `engines` - Enforces Node.js and pnpm versions

### Workspace package.json

Each workspace has its own `package.json`:

```json
{
  "name": "@agiworkforce/desktop",
  "version": "1.0.4",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "vite build && tauri build"
  },
  "dependencies": {
    "@agiworkforce/types": "workspace:*",
    "@agiworkforce/utils": "workspace:*",
    "react": "^19.2.3"
  }
}
```

Key points:

- `workspace:*` links to local workspace packages
- Each workspace can have independent dependencies
- Scripts are workspace-specific

## Working with Workspaces

### Running Commands

#### Global Commands (Root Level)

```bash
# Run in all workspaces recursively
pnpm -r <command>

# Examples
pnpm -r test        # Run tests in all workspaces
pnpm -r build       # Build all workspaces
pnpm -r lint        # Lint all workspaces
```

#### Filtered Commands

```bash
# Run in specific workspace
pnpm --filter <workspace-name> <command>

# Examples
pnpm --filter @agiworkforce/desktop dev
pnpm --filter @agiworkforce/web build
pnpm --filter @agiworkforce/api-gateway test

# Multiple filters
pnpm --filter @agiworkforce/desktop --filter @agiworkforce/web test

# Pattern filters
pnpm --filter "./apps/*" build        # All apps
pnpm --filter "./services/*" test     # All services
pnpm --filter "!@agiworkforce/desktop" build  # All except desktop
```

#### Workspace Directory Commands

```bash
# Navigate to workspace
cd apps/desktop

# Run commands directly
pnpm dev
pnpm build
pnpm test

# Equivalent to:
cd ../../
pnpm --filter @agiworkforce/desktop dev
```

### Common Workflow Examples

#### Start Multiple Services

```bash
# Option 1: Multiple terminals
pnpm --filter @agiworkforce/desktop dev
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev

# Option 2: Using a process manager (not included, but recommended)
# npm install -g pm2
# pm2 start ecosystem.config.js
```

#### Build Specific Apps

```bash
# Build web and services only (skip desktop)
pnpm --filter "./apps/web" --filter "./services/*" build

# Build everything except desktop
pnpm --filter "!@agiworkforce/desktop" build
```

#### Run Tests Selectively

```bash
# Test all apps
pnpm --filter "./apps/*" test

# Test all services
pnpm --filter "./services/*" test

# Test desktop and web only
pnpm --filter @agiworkforce/desktop --filter @agiworkforce/web test
```

## Dependency Management

### Adding Dependencies

#### Add to Specific Workspace

```bash
# Add to desktop app
pnpm --filter @agiworkforce/desktop add react-query

# Add dev dependency
pnpm --filter @agiworkforce/desktop add -D vitest

# Add peer dependency
pnpm --filter @agiworkforce/desktop add -P react
```

#### Add to Root (Shared Dev Dependencies)

```bash
# Add to root (for all workspaces)
pnpm add -D -w eslint prettier typescript

# -w flag adds to workspace root
```

#### Add Workspace Dependency

```bash
# Link to another workspace
pnpm --filter @agiworkforce/desktop add @agiworkforce/types@workspace:*

# Or manually edit package.json:
{
  "dependencies": {
    "@agiworkforce/types": "workspace:*"
  }
}
```

### Updating Dependencies

```bash
# Update all dependencies in all workspaces
pnpm -r update

# Update specific package in all workspaces
pnpm -r update react

# Update in specific workspace
pnpm --filter @agiworkforce/desktop update react

# Interactive update
pnpm -r update -i
```

### Removing Dependencies

```bash
# Remove from specific workspace
pnpm --filter @agiworkforce/desktop remove react-query

# Remove from root
pnpm remove -w eslint
```

### Version Management

#### Workspace Protocol

The `workspace:*` protocol ensures:

- Local packages are linked during development
- Replaced with actual versions during publish

```json
{
  "dependencies": {
    "@agiworkforce/types": "workspace:*" // Links to packages/types
  }
}
```

#### Workspace Version Ranges

```json
{
  "dependencies": {
    "@agiworkforce/types": "workspace:^1.0.0" // Specific version range
  }
}
```

## Adding New Packages

### Creating a New Workspace Package

```bash
# 1. Create directory
mkdir packages/my-package

# 2. Initialize package.json
cd packages/my-package
pnpm init

# 3. Edit package.json
{
  "name": "@agiworkforce/my-package",
  "version": "1.0.0",
  "private": true,  // If not publishing
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}

# 4. Create source files
mkdir src
touch src/index.ts

# 5. Add TypeScript config
touch tsconfig.json

# 6. Install dependencies
pnpm install

# 7. Link to other workspaces
cd ../desktop
pnpm add @agiworkforce/my-package@workspace:*
```

### Example: New Shared Package

Let's create a new shared package `@agiworkforce/config`:

```bash
# 1. Create structure
mkdir -p packages/config/src

# 2. Create package.json
cat > packages/config/package.json << 'EOF'
{
  "name": "@agiworkforce/config",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
EOF

# 3. Create tsconfig.json
cat > packages/config/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# 4. Create source file
cat > packages/config/src/index.ts << 'EOF'
export const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  wsUrl: process.env.WS_URL || 'ws://localhost:4000',
};
EOF

# 5. Add to desktop app
pnpm --filter @agiworkforce/desktop add @agiworkforce/config@workspace:*

# 6. Use in code
import { config } from '@agiworkforce/config';
console.log('API URL:', config.apiUrl);
```

## Sharing Code

### Sharing Types

**packages/types/src/index.ts:**

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
```

**Usage in desktop app:**

```typescript
import type { User, ChatMessage } from '@agiworkforce/types';

const user: User = {
  id: '1',
  email: 'user@example.com',
  name: 'John Doe',
};
```

### Sharing Utilities

**packages/utils/src/index.ts:**

```typescript
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function (...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
```

**Usage:**

```typescript
import { formatDate, debounce } from '@agiworkforce/utils';

const formatted = formatDate(new Date());
const debouncedSearch = debounce((query: string) => {
  // search logic
}, 300);
```

### Sharing Components (React)

If sharing React components, create `packages/ui`:

```bash
mkdir -p packages/ui/src/components

# package.json
{
  "name": "@agiworkforce/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": {
    "react": "^19.2.3"
  }
}

# src/components/Button.tsx
export function Button({ children, onClick }) {
  return (
    <button onClick={onClick}>
      {children}
    </button>
  );
}

# src/index.ts
export { Button } from './components/Button';
```

### Path Aliases

Configure path aliases in `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@agiworkforce/types": ["packages/types/src/index.ts"],
      "@agiworkforce/utils": ["packages/utils/src/index.ts"],
      "@agiworkforce/ui": ["packages/ui/src/index.ts"]
    }
  }
}
```

## Publishing Packages

While most packages are private, here's how to publish if needed:

### Prepare for Publishing

```json
// package.json
{
  "name": "@agiworkforce/my-package",
  "version": "1.0.0",
  "private": false, // Allow publishing
  "publishConfig": {
    "access": "public" // For scoped packages
  },
  "files": ["dist", "README.md"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

### Build Before Publishing

```bash
# Add build script
{
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "pnpm build"
  }
}

# Build
pnpm --filter @agiworkforce/my-package build
```

### Publish

```bash
# Publish single package
cd packages/my-package
pnpm publish

# Publish all changed packages
pnpm -r publish

# Dry run
pnpm publish --dry-run
```

### Version Management

```bash
# Update version
pnpm --filter @agiworkforce/my-package version patch
pnpm --filter @agiworkforce/my-package version minor
pnpm --filter @agiworkforce/my-package version major

# Or use a tool like changesets
pnpm add -D -w @changesets/cli
pnpm changeset
```

## Best Practices

### 1. Keep Shared Packages Lean

```typescript
// ✅ Good: Focused, single-responsibility
// packages/validation/src/index.ts
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ❌ Bad: Too many unrelated utilities
// packages/utils/src/index.ts
export function validateEmail() {}
export function parseDate() {}
export function fetchData() {} // Too broad
```

### 2. Use Workspace Protocol

```json
{
  "dependencies": {
    "@agiworkforce/types": "workspace:*" // ✅ Good
    // "@agiworkforce/types": "^1.0.0"    // ❌ Bad: Won't link locally
  }
}
```

### 3. Avoid Circular Dependencies

```typescript
// ❌ Bad: Circular dependency
// packages/utils imports from packages/types
// packages/types imports from packages/utils

// ✅ Good: One-way dependency
// packages/types (no imports)
// packages/utils imports from packages/types
```

### 4. Clear Package Boundaries

```
packages/
├── types/          # Only types, no runtime code
├── utils/          # Pure utilities, no React/UI
├── ui/             # React components
└── config/         # Configuration constants
```

### 5. Document Dependencies

```json
{
  "dependencies": {
    // Runtime dependencies
    "react": "^19.2.3",

    // Workspace dependencies
    "@agiworkforce/types": "workspace:*",
    "@agiworkforce/utils": "workspace:*"
  },
  "devDependencies": {
    // Build tools
    "typescript": "^5.9.3",
    "vite": "^7.3.1"
  }
}
```

### 6. Consistent TypeScript Configuration

Extend from root config:

```json
// packages/my-package/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### 7. Use Scripts Consistently

Define common scripts across all packages:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

### 8. Lock File Management

```bash
# Always use --frozen-lockfile in CI
pnpm install --frozen-lockfile

# Update lock file
pnpm install

# Never commit with mismatched lock file
```

### 9. Workspace Dependencies Update

```bash
# Update workspace dependencies after changes
pnpm install

# pnpm automatically re-links workspace packages
```

### 10. Clean Build Artifacts

```bash
# Clean specific workspace
pnpm --filter @agiworkforce/desktop exec rm -rf dist

# Clean all workspaces
pnpm -r exec rm -rf dist

# Or use root script
pnpm clean:build
```

## Troubleshooting

### Issue: Workspace package not found

```bash
# Ensure pnpm-workspace.yaml includes the directory
# Re-run install
pnpm install
```

### Issue: Changes not reflected

```bash
# Re-link workspaces
pnpm install

# Or rebuild the package
pnpm --filter @agiworkforce/types build
```

### Issue: Circular dependencies

```bash
# Analyze dependency graph
pnpm list --depth=0

# Or use a tool
npx madge --circular apps/desktop/src
```

### Issue: Version conflicts

```bash
# Check what version is installed
pnpm why react

# Update to consistent version
pnpm -r update react@19.2.3
```

## Advanced Topics

### Conditional Dependencies

```json
{
  "dependencies": {
    "react": "^19.2.3"
  },
  "optionalDependencies": {
    "@agiworkforce/optional-feature": "workspace:*"
  }
}
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": false
    }
  }
}
```

### Overrides

Force specific versions:

```json
// Root package.json
{
  "pnpm": {
    "overrides": {
      "vulnerable-package": "^2.0.0"
    }
  }
}
```

### Catalogs (pnpm 9.15+)

Define shared dependency versions:

```yaml
# pnpm-workspace.yaml
catalog:
  react: ^19.2.3
  typescript: ^5.9.3
```

```json
// package.json
{
  "dependencies": {
    "react": "catalog:",
    "typescript": "catalog:"
  }
}
```

## Quick Reference

```bash
# Run in all workspaces
pnpm -r <command>

# Run in specific workspace
pnpm --filter <name> <command>

# Add dependency
pnpm --filter <name> add <package>

# Add workspace dependency
pnpm --filter <name> add @agiworkforce/<package>@workspace:*

# Update dependencies
pnpm -r update

# Clean build
pnpm -r exec rm -rf dist

# Type check all
pnpm typecheck:all

# Lint all
pnpm lint

# Test all
pnpm test
```

## Resources

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [pnpm CLI Reference](https://pnpm.io/cli/add)
- [Monorepo Best Practices](https://monorepo.tools/)
