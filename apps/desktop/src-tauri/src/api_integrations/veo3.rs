use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Veo3 API client for video generation (Google's video generation model)
pub struct Veo3Client {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoGenerationRequest {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<VideoResolution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum VideoResolution {
    #[serde(rename = "720p")]
    HD,
    #[serde(rename = "1080p")]
    FullHD,
    #[serde(rename = "4k")]
    UHD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoGenerationResponse {
    pub id: String,
    pub status: VideoStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum VideoStatus {
    Queued,
    Processing,
    Completed,
    Failed,
}

impl Veo3Client {
    pub fn new(config: RequestConfig) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey("Veo3".to_string()));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(120)); // Longer timeout for video
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            api_key: config.api_key,
            base_url: "https://videogen.googleapis.com/v1".to_string(), // Example URL
        })
    }

    /// Generate a video from a text prompt
    pub async fn generate_video(
        &self,
        request: &VideoGenerationRequest,
    ) -> Result<VideoGenerationResponse> {
        let url = format!("{}/videos:generate", self.base_url);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            response
                .json::<VideoGenerationResponse>()
                .await
                .map_err(APIError::HttpError)
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Veo3".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Veo3 API error: {}",
                error_text
            )))
        }
    }

    /// Check the status of a video generation job
    pub async fn check_status(&self, video_id: &str) -> Result<VideoGenerationResponse> {
        let url = format!("{}/videos/{}", self.base_url, video_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            response
                .json::<VideoGenerationResponse>()
                .await
                .map_err(APIError::HttpError)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Veo3 status check error: {}",
                error_text
            )))
        }
    }

    /// Wait for video generation to complete (with polling)
    pub async fn wait_for_completion(
        &self,
        video_id: &str,
        max_wait_secs: u64,
    ) -> Result<VideoGenerationResponse> {
        let start = std::time::Instant::now();
        let max_duration = Duration::from_secs(max_wait_secs);

        loop {
            if start.elapsed() > max_duration {
                return Err(APIError::APIError(format!(
                    "Video generation timed out after {} seconds",
                    max_wait_secs
                )));
            }

            let status = self.check_status(video_id).await?;

            match status.status {
                VideoStatus::Completed => return Ok(status),
                VideoStatus::Failed => {
                    return Err(APIError::APIError(
                        status
                            .error
                            .unwrap_or_else(|| "Video generation failed".to_string()),
                    ));
                }
                VideoStatus::Processing | VideoStatus::Queued => {
                    // Wait 5 seconds before checking again
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }

    /// Download the generated video
    pub async fn download_video(&self, video_url: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get(video_url)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(APIError::HttpError)
        } else {
            Err(APIError::APIError("Failed to download video".to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_request_serialization() {
        let request = VideoGenerationRequest {
            prompt: "A beautiful sunset over the ocean".to_string(),
            duration_secs: Some(10),
            resolution: Some(VideoResolution::FullHD),
            style: Some("cinematic".to_string()),
            negative_prompt: Some("blurry, low quality".to_string()),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("sunset"));
        assert!(json.contains("1080p"));
    }

    #[test]
    fn test_video_status() {
        assert_eq!(VideoStatus::Completed, VideoStatus::Completed);
        assert_ne!(VideoStatus::Processing, VideoStatus::Failed);
    }
}
