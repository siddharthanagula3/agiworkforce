use crate::router::{ChatMessage, Provider};

/// Utility for estimating token usage when providers do not supply usage metadata.
pub struct TokenCounter;

impl TokenCounter {
    /// Estimate the number of tokens consumed by the supplied message history.
    pub fn estimate_prompt_tokens(messages: &[ChatMessage]) -> u32 {
        messages
            .iter()
            .map(|message| Self::estimate_text_tokens(&message.content))
            .sum()
    }

    /// Estimate the number of tokens for a generated completion.
    pub fn estimate_completion_tokens(content: &str) -> u32 {
        Self::estimate_text_tokens(content)
    }

    pub fn estimate_total_tokens(messages: &[ChatMessage], completion: &str) -> u32 {
        Self::estimate_prompt_tokens(messages) + Self::estimate_completion_tokens(completion)
    }

    pub fn estimate_for_provider(
        provider: Provider,
        messages: &[ChatMessage],
        completion: &str,
    ) -> (u32, u32) {
        // Adjust heuristic slightly per provider to reflect average tokenization differences.
        let (prompt_multiplier, completion_multiplier) = match provider {
            Provider::OpenAI => (1.0, 1.0),
            Provider::Anthropic => (1.05, 1.05),
            Provider::Google => (0.95, 0.95),
            Provider::Ollama => (1.10, 1.10),
            Provider::XAI => (1.0, 1.0), // XAI uses similar tokenization to OpenAI
            Provider::DeepSeek => (1.05, 1.05),
            Provider::Qwen => (1.0, 1.0),
            Provider::Mistral => (1.0, 1.0),
            Provider::Moonshot => (1.0, 1.0), // Moonshot uses similar tokenization to OpenAI
        };

        let prompt =
            (Self::estimate_prompt_tokens(messages) as f32 * prompt_multiplier).ceil() as u32;
        let completion = (Self::estimate_completion_tokens(completion) as f32
            * completion_multiplier)
            .ceil() as u32;

        (prompt.max(1), completion.max(1))
    }

    fn estimate_text_tokens(text: &str) -> u32 {
        if text.is_empty() {
            return 0;
        }

        let char_count = text.chars().count() as f64;
        let whitespace = text.chars().filter(|c| c.is_whitespace()).count() as f64;
        let punctuation = text.chars().filter(|c| "!?,.;:\"'`~".contains(*c)).count() as f64;

        // Base heuristic: 4 characters ≈ 1 token.
        let base = char_count / 4.0;
        let whitespace_adjustment = whitespace / 10.0;
        let punctuation_adjustment = punctuation / 15.0;

        ((base + whitespace_adjustment + punctuation_adjustment).ceil() as u32).max(1)
    }
}
