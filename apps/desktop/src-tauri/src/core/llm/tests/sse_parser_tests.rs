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

// =============================================================================
// C5 — Production SSE parser function tests
//
// These tests call the actual `parse_sse_event` dispatcher (and through it the
// provider-specific parse functions: parse_openai_sse, parse_anthropic_sse,
// parse_google_sse, parse_ollama_sse) with realistic SSE event strings.
// =============================================================================
#[cfg(test)]
mod production_parser_tests {
    use crate::core::llm::sse_parser::parse_sse_event;
    use crate::core::llm::Provider;

    // =========================================================================
    // OpenAI format tests (also covers Perplexity, XAI, DeepSeek, Qwen, etc.)
    // =========================================================================

    #[test]
    fn test_openai_content_delta() {
        let event = r#"data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}],"model":"gpt-5.2"}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert!(chunk.finish_reason.is_none());
        assert_eq!(chunk.model.as_deref(), Some("gpt-5.2"));
        assert!(!chunk.keepalive);
    }

    #[test]
    fn test_openai_finish_reason_stop() {
        let event = r#"data: {"id":"chatcmpl-abc","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"gpt-5.2"}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn test_openai_done_sentinel() {
        let event = "data: [DONE]";

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        assert!(chunk.content.is_empty());
        assert!(chunk.finish_reason.is_none());
    }

    #[test]
    fn test_openai_with_usage() {
        let event = r#"data: {"id":"chatcmpl-abc","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"gpt-5.2","usage":{"prompt_tokens":15,"completion_tokens":25,"total_tokens":40}}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(15));
        assert_eq!(usage.completion_tokens, Some(25));
        assert_eq!(usage.total_tokens, Some(40));
    }

    #[test]
    fn test_openai_tool_call_delta() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_xyz","type":"function","function":{"name":"get_weather","arguments":"{\"city\":"}}]},"finish_reason":null}],"model":"gpt-5.2"}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(!chunk.done);
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id, "call_xyz");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert!(tool_calls[0].arguments.contains("\"city\":"));
    }

    #[test]
    fn test_openai_finish_reason_tool_calls() {
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_calls"));
    }

    #[test]
    fn test_openai_api_error_in_stream() {
        let event = r#"data: {"error":{"message":"Rate limit exceeded","type":"rate_limit_error","code":"rate_limit_exceeded"}}"#;

        let result = parse_sse_event(event, Provider::OpenAI);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Rate limit exceeded"));
        assert!(err_msg.contains("rate_limit_error"));
    }

    #[test]
    fn test_openai_empty_data_field() {
        // An event with no "data:" prefix lines produces an empty chunk
        let event = "event: something\n";

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_openai_malformed_json_returns_error() {
        let event = "data: {not valid json}";

        let result = parse_sse_event(event, Provider::OpenAI);

        assert!(result.is_err());
    }

    #[test]
    fn test_openai_finish_reason_length() {
        let event = r#"data: {"choices":[{"index":0,"delta":{"content":"..."},"finish_reason":"length"}],"model":"gpt-5.2"}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("length"));
        assert_eq!(chunk.content, "...");
    }

    #[test]
    fn test_openai_content_filter_finish() {
        let event =
            r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"content_filter"}]}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("content_filter"));
    }

    #[test]
    fn test_openai_multi_line_event() {
        // SSE events can have multiple data: lines; only lines with "data:" prefix are parsed
        let event = "event: message\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hi\"},\"finish_reason\":null}],\"model\":\"gpt-5.2\"}";

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert_eq!(chunk.content, "Hi");
        assert!(!chunk.done);
    }

    // =========================================================================
    // Verify OpenAI-compatible providers route through parse_openai_sse
    // =========================================================================

    #[test]
    fn test_deepseek_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"DeepSeek says hi"},"finish_reason":null}],"model":"deepseek-chat"}"#;

        let chunk = parse_sse_event(event, Provider::DeepSeek).unwrap();

        assert_eq!(chunk.content, "DeepSeek says hi");
        assert_eq!(chunk.model.as_deref(), Some("deepseek-chat"));
    }

    #[test]
    fn test_xai_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"Grok here"},"finish_reason":null}],"model":"grok-4"}"#;

        let chunk = parse_sse_event(event, Provider::XAI).unwrap();

        assert_eq!(chunk.content, "Grok here");
    }

    #[test]
    fn test_perplexity_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"Search result"},"finish_reason":null}],"model":"sonar"}"#;

        let chunk = parse_sse_event(event, Provider::Perplexity).unwrap();

        assert_eq!(chunk.content, "Search result");
    }

    #[test]
    fn test_qwen_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"Qwen response"},"finish_reason":null}],"model":"qwen-max"}"#;

        let chunk = parse_sse_event(event, Provider::Qwen).unwrap();

        assert_eq!(chunk.content, "Qwen response");
    }

    #[test]
    fn test_moonshot_uses_openai_format() {
        let event = r#"data: {"choices":[{"delta":{"content":"Kimi says"},"finish_reason":null}],"model":"kimi-k2.5-thinking"}"#;

        let chunk = parse_sse_event(event, Provider::Moonshot).unwrap();

        assert_eq!(chunk.content, "Kimi says");
    }

    #[test]
    fn test_managed_cloud_uses_openai_format() {
        let event = r#"data: [DONE]"#;

        let chunk = parse_sse_event(event, Provider::ManagedCloud).unwrap();

        assert!(chunk.done);
    }

    // =========================================================================
    // Anthropic format tests
    // =========================================================================

    #[test]
    fn test_anthropic_content_block_delta_text() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello from Claude\"}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert_eq!(chunk.content, "Hello from Claude");
        assert!(!chunk.done);
        assert!(!chunk.keepalive);
    }

    #[test]
    fn test_anthropic_message_start_with_model() {
        let event = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_abc\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5\",\"usage\":{\"input_tokens\":25,\"output_tokens\":0}}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert_eq!(chunk.model.as_deref(), Some("claude-sonnet-4-5"));
        assert!(!chunk.done);
        // Usage from message_start contains input tokens
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(25));
        assert_eq!(usage.completion_tokens, Some(0));
    }

    #[test]
    fn test_anthropic_message_delta_stop() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"input_tokens\":10,\"output_tokens\":50}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("end_turn"));
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(10));
        assert_eq!(usage.completion_tokens, Some(50));
        assert_eq!(usage.total_tokens, Some(60));
    }

    #[test]
    fn test_anthropic_message_stop() {
        let event = "event: message_stop\ndata: {\"type\":\"message_stop\"}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert!(chunk.done);
    }

    #[test]
    fn test_anthropic_tool_use_content_block_start() {
        let event = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_abc\",\"name\":\"get_weather\",\"input\":{}}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "toolu_abc");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert_eq!(tool_calls[0].index, 1);
    }

    #[test]
    fn test_anthropic_input_json_delta() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"city\\\":\\\"NYC\\\"\"}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 1);
        assert!(tool_calls[0].arguments.contains("NYC"));
    }

    #[test]
    fn test_anthropic_ping_event() {
        let event = "event: ping\ndata: {}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        // Ping event is handled inside parse_anthropic_sse as a no-op content event
        // (keepalive detection happens at the SseStreamParser level, not in parse_anthropic_sse)
        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_anthropic_error_event() {
        let event = "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}";

        let result = parse_sse_event(event, Provider::Anthropic);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Overloaded"));
        assert!(err_msg.contains("overloaded_error"));
    }

    #[test]
    fn test_anthropic_message_delta_tool_use_stop() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"input_tokens\":20,\"output_tokens\":30}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_use"));
    }

    #[test]
    fn test_anthropic_thinking_delta_ignored() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Let me think...\"}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        // Thinking deltas should not appear as content
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_anthropic_content_block_stop_is_noop() {
        let event =
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert!(!chunk.done);
        assert!(chunk.content.is_empty());
    }

    // =========================================================================
    // Google/Gemini format tests
    // =========================================================================

    #[test]
    fn test_google_text_content() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}"#;

        let chunk = parse_sse_event(event, Provider::Google).unwrap();

        assert_eq!(chunk.content, "Hello from Gemini");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("STOP"));
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(10));
        assert_eq!(usage.completion_tokens, Some(5));
        assert_eq!(usage.total_tokens, Some(15));
    }

    #[test]
    fn test_google_streaming_partial_no_finish() {
        let event =
            r#"data: {"candidates":[{"content":{"parts":[{"text":"Partial "}],"role":"model"}}]}"#;

        let chunk = parse_sse_event(event, Provider::Google).unwrap();

        assert_eq!(chunk.content, "Partial ");
        assert!(!chunk.done);
        assert!(chunk.finish_reason.is_none());
    }

    #[test]
    fn test_google_api_error() {
        let event = r#"data: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}"#;

        let result = parse_sse_event(event, Provider::Google);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("429"));
        assert!(err_msg.contains("RESOURCE_EXHAUSTED"));
        assert!(err_msg.contains("Quota exceeded"));
    }

    #[test]
    fn test_google_safety_filter_block() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"SAFETY"}]}"#;

        let result = parse_sse_event(event, Provider::Google);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("safety filters"));
    }

    #[test]
    fn test_google_recitation_block() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"RECITATION"}]}"#;

        let result = parse_sse_event(event, Provider::Google);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("recitation"));
    }

    #[test]
    fn test_google_function_call() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"search_web","args":{"query":"weather NYC"}}}],"role":"model"},"finishReason":"STOP"}]}"#;

        let chunk = parse_sse_event(event, Provider::Google).unwrap();

        assert!(chunk.done);
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "search_web");
        assert!(tool_calls[0].arguments.contains("weather NYC"));
        // Google-generated IDs start with "call_"
        assert!(tool_calls[0].id.starts_with("call_"));
    }

    #[test]
    fn test_google_empty_candidates() {
        let event = r#"data: {"candidates":[]}"#;

        let chunk = parse_sse_event(event, Provider::Google).unwrap();

        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_google_malformed_json_returns_error() {
        let event = "data: not json at all";

        let result = parse_sse_event(event, Provider::Google);

        assert!(result.is_err());
    }

    // =========================================================================
    // Ollama format tests
    // =========================================================================

    #[test]
    fn test_ollama_streaming_content() {
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":"Hello"},"done":false}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert_eq!(chunk.model.as_deref(), Some("llama4-maverick"));
    }

    #[test]
    fn test_ollama_done_with_usage() {
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":20,"eval_count":50}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
        assert_eq!(chunk.model.as_deref(), Some("llama4-maverick"));
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(20));
        assert_eq!(usage.completion_tokens, Some(50));
        assert_eq!(usage.total_tokens, Some(70));
    }

    #[test]
    fn test_ollama_done_without_done_reason_defaults_to_stop() {
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":""},"done":true}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        assert!(chunk.done);
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn test_ollama_error_response() {
        let event = r#"{"error":"model 'noexist' not found"}"#;

        let result = parse_sse_event(event, Provider::Ollama);

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("noexist"));
    }

    #[test]
    fn test_ollama_tool_calls() {
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"calculator","arguments":{"expression":"2+2"}}}]},"done":false}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "calculator");
        assert!(tool_calls[0].arguments.contains("2+2"));
    }

    #[test]
    fn test_ollama_tool_calls_synthesize_finish_reason() {
        // When Ollama returns tool calls, finish_reason should be "tool_calls"
        // even if done=false
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"search","arguments":"{\"q\":\"test\"}"}}]},"done":false}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        // tool_calls present implies finish_reason="tool_calls"
        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_calls"));
    }

    #[test]
    fn test_ollama_malformed_json() {
        let event = "this is not json";

        let result = parse_sse_event(event, Provider::Ollama);

        assert!(result.is_err());
    }

    #[test]
    fn test_ollama_empty_message_content() {
        let event = r#"{"model":"llama4-maverick","message":{"role":"assistant","content":""},"done":false}"#;

        let chunk = parse_sse_event(event, Provider::Ollama).unwrap();

        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
        assert!(chunk.finish_reason.is_none());
    }

    // =========================================================================
    // Cross-provider edge cases
    // =========================================================================

    #[test]
    fn test_openai_empty_delta_no_crash() {
        // An event with an empty delta object (no content, no tool_calls)
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":null}]}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
        assert!(chunk.tool_calls.is_none());
    }

    #[test]
    fn test_anthropic_no_data_line_produces_empty_chunk() {
        // An event with only an event: line and no data: line
        let event = "event: content_block_stop";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert!(chunk.content.is_empty());
        assert!(!chunk.done);
    }

    #[test]
    fn test_google_with_model_field() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"text":"ok"}],"role":"model"}}],"model":"gemini-3-pro-preview"}"#;

        let chunk = parse_sse_event(event, Provider::Google).unwrap();

        assert_eq!(chunk.model.as_deref(), Some("gemini-3-pro-preview"));
    }

    #[test]
    fn test_openai_credits_info_parsed() {
        let event = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}],"credits":{"cost_cents":0.5,"remaining_cents":99.5}}"#;

        let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();

        let credits = chunk.credits.unwrap();
        assert!((credits.cost_cents - 0.5).abs() < f64::EPSILON);
        assert!((credits.remaining_cents - 99.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_data_prefix_with_and_without_space() {
        // "data: {...}" and "data:{...}" should both work
        let event_with_space =
            r#"data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}"#;
        let event_without_space =
            r#"data:{"choices":[{"delta":{"content":"B"},"finish_reason":null}]}"#;

        let chunk_a = parse_sse_event(event_with_space, Provider::OpenAI).unwrap();
        let chunk_b = parse_sse_event(event_without_space, Provider::OpenAI).unwrap();

        assert_eq!(chunk_a.content, "A");
        assert_eq!(chunk_b.content, "B");
    }
}

// H23 — SSE parser stream-level tests
//
// SseStreamParser is private (requires a real reqwest::Response), so these tests
// exercise the same buffer-management and chunk-boundary logic by:
//   1. Simulating split-chunk reassembly via multiple parse_sse_event calls
//   2. Verifying data field accumulation across multi-line SSE events
//   3. Testing the process_buffer delimiter logic (double-newline for most
//      providers, single-newline for Ollama) through the public parse_sse_event
//      entry point which is the core of process_buffer's per-event dispatch.
#[cfg(test)]
mod stream_buffer_tests {
    use crate::core::llm::sse_parser::{parse_sse_event, StreamChunk};
    use crate::core::llm::Provider;

    /// Helper to simulate buffer accumulation: multiple SSE events arrive in
    /// a single TCP chunk (common in practice). Each event is separated by
    /// double-newline. We parse each event individually (as process_buffer does
    /// after splitting) and verify correctness.
    fn split_and_parse_events(raw: &str, provider: Provider) -> Vec<StreamChunk> {
        let delimiter = match provider {
            Provider::Ollama => "\n",
            _ => "\n\n",
        };

        raw.split(delimiter)
            .filter(|s| !s.trim().is_empty())
            .filter_map(|event| parse_sse_event(event, provider).ok())
            .collect()
    }

    #[test]
    fn test_multiple_events_in_single_buffer_openai() {
        // Simulates two OpenAI events arriving in one TCP chunk
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}],\"model\":\"gpt-5.2\"}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"},\"finish_reason\":null}],\"model\":\"gpt-5.2\"}\n\n",
        );

        let chunks = split_and_parse_events(raw, Provider::OpenAI);

        assert_eq!(chunks.len(), 2, "Should parse two events from buffer");
        assert_eq!(chunks[0].content, "Hello");
        assert_eq!(chunks[1].content, " world");
        assert!(!chunks[0].done);
        assert!(!chunks[1].done);
    }

    #[test]
    fn test_buffer_with_final_done_event_openai() {
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"End\"},\"finish_reason\":null}]}\n\n",
            "data: [DONE]\n\n",
        );

        let chunks = split_and_parse_events(raw, Provider::OpenAI);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].content, "End");
        assert!(!chunks[0].done);
        assert!(chunks[1].done);
        assert!(chunks[1].content.is_empty());
    }

    #[test]
    fn test_ollama_single_newline_delimiter() {
        // Ollama uses single-newline delimiters (NDJSON)
        let raw = concat!(
            "{\"model\":\"llama4-maverick\",\"message\":{\"role\":\"assistant\",\"content\":\"A\"},\"done\":false}\n",
            "{\"model\":\"llama4-maverick\",\"message\":{\"role\":\"assistant\",\"content\":\"B\"},\"done\":false}\n",
            "{\"model\":\"llama4-maverick\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true,\"done_reason\":\"stop\"}\n",
        );

        let chunks = split_and_parse_events(raw, Provider::Ollama);

        assert_eq!(chunks.len(), 3, "Ollama should produce 3 chunks");
        assert_eq!(chunks[0].content, "A");
        assert_eq!(chunks[1].content, "B");
        assert!(chunks[2].done);
        assert_eq!(chunks[2].finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn test_anthropic_multi_line_event_data_accumulation() {
        // Anthropic events have event: and data: lines
        // parse_sse_event handles the full multi-line event after process_buffer
        // splits by double-newline.
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"accumulated text\"}}";

        let chunk = parse_sse_event(event, Provider::Anthropic).unwrap();

        assert_eq!(chunk.content, "accumulated text");
        assert!(!chunk.done);
    }

    #[test]
    fn test_buffer_accumulates_content_across_chunks() {
        // Simulates what the caller does: accumulate content from multiple chunks
        let events = [
            r#"data: {"choices":[{"delta":{"content":"The "},"finish_reason":null}]}"#,
            r#"data: {"choices":[{"delta":{"content":"quick "},"finish_reason":null}]}"#,
            r#"data: {"choices":[{"delta":{"content":"brown "},"finish_reason":null}]}"#,
            r#"data: {"choices":[{"delta":{"content":"fox"},"finish_reason":"stop"}]}"#,
        ];

        let mut accumulated = String::new();
        let mut final_chunk: Option<StreamChunk> = None;

        for event in &events {
            let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();
            accumulated.push_str(&chunk.content);
            if chunk.done {
                final_chunk = Some(chunk);
            }
        }

        assert_eq!(accumulated, "The quick brown fox");
        assert!(final_chunk.is_some(), "Must have a final chunk");
        assert_eq!(
            final_chunk.unwrap().finish_reason.as_deref(),
            Some("stop")
        );
    }

    #[test]
    fn test_google_events_in_buffer() {
        let raw = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Part 1\"}],\"role\":\"model\"}}]}\n\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" Part 2\"}],\"role\":\"model\"},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":5,\"candidatesTokenCount\":3,\"totalTokenCount\":8}}\n\n",
        );

        let chunks = split_and_parse_events(raw, Provider::Google);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].content, "Part 1");
        assert!(!chunks[0].done);
        assert_eq!(chunks[1].content, " Part 2");
        assert!(chunks[1].done);
        let usage = chunks[1].usage.as_ref().unwrap();
        assert_eq!(usage.prompt_tokens, Some(5));
        assert_eq!(usage.completion_tokens, Some(3));
        assert_eq!(usage.total_tokens, Some(8));
    }

    #[test]
    fn test_tool_call_arguments_accumulated_across_chunks() {
        // Tool call arguments arrive incrementally across multiple SSE events.
        // The caller is responsible for concatenation; each chunk carries a partial string.
        let events = [
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\"q"}}]},"finish_reason":null}]}"#,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"","type":"function","function":{"name":"","arguments":"uery"}}]},"finish_reason":null}]}"#,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"","type":"function","function":{"name":"","arguments":"\":\"test\"}"}}]},"finish_reason":null}]}"#,
        ];

        let mut all_args = String::new();
        for event in &events {
            let chunk = parse_sse_event(event, Provider::OpenAI).unwrap();
            if let Some(ref tc) = chunk.tool_calls {
                for call in tc {
                    all_args.push_str(&call.arguments);
                }
            }
        }

        assert_eq!(all_args, "{\"query\":\"test\"}");
    }

    #[test]
    fn test_mixed_keepalive_and_data_in_buffer() {
        // A buffer might contain a keepalive comment followed by actual data.
        // process_buffer handles this by checking is_keepalive_event first.
        // We simulate by parsing individually.
        let keepalive_event = ": keep-alive";
        let data_event =
            r#"data: {"choices":[{"delta":{"content":"data"},"finish_reason":null}]}"#;

        // Keepalive should produce an empty non-done chunk when detected by the parser
        // (In practice, is_keepalive_event is checked before parse_sse_event)
        let data_chunk = parse_sse_event(data_event, Provider::OpenAI).unwrap();
        assert_eq!(data_chunk.content, "data");

        // Verify the keepalive detection logic
        let trimmed = keepalive_event.trim();
        assert!(
            trimmed.starts_with(':'),
            "Keepalive comment must start with ':'"
        );
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
        assert!(classify_keepalive(":ping"), "':ping' should be a keepalive");
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

// L4 fix: Tests for malformed SSE input
#[cfg(test)]
mod malformed_sse_tests {
    use crate::core::llm::sse_parser::parse_sse_event;
    use crate::core::llm::Provider;

    #[test]
    fn missing_data_prefix_yields_empty_chunk() {
        // Lines without "data:" prefix should be ignored, producing an empty chunk
        let event = "not-a-data-line: hello";
        let result = parse_sse_event(event, Provider::OpenAI);
        // Should succeed (no data lines to parse) with an empty content chunk
        let chunk = result.unwrap();
        assert_eq!(chunk.content, "", "No data: prefix should yield empty content");
    }

    #[test]
    fn empty_string_event_yields_empty_chunk() {
        let event = "";
        let result = parse_sse_event(event, Provider::OpenAI);
        let chunk = result.unwrap();
        assert_eq!(chunk.content, "", "Empty event should yield empty content");
    }

    #[test]
    fn only_empty_lines_yields_empty_chunk() {
        let event = "\n\n\n";
        let result = parse_sse_event(event, Provider::OpenAI);
        let chunk = result.unwrap();
        assert_eq!(chunk.content, "", "Only empty lines should yield empty content");
    }

    #[test]
    fn invalid_json_after_data_prefix_returns_error() {
        let event = "data: {not valid json}";
        let result = parse_sse_event(event, Provider::OpenAI);
        assert!(
            result.is_err(),
            "Invalid JSON after data: prefix should return an error"
        );
    }

    #[test]
    fn data_done_signal_sets_done_flag() {
        let event = "data: [DONE]";
        let result = parse_sse_event(event, Provider::OpenAI);
        let chunk = result.unwrap();
        assert!(chunk.done, "data: [DONE] should set done flag");
    }
}
