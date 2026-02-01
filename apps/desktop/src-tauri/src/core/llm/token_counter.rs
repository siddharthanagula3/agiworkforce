use crate::core::llm::{ChatMessage, ContentPart, Provider};
use lazy_static::lazy_static;
use tiktoken_rs::{cl100k_base, CoreBPE};

lazy_static! {
    static ref TOKENIZER: CoreBPE = cl100k_base().unwrap();
}

/// Image detail level for token calculation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ImageDetail {
    /// Low resolution: 512x512, always 85 tokens
    Low,
    /// High resolution: up to 2048x2048, variable tokens based on tiles
    #[default]
    High,
    /// Auto: let the model decide (defaults to high for calculation)
    Auto,
}

#[derive(Clone)]
pub struct TokenCounter;

impl Default for TokenCounter {
    fn default() -> Self {
        Self::new()
    }
}

impl TokenCounter {
    pub fn new() -> Self {
        Self
    }

    /// Estimate tokens for a single string using cl100k_base (GPT-4/3.5 standard)
    pub fn estimate_text_tokens(text: &str) -> u32 {
        if text.is_empty() {
            return 0;
        }

        // Fast path for very short strings
        if text.len() < 10 {
            return (text.len() as f64 / 3.0).ceil() as u32;
        }

        // tiktoken's encode_with_special_tokens returns Vec<usize> directly, not Result
        let tokens = TOKENIZER.encode_with_special_tokens(text);
        tokens.len() as u32
    }

    /// Calculate tokens for an image based on its dimensions and detail level
    ///
    /// Based on OpenAI's token calculation:
    /// - Low detail: Always 85 tokens (image is resized to 512x512)
    /// - High detail: 170 base + 85 tokens per 512x512 tile
    ///
    /// For high detail:
    /// 1. Scale image so shortest side is 768px
    /// 2. Scale down so longest side is at most 2048px
    /// 3. Calculate tiles (512x512 each)
    /// 4. Total = 170 + (85 * tiles)
    pub fn estimate_image_tokens(width: u32, height: u32, detail: ImageDetail) -> u32 {
        const LOW_RES_TOKENS: u32 = 85;
        const HIGH_RES_BASE: u32 = 170;
        const TOKENS_PER_TILE: u32 = 85;
        const TILE_SIZE: u32 = 512;
        const SHORT_SIDE_TARGET: u32 = 768;
        const LONG_SIDE_MAX: u32 = 2048;

        match detail {
            ImageDetail::Low => LOW_RES_TOKENS,
            ImageDetail::High | ImageDetail::Auto => {
                if width == 0 || height == 0 {
                    // Unknown dimensions, use conservative estimate
                    return HIGH_RES_BASE + TOKENS_PER_TILE * 4; // Assume 2x2 tiles
                }

                let (mut w, mut h) = (width as f64, height as f64);

                // Step 1: Scale so shortest side is 768px
                let short_side = w.min(h);
                if short_side > 0.0 {
                    let scale = SHORT_SIDE_TARGET as f64 / short_side;
                    w *= scale;
                    h *= scale;
                }

                // Step 2: Scale down if longest side exceeds 2048
                let long_side = w.max(h);
                if long_side > LONG_SIDE_MAX as f64 {
                    let scale = LONG_SIDE_MAX as f64 / long_side;
                    w *= scale;
                    h *= scale;
                }

                // Step 3: Calculate number of 512x512 tiles
                let tiles_w = (w / TILE_SIZE as f64).ceil() as u32;
                let tiles_h = (h / TILE_SIZE as f64).ceil() as u32;
                let total_tiles = tiles_w * tiles_h;

                // Step 4: Calculate total tokens
                HIGH_RES_BASE + (TOKENS_PER_TILE * total_tiles)
            }
        }
    }

    /// Estimate tokens for video content
    ///
    /// Video token estimation based on frame sampling:
    /// - Assumes 1 frame per second for analysis
    /// - Each frame treated as a low-res image (85 tokens)
    /// - Add overhead for temporal context
    pub fn estimate_video_tokens(duration_secs: Option<u32>) -> u32 {
        const TOKENS_PER_FRAME: u32 = 85;
        const TEMPORAL_OVERHEAD: u32 = 50;

        match duration_secs {
            Some(secs) if secs > 0 => {
                // Sample ~1 frame per second, capped at 60 frames
                let frames = secs.min(60);
                TEMPORAL_OVERHEAD + (TOKENS_PER_FRAME * frames)
            }
            _ => {
                // Unknown duration, assume 10 seconds
                TEMPORAL_OVERHEAD + (TOKENS_PER_FRAME * 10)
            }
        }
    }

    /// Estimate tokens for a chat prompt typically used in OpenAI-like APIs
    /// This is a rough approximation of the ChatML format overhead.
    pub fn estimate_prompt_tokens(messages: &[ChatMessage]) -> u32 {
        let mut total_tokens = 0;

        // Per-message overhead (approximate for GPT-4)
        // <|im_start|>role\ncontent<|im_end|>\n
        let tokens_per_message = 3;

        for message in messages {
            total_tokens += tokens_per_message;
            total_tokens += Self::estimate_text_tokens(&message.role);

            if let Some(multimodal) = &message.multimodal_content {
                for part in multimodal {
                    match part {
                        ContentPart::Text { text } => {
                            total_tokens += Self::estimate_text_tokens(text);
                        }
                        ContentPart::Image { .. } => {
                            // Default to high-res estimate without dimensions
                            // In practice, the caller should use estimate_image_tokens directly
                            // when dimensions are known
                            total_tokens += Self::estimate_image_tokens(0, 0, ImageDetail::High);
                        }
                        ContentPart::Video { .. } => {
                            // Default video estimate without duration
                            total_tokens += Self::estimate_video_tokens(None);
                        }
                        ContentPart::Audio { .. } => {
                            // Audio tokens estimated at ~25 tokens per second of audio
                            // Default to 10 seconds estimate
                            total_tokens += 250;
                        }
                        ContentPart::Document { .. } => {
                            // Documents vary greatly, estimate at ~1000 tokens per page
                            // Default to 5 pages
                            total_tokens += 5000;
                        }
                        ContentPart::ToolUse { .. } | ContentPart::ToolResult { .. } => {
                            // Tool use and result blocks are typically structured JSON
                            // Estimate conservatively
                            total_tokens += 200;
                        }
                    }
                }
            } else {
                total_tokens += Self::estimate_text_tokens(&message.content);
            }
        }

        total_tokens += 3; // Reply primer: <|im_start|>assistant<|message|>
        total_tokens
    }

    pub fn estimate_completion_tokens(text: &str) -> u32 {
        Self::estimate_text_tokens(text)
    }

    pub fn estimate_total_tokens(messages: &[ChatMessage], completion: &str) -> u32 {
        Self::estimate_prompt_tokens(messages) + Self::estimate_completion_tokens(completion)
    }

    pub fn estimate_for_provider(
        provider: Provider,
        messages: &[ChatMessage],
        completion: &str,
    ) -> (u32, u32) {
        let (prompt_multiplier, completion_multiplier) = match provider {
            Provider::OpenAI => (1.0, 1.0),
            Provider::Anthropic => (1.05, 1.05), // Higher due to different specialized tokenizer
            Provider::Google => (0.95, 0.95),    // Gemini often uses fewer tokens
            Provider::Ollama => (1.10, 1.10),    // Conservative for Llama types
            Provider::Perplexity => (1.0, 1.0),
            Provider::XAI => (1.0, 1.0),
            Provider::DeepSeek => (1.05, 1.05),
            Provider::Qwen => (1.0, 1.0),
            Provider::Moonshot => (1.0, 1.0),
            Provider::Zhipu => (1.0, 1.0), // ZhipuAI uses similar tokenization
            Provider::ManagedCloud => (1.0, 1.0),
        };

        let prompt_base = Self::estimate_prompt_tokens(messages) as f64;
        let completion_base = Self::estimate_completion_tokens(completion) as f64;

        (
            (prompt_base * prompt_multiplier).ceil() as u32,
            (completion_base * completion_multiplier).ceil() as u32,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_tokens_low_detail() {
        // Low detail is always 85 tokens regardless of dimensions
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
    }

    #[test]
    fn test_image_tokens_high_detail_small_image() {
        // 512x512 image gets scaled up so shortest side is 768
        // 512 * (768/512) = 768 -> becomes 768x768
        // ceil(768/512) x ceil(768/512) = 2x2 = 4 tiles
        // Total: 170 + 85*4 = 510
        let tokens = TokenCounter::estimate_image_tokens(512, 512, ImageDetail::High);
        assert_eq!(tokens, 510);
    }

    #[test]
    fn test_image_tokens_high_detail_medium_image() {
        // 1024x1024 scaled to 768 shortest side, then tiles calculated
        // After scaling: ~768x768, needs 2x2 tiles = 170 + 85*4 = 510
        let tokens = TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::High);
        assert_eq!(tokens, 510);
    }

    #[test]
    fn test_image_tokens_high_detail_large_image() {
        // Very large image gets scaled down to fit within 2048 max
        // 4000x3000 -> scale shortest (3000) to 768 -> 1024x768
        // -> within 2048 limit -> tiles: 2x2 = 4 -> 170 + 85*4 = 510
        let tokens = TokenCounter::estimate_image_tokens(4000, 3000, ImageDetail::High);
        assert_eq!(tokens, 510);
    }

    #[test]
    fn test_image_tokens_unknown_dimensions() {
        // Zero dimensions should give conservative estimate (2x2 tiles)
        let tokens = TokenCounter::estimate_image_tokens(0, 0, ImageDetail::High);
        assert_eq!(tokens, 170 + 85 * 4); // 510
    }

    #[test]
    fn test_image_tokens_auto_uses_high() {
        // Auto should behave like High
        let auto_tokens = TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::Auto);
        let high_tokens = TokenCounter::estimate_image_tokens(1024, 1024, ImageDetail::High);
        assert_eq!(auto_tokens, high_tokens);
    }

    #[test]
    fn test_video_tokens_with_duration() {
        // 10 seconds = 50 overhead + 85*10 = 900
        let tokens = TokenCounter::estimate_video_tokens(Some(10));
        assert_eq!(tokens, 900);
    }

    #[test]
    fn test_video_tokens_long_video_capped() {
        // 120 seconds should be capped at 60 frames
        let tokens = TokenCounter::estimate_video_tokens(Some(120));
        assert_eq!(tokens, 50 + 85 * 60); // 5150
    }

    #[test]
    fn test_video_tokens_unknown_duration() {
        // Unknown duration assumes 10 seconds
        let tokens = TokenCounter::estimate_video_tokens(None);
        assert_eq!(tokens, 50 + 85 * 10); // 900
    }

    #[test]
    fn test_text_tokens_empty() {
        assert_eq!(TokenCounter::estimate_text_tokens(""), 0);
    }

    #[test]
    fn test_text_tokens_short() {
        // Short strings use approximation
        let tokens = TokenCounter::estimate_text_tokens("hello");
        assert!(tokens > 0);
    }

    #[test]
    fn test_text_tokens_longer() {
        // Longer strings use actual tokenizer
        let tokens = TokenCounter::estimate_text_tokens(
            "This is a longer sentence that should be tokenized properly.",
        );
        assert!(tokens > 10);
    }
}
