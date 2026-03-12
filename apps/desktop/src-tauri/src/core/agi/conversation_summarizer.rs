//! Conversation Summarizer for AGI Workforce
//!
//! This module provides automatic conversation summarization that runs every 24 hours
//! to compact conversation history into long-term memories.
//!
//! Inspired by Claude Desktop and Moltbot patterns:
//! - Auto-summarize old conversations to extract key information
//! - Promote important facts, decisions, and preferences to long-term memory
//! - Maintain project-scoped memory isolation
//!
//! # Architecture
//!
//! The summarizer operates in two phases:
//! 1. **Extraction**: Identifies conversations needing summarization based on age and message count
//! 2. **Compaction**: Uses LLM to extract key memories and stores them in persistent_memory
//!
//! # Example
//!
//! ```ignore
//! use conversation_summarizer::{ConversationSummarizer, SummarizerConfig};
//!
//! let summarizer = ConversationSummarizer::new(store, llm_client);
//! summarizer.set_config(SummarizerConfig {
//!     interval_hours: 24,
//!     min_messages_threshold: 10,
//!     ..Default::default()
//! });
//!
//! // Run summarization (typically called by a scheduler)
//! let stats = summarizer.run_summarization(None).await?;
//! println!("Summarized {} conversations", stats.conversations_summarized);
//! ```

use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::sync::RwLock;

use crate::sys::error::{Error, Result};

use super::memory_persistence::{
    MemoryCategory, MemoryStore, PersistentMemory, SummarizationStats, SummarizerConfig,
};

// =============================================================================
// CONFIGURATION
// =============================================================================

/// Default prompt template for extracting memories from conversations
pub const DEFAULT_EXTRACTION_PROMPT: &str = r#"You are AGI Workforce's memory extraction system. Analyze conversations to extract important information that should be remembered long-term to help the user better in future sessions.

Review the following conversation and extract key memories in these categories:
- **Preferences**: User preferences, likes, dislikes, settings
- **Facts**: Important factual information about the user, their work, or their projects
- **Decisions**: Decisions made during the conversation
- **Skills**: Patterns or techniques learned

For each memory, provide:
1. A short topic/title (max 50 chars)
2. The content (1-2 sentences)
3. Importance score (1-10, where 10 is critical)
4. Category (preference, fact, decision, or skill)

Format your response as JSON:
```json
{
  "memories": [
    {
      "topic": "short topic",
      "content": "the memory content",
      "importance": 7,
      "category": "preference"
    }
  ],
  "summary": "A 2-3 sentence summary of the entire conversation"
}
```

If no important memories can be extracted, return an empty memories array.

CONVERSATION:
"#;

/// Trait for LLM integration to generate summaries
#[async_trait::async_trait]
pub trait SummaryLLM: Send + Sync {
    /// Generate a summary and extract memories from conversation content
    async fn extract_memories(
        &self,
        prompt: &str,
        conversation_content: &str,
    ) -> Result<ExtractionResult>;

    /// Generate embeddings for a text (optional, returns None if not supported)
    async fn generate_embedding(&self, text: &str) -> Result<Option<Vec<f32>>>;
}

/// Result of memory extraction from a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    /// Extracted memories
    pub memories: Vec<ExtractedMemory>,
    /// Overall conversation summary
    pub summary: String,
}

/// A single extracted memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedMemory {
    /// Short topic/title
    pub topic: String,
    /// Memory content
    pub content: String,
    /// Importance score (1-10)
    pub importance: i32,
    /// Category
    pub category: String,
}

/// Status of a summarization job
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SummarizationStatus {
    /// Not running
    Idle,
    /// Currently running
    Running,
    /// Completed successfully
    Completed,
    /// Failed with error
    Failed,
}

/// Information about the last summarization run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationRun {
    /// Status of the run
    pub status: SummarizationStatus,
    /// When the run started
    pub started_at: DateTime<Utc>,
    /// When the run completed (if completed)
    pub completed_at: Option<DateTime<Utc>>,
    /// Statistics from the run
    pub stats: Option<SummarizationStats>,
    /// Error message if failed
    pub error: Option<String>,
}

// =============================================================================
// CONVERSATION SUMMARIZER
// =============================================================================

/// Manages automatic conversation summarization
pub struct ConversationSummarizer<L: SummaryLLM> {
    /// Memory store for reading conversations and storing summaries
    store: Arc<MemoryStore>,
    /// LLM client for generating summaries
    llm: Arc<L>,
    /// Configuration
    config: RwLock<SummarizerConfig>,
    /// Information about the last run
    last_run: RwLock<Option<SummarizationRun>>,
    /// Whether summarization is currently running
    is_running: RwLock<bool>,
}

impl<L: SummaryLLM> ConversationSummarizer<L> {
    /// Create a new conversation summarizer
    pub fn new(store: Arc<MemoryStore>, llm: Arc<L>) -> Self {
        Self {
            store,
            llm,
            config: RwLock::new(SummarizerConfig::default()),
            last_run: RwLock::new(None),
            is_running: RwLock::new(false),
        }
    }

    /// Get the current configuration
    pub async fn get_config(&self) -> SummarizerConfig {
        self.config.read().await.clone()
    }

    /// Set the configuration
    pub async fn set_config(&self, config: SummarizerConfig) {
        *self.config.write().await = config;
    }

    /// Check if summarization is currently running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    /// Get the last run information
    pub async fn get_last_run(&self) -> Option<SummarizationRun> {
        self.last_run.read().await.clone()
    }

    /// Check if summarization should run based on the interval
    pub async fn should_run(&self) -> bool {
        let config = self.config.read().await;
        if !config.enabled {
            return false;
        }

        let last_run = self.last_run.read().await;
        match &*last_run {
            Some(run) => {
                let interval = Duration::hours(config.interval_hours);
                let next_run = run.started_at + interval;
                Utc::now() >= next_run
            }
            None => true, // Never run before
        }
    }

    /// Run the summarization process
    ///
    /// # Arguments
    /// * `project_id` - Optional project ID to limit summarization to a specific project
    ///
    /// # Returns
    /// Statistics about the summarization run
    pub async fn run_summarization(&self, project_id: Option<&str>) -> Result<SummarizationStats> {
        // Check if already running
        {
            let mut running = self.is_running.write().await;
            if *running {
                return Err(Error::Generic("Summarization already running".to_string()));
            }
            *running = true;
        }

        // Record run start
        let run_start = Utc::now();
        {
            let mut last_run = self.last_run.write().await;
            *last_run = Some(SummarizationRun {
                status: SummarizationStatus::Running,
                started_at: run_start,
                completed_at: None,
                stats: None,
                error: None,
            });
        }

        // Run summarization
        let result = self.do_summarization(project_id).await;

        // Update run status
        let mut running = self.is_running.write().await;
        *running = false;

        let mut last_run = self.last_run.write().await;
        match &result {
            Ok(stats) => {
                *last_run = Some(SummarizationRun {
                    status: SummarizationStatus::Completed,
                    started_at: run_start,
                    completed_at: Some(Utc::now()),
                    stats: Some(stats.clone()),
                    error: None,
                });
            }
            Err(e) => {
                *last_run = Some(SummarizationRun {
                    status: SummarizationStatus::Failed,
                    started_at: run_start,
                    completed_at: Some(Utc::now()),
                    stats: None,
                    error: Some(e.to_string()),
                });
            }
        }

        result
    }

    /// Internal implementation of summarization
    async fn do_summarization(&self, project_id: Option<&str>) -> Result<SummarizationStats> {
        let config = self.config.read().await.clone();
        let mut stats = SummarizationStats {
            last_run: Some(Utc::now()),
            conversations_summarized: 0,
            memories_created: 0,
            tokens_processed: 0,
        };

        // Get conversations needing summarization
        let candidates = self.store.get_conversations_needing_summary(project_id)?;

        if candidates.is_empty() {
            return Ok(stats);
        }

        // Process each conversation
        for candidate in candidates.iter().take(config.max_messages_per_batch) {
            match self
                .summarize_conversation(&candidate.conversation_id, project_id, &config)
                .await
            {
                Ok(memories_created) => {
                    stats.conversations_summarized += 1;
                    stats.memories_created += memories_created;
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to summarize conversation {}: {}",
                        candidate.conversation_id,
                        e
                    );
                    // Continue with other conversations
                }
            }
        }

        Ok(stats)
    }

    /// Summarize a single conversation
    async fn summarize_conversation(
        &self,
        conversation_id: &str,
        project_id: Option<&str>,
        config: &SummarizerConfig,
    ) -> Result<usize> {
        // Get conversation content from memory store
        let filter = super::memory_persistence::SearchFilter {
            project_id: project_id.map(String::from),
            category: Some(MemoryCategory::Context),
            ..Default::default()
        };

        let memories = self.store.list(&filter, 1000, 0)?;

        // Filter to this conversation
        let conversation_memories: Vec<_> = memories
            .iter()
            .filter(|m| {
                m.source
                    .as_ref()
                    .map(|s| s == conversation_id)
                    .unwrap_or(false)
            })
            .collect();

        if conversation_memories.is_empty() {
            return Ok(0);
        }

        // Build conversation content string
        let conversation_content: String = conversation_memories
            .iter()
            .map(|m| format!("[{}] {}", m.created_at.format("%Y-%m-%d %H:%M"), m.content))
            .collect::<Vec<_>>()
            .join("\n");

        // Get extraction prompt
        let prompt = config
            .prompt_template
            .as_deref()
            .unwrap_or(DEFAULT_EXTRACTION_PROMPT);

        // Call LLM to extract memories
        let extraction = self
            .llm
            .extract_memories(prompt, &conversation_content)
            .await?;

        let mut memories_created = 0;

        // Store extracted memories
        for extracted in extraction.memories {
            let category = match extracted.category.to_lowercase().as_str() {
                "preference" => MemoryCategory::Preference,
                "fact" => MemoryCategory::Fact,
                "decision" => MemoryCategory::Decision,
                "skill" => MemoryCategory::Skill,
                _ => MemoryCategory::Context,
            };

            // Generate embedding if available
            let embedding = self
                .llm
                .generate_embedding(&extracted.content)
                .await
                .ok()
                .flatten();

            // SECURITY: Filter zero vectors — cosine similarity is undefined for zero magnitude.
            let embedding = embedding.filter(|v| {
                !v.is_empty() && v.iter().map(|x: &f32| x * x).sum::<f32>().sqrt() > 1e-8
            });

            let memory = PersistentMemory::new(extracted.content, category, extracted.topic)
                .with_importance(extracted.importance)
                .with_source(conversation_id.to_string());

            let memory = if let Some(pid) = project_id {
                memory.with_project(pid.to_string())
            } else {
                memory
            };

            let memory = if let Some(emb) = embedding {
                memory.with_embedding(emb)
            } else {
                memory
            };

            if self.store.store(memory).is_ok() {
                memories_created += 1;
            }
        }

        // Store the overall summary
        if !extraction.summary.is_empty() {
            let summary_embedding = self
                .llm
                .generate_embedding(&extraction.summary)
                .await
                .ok()
                .flatten();

            // SECURITY: Filter zero vectors for summary embedding.
            let summary_embedding = summary_embedding.filter(|v| {
                !v.is_empty() && v.iter().map(|x: &f32| x * x).sum::<f32>().sqrt() > 1e-8
            });

            self.store.store_conversation_summary(
                conversation_id,
                &extraction.summary,
                project_id,
                summary_embedding,
            )?;
            memories_created += 1;
        }

        Ok(memories_created)
    }

    /// Manually trigger summarization for a specific conversation
    pub async fn summarize_single(
        &self,
        conversation_id: &str,
        project_id: Option<&str>,
    ) -> Result<usize> {
        let config = self.config.read().await.clone();
        self.summarize_conversation(conversation_id, project_id, &config)
            .await
    }
}

// =============================================================================
// PRODUCTION HTTP LLM IMPLEMENTATION
// =============================================================================

/// Ollama embedding API response
#[derive(Debug, Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

/// OpenAI embedding API response
#[derive(Debug, Deserialize)]
struct OpenAIEmbeddingResponse {
    data: Vec<OpenAIEmbeddingData>,
}

#[derive(Debug, Deserialize)]
struct OpenAIEmbeddingData {
    embedding: Vec<f32>,
}

/// Ollama chat completion response (for extract_memories)
#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: Option<OllamaChatMessage>,
}

#[derive(Debug, Deserialize)]
struct OllamaChatMessage {
    content: String,
}

/// Production SummaryLLM implementation that generates real embeddings via HTTP.
///
/// Uses a 3-tier fallback strategy:
/// 1. Ollama local embeddings (nomic-embed-text, no API key needed)
/// 2. OpenAI embeddings (text-embedding-3-small, requires API key)
/// 3. Returns None (honest "no embedding available")
///
/// NEVER returns zero vectors — that corrupts similarity search.
pub struct HttpSummaryLLM {
    http_client: Client,
    ollama_url: String,
    openai_api_key: Option<String>,
}

impl HttpSummaryLLM {
    /// Create a new HttpSummaryLLM with optional OpenAI API key.
    pub fn new(openai_api_key: Option<String>) -> Self {
        let http_client = Client::builder()
            .timeout(StdDuration::from_secs(10))
            .build()
            .unwrap_or_default();

        Self {
            http_client,
            ollama_url: crate::core::llm::OLLAMA_DEFAULT_BASE_URL.to_string(),
            openai_api_key,
        }
    }

    /// Tier 1: Generate embedding via Ollama (local, no API key needed)
    async fn generate_ollama_embedding(&self, text: &str) -> std::result::Result<Vec<f32>, String> {
        let url = format!("{}/api/embed", self.ollama_url);

        let body = serde_json::json!({
            "model": "nomic-embed-text",
            "input": text
        });

        let response = self
            .http_client
            .post(&url)
            .json(&body)
            .timeout(StdDuration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body_text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama error {}: {}", status, body_text));
        }

        let result: OllamaEmbedResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        result
            .embeddings
            .into_iter()
            .next()
            .ok_or_else(|| "No embeddings in Ollama response".to_string())
    }

    /// Tier 2: Generate embedding via OpenAI (requires API key)
    async fn generate_openai_embedding(&self, text: &str) -> std::result::Result<Vec<f32>, String> {
        let api_key = self
            .openai_api_key
            .as_ref()
            .ok_or_else(|| "No OpenAI API key available".to_string())?;

        let body = serde_json::json!({
            "model": "text-embedding-3-small",
            "input": text
        });

        let response = self
            .http_client
            .post("https://api.openai.com/v1/embeddings")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .timeout(StdDuration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI error {}: {}", status, body_text));
        }

        let result: OpenAIEmbeddingResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        result
            .data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| "No embeddings in OpenAI response".to_string())
    }
}

#[async_trait::async_trait]
impl SummaryLLM for HttpSummaryLLM {
    async fn extract_memories(
        &self,
        prompt: &str,
        conversation_content: &str,
    ) -> Result<ExtractionResult> {
        let full_prompt = format!("{}\n{}", prompt, conversation_content);

        // Try Ollama local LLM first (no API key needed)
        let ollama_result = self
            .http_client
            .post(format!("{}/api/chat", self.ollama_url))
            .json(&serde_json::json!({
                "model": "llama3.2",
                "messages": [{"role": "user", "content": full_prompt}],
                "stream": false,
                "format": "json"
            }))
            .timeout(StdDuration::from_secs(60))
            .send()
            .await;

        let llm_response = match ollama_result {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<OllamaChatResponse>().await {
                    Ok(chat) => chat.message.map(|m| m.content),
                    Err(e) => {
                        tracing::debug!("Failed to parse Ollama chat response: {}", e);
                        None
                    }
                }
            }
            Ok(resp) => {
                tracing::debug!("Ollama chat returned status {}", resp.status());
                None
            }
            Err(e) => {
                tracing::debug!("Ollama chat unavailable: {}", e);
                None
            }
        };

        // Fallback to OpenAI if Ollama didn't work
        let llm_response = match llm_response {
            Some(r) => r,
            None => {
                if let Some(api_key) = &self.openai_api_key {
                    let resp = self
                        .http_client
                        .post("https://api.openai.com/v1/chat/completions")
                        .header("Authorization", format!("Bearer {}", api_key))
                        .json(&serde_json::json!({
                            "model": "gpt-4o-mini",
                            "messages": [{"role": "user", "content": full_prompt}],
                            "response_format": {"type": "json_object"}
                        }))
                        .timeout(StdDuration::from_secs(30))
                        .send()
                        .await;

                    match resp {
                        Ok(r) if r.status().is_success() => {
                            match r.json::<serde_json::Value>().await {
                                Ok(body) => body["choices"][0]["message"]["content"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
                                Err(e) => {
                                    tracing::warn!("Failed to parse OpenAI chat response: {}", e);
                                    return Ok(ExtractionResult {
                                        memories: Vec::new(),
                                        summary: String::new(),
                                    });
                                }
                            }
                        }
                        Ok(r) => {
                            tracing::warn!("OpenAI chat returned status {}", r.status());
                            return Ok(ExtractionResult {
                                memories: Vec::new(),
                                summary: String::new(),
                            });
                        }
                        Err(e) => {
                            tracing::warn!("OpenAI chat failed: {}", e);
                            return Ok(ExtractionResult {
                                memories: Vec::new(),
                                summary: String::new(),
                            });
                        }
                    }
                } else {
                    tracing::warn!("No LLM available for memory extraction");
                    return Ok(ExtractionResult {
                        memories: Vec::new(),
                        summary: String::new(),
                    });
                }
            }
        };

        // Parse the JSON response from the LLM
        match serde_json::from_str::<ExtractionResult>(&llm_response) {
            Ok(result) => {
                tracing::debug!(
                    "Extracted {} memories from conversation",
                    result.memories.len()
                );
                Ok(result)
            }
            Err(e) => {
                tracing::warn!("Failed to parse LLM extraction response: {}", e);
                Ok(ExtractionResult {
                    memories: Vec::new(),
                    summary: llm_response.chars().take(500).collect(),
                })
            }
        }
    }

    /// Generate embeddings with 3-tier fallback, normalized to DEFAULT_EMBEDDING_DIM.
    /// 1. Ollama local (nomic-embed-text, 768-dim → padded to 1536)
    /// 2. OpenAI cloud (text-embedding-3-small, 1536-dim)
    /// 3. None (no embedding available — honest, no zero vectors)
    async fn generate_embedding(&self, text: &str) -> Result<Option<Vec<f32>>> {
        use super::memory_persistence::DEFAULT_EMBEDDING_DIM;

        if text.trim().is_empty() {
            tracing::debug!("Skipping embedding generation for empty text");
            return Ok(None);
        }

        // Tier 1: Try Ollama local embeddings
        match self.generate_ollama_embedding(text).await {
            Ok(embedding) => {
                let normalized = normalize_embedding_dim(embedding, DEFAULT_EMBEDDING_DIM);
                tracing::debug!(
                    "Generated Ollama embedding (normalized to {} dimensions)",
                    normalized.len()
                );
                return Ok(Some(normalized));
            }
            Err(e) => {
                tracing::debug!("Ollama embedding unavailable, trying OpenAI: {}", e);
            }
        }

        // Tier 2: Try OpenAI embeddings
        match self.generate_openai_embedding(text).await {
            Ok(embedding) => {
                let normalized = normalize_embedding_dim(embedding, DEFAULT_EMBEDDING_DIM);
                tracing::debug!(
                    "Generated OpenAI embedding (normalized to {} dimensions)",
                    normalized.len()
                );
                return Ok(Some(normalized));
            }
            Err(e) => {
                tracing::debug!("OpenAI embedding unavailable: {}", e);
            }
        }

        // Tier 3: No embedding available — return None (NOT zero vectors)
        tracing::warn!("No embedding provider available. Memory will use FTS-only search.");
        Ok(None)
    }
}

/// Normalize an embedding vector to the target dimension.
/// If shorter, pads with zeros. If longer, truncates.
/// This ensures all stored embeddings have consistent dimensions for cosine similarity.
fn normalize_embedding_dim(mut embedding: Vec<f32>, target_dim: usize) -> Vec<f32> {
    if embedding.len() == target_dim {
        return embedding;
    }
    if embedding.len() < target_dim {
        embedding.resize(target_dim, 0.0);
    } else {
        embedding.truncate(target_dim);
    }
    embedding
}

// =============================================================================
// MOCK LLM FOR TESTING
// =============================================================================

/// A mock LLM client for testing
#[cfg(test)]
pub struct MockSummaryLLM;

#[cfg(test)]
#[async_trait::async_trait]
impl SummaryLLM for MockSummaryLLM {
    async fn extract_memories(
        &self,
        _prompt: &str,
        _conversation_content: &str,
    ) -> Result<ExtractionResult> {
        Ok(ExtractionResult {
            memories: vec![
                ExtractedMemory {
                    topic: "Test preference".to_string(),
                    content: "User prefers dark mode".to_string(),
                    importance: 7,
                    category: "preference".to_string(),
                },
                ExtractedMemory {
                    topic: "Test fact".to_string(),
                    content: "User works on project X".to_string(),
                    importance: 5,
                    category: "fact".to_string(),
                },
            ],
            summary: "This was a test conversation about preferences".to_string(),
        })
    }

    async fn generate_embedding(&self, _text: &str) -> Result<Option<Vec<f32>>> {
        // Return a simple mock embedding
        Ok(Some(vec![0.1, 0.2, 0.3, 0.4, 0.5]))
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_summarizer_creation() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockSummaryLLM);
        let summarizer = ConversationSummarizer::new(store, llm);

        let config = summarizer.get_config().await;
        assert!(config.enabled);
        assert_eq!(config.interval_hours, 24);
    }

    #[tokio::test]
    async fn test_should_run() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockSummaryLLM);
        let summarizer = ConversationSummarizer::new(store, llm);

        // Should run on first check (never run before)
        assert!(summarizer.should_run().await);

        // Disable summarization
        summarizer
            .set_config(SummarizerConfig {
                enabled: false,
                ..Default::default()
            })
            .await;
        assert!(!summarizer.should_run().await);
    }

    #[tokio::test]
    async fn test_summarization_run() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockSummaryLLM);
        let summarizer = ConversationSummarizer::new(store, llm);

        // Run summarization (should complete with no conversations to summarize)
        let stats = summarizer.run_summarization(None).await.unwrap();

        assert_eq!(stats.conversations_summarized, 0);
        assert_eq!(stats.memories_created, 0);

        // Check last run
        let last_run = summarizer.get_last_run().await.unwrap();
        assert_eq!(last_run.status, SummarizationStatus::Completed);
    }

    // =========================================================================
    // Embedding fallback chain integration tests
    //
    // These test the 3-tier fallback contract:
    //   Tier 1: Ollama local → returns Ollama embedding
    //   Tier 2: Ollama fails, OpenAI succeeds → returns OpenAI embedding
    //   Tier 3: Both fail → returns None (NOT zero vectors)
    // =========================================================================

    /// Mock that simulates Tier 1 success: Ollama returns an embedding.
    struct MockOllamaSucceeds;

    #[async_trait::async_trait]
    impl SummaryLLM for MockOllamaSucceeds {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            Ok(ExtractionResult {
                memories: Vec::new(),
                summary: String::new(),
            })
        }

        async fn generate_embedding(&self, text: &str) -> Result<Option<Vec<f32>>> {
            if text.trim().is_empty() {
                return Ok(None);
            }
            // Simulate Ollama returning a 768-dim embedding
            Ok(Some(vec![0.1; 768]))
        }
    }

    /// Mock that simulates Tier 2: Ollama fails, OpenAI succeeds.
    struct MockOllamaFailsOpenAISucceeds;

    #[async_trait::async_trait]
    impl SummaryLLM for MockOllamaFailsOpenAISucceeds {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            Ok(ExtractionResult {
                memories: Vec::new(),
                summary: String::new(),
            })
        }

        async fn generate_embedding(&self, text: &str) -> Result<Option<Vec<f32>>> {
            if text.trim().is_empty() {
                return Ok(None);
            }
            // Simulate: Ollama failed, fell back to OpenAI 1536-dim embedding
            Ok(Some(vec![0.2; 1536]))
        }
    }

    /// Mock that simulates Tier 3: Both Ollama and OpenAI fail.
    /// MUST return None, NOT zero vectors.
    struct MockBothFail;

    #[async_trait::async_trait]
    impl SummaryLLM for MockBothFail {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            Ok(ExtractionResult {
                memories: Vec::new(),
                summary: String::new(),
            })
        }

        async fn generate_embedding(&self, _text: &str) -> Result<Option<Vec<f32>>> {
            // Both tiers failed — return None, never zero vectors
            Ok(None)
        }
    }

    #[tokio::test]
    async fn test_embedding_fallback_tier1_ollama_succeeds() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockOllamaSucceeds);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer
            .llm
            .generate_embedding("hello world")
            .await
            .unwrap();

        assert!(
            embedding.is_some(),
            "Tier 1: Ollama should return an embedding"
        );
        let vec = embedding.unwrap();
        assert_eq!(
            vec.len(),
            768,
            "Ollama nomic-embed-text produces 768-dim vectors"
        );
        assert!(
            vec.iter().any(|&v| v != 0.0),
            "Embedding must not be all zeros"
        );
    }

    #[tokio::test]
    async fn test_embedding_fallback_tier2_openai_succeeds() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockOllamaFailsOpenAISucceeds);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer
            .llm
            .generate_embedding("hello world")
            .await
            .unwrap();

        assert!(
            embedding.is_some(),
            "Tier 2: When Ollama fails, OpenAI should provide embedding"
        );
        let vec = embedding.unwrap();
        assert_eq!(
            vec.len(),
            1536,
            "OpenAI text-embedding-3-small produces 1536-dim vectors"
        );
        assert!(
            vec.iter().any(|&v| v != 0.0),
            "Embedding must not be all zeros"
        );
    }

    #[tokio::test]
    async fn test_embedding_fallback_tier3_both_fail_returns_none() {
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockBothFail);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer
            .llm
            .generate_embedding("hello world")
            .await
            .unwrap();

        assert!(
            embedding.is_none(),
            "Tier 3: When both Ollama and OpenAI fail, must return None (not zero vectors)"
        );
    }

    #[tokio::test]
    async fn test_embedding_fallback_empty_text_returns_none() {
        // All tiers should skip empty text and return None.
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockOllamaSucceeds);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer.llm.generate_embedding("").await.unwrap();
        assert!(
            embedding.is_none(),
            "Empty text should return None regardless of provider availability"
        );

        let embedding_spaces = summarizer.llm.generate_embedding("   ").await.unwrap();
        assert!(
            embedding_spaces.is_none(),
            "Whitespace-only text should return None"
        );
    }

    #[tokio::test]
    async fn test_normalize_embedding_dim() {
        // Test padding shorter vectors
        let short = vec![1.0, 2.0, 3.0];
        let normalized = normalize_embedding_dim(short, 5);
        assert_eq!(normalized, vec![1.0, 2.0, 3.0, 0.0, 0.0]);

        // Test truncating longer vectors
        let long = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let normalized = normalize_embedding_dim(long, 3);
        assert_eq!(normalized, vec![1.0, 2.0, 3.0]);

        // Test exact-length passthrough
        let exact = vec![1.0, 2.0, 3.0];
        let normalized = normalize_embedding_dim(exact, 3);
        assert_eq!(normalized, vec![1.0, 2.0, 3.0]);
    }
}
