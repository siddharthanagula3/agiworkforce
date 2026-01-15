# Quick Reference Guide

Fast reference for common tasks and commands in AGI Workforce.

## Essential Commands

### Development

```bash
# Start desktop app
pnpm dev:desktop

# Start web app
cd apps/web && pnpm dev

# Start backend services
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev

# Install dependencies
pnpm install

# Type check everything
pnpm typecheck:all
```

### Testing

```bash
# All tests
pnpm test

# Desktop tests
pnpm --filter @agiworkforce/desktop test

# Web tests
pnpm --filter web test

# E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# E2E with UI
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### Building

```bash
# Build everything
pnpm build

# Build desktop (creates DMG/MSI/AppImage)
pnpm build:desktop

# Build web only
pnpm --filter @agiworkforce/web build

# Build specific service
pnpm --filter @agiworkforce/api-gateway build
```

### Code Quality

```bash
# Lint
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check
```

### Cleanup

```bash
# Remove dist directories
pnpm clean:build

# Full clean (node_modules + dist)
pnpm clean
```

## File Locations

### Desktop App

```
~/.config/agiworkforce/           # macOS/Linux
%APPDATA%\agiworkforce\           # Windows

  ├── agiworkforce.db             # SQLite database
  ├── agiworkforce.db-wal         # Write-ahead log
  ├── agiworkforce.db-shm         # Shared memory
  ├── settings.json               # Persisted settings
  └── logs/                       # Application logs
      └── app.log
```

### Configuration Files

```
agiworkforce/
├── .env.local                    # Root env (if needed)
├── apps/desktop/.env.local       # Desktop app config
├── apps/web/.env.local           # Web app config
├── services/api-gateway/.env     # API Gateway config
└── services/signaling-server/.env # Signaling server config
```

## Environment Variables

### Desktop App (.env.local)

```bash
# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Optional
DEEPSEEK_API_KEY=...
XAI_API_KEY=...
```

### Web App (.env.local)

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
SENTRY_DSN=https://...
```

## Common Tasks

### Add New Tauri Command

1. **Define command in Rust:**

```rust
// apps/desktop/src-tauri/src/sys/commands/your_module.rs

#[tauri::command]
pub async fn your_command(
    param: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Implementation
    Ok("result".to_string())
}
```

2. **Register command:**

```rust
// apps/desktop/src-tauri/src/lib.rs

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        your_command,
        // ... other commands
    ])
```

3. **Use in frontend:**

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<string>('your_command', { param: 'value' });
```

### Add New API Route (Web)

1. **Create route file:**

```typescript
// apps/web/app/api/your-route/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ data: 'response' });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

2. **Call from frontend:**

```typescript
const response = await fetch('/api/your-route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: 'value' }),
});
const result = await response.json();
```

### Add New Zustand Store

```typescript
// apps/desktop/src/stores/myStore.ts

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

interface MyStore {
  data: string[];
  loading: boolean;
  fetchData: () => Promise<void>;
}

export const useMyStore = create<MyStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        data: [],
        loading: false,

        fetchData: async () => {
          set({ loading: true });
          // Fetch logic
          set({ loading: false });
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

### Add Database Migration (Web)

```bash
# Create migration
cd apps/web
supabase migration new your_migration_name

# Edit migration file in supabase/migrations/

# Apply migration
supabase db push
```

### Add E2E Test

```typescript
// apps/desktop/e2e/your-feature.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Your Feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');

    // Interact with page
    await page.click('button[data-testid="action"]');

    // Assert
    await expect(page.locator('.result')).toHaveText('Expected');
  });
});
```

Run test:

```bash
pnpm --filter @agiworkforce/desktop test:e2e -- your-feature.spec.ts
```

## Debugging

### Desktop App Debugging

**Chrome DevTools:**

- Right-click in app → Inspect Element
- Console shows React errors
- Network tab shows Tauri commands

**Rust Debugging:**

```bash
# View Rust logs
RUST_LOG=debug pnpm dev:desktop
```

**Database Inspection:**

```bash
# SQLite CLI
sqlite3 ~/.config/agiworkforce/agiworkforce.db

# List tables
.tables

# Query
SELECT * FROM conversations LIMIT 10;
```

### Web App Debugging

**Next.js Dev Tools:**

- Built-in error overlay
- Server logs in terminal
- React DevTools in browser

**API Route Debugging:**

```typescript
export async function POST(request: NextRequest) {
  console.log('Request body:', await request.json());
  // Debug logic
  return NextResponse.json({ debug: 'info' });
}
```

## Performance

### Database Optimization

```sql
-- SQLite optimization
PRAGMA optimize;
ANALYZE;
VACUUM;

-- Check database size
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();
```

### Cache Management

```typescript
// Clear LLM cache
await invoke('cache_clear', { cacheType: 'llm_responses' });

// Clear all caches
await invoke('cache_clear_all');
```

### Bundle Analysis (Web)

```bash
cd apps/web
ANALYZE=true pnpm build
```

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/your-feature
```

### Commit Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting
- `refactor:` - Code refactoring
- `perf:` - Performance
- `test:` - Tests
- `chore:` - Build/tooling

## Useful Keyboard Shortcuts

### Desktop App

- `Cmd/Ctrl + K` - Command palette
- `Cmd/Ctrl + N` - New conversation
- `Cmd/Ctrl + ,` - Settings
- `Cmd/Ctrl + Shift + I` - DevTools
- `Cmd/Ctrl + R` - Reload

### VS Code

- `Cmd/Ctrl + Shift + P` - Command palette
- `Cmd/Ctrl + P` - Quick file open
- `Cmd/Ctrl + Shift + F` - Global search
- `F12` - Go to definition
- `Cmd/Ctrl + .` - Quick fix

## Common Patterns

### Async Error Handling (Rust)

```rust
use anyhow::{Result, Context};

pub async fn operation() -> Result<String> {
    let data = fetch_data()
        .await
        .context("Failed to fetch data")?;

    process_data(&data)
        .context("Failed to process data")?;

    Ok(data)
}
```

### React Component Pattern

```typescript
interface Props {
  title: string;
  onAction?: () => void;
}

export function Component({ title, onAction }: Props) {
  const [state, setState] = useState<string>('');

  const handleClick = () => {
    setState('updated');
    onAction?.();
  };

  return (
    <div>
      <h2>{title}</h2>
      <button onClick={handleClick}>Action</button>
    </div>
  );
}
```

### API Error Handling (TypeScript)

```typescript
try {
  const result = await invoke<Result>('command', params);
  return result;
} catch (error) {
  if (error.code === '1002') {
    // Handle specific error
    await handleTokenExpiration();
  } else {
    // Generic error handling
    console.error('Operation failed:', error);
    throw error;
  }
}
```

## Resources

### Documentation

- [README.md](../README.md) - Project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guide
- [API.md](API.md) - API reference
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Troubleshooting guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide

### External Resources

- [Tauri Docs](https://tauri.app/v2/) - Tauri framework
- [Next.js Docs](https://nextjs.org/docs) - Next.js framework
- [React Docs](https://react.dev) - React library
- [Rust Book](https://doc.rust-lang.org/book/) - Rust language
- [Supabase Docs](https://supabase.com/docs) - Supabase platform

### Community

- GitHub: [github.com/siddhartha/agiworkforce](https://github.com/siddhartha/agiworkforce)
- Issues: Report bugs and request features
- Discussions: Ask questions and share ideas
- Email: support@agiworkforce.com

## Quick Troubleshooting

| Issue             | Quick Fix                                       |
| ----------------- | ----------------------------------------------- |
| App won't start   | `rm -rf ~/.config/agiworkforce/agiworkforce.db` |
| Build fails       | `pnpm clean && pnpm install`                    |
| Hot reload broken | Restart dev server                              |
| Type errors       | `pnpm typecheck:all`                            |
| Lint errors       | `pnpm lint:fix`                                 |
| Tests failing     | Clear cache: `rm -rf node_modules/.vitest`      |
| E2E tests fail    | Install browsers: `npx playwright install`      |
| Slow performance  | Run `PRAGMA optimize;` in SQLite                |
| High memory       | Clear caches                                    |
| Import errors     | Check path aliases in tsconfig.json             |

## Version Information

- **Current Version**: 1.0.4
- **Node**: 22.12.0+
- **pnpm**: 9.15.0+
- **Rust**: 1.75+
- **TypeScript**: 5.9.3
- **React**: 19.2.3
- **Next.js**: 16.1.1
- **Tauri**: 2.9.3

---

**Last Updated**: 2026-01-15

For more detailed information, refer to the full documentation files in the [docs/](.) directory.
