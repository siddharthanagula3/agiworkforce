use super::types::{Priority, Task, TaskFilter, TaskResult, TaskStatus};
use anyhow::Context;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::{Arc, Mutex};

/// Task persistence layer
pub struct TaskPersistence {
    conn: Arc<Mutex<Connection>>,
}

impl TaskPersistence {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Save a task to the database
    pub fn save(&self, task: &Task) -> anyhow::Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        let result_json = task
            .result
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .context("Failed to serialize task result")?;

        conn.execute(
            "INSERT OR REPLACE INTO tasks (
                id, name, description, priority, status, progress,
                created_at, started_at, completed_at, result, payload
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &task.id,
                &task.name,
                &task.description,
                i32::from(task.priority),
                task.status.to_string(),
                task.progress,
                task.created_at.timestamp(),
                task.started_at.map(|t| t.timestamp()),
                task.completed_at.map(|t| t.timestamp()),
                result_json,
                &task.payload,
            ],
        )
        .context("Failed to save task")?;

        Ok(())
    }

    /// Load a task from the database
    pub fn load(&self, task_id: &str) -> anyhow::Result<Option<Task>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, priority, status, progress,
                        created_at, started_at, completed_at, result, payload
                 FROM tasks WHERE id = ?1",
            )
            .context("Failed to prepare query")?;

        let task = stmt
            .query_row(params![task_id], |row| {
                let result_str: Option<String> = row.get(9)?;
                let result: Option<TaskResult> = result_str
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok());

                Ok(Task {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    priority: Priority::from(row.get::<_, i32>(3)?),
                    status: TaskStatus::from(row.get::<_, String>(4)?),
                    progress: row.get(5)?,
                    created_at: DateTime::from_timestamp(row.get::<_, i64>(6)?, 0)
                        .unwrap_or_else(Utc::now),
                    started_at: row
                        .get::<_, Option<i64>>(7)?
                        .and_then(|t| DateTime::from_timestamp(t, 0)),
                    completed_at: row
                        .get::<_, Option<i64>>(8)?
                        .and_then(|t| DateTime::from_timestamp(t, 0)),
                    result,
                    payload: row.get(10)?,
                })
            })
            .optional()
            .context("Failed to load task")?;

        Ok(task)
    }

    /// List tasks with optional filtering
    pub fn list(&self, filter: &TaskFilter) -> anyhow::Result<Vec<Task>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        let mut query = String::from(
            "SELECT id, name, description, priority, status, progress,
                    created_at, started_at, completed_at, result, payload
             FROM tasks WHERE 1=1",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(status) = &filter.status {
            query.push_str(" AND status = ?");
            params.push(Box::new(status.to_string()));
        }

        if let Some(priority) = &filter.priority {
            query.push_str(" AND priority = ?");
            params.push(Box::new(i32::from(*priority)));
        }

        query.push_str(" ORDER BY priority DESC, created_at DESC");

        if let Some(limit) = filter.limit {
            query.push_str(" LIMIT ?");
            params.push(Box::new(limit as i64));
        }

        let mut stmt = conn.prepare(&query).context("Failed to prepare query")?;

        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let tasks = stmt
            .query_map(param_refs.as_slice(), |row| {
                let result_str: Option<String> = row.get(9)?;
                let result: Option<TaskResult> = result_str
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok());

                Ok(Task {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    priority: Priority::from(row.get::<_, i32>(3)?),
                    status: TaskStatus::from(row.get::<_, String>(4)?),
                    progress: row.get(5)?,
                    created_at: DateTime::from_timestamp(row.get::<_, i64>(6)?, 0)
                        .unwrap_or_else(Utc::now),
                    started_at: row
                        .get::<_, Option<i64>>(7)?
                        .and_then(|t| DateTime::from_timestamp(t, 0)),
                    completed_at: row
                        .get::<_, Option<i64>>(8)?
                        .and_then(|t| DateTime::from_timestamp(t, 0)),
                    result,
                    payload: row.get(10)?,
                })
            })
            .context("Failed to query tasks")?
            .collect::<Result<Vec<_>, _>>()
            .context("Failed to collect tasks")?;

        Ok(tasks)
    }

    /// Delete a task from the database
    pub fn delete(&self, task_id: &str) -> anyhow::Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
            .context("Failed to delete task")?;

        Ok(())
    }

    /// Clean up completed tasks older than the specified duration
    pub fn cleanup_old_tasks(&self, days: i64) -> anyhow::Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        let cutoff = Utc::now() - chrono::Duration::days(days);

        let deleted = conn
            .execute(
                "DELETE FROM tasks WHERE status IN ('Completed', 'Failed', 'Cancelled')
                 AND completed_at < ?1",
                params![cutoff.timestamp()],
            )
            .context("Failed to cleanup old tasks")?;

        Ok(deleted)
    }

    /// Get task statistics
    pub fn get_stats(&self) -> anyhow::Result<TaskStats> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'Queued' THEN 1 ELSE 0 END) as queued,
                    SUM(CASE WHEN status = 'Running' THEN 1 ELSE 0 END) as running,
                    SUM(CASE WHEN status = 'Paused' THEN 1 ELSE 0 END) as paused,
                    SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
                 FROM tasks",
            )
            .context("Failed to prepare stats query")?;

        let stats = stmt
            .query_row([], |row| {
                Ok(TaskStats {
                    total: row.get(0)?,
                    queued: row.get(1)?,
                    running: row.get(2)?,
                    paused: row.get(3)?,
                    completed: row.get(4)?,
                    failed: row.get(5)?,
                    cancelled: row.get(6)?,
                })
            })
            .context("Failed to get task stats")?;

        Ok(stats)
    }
}

/// Task statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskStats {
    pub total: i64,
    pub queued: i64,
    pub running: i64,
    pub paused: i64,
    pub completed: i64,
    pub failed: i64,
    pub cancelled: i64,
}
