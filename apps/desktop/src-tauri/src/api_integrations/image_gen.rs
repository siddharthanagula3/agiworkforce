use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// Image generation provider
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImageProvider {
    DALLE,
    StableDiffusion,
    Midjourney,
    /// Google Imagen 3 (pro tier)
    GoogleImagen,
    /// Google Imagen Nano ("banana") fast/cheap tier
    GoogleImagenLite,
}

/// Unified image generation client supporting multiple providers
pub struct ImageGenerationClient {
    client: reqwest::Client,
    provider: ImageProvider,
    api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<ImageSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<ImageQuality>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>, // Number of images to generate
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageSize {
    #[serde(rename = "256x256")]
    Small,
    #[serde(rename = "512x512")]
    Medium,
    #[serde(rename = "1024x1024")]
    Large,
    #[serde(rename = "1792x1024")]
    Wide,
    #[serde(rename = "1024x1792")]
    Portrait,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageQuality {
    Standard,
    HD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationResponse {
    pub images: Vec<GeneratedImage>,
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64_json: Option<String>,
}

impl ImageGenerationClient {
    pub fn new(provider: ImageProvider, config: RequestConfig) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey(format!("{:?}", provider)));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(60));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            provider,
            api_key: config.api_key,
        })
    }

    /// Generate images based on the configured provider
    pub async fn generate_image(
        &self,
        request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        match self.provider {
            ImageProvider::DALLE => self.generate_with_dalle(request).await,
            ImageProvider::StableDiffusion => self.generate_with_stable_diffusion(request).await,
            ImageProvider::Midjourney => self.generate_with_midjourney(request).await,
            ImageProvider::GoogleImagen => self.generate_with_google_imagen(request, false).await,
            ImageProvider::GoogleImagenLite => self.generate_with_google_imagen(request, true).await,
        }
    }

    /// Generate image with DALL-E (OpenAI)
    async fn generate_with_dalle(
        &self,
        request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        let url = "https://api.openai.com/v1/images/generations";

        #[derive(Serialize)]
        struct DALLERequest {
            prompt: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            model: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            size: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            quality: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            n: Option<u32>,
        }

        let dalle_request = DALLERequest {
            prompt: request.prompt.clone(),
            model: Some(request.model.clone().unwrap_or_else(|| "dall-e-3".to_string())),
            size: request.size.map(|s| match s {
                ImageSize::Small => "256x256".to_string(),
                ImageSize::Medium => "512x512".to_string(),
                ImageSize::Large | _ => "1024x1024".to_string(),
            }),
            quality: request.quality.map(|q| match q {
                ImageQuality::Standard => "standard".to_string(),
                ImageQuality::HD => "hd".to_string(),
            }),
            n: request.n,
        };

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&dalle_request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        self.parse_dalle_response(response).await
    }

    async fn parse_dalle_response(
        &self,
        response: reqwest::Response,
    ) -> Result<ImageGenerationResponse> {
        if response.status().is_success() {
            #[derive(Deserialize)]
            struct DALLEResponse {
                created: u64,
                data: Vec<DALLEImage>,
            }

            #[derive(Deserialize)]
            struct DALLEImage {
                #[serde(skip_serializing_if = "Option::is_none")]
                url: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                b64_json: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                revised_prompt: Option<String>,
            }

            let dalle_response: DALLEResponse =
                response.json().await.map_err(APIError::HttpError)?;

            let mut revised_prompt = None;
            let images = dalle_response
                .data
                .into_iter()
                .map(|img| {
                    if revised_prompt.is_none() && img.revised_prompt.is_some() {
                        revised_prompt = img.revised_prompt.clone();
                    }
                    GeneratedImage {
                        url: img.url,
                        b64_json: img.b64_json,
                    }
                })
                .collect();

            Ok(ImageGenerationResponse {
                images,
                created_at: dalle_response.created,
                revised_prompt,
            })
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("DALL-E".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "DALL-E API error: {}",
                error_text
            )))
        }
    }

    /// Generate image with Stable Diffusion
    async fn generate_with_stable_diffusion(
        &self,
        request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        let model = request
            .model
            .as_deref()
            .unwrap_or("stable-diffusion-xl-1024-v1-0");
        let url = format!("https://api.stability.ai/v1/generation/{}/text-to-image", model);

        #[derive(Serialize)]
        struct StableDiffusionRequest {
            text_prompts: Vec<TextPrompt>,
            #[serde(skip_serializing_if = "Option::is_none")]
            height: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            width: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            samples: Option<u32>,
        }

        #[derive(Serialize)]
        struct TextPrompt {
            text: String,
            weight: f32,
        }

        let mut text_prompts = vec![TextPrompt {
            text: request.prompt.clone(),
            weight: 1.0,
        }];

        if let Some(negative) = &request.negative_prompt {
            text_prompts.push(TextPrompt {
                text: negative.clone(),
                weight: -1.0,
            });
        }

        let (width, height) = match request.size.unwrap_or(ImageSize::Large) {
            ImageSize::Small => (256, 256),
            ImageSize::Medium => (512, 512),
            ImageSize::Large => (1024, 1024),
            ImageSize::Wide => (1792, 1024),
            ImageSize::Portrait => (1024, 1792),
        };

        let sd_request = StableDiffusionRequest {
            text_prompts,
            height: Some(height),
            width: Some(width),
            samples: request.n,
        };

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&sd_request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        self.parse_stable_diffusion_response(response).await
    }

    async fn parse_stable_diffusion_response(
        &self,
        response: reqwest::Response,
    ) -> Result<ImageGenerationResponse> {
        if response.status().is_success() {
            #[derive(Deserialize)]
            struct SDResponse {
                artifacts: Vec<SDArtifact>,
            }

            #[derive(Deserialize)]
            struct SDArtifact {
                base64: String,
            }

            let sd_response: SDResponse = response.json().await.map_err(APIError::HttpError)?;

            let images = sd_response
                .artifacts
                .into_iter()
                .map(|artifact| GeneratedImage {
                    url: None,
                    b64_json: Some(artifact.base64),
                })
                .collect();

            Ok(ImageGenerationResponse {
                images,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                revised_prompt: None,
            })
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Stable Diffusion".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Stable Diffusion API error: {}",
                error_text
            )))
        }
    }

    /// Generate image with Midjourney (placeholder implementation)
    async fn generate_with_midjourney(
        &self,
        _request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        // Midjourney doesn't have a direct public API yet
        // This would typically go through a Discord bot or third-party service
        Err(APIError::APIError(
            "Midjourney API integration not yet available. Use DALL-E or Stable Diffusion instead."
                .to_string(),
        ))
    }

    /// Generate image with Google Imagen (pro or lite)
    async fn generate_with_google_imagen(
        &self,
        request: &ImageGenerationRequest,
        use_lite: bool,
    ) -> Result<ImageGenerationResponse> {
        // Default to Imagen 3.1 Pro / "banana" lite model
        let default_model = if use_lite {
            "imagen-3.1-nano" // fast/cheap "banana" tier
        } else {
            "imagen-3.1-pro" // quality tier
        };

        let model = request
            .model
            .as_deref()
            .unwrap_or(default_model)
            .to_string();

        // API follows Google AI Studio pattern: POST .../models/{model}:generateImage?key=API_KEY
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateImage?key={}",
            model, self.api_key
        );

        let aspect_ratio = match request.size.unwrap_or(ImageSize::Large) {
            ImageSize::Small => "1:1",
            ImageSize::Medium => "1:1",
            ImageSize::Large => "1:1",
            ImageSize::Wide => "16:9",
            ImageSize::Portrait => "9:16",
        };

        let quality = request.quality.map(|q| match q {
            ImageQuality::Standard => "standard",
            ImageQuality::HD => "premium",
        });

        let payload = serde_json::json!({
            "prompt": {
                "text": request.prompt,
            },
            "negativePrompt": request.negative_prompt,
            "aspectRatio": aspect_ratio,
            "style": request.style,
            "quality": quality,
            "numberOfImages": request.n.unwrap_or(1),
        });

        let response = self
            .client
            .post(url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            let value: serde_json::Value = response.json().await.map_err(APIError::HttpError)?;

            // Extract base64 images from flexible Google response shape
            let mut images: Vec<GeneratedImage> = Vec::new();
            collect_images_from_value(&value, &mut images);

            if images.is_empty() {
                return Err(APIError::InvalidResponse(
                    "No images returned from Imagen".to_string(),
                ));
            }

            Ok(ImageGenerationResponse {
                images,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                revised_prompt: None,
            })
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Google Imagen".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Google Imagen API error: {}",
                error_text
            )))
        }
    }

    /// Download an image from a URL
    pub async fn download_image(&self, url: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get(url)
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
            Err(APIError::APIError("Failed to download image".to_string()))
        }
    }
}

fn collect_images_from_value(value: &Value, images: &mut Vec<GeneratedImage>) {
    match value {
        Value::Object(map) => {
            // Inline data block
            if let Some(inline_data) = map.get("inlineData") {
                if let Some(data) = inline_data
                    .get("data")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                {
                    images.push(GeneratedImage {
                        url: None,
                        b64_json: Some(data),
                    });
                }
            }

            // Google Imagen returns "candidates": [{ "image": { "bytesBase64Encoded": "..." } }]
            if let Some(image_obj) = map.get("image") {
                if let Some(b64) = image_obj
                    .get("bytesBase64Encoded")
                    .or_else(|| image_obj.get("base64"))
                    .and_then(|v| v.as_str())
                {
                    images.push(GeneratedImage {
                        url: None,
                        b64_json: Some(b64.to_string()),
                    });
                }
                if let Some(url) = image_obj
                    .get("url")
                    .or_else(|| image_obj.get("uri"))
                    .and_then(|v| v.as_str())
                {
                    images.push(GeneratedImage {
                        url: Some(url.to_string()),
                        b64_json: None,
                    });
                }
            }

            for (key, val) in map {
                if ["base64", "b64_json", "bytesBase64Encoded", "image_base64"]
                    .contains(&key.as_str())
                {
                    if let Some(b64) = val.as_str() {
                        images.push(GeneratedImage {
                            url: None,
                            b64_json: Some(b64.to_string()),
                        });
                    }
                }
                if ["url", "uri", "imageUrl", "image_uri"].contains(&key.as_str()) {
                    if let Some(url) = val.as_str() {
                        images.push(GeneratedImage {
                            url: Some(url.to_string()),
                            b64_json: None,
                        });
                    }
                }
                collect_images_from_value(val, images);
            }
        }
        Value::Array(arr) => {
            for val in arr {
                collect_images_from_value(val, images);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_request_serialization() {
        let request = ImageGenerationRequest {
            prompt: "A beautiful landscape".to_string(),
            negative_prompt: Some("blurry, low quality".to_string()),
            model: Some("imagen-3.1-pro".to_string()),
            size: Some(ImageSize::Large),
            style: Some("photorealistic".to_string()),
            quality: Some(ImageQuality::HD),
            n: Some(2),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("landscape"));
        assert!(json.contains("1024x1024"));
    }

    #[test]
    fn test_image_size_serialization() {
        let size = ImageSize::Large;
        let json = serde_json::to_string(&size).unwrap();
        assert!(json.contains("1024x1024"));
    }
}
