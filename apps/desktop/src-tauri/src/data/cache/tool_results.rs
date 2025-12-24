use anyhow::Result;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct ToolCacheTTLConfig {
    configs: HashMap<String, Duration>,
    default_ttl: Duration,
}

impl Default for ToolCacheTTLConfig {
    fn default() -> Self {
        let mut configs = HashMap::new();

        configs.insert("file_read".to_string(), Duration::from_secs(300));
        configs.insert("file_write".to_string(), Duration::from_secs(0));

        configs.insert("ui_screenshot".to_string(), Duration::from_secs(30));
        configs.insert("ui_click".to_string(), Duration::from_secs(0));
        configs.insert("ui_type".to_string(), Duration::from_secs(0));

        configs.insert("browser_navigate".to_string(), Duration::from_secs(0));
        configs.insert("browser_click".to_string(), Duration::from_secs(0));
        configs.insert("browser_extract".to_string(), Duration::from_secs(60));

        configs.insert("api_call".to_string(), Duration::from_secs(60));
        configs.insert("api_upload".to_string(), Duration::from_secs(0));
        configs.insert("api_download".to_string(), Duration::from_secs(120));

        configs.insert("db_query".to_string(), Duration::from_secs(120));
        configs.insert("db_execute".to_string(), Duration::from_secs(0));
        configs.insert("db_transaction_begin".to_string(), Duration::from_secs(0));
        configs.insert("db_transaction_commit".to_string(), Duration::from_secs(0));
        configs.insert(
            "db_transaction_rollback".to_string(),
            Duration::from_secs(0),
        );

        configs.insert("code_execute".to_string(), Duration::from_secs(0));
        configs.insert("code_analyze".to_string(), Duration::from_secs(300));

        configs.insert("image_ocr".to_string(), Duration::from_secs(300));

        configs.insert("llm_reason".to_string(), Duration::from_secs(600));

        configs.insert("document_read".to_string(), Duration::from_secs(300));
        configs.insert("document_search".to_string(), Duration::from_secs(300));

        configs.insert("email_send".to_string(), Duration::from_secs(0));
        configs.insert("email_fetch".to_string(), Duration::from_secs(120));

        configs.insert("calendar_create_event".to_string(), Duration::from_secs(0));
        configs.insert("calendar_list_events".to_string(), Duration::from_secs(120));

        configs.insert("cloud_upload".to_string(), Duration::from_secs(0));
        configs.insert("cloud_download".to_string(), Duration::from_secs(300));

        configs.insert(
            "productivity_create_task".to_string(),
            Duration::from_secs(0),
        );

        Self {
            configs,
            default_ttl: Duration::from_secs(60),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultCacheEntry {
    pub tool_name: String,
    pub params_hash: String,
    pub result: serde_json::Value,
    pub cached_at: DateTime<Utc>,
    pub cached_at_instant: Option<u64>,
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
            let elapsed_seconds = (Utc::now() - self.cached_at).num_seconds();
            elapsed_seconds > self.ttl_seconds as i64
        }
    }

    fn estimate_size(result: &serde_json::Value) -> usize {
        match serde_json::to_string(result) {
            Ok(json_str) => json_str.len(),
            Err(_) => 0,
        }
    }
}

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

pub struct ToolResultCache {
    entries: Arc<DashMap<String, ToolResultCacheEntry>>,

    ttl_config: ToolCacheTTLConfig,

    max_size_bytes: usize,

    current_size_bytes: Arc<RwLock<usize>>,

    stats: Arc<RwLock<ToolCacheStats>>,

    start_instant: Instant,
}

impl ToolResultCache {
    pub fn new() -> Self {
        Self::with_capacity(100 * 1024 * 1024)
    }

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

    pub fn generate_cache_key(
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(tool_name.as_bytes());
        hasher.update(b"::");

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

    pub fn get(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Option<serde_json::Value> {
        if !self.ttl_config.is_cacheable(tool_name) {
            return None;
        }

        let cache_key = Self::generate_cache_key(tool_name, parameters);

        if let Some(entry) = self.entries.get(&cache_key) {
            if entry.is_expired(self.start_instant) {
                drop(entry);
                self.invalidate_key(&cache_key);

                let mut stats = self.stats.write();
                stats.misses += 1;
                stats.calculate_hit_rate();

                return None;
            }

            let result = entry.result.clone();
            drop(entry);

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

    pub fn set(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
        result: serde_json::Value,
    ) -> Result<()> {
        if !self.ttl_config.is_cacheable(tool_name) {
            return Ok(());
        }

        let cache_key = Self::generate_cache_key(tool_name, parameters);
        let ttl = self.ttl_config.get_ttl(tool_name);
        let size_bytes = ToolResultCacheEntry::estimate_size(&result);

        if size_bytes > self.max_size_bytes {
            tracing::warn!(
                "[ToolCache] Single entry for tool '{}' exceeds max cache size ({} bytes > {} bytes), skipping cache",
                tool_name,
                size_bytes,
                self.max_size_bytes
            );
            return Ok(());
        }

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

        self.entries.insert(cache_key.clone(), entry);

        {
            let mut current_size = self.current_size_bytes.write();
            *current_size += size_bytes;
        }

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

    pub fn invalidate(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Result<()> {
        let cache_key = Self::generate_cache_key(tool_name, parameters);
        self.invalidate_key(&cache_key);
        Ok(())
    }

    pub fn invalidate_tool(&self, tool_name: &str) -> Result<usize> {
        let mut removed_count = 0;

        let keys_to_remove: Vec<String> = self
            .entries
            .iter()
            .filter(|entry| entry.value().tool_name == tool_name)
            .map(|entry| entry.key().clone())
            .collect();

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

    fn invalidate_key(&self, cache_key: &str) {
        if let Some((_, entry)) = self.entries.remove(cache_key) {
            let new_size = {
                let mut current_size = self.current_size_bytes.write();
                *current_size = current_size.saturating_sub(entry.size_bytes);
                *current_size
            };

            {
                let mut stats = self.stats.write();
                stats.entry_count = self.entries.len();
                stats.total_size_bytes = new_size;
            }

            tracing::debug!(
                "[ToolCache] Invalidated cache entry (key: {})",
                &cache_key[..16]
            );
        }
    }

    fn ensure_capacity(&self, required_bytes: usize) -> Result<()> {
        let current_size = *self.current_size_bytes.read();

        if current_size + required_bytes <= self.max_size_bytes {
            return Ok(());
        }

        let bytes_to_free = (current_size + required_bytes) - self.max_size_bytes;
        self.evict_lru(bytes_to_free)?;

        Ok(())
    }

    fn evict_lru(&self, bytes_to_free: usize) -> Result<()> {
        let mut freed_bytes = 0;
        let mut eviction_count = 0;

        let mut entries: Vec<_> = self
            .entries
            .iter()
            .map(|entry| (entry.key().clone(), entry.cached_at, entry.size_bytes))
            .collect();

        entries.sort_by_key(|(_, cached_at, _)| *cached_at);

        for (key, _, size) in entries {
            if freed_bytes >= bytes_to_free {
                break;
            }

            self.invalidate_key(&key);
            freed_bytes += size;
            eviction_count += 1;
        }

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

    pub fn prune_expired(&self) -> Result<usize> {
        let mut removed_count = 0;

        let expired_keys: Vec<String> = self
            .entries
            .iter()
            .filter(|entry| entry.is_expired(self.start_instant))
            .map(|entry| entry.key().clone())
            .collect();

        for key in expired_keys {
            self.invalidate_key(&key);
            removed_count += 1;
        }

        if removed_count > 0 {
            tracing::info!("[ToolCache] Pruned {} expired cache entries", removed_count);
        }

        Ok(removed_count)
    }

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

    pub fn get_stats(&self) -> ToolCacheStats {
        self.stats.read().clone()
    }

    pub fn reset_stats(&self) {
        let mut stats = self.stats.write();
        stats.hits = 0;
        stats.misses = 0;
        stats.evictions = 0;
        stats.hit_rate_percent = 0.0;
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn size_bytes(&self) -> usize {
        *self.current_size_bytes.read()
    }

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

        assert_eq!(key1, key2);

        let key3 = ToolResultCache::generate_cache_key("file_write", &params);
        assert_ne!(key1, key3);
    }

    #[test]
    fn test_cache_ttl_config() {
        let config = ToolCacheTTLConfig::default();

        assert_eq!(config.get_ttl("file_read").as_secs(), 300);
        assert_eq!(config.get_ttl("ui_screenshot").as_secs(), 30);
        assert_eq!(config.get_ttl("code_execute").as_secs(), 0);

        assert!(config.is_cacheable("file_read"));
        assert!(!config.is_cacheable("code_execute"));
    }

    #[test]
    fn test_basic_cache_operations() {
        let cache = ToolResultCache::new();
        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/test/file.txt"));

        assert!(cache.get("file_read", &params).is_none());

        let result = serde_json::json!({"content": "test data"});
        cache.set("file_read", &params, result.clone()).unwrap();

        let cached = cache.get("file_read", &params);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap(), result);

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

        let result = serde_json::json!({"output": "hello"});
        cache.set("code_execute", &params, result).unwrap();

        assert!(cache.get("code_execute", &params).is_none());
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cache_invalidation() {
        let cache = ToolResultCache::new();
        let mut params = HashMap::new();
        params.insert("path".to_string(), serde_json::json!("/test/file.txt"));

        let result = serde_json::json!({"content": "test data"});
        cache.set("file_read", &params, result).unwrap();

        assert_eq!(cache.len(), 1);

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

        cache.clear().unwrap();
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.size_bytes(), 0);
    }
}
