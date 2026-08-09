use std::collections::HashMap;

use chrono::NaiveDate;

use crate::core::llm::models_config::{ModelEntry, PricingWindowEntry};
use crate::core::llm::Provider;

/// Anthropic's published cache-WRITE surcharge, applied only when the catalog
/// declares no write price for an Anthropic model. Mirrors
/// `CACHE_WRITE_FALLBACK_MULTIPLIERS` in
/// `apps/web/lib/services/llm-cost-calculator.ts`; desktop, web and the gateway
/// must price the same cached token identically, and none of the three can
/// import from the others, so they change together. (An unpriced cache READ
/// needs no constant here: it is billed at the plain input rate.)
const ANTHROPIC_CACHE_WRITE_FALLBACK_MULTIPLIER: f64 = 1.25;

#[derive(Debug, Clone)]
struct Pricing {
    input_per_million: f64,
    output_per_million: f64,
    /// Absolute per-million price of a cache READ, from the catalog's
    /// `cached_input`. `None` when the model prices no cache read.
    cache_read_per_million: Option<f64>,
    /// Multiplier on the input rate when WRITING a cache entry, from
    /// `cachePolicy.writeMultiplier`.
    cache_write_multiplier: Option<f64>,
    /// Absolute per-million price of a cache WRITE, from the catalog's
    /// `cached_write`. Preferred over the multiplier; `None` when the model
    /// declares no write price (pre-GPT-5.6 OpenAI models, whose writes are
    /// free — i.e. billed once at the plain input rate and nothing more).
    cache_write_per_million: Option<f64>,
    /// Dated pricing windows from the catalog's `pricingSchedule`. Empty for
    /// the usual single-price model.
    schedule: Vec<PricingWindowEntry>,
}

impl Pricing {
    /// This model's rates on `as_of`. Returns `self` unchanged when the model
    /// has no dated schedule, so the common path allocates nothing new.
    fn as_of(&self, as_of: NaiveDate) -> Pricing {
        if self.schedule.is_empty() {
            return self.clone();
        }
        let Some(window) = self
            .schedule
            .iter()
            .find(|window| window_covers(window, as_of))
        else {
            return self.clone();
        };
        Pricing {
            input_per_million: window.input_cost.unwrap_or(self.input_per_million),
            output_per_million: window.output_cost.unwrap_or(self.output_per_million),
            cache_read_per_million: window.cached_input.or(self.cache_read_per_million),
            cache_write_multiplier: self.cache_write_multiplier,
            cache_write_per_million: window.cached_write.or(self.cache_write_per_million),
            schedule: Vec::new(),
        }
    }

    fn cost(&self, input_tokens: u32, output_tokens: u32) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input_per_million;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output_per_million;
        input_cost + output_cost
    }
}

/// Whether a dated pricing window covers `as_of`. Both bounds are inclusive and
/// optional; an unparseable bound makes the window inapplicable rather than
/// silently shifting a price.
fn window_covers(window: &PricingWindowEntry, as_of: NaiveDate) -> bool {
    let bound = |value: &Option<String>| -> Option<Option<NaiveDate>> {
        match value {
            None => Some(None),
            Some(raw) => NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok().map(Some),
        }
    };
    let (Some(from), Some(until)) = (
        bound(&window.effective_from),
        bound(&window.effective_until),
    ) else {
        return false;
    };
    from.is_none_or(|start| start <= as_of) && until.is_none_or(|end| as_of <= end)
}

/// Media type for per-unit pricing (images and video).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MediaType {
    /// Standard-quality image generation (e.g., GPT Image 2, Imagen 4)
    ImageStandard,
    /// High-quality / HD image generation (e.g., Imagen 4 Ultra, GPT Image 2)
    ImageHD,
    /// Video generation priced per second (e.g., Runway, Veo 3)
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

/// Catalog entry -> pricing record, carrying the model's dated schedule so the
/// per-request date can select the window that applies.
fn catalog_pricing(model: &ModelEntry) -> Pricing {
    Pricing {
        input_per_million: model.input_cost,
        output_per_million: model.output_cost,
        cache_read_per_million: model.cached_input,
        cache_write_multiplier: model
            .cache_policy
            .as_ref()
            .and_then(|policy| policy.write_multiplier),
        cache_write_per_million: model.cached_write,
        schedule: model.pricing_schedule.clone(),
    }
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
                pricing.insert((provider, model_id.clone()), catalog_pricing(model));
                // If the model has an apiModelId different from id, also register
                // under the API model ID so cost lookups work after canonicalization.
                if let Some(api_id) = &model.api_model_id {
                    if api_id != model_id {
                        pricing.insert((provider, api_id.clone()), catalog_pricing(model));
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
                        // Provider defaults price no cache tier; the caller falls
                        // back to the full input rate rather than inventing one.
                        cache_read_per_million: provider_cfg.default_pricing.cache_read_per_million,
                        cache_write_multiplier: provider_cfg.default_pricing.cache_write_multiplier,
                        cache_write_per_million: provider_cfg
                            .default_pricing
                            .cache_write_per_million,
                        schedule: Vec::new(),
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
    /// ManagedCloud routes to models like `gpt-5.6-luna` (OpenAI), `deepseek-v4-flash`
    /// (DeepSeek), current Gemini models, etc. -- instead of duplicating every
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

    fn model_pricing(&self, provider: Provider, model: &str) -> Option<&Pricing> {
        self.pricing
            .get(&(provider, model.to_string()))
            .or_else(|| {
                if provider == Provider::ManagedCloud {
                    Self::MANAGED_CLOUD_ORIGIN_PROVIDERS
                        .iter()
                        .find_map(|&p| self.pricing.get(&(p, model.to_string())))
                } else {
                    None
                }
            })
    }

    /// Calculate cost for a request priced on `as_of`.
    ///
    /// `as_of` is an explicit parameter and no clock is read here: a model may
    /// carry dated `pricingSchedule` windows (UTC calendar days, both bounds
    /// inclusive), so the rate that applies is a function of the request's date.
    /// No shipped model schedules a price today; the mechanism exists for an
    /// announced PRODUCT price change. Callers pass the current date at their
    /// own boundary, which also keeps this deterministic and testable on both
    /// sides of a price change.
    pub fn calculate(
        &self,
        provider: Provider,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        as_of: NaiveDate,
    ) -> f64 {
        if input_tokens == 0 && output_tokens == 0 {
            return 0.0;
        }

        // Prefer exact catalog SKU pricing before alias canonicalization. Routing may
        // intentionally forward deprecated model IDs to current models, but cost
        // reporting must preserve exact pricing when the requested SKU still exists.
        let exact_model = model;
        let canonical = super::models_config::get_canonicalized_id(model);

        let pricing = self
            .model_pricing(provider, exact_model)
            .or_else(|| {
                if canonical == exact_model {
                    None
                } else {
                    self.model_pricing(provider, canonical.as_str())
                }
            })
            .or_else(|| self.provider_defaults.get(&provider))
            .map(|pricing| pricing.as_of(as_of));

        match pricing {
            Some(p) => p.cost(input_tokens, output_tokens),
            None => {
                tracing::warn!(
                    model = %canonical,
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

    /// Calculate cost with cache pricing applied, priced on `as_of`.
    ///
    /// Rates are read from the model catalog (`cached_input`, `cached_write`,
    /// and `cachePolicy.writeMultiplier`), NOT from hardcoded multipliers —
    /// those drifted from the real prices and overcharged managed-cloud cache
    /// reads. When a model prices no cache read, the full input rate is used.
    /// See [`CostCalculator::calculate`] for why `as_of` is explicit.
    #[allow(clippy::too_many_arguments)]
    pub fn calculate_with_cache(
        &self,
        provider: Provider,
        model: &str,
        prompt_tokens: u32,
        completion_tokens: u32,
        cache_read_tokens: u32,
        cache_creation_tokens: u32,
        as_of: NaiveDate,
    ) -> f64 {
        if prompt_tokens == 0 && completion_tokens == 0 {
            return 0.0;
        }

        let exact_model = model;
        let canonical = super::models_config::get_canonicalized_id(model);

        let pricing = self
            .model_pricing(provider, exact_model)
            .or_else(|| {
                if canonical == exact_model {
                    None
                } else {
                    self.model_pricing(provider, canonical.as_str())
                }
            })
            .or_else(|| self.provider_defaults.get(&provider))
            .map(|pricing| pricing.as_of(as_of));

        let pricing = match pricing {
            Some(p) => p,
            None => {
                tracing::warn!(
                    model = %canonical,
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

        // Cache rates come from the CATALOG, not from a hardcoded multiplier.
        // This previously assumed 0.1x for Anthropic and 0.5x for OpenAI/Managed
        // Cloud. The catalog prices a cache read at 0.1x input for both
        // gpt-5.6-sol (5 -> 0.5) and gpt-5.6-luna (1 -> 0.1), so managed-cloud
        // cache reads were being costed at five times their real price. Falling
        // back to the full input rate when the catalog prices no cache read is
        // deliberate: over-costing a cached token is recoverable, inventing a
        // discount the provider does not give is not. This branch keys on the
        // ABSENCE of a catalog cache-read price, not on any caching capability
        // flag, so it covers every unpriced model — `minimax-m3` (caching
        // declared, no read price) and `grok-4.5` (no read price, caching not
        // declared) alike. The web tracker and the gateway now fall back the
        // same way, so all three bill that request identically.
        let cache_read_rate = pricing
            .cache_read_per_million
            .map(|per_million| per_million / 1_000_000.0)
            .unwrap_or(input_rate);
        // Cache-WRITE rate, in preference order: the catalog's published
        // absolute price (`cached_write`), then a declared multiplier on the
        // input rate, then a provider-shaped fallback. Anthropic bills a written
        // token ONLY as a write (its cache counters are disjoint from input), so
        // an undeclared price there falls back to the published surcharge rather
        // than to a free write. Everywhere else the written token stays inside
        // the prompt and the input rate means "billed once, no surcharge" —
        // the free-cache-write case every pre-GPT-5.6 OpenAI model is in. The
        // GPT-5.6 family DOES publish a write price (1.25x uncached input on
        // both automatic and explicit breakpoints), so it is billed for writes.
        let cache_write_rate = pricing
            .cache_write_per_million
            .map(|per_million| per_million / 1_000_000.0)
            .or_else(|| {
                pricing
                    .cache_write_multiplier
                    .map(|multiplier| input_rate * multiplier)
            })
            .unwrap_or_else(|| match provider {
                Provider::Anthropic => input_rate * ANTHROPIC_CACHE_WRITE_FALLBACK_MULTIPLIER,
                _ => input_rate,
            });

        match provider {
            Provider::Anthropic => {
                let regular_input =
                    prompt_tokens.saturating_sub(cache_read_tokens + cache_creation_tokens);
                let input_cost = (regular_input as f64 * input_rate)
                    + (cache_creation_tokens as f64 * cache_write_rate)
                    + (cache_read_tokens as f64 * cache_read_rate);
                let output_cost = completion_tokens as f64 * output_rate;
                input_cost + output_cost
            }
            Provider::OpenAI | Provider::ManagedCloud => {
                // OpenAI reports prompt_tokens INCLUSIVE of the cache buckets:
                // cache reads are a SUBSET of the prompt (so they are subtracted
                // and re-billed at the read rate), and written tokens are
                // freshly-sent uncached input that stays inside `regular_input`.
                // A cache WRITE is therefore billed as its input token plus the
                // SURCHARGE over the input rate — for the GPT-5.6 family that
                // totals the published 1.25x. A model that declares no write
                // price has a write rate equal to the input rate, so the
                // surcharge is exactly zero and its writes stay free.
                let regular_input = prompt_tokens.saturating_sub(cache_read_tokens);
                let cache_write_surcharge = (cache_write_rate - input_rate).max(0.0);
                let input_cost = (regular_input as f64 * input_rate)
                    + (cache_creation_tokens as f64 * cache_write_surcharge)
                    + (cache_read_tokens as f64 * cache_read_rate);
                let output_cost = completion_tokens as f64 * output_rate;
                input_cost + output_cost
            }
            _ => self.calculate(
                provider,
                exact_model,
                prompt_tokens,
                completion_tokens,
                as_of,
            ),
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
                tracing::warn!(
                    provider = ?provider,
                    media_type = ?media_type,
                    units,
                    "no media pricing found for provider/media type; returning 0.0 cost"
                );
                0.0
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fixed pricing dates. Cost calculation takes the request date explicitly,
    /// so every test pins one instead of reading the clock rather than because
    /// any shipped model changes price on these days.
    fn standard_window_date() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 1).expect("2026-09-01 is a valid date")
    }

    fn day(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).expect("valid calendar date")
    }

    /// SYNTHETIC model with a dated schedule, registered under an id no catalog
    /// model uses. The dated-pricing MECHANISM is proved against this fixture so
    /// it stays covered without a live promotional window to lean on, and so no
    /// shipped product price is reachable by editing a mechanism test. Window
    /// bounds are UTC calendar days, inclusive on both sides.
    const FIXTURE_MODEL: &str = "fixture-scheduled-model";

    /// SYNTHETIC model that prices neither side of caching — the state
    /// `grok-4.5` (tier-allowed, cached tokens reported) and `minimax-m3` are
    /// both in today. Registered under two providers so
    /// the same unpriced entry can be billed with disjoint (Anthropic) and
    /// subset (managed cloud) token accounting.
    const UNPRICED_CACHE_MODEL: &str = "fixture-unpriced-cache-model";

    fn unpriced_cache_calculator() -> CostCalculator {
        let pricing = Pricing {
            input_per_million: 0.3,
            output_per_million: 1.2,
            cache_read_per_million: None,
            cache_write_multiplier: None,
            cache_write_per_million: None,
            schedule: Vec::new(),
        };
        let mut map = HashMap::new();
        map.insert(
            (Provider::ManagedCloud, UNPRICED_CACHE_MODEL.to_string()),
            pricing.clone(),
        );
        map.insert(
            (Provider::Anthropic, UNPRICED_CACHE_MODEL.to_string()),
            pricing,
        );
        CostCalculator {
            pricing: map,
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        }
    }

    fn scheduled_fixture_calculator() -> CostCalculator {
        let pricing = Pricing {
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: Some(0.3),
            cache_write_multiplier: None,
            cache_write_per_million: Some(3.75),
            schedule: vec![
                PricingWindowEntry {
                    effective_from: None,
                    effective_until: Some("2030-03-31".to_string()),
                    note: None,
                    input_cost: Some(2.0),
                    output_cost: Some(10.0),
                    cached_input: Some(0.2),
                    cached_write: Some(2.5),
                    cached_write_1h: Some(4.0),
                },
                // Declares only its start, so every rate falls back to the
                // top-level (enduring) fields.
                PricingWindowEntry {
                    effective_from: Some("2030-04-01".to_string()),
                    effective_until: None,
                    note: None,
                    input_cost: None,
                    output_cost: None,
                    cached_input: None,
                    cached_write: None,
                    cached_write_1h: None,
                },
            ],
        };
        let mut map = HashMap::new();
        map.insert((Provider::Anthropic, FIXTURE_MODEL.to_string()), pricing);
        CostCalculator {
            pricing: map,
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        }
    }

    #[test]
    fn calculate_returns_positive_for_known_model() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(
            Provider::Anthropic,
            "claude-opus-5",
            1000,
            500,
            standard_window_date(),
        );
        assert!(
            cost > 0.0,
            "known model cost must be positive, got {}",
            cost
        );
    }

    #[test]
    fn calculate_returns_zero_for_zero_tokens() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(
            Provider::OpenAI,
            "gpt-5.6-luna",
            0,
            0,
            standard_window_date(),
        );
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
            standard_window_date(),
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
        let cost = calc.calculate(
            Provider::Bedrock,
            "no-such-model",
            1000,
            500,
            standard_window_date(),
        );
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
        let cost = calc.calculate_with_cache(
            Provider::Anthropic,
            "no-such-model",
            1000,
            500,
            200,
            100,
            standard_window_date(),
        );
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "missing pricing must return 0.0 for cached calculation; got {}",
            cost
        );
    }

    #[test]
    fn calculate_with_cache_anthropic_applies_cache_discount() {
        let calc = CostCalculator::new();
        let cost_no_cache = calc.calculate(
            Provider::Anthropic,
            "claude-opus-5",
            1000,
            500,
            standard_window_date(),
        );
        // With cache: 500 cache_read tokens billed at 0.1x should be cheaper
        let cost_cached = calc.calculate_with_cache(
            Provider::Anthropic,
            "claude-opus-5",
            1000,
            500,
            500, // cache_read_tokens
            0,   // cache_creation_tokens
            standard_window_date(),
        );
        assert!(
            cost_cached < cost_no_cache,
            "cached cost ({}) must be less than non-cached ({})",
            cost_cached,
            cost_no_cache
        );
    }

    #[test]
    fn cache_read_rate_comes_from_the_catalog_not_a_hardcoded_multiplier() {
        // Regression pin. This path used to hardcode 0.5x the input rate for
        // OpenAI and ManagedCloud, while models.json prices gpt-5.6-luna at
        // inputCost 0.2 and cached_input 0.02 — i.e. 0.1x. Managed-cloud cache
        // reads were therefore costed at FIVE TIMES their real price. Asserting
        // the exact catalog-derived figure makes reinstating any fixed
        // multiplier fail.
        let calc = CostCalculator::new();

        // 1M cache-read tokens, nothing else, so the result IS the cache-read rate.
        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            "gpt-5.6-luna",
            1_000_000, // prompt_tokens, all of which are cache reads
            0,         // completion_tokens
            1_000_000, // cache_read_tokens
            0,         // cache_creation_tokens
            standard_window_date(),
        );

        // catalog: cached_input = 0.02 per million (post-2026-07-30 price cut).
        let expected = 0.02_f64;
        assert!(
            (cost - expected).abs() < 1e-9,
            "cache-read cost {} should equal the catalog cached_input {} — a hardcoded \
             0.5x multiplier would give {}",
            cost,
            expected,
            0.1
        );
    }

    #[test]
    fn cache_read_falls_back_to_full_input_rate_when_the_catalog_prices_none() {
        // Convergence pin against apps/web: a model that declares caching with
        // no cached_input is billed at the FULL input rate on every surface.
        // The web tracker used to take 90% off here, so the same managed-cloud
        // request cost $0.03/M in the browser and $0.30/M on the desktop.
        let calc = unpriced_cache_calculator();

        // 1M cache-read tokens, nothing else, so the result IS the cache-read rate.
        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            UNPRICED_CACHE_MODEL,
            1_000_000, // prompt_tokens, all of which are cache reads
            0,         // completion_tokens
            1_000_000, // cache_read_tokens
            0,         // cache_creation_tokens
            standard_window_date(),
        );

        assert!(
            (cost - 0.3).abs() < 1e-9,
            "unpriced cache read must bill the full $0.30/M input rate, got {}",
            cost
        );
    }

    #[test]
    fn anthropic_cache_write_falls_back_to_the_published_surcharge() {
        // Anthropic reports cache writes disjoint from input, so a written
        // token is billed ONLY here — falling back to the plain input rate
        // would drop the published 25% surcharge that apps/web and the gateway
        // both charge.
        let calc = unpriced_cache_calculator();

        let cost = calc.calculate_with_cache(
            Provider::Anthropic,
            UNPRICED_CACHE_MODEL,
            1_000_000, // prompt_tokens, every one of them written to the cache
            0,         // completion_tokens
            0,         // cache_read_tokens
            1_000_000, // cache_creation_tokens
            standard_window_date(),
        );

        assert!(
            (cost - 0.375).abs() < 1e-9,
            "unpriced Anthropic cache write must bill 1.25x the $0.30/M input rate, got {}",
            cost
        );
    }

    #[test]
    fn managed_cloud_looks_up_origin_provider_pricing() {
        let calc = CostCalculator::new();
        // ManagedCloud should find gpt-5.6-luna pricing via OpenAI origin
        let cost = calc.calculate(
            Provider::ManagedCloud,
            "gpt-5.6-luna",
            1_000_000,
            1_000_000,
            standard_window_date(),
        );
        let direct_cost = calc.calculate(
            Provider::OpenAI,
            "gpt-5.6-luna",
            1_000_000,
            1_000_000,
            standard_window_date(),
        );
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
        let cost = calc.calculate(
            Provider::OpenAI,
            "any-model",
            1_000_000,
            1_000_000,
            standard_window_date(),
        );
        assert!(
            (cost - 0.0).abs() < f64::EPSILON,
            "must not silently produce a cost from fabricated pricing; got {}",
            cost
        );
    }

    // ------------------------------------------------------------------
    // Effective-dated pricing
    // ------------------------------------------------------------------

    #[test]
    fn dated_pricing_bills_the_window_that_covers_the_request_date() {
        // Synthetic fixture: $2/M input and $10/M output through 2030-03-31,
        // then the top-level $3/M and $15/M. 1M + 1M = $12.00 inside the first
        // window, $18.00 after it.
        let calc = scheduled_fixture_calculator();
        let first = calc.calculate(
            Provider::Anthropic,
            FIXTURE_MODEL,
            1_000_000,
            1_000_000,
            day(2030, 2, 15),
        );
        let second = calc.calculate(
            Provider::Anthropic,
            FIXTURE_MODEL,
            1_000_000,
            1_000_000,
            day(2030, 4, 1),
        );
        assert!(
            (first - 12.0).abs() < 1e-9,
            "the first window must bill $12.00 for 1M+1M, got ${}",
            first
        );
        assert!(
            (second - 18.0).abs() < 1e-9,
            "the second window must fall back to the top-level $18.00, got ${}",
            second
        );
    }

    #[test]
    fn dated_pricing_switches_exactly_at_the_window_boundary() {
        // The last day of the first window and the first day of the next, so an
        // off-by-one in either inclusive bound fails here.
        let calc = scheduled_fixture_calculator();
        let last_day_of_first = calc.calculate(
            Provider::Anthropic,
            FIXTURE_MODEL,
            1_000_000,
            0,
            day(2030, 3, 31),
        );
        let first_day_of_second = calc.calculate(
            Provider::Anthropic,
            FIXTURE_MODEL,
            1_000_000,
            0,
            day(2030, 4, 1),
        );
        assert!(
            (last_day_of_first - 2.0).abs() < 1e-9,
            "2030-03-31 is still inside the first window ($2/M), got ${}",
            last_day_of_first
        );
        assert!(
            (first_day_of_second - 3.0).abs() < 1e-9,
            "2030-04-01 starts the second window ($3/M), got ${}",
            first_day_of_second
        );
    }

    #[test]
    fn dated_pricing_covers_every_cache_rate_not_just_input_and_output() {
        // The first window prices cache reads at $0.2/M and 5m cache writes at
        // $2.5/M; the second inherits $0.3/M and $3.75/M from the top-level
        // fields. Anthropic reports cache tokens separately, so 1M of each
        // isolates the two cache rates.
        let calc = scheduled_fixture_calculator();
        let first = calc.calculate_with_cache(
            Provider::Anthropic,
            FIXTURE_MODEL,
            2_000_000, // prompt tokens, all of them cache reads/writes
            0,
            1_000_000, // cache_read_tokens
            1_000_000, // cache_creation_tokens
            day(2030, 2, 15),
        );
        let second = calc.calculate_with_cache(
            Provider::Anthropic,
            FIXTURE_MODEL,
            2_000_000,
            0,
            1_000_000,
            1_000_000,
            day(2030, 4, 1),
        );
        assert!(
            (first - 2.7).abs() < 1e-9,
            "the first window's cache rates must bill $0.20 + $2.50 = $2.70, got ${}",
            first
        );
        assert!(
            (second - 4.05).abs() < 1e-9,
            "the inherited cache rates must bill $0.30 + $3.75 = $4.05, got ${}",
            second
        );
    }

    #[test]
    fn sonnet_5_bills_the_founder_standard_rate_on_every_date() {
        // Founder pin — Decision #22 (docs/decisions/CURRENT_DECISIONS.md,
        // reaffirmed 2026-08-05): Sonnet 5 bills users the standard $3/$15 per
        // MTok (cache read $0.30, 5m write $3.75) on EVERY date. Anthropic's
        // introductory window is a provider-COST fact for the registry's
        // verificationLog, never a product price. Fixed dates on both sides of
        // that retired 2026-09-01 boundary.
        let calc = CostCalculator::new();
        for date in [day(2020, 1, 1), day(2026, 8, 15), day(2026, 9, 15)] {
            let cost = calc.calculate(
                Provider::Anthropic,
                "claude-sonnet-5",
                1_000_000,
                1_000_000,
                date,
            );
            assert!(
                (cost - 18.0).abs() < 1e-9,
                "Sonnet 5 must bill the standard $18.00 for 1M+1M on {}, got ${}",
                date,
                cost
            );

            let cached = calc.calculate_with_cache(
                Provider::Anthropic,
                "claude-sonnet-5",
                2_000_000,
                0,
                1_000_000, // cache_read_tokens  @ $0.30/M
                1_000_000, // cache_creation_tokens @ $3.75/M
                date,
            );
            assert!(
                (cached - 4.05).abs() < 1e-9,
                "Sonnet 5 cache rates must bill $0.30 + $3.75 = $4.05 on {}, got ${}",
                date,
                cached
            );
        }
    }

    #[test]
    fn a_model_without_a_schedule_prices_the_same_on_any_date() {
        // Scheduleless models must be date-invariant, which is what keeps every
        // other test in this file independent of the calendar.
        let calc = CostCalculator::new();
        let early = calc.calculate(
            Provider::Anthropic,
            "claude-opus-5",
            1_000_000,
            1_000_000,
            NaiveDate::from_ymd_opt(2020, 1, 1).expect("valid date"),
        );
        let late = calc.calculate(
            Provider::Anthropic,
            "claude-opus-5",
            1_000_000,
            1_000_000,
            NaiveDate::from_ymd_opt(2099, 12, 31).expect("valid date"),
        );
        assert!(
            (early - late).abs() < f64::EPSILON,
            "a model with no pricing schedule must not move with the date: {} vs {}",
            early,
            late
        );
    }

    // ------------------------------------------------------------------
    // Cache-write billing
    // ------------------------------------------------------------------

    #[test]
    fn openai_bills_cache_writes_for_models_that_declare_a_write_price() {
        // OpenAI started charging for prompt-cache WRITES with the GPT-5.6
        // family: 1.25x the uncached input rate. gpt-5.6-sol is $5/M input and
        // declares cached_write $6.25/M. prompt_tokens are INCLUSIVE, so 1M
        // prompt tokens that are all cache writes cost 1M * $6.25/M = $6.25 —
        // the plain input charge plus the 0.25x write surcharge. Before this
        // was wired, cache_creation_tokens were ignored entirely and the same
        // request billed only $5.00.
        let calc = CostCalculator::new();
        let cost = calc.calculate_with_cache(
            Provider::OpenAI,
            "gpt-5.6-sol",
            1_000_000, // prompt_tokens
            0,         // completion_tokens
            0,         // cache_read_tokens
            1_000_000, // cache_creation_tokens
            standard_window_date(),
        );
        assert!(
            (cost - 6.25).abs() < 1e-9,
            "1M GPT-5.6 Sol cache-write tokens must bill the catalog $6.25/M, got ${}",
            cost
        );
    }

    #[test]
    fn managed_cloud_bills_gpt_5_6_cache_writes_through_the_origin_provider() {
        // gpt-5.6-luna: $0.2/M input, cached_write $0.25/M. Managed Cloud proxies
        // the origin provider's pricing, so the write surcharge must survive the
        // origin lookup.
        let calc = CostCalculator::new();
        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            "gpt-5.6-luna",
            1_000_000,
            0,
            0,
            1_000_000,
            standard_window_date(),
        );
        assert!(
            (cost - 0.25).abs() < 1e-9,
            "1M GPT-5.6 Luna cache-write tokens must bill the catalog $0.25/M, got ${}",
            cost
        );
    }

    #[test]
    fn pre_gpt_5_6_openai_models_keep_free_cache_writes() {
        // gpt-5.4-mini predates the GPT-5.6 write-billing change and declares no
        // cached_write, so a written token bills exactly once at the $0.75/M
        // input rate — identical to the same request with no cache activity.
        // This is the pin that stops a blanket 1.25x surcharge being reinstated.
        let calc = CostCalculator::new();
        let with_writes = calc.calculate_with_cache(
            Provider::OpenAI,
            "gpt-5.4-mini",
            1_000_000,
            0,
            0,
            1_000_000, // cache_creation_tokens
            standard_window_date(),
        );
        let without_writes = calc.calculate(
            Provider::OpenAI,
            "gpt-5.4-mini",
            1_000_000,
            0,
            standard_window_date(),
        );
        assert!(
            (with_writes - 0.75).abs() < 1e-9,
            "a free cache write must bill the plain input rate ($0.75), got ${}",
            with_writes
        );
        assert!(
            (with_writes - without_writes).abs() < f64::EPSILON,
            "an undeclared write price must add nothing: ${} vs ${}",
            with_writes,
            without_writes
        );
    }

    #[test]
    fn openai_cache_reads_and_writes_bill_each_prompt_token_exactly_once() {
        // gpt-5.6-terra: $2/M input, cached_input $0.2/M, cached_write $2.5/M.
        // A 1M prompt made of 400k cache reads + 200k cache writes + 400k plain
        // input bills 400k*$2 + 200k*$2.5 + 400k*$0.2 = $0.8 + $0.5 + $0.08.
        let calc = CostCalculator::new();
        let cost = calc.calculate_with_cache(
            Provider::OpenAI,
            "gpt-5.6-terra",
            1_000_000,
            0,
            400_000,
            200_000,
            standard_window_date(),
        );
        assert!(
            (cost - 1.38).abs() < 1e-9,
            "mixed OpenAI prompt must bill $1.38, got ${}",
            cost
        );
    }

    #[test]
    fn anthropic_cache_writes_use_the_catalog_price_not_the_input_rate() {
        // Regression pin. This is a SOURCE change, not a price change: Anthropic
        // writes used to be billed as a hardcoded 1.25x multiplier on the input
        // rate and are now billed from the catalog's absolute `cached_write`.
        // For every Anthropic model whose cached_write equals 1.25x input —
        // claude-opus-5 is $5/M input with cached_write $6.25/M — that is
        // behavior-neutral. The pin exists so the rate stays catalog-driven: if
        // a future Anthropic model prices writes at anything other than 1.25x,
        // the published number must win over the old multiplier.
        let calc = CostCalculator::new();
        let cost = calc.calculate_with_cache(
            Provider::Anthropic,
            "claude-opus-5",
            0, // Anthropic reports cache tokens separately from input_tokens
            1, // keep the request non-empty
            0,
            1_000_000,
            standard_window_date(),
        );
        let output_rate = 25.0 / 1_000_000.0;
        assert!(
            (cost - (6.25 + output_rate)).abs() < 1e-9,
            "1M Opus 5 cache-write tokens must bill the catalog $6.25/M, got ${}",
            cost
        );
    }
}
