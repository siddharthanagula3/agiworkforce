#[cfg(test)]
mod tests {
    use crate::router::sse_parser::{StreamChunk, TokenUsage};

    #[test]
    fn test_stream_chunk_creation() {
        let chunk = StreamChunk {
            content: "Hello".to_string(),
            done: false,
            finish_reason: None,
            model: Some("gpt-4".to_string()),
            usage: None,
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
            },
            StreamChunk {
                content: " world".to_string(),
                done: false,
                finish_reason: None,
                model: None,
                usage: None,
            },
            StreamChunk {
                content: "!".to_string(),
                done: true,
                finish_reason: Some("stop".to_string()),
                model: None,
                usage: None,
            },
        ];

        let full_content: String = chunks.iter().map(|c| c.content.as_str()).collect();
        assert_eq!(full_content, "Hello world!");
    }
}
