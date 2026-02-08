use std::collections::HashMap;

use crate::core::llm::Provider;

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
        // DeepSeek Models (Best Value Leaders) - Updated 2026-02-07
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::DeepSeek, "deepseek-chat"),
            Pricing {
                input_per_million: 0.28,
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-r1"),
            Pricing {
                input_per_million: 0.55,
                output_per_million: 2.19,
            },
        );
        pricing.insert(
            (Provider::DeepSeek, "deepseek-reasoner"),
            Pricing {
                input_per_million: 0.55,
                output_per_million: 2.19,
            },
        );

        // ---------------------------------------------------------
        // Google Gemini (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Google, "gemini-3-ultra"),
            Pricing {
                input_per_million: 3.50,
                output_per_million: 14.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-flash-preview"),
            Pricing {
                input_per_million: 0.50,
                output_per_million: 3.00,
            },
        );
        pricing.insert(
            (Provider::Google, "gemini-3-pro-preview"),
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
        // Image generation
        pricing.insert(
            (Provider::Google, "imagen-4"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 40.0,
            },
        );
        pricing.insert(
            (Provider::Google, "imagen-4-ultra"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 80.0,
            },
        );
        // Video generation
        pricing.insert(
            (Provider::Google, "veo-3"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 750.0,
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
            (Provider::Anthropic, "claude-haiku-4.5"),
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
            (Provider::Anthropic, "claude-sonnet-4.5"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-opus-4-6"),
            Pricing {
                input_per_million: 5.00,   // Reduced from $15 (67% cut)
                output_per_million: 25.00, // Reduced from $75
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-opus-4.6"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 25.00,
            },
        );

        // ---------------------------------------------------------
        // OpenAI (Updated 2026-01-01)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::OpenAI, "gpt-5-pro"),
            Pricing {
                input_per_million: 5.00,
                output_per_million: 30.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2"),
            Pricing {
                input_per_million: 1.75,
                output_per_million: 14.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5-codex"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex-low"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex-medium"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex-high"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-codex-xhigh"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 10.00,
            },
        );
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
        // Image generation (per 1000 images equivalent)
        pricing.insert(
            (Provider::OpenAI, "dall-e-3"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 40.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-image-1"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 40.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "gpt-image-1.5"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 80.0,
            },
        );
        // TTS
        pricing.insert(
            (Provider::OpenAI, "tts-1"),
            Pricing {
                input_per_million: 15.0,
                output_per_million: 0.0,
            },
        );
        pricing.insert(
            (Provider::OpenAI, "tts-1-hd"),
            Pricing {
                input_per_million: 30.0,
                output_per_million: 0.0,
            },
        );
        // STT
        pricing.insert(
            (Provider::OpenAI, "whisper-1"),
            Pricing {
                input_per_million: 0.006,
                output_per_million: 0.0,
            },
        );
        // Video
        pricing.insert(
            (Provider::OpenAI, "sora-2"),
            Pricing {
                input_per_million: 0.0,
                output_per_million: 100.0,
            },
        );

        // ---------------------------------------------------------
        // xAI Grok 4 (Updated 2026-02-07)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::XAI, "grok-4"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-4-fast-reasoning"),
            Pricing {
                input_per_million: 0.20,
                output_per_million: 0.50,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-4-fast-non-reasoning"),
            Pricing {
                input_per_million: 0.20,
                output_per_million: 0.50,
            },
        );
        pricing.insert(
            (Provider::XAI, "grok-code-fast-1"),
            Pricing {
                input_per_million: 0.20,
                output_per_million: 1.50,
            },
        );

        // ---------------------------------------------------------
        // Moonshot Kimi K2.5 (Updated 2026-01-28)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Moonshot, "kimi-k2.5"),
            Pricing {
                input_per_million: 0.80,
                output_per_million: 3.50,
            },
        );
        pricing.insert(
            (Provider::Moonshot, "kimi-k2.5-thinking"),
            Pricing {
                input_per_million: 0.80,
                output_per_million: 3.50,
            },
        );
        pricing.insert(
            (Provider::Moonshot, "kimi-k2.5-turbo"),
            Pricing {
                input_per_million: 1.25,
                output_per_million: 8.50,
            },
        );

        // ---------------------------------------------------------
        // Qwen (Updated 2026-02-07)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Qwen, "qwen-flash"),
            Pricing {
                input_per_million: 0.05,
                output_per_million: 0.15,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-turbo"),
            Pricing {
                input_per_million: 0.10,
                output_per_million: 0.30,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-coder-flash"),
            Pricing {
                input_per_million: 0.22,
                output_per_million: 0.95,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-coder"),
            Pricing {
                input_per_million: 0.30,
                output_per_million: 1.50,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-coder-plus"),
            Pricing {
                input_per_million: 0.50,
                output_per_million: 2.00,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-max"),
            Pricing {
                input_per_million: 1.20,
                output_per_million: 6.00,
            },
        );
        pricing.insert(
            (Provider::Qwen, "qwen-max-preview"),
            Pricing {
                input_per_million: 2.15,
                output_per_million: 8.60,
            },
        );

        // ---------------------------------------------------------
        // Perplexity Sonar (Updated 2026-01-28)
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
            (Provider::Perplexity, "sonar-reasoning"),
            Pricing {
                input_per_million: 1.00,
                output_per_million: 5.00,
            },
        );
        pricing.insert(
            (Provider::Perplexity, "sonar-reasoning-pro"),
            Pricing {
                input_per_million: 2.00,
                output_per_million: 8.00,
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
        // ZhipuAI GLM Models (Updated 2026-01-28)
        // GLM-4.6V-Flash is FREE (open-source MIT license)
        // GLM-4.7 is the flagship coding model (73.8% SWE-bench)
        // ---------------------------------------------------------
        pricing.insert(
            (Provider::Zhipu, "glm-4.6v-flash"),
            Pricing {
                input_per_million: 0.0,  // FREE! Open-source MIT license
                output_per_million: 0.0, // FREE! Zero cost for commercial use
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4.7"),
            Pricing {
                input_per_million: 0.14, // Flagship coding model
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4.6v"),
            Pricing {
                input_per_million: 0.14, // Vision model
                output_per_million: 0.42,
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4-plus"),
            Pricing {
                input_per_million: 0.50,
                output_per_million: 0.50,
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4-air"),
            Pricing {
                input_per_million: 0.10,
                output_per_million: 0.10,
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4-airx"),
            Pricing {
                input_per_million: 1.00,
                output_per_million: 1.00,
            },
        );
        pricing.insert(
            (Provider::Zhipu, "glm-4-flash"),
            Pricing {
                input_per_million: 0.01,
                output_per_million: 0.01,
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
                input_per_million: 0.20, // grok-4-fast pricing as default
                output_per_million: 0.50,
            },
        );
        provider_defaults.insert(
            Provider::Moonshot,
            Pricing {
                input_per_million: 0.80, // Kimi K2.5 pricing as default
                output_per_million: 3.50,
            },
        );
        provider_defaults.insert(
            Provider::Qwen,
            Pricing {
                input_per_million: 1.20, // Qwen Max pricing as default
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
        provider_defaults.insert(
            Provider::Zhipu,
            Pricing {
                input_per_million: 0.0,  // GLM-4.6V-Flash FREE as default
                output_per_million: 0.0, // Prioritize free model
            },
        );
        provider_defaults.insert(
            Provider::ManagedCloud,
            Pricing {
                input_per_million: 0.27, // DeepSeek Chat pricing as default
                output_per_million: 0.42,
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

    /// Providers whose pricing entries ManagedCloud may proxy through.
    /// ManagedCloud routes to models like `gpt-5-nano` (OpenAI), `deepseek-reasoner`
    /// (DeepSeek), `gemini-3-flash-preview` (Google), etc. — instead of duplicating every
    /// pricing entry, we look up the model under its original provider.
    const MANAGED_CLOUD_ORIGIN_PROVIDERS: &'static [Provider] = &[
        Provider::OpenAI,
        Provider::Anthropic,
        Provider::Google,
        Provider::DeepSeek,
        Provider::XAI,
        Provider::Moonshot,
        Provider::Qwen,
        Provider::Perplexity,
        Provider::Zhipu,
    ];

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
            .or_else(|| {
                // ManagedCloud routes to models from other providers, so look up
                // pricing under the model's original provider before falling back.
                if provider == Provider::ManagedCloud {
                    Self::MANAGED_CLOUD_ORIGIN_PROVIDERS
                        .iter()
                        .find_map(|&p| self.pricing.get(&(p, model)))
                } else {
                    None
                }
            })
            .or_else(|| self.provider_defaults.get(&provider))
            .cloned()
            .unwrap_or(Pricing {
                input_per_million: 1.0,
                output_per_million: 1.0,
            });

        pricing.cost(input_tokens, output_tokens)
    }
}
