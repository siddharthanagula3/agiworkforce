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
    /// ManagedCloud routes to models like `gpt-5.4-nano` (OpenAI), `deepseek-reasoner`
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
            .cloned();

        match pricing {
            Some(p) => p.cost(input_tokens, output_tokens),
            None => {
                tracing::warn!(
                    model = %model,
                    provider = ?provider,
                    input_tokens,
                    output_tokens,
                    "no pricing found for model or provider; returning 0.0 cost — \
                     add model pricing to models.json to enable accurate cost tracking"
                );
                0.0
            }
        }
    }

    /// Calculate cost with cache discount applied.
    /// - Anthropic: cache_creation tokens billed at 1.25x input rate, cache_read at 0.1x input rate
    /// - OpenAI: cached_prompt tokens billed at 0.5x input rate
    pub fn calculate_with_cache(
        &self,
        provider: Provider,
        model: &str,
        prompt_tokens: u32,
        completion_tokens: u32,
        cache_read_tokens: u32,
        cache_creation_tokens: u32,
    ) -> f64 {
        if prompt_tokens == 0 && completion_tokens == 0 {
            return 0.0;
        }

        let key = (provider, model.to_string());
        let pricing = self
            .pricing
            .get(&key)
            .or_else(|| {
                if provider == Provider::ManagedCloud {
                    Self::MANAGED_CLOUD_ORIGIN_PROVIDERS
                        .iter()
                        .find_map(|&p| self.pricing.get(&(p, model.to_string())))
                } else {
                    None
                }
            })
            .or_else(|| self.provider_defaults.get(&provider))
            .cloned();

        let pricing = match pricing {
            Some(p) => p,
            None => {
                tracing::warn!(
                    model = %model,
                    provider = ?provider,
                    prompt_tokens,
                    completion_tokens,
                    cache_read_tokens,
                    cache_creation_tokens,
                    "no pricing found for model or provider; returning 0.0 cost — \
                     add model pricing to models.json to enable accurate cost tracking"
                );
                return 0.0;
            }
        };

        let input_rate = pricing.input_per_million / 1_000_000.0;
        let output_rate = pricing.output_per_million / 1_000_000.0;

        match provider {
            Provider::Anthropic => {
                // cache_read at 0.1x, cache_creation at 1.25x, rest at 1.0x
                let regular_input =
                    prompt_tokens.saturating_sub(cache_read_tokens + cache_creation_tokens);
                let input_cost = (regular_input as f64 * input_rate)
                    + (cache_creation_tokens as f64 * input_rate * 1.25)
                    + (cache_read_tokens as f64 * input_rate * 0.1);
                let output_cost = completion_tokens as f64 * output_rate;
                input_cost + output_cost
            }
            Provider::OpenAI | Provider::ManagedCloud => {
                // cached tokens at 0.5x input rate
                let regular_input = prompt_tokens.saturating_sub(cache_read_tokens);
                let input_cost = (regular_input as f64 * input_rate)
                    + (cache_read_tokens as f64 * input_rate * 0.5);
                let output_cost = completion_tokens as f64 * output_rate;
                input_cost + output_cost
            }
            _ => self.calculate(provider, model, prompt_tokens, completion_tokens),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculate_returns_positive_for_known_model() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(Provider::Anthropic, "claude-opus-4-6", 1000, 500);
        assert!(
            cost > 0.0,
            "known model cost must be positive, got {}",
            cost
        );
    }

    #[test]
    fn calculate_returns_zero_for_zero_tokens() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(Provider::OpenAI, "gpt-5.4-nano", 0, 0);
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "zero tokens must produce zero cost"
        );
    }

    #[test]
    fn calculate_uses_provider_default_for_unknown_model() {
        let calc = CostCalculator::new();
        // Unknown model under a known provider should use provider default,
        // which should produce a non-zero cost (not the old silent 1.0/1.0).
        let cost = calc.calculate(
            Provider::OpenAI,
            "totally-unknown-model-xyz-99",
            1_000_000,
            1_000_000,
        );
        assert!(
            cost > 0.0,
            "provider default pricing must produce positive cost, got {}",
            cost
        );
    }

    #[test]
    fn calculate_returns_zero_for_unknown_model_without_provider_pricing() {
        // Build a calculator, then try a provider/model combo that cannot
        // possibly be in the pricing map. Since all Provider enum variants
        // do have entries in models.json, we construct a minimal calculator
        // to test the None path.
        let calc = CostCalculator {
            pricing: HashMap::new(),
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        };
        let cost = calc.calculate(Provider::Bedrock, "no-such-model", 1000, 500);
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "missing pricing must return 0.0, not a fabricated cost; got {}",
            cost
        );
    }

    #[test]
    fn calculate_with_cache_returns_zero_for_missing_pricing() {
        let calc = CostCalculator {
            pricing: HashMap::new(),
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        };
        let cost =
            calc.calculate_with_cache(Provider::Anthropic, "no-such-model", 1000, 500, 200, 100);
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "missing pricing must return 0.0 for cached calculation; got {}",
            cost
        );
    }

    #[test]
    fn calculate_with_cache_anthropic_applies_cache_discount() {
        let calc = CostCalculator::new();
        let cost_no_cache = calc.calculate(Provider::Anthropic, "claude-opus-4-6", 1000, 500);
        // With cache: 500 cache_read tokens billed at 0.1x should be cheaper
        let cost_cached = calc.calculate_with_cache(
            Provider::Anthropic,
            "claude-opus-4-6",
            1000,
            500,
            500, // cache_read_tokens
            0,   // cache_creation_tokens
        );
        assert!(
            cost_cached < cost_no_cache,
            "cached cost ({}) must be less than non-cached ({})",
            cost_cached,
            cost_no_cache
        );
    }

    #[test]
    fn managed_cloud_looks_up_origin_provider_pricing() {
        let calc = CostCalculator::new();
        // ManagedCloud should find gpt-5.4-nano pricing via OpenAI origin
        let cost = calc.calculate(Provider::ManagedCloud, "gpt-5.4-nano", 1_000_000, 1_000_000);
        let direct_cost =
            calc.calculate(Provider::OpenAI, "gpt-5.4-nano", 1_000_000, 1_000_000);
        assert!(
            (cost - direct_cost).abs() < f64::EPSILON,
            "ManagedCloud cost ({}) must equal direct provider cost ({})",
            cost,
            direct_cost
        );
    }

    #[test]
    fn never_produces_silent_one_dollar_fallback() {
        // Regression test: verify the old (1.0, 1.0) fallback is gone.
        // With an empty calculator, 1M input + 1M output tokens should
        // return 0.0, not the old $2.00 (1.0 + 1.0).
        let calc = CostCalculator {
            pricing: HashMap::new(),
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        };
        let cost = calc.calculate(Provider::OpenAI, "any-model", 1_000_000, 1_000_000);
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "must not silently produce a cost from fabricated pricing; got {}",
            cost
        );
    }
}
