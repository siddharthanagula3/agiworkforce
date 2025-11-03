use crate::db::models::AuditLogEntry;
use crate::error::{Error, Result};
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tracing::{debug, info};

/// Audit logger for system automation operations
pub struct AuditLogger {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditFilters {
    pub operation_type: Option<String>,
    pub success: Option<bool>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

impl Default for AuditFilters {
    fn default() -> Self {
        Self {
            operation_type: None,
            success: None,
            start_date: None,
            end_date: None,
            limit: Some(100),
            offset: Some(0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationStats {
    pub total_operations: i64,
    pub successful_operations: i64,
    pub failed_operations: i64,
    pub total_duration_ms: i64,
    pub average_duration_ms: f64,
    pub operations_by_type: Vec<(String, i64)>,
}

impl AuditLogger {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    /// Log an automation operation
    pub fn log_operation(
        &self,
        operation_type: String,
        operation_details: String,
        permission_type: String,
        approved: bool,
        success: bool,
        duration_ms: i64,
        error_message: Option<String>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO audit_log (
                operation_type,
                operation_details,
                permission_type,
                approved,
                success,
                error_message,
                duration_ms,
                created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                operation_type,
                operation_details,
                permission_type,
                if approved { 1 } else { 0 },
                if success { 1 } else { 0 },
                error_message,
                duration_ms,
                now
            ],
        )?;

        let id = conn.last_insert_rowid();

        debug!(
            "Audit log entry created: id={}, type={}, success={}",
            id, operation_type, success
        );

        Ok(id)
    }

    /// Get audit log entries with filters
    pub fn get_audit_log(&self, filters: AuditFilters) -> Result<Vec<AuditLogEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut query = String::from(
            "SELECT id, operation_type, operation_details, permission_type,
                    approved, success, error_message, duration_ms, created_at
             FROM audit_log WHERE 1=1",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(op_type) = &filters.operation_type {
            query.push_str(" AND operation_type = ?");
            params.push(Box::new(op_type.clone()));
        }

        if let Some(success) = filters.success {
            query.push_str(" AND success = ?");
            params.push(Box::new(if success { 1 } else { 0 }));
        }

        if let Some(start_date) = filters.start_date {
            query.push_str(" AND created_at >= ?");
            params.push(Box::new(start_date.to_rfc3339()));
        }

        if let Some(end_date) = filters.end_date {
            query.push_str(" AND created_at <= ?");
            params.push(Box::new(end_date.to_rfc3339()));
        }

        query.push_str(" ORDER BY created_at DESC");

        if let Some(limit) = filters.limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = filters.offset {
            query.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn.prepare(&query)?;

        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let entries = stmt
            .query_map(param_refs.as_slice(), |row| {
                let created_str: String = row.get(8)?;

                Ok(AuditLogEntry {
                    id: row.get(0)?,
                    operation_type: row.get(1)?,
                    operation_details: row.get(2)?,
                    permission_type: row.get(3)?,
                    approved: row.get::<_, i32>(4)? == 1,
                    success: row.get::<_, i32>(5)? == 1,
                    error_message: row.get(6)?,
                    duration_ms: row.get(7)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_str)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(entries)
    }

    /// Get automation statistics
    pub fn get_statistics(&self) -> Result<AutomationStats> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        // Get overall stats
        let (total, successful, failed, total_duration): (i64, i64, i64, i64) = conn.query_row(
            "SELECT
                    COUNT(*),
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END),
                    SUM(duration_ms)
                 FROM audit_log",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        let average_duration = if total > 0 {
            total_duration as f64 / total as f64
        } else {
            0.0
        };

        // Get operations by type
        let mut stmt = conn.prepare(
            "SELECT operation_type, COUNT(*) as count
             FROM audit_log
             GROUP BY operation_type
             ORDER BY count DESC",
        )?;

        let operations_by_type = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(AutomationStats {
            total_operations: total,
            successful_operations: successful,
            failed_operations: failed,
            total_duration_ms: total_duration,
            average_duration_ms: average_duration,
            operations_by_type,
        })
    }

    /// Clear audit log entries older than a specific date
    pub fn clear_old_entries(&self, before_date: DateTime<Utc>) -> Result<usize> {
        let now = Utc::now();
        if before_date > now {
            return Ok(0);
        }

        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let deleted = conn.execute(
            "DELETE FROM audit_log WHERE created_at < ?",
            [before_date.to_rfc3339()],
        )?;

        info!("Cleared {} old audit log entries", deleted);

        Ok(deleted)
    }

    /// Clear all audit log entries
    pub fn clear_all(&self) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let deleted = conn.execute("DELETE FROM audit_log", [])?;

        info!("Cleared all audit log entries ({})", deleted);

        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use rusqlite::Connection;

    fn setup_test_db() -> AuditLogger {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create audit_log table
        conn.execute(
            "CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_type TEXT NOT NULL,
                operation_details TEXT NOT NULL,
                permission_type TEXT NOT NULL,
                approved INTEGER NOT NULL CHECK(approved IN (0, 1)),
                success INTEGER NOT NULL CHECK(success IN (0, 1)),
                error_message TEXT,
                duration_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        AuditLogger::new(conn)
    }

    #[test]
    fn test_log_operation() {
        let logger = setup_test_db();

        let id = logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                100,
                None,
            )
            .unwrap();

        assert!(id > 0);
    }

    #[test]
    fn test_get_audit_log() {
        let logger = setup_test_db();

        // Log some operations
        logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test1.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                100,
                None,
            )
            .unwrap();

        logger
            .log_operation(
                "file_write".to_string(),
                "Write file /test2.txt".to_string(),
                "FILE_WRITE".to_string(),
                true,
                false,
                200,
                Some("Permission denied".to_string()),
            )
            .unwrap();

        // Get all entries
        let entries = logger.get_audit_log(AuditFilters::default()).unwrap();
        assert_eq!(entries.len(), 2);

        // Filter by success
        let entries = logger
            .get_audit_log(AuditFilters {
                success: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].operation_type, "file_read");
    }

    #[test]
    fn test_get_statistics() {
        let logger = setup_test_db();

        // Log some operations
        logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test1.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                100,
                None,
            )
            .unwrap();

        logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test2.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                150,
                None,
            )
            .unwrap();

        logger
            .log_operation(
                "file_write".to_string(),
                "Write file /test3.txt".to_string(),
                "FILE_WRITE".to_string(),
                true,
                false,
                200,
                Some("Error".to_string()),
            )
            .unwrap();

        let stats = logger.get_statistics().unwrap();

        assert_eq!(stats.total_operations, 3);
        assert_eq!(stats.successful_operations, 2);
        assert_eq!(stats.failed_operations, 1);
        assert_eq!(stats.total_duration_ms, 450);
        assert_eq!(stats.average_duration_ms, 150.0);
        assert_eq!(stats.operations_by_type.len(), 2);
    }

    #[test]
    fn test_clear_old_entries() {
        let logger = setup_test_db();

        // Log an operation
        logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                100,
                None,
            )
            .unwrap();

        // Clear entries older than tomorrow (should not delete anything)
        let tomorrow = Utc::now() + Duration::days(1);
        let deleted = logger.clear_old_entries(tomorrow).unwrap();
        assert_eq!(deleted, 0);

        // Clear entries older than yesterday (should delete the entry)
        let yesterday = Utc::now() - Duration::days(1);
        let deleted = logger.clear_old_entries(yesterday).unwrap();
        assert_eq!(deleted, 0); // Entry was created today, so it won't be deleted

        // Verify entry still exists
        let entries = logger.get_audit_log(AuditFilters::default()).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn test_clear_all() {
        let logger = setup_test_db();

        // Log some operations
        logger
            .log_operation(
                "file_read".to_string(),
                "Read file /test1.txt".to_string(),
                "FILE_READ".to_string(),
                true,
                true,
                100,
                None,
            )
            .unwrap();

        logger
            .log_operation(
                "file_write".to_string(),
                "Write file /test2.txt".to_string(),
                "FILE_WRITE".to_string(),
                true,
                true,
                200,
                None,
            )
            .unwrap();

        // Clear all
        let deleted = logger.clear_all().unwrap();
        assert_eq!(deleted, 2);

        // Verify no entries remain
        let entries = logger.get_audit_log(AuditFilters::default()).unwrap();
        assert_eq!(entries.len(), 0);
    }
}
