# Debugging Guide

Techniques for debugging AGI Workforce applications.

## Desktop App Debugging

### React DevTools

1. Open the desktop app in development mode
2. Right-click and select "Inspect" or press `Cmd+Shift+I`
3. Use React DevTools tab to inspect components and state

### Zustand DevTools

Zustand stores are configured with devtools in development:

```typescript
const useStore = create<State>()(
  devtools(persist(/* ... */), { name: 'StoreName', enabled: import.meta.env.DEV }),
);
```

Open Redux DevTools to inspect state changes.

### Rust Backend

View Rust logs in the terminal where `pnpm dev:desktop` runs:

```bash
# Enable verbose logging
RUST_LOG=debug pnpm dev:desktop

# Filter by module
RUST_LOG=agiworkforce::core=debug pnpm dev:desktop
```

### Tauri Commands

Debug command invocations:

```typescript
try {
  const result = await invoke('command_name', { params });
  console.log('Result:', result);
} catch (error) {
  console.error('Command failed:', error);
}
```

## Web App Debugging

### Next.js DevTools

```bash
# Enable debug mode
DEBUG=* pnpm dev

# Specific modules
DEBUG=next:router pnpm dev
```

### Server Component Debugging

```typescript
export default async function Page() {
  console.log('Server-side log'); // Appears in terminal

  return <div>...</div>;
}
```

### API Route Debugging

```typescript
export async function POST(request: Request) {
  console.log('Request received:', await request.json());

  return Response.json({ success: true });
}
```

## Database Debugging

### SQLite (Desktop)

```bash
# Location
ls ~/.config/agiworkforce/

# Open database
sqlite3 ~/.config/agiworkforce/agiworkforce.db

# Query example
.tables
SELECT * FROM messages LIMIT 10;
```

### Supabase (Web)

Use Supabase Dashboard for:

- Table inspection
- Query execution
- RLS policy testing
- Log viewing

## WebSocket Debugging

### Chrome DevTools

1. Open DevTools → Network tab
2. Filter by "WS"
3. Click on WebSocket connection
4. View Messages tab for sent/received data

### Signaling Server Logs

```bash
# Enable verbose logging
DEBUG=* pnpm --filter @agiworkforce/signaling-server dev
```

## Common Issues

### "Cannot find module"

```bash
# Rebuild dependencies
pnpm install --force

# Clear Vite cache
rm -rf apps/desktop/node_modules/.vite
```

### "Tauri command not found"

Ensure command is registered in `lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    command_name,
    // ... other commands
])
```

### "WebSocket connection failed"

1. Check signaling server is running
2. Verify port 4000 is not blocked
3. Check CORS configuration

### "Database locked"

```bash
# Kill any stale processes
lsof ~/.config/agiworkforce/agiworkforce.db | awk 'NR>1 {print $2}' | xargs kill

# Reset database
rm ~/.config/agiworkforce/agiworkforce.db
```

### Memory Issues

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=8192" pnpm dev:desktop

# Profile memory
# Use Chrome DevTools → Memory tab
```

## Performance Profiling

### React Profiler

```typescript
import { Profiler } from 'react';

function onRender(id, phase, actualDuration) {
  console.log(`${id} ${phase}: ${actualDuration}ms`);
}

<Profiler id="MyComponent" onRender={onRender}>
  <MyComponent />
</Profiler>
```

### Rust Profiling

```bash
# Build with profiling
cd apps/desktop/src-tauri
cargo build --release

# Use flamegraph
cargo flamegraph --bin agiworkforce
```

## Logging Best Practices

### Frontend

```typescript
// Use structured logging
console.log('[Chat]', 'Message sent', { messageId, content });

// Avoid in production
if (import.meta.env.DEV) {
  console.log('Debug info');
}
```

### Rust

```rust
use tracing::{info, warn, error, debug};

#[instrument]
async fn my_function(param: &str) -> Result<()> {
    info!("Starting operation");

    match risky_operation().await {
        Ok(result) => {
            debug!("Operation completed: {:?}", result);
            Ok(result)
        }
        Err(e) => {
            error!("Operation failed: {}", e);
            Err(e)
        }
    }
}
```

## Next Steps

- [Testing Guide](testing.md)
- [Development Setup](setup.md)
