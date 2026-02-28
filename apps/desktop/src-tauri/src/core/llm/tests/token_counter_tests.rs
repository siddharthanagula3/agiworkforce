// H20 — TokenCounter tests.
//
// All functions on `TokenCounter` are pure (no network, no DB) so every test
// can run in CI without being `#[ignore]`.  We call the production functions
// directly instead of reimplementing the arithmetic locally.
#[cfg(test)]
mod tests {
    use crate::core::llm::token_counter::{ImageDetail, TokenCounter};
    use crate::core::llm::{ChatMessage, Provider};

    // ------------------------------------------------------------------
    // estimate_text_tokens
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_text_tokens_empty_string_is_zero() {
        assert_eq!(TokenCounter::estimate_text_tokens(""), 0);
    }

    #[test]
    fn test_estimate_text_tokens_very_short_string() {
        // Short strings (< 10 chars) use the fast-path: ceil(len / 3.0)
        let result = TokenCounter::estimate_text_tokens("hi");
        assert!(result > 0, "Short string must produce at least 1 token");
    }

    #[test]
    fn test_estimate_text_tokens_longer_string_uses_tokenizer() {
        // Longer strings use the tiktoken tokenizer
        let text = "The quick brown fox jumps over the lazy dog.";
        let tokens = TokenCounter::estimate_text_tokens(text);
        // Empirically this sentence is ~10 tokens; we just assert it's sane
        assert!(tokens > 5, "Expected at least 5 tokens for a full sentence");
        assert!(
            tokens < 50,
            "Expected fewer than 50 tokens for a short sentence"
        );
    }

    #[test]
    fn test_estimate_text_tokens_longer_than_shorter() {
        let short = TokenCounter::estimate_text_tokens("hello");
        let longer = TokenCounter::estimate_text_tokens(
            "This is a much longer sentence that should have significantly more tokens than a single word.",
        );
        assert!(
            longer > short,
            "A longer string should produce more tokens: short={short}, longer={longer}"
        );
    }

    #[test]
    fn test_estimate_text_tokens_repeated_text_scales() {
        let once = TokenCounter::estimate_text_tokens("Hello world. ");
        let ten = TokenCounter::estimate_text_tokens(&"Hello world. ".repeat(10));
        // 10× the text should produce more tokens than 1× (exact scaling depends on estimator)
        assert!(
            ten > once,
            "10× text should produce more tokens: once={once}, ten={ten}"
        );
        // Should be at least 5× (allowing for sublinear overhead in estimator)
        assert!(
            ten >= once * 5,
            "10× text should produce at least 5× tokens: once={once}, ten={ten}"
        );
    }

    // ------------------------------------------------------------------
    // estimate_image_tokens
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_image_tokens_low_detail_always_85() {
        assert_eq!(
            TokenCounter::estimate_image_tokens(100, 100, ImageDetail::Low),
            85
        );
        assert_eq!(
            TokenCounter::estimate_image_tokens(1920, 1080, ImageDetail::Low),
            85
        );
        assert_eq!(
            TokenCounter::estimate_image_tokens(4000, 3000, ImageDetail::Low),
            85
        );
        // Edge case: zero dimensions with Low detail
        assert_eq!(
            TokenCounter::estimate_image_tokens(0, 0, ImageDetail::Low),
            85
        );
    }

    #[test]
    fn test_estimate_image_tokens_high_detail_512x512() {
        // 512×512: shortest side = 512, scale to 768 → 768×768
        // tiles: ceil(768/512) × ceil(768/512) = 2×2 = 4
        // total: 170 + 85*4 = 510
        assert_eq!(
            TokenCounter::estimate_image_tokens(512, 512, ImageDetail::High),
            510
        );
    }

    #[test]
    fn test_estimate_image_tokens_high_detail_1024x1024() {
        // 1024×1024 → scale shortest (1024) to 768 → 768×768
        // tiles: 2×2 = 4 → 170 + 340 = 510
        assert_eq!(
            TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::High),
            510
        );
    }

    #[test]
    fn test_estimate_image_tokens_high_detail_4000x3000() {
        // 4000×3000 → scale shortest (3000) to 768 → 1024×768
        // 1024 < 2048, so no second scale.  tiles: ceil(1024/512)×ceil(768/512) = 2×2 = 4
        // total: 170 + 85*4 = 510
        assert_eq!(
            TokenCounter::estimate_image_tokens(4000, 3000, ImageDetail::High),
            510
        );
    }

    #[test]
    fn test_estimate_image_tokens_unknown_dimensions_high() {
        // Zero dimensions → conservative default (2×2 tiles = 4)
        assert_eq!(
            TokenCounter::estimate_image_tokens(0, 0, ImageDetail::High),
            170 + 85 * 4 // 510
        );
    }

    #[test]
    fn test_estimate_image_tokens_auto_equals_high() {
        // Auto should behave identically to High
        let auto = TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::Auto);
        let high = TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::High);
        assert_eq!(auto, high, "Auto detail must equal High detail");
    }

    #[test]
    fn test_estimate_image_tokens_high_detail_always_gte_85() {
        // High-detail tokens must be at least as many as Low-detail (85)
        for (w, h) in &[(100u32, 100u32), (512, 512), (1920, 1080), (4096, 4096)] {
            let high = TokenCounter::estimate_image_tokens(*w, *h, ImageDetail::High);
            assert!(
                high >= 85,
                "High-detail tokens ({high}) must be >= Low-detail (85) for {}×{}",
                w,
                h
            );
        }
    }

    // ------------------------------------------------------------------
    // estimate_video_tokens
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_video_tokens_10_seconds() {
        // 10 seconds: 50 overhead + 85*10 = 900
        assert_eq!(TokenCounter::estimate_video_tokens(Some(10)), 900);
    }

    #[test]
    fn test_estimate_video_tokens_long_video_capped_at_60_frames() {
        // 120 seconds > 60-frame cap: 50 + 85*60 = 5150
        assert_eq!(TokenCounter::estimate_video_tokens(Some(120)), 50 + 85 * 60);
    }

    #[test]
    fn test_estimate_video_tokens_exactly_60_seconds() {
        // 60 seconds: 50 + 85*60 = 5150
        assert_eq!(TokenCounter::estimate_video_tokens(Some(60)), 50 + 85 * 60);
    }

    #[test]
    fn test_estimate_video_tokens_one_second() {
        // 1 second: 50 + 85*1 = 135
        assert_eq!(TokenCounter::estimate_video_tokens(Some(1)), 135);
    }

    #[test]
    fn test_estimate_video_tokens_zero_seconds_uses_default() {
        // 0 seconds is treated as unknown → 10-second default: 50 + 85*10 = 900
        assert_eq!(TokenCounter::estimate_video_tokens(Some(0)), 900);
    }

    #[test]
    fn test_estimate_video_tokens_none_uses_default() {
        // None → 10-second default: 900
        assert_eq!(TokenCounter::estimate_video_tokens(None), 900);
    }

    // ------------------------------------------------------------------
    // estimate_prompt_tokens
    // ------------------------------------------------------------------

    fn simple_message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }

    #[test]
    fn test_estimate_prompt_tokens_empty_messages() {
        // No messages → only the reply primer (3 tokens)
        let tokens = TokenCounter::estimate_prompt_tokens(&[]);
        assert_eq!(
            tokens, 3,
            "Empty message list must return reply-primer tokens (3)"
        );
    }

    #[test]
    fn test_estimate_prompt_tokens_single_message() {
        let msgs = [simple_message("user", "Hello")];
        let tokens = TokenCounter::estimate_prompt_tokens(&msgs);
        // At minimum: 3 (per-message) + tokens("user") + tokens("Hello") + 3 (primer) > 3
        assert!(
            tokens > 3,
            "A single message must produce more than the primer alone"
        );
    }

    #[test]
    fn test_estimate_prompt_tokens_grows_with_message_count() {
        let one = [simple_message("user", "Hello")];
        let five: Vec<ChatMessage> = (0..5)
            .map(|i| simple_message("user", &format!("Message {}", i)))
            .collect();

        let one_tokens = TokenCounter::estimate_prompt_tokens(&one);
        let five_tokens = TokenCounter::estimate_prompt_tokens(&five);
        assert!(
            five_tokens > one_tokens,
            "More messages must produce more tokens: one={one_tokens}, five={five_tokens}"
        );
    }

    #[test]
    fn test_estimate_prompt_tokens_longer_content_produces_more_tokens() {
        let short = [simple_message("user", "Hi")];
        let long_content = "This is a very detailed question about quantum computing and its implications for cryptography. ".repeat(5);
        let long = [simple_message("user", &long_content)];

        let short_tokens = TokenCounter::estimate_prompt_tokens(&short);
        let long_tokens = TokenCounter::estimate_prompt_tokens(&long);
        assert!(
            long_tokens > short_tokens,
            "Longer content must produce more tokens: short={short_tokens}, long={long_tokens}"
        );
    }

    // ------------------------------------------------------------------
    // estimate_completion_tokens
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_completion_tokens_empty_is_zero() {
        assert_eq!(TokenCounter::estimate_completion_tokens(""), 0);
    }

    #[test]
    fn test_estimate_completion_tokens_nonempty() {
        let tokens = TokenCounter::estimate_completion_tokens("The answer is 42.");
        assert!(tokens > 0);
    }

    // ------------------------------------------------------------------
    // estimate_total_tokens
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_total_tokens_is_sum() {
        let msgs = [simple_message("user", "What is the capital of France?")];
        let completion = "The capital of France is Paris.";

        let prompt = TokenCounter::estimate_prompt_tokens(&msgs);
        let comp = TokenCounter::estimate_completion_tokens(completion);
        let total = TokenCounter::estimate_total_tokens(&msgs, completion);

        assert_eq!(total, prompt + comp, "Total must equal prompt + completion");
    }

    // ------------------------------------------------------------------
    // estimate_for_provider
    // ------------------------------------------------------------------

    #[test]
    fn test_estimate_for_provider_openai_multiplier_is_1() {
        let msgs = [simple_message("user", "Hello world")];
        let completion = "Hi there!";

        let base_prompt = TokenCounter::estimate_prompt_tokens(&msgs);
        let base_comp = TokenCounter::estimate_completion_tokens(completion);

        let (p, c) = TokenCounter::estimate_for_provider(Provider::OpenAI, &msgs, completion);
        // OpenAI multiplier is 1.0 so values should match base (within rounding)
        assert_eq!(p, base_prompt);
        assert_eq!(c, base_comp);
    }

    #[test]
    fn test_estimate_for_provider_anthropic_multiplier_increases_tokens() {
        let msgs = [simple_message("user", "Hello world")];
        let completion = "Hi there!";

        let (openai_p, _) =
            TokenCounter::estimate_for_provider(Provider::OpenAI, &msgs, completion);
        let (anthropic_p, _) =
            TokenCounter::estimate_for_provider(Provider::Anthropic, &msgs, completion);

        // Anthropic has 1.05× multiplier, so it must be >= OpenAI
        assert!(
            anthropic_p >= openai_p,
            "Anthropic prompt tokens ({anthropic_p}) must be >= OpenAI ({openai_p})"
        );
    }

    #[test]
    fn test_estimate_for_provider_ollama_is_most_conservative() {
        let msgs = [simple_message("user", "Hello world")];
        let completion = "Hi there!";

        let (openai_p, _) =
            TokenCounter::estimate_for_provider(Provider::OpenAI, &msgs, completion);
        let (ollama_p, _) =
            TokenCounter::estimate_for_provider(Provider::Ollama, &msgs, completion);

        // Ollama has 1.10× multiplier — must be >= OpenAI
        assert!(
            ollama_p >= openai_p,
            "Ollama ({ollama_p}) must be >= OpenAI ({openai_p})"
        );
    }

    #[test]
    fn test_estimate_for_provider_google_is_lower_than_openai() {
        let msgs = [simple_message("user", "Hello world")];
        let completion = "Hi there!";

        let (openai_p, _) =
            TokenCounter::estimate_for_provider(Provider::OpenAI, &msgs, completion);
        let (google_p, _) =
            TokenCounter::estimate_for_provider(Provider::Google, &msgs, completion);

        // Google has 0.95× multiplier — must be <= OpenAI
        assert!(
            google_p <= openai_p,
            "Google ({google_p}) must be <= OpenAI ({openai_p})"
        );
    }

    #[test]
    fn test_estimate_for_provider_all_providers_return_positive() {
        let msgs = [simple_message("user", "Test message")];
        let completion = "Test completion";

        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Zhipu,
            Provider::ManagedCloud,
        ];

        for provider in providers {
            let (p, c) = TokenCounter::estimate_for_provider(provider, &msgs, completion);
            assert!(p > 0, "{:?} prompt tokens must be positive", provider);
            assert!(c > 0, "{:?} completion tokens must be positive", provider);
        }
    }

    // ------------------------------------------------------------------
    // ImageDetail enum
    // ------------------------------------------------------------------

    #[test]
    fn test_image_detail_default_is_high() {
        let d = ImageDetail::default();
        assert!(matches!(d, ImageDetail::High));
    }
}
