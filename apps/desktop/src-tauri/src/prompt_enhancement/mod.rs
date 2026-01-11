pub mod api_router;
pub mod prompt_enhancer;
pub mod use_case_detector;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Use case categories for intelligent API routing
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum UseCase {
    Automation,
    Coding,
    DocumentCreation,
    Search,
    ImageGen,
    VideoGen,
    GeneralQA,
}

impl UseCase {
    pub fn as_str(&self) -> &'static str {
        match self {
            UseCase::Automation => "Automation",
            UseCase::Coding => "Coding",
            UseCase::DocumentCreation => "DocumentCreation",
            UseCase::Search => "Search",
            UseCase::ImageGen => "ImageGen",
            UseCase::VideoGen => "VideoGen",
            UseCase::GeneralQA => "GeneralQA",
        }
    }
}

/// Supported API providers for routing
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum APIProvider {
    Claude,
    GPT,
    Gemini,
    Perplexity,
    Ollama,
    Veo3,
    DALLE,
    StableDiffusion,
    Midjourney,
}

impl APIProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            APIProvider::Claude => "Claude",
            APIProvider::GPT => "GPT",
            APIProvider::Gemini => "Gemini",
            APIProvider::Perplexity => "Perplexity",
            APIProvider::Ollama => "Ollama",
            APIProvider::Veo3 => "Veo3",
            APIProvider::DALLE => "DALLE",
            APIProvider::StableDiffusion => "StableDiffusion",
            APIProvider::Midjourney => "Midjourney",
        }
    }
}

/// Enhanced prompt with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedPrompt {
    pub original: String,
    pub enhanced: String,
    pub use_case: UseCase,
    pub confidence: f64,
    pub suggested_provider: APIProvider,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<PromptContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<EnhancementMetadata>,
}

/// Additional context extracted from prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complexity: Option<Complexity>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Complexity {
    Simple,
    Moderate,
    Complex,
}

/// Enhancement metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancementMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_added: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enhancement_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternative_providers: Option<Vec<APIProvider>>,
}

/// API routing decision with rationale
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIRoute {
    pub provider: APIProvider,
    pub rationale: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_latency: Option<u32>,
    pub fallbacks: Vec<APIProvider>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<HashMap<String, serde_json::Value>>,
}

/// Complete result of prompt enhancement and routing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptEnhancementResult {
    pub prompt: EnhancedPrompt,
    pub route: APIRoute,
    pub timestamp: String,
    pub processing_time: u64,
}

/// Use case detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UseCaseDetection {
    pub use_case: UseCase,
    pub confidence: f64,
    pub keywords: Vec<String>,
    pub ambiguous: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alternatives: Option<Vec<AlternativeUseCase>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlternativeUseCase {
    pub use_case: UseCase,
    pub confidence: f64,
}

/// API provider capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    pub provider: APIProvider,
    pub supported_use_cases: Vec<UseCase>,
    pub max_tokens: u32,
    pub supports_streaming: bool,
    pub supports_function_calling: bool,
    pub supports_vision: bool,
    pub cost_per_k_input: f64,
    pub cost_per_k_output: f64,
    pub avg_latency: u32,
    pub quality_score: f64,
}

/// Prompt enhancement configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptEnhancementConfig {
    pub enabled: bool,
    pub confidence_threshold: f64,
    pub prefer_local: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost_per_request: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_latency: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_preferences: Option<HashMap<UseCase, Vec<APIProvider>>>,
}

impl Default for PromptEnhancementConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            confidence_threshold: 0.6,
            prefer_local: false,
            max_cost_per_request: None,
            max_latency: None,
            provider_preferences: None,
        }
    }
}
