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
    pricing: HashMap<(Provider, String), Pricing>,
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
    /// Creates a new CostCalculator with pricing loaded from models.json.
    pub fn new() -> Self {
        let config = super::models_config::config();

        // Build per-model pricing from the catalog
        let mut pricing = HashMap::new();
        for (model_id, model) in &config.models {
            if let Some(provider) = Provider::from_string(&model.provider) {
                pricing.insert(
                    (provider, model_id.clone()),
                    Pricing {
                        input_per_million: model.input_cost,
                        output_per_million: model.output_cost,
                    },
                );
                // If the model has an apiModelId different from id, also register
                // under the API model ID so cost lookups work after canonicalization.
                if let Some(api_id) = &model.api_model_id {
                    if api_id != model_id {
                        pricing.insert(
                            (provider, api_id.clone()),
                            Pricing {
                                input_per_million: model.input_cost,
                                output_per_million: model.output_cost,
                            },
                        );
                    }
                }
            }
        }

        // Build provider default pricing from the catalog
        let mut provider_defaults = HashMap::new();
        for (provider_id, provider_cfg) in &config.providers {
            if let Some(provider) = Provider::from_string(provider_id) {
                provider_defaults.insert(
                    provider,
                    Pricing {
                        input_per_million: provider_cfg.default_pricing.input_per_million,
                        output_per_million: provider_cfg.default_pricing.output_per_million,
                    },
                );
            }
        }

        // ---------------------------------------------------------
        // Media Generation Per-Unit Pricing (stays hardcoded)
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
    /// (DeepSeek), `gemini-3-flash-preview` (Google), etc. -- instead of duplicating every
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

        let key = (provider, model.to_string());
        let pricing = self
            .pricing
            .get(&key)
            .or_else(|| {
                // ManagedCloud routes to models from other providers, so look up
                // pricing under the model's original provider before falling back.
                if provider == Provider::ManagedCloud {
                    Self::MANAGED_CLOUD_ORIGIN_PROVIDERS
                        .iter()
                        .find_map(|&p| self.pricing.get(&(p, model.to_string())))
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
