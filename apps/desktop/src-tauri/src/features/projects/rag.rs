use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::knowledge::{KnowledgeChunk, KnowledgeDocument};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkingConfig {
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub min_chunk_size: usize,
    pub split_on_sentences: bool,
}

impl Default for ChunkingConfig {
    fn default() -> Self {
        Self {
            chunk_size: 1000,
            chunk_overlap: 200,
            min_chunk_size: 100,
            split_on_sentences: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGResult {
    pub chunk_id: String,
    pub content: String,
    pub similarity: f32,
    pub source_file: String,
    pub chunk_index: u32,
}

pub struct RAGEngine {
    chunking_config: ChunkingConfig,
}

impl RAGEngine {
    pub fn new(chunking_config: ChunkingConfig) -> Self {
        Self { chunking_config }
    }

    pub fn chunk_document(&self, document: &KnowledgeDocument) -> Result<Vec<KnowledgeChunk>> {
        let content = &document.content;

        let chunks = if self.chunking_config.split_on_sentences {
            self.chunk_by_sentences(content, document)?
        } else {
            self.chunk_by_size(content, document)?
        };

        Ok(chunks)
    }

    fn chunk_by_sentences(
        &self,
        content: &str,
        document: &KnowledgeDocument,
    ) -> Result<Vec<KnowledgeChunk>> {
        let sentences: Vec<&str> = content
            .split(&['.', '!', '?'][..])
            .filter(|s| !s.trim().is_empty())
            .collect();

        let mut chunks = Vec::new();
        let mut current_chunk = String::new();
        let mut chunk_index = 0;

        for sentence in sentences {
            let sentence_trimmed = sentence.trim();

            if current_chunk.len() + sentence_trimmed.len() > self.chunking_config.chunk_size {
                if current_chunk.len() >= self.chunking_config.min_chunk_size {
                    chunks.push(self.create_chunk(&current_chunk, document, chunk_index)?);
                    chunk_index += 1;

                    let overlap_sentences: Vec<&str> = current_chunk
                        .split(&['.', '!', '?'][..])
                        .rev()
                        .take(2)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect();

                    current_chunk = overlap_sentences.join(". ") + ". ";
                } else {
                    current_chunk.clear();
                }
            }

            current_chunk.push_str(sentence_trimmed);
            current_chunk.push_str(". ");
        }

        if current_chunk.len() >= self.chunking_config.min_chunk_size {
            chunks.push(self.create_chunk(&current_chunk, document, chunk_index)?);
        }

        Ok(chunks)
    }

    fn chunk_by_size(
        &self,
        content: &str,
        document: &KnowledgeDocument,
    ) -> Result<Vec<KnowledgeChunk>> {
        let mut chunks = Vec::new();
        let mut chunk_index = 0;
        let mut start = 0;

        while start < content.len() {
            let mut end = std::cmp::min(start + self.chunking_config.chunk_size, content.len());

            // Ensure we don't slice in the middle of a multi-byte UTF-8 character
            while end < content.len() && !content.is_char_boundary(end) {
                end += 1;
            }

            let chunk_content = &content[start..end];

            if chunk_content.len() >= self.chunking_config.min_chunk_size {
                chunks.push(self.create_chunk(chunk_content, document, chunk_index)?);
                chunk_index += 1;
            }

            let overlap = self.chunking_config.chunk_overlap;
            if end <= overlap {
                break;
            }
            start = end - overlap;
            // Ensure overlap start is also on a char boundary
            while start > 0 && !content.is_char_boundary(start) {
                start -= 1;
            }
            if start >= content.len() {
                break;
            }
        }

        Ok(chunks)
    }

    fn create_chunk(
        &self,
        content: &str,
        document: &KnowledgeDocument,
        chunk_index: u32,
    ) -> Result<KnowledgeChunk> {
        Ok(KnowledgeChunk {
            id: format!("{}-chunk-{}", document.id, chunk_index),
            document_id: document.id.clone(),
            project_id: document.project_id.clone(),
            content: content.to_string(),
            chunk_index,
            embedding: None,
            metadata: Some(
                serde_json::json!({
                    "source_file": document.file_name,
                    "file_type": document.file_type,
                })
                .to_string(),
            ),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
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

    pub fn find_similar_chunks(
        &self,
        query_embedding: &[f32],
        chunks: Vec<KnowledgeChunk>,
        top_k: usize,
    ) -> Vec<RAGResult> {
        let mut results: Vec<(KnowledgeChunk, f32)> = chunks
            .into_iter()
            .filter_map(|chunk| {
                if let Some(emb) = chunk.embedding.as_ref() {
                    let similarity = self.cosine_similarity(query_embedding, emb);
                    Some((chunk, similarity))
                } else {
                    None
                }
            })
            .collect();

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        results
            .into_iter()
            .take(top_k)
            .map(|(chunk, similarity)| {
                let metadata: serde_json::Value = chunk
                    .metadata
                    .as_ref()
                    .and_then(|m| serde_json::from_str(m).ok())
                    .unwrap_or_default();

                RAGResult {
                    chunk_id: chunk.id,
                    content: chunk.content,
                    similarity,
                    source_file: metadata["source_file"]
                        .as_str()
                        .unwrap_or("unknown")
                        .to_string(),
                    chunk_index: chunk.chunk_index,
                }
            })
            .collect()
    }

    pub fn hybrid_search(
        &self,
        _query: &str,
        query_embedding: &[f32],
        text_results: Vec<String>,
        semantic_chunks: Vec<KnowledgeChunk>,
        top_k: usize,
    ) -> Vec<RAGResult> {
        let semantic_results =
            self.find_similar_chunks(query_embedding, semantic_chunks.clone(), top_k * 2);

        let mut final_results: Vec<RAGResult> = semantic_results
            .into_iter()
            .filter(|result| {
                text_results
                    .iter()
                    .any(|text| result.content.to_lowercase().contains(&text.to_lowercase()))
            })
            .take(top_k)
            .collect();

        if final_results.len() < top_k {
            // Use the full semantic chunks for the second pass (not an empty vec)
            let existing_ids: std::collections::HashSet<String> =
                final_results.iter().map(|r| r.chunk_id.clone()).collect();
            let remaining_chunks: Vec<KnowledgeChunk> = semantic_chunks
                .into_iter()
                .filter(|c| !existing_ids.contains(&c.id))
                .collect();
            let mut additional = self.find_similar_chunks(
                query_embedding,
                remaining_chunks,
                top_k - final_results.len(),
            );
            final_results.append(&mut additional);
        }

        final_results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let engine = RAGEngine::new(ChunkingConfig::default());

        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];

        let similarity = engine.cosine_similarity(&a, &b);
        assert!((similarity - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_chunking() {
        let engine = RAGEngine::new(ChunkingConfig::default());

        let document = KnowledgeDocument {
            id: "doc1".to_string(),
            project_id: "proj1".to_string(),
            file_path: "/test.txt".to_string(),
            file_name: "test.txt".to_string(),
            file_type: "txt".to_string(),
            size: 1000,
            content: "This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five. This is sentence six."
                .to_string(),
            metadata: None,
            indexed_at: chrono::Utc::now().to_rfc3339(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let chunks = engine.chunk_document(&document).unwrap();
        assert!(!chunks.is_empty());
    }
}
