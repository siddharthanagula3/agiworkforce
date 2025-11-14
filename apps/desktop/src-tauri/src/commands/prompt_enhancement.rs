use crate::prompt_enhancement::{
    api_router::APIRouter, prompt_enhancer::PromptEnhancer, use_case_detector::UseCaseDetector,
    APIProvider, APIRoute, EnhancedPrompt, PromptContext, PromptEnhancementConfig,
    PromptEnhancementResult, UseCase, UseCaseDetection,
};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Shared state for prompt enhancement
#[derive(Clone)]
pub struct PromptEnhancementState {
    detector: Arc<UseCaseDetector>,
    enhancer: Arc<PromptEnhancer>,
    router: Arc<APIRouter>,
    config: Arc<Mutex<PromptEnhancementConfig>>,
}

impl PromptEnhancementState {
    pub fn new() -> Self {
        Self {
            detector: Arc::new(UseCaseDetector::new()),
            enhancer: Arc::new(PromptEnhancer::new()),
            router: Arc::new(APIRouter::new()),
            config: Arc::new(Mutex::new(PromptEnhancementConfig::default())),
        }
    }
}

impl Default for PromptEnhancementState {
    fn default() -> Self {
        Self::new()
    }
}

/// Detect the use case from a text prompt
#[tauri::command]
pub async fn detect_use_case(
    text: String,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<UseCaseDetection, String> {
    let detector = &state.detector;
    let detection = detector.detect(&text);
    Ok(detection)
}

/// Enhance a prompt based on detected use case
#[tauri::command]
pub async fn enhance_prompt(
    text: String,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<EnhancedPrompt, String> {
    let detector = &state.detector;
    let enhancer = &state.enhancer;

    // Detect use case
    let detection = detector.detect(&text);

    // Enhance prompt
    let enhanced = enhancer.enhance(&text, &detection);

    Ok(enhanced)
}

/// Route to the best API based on use case
#[tauri::command]
pub async fn route_to_best_api(
    use_case: String,
    prompt: String,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<APIRoute, String> {
    let router = &state.router;
    let config = state.config.lock().await;

    // Parse use case
    let use_case_enum = match use_case.as_str() {
        "Automation" => UseCase::Automation,
        "Coding" => UseCase::Coding,
        "DocumentCreation" => UseCase::DocumentCreation,
        "Search" => UseCase::Search,
        "ImageGen" => UseCase::ImageGen,
        "VideoGen" => UseCase::VideoGen,
        "GeneralQA" => UseCase::GeneralQA,
        _ => {
            return Err(format!("Invalid use case: {}", use_case));
        }
    };

    // Create a basic context (could be enhanced with more analysis)
    let context = PromptContext {
        language: None,
        framework: None,
        domain: None,
        complexity: None,
    };

    // Create route
    let route = router.create_route(use_case_enum, &context, config.prefer_local);

    Ok(route)
}

/// Complete prompt enhancement workflow (detect, enhance, route)
#[tauri::command]
pub async fn enhance_and_route_prompt(
    text: String,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<PromptEnhancementResult, String> {
    let start = std::time::Instant::now();

    let detector = &state.detector;
    let enhancer = &state.enhancer;
    let router = &state.router;
    let config = state.config.lock().await;

    // Detect use case
    let detection = detector.detect(&text);

    // Enhance prompt
    let enhanced = enhancer.enhance(&text, &detection);

    // Create route
    let context = enhanced.context.clone().unwrap_or(PromptContext {
        language: None,
        framework: None,
        domain: None,
        complexity: None,
    });
    let route = router.create_route(enhanced.use_case, &context, config.prefer_local);

    let processing_time = start.elapsed().as_millis() as u64;

    Ok(PromptEnhancementResult {
        prompt: enhanced,
        route,
        timestamp: chrono::Utc::now().to_rfc3339(),
        processing_time,
    })
}

/// Get current configuration
#[tauri::command]
pub async fn get_prompt_enhancement_config(
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<PromptEnhancementConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

/// Update configuration
#[tauri::command]
pub async fn set_prompt_enhancement_config(
    config: PromptEnhancementConfig,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<(), String> {
    let mut current_config = state.config.lock().await;
    *current_config = config;
    Ok(())
}

/// Get suggested provider for a use case
#[tauri::command]
pub async fn get_suggested_provider(
    use_case: String,
    state: tauri::State<'_, PromptEnhancementState>,
) -> Result<String, String> {
    let router = &state.router;

    let use_case_enum = match use_case.as_str() {
        "Automation" => UseCase::Automation,
        "Coding" => UseCase::Coding,
        "DocumentCreation" => UseCase::DocumentCreation,
        "Search" => UseCase::Search,
        "ImageGen" => UseCase::ImageGen,
        "VideoGen" => UseCase::VideoGen,
        "GeneralQA" => UseCase::GeneralQA,
        _ => {
            return Err(format!("Invalid use case: {}", use_case));
        }
    };

    let context = PromptContext {
        language: None,
        framework: None,
        domain: None,
        complexity: None,
    };

    let provider = router.suggest_provider(use_case_enum, &context);
    Ok(provider.as_str().to_string())
}

/// Get all available use cases
#[tauri::command]
pub async fn get_available_use_cases() -> Result<Vec<String>, String> {
    Ok(vec![
        "Automation".to_string(),
        "Coding".to_string(),
        "DocumentCreation".to_string(),
        "Search".to_string(),
        "ImageGen".to_string(),
        "VideoGen".to_string(),
        "GeneralQA".to_string(),
    ])
}

/// Get all available providers
#[tauri::command]
pub async fn get_available_providers() -> Result<Vec<String>, String> {
    Ok(vec![
        "Claude".to_string(),
        "GPT".to_string(),
        "Gemini".to_string(),
        "Perplexity".to_string(),
        "Ollama".to_string(),
        "Veo3".to_string(),
        "DALLE".to_string(),
        "StableDiffusion".to_string(),
        "Midjourney".to_string(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_detect_use_case_command() {
        let state = PromptEnhancementState::new();
        let result = detect_use_case(
            "Write a TypeScript function to sort an array".to_string(),
            tauri::State::new(&state),
        )
        .await;

        assert!(result.is_ok());
        let detection = result.unwrap();
        assert_eq!(detection.use_case, UseCase::Coding);
    }

    #[tokio::test]
    async fn test_enhance_prompt_command() {
        let state = PromptEnhancementState::new();
        let result = enhance_prompt(
            "Write a function to sort an array".to_string(),
            tauri::State::new(&state),
        )
        .await;

        assert!(result.is_ok());
        let enhanced = result.unwrap();
        assert!(enhanced.enhanced.len() > enhanced.original.len());
    }

    #[tokio::test]
    async fn test_get_available_use_cases() {
        let result = get_available_use_cases().await;
        assert!(result.is_ok());
        let cases = result.unwrap();
        assert!(cases.contains(&"Coding".to_string()));
        assert!(cases.contains(&"Search".to_string()));
    }
}
