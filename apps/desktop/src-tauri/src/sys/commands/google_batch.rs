/// Tauri Commands for Google Batch API
///
/// Provides commands for asynchronous large-volume LLM processing at 50% cost savings.
use crate::core::llm::providers::{
    BatchJob, BatchJobState, CreateBatchJobRequest, CreateEmbeddingsBatchRequest,
    CreateImageBatchRequest, EmbeddingsBatchJob, GoogleBatchProvider, ListBatchJobsResponse,
};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Shared state for Google Batch provider
pub struct GoogleBatchState {
    provider: Arc<Mutex<Option<GoogleBatchProvider>>>,
}

impl GoogleBatchState {
    pub fn new() -> Self {
        Self {
            provider: Arc::new(Mutex::new(None)),
        }
    }

    async fn get_provider(&self) -> Result<GoogleBatchProvider, String> {
        let mut guard = self.provider.lock().await;

        if guard.is_none() {
            // Try to get API key from environment or keyring
            let api_key = std::env::var("GOOGLE_API_KEY")
                .or_else(|_| {
                    keyring::Entry::new("agiworkforce", "google_api_key")
                        .and_then(|entry| entry.get_password())
                })
                .map_err(|e| format!("Google API key not found: {}", e))?;

            let provider = GoogleBatchProvider::new(api_key)
                .map_err(|e| format!("Failed to create batch provider: {}", e))?;

            *guard = Some(provider);
        }

        guard
            .clone()
            .ok_or_else(|| "Batch provider not initialized".to_string())
    }
}

impl Default for GoogleBatchState {
    fn default() -> Self {
        Self::new()
    }
}

// ========================================
// Batch Job Management Commands
// ========================================

/// Create a new batch job
///
/// # Arguments
/// * `requests` - Optional inline requests (< 20MB)
/// * `input_file_path` - Optional path to local JSONL file to upload
/// * `model` - Model name (e.g., "gemini-2.5-pro")
/// * `display_name` - Optional display name
/// * `output_type` - "inline" or "file"
///
/// # Returns
/// BatchJob with job ID and initial state
#[tauri::command]
pub async fn google_batch_create(
    state: State<'_, GoogleBatchState>,
    requests: Option<Vec<Value>>,
    input_file_path: Option<String>,
    model: String,
    display_name: Option<String>,
    output_type: Option<String>,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    let input_file_uri = if let Some(path) = input_file_path {
        let path_buf = PathBuf::from(path);
        let uri = provider
            .upload_jsonl_file(&path_buf, display_name.clone())
            .await
            .map_err(|e| format!("Failed to upload JSONL file: {}", e))?;
        Some(uri)
    } else {
        None
    };

    let request = CreateBatchJobRequest {
        requests,
        input_file_uri,
        output_config: output_type.map(|t| crate::core::llm::providers::BatchOutputConfig {
            output_type: t,
            gcs_destination: None,
        }),
        display_name,
        model,
        metadata: None,
    };

    provider
        .create_batch(request)
        .await
        .map_err(|e| format!("Failed to create batch job: {}", e))
}

/// Get batch job status
///
/// # Arguments
/// * `job_name` - Batch job name (from create response)
///
/// # Returns
/// Updated BatchJob with current state and statistics
#[tauri::command]
pub async fn google_batch_get(
    state: State<'_, GoogleBatchState>,
    job_name: String,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    provider
        .get_batch(&job_name)
        .await
        .map_err(|e| format!("Failed to get batch job: {}", e))
}

/// List all batch jobs
///
/// # Arguments
/// * `page_size` - Maximum number of jobs to return
/// * `page_token` - Token for pagination
/// * `filter` - Optional filter expression
///
/// # Returns
/// List of batch jobs and next page token
#[tauri::command]
pub async fn google_batch_list(
    state: State<'_, GoogleBatchState>,
    page_size: Option<u32>,
    page_token: Option<String>,
    filter: Option<String>,
) -> Result<ListBatchJobsResponse, String> {
    let provider = state.get_provider().await?;

    provider
        .list_batches(page_size, page_token, filter)
        .await
        .map_err(|e| format!("Failed to list batch jobs: {}", e))
}

/// Cancel a running batch job
///
/// # Arguments
/// * `job_name` - Batch job name to cancel
///
/// # Returns
/// Updated BatchJob with CANCELLED state
#[tauri::command]
pub async fn google_batch_cancel(
    state: State<'_, GoogleBatchState>,
    job_name: String,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    provider
        .cancel_batch(&job_name)
        .await
        .map_err(|e| format!("Failed to cancel batch job: {}", e))
}

/// Delete a batch job
///
/// # Arguments
/// * `job_name` - Batch job name to delete
#[tauri::command]
pub async fn google_batch_delete(
    state: State<'_, GoogleBatchState>,
    job_name: String,
) -> Result<(), String> {
    let provider = state.get_provider().await?;

    provider
        .delete_batch(&job_name)
        .await
        .map_err(|e| format!("Failed to delete batch job: {}", e))
}

/// Get batch results
///
/// # Arguments
/// * `job_name` - Batch job name
/// * `output_path` - Optional path to save JSONL results
///
/// # Returns
/// BatchJob with results populated
#[tauri::command]
pub async fn google_batch_get_results(
    state: State<'_, GoogleBatchState>,
    job_name: String,
    output_path: Option<String>,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    let path = output_path.as_ref().map(|p| PathBuf::from(p));

    provider
        .get_batch_results(&job_name, path.as_deref())
        .await
        .map_err(|e| format!("Failed to get batch results: {}", e))
}

/// Wait for batch job completion
///
/// # Arguments
/// * `job_name` - Batch job name
/// * `poll_interval_secs` - Seconds between status checks (default: 30)
/// * `max_wait_secs` - Maximum seconds to wait (default: 86400 = 24 hours)
///
/// # Returns
/// Completed BatchJob or timeout error
#[tauri::command]
pub async fn google_batch_wait(
    state: State<'_, GoogleBatchState>,
    job_name: String,
    poll_interval_secs: Option<u64>,
    max_wait_secs: Option<u64>,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    provider
        .wait_for_completion(
            &job_name,
            poll_interval_secs.unwrap_or(30),
            max_wait_secs.unwrap_or(86400),
        )
        .await
        .map_err(|e| format!("Failed to wait for batch completion: {}", e))
}

// ========================================
// Embeddings Batch Commands
// ========================================

/// Create embeddings batch job
///
/// # Arguments
/// * `texts` - Optional inline text inputs
/// * `input_file_path` - Optional path to JSONL file
/// * `model` - Embedding model (default: "gemini-embedding-001")
/// * `task_type` - Optional task type
/// * `display_name` - Optional display name
///
/// # Returns
/// EmbeddingsBatchJob with job ID
#[tauri::command]
pub async fn google_batch_create_embeddings(
    state: State<'_, GoogleBatchState>,
    texts: Option<Vec<String>>,
    input_file_path: Option<String>,
    model: Option<String>,
    task_type: Option<String>,
    display_name: Option<String>,
) -> Result<EmbeddingsBatchJob, String> {
    let provider = state.get_provider().await?;

    let input_file_uri = if let Some(path) = input_file_path {
        let path_buf = PathBuf::from(path);
        let uri = provider
            .upload_jsonl_file(&path_buf, display_name.clone())
            .await
            .map_err(|e| format!("Failed to upload JSONL file: {}", e))?;
        Some(uri)
    } else {
        None
    };

    let request = CreateEmbeddingsBatchRequest {
        texts,
        input_file_uri,
        model: model.unwrap_or_else(|| "gemini-embedding-001".to_string()),
        task_type,
        display_name,
        output_config: None,
    };

    provider
        .create_embeddings_batch(request)
        .await
        .map_err(|e| format!("Failed to create embeddings batch: {}", e))
}

/// Get embeddings batch status
///
/// # Arguments
/// * `job_name` - Embeddings batch job name
///
/// # Returns
/// EmbeddingsBatchJob with current state
#[tauri::command]
pub async fn google_batch_get_embeddings(
    state: State<'_, GoogleBatchState>,
    job_name: String,
) -> Result<EmbeddingsBatchJob, String> {
    let provider = state.get_provider().await?;

    provider
        .get_embeddings_batch(&job_name)
        .await
        .map_err(|e| format!("Failed to get embeddings batch: {}", e))
}

// ========================================
// Image Generation Batch Commands
// ========================================

/// Create image generation batch job
///
/// # Arguments
/// * `prompts` - List of image generation prompts
/// * `model` - Image model ("nano-banana" or "imagen-4")
/// * `display_name` - Optional display name
///
/// # Returns
/// BatchJob with job ID
#[tauri::command]
pub async fn google_batch_create_images(
    state: State<'_, GoogleBatchState>,
    prompts: Vec<String>,
    model: String,
    display_name: Option<String>,
) -> Result<BatchJob, String> {
    let provider = state.get_provider().await?;

    let requests = prompts
        .into_iter()
        .enumerate()
        .map(
            |(idx, prompt)| crate::core::llm::providers::ImageGenerationRequest {
                prompt,
                custom_id: Some(format!("image_{}", idx)),
                response_modalities: vec!["TEXT".to_string(), "IMAGE".to_string()],
                generation_config: None,
            },
        )
        .collect();

    let request = CreateImageBatchRequest {
        requests,
        model,
        display_name,
        output_config: None,
    };

    provider
        .create_image_batch(request)
        .await
        .map_err(|e| format!("Failed to create image batch: {}", e))
}

// ========================================
// Utility Commands
// ========================================

/// Calculate batch cost estimate
///
/// # Arguments
/// * `model` - Model name
/// * `input_tokens` - Estimated input tokens
/// * `output_tokens` - Estimated output tokens
/// * `cached_tokens` - Estimated cached tokens
///
/// # Returns
/// Estimated cost in USD
#[tauri::command]
pub fn google_batch_calculate_cost(
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    cached_tokens: Option<u64>,
) -> Result<f64, String> {
    let cost = GoogleBatchProvider::calculate_batch_cost(
        &model,
        input_tokens,
        output_tokens,
        cached_tokens.unwrap_or(0),
    );

    Ok(cost)
}

/// Create JSONL file from requests
///
/// # Arguments
/// * `requests` - List of request objects
/// * `output_path` - Path to write JSONL file
#[tauri::command]
pub async fn google_batch_create_jsonl(
    state: State<'_, GoogleBatchState>,
    requests: Vec<Value>,
    output_path: String,
) -> Result<(), String> {
    let provider = state.get_provider().await?;

    let path_buf = PathBuf::from(output_path);

    provider
        .create_jsonl_file(requests, &path_buf)
        .await
        .map_err(|e| format!("Failed to create JSONL file: {}", e))
}

/// Check if batch job is complete
///
/// # Arguments
/// * `state` - Batch job state
///
/// # Returns
/// True if job is in terminal state (succeeded, failed, cancelled, expired)
#[tauri::command]
pub fn google_batch_is_complete(state: String) -> Result<bool, String> {
    let job_state: BatchJobState = serde_json::from_str(&format!("\"{}\"", state))
        .map_err(|e| format!("Invalid job state: {}", e))?;

    Ok(matches!(
        job_state,
        BatchJobState::Succeeded
            | BatchJobState::Failed
            | BatchJobState::Cancelled
            | BatchJobState::Expired
    ))
}
