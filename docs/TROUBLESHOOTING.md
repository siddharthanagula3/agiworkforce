# Troubleshooting Guide

Comprehensive troubleshooting guide for common issues in AGI Workforce.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Desktop App Issues](#desktop-app-issues)
- [Web App Issues](#web-app-issues)
- [Database Issues](#database-issues)
- [API and Integration Issues](#api-and-integration-issues)
- [Performance Issues](#performance-issues)
- [Build and Deployment Issues](#build-and-deployment-issues)
- [Testing Issues](#testing-issues)

## Installation Issues

### pnpm Install Fails

**Symptom:** `pnpm install` fails with dependency resolution errors.

**Solutions:**

1. **Clear pnpm cache:**

```bash
pnpm store prune
pnpm install
```

2. **Verify Node version:**

```bash
node --version  # Should be 22.12.0 or higher
```

3. **Update pnpm:**

```bash
npm install -g pnpm@latest
```

4. **Delete lock file and reinstall:**

```bash
rm pnpm-lock.yaml
pnpm install
```

### Rust Compilation Errors

**Symptom:** Rust code fails to compile during installation or build.

**Solutions:**

1. **Update Rust toolchain:**

```bash
rustup update stable
rustup default stable
```

2. **Install required system dependencies:**

**macOS:**

```bash
xcode-select --install
brew install pkg-config
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Windows:**

- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Ensure WebView2 is installed (usually pre-installed on Windows 10/11)

3. **Clean Rust build:**

```bash
cd apps/desktop/src-tauri
cargo clean
cd ../../..
pnpm build:desktop
```

## Desktop App Issues

### App Won't Start

**Symptom:** Desktop app shows blank screen or crashes on startup.

**Solutions:**

1. **Clear local database:**

```bash
# macOS/Linux
rm -rf ~/.config/agiworkforce/agiworkforce.db
rm -rf ~/.config/agiworkforce/agiworkforce.db-shm
rm -rf ~/.config/agiworkforce/agiworkforce.db-wal

# Windows
del %APPDATA%\agiworkforce\agiworkforce.db
```

2. **Clear application cache:**

```bash
# macOS/Linux
rm -rf ~/.cache/agiworkforce

# Windows
del %LOCALAPPDATA%\agiworkforce\cache
```

3. **Reset settings:**

```bash
# macOS/Linux
rm ~/.config/agiworkforce/settings.json

# Windows
del %APPDATA%\agiworkforce\settings.json
```

4. **Check logs:**

```bash
# macOS
tail -f ~/Library/Logs/agiworkforce/app.log

# Linux
tail -f ~/.local/share/agiworkforce/logs/app.log

# Windows
type %APPDATA%\agiworkforce\logs\app.log
```

### Hot Reload Not Working

**Symptom:** Changes to React code don't trigger hot reload in dev mode.

**Solutions:**

1. **Restart dev server:**

```bash
# Kill the process
pkill -f "tauri dev"

# Start again
pnpm dev:desktop
```

2. **Clear Vite cache:**

```bash
rm -rf apps/desktop/node_modules/.vite
pnpm dev:desktop
```

3. **Check file watchers limit (Linux):**

```bash
# Increase limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Tauri Commands Failing

**Symptom:** Invoking Tauri commands returns errors.

**Solutions:**

1. **Check command registration:**
   Ensure command is registered in `apps/desktop/src-tauri/src/lib.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
        your_command_name,
        // ... other commands
    ])
```

2. **Verify command signature:**

```rust
#[tauri::command]
pub async fn your_command_name(
    param: Type,
    state: State<'_, AppState>,
) -> Result<ReturnType, String> {
    // Implementation
}
```

3. **Check frontend invocation:**

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ReturnType>('your_command_name', {
  param: value,
});
```

### SQLite Database Errors

**Symptom:** Database operation errors like "database is locked" or "disk I/O error".

**Solutions:**

1. **Enable WAL mode** (should be automatic):

```rust
// Verify in Rust code
conn.execute("PRAGMA journal_mode=WAL", [])?;
```

2. **Check database file permissions:**

```bash
# macOS/Linux
ls -la ~/.config/agiworkforce/
chmod 644 ~/.config/agiworkforce/agiworkforce.db
```

3. **Increase busy timeout:**
   Already configured to 5000ms, but can verify:

```rust
conn.execute("PRAGMA busy_timeout = 5000", [])?;
```

4. **Close orphaned connections:**
   Restart the app to close all connections.

## Web App Issues

### Next.js Build Fails

**Symptom:** `pnpm build` fails with TypeScript or module resolution errors.

**Solutions:**

1. **Clear Next.js cache:**

```bash
cd apps/web
rm -rf .next
pnpm build
```

2. **Verify environment variables:**
   Check `apps/web/.env.local` has all required variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
```

3. **Check TypeScript errors:**

```bash
cd apps/web
pnpm typecheck
```

### Supabase Connection Errors

**Symptom:** API routes fail with Supabase connection errors.

**Solutions:**

1. **Verify Supabase credentials:**
   Check `.env.local` has correct URL and keys from Supabase dashboard.

2. **Test connection:**

```typescript
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const { data, error } = await supabase.from('profiles').select('*').limit(1);
console.log({ data, error });
```

3. **Check RLS policies:**
   Ensure Row Level Security policies allow your operation:

```sql
-- In Supabase SQL Editor
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

4. **Verify service role usage:**
   For admin operations, use service role client:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server';
```

### Stripe Webhook Issues

**Symptom:** Stripe webhooks fail or aren't processed.

**Solutions:**

1. **Verify webhook secret:**
   Check `STRIPE_WEBHOOK_SECRET` in `.env.local` matches Stripe dashboard.

2. **Test webhook locally:**

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks
stripe listen --forward-to localhost:3001/api/webhook
```

3. **Check webhook signature:**

```typescript
const sig = headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
```

4. **Verify idempotency:**
   Check `processed_stripe_events` table for duplicate events:

```sql
SELECT * FROM processed_stripe_events
WHERE event_id = 'evt_xxx'
ORDER BY processed_at DESC;
```

### Middleware Errors

**Symptom:** All requests fail with authentication errors.

**Solutions:**

1. **Check middleware.ts:**

```typescript
// Verify matcher excludes public routes
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

2. **Verify cookie configuration:**
   Ensure cookies are set correctly for your domain.

3. **Check CORS settings:**

```typescript
// In API route
export async function POST(request: Request) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

## Database Issues

### Migration Failures

**Symptom:** Database migrations fail to apply.

**Solutions:**

1. **Check migration syntax:**
   Review SQL in `apps/web/supabase/migrations/` for syntax errors.

2. **Manually apply migration:**

```bash
cd apps/web
supabase db push
```

3. **Rollback and retry:**

```sql
-- In Supabase SQL Editor
-- Check migration history
SELECT * FROM supabase_migrations.schema_migrations;

-- Manually rollback if needed
DELETE FROM supabase_migrations.schema_migrations
WHERE version = 'problematic_version';
```

4. **Reset database (development only):**

```bash
supabase db reset
```

### Connection Pool Exhaustion

**Symptom:** "Too many connections" or "Connection pool exhausted" errors.

**Solutions:**

1. **Check active connections:**

```sql
SELECT count(*) FROM pg_stat_activity;
```

2. **Increase connection limit:**
   In Supabase dashboard, upgrade plan or optimize queries.

3. **Use connection pooling:**

```typescript
// Ensure proper cleanup
const supabase = createClient();
try {
  await supabase.from('table').select('*');
} finally {
  // Connection is automatically returned to pool
}
```

### Data Sync Conflicts

**Symptom:** Desktop and web data out of sync or conflicts.

**Solutions:**

1. **Check WebSocket connection:**

```typescript
// In browser console
const ws = new WebSocket('ws://localhost:4000');
ws.onopen = () => console.log('Connected');
ws.onerror = (e) => console.error('WS Error:', e);
```

2. **Verify device pairing:**
   Ensure devices are properly paired with matching codes.

3. **Force full sync:**
   Clear local cache and trigger full sync from backend.

## API and Integration Issues

### AI Provider Errors

**Symptom:** AI requests fail with authentication or rate limit errors.

**Solutions:**

1. **Verify API keys:**
   Check keys in desktop `.env.local`:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

2. **Check API key format:**
   Ensure no leading/trailing whitespace:

```bash
# Trim whitespace
export OPENAI_API_KEY=$(echo $OPENAI_API_KEY | xargs)
```

3. **Test API directly:**

```bash
# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

4. **Check rate limits:**
   Review provider dashboard for rate limit status and usage.

### MCP Server Issues

**Symptom:** MCP servers fail to start or tools aren't available.

**Solutions:**

1. **Check MCP server configuration:**

```json
// In settings
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  }
}
```

2. **Verify MCP server installation:**

```bash
npx -y @modelcontextprotocol/server-filesystem --version
```

3. **Check server logs:**

```typescript
const logs = await invoke('mcp_get_server_logs', {
  serverName: 'filesystem',
  lines: 100,
});
console.log(logs);
```

4. **Restart MCP server:**

```typescript
await invoke('mcp_stop_server', { serverId: 'server-id' });
await invoke('mcp_start_server', { serverId: 'server-id' });
```

### Git Integration Errors

**Symptom:** Git operations fail or show incorrect status.

**Solutions:**

1. **Verify Git installation:**

```bash
git --version
which git
```

2. **Check repository status:**

```bash
cd /path/to/repo
git status
```

3. **Configure Git credentials:**

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

4. **Reset Git state:**

```bash
git reset --hard HEAD
git clean -fd
```

## Performance Issues

### High CPU Usage

**Symptom:** App uses excessive CPU resources.

**Solutions:**

1. **Check for infinite loops:**
   Review recent code changes for loops without proper exit conditions.

2. **Monitor processes:**

```bash
# macOS
top -o cpu

# Linux
htop

# Windows
taskmgr
```

3. **Profile React renders:**
   Use React DevTools Profiler to identify unnecessary re-renders.

4. **Optimize Zustand subscriptions:**

```typescript
// Use selectors to prevent unnecessary re-renders
const data = useStore(selectData);

// Instead of
const { data } = useStore();
```

### High Memory Usage

**Symptom:** App consumes excessive memory or leaks memory.

**Solutions:**

1. **Check for memory leaks:**
   Use browser DevTools Memory Profiler or Rust memory profilers.

2. **Clear caches periodically:**

```typescript
// Clear LLM response cache
await invoke('cache_clear', { cacheType: 'llm_responses' });
```

3. **Limit conversation history:**

```typescript
// Keep only last N messages in memory
const recentMessages = messages.slice(-50);
```

4. **Monitor memory in Rust:**

```rust
use sysinfo::{System, SystemExt};

let mut system = System::new_all();
system.refresh_memory();
println!("Used memory: {} MB", system.used_memory() / 1024 / 1024);
```

### Slow Response Times

**Symptom:** Operations take longer than expected.

**Solutions:**

1. **Enable query optimization:**

```sql
-- In SQLite
ANALYZE;
PRAGMA optimize;
```

2. **Add indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id, created_at);
```

3. **Use pagination:**

```typescript
// Load data in chunks
const messages = await invoke('get_messages', {
  conversationId,
  limit: 50,
  offset: 0,
});
```

4. **Implement caching:**

```rust
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;

let cache: Arc<RwLock<HashMap<String, CachedValue>>> =
  Arc::new(RwLock::new(HashMap::new()));
```

### Database Performance

**Symptom:** Database queries are slow.

**Solutions:**

1. **Analyze slow queries:**

```sql
-- Enable query timing
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
```

2. **Vacuum database:**

```sql
VACUUM;
```

3. **Optimize tables:**

```sql
ANALYZE;
```

4. **Check database size:**

```bash
ls -lh ~/.config/agiworkforce/agiworkforce.db
```

## Build and Deployment Issues

### Desktop Build Fails

**Symptom:** `pnpm build:desktop` fails.

**Solutions:**

1. **Clean and rebuild:**

```bash
pnpm clean:build
cd apps/desktop/src-tauri
cargo clean
cd ../../..
pnpm build:desktop
```

2. **Check Cargo.toml dependencies:**
   Ensure all dependencies are compatible.

3. **Verify Tauri configuration:**
   Check `apps/desktop/src-tauri/tauri.conf.json` for errors.

4. **Build with verbose output:**

```bash
cd apps/desktop/src-tauri
cargo build --release --verbose
```

### Code Signing Issues (macOS)

**Symptom:** "Developer cannot be verified" or signing errors.

**Solutions:**

1. **Check signing identity:**

```bash
security find-identity -v -p codesigning
```

2. **Configure in tauri.conf.json:**

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
    }
  }
}
```

3. **Notarize app:**

```bash
xcrun notarytool submit app.dmg \
  --apple-id your-apple-id@example.com \
  --team-id TEAM_ID \
  --password app-specific-password
```

### Vercel Deployment Fails

**Symptom:** Web app deployment fails on Vercel.

**Solutions:**

1. **Check build logs:**
   Review logs in Vercel dashboard for specific errors.

2. **Verify environment variables:**
   Ensure all required env vars are set in Vercel project settings.

3. **Test build locally:**

```bash
cd apps/web
pnpm build
```

4. **Check build output:**

```bash
ls -la apps/web/.next
```

## Testing Issues

### E2E Tests Failing

**Symptom:** Playwright E2E tests fail unexpectedly.

**Solutions:**

1. **Install browsers:**

```bash
npx playwright install
```

2. **Start dev server:**
   Ensure dev server is running on port 5175:

```bash
pnpm dev:desktop
```

3. **Run tests with UI:**

```bash
pnpm --filter @agiworkforce/desktop test:e2e -- --ui
```

4. **Check screenshots:**
   Review screenshots in `apps/desktop/test-results/` for visual clues.

5. **Increase timeouts:**

```typescript
test('my test', async ({ page }) => {
  await expect(page.locator('.element')).toBeVisible({ timeout: 10000 });
});
```

### Unit Tests Failing

**Symptom:** Vitest tests fail with unexpected errors.

**Solutions:**

1. **Clear test cache:**

```bash
rm -rf apps/desktop/node_modules/.vitest
pnpm test
```

2. **Run specific test:**

```bash
cd apps/desktop
pnpm vitest run path/to/test.test.ts
```

3. **Debug test:**

```typescript
import { describe, it, expect } from 'vitest';

describe('MyTest', () => {
  it('should work', () => {
    console.log('Debug info:', someValue);
    expect(someValue).toBe(expected);
  });
});
```

4. **Check mock setup:**
   Ensure mocks are properly configured:

```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
```

## Getting Additional Help

If you're still experiencing issues:

1. **Check GitHub Issues:** [github.com/siddhartha/agiworkforce/issues](https://github.com/siddhartha/agiworkforce/issues)
2. **GitHub Discussions:** [github.com/siddhartha/agiworkforce/discussions](https://github.com/siddhartha/agiworkforce/discussions)
3. **Documentation:** [docs.agiworkforce.com](https://docs.agiworkforce.com)
4. **Email Support:** support@agiworkforce.com

When reporting issues, please include:

- Operating system and version
- Node.js and pnpm versions
- Rust version (for desktop issues)
- Error messages and stack traces
- Steps to reproduce
- Screenshots or screen recordings
