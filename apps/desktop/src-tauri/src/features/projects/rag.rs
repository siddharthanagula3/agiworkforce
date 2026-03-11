use anyhow::Result;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

static HTML_TAG_RE: Lazy<regex::Regex> =
    Lazy::new(|| regex::Regex::new(r"<[^>]*>").expect("valid regex: HTML tag pattern"));

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
    embedding_generator: Option<Arc<crate::core::embeddings::EmbeddingGenerator>>,
}

impl RAGEngine {
    pub fn new(chunking_config: ChunkingConfig) -> Self {
        Self {
            chunking_config,
            embedding_generator: None,
        }
    }

    pub fn with_embeddings(
        chunking_config: ChunkingConfig,
        generator: Arc<crate::core::embeddings::EmbeddingGenerator>,
    ) -> Self {
        Self {
            chunking_config,
            embedding_generator: Some(generator),
        }
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

    /// Generate a semantic embedding for the given text.
    ///
    /// When an `EmbeddingGenerator` is available (via `with_embeddings`), this
    /// produces real semantic embeddings (Ollama nomic-embed-text or similar).
    /// Falls back to a hash-based bag-of-words vector when no generator is
    /// configured or when the generator fails.
    pub async fn generate_embedding(&self, text: &str) -> Result<Vec<f32>> {
        if let Some(gen) = &self.embedding_generator {
            match gen.generate(text).await {
                Ok(vector) => return Ok(vector),
                Err(e) => {
                    tracing::warn!(
                        "Real embedding generation failed, using hash fallback: {}",
                        e
                    );
                }
            }
        }

        tracing::warn!("RAG using hash-based embeddings — semantic quality degraded");
        self.generate_hash_embedding(text)
    }

    /// Hash-based bag-of-words embedding (384-dim). NOT semantic — used only as
    /// a degraded fallback when no real embedding provider is available.
    fn generate_hash_embedding(&self, text: &str) -> Result<Vec<f32>> {
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut embedding = vec![0.0f32; 384];

        for (i, word) in words.iter().enumerate() {
            let hash = word
                .bytes()
                .fold(0u64, |acc, b| acc.wrapping_add(b as u64).wrapping_mul(31));
            let idx = (hash % 384) as usize;
            embedding[idx] += 1.0 / (1.0 + i as f32);
        }

        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for x in embedding.iter_mut() {
                *x /= norm;
            }
        }

        Ok(embedding)
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
            self.find_similar_chunks(query_embedding, semantic_chunks, top_k * 2);

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
            let mut additional =
                self.find_similar_chunks(query_embedding, vec![], top_k - final_results.len());
            final_results.append(&mut additional);
        }

        final_results
    }

    pub fn extract_text_from_file(&self, file_path: &str, file_type: &str) -> Result<String> {
        match file_type.to_lowercase().as_str() {
            "txt" | "md" | "markdown" | "rs" | "ts" | "tsx" | "js" | "json" | "toml" | "yaml"
            | "yml" => {
                let content = std::fs::read_to_string(file_path)?;
                Ok(content)
            }
            "pdf" => pdf_extract::extract_text(file_path)
                .map_err(|e| anyhow::anyhow!("Failed to extract PDF text: {}", e)),
            "docx" => {
                let file = std::fs::File::open(file_path)?;
                let mut archive = zip::ZipArchive::new(file)?;

                let mut document_xml = archive
                    .by_name("word/document.xml")
                    .map_err(|_| anyhow::anyhow!("Invalid DOCX: missing word/document.xml"))?;

                let mut xml_content = String::new();
                std::io::Read::read_to_string(&mut document_xml, &mut xml_content)?;

                let text = HTML_TAG_RE.replace_all(&xml_content, "").to_string();

                Ok(text)
            }
            "html" | "htm" => {
                let content = std::fs::read_to_string(file_path)?;
                Ok(self.strip_html_tags(&content))
            }
            _ => match std::fs::read_to_string(file_path) {
                Ok(content) => Ok(content),
                Err(_) => Ok(format!("Unsupported file type: {}", file_type)),
            },
        }
    }

    fn strip_html_tags(&self, html: &str) -> String {
        HTML_TAG_RE.replace_all(html, " ").to_string()
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
