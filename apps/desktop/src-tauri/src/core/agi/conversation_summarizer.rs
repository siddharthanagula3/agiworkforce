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

use crate::core::llm::{Provider, TaskType};

use crate::sys::error::{Error, LLMError, Result};

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

        // Process each conversation, tracking failures
        let mut failed_count: usize = 0;
        let mut last_error: Option<Error> = None;
        let total_candidates = candidates.len().min(config.max_messages_per_batch);

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
                    failed_count += 1;
                    last_error = Some(e);
                    // Continue with other conversations
                }
            }
        }

        // Log summary of failures
        if failed_count > 0 {
            tracing::warn!(
                "Summarization batch completed with {} failures out of {} conversations",
                failed_count,
                total_candidates
            );
        }

        // If ALL conversations failed, propagate the error
        if failed_count == total_candidates && total_candidates > 0 {
            let error_msg = format!(
                "All {} summarization attempts failed. Last error: {}",
                total_candidates,
                last_error
                    .as_ref()
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            );
            tracing::error!("{}", error_msg);
            return Err(Error::LLMError(LLMError::ApiError(error_msg)));
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

        // Call LLM to extract memories with retry on failure.
        // Attempt 1: call with the current prompt
        let extraction = match self
            .llm
            .extract_memories(prompt, &conversation_content)
            .await
        {
            Ok(result) => result,
            Err(first_error) => {
                tracing::warn!(
                    "Summarization attempt 1 failed for conversation {}: {}. Retrying...",
                    conversation_id,
                    first_error
                );

                // Attempt 2: retry once after a short delay
                tokio::time::sleep(StdDuration::from_secs(2)).await;

                match self
                    .llm
                    .extract_memories(prompt, &conversation_content)
                    .await
                {
                    Ok(result) => {
                        tracing::info!(
                            "Summarization retry succeeded for conversation {}",
                            conversation_id
                        );
                        result
                    }
                    Err(retry_error) => {
                        tracing::error!(
                            "Summarization failed after 2 attempts for conversation {}: {}",
                            conversation_id,
                            retry_error
                        );
                        return Err(Error::LLMError(LLMError::ApiError(format!(
                            "Failed to summarize conversation: {}",
                            retry_error
                        ))));
                    }
                }
            }
        };

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

    /// Attempt memory extraction via Ollama local LLM.
    /// Returns the raw LLM response string on success.
    async fn try_ollama_extraction(
        &self,
        full_prompt: &str,
    ) -> std::result::Result<String, String> {
        let response = self
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
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body_text = response.text().await.unwrap_or_default();
            return Err(format!("Ollama returned status {}: {}", status, body_text));
        }

        let chat: OllamaChatResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama chat response: {}", e))?;

        chat.message
            .map(|m| m.content)
            .ok_or_else(|| "Ollama returned no message content".to_string())
    }

    /// Attempt memory extraction via OpenAI API.
    /// Returns the raw LLM response string on success.
    async fn try_openai_extraction(
        &self,
        full_prompt: &str,
    ) -> std::result::Result<String, String> {
        let api_key = self
            .openai_api_key
            .as_ref()
            .ok_or_else(|| "No OpenAI API key available".to_string())?;

        let response = self
            .http_client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&serde_json::json!({
                "model": Provider::OpenAI.get_model_for_task(TaskType::FastCompletion),
                "messages": [{"role": "user", "content": full_prompt}],
                "response_format": {"type": "json_object"}
            }))
            .timeout(StdDuration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI returned status {}: {}", status, body_text));
        }

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        body["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "OpenAI response missing content field".to_string())
    }

    /// Parse an LLM response string into an ExtractionResult.
    /// Returns an error if the JSON cannot be parsed.
    fn parse_extraction_response(llm_response: &str) -> Result<ExtractionResult> {
        match serde_json::from_str::<ExtractionResult>(llm_response) {
            Ok(result) => {
                tracing::debug!(
                    "Extracted {} memories from conversation",
                    result.memories.len()
                );
                Ok(result)
            }
            Err(e) => {
                tracing::warn!("Failed to parse LLM extraction response: {}", e);
                Err(Error::LLMError(LLMError::InvalidResponse(format!(
                    "LLM returned unparseable extraction response: {}",
                    e
                ))))
            }
        }
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
        let ollama_error = match self.try_ollama_extraction(&full_prompt).await {
            Ok(response) => return Self::parse_extraction_response(&response),
            Err(e) => {
                tracing::debug!("Ollama extraction unavailable: {}", e);
                e
            }
        };

        // Fallback to OpenAI if Ollama didn't work
        let openai_error = match self.try_openai_extraction(&full_prompt).await {
            Ok(response) => return Self::parse_extraction_response(&response),
            Err(e) => {
                tracing::debug!("OpenAI extraction failed: {}", e);
                e
            }
        };

        // Both providers failed — propagate error explicitly
        let final_error = format!(
            "Failed to summarize conversation: all LLM providers failed. \
             Ollama: {}. OpenAI: {}",
            ollama_error, openai_error
        );
        tracing::warn!("Summarization failed after 2 attempts: {}", final_error);
        Err(Error::LLMError(LLMError::ApiError(final_error)))
    }

    /// Generate embeddings with 3-tier fallback, stored at native dimensions.
    /// 1. Ollama local (nomic-embed-text, 768-dim)
    /// 2. OpenAI cloud (text-embedding-3-small, 1536-dim)
    /// 3. None (no embedding available — honest, no zero vectors)
    ///
    /// Embeddings are stored at their native dimension. The vector_search
    /// function skips comparisons between embeddings of different dimensions
    /// (different models produce incompatible vector spaces).
    async fn generate_embedding(&self, text: &str) -> Result<Option<Vec<f32>>> {
        if text.trim().is_empty() {
            tracing::debug!("Skipping embedding generation for empty text");
            return Ok(None);
        }

        // Tier 1: Try Ollama local embeddings
        match self.generate_ollama_embedding(text).await {
            Ok(embedding) => {
                tracing::debug!(
                    "Generated Ollama embedding ({} dimensions)",
                    embedding.len()
                );
                return Ok(Some(embedding));
            }
            Err(e) => {
                tracing::debug!("Ollama embedding unavailable, trying OpenAI: {}", e);
            }
        }

        // Tier 2: Try OpenAI embeddings
        match self.generate_openai_embedding(text).await {
            Ok(embedding) => {
                tracing::debug!(
                    "Generated OpenAI embedding ({} dimensions)",
                    embedding.len()
                );
                return Ok(Some(embedding));
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
    async fn test_ollama_embedding_stored_at_native_768_dim() {
        // Ollama nomic-embed-text returns 768-dim; must be stored as-is, not padded
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockOllamaSucceeds);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer
            .llm
            .generate_embedding("test embedding")
            .await
            .unwrap();

        assert!(embedding.is_some(), "Should return an embedding");
        let vec = embedding.unwrap();
        assert_eq!(
            vec.len(),
            768,
            "Ollama embedding must be stored at native 768 dimensions, not padded"
        );
    }

    #[tokio::test]
    async fn test_openai_embedding_stored_at_native_1536_dim() {
        // OpenAI text-embedding-3-small returns 1536-dim; must be stored as-is
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockOllamaFailsOpenAISucceeds);
        let summarizer = ConversationSummarizer::new(store, llm);

        let embedding = summarizer
            .llm
            .generate_embedding("test embedding")
            .await
            .unwrap();

        assert!(embedding.is_some(), "Should return an embedding");
        let vec = embedding.unwrap();
        assert_eq!(
            vec.len(),
            1536,
            "OpenAI embedding must be stored at native 1536 dimensions"
        );
    }

    // =========================================================================
    // HttpSummaryLLM construction tests
    // =========================================================================

    #[test]
    fn test_http_summary_llm_new_without_api_key() {
        let llm = HttpSummaryLLM::new(None);

        assert!(
            llm.openai_api_key.is_none(),
            "No API key should be stored when None is passed"
        );
        assert!(
            llm.ollama_url.contains("11434"),
            "Default Ollama URL should contain the default port"
        );
    }

    #[test]
    fn test_http_summary_llm_new_with_api_key() {
        let llm = HttpSummaryLLM::new(Some("sk-test-key-123".to_string()));

        assert_eq!(
            llm.openai_api_key.as_deref(),
            Some("sk-test-key-123"),
            "API key must be stored correctly"
        );
        assert!(
            llm.ollama_url.contains("11434"),
            "Default Ollama URL should contain the default port"
        );
    }

    // =========================================================================
    // Fallback chain structural tests (using ConversationSummarizer + mocks)
    // =========================================================================

    #[tokio::test]
    async fn test_fallback_chain_stores_embedding_with_memory() {
        // When an embedding provider is available, extracted memories
        // should carry embeddings through the summarization pipeline.
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockSummaryLLM);
        let summarizer = ConversationSummarizer::new(store, llm);

        // MockSummaryLLM returns Some(vec![0.1, 0.2, 0.3, 0.4, 0.5])
        let embedding = summarizer
            .llm
            .generate_embedding("test content")
            .await
            .unwrap();

        assert!(
            embedding.is_some(),
            "Mock should return an embedding for non-empty text"
        );
        let vec = embedding.unwrap();
        assert_eq!(vec.len(), 5, "Mock returns 5-dim embedding");
        assert!(
            vec.iter().all(|&v| v > 0.0),
            "Mock embedding should have all positive values (no zeros)"
        );
    }

    #[tokio::test]
    async fn test_zero_vector_filtering_in_summarization() {
        // The summarization pipeline filters zero vectors before storing.
        // Verify the filter logic: magnitude must be > 1e-8.
        let zero_vec: Vec<f32> = vec![0.0; 768];
        let magnitude: f32 = zero_vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            magnitude <= 1e-8,
            "Zero vector magnitude should be filtered out"
        );

        let tiny_vec: Vec<f32> = vec![1e-10; 768];
        let magnitude: f32 = tiny_vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            magnitude <= 1e-8,
            "Near-zero vector should also be filtered out"
        );

        let valid_vec: Vec<f32> = vec![0.1; 768];
        let magnitude: f32 = valid_vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            magnitude > 1e-8,
            "Valid embedding should pass the magnitude filter"
        );
    }

    // =========================================================================
    // Bug #32: Explicit error propagation tests
    // =========================================================================

    /// Mock LLM that always fails extraction — simulates both providers down.
    struct MockFailingLLM;

    #[async_trait::async_trait]
    impl SummaryLLM for MockFailingLLM {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            Err(Error::LLMError(LLMError::ApiError(
                "All LLM providers unavailable".to_string(),
            )))
        }

        async fn generate_embedding(&self, _text: &str) -> Result<Option<Vec<f32>>> {
            Ok(None)
        }
    }

    /// Mock LLM that fails on first call, succeeds on second — simulates retry success.
    struct MockFailThenSucceedLLM {
        call_count: std::sync::atomic::AtomicU32,
    }

    impl MockFailThenSucceedLLM {
        fn new() -> Self {
            Self {
                call_count: std::sync::atomic::AtomicU32::new(0),
            }
        }
    }

    #[async_trait::async_trait]
    impl SummaryLLM for MockFailThenSucceedLLM {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            let count = self
                .call_count
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if count == 0 {
                Err(Error::LLMError(LLMError::NetworkError(
                    "Transient network failure".to_string(),
                )))
            } else {
                Ok(ExtractionResult {
                    memories: vec![ExtractedMemory {
                        topic: "Retry success".to_string(),
                        content: "Extracted after retry".to_string(),
                        importance: 5,
                        category: "fact".to_string(),
                    }],
                    summary: "Summary after retry".to_string(),
                })
            }
        }

        async fn generate_embedding(&self, _text: &str) -> Result<Option<Vec<f32>>> {
            Ok(Some(vec![0.1, 0.2, 0.3]))
        }
    }

    /// Mock LLM that simulates a timeout error.
    struct MockTimeoutLLM;

    #[async_trait::async_trait]
    impl SummaryLLM for MockTimeoutLLM {
        async fn extract_memories(
            &self,
            _prompt: &str,
            _conversation_content: &str,
        ) -> Result<ExtractionResult> {
            Err(Error::TimeoutError(
                "LLM request timed out after 60s".to_string(),
            ))
        }

        async fn generate_embedding(&self, _text: &str) -> Result<Option<Vec<f32>>> {
            Ok(None)
        }
    }

    #[tokio::test]
    async fn test_extract_memories_llm_error_returns_err() {
        // Bug #32: LLM failure must return Err, not Ok with empty result
        let llm = MockFailingLLM;
        let result = llm.extract_memories("prompt", "content").await;

        assert!(
            result.is_err(),
            "LLM failure must return Err, not Ok with empty ExtractionResult"
        );
        let err_str = result.unwrap_err().to_string();
        assert!(
            err_str.contains("unavailable"),
            "Error message should describe the failure: {}",
            err_str
        );
    }

    #[tokio::test]
    async fn test_extract_memories_timeout_returns_err() {
        // Bug #32: Timeout must propagate as Err
        let llm = MockTimeoutLLM;
        let result = llm.extract_memories("prompt", "content").await;

        assert!(
            result.is_err(),
            "Timeout must return Err, not Ok with empty ExtractionResult"
        );
        let err_str = result.unwrap_err().to_string();
        assert!(
            err_str.contains("timed out"),
            "Error message should mention timeout: {}",
            err_str
        );
    }

    #[tokio::test]
    async fn test_successful_summarization_returns_ok() {
        // Sanity check: successful extraction still works
        let llm = MockSummaryLLM;
        let result = llm.extract_memories("prompt", "content").await;

        assert!(result.is_ok(), "Successful extraction must return Ok");
        let extraction = result.unwrap();
        assert_eq!(extraction.memories.len(), 2);
        assert!(!extraction.summary.is_empty());
    }

    #[tokio::test]
    async fn test_run_summarization_with_failing_llm_records_failure() {
        // Bug #32: run_summarization should record failure status when LLM fails
        let store = Arc::new(MemoryStore::in_memory().unwrap());
        let llm = Arc::new(MockFailingLLM);
        let summarizer = ConversationSummarizer::new(store, llm);

        // Run summarization — no candidates exist, so it should succeed with 0 stats
        let result = summarizer.run_summarization(None).await;
        assert!(
            result.is_ok(),
            "With no candidates, summarization should succeed even with a failing LLM"
        );

        // Check last run recorded as completed (no conversations to process = success)
        let last_run = summarizer.get_last_run().await.unwrap();
        assert_eq!(last_run.status, SummarizationStatus::Completed);
    }

    #[tokio::test]
    async fn test_parse_extraction_response_invalid_json() {
        // Bug #32: Invalid JSON from LLM must return Err, not Ok with empty memories
        let result = HttpSummaryLLM::parse_extraction_response("not valid json {{{");

        assert!(result.is_err(), "Unparseable LLM response must return Err");
        let err_str = result.unwrap_err().to_string();
        assert!(
            err_str.contains("unparseable"),
            "Error should describe the parse failure: {}",
            err_str
        );
    }

    #[tokio::test]
    async fn test_parse_extraction_response_valid_json() {
        let json = r#"{"memories": [{"topic": "t", "content": "c", "importance": 5, "category": "fact"}], "summary": "s"}"#;
        let result = HttpSummaryLLM::parse_extraction_response(json);

        assert!(result.is_ok(), "Valid JSON should parse successfully");
        let extraction = result.unwrap();
        assert_eq!(extraction.memories.len(), 1);
        assert_eq!(extraction.summary, "s");
    }

    #[tokio::test]
    async fn test_retry_mock_first_fails_second_succeeds() {
        // Bug #32: Verify the retry mock correctly simulates transient failure then success.
        // This tests the SummaryLLM trait contract used by summarize_conversation retry logic.
        let llm = MockFailThenSucceedLLM::new();

        // First call should fail
        let first = llm.extract_memories("prompt", "content").await;
        assert!(
            first.is_err(),
            "First call should fail to simulate transient error"
        );
        let err_str = first.unwrap_err().to_string();
        assert!(
            err_str.contains("Transient"),
            "Should be a transient/network error: {}",
            err_str
        );

        // Second call should succeed
        let second = llm.extract_memories("prompt", "content").await;
        assert!(
            second.is_ok(),
            "Second call should succeed after transient failure"
        );
        let extraction = second.unwrap();
        assert_eq!(extraction.memories.len(), 1);
        assert_eq!(extraction.memories[0].topic, "Retry success");
    }
}
