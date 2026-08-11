//! Per-turn cost ledger sourced from the shared model catalog.

use std::collections::HashMap;

use crate::model_catalog;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct PricingRates {
    /// $ per 1M input tokens
    pub input_per_mtok: f64,
    /// $ per 1M output tokens
    pub output_per_mtok: f64,
    /// $ per 1M cache read tokens
    pub cache_read_per_mtok: f64,
    /// $ per 1M cache write/create tokens
    pub cache_write_per_mtok: f64,
}

/// Pricing table sourced from the shared model catalog.
///
/// Unknown or user-defined models without explicit pricing are recorded as
/// zero-cost rather than estimated from provider/model-name strings. This avoids
/// stale or fictional billing numbers when providers rename models.
pub fn rates_for(model: &str) -> PricingRates {
    rates_for_input(model, 0)
}

/// Pricing for one request after applying any catalog long-context threshold.
pub fn rates_for_input(model: &str, input_tokens: u32) -> PricingRates {
    let Some(pricing) = model_catalog::token_pricing(model, input_tokens) else {
        return PricingRates::default();
    };

    PricingRates {
        input_per_mtok: pricing.input_price_per_1m,
        output_per_mtok: pricing.output_price_per_1m,
        cache_read_per_mtok: pricing.cache_read_price_per_1m,
        cache_write_per_mtok: pricing.cache_write_price_per_1m,
    }
}

pub fn dollars_for(
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_write_tokens: u32,
) -> f64 {
    // Anthropic reports cache counters disjoint from input_tokens. OpenAI and
    // other compatible providers report them as subsets of prompt/input, so
    // subtract both buckets before rebilling them at their catalog rates.
    let cache_tokens_are_disjoint = model_catalog::provider_for(model) == Some("anthropic");
    dollars_for_with_rates(
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        cache_tokens_are_disjoint,
        |tier_input_tokens| rates_for_input(model, tier_input_tokens),
    )
}

fn dollars_for_with_rates(
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_write_tokens: u32,
    cache_tokens_are_disjoint: bool,
    rates_for_request: impl FnOnce(u32) -> PricingRates,
) -> f64 {
    let cache_tokens = cache_read_tokens.saturating_add(cache_write_tokens);
    let tier_input_tokens =
        request_input_tokens(input_tokens, cache_tokens, cache_tokens_are_disjoint);
    let r = rates_for_request(tier_input_tokens);
    let mtok = |n: u32| (n as f64) / 1_000_000.0;
    let billable_input = if cache_tokens_are_disjoint {
        input_tokens
    } else {
        input_tokens.saturating_sub(cache_tokens)
    };
    mtok(billable_input) * r.input_per_mtok
        + mtok(output_tokens) * r.output_per_mtok
        + mtok(cache_read_tokens) * r.cache_read_per_mtok
        + mtok(cache_write_tokens) * r.cache_write_per_mtok
}

fn request_input_tokens(input_tokens: u32, cache_tokens: u32, cache_disjoint: bool) -> u32 {
    if cache_disjoint {
        input_tokens.saturating_add(cache_tokens)
    } else {
        input_tokens
    }
}

/// One provider request inside an agent turn. Tool loops may make several
/// completions, and long-context thresholds apply to each request separately.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletionUsage {
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    /// Included-plan completions consume tokens but are not a metered USD cost.
    pub included_in_subscription: bool,
}

impl CompletionUsage {
    pub fn dollars(&self) -> f64 {
        if self.included_in_subscription {
            return 0.0;
        }
        dollars_for(
            &self.model,
            self.input_tokens,
            self.output_tokens,
            self.cache_read_tokens,
            self.cache_write_tokens,
        )
    }
}

/// Sum per-provider-request costs without applying a model threshold to
/// aggregate turn or session tokens.
pub fn dollars_for_completions(completions: &[CompletionUsage]) -> f64 {
    completions.iter().map(CompletionUsage::dollars).sum()
}

#[derive(Debug, Clone, Default)]
pub struct CostLedger {
    /// Total accumulated cost across all turns this session.
    pub total_usd: f64,
    /// Per-model breakdown for /usage reporting.
    pub by_model: HashMap<String, f64>,
    /// Turn count.
    pub turns: u32,
}

impl CostLedger {
    pub fn record_turn(
        &mut self,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        cache_read_tokens: u32,
        cache_write_tokens: u32,
    ) -> f64 {
        self.record_completions(&[CompletionUsage {
            model: model.to_string(),
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_tokens,
            included_in_subscription: false,
        }])
    }

    /// Record one logical agent turn containing one or more provider requests.
    /// The turn counter advances once while the model breakdown keeps each
    /// request's actual model (including a first-request fallback).
    pub fn record_completions(&mut self, completions: &[CompletionUsage]) -> f64 {
        let mut delta = 0.0;
        for completion in completions {
            let completion_cost = completion.dollars();
            delta += completion_cost;
            *self.by_model.entry(completion.model.clone()).or_insert(0.0) += completion_cost;
        }
        self.total_usd += delta;
        self.turns += 1;
        delta
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn first_paid_catalog_model() -> String {
        model_catalog::catalog()
            .all()
            .iter()
            .find(|model| model.input_price_per_1m > 0.0 && model.output_price_per_1m > 0.0)
            .expect("catalog should include at least one paid model")
            .id
            .clone()
    }

    fn first_long_context_catalog_model() -> (String, u32) {
        model_catalog::catalog()
            .all()
            .iter()
            .find_map(|model| {
                model_catalog::long_context_threshold(&model.id).map(|threshold| {
                    (
                        model.id.clone(),
                        u32::try_from(threshold)
                            .expect("test catalog threshold must fit the CLI token counter"),
                    )
                })
            })
            .expect("catalog should include a long-context-priced model")
    }

    #[test]
    fn disjoint_cache_tokens_count_toward_request_pricing_thresholds() {
        assert_eq!(request_input_tokens(100, 28, true), 128);
        assert_eq!(request_input_tokens(100, 29, true), 129);
        assert_eq!(request_input_tokens(100, 29, false), 100);
        assert_eq!(request_input_tokens(u32::MAX, 1, true), u32::MAX);
    }

    #[test]
    fn synthetic_disjoint_request_switches_rates_end_to_end() {
        let rates = |request_input_tokens| {
            if request_input_tokens > 128 {
                PricingRates {
                    input_per_mtok: 2.0,
                    output_per_mtok: 20.0,
                    cache_read_per_mtok: 0.2,
                    cache_write_per_mtok: 2.5,
                }
            } else {
                PricingRates {
                    input_per_mtok: 1.0,
                    output_per_mtok: 10.0,
                    cache_read_per_mtok: 0.1,
                    cache_write_per_mtok: 1.25,
                }
            }
        };
        let at_threshold = dollars_for_with_rates(100, 0, 28, 0, true, rates);
        let above_threshold = dollars_for_with_rates(100, 0, 29, 0, true, rates);
        let expected_base = (100.0 * 1.0 + 28.0 * 0.1) / 1_000_000.0;
        let expected_tier = (100.0 * 2.0 + 29.0 * 0.2) / 1_000_000.0;
        assert!((at_threshold - expected_base).abs() < 1e-12);
        assert!((above_threshold - expected_tier).abs() < 1e-12);
    }

    #[test]
    fn rates_for_known_models_are_nonzero() {
        for model in model_catalog::catalog()
            .all()
            .iter()
            .filter(|model| model.input_price_per_1m > 0.0)
            .take(4)
        {
            let r = rates_for(&model.id);
            assert!(
                r.input_per_mtok > 0.0,
                "input rate missing for {}",
                model.id
            );
            assert!(
                r.output_per_mtok > 0.0,
                "output rate missing for {}",
                model.id
            );
        }
    }

    #[test]
    fn local_models_are_free() {
        let r = rates_for("ollama:fixture-local-model");
        assert_eq!(r.input_per_mtok, 0.0);
        assert_eq!(r.output_per_mtok, 0.0);
    }

    #[test]
    fn base_tier_input_tokens_use_the_catalog_rate() {
        let model = first_paid_catalog_model();
        let rate = rates_for(&model).input_per_mtok;
        let input_tokens = model_catalog::long_context_threshold(&model)
            .and_then(|threshold| u32::try_from(threshold).ok())
            .unwrap_or(1_000_000);
        let d = dollars_for(&model, input_tokens, 0, 0, 0);
        let expected = f64::from(input_tokens) / 1_000_000.0 * rate;
        assert!((d - expected).abs() < 1e-6);
    }

    #[test]
    fn dollars_accumulate_via_record_turn() {
        let mut ledger = CostLedger::default();
        let model = first_paid_catalog_model();
        let d1 = ledger.record_turn(&model, 100_000, 50_000, 0, 0);
        let d2 = ledger.record_turn(&model, 50_000, 25_000, 0, 0);
        assert!(d1 > 0.0 && d2 > 0.0);
        assert!((ledger.total_usd - (d1 + d2)).abs() < 1e-6);
        assert_eq!(ledger.turns, 2);
        assert!(ledger.by_model.contains_key(&model));
    }

    #[test]
    fn subscription_included_completions_do_not_enter_usd_ledger() {
        let model = first_paid_catalog_model();
        let included = CompletionUsage {
            model: model.clone(),
            input_tokens: 100_000,
            output_tokens: 50_000,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            included_in_subscription: true,
        };
        assert_eq!(included.dollars(), 0.0);

        let mut ledger = CostLedger::default();
        let delta = ledger.record_completions(&[included]);
        assert_eq!(delta, 0.0);
        assert_eq!(ledger.total_usd, 0.0);
        assert_eq!(ledger.turns, 1);
        assert_eq!(ledger.by_model.get(&model), Some(&0.0));
    }

    #[test]
    fn mixed_subscription_and_metered_tool_loop_bills_only_metered_completion() {
        let model = first_paid_catalog_model();
        let metered = CompletionUsage {
            model: model.clone(),
            input_tokens: 50_000,
            output_tokens: 25_000,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            included_in_subscription: false,
        };
        let included = CompletionUsage {
            included_in_subscription: true,
            ..metered.clone()
        };
        assert!(
            (dollars_for_completions(&[included, metered.clone()]) - metered.dollars()).abs()
                < 1e-12
        );
    }

    #[test]
    fn long_context_pricing_switches_only_above_the_catalog_threshold() {
        let (model, threshold) = first_long_context_catalog_model();
        let base = rates_for(&model);
        let at_threshold = rates_for_input(&model, threshold);
        assert_eq!(at_threshold, base);

        let above = threshold
            .checked_add(1)
            .expect("test threshold must allow a boundary token");
        let long = rates_for_input(&model, above);
        let catalog = model_catalog::token_pricing(&model, above)
            .expect("long-context model must have request pricing");
        assert_eq!(long.input_per_mtok, catalog.input_price_per_1m);
        assert_eq!(long.output_per_mtok, catalog.output_price_per_1m);
        assert_ne!(long, base);

        let output_tokens = 1_000;
        let expected = (f64::from(above) / 1_000_000.0) * long.input_per_mtok
            + (f64::from(output_tokens) / 1_000_000.0) * long.output_per_mtok;
        assert!((dollars_for(&model, above, output_tokens, 0, 0) - expected).abs() < 1e-12);
    }

    #[test]
    fn long_context_cache_buckets_are_not_double_counted() {
        let model = model_catalog::catalog()
            .all()
            .iter()
            .find(|model| {
                model.provider == "openai"
                    && model_catalog::long_context_threshold(&model.id).is_some()
            })
            .expect("catalog should include a long-context OpenAI model");
        let threshold = model_catalog::long_context_threshold(&model.id)
            .and_then(|threshold| u32::try_from(threshold).ok())
            .expect("test catalog threshold must fit the CLI token counter");
        let input_tokens = threshold
            .checked_add(1)
            .expect("test threshold must allow a boundary token");
        let output_tokens = 1_000;
        let cache_read_tokens = 10_000;
        let cache_write_tokens = 5_000;
        let rates = rates_for_input(&model.id, input_tokens);
        let billable_input = input_tokens - cache_read_tokens - cache_write_tokens;
        let expected = (f64::from(billable_input) / 1_000_000.0) * rates.input_per_mtok
            + (f64::from(cache_read_tokens) / 1_000_000.0) * rates.cache_read_per_mtok
            + (f64::from(cache_write_tokens) / 1_000_000.0) * rates.cache_write_per_mtok
            + (f64::from(output_tokens) / 1_000_000.0) * rates.output_per_mtok;

        let cost = dollars_for(
            &model.id,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_tokens,
        );
        assert!((cost - expected).abs() < 1e-12);
    }

    #[test]
    fn one_tool_loop_does_not_reprice_subthreshold_completions_as_one_request() {
        let (model, threshold) = first_long_context_catalog_model();
        let first_input = threshold / 2 + 1;
        let second_input = threshold / 2 + 1;
        assert!(first_input <= threshold && second_input <= threshold);
        let completions = vec![
            CompletionUsage {
                model: model.clone(),
                input_tokens: first_input,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                included_in_subscription: false,
            },
            CompletionUsage {
                model: model.clone(),
                input_tokens: second_input,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                included_in_subscription: false,
            },
        ];
        let mut ledger = CostLedger::default();
        let cumulative = first_input
            .checked_add(second_input)
            .expect("test cumulative token count must fit");
        let base = rates_for(&model);
        let expected = (f64::from(cumulative) / 1_000_000.0) * base.input_per_mtok;
        let delta = ledger.record_completions(&completions);
        assert!((delta - expected).abs() < 1e-12);
        assert!((ledger.total_usd - expected).abs() < 1e-12);
        assert_eq!(ledger.turns, 1);

        let retroactively_repriced = dollars_for(&model, cumulative, 0, 0, 0);
        assert_ne!(ledger.total_usd, retroactively_repriced);
    }

    #[test]
    fn cache_read_is_not_more_expensive_than_input_when_present() {
        let model = model_catalog::catalog()
            .all()
            .iter()
            .find(|model| model.cache_read_price_per_1m > 0.0)
            .expect("catalog should include at least one cache-read price")
            .id
            .clone();
        let r = rates_for(&model);
        assert!(r.cache_read_per_mtok < r.input_per_mtok);
    }

    #[test]
    fn unknown_model_uses_default_rate() {
        let r = rates_for("some-weird-model-name");
        assert_eq!(r.input_per_mtok, 0.0);
        assert_eq!(r.output_per_mtok, 0.0);
    }

    #[test]
    fn lmstudio_is_free() {
        let r = rates_for("lmstudio:fixture-local-model");
        assert_eq!(r.input_per_mtok, 0.0);
        assert_eq!(r.output_per_mtok, 0.0);
    }

    #[test]
    fn by_model_breakdown_is_tracked() {
        let mut ledger = CostLedger::default();
        let models: Vec<String> = model_catalog::catalog()
            .all()
            .iter()
            .filter(|model| model.input_price_per_1m > 0.0)
            .take(2)
            .map(|model| model.id.clone())
            .collect();
        assert_eq!(models.len(), 2);

        for model in &models {
            ledger.record_turn(model, 100_000, 0, 0, 0);
        }

        assert_eq!(ledger.by_model.len(), 2);
        for model in &models {
            assert!(ledger.by_model[model] > 0.0);
        }
    }
}
