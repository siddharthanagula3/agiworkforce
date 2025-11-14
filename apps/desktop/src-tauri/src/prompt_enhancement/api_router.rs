use super::{APIProvider, APIRoute, PromptContext, UseCase};
use std::collections::HashMap;

/// Routes prompts to the best API provider based on use case
pub struct APIRouter {
    // Default routing rules (can be customized)
    routing_rules: HashMap<UseCase, Vec<APIProvider>>,
}

impl APIRouter {
    pub fn new() -> Self {
        let mut routing_rules = HashMap::new();

        // Automation: Claude excels at understanding complex workflows
        routing_rules.insert(
            UseCase::Automation,
            vec![APIProvider::Claude, APIProvider::GPT, APIProvider::Gemini],
        );

        // Coding: Claude Sonnet 4.5 is best for code, with GPT as fallback
        routing_rules.insert(
            UseCase::Coding,
            vec![APIProvider::Claude, APIProvider::GPT, APIProvider::Ollama],
        );

        // Document Creation: GPT excels at creative writing
        routing_rules.insert(
            UseCase::DocumentCreation,
            vec![APIProvider::GPT, APIProvider::Claude, APIProvider::Gemini],
        );

        // Search: Perplexity is specifically designed for search
        routing_rules.insert(
            UseCase::Search,
            vec![
                APIProvider::Perplexity,
                APIProvider::GPT,
                APIProvider::Gemini,
            ],
        );

        // Image Generation: DALL-E and Stable Diffusion are primary options
        routing_rules.insert(
            UseCase::ImageGen,
            vec![
                APIProvider::DALLE,
                APIProvider::StableDiffusion,
                APIProvider::Midjourney,
            ],
        );

        // Video Generation: Veo3 is Google's video generation model
        routing_rules.insert(UseCase::VideoGen, vec![APIProvider::Veo3]);

        // General Q&A: GPT is versatile and fast
        routing_rules.insert(
            UseCase::GeneralQA,
            vec![
                APIProvider::GPT,
                APIProvider::Claude,
                APIProvider::Ollama,
                APIProvider::Gemini,
            ],
        );

        Self { routing_rules }
    }

    /// Suggests the best provider for a given use case
    pub fn suggest_provider(&self, use_case: UseCase, context: &PromptContext) -> APIProvider {
        let providers = self
            .routing_rules
            .get(&use_case)
            .expect("Use case should have routing rules");

        // For coding, prefer Claude for complex tasks
        if use_case == UseCase::Coding {
            if let Some(complexity) = context.complexity {
                if complexity == super::Complexity::Complex {
                    return APIProvider::Claude;
                }
            }
        }

        // Return the first (primary) provider
        providers[0]
    }

    /// Gets fallback providers for a use case
    pub fn get_fallback_providers(&self, use_case: UseCase) -> Vec<APIProvider> {
        self.routing_rules
            .get(&use_case)
            .map(|providers| providers.iter().skip(1).copied().collect())
            .unwrap_or_default()
    }

    /// Creates a complete API route with rationale
    pub fn create_route(
        &self,
        use_case: UseCase,
        context: &PromptContext,
        prefer_local: bool,
    ) -> APIRoute {
        let mut providers = self
            .routing_rules
            .get(&use_case)
            .expect("Use case should have routing rules")
            .clone();

        // If prefer_local, move Ollama to the front (if available)
        if prefer_local && providers.contains(&APIProvider::Ollama) {
            providers.retain(|p| *p != APIProvider::Ollama);
            providers.insert(0, APIProvider::Ollama);
        }

        let provider = providers[0];
        let fallbacks = providers.iter().skip(1).copied().collect();

        let (rationale, model) = self.get_rationale_and_model(use_case, provider, context);
        let estimated_cost = self.estimate_cost(provider, 1000); // Estimate for 1k tokens
        let estimated_latency = self.estimate_latency(provider);

        APIRoute {
            provider,
            rationale,
            estimated_cost: Some(estimated_cost),
            estimated_latency: Some(estimated_latency),
            fallbacks,
            model: Some(model),
            config: None,
        }
    }

    fn get_rationale_and_model(
        &self,
        use_case: UseCase,
        provider: APIProvider,
        context: &PromptContext,
    ) -> (String, String) {
        match (use_case, provider) {
            (UseCase::Automation, APIProvider::Claude) => (
                "Claude excels at understanding complex automation workflows and providing detailed step-by-step instructions.".to_string(),
                "claude-sonnet-4-5".to_string(),
            ),
            (UseCase::Coding, APIProvider::Claude) => {
                let model = if matches!(context.complexity, Some(super::Complexity::Complex)) {
                    "claude-opus-4-1"
                } else {
                    "claude-sonnet-4-5"
                };
                (
                    format!("Claude {} is optimal for code generation with strong reasoning capabilities.", model),
                    model.to_string(),
                )
            },
            (UseCase::Coding, APIProvider::GPT) => (
                "GPT-4 provides excellent code generation with broad language support.".to_string(),
                "gpt-4".to_string(),
            ),
            (UseCase::DocumentCreation, APIProvider::GPT) => (
                "GPT-4 excels at creative writing and document generation with natural language.".to_string(),
                "gpt-4".to_string(),
            ),
            (UseCase::Search, APIProvider::Perplexity) => (
                "Perplexity is specifically designed for search queries with up-to-date web information.".to_string(),
                "pplx-70b-online".to_string(),
            ),
            (UseCase::ImageGen, APIProvider::DALLE) => (
                "DALL-E 3 provides high-quality image generation with excellent prompt understanding.".to_string(),
                "dall-e-3".to_string(),
            ),
            (UseCase::ImageGen, APIProvider::StableDiffusion) => (
                "Stable Diffusion offers flexible, cost-effective image generation.".to_string(),
                "stable-diffusion-xl".to_string(),
            ),
            (UseCase::VideoGen, APIProvider::Veo3) => (
                "Veo3 is Google's advanced video generation model with high-quality output.".to_string(),
                "veo-3".to_string(),
            ),
            (UseCase::GeneralQA, APIProvider::GPT) => (
                "GPT-4 provides versatile, accurate responses for general questions.".to_string(),
                "gpt-4".to_string(),
            ),
            (UseCase::GeneralQA, APIProvider::Ollama) => (
                "Ollama provides free local inference for general questions.".to_string(),
                "llama3.1".to_string(),
            ),
            _ => (
                format!("Using {} for {} task", provider.as_str(), use_case.as_str()),
                "default".to_string(),
            ),
        }
    }

    fn estimate_cost(&self, provider: APIProvider, tokens: u32) -> f64 {
        // Cost per 1k tokens (approximate, as of 2025)
        let cost_per_k = match provider {
            APIProvider::Claude => 0.003,          // Claude Sonnet
            APIProvider::GPT => 0.01,              // GPT-4
            APIProvider::Gemini => 0.00025,        // Gemini Pro
            APIProvider::Perplexity => 0.001,      // Perplexity
            APIProvider::Ollama => 0.0,            // Free local
            APIProvider::DALLE => 0.04,            // Per image (standard)
            APIProvider::StableDiffusion => 0.002, // Per image
            APIProvider::Midjourney => 0.01,       // Per image
            APIProvider::Veo3 => 0.1,              // Per video (estimated)
        };

        (tokens as f64 / 1000.0) * cost_per_k
    }

    fn estimate_latency(&self, provider: APIProvider) -> u32 {
        // Estimated latency in milliseconds
        match provider {
            APIProvider::Ollama => 500,           // Fast local inference
            APIProvider::Gemini => 800,           // Google's fast models
            APIProvider::GPT => 1500,             // OpenAI
            APIProvider::Claude => 1200,          // Anthropic
            APIProvider::Perplexity => 2000,      // Search takes longer
            APIProvider::DALLE => 5000,           // Image generation
            APIProvider::StableDiffusion => 3000, // Faster image gen
            APIProvider::Midjourney => 10000,     // Slower but high quality
            APIProvider::Veo3 => 30000,           // Video generation is slow
        }
    }
}

impl Default for APIRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coding_route() {
        let router = APIRouter::new();
        let context = PromptContext {
            language: Some("TypeScript".to_string()),
            framework: None,
            domain: None,
            complexity: Some(super::super::Complexity::Complex),
        };

        let provider = router.suggest_provider(UseCase::Coding, &context);
        assert_eq!(provider, APIProvider::Claude);
    }

    #[test]
    fn test_search_route() {
        let router = APIRouter::new();
        let context = PromptContext {
            language: None,
            framework: None,
            domain: None,
            complexity: None,
        };

        let provider = router.suggest_provider(UseCase::Search, &context);
        assert_eq!(provider, APIProvider::Perplexity);
    }

    #[test]
    fn test_prefer_local() {
        let router = APIRouter::new();
        let context = PromptContext {
            language: None,
            framework: None,
            domain: None,
            complexity: None,
        };

        let route = router.create_route(UseCase::Coding, &context, true);
        assert_eq!(route.provider, APIProvider::Ollama);
    }

    #[test]
    fn test_fallback_providers() {
        let router = APIRouter::new();
        let fallbacks = router.get_fallback_providers(UseCase::Coding);
        assert!(fallbacks.contains(&APIProvider::GPT));
    }
}
