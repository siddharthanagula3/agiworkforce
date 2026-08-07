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
    pub provider: String,
    pub model: Option<String>,
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

// Compatibility normalization lives only at this privileged HTTP boundary.
// Desktop presentation ids are never valid managed-cloud wire values.
fn normalize_legacy_desktop_image_provider(provider: Option<&str>) -> Option<&str> {
    match provider {
        Some("google_imagen") | Some("google_imagen_lite") => Some("google"),
        Some("dalle") => Some("openai"),
        Some("stable_diffusion") => Some("stability"),
        other => other,
    }
}

fn normalize_legacy_desktop_image_size(size: Option<&str>) -> Option<&str> {
    match size {
        Some("small") => Some("512x512"),
        Some("medium") => Some("1024x1024"),
        Some("large") | Some("square") => Some("1536x1536"),
        Some("wide") => Some("1792x1024"),
        Some("portrait") => Some("1024x1792"),
        other => other,
    }
}

fn normalize_legacy_desktop_image_quality(quality: Option<&str>) -> Option<&str> {
    match quality {
        Some("premium") => Some("hd"),
        other => other,
    }
}

fn normalize_legacy_desktop_video_provider(provider: Option<&str>) -> Option<&str> {
    match provider {
        Some("veo3") => Some("google"),
        other => other,
    }
}

#[derive(Debug, Serialize)]
struct ManagedMediaImagePayload<'a> {
    prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    negative_prompt: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    style: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    n: Option<u32>,
    operation: &'static str,
    transparent_background: bool,
}

fn build_managed_media_image_payload(
    request: &MediaImageRequest,
) -> Result<serde_json::Value, serde_json::Error> {
    serde_json::to_value(ManagedMediaImagePayload {
        prompt: &request.prompt,
        negative_prompt: request.negative_prompt.as_deref(),
        provider: normalize_legacy_desktop_image_provider(request.provider.as_deref()),
        model: request.model.as_deref(),
        size: normalize_legacy_desktop_image_size(request.size.as_deref()),
        style: request.style.as_deref(),
        quality: normalize_legacy_desktop_image_quality(request.quality.as_deref()),
        n: request.n,
        // This command currently exposes text-to-image generation only. Keep
        // that limitation explicit on the shared managed-media wire contract.
        operation: "generate",
        transparent_background: false,
    })
}

#[derive(Debug, Serialize)]
struct ManagedMediaVideoPayload<'a> {
    prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_secs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolution: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<&'a str>,
}

fn build_managed_media_video_payload(
    request: &MediaVideoRequest,
) -> Result<serde_json::Value, serde_json::Error> {
    serde_json::to_value(ManagedMediaVideoPayload {
        prompt: &request.prompt,
        duration_secs: request.duration_secs,
        resolution: request.resolution.as_deref(),
        provider: normalize_legacy_desktop_video_provider(request.provider.as_deref()),
        model: request.model.as_deref(),
    })
}

#[tauri::command]
pub async fn media_generate_image(
    app: tauri::AppHandle,
    request: MediaImageRequest,
) -> Result<MediaImageResponse, String> {
    let token = get_access_token().map_err(|e| format!("Authentication required: {}", e))?;
    let base_url = get_api_base_url();
    let url = format!("{}/api/media/image/generate", base_url);

    let payload = build_managed_media_image_payload(&request)
        .map_err(|e| format!("Failed to serialize image generation request: {e}"))?;

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

    let payload = build_managed_media_video_payload(&request)
        .map_err(|e| format!("Failed to serialize video generation request: {e}"))?;

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
    let resolved_provider = body
        .get("provider")
        .and_then(|value| value.as_str())
        .or_else(|| normalize_legacy_desktop_video_provider(request.provider.as_deref()))
        .unwrap_or("managed_cloud")
        .to_string();
    let resolved_model = body
        .get("model")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| request.model.clone());

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
        provider: resolved_provider,
        model: resolved_model,
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

#[cfg(test)]
mod tests {
    use super::*;

    // Regression test for a confirmed request-shape bug: media_generate_image
    // previously forwarded the desktop UI's internal ImageProviderId straight
    // through as the web API's `provider` field. None of the four options the
    // UI offers ('google_imagen', 'google_imagen_lite', 'dalle',
    // 'stable_diffusion') are in the shared managed-media provider contract,
    // so every image generation request failed validation regardless of which
    // provider was selected. The accepted wire values are owned by
    // packages/contracts/cloud-contracts/src/managed-media.ts.
    #[test]
    fn maps_every_desktop_image_provider_option_to_a_web_api_accepted_value() {
        const WEB_API_ACCEPTED: [&str; 3] = ["google", "openai", "stability"];

        for desktop_id in [
            "google_imagen",
            "google_imagen_lite",
            "dalle",
            "stable_diffusion",
        ] {
            let mapped = normalize_legacy_desktop_image_provider(Some(desktop_id));
            assert!(
                mapped.is_some_and(|m| WEB_API_ACCEPTED.contains(&m)),
                "desktop provider id '{desktop_id}' mapped to {mapped:?}, \
                 which is not one of the web API's accepted values {WEB_API_ACCEPTED:?}",
            );
        }
    }

    #[test]
    fn maps_each_desktop_image_provider_to_its_specific_expected_value() {
        assert_eq!(
            normalize_legacy_desktop_image_provider(Some("google_imagen")),
            Some("google")
        );
        assert_eq!(
            normalize_legacy_desktop_image_provider(Some("google_imagen_lite")),
            Some("google")
        );
        assert_eq!(
            normalize_legacy_desktop_image_provider(Some("dalle")),
            Some("openai")
        );
        assert_eq!(
            normalize_legacy_desktop_image_provider(Some("stable_diffusion")),
            Some("stability")
        );
    }

    #[test]
    fn passes_through_unrecognized_or_missing_provider_unchanged() {
        // Defensive fallback, matching media_generate_video's equivalent
        // `else { provider }` branch: an already-correct or future value
        // should not be silently mangled.
        assert_eq!(
            normalize_legacy_desktop_image_provider(Some("google")),
            Some("google")
        );
        assert_eq!(normalize_legacy_desktop_image_provider(None), None);
    }

    #[test]
    fn normalizes_desktop_image_size_and_quality_aliases_at_the_cloud_boundary() {
        for (desktop_size, cloud_size) in [
            ("small", "512x512"),
            ("medium", "1024x1024"),
            ("large", "1536x1536"),
            ("square", "1536x1536"),
            ("wide", "1792x1024"),
            ("portrait", "1024x1792"),
        ] {
            assert_eq!(
                normalize_legacy_desktop_image_size(Some(desktop_size)),
                Some(cloud_size)
            );
        }
        assert_eq!(
            normalize_legacy_desktop_image_quality(Some("premium")),
            Some("hd")
        );
    }

    fn managed_media_golden() -> serde_json::Value {
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/contracts/cloud-contracts/src/__fixtures__/managed-media-requests.golden.json"
        )))
        .expect("managed-media golden fixture must be valid JSON")
    }

    #[test]
    fn image_payload_matches_the_shared_cloud_contract_and_omits_absent_values() {
        let fixture = managed_media_golden();
        let image = fixture
            .get("image")
            .expect("golden fixture must contain an image request");
        let request = MediaImageRequest {
            prompt: image["prompt"].as_str().unwrap().to_string(),
            negative_prompt: image["negative_prompt"].as_str().map(str::to_string),
            provider: Some("google_imagen".to_string()),
            model: image["model"].as_str().map(str::to_string),
            size: Some("large".to_string()),
            quality: Some("premium".to_string()),
            style: Some("photorealistic".to_string()),
            n: image["n"].as_u64().map(|value| value as u32),
        };

        assert_eq!(build_managed_media_image_payload(&request).unwrap(), *image);

        let minimal = build_managed_media_image_payload(&MediaImageRequest {
            prompt: "minimal".to_string(),
            negative_prompt: None,
            provider: None,
            model: None,
            size: None,
            quality: None,
            style: None,
            n: None,
        })
        .unwrap();
        assert_eq!(
            minimal,
            serde_json::json!({
                "prompt": "minimal",
                "operation": "generate",
                "transparent_background": false,
            })
        );
    }

    #[test]
    fn video_payload_preserves_the_selected_catalog_model_and_contract_fields() {
        let fixture = managed_media_golden();
        let video = fixture
            .get("video")
            .expect("golden fixture must contain a video request");
        let request = MediaVideoRequest {
            prompt: video["prompt"].as_str().unwrap().to_string(),
            negative_prompt: None,
            duration_secs: video["duration_secs"].as_u64().map(|value| value as u32),
            resolution: video["resolution"].as_str().map(str::to_string),
            style: None,
            model: video["model"].as_str().map(str::to_string),
            provider: Some("veo3".to_string()),
            input_image_url: None,
        };

        assert_eq!(build_managed_media_video_payload(&request).unwrap(), *video);
    }
}
