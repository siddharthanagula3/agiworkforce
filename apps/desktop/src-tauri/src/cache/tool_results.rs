use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Configuration for tool-specific cache TTL (Time To Live)
#[derive(Debug, Clone)]
pub struct ToolCacheTTLConfig {
    configs: HashMap<String, Duration>,
    default_ttl: Duration,
}

impl Default for ToolCacheTTLConfig {
    fn default() -> Self {
        let mut configs = HashMap::new();

        // File operations: 5 minutes (invalidate on file change)
        configs.insert("file_read".to_string(), Duration::from_secs(300));
        configs.insert("file_write".to_string(), Duration::from_secs(0)); // Never cache writes

        // UI automation: 30 seconds (UI changes frequently)
        configs.insert("ui_screenshot".to_string(), Duration::from_secs(30));
        configs.insert("ui_click".to_string(), Duration::from_secs(0)); // Never cache actions
        configs.insert("ui_type".to_string(), Duration::from_secs(0)); // Never cache actions

        // Browser operations
        configs.insert("browser_navigate".to_string(), Duration::from_secs(0)); // Never cache navigation
        configs.insert("browser_click".to_string(), Duration::from_secs(0)); // Never cache actions
        configs.insert("browser_extract".to_string(), Duration::from_secs(60)); // 1 minute

        // API calls: 1 minute
        configs.insert("api_call".to_string(), Duration::from_secs(60));
        configs.insert("api_upload".to_string(), Duration::from_secs(0)); // Never cache uploads
        configs.insert("api_download".to_string(), Duration::from_secs(120)); // 2 minutes

        // Database operations: 2 minutes
        configs.insert("db_query".to_string(), Duration::from_secs(120));
        configs.insert("db_execute".to_string(), Duration::from_secs(0)); // Never cache mutations
        configs.insert("db_transaction_begin".to_string(), Duration::from_secs(0));
        configs.insert("db_transaction_commit".to_string(), Duration::from_secs(0));
        configs.insert("db_transaction_rollback".to_string(), Duration::from_secs(0));

        // Code execution: Never cache (always fresh)
        configs.insert("code_execute".to_string(), Duration::from_secs(0));
        configs.insert("code_analyze".to_string(), Duration::from_secs(300)); // 5 minutes

        // Image processing: 5 minutes
        configs.insert("image_ocr".to_string(), Duration::from_secs(300));

        // LLM reasoning: 10 minutes
        configs.insert("llm_reason".to_string(), Duration::from_secs(600));

        // Document operations: 5 minutes
        configs.insert("document_read".to_string(), Duration::from_secs(300));
        configs.insert("document_search".to_string(), Duration::from_secs(300));

        // Communication tools: Never cache (actions)
        configs.insert("email_send".to_string(), Duration::from_secs(0));
        configs.insert("email_fetch".to_string(), Duration::from_secs(120)); // 2 minutes

        // Calendar operations
        configs.insert("calendar_create_event".to_string(), Duration::from_secs(0));
        configs.insert("calendar_list_events".to_string(), Duration::from_secs(120)); // 2 minutes

        // Cloud operations
        configs.insert("cloud_upload".to_string(), Duration::from_secs(0));
        configs.insert("cloud_download".to_string(), Duration::from_secs(300)); // 5 minutes

        // Productivity tools
        configs.insert("productivity_create_task".to_string(), Duration::from_secs(0));

        Self {
            configs,
            default_ttl: Duration::from_secs(60), // Default: 1 minute
        }
    }
}

impl ToolCacheTTLConfig {
    pub fn get_ttl(&self, tool_name: &str) -> Duration {
        self.configs
            .get(tool_name)
            .copied()
            .unwrap_or(self.default_ttl)
    }

    pub fn is_cacheable(&self, tool_name: &str) -> bool {
        self.get_ttl(tool_name) > Duration::from_secs(0)
    }
}

/// Cache entry for tool execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultCacheEntry {
    pub tool_name: String,
    pub params_hash: String,
    pub result: serde_json::Value,
    pub cached_at: DateTime<Utc>,
    pub cached_at_instant: Option<u64>, // Instant as u64 (milliseconds since cache creation)
    pub ttl_seconds: u64,
    pub size_bytes: usize,
}

impl ToolResultCacheEntry {
    fn is_expired(&self, cache_start_instant: Instant) -> bool {
        if let Some(cached_at_ms) = self.cached_at_instant {
            let elapsed = cache_start_instant.elapsed().as_millis() as u64;
            let cache_age_ms = elapsed.saturating_sub(cached_at_ms);
            cache_age_ms > (self.ttl_seconds * 1000)
        } else {
            // Fallback to DateTime comparison if instant is not available
            let elapsed_seconds = (Utc::now() - self.cached_at).num_seconds();
            elapsed_seconds > self.ttl_seconds as i64
        }
    }

    fn estimate_size(result: &serde_json::Value) -> usize {
        // Estimate size of JSON value in bytes
        match serde_json::to_string(result) {
            Ok(json_str) => json_str.len(),
            Err(_) => 0,
        }
    }
}

/// Cache statistics for monitoring tool result cache
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolCacheStats {
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub total_size_bytes: usize,
    pub entry_count: usize,
    pub hit_rate_percent: f64,
}

impl ToolCacheStats {
    fn calculate_hit_rate(&mut self) {
        let total = self.hits + self.misses;
        if total > 0 {
            self.hit_rate_percent = (self.hits as f64 / total as f64) * 100.0;
        } else {
            self.hit_rate_percent = 0.0;
        }
    }
}

/// In-memory LRU cache for tool execution results
pub struct ToolResultCache {
    /// Cache entries stored in a concurrent hash map
    entries: Arc<DashMap<String, ToolResultCacheEntry>>,

    /// TTL configuration per tool type
    ttl_config: ToolCacheTTLConfig,

    /// Maximum cache size in bytes (default: 100MB)
    max_size_bytes: usize,

    /// Current total size in bytes
    current_size_bytes: Arc<RwLock<usize>>,

    /// Cache statistics
    stats: Arc<RwLock<ToolCacheStats>>,

    /// Instant when cache was created (for relative time tracking)
    start_instant: Instant,
}

impl ToolResultCache {
    /// Create a new tool result cache with default settings (100MB max size)
    pub fn new() -> Self {
        Self::with_capacity(100 * 1024 * 1024) // 100MB
    }

    /// Create a new tool result cache with custom max size
    pub fn with_capacity(max_size_bytes: usize) -> Self {
        Self {
            entries: Arc::new(DashMap::new()),
            ttl_config: ToolCacheTTLConfig::default(),
            max_size_bytes,
            current_size_bytes: Arc::new(RwLock::new(0)),
            stats: Arc::new(RwLock::new(ToolCacheStats::default())),
            start_instant: Instant::now(),
        }
    }

    /// Generate cache key from tool name and parameters
    pub fn generate_cache_key(
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(tool_name.as_bytes());
        hasher.update(b"::");

        // Sort parameters by key for consistent hashing
        let mut sorted_params: Vec<_> = parameters.iter().collect();
        sorted_params.sort_by_key(|(k, _)| *k);

        for (key, value) in sorted_params {
            hasher.update(key.as_bytes());
            hasher.update(b"=");
            if let Ok(json_str) = serde_json::to_string(value) {
                hasher.update(json_str.as_bytes());
            }
            hasher.update(b";");
        }

        format!("{:x}", hasher.finalize())
    }

    /// Get a cached result if available and not expired
    pub fn get(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Option<serde_json::Value> {
        // Check if tool is cacheable
        if !self.ttl_config.is_cacheable(tool_name) {
            return None;
        }

        let cache_key = Self::generate_cache_key(tool_name, parameters);

        if let Some(entry) = self.entries.get(&cache_key) {
            // Check if expired
            if entry.is_expired(self.start_instant) {
                // Drop the reference before removing
                drop(entry);
                self.invalidate_key(&cache_key);

                // Record miss
                let mut stats = self.stats.write();
                stats.misses += 1;
                stats.calculate_hit_rate();

                return None;
            }

            // Cache hit
            let result = entry.result.clone();
            drop(entry); // Release the lock

            let mut stats = self.stats.write();
            stats.hits += 1;
            stats.calculate_hit_rate();

            tracing::debug!(
                "[ToolCache] Cache HIT for tool '{}' (key: {})",
                tool_name,
                &cache_key[..16]
            );

            return Some(result);
        }

        // Cache miss
        let mut stats = self.stats.write();
        stats.misses += 1;
        stats.calculate_hit_rate();

        tracing::debug!(
            "[ToolCache] Cache MISS for tool '{}' (key: {})",
            tool_name,
            &cache_key[..16]
        );

        None
    }

    /// Store a result in the cache
    pub fn set(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
        result: serde_json::Value,
    ) -> Result<()> {
        // Check if tool is cacheable
        if !self.ttl_config.is_cacheable(tool_name) {
            return Ok(()); // Silently skip non-cacheable tools
        }

        let cache_key = Self::generate_cache_key(tool_name, parameters);
        let ttl = self.ttl_config.get_ttl(tool_name);
        let size_bytes = ToolResultCacheEntry::estimate_size(&result);

        // Check if single entry exceeds max size
        if size_bytes > self.max_size_bytes {
            tracing::warn!(
                "[ToolCache] Single entry for tool '{}' exceeds max cache size ({} bytes > {} bytes), skipping cache",
                tool_name,
                size_bytes,
                self.max_size_bytes
            );
            return Ok(());
        }

        // Evict entries if necessary to make room
        self.ensure_capacity(size_bytes)?;

        let entry = ToolResultCacheEntry {
            tool_name: tool_name.to_string(),
            params_hash: cache_key.clone(),
            result,
            cached_at: Utc::now(),
            cached_at_instant: Some(self.start_instant.elapsed().as_millis() as u64),
            ttl_seconds: ttl.as_secs(),
            size_bytes,
        };

        // Insert entry
        self.entries.insert(cache_key.clone(), entry);

        // Update size tracking
        {
            let mut current_size = self.current_size_bytes.write();
            *current_size += size_bytes;
        }

        // Update stats
        {
            let mut stats = self.stats.write();
            stats.entry_count = self.entries.len();
            stats.total_size_bytes = *self.current_size_bytes.read();
        }

        tracing::debug!(
            "[ToolCache] Cached result for tool '{}' (key: {}, size: {} bytes, ttl: {}s)",
            tool_name,
            &cache_key[..16],
            size_bytes,
            ttl.as_secs()
        );

        Ok(())
    }

    /// Invalidate a specific cache entry by tool name and parameters
    pub fn invalidate(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Result<()> {
        let cache_key = Self::generate_cache_key(tool_name, parameters);
        self.invalidate_key(&cache_key);
        Ok(())
    }

    /// Invalidate all cache entries for a specific tool
    pub fn invalidate_tool(&self, tool_name: &str) -> Result<usize> {
        let mut removed_count = 0;

        // Find all keys for this tool
        let keys_to_remove: Vec<String> = self
            .entries
            .iter()
            .filter(|entry| entry.value().tool_name == tool_name)
            .map(|entry| entry.key().clone())
            .collect();

        // Remove each entry
        for key in keys_to_remove {
            self.invalidate_key(&key);
            removed_count += 1;
        }

        tracing::info!(
            "[ToolCache] Invalidated {} cache entries for tool '{}'",
            removed_count,
            tool_name
        );

        Ok(removed_count)
    }

    /// Invalidate cache entry by key
    fn invalidate_key(&self, cache_key: &str) {
        if let Some((_, entry)) = self.entries.remove(cache_key) {
            // Update size tracking
            let mut current_size = self.current_size_bytes.write();
            *current_size = current_size.saturating_sub(entry.size_bytes);

            // Update stats
            let mut stats = self.stats.write();
            stats.entry_count = self.entries.len();
            stats.total_size_bytes = *self.current_size_bytes.read();

            tracing::debug!(
                "[ToolCache] Invalidated cache entry (key: {})",
                &cache_key[..16]
            );
        }
    }

    /// Ensure cache has capacity for new entry by evicting if necessary
    fn ensure_capacity(&self, required_bytes: usize) -> Result<()> {
        let current_size = *self.current_size_bytes.read();

        // Check if we need to evict
        if current_size + required_bytes <= self.max_size_bytes {
            return Ok(());
        }

        let bytes_to_free = (current_size + required_bytes) - self.max_size_bytes;
        self.evict_lru(bytes_to_free)?;

        Ok(())
    }

    /// Evict least recently used entries to free up space
    fn evict_lru(&self, bytes_to_free: usize) -> Result<()> {
        let mut freed_bytes = 0;
        let mut eviction_count = 0;

        // Collect entries sorted by cached_at (oldest first)
        let mut entries: Vec<_> = self
            .entries
            .iter()
            .map(|entry| (entry.key().clone(), entry.cached_at, entry.size_bytes))
            .collect();

        entries.sort_by_key(|(_, cached_at, _)| *cached_at);

        // Evict oldest entries until we've freed enough space
        for (key, _, size) in entries {
            if freed_bytes >= bytes_to_free {
                break;
            }

            self.invalidate_key(&key);
            freed_bytes += size;
            eviction_count += 1;
        }

        // Update eviction stats
        {
            let mut stats = self.stats.write();
            stats.evictions += eviction_count;
        }

        tracing::info!(
            "[ToolCache] Evicted {} entries, freed {} bytes",
            eviction_count,
            freed_bytes
        );

        Ok(())
    }

    /// Prune all expired entries
    pub fn prune_expired(&self) -> Result<usize> {
        let mut removed_count = 0;

        // Find expired keys
        let expired_keys: Vec<String> = self
            .entries
            .iter()
            .filter(|entry| entry.is_expired(self.start_instant))
            .map(|entry| entry.key().clone())
            .collect();

        // Remove expired entries
        for key in expired_keys {
            self.invalidate_key(&key);
            removed_count += 1;
        }

        if removed_count > 0 {
            tracing::info!(
                "[ToolCache] Pruned {} expired cache entries",
                removed_count
            );
        }

        Ok(removed_count)
    }

    /// Clear all cache entries
    pub fn clear(&self) -> Result<()> {
        let count = self.entries.len();
        self.entries.clear();

        {
            let mut current_size = self.current_size_bytes.write();
            *current_size = 0;
        }

        {
            let mut stats = self.stats.write();
            stats.entry_count = 0;
            stats.total_size_bytes = 0;
        }

        tracing::info!("[ToolCache] Cleared all {} cache entries", count);

        Ok(())
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> ToolCacheStats {
        self.stats.read().clone()
    }

    /// Reset cache statistics (but keep entries)
    pub fn reset_stats(&self) {
        let mut stats = self.stats.write();
        stats.hits = 0;
        stats.misses = 0;
        stats.evictions = 0;
        stats.hit_rate_percent = 0.0;
        // Keep entry_count and total_size_bytes
    }

    /// Get the number of entries in the cache
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Get current cache size in bytes
    pub fn size_bytes(&self) -> usize {
        *self.current_size_bytes.read()
    }

    /// Get maximum cache size in bytes
    pub fn max_size_bytes(&self) -> usize {
        self.max_size_bytes
    }
}

impl Default for ToolResultCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_generation() {
        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/test/file.txt"));
        params.insert("mode".to_string(), serde_json::json!("read"));

        let key1 = ToolResultCache::generate_cache_key("file_read", &params);
        let key2 = ToolResultCache::generate_cache_key("file_read", &params);

        // Same parameters should generate same key
        assert_eq!(key1, key2);

        // Different tool should generate different key
        let key3 = ToolResultCache::generate_cache_key("file_write", &params);
        assert_ne!(key1, key3);
    }

    #[test]
    fn test_cache_ttl_config() {
        let config = ToolCacheTTLConfig::default();

        // Check specific tool TTLs
        assert_eq!(config.get_ttl("file_read").as_secs(), 300); // 5 minutes
        assert_eq!(config.get_ttl("ui_screenshot").as_secs(), 30); // 30 seconds
        assert_eq!(config.get_ttl("code_execute").as_secs(), 0); // Never cache

        // Check cacheability
        assert!(config.is_cacheable("file_read"));
        assert!(!config.is_cacheable("code_execute"));
    }

    #[test]
    fn test_basic_cache_operations() {
        let cache = ToolResultCache::new();
        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/test/file.txt"));

        // Cache miss on first access
        assert!(cache.get("file_read", &params).is_none());

        // Store result
        let result = serde_json::json!({"content": "test data"});
        cache.set("file_read", &params, result.clone()).unwrap();

        // Cache hit on second access
        let cached = cache.get("file_read", &params);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap(), result);

        // Check stats
        let stats = cache.get_stats();
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.entry_count, 1);
    }

    #[test]
    fn test_non_cacheable_tool() {
        let cache = ToolResultCache::new();
        let mut params = HashMap::new();
        params.insert("code".to_string(), serde_json::json!("print('hello')"));

        // Try to cache non-cacheable tool
        let result = serde_json::json!({"output": "hello"});
        cache.set("code_execute", &params, result).unwrap();

        // Should not be cached
        assert!(cache.get("code_execute", &params).is_none());
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cache_invalidation() {
        let cache = ToolResultCache::new();
        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/test/file.txt"));

        // Store result
        let result = serde_json::json!({"content": "test data"});
        cache.set("file_read", &params, result).unwrap();

        assert_eq!(cache.len(), 1);

        // Invalidate specific entry
        cache.invalidate("file_read", &params).unwrap();
        assert_eq!(cache.len(), 0);
        assert!(cache.get("file_read", &params).is_none());
    }

    #[test]
    fn test_cache_clear() {
        let cache = ToolResultCache::new();
        let mut params1 = HashMap::new();
        params1.insert("path".to_string(), serde_json::json!("/test/file1.txt"));

        let mut params2 = HashMap::new();
        params2.insert("path".to_string(), serde_json::json!("/test/file2.txt"));

        // Store multiple results
        cache
            .set(
                "file_read",
                &params1,
                serde_json::json!({"content": "data1"}),
            )
            .unwrap();
        cache
            .set(
                "file_read",
                &params2,
                serde_json::json!({"content": "data2"}),
            )
            .unwrap();

        assert_eq!(cache.len(), 2);

        // Clear cache
        cache.clear().unwrap();
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.size_bytes(), 0);
    }
}
