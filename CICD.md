# CI/CD Pipeline Documentation

Comprehensive documentation for Continuous Integration and Continuous Deployment pipelines in AGI Workforce.

## Table of Contents

- [Overview](#overview)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Pipeline Architecture](#pipeline-architecture)
- [Build Process](#build-process)
- [Testing Strategy](#testing-strategy)
- [Deployment Automation](#deployment-automation)
- [Release Management](#release-management)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Overview

AGI Workforce uses GitHub Actions for CI/CD automation across all applications and services.

### CI/CD Philosophy

- **Continuous Integration:** Automated testing on every commit
- **Continuous Deployment:** Automated deployment on merge to main
- **Trunk-Based Development:** Short-lived feature branches
- **Fast Feedback:** Quick pipeline execution (<10 minutes)
- **Zero-Downtime:** Gradual rollout with rollback capability

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Developer Workflow                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Git Push/PR     │
                    └──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Continuous Integration (CI)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Checkout   │→ │  Install     │→ │    Lint      │          │
│  │     Code     │  │    Deps      │  │  (ESLint)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                              │                   │
│                              ┌───────────────┴───────────────┐   │
│                              ▼                               ▼   │
│                     ┌──────────────┐              ┌──────────────┐│
│                     │  Type Check  │              │    Test      ││
│                     │ (TypeScript) │              │  (Vitest)    ││
│                     └──────────────┘              └──────────────┘│
│                              │                               │   │
│                              └───────────────┬───────────────┘   │
│                                              ▼                   │
│                                     ┌──────────────┐             │
│                                     │    Build     │             │
│                                     │  All Apps    │             │
│                                     └──────┬───────┘             │
│                                            │                     │
│  ┌─────────────────────────────────────────┴──────────────────┐ │
│  │                   Rust Checks (Parallel)                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │  Cargo Test  │  │ Cargo Clippy │  │ Format Check │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────┬───────────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │   All Checks Pass   │
                         └──────────┬──────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              Continuous Deployment (CD) - Main Branch            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Web App (Vercel)                         │   │
│  │  - Automatic deployment on push to main                   │   │
│  │  - Preview deployments for PRs                            │   │
│  │  - Zero-downtime deployment                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Desktop App (On Tag v*)                      │   │
│  │  - Build for macOS, Windows, Linux                        │   │
│  │  - Code signing and notarization                          │   │
│  │  - Upload to GitHub Releases                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## GitHub Actions Workflows

### Workflow Files

All workflows are located in `.github/workflows/`:

| Workflow      | File            | Trigger            | Purpose                       |
| ------------- | --------------- | ------------------ | ----------------------------- |
| **CI**        | `ci.yml`        | Push, PR           | Lint, test, build             |
| **Release**   | `release.yml`   | Tag v\*            | Build and release desktop app |
| **E2E Tests** | `e2e-tests.yml` | Push, PR, schedule | End-to-end testing            |

### CI Workflow

**File:** `.github/workflows/ci.yml`

**Triggers:**

- Push to `main` branch
- Pull requests to `main` branch

**Jobs:**

```yaml
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      # 1. Setup environment
      - Checkout code
      - Install system dependencies (Linux)
      - Setup pnpm (v10)
      - Setup Node.js (v22)
      - Cache dependencies

      # 2. Install dependencies
      - pnpm install

      # 3. Code quality checks
      - Lint (ESLint)
      - Test (Vitest)

      # 4. Build all packages
      - Build @agiworkforce/types
      - Build @agiworkforce/utils
      - Build api-gateway
      - Build signaling-server
      - Build extension
      - Build web app

      # 5. Rust checks
      - Cargo test (default features)
      - Cargo clippy (default features)

  clippy-all-features:
    runs-on: ubuntu-latest
    continue-on-error: true # Non-blocking
    needs: check
    steps:
      - Cargo clippy (all features including OCR)
```

**Duration:** ~8-12 minutes

**Caching:**

- pnpm store
- Rust dependencies
- Next.js build cache

### Release Workflow

**File:** `.github/workflows/release.yml`

**Triggers:**

- Git tags matching `v*` (e.g., `v1.0.5`)
- Manual workflow dispatch

**Jobs:**

```yaml
jobs:
  create-release:
    runs-on: ubuntu-latest
    steps:
      - Extract version from tag
      - Create GitHub release (draft)
      - Return release ID

  build-tauri:
    needs: create-release
    strategy:
      matrix:
        platform:
          - windows-latest
          - ubuntu-22.04
          - macos-latest (universal binary)
    steps:
      # 1. Setup environment
      - Checkout code
      - Setup pnpm, Node.js, Rust
      - Install platform-specific dependencies
      - Cache Rust dependencies

      # 2. Build Tauri app
      - Install JS dependencies
      - Build Tauri app with signing
      - Upload artifacts to release

  publish-release:
    needs: [create-release, build-tauri]
    runs-on: ubuntu-latest
    steps:
      - Publish GitHub release (make public)
```

**Platform-Specific Builds:**

**macOS:**

- Universal binary (ARM64 + x86_64)
- DMG installer
- Code signing with Apple Developer ID
- Notarization (5-15 minutes)

**Windows:**

- x86_64 architecture
- MSI and EXE installers
- Optional code signing

**Linux:**

- x86_64 architecture
- AppImage, DEB, RPM packages

**Duration:** ~30-60 minutes (notarization is slowest)

### E2E Tests Workflow

**File:** `.github/workflows/e2e-tests.yml`

**Triggers:**

- Push to `main`, `develop` branches
- Pull requests to `main`, `develop`
- Scheduled (nightly at 2 AM UTC)
- Manual workflow dispatch

**Jobs:**

```yaml
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      # 1. Setup environment
      - Checkout code
      - Setup pnpm, Node.js
      - Install dependencies
      - Install Playwright browsers

      # 2. Build and start app
      - Build desktop web frontend
      - Start Vite dev server (background)
      - Wait for app to be ready (120s max)

      # 3. Run tests
      - Run smoke tests (--project=smoke)
      - Run chat tests (--project=chat)

      # 4. Upload artifacts (on failure)
      - Upload test results
      - Upload test videos
      - Upload app logs
```

**Test Projects:**

- **smoke:** Basic functionality tests
- **chat:** Chat feature tests
- **automation:** Workflow automation tests (optional)
- **agi:** AGI system tests (optional)

**Duration:** ~10-20 minutes

## Pipeline Architecture

### Build Matrix

```yaml
# Example: Test across multiple environments
strategy:
  matrix:
    node-version: [20, 22]
    os: [ubuntu-latest, windows-latest, macos-latest]
    include:
      - os: ubuntu-latest
        node-version: 22
        rust-version: 1.90.0
```

### Dependency Caching

**pnpm Cache:**

```yaml
- uses: pnpm/action-setup@v3
  with:
    version: 10

- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'pnpm'
```

**Rust Cache:**

```yaml
- uses: Swatinem/rust-cache@v2
  with:
    workspaces: apps/desktop/src-tauri
    cache-on-failure: true
```

**Next.js Cache:**

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}
```

### Secrets Management

**Required Secrets:**

```yaml
# GitHub Actions Secrets (Repository Settings → Secrets)
GITHUB_TOKEN                           # Auto-provided by GitHub
TAURI_SIGNING_PRIVATE_KEY              # Tauri app signing
TAURI_SIGNING_PRIVATE_KEY_PASSWORD     # Signing key password

# Optional for macOS notarization
APPLE_ID                               # Apple Developer ID email
APPLE_TEAM_ID                          # Apple Team ID
APPLE_PASSWORD                         # App-specific password

# Optional for Windows signing
WINDOWS_CERTIFICATE                    # Code signing certificate
WINDOWS_CERTIFICATE_PASSWORD           # Certificate password

# Optional for deployment
VERCEL_TOKEN                           # Vercel API token
VERCEL_ORG_ID                          # Vercel organization ID
VERCEL_PROJECT_ID                      # Vercel project ID
```

**Accessing Secrets:**

```yaml
- name: Build with secrets
  env:
    SECRET_KEY: ${{ secrets.SECRET_KEY }}
  run: pnpm build
```

## Build Process

### Monorepo Build Strategy

**Build Order:**

```
1. Shared packages (types, utils)
   └─ Required by all apps

2. Backend services (api-gateway, signaling-server)
   └─ Independent builds

3. Frontend apps (web, desktop)
   └─ Depend on shared packages

4. Browser extension
   └─ Independent build
```

**Build Commands:**

```bash
# Build all (except desktop)
pnpm build

# Build specific app
pnpm --filter @agiworkforce/web build
pnpm --filter @agiworkforce/desktop build

# Build with dependencies
pnpm --filter @agiworkforce/web... build
```

### Desktop App Build

**Build Process:**

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Build frontend
cd apps/desktop && pnpm build:web

# 3. Build Tauri app (Rust + bundle)
cd src-tauri && cargo build --release
tauri build
```

**Artifacts:**

```
macOS:
  - AGI Workforce_1.0.5_universal.dmg
  - AGI Workforce_1.0.5_universal.app.tar.gz

Windows:
  - AGI Workforce_1.0.5_x64_en-US.msi
  - AGI Workforce_1.0.5_x64-setup.exe

Linux:
  - agi-workforce_1.0.5_amd64.AppImage
  - agi-workforce_1.0.5_amd64.deb
  - agi-workforce-1.0.5-1.x86_64.rpm
```

### Web App Build

**Build Process:**

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared packages
pnpm --filter @agiworkforce/types build
pnpm --filter @agiworkforce/utils build

# 3. Build Next.js app
cd apps/web && pnpm build

# Output: apps/web/.next
```

**Optimizations:**

- Tree shaking
- Code splitting
- Image optimization
- Font optimization
- Minification
- Compression (Brotli, gzip)

## Testing Strategy

### Test Pyramid

```
         ┌──────────────┐
         │     E2E      │  ← 10% (Slow, expensive)
         │   (Playwright)│
         ├──────────────┤
         │ Integration  │  ← 20% (Medium speed)
         │   (Vitest)   │
         ├──────────────┤
         │     Unit     │  ← 70% (Fast, cheap)
         │   (Vitest)   │
         └──────────────┘
```

### Unit & Integration Tests

**Run Tests:**

```bash
# All tests
pnpm test

# Specific app
pnpm --filter @agiworkforce/web test

# Watch mode
pnpm --filter @agiworkforce/web test:watch

# Coverage
pnpm --filter @agiworkforce/web test:coverage
```

**Configuration:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
```

### E2E Tests

**Run Tests:**

```bash
# All E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Specific project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke

# UI mode (debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Debug mode
pnpm --filter @agiworkforce/desktop test:e2e -- --debug
```

**Configuration:**

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/ },
    { name: 'chat', testMatch: /chat\.spec\.ts/ },
  ],
});
```

### Rust Tests

**Run Tests:**

```bash
# All tests
cargo test --workspace

# Specific package
cargo test -p agiworkforce

# With output
cargo test -- --nocapture

# Specific test
cargo test test_name
```

**Test Organization:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feature() {
        assert_eq!(2 + 2, 4);
    }

    #[tokio::test]
    async fn test_async_feature() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

## Deployment Automation

### Web App Deployment

**Vercel Integration:**

```yaml
# Automatic via Vercel GitHub integration
# No workflow needed - Vercel handles:
# 1. Build on push to main
# 2. Preview deployments on PRs
# 3. Production deployment on merge
```

**Manual Deployment (CLI):**

```yaml
name: Deploy Web
on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          npm install -g vercel
          vercel deploy --prod --token=$VERCEL_TOKEN
```

### Desktop App Deployment

**Automatic on Tag:**

```bash
# 1. Update version
vim apps/desktop/src-tauri/tauri.conf.json  # version: "1.0.5"
vim apps/desktop/src-tauri/Cargo.toml       # version = "1.0.5"

# 2. Commit changes
git add .
git commit -m "chore: bump version to 1.0.5"

# 3. Create and push tag
git tag -a v1.0.5 -m "Release v1.0.5"
git push origin v1.0.5

# 4. GitHub Actions automatically:
#    - Creates release
#    - Builds for all platforms
#    - Uploads artifacts
#    - Publishes release
```

### Backend Services Deployment

**Manual Deployment (SSH):**

```yaml
name: Deploy Services
on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to server
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
        run: |
          # Setup SSH
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa

          # Deploy
          ssh -o StrictHostKeyChecking=no user@$SERVER_HOST << 'EOF'
            cd /opt/agiworkforce
            git pull origin main
            pnpm install
            pnpm build
            pm2 restart all
          EOF
```

**Docker Deployment (Future):**

```yaml
name: Deploy Docker
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          docker build -t agiworkforce/api-gateway:latest .
          docker push agiworkforce/api-gateway:latest

      - name: Deploy to production
        run: |
          kubectl set image deployment/api-gateway \
            api-gateway=agiworkforce/api-gateway:latest
```

## Release Management

### Semantic Versioning

**Version Format:** `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes

**Examples:**

- `1.0.0` → Initial release
- `1.0.1` → Bug fix
- `1.1.0` → New feature
- `2.0.0` → Breaking change

### Release Process

**1. Prepare Release:**

```bash
# Update version numbers
# Update CHANGELOG.md
# Run tests locally
pnpm test
pnpm typecheck:all
```

**2. Create Release:**

```bash
# Commit version changes
git add .
git commit -m "chore: release v1.0.5"

# Create tag
git tag -a v1.0.5 -m "Release v1.0.5

New Features:
- Feature A
- Feature B

Bug Fixes:
- Fix X
- Fix Y

Breaking Changes:
- None
"

# Push tag
git push origin v1.0.5
```

**3. Monitor Release:**

```bash
# Watch GitHub Actions
gh run watch

# Check release
gh release view v1.0.5

# Download artifacts
gh release download v1.0.5
```

**4. Verify Release:**

```bash
# Test auto-updater
# Download and install manually
# Check health endpoints
curl https://agiworkforce.com/api/health
```

### Changelog Management

**Format:**

```markdown
# Changelog

## [1.0.5] - 2026-01-15

### Added

- New AGI reasoning system
- Enhanced MCP integration

### Changed

- Improved performance of LLM router
- Updated dependencies

### Fixed

- Fixed memory leak in WebSocket server
- Resolved database connection pool exhaustion

### Security

- Updated vulnerable dependencies
- Added rate limiting to API endpoints

## [1.0.4] - 2026-01-10

...
```

### Hotfix Process

**Urgent bug fix process:**

```bash
# 1. Create hotfix branch from main
git checkout main
git checkout -b hotfix/v1.0.6

# 2. Fix bug
vim file.ts
git add .
git commit -m "fix: critical bug"

# 3. Bump patch version
vim tauri.conf.json  # 1.0.6

# 4. Merge to main
git checkout main
git merge --no-ff hotfix/v1.0.6

# 5. Tag and release
git tag v1.0.6
git push origin main v1.0.6

# 6. Cleanup
git branch -d hotfix/v1.0.6
```

## Security

### Code Scanning

**GitHub Advanced Security:**

```yaml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
```

### Dependency Scanning

**Dependabot Configuration:**

```yaml
# .github/dependabot.yml
version: 2
updates:
  # JavaScript dependencies
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    groups:
      production-dependencies:
        dependency-type: 'production'
      development-dependencies:
        dependency-type: 'development'

  # Rust dependencies
  - package-ecosystem: 'cargo'
    directory: '/apps/desktop/src-tauri'
    schedule:
      interval: 'weekly'

  # GitHub Actions
  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

**Manual Audit:**

```bash
# npm audit
pnpm audit
pnpm audit fix

# Rust audit
cargo audit
cargo audit fix
```

### Secret Scanning

**Prevent secrets in code:**

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scanning
on: [push, pull_request]

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
```

### Security Best Practices

**1. Minimize Permissions:**

```yaml
jobs:
  build:
    permissions:
      contents: read # Read repository
      pull-requests: read # Read PRs
      # Don't grant unnecessary permissions
```

**2. Pin Action Versions:**

```yaml
# Bad: Uses latest (unpredictable)
- uses: actions/checkout@v4

# Good: Pin to specific commit
- uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.0.0
```

**3. Use GITHUB_TOKEN:**

```yaml
# Auto-provided token with minimal permissions
- name: Create release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: gh release create v1.0.0
```

**4. Audit Third-Party Actions:**

```yaml
# Only use actions from trusted sources:
# - actions/* (GitHub official)
# - Major OSS projects with good reputation
# - Your own organization
```

## Troubleshooting

### Common Issues

**1. Build Fails on CI but Works Locally:**

```bash
# Check Node/pnpm versions match
node --version   # Should be 22.x
pnpm --version   # Should be 9.15.3+

# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install --frozen-lockfile

# Check for environment-specific issues
# CI uses production build, local uses development
NODE_ENV=production pnpm build
```

**2. Rust Build Fails:**

```bash
# Update Rust toolchain
rustup update

# Check Rust version matches CI
rustc --version  # Should be 1.90.0+

# Clear Rust cache
cargo clean

# Check platform-specific dependencies (Linux)
sudo apt-get install libwebkit2gtk-4.1-dev build-essential
```

**3. Test Timeouts:**

```typescript
// Increase timeout in test
test('slow operation', async () => {
  // ...
}, 60000); // 60 seconds

// Or in Playwright config
use: {
  timeout: 60000,
}
```

**4. Cache Issues:**

```yaml
# Clear all caches manually in GitHub Actions
# Settings → Actions → Caches → Delete all

# Or use cache key versioning
- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-v2-${{ hashFiles('**/pnpm-lock.yaml') }}
```

### Debugging Workflows

**Enable Debug Logging:**

```bash
# Set secrets in repository settings:
ACTIONS_STEP_DEBUG=true
ACTIONS_RUNNER_DEBUG=true
```

**Use tmate for SSH Access:**

```yaml
- name: Setup tmate session
  uses: mxschmitt/action-tmate@v3
  if: failure() # Only on failure
```

**Check Workflow Logs:**

```bash
# View recent runs
gh run list

# View specific run
gh run view <run-id>

# Download logs
gh run download <run-id>
```

### Performance Optimization

**Parallelize Jobs:**

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: pnpm test --shard=${{ matrix.shard }}/4
```

**Use Build Matrix:**

```yaml
jobs:
  test:
    strategy:
      matrix:
        node: [20, 22]
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
```

**Cache Aggressively:**

```yaml
# Cache everything possible
- pnpm store
- Next.js build cache
- Rust target directory
- Playwright browsers
```

---

**Last Updated:** 2026-01-15
**Version:** 1.0
**Maintained By:** DevOps Team
