# Developer Setup Guide

This guide will help you set up the AGI Workforce development environment from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

| Tool        | Minimum Version | Recommended Version | Installation                        |
| ----------- | --------------- | ------------------- | ----------------------------------- |
| **Node.js** | 22.12.0         | 22.12.0+            | [nodejs.org](https://nodejs.org/)   |
| **pnpm**    | 9.15.0          | 9.15.3              | `npm install -g pnpm@9.15.3`        |
| **Rust**    | 1.75.0          | Latest stable       | [rustup.rs](https://rustup.rs/)     |
| **Git**     | 2.30+           | Latest              | [git-scm.com](https://git-scm.com/) |

### Platform-Specific Prerequisites

#### macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Windows

- Visual Studio 2022 with C++ development tools
- Windows 10 SDK
- WebView2 Runtime (usually pre-installed on Windows 11)

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev
```

## Step 1: Clone the Repository

```bash
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce
```

## Step 2: Verify Node.js and pnpm Versions

```bash
# Check Node.js version (should be >= 22.12.0)
node --version

# Check pnpm version (should be >= 9.15.0)
pnpm --version

# If pnpm is not installed or outdated
npm install -g pnpm@9.15.3
```

## Step 3: Install Dependencies

```bash
# Install all dependencies (monorepo + all workspaces)
pnpm install
```

This command will:

- Install root-level dependencies
- Install dependencies for all apps (desktop, web)
- Install dependencies for all services (api-gateway, signaling-server)
- Install dependencies for all packages (types, utils)
- Set up Git hooks via Husky

**Expected time:** 2-5 minutes depending on internet speed

## Step 4: Set Up Environment Variables

### Desktop App

```bash
cd apps/desktop
cp .env.example .env.local
```

Edit `.env.local` and configure:

```env
# Supabase (required for sync features)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# LLM Provider API Keys (at least one required)
VITE_ANTHROPIC_API_KEY=your_anthropic_key
VITE_OPENAI_API_KEY=your_openai_key
VITE_GOOGLE_API_KEY=your_google_key

# Optional: Development settings
VITE_DEV_PORT=5173
VITE_LOG_LEVEL=debug
```

### Web App

```bash
cd apps/web
cp .env.example .env.local
```

Edit `.env.local` and configure:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe (for subscription management)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Application URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### API Gateway

```bash
cd services/api-gateway
cp .env.example .env
```

Edit `.env` and configure:

```env
PORT=3000
JWT_SECRET=your_jwt_secret_min_32_chars
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NODE_ENV=development
```

### Signaling Server

```bash
cd services/signaling-server
cp .env.example .env
```

Edit `.env` and configure:

```env
PORT=4000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NODE_ENV=development
```

## Step 5: Set Up the Database

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Navigate to SQL Editor
3. Run the migration files from `apps/web/supabase/migrations/` in order
4. Enable Row Level Security (RLS) on all tables
5. Copy your project URL and keys to the environment files

### Desktop SQLite Database

The desktop app uses SQLite which is automatically initialized on first run. The database is stored at:

- **macOS:** `~/Library/Application Support/com.agiworkforce.app/agiworkforce.db`
- **Windows:** `%APPDATA%\com.agiworkforce.app\agiworkforce.db`
- **Linux:** `~/.config/com.agiworkforce.app/agiworkforce.db`

No manual setup required.

## Step 6: Type Check

Verify TypeScript configuration is correct:

```bash
# Check all packages
pnpm typecheck:all

# Or check specific apps
cd apps/desktop && pnpm typecheck
cd apps/web && pnpm typecheck
```

All type checks should pass with 0 errors.

## Step 7: Run the Development Servers

### Option A: Start Desktop App (Most Common)

```bash
# From root directory
pnpm dev:desktop

# This starts:
# - Vite dev server (React frontend)
# - Tauri dev build (Rust backend)
# - Opens the desktop application
```

**Expected startup time:** 30-60 seconds for first build, then 5-10 seconds for subsequent starts.

### Option B: Start Web App

```bash
# Terminal 1: Start Next.js dev server
cd apps/web
pnpm dev

# Visit http://localhost:3000
```

### Option C: Start Backend Services

```bash
# Terminal 1: API Gateway
pnpm --filter @agiworkforce/api-gateway dev

# Terminal 2: Signaling Server
pnpm --filter @agiworkforce/signaling-server dev
```

### Option D: Start Everything

For full-stack development:

```bash
# Terminal 1: Desktop app
pnpm dev:desktop

# Terminal 2: Web app
cd apps/web && pnpm dev

# Terminal 3: API Gateway
pnpm --filter @agiworkforce/api-gateway dev

# Terminal 4: Signaling Server
pnpm --filter @agiworkforce/signaling-server dev
```

## Step 8: Verify Installation

### Desktop App Verification

1. The desktop app should open automatically
2. Check the console for any errors
3. Try basic operations:
   - Create a new chat
   - Navigate to Settings
   - Check API key configuration

### Web App Verification

1. Visit http://localhost:3000
2. Sign up for a new account
3. Verify email confirmation works
4. Check subscription page loads

### Services Verification

```bash
# Test API Gateway
curl http://localhost:3000/health

# Test Signaling Server
curl http://localhost:4000/health
```

Both should return `{"status":"ok"}` or similar.

## Common Setup Issues

### Issue: pnpm install fails with peer dependency errors

**Solution:**

```bash
pnpm install --force
```

### Issue: Tauri build fails with Rust compilation errors

**Solution:**

```bash
# Update Rust to latest stable
rustup update stable

# Clean Rust build cache
cd apps/desktop/src-tauri
cargo clean
```

### Issue: Port already in use

**Solution:**

```bash
# Find process using port 5173 (desktop)
lsof -i :5173

# Kill the process
kill -9 <PID>

# Or use a different port
VITE_DEV_PORT=5174 pnpm dev:desktop
```

### Issue: SQLite database locked error

**Solution:**

```bash
# Close all running instances of the app
# Then delete the database file and restart
rm -rf ~/Library/Application\ Support/com.agiworkforce.app/agiworkforce.db
```

### Issue: Husky hooks not working

**Solution:**

```bash
# Reinstall Git hooks
pnpm prepare
```

### Issue: TypeScript errors in IDE but not in CLI

**Solution:**

```bash
# Reload TypeScript server in VS Code
# Cmd/Ctrl + Shift + P -> "TypeScript: Restart TS Server"

# Or rebuild TypeScript project references
pnpm typecheck:all --force
```

## Next Steps

After successful setup:

1. Read [CLAUDE.md](./CLAUDE.md) for project architecture overview
2. Review [TESTING.md](./TESTING.md) for testing guidelines
3. Check [MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md) for workspace management
4. Set up your IDE (see IDE Setup below)

## IDE Setup

### VS Code (Recommended)

Install recommended extensions:

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Rust Analyzer
- Tailwind CSS IntelliSense

Recommended settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### Other IDEs

- **WebStorm/IntelliJ:** Built-in support for monorepos and TypeScript
- **Vim/Neovim:** Use CoC or native LSP with tsserver
- **Emacs:** Use lsp-mode with typescript-language-server

## Getting Help

If you encounter issues not covered here:

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Search existing GitHub issues
3. Ask in the team Discord/Slack
4. Create a new GitHub issue with:
   - Your OS and version
   - Node.js, pnpm, Rust versions
   - Full error message and stack trace
   - Steps to reproduce

## Quick Reference

```bash
# Install dependencies
pnpm install

# Start desktop development
pnpm dev:desktop

# Start web development
cd apps/web && pnpm dev

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck:all

# Lint and fix code
pnpm lint:fix

# Format code
pnpm format

# Clean all build artifacts
pnpm clean:build

# Full clean (including node_modules)
pnpm clean
```

Welcome to AGI Workforce development!
