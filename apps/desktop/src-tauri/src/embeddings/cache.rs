/**
 * Embedding Cache
 * LRU cache for frequently accessed embeddings
 */
use anyhow::Result;
use parking_lot::RwLock;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use super::Vector;

/// Cache statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub size: usize,
    pub max_size: usize,
}

impl CacheStats {
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            return 0.0;
        }
        self.hits as f64 / total as f64
    }
}

/// Cached embedding
#[derive(Debug, Clone)]
struct CachedEmbedding {
    embedding: Vector,
    access_count: u64,
    last_accessed: i64,
}

/// Embedding cache with LRU eviction
pub struct EmbeddingCache {
    db: Connection,
    memory_cache: Arc<RwLock<HashMap<String, CachedEmbedding>>>,
    max_memory_size: usize,
    stats: Arc<RwLock<CacheStats>>,
}

impl EmbeddingCache {
    /// Create a new cache
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let db = Connection::open(db_path)?;

        let cache = Self {
            db,
            memory_cache: Arc::new(RwLock::new(HashMap::new())),
            max_memory_size: 1000, // Keep 1000 embeddings in memory
            stats: Arc::new(RwLock::new(CacheStats {
                hits: 0,
                misses: 0,
                size: 0,
                max_size: 1000,
            })),
        };

        cache.init_schema()?;
        Ok(cache)
    }

    /// Initialize database schema for cache metadata
    fn init_schema(&self) -> Result<()> {
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS cache_metadata (
                key TEXT PRIMARY KEY,
                access_count INTEGER NOT NULL DEFAULT 0,
                last_accessed INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    /// Get embedding from cache
    pub fn get(&self, key: &str) -> Option<Vector> {
        // Check memory cache first
        {
            let mut cache = self.memory_cache.write();
            if let Some(cached) = cache.get_mut(key) {
                cached.access_count += 1;
                cached.last_accessed = chrono::Utc::now().timestamp();

                // Update stats
                let mut stats = self.stats.write();
                stats.hits += 1;

                return Some(cached.embedding.clone());
            }
        }

        // Update stats for miss
        {
            let mut stats = self.stats.write();
            stats.misses += 1;
        }

        None
    }

    /// Put embedding in cache
    pub fn put(&self, key: String, embedding: Vector) -> Result<()> {
        let now = chrono::Utc::now().timestamp();

        // Add to memory cache
        {
            let mut cache = self.memory_cache.write();

            // Evict LRU entries if cache is full
            if cache.len() >= self.max_memory_size {
                self.evict_lru(&mut cache);
            }

            cache.insert(
                key.clone(),
                CachedEmbedding {
                    embedding,
                    access_count: 1,
                    last_accessed: now,
                },
            );

            // Update stats
            let mut stats = self.stats.write();
            stats.size = cache.len();
        }

        // Update database metadata
        self.db.execute(
            "INSERT OR REPLACE INTO cache_metadata (key, access_count, last_accessed, created_at)
             VALUES (?1, 1, ?2, ?3)",
            params![key, now, now],
        )?;

        Ok(())
    }

    /// Evict least recently used entry
    fn evict_lru(&self, cache: &mut HashMap<String, CachedEmbedding>) {
        if let Some(lru_key) = cache
            .iter()
            .min_by_key(|(_, v)| v.last_accessed)
            .map(|(k, _)| k.clone())
        {
            cache.remove(&lru_key);
        }
    }

    /// Clear cache
    pub fn clear(&self) -> Result<()> {
        {
            let mut cache = self.memory_cache.write();
            cache.clear();

            let mut stats = self.stats.write();
            stats.size = 0;
        }

        self.db.execute("DELETE FROM cache_metadata", [])?;

        Ok(())
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> Result<CacheStats> {
        let stats = self.stats.read();
        Ok(stats.clone())
    }

    /// Reset statistics
    pub fn reset_stats(&self) {
        let mut stats = self.stats.write();
        stats.hits = 0;
        stats.misses = 0;
    }

    /// Get top N most accessed entries
    pub fn get_top_accessed(&self, limit: usize) -> Result<Vec<(String, u64)>> {
        let mut stmt = self.db.prepare(
            "SELECT key, access_count
             FROM cache_metadata
             ORDER BY access_count DESC
             LIMIT ?1",
        )?;

        let results = stmt
            .query_map(params![limit], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Warm up cache with frequently accessed embeddings
    pub fn warmup(&self, embeddings: Vec<(String, Vector)>) -> Result<()> {
        for (key, embedding) in embeddings {
            self.put(key, embedding)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_cache_operations() {
        let temp_file = NamedTempFile::new().unwrap();
        let cache = EmbeddingCache::new(temp_file.path().to_path_buf()).unwrap();

        // Test put and get
        let embedding = vec![1.0, 2.0, 3.0];
        cache
            .put("test_key".to_string(), embedding.clone())
            .unwrap();

        let retrieved = cache.get("test_key");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap(), embedding);

        // Test cache miss
        let missing = cache.get("nonexistent");
        assert!(missing.is_none());

        // Test stats
        let stats = cache.get_stats().unwrap();
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.size, 1);
    }

    #[test]
    fn test_cache_eviction() {
        let temp_file = NamedTempFile::new().unwrap();
        let mut cache = EmbeddingCache::new(temp_file.path().to_path_buf()).unwrap();
        cache.max_memory_size = 3; // Small cache for testing

        // Add 4 embeddings (should evict LRU)
        for i in 0..4 {
            let key = format!("key_{}", i);
            let embedding = vec![i as f32; 10];
            cache.put(key, embedding).unwrap();
        }

        let stats = cache.get_stats().unwrap();
        assert_eq!(stats.size, 3); // Should only have 3 entries
    }

    #[test]
    fn test_cache_clear() {
        let temp_file = NamedTempFile::new().unwrap();
        let cache = EmbeddingCache::new(temp_file.path().to_path_buf()).unwrap();

        cache.put("key1".to_string(), vec![1.0]).unwrap();
        cache.put("key2".to_string(), vec![2.0]).unwrap();

        cache.clear().unwrap();

        let stats = cache.get_stats().unwrap();
        assert_eq!(stats.size, 0);
    }
}
