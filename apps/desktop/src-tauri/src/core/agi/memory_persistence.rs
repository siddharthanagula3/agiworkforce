//! Enhanced Memory Persistence System for AGI Workforce
//!
//! This module provides advanced persistent memory capabilities with:
//! - Vector embeddings for semantic similarity search
//! - Hybrid search combining vector similarity (70%) and FTS (30%)
//! - Automatic conversation summarization every 24 hours
//! - Project-scoped memory isolation
//! - JSON export/import for backup and restore
//!
//! Architecture inspired by Claude Desktop and Moltbot patterns:
//! - Two-layer memory: long-term curated memories + daily context logs
//! - Hybrid retrieval combining semantic and keyword search
//! - Automatic summarization to promote important information
//!
//! # Example
//!
//! ```ignore
//! use memory_persistence::{MemoryStore, PersistentMemory};
//!
//! let store = MemoryStore::new("/path/to/db")?;
//!
//! // Store a memory with optional embedding
//! store.store(PersistentMemory {
//!     content: "User prefers dark mode".to_string(),
//!     category: MemoryCategory::Preference,
//!     project_id: Some("project-123".to_string()),
//!     ..Default::default()
//! })?;
//!
//! // Search using hybrid search (vector + FTS)
//! let results = store.hybrid_search("theme preferences", Some("project-123"), 10)?;
//! ```

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use crate::sys::error::{Error, Result};

// =============================================================================
// CONSTANTS
// =============================================================================

/// Reference dimension for the OpenAI text-embedding-3-small model.
/// Embeddings are stored at their native dimensions (768 for Ollama,
/// 1536 for OpenAI). The vector_search function skips comparisons
/// between embeddings of different dimensions.
pub const DEFAULT_EMBEDDING_DIM: usize = 1536;

/// MEM-016 fix: Maximum embeddings to load for vector search
/// Prevents memory exhaustion with millions of records
pub const MAX_VECTOR_SEARCH_CANDIDATES: usize = 10_000;

/// Weight for vector similarity in hybrid search (70%)
pub const VECTOR_SEARCH_WEIGHT: f32 = 0.70;

/// Weight for FTS in hybrid search (30%)
pub const FTS_SEARCH_WEIGHT: f32 = 0.30;

/// Default summarization interval in hours
pub const SUMMARIZATION_INTERVAL_HOURS: i64 = 24;

/// Maximum content length before summarization is recommended
pub const MAX_CONTENT_LENGTH_BEFORE_SUMMARY: usize = 10000;

// =============================================================================
// TYPES
// =============================================================================

/// Category for organizing persistent memories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum MemoryCategory {
    /// User preferences and settings
    Preference,
    /// Factual information about the user or their work
    Fact,
    /// Decisions made by the user
    Decision,
    /// Contextual information from conversations
    #[default]
    Context,
    /// Summarized conversation content
    Summary,
    /// Learned patterns or skills
    Skill,
}

impl MemoryCategory {
    /// Convert to database string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Preference => "preference",
            Self::Fact => "fact",
            Self::Decision => "decision",
            Self::Context => "context",
            Self::Summary => "summary",
            Self::Skill => "skill",
        }
    }

    /// Parse from database string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "preference" => Some(Self::Preference),
            "fact" => Some(Self::Fact),
            "decision" => Some(Self::Decision),
            "context" => Some(Self::Context),
            "summary" => Some(Self::Summary),
            "skill" => Some(Self::Skill),
            _ => None,
        }
    }
}

/// A persistent memory entry with optional embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistentMemory {
    /// Unique identifier (auto-generated if 0)
    pub id: i64,
    /// The memory content
    pub content: String,
    /// Optional embedding vector (serialized as BLOB)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding: Option<Vec<f32>>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Optional project scope (None = global memory)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Optional summary for long content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Memory category
    pub category: MemoryCategory,
    /// Importance score (1-10)
    pub importance: i32,
    /// Topic/tag for the memory
    pub topic: String,
    /// Source of the memory (e.g., conversation ID, file path)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Last time this memory was accessed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_accessed: Option<DateTime<Utc>>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl Default for PersistentMemory {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: 0,
            content: String::new(),
            embedding: None,
            created_at: now,
            project_id: None,
            summary: None,
            category: MemoryCategory::Context,
            importance: 5,
            topic: String::new(),
            source: None,
            last_accessed: None,
            updated_at: now,
        }
    }
}

impl PersistentMemory {
    /// Create a new memory with content and category
    pub fn new(content: String, category: MemoryCategory, topic: String) -> Self {
        Self {
            content,
            category,
            topic,
            ..Default::default()
        }
    }

    /// Set the project scope
    pub fn with_project(mut self, project_id: String) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Set the embedding vector
    pub fn with_embedding(mut self, embedding: Vec<f32>) -> Self {
        self.embedding = Some(embedding);
        self
    }

    /// Set the importance score
    pub fn with_importance(mut self, importance: i32) -> Self {
        self.importance = importance.clamp(1, 10);
        self
    }

    /// Set the source
    pub fn with_source(mut self, source: String) -> Self {
        self.source = Some(source);
        self
    }
}

/// Result of a hybrid search operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResult {
    /// The matching memory
    pub memory: PersistentMemory,
    /// Vector similarity score (0.0 - 1.0)
    pub vector_score: f32,
    /// FTS relevance score (0.0 - 1.0)
    pub fts_score: f32,
    /// Combined weighted score
    pub combined_score: f32,
}

/// Configuration for the conversation summarizer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizerConfig {
    /// Enable automatic summarization
    pub enabled: bool,
    /// Interval between summarization runs in hours
    pub interval_hours: i64,
    /// Maximum number of messages to summarize at once
    pub max_messages_per_batch: usize,
    /// Minimum messages before summarization triggers
    pub min_messages_threshold: usize,
    /// Custom summarization prompt template
    pub prompt_template: Option<String>,
}

impl Default for SummarizerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_hours: SUMMARIZATION_INTERVAL_HOURS,
            max_messages_per_batch: 100,
            min_messages_threshold: 10,
            prompt_template: None,
        }
    }
}

/// Statistics about the summarization process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationStats {
    /// Last summarization run timestamp
    pub last_run: Option<DateTime<Utc>>,
    /// Number of conversations summarized
    pub conversations_summarized: usize,
    /// Number of memories created from summarization
    pub memories_created: usize,
    /// Total tokens processed
    pub tokens_processed: usize,
}

/// Export format for memory backup
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryExport {
    /// Version of the export format
    pub version: String,
    /// Export timestamp
    pub exported_at: DateTime<Utc>,
    /// All memories
    pub memories: Vec<PersistentMemory>,
    /// Summarization statistics
    pub stats: Option<SummarizationStats>,
}

/// Import result with statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    /// Number of memories successfully imported
    pub imported: usize,
    /// Number of memories skipped (duplicates)
    pub skipped: usize,
    /// Number of memories that failed to import
    pub failed: usize,
    /// Error messages for failed imports
    pub errors: Vec<String>,
}

/// Search filter options
#[derive(Debug, Clone, Default)]
pub struct SearchFilter {
    /// Filter by project ID (None = all projects)
    pub project_id: Option<String>,
    /// Filter by category
    pub category: Option<MemoryCategory>,
    /// Minimum importance score
    pub min_importance: Option<i32>,
    /// Include only memories created after this date
    pub created_after: Option<DateTime<Utc>>,
    /// Include only memories created before this date
    pub created_before: Option<DateTime<Utc>>,
}

// =============================================================================
// MEMORY STORE
// =============================================================================

/// Thread-safe persistent memory store with SQLite backend
pub struct MemoryStore {
    /// Database connection
    conn: Arc<Mutex<Connection>>,
    /// Summarizer configuration
    summarizer_config: RwLock<SummarizerConfig>,
    /// Cached embeddings for quick lookup (memory_id -> embedding)
    embedding_cache: RwLock<HashMap<i64, Vec<f32>>>,
    /// MEM-015 fix: Track cache insertion order for proper FIFO eviction
    cache_order: RwLock<VecDeque<i64>>,
    /// Maximum cache size
    max_cache_size: usize,
}

impl MemoryStore {
    /// Create a new memory store with the given database path
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            summarizer_config: RwLock::new(SummarizerConfig::default()),
            embedding_cache: RwLock::new(HashMap::new()),
            cache_order: RwLock::new(VecDeque::new()),
            max_cache_size: 1000,
        })
    }

    /// Create a memory store from an existing path
    pub fn from_path(path: &Path) -> Result<Self> {
        Self::new(
            path.to_str()
                .ok_or_else(|| Error::Generic("Invalid path".to_string()))?,
        )
    }

    /// Create an in-memory store for testing
    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()
            .map_err(|e| Error::Database(format!("Failed to open in-memory database: {}", e)))?;

        // Run migrations for test database
        conn.execute(
            "CREATE TABLE IF NOT EXISTS persistent_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                embedding BLOB,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                project_id TEXT,
                summary TEXT,
                category TEXT NOT NULL DEFAULT 'context',
                importance INTEGER NOT NULL DEFAULT 5,
                topic TEXT NOT NULL DEFAULT '',
                source TEXT,
                last_accessed TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        // Create FTS virtual table
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS persistent_memory_fts USING fts5(
                content,
                topic,
                summary,
                content=persistent_memory,
                content_rowid=id,
                tokenize='porter unicode61'
            )",
            [],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_persistent_memory_project ON persistent_memory(project_id)",
            [],
        ).map_err(|e| Error::Database(e.to_string()))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_persistent_memory_category ON persistent_memory(category)",
            [],
        )
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            summarizer_config: RwLock::new(SummarizerConfig::default()),
            embedding_cache: RwLock::new(HashMap::new()),
            cache_order: RwLock::new(VecDeque::new()),
            max_cache_size: 1000,
        })
    }

    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    /// Store a new memory or update an existing one
    pub fn store(&self, memory: PersistentMemory) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let embedding_blob = memory.embedding.as_ref().map(|e| serialize_embedding(e));
        let category_str = memory.category.as_str();
        let created_at = memory.created_at.to_rfc3339();
        let updated_at = Utc::now().to_rfc3339();
        let last_accessed = memory.last_accessed.map(|dt| dt.to_rfc3339());

        if memory.id > 0 {
            // Update existing memory
            conn.execute(
                "UPDATE persistent_memory SET
                    content = ?1,
                    embedding = ?2,
                    project_id = ?3,
                    summary = ?4,
                    category = ?5,
                    importance = ?6,
                    topic = ?7,
                    source = ?8,
                    last_accessed = ?9,
                    updated_at = ?10
                WHERE id = ?11",
                params![
                    memory.content,
                    embedding_blob,
                    memory.project_id,
                    memory.summary,
                    category_str,
                    memory.importance,
                    memory.topic,
                    memory.source,
                    last_accessed,
                    updated_at,
                    memory.id
                ],
            )
            .map_err(|e| Error::Database(format!("Failed to update memory: {}", e)))?;

            // Update FTS index
            let _ = conn.execute(
                "INSERT INTO persistent_memory_fts(persistent_memory_fts, rowid, content, topic, summary)
                 VALUES('delete', ?1, ?2, ?3, ?4)",
                params![memory.id, memory.content, memory.topic, memory.summary],
            );
            let _ = conn.execute(
                "INSERT INTO persistent_memory_fts(rowid, content, topic, summary)
                 VALUES(?1, ?2, ?3, ?4)",
                params![memory.id, memory.content, memory.topic, memory.summary],
            );

            // Update cache
            if let Some(ref emb) = memory.embedding {
                self.cache_embedding(memory.id, emb.clone());
            }

            Ok(memory.id)
        } else {
            // Insert new memory
            conn.execute(
                "INSERT INTO persistent_memory
                    (content, embedding, created_at, project_id, summary, category, importance, topic, source, last_accessed, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    memory.content,
                    embedding_blob,
                    created_at,
                    memory.project_id,
                    memory.summary,
                    category_str,
                    memory.importance,
                    memory.topic,
                    memory.source,
                    last_accessed,
                    updated_at
                ],
            )
            .map_err(|e| Error::Database(format!("Failed to store memory: {}", e)))?;

            let id = conn.last_insert_rowid();

            // Update FTS index
            let _ = conn.execute(
                "INSERT INTO persistent_memory_fts(rowid, content, topic, summary)
                 VALUES(?1, ?2, ?3, ?4)",
                params![id, memory.content, memory.topic, memory.summary],
            );

            // Update cache
            if let Some(ref emb) = memory.embedding {
                self.cache_embedding(id, emb.clone());
            }

            Ok(id)
        }
    }

    /// Get a memory by ID
    pub fn get(&self, id: i64) -> Result<Option<PersistentMemory>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let result = conn.query_row(
            "SELECT id, content, embedding, created_at, project_id, summary, category, importance, topic, source, last_accessed, updated_at
             FROM persistent_memory WHERE id = ?1",
            params![id],
            map_memory_row,
        );

        match result {
            Ok(memory) => {
                // Update last_accessed
                let _ = conn.execute(
                    "UPDATE persistent_memory SET last_accessed = ?1 WHERE id = ?2",
                    params![Utc::now().to_rfc3339(), id],
                );
                Ok(Some(memory))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Error::Database(format!("Failed to get memory: {}", e))),
        }
    }

    /// Delete a memory by ID
    pub fn delete(&self, id: i64) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // Delete from FTS first
        let _ = conn.execute(
            "DELETE FROM persistent_memory_fts WHERE rowid = ?1",
            params![id],
        );

        // Delete from main table
        let rows = conn
            .execute("DELETE FROM persistent_memory WHERE id = ?1", params![id])
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        // Remove from cache
        self.remove_from_cache(id);

        Ok(rows > 0)
    }

    /// List all memories with optional filtering
    pub fn list(
        &self,
        filter: &SearchFilter,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<PersistentMemory>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut sql = String::from(
            "SELECT id, content, embedding, created_at, project_id, summary, category, importance, topic, source, last_accessed, updated_at
             FROM persistent_memory WHERE 1=1",
        );
        let mut params_vec: Vec<String> = Vec::new();

        if let Some(ref project_id) = filter.project_id {
            sql.push_str(&format!(" AND project_id = ?{}", params_vec.len() + 1));
            params_vec.push(project_id.clone());
        }

        if let Some(ref category) = filter.category {
            sql.push_str(&format!(" AND category = ?{}", params_vec.len() + 1));
            params_vec.push(category.as_str().to_string());
        }

        if let Some(min_importance) = filter.min_importance {
            sql.push_str(&format!(" AND importance >= ?{}", params_vec.len() + 1));
            params_vec.push(min_importance.to_string());
        }

        if let Some(ref created_after) = filter.created_after {
            sql.push_str(&format!(" AND created_at >= ?{}", params_vec.len() + 1));
            params_vec.push(created_after.to_rfc3339());
        }

        if let Some(ref created_before) = filter.created_before {
            sql.push_str(&format!(" AND created_at <= ?{}", params_vec.len() + 1));
            params_vec.push(created_before.to_rfc3339());
        }

        sql.push_str(" ORDER BY importance DESC, updated_at DESC");
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let memories = stmt
            .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                map_memory_row(row)
            })
            .map_err(|e| Error::Database(format!("Failed to list memories: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(memories)
    }

    // =========================================================================
    // SEARCH OPERATIONS
    // =========================================================================

    /// Perform a hybrid search combining vector similarity and FTS
    ///
    /// The search uses weighted scoring:
    /// - 70% weight for vector similarity (if embeddings available)
    /// - 30% weight for FTS relevance
    pub fn hybrid_search(
        &self,
        query: &str,
        query_embedding: Option<&[f32]>,
        filter: &SearchFilter,
        limit: usize,
    ) -> Result<Vec<HybridSearchResult>> {
        // Get FTS results
        let fts_results = self.fts_search(query, filter, limit * 2)?;

        // Get vector results if embedding provided
        let vector_results = if let Some(embedding) = query_embedding {
            self.vector_search(embedding, filter, limit * 2)?
        } else {
            Vec::new()
        };

        // Merge and score results
        let mut merged: HashMap<i64, HybridSearchResult> = HashMap::new();

        // Process FTS results
        let fts_max_score = fts_results
            .iter()
            .map(|(_, score)| *score)
            .fold(f32::MIN, f32::max);

        for (memory, fts_score) in fts_results {
            let normalized_fts = if fts_max_score > 0.0 {
                fts_score / fts_max_score
            } else {
                0.0
            };

            merged.insert(
                memory.id,
                HybridSearchResult {
                    memory,
                    vector_score: 0.0,
                    fts_score: normalized_fts,
                    combined_score: normalized_fts * FTS_SEARCH_WEIGHT,
                },
            );
        }

        // Process vector results
        for (memory, vector_score) in vector_results {
            if let Some(existing) = merged.get_mut(&memory.id) {
                existing.vector_score = vector_score;
                existing.combined_score =
                    existing.fts_score * FTS_SEARCH_WEIGHT + vector_score * VECTOR_SEARCH_WEIGHT;
            } else {
                merged.insert(
                    memory.id,
                    HybridSearchResult {
                        memory,
                        vector_score,
                        fts_score: 0.0,
                        combined_score: vector_score * VECTOR_SEARCH_WEIGHT,
                    },
                );
            }
        }

        // Sort by combined score and limit
        let mut results: Vec<HybridSearchResult> = merged.into_values().collect();
        results.sort_by(|a, b| {
            b.combined_score
                .partial_cmp(&a.combined_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(limit);

        Ok(results)
    }

    /// Perform full-text search using SQLite FTS5
    pub fn fts_search(
        &self,
        query: &str,
        filter: &SearchFilter,
        limit: usize,
    ) -> Result<Vec<(PersistentMemory, f32)>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // Escape FTS query special characters
        let escaped_query = escape_fts_query(query);

        let mut sql = String::from(
            "SELECT pm.id, pm.content, pm.embedding, pm.created_at, pm.project_id, pm.summary,
                    pm.category, pm.importance, pm.topic, pm.source, pm.last_accessed, pm.updated_at,
                    bm25(persistent_memory_fts) as score
             FROM persistent_memory pm
             JOIN persistent_memory_fts fts ON pm.id = fts.rowid
             WHERE persistent_memory_fts MATCH ?1",
        );

        let mut params_vec: Vec<String> = vec![escaped_query];

        if let Some(ref project_id) = filter.project_id {
            sql.push_str(&format!(" AND pm.project_id = ?{}", params_vec.len() + 1));
            params_vec.push(project_id.clone());
        }

        if let Some(ref category) = filter.category {
            sql.push_str(&format!(" AND pm.category = ?{}", params_vec.len() + 1));
            params_vec.push(category.as_str().to_string());
        }

        sql.push_str(" ORDER BY score");
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| Error::Database(format!("Failed to prepare FTS query: {}", e)))?;

        let results = stmt
            .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                let memory = map_memory_row(row)?;
                let score: f32 = row.get(12)?;
                // MEM-017 fix: BM25 score handling varies by SQLite version
                // Some versions return negative (lower = better), others positive
                // Use absolute value for consistent positive scores
                Ok((memory, score.abs()))
            })
            .map_err(|e| Error::Database(format!("FTS search failed: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    /// Perform vector similarity search using cosine similarity
    pub fn vector_search(
        &self,
        query_embedding: &[f32],
        filter: &SearchFilter,
        limit: usize,
    ) -> Result<Vec<(PersistentMemory, f32)>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut sql = String::from(
            "SELECT id, content, embedding, created_at, project_id, summary, category, importance, topic, source, last_accessed, updated_at
             FROM persistent_memory
             WHERE embedding IS NOT NULL",
        );

        let mut params_vec: Vec<String> = Vec::new();

        if let Some(ref project_id) = filter.project_id {
            sql.push_str(&format!(" AND project_id = ?{}", params_vec.len() + 1));
            params_vec.push(project_id.clone());
        }

        if let Some(ref category) = filter.category {
            sql.push_str(&format!(" AND category = ?{}", params_vec.len() + 1));
            params_vec.push(category.as_str().to_string());
        }

        // MEM-016 fix: Add ORDER BY and LIMIT to prevent loading millions of embeddings
        // Order by importance and recency as a proxy for relevance (actual ranking done post-filter)
        sql.push_str(&format!(
            " ORDER BY importance DESC, updated_at DESC LIMIT {}",
            MAX_VECTOR_SEARCH_CANDIDATES
        ));

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| Error::Database(format!("Failed to prepare vector query: {}", e)))?;

        let mut results: Vec<(PersistentMemory, f32)> = stmt
            .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                map_memory_row(row)
            })
            .map_err(|e| Error::Database(format!("Vector search failed: {}", e)))?
            .filter_map(|r| r.ok())
            .filter_map(|memory| {
                if let Some(ref emb) = memory.embedding {
                    // Skip embeddings with different dimensions — they come from
                    // different models and live in incompatible vector spaces.
                    // Comparing (or zero-padding) across dimensions gives incorrect
                    // cosine similarity scores.
                    if emb.len() != query_embedding.len() {
                        return None;
                    }
                    let similarity = cosine_similarity(query_embedding, emb);
                    if similarity > 0.0 {
                        Some((memory, similarity))
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();

        // Sort by similarity score descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);

        Ok(results
            .into_iter()
            .map(|(mut m, s)| {
                // Clear embedding from result to reduce memory usage
                m.embedding = None;
                (m, s)
            })
            .collect())
    }

    // =========================================================================
    // PROJECT SCOPING
    // =========================================================================

    /// Get all memories for a specific project
    pub fn get_project_memories(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<PersistentMemory>> {
        self.list(
            &SearchFilter {
                project_id: Some(project_id.to_string()),
                ..Default::default()
            },
            limit,
            0,
        )
    }

    /// Delete all memories for a specific project
    pub fn delete_project_memories(&self, project_id: &str) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // Get IDs to delete from FTS
        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM persistent_memory WHERE project_id = ?1")
            .map_err(|e| Error::Database(e.to_string()))?
            .query_map(params![project_id], |row| row.get(0))
            .map_err(|e| Error::Database(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        // Delete from FTS
        for id in &ids {
            let _ = conn.execute(
                "DELETE FROM persistent_memory_fts WHERE rowid = ?1",
                params![id],
            );
            self.remove_from_cache(*id);
        }

        // Delete from main table
        let rows = conn
            .execute(
                "DELETE FROM persistent_memory WHERE project_id = ?1",
                params![project_id],
            )
            .map_err(|e| Error::Database(format!("Failed to delete project memories: {}", e)))?;

        Ok(rows)
    }

    /// Copy memories from one project to another
    pub fn copy_project_memories(
        &self,
        source_project: &str,
        target_project: &str,
    ) -> Result<usize> {
        let memories = self.get_project_memories(source_project, 10000)?;
        let mut count = 0;

        for mut memory in memories {
            memory.id = 0; // Reset ID for new entry
            memory.project_id = Some(target_project.to_string());
            self.store(memory)?;
            count += 1;
        }

        Ok(count)
    }

    // =========================================================================
    // CONVERSATION SUMMARIZATION
    // =========================================================================

    /// Get the summarizer configuration
    pub fn get_summarizer_config(&self) -> Result<SummarizerConfig> {
        let config = self
            .summarizer_config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(config.clone())
    }

    /// Set the summarizer configuration
    pub fn set_summarizer_config(&self, config: SummarizerConfig) -> Result<()> {
        let mut current = self
            .summarizer_config
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        *current = config;
        Ok(())
    }

    /// Get conversations that need summarization
    ///
    /// Returns conversations that haven't been summarized in the configured interval
    pub fn get_conversations_needing_summary(
        &self,
        project_id: Option<&str>,
    ) -> Result<Vec<ConversationSummaryCandidate>> {
        let config = self.get_summarizer_config()?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let cutoff = Utc::now() - Duration::hours(config.interval_hours);
        let cutoff_str = cutoff.to_rfc3339();

        let mut sql = String::from(
            "SELECT DISTINCT pm.source as conversation_id,
                    COUNT(*) as message_count,
                    MAX(pm.created_at) as last_message_at
             FROM persistent_memory pm
             WHERE pm.category = 'context'
               AND pm.source IS NOT NULL
               AND pm.source LIKE 'conversation:%'
               AND pm.created_at > ?1",
        );

        let mut params_vec: Vec<String> = vec![cutoff_str];

        if let Some(pid) = project_id {
            sql.push_str(&format!(" AND pm.project_id = ?{}", params_vec.len() + 1));
            params_vec.push(pid.to_string());
        }

        sql.push_str(" GROUP BY pm.source");
        sql.push_str(&format!(
            " HAVING COUNT(*) >= {}",
            config.min_messages_threshold
        ));
        sql.push_str(" ORDER BY last_message_at DESC");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| Error::Database(format!("Failed to prepare summary query: {}", e)))?;

        let candidates = stmt
            .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                Ok(ConversationSummaryCandidate {
                    conversation_id: row.get(0)?,
                    message_count: row.get(1)?,
                    last_message_at: row.get(2)?,
                })
            })
            .map_err(|e| Error::Database(format!("Failed to get summary candidates: {}", e)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(candidates)
    }

    /// Store a conversation summary as a memory
    pub fn store_conversation_summary(
        &self,
        conversation_id: &str,
        summary: &str,
        project_id: Option<&str>,
        embedding: Option<Vec<f32>>,
    ) -> Result<i64> {
        let memory = PersistentMemory {
            content: summary.to_string(),
            category: MemoryCategory::Summary,
            topic: format!("Summary of {}", conversation_id),
            source: Some(conversation_id.to_string()),
            project_id: project_id.map(String::from),
            embedding,
            importance: 7, // Summaries are moderately important
            ..Default::default()
        };

        self.store(memory)
    }

    // =========================================================================
    // EXPORT / IMPORT
    // =========================================================================

    /// Export all memories to JSON format
    pub fn export_to_json(&self, project_id: Option<&str>) -> Result<String> {
        let filter = SearchFilter {
            project_id: project_id.map(String::from),
            ..Default::default()
        };

        let memories = self.list(&filter, 100000, 0)?;

        let export = MemoryExport {
            version: "2.0".to_string(),
            exported_at: Utc::now(),
            memories,
            stats: None,
        };

        serde_json::to_string_pretty(&export)
            .map_err(|e| Error::Generic(format!("Failed to serialize export: {}", e)))
    }

    /// Export to a JSON file
    pub fn export_to_file(&self, path: &Path, project_id: Option<&str>) -> Result<usize> {
        let json = self.export_to_json(project_id)?;
        std::fs::write(path, &json).map_err(|e| Error::Other(e.to_string()))?;
        Ok(json.len())
    }

    /// Import memories from JSON
    pub fn import_from_json(
        &self,
        json: &str,
        target_project: Option<&str>,
    ) -> Result<ImportResult> {
        let export: MemoryExport = serde_json::from_str(json)
            .map_err(|e| Error::Generic(format!("Failed to parse import JSON: {}", e)))?;

        let mut result = ImportResult {
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: Vec::new(),
        };

        for mut memory in export.memories {
            // Override project ID if specified
            if let Some(pid) = target_project {
                memory.project_id = Some(pid.to_string());
            }

            // Reset ID for new entry
            memory.id = 0;

            match self.store(memory) {
                Ok(_) => result.imported += 1,
                Err(e) => {
                    result.failed += 1;
                    result.errors.push(e.to_string());
                }
            }
        }

        Ok(result)
    }

    /// Import from a JSON file
    pub fn import_from_file(
        &self,
        path: &Path,
        target_project: Option<&str>,
    ) -> Result<ImportResult> {
        let json = std::fs::read_to_string(path).map_err(|e| Error::Other(e.to_string()))?;
        self.import_from_json(&json, target_project)
    }

    // =========================================================================
    // CACHE MANAGEMENT
    // =========================================================================

    /// MEM-015 fix: Cache embedding with proper FIFO eviction
    fn cache_embedding(&self, id: i64, embedding: Vec<f32>) {
        // Acquire both locks - order matters for deadlock prevention
        let cache_result = self.embedding_cache.write();
        let order_result = self.cache_order.write();

        if let (Ok(mut cache), Ok(mut order)) = (cache_result, order_result) {
            // If already cached, just update the value (don't add to order again)
            if let std::collections::hash_map::Entry::Occupied(mut e) = cache.entry(id) {
                e.insert(embedding);
                return;
            }

            // FIFO eviction: remove oldest entry if at capacity
            while cache.len() >= self.max_cache_size {
                if let Some(oldest_id) = order.pop_front() {
                    cache.remove(&oldest_id);
                    tracing::trace!(evicted_id = oldest_id, "Evicted oldest cache entry (FIFO)");
                } else {
                    // Order queue is empty but cache is full - shouldn't happen but clear anyway
                    tracing::warn!("Cache order desynced from cache, clearing both");
                    cache.clear();
                    break;
                }
            }

            cache.insert(id, embedding);
            order.push_back(id);
        }
    }

    /// MEM-015 fix: Remove from both cache and order queue
    fn remove_from_cache(&self, id: i64) {
        if let Ok(mut cache) = self.embedding_cache.write() {
            cache.remove(&id);
        }
        if let Ok(mut order) = self.cache_order.write() {
            order.retain(|&cached_id| cached_id != id);
        }
    }

    /// Clear the embedding cache
    /// MEM-015 fix: Clear both cache and order queue
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.embedding_cache.write() {
            cache.clear();
        }
        if let Ok(mut order) = self.cache_order.write() {
            order.clear();
        }
    }

    /// Get cache statistics
    pub fn cache_stats(&self) -> (usize, usize) {
        let size = self.embedding_cache.read().map(|c| c.len()).unwrap_or(0);
        (size, self.max_cache_size)
    }
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/// Candidate for conversation summarization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummaryCandidate {
    /// Conversation ID (from source field)
    pub conversation_id: String,
    /// Number of messages in the conversation
    pub message_count: i64,
    /// Timestamp of the last message
    pub last_message_at: String,
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/// Serialize an embedding vector to bytes for SQLite BLOB storage
fn serialize_embedding(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize an embedding vector from SQLite BLOB
///
/// MEM-010 fix: Validates blob length is a multiple of 4 and logs warning if truncated
fn deserialize_embedding(blob: &[u8]) -> Vec<f32> {
    // MEM-010 fix: Check for invalid blob length that would cause silent truncation
    let remainder = blob.len() % 4;
    if remainder != 0 {
        tracing::warn!(
            blob_len = blob.len(),
            remainder = remainder,
            expected_floats = blob.len() / 4,
            "Embedding blob length not multiple of 4 bytes, data may be corrupted"
        );
    }

    blob.chunks_exact(4)
        .map(|chunk| {
            let bytes: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
            f32::from_le_bytes(bytes)
        })
        .collect()
}

/// Compute cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a * norm_b)
}

/// Escape special characters for FTS5 query
fn escape_fts_query(query: &str) -> String {
    // Remove special FTS5 operators and wrap in quotes for phrase matching
    let cleaned: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    // Split into words and join with OR for better matching
    cleaned
        .split_whitespace()
        .map(|w| format!("\"{}\"", w))
        .collect::<Vec<_>>()
        .join(" OR ")
}

/// Map a database row to a PersistentMemory struct
fn map_memory_row(row: &Row<'_>) -> rusqlite::Result<PersistentMemory> {
    let embedding_blob: Option<Vec<u8>> = row.get(2)?;
    let category_str: String = row.get(6)?;
    let created_at_str: String = row.get(3)?;
    let updated_at_str: String = row.get(11)?;
    let last_accessed_str: Option<String> = row.get(10)?;

    Ok(PersistentMemory {
        id: row.get(0)?,
        content: row.get(1)?,
        embedding: embedding_blob.map(|b| deserialize_embedding(&b)),
        created_at: parse_datetime(&created_at_str),
        project_id: row.get(4)?,
        summary: row.get(5)?,
        category: MemoryCategory::from_str(&category_str).unwrap_or(MemoryCategory::Context),
        importance: row.get(7)?,
        topic: row.get(8)?,
        source: row.get(9)?,
        last_accessed: last_accessed_str.map(|s| parse_datetime(&s)),
        updated_at: parse_datetime(&updated_at_str),
    })
}

/// Parse a datetime string to UTC DateTime
fn parse_datetime(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_store_crud() {
        let store = MemoryStore::in_memory().unwrap();

        // Create a memory
        let memory = PersistentMemory::new(
            "User prefers dark mode".to_string(),
            MemoryCategory::Preference,
            "ui_theme".to_string(),
        );

        let id = store.store(memory).unwrap();
        assert!(id > 0);

        // Read the memory
        let retrieved = store.get(id).unwrap().unwrap();
        assert_eq!(retrieved.content, "User prefers dark mode");
        assert_eq!(retrieved.topic, "ui_theme");

        // Update the memory
        let mut updated = retrieved;
        updated.content = "User prefers light mode".to_string();
        store.store(updated).unwrap();

        let retrieved2 = store.get(id).unwrap().unwrap();
        assert_eq!(retrieved2.content, "User prefers light mode");

        // Delete the memory
        let deleted = store.delete(id).unwrap();
        assert!(deleted);

        let retrieved3 = store.get(id).unwrap();
        assert!(retrieved3.is_none());
    }

    #[test]
    fn test_project_scoping() {
        let store = MemoryStore::in_memory().unwrap();

        // Create memories in different projects
        let memory1 = PersistentMemory::new(
            "Project A memory".to_string(),
            MemoryCategory::Context,
            "topic1".to_string(),
        )
        .with_project("project-a".to_string());

        let memory2 = PersistentMemory::new(
            "Project B memory".to_string(),
            MemoryCategory::Context,
            "topic2".to_string(),
        )
        .with_project("project-b".to_string());

        store.store(memory1).unwrap();
        store.store(memory2).unwrap();

        // Query project A only
        let project_a_memories = store.get_project_memories("project-a", 100).unwrap();
        assert_eq!(project_a_memories.len(), 1);
        assert_eq!(project_a_memories[0].content, "Project A memory");

        // Query project B only
        let project_b_memories = store.get_project_memories("project-b", 100).unwrap();
        assert_eq!(project_b_memories.len(), 1);
        assert_eq!(project_b_memories[0].content, "Project B memory");

        // Delete project A memories
        let deleted = store.delete_project_memories("project-a").unwrap();
        assert_eq!(deleted, 1);

        let project_a_memories = store.get_project_memories("project-a", 100).unwrap();
        assert!(project_a_memories.is_empty());
    }

    #[test]
    fn test_embedding_serialization() {
        let embedding = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let serialized = serialize_embedding(&embedding);
        let deserialized = deserialize_embedding(&serialized);

        assert_eq!(embedding.len(), deserialized.len());
        for (a, b) in embedding.iter().zip(deserialized.iter()) {
            assert!((a - b).abs() < f32::EPSILON);
        }
    }

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 0.001);

        let c = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &c)).abs() < 0.001);

        let d = vec![0.707, 0.707, 0.0];
        let sim = cosine_similarity(&a, &d);
        assert!((sim - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_export_import() {
        let store = MemoryStore::in_memory().unwrap();

        // Create some memories
        let memory1 = PersistentMemory::new(
            "Memory 1".to_string(),
            MemoryCategory::Fact,
            "topic1".to_string(),
        );
        let memory2 = PersistentMemory::new(
            "Memory 2".to_string(),
            MemoryCategory::Preference,
            "topic2".to_string(),
        );

        store.store(memory1).unwrap();
        store.store(memory2).unwrap();

        // Export
        let json = store.export_to_json(None).unwrap();
        assert!(json.contains("Memory 1"));
        assert!(json.contains("Memory 2"));

        // Create new store and import
        let store2 = MemoryStore::in_memory().unwrap();
        let result = store2.import_from_json(&json, None).unwrap();

        assert_eq!(result.imported, 2);
        assert_eq!(result.failed, 0);

        // Verify imported memories
        let memories = store2.list(&SearchFilter::default(), 100, 0).unwrap();
        assert_eq!(memories.len(), 2);
    }

    #[test]
    fn test_fts_query_escaping() {
        let query = "hello world";
        let escaped = escape_fts_query(query);
        assert_eq!(escaped, "\"hello\" OR \"world\"");

        let query_special = "hello* AND world";
        let escaped_special = escape_fts_query(query_special);
        assert_eq!(escaped_special, "\"hello\" OR \"AND\" OR \"world\"");
    }

    #[test]
    fn test_memory_category() {
        assert_eq!(MemoryCategory::Preference.as_str(), "preference");
        assert_eq!(
            MemoryCategory::from_str("preference"),
            Some(MemoryCategory::Preference)
        );
        assert_eq!(MemoryCategory::from_str("invalid"), None);
    }
}
