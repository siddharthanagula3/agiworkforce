//! Per-turn cost ledger sourced from models.json pricing constants.

use std::collections::HashMap;

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

/// Built-in pricing table sourced from models.json provider defaultPricing fields.
/// Update when providers publish new pricing.
pub fn rates_for(model: &str) -> PricingRates {
    let m = model.to_lowercase();
    match m.as_str() {
        // Claude family — per models.json anthropic defaultPricing and tier tiers
        x if x.contains("claude") && x.contains("opus") => PricingRates {
            input_per_mtok: 15.0,
            output_per_mtok: 75.0,
            cache_read_per_mtok: 1.5,
            cache_write_per_mtok: 18.75,
        },
        x if x.contains("claude") && x.contains("sonnet") => PricingRates {
            input_per_mtok: 3.0,
            output_per_mtok: 15.0,
            cache_read_per_mtok: 0.3,
            cache_write_per_mtok: 3.75,
        },
        x if x.contains("claude") && x.contains("haiku") => PricingRates {
            input_per_mtok: 0.8,
            output_per_mtok: 4.0,
            cache_read_per_mtok: 0.08,
            cache_write_per_mtok: 1.0,
        },
        // OpenAI GPT-5.x family — per models.json openai defaultPricing
        x if x.starts_with("gpt-5.5") => PricingRates {
            input_per_mtok: 1.5,
            output_per_mtok: 6.0,
            cache_read_per_mtok: 0.15,
            cache_write_per_mtok: 0.0,
        },
        x if x.starts_with("gpt-5.4") => PricingRates {
            input_per_mtok: 2.5,
            output_per_mtok: 10.0,
            cache_read_per_mtok: 0.25,
            cache_write_per_mtok: 0.0,
        },
        x if x.starts_with("gpt-5") => PricingRates {
            input_per_mtok: 1.5,
            output_per_mtok: 6.0,
            cache_read_per_mtok: 0.15,
            cache_write_per_mtok: 0.0,
        },
        // Google Gemini — per models.json google defaultPricing
        x if x.starts_with("gemini") => PricingRates {
            input_per_mtok: 1.0,
            output_per_mtok: 5.0,
            cache_read_per_mtok: 0.1,
            cache_write_per_mtok: 0.0,
        },
        // xAI Grok — per models.json xai defaultPricing
        x if x.starts_with("grok") => PricingRates {
            input_per_mtok: 0.2,
            output_per_mtok: 0.5,
            cache_read_per_mtok: 0.02,
            cache_write_per_mtok: 0.0,
        },
        // DeepSeek — per models.json deepseek defaultPricing
        x if x.starts_with("deepseek") => PricingRates {
            input_per_mtok: 0.14,
            output_per_mtok: 0.28,
            cache_read_per_mtok: 0.014,
            cache_write_per_mtok: 0.0,
        },
        // Qwen — per models.json qwen defaultPricing
        x if x.starts_with("qwen") => PricingRates {
            input_per_mtok: 0.5,
            output_per_mtok: 2.0,
            cache_read_per_mtok: 0.05,
            cache_write_per_mtok: 0.0,
        },
        // Moonshot / Kimi — per models.json moonshot defaultPricing
        x if x.starts_with("kimi") || x.starts_with("moonshot") => PricingRates {
            input_per_mtok: 0.95,
            output_per_mtok: 4.0,
            cache_read_per_mtok: 0.095,
            cache_write_per_mtok: 0.0,
        },
        // Perplexity Sonar — per models.json perplexity defaultPricing
        x if x.starts_with("sonar") => PricingRates {
            input_per_mtok: 1.0,
            output_per_mtok: 1.0,
            cache_read_per_mtok: 0.1,
            cache_write_per_mtok: 0.0,
        },
        // ZhipuAI GLM — per models.json zhipu defaultPricing
        x if x.starts_with("glm") => PricingRates {
            input_per_mtok: 1.4,
            output_per_mtok: 4.4,
            cache_read_per_mtok: 0.14,
            cache_write_per_mtok: 0.0,
        },
        // Local — free
        x if x.starts_with("ollama") || x.starts_with("lmstudio") => PricingRates::default(),
        // Mistral / Codestral — per models.json mistral defaultPricing
        x if x.starts_with("mistral") || x.starts_with("codestral") || x.starts_with("pixtral") => {
            PricingRates {
                input_per_mtok: 0.5,
                output_per_mtok: 1.5,
                cache_read_per_mtok: 0.05,
                cache_write_per_mtok: 0.0,
            }
        }
        // Conservative default for unknown models
        _ => PricingRates {
            input_per_mtok: 3.0,
            output_per_mtok: 15.0,
            cache_read_per_mtok: 0.3,
            cache_write_per_mtok: 0.0,
        },
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
        let delta =
            dollars_for(model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens);
        self.total_usd += delta;
        *self.by_model.entry(model.to_string()).or_insert(0.0) += delta;
        self.turns += 1;
        delta
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates_for_known_models_are_nonzero() {
        for m in ["claude-opus-4-7", "claude-sonnet-4-6", "gpt-5.4", "gpt-5.5"] {
            let r = rates_for(m);
            assert!(r.input_per_mtok > 0.0, "input rate missing for {m}");
            assert!(r.output_per_mtok > 0.0, "output rate missing for {m}");
        }
    }

    #[test]
    fn local_models_are_free() {
        let r = rates_for("ollama:llama3");
        assert_eq!(r.input_per_mtok, 0.0);
        assert_eq!(r.output_per_mtok, 0.0);
    }

    #[test]
    fn dollars_for_opus_one_million_tokens() {
        let d = dollars_for("claude-opus-4-7", 1_000_000, 0, 0, 0);
        assert!((d - 15.0).abs() < 1e-6);
    }

    #[test]
    fn dollars_accumulate_via_record_turn() {
        let mut ledger = CostLedger::default();
        let d1 = ledger.record_turn("claude-sonnet-4-6", 100_000, 50_000, 0, 0);
        let d2 = ledger.record_turn("claude-sonnet-4-6", 50_000, 25_000, 0, 0);
        assert!(d1 > 0.0 && d2 > 0.0);
        assert!((ledger.total_usd - (d1 + d2)).abs() < 1e-6);
        assert_eq!(ledger.turns, 2);
        assert!(ledger.by_model.contains_key("claude-sonnet-4-6"));
    }

    #[test]
    fn cache_read_is_cheaper_than_input() {
        let r = rates_for("claude-opus-4-7");
        assert!(r.cache_read_per_mtok < r.input_per_mtok);
    }

    #[test]
    fn unknown_model_uses_default_rate() {
        let r = rates_for("some-weird-model-name");
        assert!(r.input_per_mtok > 0.0);
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
        ledger.record_turn("claude-opus-4-7", 100_000, 0, 0, 0);
        ledger.record_turn("gpt-5.5", 100_000, 0, 0, 0);
        assert_eq!(ledger.by_model.len(), 2);
        assert!(ledger.by_model["claude-opus-4-7"] > 0.0);
        assert!(ledger.by_model["gpt-5.5"] > 0.0);
    }
}
