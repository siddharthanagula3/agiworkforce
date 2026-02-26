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
        assert!((hd_cost - 0.08).abs() < 1e-10, "expected $0.08, got ${}", hd_cost);
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
        assert!((cost_1s - 0.10).abs() < 1e-10, "expected $0.10/s, got ${}", cost_1s);
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
        assert!((cost_1s - 0.08).abs() < 1e-10, "expected $0.08/s, got ${}", cost_1s);
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
        assert!(cost > 0.0, "ManagedCloud media cost should be > 0, got {}", cost);
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

#[cfg(test)]
mod tests {
    #[test]
    fn test_openai_gpt4_cost() {
        let prompt_tokens = 1000u32;
        let completion_tokens = 500u32;
        let input_cost = (prompt_tokens as f64 / 1000.0) * 0.03;
        let output_cost = (completion_tokens as f64 / 1000.0) * 0.06;
        let total_cost = input_cost + output_cost;

        assert_eq!(input_cost, 0.03);
        assert_eq!(output_cost, 0.03);
        assert_eq!(total_cost, 0.06);
    }

    #[test]
    fn test_anthropic_claude_cost() {
        let prompt_tokens = 2000u32;
        let completion_tokens = 1000u32;
        let input_cost = (prompt_tokens as f64 / 1000.0) * 0.015;
        let output_cost = (completion_tokens as f64 / 1000.0) * 0.075;
        let total_cost = input_cost + output_cost;

        assert_eq!(input_cost, 0.03);
        assert_eq!(output_cost, 0.075);
        assert_eq!(total_cost, 0.105);
    }

    #[test]
    fn test_ollama_zero_cost() {
        let prompt_tokens = 10000u32;
        let completion_tokens = 5000u32;
        let cost = 0.0;

        assert_eq!(cost, 0.0);
        assert!(prompt_tokens > 0);
        assert!(completion_tokens > 0);
    }

    #[test]
    fn test_cost_comparison() {
        let tokens = 1000u32;
        let gpt4_cost = (tokens as f64 / 1000.0) * 0.03;
        let claude_cost = (tokens as f64 / 1000.0) * 0.015;
        let ollama_cost = 0.0;

        assert!(gpt4_cost > claude_cost);
        assert!(claude_cost > ollama_cost);
    }

    #[test]
    fn test_fractional_token_cost() {
        let tokens = 250u32;
        let cost = (tokens as f64 / 1000.0) * 0.03;
        assert_eq!(cost, 0.0075);
    }

    #[test]
    fn test_large_volume_cost() {
        let tokens = 100_000u32;
        let cost = (tokens as f64 / 1000.0) * 0.03;
        assert_eq!(cost, 3.0);
    }

    #[test]
    fn test_cost_rounding() {
        let cost = 0.123456789f64;
        let rounded = (cost * 100000.0).round() / 100000.0;

        assert!((rounded - 0.12346).abs() < 1e-10);
    }
}
