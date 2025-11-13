# Cache Management System

## Overview

The cache management system provides comprehensive caching capabilities for LLM responses with monitoring, analytics, and cost tracking. This system reduces API costs by caching LLM responses and enables efficient cache management through both CLI and UI interfaces.

## Architecture

### Backend (Rust)

**Location:** `apps/desktop/src-tauri/src/commands/cache.rs`

The cache management system provides:
- Real-time cache statistics and analytics
- Cache clearing by type or provider
- Cost savings tracking
- Export/import functionality
- Automatic cache pruning

### Frontend (TypeScript/React)

**Type Definitions:** `apps/desktop/src/types/cache.ts`
**Service Layer:** `apps/desktop/src/services/cacheService.ts`
**UI Component:** `apps/desktop/src/components/settings/CacheManagement.tsx`

## Available Commands

### 1. cache_get_stats

Get comprehensive cache statistics across all cache types.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_get_stats(db: State<'_, AppDatabase>) -> Result<CacheStats, String>
```

**TypeScript Usage:**
```typescript
import { CacheService } from './services/cacheService';

const stats = await CacheService.getStats();
console.log('Total size:', stats.total_size_mb, 'MB');
console.log('Total savings:', stats.total_savings_usd, 'USD');
```

**Response:**
```typescript
{
  llm_cache: {
    hits: 245,
    misses: 32,
    hit_rate: 0.88,
    size_mb: 12.5,
    entries: 156,
    savings_usd: 4.32
  },
  tool_cache: { /* placeholder */ },
  codebase_cache: { /* placeholder */ },
  total_size_mb: 12.5,
  total_savings_usd: 4.32
}
```

### 2. cache_clear_all

Clear all cache entries from all cache types.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_clear_all(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<(), String>
```

**TypeScript Usage:**
```typescript
await CacheService.clearAll();
```

### 3. cache_clear_by_type

Clear cache entries for a specific cache type.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_clear_by_type(
    cache_type: String,
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<(), String>
```

**TypeScript Usage:**
```typescript
await CacheService.clearByType('llm');    // Clear LLM cache
await CacheService.clearByType('tool');   // Clear tool cache (future)
await CacheService.clearByType('codebase'); // Clear codebase cache (future)
```

### 4. cache_clear_by_provider

Clear cache entries for a specific LLM provider.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_clear_by_provider(
    provider: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String>
```

**TypeScript Usage:**
```typescript
await CacheService.clearByProvider('openai');
await CacheService.clearByProvider('anthropic');
await CacheService.clearByProvider('google');
```

### 5. cache_get_size

Get total cache size in megabytes.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_get_size(db: State<'_, AppDatabase>) -> Result<f64, String>
```

**TypeScript Usage:**
```typescript
const sizeMB = await CacheService.getSize();
console.log(`Cache size: ${sizeMB.toFixed(2)} MB`);
```

### 6. cache_configure

Configure cache settings (TTL, max entries, enabled state).

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_configure(
    settings: CacheSettings,
    llm_state: State<'_, LLMState>,
) -> Result<(), String>
```

**TypeScript Usage:**
```typescript
await CacheService.configure({
  ttl_seconds: 86400,    // 24 hours
  max_entries: 1000,     // Maximum 1000 cached entries
  enabled: true          // Enable caching
});
```

**Note:** Runtime reconfiguration is planned for future implementation.

### 7. cache_warmup

Pre-populate cache with common queries (planned feature).

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_warmup(queries: Vec<String>) -> Result<(), String>
```

**TypeScript Usage:**
```typescript
await CacheService.warmup([
  'What is React?',
  'Explain async/await in JavaScript',
  'How to use TypeScript with React'
]);
```

### 8. cache_export

Export cache entries as JSON for backup.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_export(db: State<'_, AppDatabase>) -> Result<String, String>
```

**TypeScript Usage:**
```typescript
const exportData = await CacheService.export();

// Download as file
const blob = new Blob([exportData], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `cache-export-${new Date().toISOString()}.json`;
a.click();
```

**Export Format:**
```json
{
  "version": "1.0",
  "exported_at": "2024-01-15T10:30:00Z",
  "entries": [
    {
      "cache_key": "abc123...",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "prompt_hash": "def456...",
      "response": "...",
      "tokens": 150,
      "cost": 0.0023,
      "created_at": "2024-01-15T09:00:00Z",
      "last_used_at": "2024-01-15T10:25:00Z",
      "expires_at": "2024-01-16T09:00:00Z"
    }
  ]
}
```

### 9. cache_get_analytics

Get detailed cache analytics including most cached queries and provider breakdown.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_get_analytics(db: State<'_, AppDatabase>) -> Result<CacheAnalytics, String>
```

**TypeScript Usage:**
```typescript
const analytics = await CacheService.getAnalytics();

console.log('Top 10 cached queries:', analytics.most_cached_queries);
console.log('Provider breakdown:', analytics.provider_breakdown);
console.log('Total cost saved:', analytics.total_cost_saved);
console.log('Total tokens saved:', analytics.total_tokens_saved);
```

**Response:**
```typescript
{
  most_cached_queries: [
    {
      prompt_hash: 'abc123...',
      provider: 'openai',
      model: 'gpt-4o-mini',
      hit_count: 45,
      cost_saved: 1.23,
      last_used: '2024-01-15T10:30:00Z'
    }
  ],
  provider_breakdown: [
    {
      provider: 'openai',
      entries: 120,
      total_hits: 450,
      cost_saved: 3.21
    }
  ],
  total_cost_saved: 4.32,
  total_tokens_saved: 125000
}
```

### 10. cache_prune_expired

Manually trigger pruning of expired cache entries.

**Rust Signature:**
```rust
#[tauri::command]
pub async fn cache_prune_expired(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<usize, String>
```

**TypeScript Usage:**
```typescript
const prunedCount = await CacheService.pruneExpired();
console.log(`Pruned ${prunedCount} expired entries`);
```

## Database Schema

The cache system uses the `cache_entries` table (created in migration v5):

```sql
CREATE TABLE cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    tokens INTEGER,
    cost REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_cache_entries_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_entries_expires ON cache_entries(expires_at);
```

## Frontend Integration

### Using in React Components

```tsx
import React, { useEffect, useState } from 'react';
import { CacheService } from '@/services/cacheService';
import type { CacheStats } from '@/types/cache';

export const CacheDisplay: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);

  useEffect(() => {
    CacheService.getStats().then(setStats);
  }, []);

  const handleClear = async () => {
    await CacheService.clearAll();
    const newStats = await CacheService.getStats();
    setStats(newStats);
  };

  if (!stats) return <div>Loading...</div>;

  return (
    <div>
      <h2>Cache Statistics</h2>
      <p>Size: {stats.total_size_mb.toFixed(2)} MB</p>
      <p>Savings: ${stats.total_savings_usd.toFixed(4)}</p>
      <button onClick={handleClear}>Clear Cache</button>
    </div>
  );
};
```

### Using in Settings Panel

The `CacheManagement` component (`apps/desktop/src/components/settings/CacheManagement.tsx`) provides a complete UI for:

- Viewing cache statistics
- Clearing cache by type or provider
- Viewing analytics and most cached queries
- Exporting cache data
- Pruning expired entries

Import it in your settings page:

```tsx
import { CacheManagement } from '@/components/settings/CacheManagement';

export const SettingsPage = () => {
  return (
    <div>
      <h1>Settings</h1>
      <CacheManagement />
    </div>
  );
};
```

## Cost Savings Calculation

Cache cost savings are calculated based on:

1. **Initial Request Cost:** The cost of the first LLM API call that populated the cache
2. **Cache Hits:** Each subsequent use of the cached response saves the full API cost
3. **Total Savings:** Sum of (cache_hit_count × original_cost) for all cached entries

Example:
- OpenAI GPT-4o-mini request costs $0.0023
- Response is cached and reused 10 times
- Total savings: 10 × $0.0023 = $0.023

## Performance Considerations

### Cache Size Management

The cache automatically:
- Prunes expired entries (default TTL: 24 hours)
- Enforces maximum entry limit (default: 512 entries)
- Uses LRU (Least Recently Used) eviction when at capacity

### Database Indexes

Two indexes optimize cache operations:
- `idx_cache_entries_key`: Fast cache key lookups
- `idx_cache_entries_expires`: Efficient expiration pruning

## Future Enhancements

### Tool Cache (Planned)
Cache results from frequently used tools (file operations, code execution, etc.)

### Codebase Cache (Planned)
Cache codebase analysis results for faster context retrieval

### Smart Cache Warming (Planned)
Automatically identify and pre-cache frequently used queries

### Cache Synchronization (Planned)
Sync cache across multiple devices for consistent experience

## Testing

Run the cache management tests:

```bash
cd apps/desktop/src-tauri
cargo test cache -- --nocapture
```

## Troubleshooting

### Cache Not Working

1. Check database connection:
   ```typescript
   const stats = await CacheService.getStats();
   console.log('Entries:', stats.llm_cache.entries);
   ```

2. Verify cache is enabled in LLM state:
   ```rust
   // In main.rs
   app.manage(LLMState::new()); // Uses default cache settings
   ```

3. Check for expired entries:
   ```typescript
   const pruned = await CacheService.pruneExpired();
   console.log('Pruned:', pruned);
   ```

### High Memory Usage

If cache size is too large:

```typescript
// Clear old entries
await CacheService.pruneExpired();

// Or reduce cache size
await CacheService.configure({
  max_entries: 256, // Reduce from default 512
  ttl_seconds: 3600 // 1 hour instead of 24
});
```

## Security Considerations

- Cache entries contain LLM responses which may include sensitive data
- Cache is stored in SQLite database at `{APP_DATA}/agiworkforce.db`
- Export functionality should be used carefully to avoid exposing cached prompts/responses
- Consider implementing cache encryption for sensitive workloads

## API Reference

See TypeScript definitions in `apps/desktop/src/types/cache.ts` for complete type information.
