/// Google Batch API Implementation
///
/// Provides asynchronous large-volume processing at 50% cost savings with 24-hour SLO.
/// Supports inline requests, JSONL file input/output, embeddings, and image generation batching.
///
/// Features:
/// - Batch job creation with inline or file-based requests
/// - Job lifecycle management (create, monitor, cancel, delete)
/// - Result retrieval via inline response or JSONL files
/// - Embeddings batch processing
/// - Image generation batching (Nano Banana, Imagen 4)
/// - Context caching support at standard pricing
///
/// Pricing: 50% of standard API rates (except cache hits which use standard pricing)
/// SLO: 24-hour turnaround (typically much faster)
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::path::Path;
use std::time::Duration;
use tokio::fs;
use tokio::io::AsyncWriteExt;

// ========================================
// Batch Job Types and Structures
// ========================================

/// Batch job state enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BatchJobState {
    /// Job is queued and waiting to be processed
    Pending,
    /// Job is currently being processed
    Running,
    /// Job completed successfully
    Succeeded,
    /// Job failed due to an error
    Failed,
    /// Job was cancelled by user
    Cancelled,
    /// Job expired before completion
    Expired,
}

/// Batch job creation request
#[derive(Debug, Clone, Serialize)]
pub struct CreateBatchJobRequest {
    /// Inline requests (< 20MB total) - list of GenerateContentRequest objects
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests: Option<Vec<Value>>,

    /// JSONL file input (up to 2GB) via Files API
    /// Format: {"request": GenerateContentRequest, "custom_id": "optional"}
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_file_uri: Option<String>,

    /// Output configuration for results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_config: Option<BatchOutputConfig>,

    /// Display name for the batch job
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// Model to use for all requests in batch
    pub model: String,

    /// Custom metadata for tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Output configuration for batch results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOutputConfig {
    /// Output format: "inline" or "file"
    pub output_type: String,

    /// For file output: GCS bucket URI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gcs_destination: Option<String>,
}

/// Batch job response
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchJob {
    /// Unique job identifier
    pub name: String,

    /// Display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// Current job state
    pub state: BatchJobState,

    /// Model used for processing
    pub model: String,

    /// Creation timestamp
    pub create_time: String,

    /// Last update timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,

    /// Completion timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,

    /// Job statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<BatchJobStats>,

    /// Error information if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,

    /// Inline results for small batches
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<Vec<BatchResult>>,

    /// Output file URI for large batches
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file_uri: Option<String>,

    /// Custom metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Batch job statistics
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchJobStats {
    /// Total requests in batch
    pub total_requests: u32,

    /// Successfully processed requests
    pub completed_requests: u32,

    /// Failed requests
    pub failed_requests: u32,

    /// Pending requests
    pub pending_requests: u32,

    /// Total tokens processed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,

    /// Total cost in USD
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost: Option<f64>,
}

/// Batch job error information
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchJobError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<Value>>,
}

/// Individual batch result
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchResult {
    /// Custom ID from request (if provided)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,

    /// Request index in batch
    pub index: u32,

    /// Response content (GenerateContentResponse)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<Value>,

    /// Error if request failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
}

/// List batch jobs response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBatchJobsResponse {
    pub batch_jobs: Vec<BatchJob>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,
}

// ========================================
// Embeddings Batch Types
// ========================================

/// Create embeddings batch request
#[derive(Debug, Clone, Serialize)]
pub struct CreateEmbeddingsBatchRequest {
    /// Inline text inputs for embeddings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texts: Option<Vec<String>>,

    /// JSONL file with embedding requests
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_file_uri: Option<String>,

    /// Model (e.g., "gemini-embedding-001")
    pub model: String,

    /// Task type for embeddings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_type: Option<String>,

    /// Display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// Output configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_config: Option<BatchOutputConfig>,
}

/// Embeddings batch job
#[derive(Debug, Clone, Deserialize, Serialize)]
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

/// Individual embedding result
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbeddingResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,

    pub index: u32,

    /// Embedding vector
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding: Option<Vec<f32>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
}

// ========================================
// Image Generation Batch Types
// ========================================

/// Image generation batch request
#[derive(Debug, Clone, Serialize)]
pub struct CreateImageBatchRequest {
    /// Requests with responseModalities: ["TEXT", "IMAGE"]
    pub requests: Vec<ImageGenerationRequest>,

    /// Model: "nano-banana" or "imagen-4"
    pub model: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_config: Option<BatchOutputConfig>,
}

/// Individual image generation request
#[derive(Debug, Clone, Serialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,

    /// Must include "IMAGE" for image generation
    pub response_modalities: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<Value>,
}

/// Image generation result
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageGenerationResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_id: Option<String>,

    pub index: u32,

    /// Base64-encoded image data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data: Option<String>,

    /// Image MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BatchJobError>,
}

// ========================================
// Google Batch Provider
// ========================================

#[derive(Clone)]
pub struct GoogleBatchProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl GoogleBatchProvider {
    /// Create a new Google Batch API provider
    pub fn new(api_key: String) -> Result<Self, Box<dyn Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn Error + Send + Sync>)?;

        let base_url = std::env::var("GOOGLE_API_BASE")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

        Ok(Self {
            api_key,
            client,
            base_url,
        })
    }

    // ========================================
    // Batch Job Management
    // ========================================

    /// Create a new batch job
    ///
    /// # Arguments
    /// * `request` - Batch job creation request with inline or file-based input
    ///
    /// # Returns
    /// BatchJob with job ID and initial state
    pub async fn create_batch(
        &self,
        request: CreateBatchJobRequest,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/batches", self.base_url);

        tracing::info!(
            "Creating batch job for model: {} with {} requests",
            request.model,
            request.requests.as_ref().map(|r| r.len()).unwrap_or(0)
        );

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let batch_job: BatchJob = response.json().await?;

        tracing::info!(
            "Batch job created: {} (state: {:?})",
            batch_job.name,
            batch_job.state
        );

        Ok(batch_job)
    }

    /// Get batch job status
    ///
    /// # Arguments
    /// * `job_name` - Batch job name (from create response)
    ///
    /// # Returns
    /// Updated BatchJob with current state and statistics
    pub async fn get_batch(
        &self,
        job_name: &str,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}", self.base_url, job_name);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let batch_job: BatchJob = response.json().await?;
        Ok(batch_job)
    }

    /// List all batch jobs with optional filtering
    ///
    /// # Arguments
    /// * `page_size` - Maximum number of jobs to return
    /// * `page_token` - Token for pagination
    /// * `filter` - Optional filter expression
    ///
    /// # Returns
    /// List of batch jobs and next page token
    pub async fn list_batches(
        &self,
        page_size: Option<u32>,
        page_token: Option<String>,
        filter: Option<String>,
    ) -> Result<ListBatchJobsResponse, Box<dyn Error + Send + Sync>> {
        let mut url = format!("{}/batches", self.base_url);
        let mut params = Vec::new();

        if let Some(size) = page_size {
            params.push(format!("pageSize={}", size));
        }
        if let Some(token) = page_token {
            params.push(format!("pageToken={}", token));
        }
        if let Some(f) = filter {
            params.push(format!("filter={}", urlencoding::encode(&f)));
        }

        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let list_response: ListBatchJobsResponse = response.json().await?;
        Ok(list_response)
    }

    /// Cancel a running batch job
    ///
    /// # Arguments
    /// * `job_name` - Batch job name to cancel
    ///
    /// # Returns
    /// Updated BatchJob with CANCELLED state
    pub async fn cancel_batch(
        &self,
        job_name: &str,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}:cancel", self.base_url, job_name);

        tracing::info!("Cancelling batch job: {}", job_name);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({}))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let batch_job: BatchJob = response.json().await?;

        tracing::info!("Batch job cancelled: {}", job_name);

        Ok(batch_job)
    }

    /// Delete a batch job
    ///
    /// # Arguments
    /// * `job_name` - Batch job name to delete
    ///
    /// # Returns
    /// Success or error
    pub async fn delete_batch(&self, job_name: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}", self.base_url, job_name);

        tracing::info!("Deleting batch job: {}", job_name);

        let response = self
            .client
            .delete(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        tracing::info!("Batch job deleted: {}", job_name);

        Ok(())
    }

    // ========================================
    // Result Retrieval
    // ========================================

    /// Get batch results (inline or download from file)
    ///
    /// # Arguments
    /// * `job_name` - Batch job name
    /// * `output_path` - Optional path to save JSONL results
    ///
    /// # Returns
    /// BatchJob with results populated or file path
    pub async fn get_batch_results(
        &self,
        job_name: &str,
        output_path: Option<&Path>,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        let mut batch_job = self.get_batch(job_name).await?;

        // Check if job is complete
        if batch_job.state != BatchJobState::Succeeded {
            return Err(
                format!("Batch job not completed yet (state: {:?})", batch_job.state).into(),
            );
        }

        // If results are inline, return directly
        if batch_job.results.is_some() {
            return Ok(batch_job);
        }

        // If output file URI exists, download it
        if let Some(file_uri) = &batch_job.output_file_uri {
            if let Some(path) = output_path {
                self.download_results_file(file_uri, path).await?;
                tracing::info!("Results downloaded to: {}", path.display());
            } else {
                // Parse and populate inline results
                let results = self.fetch_and_parse_results(file_uri).await?;
                batch_job.results = Some(results);
            }
        }

        Ok(batch_job)
    }

    /// Download batch results JSONL file
    async fn download_results_file(
        &self,
        file_uri: &str,
        output_path: &Path,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        // Parse file URI to get file ID
        let file_id = file_uri.split('/').last().ok_or("Invalid file URI")?;

        let url = format!("{}/files/{}?alt=media", self.base_url, file_id);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let bytes = response.bytes().await?;

        let mut file = fs::File::create(output_path).await?;
        file.write_all(&bytes).await?;
        file.flush().await?;

        Ok(())
    }

    /// Fetch and parse results from JSONL file
    async fn fetch_and_parse_results(
        &self,
        file_uri: &str,
    ) -> Result<Vec<BatchResult>, Box<dyn Error + Send + Sync>> {
        let file_id = file_uri.split('/').last().ok_or("Invalid file URI")?;

        let url = format!("{}/files/{}?alt=media", self.base_url, file_id);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let text = response.text().await?;
        let mut results = Vec::new();

        for (idx, line) in text.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<BatchResult>(line) {
                Ok(mut result) => {
                    result.index = idx as u32;
                    results.push(result);
                }
                Err(e) => {
                    tracing::warn!("Failed to parse result line {}: {}", idx, e);
                }
            }
        }

        Ok(results)
    }

    // ========================================
    // Embeddings Batch
    // ========================================

    /// Create embeddings batch job
    ///
    /// # Arguments
    /// * `request` - Embeddings batch request
    ///
    /// # Returns
    /// EmbeddingsBatchJob with job ID
    pub async fn create_embeddings_batch(
        &self,
        request: CreateEmbeddingsBatchRequest,
    ) -> Result<EmbeddingsBatchJob, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/batches:createEmbeddings", self.base_url);

        tracing::info!(
            "Creating embeddings batch for model: {} with {} texts",
            request.model,
            request.texts.as_ref().map(|t| t.len()).unwrap_or(0)
        );

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let batch_job: EmbeddingsBatchJob = response.json().await?;

        tracing::info!(
            "Embeddings batch created: {} (state: {:?})",
            batch_job.name,
            batch_job.state
        );

        Ok(batch_job)
    }

    /// Get embeddings batch status
    pub async fn get_embeddings_batch(
        &self,
        job_name: &str,
    ) -> Result<EmbeddingsBatchJob, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}", self.base_url, job_name);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let batch_job: EmbeddingsBatchJob = response.json().await?;
        Ok(batch_job)
    }

    // ========================================
    // Image Generation Batch
    // ========================================

    /// Create image generation batch job
    ///
    /// # Arguments
    /// * `request` - Image generation batch request
    ///
    /// # Returns
    /// BatchJob with job ID
    pub async fn create_image_batch(
        &self,
        request: CreateImageBatchRequest,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        // Convert image requests to batch format
        let batch_requests: Vec<Value> = request
            .requests
            .iter()
            .map(|img_req| {
                serde_json::json!({
                    "contents": [{
                        "role": "user",
                        "parts": [{"text": img_req.prompt}]
                    }],
                    "responseModalities": img_req.response_modalities,
                    "generationConfig": img_req.generation_config
                })
            })
            .collect();

        let batch_request = CreateBatchJobRequest {
            requests: Some(batch_requests),
            input_file_uri: None,
            output_config: request.output_config,
            display_name: request.display_name,
            model: request.model,
            metadata: Some(serde_json::json!({"type": "image_generation"})),
        };

        self.create_batch(batch_request).await
    }

    // ========================================
    // JSONL File Helpers
    // ========================================

    /// Upload JSONL file to Google Files API
    ///
    /// # Arguments
    /// * `file_path` - Path to local JSONL file
    /// * `display_name` - Display name for uploaded file
    ///
    /// # Returns
    /// File URI for use in batch requests
    pub async fn upload_jsonl_file(
        &self,
        file_path: &Path,
        display_name: Option<String>,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/files", self.base_url);

        let file_content = fs::read(file_path).await?;

        let form = reqwest::multipart::Form::new().part(
            "file",
            reqwest::multipart::Part::bytes(file_content)
                .file_name(display_name.unwrap_or_else(|| "batch_input.jsonl".to_string()))
                .mime_str("application/jsonl")?,
        );

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let file_response: Value = response.json().await?;
        let file_uri = file_response["uri"]
            .as_str()
            .ok_or("No URI in file upload response")?
            .to_string();

        tracing::info!("Uploaded JSONL file: {}", file_uri);

        Ok(file_uri)
    }

    /// Create JSONL file from batch requests
    ///
    /// # Arguments
    /// * `requests` - List of request objects
    /// * `output_path` - Path to write JSONL file
    ///
    /// # Returns
    /// Success or error
    pub async fn create_jsonl_file(
        &self,
        requests: Vec<Value>,
        output_path: &Path,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let mut file = fs::File::create(output_path).await?;

        for (idx, request) in requests.iter().enumerate() {
            let line = serde_json::json!({
                "custom_id": format!("request_{}", idx),
                "request": request
            });

            let json_line = serde_json::to_string(&line)?;
            file.write_all(json_line.as_bytes()).await?;
            file.write_all(b"\n").await?;
        }

        file.flush().await?;

        tracing::info!(
            "Created JSONL file with {} requests at: {}",
            requests.len(),
            output_path.display()
        );

        Ok(())
    }

    // ========================================
    // Utilities
    // ========================================

    /// Calculate batch cost (50% of standard API pricing)
    ///
    /// # Arguments
    /// * `model` - Model name
    /// * `input_tokens` - Total input tokens
    /// * `output_tokens` - Total output tokens
    /// * `cached_tokens` - Cached tokens (standard pricing applies)
    ///
    /// # Returns
    /// Total cost in USD
    pub fn calculate_batch_cost(
        model: &str,
        input_tokens: u64,
        output_tokens: u64,
        cached_tokens: u64,
    ) -> f64 {
        // Get standard pricing (from google.rs calculate_cost)
        let (input_cost, output_cost) = match model {
            "gemini-3-pro" => (1.5, 6.0),
            "gemini-3-flash" => (0.075, 0.3),
            "gemini-3-deep-think" => (2.0, 8.0),
            "gemini-2.5-pro" | "gemini-2-5-pro" => (1.25, 5.0),
            "gemini-2.5-flash" | "gemini-2-5-flash" => (0.075, 0.3),
            "gemini-2-flash" => (0.1, 0.4),
            _ => (0.5, 1.5),
        };

        // Calculate uncached token cost at 50% discount
        let uncached_tokens = input_tokens.saturating_sub(cached_tokens);
        let input = (uncached_tokens as f64 / 1_000_000.0) * input_cost * 0.5;

        // Cached tokens use standard pricing (no batch discount)
        let cached_cost = (cached_tokens as f64 / 1_000_000.0) * input_cost;

        // Output tokens at 50% discount
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost * 0.5;

        input + cached_cost + output
    }

    /// Poll batch job until completion
    ///
    /// # Arguments
    /// * `job_name` - Batch job name
    /// * `poll_interval_secs` - Seconds between status checks
    /// * `max_wait_secs` - Maximum seconds to wait
    ///
    /// # Returns
    /// Completed BatchJob or timeout error
    pub async fn wait_for_completion(
        &self,
        job_name: &str,
        poll_interval_secs: u64,
        max_wait_secs: u64,
    ) -> Result<BatchJob, Box<dyn Error + Send + Sync>> {
        let start = std::time::Instant::now();
        let max_duration = Duration::from_secs(max_wait_secs);

        loop {
            let batch_job = self.get_batch(job_name).await?;

            match batch_job.state {
                BatchJobState::Succeeded => {
                    tracing::info!(
                        "Batch job completed successfully: {} (elapsed: {:?})",
                        job_name,
                        start.elapsed()
                    );
                    return Ok(batch_job);
                }
                BatchJobState::Failed => {
                    let error_msg = batch_job
                        .error
                        .as_ref()
                        .map(|e| e.message.clone())
                        .unwrap_or_else(|| "Unknown error".to_string());
                    return Err(format!("Batch job failed: {}", error_msg).into());
                }
                BatchJobState::Cancelled => {
                    return Err("Batch job was cancelled".into());
                }
                BatchJobState::Expired => {
                    return Err("Batch job expired before completion".into());
                }
                BatchJobState::Pending | BatchJobState::Running => {
                    if start.elapsed() >= max_duration {
                        return Err(format!(
                            "Batch job timed out after {} seconds (state: {:?})",
                            max_wait_secs, batch_job.state
                        )
                        .into());
                    }

                    tracing::debug!(
                        "Batch job {} still processing (state: {:?}, completed: {}/{})",
                        job_name,
                        batch_job.state,
                        batch_job
                            .stats
                            .as_ref()
                            .map(|s| s.completed_requests)
                            .unwrap_or(0),
                        batch_job
                            .stats
                            .as_ref()
                            .map(|s| s.total_requests)
                            .unwrap_or(0)
                    );

                    tokio::time::sleep(Duration::from_secs(poll_interval_secs)).await;
                }
            }
        }
    }

    /// Handle API error responses
    async fn handle_error(response: reqwest::Response) -> String {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        if let Ok(json_error) = serde_json::from_str::<Value>(&error_text) {
            if let Some(error) = json_error.get("error") {
                return format!(
                    "Google Batch API Error {}: {}",
                    error.get("code").and_then(|c| c.as_i64()).unwrap_or(0),
                    error
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error")
                );
            }
        }

        if status.as_u16() == 429 {
            return "Google Batch API Rate Limit Exceeded. Please try again later.".to_string();
        }

        if status.as_u16() == 413 {
            return "Batch request too large. Use JSONL file upload for batches over 20MB."
                .to_string();
        }

        format!("Google Batch API error {}: {}", status, error_text)
    }

    /// Check if provider is properly configured
    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }
}

// ========================================
// Tests
// ========================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_batch_cost() {
        // Test Gemini 2.5 Pro at 50% batch discount
        // Standard: $1.25 input, $5.00 output per 1M tokens
        // Batch: $0.625 input, $2.50 output per 1M tokens
        let cost =
            GoogleBatchProvider::calculate_batch_cost("gemini-2.5-pro", 1_000_000, 1_000_000, 0);
        assert_eq!(cost, 3.125); // 0.625 + 2.5

        // Test with caching (cache tokens use standard pricing)
        let cost_cached = GoogleBatchProvider::calculate_batch_cost(
            "gemini-2.5-pro",
            1_000_000,
            1_000_000,
            500_000,
        );
        // 500K uncached at $0.625 (50% off) + 500K cached at $1.25 (full price) + 1M output at $2.50 (50% off)
        // = 0.3125 + 0.625 + 2.5 = 3.4375
        assert!((cost_cached - 3.4375).abs() < 0.001);

        // Test Gemini 2.5 Flash
        let cost_flash =
            GoogleBatchProvider::calculate_batch_cost("gemini-2.5-flash", 1_000_000, 1_000_000, 0);
        // Standard: $0.075 input, $0.3 output
        // Batch: $0.0375 input, $0.15 output
        assert!((cost_flash - 0.1875).abs() < 0.001);
    }

    #[test]
    fn test_batch_job_state_serialization() {
        let state = BatchJobState::Running;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"RUNNING\"");

        let deserialized: BatchJobState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, BatchJobState::Running);
    }

    #[test]
    fn test_create_batch_request_serialization() {
        let request = CreateBatchJobRequest {
            requests: Some(vec![serde_json::json!({"test": "data"})]),
            input_file_uri: None,
            output_config: Some(BatchOutputConfig {
                output_type: "inline".to_string(),
                gcs_destination: None,
            }),
            display_name: Some("Test Batch".to_string()),
            model: "gemini-2.5-pro".to_string(),
            metadata: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("gemini-2.5-pro"));
        assert!(json.contains("Test Batch"));
    }
}
