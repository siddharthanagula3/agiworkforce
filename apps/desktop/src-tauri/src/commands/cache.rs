use super::{llm::LLMState, AppDatabase};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Statistics for a specific cache type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheTypeStats {
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
    pub size_mb: f64,
    pub entries: usize,
    pub savings_usd: Option<f64>, // For LLM cache only
}

impl Default for CacheTypeStats {
    fn default() -> Self {
        Self {
            hits: 0,
            misses: 0,
            hit_rate: 0.0,
            size_mb: 0.0,
            entries: 0,
            savings_usd: None,
        }
    }
}

/// Overall cache statistics across all cache types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub llm_cache: CacheTypeStats,
    pub tool_cache: CacheTypeStats,      // Placeholder for future implementation
    pub codebase_cache: CacheTypeStats,  // Placeholder for future implementation
    pub total_size_mb: f64,
    pub total_savings_usd: f64,
}

/// Cache configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheSettings {
    pub ttl_seconds: Option<u64>,
    pub max_entries: Option<usize>,
    pub enabled: Option<bool>,
}

/// Cache analytics data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheAnalytics {
    pub most_cached_queries: Vec<CachedQueryInfo>,
    pub provider_breakdown: Vec<ProviderCacheBreakdown>,
    pub total_cost_saved: f64,
    pub total_tokens_saved: u64,
}

/// Information about a frequently cached query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedQueryInfo {
    pub prompt_hash: String,
    pub provider: String,
    pub model: String,
    pub hit_count: u64,
    pub cost_saved: f64,
    pub last_used: String,
}

/// Cache breakdown by provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCacheBreakdown {
    pub provider: String,
    pub entries: usize,
    pub total_hits: u64,
    pub cost_saved: f64,
}

/// Get comprehensive cache statistics
#[tauri::command]
pub async fn cache_get_stats(
    db: State<'_, AppDatabase>,
    codebase_cache: State<'_, CodebaseCacheState>,
) -> Result<CacheStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get LLM cache statistics
    let llm_stats = get_llm_cache_stats(&conn)?;

    // Get codebase cache statistics
    let codebase_stats = get_codebase_cache_stats(&codebase_cache)?;

    // Placeholder stats for future tool cache
    let tool_stats = CacheTypeStats::default();

    let total_size_mb = llm_stats.size_mb + tool_stats.size_mb + codebase_stats.size_mb;
    let total_savings_usd = llm_stats.savings_usd.unwrap_or(0.0)
        + tool_stats.savings_usd.unwrap_or(0.0)
        + codebase_stats.savings_usd.unwrap_or(0.0);

    Ok(CacheStats {
        llm_cache: llm_stats,
        tool_cache: tool_stats,
        codebase_cache: codebase_stats,
        total_size_mb,
        total_savings_usd,
    })
}

/// Clear all cache entries
#[tauri::command]
pub async fn cache_clear_all(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Clear LLM cache entries from database
    conn.execute("DELETE FROM cache_entries", [])
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    // Prune expired entries from cache manager
    llm_state
        .cache_manager
        .prune_expired(&conn)
        .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

    tracing::info!("All cache entries cleared");
    Ok(())
}

/// Clear cache entries by type
#[tauri::command]
pub async fn cache_clear_by_type(
    cache_type: String,
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    codebase_cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    match cache_type.as_str() {
        "llm" => {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;

            // Clear all LLM cache entries
            conn.execute("DELETE FROM cache_entries", [])
                .map_err(|e| format!("Failed to clear LLM cache: {}", e))?;

            // Prune expired entries
            llm_state
                .cache_manager
                .prune_expired(&conn)
                .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

            tracing::info!("LLM cache cleared");
            Ok(())
        }
        "tool" => {
            // Placeholder for future tool cache implementation
            tracing::warn!("Tool cache not yet implemented");
            Ok(())
        }
        "codebase" => {
            // Clear codebase cache
            let deleted = codebase_cache
                .0
                .clear_all()
                .map_err(|e| format!("Failed to clear codebase cache: {}", e))?;

            tracing::info!("Codebase cache cleared ({} entries deleted)", deleted);
            Ok(())
        }
        _ => Err(format!("Unknown cache type: {}", cache_type)),
    }
}

/// Clear cache entries by provider
#[tauri::command]
pub async fn cache_clear_by_provider(
    provider: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let deleted = conn
        .execute("DELETE FROM cache_entries WHERE provider = ?1", [&provider])
        .map_err(|e| format!("Failed to clear cache for provider {}: {}", provider, e))?;

    tracing::info!("Cleared {} cache entries for provider: {}", deleted, provider);
    Ok(())
}

/// Get total cache size in MB
#[tauri::command]
pub async fn cache_get_size(db: State<'_, AppDatabase>) -> Result<f64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Calculate approximate size based on text content
    let total_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(response) + LENGTH(prompt_hash)), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate cache size: {}", e))?;

    let size_mb = total_bytes as f64 / (1024.0 * 1024.0);
    Ok(size_mb)
}

/// Configure cache settings
#[tauri::command]
pub async fn cache_configure(
    settings: CacheSettings,
    _llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    // Note: Current CacheManager doesn't support runtime reconfiguration
    // This is a placeholder for future implementation

    tracing::info!(
        "Cache configuration request received: ttl={:?}s, max_entries={:?}, enabled={:?}",
        settings.ttl_seconds,
        settings.max_entries,
        settings.enabled
    );

    // TODO: Implement runtime cache configuration
    // This would require making LLMState's cache_manager mutable or
    // refactoring CacheManager to support runtime configuration updates

    Ok(())
}

/// Warm up cache with common queries
#[tauri::command]
pub async fn cache_warmup(queries: Vec<String>) -> Result<(), String> {
    // Placeholder for future cache warmup implementation
    tracing::info!("Cache warmup requested for {} queries", queries.len());

    // TODO: Implement cache warmup by pre-computing responses for common queries
    // This would involve calling the LLM router for each query and storing the results

    Ok(())
}

/// Export cache entries for backup
#[tauri::command]
pub async fn cache_export(db: State<'_, AppDatabase>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT cache_key, provider, model, prompt_hash, response, tokens, cost,
                    created_at, last_used_at, expires_at
             FROM cache_entries
             ORDER BY last_used_at DESC",
        )
        .map_err(|e| format!("Failed to prepare export query: {}", e))?;

    let entries: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "cache_key": row.get::<_, String>(0)?,
                "provider": row.get::<_, String>(1)?,
                "model": row.get::<_, String>(2)?,
                "prompt_hash": row.get::<_, String>(3)?,
                "response": row.get::<_, String>(4)?,
                "tokens": row.get::<_, Option<i32>>(5)?,
                "cost": row.get::<_, Option<f64>>(6)?,
                "created_at": row.get::<_, String>(7)?,
                "last_used_at": row.get::<_, String>(8)?,
                "expires_at": row.get::<_, String>(9)?,
            }))
        })
        .map_err(|e| format!("Failed to query cache entries: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect cache entries: {}", e))?;

    let export_data = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "entries": entries,
    });

    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))
}

/// Get cache analytics (most cached queries, biggest savings)
#[tauri::command]
pub async fn cache_get_analytics(db: State<'_, AppDatabase>) -> Result<CacheAnalytics, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get most frequently cached queries (using actual hit_count and cost_saved columns)
    let mut stmt = conn
        .prepare(
            "SELECT prompt_hash, provider, model, hit_count,
                    cost_saved, last_used_at
             FROM cache_entries
             WHERE hit_count > 0
             ORDER BY hit_count DESC
             LIMIT 10",
        )
        .map_err(|e| format!("Failed to prepare analytics query: {}", e))?;

    let most_cached: Vec<CachedQueryInfo> = stmt
        .query_map([], |row| {
            Ok(CachedQueryInfo {
                prompt_hash: row.get(0)?,
                provider: row.get(1)?,
                model: row.get(2)?,
                hit_count: row.get::<_, i32>(3)? as u64,
                cost_saved: row.get(4)?,
                last_used: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query most cached: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect most cached: {}", e))?;

    // Get provider breakdown (using actual hit_count and cost_saved columns)
    let mut stmt = conn
        .prepare(
            "SELECT provider, COUNT(*) as entries,
                    SUM(hit_count) as total_hits, SUM(cost_saved) as cost_saved
             FROM cache_entries
             GROUP BY provider
             ORDER BY cost_saved DESC",
        )
        .map_err(|e| format!("Failed to prepare provider breakdown query: {}", e))?;

    let provider_breakdown: Vec<ProviderCacheBreakdown> = stmt
        .query_map([], |row| {
            Ok(ProviderCacheBreakdown {
                provider: row.get(0)?,
                entries: row.get::<_, i64>(1)? as usize,
                total_hits: row.get::<_, i64>(2)? as u64,
                cost_saved: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query provider breakdown: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect provider breakdown: {}", e))?;

    // Calculate total savings using the new cost_saved column
    let total_cost_saved: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(cost_saved), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate total cost saved: {}", e))?;

    // Calculate total tokens saved using the new tokens_saved column
    let total_tokens_saved: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(tokens_saved), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate total tokens saved: {}", e))?;

    Ok(CacheAnalytics {
        most_cached_queries: most_cached,
        provider_breakdown,
        total_cost_saved,
        total_tokens_saved: total_tokens_saved as u64,
    })
}

/// Prune expired cache entries manually
#[tauri::command]
pub async fn cache_prune_expired(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let pruned = llm_state
        .cache_manager
        .prune_expired(&conn)
        .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

    tracing::info!("Pruned {} expired cache entries", pruned);
    Ok(pruned)
}

// Helper functions

/// Get LLM cache statistics from database
fn get_llm_cache_stats(conn: &Connection) -> Result<CacheTypeStats, String> {
    // Get total number of entries
    let entries: usize = conn
        .query_row("SELECT COUNT(*) FROM cache_entries", [], |row| {
            Ok(row.get::<_, i64>(0)? as usize)
        })
        .map_err(|e| format!("Failed to count cache entries: {}", e))?;

    // Calculate approximate size
    let total_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(response) + LENGTH(prompt_hash)), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate cache size: {}", e))?;

    let size_mb = total_bytes as f64 / (1024.0 * 1024.0);

    // Calculate cost savings from the new cost_saved column (sum of all actual savings)
    let savings_usd: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(cost_saved), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate cost savings: {}", e))?;

    // Get total cache hits from the new hit_count column
    let hits: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(hit_count), 0) FROM cache_entries",
            [],
            |row| Ok(row.get::<_, i64>(0)? as u64),
        )
        .map_err(|e| format!("Failed to calculate total hits: {}", e))?;

    // Estimate misses: each entry creation is a miss, then subsequent uses are hits
    // Total requests = entries (initial misses) + hits (subsequent cache uses)
    let misses = entries as u64;
    let total_requests = misses + hits;

    let hit_rate = if total_requests > 0 {
        hits as f64 / total_requests as f64
    } else {
        0.0
    };

    Ok(CacheTypeStats {
        hits,
        misses,
        hit_rate,
        size_mb,
        entries,
        savings_usd: Some(savings_usd),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_cache_stats_calculation() {
        let conn = Connection::open_in_memory().unwrap();

        // Create cache_entries table
        conn.execute(
            "CREATE TABLE cache_entries (
                id INTEGER PRIMARY KEY,
                cache_key TEXT UNIQUE,
                provider TEXT,
                model TEXT,
                prompt_hash TEXT,
                response TEXT,
                tokens INTEGER,
                cost REAL,
                created_at TEXT,
                last_used_at TEXT,
                expires_at TEXT
            )",
            [],
        )
        .unwrap();

        // Insert test data
        conn.execute(
            "INSERT INTO cache_entries (cache_key, provider, model, prompt_hash, response, tokens, cost, created_at, last_used_at, expires_at)
             VALUES ('key1', 'openai', 'gpt-4', 'hash1', 'response1', 100, 0.01, '2024-01-01', '2024-01-01', '2024-12-31')",
            [],
        )
        .unwrap();

        let stats = get_llm_cache_stats(&conn).unwrap();

        assert_eq!(stats.entries, 1);
        assert!(stats.size_mb > 0.0);
        assert_eq!(stats.savings_usd, Some(0.01));
    }
}

// ============================================================================
// Codebase Cache Commands
// ============================================================================

use crate::cache::CodebaseCache;
use std::path::PathBuf;
use std::sync::Arc;

/// Codebase cache state wrapper
pub struct CodebaseCacheState(pub Arc<CodebaseCache>);

/// Get codebase cache statistics
#[tauri::command]
pub async fn codebase_cache_get_stats(
    cache: State<'_, CodebaseCacheState>,
) -> Result<crate::cache::CacheStats, String> {
    cache
        .0
        .get_stats()
        .map_err(|e| format!("Failed to get cache stats: {}", e))
}

/// Clear codebase cache for a specific project
#[tauri::command]
pub async fn codebase_cache_clear_project(
    project_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .invalidate_project(&path)
        .map_err(|e| format!("Failed to clear project cache: {}", e))
}

/// Clear codebase cache for a specific file
#[tauri::command]
pub async fn codebase_cache_clear_file(
    file_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    let path = PathBuf::from(file_path);
    cache
        .0
        .invalidate_file(&path)
        .map_err(|e| format!("Failed to clear file cache: {}", e))
}

/// Clear all codebase cache entries
#[tauri::command]
pub async fn codebase_cache_clear_all(
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    cache
        .0
        .clear_all()
        .map_err(|e| format!("Failed to clear all cache: {}", e))
}

/// Clear expired codebase cache entries
#[tauri::command]
pub async fn codebase_cache_clear_expired(
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    cache
        .0
        .clear_expired()
        .map_err(|e| format!("Failed to clear expired cache: {}", e))
}

/// Get file tree from cache or None if not cached
#[tauri::command]
pub async fn codebase_cache_get_file_tree(
    project_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::cache::FileTree>, String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .get(crate::cache::CacheType::FileTree, &path, None)
        .map_err(|e| format!("Failed to get file tree: {}", e))
}

/// Set file tree in cache
#[tauri::command]
pub async fn codebase_cache_set_file_tree(
    project_path: String,
    file_tree: crate::cache::FileTree,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .set(crate::cache::CacheType::FileTree, &path, None, &file_tree)
        .map_err(|e| format!("Failed to set file tree: {}", e))
}

/// Get symbol table from cache or None if not cached
#[tauri::command]
pub async fn codebase_cache_get_symbols(
    file_path: String,
    file_hash: Option<String>,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::cache::SymbolTable>, String> {
    let path = PathBuf::from(file_path);
    cache
        .0
        .get(
            crate::cache::CacheType::Symbols,
            &path,
            file_hash.as_deref(),
        )
        .map_err(|e| format!("Failed to get symbols: {}", e))
}

/// Set symbol table in cache
#[tauri::command]
pub async fn codebase_cache_set_symbols(
    file_path: String,
    file_hash: Option<String>,
    symbols: crate::cache::SymbolTable,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    cache
        .0
        .set(
            crate::cache::CacheType::Symbols,
            &path,
            file_hash.as_deref(),
            &symbols,
        )
        .map_err(|e| format!("Failed to set symbols: {}", e))
}

/// Get dependency graph from cache or None if not cached
#[tauri::command]
pub async fn codebase_cache_get_dependencies(
    project_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::cache::DependencyGraph>, String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .get(crate::cache::CacheType::Dependencies, &path, None)
        .map_err(|e| format!("Failed to get dependencies: {}", e))
}

/// Set dependency graph in cache
#[tauri::command]
pub async fn codebase_cache_set_dependencies(
    project_path: String,
    dependencies: crate::cache::DependencyGraph,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .set(
            crate::cache::CacheType::Dependencies,
            &path,
            None,
            &dependencies,
        )
        .map_err(|e| format!("Failed to set dependencies: {}", e))
}

/// Calculate file hash for change detection
#[tauri::command]
pub async fn codebase_cache_calculate_hash(content: Vec<u8>) -> Result<String, String> {
    Ok(CodebaseCache::calculate_file_hash(&content))
}

// Helper function to get codebase cache statistics
fn get_codebase_cache_stats(cache: &State<CodebaseCacheState>) -> Result<CacheTypeStats, String> {
    let stats = cache
        .0
        .get_stats()
        .map_err(|e| format!("Failed to get codebase cache stats: {}", e))?;

    Ok(CacheTypeStats {
        hits: stats.hit_rate as u64,
        misses: stats.miss_rate as u64,
        hit_rate: stats.hit_rate,
        size_mb: stats.total_size_bytes as f64 / (1024.0 * 1024.0),
        entries: stats.total_entries,
        savings_usd: None, // Codebase cache doesn't have cost savings
    })
}
