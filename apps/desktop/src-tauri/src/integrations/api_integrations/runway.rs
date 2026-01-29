use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const RUNWAY_API_BASE: &str = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION: &str = "2024-11-06";

pub struct RunwayClient {
    client: reqwest::Client,
    api_key: String,
}

/// Video generation model options
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunwayVideoModel {
    /// Gen-4 Turbo - image-to-video (5 credits/sec) - fastest, for drafts
    #[default]
    Gen4Turbo,
    /// Gen-4 Aleph - higher quality (15 credits/sec)
    Gen4Aleph,
    /// Veo 3.1 - text-to-video (40 credits/sec) - best quality
    Veo31,
    /// Veo 3.1 Fast - text-to-video (15 credits/sec) - faster
    Veo31Fast,
}

impl RunwayVideoModel {
    pub fn as_api_str(&self) -> &'static str {
        match self {
            RunwayVideoModel::Gen4Turbo => "gen4_turbo",
            RunwayVideoModel::Gen4Aleph => "gen4_aleph",
            RunwayVideoModel::Veo31 => "veo3.1",
            RunwayVideoModel::Veo31Fast => "veo3.1_fast",
        }
    }

    /// Returns true if the model requires an input image
    pub fn requires_image(&self) -> bool {
        matches!(
            self,
            RunwayVideoModel::Gen4Turbo | RunwayVideoModel::Gen4Aleph
        )
    }

    /// Cost per second in credits
    pub fn credits_per_second(&self) -> f64 {
        match self {
            RunwayVideoModel::Gen4Turbo => 5.0,
            RunwayVideoModel::Gen4Aleph => 15.0,
            RunwayVideoModel::Veo31 => 40.0,
            RunwayVideoModel::Veo31Fast => 15.0,
        }
    }

    /// Cost per second in USD ($0.01 per credit)
    pub fn cost_per_second(&self) -> f64 {
        self.credits_per_second() * 0.01
    }
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
    pub model: RunwayVideoModel,
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

    /// Generate a video from text prompt (uses Veo models)
    pub async fn generate_text_to_video(
        &self,
        request: &RunwayVideoRequest,
    ) -> Result<RunwayVideoResponse> {
        let api_request = RunwayTextToVideoRequest {
            model: request.model.as_api_str().to_string(),
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

    /// Generate a video from an image (uses Gen-4 models)
    pub async fn generate_image_to_video(
        &self,
        request: &RunwayVideoRequest,
    ) -> Result<RunwayVideoResponse> {
        let image_url = request.input_image_url.clone().ok_or_else(|| {
            APIError::APIError("Image URL required for image-to-video generation".to_string())
        })?;

        let api_request = RunwayImageToVideoRequest {
            model: request.model.as_api_str().to_string(),
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
        if request.model.requires_image() {
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
    pub fn estimate_cost(model: RunwayVideoModel, duration_secs: u32) -> f64 {
        let cost = model.cost_per_second() * duration_secs as f64;
        (cost * 100.0).round() / 100.0 // Round to 2 decimal places
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_api_strings() {
        assert_eq!(RunwayVideoModel::Gen4Turbo.as_api_str(), "gen4_turbo");
        assert_eq!(RunwayVideoModel::Veo31.as_api_str(), "veo3.1");
        assert_eq!(RunwayVideoModel::Veo31Fast.as_api_str(), "veo3.1_fast");
    }

    #[test]
    fn test_model_requires_image() {
        assert!(RunwayVideoModel::Gen4Turbo.requires_image());
        assert!(RunwayVideoModel::Gen4Aleph.requires_image());
        assert!(!RunwayVideoModel::Veo31.requires_image());
        assert!(!RunwayVideoModel::Veo31Fast.requires_image());
    }

    #[test]
    fn test_cost_estimation() {
        // Gen4Turbo: 5 credits/sec * $0.01/credit = $0.05/sec
        assert_eq!(
            RunwayClient::estimate_cost(RunwayVideoModel::Gen4Turbo, 10),
            0.5
        );

        // Veo31Fast: 15 credits/sec * $0.01/credit = $0.15/sec
        assert_eq!(
            RunwayClient::estimate_cost(RunwayVideoModel::Veo31Fast, 10),
            1.5
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
            model: "veo3.1_fast".to_string(),
            prompt_text: "A beautiful sunset over the ocean".to_string(),
            ratio: Some("1920:1080".to_string()),
            duration: Some(8),
            audio: Some(true),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("veo3.1_fast"));
        assert!(json.contains("sunset"));
        assert!(json.contains("1920:1080"));
    }
}
