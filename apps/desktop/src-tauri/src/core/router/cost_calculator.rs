use std::collections::HashMap;

use crate::core::router::Provider;

#[derive(Debug, Clone)]
struct Pricing {
    input_per_million: f64,
    output_per_million: f64,
}

impl Pricing {
    fn cost(&self, input_tokens: u32, output_tokens: u32) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input_per_million;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output_per_million;
        input_cost + output_cost
    }
}

pub struct CostCalculator {
    pricing: HashMap<(Provider, &'static str), Pricing>,
    provider_defaults: HashMap<Provider, Pricing>,
}

impl Default for CostCalculator {
    fn default() -> Self {
        Self::new()
    }
}

impl CostCalculator {
    /// Creates a new CostCalculator with January 2026 pricing
    /// Last updated: 2026-01-01
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // ---------------------------------------------------------
        // DeepSeek Models (Best Value Leaders) - Updated 2026-01-01
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::DeepSeek, "deepseek-v3.2"),
            Pricing {
                input_per_million: 0.28, // Cache miss price
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-v3"),
            Pricing {
                input_per_million: 0.27,
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-chat"),
            Pricing {
                input_per_million: 0.27,
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-r1"),
            Pricing {
                input_per_million: 0.55,
                output_per_million: 1.68, // Reduced from $2.19
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-reasoner"),
            Pricing {
                input_per_million: 0.55,
                output_per_million: 1.68,
            },
        );

        // ---------------------------------------------------------
        // Google Gemini (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Google, "gemini-3-flash"),
            Pricing {
                input_per_million: 0.50,
                output_per_million: 3.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-pro"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 12.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-deep-think"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 12.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-2.5-pro"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-2.5-flash"),
            Pricing {
                input_per_million: 0.30,
                output_per_million: 2.50,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-2.0-flash"),
            Pricing {
                input_per_million: 0.10,
                output_per_million: 0.40,
            },
        );

        // ---------------------------------------------------------
        // Anthropic Claude 4.5 (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Anthropic, "claude-haiku-4-5"),
            Pricing {
                input_per_million: 1.00,
                output_per_million: 5.00,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4-5"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-opus-4-5"),
            Pricing {
                input_per_million: 5.00,   // Reduced from $15 (67% cut)
                output_per_million: 25.00, // Reduced from $75
            },
        );

        // ---------------------------------------------------------
        // OpenAI (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::OpenAI, "gpt-5"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5-mini"),
            Pricing {
                input_per_million: 0.25,
                output_per_million: 2.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5-nano"),
            Pricing {
                input_per_million: 0.05,
                output_per_million: 0.40,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "o3"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 8.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "o4-mini"),
            Pricing {
                input_per_million: 1.10,
                output_per_million: 4.40,
            },
        );

        // ---------------------------------------------------------
        // xAI Grok 4 (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::XAI, "grok-4"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-4-fast"),
            Pricing {
                input_per_million: 0.20,
                output_per_million: 0.50,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-4.1"),
            Pricing {
                input_per_million: 0.20,
                output_per_million: 0.50,
            },
        );

        // ---------------------------------------------------------
        // Moonshot Kimi K2 (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Moonshot, "kimi-k2"),
            Pricing {
                input_per_million: 0.60, // Cache miss
                output_per_million: 2.50,
            },
        );
        pricing.insert(
            (Provider::Moonshot, "kimi-k2-thinking"),
            Pricing {
                input_per_million: 0.60,
                output_per_million: 2.50,
            },
        );
        pricing.insert(
            (Provider::Moonshot, "kimi-k2-thinking-turbo"),
            Pricing {
                input_per_million: 1.15,
                output_per_million: 8.00,
            },
        );

        // ---------------------------------------------------------
        // Qwen3 (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Qwen, "qwen3-max"),
            Pricing {
                input_per_million: 1.20,
                output_per_million: 6.00,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen3-coder"),
            Pricing {
                input_per_million: 0.22,
                output_per_million: 0.95,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen3-coder-plus"),
            Pricing {
                input_per_million: 0.50,
                output_per_million: 2.00,
            },
        );

        // ---------------------------------------------------------
        // Perplexity Sonar (Updated 2026-01-01)
        // Note: Perplexity also charges per-search fees
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Perplexity, "sonar"),
            Pricing {
                input_per_million: 1.00,
                output_per_million: 1.00,
            },
        );
        pricing.insert(
            (Provider::Perplexity, "sonar-pro"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::Perplexity, "sonar-deep-research"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 8.00,
            },
        );

        // ---------------------------------------------------------
        // Legacy Support (Older models still in use)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::OpenAI, "gpt-4o"),
            Pricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-4o-mini"),
            Pricing {
                input_per_million: 0.15,
                output_per_million: 0.60,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-3-5-sonnet-20241022"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );

        // ---------------------------------------------------------
        // Provider Defaults (Updated 2026-01-01)
        // Used when a specific model is not found in the pricing map
        // ---------------------------------------------------------
        let mut provider_defaults = HashMap::new();
        provider_defaults.insert(
            Provider::OpenAI,
            Pricing {
                input_per_million: 1.25, // GPT-5 pricing as default
                output_per_million: 10.00,
            },
        );
        provider_defaults.insert(
            Provider::Anthropic,
            Pricing {
                input_per_million: 3.00, // Sonnet 4.5 pricing as default
                output_per_million: 15.00,
            },
        );
        provider_defaults.insert(
            Provider::Google,
            Pricing {
                input_per_million: 0.50, // Gemini 3 Flash pricing as default
                output_per_million: 3.00,
            },
        );
        provider_defaults.insert(
            Provider::DeepSeek,
            Pricing {
                input_per_million: 0.27, // V3 pricing as default
                output_per_million: 0.42,
            },
        );
        provider_defaults.insert(
            Provider::XAI,
            Pricing {
                input_per_million: 0.20, // Grok 4.1 pricing as default
                output_per_million: 0.50,
            },
        );
        provider_defaults.insert(
            Provider::Moonshot,
            Pricing {
                input_per_million: 0.60, // Kimi K2 pricing as default
                output_per_million: 2.50,
            },
        );
        provider_defaults.insert(
            Provider::Qwen,
            Pricing {
                input_per_million: 1.20, // Qwen3 Max pricing as default
                output_per_million: 6.00,
            },
        );
        provider_defaults.insert(
            Provider::Perplexity,
            Pricing {
                input_per_million: 2.00, // Sonar Deep Research as default
                output_per_million: 8.00,
            },
        );
        provider_defaults.insert(
            Provider::Ollama,
            Pricing {
                input_per_million: 0.0, // Local models are free
                output_per_million: 0.0,
            },
        );

        Self {
            pricing,
            provider_defaults,
        }
    }

    /// Helper to add a new model at runtime (for future model updates)
    /// This allows the dev team to easily add new models like Claude 5, GPT-6, etc.
    #[allow(dead_code)]
    pub fn add_model(&mut self, provider: Provider, model: &'static str, input: f64, output: f64) {
        self.pricing.insert(
            (provider, model),
            Pricing {
                input_per_million: input,
                output_per_million: output,
            },
        );
    }

    pub fn calculate(
        &self,
        provider: Provider,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
    ) -> f64 {
        if input_tokens == 0 && output_tokens == 0 {
            return 0.0;
        }

        let key = (provider, model);
        let pricing = self
            .pricing
            .get(&key)
            .or_else(|| self.provider_defaults.get(&provider))
            .cloned()
            .unwrap_or(Pricing {
                input_per_million: 1.0,
                output_per_million: 1.0,
            });

        pricing.cost(input_tokens, output_tokens)
    }
}
