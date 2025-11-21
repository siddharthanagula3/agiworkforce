use crate::api_integrations::image_gen::{
    GeneratedImage, ImageGenerationClient, ImageGenerationRequest, ImageProvider, ImageQuality,
    ImageSize,
};
use crate::api_integrations::veo3::{
    Veo3Client, VideoGenerationRequest, VideoResolution, VideoStatus,
};
use crate::api_integrations::{APIError, RequestConfig};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::time::Instant;

const KEYRING_SERVICE: &str = "AGIWorkforce";

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
    pub plan: Option<String>, // frontend can pass plan_name for gating
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

/// Generate images with a concrete provider (Imagen/DALL-E/SDXL)
#[tauri::command]
pub async fn media_generate_image(request: MediaImageRequest) -> Result<MediaImageResponse, String> {
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

/// Generate video via Veo 3.1 (Google DeepMind) with optional Pro/Max gating
#[tauri::command]
pub async fn media_generate_video(request: MediaVideoRequest) -> Result<MediaVideoResponse, String> {
    if let Some(plan) = request.plan.as_deref() {
        if !plan_allows_video(plan) {
            return Err("Video generation requires Pro or Max subscription".to_string());
        }
    }

    let api_key = resolve_api_key("google")
        .map_err(|e| format!("API key for Veo/Google missing: {}", e))?;

    let client = Veo3Client::new(RequestConfig {
        api_key,
        timeout_secs: Some(240), // Videos are slower to render
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
        style: request.style,
        negative_prompt: request.negative_prompt,
    };

    let started = Instant::now();
    let initial = client
        .generate_video(&build_request)
        .await
        .map_err(|e| format!("Video generation failed: {}", e))?;

    let mut final_response = initial.clone();
    if matches!(initial.status, VideoStatus::Processing | VideoStatus::Queued) {
        // Poll for completion with a generous timeout
        final_response = client
            .wait_for_completion(&initial.id, 240)
            .await
            .map_err(|e| format!("Video generation polling failed: {}", e))?;
    }

    let latency_ms = started.elapsed().as_millis() as u64;

    Ok(MediaVideoResponse {
        id: final_response.id,
        status: format!("{:?}", final_response.status).to_lowercase(),
        video_url: final_response.video_url,
        thumbnail_url: final_response.thumbnail_url,
        duration_secs: final_response.duration_secs,
        cost_estimate: Some(estimate_video_cost(
            build_request.duration_secs.unwrap_or(8),
            build_request.resolution.unwrap_or(VideoResolution::HD),
        )),
        latency_ms,
    })
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

    // Fallback to keyring (shared with settings module)
    let entry = Entry::new(KEYRING_SERVICE, &format!("api_key_{}", provider))
        .map_err(|e| APIError::APIError(format!("Keyring unavailable: {}", e)))?;

    entry
        .get_password()
        .map_err(|_| APIError::MissingAPIKey(provider.to_string()))
}

fn estimate_image_cost(provider: &ImageProvider, count: u32) -> Option<f64> {
    let unit = match provider {
        ImageProvider::GoogleImagen => 0.025,      // estimated per image (pro quality)
        ImageProvider::GoogleImagenLite => 0.0035, // "banana" nano tier
        ImageProvider::DALLE => 0.04,
        ImageProvider::StableDiffusion => 0.01,
        ImageProvider::Midjourney => 0.08, // placeholder for proxy costs
    };
    Some((unit * count as f64 * 100.0).round() / 100.0)
}

fn estimate_video_cost(duration_secs: u32, resolution: VideoResolution) -> f64 {
    let base = 0.1_f64; // rough per-clip baseline
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
