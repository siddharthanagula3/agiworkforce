use super::{APIProvider, APIRoute, PromptContext, UseCase};
use crate::core::llm::{models_config, Provider};
use std::collections::HashMap;

/// Look up OpenAI's task-routed model for the given snake_case task
/// (e.g. `"code_generation"`, `"chat"`).  Falls back to the provider's
/// default model from `models.json` so this never returns a stale literal.
/// Source of truth: `packages/types/src/models.json`.
fn openai_model_for_task(task: &str) -> String {
    models_config::get_task_model(&Provider::OpenAI, task).to_string()
}

/// Look up Anthropic's task-routed model for the given snake_case task.
fn claude_model_for_task(task: &str) -> String {
    models_config::get_task_model(&Provider::Anthropic, task).to_string()
}

/// Look up Perplexity's default model.
/// TODO(rule-models-json): add Perplexity task-routing entries to models.json.
fn perplexity_default_model() -> String {
    // Falls back to "pplx-70b-online" if models.json has no Perplexity default_model set.
    // Replace this constant once Perplexity task_routing is wired in models.json.
    let from_catalog = models_config::get_default_model(&Provider::Perplexity);
    if from_catalog.is_empty() || from_catalog == "gpt-5.4-mini" {
        // Catalog fallback returned the generic default — use the Perplexity-specific pin.
        "pplx-70b-online".to_string()
    } else {
        from_catalog.to_string()
    }
}

/// Image / video generation models are not in the standard chat catalog;
/// centralize them here so changes require only one edit.
/// TODO(rule-models-json): add image/video provider entries to models.json.
mod gen_model_consts {
    pub const DALLE_3: &str = "dall-e-3";
    pub const STABLE_DIFFUSION_XL: &str = "stable-diffusion-xl";
    pub const VEO_3: &str = "veo-3";
}

/// Ollama fallback model for local inference.
/// TODO(rule-models-json): add Ollama task_routing to models.json.
fn ollama_default_model() -> String {
    models_config::get_default_model(&Provider::Ollama).to_string()
}

pub struct APIRouter {
    routing_rules: HashMap<UseCase, Vec<APIProvider>>,
}

impl APIRouter {
    pub fn new() -> Self {
        let mut routing_rules = HashMap::new();

        routing_rules.insert(
            UseCase::Automation,
            vec![APIProvider::Claude, APIProvider::GPT, APIProvider::Gemini],
        );

        routing_rules.insert(
            UseCase::Coding,
            vec![APIProvider::Claude, APIProvider::GPT, APIProvider::Ollama],
        );

        routing_rules.insert(
            UseCase::DocumentCreation,
            vec![APIProvider::GPT, APIProvider::Claude, APIProvider::Gemini],
        );

        routing_rules.insert(
            UseCase::Search,
            vec![
                APIProvider::Perplexity,
                APIProvider::GPT,
                APIProvider::Gemini,
            ],
        );

        routing_rules.insert(
            UseCase::ImageGen,
            vec![
                APIProvider::DALLE,
                APIProvider::StableDiffusion,
                APIProvider::Midjourney,
            ],
        );

        routing_rules.insert(UseCase::VideoGen, vec![APIProvider::Veo3]);

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

    pub fn suggest_provider(&self, use_case: UseCase, context: &PromptContext) -> APIProvider {
        let providers = match self.routing_rules.get(&use_case) {
            Some(p) => p,
            None => return APIProvider::GPT, // Default fallback
        };

        if use_case == UseCase::Coding {
            if let Some(complexity) = context.complexity {
                if complexity == super::Complexity::Complex {
                    return APIProvider::Claude;
                }
            }
        }

        providers.first().copied().unwrap_or(APIProvider::GPT)
    }

    pub fn get_fallback_providers(&self, use_case: UseCase) -> Vec<APIProvider> {
        self.routing_rules
            .get(&use_case)
            .map(|providers| providers.iter().skip(1).copied().collect())
            .unwrap_or_default()
    }

    pub fn create_route(
        &self,
        use_case: UseCase,
        context: &PromptContext,
        prefer_local: bool,
    ) -> APIRoute {
        let mut providers = self
            .routing_rules
            .get(&use_case)
            .cloned()
            .unwrap_or_else(|| vec![APIProvider::GPT]);

        if prefer_local && providers.contains(&APIProvider::Ollama) {
            providers.retain(|p| *p != APIProvider::Ollama);
            providers.insert(0, APIProvider::Ollama);
        }

        let provider = providers[0];
        let fallbacks = providers.iter().skip(1).copied().collect();

        let (rationale, model) = self.get_rationale_and_model(use_case, provider, context);
        let estimated_cost = self.estimate_cost(provider, 1000);
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
                claude_model_for_task("chat"),
            ),
            (UseCase::Coding, APIProvider::Claude) => {
                let model = if matches!(context.complexity, Some(super::Complexity::Complex)) {
                    claude_model_for_task("complex_reasoning")
                } else {
                    claude_model_for_task("code_generation")
                };
                (
                    format!("Claude is optimal for code generation with strong reasoning capabilities."),
                    model,
                )
            },
            (UseCase::Coding, APIProvider::GPT) => (
                "GPT provides excellent code generation with broad language support.".to_string(),
                openai_model_for_task("code_generation"),
            ),
            (UseCase::DocumentCreation, APIProvider::GPT) => (
                "GPT excels at creative writing and document generation with natural language.".to_string(),
                openai_model_for_task("chat"),
            ),
            (UseCase::Search, APIProvider::Perplexity) => (
                "Perplexity is specifically designed for search queries with up-to-date web information.".to_string(),
                perplexity_default_model(),
            ),
            (UseCase::ImageGen, APIProvider::DALLE) => (
                "DALL-E 3 provides high-quality image generation with excellent prompt understanding.".to_string(),
                // TODO(rule-models-json): wire dall-e entries into models.json image-gen catalog.
                gen_model_consts::DALLE_3.to_string(),
            ),
            (UseCase::ImageGen, APIProvider::StableDiffusion) => (
                "Stable Diffusion offers flexible, cost-effective image generation.".to_string(),
                // TODO(rule-models-json): wire StableDiffusion entries into models.json image-gen catalog.
                gen_model_consts::STABLE_DIFFUSION_XL.to_string(),
            ),
            (UseCase::VideoGen, APIProvider::Veo3) => (
                "Veo3 is Google's advanced video generation model with high-quality output.".to_string(),
                // TODO(rule-models-json): wire Veo entries into models.json video-gen catalog.
                gen_model_consts::VEO_3.to_string(),
            ),
            (UseCase::GeneralQA, APIProvider::GPT) => (
                "GPT provides versatile, accurate responses for general questions.".to_string(),
                openai_model_for_task("chat"),
            ),
            (UseCase::GeneralQA, APIProvider::Ollama) => (
                "Ollama provides free local inference for general questions.".to_string(),
                // TODO(rule-models-json): wire Ollama task_routing into models.json.
                ollama_default_model(),
            ),
            _ => (
                format!("Using {} for {} task", provider.as_str(), use_case.as_str()),
                "default".to_string(),
            ),
        }
    }

    fn estimate_cost(&self, provider: APIProvider, tokens: u32) -> f64 {
        let cost_per_k = match provider {
            APIProvider::Claude => 0.003,
            APIProvider::GPT => 0.01,
            APIProvider::Gemini => 0.00025,
            APIProvider::Perplexity => 0.001,
            APIProvider::Ollama => 0.0,
            APIProvider::DALLE => 0.04,
            APIProvider::StableDiffusion => 0.002,
            APIProvider::Midjourney => 0.01,
            APIProvider::Veo3 => 0.1,
        };

        (tokens as f64 / 1000.0) * cost_per_k
    }

    fn estimate_latency(&self, provider: APIProvider) -> u32 {
        match provider {
            APIProvider::Ollama => 500,
            APIProvider::Gemini => 800,
            APIProvider::GPT => 1500,
            APIProvider::Claude => 1200,
            APIProvider::Perplexity => 2000,
            APIProvider::DALLE => 5000,
            APIProvider::StableDiffusion => 3000,
            APIProvider::Midjourney => 10000,
            APIProvider::Veo3 => 30000,
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
