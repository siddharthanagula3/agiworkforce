use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecution {
    pub id: String,
    pub tool_id: String,
    pub tool_name: String,
    pub user_id: Option<String>,
    pub conversation_id: Option<String>,
    pub parameters: String, // JSON
    pub result: Option<String>,
    pub success: bool,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub memory_used_mb: Option<f64>,
    pub cpu_usage_percent: Option<f32>,
    pub permission_granted: bool,
    pub auto_approved: bool,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub id: String,
    pub tool_id: String,
    pub tool_name: String,
    pub action: String,
    pub user_id: String,
    pub approved: bool,
    pub approval_method: String, // "manual", "auto", "policy"
    pub requested_at: String,
    pub responded_at: Option<String>,
}

pub struct AuditLogger {
    db_path: PathBuf,
}

impl AuditLogger {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let logger = Self { db_path };
        logger.init_database()?;
        Ok(logger)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Tool executions table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tool_executions (
                id TEXT PRIMARY KEY,
                tool_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                user_id TEXT,
                conversation_id TEXT,
                parameters TEXT,
                result TEXT,
                success BOOLEAN NOT NULL,
                error TEXT,
                execution_time_ms INTEGER NOT NULL,
                memory_used_mb REAL,
                cpu_usage_percent REAL,
                permission_granted BOOLEAN NOT NULL,
                auto_approved BOOLEAN DEFAULT 0,
                timestamp TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Permission requests table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS permission_requests (
                id TEXT PRIMARY KEY,
                tool_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                action TEXT NOT NULL,
                user_id TEXT NOT NULL,
                approved BOOLEAN NOT NULL,
                approval_method TEXT NOT NULL,
                requested_at TEXT NOT NULL,
                responded_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tool_executions_tool
             ON tool_executions(tool_id, timestamp DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tool_executions_user
             ON tool_executions(user_id, timestamp DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_permission_requests_tool
             ON permission_requests(tool_id, requested_at DESC)",
            [],
        )?;

        Ok(())
    }

    pub fn log_execution(&self, execution: ToolExecution) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO tool_executions
             (id, tool_id, tool_name, user_id, conversation_id, parameters, result, success, error,
              execution_time_ms, memory_used_mb, cpu_usage_percent, permission_granted, auto_approved, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                &execution.id,
                &execution.tool_id,
                &execution.tool_name,
                &execution.user_id,
                &execution.conversation_id,
                &execution.parameters,
                &execution.result,
                execution.success,
                &execution.error,
                execution.execution_time_ms as i64,
                execution.memory_used_mb,
                execution.cpu_usage_percent,
                execution.permission_granted,
                execution.auto_approved,
                &execution.timestamp,
            ],
        )?;

        Ok(())
    }

    pub fn log_permission_request(&self, request: PermissionRequest) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO permission_requests
             (id, tool_id, tool_name, action, user_id, approved, approval_method, requested_at, responded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &request.id,
                &request.tool_id,
                &request.tool_name,
                &request.action,
                &request.user_id,
                request.approved,
                &request.approval_method,
                &request.requested_at,
                &request.responded_at,
            ],
        )?;

        Ok(())
    }

    pub fn get_tool_executions(&self, tool_id: &str, limit: usize) -> Result<Vec<ToolExecution>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, tool_id, tool_name, user_id, conversation_id, parameters, result, success, error,
                    execution_time_ms, memory_used_mb, cpu_usage_percent, permission_granted, auto_approved, timestamp
             FROM tool_executions
             WHERE tool_id = ?1
             ORDER BY timestamp DESC
             LIMIT ?2",
        )?;

        let executions = stmt.query_map(params![tool_id, limit as i64], |row| {
            Ok(ToolExecution {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                tool_name: row.get(2)?,
                user_id: row.get(3)?,
                conversation_id: row.get(4)?,
                parameters: row.get(5)?,
                result: row.get(6)?,
                success: row.get(7)?,
                error: row.get(8)?,
                execution_time_ms: row.get::<_, i64>(9)? as u64,
                memory_used_mb: row.get(10)?,
                cpu_usage_percent: row.get(11)?,
                permission_granted: row.get(12)?,
                auto_approved: row.get(13)?,
                timestamp: row.get(14)?,
            })
        })?;

        let mut result = Vec::new();
        for execution in executions {
            result.push(execution?);
        }

        Ok(result)
    }

    pub fn get_recent_executions(&self, limit: usize) -> Result<Vec<ToolExecution>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, tool_id, tool_name, user_id, conversation_id, parameters, result, success, error,
                    execution_time_ms, memory_used_mb, cpu_usage_percent, permission_granted, auto_approved, timestamp
             FROM tool_executions
             ORDER BY timestamp DESC
             LIMIT ?1",
        )?;

        let executions = stmt.query_map([limit as i64], |row| {
            Ok(ToolExecution {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                tool_name: row.get(2)?,
                user_id: row.get(3)?,
                conversation_id: row.get(4)?,
                parameters: row.get(5)?,
                result: row.get(6)?,
                success: row.get(7)?,
                error: row.get(8)?,
                execution_time_ms: row.get::<_, i64>(9)? as u64,
                memory_used_mb: row.get(10)?,
                cpu_usage_percent: row.get(11)?,
                permission_granted: row.get(12)?,
                auto_approved: row.get(13)?,
                timestamp: row.get(14)?,
            })
        })?;

        let mut result = Vec::new();
        for execution in executions {
            result.push(execution?);
        }

        Ok(result)
    }

    pub fn get_failed_executions(&self, limit: usize) -> Result<Vec<ToolExecution>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, tool_id, tool_name, user_id, conversation_id, parameters, result, success, error,
                    execution_time_ms, memory_used_mb, cpu_usage_percent, permission_granted, auto_approved, timestamp
             FROM tool_executions
             WHERE success = 0
             ORDER BY timestamp DESC
             LIMIT ?1",
        )?;

        let executions = stmt.query_map([limit as i64], |row| {
            Ok(ToolExecution {
                id: row.get(0)?,
                tool_id: row.get(1)?,
                tool_name: row.get(2)?,
                user_id: row.get(3)?,
                conversation_id: row.get(4)?,
                parameters: row.get(5)?,
                result: row.get(6)?,
                success: row.get(7)?,
                error: row.get(8)?,
                execution_time_ms: row.get::<_, i64>(9)? as u64,
                memory_used_mb: row.get(10)?,
                cpu_usage_percent: row.get(11)?,
                permission_granted: row.get(12)?,
                auto_approved: row.get(13)?,
                timestamp: row.get(14)?,
            })
        })?;

        let mut result = Vec::new();
        for execution in executions {
            result.push(execution?);
        }

        Ok(result)
    }

    pub fn get_statistics(&self, tool_id: Option<&str>) -> Result<ToolExecutionStats> {
        let conn = Connection::open(&self.db_path)?;

        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(id) = tool_id {
            (
                "SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
                    AVG(execution_time_ms) as avg_time,
                    MAX(execution_time_ms) as max_time,
                    AVG(memory_used_mb) as avg_memory,
                    AVG(cpu_usage_percent) as avg_cpu
                 FROM tool_executions
                 WHERE tool_id = ?1".to_string(),
                vec![Box::new(id.to_string())],
            )
        } else {
            (
                "SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
                    AVG(execution_time_ms) as avg_time,
                    MAX(execution_time_ms) as max_time,
                    AVG(memory_used_mb) as avg_memory,
                    AVG(cpu_usage_percent) as avg_cpu
                 FROM tool_executions".to_string(),
                vec![],
            )
        };

        let mut stmt = conn.prepare(&sql)?;

        let stats = if tool_id.is_some() {
            stmt.query_row(rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())), |row| {
                Ok(ToolExecutionStats {
                    total_executions: row.get::<_, i64>(0)? as u64,
                    successful_executions: row.get::<_, i64>(1)? as u64,
                    failed_executions: row.get::<_, i64>(2)? as u64,
                    avg_execution_time_ms: row.get(3)?,
                    max_execution_time_ms: row.get::<_, i64>(4)? as u64,
                    avg_memory_used_mb: row.get(5)?,
                    avg_cpu_usage_percent: row.get(6)?,
                })
            })?
        } else {
            stmt.query_row([], |row| {
                Ok(ToolExecutionStats {
                    total_executions: row.get::<_, i64>(0)? as u64,
                    successful_executions: row.get::<_, i64>(1)? as u64,
                    failed_executions: row.get::<_, i64>(2)? as u64,
                    avg_execution_time_ms: row.get(3)?,
                    max_execution_time_ms: row.get::<_, i64>(4)? as u64,
                    avg_memory_used_mb: row.get(5)?,
                    avg_cpu_usage_percent: row.get(6)?,
                })
            })?
        };

        Ok(stats)
    }

    pub fn clear_old_logs(&self, days: u32) -> Result<usize> {
        let conn = Connection::open(&self.db_path)?;

        let deleted = conn.execute(
            "DELETE FROM tool_executions WHERE created_at < datetime('now', '-' || ?1 || ' days')",
            [days],
        )?;

        Ok(deleted)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionStats {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub avg_execution_time_ms: f64,
    pub max_execution_time_ms: u64,
    pub avg_memory_used_mb: Option<f64>,
    pub avg_cpu_usage_percent: Option<f32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_audit_logger_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("audit.db");
        let logger = AuditLogger::new(db_path);
        assert!(logger.is_ok());
    }
}
