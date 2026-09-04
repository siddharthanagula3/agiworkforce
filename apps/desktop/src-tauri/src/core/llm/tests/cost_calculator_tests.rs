
/// Fixed pricing date shared by every cost assertion in this file.
///
/// Cost calculation takes the request date explicitly because the catalog can
/// carry dated `pricingSchedule` windows. Tests therefore pin a date instead of
/// reading the clock. No shipped model schedules a price, so every total
/// asserted here is the model's single published price on any date; the dated
/// mechanism itself is exercised against a synthetic fixture in
/// `cost_calculator.rs`'s own test module.
#[cfg(test)]
fn priced_on() -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(2026, 9, 1).expect("2026-09-01 is a valid date")
}

#[cfg(test)]
mod media_pricing_tests {
    use crate::core::llm::cost_calculator::{CostCalculator, MediaType};
    use crate::core::llm::Provider;

    #[test]
    fn test_image_standard_cost_openai() {
        let calc = CostCalculator::new();
        // OpenAI standard image: $0.04 per image
        let cost = calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageStandard, 1);
        assert!((cost - 0.04).abs() < 1e-10, "expected $0.04, got ${}", cost);
    }

    #[test]
    fn test_image_hd_cost_openai() {
        let calc = CostCalculator::new();
        let hd_cost = calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageHD, 1);
        let std_cost = calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageStandard, 1);
        assert!(
            hd_cost > std_cost,
            "HD (${}) should cost more than Standard (${})",
            hd_cost,
            std_cost
        );
        assert!(
            (hd_cost - 0.08).abs() < 1e-10,
            "expected $0.08, got ${}",
            hd_cost
        );
    }

    #[test]
    fn test_image_standard_cost_google() {
        let calc = CostCalculator::new();
        // Google catalog standard image: $0.04 per image
        let cost = calc.calculate_media_cost(Provider::Google, MediaType::ImageStandard, 1);
        assert!((cost - 0.04).abs() < 1e-10, "expected $0.04, got ${}", cost);
    }

    #[test]
    fn test_image_hd_cost_google() {
        let calc = CostCalculator::new();
        // Google catalog HD image: $0.08 per image
        let hd_cost = calc.calculate_media_cost(Provider::Google, MediaType::ImageHD, 1);
        let std_cost = calc.calculate_media_cost(Provider::Google, MediaType::ImageStandard, 1);
        assert!(
            hd_cost > std_cost,
            "Google HD (${}) should cost more than Standard (${})",
            hd_cost,
            std_cost
        );
    }

    #[test]
    fn test_video_per_second_cost_openai_not_configured() {
        let calc = CostCalculator::new();
        // AGI does not configure an OpenAI video SKU in the catalog. Unknown
        // media pricing must not fabricate a cost.
        let cost_1s = calc.calculate_media_cost(Provider::OpenAI, MediaType::VideoPerSecond, 1);
        let cost_10s = calc.calculate_media_cost(Provider::OpenAI, MediaType::VideoPerSecond, 10);
        assert_eq!(cost_1s, 0.0);
        assert_eq!(cost_10s, 0.0);
    }

    #[test]
    fn test_video_per_second_cost_google() {
        let calc = CostCalculator::new();
        // Google catalog video route: $0.08/second
        let cost_1s = calc.calculate_media_cost(Provider::Google, MediaType::VideoPerSecond, 1);
        let cost_5s = calc.calculate_media_cost(Provider::Google, MediaType::VideoPerSecond, 5);
        assert!(
            (cost_1s - 0.08).abs() < 1e-10,
            "expected $0.08/s, got ${}",
            cost_1s
        );
        assert!(
            (cost_5s - 0.40).abs() < 1e-9,
            "5 seconds should cost $0.40, got ${}",
            cost_5s
        );
    }

    #[test]
    fn test_zero_units_returns_zero() {
        let calc = CostCalculator::new();
        assert_eq!(
            calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageStandard, 0),
            0.0
        );
        assert_eq!(
            calc.calculate_media_cost(Provider::Google, MediaType::VideoPerSecond, 0),
            0.0
        );
    }

    #[test]
    fn test_multiple_images_scale_linearly() {
        let calc = CostCalculator::new();
        let one = calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageStandard, 1);
        let five = calc.calculate_media_cost(Provider::OpenAI, MediaType::ImageStandard, 5);
        assert!(
            (five - one * 5.0).abs() < 1e-9,
            "5 images=${}, 1 image*5=${}",
            five,
            one * 5.0
        );
    }

    #[test]
    fn test_managed_cloud_inherits_media_pricing() {
        let calc = CostCalculator::new();
        // ManagedCloud should fall through to an origin provider's pricing
        // and return a non-zero cost for image generation.
        let cost = calc.calculate_media_cost(Provider::ManagedCloud, MediaType::ImageStandard, 1);
        assert!(
            cost > 0.0,
            "ManagedCloud media cost should be > 0, got {}",
            cost
        );
    }

    #[test]
    fn test_ollama_fallback_media_pricing() {
        let calc = CostCalculator::new();
        // Ollama has no explicit media pricing entry. Unknown local media
        // pricing must not fabricate a cloud cost.
        let cost = calc.calculate_media_cost(Provider::Ollama, MediaType::ImageStandard, 1);
        assert_eq!(
            cost, 0.0,
            "Ollama media pricing must be free/unknown, got ${cost}"
        );
    }
}

#[cfg(test)]
mod tests {
    use crate::core::llm::cost_calculator::CostCalculator;
    use crate::core::llm::models_config::ModelEntry;
    use crate::core::llm::Provider;

    const DEEPSEEK_FLASH_INPUT_PER_1M: f64 = 0.44;
    const DEEPSEEK_FLASH_OUTPUT_PER_1M: f64 = 1.32;
    const MILLION: f64 = 1_000_000.0;

    fn catalog_model(
        provider: Provider,
        predicate: impl Fn(&ModelEntry) -> bool,
    ) -> &'static ModelEntry {
        crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| {
                entry.provider == provider.as_string()
                    && entry.deprecated != Some(true)
                    && predicate(entry)
            })
            .expect("catalog must include a model matching the pricing test")
    }

    // ------------------------------------------------------------------
    // Basic token cost correctness
    // ------------------------------------------------------------------

    #[test]
    fn test_zero_tokens_returns_zero() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(
            Provider::OpenAI,
            Provider::OpenAI.default_model(),
            0,
            0,
            super::priced_on(),
        );
        assert_eq!(cost, 0.0, "Zero tokens must produce zero cost");
    }

    #[test]
    fn test_low_cost_deepseek_model_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::DeepSeek, |entry| {
            entry.input_cost == DEEPSEEK_FLASH_INPUT_PER_1M
                && entry.output_cost == DEEPSEEK_FLASH_OUTPUT_PER_1M
        });
        let cost = calc.calculate(
            Provider::DeepSeek,
            &model.id,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        let expected = DEEPSEEK_FLASH_INPUT_PER_1M + DEEPSEEK_FLASH_OUTPUT_PER_1M;
        assert!(
            (cost - expected).abs() < 1e-9,
            "Expected ${} for the selected DeepSeek model, got ${}",
            expected,
            cost
        );
    }

    #[test]
    fn test_standard_anthropic_model_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::Anthropic, |entry| {
            entry.input_cost == 3.0 && entry.output_cost == 15.0
        });
        let cost = calc.calculate(
            Provider::Anthropic,
            &model.id,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - 18.0).abs() < 1e-9,
            "Expected $18.00 for the standard Anthropic route, got ${}",
            cost
        );
    }

    #[test]
    fn test_premium_anthropic_model_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::Anthropic, |entry| {
            entry.input_cost == 5.0 && entry.output_cost == 25.0
        });
        let cost = calc.calculate(
            Provider::Anthropic,
            &model.id,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - 30.0).abs() < 1e-9,
            "Expected $30.00 for the selected premium Anthropic model, got ${}",
            cost
        );
    }

    #[test]
    fn test_openai_catalog_costs_match_effective_pricing() {
        let calc = CostCalculator::new();
        for model in crate::core::llm::models_config::get_all_model_entries()
            .values()
            .filter(|entry| entry.provider == "openai")
        {
            let effective = model.effective_pricing_for_input(super::priced_on(), 1_000_000);
            let cost = calc.calculate(
                Provider::OpenAI,
                &model.id,
                1_000_000,
                1_000_000,
                super::priced_on(),
            );
            assert!(
                (cost - effective.input_cost - effective.output_cost).abs() < 1e-9,
                "catalog pricing mismatch for {}",
                model.id
            );
        }
    }

    #[test]
    fn test_google_gemini_flash_cost() {
        let calc = CostCalculator::new();
        let model = Provider::Google.default_model();
        let pricing = crate::core::llm::models_config::get_pricing(
            &Provider::Google,
            model,
            super::priced_on(),
        )
        .expect("Google default model should have catalog pricing");
        let expected = pricing.input_per_million + pricing.output_per_million;
        let cost = calc.calculate(
            Provider::Google,
            model,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - expected).abs() < 1e-9,
            "Expected ${expected} for {model} 1M+1M tokens, got ${cost}"
        );
    }

    #[test]
    fn test_ollama_always_free() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(
            Provider::Ollama,
            "fixture-local-model",
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert_eq!(cost, 0.0, "Ollama models must be free, got ${}", cost);
    }

    #[test]
    fn test_zhipu_default_model_uses_catalog_pricing() {
        let calc = CostCalculator::new();
        let model = Provider::Zhipu.default_model();
        let pricing = crate::core::llm::models_config::get_pricing(
            &Provider::Zhipu,
            model,
            super::priced_on(),
        )
        .expect("Zhipu default model should have catalog pricing");
        let expected = pricing.input_per_million + pricing.output_per_million;
        let cost = calc.calculate(
            Provider::Zhipu,
            model,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - expected).abs() < 1e-9,
            "Expected ${expected} for {model} 1M+1M tokens, got ${cost}"
        );
    }

    #[test]
    fn test_xai_catalog_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::XAI, |entry| {
            entry.input_cost == 2.0 && entry.output_cost == 6.0
        });
        let cost = calc.calculate(
            Provider::XAI,
            &model.id,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - 8.0).abs() < 1e-9,
            "Expected $8.00 for the selected xAI model, got ${}",
            cost
        );
    }

    #[test]
    fn test_cost_only_input_tokens() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::DeepSeek, |entry| {
            entry.input_cost == DEEPSEEK_FLASH_INPUT_PER_1M
        });
        let cost = calc.calculate(
            Provider::DeepSeek,
            &model.id,
            500_000,
            0,
            super::priced_on(),
        );
        let expected = DEEPSEEK_FLASH_INPUT_PER_1M * 500_000.0 / MILLION;
        assert!(
            (cost - expected).abs() < 1e-9,
            "Expected ${} for 500k input-only tokens, got ${}",
            expected,
            cost
        );
    }

    #[test]
    fn test_cost_only_output_tokens() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::DeepSeek, |entry| {
            entry.output_cost == DEEPSEEK_FLASH_OUTPUT_PER_1M
        });
        let cost = calc.calculate(
            Provider::DeepSeek,
            &model.id,
            0,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - DEEPSEEK_FLASH_OUTPUT_PER_1M).abs() < 1e-9,
            "Expected ${} for 1M output-only tokens, got ${}",
            DEEPSEEK_FLASH_OUTPUT_PER_1M,
            cost
        );
    }

    #[test]
    fn test_more_expensive_model_costs_more() {
        let calc = CostCalculator::new();
        let cheap_model = catalog_model(Provider::DeepSeek, |entry| {
            entry.input_cost == DEEPSEEK_FLASH_INPUT_PER_1M
                && entry.output_cost == DEEPSEEK_FLASH_OUTPUT_PER_1M
        });
        let expensive_model = catalog_model(Provider::Anthropic, |entry| {
            entry.input_cost == 5.0 && entry.output_cost == 25.0
        });
        let cheap = calc.calculate(
            Provider::DeepSeek,
            &cheap_model.id,
            100_000,
            100_000,
            super::priced_on(),
        );
        let expensive = calc.calculate(
            Provider::Anthropic,
            &expensive_model.id,
            100_000,
            100_000,
            super::priced_on(),
        );
        assert!(
            expensive > cheap,
            "premium catalog model (${}) must cost more than economy catalog model (${})",
            expensive,
            cheap
        );
    }

    #[test]
    fn test_managed_cloud_falls_through_to_origin_provider() {
        let calc = CostCalculator::new();
        let model = Provider::DeepSeek.default_model();
        let managed = calc.calculate(
            Provider::ManagedCloud,
            model,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        let origin = calc.calculate(
            Provider::DeepSeek,
            model,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (managed - origin).abs() < 1e-9,
            "ManagedCloud must proxy origin pricing: managed=${managed}, origin=${origin}"
        );
    }

    #[test]
    fn test_unknown_model_uses_provider_default() {
        let calc = CostCalculator::new();
        // A model name not in the pricing map triggers the provider default.
        // DeepSeek default: $0.27/M input, $0.42/M output
        let cost = calc.calculate(
            Provider::DeepSeek,
            "unknown-future-model",
            1_000_000,
            0,
            super::priced_on(),
        );
        // Must be positive and close to the DeepSeek default ($0.27)
        assert!(
            cost > 0.0,
            "Unknown model must use provider default (non-zero)"
        );
        assert!(
            cost < 10.0,
            "Unknown model default cost must be sane (< $10 per 1M tokens)"
        );
    }

    #[test]
    fn test_cost_scales_linearly_with_token_count() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::Anthropic, |entry| {
            entry.input_token_pricing_tiers.is_empty() && entry.long_context.is_none()
        });
        let cost_1m = calc.calculate(
            Provider::Anthropic,
            &model.id,
            1_000_000,
            0,
            super::priced_on(),
        );
        let cost_2m = calc.calculate(
            Provider::Anthropic,
            &model.id,
            2_000_000,
            0,
            super::priced_on(),
        );
        assert!(
            (cost_2m - 2.0 * cost_1m).abs() < 1e-9,
            "Cost must scale linearly: 2M tokens (${cost_2m}) must be 2× 1M tokens (${cost_1m})"
        );
    }

    #[test]
    fn test_perplexity_professional_search_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::Perplexity, |entry| {
            entry.model_type == "search" && entry.input_cost == 3.0
        });
        let cost = calc.calculate(
            Provider::Perplexity,
            &model.id,
            1_000_000,
            0,
            super::priced_on(),
        );
        assert!(
            (cost - 3.0).abs() < 1e-9,
            "Expected $3.00 for the selected professional search model, got ${}",
            cost
        );
    }

    #[test]
    fn test_qwen_plus_cost() {
        let calc = CostCalculator::new();
        let model = Provider::Qwen.default_model();
        let metadata = crate::core::llm::models_config::get_all_model_entries()
            .get(model)
            .expect("Qwen default model must exist in the catalog");
        let expected = metadata.effective_pricing_for_input(super::priced_on(), 1_000_000);
        let cost = calc.calculate(
            Provider::Qwen,
            model,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - expected.input_cost - expected.output_cost).abs() < 1e-9,
            "Qwen default model must use its effective catalog tier, got ${}",
            cost
        );
    }

    #[test]
    fn test_moonshot_catalog_cost() {
        let calc = CostCalculator::new();
        let model = catalog_model(Provider::Moonshot, |entry| {
            entry.input_cost == 3.0 && entry.output_cost == 15.0
        });
        let cost = calc.calculate(
            Provider::Moonshot,
            &model.id,
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (cost - 18.0).abs() < 1e-9,
            "Expected $18.00 for the selected Moonshot model, got ${}",
            cost
        );
    }

    #[test]
    fn test_unknown_moonshot_model_uses_provider_default_pricing() {
        let calc = CostCalculator::new();
        let unknown = calc.calculate(
            Provider::Moonshot,
            "unlisted-moonshot-model",
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        let default = calc.calculate(
            Provider::Moonshot,
            Provider::Moonshot.default_model(),
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (unknown - default).abs() < 1e-9,
            "unknown Moonshot model ({unknown}) should use provider default pricing ({default})"
        );
    }

    #[test]
    fn test_unknown_deepseek_model_uses_provider_default_pricing() {
        let calc = CostCalculator::new();
        let unknown = calc.calculate(
            Provider::DeepSeek,
            "unlisted-deepseek-model",
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        let default = calc.calculate(
            Provider::DeepSeek,
            Provider::DeepSeek.default_model(),
            1_000_000,
            1_000_000,
            super::priced_on(),
        );
        assert!(
            (unknown - default).abs() < 1e-9,
            "unknown DeepSeek model ({unknown}) should use provider default pricing ({default})"
        );
    }
}
