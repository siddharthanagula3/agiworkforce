# Troubleshooting Guide

Common issues and their solutions when developing AGI Workforce.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Server Issues](#development-server-issues)
- [Build Issues](#build-issues)
- [Database Issues](#database-issues)
- [Testing Issues](#testing-issues)
- [Git Hooks Issues](#git-hooks-issues)
- [IDE Issues](#ide-issues)
- [Platform-Specific Issues](#platform-specific-issues)

## Installation Issues

### Issue: pnpm install fails with EACCES error

**Symptoms:**

```
Error: EACCES: permission denied
```

**Solution:**

```bash
# Never use sudo with pnpm
# Fix npm permissions instead
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to ~/.bashrc or ~/.zshrc
export PATH=~/.npm-global/bin:$PATH

# Reinstall pnpm
npm install -g pnpm@9.15.3
```

### Issue: pnpm install hangs or is very slow

**Symptoms:**

- Install takes > 10 minutes
- Terminal shows no progress

**Solution:**

```bash
# 1. Clear pnpm cache
pnpm store prune

# 2. Delete lock file and node_modules
rm -rf pnpm-lock.yaml node_modules apps/*/node_modules services/*/node_modules

# 3. Reinstall
pnpm install

# 4. If still slow, check network
# Try using different registry
pnpm install --registry https://registry.npmmirror.com
```

### Issue: Peer dependency warnings

**Symptoms:**

```
WARN Issues with peer dependencies found
```

**Solution:**

```bash
# Ignore peer dependency warnings (they're expected)
# If install fails, force it
pnpm install --force

# Or add to .npmrc
auto-install-peers=true
```

### Issue: Wrong Node.js or pnpm version

**Symptoms:**

```
Error: Unsupported engine
```

**Solution:**

```bash
# Check versions
node --version  # Should be >= 22.12.0
pnpm --version  # Should be >= 9.15.0

# Update Node.js
# Using nvm (recommended)
nvm install 22.12.0
nvm use 22.12.0

# Or download from nodejs.org

# Update pnpm
npm install -g pnpm@9.15.3
```

## Development Server Issues

### Issue: Port already in use

**Symptoms:**

```
Error: Port 5173 is already in use
Error: listen EADDRINUSE :::3000
```

**Solution:**

```bash
# Find and kill process using the port
# Desktop (port 5173)
lsof -ti:5173 | xargs kill -9

# Web (port 3000)
lsof -ti:3000 | xargs kill -9

# Or use different port
VITE_DEV_PORT=5174 pnpm dev:desktop
PORT=3001 cd apps/web && pnpm dev
```

### Issue: Tauri dev server fails to start

**Symptoms:**

```
Error: Failed to start dev server
thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value'
```

**Solution:**

```bash
# 1. Check Rust is installed
rustc --version

# If not installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Update Rust
rustup update stable

# 3. Clean Rust build cache
cd apps/desktop/src-tauri
cargo clean

# 4. Try again
cd ../..
pnpm dev:desktop
```

### Issue: Hot reload not working

**Symptoms:**

- Changes don't reflect in the app
- Need to restart server

**Solution:**

```bash
# 1. Check file watchers limit (Linux/macOS)
# macOS
sysctl -w kern.maxfiles=524288
sysctl -w kern.maxfilesperproc=524288

# Linux
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 2. Restart Vite with force flag
pnpm dev:desktop --force

# 3. Clear Vite cache
rm -rf apps/desktop/node_modules/.vite
pnpm dev:desktop
```

### Issue: WebSocket connection failed

**Symptoms:**

```
WebSocket connection failed: Error during WebSocket handshake
```

**Solution:**

```bash
# 1. Check if signaling server is running
curl http://localhost:4000/health

# 2. Start signaling server
pnpm --filter @agiworkforce/signaling-server dev

# 3. Check environment variables
# Ensure VITE_SIGNALING_SERVER_URL is set correctly
echo $VITE_SIGNALING_SERVER_URL

# 4. Check CORS settings in signaling-server/src/index.ts
```

### Issue: Module not found errors

**Symptoms:**

```
Error: Cannot find module '@/components/Button'
```

**Solution:**

```bash
# 1. Check if file exists
ls apps/desktop/src/components/Button.tsx

# 2. Restart TypeScript server in IDE
# VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"

# 3. Check path aliases in tsconfig.json
# Ensure @ is mapped correctly

# 4. Reinstall dependencies
pnpm install

# 5. Clear cache and restart
rm -rf apps/desktop/node_modules/.vite
pnpm dev:desktop
```

## Build Issues

### Issue: Desktop build fails with Rust errors

**Symptoms:**

```
error: could not compile `desktop` due to previous error
```

**Solution:**

```bash
# 1. Update Rust
rustup update stable

# 2. Clean build
cd apps/desktop/src-tauri
cargo clean
cd ../..

# 3. Check for syntax errors in Rust files
cd apps/desktop/src-tauri
cargo check

# 4. Rebuild
pnpm build:desktop
```

### Issue: Out of memory during build

**Symptoms:**

```
JavaScript heap out of memory
FATAL ERROR: Reached heap limit
```

**Solution:**

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Then rebuild
pnpm build

# Or use it inline
NODE_OPTIONS="--max-old-space-size=8192" pnpm build:desktop
```

### Issue: Vite build fails with chunk size warnings

**Symptoms:**

```
(!) Some chunks are larger than 500 KiB after minification
```

**Solution:**

```bash
# This is a warning, not an error
# Build should still succeed

# To fix, update vite.config.ts:
# Increase chunkSizeWarningLimit or improve code splitting

# Or ignore the warning
pnpm build:desktop --force
```

### Issue: TypeScript errors during build

**Symptoms:**

```
error TS2322: Type 'string' is not assignable to type 'number'
```

**Solution:**

```bash
# 1. Fix the type errors in your code
# Check the file and line number in the error

# 2. If types are correct, regenerate types
pnpm typecheck:all

# 3. Clear TypeScript cache
rm -rf apps/desktop/tsconfig.tsbuildinfo
rm -rf apps/web/tsconfig.tsbuildinfo

# 4. Restart TypeScript server in IDE
```

### Issue: Next.js build fails

**Symptoms:**

```
Error: Failed to compile
```

**Solution:**

```bash
cd apps/web

# 1. Check for errors
pnpm typecheck
pnpm lint

# 2. Clear Next.js cache
rm -rf .next

# 3. Reinstall dependencies
rm -rf node_modules
pnpm install

# 4. Build again
pnpm build
```

## Database Issues

### Issue: SQLite database locked

**Symptoms:**

```
Error: database is locked
SQLITE_BUSY: database is locked
```

**Solution:**

```bash
# 1. Close all instances of the desktop app

# 2. Delete database file (will be recreated)
# macOS
rm -rf ~/Library/Application\ Support/com.agiworkforce.app/agiworkforce.db*

# Windows
# Delete: %APPDATA%\com.agiworkforce.app\agiworkforce.db

# Linux
rm -rf ~/.config/com.agiworkforce.app/agiworkforce.db*

# 3. Restart app
pnpm dev:desktop
```

### Issue: Supabase connection failed

**Symptoms:**

```
Error: Invalid Supabase URL
Error: Failed to fetch
```

**Solution:**

```bash
# 1. Check environment variables
echo $VITE_SUPABASE_URL
echo $VITE_SUPABASE_ANON_KEY

# 2. Verify Supabase project is running
# Visit https://app.supabase.com/project/YOUR_PROJECT/settings/api

# 3. Check network connection
curl -I https://YOUR_PROJECT.supabase.co

# 4. Update .env.local with correct values

# 5. Restart dev server
pnpm dev:desktop
```

### Issue: Migration fails

**Symptoms:**

```
Error: relation "table_name" does not exist
```

**Solution:**

```bash
cd apps/web

# 1. Check migration files
ls supabase/migrations/

# 2. Run migrations manually in Supabase SQL Editor
# Copy SQL from migration files

# 3. Verify tables exist
# In Supabase Dashboard -> Table Editor

# 4. If using local Supabase
supabase db reset
supabase db push
```

## Testing Issues

### Issue: Tests fail with timeout

**Symptoms:**

```
Error: Timeout of 5000ms exceeded
```

**Solution:**

```typescript
// Increase timeout for specific test
test('slow test', async () => {
  // ...
}, { timeout: 30000 }); // 30 seconds

// Or globally in vitest.config.ts
test: {
  testTimeout: 10000,
}
```

### Issue: E2E tests fail to find elements

**Symptoms:**

```
Error: Timed out waiting for selector
```

**Solution:**

```typescript
// 1. Increase timeout
await page.waitForSelector('[data-testid="button"]', {
  timeout: 10000,
});

// 2. Add explicit wait
await page.waitForLoadState('networkidle');

// 3. Check if element actually exists
// Run test in UI mode
pnpm test:e2e:ui

// 4. Add data-testid to element
<button data-testid="submit-button">Submit</button>
```

### Issue: Tests pass locally but fail in CI

**Symptoms:**

- Tests green on local machine
- Red in GitHub Actions

**Solution:**

```bash
# 1. Run tests in CI mode locally
CI=1 pnpm test

# 2. Check for timing issues
# Add waits for async operations

# 3. Check for environment differences
# Ensure .env.test is committed

# 4. Check for flaky tests
# Run tests multiple times
for i in {1..10}; do pnpm test || break; done
```

### Issue: Mock Service Worker errors

**Symptoms:**

```
Error: MSW not initialized
```

**Solution:**

```typescript
// In test setup file (test/setup.ts)
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Git Hooks Issues

### Issue: Pre-commit hook fails

**Symptoms:**

```
Error: Command failed with exit code 1
husky > pre-commit hook failed
```

**Solution:**

```bash
# 1. Fix linting errors
pnpm lint:fix

# 2. Fix formatting
pnpm format

# 3. If stuck, skip hook temporarily (not recommended)
git commit --no-verify -m "message"

# 4. Reinstall hooks
rm -rf .husky
pnpm prepare
```

### Issue: Commitlint rejects commit message

**Symptoms:**

```
Error: subject may not be empty
type must be one of [feat, fix, docs, ...]
```

**Solution:**

```bash
# Use conventional commit format:
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug"
git commit -m "docs: update README"

# Valid types:
# feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert

# Format: type(scope?): subject
# Example:
git commit -m "feat(desktop): add chat export"
git commit -m "fix(web): resolve login issue"
```

### Issue: Lint-staged hangs

**Symptoms:**

- Commit process hangs
- Terminal shows no output

**Solution:**

```bash
# 1. Kill the process
Ctrl+C

# 2. Run manually
pnpm exec lint-staged

# 3. If issue persists, update lint-staged
pnpm add -D lint-staged@latest

# 4. Clear git cache
git rm -r --cached .
git add .
```

## IDE Issues

### Issue: VS Code TypeScript errors

**Symptoms:**

- Red squiggles everywhere
- Errors that don't show in terminal

**Solution:**

```bash
# 1. Restart TypeScript server
# Cmd+Shift+P -> "TypeScript: Restart TS Server"

# 2. Select workspace TypeScript version
# Cmd+Shift+P -> "TypeScript: Select TypeScript Version"
# Choose "Use Workspace Version"

# 3. Delete TypeScript cache
rm -rf apps/desktop/tsconfig.tsbuildinfo
rm -rf apps/web/tsconfig.tsbuildinfo

# 4. Reload VS Code window
# Cmd+Shift+P -> "Developer: Reload Window"
```

### Issue: ESLint not working in IDE

**Symptoms:**

- No linting errors shown
- Format on save not working

**Solution:**

```json
// .vscode/settings.json
{
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Issue: Path aliases not resolving

**Symptoms:**

```
Cannot find module '@/components/Button'
```

**Solution:**

```bash
# 1. Check tsconfig.json has correct paths
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}

# 2. Restart TypeScript server

# 3. Check jsconfig.json if using JavaScript

# 4. Reinstall dependencies
pnpm install
```

## Platform-Specific Issues

### macOS Issues

#### Issue: "App is damaged" error

**Symptoms:**

```
"AGI Workforce.app" is damaged and can't be opened
```

**Solution:**

```bash
# Remove quarantine attribute
xattr -cr "/Applications/AGI Workforce.app"
```

#### Issue: Developer cannot be verified

**Symptoms:**

```
"AGI Workforce" cannot be opened because the developer cannot be verified
```

**Solution:**

```bash
# Allow app in System Preferences
# System Preferences -> Security & Privacy -> General
# Click "Open Anyway"

# Or via terminal
sudo spctl --master-disable
```

### Windows Issues

#### Issue: Windows Defender blocks app

**Symptoms:**

- App won't run
- Windows SmartScreen warning

**Solution:**

```bash
# 1. Click "More info"
# 2. Click "Run anyway"

# Or add exclusion
# Windows Security -> Virus & threat protection
# -> Manage settings -> Exclusions
# Add apps/desktop/src-tauri/target/
```

#### Issue: WebView2 not installed

**Symptoms:**

```
Error: WebView2 runtime not found
```

**Solution:**

```bash
# Download and install WebView2 Runtime
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/

# Or install via Chocolatey
choco install webview2-runtime
```

### Linux Issues

#### Issue: Missing system dependencies

**Symptoms:**

```
error: failed to run custom build command for `xxx`
```

**Solution:**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Fedora
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  gtk3-devel \
  librsvg2-devel

# Arch
sudo pacman -S \
  webkit2gtk \
  gtk3 \
  librsvg
```

#### Issue: AppImage won't run

**Symptoms:**

```
Permission denied
```

**Solution:**

```bash
# Make executable
chmod +x AGI-Workforce_*.AppImage

# Run
./AGI-Workforce_*.AppImage
```

## Performance Issues

### Issue: Slow development server

**Symptoms:**

- Hot reload takes > 5 seconds
- Initial load takes > 1 minute

**Solution:**

```bash
# 1. Clear Vite cache
rm -rf apps/desktop/node_modules/.vite

# 2. Increase file watcher limits
# See "Hot reload not working" above

# 3. Exclude large directories in vite.config.ts
server: {
  watch: {
    ignored: ['**/node_modules/**', '**/src-tauri/target/**'],
  },
}

# 4. Use faster dev build
cd apps/desktop/src-tauri
# In Cargo.toml, use:
[profile.dev]
opt-level = 1
```

### Issue: High memory usage

**Symptoms:**

- System runs out of memory
- App crashes with OOM

**Solution:**

```bash
# 1. Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=8192"

# 2. Close unused apps/terminals

# 3. Reduce Vite bundle size
# Check vite.config.ts manual chunks

# 4. Restart dev server periodically
```

## Network Issues

### Issue: API requests fail with CORS

**Symptoms:**

```
Access-Control-Allow-Origin error
```

**Solution:**

```bash
# 1. Check API Gateway CORS settings
# services/api-gateway/src/index.ts

# 2. Add origin to CORS whitelist
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
};

# 3. Restart API Gateway
pnpm --filter @agiworkforce/api-gateway dev
```

### Issue: Rate limiting errors

**Symptoms:**

```
Error 429: Too Many Requests
```

**Solution:**

```bash
# 1. Check Upstash Redis connection
echo $UPSTASH_REDIS_REST_URL

# 2. Increase rate limits in lib/rate-limit.ts

# 3. Clear Redis cache
# Via Upstash Dashboard -> Data Browser

# 4. Use development mode (no rate limiting)
NODE_ENV=development pnpm dev
```

## Getting Help

If your issue isn't covered here:

1. **Search existing issues:** https://github.com/siddhartha/agiworkforce/issues
2. **Check logs:**
   - Desktop: Chrome DevTools console
   - Web: Browser console and terminal
   - Services: Terminal output
3. **Create detailed issue:**
   - OS and version
   - Node, pnpm, Rust versions
   - Full error message
   - Steps to reproduce
4. **Ask in Discord/Slack**

## Emergency Commands

When all else fails:

```bash
# Nuclear option: full reset
pnpm clean
rm -rf node_modules apps/*/node_modules services/*/node_modules
rm -rf pnpm-lock.yaml
pnpm install
pnpm build
```

## Useful Debug Commands

```bash
# Check versions
node --version
pnpm --version
rustc --version

# Check Tauri environment
cd apps/desktop && pnpm tauri info

# Check running processes
ps aux | grep node
ps aux | grep tauri

# Check ports in use
lsof -i :5173
lsof -i :3000
lsof -i :4000

# Check disk space
df -h

# Check file watchers (Linux)
cat /proc/sys/fs/inotify/max_user_watches
```
