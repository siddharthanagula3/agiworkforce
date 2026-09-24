//! Why one generation stopped, as a closed set.
//!
//! Every dialect spells the same five outcomes differently: Anthropic says
//! `max_tokens`, OpenAI says `length`, Google says `MAX_TOKENS`, Ollama says
//! `length` on a different field. A consumer that compares the raw string
//! against `"end_turn"` therefore reads one provider correctly and every other
//! one as a normal completion. The decoders below translate each vendor's own
//! vocabulary once, at the point the frame is read, so the rest of the system
//! branches on meaning.
//!
//! [`GenerationStop::Unrecognized`] keeps the raw value rather than folding an
//! unknown reason into the ordinary end of a turn: a reason nobody has taught
//! this crate is not evidence that the answer finished.

use serde::{Deserialize, Serialize};

/// The reason a provider gave for ending a generation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GenerationStop {
    /// The model finished what it had to say.
    EndOfTurn,
    /// The model is calling a tool and expects the results back.
    ToolUse,
    /// The answer reached the maximum number of output tokens and was cut
    /// there. Sending the identical request again reproduces it.
    OutputLimit,
    /// A caller-supplied stop sequence matched.
    StopSequence,
    /// The provider's safety layer stopped the response.
    Refusal,
    /// A reason this crate does not translate, kept verbatim.
    Unrecognized(String),
}

impl GenerationStop {
    /// Anthropic Messages `message_delta.delta.stop_reason`.
    pub fn anthropic(raw: &str) -> Self {
        match raw {
            "end_turn" => Self::EndOfTurn,
            "tool_use" => Self::ToolUse,
            // `model_context_window_exceeded` is Anthropic's newer spelling for
            // a generation cut because the window filled, not a rejected
            // request: the answer stopped at a limit, same as `max_tokens`.
            "max_tokens" | "model_context_window_exceeded" => Self::OutputLimit,
            "stop_sequence" => Self::StopSequence,
            "refusal" => Self::Refusal,
            other => Self::Unrecognized(other.to_string()),
        }
    }

    /// OpenAI-compatible Chat Completions `choices[].finish_reason`.
    pub fn openai_finish_reason(raw: &str) -> Self {
        match raw {
            "stop" => Self::EndOfTurn,
            "tool_calls" | "function_call" => Self::ToolUse,
            "length" | "max_tokens" => Self::OutputLimit,
            "content_filter" => Self::Refusal,
            other => Self::Unrecognized(other.to_string()),
        }
    }

    /// OpenAI Responses terminal `response.status`, or
    /// `response.incomplete_details.reason` when the response is incomplete.
    pub fn openai_responses(raw: &str) -> Self {
        match raw {
            "completed" => Self::EndOfTurn,
            "max_output_tokens" => Self::OutputLimit,
            "content_filter" => Self::Refusal,
            other => Self::Unrecognized(other.to_string()),
        }
    }

    /// Google Gemini `candidates[].finishReason`.
    pub fn gemini_finish_reason(raw: &str) -> Self {
        match raw {
            "STOP" => Self::EndOfTurn,
            "MAX_TOKENS" => Self::OutputLimit,
            // Google splits one refusal across a family of reasons; every one
            // of them is its safety layer stopping the response.
            "SAFETY" | "RECITATION" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII"
            | "IMAGE_SAFETY" => Self::Refusal,
            other => Self::Unrecognized(other.to_string()),
        }
    }

    /// Ollama's `done_reason`, plus the `tool_calls` marker this crate records
    /// when the NDJSON frame carried tool calls.
    pub fn ollama_done_reason(raw: &str) -> Self {
        match raw {
            "stop" => Self::EndOfTurn,
            "tool_calls" => Self::ToolUse,
            "length" => Self::OutputLimit,
            other => Self::Unrecognized(other.to_string()),
        }
    }

    /// The answer was cut at the model's output limit.
    pub fn is_output_limit(&self) -> bool {
        matches!(self, Self::OutputLimit)
    }

    /// The provider's safety layer stopped the response.
    pub fn is_refusal(&self) -> bool {
        matches!(self, Self::Refusal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_dialect_names_its_own_truncation() {
        assert!(GenerationStop::anthropic("max_tokens").is_output_limit());
        assert!(GenerationStop::openai_finish_reason("length").is_output_limit());
        assert!(GenerationStop::openai_responses("max_output_tokens").is_output_limit());
        assert!(GenerationStop::gemini_finish_reason("MAX_TOKENS").is_output_limit());
        assert!(GenerationStop::ollama_done_reason("length").is_output_limit());
    }

    #[test]
    fn every_dialect_names_its_own_refusal() {
        assert!(GenerationStop::anthropic("refusal").is_refusal());
        assert!(GenerationStop::openai_finish_reason("content_filter").is_refusal());
        assert!(GenerationStop::openai_responses("content_filter").is_refusal());
        for google in [
            "SAFETY",
            "RECITATION",
            "BLOCKLIST",
            "PROHIBITED_CONTENT",
            "SPII",
            "IMAGE_SAFETY",
        ] {
            assert!(
                GenerationStop::gemini_finish_reason(google).is_refusal(),
                "{google} is Google stopping the response"
            );
        }
    }

    #[test]
    fn an_ordinary_finish_is_neither_a_limit_nor_a_refusal() {
        for ordinary in [
            GenerationStop::anthropic("end_turn"),
            GenerationStop::openai_finish_reason("stop"),
            GenerationStop::openai_responses("completed"),
            GenerationStop::gemini_finish_reason("STOP"),
            GenerationStop::ollama_done_reason("stop"),
        ] {
            assert_eq!(ordinary, GenerationStop::EndOfTurn);
            assert!(!ordinary.is_output_limit());
            assert!(!ordinary.is_refusal());
        }
    }

    #[test]
    fn a_reason_this_crate_does_not_know_keeps_its_raw_value() {
        assert_eq!(
            GenerationStop::anthropic("pause_turn"),
            GenerationStop::Unrecognized("pause_turn".to_string())
        );
        assert_eq!(
            GenerationStop::gemini_finish_reason("MALFORMED_FUNCTION_CALL"),
            GenerationStop::Unrecognized("MALFORMED_FUNCTION_CALL".to_string())
        );
        assert_eq!(
            GenerationStop::openai_responses("cancelled"),
            GenerationStop::Unrecognized("cancelled".to_string())
        );
        assert!(!GenerationStop::anthropic("pause_turn").is_output_limit());
        assert!(!GenerationStop::anthropic("pause_turn").is_refusal());
    }

    #[test]
    fn tool_use_is_the_turn_continuing_not_the_turn_ending() {
        assert_eq!(
            GenerationStop::anthropic("tool_use"),
            GenerationStop::ToolUse
        );
        assert_eq!(
            GenerationStop::openai_finish_reason("tool_calls"),
            GenerationStop::ToolUse
        );
        assert_eq!(
            GenerationStop::openai_finish_reason("function_call"),
            GenerationStop::ToolUse
        );
        assert_eq!(
            GenerationStop::ollama_done_reason("tool_calls"),
            GenerationStop::ToolUse
        );
    }
}
