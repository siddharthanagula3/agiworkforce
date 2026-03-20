//! Google Batch API Commands
//!
//! Provides Tauri IPC commands for asynchronous large-volume LLM processing
//! via Google AI Batch API at 50% cost savings with 24-hour SLO.
//!
//! **NOTE**: This is currently a mock/stub implementation using in-memory storage.
//! Job data is NOT persisted across app restarts. A future version will integrate
//! with the real Google AI Batch API and persist job state to the local database.

use chrono::Utc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// In-memory store for batch jobs (for stub implementation)
static BATCH_JOBS: Lazy<Mutex<HashMap<String, BatchJob>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static EMBEDDINGS_JOBS: Lazy<Mutex<HashMap<String, EmbeddingsBatchJob>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Generate a unique job name
fn generate_job_name(prefix: &str) -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{}_{}", prefix, timestamp)
}

/// Get current timestamp in ISO 8601 format
fn get_timestamp() -> String {
    Utc::now().to_rfc3339()
}

/// Google AI pricing (per 1M tokens) - stub pricing
/// These are example prices, actual pricing varies by model
fn get_model_pricing(model: &str) -> (f64, f64, f64) {
    // (input_price_per_1m, output_price_per_1m, cache_price_per_1m)
    match model {
        "gemini-3-flash" => (0.0, 0.0, 0.0),
        "gemini-1.5-flash" => (0.075, 0.3, 0.01875),
        "gemini-1.5-pro" => (1.25, 5.0, 0.3125),
        "gemini-embedding-001" => (0.15, 0.15, 0.0), // Embeddings priced differently
        _ => (0.5, 2.0, 0.125),                      // Default pricing
    }
}

/// Batch job state enum
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BatchJobState {
    Pending,
    Running,
    Succeeded,
    Failed,
    Cancelled,
    Expired,
}

/// Batch job statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchJobStats {
    pub total_requests: u32,
    pub completed_requests: u32,
    pub failed_requests: u32,
    pub pending_requests: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost: Option<f64>,
}

/// Batch job error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchJobError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<serde_json::Value>>,
}

/// Batch result entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
}

/// Batch job representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchJob {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub state: BatchJobState,
    pub model: String,
    pub create_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<BatchJobStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<Vec<BatchResult>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// List batch jobs response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBatchJobsResponse {
    pub batch_jobs: Vec<BatchJob>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

/// Embedding result entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
}

/// Embeddings batch job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingsBatchJob {
    pub name: String,
    pub state: BatchJobState,
    pub model: String,
    pub create_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<BatchJobStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<Vec<EmbeddingResult>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file_uri: Option<String>,
}

/// Create a new batch job
/// Returns a BatchJob with PENDING state
#[tauri::command]
pub async fn google_batch_create(
    requests: Option<Vec<serde_json::Value>>,
    _input_file_path: Option<String>,
    model: String,
    display_name: Option<String>,
    _output_type: Option<String>,
) -> Result<BatchJob, String> {
    let request_count = requests.map(|r| r.len() as u32).unwrap_or(0);

    let job = BatchJob {
        name: generate_job_name("batch"),
        display_name,
        state: BatchJobState::Pending,
        model,
        create_time: get_timestamp(),
        update_time: None,
        end_time: None,
        stats: Some(BatchJobStats {
            total_requests: request_count,
            completed_requests: 0,
            failed_requests: 0,
            pending_requests: request_count,
            total_tokens: None,
            total_cost: None,
        }),
        error: None,
        results: None,
        output_file_uri: None,
        metadata: None,
    };

    let job_name = job.name.clone();
    if let Ok(mut jobs) = BATCH_JOBS.lock() {
        jobs.insert(job_name, job.clone());
    }

    Ok(job)
}

/// Get batch job status
/// Returns the BatchJob if found, or an error
#[tauri::command]
pub async fn google_batch_get(job_name: String) -> Result<BatchJob, String> {
    if let Ok(jobs) = BATCH_JOBS.lock() {
        if let Some(job) = jobs.get(&job_name) {
            return Ok(job.clone());
        }
    }
    Err(format!("Batch job '{}' not found", job_name))
}

/// List all batch jobs
/// Returns all stored batch jobs
#[tauri::command]
pub async fn google_batch_list(
    _page_size: Option<u32>,
    _page_token: Option<String>,
    _filter: Option<String>,
) -> Result<ListBatchJobsResponse, String> {
    let jobs = if let Ok(jobs) = BATCH_JOBS.lock() {
        jobs.values().cloned().collect()
    } else {
        Vec::new()
    };

    Ok(ListBatchJobsResponse {
        batch_jobs: jobs,
        next_page_token: None,
    })
}

/// Cancel a running batch job
/// Sets the job state to CANCELLED
#[tauri::command]
pub async fn google_batch_cancel(job_name: String) -> Result<BatchJob, String> {
    if let Ok(mut jobs) = BATCH_JOBS.lock() {
        if let Some(job) = jobs.get_mut(&job_name) {
            job.state = BatchJobState::Cancelled;
            job.update_time = Some(get_timestamp());
            return Ok(job.clone());
        }
    }
    Err(format!("Batch job '{}' not found", job_name))
}

/// Delete a batch job
/// Removes the job from storage
#[tauri::command]
pub async fn google_batch_delete(job_name: String) -> Result<(), String> {
    if let Ok(mut jobs) = BATCH_JOBS.lock() {
        if jobs.remove(&job_name).is_some() {
            return Ok(());
        }
    }
    Err(format!("Batch job '{}' not found", job_name))
}

/// Get batch results
/// Returns the BatchJob with results populated
#[tauri::command]
pub async fn google_batch_get_results(
    job_name: String,
    _output_path: Option<String>,
) -> Result<BatchJob, String> {
    if let Ok(jobs) = BATCH_JOBS.lock() {
        if let Some(job) = jobs.get(&job_name) {
            // Return job with mock results if it's in a terminal state
            if matches!(
                job.state,
                BatchJobState::Succeeded | BatchJobState::Failed | BatchJobState::Cancelled
            ) {
                return Ok(job.clone());
            }
            // For non-terminal states, return the job as-is
            return Ok(job.clone());
        }
    }
    Err(format!("Batch job '{}' not found", job_name))
}

/// Create embeddings batch job
/// Returns an EmbeddingsBatchJob with PENDING state
#[tauri::command]
pub async fn google_batch_create_embeddings(
    texts: Option<Vec<String>>,
    _input_file_path: Option<String>,
    model: Option<String>,
    _task_type: Option<String>,
    display_name: Option<String>,
) -> Result<EmbeddingsBatchJob, String> {
    let text_count = texts.map(|t| t.len() as u32).unwrap_or(0);
    let model = model.unwrap_or_else(|| "gemini-embedding-001".to_string());

    let job = EmbeddingsBatchJob {
        name: generate_job_name("embeddings"),
        state: BatchJobState::Pending,
        model,
        create_time: get_timestamp(),
        stats: Some(BatchJobStats {
            total_requests: text_count,
            completed_requests: 0,
            failed_requests: 0,
            pending_requests: text_count,
            total_tokens: None,
            total_cost: None,
        }),
        results: None,
        output_file_uri: None,
    };

    let job_name = job.name.clone();
    if let Ok(mut jobs) = EMBEDDINGS_JOBS.lock() {
        jobs.insert(job_name, job.clone());
    }

    // Store display_name in metadata if provided
    if display_name.is_some() {
        let mut job_with_meta = job;
        job_with_meta.results = Some(vec![]); // Initialize empty results
        return Ok(job_with_meta);
    }

    Ok(job)
}

/// Get embeddings batch status
/// Returns the EmbeddingsBatchJob if found
#[tauri::command]
pub async fn google_batch_get_embeddings(job_name: String) -> Result<EmbeddingsBatchJob, String> {
    if let Ok(jobs) = EMBEDDINGS_JOBS.lock() {
        if let Some(job) = jobs.get(&job_name) {
            return Ok(job.clone());
        }
    }
    Err(format!("Embeddings batch job '{}' not found", job_name))
}

/// Create image generation batch job
/// Returns a BatchJob with PENDING state
#[tauri::command]
pub async fn google_batch_create_images(
    prompts: Vec<String>,
    model: String,
    display_name: Option<String>,
) -> Result<BatchJob, String> {
    let prompt_count = prompts.len() as u32;

    let job = BatchJob {
        name: generate_job_name("images"),
        display_name,
        state: BatchJobState::Pending,
        model,
        create_time: get_timestamp(),
        update_time: None,
        end_time: None,
        stats: Some(BatchJobStats {
            total_requests: prompt_count,
            completed_requests: 0,
            failed_requests: 0,
            pending_requests: prompt_count,
            total_tokens: None,
            total_cost: None,
        }),
        error: None,
        results: None,
        output_file_uri: None,
        metadata: None,
    };

    let job_name = job.name.clone();
    if let Ok(mut jobs) = BATCH_JOBS.lock() {
        jobs.insert(job_name, job.clone());
    }

    Ok(job)
}

/// Calculate batch cost estimate
/// Returns estimated cost in USD based on token counts and model pricing
#[tauri::command]
pub async fn google_batch_calculate_cost(
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    cached_tokens: Option<u64>,
) -> Result<f64, String> {
    let (input_price, output_price, cache_price) = get_model_pricing(&model);

    // Calculate costs (prices are per 1M tokens)
    let input_cost = (input_tokens as f64 / 1_000_000.0) * input_price;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * output_price;
    let cache_cost = cached_tokens
        .map(|ct| (ct as f64 / 1_000_000.0) * cache_price)
        .unwrap_or(0.0);

    let total_cost = input_cost + output_cost + cache_cost;

    Ok(total_cost)
}

/// Create JSONL file from requests
/// Writes requests to a JSONL file at the specified path
#[tauri::command]
pub async fn google_batch_create_jsonl(
    requests: Vec<serde_json::Value>,
    output_path: String,
) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;

    let file = File::create(&output_path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut writer = std::io::BufWriter::new(file);

    for request in requests {
        let json_str = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;
        writeln!(writer, "{}", json_str).map_err(|e| format!("Failed to write to file: {}", e))?;
    }

    writer
        .flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;

    Ok(())
}
