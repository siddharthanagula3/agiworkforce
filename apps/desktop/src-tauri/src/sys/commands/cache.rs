use super::{llm::LLMState, AppDatabase};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheTypeStats {
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
    pub size_mb: f64,
    pub entries: usize,
    pub savings_usd: Option<f64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub llm_cache: CacheTypeStats,
    pub tool_cache: CacheTypeStats,
    pub codebase_cache: CacheTypeStats,
    pub total_size_mb: f64,
    pub total_savings_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheSettings {
    pub ttl_seconds: Option<u64>,
    pub max_entries: Option<usize>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheAnalytics {
    pub most_cached_queries: Vec<CachedQueryInfo>,
    pub provider_breakdown: Vec<ProviderCacheBreakdown>,
    pub total_cost_saved: f64,
    pub total_tokens_saved: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedQueryInfo {
    pub prompt_hash: String,
    pub provider: String,
    pub model: String,
    pub hit_count: u64,
    pub cost_saved: f64,
    pub last_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCacheBreakdown {
    pub provider: String,
    pub entries: usize,
    pub total_hits: u64,
    pub cost_saved: f64,
}

#[tauri::command]
pub async fn cache_get_stats(
    db: State<'_, AppDatabase>,
    codebase_cache: State<'_, CodebaseCacheState>,
) -> Result<CacheStats, String> {
    let conn = db.connection()?;

    let llm_stats = get_llm_cache_stats(&conn)?;

    let codebase_stats = get_codebase_cache_stats(&codebase_cache)?;

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

#[tauri::command]
pub async fn cache_clear_all(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    let conn = db.connection()?;

    conn.execute("DELETE FROM cache_entries", [])
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    llm_state
        .cache_manager
        .prune_expired(&conn)
        .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

    tracing::info!("All cache entries cleared");
    Ok(())
}

#[tauri::command]
pub async fn cache_clear_by_type(
    cache_type: String,
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
    codebase_cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    match cache_type.as_str() {
        "llm" => {
            let conn = db.connection()?;

            conn.execute("DELETE FROM cache_entries", [])
                .map_err(|e| format!("Failed to clear LLM cache: {}", e))?;

            llm_state
                .cache_manager
                .prune_expired(&conn)
                .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

            tracing::info!("LLM cache cleared");
            Ok(())
        }
        "tool" => {
            // Tool caches are managed per-execution by AgiExecutor instances.
            // They automatically clear when executions complete.
            // No global tool cache to clear, but we log the request for visibility.
            tracing::info!("Tool cache clear requested - tool caches are per-execution and auto-clear on completion");
            Ok(())
        }
        "codebase" => {
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

#[tauri::command]
pub async fn cache_clear_by_provider(
    provider: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.connection()?;

    let deleted = conn
        .execute("DELETE FROM cache_entries WHERE provider = ?1", [&provider])
        .map_err(|e| format!("Failed to clear cache for provider {}: {}", provider, e))?;

    tracing::info!(
        "Cleared {} cache entries for provider: {}",
        deleted,
        provider
    );
    Ok(())
}

#[tauri::command]
pub async fn cache_get_size(db: State<'_, AppDatabase>) -> Result<f64, String> {
    let conn = db.connection()?;

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

#[tauri::command]
pub async fn cache_configure(
    settings: CacheSettings,
    _llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    tracing::info!(
        "Cache configuration request received: ttl={:?}s, max_entries={:?}, enabled={:?}",
        settings.ttl_seconds,
        settings.max_entries,
        settings.enabled
    );

    Ok(())
}

#[tauri::command]
pub async fn cache_warmup(queries: Vec<String>) -> Result<(), String> {
    tracing::info!("Cache warmup requested for {} queries", queries.len());

    Ok(())
}

#[tauri::command]
pub async fn cache_export(db: State<'_, AppDatabase>) -> Result<String, String> {
    let conn = db.connection()?;

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

#[tauri::command]
pub async fn cache_get_analytics(db: State<'_, AppDatabase>) -> Result<CacheAnalytics, String> {
    let conn = db.connection()?;

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

    let total_cost_saved: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(cost_saved), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate total cost saved: {}", e))?;

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

#[tauri::command]
pub async fn cache_prune_expired(
    db: State<'_, AppDatabase>,
    llm_state: State<'_, LLMState>,
) -> Result<usize, String> {
    let conn = db.connection()?;

    let pruned = llm_state
        .cache_manager
        .prune_expired(&conn)
        .map_err(|e| format!("Failed to prune expired cache: {}", e))?;

    tracing::info!("Pruned {} expired cache entries", pruned);
    Ok(pruned)
}

fn get_llm_cache_stats(conn: &Connection) -> Result<CacheTypeStats, String> {
    let entries: usize = conn
        .query_row("SELECT COUNT(*) FROM cache_entries", [], |row| {
            Ok(row.get::<_, i64>(0)? as usize)
        })
        .map_err(|e| format!("Failed to count cache entries: {}", e))?;

    let total_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(response) + LENGTH(prompt_hash)), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate cache size: {}", e))?;

    let size_mb = total_bytes as f64 / (1024.0 * 1024.0);

    let savings_usd: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(cost_saved), 0) FROM cache_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to calculate cost savings: {}", e))?;

    let hits: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(hit_count), 0) FROM cache_entries",
            [],
            |row| Ok(row.get::<_, i64>(0)? as u64),
        )
        .map_err(|e| format!("Failed to calculate total hits: {}", e))?;

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
                expires_at TEXT,
                hit_count INTEGER DEFAULT 0,
                cost_saved REAL DEFAULT 0.0,
                tokens_saved INTEGER DEFAULT 0
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO cache_entries (cache_key, provider, model, prompt_hash, response, tokens, cost, created_at, last_used_at, expires_at, hit_count, cost_saved, tokens_saved)
             VALUES ('key1', 'openai', 'gpt-4', 'hash1', 'response1', 100, 0.01, '2024-01-01', '2024-01-01', '2024-12-31', 5, 0.05, 500)",
            [],
        )
        .unwrap();

        let stats = get_llm_cache_stats(&conn).unwrap();

        assert_eq!(stats.entries, 1);
        assert!(stats.size_mb > 0.0);
        assert_eq!(stats.savings_usd, Some(0.05));
        assert_eq!(stats.hits, 5);
    }
}

use crate::data::cache::CodebaseCache;
use std::path::PathBuf;
use std::sync::Arc;

pub struct CodebaseCacheState(pub Arc<CodebaseCache>);

#[tauri::command]
pub async fn codebase_cache_get_stats(
    cache: State<'_, CodebaseCacheState>,
) -> Result<crate::data::cache::CacheStats, String> {
    cache
        .0
        .get_stats()
        .map_err(|e| format!("Failed to get cache stats: {}", e))
}

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

#[tauri::command]
pub async fn codebase_cache_clear_all(
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    cache
        .0
        .clear_all()
        .map_err(|e| format!("Failed to clear all cache: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_clear_expired(
    cache: State<'_, CodebaseCacheState>,
) -> Result<usize, String> {
    cache
        .0
        .clear_expired()
        .map_err(|e| format!("Failed to clear expired cache: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_get_file_tree(
    project_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::data::cache::FileTree>, String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .get(crate::data::cache::CacheType::FileTree, &path, None)
        .map_err(|e| format!("Failed to get file tree: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_set_file_tree(
    project_path: String,
    file_tree: crate::data::cache::FileTree,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .set(
            crate::data::cache::CacheType::FileTree,
            &path,
            None,
            &file_tree,
        )
        .map_err(|e| format!("Failed to set file tree: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_get_symbols(
    file_path: String,
    file_hash: Option<String>,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::data::cache::SymbolTable>, String> {
    let path = PathBuf::from(file_path);
    cache
        .0
        .get(
            crate::data::cache::CacheType::Symbols,
            &path,
            file_hash.as_deref(),
        )
        .map_err(|e| format!("Failed to get symbols: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_set_symbols(
    file_path: String,
    file_hash: Option<String>,
    symbols: crate::data::cache::SymbolTable,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    cache
        .0
        .set(
            crate::data::cache::CacheType::Symbols,
            &path,
            file_hash.as_deref(),
            &symbols,
        )
        .map_err(|e| format!("Failed to set symbols: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_get_dependencies(
    project_path: String,
    cache: State<'_, CodebaseCacheState>,
) -> Result<Option<crate::data::cache::DependencyGraph>, String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .get(crate::data::cache::CacheType::Dependencies, &path, None)
        .map_err(|e| format!("Failed to get dependencies: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_set_dependencies(
    project_path: String,
    dependencies: crate::data::cache::DependencyGraph,
    cache: State<'_, CodebaseCacheState>,
) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    cache
        .0
        .set(
            crate::data::cache::CacheType::Dependencies,
            &path,
            None,
            &dependencies,
        )
        .map_err(|e| format!("Failed to set dependencies: {}", e))
}

#[tauri::command]
pub async fn codebase_cache_calculate_hash(content: Vec<u8>) -> Result<String, String> {
    Ok(CodebaseCache::calculate_file_hash(&content))
}

/// Bug #80 fix: `hit_rate` and `miss_rate` are f64 percentages (0..100).
/// Casting them directly to u64 with `as u64` truncates anything < 1.0 to 0.
/// Use `.round() as u64` to get meaningful integer counts, and derive
/// actual hit/miss counts from the rate * total_entries.
fn get_codebase_cache_stats(cache: &State<CodebaseCacheState>) -> Result<CacheTypeStats, String> {
    let stats = cache
        .0
        .get_stats()
        .map_err(|e| format!("Failed to get codebase cache stats: {}", e))?;

    let total = stats.total_entries as f64;
    let hits_count = ((stats.hit_rate / 100.0) * total).round() as u64;
    let misses_count = ((stats.miss_rate / 100.0) * total).round() as u64;

    Ok(CacheTypeStats {
        hits: hits_count,
        misses: misses_count,
        hit_rate: stats.hit_rate / 100.0, // normalize to 0..1 to match llm_cache convention
        size_mb: stats.total_size_bytes as f64 / (1024.0 * 1024.0),
        entries: stats.total_entries,
        savings_usd: None,
    })
}
