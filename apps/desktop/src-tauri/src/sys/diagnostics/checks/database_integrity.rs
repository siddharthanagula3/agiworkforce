//! Database integrity check
//!
//! Verifies SQLite database integrity and schema validity.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Verifies SQLite database integrity
pub struct DatabaseIntegrityCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DatabaseStats {
    size_bytes: u64,
    page_count: i64,
    page_size: i64,
    table_count: usize,
    index_count: usize,
    wal_enabled: bool,
    integrity_ok: bool,
    foreign_keys_ok: bool,
}

#[async_trait]
impl DiagnosticCheck for DatabaseIntegrityCheck {
    fn id(&self) -> &'static str {
        "database_integrity"
    }

    fn name(&self) -> &'static str {
        "Database Integrity"
    }

    fn description(&self) -> &'static str {
        "Verifies SQLite database integrity, schema validity, and configuration"
    }

    fn category(&self) -> &'static str {
        "data"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(2)
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();
        let db_path = ctx.db_path.clone();

        // Run blocking database operations in a spawn_blocking task
        let result = tokio::task::spawn_blocking(move || check_database(&db_path)).await;

        let duration = start.elapsed();

        match result {
            Ok(Ok(stats)) => {
                if !stats.integrity_ok {
                    return DiagnosticResult::error(
                        self.id(),
                        self.name(),
                        "Database integrity check failed",
                        "The database may be corrupted. Try restoring from backup or recreating the database.",
                    )
                    .with_duration(duration)
                    .with_metadata(serde_json::to_value(&stats).unwrap_or_default());
                }

                if !stats.foreign_keys_ok {
                    return DiagnosticResult::warning(
                        self.id(),
                        self.name(),
                        "Database has foreign key constraint violations",
                        "Some data relationships are inconsistent. This may cause unexpected behavior.",
                    )
                    .with_duration(duration)
                    .with_metadata(serde_json::to_value(&stats).unwrap_or_default());
                }

                let size_mb = stats.size_bytes as f64 / 1_048_576.0;
                DiagnosticResult::ok(
                    self.id(),
                    self.name(),
                    format!(
                        "Database integrity OK ({:.2} MB, {} tables)",
                        size_mb, stats.table_count
                    ),
                )
                .with_duration(duration)
                .with_metadata(serde_json::to_value(&stats).unwrap_or_default())
            }
            Ok(Err(e)) => {
                if e.contains("not found") || e.contains("No such file") {
                    DiagnosticResult::warning(
                        self.id(),
                        self.name(),
                        "Database file does not exist",
                        "This is expected on first run. The database will be created automatically.",
                    )
                    .with_duration(duration)
                } else {
                    DiagnosticResult::error(
                        self.id(),
                        self.name(),
                        format!("Database check failed: {}", e),
                        "Check database file permissions and ensure it's not locked by another process.",
                    )
                    .with_duration(duration)
                }
            }
            Err(e) => DiagnosticResult::error(
                self.id(),
                self.name(),
                format!("Database check task failed: {}", e),
                "Internal error running database check. Please try again.",
            )
            .with_duration(duration),
        }
    }
}

fn check_database(db_path: &std::path::Path) -> Result<DatabaseStats, String> {
    if !db_path.exists() {
        return Err(format!("Database file not found: {:?}", db_path));
    }

    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Get database file size
    let size_bytes = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);

    // Check page count and size
    let page_count: i64 = conn
        .pragma_query_value(None, "page_count", |row| row.get(0))
        .map_err(|e| format!("Failed to get page count: {}", e))?;

    let page_size: i64 = conn
        .pragma_query_value(None, "page_size", |row| row.get(0))
        .map_err(|e| format!("Failed to get page size: {}", e))?;

    // Check journal mode (WAL)
    let journal_mode: String = conn
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .map_err(|e| format!("Failed to get journal mode: {}", e))?;
    let wal_enabled = journal_mode.to_lowercase() == "wal";

    // Count tables
    let table_count: usize = conn
        .prepare(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i64>(0)))
        .map(|c| c as usize)
        .map_err(|e| format!("Failed to count tables: {}", e))?;

    // Count indexes
    let index_count: usize = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='index'")
        .and_then(|mut stmt| stmt.query_row([], |row| row.get::<_, i64>(0)))
        .map(|c| c as usize)
        .map_err(|e| format!("Failed to count indexes: {}", e))?;

    // Run integrity check
    let integrity_ok = run_integrity_check(&conn)?;

    // Check foreign key constraints
    let foreign_keys_ok = check_foreign_keys(&conn)?;

    Ok(DatabaseStats {
        size_bytes,
        page_count,
        page_size,
        table_count,
        index_count,
        wal_enabled,
        integrity_ok,
        foreign_keys_ok,
    })
}

fn run_integrity_check(conn: &Connection) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("PRAGMA integrity_check(1)")
        .map_err(|e| format!("Failed to prepare integrity check: {}", e))?;

    let result: String = stmt
        .query_row([], |row| row.get(0))
        .map_err(|e| format!("Failed to run integrity check: {}", e))?;

    Ok(result == "ok")
}

fn check_foreign_keys(conn: &Connection) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|e| format!("Failed to prepare FK check: {}", e))?;

    let violations: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to run FK check: {}", e))?
        .filter_map(Result::ok)
        .collect();

    Ok(violations.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_database_check_missing_file() {
        let check = DatabaseIntegrityCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/nonexistent"));

        let result = check.run(&ctx).await;
        assert!(result.severity == Severity::Error || result.severity == Severity::Warning);
    }

    #[tokio::test]
    async fn test_database_check_valid_db() {
        let check = DatabaseIntegrityCheck;
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Create a valid database
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY)", [])
                .unwrap();
        }

        let ctx = DiagnosticContext::new(temp_dir.path().to_path_buf());
        let result = check.run(&DiagnosticContext { db_path, ..ctx }).await;

        assert_eq!(result.severity, Severity::Ok);
    }
}
