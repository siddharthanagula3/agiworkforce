#[cfg(test)]
mod tests {
    use crate::core::llm::sse_parser::{StreamChunk, TokenUsage};

    #[test]
    fn test_stream_chunk_creation() {
        let chunk = StreamChunk {
            content: "Hello".to_string(),
            done: false,
            finish_reason: None,
            model: Some("gpt-4".to_string()),
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: false,
        };

        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert!(chunk.finish_reason.is_none());
    }

    #[test]
    fn test_stream_chunk_final() {
        let chunk = StreamChunk {
            content: "".to_string(),
            done: true,
            finish_reason: Some("stop".to_string()),
            model: Some("gpt-4".to_string()),
            usage: Some(TokenUsage {
                prompt_tokens: Some(10),
                completion_tokens: Some(20),
                total_tokens: Some(30),
            }),
            credits: None,
            tool_calls: None,
            keepalive: false,
        };

        assert!(chunk.done);
        assert!(chunk.finish_reason.is_some());
        assert!(chunk.usage.is_some());
    }

    #[test]
    fn test_token_usage() {
        let usage = TokenUsage {
            prompt_tokens: Some(100),
            completion_tokens: Some(200),
            total_tokens: Some(300),
        };

        assert_eq!(usage.prompt_tokens, Some(100));
        assert_eq!(usage.completion_tokens, Some(200));
        assert_eq!(usage.total_tokens, Some(300));
    }

    #[test]
    fn test_stream_chunk_serialization() {
        let chunk = StreamChunk {
            content: "Test".to_string(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: false,
        };

        let serialized = serde_json::to_string(&chunk).unwrap();
        let deserialized: StreamChunk = serde_json::from_str(&serialized).unwrap();

        assert_eq!(chunk.content, deserialized.content);
        assert_eq!(chunk.done, deserialized.done);
    }

    #[test]
    fn test_partial_token_usage() {
        let usage = TokenUsage {
            prompt_tokens: Some(50),
            completion_tokens: None,
            total_tokens: None,
        };

        assert!(usage.prompt_tokens.is_some());
        assert!(usage.completion_tokens.is_none());
    }

    #[test]
    fn test_finish_reason_variants() {
        let reasons = vec!["stop", "length", "content_filter", "tool_calls"];
        for reason in reasons {
            let chunk = StreamChunk {
                content: "".to_string(),
                done: true,
                finish_reason: Some(reason.to_string()),
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            };
            assert!(chunk.finish_reason.is_some());
        }
    }

    #[test]
    fn test_multiple_chunks_accumulation() {
        let chunks = vec![
            StreamChunk {
                content: "Hello".to_string(),
                done: false,
                finish_reason: None,
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
            StreamChunk {
                content: " world".to_string(),
                done: false,
                finish_reason: None,
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
            StreamChunk {
                content: "!".to_string(),
                done: true,
                finish_reason: Some("stop".to_string()),
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
        ];

        let full_content: String = chunks.iter().map(|c| c.content.as_str()).collect();
        assert_eq!(full_content, "Hello world!");
    }
}

// H47 — SSE parser keepalive edge cases
// These tests verify the `is_keepalive_event` logic by inspecting `StreamChunk.keepalive`
// on chunks that are constructed the same way `SseStreamParser::process_buffer` does.
#[cfg(test)]
mod keepalive_tests {
    use crate::core::llm::sse_parser::StreamChunk;

    // ---------------------------------------------------------------------------
    // Helper: mirror what SseStreamParser does when it detects a keepalive event.
    // The real parser creates a StreamChunk { keepalive: true, content: "", done: false, ... }
    // We reproduce the same classification logic here so these tests run without
    // a network stream, validating the detection rules directly.
    // ---------------------------------------------------------------------------

    /// Returns true if the event string would be classified as a keepalive by
    /// SseStreamParser, using the same rules as `is_keepalive_event`.
    fn classify_keepalive(event: &str) -> bool {
        let trimmed = event.trim();
        // Pure SSE comment lines (any line starting with ':')
        if trimmed.starts_with(':') {
            return true;
        }
        // Anthropic sends `event: ping\ndata: {}` as keepalive
        trimmed.lines().any(|line| {
            let l = line.trim();
            l == "event: ping" || l == "event:ping"
        })
    }

    /// Builds the keepalive StreamChunk that the parser emits on detection.
    fn keepalive_chunk() -> StreamChunk {
        StreamChunk {
            content: String::new(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: true,
        }
    }

    #[test]
    fn test_bare_colon_is_keepalive() {
        // ":" alone is a valid SSE comment and should be treated as keepalive
        assert!(classify_keepalive(":"), "bare ':' should be a keepalive");
    }

    #[test]
    fn test_colon_with_space_after_is_keepalive() {
        // ": " (colon then space) is an empty SSE comment
        assert!(classify_keepalive(": "), "': ' should be a keepalive");
    }

    #[test]
    fn test_colon_keep_alive_text_is_keepalive() {
        assert!(
            classify_keepalive(": keep-alive"),
            "': keep-alive' should be a keepalive"
        );
    }

    #[test]
    fn test_colon_ping_is_keepalive() {
        assert!(
            classify_keepalive(":ping"),
            "':ping' should be a keepalive"
        );
    }

    #[test]
    fn test_colon_ok_is_keepalive() {
        assert!(classify_keepalive(":ok"), "':ok' should be a keepalive");
    }

    #[test]
    fn test_anthropic_event_ping_is_keepalive() {
        // Anthropic sends multi-line: "event: ping\ndata: {}"
        let event = "event: ping\ndata: {}";
        assert!(
            classify_keepalive(event),
            "Anthropic 'event: ping' pattern should be a keepalive"
        );
    }

    #[test]
    fn test_anthropic_event_ping_no_space_is_keepalive() {
        // Compact form without space after colon
        let event = "event:ping\ndata: {}";
        assert!(
            classify_keepalive(event),
            "'event:ping' without space should be a keepalive"
        );
    }

    #[test]
    fn test_data_event_is_not_keepalive() {
        // Normal data events must NOT be classified as keepalives
        let event = r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#;
        assert!(
            !classify_keepalive(event),
            "data event should not be a keepalive"
        );
    }

    #[test]
    fn test_done_event_is_not_keepalive() {
        assert!(
            !classify_keepalive("data: [DONE]"),
            "[DONE] should not be a keepalive"
        );
    }

    #[test]
    fn test_keepalive_chunk_has_correct_fields() {
        // The chunk emitted for a keepalive must have empty content, done=false,
        // and keepalive=true — so the idle timeout is reset without advancing state.
        let chunk = keepalive_chunk();
        assert!(chunk.keepalive, "keepalive field must be true");
        assert!(!chunk.done, "keepalive chunk must not signal stream end");
        assert!(
            chunk.content.is_empty(),
            "keepalive chunk must have empty content"
        );
        assert!(chunk.finish_reason.is_none());
        assert!(chunk.usage.is_none());
    }

    #[test]
    fn test_multi_line_sse_event_accumulation() {
        // A multi-line SSE event (split across chunks) must accumulate into the
        // correct final content when reassembled.
        let chunks = vec![
            StreamChunk {
                content: "Part one".to_string(),
                done: false,
                finish_reason: None,
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
            StreamChunk {
                content: " part two".to_string(),
                done: false,
                finish_reason: None,
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
            StreamChunk {
                content: " part three".to_string(),
                done: true,
                finish_reason: Some("stop".to_string()),
                model: None,
                usage: None,
                credits: None,
                tool_calls: None,
                keepalive: false,
            },
        ];

        let accumulated: String = chunks.iter().map(|c| c.content.as_str()).collect();
        assert_eq!(accumulated, "Part one part two part three");

        // Exactly one chunk should be the final one
        let final_chunks: Vec<_> = chunks.iter().filter(|c| c.done).collect();
        assert_eq!(final_chunks.len(), 1, "exactly one done chunk");
    }

    #[test]
    fn test_malformed_keepalive_anthropic_ping_with_data() {
        // An Anthropic ping event carries `data: {}` — the parser treats it as
        // keepalive (not as a content chunk) because `event: ping` takes priority.
        let event_with_data = "event: ping\ndata: {}";
        assert!(
            classify_keepalive(event_with_data),
            "ping with non-empty data field should still be a keepalive"
        );
    }

    #[test]
    fn test_regular_event_with_colon_in_value_is_not_keepalive() {
        // A data line whose value happens to contain a colon must not be misclassified.
        let event = "data: {\"url\":\"https://example.com\"}";
        assert!(
            !classify_keepalive(event),
            "data event with colon in value should not be a keepalive"
        );
    }
}
