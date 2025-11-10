use super::*;
use anyhow::Result;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Knowledge Base - stores and retrieves knowledge for the AGI
pub struct KnowledgeBase {
    db: Mutex<Connection>,
    _memory_limit_mb: u64,
}

#[derive(Debug, Clone)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub content: String,
    pub metadata: HashMap<String, String>,
    pub timestamp: u64,
    pub importance: f64,
}

impl KnowledgeBase {
    pub fn new(memory_limit_mb: u64) -> Result<Self> {
        let db_path = Self::get_db_path()?;
        std::fs::create_dir_all(db_path.parent().unwrap())?;

        let conn = Connection::open(&db_path)?;
        let kb = Self {
            db: Mutex::new(conn),
            _memory_limit_mb: memory_limit_mb,
        };

        kb.init_schema()?;
        Ok(kb)
    }

    fn get_db_path() -> Result<PathBuf> {
        let app_data = dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find data directory"))?
            .join("agiworkforce");
        std::fs::create_dir_all(&app_data)?;
        Ok(app_data.join("knowledge.db"))
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS knowledge (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                timestamp INTEGER NOT NULL,
                importance REAL NOT NULL,
                access_count INTEGER DEFAULT 0,
                last_accessed INTEGER
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_category ON knowledge(category)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_importance ON knowledge(importance DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON knowledge(timestamp DESC)",
            [],
        )?;

        Ok(())
    }

    /// Add a goal to knowledge base
    pub async fn add_goal(&self, goal: &Goal) -> Result<()> {
        let entry = KnowledgeEntry {
            id: goal.id.clone(),
            category: "goal".to_string(),
            content: goal.description.clone(),
            metadata: HashMap::from([("priority".to_string(), format!("{:?}", goal.priority))]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            importance: match goal.priority {
                Priority::Low => 0.25,
                Priority::Medium => 0.5,
                Priority::High => 0.75,
                Priority::Critical => 1.0,
            },
        };

        self.add_entry(entry).await
    }

    /// Add an experience (tool execution result) to knowledge base
    pub async fn add_experience(&self, goal: &Goal, result: &ToolExecutionResult) -> Result<()> {
        let entry = KnowledgeEntry {
            id: format!("exp_{}", &uuid::Uuid::new_v4().to_string()[..8]),
            category: "experience".to_string(),
            content: format!(
                "Tool {} executed with success={} for goal: {}",
                result.tool_id, result.success, goal.description
            ),
            metadata: HashMap::from([
                ("goal_id".to_string(), goal.id.clone()),
                ("tool_id".to_string(), result.tool_id.clone()),
                ("success".to_string(), result.success.to_string()),
                (
                    "execution_time_ms".to_string(),
                    result.execution_time_ms.to_string(),
                ),
            ]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            importance: if result.success { 0.7 } else { 0.9 }, // Failures are more important to remember
        };

        self.add_entry(entry).await
    }

    /// Add a knowledge entry
    pub async fn add_entry(&self, entry: KnowledgeEntry) -> Result<()> {
        {
            let conn = self.db.lock().unwrap();
            let metadata_json = serde_json::to_string(&entry.metadata)?;

            conn.execute(
                "INSERT OR REPLACE INTO knowledge (id, category, content, metadata, timestamp, importance)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    entry.id,
                    entry.category,
                    entry.content,
                    metadata_json,
                    entry.timestamp,
                    entry.importance
                ],
            )?;
        } // Drop the lock before await

        // Enforce memory limit
        self.enforce_memory_limit().await?;

        Ok(())
    }

    /// Query knowledge base
    pub async fn query(&self, query: &str, limit: usize) -> Result<Vec<KnowledgeEntry>> {
        let conn = self.db.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, category, content, metadata, timestamp, importance
             FROM knowledge
             WHERE content LIKE ?1 OR category LIKE ?1
             ORDER BY importance DESC, timestamp DESC
             LIMIT ?2",
        )?;

        let search_term = format!("%{}%", query);
        let rows = stmt.query_map(params![search_term, limit], |row| {
            Ok(KnowledgeEntry {
                id: row.get(0)?,
                category: row.get(1)?,
                content: row.get(2)?,
                metadata: serde_json::from_str(row.get::<_, String>(3)?.as_str())
                    .unwrap_or_default(),
                timestamp: row.get(4)?,
                importance: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    /// Get relevant knowledge for a goal
    pub async fn get_relevant_knowledge(
        &self,
        goal: &Goal,
        limit: usize,
    ) -> Result<Vec<KnowledgeEntry>> {
        // Search by goal description keywords
        let keywords: Vec<&str> = goal.description.split_whitespace().collect();
        let mut all_results = Vec::new();

        for keyword in keywords {
            if keyword.len() > 3 {
                let results = self.query(keyword, limit).await?;
                all_results.extend(results);
            }
        }

        // Also search by category
        let category_results = self.query(&format!("goal:{}", goal.id), limit).await?;
        all_results.extend(category_results);

        // Deduplicate and sort by importance
        all_results.sort_by(|a, b| b.importance.partial_cmp(&a.importance).unwrap());
        all_results.dedup_by(|a, b| a.id == b.id);

        Ok(all_results.into_iter().take(limit).collect())
    }

    /// Enforce memory limit by removing least important entries
    async fn enforce_memory_limit(&self) -> Result<()> {
        // Check actual database file size
        let db_path = Self::get_db_path()?;
        let file_size_mb = if let Ok(metadata) = std::fs::metadata(&db_path) {
            metadata.len() / (1024 * 1024) // Convert bytes to MB
        } else {
            0 // If file doesn't exist or can't be read, assume 0
        };

        tracing::debug!(
            "Knowledge base size: {} MB (limit: {} MB)",
            file_size_mb,
            self._memory_limit_mb
        );

        // If we're over the limit, trigger compaction and pruning
        if file_size_mb > self._memory_limit_mb {
            tracing::warn!(
                "Knowledge base size ({} MB) exceeds limit ({} MB), pruning entries",
                file_size_mb,
                self._memory_limit_mb
            );

            let conn = self.db.lock().unwrap();

            // First, VACUUM to reclaim space
            conn.execute("VACUUM", [])?;

            // Then remove oldest and least important entries (keep top 80% by importance)
            let count: i64 =
                conn.query_row("SELECT COUNT(*) FROM knowledge", [], |row| row.get(0))?;
            let keep_count = (count as f64 * 0.8) as i64;

            conn.execute(
                "DELETE FROM knowledge
                 WHERE id NOT IN (
                     SELECT id FROM knowledge
                     ORDER BY importance DESC, timestamp DESC
                     LIMIT ?
                 )",
                params![keep_count],
            )?;

            // VACUUM again to actually free the space
            conn.execute("VACUUM", [])?;

            tracing::info!("Knowledge base pruned to {} entries", keep_count);
        }

        // Also enforce a reasonable count limit to prevent unbounded growth
        let conn = self.db.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM knowledge", [], |row| row.get(0))?;

        // Keep only top 10000 entries by importance
        if count > 10000 {
            conn.execute(
                "DELETE FROM knowledge
                 WHERE id NOT IN (
                     SELECT id FROM knowledge
                     ORDER BY importance DESC, timestamp DESC
                     LIMIT 10000
                 )",
                [],
            )?;
        }

        Ok(())
    }
}
