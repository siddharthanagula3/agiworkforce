use super::*;
use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;

pub struct KnowledgeBase {
    db: Mutex<Connection>,
    _memory_limit_mb: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub category: String,
    pub content: String,
    pub metadata: HashMap<String, String>,
    pub timestamp: u64,
    pub importance: f64,
}

impl KnowledgeBase {
    fn current_timestamp() -> Result<u64> {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .map_err(|e| anyhow::anyhow!("System time error: {}", e))
    }

    fn lock_db(&self) -> Result<parking_lot::MutexGuard<'_, Connection>> {
        Ok(self.db.lock())
    }

    pub fn new(memory_limit_mb: u64) -> Result<Self> {
        let db_path = Self::get_db_path()?;
        // AUDIT-P3-008: Handle missing parent directory gracefully
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

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
        let conn = self.lock_db()?;
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

    pub async fn add_goal(&self, goal: &Goal) -> Result<()> {
        let entry = KnowledgeEntry {
            id: goal.id.clone(),
            category: "goal".to_string(),
            content: goal.description.clone(),
            metadata: HashMap::from([("priority".to_string(), format!("{:?}", goal.priority))]),
            timestamp: Self::current_timestamp()?,
            importance: match goal.priority {
                Priority::Low => 0.25,
                Priority::Medium => 0.5,
                Priority::High => 0.75,
                Priority::Critical => 1.0,
            },
        };

        self.add_entry(entry).await
    }

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
            timestamp: Self::current_timestamp()?,
            importance: if result.success { 0.7 } else { 0.9 },
        };

        self.add_entry(entry).await
    }

    pub async fn add_entry(&self, entry: KnowledgeEntry) -> Result<()> {
        {
            let conn = self.lock_db()?;
            let metadata_json = serde_json::to_string(&entry.metadata)?;

            conn.execute(
                "INSERT OR REPLACE INTO knowledge (id, category, content, metadata, timestamp, importance)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    entry.id,
                    entry.category,
                    entry.content,
                    metadata_json,
                    entry.timestamp as i64,
                    entry.importance
                ],
            )?;
        }

        self.enforce_memory_limit().await?;

        Ok(())
    }

    pub async fn query(&self, query: &str, limit: usize) -> Result<Vec<KnowledgeEntry>> {
        let conn = self.lock_db()?;
        let mut stmt = conn.prepare(
            "SELECT id, category, content, metadata, timestamp, importance
             FROM knowledge
             WHERE content LIKE ?1 OR category LIKE ?1
             ORDER BY importance DESC, timestamp DESC
             LIMIT ?2",
        )?;

        let search_term = format!("%{}%", query);
        let rows = stmt.query_map(params![search_term, limit as i64], |row| {
            Ok(KnowledgeEntry {
                id: row.get(0)?,
                category: row.get(1)?,
                content: row.get(2)?,
                metadata: serde_json::from_str(row.get::<_, String>(3)?.as_str())
                    .unwrap_or_default(),
                timestamp: row.get::<_, i64>(4)? as u64,
                importance: row.get(5)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    pub async fn get_relevant_knowledge(
        &self,
        goal: &Goal,
        limit: usize,
    ) -> Result<Vec<KnowledgeEntry>> {
        let keywords: Vec<&str> = goal.description.split_whitespace().collect();
        let mut all_results = Vec::new();

        for keyword in keywords {
            if keyword.len() > 3 {
                let results = self.query(keyword, limit).await?;
                all_results.extend(results);
            }
        }

        let category_results = self.query(&format!("goal:{}", goal.id), limit).await?;
        all_results.extend(category_results);

        // AUDIT-P3-010: Handle NaN gracefully in importance comparison
        all_results.sort_by(|a, b| {
            b.importance
                .partial_cmp(&a.importance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        all_results.dedup_by(|a, b| a.id == b.id);

        Ok(all_results.into_iter().take(limit).collect())
    }

    /// MEM-013 fix: Export entries that will be deleted before pruning
    /// Returns list of entries that will be removed for potential backup
    fn get_entries_to_prune(&self, keep_count: i64) -> Result<Vec<KnowledgeEntry>> {
        let conn = self.lock_db()?;
        let mut stmt = conn.prepare(
            "SELECT id, category, content, metadata, timestamp, importance
             FROM knowledge
             WHERE id NOT IN (
                 SELECT id FROM knowledge
                 ORDER BY importance DESC, timestamp DESC
                 LIMIT ?1
             )
             ORDER BY timestamp ASC",
        )?;

        let rows = stmt.query_map(params![keep_count], |row| {
            Ok(KnowledgeEntry {
                id: row.get(0)?,
                category: row.get(1)?,
                content: row.get(2)?,
                metadata: serde_json::from_str(row.get::<_, String>(3)?.as_str())
                    .unwrap_or_default(),
                timestamp: row.get::<_, i64>(4)? as u64,
                importance: row.get(5)?,
            })
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        Ok(entries)
    }

    /// MEM-013 fix: Create backup of entries before pruning
    fn backup_entries(&self, entries: &[KnowledgeEntry]) -> Result<PathBuf> {
        // AUDIT-P3-009: Handle missing parent directory gracefully
        let db_path = Self::get_db_path()?;
        let backup_dir = db_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Database path has no parent directory"))?
            .join("backups");
        std::fs::create_dir_all(&backup_dir)?;

        let timestamp = Self::current_timestamp()?;
        let backup_path = backup_dir.join(format!("knowledge_backup_{}.json", timestamp));

        let backup_data = serde_json::to_string_pretty(entries)?;
        std::fs::write(&backup_path, backup_data)?;

        tracing::info!(
            "[Knowledge] Created backup of {} entries at {:?}",
            entries.len(),
            backup_path
        );

        Ok(backup_path)
    }

    async fn enforce_memory_limit(&self) -> Result<()> {
        let db_path = Self::get_db_path()?;
        let file_size_mb = if let Ok(metadata) = std::fs::metadata(&db_path) {
            metadata.len() / (1024 * 1024)
        } else {
            0
        };

        tracing::debug!(
            "Knowledge base size: {} MB (limit: {} MB)",
            file_size_mb,
            self._memory_limit_mb
        );

        // Only prune if over limit - single lock acquisition to avoid deadlock
        if file_size_mb > self._memory_limit_mb {
            // MEM-013 fix: Warn at higher level so users are aware data is being pruned
            tracing::warn!(
                "[Knowledge] Database size ({}MB) exceeds limit ({}MB), pruning entries. \
                 Consider increasing the memory limit or exporting important data.",
                file_size_mb,
                self._memory_limit_mb
            );

            // Get count first to calculate keep_count
            let count: i64 = {
                let conn = self.lock_db()?;
                conn.query_row("SELECT COUNT(*) FROM knowledge", [], |row| row.get(0))?
            };

            if count > 0 {
                // Calculate how many entries to keep based on size ratio
                let avg_entry_size = (file_size_mb * 1024 * 1024) / count as u64;
                let target_count = (self._memory_limit_mb * 1024 * 1024) / avg_entry_size.max(1);
                let keep_count = ((target_count * 80 / 100) as i64).max(100);
                let prune_count = count - keep_count;

                // MEM-013 fix: Log how many entries will be deleted
                if prune_count > 0 {
                    tracing::warn!(
                        "[Knowledge] Will delete {} entries (keeping top {} by importance). \
                         A backup will be created.",
                        prune_count,
                        keep_count
                    );

                    // MEM-013 fix: Create backup before deletion
                    match self.get_entries_to_prune(keep_count) {
                        Ok(entries_to_delete) => {
                            if !entries_to_delete.is_empty() {
                                if let Err(e) = self.backup_entries(&entries_to_delete) {
                                    tracing::error!(
                                        "[Knowledge] Failed to create backup: {}. \
                                         Proceeding with pruning anyway to prevent database growth.",
                                        e
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!(
                                "[Knowledge] Failed to get entries for backup: {}. \
                                 Proceeding with pruning anyway.",
                                e
                            );
                        }
                    }
                }

                // Single lock scope for delete operations
                let conn = self.lock_db()?;

                tracing::info!(
                    "[Knowledge] Keeping top {} entries (out of {})",
                    keep_count,
                    count
                );

                let deleted = conn.execute(
                    "DELETE FROM knowledge
                     WHERE id NOT IN (
                         SELECT id FROM knowledge
                         ORDER BY importance DESC, timestamp DESC
                         LIMIT ?1
                     )",
                    params![keep_count],
                )?;

                conn.execute("VACUUM", [])?;

                tracing::info!(
                    "[Knowledge] Database pruned successfully. Deleted {} entries.",
                    deleted
                );
            }
        }

        Ok(())
    }
}
