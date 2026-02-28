use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::time::Instant;

use crate::core::agi::executors::ExecutorContext;
use crate::core::agi::executors::ToolExecutor;
use crate::core::agi::ExecutionContext;

#[allow(unused_imports)]
use crate::sys::account::{get_access_token, get_api_base_url};

/// Request for image generation
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImageRequest {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub n: Option<u32>,
}

/// Response from image generation
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImageResponse {
    pub images: Vec<GeneratedImage>,
    pub provider: String,
    pub model: Option<String>,
    pub created_at: u64,
    #[serde(default)]
    pub revised_prompt: Option<String>,
    #[serde(default)]
    pub cost_estimate: Option<f64>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub b64_json: Option<String>,
}

/// Request for video generation
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVideoRequest {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub duration_secs: Option<u32>,
    #[serde(default)]
    pub resolution: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub plan: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub input_image_url: Option<String>,
}

/// Response from video generation
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVideoResponse {
    pub videos: Vec<GeneratedVideo>,
    pub provider: String,
    pub model: Option<String>,
    pub created_at: u64,
    #[serde(default)]
    pub cost_estimate: Option<f64>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedVideo {
    #[serde(default)]
    pub url: Option<String>,
}

/// Executor for media generation tools (image and video generation)
pub struct MediaExecutor {
    http_client: reqwest::Client,
}

impl MediaExecutor {
    pub fn new() -> Self {
        // Image generation: up to 60s per provider call (handled by web API route).
        // Video generation: the web API creates the task (<30s) and the executor polls
        // for completion — the entire poll loop can take up to 5 minutes (300s).
        // We set the per-request timeout to 90s (generous for individual HTTP calls)
        // and rely on the poll loop's internal 3s sleep + max_attempts for overall cap.
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_else(|e| {
                eprintln!(
                    "Warning: Failed to create HTTP client with timeout ({e}), using default"
                );
                reqwest::Client::new()
            });

        Self { http_client }
    }

    /// Execute image generation
    async fn execute_image_generate(
        &self,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
    ) -> Result<JsonValue> {
        let app_handle = context
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("App handle not available for media generation"))?;

        // Extract parameters
        let prompt = parameters
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required parameter: prompt"))?
            .to_string();

        let negative_prompt = parameters
            .get("negative_prompt")
            .and_then(|v| v.as_str())
            .map(String::from);

        let provider = parameters
            .get("provider")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| "google".to_string());

        let model = parameters
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| "imagen3".to_string());

        let size = parameters
            .get("size")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| "1024x1024".to_string());

        let style = parameters
            .get("style")
            .and_then(|v| v.as_str())
            .map(String::from);

        let quality = parameters
            .get("quality")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| "standard".to_string());

        let n = parameters
            .get("n")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or(1);

        // Get auth token
        let token = crate::sys::account::get_access_token()
            .map_err(|e| anyhow::anyhow!("Authentication required: {}", e))?;
        let base_url = crate::sys::account::get_api_base_url();
        let url = format!("{}/api/media/image/generate", base_url);

        let payload = serde_json::json!({
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "provider": provider,
            "model": model,
            "size": size,
            "style": style,
            "quality": quality,
            "n": n
        });

        let started = Instant::now();

        let response = self
            .http_client
            .post(&url)
            .bearer_auth(&token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Image generation request failed: {}", e))?;

        let latency_ms = started.elapsed().as_millis() as u64;

        let status = response.status();
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse image response: {}", e))?;

        if !status.is_success() || body.get("success").and_then(|v| v.as_bool()) == Some(false) {
            let error_msg = body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Image generation failed");
            return Err(anyhow::anyhow!("{}", error_msg));
        }

        let images: Vec<GeneratedImage> = serde_json::from_value(
            body.get("images")
                .cloned()
                .unwrap_or_else(|| serde_json::json!([])),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse images: {}", e))?;

        let provider_str = body
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("google")
            .to_string();
        let model = body.get("model").and_then(|v| v.as_str()).map(String::from);
        let cost_estimate = body.get("cost_estimate").and_then(|v| v.as_f64());

        // Save to history
        if let Err(e) = save_image_to_history(app_handle, &prompt, &images).await {
            tracing::warn!("Failed to save image to history: {}", e);
        }

        let result = MediaImageResponse {
            images,
            provider: provider_str,
            model,
            created_at: chrono::Utc::now().timestamp() as u64,
            revised_prompt: body
                .get("revised_prompt")
                .and_then(|v| v.as_str())
                .map(String::from),
            cost_estimate,
            latency_ms,
        };

        Ok(serde_json::to_value(result)?)
    }

    /// Execute video generation
    async fn execute_video_generate(
        &self,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
    ) -> Result<JsonValue> {
        let app_handle = context
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("App handle not available for media generation"))?;

        // Extract parameters
        let prompt = parameters
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required parameter: prompt"))?
            .to_string();

        let provider = parameters
            .get("provider")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| "runway".to_string());

        let model = parameters
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from);

        let duration_secs = parameters
            .get("duration_seconds")
            .or_else(|| parameters.get("duration_secs"))
            .or_else(|| parameters.get("duration"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let resolution = parameters
            .get("resolution")
            .and_then(|v| v.as_str())
            .map(String::from);

        let style = parameters
            .get("style")
            .and_then(|v| v.as_str())
            .map(String::from);

        // Get auth token
        let token = crate::sys::account::get_access_token()
            .map_err(|e| anyhow::anyhow!("Authentication required: {}", e))?;
        let base_url = crate::sys::account::get_api_base_url();
        let url = format!("{}/api/media/video/generate", base_url);

        let payload = serde_json::json!({
            "prompt": prompt,
            "provider": provider,
            "model": model,
            "duration_secs": duration_secs,
            "resolution": resolution,
            "style": style
        });

        let started = Instant::now();

        let response = self
            .http_client
            .post(&url)
            .bearer_auth(&token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Video generation request failed: {}", e))?;

        let latency_ms = started.elapsed().as_millis() as u64;

        let status = response.status();
        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse video response: {}", e))?;

        if !status.is_success() || body.get("success").and_then(|v| v.as_bool()) == Some(false) {
            let error_msg = body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Video generation failed");
            return Err(anyhow::anyhow!("{}", error_msg));
        }

        let videos: Vec<GeneratedVideo> = serde_json::from_value(
            body.get("videos")
                .cloned()
                .unwrap_or_else(|| serde_json::json!([])),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse videos: {}", e))?;

        let provider_str = body
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("runway")
            .to_string();
        let model = body.get("model").and_then(|v| v.as_str()).map(String::from);
        let cost_estimate = body.get("cost_estimate").and_then(|v| v.as_f64());

        // Save to history
        if let Err(e) = save_video_to_history(app_handle, &prompt, &videos).await {
            tracing::warn!("Failed to save video to history: {}", e);
        }

        let result = MediaVideoResponse {
            videos,
            provider: provider_str,
            model,
            created_at: chrono::Utc::now().timestamp() as u64,
            cost_estimate,
            latency_ms,
        };

        Ok(serde_json::to_value(result)?)
    }
}

impl Default for MediaExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for MediaExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "image_generate",
            "video_generate",
            "media_generate_image",
            "media_generate_video",
        ]
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<JsonValue> {
        match tool_name {
            "image_generate" | "media_generate_image" => {
                self.execute_image_generate(parameters, context).await
            }
            "video_generate" | "media_generate_video" => {
                self.execute_video_generate(parameters, context).await
            }
            _ => Err(anyhow::anyhow!("Unknown media tool: {}", tool_name)),
        }
    }

    fn description(&self) -> &'static str {
        "Media generation executor for image and video creation"
    }
}

/// Save generated image to history (file-based)
async fn save_image_to_history(
    app: &tauri::AppHandle,
    prompt: &str,
    images: &[GeneratedImage],
) -> Result<()> {
    use chrono::Utc;
    use tauri::Manager;
    use uuid::Uuid;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    tokio::fs::create_dir_all(&app_dir)
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let history_path = app_dir.join("media_history.json");
    let mut history: Vec<crate::sys::commands::media::MediaHistoryItem> = if history_path.exists() {
        let content = tokio::fs::read_to_string(&history_path).await?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    let now = Utc::now().to_rfc3339();
    for img in images {
        history.push(crate::sys::commands::media::MediaHistoryItem {
            id: Uuid::new_v4().to_string(),
            type_: "image".to_string(),
            title: prompt.chars().take(30).collect(),
            prompt: prompt.to_string(),
            status: "completed".to_string(),
            src: Some(img.url.clone().unwrap_or_default()),
            created_at: now.clone(),
        });
    }

    let content = serde_json::to_string_pretty(&history)?;
    tokio::fs::write(history_path, content).await?;

    Ok(())
}

/// Save generated video to history (file-based)
async fn save_video_to_history(
    app: &tauri::AppHandle,
    prompt: &str,
    videos: &[GeneratedVideo],
) -> Result<()> {
    use chrono::Utc;
    use tauri::Manager;
    use uuid::Uuid;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    tokio::fs::create_dir_all(&app_dir)
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let history_path = app_dir.join("media_history.json");
    let mut history: Vec<crate::sys::commands::media::MediaHistoryItem> = if history_path.exists() {
        let content = tokio::fs::read_to_string(&history_path).await?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    let now = Utc::now().to_rfc3339();
    for video in videos {
        history.push(crate::sys::commands::media::MediaHistoryItem {
            id: Uuid::new_v4().to_string(),
            type_: "video".to_string(),
            title: prompt.chars().take(30).collect(),
            prompt: prompt.to_string(),
            status: "completed".to_string(),
            src: Some(video.url.clone().unwrap_or_default()),
            created_at: now.clone(),
        });
    }

    let content = serde_json::to_string_pretty(&history)?;
    tokio::fs::write(history_path, content).await?;

    Ok(())
}
