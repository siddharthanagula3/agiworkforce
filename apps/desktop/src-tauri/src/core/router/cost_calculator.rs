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
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // ---------------------------------------------------------
        // DeepSeek Models (Best Value Leaders)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::DeepSeek, "deepseek-v3.2"),
            Pricing {
                input_per_million: 0.14,
                output_per_million: 0.28,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-r1"),
            Pricing {
                input_per_million: 0.55, // Affordable reasoning
                output_per_million: 2.19,
            },
        );

        // ---------------------------------------------------------
        // Google Gemini 3 (Best Chat & Multimodal)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Google, "gemini-3-flash"),
            Pricing {
                input_per_million: 0.10,
                output_per_million: 0.40,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-pro"),
            Pricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-deep-think"),
            Pricing {
                input_per_million: 2.50, // Same price as Pro
                output_per_million: 10.00,
            },
        );

        // ---------------------------------------------------------
        // Anthropic Claude 4.5 (Quality Leaders)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Anthropic, "claude-haiku-4-5"),
            Pricing {
                input_per_million: 0.25,
                output_per_million: 1.25,
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
                input_per_million: 15.00,
                output_per_million: 75.00,
            },
        );

        // ---------------------------------------------------------
        // OpenAI GPT-5 Series
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::OpenAI, "gpt-5-nano"),
            Pricing {
                input_per_million: 0.15,
                output_per_million: 0.60,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 20.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-pro"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 20.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 20.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "o3"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 20.00,
            },
        );

        // ---------------------------------------------------------
        // xAI Grok (Simple Pricing)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::XAI, "grok-4.1-fast"),
            Pricing {
                input_per_million: 0.50, // $0.50 flat
                output_per_million: 0.50,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-4.1"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 8.00,
            },
        );

        // ---------------------------------------------------------
        // Specialized & Others
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Moonshot, "kimi-k2-thinking"),
            Pricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen3-coder"),
            Pricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );
         pricing.insert(
            (Provider::Qwen, "qwen3-max"),
            Pricing {
                input_per_million: 2.50,
                output_per_million: 10.00,
            },
        );

        // ---------------------------------------------------------
        // Legacy Support
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::OpenAI, "gpt-4o"),
            Pricing {
                input_per_million: 2.50, // Price drop
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

        let mut provider_defaults = HashMap::new();
        provider_defaults.insert(
            Provider::OpenAI,
            Pricing {
                input_per_million: 0.15,
                output_per_million: 0.60,
            },
        );
        provider_defaults.insert(
            Provider::Anthropic,
            Pricing {
                input_per_million: 3.0,
                output_per_million: 15.0,
            },
        );
        provider_defaults.insert(
            Provider::Google,
            Pricing {
                input_per_million: 0.10,
                output_per_million: 0.40,
            },
        );
        provider_defaults.insert(
            Provider::DeepSeek,
            Pricing {
                input_per_million: 0.14,
                output_per_million: 0.28,
            },
        );
        provider_defaults.insert(
            Provider::Ollama,
            Pricing {
                input_per_million: 0.0,
                output_per_million: 0.0,
            },
        );

        Self {
            pricing,
            provider_defaults,
        }
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
