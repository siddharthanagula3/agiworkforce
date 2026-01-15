# Debugging Guide

Comprehensive guide to debugging techniques for each component of the AGI Workforce project.

## Table of Contents

- [Desktop App Debugging](#desktop-app-debugging)
- [Web App Debugging](#web-app-debugging)
- [Backend Services Debugging](#backend-services-debugging)
- [Database Debugging](#database-debugging)
- [Network Debugging](#network-debugging)
- [Performance Debugging](#performance-debugging)

## Desktop App Debugging

### React Frontend Debugging

#### Chrome DevTools

The desktop app uses Chromium, so you have full access to Chrome DevTools.

**Opening DevTools:**

```bash
# In development mode
Right-click anywhere -> Inspect Element

# Or use keyboard shortcut
# macOS: Cmd+Option+I
# Windows/Linux: Ctrl+Shift+I
```

**Key DevTools Features:**

1. **Console Tab**

   ```javascript
   // Add debug logs
   console.log('State:', state);
   console.table(data); // Pretty table format
   console.trace(); // Show call stack

   // Conditional logging
   if (import.meta.env.DEV) {
     console.log('Debug info:', data);
   }
   ```

2. **React DevTools**

   ```bash
   # Install React DevTools extension
   # Then open Components tab in DevTools

   # Features:
   # - Inspect component props and state
   # - View component hierarchy
   # - Track re-renders
   # - Trigger re-renders manually
   ```

3. **Network Tab**
   - Monitor API requests
   - Check request/response headers
   - View response data
   - Analyze timing

4. **Sources Tab**
   - Set breakpoints in TypeScript files
   - Step through code execution
   - Watch variables
   - Evaluate expressions

#### VS Code Debugging

**Setup launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Desktop App",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/apps/desktop/src",
      "sourceMapPathOverrides": {
        "webpack:///./src/*": "${webRoot}/*"
      }
    }
  ]
}
```

**Usage:**

1. Start dev server: `pnpm dev:desktop`
2. Set breakpoints in VS Code
3. Press F5 or click "Debug Desktop App"
4. Code will pause at breakpoints

#### Zustand State Debugging

**Enable DevTools:**

```typescript
// Already configured in stores
import { devtools } from 'zustand/middleware';

export const useStore = create<State>()(
  devtools(
    (set, get) => ({
      // store implementation
    }),
    { name: 'MyStore', enabled: import.meta.env.DEV },
  ),
);
```

**Redux DevTools Extension:**

```bash
# Install Redux DevTools extension
# Will automatically connect to Zustand stores

# Features:
# - Time-travel debugging
# - Action history
# - State diff viewer
# - Export/import state
```

**Manual State Inspection:**

```typescript
// In console or code
const state = useStore.getState();
console.log('Current state:', state);

// Subscribe to changes
useStore.subscribe(
  (state) => console.log('State changed:', state),
  (state) => state.someValue, // Subscribe to specific value
);
```

### Rust Backend Debugging

#### Logging

**Console Logs:**

```rust
// In src-tauri/src/
use log::{debug, info, warn, error};

#[tauri::command]
fn my_command() {
    info!("Command executed");
    debug!("Debug details: {:?}", data);
    warn!("Warning message");
    error!("Error occurred: {}", err);
}
```

**View Rust Logs:**

```bash
# Logs appear in terminal where you ran pnpm dev:desktop

# Set log level
RUST_LOG=debug pnpm dev:desktop

# Log only specific modules
RUST_LOG=desktop=debug,tauri=info pnpm dev:desktop
```

#### VS Code Rust Debugging

**Install Extensions:**

- rust-analyzer
- CodeLLDB

**Setup launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Rust Backend",
      "type": "lldb",
      "request": "launch",
      "program": "${workspaceFolder}/apps/desktop/src-tauri/target/debug/desktop",
      "args": [],
      "cwd": "${workspaceFolder}/apps/desktop"
    }
  ]
}
```

**Usage:**

1. Build in debug mode: `cd apps/desktop/src-tauri && cargo build`
2. Set breakpoints in Rust files
3. Press F5
4. Use debugger controls to step through

#### Rust Analyzer

```rust
// Hover over variables to see types
let data: Vec<String> = vec![];

// Use rust-analyzer commands
// Cmd/Ctrl+Shift+P -> "rust-analyzer: Expand Macro Recursively"
// Cmd/Ctrl+Shift+P -> "rust-analyzer: View Hir"
```

#### Debugging Tauri Commands

**Add Debug Logging:**

```rust
#[tauri::command]
async fn my_command(param: String) -> Result<String, String> {
    info!("my_command called with: {}", param);

    match do_something(&param).await {
        Ok(result) => {
            info!("my_command success: {:?}", result);
            Ok(result)
        }
        Err(e) => {
            error!("my_command error: {:?}", e);
            Err(e.to_string())
        }
    }
}
```

**Test from Frontend:**

```typescript
// In console
const result = await window.__TAURI__.invoke('my_command', {
  param: 'test',
});
console.log('Result:', result);
```

### Debugging SQLite

**View Database:**

```bash
# macOS
sqlite3 ~/Library/Application\ Support/com.agiworkforce.app/agiworkforce.db

# Commands in sqlite3:
.tables              # List tables
.schema table_name   # Show table schema
SELECT * FROM table_name;  # Query data
.exit               # Exit

# Or use GUI tool
# DB Browser for SQLite: https://sqlitebrowser.org/
```

**Debug Queries:**

```rust
// Add query logging
use rusqlite::trace;

conn.trace(Some(|stmt| {
    info!("SQL: {}", stmt);
}));
```

### Common Desktop Debugging Scenarios

#### Issue: Component not re-rendering

**Debug:**

```typescript
// 1. Check if state is actually changing
useEffect(() => {
  console.log('State changed:', state);
}, [state]);

// 2. Use React DevTools Profiler
// Record -> Perform action -> Stop
// Check which components re-rendered

// 3. Add debugging to store
const useStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    setValue: (value) => {
      console.log('Setting value:', value);
      set({ value });
      console.log('New state:', get());
    },
  })),
);
```

#### Issue: Tauri command not working

**Debug:**

```typescript
// Frontend
try {
  console.log('Calling command with:', params);
  const result = await invoke('my_command', params);
  console.log('Command result:', result);
} catch (error) {
  console.error('Command error:', error);
}
```

```rust
// Backend
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    info!("Command called");
    info!("Param: {}", param);

    let result = do_work(&param)
        .map_err(|e| {
            error!("Error: {:?}", e);
            format!("Error: {}", e)
        })?;

    info!("Result: {:?}", result);
    Ok(result)
}
```

## Web App Debugging

### Next.js Server Components

**Server-Side Logging:**

```typescript
// app/page.tsx (Server Component)
export default async function Page() {
  console.log('This logs on the server');

  const data = await fetchData();
  console.log('Data:', data); // Server console

  return <div>{/* ... */}</div>;
}

// View logs in terminal where Next.js is running
```

**Client-Side Logging:**

```typescript
'use client';

export default function ClientComponent() {
  console.log('This logs in browser console');

  useEffect(() => {
    console.log('Effect ran');
  }, []);

  return <div>{/* ... */}</div>;
}
```

### API Routes Debugging

**Add Logging:**

```typescript
// app/api/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('API route called');
  console.log('Method:', request.method);
  console.log('Headers:', Object.fromEntries(request.headers));

  const body = await request.json();
  console.log('Body:', body);

  try {
    const result = await processRequest(body);
    console.log('Success:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**Test with curl:**

```bash
curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}' \
  -v  # Verbose output
```

### React Query Debugging

**DevTools:**

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function Providers({ children }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Add logging
        onError: (error) => console.error('Query error:', error),
        onSuccess: (data) => console.log('Query success:', data),
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### VS Code Next.js Debugging

**launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/apps/web",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "console": "integratedTerminal",
      "serverReadyAction": {
        "pattern": "started server on .+, url: (https?://.+)",
        "uriFormat": "%s",
        "action": "debugWithChrome"
      }
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

## Backend Services Debugging

### API Gateway

**Add Logging:**

```typescript
// services/api-gateway/src/index.ts
import express from 'express';

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  next();
});

// Error logging
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});
```

**VS Code Debugging:**

```json
{
  "name": "Debug API Gateway",
  "type": "node",
  "request": "launch",
  "cwd": "${workspaceFolder}/services/api-gateway",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["dev"],
  "console": "integratedTerminal"
}
```

### Signaling Server

**WebSocket Debugging:**

```typescript
// services/signaling-server/src/index.ts
import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: 4000 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    console.log('Received:', data.toString());

    try {
      const message = JSON.parse(data.toString());
      console.log('Parsed message:', message);

      // Handle message
      handleMessage(ws, message);
    } catch (error) {
      console.error('Parse error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
```

**Test WebSocket:**

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:4000');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'test', data: 'hello' }));
};

ws.onmessage = (event) => {
  console.log('Message:', event.data);
};

ws.onerror = (error) => {
  console.error('Error:', error);
};
```

## Database Debugging

### Supabase Debugging

**Enable Query Logging:**

```typescript
// Create client with logging
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key, {
  auth: {
    debug: true, // Log auth events
  },
  global: {
    headers: {
      'x-debug': 'true',
    },
  },
});

// Log all queries
const { data, error } = await supabase
  .from('table')
  .select('*')
  .then((result) => {
    console.log('Query result:', result);
    return result;
  });
```

**Check RLS Policies:**

```sql
-- In Supabase SQL Editor
-- View policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Test query as specific user
SET request.jwt.claims = '{"sub": "user-id"}';
SELECT * FROM your_table;
```

**Monitor Real-time:**

```typescript
// Subscribe to changes
const subscription = supabase
  .channel('changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'table_name' }, (payload) => {
    console.log('Change detected:', payload);
  })
  .subscribe((status) => {
    console.log('Subscription status:', status);
  });
```

### SQLite Debugging (Desktop)

**Enable Query Logging:**

```rust
use rusqlite::{Connection, trace};

let conn = Connection::open(path)?;

// Enable tracing
conn.trace(Some(|stmt| {
    info!("SQL: {}", stmt);
}));

// Log slow queries
use std::time::Instant;

let start = Instant::now();
let result = conn.query_row("SELECT * FROM table", [], |row| {
    // ...
})?;
let duration = start.elapsed();

if duration.as_millis() > 100 {
    warn!("Slow query ({:?}): SELECT * FROM table", duration);
}
```

**Analyze Performance:**

```sql
-- In sqlite3 CLI
EXPLAIN QUERY PLAN SELECT * FROM table WHERE condition;

-- Check indexes
.indexes table_name

-- Analyze database
ANALYZE;
```

## Network Debugging

### HTTP Requests

**Browser DevTools Network Tab:**

- Filter by type (XHR, Fetch, WS)
- Check status codes
- View headers
- Inspect payload
- Check timing

**Log Fetch Requests:**

```typescript
// Wrap fetch
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('Fetch:', args);
  const response = await originalFetch(...args);
  console.log('Response:', response.status, response.statusText);
  return response;
};
```

**Use Proxy:**

```bash
# Charles Proxy or similar
# Monitor all HTTP/HTTPS traffic
# Inspect requests and responses
# Mock responses
```

### WebSocket Debugging

**Chrome DevTools:**

1. Open DevTools
2. Network tab
3. Filter: WS
4. Click WebSocket connection
5. View frames sent/received

**Log WebSocket Messages:**

```typescript
const ws = new WebSocket('ws://localhost:4000');

ws.addEventListener('open', (event) => {
  console.log('WebSocket opened:', event);
});

ws.addEventListener('message', (event) => {
  console.log('Message received:', event.data);
  try {
    const data = JSON.parse(event.data);
    console.log('Parsed:', data);
  } catch (e) {
    console.log('Raw message:', event.data);
  }
});

ws.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.addEventListener('close', (event) => {
  console.log('WebSocket closed:', event.code, event.reason);
});
```

## Performance Debugging

### React Performance

**React DevTools Profiler:**

```typescript
import { Profiler } from 'react';

function onRender(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) {
  console.log(`${id} ${phase} took ${actualDuration}ms`);
}

export function App() {
  return (
    <Profiler id="App" onRender={onRender}>
      {/* components */}
    </Profiler>
  );
}
```

**Use React DevTools:**

1. Open DevTools -> Profiler tab
2. Click Record
3. Perform actions
4. Stop recording
5. Analyze flame graph

**Find Unnecessary Re-renders:**

```typescript
// Add to component
useEffect(() => {
  console.log('Component rendered');
});

// Use why-did-you-render
import whyDidYouRender from '@welldone-software/why-did-you-render';

if (import.meta.env.DEV) {
  whyDidYouRender(React, {
    trackAllPureComponents: true,
  });
}
```

### Bundle Size Analysis

**Analyze Desktop Bundle:**

```bash
cd apps/desktop

# Build with analysis
pnpm build

# Check dist/ sizes
du -sh dist/*

# Use vite-bundle-visualizer
pnpm add -D vite-bundle-visualizer

# Add to vite.config.ts
import { visualizer } from 'vite-bundle-visualizer';

plugins: [
  visualizer({ open: true }),
]
```

**Analyze Web Bundle:**

```bash
cd apps/web

# Next.js bundle analyzer
pnpm add -D @next/bundle-analyzer

# next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);

# Run analysis
ANALYZE=true pnpm build
```

### Memory Profiling

**Chrome DevTools Memory:**

1. DevTools -> Memory tab
2. Take heap snapshot
3. Perform actions
4. Take another snapshot
5. Compare snapshots

**Find Memory Leaks:**

```typescript
// Check for detached DOM nodes
// Check for global variables
// Check for event listeners not cleaned up

useEffect(() => {
  const handler = () => {
    // ...
  };

  window.addEventListener('resize', handler);

  // Cleanup
  return () => {
    window.removeEventListener('resize', handler);
  };
}, []);
```

## Debugging Checklist

When debugging an issue:

- [ ] Check console for errors
- [ ] Check network tab for failed requests
- [ ] Add logging at key points
- [ ] Use debugger breakpoints
- [ ] Check state/props in React DevTools
- [ ] Verify data in database
- [ ] Test in isolation
- [ ] Check environment variables
- [ ] Review recent changes (git diff)
- [ ] Search for similar issues

## Useful Debug Commands

```bash
# Desktop app
RUST_LOG=debug pnpm dev:desktop
VITE_LOG_LEVEL=debug pnpm dev:desktop

# Web app
NODE_OPTIONS='--inspect' pnpm dev

# Verbose test output
pnpm test -- --reporter=verbose

# E2E with debug
pnpm test:e2e -- --debug

# Check Tauri info
cd apps/desktop && pnpm tauri info

# View SQLite database
sqlite3 ~/Library/Application\ Support/com.agiworkforce.app/agiworkforce.db
```

## Resources

- [Chrome DevTools Documentation](https://developer.chrome.com/docs/devtools/)
- [React DevTools Guide](https://react.dev/learn/react-developer-tools)
- [Rust Debugging Guide](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html)
- [Next.js Debugging](https://nextjs.org/docs/app/building-your-application/configuring/debugging)
