//! Vision Model Integration for Screenshot Analysis
//!
//! This module provides AI-powered visual understanding of screenshots,
//! enabling intelligent computer use by analyzing screen content and
//! identifying interactive elements.

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod analyzer;
pub mod element_detector;

/// Detected UI element with bounding box and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedElement {
    /// Unique identifier for this element
    pub id: String,
    /// Type of element (button, input, link, text, image, etc.)
    pub element_type: ElementType,
    /// Human-readable label/text content
    pub label: String,
    /// Bounding box coordinates (x, y, width, height)
    pub bounds: BoundingBox,
    /// Center point for clicking
    pub center: Point,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f32,
    /// Whether the element appears clickable
    pub is_clickable: bool,
    /// Whether the element appears to be an input field
    pub is_input: bool,
    /// Additional attributes detected
    pub attributes: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ElementType {
    Button,
    Link,
    TextInput,
    TextArea,
    Checkbox,
    RadioButton,
    Dropdown,
    Menu,
    MenuItem,
    Tab,
    Icon,
    Image,
    Text,
    Heading,
    Paragraph,
    List,
    ListItem,
    Table,
    TableCell,
    Dialog,
    Modal,
    Toolbar,
    Sidebar,
    Navigation,
    Form,
    Card,
    Unknown,
}

impl std::fmt::Display for ElementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ElementType::Button => write!(f, "button"),
            ElementType::Link => write!(f, "link"),
            ElementType::TextInput => write!(f, "text_input"),
            ElementType::TextArea => write!(f, "text_area"),
            ElementType::Checkbox => write!(f, "checkbox"),
            ElementType::RadioButton => write!(f, "radio_button"),
            ElementType::Dropdown => write!(f, "dropdown"),
            ElementType::Menu => write!(f, "menu"),
            ElementType::MenuItem => write!(f, "menu_item"),
            ElementType::Tab => write!(f, "tab"),
            ElementType::Icon => write!(f, "icon"),
            ElementType::Image => write!(f, "image"),
            ElementType::Text => write!(f, "text"),
            ElementType::Heading => write!(f, "heading"),
            ElementType::Paragraph => write!(f, "paragraph"),
            ElementType::List => write!(f, "list"),
            ElementType::ListItem => write!(f, "list_item"),
            ElementType::Table => write!(f, "table"),
            ElementType::TableCell => write!(f, "table_cell"),
            ElementType::Dialog => write!(f, "dialog"),
            ElementType::Modal => write!(f, "modal"),
            ElementType::Toolbar => write!(f, "toolbar"),
            ElementType::Sidebar => write!(f, "sidebar"),
            ElementType::Navigation => write!(f, "navigation"),
            ElementType::Form => write!(f, "form"),
            ElementType::Card => write!(f, "card"),
            ElementType::Unknown => write!(f, "unknown"),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl BoundingBox {
    pub fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self { x, y, width, height }
    }

    pub fn center(&self) -> Point {
        Point {
            x: self.x + self.width / 2,
            y: self.y + self.height / 2,
        }
    }

    pub fn contains(&self, point: &Point) -> bool {
        point.x >= self.x
            && point.x <= self.x + self.width
            && point.y >= self.y
            && point.y <= self.y + self.height
    }

    pub fn area(&self) -> i32 {
        self.width * self.height
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

/// Result of analyzing a screenshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenAnalysis {
    /// Overall description of what's on screen
    pub description: String,
    /// Detected UI elements
    pub elements: Vec<DetectedElement>,
    /// Current application/window detected
    pub application: Option<String>,
    /// Current page/screen title if detected
    pub title: Option<String>,
    /// Detected text content (OCR)
    pub text_content: Vec<TextBlock>,
    /// Suggested actions based on context
    pub suggested_actions: Vec<SuggestedAction>,
    /// Screen dimensions
    pub screen_size: (u32, u32),
    /// Analysis confidence score
    pub confidence: f32,
    /// Provider used for analysis
    pub provider: String,
    /// Analysis duration in milliseconds
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBlock {
    pub text: String,
    pub bounds: BoundingBox,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedAction {
    pub action_type: String,
    pub description: String,
    pub target_element_id: Option<String>,
    pub coordinates: Option<Point>,
    pub confidence: f32,
}

/// Vision analysis request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisRequest {
    /// Base64 encoded image data
    pub image_data: String,
    /// Image width
    pub width: u32,
    /// Image height
    pub height: u32,
    /// Optional context about what we're looking for
    pub context: Option<String>,
    /// Whether to perform detailed element detection
    pub detect_elements: bool,
    /// Whether to perform OCR
    pub extract_text: bool,
    /// Specific region to analyze (None = full screen)
    pub region: Option<BoundingBox>,
}

/// Vision provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionConfig {
    /// Preferred provider (anthropic, openai, google)
    pub provider: String,
    /// Model to use for vision tasks
    pub model: String,
    /// API key (if not using environment variable)
    pub api_key: Option<String>,
    /// Maximum tokens for response
    pub max_tokens: u32,
    /// Detail level for image analysis (low, high, auto)
    pub detail: String,
}

impl Default for VisionConfig {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: "claude-sonnet-4-5".to_string(),
            api_key: None,
            max_tokens: 4096,
            detail: "high".to_string(),
        }
    }
}

/// Main vision service for screenshot analysis
pub struct VisionService {
    config: Arc<RwLock<VisionConfig>>,
    http_client: reqwest::Client,
}

impl VisionService {
    pub fn new(config: VisionConfig) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config: Arc::new(RwLock::new(config)),
            http_client,
        }
    }

    pub async fn analyze_screenshot(&self, request: AnalysisRequest) -> Result<ScreenAnalysis> {
        let start = std::time::Instant::now();
        let config = self.config.read().await;

        let analysis = match config.provider.as_str() {
            "anthropic" => self.analyze_with_anthropic(&request, &config).await?,
            "openai" => self.analyze_with_openai(&request, &config).await?,
            "google" => self.analyze_with_google(&request, &config).await?,
            _ => return Err(anyhow!("Unknown vision provider: {}", config.provider)),
        };

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(ScreenAnalysis {
            duration_ms,
            provider: config.provider.clone(),
            ..analysis
        })
    }

    async fn analyze_with_anthropic(
        &self,
        request: &AnalysisRequest,
        config: &VisionConfig,
    ) -> Result<ScreenAnalysis> {
        let api_key = config
            .api_key
            .clone()
            .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
            .ok_or_else(|| anyhow!("Anthropic API key not found"))?;

        let prompt = self.build_analysis_prompt(request);

        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": config.max_tokens,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": request.image_data
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }]
        });

        let response = self
            .http_client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2024-10-22")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Anthropic API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Anthropic API error {}: {}", status, error_body));
        }

        let response_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Anthropic response: {}", e))?;

        self.parse_vision_response(&response_json, request)
    }

    async fn analyze_with_openai(
        &self,
        request: &AnalysisRequest,
        config: &VisionConfig,
    ) -> Result<ScreenAnalysis> {
        let api_key = config
            .api_key
            .clone()
            .or_else(|| std::env::var("OPENAI_API_KEY").ok())
            .ok_or_else(|| anyhow!("OpenAI API key not found"))?;

        let prompt = self.build_analysis_prompt(request);

        let body = serde_json::json!({
            "model": config.model,
            "max_tokens": config.max_tokens,
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/png;base64,{}", request.image_data),
                            "detail": config.detail
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }]
        });

        let response = self
            .http_client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("OpenAI API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenAI API error {}: {}", status, error_body));
        }

        let response_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse OpenAI response: {}", e))?;

        self.parse_vision_response(&response_json, request)
    }

    async fn analyze_with_google(
        &self,
        request: &AnalysisRequest,
        config: &VisionConfig,
    ) -> Result<ScreenAnalysis> {
        let api_key = config
            .api_key
            .clone()
            .or_else(|| std::env::var("GOOGLE_API_KEY").ok())
            .ok_or_else(|| anyhow!("Google API key not found"))?;

        let prompt = self.build_analysis_prompt(request);

        let body = serde_json::json!({
            "contents": [{
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": request.image_data
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }],
            "generationConfig": {
                "maxOutputTokens": config.max_tokens
            }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1/models/{}:generateContent?key={}",
            config.model, api_key
        );

        let response = self
            .http_client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Google API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Google API error {}: {}", status, error_body));
        }

        let response_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Google response: {}", e))?;

        self.parse_vision_response(&response_json, request)
    }

    fn build_analysis_prompt(&self, request: &AnalysisRequest) -> String {
        let mut prompt = String::from(
            r#"Analyze this screenshot and provide a structured analysis in JSON format.

Your response must be valid JSON with this exact structure:
{
  "description": "Brief description of what's shown on screen",
  "application": "Name of the application/website if identifiable",
  "title": "Window/page title if visible",
  "elements": [
    {
      "id": "element_1",
      "type": "button|link|text_input|checkbox|dropdown|menu|icon|text|heading|image|unknown",
      "label": "Text or description of the element",
      "bounds": {"x": 0, "y": 0, "width": 100, "height": 30},
      "is_clickable": true,
      "is_input": false,
      "confidence": 0.95
    }
  ],
  "text_content": [
    {
      "text": "Visible text content",
      "bounds": {"x": 0, "y": 0, "width": 200, "height": 20},
      "confidence": 0.9
    }
  ],
  "suggested_actions": [
    {
      "action_type": "click|type|scroll|select",
      "description": "What this action would do",
      "target_element_id": "element_1",
      "coordinates": {"x": 50, "y": 15},
      "confidence": 0.8
    }
  ],
  "confidence": 0.9
}

Important guidelines:
1. Provide accurate bounding box coordinates (x, y, width, height in pixels)
2. Identify ALL interactive elements (buttons, links, inputs, dropdowns)
3. Extract all visible text content
4. Suggest relevant actions based on the context
5. Use descriptive labels for elements
6. Set is_clickable=true for buttons, links, and interactive elements
7. Set is_input=true for text fields, textareas, and form inputs"#,
        );

        if let Some(ref context) = request.context {
            prompt.push_str(&format!(
                "\n\nContext for this analysis: {}\nFocus on elements relevant to this context.",
                context
            ));
        }

        if request.detect_elements {
            prompt.push_str("\n\nProvide detailed element detection with precise coordinates.");
        }

        if request.extract_text {
            prompt.push_str("\n\nExtract all visible text with their positions.");
        }

        prompt.push_str("\n\nRespond ONLY with valid JSON, no additional text.");

        prompt
    }

    fn parse_vision_response(
        &self,
        response: &serde_json::Value,
        request: &AnalysisRequest,
    ) -> Result<ScreenAnalysis> {
        // Extract the content from different provider response formats
        let content = if let Some(content) = response["content"][0]["text"].as_str() {
            // Anthropic format
            content.to_string()
        } else if let Some(content) = response["choices"][0]["message"]["content"].as_str() {
            // OpenAI format
            content.to_string()
        } else if let Some(content) = response["candidates"][0]["content"]["parts"][0]["text"].as_str() {
            // Google format
            content.to_string()
        } else {
            return Err(anyhow!("Could not extract content from vision response"));
        };

        // Parse the JSON from the response
        let parsed: serde_json::Value = serde_json::from_str(&content)
            .or_else(|_| {
                // Try to extract JSON from markdown code block
                let json_start = content.find('{').unwrap_or(0);
                let json_end = content.rfind('}').map(|i| i + 1).unwrap_or(content.len());
                serde_json::from_str(&content[json_start..json_end])
            })
            .map_err(|e| anyhow!("Failed to parse vision analysis JSON: {}", e))?;

        // Build the ScreenAnalysis from parsed JSON
        let elements: Vec<DetectedElement> = parsed["elements"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| {
                        Some(DetectedElement {
                            id: e["id"].as_str()?.to_string(),
                            element_type: parse_element_type(e["type"].as_str()?),
                            label: e["label"].as_str().unwrap_or("").to_string(),
                            bounds: BoundingBox {
                                x: e["bounds"]["x"].as_i64()? as i32,
                                y: e["bounds"]["y"].as_i64()? as i32,
                                width: e["bounds"]["width"].as_i64()? as i32,
                                height: e["bounds"]["height"].as_i64()? as i32,
                            },
                            center: Point {
                                x: (e["bounds"]["x"].as_i64()? + e["bounds"]["width"].as_i64()? / 2) as i32,
                                y: (e["bounds"]["y"].as_i64()? + e["bounds"]["height"].as_i64()? / 2) as i32,
                            },
                            confidence: e["confidence"].as_f64().unwrap_or(0.8) as f32,
                            is_clickable: e["is_clickable"].as_bool().unwrap_or(false),
                            is_input: e["is_input"].as_bool().unwrap_or(false),
                            attributes: std::collections::HashMap::new(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let text_content: Vec<TextBlock> = parsed["text_content"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| {
                        Some(TextBlock {
                            text: t["text"].as_str()?.to_string(),
                            bounds: BoundingBox {
                                x: t["bounds"]["x"].as_i64()? as i32,
                                y: t["bounds"]["y"].as_i64()? as i32,
                                width: t["bounds"]["width"].as_i64()? as i32,
                                height: t["bounds"]["height"].as_i64()? as i32,
                            },
                            confidence: t["confidence"].as_f64().unwrap_or(0.8) as f32,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let suggested_actions: Vec<SuggestedAction> = parsed["suggested_actions"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| {
                        Some(SuggestedAction {
                            action_type: a["action_type"].as_str()?.to_string(),
                            description: a["description"].as_str().unwrap_or("").to_string(),
                            target_element_id: a["target_element_id"].as_str().map(|s| s.to_string()),
                            coordinates: a["coordinates"]["x"].as_i64().and_then(|x| {
                                a["coordinates"]["y"].as_i64().map(|y| Point {
                                    x: x as i32,
                                    y: y as i32,
                                })
                            }),
                            confidence: a["confidence"].as_f64().unwrap_or(0.7) as f32,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(ScreenAnalysis {
            description: parsed["description"]
                .as_str()
                .unwrap_or("Screenshot analysis")
                .to_string(),
            elements,
            application: parsed["application"].as_str().map(|s| s.to_string()),
            title: parsed["title"].as_str().map(|s| s.to_string()),
            text_content,
            suggested_actions,
            screen_size: (request.width, request.height),
            confidence: parsed["confidence"].as_f64().unwrap_or(0.8) as f32,
            provider: String::new(), // Will be set by caller
            duration_ms: 0,          // Will be set by caller
        })
    }

    pub async fn find_element_by_description(
        &self,
        image_data: &str,
        width: u32,
        height: u32,
        description: &str,
    ) -> Result<Option<DetectedElement>> {
        let request = AnalysisRequest {
            image_data: image_data.to_string(),
            width,
            height,
            context: Some(format!("Find the element matching: {}", description)),
            detect_elements: true,
            extract_text: false,
            region: None,
        };

        let analysis = self.analyze_screenshot(request).await?;

        // Find the best matching element
        let description_lower = description.to_lowercase();
        Ok(analysis
            .elements
            .into_iter()
            .find(|e| {
                e.label.to_lowercase().contains(&description_lower)
                    || description_lower.contains(&e.label.to_lowercase())
            }))
    }

    pub async fn update_config(&self, new_config: VisionConfig) {
        let mut config = self.config.write().await;
        *config = new_config;
    }
}

fn parse_element_type(s: &str) -> ElementType {
    match s.to_lowercase().as_str() {
        "button" => ElementType::Button,
        "link" => ElementType::Link,
        "text_input" | "textinput" | "input" => ElementType::TextInput,
        "text_area" | "textarea" => ElementType::TextArea,
        "checkbox" => ElementType::Checkbox,
        "radio_button" | "radio" => ElementType::RadioButton,
        "dropdown" | "select" => ElementType::Dropdown,
        "menu" => ElementType::Menu,
        "menu_item" | "menuitem" => ElementType::MenuItem,
        "tab" => ElementType::Tab,
        "icon" => ElementType::Icon,
        "image" | "img" => ElementType::Image,
        "text" => ElementType::Text,
        "heading" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => ElementType::Heading,
        "paragraph" | "p" => ElementType::Paragraph,
        "list" | "ul" | "ol" => ElementType::List,
        "list_item" | "li" => ElementType::ListItem,
        "table" => ElementType::Table,
        "table_cell" | "td" | "th" => ElementType::TableCell,
        "dialog" => ElementType::Dialog,
        "modal" => ElementType::Modal,
        "toolbar" => ElementType::Toolbar,
        "sidebar" => ElementType::Sidebar,
        "navigation" | "nav" => ElementType::Navigation,
        "form" => ElementType::Form,
        "card" => ElementType::Card,
        _ => ElementType::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounding_box_center() {
        let bbox = BoundingBox::new(100, 200, 50, 30);
        let center = bbox.center();
        assert_eq!(center.x, 125);
        assert_eq!(center.y, 215);
    }

    #[test]
    fn test_bounding_box_contains() {
        let bbox = BoundingBox::new(100, 100, 100, 100);
        assert!(bbox.contains(&Point::new(150, 150)));
        assert!(!bbox.contains(&Point::new(50, 50)));
    }

    #[test]
    fn test_parse_element_type() {
        assert_eq!(parse_element_type("button"), ElementType::Button);
        assert_eq!(parse_element_type("LINK"), ElementType::Link);
        assert_eq!(parse_element_type("text_input"), ElementType::TextInput);
        assert_eq!(parse_element_type("unknown_type"), ElementType::Unknown);
    }
}
