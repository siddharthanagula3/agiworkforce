// H14 — CostCalculator tests.
//
// The `media_pricing_tests` module below was already testing real production
// code and is kept intact.
//
// The `tests` module previously contained placeholder inline-arithmetic tests
// that never called `CostCalculator`.  Those have been replaced with tests that
// call `CostCalculator::calculate()` and `calculate_media_cost()` directly.

// H46 — Media pricing calculations (uses CostCalculator directly)
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
        // OpenAI HD image: $0.08 per image — must be more expensive than standard
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
        // Google Imagen 4 standard image: $0.04 per image
        let cost = calc.calculate_media_cost(Provider::Google, MediaType::ImageStandard, 1);
        assert!((cost - 0.04).abs() < 1e-10, "expected $0.04, got ${}", cost);
    }

    #[test]
    fn test_image_hd_cost_google() {
        let calc = CostCalculator::new();
        // Google Imagen 4 Ultra HD: $0.08 per image
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
    fn test_video_per_second_cost_openai() {
        let calc = CostCalculator::new();
        // OpenAI Sora: $0.10/second. 10 seconds should cost $1.00.
        let cost_1s = calc.calculate_media_cost(Provider::OpenAI, MediaType::VideoPerSecond, 1);
        let cost_10s = calc.calculate_media_cost(Provider::OpenAI, MediaType::VideoPerSecond, 10);
        assert!(
            (cost_1s - 0.10).abs() < 1e-10,
            "expected $0.10/s, got ${}",
            cost_1s
        );
        assert!(
            (cost_10s - cost_1s * 10.0).abs() < 1e-9,
            "cost should scale linearly: 10s=${}, 1s*10=${}",
            cost_10s,
            cost_1s * 10.0
        );
    }

    #[test]
    fn test_video_per_second_cost_google() {
        let calc = CostCalculator::new();
        // Google Veo 3: $0.08/second
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
        // Ollama has no explicit media_pricing entry; the function falls back to
        // the conservative default of $0.04 per standard image.
        let cost = calc.calculate_media_cost(Provider::Ollama, MediaType::ImageStandard, 1);
        assert!(
            (cost - 0.04).abs() < 1e-10,
            "Ollama fallback should use $0.04 default, got ${}",
            cost
        );
    }
}

// H14 — Token-based pricing via CostCalculator::calculate()
#[cfg(test)]
mod tests {
    use crate::core::llm::cost_calculator::CostCalculator;
    use crate::core::llm::Provider;

    // ------------------------------------------------------------------
    // Basic token cost correctness
    // ------------------------------------------------------------------

    #[test]
    fn test_zero_tokens_returns_zero() {
        let calc = CostCalculator::new();
        let cost = calc.calculate(Provider::OpenAI, "gpt-5.2", 0, 0);
        assert_eq!(cost, 0.0, "Zero tokens must produce zero cost");
    }

    #[test]
    fn test_deepseek_chat_cost() {
        let calc = CostCalculator::new();
        // deepseek-chat: $0.28/M input, $0.42/M output
        // 1_000_000 input + 1_000_000 output = $0.28 + $0.42 = $0.70
        let cost = calc.calculate(Provider::DeepSeek, "deepseek-chat", 1_000_000, 1_000_000);
        assert!(
            (cost - 0.70).abs() < 1e-9,
            "Expected $0.70 for deepseek-chat 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_anthropic_sonnet_4_6_cost() {
        let calc = CostCalculator::new();
        // claude-sonnet-4-6: $3.00/M input, $15.00/M output
        // 1_000_000 input + 1_000_000 output = $3.00 + $15.00 = $18.00
        let cost = calc.calculate(
            Provider::Anthropic,
            "claude-sonnet-4-6",
            1_000_000,
            1_000_000,
        );
        assert!(
            (cost - 18.0).abs() < 1e-9,
            "Expected $18.00 for sonnet-4-6 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_anthropic_opus_4_6_cost() {
        let calc = CostCalculator::new();
        // claude-opus-4-6: $5.00/M input, $25.00/M output
        // 1_000_000 + 1_000_000 = $30.00
        let cost = calc.calculate(Provider::Anthropic, "claude-opus-4-6", 1_000_000, 1_000_000);
        assert!(
            (cost - 30.0).abs() < 1e-9,
            "Expected $30.00 for opus-4-6 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_openai_gpt5_cost() {
        let calc = CostCalculator::new();
        // gpt-5: $1.25/M input, $10.00/M output
        let cost = calc.calculate(Provider::OpenAI, "gpt-5", 1_000_000, 1_000_000);
        assert!(
            (cost - 11.25).abs() < 1e-9,
            "Expected $11.25 for gpt-5 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_openai_gpt4o_mini_cost() {
        let calc = CostCalculator::new();
        // gpt-4o-mini: $0.15/M input, $0.60/M output
        let cost = calc.calculate(Provider::OpenAI, "gpt-4o-mini", 1_000_000, 0);
        assert!(
            (cost - 0.15).abs() < 1e-9,
            "Expected $0.15 for gpt-4o-mini 1M input only, got ${}",
            cost
        );
    }

    #[test]
    fn test_google_gemini_flash_cost() {
        let calc = CostCalculator::new();
        // gemini-2.0-flash: $0.10/M input, $0.40/M output
        let cost = calc.calculate(Provider::Google, "gemini-2.0-flash", 1_000_000, 1_000_000);
        assert!(
            (cost - 0.50).abs() < 1e-9,
            "Expected $0.50 for gemini-2.0-flash 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_ollama_always_free() {
        let calc = CostCalculator::new();
        // Ollama default: $0.00/M — local models are free
        let cost = calc.calculate(Provider::Ollama, "llama4-maverick", 1_000_000, 1_000_000);
        assert_eq!(cost, 0.0, "Ollama models must be free, got ${}", cost);
    }

    #[test]
    fn test_zhipu_free_model() {
        let calc = CostCalculator::new();
        // glm-4.6v-flash is $0.00/M (open-source MIT)
        let cost = calc.calculate(Provider::Zhipu, "glm-4.6v-flash", 1_000_000, 1_000_000);
        assert_eq!(cost, 0.0, "glm-4.6v-flash must be free, got ${}", cost);
    }

    #[test]
    fn test_xai_grok4_cost() {
        let calc = CostCalculator::new();
        // grok-4: $3.00/M input, $15.00/M output
        let cost = calc.calculate(Provider::XAI, "grok-4", 1_000_000, 1_000_000);
        assert!(
            (cost - 18.0).abs() < 1e-9,
            "Expected $18.00 for grok-4 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_cost_only_input_tokens() {
        let calc = CostCalculator::new();
        // deepseek-chat: $0.28/M input; 500k input tokens → $0.14
        let cost = calc.calculate(Provider::DeepSeek, "deepseek-chat", 500_000, 0);
        assert!(
            (cost - 0.14).abs() < 1e-9,
            "Expected $0.14 for 500k input-only deepseek-chat, got ${}",
            cost
        );
    }

    #[test]
    fn test_cost_only_output_tokens() {
        let calc = CostCalculator::new();
        // deepseek-chat: $0.42/M output; 1M output → $0.42
        let cost = calc.calculate(Provider::DeepSeek, "deepseek-chat", 0, 1_000_000);
        assert!(
            (cost - 0.42).abs() < 1e-9,
            "Expected $0.42 for 1M output-only deepseek-chat, got ${}",
            cost
        );
    }

    #[test]
    fn test_more_expensive_model_costs_more() {
        let calc = CostCalculator::new();
        let cheap = calc.calculate(Provider::DeepSeek, "deepseek-chat", 100_000, 100_000);
        let expensive = calc.calculate(Provider::Anthropic, "claude-opus-4-6", 100_000, 100_000);
        assert!(
            expensive > cheap,
            "Opus-4-6 (${}) must cost more than deepseek-chat (${}) for equal tokens",
            expensive,
            cheap
        );
    }

    #[test]
    fn test_managed_cloud_falls_through_to_origin_provider() {
        let calc = CostCalculator::new();
        // ManagedCloud with deepseek-chat should match DeepSeek pricing
        let managed = calc.calculate(
            Provider::ManagedCloud,
            "deepseek-chat",
            1_000_000,
            1_000_000,
        );
        let origin = calc.calculate(Provider::DeepSeek, "deepseek-chat", 1_000_000, 1_000_000);
        assert!(
            (managed - origin).abs() < 1e-9,
            "ManagedCloud must proxy deepseek-chat pricing: managed=${managed}, origin=${origin}"
        );
    }

    #[test]
    fn test_unknown_model_uses_provider_default() {
        let calc = CostCalculator::new();
        // A model name not in the pricing map triggers the provider default.
        // DeepSeek default: $0.27/M input, $0.42/M output
        let cost = calc.calculate(Provider::DeepSeek, "unknown-future-model", 1_000_000, 0);
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
        let cost_1m = calc.calculate(Provider::Anthropic, "claude-sonnet-4-6", 1_000_000, 0);
        let cost_2m = calc.calculate(Provider::Anthropic, "claude-sonnet-4-6", 2_000_000, 0);
        assert!(
            (cost_2m - 2.0 * cost_1m).abs() < 1e-9,
            "Cost must scale linearly: 2M tokens (${cost_2m}) must be 2× 1M tokens (${cost_1m})"
        );
    }

    #[test]
    fn test_perplexity_sonar_pro_cost() {
        let calc = CostCalculator::new();
        // sonar-pro: $3.00/M input, $15.00/M output
        let cost = calc.calculate(Provider::Perplexity, "sonar-pro", 1_000_000, 0);
        assert!(
            (cost - 3.0).abs() < 1e-9,
            "Expected $3.00 for sonar-pro 1M input, got ${}",
            cost
        );
    }

    #[test]
    fn test_qwen_max_cost() {
        let calc = CostCalculator::new();
        // qwen-max: $1.20/M input, $6.00/M output
        let cost = calc.calculate(Provider::Qwen, "qwen-max", 1_000_000, 1_000_000);
        assert!(
            (cost - 7.20).abs() < 1e-9,
            "Expected $7.20 for qwen-max 1M+1M tokens, got ${}",
            cost
        );
    }

    #[test]
    fn test_moonshot_kimi_cost() {
        let calc = CostCalculator::new();
        // kimi-k2.5: $0.80/M input, $3.50/M output
        let cost = calc.calculate(Provider::Moonshot, "kimi-k2.5", 1_000_000, 1_000_000);
        assert!(
            (cost - 4.30).abs() < 1e-9,
            "Expected $4.30 for kimi-k2.5 1M+1M tokens, got ${}",
            cost
        );
    }
}
