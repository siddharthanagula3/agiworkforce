use crate::core::router::{ChatMessage, ContentPart, Provider};
use lazy_static::lazy_static;
use tiktoken_rs::{cl100k_base, CoreBPE};

lazy_static! {
    static ref TOKENIZER: CoreBPE = cl100k_base().unwrap();
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
                            total_tokens += 85; // Low-res estimate placeholder
                        }
                        ContentPart::Video { .. } => {
                            total_tokens += 85; // Placeholder
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
