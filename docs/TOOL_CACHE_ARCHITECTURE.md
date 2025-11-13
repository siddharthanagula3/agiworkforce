# Tool Result Cache Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGI Executor                             │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  execute_tool(tool, parameters, context)                 │   │
│  │                                                           │   │
│  │  1. Check Cache ────────┐                               │   │
│  │                          │                               │   │
│  │  2. Cache Hit? ──────────┼───► Return Cached Result     │   │
│  │        │                 │                               │   │
│  │        │ No              │                               │   │
│  │        ▼                 │                               │   │
│  │  3. execute_tool_impl()  │                               │   │
│  │        │                 │                               │   │
│  │        ▼                 │                               │   │
│  │  4. Cache Result ────────┘                               │   │
│  │        │                                                 │   │
│  │        ▼                                                 │   │
│  │  5. Return Result                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Tool Result Cache (Arc)                     │   │
│  │                                                           │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  DashMap<String, ToolResultCacheEntry>          │   │   │
│  │  │  ┌────────────────────────────────────────────┐ │   │   │
│  │  │  │  Cache Key → Cache Entry                   │ │   │   │
│  │  │  │  ┌──────────────────────────────────────┐  │ │   │   │
│  │  │  │  │ tool_name: "file_read"              │  │ │   │   │
│  │  │  │  │ params_hash: "3f4d8e9a1b2c5e7f..."  │  │ │   │   │
│  │  │  │  │ result: {...}                        │  │ │   │   │
│  │  │  │  │ cached_at: DateTime<Utc>            │  │ │   │   │
│  │  │  │  │ ttl_seconds: 300                    │  │ │   │   │
│  │  │  │  │ size_bytes: 1024                    │  │ │   │   │
│  │  │  │  └──────────────────────────────────────┘  │ │   │   │
│  │  │  └────────────────────────────────────────────┘ │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                           │   │
│  │  TTL Config: HashMap<tool_name, Duration>                │   │
│  │  Stats: RwLock<ToolCacheStats>                          │   │
│  │  Current Size: RwLock<usize>                            │   │
│  │  Max Size: 100MB (default)                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Cache Key Generation Flow

```
Input: tool_name = "file_read"
       parameters = {"path": "/tmp/file.txt", "mode": "text"}

Step 1: Sort parameters by key
        ["mode": "text", "path": "/tmp/file.txt"]

Step 2: Create hash input
        "file_read::mode=text;path=/tmp/file.txt;"

Step 3: SHA-256 hash
        "3f4d8e9a1b2c5e7f9d0a1b2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f"

Output: Cache key for lookup
```

## Cache Lookup Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Tool Execution Request                                       │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Generate Cache Key                                           │
│ SHA256(tool_name + sorted_params)                           │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Check TTL Config                                             │
│ is_cacheable(tool_name)?                                    │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼ No (TTL=0)           ▼ Yes (TTL>0)
┌───────────────────┐   ┌──────────────────────────────────┐
│ Skip Cache        │   │ Lookup in DashMap                │
│ Execute Tool      │   │ entries.get(cache_key)          │
└───────────────────┘   └──────────────┬───────────────────┘
                                       │
                           ┌───────────┴───────────┐
                           │                       │
                           ▼ None (miss)          ▼ Some(entry)
                    ┌──────────────────┐   ┌─────────────────┐
                    │ Cache Miss        │   │ Check Expiry    │
                    │ stats.misses++   │   │ is_expired()?   │
                    │ Execute Tool      │   └────────┬────────┘
                    │ Cache Result      │            │
                    └──────────────────┘    ┌───────┴───────┐
                                           │               │
                                           ▼ Yes          ▼ No
                                    ┌──────────────┐ ┌───────────────┐
                                    │ Invalidate   │ │ Cache Hit     │
                                    │ stats.miss++ │ │ stats.hits++  │
                                    │ Execute Tool │ │ Return Result │
                                    └──────────────┘ └───────────────┘
```

## Cache Eviction Flow (LRU)

```
┌─────────────────────────────────────────────────────────────┐
│ New Entry Insertion                                          │
│ size = 5MB                                                   │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Check Capacity                                               │
│ current_size + new_size > max_size?                         │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼ No                   ▼ Yes (need eviction)
┌───────────────────┐   ┌──────────────────────────────────────┐
│ Insert Entry      │   │ Calculate Bytes to Free              │
│ Update Size       │   │ bytes_needed = (current + new) - max │
└───────────────────┘   └──────────────┬───────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────────────┐
                        │ Sort Entries by cached_at (oldest)   │
                        │ [entry1, entry2, entry3, ...]       │
                        └──────────────┬───────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────────────┐
                        │ Evict Loop                           │
                        │ while freed < bytes_needed:          │
                        │   - Remove oldest entry              │
                        │   - freed += entry.size             │
                        │   - stats.evictions++               │
                        └──────────────┬───────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────────────┐
                        │ Insert New Entry                     │
                        │ Update Size                          │
                        └──────────────────────────────────────┘
```

## TTL Configuration Matrix

```
┌──────────────────────┬─────────┬────────────┬──────────────────────┐
│ Tool Name            │ TTL (s) │ Cacheable  │ Rationale           │
├──────────────────────┼─────────┼────────────┼──────────────────────┤
│ file_read            │   300   │    Yes     │ Stable content      │
│ file_write           │     0   │    No      │ Side effects        │
│ ui_screenshot        │    30   │    Yes     │ Fast changing       │
│ ui_click             │     0   │    No      │ Actions             │
│ browser_navigate     │     0   │    No      │ Side effects        │
│ browser_extract      │    60   │    Yes     │ Stable content      │
│ api_call             │    60   │    Yes     │ May be stable       │
│ api_upload           │     0   │    No      │ Side effects        │
│ db_query             │   120   │    Yes     │ Stable data         │
│ db_execute           │     0   │    No      │ Mutations           │
│ code_execute         │     0   │    No      │ Always fresh        │
│ code_analyze         │   300   │    Yes     │ Expensive           │
│ image_ocr            │   300   │    Yes     │ Deterministic       │
│ llm_reason           │   600   │    Yes     │ Expensive + stable  │
│ document_read        │   300   │    Yes     │ Stable documents    │
└──────────────────────┴─────────┴────────────┴──────────────────────┘
```

## Cache Statistics Tracking

```
┌─────────────────────────────────────────────────────────────┐
│                    ToolCacheStats                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  hits: u64                                          │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Incremented on cache hit                     │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  misses: u64                                        │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Incremented on cache miss or expired entry  │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  evictions: u64                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Incremented when entries are evicted (LRU)  │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  total_size_bytes: usize                           │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Current memory usage of cache               │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  entry_count: usize                                │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Number of entries currently in cache        │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  hit_rate_percent: f64                             │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ Calculated: (hits / (hits + misses)) * 100  │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Cache Invalidation Patterns

### Pattern 1: Write Invalidates Read (Automatic)

```
┌──────────────────┐
│  file_write()    │
│  path="/tmp/a"   │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ Invalidate Cache             │
│ tool: "file_read"            │
│ params: {"path": "/tmp/a"}   │
└──────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Remove Entry from DashMap    │
│ Update Stats                 │
└──────────────────────────────┘
```

### Pattern 2: Manual Tool Invalidation

```
┌──────────────────┐
│ invalidate_tool  │
│ ("ui_screenshot")│
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ Find All Entries             │
│ WHERE tool_name =            │
│       "ui_screenshot"        │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Remove All Matching          │
│ Return count removed         │
└──────────────────────────────┘
```

### Pattern 3: Time-Based Expiry (Automatic)

```
┌──────────────────┐
│ Cache Lookup     │
│ get(key)         │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ Entry Found                  │
│ Check: is_expired()?         │
│  now - cached_at > ttl?      │
└────────┬─────────────────────┘
         │
         ▼ Yes (expired)
┌──────────────────────────────┐
│ Auto-remove from cache       │
│ Return None (cache miss)     │
└──────────────────────────────┘
```

## Thread Safety Design

```
┌─────────────────────────────────────────────────────────────┐
│                  ToolResultCache                             │
│                                                               │
│  entries: Arc<DashMap<...>>     ◄─── Lock-free reads       │
│  ├─ Multiple readers allowed                                │
│  └─ Writes use internal locks                               │
│                                                               │
│  current_size_bytes: Arc<RwLock<usize>>                     │
│  ├─ Multiple readers allowed                                │
│  └─ Single writer at a time                                 │
│                                                               │
│  stats: Arc<RwLock<ToolCacheStats>>                         │
│  ├─ Multiple readers allowed                                │
│  └─ Single writer at a time                                 │
│                                                               │
│  ttl_config: ToolCacheTTLConfig                             │
│  └─ Immutable (no locks needed)                             │
└─────────────────────────────────────────────────────────────┘

Concurrency Guarantees:
✅ Multiple threads can read from cache simultaneously
✅ Multiple threads can write different keys simultaneously
✅ Reads never block other reads
✅ Writes to different keys don't block each other
✅ Size/stats updates are atomic
✅ No deadlocks possible (lock ordering guaranteed)
```

## Memory Layout

```
┌──────────────────────────────────────────────────────────┐
│ Cache Memory Layout (per entry)                          │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Cache Key (String):          ~64 bytes (SHA-256)       │
│  ┌─────────────────────────────────────────────────┐    │
│  │ "3f4d8e9a1b2c5e7f9d0a1b2c3e4f5a6b..."          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Cache Entry:                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ tool_name: String         ~20 bytes             │    │
│  │ params_hash: String       ~64 bytes             │    │
│  │ result: serde_json::Value  VARIABLE SIZE        │    │
│  │ cached_at: DateTime<Utc>  ~12 bytes            │    │
│  │ cached_at_instant: Option<u64>  8 bytes        │    │
│  │ ttl_seconds: u64          8 bytes              │    │
│  │ size_bytes: usize         8 bytes              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  Total Fixed Overhead: ~184 bytes per entry              │
│  Variable Size: result payload (avg ~1-10KB)            │
│  Typical Entry Size: ~2-20KB                             │
│                                                           │
│  Max Entries at 100MB: ~5,000-50,000 entries            │
└──────────────────────────────────────────────────────────┘
```

## Performance Characteristics

```
┌────────────────────────────────────────────────────────────┐
│ Operation Complexity                                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  get(key):                    O(1) average, O(log n) worst │
│  set(key, value):             O(1) average, O(log n) worst │
│  invalidate(key):             O(1) average, O(log n) worst │
│  invalidate_tool(tool_name):  O(n) - scan all entries     │
│  prune_expired():             O(n) - scan all entries     │
│  evict_lru(bytes):            O(n log n) - sort + remove  │
│  clear():                     O(n) - remove all           │
│                                                             │
│  Memory Overhead:             ~200 bytes per entry         │
│  Hash Collisions:             Negligible (SHA-256)        │
│  Lock Contention:             Minimal (DashMap sharding)  │
└────────────────────────────────────────────────────────────┘
```
