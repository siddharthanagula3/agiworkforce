//! Chat history search — FTS5 full-text search and TF-IDF semantic reranking.

use tauri::State;

use super::state::AppDatabase;

/// A single result row returned by `search_chat_history`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatSearchResult {
    /// Row ID of the matching message in the `messages` table.
    pub message_id: i64,
    /// Row ID of the conversation that owns this message.
    pub conversation_id: i64,
    /// Human-readable title of the conversation, if available.
    pub conversation_title: Option<String>,
    /// A short excerpt of the message content with the match context.
    /// Up to ~160 characters, surrounded by the query terms.
    pub content_snippet: String,
    /// Role of the message sender: "user", "assistant", or "system".
    pub role: String,
    /// ISO-8601 creation timestamp of the message.
    pub created_at: String,
    /// BM25 relevance rank (lower is more relevant in SQLite FTS5 convention).
    pub rank: f64,
}

/// Full-text search across all chat messages using the FTS5 index.
///
/// The query string is passed directly to FTS5 MATCH, so standard FTS5 query
/// syntax is supported (phrase search with quotes, prefix search with `*`,
/// boolean `AND`/`OR`/`NOT`).  Results are ordered by BM25 relevance (most
/// relevant first) and limited to `limit` rows (default 20, max 100).
///
/// Returns an empty list when the FTS5 table is not available (e.g. on an
/// SQLite build without the FTS5 extension), rather than surfacing an error.
#[tauri::command]
pub fn search_chat_history(
    query: String,
    limit: Option<i64>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<ChatSearchResult>, String> {
    // Validate that the query is not empty to avoid FTS5 syntax errors.
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query cannot be empty".to_string());
    }

    // Clamp limit: default 20, maximum 100.
    let effective_limit = limit.unwrap_or(20).clamp(1, 100);

    let conn = db.connection()?;

    // Check that the FTS table exists before querying it.
    // It may be absent on SQLite builds without the FTS5 module.
    let fts_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !fts_exists {
        tracing::warn!(
            "search_chat_history: messages_fts table not found; \
             returning empty results (FTS5 may be unavailable)"
        );
        return Ok(Vec::new());
    }

    // Join messages_fts with messages (for created_at) and conversations (for
    // title).  The FTS table stores message_id as TEXT (CAST from INTEGER).
    // bm25(messages_fts) returns a negative score; ORDER BY rank ASC puts the
    // most relevant results first.
    let sql = "
        SELECT
            CAST(f.message_id AS INTEGER)        AS message_id,
            CAST(f.conversation_id AS INTEGER)   AS conversation_id,
            c.title                              AS conversation_title,
            snippet(messages_fts, 2, '[', ']', '...', 24) AS content_snippet,
            f.sender                             AS role,
            m.created_at                         AS created_at,
            bm25(messages_fts)                   AS rank
        FROM messages_fts f
        JOIN messages     m ON m.id             = CAST(f.message_id      AS INTEGER)
        JOIN conversations c ON c.id            = CAST(f.conversation_id AS INTEGER)
        WHERE messages_fts MATCH ?1
        ORDER BY rank
        LIMIT ?2
    ";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare FTS search statement: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![trimmed, effective_limit], |row| {
            Ok(ChatSearchResult {
                message_id: row.get(0)?,
                conversation_id: row.get(1)?,
                conversation_title: row.get(2)?,
                content_snippet: row.get(3)?,
                role: row.get(4)?,
                created_at: row.get(5)?,
                rank: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to execute FTS search: {e}"))?;

    let results: Result<Vec<ChatSearchResult>, _> = rows.collect();
    results.map_err(|e| format!("Failed to collect FTS search results: {e}"))
}

/// Semantic-like search over chat history using FTS5 + TF-IDF reranking.
///
/// This expands the user query into individual words joined with OR for broader
/// recall via FTS5, then applies TF-IDF cosine similarity reranking on the
/// candidate set to surface the most relevant results.
///
/// Returns up to `limit` results (default 20, max 100) in the same
/// `ChatSearchResult` format as `search_chat_history`.
#[tauri::command]
pub fn search_chat_history_semantic(
    query: String,
    limit: Option<i64>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<ChatSearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query cannot be empty".to_string());
    }

    // Expand query: split into words, join with OR for broader FTS5 recall
    let words: Vec<&str> = trimmed
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|w| !w.is_empty())
        .collect();

    if words.is_empty() {
        return Err("Search query contains no searchable words".to_string());
    }

    let fts_query = words.join(" OR ");
    let effective_limit = limit.unwrap_or(20).clamp(1, 100);

    let conn = db.connection()?;

    // Check FTS table existence
    let fts_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !fts_exists {
        tracing::warn!(
            "search_chat_history_semantic: messages_fts table not found; returning empty results"
        );
        return Ok(Vec::new());
    }

    // Fetch top 50 candidates via FTS5 (broader recall for reranking)
    let sql = "
        SELECT
            CAST(f.message_id AS INTEGER)        AS message_id,
            CAST(f.conversation_id AS INTEGER)   AS conversation_id,
            c.title                              AS conversation_title,
            snippet(messages_fts, 2, '[', ']', '...', 24) AS content_snippet,
            f.sender                             AS role,
            m.created_at                         AS created_at,
            bm25(messages_fts)                   AS rank,
            m.content                            AS full_content
        FROM messages_fts f
        JOIN messages     m ON m.id             = CAST(f.message_id      AS INTEGER)
        JOIN conversations c ON c.id            = CAST(f.conversation_id AS INTEGER)
        WHERE messages_fts MATCH ?1
        ORDER BY rank
        LIMIT 50
    ";

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Failed to prepare semantic search statement: {e}"))?;

    let candidates: Vec<(ChatSearchResult, String)> = stmt
        .query_map(rusqlite::params![&fts_query], |row| {
            Ok((
                ChatSearchResult {
                    message_id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    conversation_title: row.get(2)?,
                    content_snippet: row.get(3)?,
                    role: row.get(4)?,
                    created_at: row.get(5)?,
                    rank: row.get(6)?,
                },
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| format!("Failed to execute semantic search: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // --- TF-IDF reranking ---
    // Tokenize query
    let query_tokens: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();

    // Build document frequency (IDF) from candidate set
    let mut doc_freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let doc_count = candidates.len() as f64;

    let doc_tokens: Vec<Vec<String>> = candidates
        .iter()
        .map(|(_, full_content)| {
            full_content
                .to_lowercase()
                .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
                .filter(|w| !w.is_empty())
                .map(String::from)
                .collect()
        })
        .collect();

    for tokens in &doc_tokens {
        let unique: std::collections::HashSet<&String> = tokens.iter().collect();
        for token in unique {
            *doc_freq.entry(token.clone()).or_insert(0) += 1;
        }
    }

    // Compute IDF: log(N / df)
    let idf = |term: &str| -> f64 {
        let df = doc_freq.get(term).copied().unwrap_or(0) as f64;
        if df == 0.0 {
            0.0
        } else {
            (doc_count / df).ln()
        }
    };

    // TF-IDF vector for the query
    let query_tfidf: Vec<(String, f64)> = query_tokens
        .iter()
        .map(|t| {
            let tf = 1.0; // each query term appears once
            (t.clone(), tf * idf(t))
        })
        .collect();

    // Compute cosine similarity for each candidate
    let mut scored: Vec<(usize, f64)> = Vec::with_capacity(candidates.len());
    for (idx, tokens) in doc_tokens.iter().enumerate() {
        // Compute TF for this document
        let mut term_freq: std::collections::HashMap<&str, f64> = std::collections::HashMap::new();
        let total = tokens.len() as f64;
        if total == 0.0 {
            scored.push((idx, 0.0));
            continue;
        }
        for token in tokens {
            *term_freq.entry(token.as_str()).or_insert(0.0) += 1.0;
        }

        // Compute dot product and magnitudes
        let mut dot = 0.0_f64;
        let mut mag_q = 0.0_f64;
        let mut mag_d = 0.0_f64;

        for (term, q_tfidf) in &query_tfidf {
            let d_tf = term_freq.get(term.as_str()).copied().unwrap_or(0.0) / total;
            let d_tfidf = d_tf * idf(term);
            dot += q_tfidf * d_tfidf;
            mag_q += q_tfidf * q_tfidf;
            mag_d += d_tfidf * d_tfidf;
        }

        let cosine = if mag_q > 0.0 && mag_d > 0.0 {
            dot / (mag_q.sqrt() * mag_d.sqrt())
        } else {
            0.0
        };

        scored.push((idx, cosine));
    }

    // Sort by cosine similarity descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Return top `effective_limit` results with cosine score as rank
    let results: Vec<ChatSearchResult> = scored
        .into_iter()
        .take(effective_limit as usize)
        .map(|(idx, cosine_score)| {
            let mut result = candidates[idx].0.clone();
            result.rank = cosine_score;
            result
        })
        .collect();

    Ok(results)
}
