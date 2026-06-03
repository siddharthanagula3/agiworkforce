//! Per-turn cost ledger sourced from the shared model catalog.

use std::collections::HashMap;

use crate::model_catalog;

#[derive(Debug, Clone, Copy, Default)]
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
    let Some(entry) = model_catalog::find(model) else {
        return PricingRates::default();
    };

    PricingRates {
        input_per_mtok: entry.input_price_per_1m,
        output_per_mtok: entry.output_price_per_1m,
        cache_read_per_mtok: entry.cache_read_price_per_1m,
        cache_write_per_mtok: entry.cache_write_price_per_1m,
    }
}

pub fn dollars_for(
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_write_tokens: u32,
) -> f64 {
    let r = rates_for(model);
    let mtok = |n: u32| (n as f64) / 1_000_000.0;
    mtok(input_tokens) * r.input_per_mtok
        + mtok(output_tokens) * r.output_per_mtok
        + mtok(cache_read_tokens) * r.cache_read_per_mtok
        + mtok(cache_write_tokens) * r.cache_write_per_mtok
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
        let delta = dollars_for(
            model,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_tokens,
        );
        self.total_usd += delta;
        *self.by_model.entry(model.to_string()).or_insert(0.0) += delta;
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
        let r = rates_for("ollama:llama3");
        assert_eq!(r.input_per_mtok, 0.0);
        assert_eq!(r.output_per_mtok, 0.0);
    }

    #[test]
    fn dollars_for_one_million_input_tokens_uses_catalog_rate() {
        let model = first_paid_catalog_model();
        let rate = rates_for(&model).input_per_mtok;
        let d = dollars_for(&model, 1_000_000, 0, 0, 0);
        assert!((d - rate).abs() < 1e-6);
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
        let r = rates_for("lmstudio:mistral-7b");
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
