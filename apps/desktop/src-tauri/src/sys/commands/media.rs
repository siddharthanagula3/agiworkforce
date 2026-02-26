use crate::sys::account::{get_access_token, get_api_base_url};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Instant;
use tauri::Manager;

const HISTORY_FILE: &str = "media_history.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64_json: Option<String>,
}

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
    pub quality: Option<String>,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default, alias = "count")]
    pub n: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImageResponse {
    pub images: Vec<GeneratedImage>,
    pub provider: String,
    pub model: Option<String>,
    pub created_at: u64,
    pub revised_prompt: Option<String>,
    pub cost_estimate: Option<f64>,
    pub latency_ms: u64,
}

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
    // SECURITY: `plan` field removed — clients must NOT be able to self-upgrade
    // their subscription tier. The plan tier is determined server-side by the
    // web API based on authenticated user session / BillingState.
    /// Video provider: "runway" or "veo3" (default: "runway")
    #[serde(default)]
    pub provider: Option<String>,
    /// Input image URL for image-to-video models (required for gen4_turbo)
    #[serde(default)]
    pub input_image_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaVideoResponse {
    pub id: String,
    pub status: String,
    pub video_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_secs: Option<u32>,
    pub cost_estimate: Option<f64>,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaHistoryItem {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String, // "image" or "video"
    pub title: String,
    pub prompt: String,
    pub status: String, // "completed" or "processing"
    pub src: Option<String>,
    pub created_at: String, // ISO string
}

#[tauri::command]
pub async fn media_get_history(app: tauri::AppHandle) -> Result<Vec<MediaHistoryItem>, String> {
    load_history(&app).map_err(|e| format!("Failed to load history: {}", e))
}

#[tauri::command]
pub async fn media_generate_image(
    app: tauri::AppHandle,
    request: MediaImageRequest,
) -> Result<MediaImageResponse, String> {
    let token = get_access_token().map_err(|e| format!("Authentication required: {}", e))?;
    let base_url = get_api_base_url();
    let url = format!("{}/api/media/image/generate", base_url);

    let payload = serde_json::json!({
        "prompt": request.prompt,
        "negative_prompt": request.negative_prompt,
        "provider": request.provider,
        "model": request.model,
        "size": request.size,
        "style": request.style,
        "quality": request.quality,
        "n": request.n
    });

    let started = Instant::now();
    // 90s timeout: the web API route has maxDuration=60 and a 55s AbortSignal per provider
    // call, so 90s on our side gives generous headroom without hanging forever.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .post(url)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Image generation request failed: {}", e))?;

    let latency_ms = started.elapsed().as_millis() as u64;

    let status = response.status();
    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse image response: {}", e))?;

    if !status.is_success() || body.get("success").and_then(|v| v.as_bool()) == Some(false) {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Image generation failed");
        return Err(error_msg.to_string());
    }

    let images: Vec<GeneratedImage> = serde_json::from_value(
        body.get("images")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|e| format!("Failed to parse images: {}", e))?;

    let provider_str = body
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("managed_cloud")
        .to_string();
    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let cost_estimate = body.get("cost_estimate").and_then(|v| v.as_f64());

    // Save to history
    let mut history = load_history(&app).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    for img in &images {
        history.push(MediaHistoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "image".to_string(),
            title: payload["prompt"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(30)
                .collect::<String>(),
            prompt: payload["prompt"].as_str().unwrap_or("").to_string(),
            status: "completed".to_string(),
            src: img.url.clone(),
            created_at: now.clone(),
        });
    }
    let _ = save_history(&app, &history);

    Ok(MediaImageResponse {
        images,
        provider: provider_str,
        model,
        created_at: chrono::Utc::now().timestamp() as u64,
        revised_prompt: None,
        cost_estimate,
        latency_ms,
    })
}

#[tauri::command]
pub async fn media_generate_video(
    app: tauri::AppHandle,
    request: MediaVideoRequest,
) -> Result<MediaVideoResponse, String> {
    // Plan tier validation is performed server-side by the web API route
    // based on the authenticated user's subscription. The desktop client
    // does not have access to the plan tier and must not accept it as input.

    let token = get_access_token().map_err(|e| format!("Authentication required: {}", e))?;
    let base_url = get_api_base_url();
    let generate_url = format!("{}/api/media/video/generate", base_url);

    let provider = request.provider.as_deref().unwrap_or("runway");
    let payload = serde_json::json!({
        "prompt": request.prompt,
        "duration_secs": request.duration_secs,
        "resolution": request.resolution,
        "provider": if provider == "veo3" { "google" } else { provider },
    });

    let started = Instant::now();
    // Task-creation call: the web route has maxDuration=60 and a 30s AbortSignal,
    // so 90s here gives headroom without hanging indefinitely.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .post(generate_url)
        .bearer_auth(&token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Video generation request failed: {}", e))?;

    let status = response.status();
    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse video response: {}", e))?;

    if !status.is_success() || body.get("success").and_then(|v| v.as_bool()) == Some(false) {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Video generation failed");
        return Err(error_msg.to_string());
    }

    let task_id = body
        .get("task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing task_id in response".to_string())?
        .to_string();

    let status_url = format!("{}/api/media/video/status?task_id={}", base_url, task_id);

    let mut video_url = None;
    let mut thumbnail_url = None;
    let mut final_status = "processing".to_string();
    let mut attempts = 0u32;
    // Poll for up to 5 minutes: 100 attempts × 3s sleep = 300s maximum wait.
    let max_attempts = 100;
    // Reuse a single client for all status polls; each call has a 45s timeout
    // (the status route has maxDuration=30 and a 20s AbortSignal per provider call).
    let poll_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    while attempts < max_attempts {
        attempts += 1;
        let status_response = poll_client
            .get(&status_url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Video status request failed: {}", e))?;

        let status_body = status_response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse video status: {}", e))?;

        let status_value = status_body
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("processing");

        match status_value {
            "completed" => {
                final_status = "completed".to_string();
                video_url = status_body
                    .get("video_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                thumbnail_url = status_body
                    .get("thumbnail_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                break;
            }
            "failed" => {
                let error_msg = status_body
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Video generation failed");
                return Err(error_msg.to_string());
            }
            _ => {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }
        }
    }

    let latency_ms = started.elapsed().as_millis() as u64;

    // Save to history
    let mut history = load_history(&app).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    history.push(MediaHistoryItem {
        id: task_id.clone(),
        type_: "video".to_string(),
        title: payload["prompt"]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(30)
            .collect::<String>(),
        prompt: payload["prompt"].as_str().unwrap_or("").to_string(),
        status: final_status.clone(),
        src: video_url.clone(),
        created_at: now,
    });
    let _ = save_history(&app, &history);

    Ok(MediaVideoResponse {
        id: task_id,
        status: final_status,
        video_url,
        thumbnail_url,
        duration_secs: request.duration_secs,
        cost_estimate: None,
        latency_ms,
    })
}

fn load_history(app: &tauri::AppHandle) -> anyhow::Result<Vec<MediaHistoryItem>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    let history_path = app_dir.join(HISTORY_FILE);

    if !history_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(history_path)?;
    let history: Vec<MediaHistoryItem> = serde_json::from_str(&content)?;
    Ok(history)
}

fn save_history(app: &tauri::AppHandle, history: &[MediaHistoryItem]) -> anyhow::Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }
    let history_path = app_dir.join(HISTORY_FILE);
    let content = serde_json::to_string_pretty(history)?;
    fs::write(history_path, content)?;
    Ok(())
}

// plan_allows_video removed: plan tier validation is now performed server-side
// by the web API based on authenticated user subscription state.
