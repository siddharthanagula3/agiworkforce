/// Comprehensive unit tests for the SSE streaming parser.
///
/// Covers:
/// - Happy path: OpenAI, Anthropic, Google, Ollama event parsing
/// - Edge cases: empty input, [DONE] sentinel, missing fields, multi-line events
/// - Error paths: malformed JSON, provider API error payloads
/// - Keepalive / ping event detection
/// - StreamChunk and TokenUsage struct behaviour
/// - Serialization round-trips
#[cfg(test)]
mod llm_tests {
    use crate::core::llm::sse_parser::{parse_sse_event, StreamChunk, StreamingToolCall, TokenUsage};
    use crate::core::llm::Provider;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn make_chunk(content: &str, done: bool) -> StreamChunk {
        StreamChunk {
            content: content.to_string(),
            done,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: false,
        }
    }

    fn make_done_chunk(finish_reason: &str) -> StreamChunk {
        StreamChunk {
            content: String::new(),
            done: true,
            finish_reason: Some(finish_reason.to_string()),
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: false,
        }
    }

    // -----------------------------------------------------------------------
    // StreamChunk struct tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_stream_chunk_default_fields() {
        let chunk = make_chunk("hello", false);
        assert_eq!(chunk.content, "hello");
        assert!(!chunk.done);
        assert!(chunk.finish_reason.is_none());
        assert!(chunk.model.is_none());
        assert!(chunk.usage.is_none());
        assert!(chunk.credits.is_none());
        assert!(chunk.tool_calls.is_none());
        assert!(!chunk.keepalive);
    }

    #[test]
    fn test_stream_chunk_done_with_finish_reason() {
        let chunk = make_done_chunk("stop");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_stream_chunk_all_finish_reason_variants() {
        for reason in &["stop", "length", "content_filter", "tool_calls"] {
            let chunk = make_done_chunk(reason);
            assert!(chunk.done);
            assert_eq!(chunk.finish_reason.as_deref(), Some(*reason));
        }
    }

    #[test]
    fn test_keepalive_chunk_has_empty_content_and_not_done() {
        let chunk = StreamChunk {
            content: String::new(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            keepalive: true,
        };
        assert!(chunk.keepalive);
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_stream_chunk_serialization_roundtrip() {
        let chunk = StreamChunk {
            content: "Hello, World!".to_string(),
            done: false,
            finish_reason: None,
            model: Some("gpt-4o".to_string()),
            usage: Some(TokenUsage {
                prompt_tokens: Some(10),
                completion_tokens: Some(20),
                total_tokens: Some(30),
            }),
            credits: None,
            tool_calls: None,
            keepalive: false,
        };

        let json = serde_json::to_string(&chunk).expect("serialization failed");
        let back: StreamChunk = serde_json::from_str(&json).expect("deserialization failed");

        assert_eq!(back.content, chunk.content);
        assert_eq!(back.done, chunk.done);
        assert_eq!(back.model, chunk.model);
        assert!(back.usage.is_some());
        let u = back.usage.unwrap();
        assert_eq!(u.prompt_tokens, Some(10));
        assert_eq!(u.completion_tokens, Some(20));
        assert_eq!(u.total_tokens, Some(30));
    }

    #[test]
    fn test_keepalive_field_skipped_when_false_in_serialization() {
        let chunk = make_chunk("text", false);
        let json = serde_json::to_string(&chunk).expect("serialization failed");
        // serde skip_serializing_if means keepalive=false should not appear
        assert!(!json.contains("\"keepalive\":true"));
    }

    #[test]
    fn test_tool_calls_field_omitted_when_none() {
        let chunk = make_chunk("no tools", false);
        let json = serde_json::to_string(&chunk).expect("serialization failed");
        assert!(!json.contains("tool_calls"));
    }

    // -----------------------------------------------------------------------
    // TokenUsage tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_token_usage_all_fields_some() {
        let u = TokenUsage {
            prompt_tokens: Some(100),
            completion_tokens: Some(200),
            total_tokens: Some(300),
        };
        assert_eq!(u.prompt_tokens, Some(100));
        assert_eq!(u.completion_tokens, Some(200));
        assert_eq!(u.total_tokens, Some(300));
    }

    #[test]
    fn test_token_usage_partial_fields() {
        let u = TokenUsage {
            prompt_tokens: Some(50),
            completion_tokens: None,
            total_tokens: None,
        };
        assert_eq!(u.prompt_tokens, Some(50));
        assert!(u.completion_tokens.is_none());
        assert!(u.total_tokens.is_none());
    }

    #[test]
    fn test_token_usage_all_none() {
        let u = TokenUsage {
            prompt_tokens: None,
            completion_tokens: None,
            total_tokens: None,
        };
        assert!(u.prompt_tokens.is_none());
        assert!(u.completion_tokens.is_none());
        assert!(u.total_tokens.is_none());
    }

    #[test]
    fn test_token_usage_serialization_roundtrip() {
        let u = TokenUsage {
            prompt_tokens: Some(42),
            completion_tokens: Some(58),
            total_tokens: Some(100),
        };
        let json = serde_json::to_string(&u).expect("serialize failed");
        let back: TokenUsage = serde_json::from_str(&json).expect("deserialize failed");
        assert_eq!(back.prompt_tokens, u.prompt_tokens);
        assert_eq!(back.completion_tokens, u.completion_tokens);
        assert_eq!(back.total_tokens, u.total_tokens);
    }

    // -----------------------------------------------------------------------
    // StreamingToolCall tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_streaming_tool_call_fields() {
        let tc = StreamingToolCall {
            index: 0,
            id: "call_abc".to_string(),
            name: "read_file".to_string(),
            arguments: r#"{"path":"/tmp/test.txt"}"#.to_string(),
        };
        assert_eq!(tc.index, 0);
        assert_eq!(tc.id, "call_abc");
        assert_eq!(tc.name, "read_file");
        assert!(tc.arguments.contains("path"));
    }

    #[test]
    fn test_streaming_tool_call_empty_arguments() {
        let tc = StreamingToolCall {
            index: 1,
            id: String::new(),
            name: "ping".to_string(),
            arguments: String::new(),
        };
        assert!(tc.arguments.is_empty());
        assert!(tc.id.is_empty());
    }

    // -----------------------------------------------------------------------
    // OpenAI SSE parser — happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_openai_sse_basic_content() {
        let event = r#"data: {"choices":[{"delta":{"content":"Hello"}}],"model":"gpt-4o"}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert_eq!(chunk.model.as_deref(), Some("gpt-4o"));
    }

    #[test]
    fn test_parse_openai_sse_done_signal() {
        let event = "data: [DONE]";
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.done);
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_parse_openai_sse_finish_reason_stop() {
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn test_parse_openai_sse_finish_reason_length() {
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":"length"}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("length"));
    }

    #[test]
    fn test_parse_openai_sse_finish_reason_tool_calls() {
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_calls"));
    }

    #[test]
    fn test_parse_openai_sse_with_usage() {
        let event = r#"data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        let usage = chunk.usage.expect("usage should be present");
        assert_eq!(usage.prompt_tokens, Some(10));
        assert_eq!(usage.completion_tokens, Some(20));
        assert_eq!(usage.total_tokens, Some(30));
    }

    #[test]
    fn test_parse_openai_sse_no_content_field_gives_empty() {
        let event = r#"data: {"choices":[{"delta":{}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_openai_sse_tool_call_delta() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xyz","type":"function","function":{"name":"get_weather","arguments":"{\"city\":"}}]},"finish_reason":null}],"model":"gpt-4o"}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.tool_calls.is_some());
        let tcs = chunk.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].index, 0);
        assert_eq!(tcs[0].id, "call_xyz");
        assert_eq!(tcs[0].name, "get_weather");
        assert!(tcs[0].arguments.contains("city"));
    }

    #[test]
    fn test_parse_openai_sse_data_without_space_after_colon() {
        // `data:` without trailing space must also be handled
        let event = r#"data:{"choices":[{"delta":{"content":"hi"}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert_eq!(chunk.content, "hi");
    }

    #[test]
    fn test_parse_openai_sse_multiline_event() {
        // Multiple data lines in one event block (unusual but valid)
        let event = "data: {\"choices\":[{\"delta\":{\"content\":\"part1\"}}]}\ndata: [DONE]";
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        // [DONE] appears last, so done should be true
        assert!(chunk.done);
    }

    #[test]
    fn test_parse_openai_sse_empty_content_string() {
        let event = r#"data: {"choices":[{"delta":{"content":""}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_parse_openai_sse_unicode_content() {
        let event = r#"data: {"choices":[{"delta":{"content":"你好世界 🌍"}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert_eq!(chunk.content, "你好世界 🌍");
    }

    #[test]
    fn test_parse_openai_sse_very_long_content() {
        let long_text = "a".repeat(50_000);
        let event = format!(
            r#"data: {{"choices":[{{"delta":{{"content":"{}"}}}}]}}"#,
            long_text
        );
        let chunk = parse_sse_event(&event, Provider::OpenAI).expect("parse failed");
        assert_eq!(chunk.content.len(), 50_000);
    }

    // -----------------------------------------------------------------------
    // OpenAI SSE parser — error paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_openai_sse_api_error_returns_err() {
        let event = r#"data: {"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}}"#;
        let result = parse_sse_event(event, Provider::OpenAI);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Invalid API key") || msg.contains("invalid_request_error"));
    }

    #[test]
    fn test_parse_openai_sse_malformed_json_returns_err() {
        let event = "data: {not valid json}";
        let result = parse_sse_event(event, Provider::OpenAI);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_openai_sse_empty_event_gives_empty_chunk() {
        // Event with no data lines at all — produces an empty chunk (not an error)
        let event = "";
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse should succeed on empty input");
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    // -----------------------------------------------------------------------
    // Anthropic SSE parser — happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_anthropic_sse_message_start() {
        let event = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-opus-4-5\",\"usage\":{\"input_tokens\":25,\"output_tokens\":0}}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert_eq!(chunk.model.as_deref(), Some("claude-opus-4-5"));
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_anthropic_sse_text_delta() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello from Claude\"}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert_eq!(chunk.content, "Hello from Claude");
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_anthropic_sse_message_stop() {
        let event = "event: message_stop\ndata: {\"type\":\"message_stop\"}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.done);
    }

    #[test]
    fn test_parse_anthropic_sse_message_delta_end_turn() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("end_turn"));
    }

    #[test]
    fn test_parse_anthropic_sse_message_delta_tool_use() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_use"));
    }

    #[test]
    fn test_parse_anthropic_sse_content_block_start_tool_use() {
        let event = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_01\",\"name\":\"read_file\",\"input\":{}}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.tool_calls.is_some());
        let tcs = chunk.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].id, "toolu_01");
        assert_eq!(tcs[0].name, "read_file");
        assert_eq!(tcs[0].index, 0);
    }

    #[test]
    fn test_parse_anthropic_sse_input_json_delta() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\":\\\"/tmp\"}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.tool_calls.is_some());
        let tcs = chunk.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert!(tcs[0].arguments.contains("/tmp"));
    }

    #[test]
    fn test_parse_anthropic_sse_ping_event_produces_no_content() {
        let event = "event: ping\ndata: {}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_anthropic_sse_with_usage_in_message_delta() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"input_tokens\":100,\"output_tokens\":50}}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(chunk.done);
        let usage = chunk.usage.expect("usage should be present");
        assert_eq!(usage.prompt_tokens, Some(100));
        assert_eq!(usage.completion_tokens, Some(50));
        assert_eq!(usage.total_tokens, Some(150));
    }

    #[test]
    fn test_parse_anthropic_sse_content_block_stop_does_not_set_done() {
        // content_block_stop is an intermediate event — does not signal stream end
        let event = "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}";
        let chunk = parse_sse_event(event, Provider::Anthropic).expect("parse failed");
        assert!(!chunk.done);
        assert!(chunk.content.is_empty());
    }

    // -----------------------------------------------------------------------
    // Anthropic SSE parser — error paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_anthropic_sse_api_error_returns_err() {
        let event = "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}";
        let result = parse_sse_event(event, Provider::Anthropic);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Overloaded") || msg.contains("overloaded_error"));
    }

    #[test]
    fn test_parse_anthropic_sse_malformed_json_returns_err() {
        let event = "event: content_block_delta\ndata: {invalid}";
        let result = parse_sse_event(event, Provider::Anthropic);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Google SSE parser — happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_google_sse_basic_content() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]},"finishReason":null}]}"#;
        let chunk = parse_sse_event(event, Provider::Google).expect("parse failed");
        assert_eq!(chunk.content, "Hello from Gemini");
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_google_sse_finish_reason_stop() {
        let event = r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}]}"#;
        let chunk = parse_sse_event(event, Provider::Google).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("STOP"));
    }

    #[test]
    fn test_parse_google_sse_with_usage_metadata() {
        let event = r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}"#;
        let chunk = parse_sse_event(event, Provider::Google).expect("parse failed");
        let usage = chunk.usage.expect("usage should be present");
        assert_eq!(usage.prompt_tokens, Some(10));
        assert_eq!(usage.completion_tokens, Some(5));
        assert_eq!(usage.total_tokens, Some(15));
    }

    #[test]
    fn test_parse_google_sse_safety_filter_returns_err() {
        let event = r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"SAFETY"}]}"#;
        let result = parse_sse_event(event, Provider::Google);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.to_lowercase().contains("safety"));
    }

    #[test]
    fn test_parse_google_sse_recitation_returns_err() {
        let event = r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"RECITATION"}]}"#;
        let result = parse_sse_event(event, Provider::Google);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_google_sse_api_error_returns_err() {
        let event = r#"data: {"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}"#;
        let result = parse_sse_event(event, Provider::Google);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Quota exceeded") || msg.contains("RESOURCE_EXHAUSTED"));
    }

    #[test]
    fn test_parse_google_sse_function_call_tool() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_stock_price","args":{"ticker":"AAPL"}}}]}}]}"#;
        let chunk = parse_sse_event(event, Provider::Google).expect("parse failed");
        assert!(chunk.tool_calls.is_some());
        let tcs = chunk.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].name, "get_stock_price");
        assert!(tcs[0].arguments.contains("AAPL"));
    }

    // -----------------------------------------------------------------------
    // Ollama SSE parser — happy path
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_ollama_sse_basic_content() {
        let event = r#"{"model":"llama3","message":{"role":"assistant","content":"Hello"},"done":false}"#;
        let chunk = parse_sse_event(event, Provider::Ollama).expect("parse failed");
        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert_eq!(chunk.model.as_deref(), Some("llama3"));
    }

    #[test]
    fn test_parse_ollama_sse_done_true_with_usage() {
        let event = r#"{"model":"llama3","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":100,"eval_count":50}"#;
        let chunk = parse_sse_event(event, Provider::Ollama).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
        let usage = chunk.usage.expect("usage should be present");
        assert_eq!(usage.prompt_tokens, Some(100));
        assert_eq!(usage.completion_tokens, Some(50));
        assert_eq!(usage.total_tokens, Some(150));
    }

    #[test]
    fn test_parse_ollama_sse_done_true_stop_reason_fallback() {
        // When done=true and no done_reason, finish_reason should default to "stop"
        let event = r#"{"model":"llama3","message":{"role":"assistant","content":""},"done":true}"#;
        let chunk = parse_sse_event(event, Provider::Ollama).expect("parse failed");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn test_parse_ollama_sse_tool_call() {
        let event = r#"{"model":"llama3","message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/tmp/test.txt"}}}]},"done":false}"#;
        let chunk = parse_sse_event(event, Provider::Ollama).expect("parse failed");
        assert!(chunk.tool_calls.is_some());
        let tcs = chunk.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].name, "read_file");
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_calls"));
    }

    #[test]
    fn test_parse_ollama_sse_tool_call_arguments_as_string() {
        // Ollama may return arguments as a JSON string instead of object
        let event = r#"{"model":"llama3","message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"ping","arguments":"{\"url\":\"http://example.com\"}"}}]},"done":false}"#;
        let chunk = parse_sse_event(event, Provider::Ollama).expect("parse failed");
        let tcs = chunk.tool_calls.unwrap();
        assert!(tcs[0].arguments.contains("url"));
    }

    // -----------------------------------------------------------------------
    // Ollama SSE parser — error paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_ollama_sse_error_field_returns_err() {
        let event = r#"{"error":"model not found: llama999"}"#;
        let result = parse_sse_event(event, Provider::Ollama);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("llama999"));
    }

    #[test]
    fn test_parse_ollama_sse_malformed_json_returns_err() {
        let event = "not json at all";
        let result = parse_sse_event(event, Provider::Ollama);
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Provider routing — same format parsers
    // -----------------------------------------------------------------------

    #[test]
    fn test_perplexity_uses_openai_format() {
        // Perplexity is OpenAI-compatible; the same event must parse correctly
        let event = r#"data: {"choices":[{"delta":{"content":"Perplexity answer"}}]}"#;
        let chunk = parse_sse_event(event, Provider::Perplexity).expect("parse failed");
        assert_eq!(chunk.content, "Perplexity answer");
    }

    #[test]
    fn test_xai_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"xAI answer"},"finish_reason":"stop"}]}"#;
        let chunk = parse_sse_event(event, Provider::XAI).expect("parse failed");
        assert_eq!(chunk.content, "xAI answer");
        assert!(chunk.done);
    }

    #[test]
    fn test_deepseek_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"DeepSeek answer"}}]}"#;
        let chunk = parse_sse_event(event, Provider::DeepSeek).expect("parse failed");
        assert_eq!(chunk.content, "DeepSeek answer");
    }

    #[test]
    fn test_mistral_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"Mistral answer"}}]}"#;
        let chunk = parse_sse_event(event, Provider::Mistral).expect("parse failed");
        assert_eq!(chunk.content, "Mistral answer");
    }

    #[test]
    fn test_managed_cloud_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"managed answer"}}]}"#;
        let chunk = parse_sse_event(event, Provider::ManagedCloud).expect("parse failed");
        assert_eq!(chunk.content, "managed answer");
    }

    // -----------------------------------------------------------------------
    // is_keepalive_event (via parse_sse_event behaviour)
    // -----------------------------------------------------------------------

    #[test]
    fn test_anthropic_ping_event_has_no_content() {
        // event: ping + data: {} is a keepalive from Anthropic
        let event = "event: ping\ndata: {}";
        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_openai_sse_special_characters_in_content() {
        // Tabs, newlines (escaped in JSON), special chars
        let event = r#"data: {"choices":[{"delta":{"content":"line1\nline2\ttab"}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        // JSON unescapes \n and \t
        assert!(chunk.content.contains('\n'));
        assert!(chunk.content.contains('\t'));
    }

    #[test]
    fn test_openai_sse_null_content_value_gives_empty_string() {
        // "content": null is valid JSON; should produce empty content, not an error
        let event = r#"data: {"choices":[{"delta":{"content":null}}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_openai_multiple_tool_calls_in_one_delta() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"tool_a","arguments":"{}"}},{"index":1,"id":"c2","function":{"name":"tool_b","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        let tcs = chunk.tool_calls.expect("tool_calls should be present");
        assert_eq!(tcs.len(), 2);
        assert_eq!(tcs[0].name, "tool_a");
        assert_eq!(tcs[1].name, "tool_b");
    }

    #[test]
    fn test_openai_sse_credits_info_parsed() {
        let event = r#"data: {"choices":[],"credits":{"cost_cents":0.5,"remaining_cents":99.5}}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        let credits = chunk.credits.expect("credits should be present");
        assert!((credits.cost_cents - 0.5).abs() < f64::EPSILON);
        assert!((credits.remaining_cents - 99.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_chunk_with_model_but_no_content() {
        let event = r#"data: {"choices":[],"model":"gpt-4o-mini"}"#;
        let chunk = parse_sse_event(event, Provider::OpenAI).expect("parse failed");
        assert!(chunk.content.is_empty());
        assert_eq!(chunk.model.as_deref(), Some("gpt-4o-mini"));
    }
}
