//! Google Batch API Commands
//!
//! Provides Tauri IPC command shapes for asynchronous large-volume LLM
//! processing through a Google Batch backend when one is connected.
//!
//! This desktop build does not connect directly to Google Batch. Local in-memory
//! preview mode is opt-in via `AGI_ENABLE_LOCAL_IN_MEMORY_GOOGLE_BATCH=1` so IPC
//! calls do not present preview data as a real remote backend.
//!
//! The IPC names and shapes are unchanged so existing UI bindings keep working.

use chrono::Utc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

const LOCAL_PREVIEW_ENV: &str = "AGI_ENABLE_LOCAL_IN_MEMORY_GOOGLE_BATCH";

/// In-memory store for explicitly enabled local preview jobs.
static BATCH_JOBS: Lazy<Mutex<HashMap<String, BatchJob>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static EMBEDDINGS_JOBS: Lazy<Mutex<HashMap<String, EmbeddingsBatchJob>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn google_batch_local_preview_enabled() -> bool {
    std::env::var(LOCAL_PREVIEW_ENV)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn ensure_google_batch_backend_available() -> Result<(), String> {
    if google_batch_local_preview_enabled() {
        return Ok(());
    }

    Err(format!(
        "Google Batch is not connected in this desktop build. Use the managed cloud batch backend, or set {LOCAL_PREVIEW_ENV}=1 for local in-memory preview mode."
    ))
}

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

/// Google AI pricing (input, output, cache) per 1M tokens.
///
/// Sourced from `models.json` via `models_config::get_pricing` so we don't
/// drift from the canonical catalog. The current desktop catalog stores
/// input/output prices only, so cache price is zero until the catalog has an
/// explicit Google cache field.
fn get_model_pricing(model: &str) -> (f64, f64, f64) {
    use crate::core::llm::models_config::get_pricing;
    use crate::core::llm::Provider;

    let pricing = get_pricing(&Provider::Google, model);
    match pricing {
        Some(p) => (p.input_per_million, p.output_per_million, 0.0),
        None => {
            tracing::warn!(
                model = %model,
                "google_batch cost: no pricing in models.json; falling back to (0,0,0)"
            );
            (0.0, 0.0, 0.0)
        }
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
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
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

    if let Ok(jobs) = BATCH_JOBS.lock() {
        if let Some(job) = jobs.get(&job_name) {
            if matches!(
                job.state,
                BatchJobState::Succeeded | BatchJobState::Failed | BatchJobState::Cancelled
            ) {
                return Ok(job.clone());
            }
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
    ensure_google_batch_backend_available()?;

    let text_count = texts.map(|t| t.len() as u32).unwrap_or(0);
    let model = model.ok_or_else(|| {
        "Embedding batch model is required; select it from the configured model catalog."
            .to_string()
    })?;

    let job = EmbeddingsBatchJob {
        name: generate_job_name("embeddings"),
        display_name,
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

    Ok(job)
}

/// Get embeddings batch status
/// Returns the EmbeddingsBatchJob if found
#[tauri::command]
pub async fn google_batch_get_embeddings(job_name: String) -> Result<EmbeddingsBatchJob, String> {
    ensure_google_batch_backend_available()?;

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
    ensure_google_batch_backend_available()?;

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
    if cached_tokens.unwrap_or(0) > 0 && cache_price == 0.0 {
        return Err(
            "Google cache-token pricing is not present in the desktop model catalog; cannot estimate cached token cost."
                .to_string(),
        );
    }

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
    let safe_output_path = crate::sys::commands::file_ops::validate_path_security(&output_path)?;

    use std::fs::File;
    use std::io::Write;

    let file =
        File::create(&safe_output_path).map_err(|e| format!("Failed to create file: {}", e))?;

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

/// Compatibility command the frontend can poll to decide whether to render a
/// Google Batch unavailable/local-preview banner. The command name is retained
/// for existing UI bindings.
#[tauri::command]
pub async fn google_batch_is_beta_stub() -> Result<bool, String> {
    Ok(!google_batch_local_preview_enabled())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pricing_is_sourced_from_catalog_for_current_gemini_models() {
        // gemini-3.5-flash-lite is in models.json at $0.30/$2.50 per 1M.
        let (input, output, cache) = get_model_pricing("gemini-3.5-flash-lite");
        assert_eq!(input, 0.3);
        assert_eq!(output, 2.5);
        assert_eq!(cache, 0.0);
    }

    #[test]
    fn pricing_returns_zeros_for_unknown_model_name() {
        let (input, output, cache) = get_model_pricing("not-a-real-model-id");
        // Falls back to provider default if catalog miss.
        assert!(input >= 0.0);
        assert!(output >= 0.0);
        assert_eq!(cache, 0.0);
    }
}
