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

/// Media type for per-unit pricing (images and video).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MediaType {
    /// Standard-quality image generation (e.g., DALL-E 3, Imagen 4)
    ImageStandard,
    /// High-quality / HD image generation (e.g., Imagen 4 Ultra, gpt-image-1.5)
    ImageHD,
    /// Video generation priced per second (e.g., Runway, Sora, Veo 3)
    VideoPerSecond,
}

/// Per-unit pricing for media generation (images, video).
///
/// Unlike token-based pricing, media generation uses a fixed per-unit cost:
/// - Images: cost per image generated
/// - Video: cost per second of video generated
#[derive(Debug, Clone)]
struct MediaPricing {
    /// Cost per unit (per image, or per second of video)
    cost_per_unit: f64,
}

pub struct CostCalculator {
    pricing: HashMap<(Provider, &'static str), Pricing>,
    provider_defaults: HashMap<Provider, Pricing>,
    /// Per-unit pricing for media generation keyed on (Provider, MediaType)
    media_pricing: HashMap<(Provider, MediaType), MediaPricing>,
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
        // Claude Sonnet 4.6 — current Sonnet (February 2026).
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4-6"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4.6"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        // Claude Sonnet 4.5 — legacy (alias and snapshot-pinned IDs).
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4-5"),
            Pricing {
                input_per_million: 3.00,
                output_per_million: 15.00,
            },
        );
        pricing.insert(
            (Provider::Anthropic, "claude-sonnet-4-5-20250929"),
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
        // Canonical OpenAI API model ID for GPT-5 Pro (after canonicalization).
        pricing.insert(
            (Provider::OpenAI, "gpt-5.2-pro"),
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
        // Canonical versioned xAI model ID (after canonicalization of "grok-4").
        pricing.insert(
            (Provider::XAI, "grok-4-0709"),
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

        // ---------------------------------------------------------
        // Media Generation Per-Unit Pricing
        // ---------------------------------------------------------
        let mut media_pricing = HashMap::new();

        // OpenAI image generation
        media_pricing.insert(
            (Provider::OpenAI, MediaType::ImageStandard),
            MediaPricing {
                cost_per_unit: 0.04,
            },
        );
        media_pricing.insert(
            (Provider::OpenAI, MediaType::ImageHD),
            MediaPricing {
                cost_per_unit: 0.08,
            },
        );
        // OpenAI Sora video (~$0.10 per second)
        media_pricing.insert(
            (Provider::OpenAI, MediaType::VideoPerSecond),
            MediaPricing {
                cost_per_unit: 0.10,
            },
        );

        // Google image generation (Imagen 4)
        media_pricing.insert(
            (Provider::Google, MediaType::ImageStandard),
            MediaPricing {
                cost_per_unit: 0.04,
            },
        );
        media_pricing.insert(
            (Provider::Google, MediaType::ImageHD),
            MediaPricing {
                cost_per_unit: 0.08,
            },
        );
        // Google Veo 3 video (~$0.08 per second)
        media_pricing.insert(
            (Provider::Google, MediaType::VideoPerSecond),
            MediaPricing {
                cost_per_unit: 0.08,
            },
        );

        // ManagedCloud inherits from origin providers (handled in calculate_media_cost)

        Self {
            pricing,
            provider_defaults,
            media_pricing,
        }
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

    /// Calculates the cost for a media generation operation.
    ///
    /// - For images: `units` is the number of images generated.
    /// - For video: `units` is the number of seconds of video generated.
    ///
    /// Returns 0.0 if no pricing is found for the provider/media_type combination.
    pub fn calculate_media_cost(
        &self,
        provider: Provider,
        media_type: MediaType,
        units: u32,
    ) -> f64 {
        if units == 0 {
            return 0.0;
        }

        let media_price = self.media_pricing.get(&(provider, media_type)).or_else(|| {
            // ManagedCloud fallback: check origin providers
            if provider == Provider::ManagedCloud {
                Self::MANAGED_CLOUD_ORIGIN_PROVIDERS
                    .iter()
                    .find_map(|&p| self.media_pricing.get(&(p, media_type)))
            } else {
                None
            }
        });

        match media_price {
            Some(pricing) => pricing.cost_per_unit * units as f64,
            None => {
                // Fallback: use conservative defaults
                let default_cost = match media_type {
                    MediaType::ImageStandard => 0.04,
                    MediaType::ImageHD => 0.08,
                    MediaType::VideoPerSecond => 0.08,
                };
                default_cost * units as f64
            }
        }
    }
}
