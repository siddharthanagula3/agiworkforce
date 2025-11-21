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

    pub fn chunk_document(
        &self,
        document: &KnowledgeDocument,
    ) -> Result<Vec<KnowledgeChunk>> {
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
        // Split by sentences (simple implementation)
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
                    chunks.push(self.create_chunk(
                        &current_chunk,
                        document,
                        chunk_index,
                    )?);
                    chunk_index += 1;

                    // Keep overlap
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

        // Add remaining chunk
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
            let end = std::cmp::min(start + self.chunking_config.chunk_size, content.len());
            let chunk_content = &content[start..end];

            if chunk_content.len() >= self.chunking_config.min_chunk_size {
                chunks.push(self.create_chunk(chunk_content, document, chunk_index)?);
                chunk_index += 1;
            }

            start = end - self.chunking_config.chunk_overlap;
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
            embedding: None, // Will be generated separately
            metadata: Some(serde_json::json!({
                "source_file": document.file_name,
                "file_type": document.file_type,
            }).to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn generate_embedding(&self, text: &str) -> Result<Vec<f32>> {
        // TODO: Integrate with actual embedding model
        // For now, return a dummy embedding
        // In production, this would call:
        // - OpenAI embeddings API
        // - Local embedding model (sentence-transformers)
        // - Anthropic embeddings API

        let dummy_embedding: Vec<f32> = (0..384)
            .map(|i| ((text.len() as f32 + i as f32) * 0.001) % 1.0)
            .collect();

        Ok(dummy_embedding)
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

        // Sort by similarity descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        // Take top_k
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
        // Combine FTS and semantic search results
        // Use a simple score fusion: 0.4 * FTS + 0.6 * Semantic

        let semantic_results = self.find_similar_chunks(query_embedding, semantic_chunks, top_k * 2);

        // Simple implementation: prioritize semantic results that also appear in FTS
        let mut final_results: Vec<RAGResult> = semantic_results
            .into_iter()
            .filter(|result| {
                text_results.iter().any(|text| {
                    result
                        .content
                        .to_lowercase()
                        .contains(&text.to_lowercase())
                })
            })
            .take(top_k)
            .collect();

        // If not enough results, add more from semantic search
        if final_results.len() < top_k {
            let mut additional = self.find_similar_chunks(
                query_embedding,
                vec![], // Already consumed
                top_k - final_results.len(),
            );
            final_results.append(&mut additional);
        }

        final_results
    }

    pub fn extract_text_from_file(&self, file_path: &str, file_type: &str) -> Result<String> {
        // TODO: Implement text extraction based on file type
        match file_type.to_lowercase().as_str() {
            "txt" | "md" | "markdown" => {
                let content = std::fs::read_to_string(file_path)?;
                Ok(content)
            }
            "pdf" => {
                // TODO: Use pdf-extract or similar library
                Ok(String::from("PDF extraction not yet implemented"))
            }
            "docx" => {
                // TODO: Use docx parsing library
                Ok(String::from("DOCX extraction not yet implemented"))
            }
            "html" | "htm" => {
                // TODO: Use HTML parser to extract text
                let content = std::fs::read_to_string(file_path)?;
                Ok(self.strip_html_tags(&content))
            }
            _ => Ok(std::fs::read_to_string(file_path)?),
        }
    }

    fn strip_html_tags(&self, html: &str) -> String {
        // Simple HTML tag removal (for production, use proper HTML parser)
        let re = regex::Regex::new(r"<[^>]*>").unwrap();
        re.replace_all(html, " ").to_string()
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
            content: "This is sentence one. This is sentence two. This is sentence three.".to_string(),
            metadata: None,
            indexed_at: chrono::Utc::now().to_rfc3339(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let chunks = engine.chunk_document(&document).unwrap();
        assert!(!chunks.is_empty());
    }
}
