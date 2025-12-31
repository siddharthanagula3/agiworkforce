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

        // GPT-5 models (Latest - 2025)
        pricing.insert(
            (Provider::OpenAI, "gpt-5-nano"),
            Pricing {
                input_per_million: 0.05,
                output_per_million: 0.4,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5-mini"),
            Pricing {
                input_per_million: 0.25,
                output_per_million: 2.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2"),
            Pricing {
                input_per_million: 2.5,
                output_per_million: 10.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-pro"),
            Pricing {
                input_per_million: 5.0,
                output_per_million: 15.0,
            },
        );

        // Claude 4.5 models (Current pricing as of 2025)
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4-5"),
            Pricing {
                input_per_million: 3.0,
                output_per_million: 15.0,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-haiku-4-5"),
            Pricing {
                input_per_million: 1.0,
                output_per_million: 5.0,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-opus-4-5"),
            Pricing {
                input_per_million: 5.0,
                output_per_million: 25.0,
            },
        );

        // Gemini 3 models (Latest - 2025)
        pricing.insert(
            (Provider::Google, "gemini-3-pro"),
            Pricing {
                input_per_million: 1.5,
                output_per_million: 6.0,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-flash"),
            Pricing {
                input_per_million: 0.075,
                output_per_million: 0.3,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-deep-think"),
            Pricing {
                input_per_million: 2.0,
                output_per_million: 8.0,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-2-flash"),
            Pricing {
                input_per_million: 0.1,
                output_per_million: 0.4,
            },
        );

        pricing.insert(
            (Provider::Ollama, "llama4-maverick"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 0.0,
            },
        );

        let mut provider_defaults = HashMap::new();
        provider_defaults.insert(
            Provider::OpenAI,
            Pricing {
                input_per_million: 0.25, // GPT-5-mini default
                output_per_million: 2.0,
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
                input_per_million: 0.075, // Gemini-3-flash default
                output_per_million: 0.3,
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
