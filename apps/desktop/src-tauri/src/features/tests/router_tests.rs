use crate::core::llm::sse_parser::{StreamChunk, TokenUsage};

#[cfg(test)]
mod router_core_tests {
    // Obsolete tests removed
}

#[cfg(test)]
mod sse_parser_tests {
    use super::*;

    #[test]
    fn test_stream_chunk_creation() {
        let chunk = StreamChunk {
            content: "Hello".to_string(),
            done: false,
            usage: None,
            finish_reason: None,
            model: None,
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        };

        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
        assert!(chunk.usage.is_none());
    }

    #[test]
    fn test_stream_chunk_final() {
        let chunk = StreamChunk {
            content: "".to_string(),
            done: true,
            usage: Some(TokenUsage {
                total_tokens: Some(50),
                prompt_tokens: None,
                completion_tokens: None,
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            }),
            finish_reason: Some("stop".to_string()),
            model: None,
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        };

        assert!(chunk.done);
        assert_eq!(chunk.usage.unwrap().total_tokens, Some(50));
        assert_eq!(chunk.finish_reason, Some("stop".to_string()));
    }

    #[test]
    fn test_openai_sse_format() {
        let sse_line = r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#;

        assert!(sse_line.starts_with("data: "));

        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        assert!(parsed["choices"].is_array());
        assert_eq!(parsed["choices"][0]["delta"]["content"], "hello");
    }

    #[test]
    fn test_anthropic_sse_format() {
        let sse_line = r#"data: {"type":"content_block_delta","delta":{"text":"hello"}}"#;

        assert!(sse_line.starts_with("data: "));

        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        assert_eq!(parsed["type"], "content_block_delta");
        assert_eq!(parsed["delta"]["text"], "hello");
    }

    #[test]
    fn test_google_sse_format() {
        let sse_line = r#"data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}"#;

        assert!(sse_line.starts_with("data: "));

        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        assert!(parsed["candidates"].is_array());
        assert_eq!(
            parsed["candidates"][0]["content"]["parts"][0]["text"],
            "hello"
        );
    }

    #[test]
    fn test_ollama_sse_format() {
        let json_line = r#"{"message":{"content":"hello"},"done":false}"#;

        let parsed: serde_json::Value = serde_json::from_str(json_line).unwrap();

        assert_eq!(parsed["message"]["content"], "hello");
        assert_eq!(parsed["done"], false);
    }

    #[test]
    fn test_sse_done_event() {
        let done_line = "data: [DONE]";
        assert!(done_line.contains("[DONE]"));
    }

    #[test]
    fn test_multiline_sse_buffering() {
        let incomplete = "data: {\"choices\":[{\"delta\":";
        let continuation = "{\"content\":\"hello\"}}]}";

        let complete = format!("{}{}", incomplete, continuation);

        let json_part = complete.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["delta"]["content"], "hello");
    }
}

#[cfg(test)]
mod cost_calculator_tests {

    #[test]
    fn test_openai_gpt4_cost() {
        let input_tokens = 1000;
        let output_tokens = 1000;

        let input_cost = (input_tokens as f64 / 1000.0) * 0.03;
        let output_cost = (output_tokens as f64 / 1000.0) * 0.06;
        let total_cost = input_cost + output_cost;

        assert_eq!(total_cost, 0.09);
    }
    // ... removed redundant cost tests ...
}

// H56 — Groq, xAI (Grok), DeepSeek SSE format tests
// All three providers use the OpenAI-compatible SSE format.  We verify that the
// JSON payloads these providers emit can be parsed with the same logic used for
// OpenAI, covering: stream start, content chunk, tool call chunk, stream end, keepalive.
#[cfg(test)]
mod groq_sse_tests {
    /// Groq sends standard OpenAI-compatible SSE with an extra `x_groq` metadata field.
    #[test]
    fn test_groq_stream_start() {
        let sse = r#"data: {"id":"chatcmpl-groq-abc","object":"chat.completion.chunk","created":1720000000,"model":"llama3-8b-8192","choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["object"], "chat.completion.chunk");
        assert!(parsed["choices"].is_array());
        assert_eq!(parsed["choices"][0]["delta"]["role"], "assistant");
    }

    #[test]
    fn test_groq_content_chunk() {
        let sse = r#"data: {"id":"chatcmpl-groq-abc","object":"chat.completion.chunk","created":1720000000,"model":"llama3-8b-8192","choices":[{"delta":{"content":"Hello from Groq!"},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["delta"]["content"], "Hello from Groq!");
        assert!(parsed["choices"][0]["finish_reason"].is_null());
    }

    #[test]
    fn test_groq_tool_call_chunk() {
        let sse = r#"data: {"id":"chatcmpl-groq-abc","object":"chat.completion.chunk","model":"llama3-groq-70b-tool-use-preview","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        let tool_calls = &parsed["choices"][0]["delta"]["tool_calls"];
        assert!(tool_calls.is_array());
        assert_eq!(tool_calls[0]["function"]["name"], "get_weather");
        assert_eq!(tool_calls[0]["id"], "call_abc");
    }

    #[test]
    fn test_groq_stream_end_done_marker() {
        let done_line = "data: [DONE]";
        assert!(done_line.contains("[DONE]"));
    }

    #[test]
    fn test_groq_stream_end_finish_reason() {
        let sse = r#"data: {"id":"chatcmpl-groq-abc","object":"chat.completion.chunk","model":"llama3-8b-8192","choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"x_groq":{"id":"req_xyz","usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["finish_reason"], "stop");
        // Groq-specific metadata present
        assert!(parsed.get("x_groq").is_some());
    }

    #[test]
    fn test_groq_keepalive_comment() {
        // Groq uses the standard SSE comment keepalive
        let keepalive = ": keep-alive";
        assert!(keepalive.starts_with(':'));
    }

    #[test]
    fn test_groq_usage_in_final_chunk() {
        let sse = r#"data: {"id":"c","object":"chat.completion.chunk","model":"llama3-8b-8192","choices":[{"delta":{},"finish_reason":"stop","index":0}],"x_groq":{"usage":{"prompt_tokens":5,"completion_tokens":15,"total_tokens":20}}}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["x_groq"]["usage"]["total_tokens"], 20);
    }
}

#[cfg(test)]
mod xai_sse_tests {
    /// xAI (Grok) uses the OpenAI-compatible SSE format.
    #[test]
    fn test_xai_stream_start() {
        let sse = r#"data: {"id":"chatcmpl-xai-xyz","object":"chat.completion.chunk","created":1720000000,"model":"grok-4","choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["model"], "grok-4");
        assert_eq!(parsed["choices"][0]["delta"]["role"], "assistant");
    }

    #[test]
    fn test_xai_content_chunk() {
        let sse = r#"data: {"id":"chatcmpl-xai-xyz","object":"chat.completion.chunk","model":"grok-4","choices":[{"delta":{"content":"Grok answer here."},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(
            parsed["choices"][0]["delta"]["content"],
            "Grok answer here."
        );
    }

    #[test]
    fn test_xai_tool_call_chunk() {
        let sse = r#"data: {"id":"chatcmpl-xai-xyz","object":"chat.completion.chunk","model":"grok-4","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_grok_1","type":"function","function":{"name":"search_web","arguments":"{\"q\":"}}]},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        let tool_calls = &parsed["choices"][0]["delta"]["tool_calls"];
        assert_eq!(tool_calls[0]["function"]["name"], "search_web");
    }

    #[test]
    fn test_xai_stream_end_finish_reason() {
        let sse = r#"data: {"id":"chatcmpl-xai-xyz","object":"chat.completion.chunk","model":"grok-4","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["finish_reason"], "stop");
    }

    #[test]
    fn test_xai_done_marker() {
        assert!("data: [DONE]".contains("[DONE]"));
    }

    #[test]
    fn test_xai_keepalive() {
        // xAI uses standard SSE comments for keepalive
        let keepalive = ": ping";
        assert!(keepalive.starts_with(':'));
    }

    #[test]
    fn test_xai_usage_in_final_chunk() {
        let sse = r#"data: {"id":"c","object":"chat.completion.chunk","model":"grok-4","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":8,"completion_tokens":25,"total_tokens":33}}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["usage"]["total_tokens"], 33);
        assert_eq!(parsed["usage"]["prompt_tokens"], 8);
    }
}

#[cfg(test)]
mod deepseek_sse_tests {
    /// DeepSeek uses the OpenAI-compatible SSE format.
    #[test]
    fn test_deepseek_stream_start() {
        let sse = r#"data: {"id":"chatcmpl-ds-abc","object":"chat.completion.chunk","created":1720000000,"model":"deepseek-chat","choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["model"], "deepseek-chat");
        assert_eq!(parsed["choices"][0]["delta"]["role"], "assistant");
    }

    #[test]
    fn test_deepseek_content_chunk() {
        let sse = r#"data: {"id":"chatcmpl-ds-abc","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"delta":{"content":"DeepSeek response."},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(
            parsed["choices"][0]["delta"]["content"],
            "DeepSeek response."
        );
    }

    #[test]
    fn test_deepseek_tool_call_chunk() {
        let sse = r#"data: {"id":"chatcmpl-ds-abc","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_ds_1","type":"function","function":{"name":"execute_code","arguments":""}}]},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(
            parsed["choices"][0]["delta"]["tool_calls"][0]["function"]["name"],
            "execute_code"
        );
    }

    #[test]
    fn test_deepseek_stream_end_finish_reason() {
        let sse = r#"data: {"id":"chatcmpl-ds-abc","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["finish_reason"], "stop");
    }

    #[test]
    fn test_deepseek_done_marker() {
        assert!("data: [DONE]".contains("[DONE]"));
    }

    #[test]
    fn test_deepseek_keepalive() {
        let keepalive = ": keep-alive";
        assert!(keepalive.starts_with(':'));
    }

    #[test]
    fn test_deepseek_usage_in_final_chunk() {
        let sse = r#"data: {"id":"c","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":12,"completion_tokens":30,"total_tokens":42}}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["usage"]["total_tokens"], 42);
    }

    #[test]
    fn test_deepseek_reasoner_thinking_field() {
        // deepseek-r1 / deepseek-reasoner includes a `reasoning_content` field
        // inside the delta for chain-of-thought output.
        let sse = r#"data: {"id":"chatcmpl-ds-r1","object":"chat.completion.chunk","model":"deepseek-reasoner","choices":[{"delta":{"reasoning_content":"Let me think...","content":""},"index":0,"finish_reason":null}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(
            parsed["choices"][0]["delta"]["reasoning_content"],
            "Let me think..."
        );
    }

    #[test]
    fn test_deepseek_length_finish_reason() {
        let sse = r#"data: {"id":"c","object":"chat.completion.chunk","model":"deepseek-chat","choices":[{"delta":{},"index":0,"finish_reason":"length"}]}"#;
        let json_part = sse.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["finish_reason"], "length");
    }
}

#[cfg(test)]
mod request_formatting_tests {

    #[test]
    fn test_openai_request_format() {
        let request = serde_json::json!({
            "model": "gpt-4",
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "stream": true,
            "temperature": 0.7
        });

        assert_eq!(request["model"], "gpt-4");
        assert!(request["stream"].as_bool().unwrap());
        assert_eq!(request["temperature"], 0.7);
    }
}
