/**
 * Codebase Analysis Cache
 *
 * High-performance caching layer for codebase analysis results including:
 * - File trees and directory structures
 * - Symbol tables (functions, classes, imports)
 * - Dependency graphs
 * - File content hashes for invalidation
 *
 * **Performance Goals:**
 * - 70%+ cache hit rate
 * - <30 second task completion with warm cache
 * - Automatic invalidation on file changes
 *
 * **Integration:**
 * - Uses SQLite for persistent storage
 * - Integrates with file watcher for real-time invalidation
 * - Consumed by AGI planner for faster codebase understanding
 */
use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Cache entry types with different TTL policies
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheType {
    /// File tree structure (TTL: 24 hours)
    FileTree,
    /// Symbol table - functions, classes, etc. (TTL: 1 hour)
    Symbols,
    /// Dependency graph (TTL: 1 hour)
    Dependencies,
    /// File metadata (TTL: 24 hours)
    FileMetadata,
}

impl CacheType {
    /// Get TTL in seconds for this cache type
    pub fn ttl_seconds(&self) -> i64 {
        match self {
            CacheType::FileTree => 24 * 3600,     // 24 hours
            CacheType::Symbols => 3600,           // 1 hour
            CacheType::Dependencies => 3600,      // 1 hour
            CacheType::FileMetadata => 24 * 3600, // 24 hours
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            CacheType::FileTree => "file_tree",
            CacheType::Symbols => "symbols",
            CacheType::Dependencies => "deps",
            CacheType::FileMetadata => "file_metadata",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "file_tree" => Some(CacheType::FileTree),
            "symbols" => Some(CacheType::Symbols),
            "deps" => Some(CacheType::Dependencies),
            "file_metadata" => Some(CacheType::FileMetadata),
            _ => None,
        }
    }
}

/// File tree structure representing directory hierarchy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTree {
    pub root: PathBuf,
    pub entries: Vec<FileTreeEntry>,
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeEntry {
    pub path: PathBuf,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub children: Vec<PathBuf>,
}

/// Symbol table for a file or project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolTable {
    pub file_path: Option<PathBuf>, // None if project-wide
    pub symbols: Vec<Symbol>,
    pub imports: Vec<Import>,
    pub exports: Vec<Export>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub line: u32,
    pub column: u32,
    pub signature: Option<String>,
    pub documentation: Option<String>,
    pub scope: String, // e.g., "global", "MyClass"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Struct,
    Enum,
    Variable,
    Constant,
    Method,
    Property,
    Module,
    Type,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Import {
    pub module: String,
    pub items: Vec<String>,
    pub alias: Option<String>,
    pub line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Export {
    pub name: String,
    pub kind: SymbolKind,
    pub line: u32,
}

/// Dependency graph representing file/module dependencies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyGraph {
    pub root: PathBuf,
    pub nodes: Vec<DependencyNode>,
    pub edges: Vec<DependencyEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyNode {
    pub path: PathBuf,
    pub node_type: NodeType,
    pub external: bool, // true for external dependencies
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    File,
    Module,
    Package,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEdge {
    pub from: PathBuf,
    pub to: PathBuf,
    pub edge_type: EdgeType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeType {
    Import,
    Require,
    Include,
    Extend,
    Implement,
}

/// File metadata for tracking changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: PathBuf,
    pub hash: String,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub language: Option<String>,
}

/// Cache statistics for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub entries_by_type: HashMap<String, usize>,
    pub total_size_bytes: u64,
    pub hit_rate: f64,
    pub miss_rate: f64,
    pub oldest_entry: Option<u64>,
    pub newest_entry: Option<u64>,
}

/// Codebase analysis cache
pub struct CodebaseCache {
    db: Arc<Mutex<Connection>>,
    hit_count: Arc<Mutex<u64>>,
    miss_count: Arc<Mutex<u64>>,
}

impl CodebaseCache {
    /// Create a new cache instance using the provided database connection
    pub fn new(db: Arc<Mutex<Connection>>) -> Result<Self> {
        Ok(Self {
            db,
            hit_count: Arc::new(Mutex::new(0)),
            miss_count: Arc::new(Mutex::new(0)),
        })
    }

    /// Get a cache entry
    pub fn get<T>(
        &self,
        cache_type: CacheType,
        project_path: &Path,
        file_hash: Option<&str>,
    ) -> Result<Option<T>>
    where
        T: for<'de> Deserialize<'de>,
    {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let cache_key = Self::generate_cache_key(project_path, cache_type, file_hash);
        let now = Self::current_timestamp();

        let result: Option<String> = db
            .query_row(
                "SELECT data FROM codebase_cache
                 WHERE id = ?1 AND expires_at > ?2",
                params![cache_key, now],
                |row| row.get(0),
            )
            .optional()
            .context("Failed to query cache")?;

        if let Some(json_data) = result {
            // Cache hit
            *self
                .hit_count
                .lock()
                .map_err(|e| anyhow::anyhow!("Lock error: {}", e))? += 1;

            let data: T =
                serde_json::from_str(&json_data).context("Failed to deserialize cache data")?;

            Ok(Some(data))
        } else {
            // Cache miss
            *self
                .miss_count
                .lock()
                .map_err(|e| anyhow::anyhow!("Lock error: {}", e))? += 1;
            Ok(None)
        }
    }

    /// Set a cache entry
    pub fn set<T>(
        &self,
        cache_type: CacheType,
        project_path: &Path,
        file_hash: Option<&str>,
        data: &T,
    ) -> Result<()>
    where
        T: Serialize,
    {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let cache_key = Self::generate_cache_key(project_path, cache_type, file_hash);
        let now = Self::current_timestamp();
        let expires_at = now + cache_type.ttl_seconds();
        let json_data = serde_json::to_string(data).context("Failed to serialize cache data")?;

        db.execute(
            "INSERT OR REPLACE INTO codebase_cache (id, project_path, cache_type, file_hash, data, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                cache_key,
                project_path.to_string_lossy().to_string(),
                cache_type.as_str(),
                file_hash.unwrap_or(""),
                json_data,
                now,
                expires_at
            ],
        )
        .context("Failed to insert cache entry")?;

        Ok(())
    }

    /// Invalidate cache entries for a specific file
    pub fn invalidate_file(&self, file_path: &Path) -> Result<usize> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let file_path_str = file_path.to_string_lossy().to_string();

        // Delete entries that reference this file (either as project_path or in file_hash)
        let deleted = db
            .execute(
                "DELETE FROM codebase_cache
             WHERE project_path = ?1 OR id LIKE ?2",
                params![file_path_str, format!("%:{}:%", file_path_str)],
            )
            .context("Failed to invalidate file cache")?;

        Ok(deleted)
    }

    /// Invalidate all cache entries for a project
    pub fn invalidate_project(&self, project_path: &Path) -> Result<usize> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let project_path_str = project_path.to_string_lossy().to_string();

        let deleted = db
            .execute(
                "DELETE FROM codebase_cache WHERE project_path = ?1",
                params![project_path_str],
            )
            .context("Failed to invalidate project cache")?;

        Ok(deleted)
    }

    /// Invalidate cache entries by type
    pub fn invalidate_type(&self, cache_type: CacheType) -> Result<usize> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let deleted = db
            .execute(
                "DELETE FROM codebase_cache WHERE cache_type = ?1",
                params![cache_type.as_str()],
            )
            .context("Failed to invalidate cache by type")?;

        Ok(deleted)
    }

    /// Clear all expired entries
    pub fn clear_expired(&self) -> Result<usize> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let now = Self::current_timestamp();

        let deleted = db
            .execute(
                "DELETE FROM codebase_cache WHERE expires_at <= ?1",
                params![now],
            )
            .context("Failed to clear expired entries")?;

        Ok(deleted)
    }

    /// Clear all cache entries
    pub fn clear_all(&self) -> Result<usize> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        let deleted = db
            .execute("DELETE FROM codebase_cache", [])
            .context("Failed to clear all cache entries")?;

        // Reset hit/miss counters
        *self
            .hit_count
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))? = 0;
        *self
            .miss_count
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))? = 0;

        Ok(deleted)
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> Result<CacheStats> {
        let db = self
            .db
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;

        // Total entries
        let total_entries: usize =
            db.query_row("SELECT COUNT(*) FROM codebase_cache", [], |row| row.get(0))?;

        // Entries by type
        let mut entries_by_type = HashMap::new();
        let mut stmt =
            db.prepare("SELECT cache_type, COUNT(*) FROM codebase_cache GROUP BY cache_type")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, usize>(1)?))
        })?;

        for row in rows {
            let (cache_type, count) = row?;
            entries_by_type.insert(cache_type, count);
        }

        // Total size (approximate from JSON string lengths)
        let total_size_bytes: u64 = db.query_row(
            "SELECT COALESCE(SUM(LENGTH(data)), 0) FROM codebase_cache",
            [],
            |row| row.get(0),
        )?;

        // Oldest and newest entries
        let oldest_entry: Option<u64> = db
            .query_row("SELECT MIN(created_at) FROM codebase_cache", [], |row| {
                row.get(0)
            })
            .optional()?;

        let newest_entry: Option<u64> = db
            .query_row("SELECT MAX(created_at) FROM codebase_cache", [], |row| {
                row.get(0)
            })
            .optional()?;

        // Hit/miss rate
        let hits = *self
            .hit_count
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;
        let misses = *self
            .miss_count
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock error: {}", e))?;
        let total = hits + misses;

        let hit_rate = if total > 0 {
            (hits as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        let miss_rate = if total > 0 {
            (misses as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        Ok(CacheStats {
            total_entries,
            entries_by_type,
            total_size_bytes,
            hit_rate,
            miss_rate,
            oldest_entry,
            newest_entry,
        })
    }

    /// Generate a cache key from project path, type, and optional file hash
    fn generate_cache_key(
        project_path: &Path,
        cache_type: CacheType,
        file_hash: Option<&str>,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(project_path.to_string_lossy().as_bytes());
        hasher.update(b":");
        hasher.update(cache_type.as_str().as_bytes());
        if let Some(hash) = file_hash {
            hasher.update(b":");
            hasher.update(hash.as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }

    /// Get current Unix timestamp
    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    /// Calculate file hash for change detection
    pub fn calculate_file_hash(content: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn setup_test_cache() -> Result<CodebaseCache> {
        let conn = Connection::open_in_memory()?;

        // Create schema
        conn.execute(
            "CREATE TABLE codebase_cache (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                cache_type TEXT NOT NULL,
                file_hash TEXT,
                data TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX idx_project_path ON codebase_cache(project_path)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX idx_cache_type ON codebase_cache(cache_type)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX idx_expires_at ON codebase_cache(expires_at)",
            [],
        )?;

        CodebaseCache::new(Arc::new(Mutex::new(conn)))
    }

    #[test]
    fn test_cache_set_and_get() -> Result<()> {
        let cache = setup_test_cache()?;
        let project_path = PathBuf::from("/test/project");

        // Create test data
        let file_tree = FileTree {
            root: project_path.clone(),
            entries: vec![],
            total_files: 10,
            total_dirs: 5,
            total_size_bytes: 1024,
        };

        // Set cache entry
        cache.set(CacheType::FileTree, &project_path, None, &file_tree)?;

        // Get cache entry
        let result: Option<FileTree> = cache.get(CacheType::FileTree, &project_path, None)?;
        assert!(result.is_some());

        let retrieved = result.unwrap();
        assert_eq!(retrieved.total_files, 10);
        assert_eq!(retrieved.total_dirs, 5);

        Ok(())
    }

    #[test]
    fn test_cache_expiration() -> Result<()> {
        let cache = setup_test_cache()?;
        let project_path = PathBuf::from("/test/project");

        let symbol_table = SymbolTable {
            file_path: Some(project_path.clone()),
            symbols: vec![],
            imports: vec![],
            exports: vec![],
        };

        cache.set(CacheType::Symbols, &project_path, None, &symbol_table)?;

        // Manually expire the entry
        let db = cache.db.lock().unwrap();
        db.execute("UPDATE codebase_cache SET expires_at = 0", [])?;
        drop(db);

        // Should not retrieve expired entry
        let result: Option<SymbolTable> = cache.get(CacheType::Symbols, &project_path, None)?;
        assert!(result.is_none());

        Ok(())
    }

    #[test]
    fn test_invalidate_project() -> Result<()> {
        let cache = setup_test_cache()?;
        let project_path = PathBuf::from("/test/project");

        // Add multiple entries
        let file_tree = FileTree {
            root: project_path.clone(),
            entries: vec![],
            total_files: 10,
            total_dirs: 5,
            total_size_bytes: 1024,
        };

        cache.set(CacheType::FileTree, &project_path, None, &file_tree)?;
        cache.set(
            CacheType::Symbols,
            &project_path,
            None,
            &SymbolTable {
                file_path: None,
                symbols: vec![],
                imports: vec![],
                exports: vec![],
            },
        )?;

        // Invalidate project
        let deleted = cache.invalidate_project(&project_path)?;
        assert_eq!(deleted, 2);

        // Entries should be gone
        let result: Option<FileTree> = cache.get(CacheType::FileTree, &project_path, None)?;
        assert!(result.is_none());

        Ok(())
    }

    #[test]
    fn test_cache_stats() -> Result<()> {
        let cache = setup_test_cache()?;
        let project_path = PathBuf::from("/test/project");

        // Add entries
        cache.set(
            CacheType::FileTree,
            &project_path,
            None,
            &FileTree {
                root: project_path.clone(),
                entries: vec![],
                total_files: 10,
                total_dirs: 5,
                total_size_bytes: 1024,
            },
        )?;

        cache.set(
            CacheType::Symbols,
            &project_path,
            None,
            &SymbolTable {
                file_path: None,
                symbols: vec![],
                imports: vec![],
                exports: vec![],
            },
        )?;

        // Get stats
        let stats = cache.get_stats()?;
        assert_eq!(stats.total_entries, 2);
        assert!(stats.entries_by_type.contains_key("file_tree"));
        assert!(stats.entries_by_type.contains_key("symbols"));

        Ok(())
    }

    #[test]
    fn test_file_hash_calculation() {
        let content = b"Hello, world!";
        let hash1 = CodebaseCache::calculate_file_hash(content);
        let hash2 = CodebaseCache::calculate_file_hash(content);

        // Same content should produce same hash
        assert_eq!(hash1, hash2);

        let different_content = b"Hello, universe!";
        let hash3 = CodebaseCache::calculate_file_hash(different_content);

        // Different content should produce different hash
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_hit_miss_rate() -> Result<()> {
        let cache = setup_test_cache()?;
        let project_path = PathBuf::from("/test/project");

        // Add entry
        cache.set(
            CacheType::FileTree,
            &project_path,
            None,
            &FileTree {
                root: project_path.clone(),
                entries: vec![],
                total_files: 10,
                total_dirs: 5,
                total_size_bytes: 1024,
            },
        )?;

        // Hit
        let _: Option<FileTree> = cache.get(CacheType::FileTree, &project_path, None)?;

        // Miss
        let _: Option<FileTree> =
            cache.get(CacheType::FileTree, &PathBuf::from("/nonexistent"), None)?;

        let stats = cache.get_stats()?;
        assert!(stats.hit_rate > 0.0);
        assert!(stats.miss_rate > 0.0);

        Ok(())
    }
}
