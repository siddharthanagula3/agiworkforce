# Tool Result Cache - Developer Guide

## Quick Start

The tool result cache is automatically enabled in the AGI Executor. No configuration is required for basic usage.

## Basic Usage

### Automatic Caching

The cache works transparently - tools are automatically cached based on their configured TTL:

```rust
// Create executor (cache is initialized automatically)
let executor = AGIExecutor::new(
    tool_registry,
    resource_manager,
    automation,
    router,
    app_handle,
)?;

// Execute a tool - cache is checked automatically
let result = executor.execute_step(&step, &context).await?;
// First call: executes tool and caches result
// Second call with same parameters: returns cached result
```

### Custom Cache Size

```rust
// Create executor with 200MB cache
let executor = AGIExecutor::with_cache_capacity(
    tool_registry,
    resource_manager,
    automation,
    router,
    app_handle,
    200 * 1024 * 1024, // 200MB
)?;
```

## Monitoring Cache Performance

### Get Cache Statistics

```rust
// Get current cache stats
let stats = executor.get_cache_stats();

println!("Cache Statistics:");
println!("  Hits: {}", stats.hits);
println!("  Misses: {}", stats.misses);
println!("  Hit Rate: {:.2}%", stats.hit_rate_percent);
println!("  Entries: {}", stats.entry_count);
println!("  Size: {} MB", stats.total_size_bytes / 1_048_576);
println!("  Evictions: {}", stats.evictions);
```

### Example Output

```
Cache Statistics:
  Hits: 1,234
  Misses: 456
  Hit Rate: 73.02%
  Entries: 89
  Size: 12 MB
  Evictions: 23
```

## Cache Management

### Clear Entire Cache

```rust
// Clear all cached entries
executor.clear_cache()?;
```

### Prune Expired Entries

```rust
// Remove all expired entries
let removed_count = executor.prune_cache()?;
println!("Removed {} expired entries", removed_count);
```

### Manual Invalidation

```rust
// Direct access to cache (via executor.tool_cache)
let cache = &executor.tool_cache;

// Invalidate specific entry
let mut params = HashMap::new();
params.insert("path".to_string(), json!("/tmp/file.txt"));
cache.invalidate("file_read", &params)?;

// Invalidate all entries for a tool
let removed = cache.invalidate_tool("ui_screenshot")?;
println!("Invalidated {} screenshot entries", removed);
```

## Tool-Specific Caching Behavior

### Always Cached (TTL > 0)

- `file_read` (5 minutes)
- `ui_screenshot` (30 seconds)
- `browser_extract` (1 minute)
- `api_call` (1 minute)
- `db_query` (2 minutes)
- `image_ocr` (5 minutes)
- `llm_reason` (10 minutes)
- `document_read` (5 minutes)
- `code_analyze` (5 minutes)

### Never Cached (TTL = 0)

- `file_write` - Write operations have side effects
- `ui_click`, `ui_type` - UI actions have side effects
- `browser_navigate` - Navigation has side effects
- `code_execute` - Always needs fresh execution
- `db_execute`, `db_transaction_*` - Database mutations
- `api_upload` - Upload operations have side effects
- All email/calendar/cloud operations that mutate state

## Automatic Cache Invalidation

### File Write Invalidation

When `file_write` executes, the cache automatically invalidates any cached `file_read` for the same path:

```rust
// Write to file
let mut write_params = HashMap::new();
write_params.insert("path".to_string(), json!("/tmp/data.txt"));
write_params.insert("content".to_string(), json!("new content"));
executor.execute_tool(&write_tool, &write_params, &context).await?;

// Cached read is now invalid
let mut read_params = HashMap::new();
read_params.insert("path".to_string(), json!("/tmp/data.txt"));
let result = executor.execute_tool(&read_tool, &read_params, &context).await?;
// This will re-read the file (cache miss)
```

## Best Practices

### 1. Monitor Cache Hit Rate

Regularly check cache statistics to ensure the cache is effective:

```rust
let stats = executor.get_cache_stats();
if stats.hit_rate_percent < 20.0 {
    println!("Warning: Low cache hit rate - consider adjusting TTL");
}
```

### 2. Adjust Cache Size for Your Workload

- **Small workflows** (< 10 tools): 50MB sufficient
- **Medium workflows** (10-100 tools): 100MB (default)
- **Large workflows** (100+ tools): 200-500MB

```rust
// For large workflows
let executor = AGIExecutor::with_cache_capacity(
    /* ... */,
    500 * 1024 * 1024, // 500MB
)?;
```

### 3. Clear Cache Between Workflows

For long-running AGI instances, periodically clear the cache to prevent memory bloat:

```rust
// After completing a major workflow
executor.clear_cache()?;
```

### 4. Prune During Idle Time

Schedule periodic cache pruning during idle periods:

```rust
// In a background task
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
    loop {
        interval.tick().await;
        if let Ok(removed) = executor.prune_cache() {
            if removed > 0 {
                tracing::info!("Pruned {} expired cache entries", removed);
            }
        }
    }
});
```

## Advanced Usage

### Custom TTL Configuration

To modify TTL for specific tools, you need to create a custom `ToolCacheTTLConfig`:

```rust
use crate::cache::{ToolCacheTTLConfig, ToolResultCache};

// Create custom TTL config
let mut ttl_config = ToolCacheTTLConfig::default();
// Note: Currently TTL config is internal to ToolResultCache
// To customize, modify the default() implementation in tool_results.rs
```

### Direct Cache Access

```rust
use crate::cache::ToolResultCache;

// Create standalone cache
let cache = ToolResultCache::new();

// Use cache directly
let mut params = HashMap::new();
params.insert("key".to_string(), json!("value"));

// Get from cache
if let Some(result) = cache.get("my_tool", &params) {
    println!("Cache hit: {:?}", result);
} else {
    // Execute tool
    let result = execute_my_tool(&params)?;
    // Store in cache
    cache.set("my_tool", &params, result.clone())?;
}
```

### Cache Key Generation

Understand how cache keys are generated:

```rust
use crate::cache::ToolResultCache;

let mut params = HashMap::new();
params.insert("path".to_string(), json!("/tmp/file.txt"));
params.insert("mode".to_string(), json!("read"));

// Generate cache key
let key = ToolResultCache::generate_cache_key("file_read", &params);
println!("Cache key: {}", key); // SHA-256 hash
```

## Debugging Cache Issues

### Enable Debug Logging

The cache emits detailed debug logs:

```rust
// In your Rust logger configuration
tracing_subscriber::fmt()
    .with_env_filter("agiworkforce_desktop=debug")
    .init();
```

### Debug Log Examples

```
[ToolCache] Cache MISS for tool 'file_read' (key: 3f4d8e9a1b2c5e7f)
[ToolCache] Cached result for tool 'file_read' (key: 3f4d8e9a1b2c5e7f, size: 1024 bytes, ttl: 300s)
[ToolCache] Cache HIT for tool 'file_read' (key: 3f4d8e9a1b2c5e7f)
[ToolCache] Invalidated cache entry (key: 3f4d8e9a1b2c5e7f)
[ToolCache] Evicted 5 entries, freed 12,480 bytes
```

### Common Issues

#### 1. Low Cache Hit Rate

**Symptom**: Hit rate < 20%

**Causes**:
- Parameters changing frequently (e.g., timestamps)
- Non-deterministic tool behavior
- TTL too short

**Solutions**:
- Normalize parameters before caching
- Increase TTL for stable tools
- Remove volatile parameters from cache key

#### 2. High Memory Usage

**Symptom**: Cache size approaching 100MB

**Causes**:
- Large result payloads
- Too many cached entries
- Eviction not triggering

**Solutions**:
- Reduce cache size: `with_cache_capacity(50 * 1024 * 1024)`
- More aggressive pruning
- Exclude large results from caching

#### 3. Stale Data

**Symptom**: Cached results don't reflect latest state

**Causes**:
- TTL too long
- Missing invalidation on writes
- External changes not detected

**Solutions**:
- Reduce TTL for volatile data
- Add manual invalidation after writes
- Clear cache when external changes detected

## Performance Tips

### 1. Batch Similar Operations

Group similar operations together to maximize cache hits:

```rust
// Good: Read same file multiple times
for i in 0..10 {
    let result = read_file("/tmp/data.txt")?; // Only first call executes
}

// Bad: Read different files
for i in 0..10 {
    let result = read_file(&format!("/tmp/data_{}.txt", i))?; // No cache hits
}
```

### 2. Reuse Parameters

Use consistent parameter structures to improve cache hits:

```rust
// Good: Reuse parameter object
let params = HashMap::from([
    ("path".to_string(), json!("/tmp/data.txt")),
]);
executor.execute_tool(&tool, &params, &context).await?;
executor.execute_tool(&tool, &params, &context).await?; // Cache hit

// Bad: Create new parameters each time
executor.execute_tool(&tool, &HashMap::from([
    ("path".to_string(), json!("/tmp/data.txt")),
]), &context).await?;
executor.execute_tool(&tool, &HashMap::from([
    ("path".to_string(), json!("/tmp/data.txt")),
]), &context).await?; // Still cache hit (same hash), but less efficient
```

### 3. Leverage Parallel Execution

Parallel tasks share the same cache, improving hit rates:

```rust
// All parallel executors share cache
executor.execute_plans_parallel(plans, sandbox_manager, goal).await?;
// Cache hits across parallel tasks!
```

## Benchmarking

### Measure Cache Impact

```rust
use std::time::Instant;

// Measure execution time
let start = Instant::now();
let result = executor.execute_tool(&tool, &params, &context).await?;
let duration = start.elapsed();
println!("Execution time: {:?}", duration);

// Compare with and without cache
let stats = executor.get_cache_stats();
println!("This was a cache {}", if stats.hits > 0 { "hit" } else { "miss" });
```

### Expected Performance

| Operation | Without Cache | With Cache | Speedup |
|-----------|--------------|------------|---------|
| File Read (1MB) | 10-50ms | 0.1ms | 100-500x |
| UI Screenshot | 100-500ms | 0.1ms | 1,000-5,000x |
| API Call | 100-2,000ms | 0.1ms | 1,000-20,000x |
| Database Query | 10-100ms | 0.1ms | 100-1,000x |
| Image OCR | 500-5,000ms | 0.1ms | 5,000-50,000x |
| LLM Call | 1-10 seconds | 0.1ms | 10,000-100,000x |

## Contributing

To add caching support for new tools:

1. Add tool to `ToolCacheTTLConfig::default()` in `tool_results.rs`
2. Set appropriate TTL (or 0 for non-cacheable)
3. Add cache invalidation if tool modifies state
4. Add tests for cache behavior
5. Update documentation

Example:

```rust
// In ToolCacheTTLConfig::default()
configs.insert("my_new_tool".to_string(), Duration::from_secs(120)); // 2 minutes
```
