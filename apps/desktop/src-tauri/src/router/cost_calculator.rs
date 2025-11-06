use std::collections::HashMap;

use crate::router::Provider;

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

        // OpenAI pricing (USD per 1M tokens)
        pricing.insert(
            (Provider::OpenAI, "gpt-4o"),
            Pricing {
                input_per_million: 5.0,
                output_per_million: 15.0,
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
            (Provider::OpenAI, "gpt-4.1"),
            Pricing {
                input_per_million: 10.0,
                output_per_million: 30.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-4.1-mini"),
            Pricing {
                input_per_million: 2.5,
                output_per_million: 10.0,
            },
        );

        // Anthropic pricing
        pricing.insert(
            (Provider::Anthropic, "claude-3-5-sonnet-20241022"),
            Pricing {
                input_per_million: 3.0,
                output_per_million: 15.0,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-3-5-haiku-20241022"),
            Pricing {
                input_per_million: 0.25,
                output_per_million: 1.25,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-3-opus-20240229"),
            Pricing {
                input_per_million: 15.0,
                output_per_million: 75.0,
            },
        );

        // Google pricing
        pricing.insert(
            (Provider::Google, "gemini-1.5-pro"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 5.0,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-1.5-flash"),
            Pricing {
                input_per_million: 0.075,
                output_per_million: 0.30,
            },
        );

        // Ollama - local (no cost)
        pricing.insert(
            (Provider::Ollama, "llama3"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 0.0,
            },
        );

        let mut provider_defaults = HashMap::new();
        provider_defaults.insert(
            Provider::OpenAI,
            Pricing {
                input_per_million: 2.5,
                output_per_million: 10.0,
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
                input_per_million: 0.5,
                output_per_million: 1.5,
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
