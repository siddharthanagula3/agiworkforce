use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::{EmbeddingMetadata, Vector};

const ANN_SIGNATURE_BITS: usize = 16;
const ANN_EXPANSION_LIMIT: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub metadata: EmbeddingMetadata,
    pub similarity: f32,
}

pub struct SimilaritySearch {
    db: Connection,
}

impl SimilaritySearch {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let db = Connection::open(db_path)?;
        let search = Self { db };
        search.init_schema()?;
        Ok(search)
    }

    pub fn new_in_memory() -> Result<Self> {
        let db = Connection::open_in_memory()?;
        let search = Self { db };
        search.init_schema()?;
        Ok(search)
    }

    fn init_schema(&self) -> Result<()> {
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS embeddings (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                language TEXT NOT NULL,
                symbol_name TEXT,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                embedding BLOB NOT NULL,
                dimensions INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_file_path ON embeddings(file_path)",
            [],
        )?;

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_language ON embeddings(language)",
            [],
        )?;

        // Migration: add model_id column if missing (existing databases
        // created before model tracking was introduced).
        let has_model_id: bool = self
            .db
            .prepare("PRAGMA table_info(embeddings)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .any(|col| col == "model_id");

        if !has_model_id {
            self.db
                .execute("ALTER TABLE embeddings ADD COLUMN model_id TEXT", [])?;
        }

        let has_ann_bucket: bool = self
            .db
            .prepare("PRAGMA table_info(embeddings)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .any(|col| col == "ann_bucket");

        if !has_ann_bucket {
            self.db
                .execute("ALTER TABLE embeddings ADD COLUMN ann_bucket TEXT", [])?;
        }

        // Index on model_id for efficient same-model filtering during search.
        // Must come AFTER the column migration above.
        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_model_id ON embeddings(model_id)",
            [],
        )?;

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_ann_bucket ON embeddings(ann_bucket)",
            [],
        )?;

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_embeddings_model_bucket ON embeddings(model_id, ann_bucket)",
            [],
        )?;

        self.backfill_ann_buckets()?;

        Ok(())
    }

    fn backfill_ann_buckets(&self) -> Result<()> {
        let mut stmt = self.db.prepare(
            "SELECT id, embedding FROM embeddings WHERE ann_bucket IS NULL OR ann_bucket = ''",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
        })?;

        for row in rows {
            let (id, embedding_blob) = row?;
            let embedding = deserialize_vector(&embedding_blob)?;
            let bucket = compute_ann_bucket(&embedding);
            self.db.execute(
                "UPDATE embeddings SET ann_bucket = ?1 WHERE id = ?2",
                params![bucket, id],
            )?;
        }

        Ok(())
    }

    pub fn add_embedding(
        &mut self,
        id: &str,
        embedding: Vector,
        metadata: EmbeddingMetadata,
    ) -> Result<()> {
        let embedding_blob = serialize_vector(&embedding)?;
        let dimensions = embedding.len() as i32;
        let now = chrono::Utc::now().timestamp();
        let ann_bucket = compute_ann_bucket(&embedding);

        self.db.execute(
            "INSERT OR REPLACE INTO embeddings
            (id, file_path, chunk_index, content, language, symbol_name, start_line, end_line,
             embedding, dimensions, created_at, updated_at, model_id, ann_bucket)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                id,
                metadata.file_path,
                metadata.chunk_index as i32,
                metadata.content,
                metadata.language,
                metadata.symbol_name,
                metadata.start_line,
                metadata.end_line,
                embedding_blob,
                dimensions,
                metadata.created_at,
                now,
                metadata.model_id,
                ann_bucket,
            ],
        )?;

        Ok(())
    }

    /// Search for embeddings similar to the query vector.
    ///
    /// When `model_id` is `Some`, only embeddings produced by that model are
    /// compared.  Different embedding models produce incompatible vector spaces,
    /// so cross-model comparison is meaningless.  When `model_id` is `None`
    /// (e.g. for legacy data), all embeddings are searched.
    pub fn search(&self, query_embedding: Vector, limit: usize) -> Result<Vec<SearchResult>> {
        self.search_with_model(query_embedding, limit, None)
    }

    /// Search for embeddings, optionally restricting to a specific model.
    pub fn search_with_model(
        &self,
        query_embedding: Vector,
        limit: usize,
        model_id: Option<&str>,
    ) -> Result<Vec<SearchResult>> {
        let mut results: Vec<SearchResult> = Vec::new();
        let query_bucket = compute_ann_bucket(&query_embedding);
        let candidate_buckets = generate_candidate_buckets(&query_bucket, ANN_EXPANSION_LIMIT);
        let mut seen_ids = std::collections::HashSet::new();

        let row_mapper = |row: &rusqlite::Row| {
            let id: String = row.get(0)?;
            let file_path: String = row.get(1)?;
            let chunk_index: i32 = row.get(2)?;
            let content: String = row.get(3)?;
            let language: String = row.get(4)?;
            let symbol_name: Option<String> = row.get(5)?;
            let start_line: u32 = row.get(6)?;
            let end_line: u32 = row.get(7)?;
            let embedding_blob: Vec<u8> = row.get(8)?;
            let created_at: i64 = row.get(9)?;
            let row_model_id: Option<String> = row.get(10)?;

            Ok((
                id,
                file_path,
                chunk_index,
                content,
                language,
                symbol_name,
                start_line,
                end_line,
                embedding_blob,
                created_at,
                row_model_id,
            ))
        };

        for bucket in candidate_buckets {
            let sql = if model_id.is_some() {
                "SELECT id, file_path, chunk_index, content, language, symbol_name,
                        start_line, end_line, embedding, created_at, model_id
                 FROM embeddings
                 WHERE model_id = ?1 AND ann_bucket = ?2"
            } else {
                "SELECT id, file_path, chunk_index, content, language, symbol_name,
                        start_line, end_line, embedding, created_at, model_id
                 FROM embeddings
                 WHERE ann_bucket = ?1"
            };

            let mut stmt = self.db.prepare(sql)?;
            let rows: Vec<_> = if let Some(model_id) = model_id {
                stmt.query_map(params![model_id, bucket], row_mapper)?
                    .collect()
            } else {
                stmt.query_map(params![bucket], row_mapper)?.collect()
            };

            for row in rows {
                let (
                    id,
                    file_path,
                    chunk_index,
                    content,
                    language,
                    symbol_name,
                    start_line,
                    end_line,
                    embedding_blob,
                    created_at,
                    row_model_id,
                ) = row?;

                if !seen_ids.insert(id.clone()) {
                    continue;
                }

                let embedding = deserialize_vector(&embedding_blob)?;
                let similarity = cosine_similarity(&query_embedding, &embedding);

                results.push(SearchResult {
                    metadata: EmbeddingMetadata {
                        id,
                        file_path,
                        chunk_index: chunk_index as usize,
                        content,
                        language,
                        symbol_name,
                        start_line,
                        end_line,
                        created_at,
                        model_id: row_model_id,
                    },
                    similarity,
                });
            }

            if results.len() >= limit.saturating_mul(4).max(limit) {
                break;
            }
        }

        if results.len() < limit {
            let sql = if model_id.is_some() {
                "SELECT id, file_path, chunk_index, content, language, symbol_name,
                        start_line, end_line, embedding, created_at, model_id
                 FROM embeddings
                 WHERE model_id = ?1"
            } else {
                "SELECT id, file_path, chunk_index, content, language, symbol_name,
                        start_line, end_line, embedding, created_at, model_id
                 FROM embeddings"
            };

            let mut stmt = self.db.prepare(sql)?;
            let rows: Vec<_> = if let Some(model_id) = model_id {
                stmt.query_map(params![model_id], row_mapper)?.collect()
            } else {
                stmt.query_map([], row_mapper)?.collect()
            };

            for row in rows {
                let (
                    id,
                    file_path,
                    chunk_index,
                    content,
                    language,
                    symbol_name,
                    start_line,
                    end_line,
                    embedding_blob,
                    created_at,
                    row_model_id,
                ) = row?;

                if !seen_ids.insert(id.clone()) {
                    continue;
                }

                let embedding = deserialize_vector(&embedding_blob)?;
                let similarity = cosine_similarity(&query_embedding, &embedding);

                results.push(SearchResult {
                    metadata: EmbeddingMetadata {
                        id,
                        file_path,
                        chunk_index: chunk_index as usize,
                        content,
                        language,
                        symbol_name,
                        start_line,
                        end_line,
                        created_at,
                        model_id: row_model_id,
                    },
                    similarity,
                });
            }
        }

        results.sort_by(|a, b| {
            b.similarity
                .partial_cmp(&a.similarity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        results.truncate(limit);

        Ok(results)
    }

    pub fn search_in_file(
        &self,
        file_path: &str,
        query_embedding: Vector,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        let mut stmt = self.db.prepare(
            "SELECT id, file_path, chunk_index, content, language, symbol_name,
                    start_line, end_line, embedding, created_at, model_id
             FROM embeddings
             WHERE file_path = ?1",
        )?;

        let mut results: Vec<SearchResult> = Vec::new();

        let rows = stmt.query_map(params![file_path], |row| {
            let id: String = row.get(0)?;
            let file_path: String = row.get(1)?;
            let chunk_index: i32 = row.get(2)?;
            let content: String = row.get(3)?;
            let language: String = row.get(4)?;
            let symbol_name: Option<String> = row.get(5)?;
            let start_line: u32 = row.get(6)?;
            let end_line: u32 = row.get(7)?;
            let embedding_blob: Vec<u8> = row.get(8)?;
            let created_at: i64 = row.get(9)?;
            let row_model_id: Option<String> = row.get(10)?;

            Ok((
                id,
                file_path,
                chunk_index,
                content,
                language,
                symbol_name,
                start_line,
                end_line,
                embedding_blob,
                created_at,
                row_model_id,
            ))
        })?;

        for row in rows {
            let (
                id,
                file_path,
                chunk_index,
                content,
                language,
                symbol_name,
                start_line,
                end_line,
                embedding_blob,
                created_at,
                row_model_id,
            ) = row?;

            let embedding = deserialize_vector(&embedding_blob)?;
            let similarity = cosine_similarity(&query_embedding, &embedding);

            results.push(SearchResult {
                metadata: EmbeddingMetadata {
                    id,
                    file_path,
                    chunk_index: chunk_index as usize,
                    content,
                    language,
                    symbol_name,
                    start_line,
                    end_line,
                    created_at,
                    model_id: row_model_id,
                },
                similarity,
            });
        }

        results.sort_by(|a, b| {
            b.similarity
                .partial_cmp(&a.similarity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        results.truncate(limit);

        Ok(results)
    }

    pub fn delete_file_embeddings(&mut self, file_path: &str) -> Result<usize> {
        let count = self.db.execute(
            "DELETE FROM embeddings WHERE file_path = ?1",
            params![file_path],
        )?;

        Ok(count)
    }

    pub fn count_embeddings(&self) -> Result<usize> {
        let count: i64 = self
            .db
            .query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;

        Ok(count as usize)
    }

    pub fn get_file_embeddings(&self, file_path: &str) -> Result<Vec<EmbeddingMetadata>> {
        let mut stmt = self.db.prepare(
            "SELECT id, file_path, chunk_index, content, language, symbol_name,
                    start_line, end_line, created_at, model_id
             FROM embeddings
             WHERE file_path = ?1
             ORDER BY chunk_index",
        )?;

        let embeddings = stmt
            .query_map(params![file_path], |row| {
                Ok(EmbeddingMetadata {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    chunk_index: row.get::<_, i32>(2)? as usize,
                    content: row.get(3)?,
                    language: row.get(4)?,
                    symbol_name: row.get(5)?,
                    start_line: row.get(6)?,
                    end_line: row.get(7)?,
                    created_at: row.get(8)?,
                    model_id: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(embeddings)
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if magnitude_a == 0.0 || magnitude_b == 0.0 {
        return 0.0;
    }

    dot_product / (magnitude_a * magnitude_b)
}

fn serialize_vector(vector: &[f32]) -> Result<Vec<u8>> {
    bincode::serialize(vector).context("Failed to serialize vector")
}

fn deserialize_vector(bytes: &[u8]) -> Result<Vector> {
    bincode::deserialize(bytes).context("Failed to deserialize vector")
}

fn compute_ann_bucket(vector: &[f32]) -> String {
    vector
        .iter()
        .take(ANN_SIGNATURE_BITS)
        .map(|value| if *value >= 0.0 { '1' } else { '0' })
        .collect()
}

fn generate_candidate_buckets(bucket: &str, limit: usize) -> Vec<String> {
    let mut candidates = Vec::with_capacity(limit.max(1));
    candidates.push(bucket.to_string());

    let chars: Vec<char> = bucket.chars().collect();

    for i in 0..chars.len() {
        if candidates.len() >= limit {
            break;
        }
        let mut one_flip = chars.clone();
        one_flip[i] = if one_flip[i] == '1' { '0' } else { '1' };
        candidates.push(one_flip.into_iter().collect());
    }

    for i in 0..chars.len() {
        for j in (i + 1)..chars.len() {
            if candidates.len() >= limit {
                break;
            }
            let mut two_flip = chars.clone();
            two_flip[i] = if two_flip[i] == '1' { '0' } else { '1' };
            two_flip[j] = if two_flip[j] == '1' { '0' } else { '1' };
            candidates.push(two_flip.into_iter().collect());
        }
        if candidates.len() >= limit {
            break;
        }
    }

    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 0.001);

        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 0.0).abs() < 0.001);

        let a = vec![1.0, 1.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let expected = 1.0 / 2.0_f32.sqrt();
        assert!((cosine_similarity(&a, &b) - expected).abs() < 0.001);
    }

    #[test]
    fn test_vector_serialization() {
        let vector = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let serialized = serialize_vector(&vector).unwrap();
        let deserialized = deserialize_vector(&serialized).unwrap();
        assert_eq!(vector, deserialized);
    }

    #[test]
    fn test_new_in_memory_initializes_schema() {
        let search = SimilaritySearch::new_in_memory().unwrap();
        assert_eq!(search.count_embeddings().unwrap(), 0);
    }

    #[test]
    fn test_ann_bucket_generation_is_stable() {
        let bucket = compute_ann_bucket(&[
            1.0, -1.0, 0.1, -0.2, 0.0, 2.0, -3.0, 4.0, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8, 0.9, -1.0,
        ]);
        assert_eq!(bucket.len(), ANN_SIGNATURE_BITS);
        assert_eq!(bucket, "1010101010101010");
    }

    #[test]
    fn test_search_with_model_uses_ann_candidates() {
        let mut search = SimilaritySearch::new_in_memory().unwrap();
        let model_id = "test-model".to_string();
        let target = vec![1.0; 16];
        let metadata = EmbeddingMetadata::new(
            "src/main.rs".to_string(),
            0,
            "fn main() {}".to_string(),
            "rust".to_string(),
            1,
            1,
        )
        .with_model_id(model_id.clone());

        search
            .add_embedding(&metadata.id.clone(), target.clone(), metadata)
            .unwrap();

        let results = search
            .search_with_model(target, 1, Some(&model_id))
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].metadata.file_path, "src/main.rs");
    }
}
