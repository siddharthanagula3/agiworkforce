use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const RUNWAY_API_BASE: &str = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION: &str = "2024-11-06";

pub struct RunwayClient {
    client: reqwest::Client,
    api_key: String,
}

#[derive(Debug, Clone)]
struct CatalogRunwayVideoModel {
    api_model_id: String,
    accepts_image_input: bool,
    cost_per_second: f64,
}

fn resolve_catalog_video_model(
    selection: &str,
    require_available: bool,
) -> Result<CatalogRunwayVideoModel> {
    let entry = crate::core::llm::models_config::get_all_model_entries()
        .values()
        .find(|entry| {
            (entry.id == selection || entry.api_model_id.as_deref() == Some(selection))
                && entry.provider == "runway"
                && entry.model_type == "video"
                && entry.capabilities.video_gen
                && entry.deprecated != Some(true)
        })
        .ok_or_else(|| {
            APIError::APIError(
                "Selected Runway model is not addressable through the canonical catalog"
                    .to_string(),
            )
        })?;

    if require_available && entry.availability.as_deref() == Some("unavailable") {
        return Err(APIError::APIError(
            entry
                .unavailable_reason
                .clone()
                .unwrap_or_else(|| "Selected Runway model is currently unavailable".to_string()),
        ));
    }

    Ok(CatalogRunwayVideoModel {
        api_model_id: entry.api_model_id.clone().ok_or_else(|| {
            APIError::APIError("Catalog Runway model has no provider wire ID".to_string())
        })?,
        accepts_image_input: entry
            .input_modalities
            .iter()
            .any(|modality| modality == "image"),
        cost_per_second: entry.video_per_second_cost.ok_or_else(|| {
            APIError::APIError("Catalog Runway model has no per-second price".to_string())
        })?,
    })
}

/// Aspect ratio options for video generation
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub enum RunwayAspectRatio {
    /// 1280x720 - Landscape HD
    #[default]
    #[serde(rename = "1280:720")]
    Landscape720,
    /// 720x1280 - Portrait
    #[serde(rename = "720:1280")]
    Portrait720,
    /// 1920x1080 - Landscape Full HD
    #[serde(rename = "1920:1080")]
    Landscape1080,
    /// 1080x1920 - Portrait Full HD
    #[serde(rename = "1080:1920")]
    Portrait1080,
}

impl RunwayAspectRatio {
    pub fn as_api_str(&self) -> &'static str {
        match self {
            RunwayAspectRatio::Landscape720 => "1280:720",
            RunwayAspectRatio::Portrait720 => "720:1280",
            RunwayAspectRatio::Landscape1080 => "1920:1080",
            RunwayAspectRatio::Portrait1080 => "1080:1920",
        }
    }
}

/// Request for text-to-video generation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunwayTextToVideoRequest {
    pub model: String,
    pub prompt_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<bool>,
}

/// Request for image-to-video generation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunwayImageToVideoRequest {
    pub model: String,
    pub prompt_image: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
}

/// Unified video generation request
#[derive(Debug, Clone)]
pub struct RunwayVideoRequest {
    pub prompt: String,
    /// Canonical model key (or its catalog-owned provider wire ID).
    pub model: String,
    pub duration_secs: Option<u32>,
    pub aspect_ratio: Option<RunwayAspectRatio>,
    pub input_image_url: Option<String>,
    pub enable_audio: Option<bool>,
}

/// Task creation response
#[derive(Debug, Clone, Deserialize)]
pub struct RunwayTaskResponse {
    pub id: String,
}

/// Task status response
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunwayTaskStatus {
    pub id: String,
    pub status: RunwayStatus,
    #[serde(default)]
    pub output: Option<Vec<String>>,
    #[serde(default)]
    pub failure: Option<String>,
    #[serde(default)]
    pub failure_code: Option<String>,
    #[serde(default)]
    pub progress: Option<f32>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Task status enum
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RunwayStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Throttled,
}

/// Unified video generation response
#[derive(Debug, Clone)]
pub struct RunwayVideoResponse {
    pub id: String,
    pub status: RunwayStatus,
    pub video_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_secs: Option<u32>,
    pub error: Option<String>,
}

impl RunwayClient {
    pub fn new(config: RequestConfig) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey("Runway".to_string()));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(300));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            api_key: config.api_key,
        })
    }

    /// Generate a video from a text prompt using a catalog-addressed model.
    pub async fn generate_text_to_video(
        &self,
        request: &RunwayVideoRequest,
    ) -> Result<RunwayVideoResponse> {
        let model = resolve_catalog_video_model(&request.model, true)?;
        let api_request = RunwayTextToVideoRequest {
            model: model.api_model_id,
            prompt_text: request.prompt.clone(),
            ratio: request.aspect_ratio.map(|r| r.as_api_str().to_string()),
            duration: request.duration_secs.or(Some(5)),
            audio: request.enable_audio,
        };

        let response = self
            .client
            .post(format!("{}/text_to_video", RUNWAY_API_BASE))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("X-Runway-Version", RUNWAY_API_VERSION)
            .header("Content-Type", "application/json")
            .json(&api_request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        self.handle_task_response(response).await
    }

    /// Generate a video from an image when catalog metadata permits image input.
    pub async fn generate_image_to_video(
        &self,
        request: &RunwayVideoRequest,
    ) -> Result<RunwayVideoResponse> {
        let model = resolve_catalog_video_model(&request.model, true)?;
        if !model.accepts_image_input {
            return Err(APIError::APIError(
                "Selected catalog model does not accept image input".to_string(),
            ));
        }
        let image_url = request.input_image_url.clone().ok_or_else(|| {
            APIError::APIError("Image URL required for image-to-video generation".to_string())
        })?;

        let api_request = RunwayImageToVideoRequest {
            model: model.api_model_id,
            prompt_image: image_url,
            prompt_text: Some(request.prompt.clone()),
            ratio: request.aspect_ratio.map(|r| r.as_api_str().to_string()),
            duration: request.duration_secs.or(Some(5)),
        };

        let response = self
            .client
            .post(format!("{}/image_to_video", RUNWAY_API_BASE))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("X-Runway-Version", RUNWAY_API_VERSION)
            .header("Content-Type", "application/json")
            .json(&api_request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        self.handle_task_response(response).await
    }

    /// Unified video generation - automatically routes to the right endpoint
    pub async fn generate_video(
        &self,
        request: &RunwayVideoRequest,
    ) -> Result<RunwayVideoResponse> {
        if request.input_image_url.is_some() {
            self.generate_image_to_video(request).await
        } else {
            self.generate_text_to_video(request).await
        }
    }

    async fn handle_task_response(
        &self,
        response: reqwest::Response,
    ) -> Result<RunwayVideoResponse> {
        let status = response.status();

        if status.is_success() {
            let task: RunwayTaskResponse = response.json().await.map_err(APIError::HttpError)?;
            Ok(RunwayVideoResponse {
                id: task.id,
                status: RunwayStatus::Pending,
                video_url: None,
                thumbnail_url: None,
                duration_secs: None,
                error: None,
            })
        } else if status.as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Runway".to_string()))
        } else if status.as_u16() == 401 {
            Err(APIError::MissingAPIKey(
                "Runway - Invalid or expired API key".to_string(),
            ))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Runway API error ({}): {}",
                status, error_text
            )))
        }
    }

    /// Check the status of a video generation task
    pub async fn check_status(&self, task_id: &str) -> Result<RunwayVideoResponse> {
        let response = self
            .client
            .get(format!("{}/tasks/{}", RUNWAY_API_BASE, task_id))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("X-Runway-Version", RUNWAY_API_VERSION)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            let task: RunwayTaskStatus = response.json().await.map_err(APIError::HttpError)?;

            let video_url = task.output.as_ref().and_then(|urls| urls.first().cloned());

            Ok(RunwayVideoResponse {
                id: task.id,
                status: task.status,
                video_url,
                thumbnail_url: None, // Runway doesn't provide thumbnails directly
                duration_secs: None,
                error: task.failure,
            })
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Runway status check error: {}",
                error_text
            )))
        }
    }

    /// Wait for video generation to complete
    pub async fn wait_for_completion(
        &self,
        task_id: &str,
        max_wait_secs: u64,
    ) -> Result<RunwayVideoResponse> {
        let start = std::time::Instant::now();
        let max_duration = Duration::from_secs(max_wait_secs);
        let poll_interval = Duration::from_secs(3);

        loop {
            if start.elapsed() > max_duration {
                return Err(APIError::APIError(format!(
                    "Video generation timed out after {} seconds",
                    max_wait_secs
                )));
            }

            let status = self.check_status(task_id).await?;

            match status.status {
                RunwayStatus::Succeeded => return Ok(status),
                RunwayStatus::Failed => {
                    return Err(APIError::APIError(
                        status
                            .error
                            .unwrap_or_else(|| "Video generation failed".to_string()),
                    ));
                }
                RunwayStatus::Throttled => {
                    return Err(APIError::RateLimitExceeded("Runway".to_string()));
                }
                RunwayStatus::Pending | RunwayStatus::Running => {
                    tokio::time::sleep(poll_interval).await;
                }
            }
        }
    }

    /// Estimate cost for a video generation request
    pub fn estimate_cost(model: &str, duration_secs: u32) -> Result<f64> {
        let model = resolve_catalog_video_model(model, false)?;
        let cost = model.cost_per_second * duration_secs as f64;
        Ok((cost * 100.0).round() / 100.0) // Round to 2 decimal places
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_owns_model_identity_and_wire_mapping() {
        let entry = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.provider == "runway" && entry.capabilities.video_gen)
            .expect("catalog must contain a Runway video model");
        let resolved = resolve_catalog_video_model(&entry.id, false).unwrap();

        assert_eq!(
            Some(resolved.api_model_id.as_str()),
            entry.api_model_id.as_deref()
        );
    }

    #[test]
    fn unavailable_catalog_model_fails_closed_for_generation() {
        let entry = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| {
                entry.provider == "runway"
                    && entry.capabilities.video_gen
                    && entry.availability.as_deref() == Some("unavailable")
            })
            .expect("catalog must retain the unavailable Runway entry");

        assert!(resolve_catalog_video_model(&entry.id, true).is_err());
    }

    #[test]
    fn test_cost_estimation_uses_catalog_rate() {
        let entry = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.provider == "runway" && entry.capabilities.video_gen)
            .expect("catalog must contain a Runway video model");
        let expected = entry.video_per_second_cost.unwrap() * 10.0;

        assert_eq!(
            RunwayClient::estimate_cost(&entry.id, 10).unwrap(),
            expected
        );
    }

    #[test]
    fn test_aspect_ratio_strings() {
        assert_eq!(RunwayAspectRatio::Landscape1080.as_api_str(), "1920:1080");
        assert_eq!(RunwayAspectRatio::Portrait720.as_api_str(), "720:1280");
    }

    #[test]
    fn test_request_serialization() {
        let request = RunwayTextToVideoRequest {
            model: "fixture-video-wire-model".to_string(),
            prompt_text: "A beautiful sunset over the ocean".to_string(),
            ratio: Some("1920:1080".to_string()),
            duration: Some(8),
            audio: Some(true),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("fixture-video-wire-model"));
        assert!(json.contains("sunset"));
        assert!(json.contains("1920:1080"));
    }
}
