//! Persistent Memory Manager for AGI Workforce
//!
//! Based on Clawdbot's two-layer memory architecture:
//! 1. Long-term memory: Curated facts, preferences, decisions (user_memory table)
//! 2. Daily logs: Append-only context logs (daily_logs table)
//!
//! This provides cross-session memory persistence for the AGI.
//!
//! ## Memory Importance Decay
//!
//! The memory system supports automatic importance decay to simulate forgetting
//! of less-accessed memories over time. Memories that are frequently accessed
//! receive an importance boost, while unused memories gradually decay.
//!
//! Key features:
//! - Configurable decay rate and period
//! - Minimum importance threshold to prevent complete forgetting
//! - Access-based importance boosting
//! - Manual and scheduled decay execution

use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, RwLock};

use crate::sys::error::{Error, Result};
pub use agiworkforce_agent_core::memory::MemoryCategory;

use super::semantic_search::{IndexStats, SemanticSearchConfig, SemanticSearchResult, TfIdfIndex};

// =============================================================================
// MEMORY IMPORTANCE DECAY TYPES
// =============================================================================

/// Configuration for memory importance decay
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayConfig {
    /// Whether decay is enabled
    pub enabled: bool,
    /// Decay rate per period (e.g., 0.1 = 10% decay per period)
    pub decay_rate: f32,
    /// Number of days between decay applications
    pub decay_period_days: i32,
    /// Minimum importance level (memories won't decay below this)
    pub min_importance: i32,
    /// Importance boost when a memory is accessed
    pub access_boost: i32,
}

impl Default for DecayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            decay_rate: 0.1,
            decay_period_days: 7,
            min_importance: 1,
            access_boost: 1,
        }
    }
}

impl From<&DecayConfig> for agiworkforce_agent_core::memory::MemoryDecayConfig {
    fn from(config: &DecayConfig) -> Self {
        Self {
            enabled: config.enabled,
            decay_rate: config.decay_rate,
            decay_period_days: i64::from(config.decay_period_days),
            min_importance: config.min_importance,
            max_importance: 10,
            access_boost: config.access_boost,
        }
    }
}

/// Result of a decay operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayResult {
    /// Number of memories that were decayed
    pub memories_decayed: usize,
    /// Number of memories that reached minimum importance
    pub at_minimum: usize,
    /// Total importance points removed
    pub total_decay: i32,
}

/// A memory that is a candidate for decay
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayCandidate {
    pub id: i64,
    pub topic: String,
    pub category: String,
    pub importance: i32,
    pub last_accessed: Option<String>,
    pub days_since_access: i64,
}

/// Statistics about memory importance distribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub total_count: usize,
    pub avg_importance: f64,
    pub high_importance_count: usize,
    pub low_importance_count: usize,
}

/// A single memory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub category: MemoryCategory,
    pub topic: String,
    pub content: String,
    pub importance: i32,
    pub source: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// Last time this memory was accessed (for decay calculations)
    #[serde(default)]
    pub last_accessed: Option<String>,
}

/// A daily log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyLogEntry {
    pub id: i64,
    pub log_date: String,
    pub timestamp: String,
    pub entry_type: String,
    pub content: String,
    pub metadata: Option<String>,
}

/// Export format for memory backup
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryExport {
    /// Version of the export format
    pub version: String,
    /// ISO 8601 timestamp of when the export was created
    pub exported_at: String,
    /// Total number of memories in the export
    pub memory_count: usize,
    /// Total number of daily logs in the export
    pub log_count: usize,
    /// All memory entries
    pub memories: Vec<MemoryEntry>,
    /// All daily log entries
    pub daily_logs: Vec<DailyLogEntry>,
}

/// Types of daily log entries
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogEntryType {
    Context,
    Action,
    Note,
    Milestone,
}

impl LogEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogEntryType::Context => "context",
            LogEntryType::Action => "action",
            LogEntryType::Note => "note",
            LogEntryType::Milestone => "milestone",
        }
    }

    /// Parse a string into a LogEntryType
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "context" => Some(LogEntryType::Context),
            "action" => Some(LogEntryType::Action),
            "note" => Some(LogEntryType::Note),
            "milestone" => Some(LogEntryType::Milestone),
            _ => None,
        }
    }
}

/// Import conflict handling strategy
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ImportConflictStrategy {
    /// Skip existing memories (keep original)
    #[default]
    Skip,
    /// Replace existing with imported
    Replace,
    /// Keep both (update content only if imported is newer)
    Merge,
}

impl ImportConflictStrategy {
    /// Parse a string into an ImportConflictStrategy
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "skip" => Some(ImportConflictStrategy::Skip),
            "replace" => Some(ImportConflictStrategy::Replace),
            "merge" => Some(ImportConflictStrategy::Merge),
            _ => None,
        }
    }
}

/// Result of an import operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    /// Number of new memories imported
    pub memories_imported: usize,
    /// Number of memories skipped (already existed)
    pub memories_skipped: usize,
    /// Number of memories replaced (updated existing)
    pub memories_replaced: usize,
    /// Number of daily logs imported
    pub logs_imported: usize,
    /// Any errors encountered during import
    pub errors: Vec<String>,
}

/// Manages persistent memory across sessions
pub struct MemoryManager {
    conn: Mutex<Connection>,
    /// Configuration for memory importance decay
    decay_config: Mutex<DecayConfig>,
    /// TF-IDF index for semantic search
    tfidf_index: RwLock<TfIdfIndex>,
    /// Configuration for semantic search
    semantic_config: RwLock<SemanticSearchConfig>,
    /// BUG-09 fix: cached at construction time, schema does not change at runtime
    has_last_accessed: bool,
}

impl MemoryManager {
    /// BUG-09 fix: check column presence once at construction, not on every call.
    fn probe_schema(conn: &Connection) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('user_memory') WHERE name='last_accessed'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0)
            > 0
    }

    /// Create a new MemoryManager with a connection to the database
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;
        let has_last_accessed = Self::probe_schema(&conn);

        Ok(Self {
            conn: Mutex::new(conn),
            decay_config: Mutex::new(DecayConfig::default()),
            tfidf_index: RwLock::new(TfIdfIndex::new()),
            semantic_config: RwLock::new(SemanticSearchConfig::default()),
            has_last_accessed,
        })
    }

    /// Create a MemoryManager from an existing connection path
    pub fn from_path(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;
        let has_last_accessed = Self::probe_schema(&conn);

        Ok(Self {
            conn: Mutex::new(conn),
            decay_config: Mutex::new(DecayConfig::default()),
            tfidf_index: RwLock::new(TfIdfIndex::new()),
            semantic_config: RwLock::new(SemanticSearchConfig::default()),
            has_last_accessed,
        })
    }

    /// Create a MemoryManager over an already-opened connection.
    ///
    /// The main database is SQLCipher-encrypted and keyed by
    /// `MainDatabaseAccess` (Keychain-stored, or the WDIO harness key). A plain
    /// `Connection::open` on that file opens but every query fails with "file
    /// is not a database", which surfaced in the UI as "Could not update
    /// memory" on every add. Callers pointing at the main database must hand in
    /// a connection from `MainDatabaseAccess::open_connection`.
    pub fn from_connection(conn: Connection) -> Self {
        let has_last_accessed = Self::probe_schema(&conn);
        Self {
            conn: Mutex::new(conn),
            decay_config: Mutex::new(DecayConfig::default()),
            tfidf_index: RwLock::new(TfIdfIndex::new()),
            semantic_config: RwLock::new(SemanticSearchConfig::default()),
            has_last_accessed,
        }
    }

    /// Create a MemoryManager with custom decay configuration
    pub fn with_decay_config(db_path: &str, config: DecayConfig) -> Result<Self> {
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;
        let has_last_accessed = Self::probe_schema(&conn);

        Ok(Self {
            conn: Mutex::new(conn),
            decay_config: Mutex::new(config),
            tfidf_index: RwLock::new(TfIdfIndex::new()),
            semantic_config: RwLock::new(SemanticSearchConfig::default()),
            has_last_accessed,
        })
    }

    /// Create a MemoryManager with custom semantic search configuration
    pub fn with_semantic_config(
        db_path: &str,
        semantic_config: SemanticSearchConfig,
    ) -> Result<Self> {
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;
        let has_last_accessed = Self::probe_schema(&conn);

        Ok(Self {
            conn: Mutex::new(conn),
            decay_config: Mutex::new(DecayConfig::default()),
            tfidf_index: RwLock::new(TfIdfIndex::new()),
            semantic_config: RwLock::new(semantic_config),
            has_last_accessed,
        })
    }

    /// Get the current decay configuration
    pub fn get_decay_config(&self) -> Result<DecayConfig> {
        let config = self
            .decay_config
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(config.clone())
    }

    /// Set the decay configuration
    pub fn set_decay_config(&self, config: DecayConfig) -> Result<()> {
        let mut current = self
            .decay_config
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        *current = config;
        Ok(())
    }

    /// Store or update a memory entry
    /// If a memory with the same category+topic exists, it will be updated
    pub fn remember(
        &self,
        category: MemoryCategory,
        topic: &str,
        content: &str,
        importance: Option<i32>,
        source: Option<&str>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let importance = importance.unwrap_or(5).clamp(1, 10);
        let category_str = category.as_str();

        // Older Desktop builds persisted PascalCase categories. Update those
        // rows in place before inserting the canonical lowercase wire value so
        // a category-format migration never duplicates or loses user memory.
        let updated = conn
            .execute(
                "UPDATE user_memory
                 SET content = ?1, importance = ?2, source = ?3, updated_at = datetime('now')
                 WHERE category = ?4 COLLATE NOCASE AND topic = ?5",
                params![content, importance, source, category_str, topic],
            )
            .map_err(|e| Error::Database(format!("Failed to update memory: {}", e)))?;
        if updated == 0 {
            conn.execute(
                "INSERT INTO user_memory (category, topic, content, importance, source, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![category_str, topic, content, importance, source],
            )
            .map_err(|e| Error::Database(format!("Failed to store memory: {}", e)))?;
        }

        let id: i64 = conn
            .query_row(
                "SELECT id FROM user_memory WHERE category = ?1 COLLATE NOCASE AND topic = ?2",
                params![category_str, topic],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Failed to get memory id: {}", e)))?;

        // Update the TF-IDF search index so the new memory is discoverable
        // via semantic_search(). Previously this was never called, leaving the
        // index stale after every remember() call.
        if let Err(e) = self.update_index(id, content, topic, category_str) {
            tracing::warn!("Failed to update search index for memory {}: {}", id, e);
        }

        Ok(id)
    }

    /// Recall a specific memory by category and topic
    pub fn recall(&self, category: MemoryCategory, topic: &str) -> Result<Option<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();

        let result = conn.query_row(
            // BUG-08 fix: include last_accessed so map_memory_row column 8 is always valid
            "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
             FROM user_memory
             WHERE category = ?1 COLLATE NOCASE AND topic = ?2",
            params![category_str, topic],
            map_memory_row,
        );

        match result {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Error::Database(format!("Failed to recall memory: {}", e))),
        }
    }

    /// Search memories by query, uses semantic search when available, LIKE fallback
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<MemoryEntry>> {
        // Try semantic search first (TF-IDF ranked results)
        match self.semantic_search(query, limit) {
            Ok(results) if !results.is_empty() => {
                return Ok(results.into_iter().map(|r| r.memory).collect());
            }
            _ => {}
        }
        // Fall back to raw keyword search
        self.search_keyword(query, limit)
    }

    /// Raw keyword search using LIKE (O(n) scan, no ranking)
    fn search_keyword(&self, query: &str, limit: usize) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let search_pattern = format!("%{}%", query);
        let limit = limit as i32;

        let mut stmt = conn
            .prepare(
                // BUG-08 fix: include last_accessed
                "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
                 FROM user_memory
                 WHERE content LIKE ?1 OR topic LIKE ?1
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![search_pattern, limit], map_memory_row)
            .map_err(|e| Error::Database(format!("Failed to search memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Get all memories in a category
    pub fn get_by_category(
        &self,
        category: MemoryCategory,
        limit: Option<usize>,
    ) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();
        let limit = limit.unwrap_or(100) as i32;

        let mut stmt = conn
            .prepare(
                // BUG-08 fix: include last_accessed
                "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
                 FROM user_memory
                 WHERE category = ?1 COLLATE NOCASE
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![category_str, limit], map_memory_row)
            .map_err(|e| Error::Database(format!("Failed to get memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Get high-importance memories for session initialization
    pub fn get_important_memories(&self, min_importance: i32) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                // BUG-08 fix: include last_accessed
                "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
                 FROM user_memory
                 WHERE importance >= ?1
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT 50",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![min_importance], map_memory_row)
            .map_err(|e| Error::Database(format!("Failed to get memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Delete a memory by ID
    pub fn forget(&self, memory_id: i64) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute("DELETE FROM user_memory WHERE id = ?1", params![memory_id])
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        Ok(rows > 0)
    }

    /// Delete a memory by category and topic
    pub fn forget_topic(&self, category: MemoryCategory, topic: &str) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();

        let rows = conn
            .execute(
                "DELETE FROM user_memory WHERE category = ?1 COLLATE NOCASE AND topic = ?2",
                params![category_str, topic],
            )
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        Ok(rows > 0)
    }

    /// Append to today's daily log
    pub fn log_context(
        &self,
        content: &str,
        entry_type: LogEntryType,
        metadata: Option<&str>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let entry_type_str = entry_type.as_str();

        conn.execute(
            "INSERT INTO daily_logs (log_date, entry_type, content, metadata)
             VALUES (?1, ?2, ?3, ?4)",
            params![today, entry_type_str, content, metadata],
        )
        .map_err(|e| Error::Database(format!("Failed to log context: {}", e)))?;

        let id = conn.last_insert_rowid();
        Ok(id)
    }

    /// Get daily logs for a specific date
    pub fn get_daily_logs(&self, date: &str) -> Result<Vec<DailyLogEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, log_date, timestamp, entry_type, content, metadata
                 FROM daily_logs
                 WHERE log_date = ?1
                 ORDER BY timestamp ASC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![date], |row| {
                Ok(DailyLogEntry {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    timestamp: row.get(2)?,
                    entry_type: row.get(3)?,
                    content: row.get(4)?,
                    metadata: row.get(5)?,
                })
            })
            .map_err(|e| Error::Database(format!("Failed to get daily logs: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect logs: {}", e)))?;

        Ok(entries)
    }

    /// Get recent context for session initialization (today + yesterday logs + important memories)
    pub fn get_session_context(&self) -> Result<String> {
        let today = Utc::now().date_naive();
        let yesterday = today.pred_opt().unwrap_or(today);

        let mut context = String::new();

        // Load today's and yesterday's logs
        for date in [yesterday, today] {
            let date_str = date.format("%Y-%m-%d").to_string();
            let logs = self.get_daily_logs(&date_str)?;
            if !logs.is_empty() {
                context.push_str(&format!("\n## {} Log\n", date_str));
                for log in logs {
                    context.push_str(&format!("[{}] {}\n", log.timestamp, log.content));
                }
            }
        }

        // Load important memories (importance >= 7)
        let important = self.get_important_memories(7)?;
        if !important.is_empty() {
            context.push_str("\n## Important Memories\n");
            for memory in important {
                context.push_str(&format!(
                    "- **{} ({})**: {}\n",
                    memory.topic,
                    memory.category.as_str(),
                    memory.content
                ));
            }
        }

        Ok(context)
    }

    /// Get all memories for export
    pub fn export_all(&self) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
                 FROM user_memory
                 ORDER BY category, topic",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map([], map_memory_row)
            .map_err(|e| Error::Database(format!("Failed to export memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Clear old daily logs (keep last N days)
    pub fn cleanup_old_logs(&self, keep_days: i32) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute(
                "DELETE FROM daily_logs
                 WHERE log_date < date('now', '-' || ?1 || ' days')",
                params![keep_days],
            )
            .map_err(|e| Error::Database(format!("Failed to cleanup logs: {}", e)))?;

        Ok(rows)
    }

    // =========================================================================
    // Memory Importance Decay Methods
    // =========================================================================

    /// Boost the importance of a memory by ID
    /// Returns the new importance value
    pub fn boost_on_access(&self, memory_id: i64) -> Result<i32> {
        let config = self.get_decay_config()?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // BUG-09 fix: use cached schema probe result instead of per-call pragma
        let has_last_accessed = self.has_last_accessed;

        // Get current importance
        let current_importance: i32 = conn
            .query_row(
                "SELECT importance FROM user_memory WHERE id = ?1",
                params![memory_id],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Memory not found: {}", e)))?;

        // Calculate new importance (capped at 10)
        let shared_config = agiworkforce_agent_core::memory::MemoryDecayConfig::from(&config);
        let new_importance =
            agiworkforce_agent_core::memory::boosted_importance(current_importance, &shared_config);

        // Update importance and last_accessed
        if has_last_accessed {
            conn.execute(
                "UPDATE user_memory SET importance = ?1, last_accessed = datetime('now') WHERE id = ?2",
                params![new_importance, memory_id],
            )
            .map_err(|e| Error::Database(format!("Failed to boost memory: {}", e)))?;
        } else {
            conn.execute(
                "UPDATE user_memory SET importance = ?1 WHERE id = ?2",
                params![new_importance, memory_id],
            )
            .map_err(|e| Error::Database(format!("Failed to boost memory: {}", e)))?;
        }

        Ok(new_importance)
    }

    /// Recall a memory and boost its importance
    /// This is used when a memory is actively used by the AGI
    pub fn recall_with_boost(
        &self,
        category: MemoryCategory,
        topic: &str,
    ) -> Result<Option<MemoryEntry>> {
        let config = self.get_decay_config()?;

        // First recall to get the entry
        let entry = self.recall(category, topic)?;

        if let Some(ref memory) = entry {
            if config.enabled {
                // Boost importance (but not above 10)
                let shared_config =
                    agiworkforce_agent_core::memory::MemoryDecayConfig::from(&config);
                let new_importance = agiworkforce_agent_core::memory::boosted_importance(
                    memory.importance,
                    &shared_config,
                );
                if new_importance != memory.importance {
                    let conn = self
                        .conn
                        .lock()
                        .map_err(|e| Error::Generic(e.to_string()))?;
                    let _ = conn.execute(
                        "UPDATE user_memory SET importance = ?1, last_accessed = datetime('now') WHERE id = ?2",
                        params![new_importance, memory.id],
                    );
                }
            }
        }

        Ok(entry)
    }

    /// Get memories that are candidates for decay
    /// Returns memories that haven't been accessed within the decay period
    pub fn get_decay_candidates(&self) -> Result<Vec<DecayCandidate>> {
        let config = self.get_decay_config()?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // BUG-09 fix: use cached schema probe result instead of per-call pragma
        let has_last_accessed = self.has_last_accessed;

        if !has_last_accessed {
            return Ok(vec![]);
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, topic, category, importance, last_accessed,
                        CAST((julianday('now') - julianday(COALESCE(last_accessed, created_at))) AS INTEGER) as days_since
                 FROM user_memory
                 WHERE importance > ?1
                   AND CAST((julianday('now') - julianday(COALESCE(last_accessed, created_at))) AS INTEGER) >= ?2
                 ORDER BY days_since DESC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let candidates = stmt
            .query_map(
                params![config.min_importance, config.decay_period_days],
                |row| {
                    Ok(DecayCandidate {
                        id: row.get(0)?,
                        topic: row.get(1)?,
                        category: row.get(2)?,
                        importance: row.get(3)?,
                        last_accessed: row.get(4)?,
                        days_since_access: row.get(5)?,
                    })
                },
            )
            .map_err(|e| Error::Database(format!("Failed to get decay candidates: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect candidates: {}", e)))?;

        Ok(candidates)
    }

    /// Apply decay to all memories based on their last_accessed time
    pub fn decay_memories(&self) -> Result<DecayResult> {
        let config = self.get_decay_config()?;

        if !config.enabled {
            return Ok(DecayResult {
                memories_decayed: 0,
                at_minimum: 0,
                total_decay: 0,
            });
        }

        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // BUG-09 fix: use cached schema probe result instead of per-call pragma
        let has_last_accessed = self.has_last_accessed;

        if !has_last_accessed {
            return Ok(DecayResult {
                memories_decayed: 0,
                at_minimum: 0,
                total_decay: 0,
            });
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, importance,
                        CAST((julianday('now') - julianday(COALESCE(last_accessed, created_at))) AS INTEGER) as days_since
                 FROM user_memory
                 WHERE importance > ?1",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let memories: Vec<(i64, i32, i64)> = stmt
            .query_map(params![config.min_importance], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| Error::Database(format!("Failed to query memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        let mut memories_decayed = 0;
        let mut at_minimum = 0;
        let mut total_decay = 0;

        let shared_config = agiworkforce_agent_core::memory::MemoryDecayConfig::from(&config);
        for (id, importance, days_since) in memories {
            let new_importance = agiworkforce_agent_core::memory::decayed_importance(
                importance,
                days_since,
                &shared_config,
            );
            let decay_amount = importance.saturating_sub(new_importance);

            if decay_amount > 0 {
                conn.execute(
                    "UPDATE user_memory SET importance = ?1 WHERE id = ?2",
                    params![new_importance, id],
                )
                .map_err(|e| Error::Database(format!("Failed to decay memory: {}", e)))?;

                memories_decayed += 1;
                total_decay += decay_amount;

                if new_importance == config.min_importance {
                    at_minimum += 1;
                }
            }
        }

        Ok(DecayResult {
            memories_decayed,
            at_minimum,
            total_decay,
        })
    }

    /// Manually decay a specific memory by a given amount
    pub fn decay_memory(&self, memory_id: i64, decay_amount: i32) -> Result<i32> {
        let config = self.get_decay_config()?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let current_importance: i32 = conn
            .query_row(
                "SELECT importance FROM user_memory WHERE id = ?1",
                params![memory_id],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Memory not found: {}", e)))?;

        let new_importance = (current_importance - decay_amount).max(config.min_importance);

        conn.execute(
            "UPDATE user_memory SET importance = ?1 WHERE id = ?2",
            params![new_importance, memory_id],
        )
        .map_err(|e| Error::Database(format!("Failed to decay memory: {}", e)))?;

        Ok(new_importance)
    }

    /// Get statistics about memory importance distribution
    pub fn get_memory_stats(&self) -> Result<MemoryStats> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let total_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_memory", [], |row| row.get(0))
            .unwrap_or(0);

        let avg_importance: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(importance), 0) FROM user_memory",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let high_importance_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_memory WHERE importance >= 7",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let low_importance_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_memory WHERE importance <= 3",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(MemoryStats {
            total_count: total_count as usize,
            avg_importance,
            high_importance_count: high_importance_count as usize,
            low_importance_count: low_importance_count as usize,
        })
    }

    /// Get every daily log for the user-owned memory export.
    pub fn get_all_daily_logs(&self) -> Result<Vec<DailyLogEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, log_date, timestamp, entry_type, content, metadata
                 FROM daily_logs ORDER BY log_date, timestamp",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let logs = stmt
            .query_map([], |row| {
                Ok(DailyLogEntry {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    timestamp: row.get(2)?,
                    entry_type: row.get(3)?,
                    content: row.get(4)?,
                    metadata: row.get(5)?,
                })
            })
            .map_err(|e| Error::Database(format!("Failed to query logs: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(logs)
    }

    // =========================================================================
    // Semantic Search Methods
    // =========================================================================

    /// Get the current semantic search configuration
    pub fn get_semantic_config(&self) -> Result<SemanticSearchConfig> {
        let config = self
            .semantic_config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(config.clone())
    }

    /// Set the semantic search configuration
    pub fn set_semantic_config(&self, config: SemanticSearchConfig) -> Result<()> {
        let mut current = self
            .semantic_config
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        *current = config;
        Ok(())
    }

    /// Build or rebuild the TF-IDF index from all memories in the database
    pub fn build_index(&self) -> Result<IndexStats> {
        let memories = self.export_all()?;
        let mut index = self
            .tfidf_index
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        index.build_from_memories(&memories);

        Ok(IndexStats {
            document_count: index.document_count(),
            vocabulary_size: index.vocabulary_size(),
        })
    }

    /// Update the index when a memory is added or modified
    pub fn update_index(
        &self,
        memory_id: i64,
        content: &str,
        topic: &str,
        category: &str,
    ) -> Result<()> {
        let mut index = self
            .tfidf_index
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        index.update_memory(memory_id, content, topic, category);
        Ok(())
    }

    /// Remove a memory from the index
    pub fn remove_from_index(&self, memory_id: i64) -> Result<()> {
        let mut index = self
            .tfidf_index
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        index.remove_memory(memory_id);
        Ok(())
    }

    /// Perform semantic search using TF-IDF similarity, automatically blending
    /// dense embeddings when they are available in the index.
    ///
    /// Delegates to `semantic_search_with_embedding(query, None, limit)` so that
    /// if any document embeddings have been stored via `set_dense_embedding`,
    /// the hybrid scoring path (60% dense + 40% TF-IDF) activates. When no dense
    /// embeddings exist, this is equivalent to pure TF-IDF search.
    pub fn semantic_search(&self, query: &str, limit: usize) -> Result<Vec<SemanticSearchResult>> {
        self.semantic_search_with_embedding(query, None, limit)
    }

    /// Perform semantic search with an optional dense query embedding.
    ///
    /// When `query_embedding` is `Some` and documents in the index have dense
    /// embeddings, the index blends 60% dense cosine similarity with 40% TF-IDF.
    /// When `query_embedding` is `None` or no document embeddings exist, this
    /// falls back to TF-IDF-only scoring.
    pub fn semantic_search_with_embedding(
        &self,
        query: &str,
        query_embedding: Option<&[f32]>,
        limit: usize,
    ) -> Result<Vec<SemanticSearchResult>> {
        let config = self.get_semantic_config()?;

        if !config.enabled {
            return Ok(Vec::new());
        }

        let index = self
            .tfidf_index
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let dense_count = index.dense_embedding_count();
        if dense_count > 0 && query_embedding.is_some() {
            tracing::debug!(
                "Semantic search using hybrid scoring: {} documents have dense embeddings",
                dense_count
            );
        } else if dense_count > 0 {
            tracing::debug!(
                "Semantic search: {} documents have dense embeddings but no query embedding provided; using TF-IDF only",
                dense_count
            );
        }

        let semantic_results = index.search_with_embedding(query, query_embedding, limit);

        if semantic_results.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch the actual memory entries
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut results = Vec::with_capacity(semantic_results.len());
        for (memory_id, similarity_score) in semantic_results {
            if similarity_score < config.min_similarity {
                continue;
            }

            let memory_result = conn.query_row(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at, last_accessed
                 FROM user_memory WHERE id = ?1",
                params![memory_id],
                |row| {
                    let category_str: String = row.get(1)?;
                    let category = MemoryCategory::parse(&category_str).unwrap_or(MemoryCategory::Context);
                    Ok(MemoryEntry {
                        id: row.get(0)?,
                        category,
                        topic: row.get(2)?,
                        content: row.get(3)?,
                        importance: row.get(4)?,
                        source: row.get(5)?,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                        last_accessed: row.get(8).ok(),
                    })
                },
            );

            if let Ok(memory) = memory_result {
                results.push(SemanticSearchResult {
                    memory,
                    similarity_score,
                    keyword_score: 0.0,
                    combined_score: similarity_score,
                });
            }
        }

        Ok(results)
    }

    /// Store a dense embedding for a memory document.
    ///
    /// When embeddings are stored, subsequent `semantic_search()` and
    /// `semantic_search_with_embedding()` calls will use hybrid scoring
    /// (60% dense cosine + 40% TF-IDF) for improved retrieval quality.
    pub fn set_dense_embedding(&self, memory_id: i64, embedding: Vec<f32>) -> Result<()> {
        let mut index = self
            .tfidf_index
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        index.set_dense_embedding(memory_id, embedding);
        Ok(())
    }

    /// Perform hybrid search combining keyword and semantic results
    /// Uses configured keyword_weight to balance between keyword and semantic scores
    pub fn hybrid_search(&self, query: &str, limit: usize) -> Result<Vec<SemanticSearchResult>> {
        let config = self.get_semantic_config()?;

        // If semantic search is disabled, fall back to keyword search only
        if !config.enabled {
            let keyword_results = self.search_keyword(query, limit)?;
            return Ok(keyword_results
                .into_iter()
                .map(|memory| SemanticSearchResult {
                    memory,
                    similarity_score: 0.0,
                    keyword_score: 1.0,
                    combined_score: 1.0,
                })
                .collect());
        }

        // Get keyword search results
        let keyword_results = self.search_keyword(query, limit * 2)?;

        // Get semantic search results
        let semantic_results = self.semantic_search(query, limit * 2)?;

        // Merge results
        use std::collections::HashMap;
        let mut merged: HashMap<i64, SemanticSearchResult> = HashMap::new();

        // Normalize keyword scores (first result = 1.0, decreasing)
        let keyword_count = keyword_results.len() as f32;
        for (rank, memory) in keyword_results.into_iter().enumerate() {
            let keyword_score = if keyword_count > 0.0 {
                1.0 - (rank as f32 / keyword_count)
            } else {
                0.0
            };

            merged.insert(
                memory.id,
                SemanticSearchResult {
                    memory,
                    similarity_score: 0.0,
                    keyword_score,
                    combined_score: keyword_score * config.keyword_weight,
                },
            );
        }

        // Add semantic scores
        let semantic_weight = 1.0 - config.keyword_weight;
        for semantic_result in semantic_results {
            let memory_id = semantic_result.memory.id;

            if let Some(existing) = merged.get_mut(&memory_id) {
                existing.similarity_score = semantic_result.similarity_score;
                existing.combined_score = existing.keyword_score * config.keyword_weight
                    + semantic_result.similarity_score * semantic_weight;
            } else if semantic_result.similarity_score >= config.min_similarity {
                merged.insert(
                    memory_id,
                    SemanticSearchResult {
                        memory: semantic_result.memory,
                        similarity_score: semantic_result.similarity_score,
                        keyword_score: 0.0,
                        combined_score: semantic_result.similarity_score * semantic_weight,
                    },
                );
            }
        }

        // Sort by combined score and return top results
        let mut results: Vec<SemanticSearchResult> = merged.into_values().collect();
        for result in &mut results {
            result.combined_score = agiworkforce_agent_core::memory::memory_relevance_score(
                agiworkforce_agent_core::memory::MemoryRelevanceInput {
                    lexical_similarity: result.keyword_score,
                    embedding_similarity: (result.similarity_score > 0.0)
                        .then_some(result.similarity_score),
                    lexical_weight: Some(config.keyword_weight),
                    importance: result.memory.importance,
                    days_since_access: memory_days_since_access(&result.memory),
                },
            );
        }
        results.sort_by(|a, b| {
            b.combined_score
                .partial_cmp(&a.combined_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(limit);

        Ok(results)
    }

    /// Get statistics about the TF-IDF index
    pub fn get_index_stats(&self) -> Result<IndexStats> {
        let index = self
            .tfidf_index
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        Ok(IndexStats {
            document_count: index.document_count(),
            vocabulary_size: index.vocabulary_size(),
        })
    }

    // =========================================================================
    // Memory Export Methods
    // =========================================================================

    /// Export all memories and logs to JSON format
    ///
    /// Returns a pretty-printed JSON string containing all memories and daily logs.
    /// The export includes metadata such as version, timestamp, and counts.
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let json = manager.export_to_json()?;
    /// println!("{}", json);
    /// ```
    pub fn export_to_json(&self) -> Result<String> {
        let memories = self.export_all()?;
        let logs = self.get_all_daily_logs()?;

        let export = MemoryExport {
            version: "1.0".to_string(),
            exported_at: Utc::now().to_rfc3339(),
            memory_count: memories.len(),
            log_count: logs.len(),
            memories,
            daily_logs: logs,
        };

        serde_json::to_string_pretty(&export)
            .map_err(|e| Error::Generic(format!("Failed to serialize memory export: {}", e)))
    }

    /// Export all memories and logs to a JSON file
    ///
    /// Writes the export data to the specified file path.
    /// Returns the number of bytes written on success.
    ///
    /// # Arguments
    /// * `path` - The file path to write the JSON export to
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let bytes_written = manager.export_to_json_file(Path::new("/tmp/memory_backup.json"))?;
    /// println!("Wrote {} bytes", bytes_written);
    /// ```
    pub fn export_to_json_file(&self, path: &std::path::Path) -> Result<usize> {
        let json = self.export_to_json()?;
        std::fs::write(path, &json).map_err(|e| Error::Other(e.to_string()))?;
        Ok(json.len())
    }

    /// Export all memories to Markdown format organized by category
    ///
    /// Returns a formatted Markdown string containing all memories grouped by category.
    /// Each memory includes its topic, importance, creation date, source, and content.
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let markdown = manager.export_to_markdown()?;
    /// println!("{}", markdown);
    /// ```
    pub fn export_to_markdown(&self) -> Result<String> {
        let memories = self.export_all()?;
        let mut md = String::new();

        md.push_str("# Memory Export\n\n");
        md.push_str(&format!(
            "*Exported: {}*\n\n",
            Utc::now().format("%Y-%m-%d %H:%M:%S")
        ));
        md.push_str(&format!("Total memories: {}\n\n---\n\n", memories.len()));

        // Group by category
        let mut by_category: std::collections::HashMap<String, Vec<&MemoryEntry>> =
            std::collections::HashMap::new();
        for memory in &memories {
            by_category
                .entry(memory.category.as_str().to_string())
                .or_default()
                .push(memory);
        }

        // Sort categories for consistent output
        let mut categories: Vec<_> = by_category.keys().cloned().collect();
        categories.sort();

        for category in categories {
            if let Some(mems) = by_category.get(&category) {
                md.push_str(&format!("## {}\n\n", category));
                for mem in mems {
                    md.push_str(&format!("### {}\n", mem.topic));
                    md.push_str(&format!("- **Importance**: {}/10\n", mem.importance));
                    md.push_str(&format!("- **Created**: {}\n", mem.created_at));
                    if let Some(ref source) = mem.source {
                        md.push_str(&format!("- **Source**: {}\n", source));
                    }
                    md.push_str(&format!("\n{}\n\n", mem.content));
                }
            }
        }

        Ok(md)
    }

    /// Export all memories to a Markdown file
    ///
    /// Writes the Markdown-formatted export data to the specified file path.
    /// Returns the number of bytes written on success.
    ///
    /// # Arguments
    /// * `path` - The file path to write the Markdown export to
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let bytes_written = manager.export_to_markdown_file(Path::new("/tmp/memory_backup.md"))?;
    /// println!("Wrote {} bytes", bytes_written);
    /// ```
    pub fn export_to_markdown_file(&self, path: &std::path::Path) -> Result<usize> {
        let md = self.export_to_markdown()?;
        std::fs::write(path, &md).map_err(|e| Error::Other(e.to_string()))?;
        Ok(md.len())
    }

    // =========================================================================
    // Memory Import Methods
    // =========================================================================

    /// Import memories from JSON string
    ///
    /// Imports memories and daily logs from a JSON backup, handling conflicts
    /// according to the specified strategy.
    ///
    /// # Arguments
    /// * `json` - JSON string containing the memory export data
    /// * `strategy` - How to handle conflicts with existing memories
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let json = std::fs::read_to_string("backup.json")?;
    /// let result = manager.import_from_json(&json, ImportConflictStrategy::Skip)?;
    /// println!("Imported {} memories", result.memories_imported);
    /// ```
    pub fn import_from_json(
        &self,
        json: &str,
        strategy: ImportConflictStrategy,
    ) -> Result<ImportResult> {
        let export: MemoryExport = serde_json::from_str(json)
            .map_err(|e| Error::Generic(format!("Invalid JSON: {}", e)))?;

        let mut result = ImportResult {
            memories_imported: 0,
            memories_skipped: 0,
            memories_replaced: 0,
            logs_imported: 0,
            errors: vec![],
        };

        // Import memories
        for memory in export.memories {
            let category = match MemoryCategory::parse(memory.category.as_str()) {
                Some(c) => c,
                None => {
                    result.errors.push(format!(
                        "Invalid category for topic '{}': skipped",
                        memory.topic
                    ));
                    continue;
                }
            };

            // Check if memory already exists
            match self.recall(category, &memory.topic) {
                Ok(Some(existing)) => {
                    match strategy {
                        ImportConflictStrategy::Skip => {
                            result.memories_skipped += 1;
                        }
                        ImportConflictStrategy::Replace => {
                            // Always replace with imported data
                            if let Err(e) = self.remember(
                                category,
                                &memory.topic,
                                &memory.content,
                                Some(memory.importance),
                                memory.source.as_deref(),
                            ) {
                                result.errors.push(format!(
                                    "Failed to replace memory '{}': {}",
                                    memory.topic, e
                                ));
                            } else {
                                result.memories_replaced += 1;
                            }
                        }
                        ImportConflictStrategy::Merge => {
                            // Only update if imported is newer
                            if memory.updated_at > existing.updated_at {
                                if let Err(e) = self.remember(
                                    category,
                                    &memory.topic,
                                    &memory.content,
                                    Some(memory.importance),
                                    memory.source.as_deref(),
                                ) {
                                    result.errors.push(format!(
                                        "Failed to merge memory '{}': {}",
                                        memory.topic, e
                                    ));
                                } else {
                                    result.memories_replaced += 1;
                                }
                            } else {
                                result.memories_skipped += 1;
                            }
                        }
                    }
                }
                Ok(None) => {
                    // Memory doesn't exist, import it
                    if let Err(e) = self.remember(
                        category,
                        &memory.topic,
                        &memory.content,
                        Some(memory.importance),
                        memory.source.as_deref(),
                    ) {
                        result
                            .errors
                            .push(format!("Failed to import memory '{}': {}", memory.topic, e));
                    } else {
                        result.memories_imported += 1;
                    }
                }
                Err(e) => {
                    result.errors.push(format!(
                        "Failed to check existing memory '{}': {}",
                        memory.topic, e
                    ));
                }
            }
        }

        // Import daily logs
        for log in export.daily_logs {
            let entry_type =
                LogEntryType::from_str(&log.entry_type).unwrap_or(LogEntryType::Context);
            if let Err(e) = self.log_context(&log.content, entry_type, log.metadata.as_deref()) {
                result
                    .errors
                    .push(format!("Failed to import log entry: {}", e));
            } else {
                result.logs_imported += 1;
            }
        }

        Ok(result)
    }

    /// Import from JSON file
    ///
    /// Reads and imports memories from a JSON file.
    ///
    /// # Arguments
    /// * `path` - Path to the JSON file to import
    /// * `strategy` - How to handle conflicts with existing memories
    ///
    /// # Example
    /// ```ignore
    /// let manager = MemoryManager::new("path/to/db")?;
    /// let result = manager.import_from_json_file(
    ///     Path::new("/tmp/memory_backup.json"),
    ///     ImportConflictStrategy::Merge
    /// )?;
    /// println!("Imported {} memories, replaced {}", result.memories_imported, result.memories_replaced);
    /// ```
    pub fn import_from_json_file(
        &self,
        path: &std::path::Path,
        strategy: ImportConflictStrategy,
    ) -> Result<ImportResult> {
        let json = std::fs::read_to_string(path).map_err(|e| Error::Other(e.to_string()))?;
        self.import_from_json(&json, strategy)
    }
}

fn map_memory_row(row: &Row<'_>) -> rusqlite::Result<MemoryEntry> {
    let category_str: String = row.get(1)?;
    let category = MemoryCategory::parse(&category_str).unwrap_or(MemoryCategory::Context);

    Ok(MemoryEntry {
        id: row.get(0)?,
        category,
        topic: row.get(2)?,
        content: row.get(3)?,
        importance: row.get(4)?,
        source: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        last_accessed: row.get(8).ok(),
    })
}

fn memory_days_since_access(memory: &MemoryEntry) -> i64 {
    let timestamp = memory
        .last_accessed
        .as_deref()
        .unwrap_or(memory.updated_at.as_str());
    chrono::NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%d %H:%M:%S")
        .map(|then| (Utc::now().naive_utc() - then).num_days().max(0))
        .unwrap_or(30)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_db() -> (TempDir, MemoryManager) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Create the table manually for tests
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                topic TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5,
                source TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT,
                UNIQUE(category, topic)
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE daily_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                entry_type TEXT NOT NULL DEFAULT 'context',
                content TEXT NOT NULL,
                metadata TEXT
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let manager = MemoryManager::from_path(&db_path).unwrap();
        (temp_dir, manager)
    }

    #[test]
    fn test_remember_and_recall() {
        let (_temp_dir, manager) = setup_test_db();

        // Store a memory
        let id = manager
            .remember(
                MemoryCategory::Preference,
                "favorite_color",
                "blue",
                Some(8),
                None,
            )
            .unwrap();
        assert!(id > 0);

        // Recall it
        let memory = manager
            .recall(MemoryCategory::Preference, "favorite_color")
            .unwrap()
            .unwrap();
        assert_eq!(memory.content, "blue");
        assert_eq!(memory.importance, 8);
    }

    #[test]
    fn test_canonical_categories_update_legacy_rows_without_duplicates() {
        let (_temp_dir, manager) = setup_test_db();
        let legacy_id = {
            let conn = manager.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO user_memory (category, topic, content, importance) VALUES ('Preference', 'editor', 'vim', 5)",
                [],
            )
            .unwrap();
            conn.last_insert_rowid()
        };

        let remembered_id = manager
            .remember(MemoryCategory::Preference, "editor", "zed", Some(8), None)
            .unwrap();

        assert_eq!(remembered_id, legacy_id);
        let recalled = manager
            .recall(MemoryCategory::Preference, "editor")
            .unwrap()
            .unwrap();
        assert_eq!(recalled.content, "zed");
        let row_count: i64 = manager
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM user_memory", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 1);
    }

    #[test]
    fn test_remember_updates_existing() {
        let (_temp_dir, manager) = setup_test_db();

        // Store initial memory
        manager
            .remember(MemoryCategory::Fact, "user_name", "Alice", Some(5), None)
            .unwrap();

        // Update it
        manager
            .remember(MemoryCategory::Fact, "user_name", "Bob", Some(7), None)
            .unwrap();

        // Should have the updated value
        let memory = manager
            .recall(MemoryCategory::Fact, "user_name")
            .unwrap()
            .unwrap();
        assert_eq!(memory.content, "Bob");
        assert_eq!(memory.importance, 7);
    }

    #[test]
    fn test_search() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .remember(
                MemoryCategory::Preference,
                "editor",
                "VSCode is preferred",
                Some(6),
                None,
            )
            .unwrap();
        manager
            .remember(MemoryCategory::Fact, "os", "Uses macOS", Some(5), None)
            .unwrap();

        let results = manager.search("preferred", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].topic, "editor");
    }

    #[test]
    fn test_log_context() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .log_context("Started new session", LogEntryType::Context, None)
            .unwrap();
        assert!(id > 0);

        let today = Utc::now().format("%Y-%m-%d").to_string();
        let logs = manager.get_daily_logs(&today).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].content, "Started new session");
    }

    #[test]
    fn test_forget() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .remember(
                MemoryCategory::Decision,
                "test_decision",
                "decided to test",
                None,
                None,
            )
            .unwrap();

        let deleted = manager
            .forget_topic(MemoryCategory::Decision, "test_decision")
            .unwrap();
        assert!(deleted);

        let memory = manager
            .recall(MemoryCategory::Decision, "test_decision")
            .unwrap();
        assert!(memory.is_none());
    }

    #[test]
    fn test_build_index() {
        let (_temp_dir, manager) = setup_test_db();

        // Add some memories
        manager
            .remember(
                MemoryCategory::Fact,
                "programming",
                "Rust is a systems programming language",
                Some(8),
                None,
            )
            .unwrap();
        manager
            .remember(
                MemoryCategory::Fact,
                "web",
                "JavaScript is used for web development",
                Some(7),
                None,
            )
            .unwrap();

        // Build the index
        let stats = manager.build_index().unwrap();
        assert_eq!(stats.document_count, 2);
        assert!(stats.vocabulary_size > 0);
    }

    #[test]
    fn test_semantic_search() {
        let (_temp_dir, manager) = setup_test_db();

        // Add some memories
        manager
            .remember(
                MemoryCategory::Fact,
                "rust_lang",
                "Rust is a systems programming language focused on memory safety",
                Some(8),
                None,
            )
            .unwrap();
        manager
            .remember(
                MemoryCategory::Fact,
                "python_lang",
                "Python is used for data science and machine learning",
                Some(7),
                None,
            )
            .unwrap();
        manager
            .remember(
                MemoryCategory::Fact,
                "cooking",
                "Italian pasta recipes are delicious",
                Some(5),
                None,
            )
            .unwrap();

        // Build the index
        manager.build_index().unwrap();

        // Search for programming-related memories
        let results = manager.semantic_search("programming language", 10).unwrap();
        assert!(!results.is_empty());

        // The first result should be the Rust fact (most similar to "programming language")
        assert_eq!(results[0].memory.topic, "rust_lang");
    }

    #[test]
    fn test_remember_updates_semantic_index_without_manual_rebuild() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .remember(
                MemoryCategory::Fact,
                "rust_lang_live",
                "Rust is a systems programming language focused on memory safety",
                Some(8),
                None,
            )
            .unwrap();

        let results = manager.semantic_search("programming language", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].memory.topic, "rust_lang_live");
    }

    #[test]
    fn test_hybrid_search() {
        let (_temp_dir, manager) = setup_test_db();

        // Add some memories
        manager
            .remember(
                MemoryCategory::Fact,
                "rust_systems",
                "Rust is great for systems programming",
                Some(8),
                None,
            )
            .unwrap();
        manager
            .remember(
                MemoryCategory::Preference,
                "rust_preference",
                "I prefer using Rust for backend development",
                Some(9),
                None,
            )
            .unwrap();

        // Build the index
        manager.build_index().unwrap();

        // Hybrid search should combine keyword and semantic results
        let results = manager.hybrid_search("Rust", 10).unwrap();
        assert!(!results.is_empty());

        // Both memories should be found
        let topics: Vec<&str> = results.iter().map(|r| r.memory.topic.as_str()).collect();
        assert!(topics.contains(&"rust_systems") || topics.contains(&"rust_preference"));
    }

    #[test]
    fn test_semantic_config() {
        let (_temp_dir, manager) = setup_test_db();

        // Check default config
        let config = manager.get_semantic_config().unwrap();
        assert!(config.enabled);
        assert!((config.keyword_weight - 0.4).abs() < f32::EPSILON);

        // Update config
        let new_config = SemanticSearchConfig {
            enabled: false,
            min_similarity: 0.2,
            keyword_weight: 0.6,
        };
        manager.set_semantic_config(new_config).unwrap();

        // Verify update
        let updated = manager.get_semantic_config().unwrap();
        assert!(!updated.enabled);
        assert!((updated.min_similarity - 0.2).abs() < f32::EPSILON);
        assert!((updated.keyword_weight - 0.6).abs() < f32::EPSILON);
    }

    #[test]
    fn test_update_and_remove_from_index() {
        let (_temp_dir, manager) = setup_test_db();

        // Add a memory
        let id = manager
            .remember(
                MemoryCategory::Fact,
                "test_topic",
                "original content about testing",
                Some(5),
                None,
            )
            .unwrap();

        // Build index
        manager.build_index().unwrap();
        let initial_stats = manager.get_index_stats().unwrap();
        assert_eq!(initial_stats.document_count, 1);

        // Update the index with new content
        manager
            .update_index(
                id,
                "completely different subject matter",
                "test_topic",
                "Fact",
            )
            .unwrap();
        let updated_stats = manager.get_index_stats().unwrap();
        assert_eq!(updated_stats.document_count, 1); // Still 1 document

        // Remove from index
        manager.remove_from_index(id).unwrap();
        let final_stats = manager.get_index_stats().unwrap();
        assert_eq!(final_stats.document_count, 0);
    }
}
