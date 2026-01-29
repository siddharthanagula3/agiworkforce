use crate::integrations::api_integrations::image_gen::{
    GeneratedImage, ImageGenerationClient, ImageGenerationRequest, ImageProvider, ImageQuality,
    ImageSize,
};
use crate::integrations::api_integrations::runway::{
    RunwayAspectRatio, RunwayClient, RunwayStatus, RunwayVideoModel, RunwayVideoRequest,
};
use crate::integrations::api_integrations::veo3::{
    Veo3Client, VideoGenerationRequest, VideoResolution, VideoStatus,
};
use crate::integrations::api_integrations::{APIError, RequestConfig};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Instant;
use tauri::Manager;

const HISTORY_FILE: &str = "media_history.json";

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
    #[serde(default)]
    pub plan: Option<String>,
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
    let provider = map_image_provider(request.provider.as_deref());
    let provider_str = provider_to_label(&provider);

    let api_key = resolve_api_key(provider_hint(&provider))
        .map_err(|e| format!("API key for {} missing: {}", provider_str, e))?;

    let client = ImageGenerationClient::new(
        provider,
        RequestConfig {
            api_key,
            timeout_secs: Some(120),
            max_retries: Some(2),
        },
    )
    .map_err(|e| format!("Failed to initialize image client: {}", e))?;

    let size = match request.size.as_deref() {
        Some("small") => Some(ImageSize::Small),
        Some("medium") => Some(ImageSize::Medium),
        Some("large") => Some(ImageSize::Large),
        Some("wide") => Some(ImageSize::Wide),
        Some("portrait") => Some(ImageSize::Portrait),
        _ => Some(ImageSize::Large),
    };

    let quality = match request.quality.as_deref() {
        Some("hd") | Some("premium") => Some(ImageQuality::HD),
        Some("standard") | None => Some(ImageQuality::Standard),
        _ => None,
    };

    let build_request = ImageGenerationRequest {
        prompt: request.prompt.clone(),
        negative_prompt: request.negative_prompt.clone(),
        model: request.model.clone(),
        size,
        style: request.style.clone(),
        quality,
        n: request.n.or(Some(1)),
    };

    let started = Instant::now();
    let response = client
        .generate_image(&build_request)
        .await
        .map_err(|e| format!("Image generation failed: {}", e))?;
    let latency_ms = started.elapsed().as_millis() as u64;

    // Save to history
    let mut history = load_history(&app).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    for img in &response.images {
        history.push(MediaHistoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "image".to_string(),
            title: request.prompt.chars().take(30).collect::<String>(),
            prompt: request.prompt.clone(),
            status: "completed".to_string(),
            src: img.url.clone(),
            created_at: now.clone(),
        });
    }
    let _ = save_history(&app, &history);

    Ok(MediaImageResponse {
        images: response.images,
        provider: provider_str.to_string(),
        model: request.model,
        created_at: response.created_at,
        revised_prompt: response.revised_prompt,
        cost_estimate: estimate_image_cost(&provider, build_request.n.unwrap_or(1)),
        latency_ms,
    })
}

#[tauri::command]
pub async fn media_generate_video(
    app: tauri::AppHandle,
    request: MediaVideoRequest,
) -> Result<MediaVideoResponse, String> {
    if let Some(plan) = request.plan.as_deref() {
        if !plan_allows_video(plan) {
            return Err("Video generation requires Pro or Max subscription".to_string());
        }
    }

    let provider = request.provider.as_deref().unwrap_or("runway");
    let started = Instant::now();

    let response = match provider {
        "runway" => generate_video_runway(&request).await?,
        "veo3" | "google" => generate_video_veo3(&request).await?,
        _ => generate_video_runway(&request).await?, // Default to Runway
    };

    let latency_ms = started.elapsed().as_millis() as u64;

    // Save to history
    let mut history = load_history(&app).unwrap_or_default();
    let now = Utc::now().to_rfc3339();

    history.push(MediaHistoryItem {
        id: response.id.clone(),
        type_: "video".to_string(),
        title: request.prompt.chars().take(30).collect::<String>(),
        prompt: request.prompt.clone(),
        status: "completed".to_string(),
        src: response.video_url.clone(),
        created_at: now,
    });
    let _ = save_history(&app, &history);

    Ok(MediaVideoResponse {
        id: response.id,
        status: response.status,
        video_url: response.video_url,
        thumbnail_url: response.thumbnail_url,
        duration_secs: response.duration_secs,
        cost_estimate: response.cost_estimate,
        latency_ms,
    })
}

/// Generate video using Runway API
async fn generate_video_runway(request: &MediaVideoRequest) -> Result<VideoGenResult, String> {
    let api_key =
        resolve_api_key("runway").map_err(|e| format!("Runway API key missing: {}", e))?;

    let client = RunwayClient::new(RequestConfig {
        api_key,
        timeout_secs: Some(300),
        max_retries: Some(1),
    })
    .map_err(|e| format!("Failed to initialize Runway client: {}", e))?;

    // Determine model based on whether an input image is provided
    let model = match request.model.as_deref() {
        Some("gen4_turbo") => RunwayVideoModel::Gen4Turbo,
        Some("gen4_aleph") => RunwayVideoModel::Gen4Aleph,
        Some("veo3.1") | Some("veo31") => RunwayVideoModel::Veo31,
        Some("veo3.1_fast") | Some("veo31_fast") => RunwayVideoModel::Veo31Fast,
        _ => {
            // Default: use Veo31Fast for text-to-video, Gen4Turbo for image-to-video
            if request.input_image_url.is_some() {
                RunwayVideoModel::Gen4Turbo
            } else {
                RunwayVideoModel::Veo31Fast
            }
        }
    };

    // Parse aspect ratio from resolution
    let aspect_ratio = match request.resolution.as_deref() {
        Some("1080p") | Some("fhd") | Some("1920x1080") => Some(RunwayAspectRatio::Landscape1080),
        Some("portrait") | Some("720x1280") => Some(RunwayAspectRatio::Portrait720),
        Some("portrait_hd") | Some("1080x1920") => Some(RunwayAspectRatio::Portrait1080),
        _ => Some(RunwayAspectRatio::Landscape720),
    };

    let duration = request.duration_secs.unwrap_or(5).min(10); // Max 10 seconds

    let runway_request = RunwayVideoRequest {
        prompt: request.prompt.clone(),
        model,
        duration_secs: Some(duration),
        aspect_ratio,
        input_image_url: request.input_image_url.clone(),
        enable_audio: Some(true),
    };

    // Start generation
    let initial = client
        .generate_video(&runway_request)
        .await
        .map_err(|e| format!("Runway video generation failed: {}", e))?;

    // Wait for completion (up to 5 minutes)
    let final_response = client
        .wait_for_completion(&initial.id, 300)
        .await
        .map_err(|e| format!("Runway video generation polling failed: {}", e))?;

    let status = match final_response.status {
        RunwayStatus::Succeeded => "completed",
        RunwayStatus::Failed => "failed",
        RunwayStatus::Throttled => "throttled",
        _ => "processing",
    };

    Ok(VideoGenResult {
        id: final_response.id,
        status: status.to_string(),
        video_url: final_response.video_url,
        thumbnail_url: final_response.thumbnail_url,
        duration_secs: Some(duration),
        cost_estimate: Some(RunwayClient::estimate_cost(model, duration)),
    })
}

/// Generate video using Google Veo3 API
async fn generate_video_veo3(request: &MediaVideoRequest) -> Result<VideoGenResult, String> {
    let api_key =
        resolve_api_key("google").map_err(|e| format!("API key for Veo/Google missing: {}", e))?;

    let client = Veo3Client::new(RequestConfig {
        api_key,
        timeout_secs: Some(240),
        max_retries: Some(1),
    })
    .map_err(|e| format!("Failed to initialize Veo client: {}", e))?;

    let resolution = match request.resolution.as_deref() {
        Some("4k") | Some("uhd") => Some(VideoResolution::UHD),
        Some("1080p") | Some("fhd") => Some(VideoResolution::FullHD),
        _ => Some(VideoResolution::HD),
    };

    let build_request = VideoGenerationRequest {
        prompt: request.prompt.clone(),
        duration_secs: request.duration_secs.or(Some(8)),
        resolution,
        style: request.style.clone(),
        negative_prompt: request.negative_prompt.clone(),
    };

    let initial = client
        .generate_video(&build_request)
        .await
        .map_err(|e| format!("Video generation failed: {}", e))?;

    let mut final_response = initial.clone();
    if matches!(
        initial.status,
        VideoStatus::Processing | VideoStatus::Queued
    ) {
        final_response = client
            .wait_for_completion(&initial.id, 240)
            .await
            .map_err(|e| format!("Video generation polling failed: {}", e))?;
    }

    let status = match final_response.status {
        VideoStatus::Completed => "completed",
        VideoStatus::Failed => "failed",
        _ => "processing",
    };

    Ok(VideoGenResult {
        id: final_response.id,
        status: status.to_string(),
        video_url: final_response.video_url,
        thumbnail_url: final_response.thumbnail_url,
        duration_secs: final_response.duration_secs,
        cost_estimate: Some(estimate_video_cost(
            build_request.duration_secs.unwrap_or(8),
            build_request.resolution.unwrap_or(VideoResolution::HD),
        )),
    })
}

/// Internal result struct for video generation
struct VideoGenResult {
    id: String,
    status: String,
    video_url: Option<String>,
    thumbnail_url: Option<String>,
    duration_secs: Option<u32>,
    cost_estimate: Option<f64>,
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

fn map_image_provider(source: Option<&str>) -> ImageProvider {
    match source.unwrap_or("google_imagen") {
        "google_imagen_lite" | "nano_banana" | "imagen_nano" => ImageProvider::GoogleImagenLite,
        "dalle" | "openai" | "openai_dalle" => ImageProvider::DALLE,
        "stable_diffusion" | "sdxl" | "stability" => ImageProvider::StableDiffusion,
        "midjourney" => ImageProvider::Midjourney,
        _ => ImageProvider::GoogleImagen,
    }
}

fn provider_hint(provider: &ImageProvider) -> &'static str {
    match provider {
        ImageProvider::DALLE => "openai",
        ImageProvider::StableDiffusion => "stability",
        ImageProvider::Midjourney => "midjourney",
        ImageProvider::GoogleImagen | ImageProvider::GoogleImagenLite => "google",
    }
}

fn provider_to_label(provider: &ImageProvider) -> &'static str {
    match provider {
        ImageProvider::DALLE => "dall-e-3",
        ImageProvider::StableDiffusion => "stability-sdxl",
        ImageProvider::Midjourney => "midjourney",
        ImageProvider::GoogleImagen => "google-imagen-3.1-pro",
        ImageProvider::GoogleImagenLite => "google-imagen-3.1-nano",
    }
}

fn resolve_api_key(provider: &str) -> Result<String, APIError> {
    let env_keys: Vec<String> = match provider {
        "openai" => vec!["OPENAI_API_KEY".to_string()],
        "stability" => vec!["STABILITY_API_KEY".to_string(), "STABILITY_KEY".to_string()],
        "midjourney" => vec!["MIDJOURNEY_API_KEY".to_string()],
        "runway" => vec!["RUNWAY_API_KEY".to_string(), "RUNWAY_KEY".to_string()],
        "google" => vec![
            "GOOGLE_API_KEY".to_string(),
            "VERTEX_API_KEY".to_string(),
            "GENAI_API_KEY".to_string(),
        ],
        _ => vec![provider.to_uppercase()],
    };

    for key in env_keys {
        if let Ok(value) = std::env::var(&key) {
            if !value.is_empty() {
                return Ok(value);
            }
        }
    }

    // Fallback to encrypted database storage
    let app_data = dirs::data_dir()
        .ok_or_else(|| APIError::APIError("Failed to get app data directory".to_string()))?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    if db_path.exists() {
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            let api_key_key = format!("api_key_{}", provider);
            if let Ok(encrypted_value) = conn.query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1 AND encrypted = 1",
                rusqlite::params![api_key_key],
                |row| row.get::<_, String>(0),
            ) {
                // Decrypt using machine-derived key
                if let Some(decrypted) = decrypt_api_key(&encrypted_value) {
                    return Ok(decrypted);
                }
            }
        }
    }

    Err(APIError::MissingAPIKey(provider.to_string()))
}

/// Decrypt an API key using machine-derived keys
fn decrypt_api_key(encrypted: &str) -> Option<String> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::DatabaseEncryption);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Decode from base64
    let combined = general_purpose::STANDARD.decode(encrypted).ok()?;

    if combined.len() < 12 {
        return None;
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;

    // Parse the JSON string value
    if let Ok(value) = String::from_utf8(plaintext) {
        // The value is stored as a JSON string, so we need to parse it
        if let Ok(parsed) = serde_json::from_str::<String>(&value) {
            return Some(parsed);
        }
        // If not valid JSON, return as-is
        return Some(value);
    }
    None
}

fn estimate_image_cost(provider: &ImageProvider, count: u32) -> Option<f64> {
    let unit = match provider {
        ImageProvider::GoogleImagen => 0.025,
        ImageProvider::GoogleImagenLite => 0.0035,
        ImageProvider::DALLE => 0.04,
        ImageProvider::StableDiffusion => 0.01,
        ImageProvider::Midjourney => 0.08,
    };
    Some((unit * count as f64 * 100.0).round() / 100.0)
}

fn estimate_video_cost(duration_secs: u32, resolution: VideoResolution) -> f64 {
    let base = 0.1_f64;
    let duration_factor = (duration_secs.max(4) as f64) / 8.0;
    let resolution_factor = match resolution {
        VideoResolution::HD => 1.0,
        VideoResolution::FullHD => 1.35,
        VideoResolution::UHD => 1.8,
    };
    ((base * duration_factor * resolution_factor) * 100.0).round() / 100.0
}

fn plan_allows_video(plan: &str) -> bool {
    let plan_lc = plan.to_lowercase();
    let allowed = [
        "pro",
        "proplus",
        "max",
        "team",
        "enterprise",
        "pro+",
        "premium",
    ];
    allowed.iter().any(|p| plan_lc.contains(p))
}
