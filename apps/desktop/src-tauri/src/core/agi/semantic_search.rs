//! Semantic Search Module for Memory Manager
//!
//! This module provides TF-IDF based semantic similarity search for the memory system.
//! It runs entirely in-memory with no external ML dependencies.
//!
//! ## Features
//!
//! - TF-IDF vectorization of memory content
//! - Cosine similarity for semantic matching
//! - Configurable hybrid search combining keyword and semantic results
//! - Simple suffix-stripping stemmer
//! - Stopword filtering

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::memory_manager::MemoryEntry;

// =============================================================================
// CONFIGURATION
// =============================================================================

/// Configuration for semantic search functionality
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchConfig {
    /// Whether semantic search is enabled
    pub enabled: bool,
    /// Minimum similarity score (0.0 to 1.0) for results to be included
    pub min_similarity: f32,
    /// Weight for keyword search results (0.0 to 1.0), semantic weight = 1.0 - keyword_weight
    pub keyword_weight: f32,
}

impl Default for SemanticSearchConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            min_similarity: 0.1,
            keyword_weight: 0.4, // 40% keyword, 60% semantic
        }
    }
}

/// Result from semantic search with similarity score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    pub memory: MemoryEntry,
    pub similarity_score: f32,
    pub keyword_score: f32,
    pub combined_score: f32,
}

/// Statistics about the TF-IDF index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    pub document_count: usize,
    pub vocabulary_size: usize,
}

// =============================================================================
// SPARSE VECTOR
// =============================================================================

/// Sparse vector representation for efficient TF-IDF storage
#[derive(Debug, Clone, Default)]
pub struct SparseVector {
    /// (term_index, tf-idf_weight) pairs, sorted by term_index
    entries: Vec<(usize, f32)>,
    /// L2 norm for fast cosine similarity computation
    norm: f32,
}

impl SparseVector {
    pub fn new(mut entries: Vec<(usize, f32)>) -> Self {
        entries.sort_by_key(|(idx, _)| *idx);
        let norm = entries.iter().map(|(_, w)| w * w).sum::<f32>().sqrt();
        Self { entries, norm }
    }

    /// Compute cosine similarity with another sparse vector
    pub fn cosine_similarity(&self, other: &SparseVector) -> f32 {
        if self.norm == 0.0 || other.norm == 0.0 {
            return 0.0;
        }

        let mut dot_product = 0.0;
        let mut i = 0;
        let mut j = 0;

        // Merge-style iteration over sorted sparse vectors
        while i < self.entries.len() && j < other.entries.len() {
            let (idx_a, val_a) = self.entries[i];
            let (idx_b, val_b) = other.entries[j];

            match idx_a.cmp(&idx_b) {
                std::cmp::Ordering::Equal => {
                    dot_product += val_a * val_b;
                    i += 1;
                    j += 1;
                }
                std::cmp::Ordering::Less => i += 1,
                std::cmp::Ordering::Greater => j += 1,
            }
        }

        dot_product / (self.norm * other.norm)
    }
}

// =============================================================================
// STOPWORDS AND STEMMING
// =============================================================================

/// Common English stopwords to filter out during tokenization
const STOPWORDS: &[&str] = &[
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need",
    "dare", "ought", "used", "it", "its", "this", "that", "these", "those", "i", "you", "he",
    "she", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "our", "their",
    "mine", "yours", "hers", "ours", "theirs", "what", "which", "who", "whom", "whose", "where",
    "when", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "also",
];

// =============================================================================
// TF-IDF INDEX
// =============================================================================

/// TF-IDF index for semantic similarity search, with optional dense embedding support.
///
/// This provides a lightweight vector-based search without external ML dependencies.
/// Documents are represented as sparse TF-IDF vectors, and similarity is computed
/// using cosine similarity. When real (dense) embeddings are available, they are
/// blended with TF-IDF scores for higher-quality retrieval.
#[derive(Debug, Default)]
pub struct TfIdfIndex {
    /// Maps terms to their index in the vocabulary
    vocabulary: HashMap<String, usize>,
    /// Inverse document frequency scores for each term
    idf_scores: Vec<f32>,
    /// Document vectors indexed by memory ID (sparse representation)
    document_vectors: HashMap<i64, SparseVector>,
    /// Total number of documents in the index
    document_count: usize,
    /// Document frequency for each term (number of documents containing the term)
    document_frequencies: Vec<usize>,
    /// Optional dense embeddings stored per document (from external embedding models).
    /// When populated via `set_dense_embedding`, the `search_with_embedding` method
    /// blends dense cosine similarity (60%) with TF-IDF (40%) for higher-quality retrieval.
    dense_embeddings: HashMap<i64, Vec<f32>>,
}

impl TfIdfIndex {
    /// Create a new empty TF-IDF index
    pub fn new() -> Self {
        Self::default()
    }

    /// Tokenize text into lowercase words, removing stopwords and punctuation
    pub fn tokenize(text: &str) -> Vec<String> {
        let stopwords: HashSet<&str> = STOPWORDS.iter().copied().collect();

        text.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|word| !word.is_empty() && word.len() > 1 && !stopwords.contains(word))
            .map(Self::stem_word)
            .collect()
    }

    /// Simple suffix-stripping stemmer (Porter-like, but simplified)
    pub fn stem_word(word: &str) -> String {
        let mut result = word.to_string();

        // Common suffix removals (order matters - longer suffixes first)
        let suffixes = [
            ("ational", "ate"),
            ("tional", "tion"),
            ("ization", "ize"),
            ("isation", "ize"),
            ("iveness", "ive"),
            ("fulness", "ful"),
            ("ousness", "ous"),
            ("ation", "ate"),
            ("ator", "ate"),
            ("alism", "al"),
            ("aliti", "al"),
            ("iviti", "ive"),
            ("biliti", "ble"),
            ("enci", "ence"),
            ("anci", "ance"),
            ("izer", "ize"),
            ("alli", "al"),
            ("entli", "ent"),
            ("ousli", "ous"),
            ("eli", "e"),
            ("edly", ""),
            ("ing", ""),
            ("ies", "y"),
            ("es", ""),
            ("ed", ""),
            ("ly", ""),
            ("er", ""),
            ("s", ""),
        ];

        for (suffix, replacement) in suffixes {
            if result.len() > suffix.len() + 2 && result.ends_with(suffix) {
                result = format!("{}{}", &result[..result.len() - suffix.len()], replacement);
                break;
            }
        }

        result
    }

    /// Compute term frequency for a document (augmented TF)
    fn compute_tf(tokens: &[String]) -> HashMap<String, f32> {
        let mut tf: HashMap<String, usize> = HashMap::new();
        for token in tokens {
            *tf.entry(token.clone()).or_insert(0) += 1;
        }

        let max_freq = tf.values().max().copied().unwrap_or(1) as f32;
        tf.into_iter()
            .map(|(term, freq)| (term, 0.5 + 0.5 * (freq as f32 / max_freq)))
            .collect()
    }

    /// Build or rebuild the entire index from a set of memories
    pub fn build_from_memories(&mut self, memories: &[MemoryEntry]) {
        // Reset the index (dense_embeddings are preserved since they come from external sources)
        self.vocabulary.clear();
        self.idf_scores.clear();
        self.document_vectors.clear();
        self.document_frequencies.clear();
        self.document_count = memories.len();

        if memories.is_empty() {
            return;
        }

        // First pass: collect all terms and document frequencies
        let mut term_doc_freq: HashMap<String, usize> = HashMap::new();
        let mut doc_tokens: Vec<(i64, Vec<String>)> = Vec::with_capacity(memories.len());

        for memory in memories {
            let text = format!(
                "{} {} {}",
                memory.topic,
                memory.content,
                memory.category.as_str()
            );
            let tokens = Self::tokenize(&text);

            // Count document frequency (each term counted once per document)
            let unique_terms: HashSet<&String> = tokens.iter().collect();
            for term in unique_terms {
                *term_doc_freq.entry(term.clone()).or_insert(0) += 1;
            }

            doc_tokens.push((memory.id, tokens));
        }

        // Build vocabulary and IDF scores
        let num_docs = memories.len() as f32;
        for (term, doc_freq) in term_doc_freq {
            let idx = self.vocabulary.len();
            self.vocabulary.insert(term, idx);
            // IDF with smoothing: log((N + 1) / (df + 1)) + 1
            let idf = ((num_docs + 1.0) / (doc_freq as f32 + 1.0)).ln() + 1.0;
            self.idf_scores.push(idf);
            self.document_frequencies.push(doc_freq);
        }

        // Second pass: build document vectors
        for (memory_id, tokens) in doc_tokens {
            let tf = Self::compute_tf(&tokens);
            let mut entries: Vec<(usize, f32)> = Vec::new();

            for (term, tf_score) in tf {
                if let Some(&idx) = self.vocabulary.get(&term) {
                    let tfidf = tf_score * self.idf_scores[idx];
                    entries.push((idx, tfidf));
                }
            }

            self.document_vectors
                .insert(memory_id, SparseVector::new(entries));
        }
    }

    /// Update the index when a single memory changes
    pub fn update_memory(&mut self, memory_id: i64, content: &str, topic: &str, category: &str) {
        let text = format!("{} {} {}", topic, content, category);
        let tokens = Self::tokenize(&text);
        let tf = Self::compute_tf(&tokens);

        // Check for new terms and add them to vocabulary
        for term in tf.keys() {
            if !self.vocabulary.contains_key(term) {
                let idx = self.vocabulary.len();
                self.vocabulary.insert(term.clone(), idx);
                // Estimate IDF for new term (will be refined on next full rebuild)
                let doc_count = self.document_count.max(1) as f32;
                let idf = (doc_count / 1.0).ln() + 1.0;
                self.idf_scores.push(idf);
                self.document_frequencies.push(1);
            }
        }

        // Build the document vector
        let mut entries: Vec<(usize, f32)> = Vec::new();
        for (term, tf_score) in tf {
            if let Some(&idx) = self.vocabulary.get(&term) {
                let tfidf = tf_score * self.idf_scores[idx];
                entries.push((idx, tfidf));
            }
        }

        // Update document count if this is a new document
        if !self.document_vectors.contains_key(&memory_id) {
            self.document_count += 1;
        }

        self.document_vectors
            .insert(memory_id, SparseVector::new(entries));
    }

    /// Remove a memory from the index (including any dense embedding)
    pub fn remove_memory(&mut self, memory_id: i64) {
        if self.document_vectors.remove(&memory_id).is_some() {
            self.document_count = self.document_count.saturating_sub(1);
        }
        self.dense_embeddings.remove(&memory_id);
    }

    /// Search the index for memories similar to the query
    /// Returns (memory_id, similarity_score) pairs sorted by similarity
    pub fn search(&self, query: &str, limit: usize) -> Vec<(i64, f32)> {
        if self.vocabulary.is_empty() || self.document_vectors.is_empty() {
            return Vec::new();
        }

        // Tokenize and vectorize the query
        let tokens = Self::tokenize(query);
        if tokens.is_empty() {
            return Vec::new();
        }

        let tf = Self::compute_tf(&tokens);
        let mut query_entries: Vec<(usize, f32)> = Vec::new();

        for (term, tf_score) in tf {
            if let Some(&idx) = self.vocabulary.get(&term) {
                let tfidf = tf_score * self.idf_scores[idx];
                query_entries.push((idx, tfidf));
            }
        }

        if query_entries.is_empty() {
            return Vec::new();
        }

        let query_vector = SparseVector::new(query_entries);

        // Compute similarity with all documents
        let mut scores: Vec<(i64, f32)> = self
            .document_vectors
            .iter()
            .map(|(&id, vec)| (id, query_vector.cosine_similarity(vec)))
            .filter(|(_, score)| *score > 0.0)
            .collect();

        // Sort by similarity (descending)
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scores.truncate(limit);

        scores
    }

    /// Store a dense embedding for a document (from an external embedding model).
    /// When available, `search_with_embedding` will blend dense cosine similarity
    /// with TF-IDF scores for higher-quality retrieval.
    pub fn set_dense_embedding(&mut self, memory_id: i64, embedding: Vec<f32>) {
        if !embedding.is_empty() && embedding.iter().any(|&v| v != 0.0) {
            self.dense_embeddings.insert(memory_id, embedding);
        }
    }

    /// Remove a dense embedding
    pub fn remove_dense_embedding(&mut self, memory_id: i64) {
        self.dense_embeddings.remove(&memory_id);
    }

    /// Search using a query embedding (cosine similarity on dense vectors),
    /// blended with TF-IDF results when both are available.
    ///
    /// Scoring: 60% dense cosine similarity + 40% TF-IDF similarity.
    /// Falls back to TF-IDF-only when no dense embeddings are stored.
    pub fn search_with_embedding(
        &self,
        query_text: &str,
        query_embedding: Option<&[f32]>,
        limit: usize,
    ) -> Vec<(i64, f32)> {
        let tfidf_results = self.search(query_text, limit * 2);

        // If no query embedding or no dense embeddings stored, return TF-IDF only
        let query_emb = match query_embedding {
            Some(e) if !self.dense_embeddings.is_empty() && !e.is_empty() => e,
            _ => {
                let mut results = tfidf_results;
                results.truncate(limit);
                return results;
            }
        };

        // Compute dense cosine similarity for all documents that have embeddings
        let mut dense_scores: HashMap<i64, f32> = HashMap::new();
        let query_norm = query_emb.iter().map(|v| v * v).sum::<f32>().sqrt();
        if query_norm > 0.0 {
            for (&doc_id, doc_emb) in &self.dense_embeddings {
                let doc_norm = doc_emb.iter().map(|v| v * v).sum::<f32>().sqrt();
                if doc_norm > 0.0 {
                    let dot: f32 = query_emb
                        .iter()
                        .zip(doc_emb.iter())
                        .map(|(a, b)| a * b)
                        .sum();
                    let similarity = dot / (query_norm * doc_norm);
                    if similarity > 0.0 {
                        dense_scores.insert(doc_id, similarity);
                    }
                }
            }
        }

        // Merge TF-IDF and dense scores
        let mut merged: HashMap<i64, f32> = HashMap::new();

        // Normalize TF-IDF scores
        let tfidf_max = tfidf_results.iter().map(|(_, s)| *s).fold(0.0f32, f32::max);

        for (id, score) in &tfidf_results {
            let norm_tfidf = if tfidf_max > 0.0 {
                score / tfidf_max
            } else {
                0.0
            };
            merged.insert(*id, norm_tfidf * 0.4);
        }

        // Blend dense scores (60% weight)
        for (id, dense_score) in &dense_scores {
            let entry = merged.entry(*id).or_insert(0.0);
            *entry += dense_score * 0.6;
        }

        let mut results: Vec<(i64, f32)> = merged
            .into_iter()
            .filter(|(_, score)| *score > 0.0)
            .collect();
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        results
    }

    /// Get the number of indexed documents
    pub fn document_count(&self) -> usize {
        self.document_count
    }

    /// Get the vocabulary size
    pub fn vocabulary_size(&self) -> usize {
        self.vocabulary.len()
    }

    /// Get the number of documents with dense embeddings
    pub fn dense_embedding_count(&self) -> usize {
        self.dense_embeddings.len()
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::memory_manager::MemoryCategory;

    #[test]
    fn test_tokenize() {
        let tokens = TfIdfIndex::tokenize("Hello, World! This is a TEST.");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
        assert!(tokens.contains(&"test".to_string()));
        // Stopwords should be filtered
        assert!(!tokens.contains(&"this".to_string()));
        assert!(!tokens.contains(&"is".to_string()));
    }

    #[test]
    fn test_stem_word() {
        assert_eq!(TfIdfIndex::stem_word("running"), "runn");
        assert_eq!(TfIdfIndex::stem_word("organization"), "organize");
        // "happiness" -> removes "s" suffix -> "happines" (simple single-pass stemmer)
        assert_eq!(TfIdfIndex::stem_word("happiness"), "happines");
        // Test "fulness" suffix
        assert_eq!(TfIdfIndex::stem_word("carefulness"), "careful");
    }

    #[test]
    fn test_build_index() {
        let mut index = TfIdfIndex::new();
        let memories = vec![
            MemoryEntry {
                id: 1,
                category: MemoryCategory::Fact,
                topic: "programming".to_string(),
                content: "Rust is a systems programming language".to_string(),
                importance: 5,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
            MemoryEntry {
                id: 2,
                category: MemoryCategory::Fact,
                topic: "web".to_string(),
                content: "JavaScript is used for web development".to_string(),
                importance: 5,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
        ];

        index.build_from_memories(&memories);

        assert_eq!(index.document_count(), 2);
        assert!(index.vocabulary_size() > 0);
    }

    #[test]
    fn test_search() {
        let mut index = TfIdfIndex::new();
        let memories = vec![
            MemoryEntry {
                id: 1,
                category: MemoryCategory::Fact,
                topic: "programming".to_string(),
                content: "Rust is a systems programming language focused on safety".to_string(),
                importance: 5,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
            MemoryEntry {
                id: 2,
                category: MemoryCategory::Fact,
                topic: "web".to_string(),
                content: "JavaScript is used for web development".to_string(),
                importance: 5,
                source: None,
                created_at: "2025-01-01".to_string(),
                updated_at: "2025-01-01".to_string(),
                last_accessed: None,
            },
        ];

        index.build_from_memories(&memories);

        let results = index.search("programming language", 10);
        assert!(!results.is_empty());

        // Memory 1 should rank higher
        let result_ids: Vec<i64> = results.iter().map(|(id, _)| *id).collect();
        assert!(result_ids.contains(&1));
    }

    #[test]
    fn test_update_and_remove() {
        let mut index = TfIdfIndex::new();
        let memories = vec![MemoryEntry {
            id: 1,
            category: MemoryCategory::Fact,
            topic: "test".to_string(),
            content: "original content".to_string(),
            importance: 5,
            source: None,
            created_at: "2025-01-01".to_string(),
            updated_at: "2025-01-01".to_string(),
            last_accessed: None,
        }];

        index.build_from_memories(&memories);
        assert_eq!(index.document_count(), 1);

        // Update the memory
        index.update_memory(1, "updated content with new terms", "test", "Fact");
        assert_eq!(index.document_count(), 1);

        // Add a new memory
        index.update_memory(2, "another memory", "new", "Preference");
        assert_eq!(index.document_count(), 2);

        // Remove a memory
        index.remove_memory(1);
        assert_eq!(index.document_count(), 1);
    }

    #[test]
    fn test_cosine_similarity() {
        // Same vectors should have similarity 1.0
        let vec_a = SparseVector::new(vec![(0, 1.0), (1, 2.0), (2, 3.0)]);
        let vec_b = SparseVector::new(vec![(0, 1.0), (1, 2.0), (2, 3.0)]);
        let sim = vec_a.cosine_similarity(&vec_b);
        assert!((sim - 1.0).abs() < 0.001);

        // Orthogonal vectors should have similarity 0.0
        let vec_c = SparseVector::new(vec![(3, 1.0), (4, 2.0)]);
        let sim_ortho = vec_a.cosine_similarity(&vec_c);
        assert!(sim_ortho.abs() < 0.001);
    }

    #[test]
    fn test_semantic_search_config_default() {
        let config = SemanticSearchConfig::default();
        assert!(config.enabled);
        assert!((config.min_similarity - 0.1).abs() < f32::EPSILON);
        assert!((config.keyword_weight - 0.4).abs() < f32::EPSILON);
    }
}
