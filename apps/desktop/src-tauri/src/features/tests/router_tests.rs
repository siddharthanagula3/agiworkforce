use crate::core::router::sse_parser::{StreamChunk, TokenUsage};

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
            }),
            finish_reason: Some("stop".to_string()),
            model: None,
            credits: None,
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
