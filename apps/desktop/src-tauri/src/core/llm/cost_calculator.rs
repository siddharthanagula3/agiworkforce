use std::collections::HashMap;

use chrono::NaiveDate;

use crate::core::llm::models_config::{LongContextPricing, ModelEntry, PricingWindowEntry};
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
    /// declares no write price (for inclusive prompt accounting, an unpriced
    /// write is billed once at the plain input rate and nothing more).
    cache_write_per_million: Option<f64>,
    /// Dated pricing windows from the catalog's `pricingSchedule`. Empty for
    /// the usual single-price model.
    schedule: Vec<PricingWindowEntry>,
    /// Ordered request-wide token-pricing bands from the catalog. The greatest
    /// threshold strictly below a request wins.
    input_token_pricing_tiers: Vec<LongContextPricing>,
    /// Whether cache read/write counters are additional to `prompt_tokens`.
    /// This is derived from the catalog model's origin provider so a model
    /// proxied through Managed Cloud preserves its provider accounting shape.
    cache_tokens_disjoint_from_input: bool,
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
            input_token_pricing_tiers: self.input_token_pricing_tiers.clone(),
            cache_tokens_disjoint_from_input: self.cache_tokens_disjoint_from_input,
        }
    }

    /// Resolve date pricing, then apply a strict long-context threshold to the
    /// whole request. Exactly the threshold remains base-priced.
    fn for_request(&self, as_of: NaiveDate, input_tokens: u64) -> Pricing {
        let mut pricing = self.as_of(as_of);
        let Some(tier) = pricing
            .input_token_pricing_tiers
            .iter()
            .filter(|tier| input_tokens > tier.threshold_tokens)
            .max_by_key(|tier| tier.threshold_tokens)
            .cloned()
        else {
            return pricing;
        };

        pricing.input_per_million = tier.input_cost;
        pricing.output_per_million = tier.output_cost;
        pricing.cache_read_per_million = tier.cached_input.or(pricing.cache_read_per_million);
        pricing.cache_write_per_million = tier.cached_write.or(pricing.cache_write_per_million);
        pricing.input_token_pricing_tiers.clear();
        pricing
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
    /// Standard-quality image generation through a catalog-selected image model.
    ImageStandard,
    /// High-quality / HD image generation through a catalog-selected image model.
    ImageHD,
    /// Video generation priced per second through a catalog-selected provider.
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
    let input_token_pricing_tiers = if model.input_token_pricing_tiers.is_empty() {
        model.long_context.iter().cloned().collect()
    } else {
        model.input_token_pricing_tiers.clone()
    };
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
        input_token_pricing_tiers,
        cache_tokens_disjoint_from_input: Provider::from_string(&model.provider)
            == Some(Provider::Anthropic),
    }
}

#[derive(Clone)]
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
                        input_token_pricing_tiers: Vec::new(),
                        cache_tokens_disjoint_from_input: provider == Provider::Anthropic,
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
        // Google catalog-selected image generation
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
        // Google catalog-selected video generation (~$0.08 per second)
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
    /// ManagedCloud routes to catalog models owned by several origin providers.
    /// Instead of duplicating every pricing entry, look the model up under its
    /// original provider.
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
            .map(|pricing| pricing.for_request(as_of, u64::from(input_tokens)));

        match pricing {
            Some(p) => p.cost(input_tokens, output_tokens),
            None => {
                tracing::warn!(
                    model = %canonical,
                    provider = ?provider,
                    input_tokens,
                    output_tokens,
                    "no pricing found for model or provider; returning 0.0 cost, \
                     add model pricing to models.json to enable accurate cost tracking"
                );
                0.0
            }
        }
    }

    /// Calculate cost with cache pricing applied, priced on `as_of`.
    ///
    /// Rates are read from the model catalog (`cached_input`, `cached_write`,
    /// and `cachePolicy.writeMultiplier`), NOT from hardcoded multipliers.
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
        if prompt_tokens == 0
            && completion_tokens == 0
            && cache_read_tokens == 0
            && cache_creation_tokens == 0
        {
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
            .or_else(|| self.provider_defaults.get(&provider));

        let base_pricing = match pricing {
            Some(p) => p,
            None => {
                tracing::warn!(
                    model = %canonical,
                    provider = ?provider,
                    prompt_tokens,
                    completion_tokens,
                    cache_read_tokens,
                    cache_creation_tokens,
                    "no pricing found for model or provider; returning 0.0 cost, \
                     add model pricing to models.json to enable accurate cost tracking"
                );
                return 0.0;
            }
        };

        // Token-pricing thresholds apply to the complete request input. For
        // disjoint accounting, cache buckets are additional to prompt tokens;
        // for inclusive accounting, they are already subsets of the prompt.
        let tier_input_tokens = if base_pricing.cache_tokens_disjoint_from_input {
            u64::from(prompt_tokens)
                .saturating_add(u64::from(cache_read_tokens))
                .saturating_add(u64::from(cache_creation_tokens))
        } else {
            u64::from(prompt_tokens)
        };
        let pricing = base_pricing.for_request(as_of, tier_input_tokens);

        let input_rate = pricing.input_per_million / 1_000_000.0;
        let output_rate = pricing.output_per_million / 1_000_000.0;

        // Cache rates come from the CATALOG, not from a hardcoded multiplier.
        // Earlier code assumed provider-wide cache multipliers. Catalog rates
        // differ by model, so that could overcharge a managed-cloud request.
        // Falling back to the full input rate when the catalog prices no cache
        // read is deliberate: over-costing a cached token is recoverable,
        // inventing a discount the provider does not give is not. This branch
        // keys on the ABSENCE of a catalog cache-read price, not a provider or
        // model name. The web tracker and gateway use the same rule.
        let cache_read_rate = pricing
            .cache_read_per_million
            .map(|per_million| per_million / 1_000_000.0)
            .unwrap_or(input_rate);
        // Cache-WRITE rate, in preference order: the catalog's published
        // absolute price (`cached_write`), then a declared multiplier on the
        // input rate, then an accounting-shape fallback. A disjoint cache write
        // exists outside prompt tokens and therefore needs the published
        // surcharge fallback. An inclusive write is removed from ordinary
        // prompt input below and re-billed at this absolute rate, so an
        // undeclared rate falls back to the input rate exactly once.
        let cache_write_rate = pricing
            .cache_write_per_million
            .map(|per_million| per_million / 1_000_000.0)
            .or_else(|| {
                pricing
                    .cache_write_multiplier
                    .map(|multiplier| input_rate * multiplier)
            })
            .unwrap_or_else(|| {
                if pricing.cache_tokens_disjoint_from_input {
                    input_rate * ANTHROPIC_CACHE_WRITE_FALLBACK_MULTIPLIER
                } else {
                    input_rate
                }
            });

        let ordinary_input = if pricing.cache_tokens_disjoint_from_input {
            prompt_tokens
        } else {
            prompt_tokens
                .saturating_sub(cache_read_tokens)
                .saturating_sub(cache_creation_tokens)
        };
        let input_cost = (ordinary_input as f64 * input_rate)
            + (cache_creation_tokens as f64 * cache_write_rate)
            + (cache_read_tokens as f64 * cache_read_rate);
        let output_cost = completion_tokens as f64 * output_rate;
        input_cost + output_cost
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

    /// SYNTHETIC model that prices neither side of caching. Registered under
    /// two accounting shapes so the same unpriced entry can be billed with
    /// disjoint and inclusive cache counters.
    const UNPRICED_CACHE_MODEL: &str = "fixture-unpriced-cache-model";

    fn unpriced_cache_calculator() -> CostCalculator {
        let inclusive_pricing = Pricing {
            input_per_million: 0.3,
            output_per_million: 1.2,
            cache_read_per_million: None,
            cache_write_multiplier: None,
            cache_write_per_million: None,
            schedule: Vec::new(),
            input_token_pricing_tiers: Vec::new(),
            cache_tokens_disjoint_from_input: false,
        };
        let mut disjoint_pricing = inclusive_pricing.clone();
        disjoint_pricing.cache_tokens_disjoint_from_input = true;
        let mut map = HashMap::new();
        map.insert(
            (Provider::ManagedCloud, UNPRICED_CACHE_MODEL.to_string()),
            inclusive_pricing,
        );
        map.insert(
            (Provider::Anthropic, UNPRICED_CACHE_MODEL.to_string()),
            disjoint_pricing,
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
            input_token_pricing_tiers: Vec::new(),
            cache_tokens_disjoint_from_input: true,
        };
        let mut map = HashMap::new();
        map.insert((Provider::Anthropic, FIXTURE_MODEL.to_string()), pricing);
        CostCalculator {
            pricing: map,
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        }
    }

    fn tiered_fixture_calculator() -> CostCalculator {
        let pricing = Pricing {
            input_per_million: 1.0,
            output_per_million: 10.0,
            cache_read_per_million: Some(0.1),
            cache_write_multiplier: None,
            cache_write_per_million: Some(1.25),
            schedule: Vec::new(),
            input_token_pricing_tiers: vec![
                LongContextPricing {
                    threshold_tokens: 128,
                    input_cost: 2.0,
                    output_cost: 20.0,
                    cached_input: Some(0.2),
                    cached_write: Some(2.5),
                    cached_write_1h: None,
                },
                LongContextPricing {
                    threshold_tokens: 256,
                    input_cost: 4.0,
                    output_cost: 40.0,
                    cached_input: Some(0.4),
                    cached_write: Some(5.0),
                    cached_write_1h: None,
                },
            ],
            cache_tokens_disjoint_from_input: true,
        };
        let mut map = HashMap::new();
        map.insert(
            (Provider::Anthropic, "fixture-tiered-model".to_string()),
            pricing,
        );
        CostCalculator {
            pricing: map,
            provider_defaults: HashMap::new(),
            media_pricing: HashMap::new(),
        }
    }

    #[test]
    fn ordered_token_pricing_tiers_use_strict_greatest_threshold_boundaries() {
        let calc = tiered_fixture_calculator();
        let cost = |input_tokens| {
            calc.calculate(
                Provider::Anthropic,
                "fixture-tiered-model",
                input_tokens,
                0,
                standard_window_date(),
            )
        };
        let expected = |tokens: u32, rate: f64| f64::from(tokens) / 1_000_000.0 * rate;

        assert!((cost(128) - expected(128, 1.0)).abs() < 1e-12);
        assert!((cost(129) - expected(129, 2.0)).abs() < 1e-12);
        assert!((cost(256) - expected(256, 2.0)).abs() < 1e-12);
        assert!((cost(257) - expected(257, 4.0)).abs() < 1e-12);
    }

    #[test]
    fn disjoint_cache_tokens_participate_in_token_pricing_thresholds() {
        let calc = tiered_fixture_calculator();
        let cost = |cache_read_tokens| {
            calc.calculate_with_cache(
                Provider::Anthropic,
                "fixture-tiered-model",
                100,
                0,
                cache_read_tokens,
                0,
                standard_window_date(),
            )
        };

        let at_threshold = (100.0 * 1.0 + 28.0 * 0.1) / 1_000_000.0;
        let above_threshold = (100.0 * 2.0 + 29.0 * 0.2) / 1_000_000.0;
        assert!((cost(28) - at_threshold).abs() < 1e-12);
        assert!((cost(29) - above_threshold).abs() < 1e-12);
    }

    fn catalog_token_pricing_model(
        provider: Option<Provider>,
    ) -> (&'static ModelEntry, &'static LongContextPricing, Provider) {
        let model = super::super::models_config::config()
            .models
            .values()
            .find(|entry| {
                (!entry.input_token_pricing_tiers.is_empty() || entry.long_context.is_some())
                    && provider.is_none_or(|expected| entry.provider == expected.as_string())
            })
            .expect("catalog must contain a request-tier-priced model");
        let tier = if model.input_token_pricing_tiers.is_empty() {
            model.long_context.as_ref()
        } else {
            model
                .input_token_pricing_tiers
                .iter()
                .min_by_key(|tier| tier.threshold_tokens)
        }
        .expect("filtered model must retain a token-pricing tier");
        let provider = Provider::from_string(&model.provider)
            .expect("long-context catalog provider must map to a native provider");
        (model, tier, provider)
    }

    fn active_catalog_model(
        provider: Provider,
        predicate: impl Fn(&ModelEntry) -> bool,
    ) -> &'static ModelEntry {
        super::super::models_config::config()
            .models
            .values()
            .find(|entry| {
                entry.provider == provider.as_string()
                    && entry.deprecated != Some(true)
                    && predicate(entry)
            })
            .expect("catalog must contain an active model matching the test capability")
    }

    fn founder_standard_anthropic_model() -> &'static str {
        &active_catalog_model(Provider::Anthropic, |entry| {
            entry.pricing_schedule.is_empty()
                && entry.input_cost == 3.0
                && entry.output_cost == 15.0
                && entry.cached_input == Some(0.3)
                && entry.cached_write == Some(3.75)
        })
        .id
    }

    /// Pick a prompt size that remains on the catalog's base tier. The exact
    /// long-context threshold is intentionally base-priced; models without a
    /// long tier use one million tokens so their per-million rate is direct.
    fn base_tier_prompt_tokens(model: &ModelEntry) -> u32 {
        model
            .input_token_pricing_tiers
            .iter()
            .chain(model.long_context.iter())
            .map(|tier| tier.threshold_tokens)
            .min()
            .map(|threshold| {
                u32::try_from(threshold)
                    .expect("test catalog threshold must fit the native token counter")
            })
            .unwrap_or(1_000_000)
    }

    #[test]
    fn long_context_threshold_is_strict_and_switches_the_whole_request() {
        let calc = CostCalculator::new();
        let (model, tier, provider) = catalog_token_pricing_model(None);
        let threshold = u32::try_from(tier.threshold_tokens)
            .expect("test catalog threshold must fit the native token counter");
        let output_tokens = 1_000;

        let at_threshold = calc.calculate(
            provider,
            &model.id,
            threshold,
            output_tokens,
            standard_window_date(),
        );
        let base = model.effective_pricing(standard_window_date());
        let expected_base = (f64::from(threshold) / 1_000_000.0) * base.input_cost
            + (f64::from(output_tokens) / 1_000_000.0) * base.output_cost;
        assert!((at_threshold - expected_base).abs() < 1e-12);

        let above = threshold
            .checked_add(1)
            .expect("test threshold must allow a boundary token");
        let above_threshold = calc.calculate(
            provider,
            &model.id,
            above,
            output_tokens,
            standard_window_date(),
        );
        let expected_long = (f64::from(above) / 1_000_000.0) * tier.input_cost
            + (f64::from(output_tokens) / 1_000_000.0) * tier.output_cost;
        assert!((above_threshold - expected_long).abs() < 1e-12);
        assert_ne!(above_threshold, expected_base);
    }

    #[test]
    fn long_context_cache_rates_are_catalog_derived() {
        let calc = CostCalculator::new();
        let (model, tier, provider) = catalog_token_pricing_model(Some(Provider::OpenAI));
        let prompt_tokens = u32::try_from(tier.threshold_tokens)
            .expect("test catalog threshold must fit the native token counter")
            .checked_add(1)
            .expect("test threshold must allow a boundary token");
        let completion_tokens = 1_000;
        let cache_read_tokens = 10_000;
        let cache_creation_tokens = 5_000;
        let input_rate = tier.input_cost / 1_000_000.0;
        let output_rate = tier.output_cost / 1_000_000.0;
        let cache_read_rate = tier
            .cached_input
            .expect("selected long-context tier must price cache reads")
            / 1_000_000.0;
        let cache_write_rate = tier
            .cached_write
            .expect("selected long-context tier must price cache writes")
            / 1_000_000.0;
        let regular_input = prompt_tokens
            .saturating_sub(cache_read_tokens)
            .saturating_sub(cache_creation_tokens);
        let expected = f64::from(regular_input) * input_rate
            + f64::from(cache_read_tokens) * cache_read_rate
            + f64::from(cache_creation_tokens) * cache_write_rate
            + f64::from(completion_tokens) * output_rate;

        let cost = calc.calculate_with_cache(
            provider,
            &model.id,
            prompt_tokens,
            completion_tokens,
            cache_read_tokens,
            cache_creation_tokens,
            standard_window_date(),
        );
        assert!((cost - expected).abs() < 1e-12);
    }

    #[test]
    fn tiered_openai_compatible_cache_rates_are_not_discarded() {
        // Select a tiered catalog model outside the historical OpenAI native
        // allowlist. Its adapter still reports inclusive cache subsets, and
        // those buckets must retain the catalog's tier-specific rates.
        let calc = CostCalculator::new();
        let (model, tier, provider) = super::super::models_config::config()
            .models
            .values()
            .find_map(|entry| {
                let provider = Provider::from_string(&entry.provider)?;
                if matches!(
                    provider,
                    Provider::Anthropic | Provider::OpenAI | Provider::ManagedCloud
                ) {
                    return None;
                }
                let tier = entry
                    .input_token_pricing_tiers
                    .iter()
                    .min_by_key(|tier| tier.threshold_tokens)
                    .or(entry.long_context.as_ref())?;
                (tier.cached_input.is_some() && tier.cached_write.is_some())
                    .then_some((entry, tier, provider))
            })
            .expect("catalog must contain a tiered inclusive-cache model outside OpenAI");
        let prompt_tokens = u32::try_from(tier.threshold_tokens)
            .expect("test catalog threshold must fit the native token counter")
            .checked_add(1)
            .expect("test threshold must allow a boundary token");
        let cache_read_tokens = 10_000;
        let cache_creation_tokens = 5_000;
        let ordinary_input = prompt_tokens
            .saturating_sub(cache_read_tokens)
            .saturating_sub(cache_creation_tokens);
        let expected = (f64::from(ordinary_input) * tier.input_cost
            + f64::from(cache_read_tokens)
                * tier
                    .cached_input
                    .expect("selected tier must price cache reads")
            + f64::from(cache_creation_tokens)
                * tier
                    .cached_write
                    .expect("selected tier must price cache writes"))
            / 1_000_000.0;

        let cost = calc.calculate_with_cache(
            provider,
            &model.id,
            prompt_tokens,
            0,
            cache_read_tokens,
            cache_creation_tokens,
            standard_window_date(),
        );
        assert!((cost - expected).abs() < 1e-12);
    }

    #[test]
    fn calculate_returns_positive_for_known_model() {
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::Anthropic, |entry| {
            entry.input_cost > 0.0 && entry.output_cost > 0.0
        });
        let cost = calc.calculate(
            Provider::Anthropic,
            &model.id,
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
        let model = active_catalog_model(Provider::OpenAI, |entry| {
            !entry.input_token_pricing_tiers.is_empty() || entry.long_context.is_some()
        });
        let cost = calc.calculate(Provider::OpenAI, &model.id, 0, 0, standard_window_date());
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
        let model = active_catalog_model(Provider::Anthropic, |entry| {
            entry
                .cached_input
                .is_some_and(|rate| rate < entry.input_cost)
        });
        let cost_no_cache = calc.calculate(
            Provider::Anthropic,
            &model.id,
            1000,
            500,
            standard_window_date(),
        );
        // Same total input with half moved to a disjoint cache-read bucket.
        let cost_cached = calc.calculate_with_cache(
            Provider::Anthropic,
            &model.id,
            500,
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
        // Regression pin. This path used to hardcode a provider-wide cache-read
        // multiplier. Select a catalog model whose rate disproves that multiplier
        // so reinstating it fails without pinning a concrete model or price.
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::OpenAI, |entry| {
            entry
                .cached_input
                .is_some_and(|rate| (rate - entry.input_cost * 0.5).abs() > 1e-9)
        });
        let prompt_tokens = base_tier_prompt_tokens(model);
        let pricing = model.effective_pricing(standard_window_date());
        let expected_rate = pricing
            .cached_input
            .expect("selected catalog model must price cache reads");

        // Every prompt token is a cache read; the request remains base-tier.
        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            &model.id,
            prompt_tokens,
            0,
            prompt_tokens,
            0,
            standard_window_date(),
        );

        let token_scale = f64::from(prompt_tokens) / 1_000_000.0;
        let expected = token_scale * expected_rate;
        let stale_multiplier_cost = token_scale * pricing.input_cost * 0.5;
        assert!(
            (cost - expected).abs() < 1e-9,
            "cache-read cost {} should equal the catalog-derived {}, the stale \
             provider multiplier would give {}",
            cost,
            expected,
            stale_multiplier_cost
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
        // token is billed ONLY here, falling back to the plain input rate
        // would drop the published 25% surcharge that apps/web and the gateway
        // both charge.
        let calc = unpriced_cache_calculator();

        let cost = calc.calculate_with_cache(
            Provider::Anthropic,
            UNPRICED_CACHE_MODEL,
            0,         // ordinary prompt tokens; cache writes are disjoint
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
        let model = active_catalog_model(Provider::OpenAI, |entry| {
            !entry.input_token_pricing_tiers.is_empty() || entry.long_context.is_some()
        });
        // ManagedCloud should find the selected model's pricing via its origin.
        let cost = calc.calculate(
            Provider::ManagedCloud,
            &model.id,
            1_000_000,
            1_000_000,
            standard_window_date(),
        );
        let direct_cost = calc.calculate(
            Provider::OpenAI,
            &model.id,
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
        // fields. Disjoint cache accounting can report no ordinary prompt or
        // output tokens, so 1M of each cache bucket isolates the two rates and
        // proves that a cache-only usage record is not discarded.
        let calc = scheduled_fixture_calculator();
        let first = calc.calculate_with_cache(
            Provider::Anthropic,
            FIXTURE_MODEL,
            0, // ordinary prompt tokens; cache buckets are disjoint
            0,
            1_000_000, // cache_read_tokens
            1_000_000, // cache_creation_tokens
            day(2030, 2, 15),
        );
        let second = calc.calculate_with_cache(
            Provider::Anthropic,
            FIXTURE_MODEL,
            0,
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
        // Founder pin, Decision #22 (docs/decisions/README.md,
        // reaffirmed 2026-08-05): Sonnet 5 bills users the standard $3/$15 per
        // MTok (cache read $0.30, 5m write $3.75) on EVERY date. Anthropic's
        // introductory window is a provider-COST fact for the registry's
        // verificationLog, never a product price. Fixed dates on both sides of
        // that retired 2026-09-01 boundary.
        let calc = CostCalculator::new();
        let model = founder_standard_anthropic_model();
        for date in [day(2020, 1, 1), day(2026, 8, 15), day(2026, 9, 15)] {
            let cost = calc.calculate(Provider::Anthropic, model, 1_000_000, 1_000_000, date);
            assert!(
                (cost - 18.0).abs() < 1e-9,
                "Sonnet 5 must bill the standard $18.00 for 1M+1M on {}, got ${}",
                date,
                cost
            );

            let cached = calc.calculate_with_cache(
                Provider::Anthropic,
                model,
                0, // ordinary prompt tokens; cache buckets are disjoint
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
        let model = active_catalog_model(Provider::Anthropic, |entry| {
            entry.pricing_schedule.is_empty()
        });
        let early = calc.calculate(
            Provider::Anthropic,
            &model.id,
            1_000_000,
            1_000_000,
            NaiveDate::from_ymd_opt(2020, 1, 1).expect("valid date"),
        );
        let late = calc.calculate(
            Provider::Anthropic,
            &model.id,
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
        // Prompt tokens are inclusive for this provider. When every token is a
        // cache write, the total must therefore be the catalog write rate (the
        // base input charge plus only the write surcharge), not the input rate.
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::OpenAI, |entry| entry.cached_write.is_some());
        let prompt_tokens = base_tier_prompt_tokens(model);
        let write_rate = model
            .effective_pricing(standard_window_date())
            .cached_write
            .expect("selected catalog model must price cache writes");
        let cost = calc.calculate_with_cache(
            Provider::OpenAI,
            &model.id,
            prompt_tokens,
            0,
            0,
            prompt_tokens,
            standard_window_date(),
        );
        let expected = f64::from(prompt_tokens) / 1_000_000.0 * write_rate;
        assert!(
            (cost - expected).abs() < 1e-9,
            "cache-write tokens must bill the catalog-derived write rate; expected ${expected}, got ${}",
            cost
        );
    }

    #[test]
    fn managed_cloud_bills_catalog_cache_writes_through_the_origin_provider() {
        // Managed Cloud proxies the origin provider's pricing, so a catalog
        // write surcharge must survive the origin lookup.
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::OpenAI, |entry| entry.cached_write.is_some());
        let prompt_tokens = base_tier_prompt_tokens(model);
        let write_rate = model
            .effective_pricing(standard_window_date())
            .cached_write
            .expect("selected catalog model must price cache writes");
        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            &model.id,
            prompt_tokens,
            0,
            0,
            prompt_tokens,
            standard_window_date(),
        );
        let expected = f64::from(prompt_tokens) / 1_000_000.0 * write_rate;
        assert!(
            (cost - expected).abs() < 1e-9,
            "managed-cloud cache writes must retain the origin catalog rate; expected ${expected}, got ${}",
            cost
        );
    }

    #[test]
    fn managed_cloud_preserves_disjoint_cache_accounting_from_origin_provider() {
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::Anthropic, |entry| {
            entry.cached_input.is_some() && entry.cached_write.is_some()
        });
        let ordinary_tokens = 10_000;
        let cache_read_tokens = 4_000;
        let cache_creation_tokens = 2_000;
        let pricing = model.effective_pricing(standard_window_date());
        let expected = (f64::from(ordinary_tokens) * pricing.input_cost
            + f64::from(cache_read_tokens)
                * pricing
                    .cached_input
                    .expect("selected origin model must price cache reads")
            + f64::from(cache_creation_tokens)
                * pricing
                    .cached_write
                    .expect("selected origin model must price cache writes"))
            / 1_000_000.0;

        let cost = calc.calculate_with_cache(
            Provider::ManagedCloud,
            &model.id,
            ordinary_tokens,
            0,
            cache_read_tokens,
            cache_creation_tokens,
            standard_window_date(),
        );
        assert!(
            (cost - expected).abs() < 1e-12,
            "managed-cloud metering must preserve the origin's disjoint cache shape"
        );
    }

    #[test]
    fn openai_cache_reads_and_writes_bill_each_prompt_token_exactly_once() {
        // Build a mixed inclusive prompt from catalog rates. Plain, read, and
        // write buckets must be mutually exclusive in the resulting charge.
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::OpenAI, |entry| {
            entry.cached_input.is_some() && entry.cached_write.is_some()
        });
        let prompt_tokens = base_tier_prompt_tokens(model);
        let cache_read_tokens = prompt_tokens.saturating_mul(4) / 10;
        let cache_creation_tokens = prompt_tokens.saturating_mul(2) / 10;
        let plain_tokens = prompt_tokens
            .saturating_sub(cache_read_tokens)
            .saturating_sub(cache_creation_tokens);
        let pricing = model.effective_pricing(standard_window_date());
        let expected = (f64::from(plain_tokens) * pricing.input_cost
            + f64::from(cache_read_tokens)
                * pricing
                    .cached_input
                    .expect("selected catalog model must price cache reads")
            + f64::from(cache_creation_tokens)
                * pricing
                    .cached_write
                    .expect("selected catalog model must price cache writes"))
            / 1_000_000.0;
        let cost = calc.calculate_with_cache(
            Provider::OpenAI,
            &model.id,
            prompt_tokens,
            0,
            cache_read_tokens,
            cache_creation_tokens,
            standard_window_date(),
        );
        assert!(
            (cost - expected).abs() < 1e-9,
            "mixed inclusive prompt must bill each token once; expected ${expected}, got ${}",
            cost
        );
    }

    #[test]
    fn anthropic_cache_writes_use_the_catalog_price_not_the_input_rate() {
        // Regression pin. This is a SOURCE change, not a price change: Anthropic
        // writes used to be billed as a hardcoded 1.25x multiplier on the input
        // rate and are now billed from the catalog's absolute `cached_write`.
        // The selected model and all expected rates come from the catalog so a
        // roster or price update requires no consumer-test edit.
        let calc = CostCalculator::new();
        let model = active_catalog_model(Provider::Anthropic, |entry| {
            entry.cached_write.is_some() && entry.output_cost > 0.0
        });
        let pricing = model.effective_pricing(standard_window_date());
        let cost = calc.calculate_with_cache(
            Provider::Anthropic,
            &model.id,
            0, // Anthropic reports cache tokens separately from input_tokens
            1, // keep the request non-empty
            0,
            1_000_000,
            standard_window_date(),
        );
        let expected = pricing
            .cached_write
            .expect("selected catalog model must price cache writes")
            + pricing.output_cost / 1_000_000.0;
        assert!(
            (cost - expected).abs() < 1e-9,
            "1M cache-write tokens must bill the catalog-derived rate, got ${}",
            cost
        );
    }
}
