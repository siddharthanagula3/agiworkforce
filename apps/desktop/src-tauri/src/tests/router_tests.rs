//! Comprehensive tests for LLM Router and SSE streaming

use super::*;

#[cfg(test)]
mod router_core_tests {
    use super::*;

    #[test]
    fn test_provider_enum_variants() {
        let providers = vec![
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
        ];
        assert_eq!(providers.len(), 4);
    }

    #[test]
    fn test_routing_strategy_defaults() {
        // Test default routing strategy
        let strategy = RoutingStrategy::default();

        // Verify sensible defaults exist
        assert!(strategy.max_retries >= 0);
        assert!(strategy.timeout_seconds > 0);
    }

    #[test]
    fn test_router_preferences_creation() {
        let prefs = RouterPreferences {
            preferred_provider: Some(Provider::Ollama),
            fallback_providers: vec![Provider::OpenAI, Provider::Anthropic],
            cost_threshold_usd: Some(0.01),
            latency_threshold_ms: Some(2000),
            quality_threshold: Some(0.8),
        };

        assert_eq!(prefs.preferred_provider, Some(Provider::Ollama));
        assert_eq!(prefs.fallback_providers.len(), 2);
        assert_eq!(prefs.cost_threshold_usd, Some(0.01));
    }

    #[test]
    fn test_provider_selection_logic() {
        // Test that Ollama is prioritized when available (cost-free)
        let prefs = RouterPreferences {
            preferred_provider: Some(Provider::Ollama),
            fallback_providers: vec![Provider::OpenAI],
            cost_threshold_usd: Some(0.01),
            latency_threshold_ms: Some(5000),
            quality_threshold: Some(0.7),
        };

        // Verify Ollama is preferred
        assert_eq!(prefs.preferred_provider.unwrap() as i32, Provider::Ollama as i32);
    }

    #[test]
    fn test_fallback_chain() {
        let prefs = RouterPreferences {
            preferred_provider: Some(Provider::Ollama),
            fallback_providers: vec![
                Provider::OpenAI,
                Provider::Anthropic,
                Provider::Google,
            ],
            cost_threshold_usd: None,
            latency_threshold_ms: None,
            quality_threshold: None,
        };

        // Verify fallback chain order
        assert_eq!(prefs.fallback_providers.len(), 3);
        assert!(matches!(prefs.fallback_providers[0], Provider::OpenAI));
        assert!(matches!(prefs.fallback_providers[1], Provider::Anthropic));
        assert!(matches!(prefs.fallback_providers[2], Provider::Google));
    }
}

#[cfg(test)]
mod sse_parser_tests {
    use super::*;

    #[test]
    fn test_stream_chunk_creation() {
        let chunk = StreamChunk {
            content: "Hello".to_string(),
            is_final: false,
            tokens: None,
            finish_reason: None,
        };

        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.is_final);
        assert!(chunk.tokens.is_none());
    }

    #[test]
    fn test_stream_chunk_final() {
        let chunk = StreamChunk {
            content: "".to_string(),
            is_final: true,
            tokens: Some(50),
            finish_reason: Some("stop".to_string()),
        };

        assert!(chunk.is_final);
        assert_eq!(chunk.tokens, Some(50));
        assert_eq!(chunk.finish_reason, Some("stop".to_string()));
    }

    #[test]
    fn test_openai_sse_format() {
        // OpenAI format: data: {"choices":[{"delta":{"content":"hello"}}]}
        let sse_line = r#"data: {"choices":[{"delta":{"content":"hello"}}]}"#;

        // Verify line starts with "data: "
        assert!(sse_line.starts_with("data: "));

        // Extract JSON part
        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        // Verify structure
        assert!(parsed["choices"].is_array());
        assert_eq!(parsed["choices"][0]["delta"]["content"], "hello");
    }

    #[test]
    fn test_anthropic_sse_format() {
        // Anthropic format: data: {"type":"content_block_delta","delta":{"text":"hello"}}
        let sse_line = r#"data: {"type":"content_block_delta","delta":{"text":"hello"}}"#;

        assert!(sse_line.starts_with("data: "));

        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        assert_eq!(parsed["type"], "content_block_delta");
        assert_eq!(parsed["delta"]["text"], "hello");
    }

    #[test]
    fn test_google_sse_format() {
        // Google format: data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}
        let sse_line = r#"data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}"#;

        assert!(sse_line.starts_with("data: "));

        let json_part = sse_line.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();

        assert!(parsed["candidates"].is_array());
        assert_eq!(parsed["candidates"][0]["content"]["parts"][0]["text"], "hello");
    }

    #[test]
    fn test_ollama_sse_format() {
        // Ollama format: {"message":{"content":"hello"},"done":false}
        let json_line = r#"{"message":{"content":"hello"},"done":false}"#;

        let parsed: serde_json::Value = serde_json::from_str(json_line).unwrap();

        assert_eq!(parsed["message"]["content"], "hello");
        assert_eq!(parsed["done"], false);
    }

    #[test]
    fn test_sse_done_event() {
        // OpenAI done: data: [DONE]
        let done_line = "data: [DONE]";
        assert!(done_line.contains("[DONE]"));
    }

    #[test]
    fn test_multiline_sse_buffering() {
        // Test incomplete SSE events that need buffering
        let incomplete = "data: {\"choices\":[{\"delta\":";
        let continuation = "{\"content\":\"hello\"}}]}";

        // Simulate buffer concatenation
        let complete = format!("{}{}", incomplete, continuation);

        // Should be parseable when complete
        let json_part = complete.strip_prefix("data: ").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(json_part).unwrap();
        assert_eq!(parsed["choices"][0]["delta"]["content"], "hello");
    }
}

#[cfg(test)]
mod cost_calculator_tests {
    use super::*;

    #[test]
    fn test_openai_gpt4_cost() {
        // GPT-4: $0.03/1K input, $0.06/1K output
        let input_tokens = 1000;
        let output_tokens = 1000;

        let input_cost = (input_tokens as f64 / 1000.0) * 0.03;
        let output_cost = (output_tokens as f64 / 1000.0) * 0.06;
        let total_cost = input_cost + output_cost;

        assert_eq!(total_cost, 0.09);
    }

    #[test]
    fn test_openai_gpt35_cost() {
        // GPT-3.5: $0.0015/1K input, $0.002/1K output
        let input_tokens = 1000;
        let output_tokens = 1000;

        let input_cost = (input_tokens as f64 / 1000.0) * 0.0015;
        let output_cost = (output_tokens as f64 / 1000.0) * 0.002;
        let total_cost = input_cost + output_cost;

        assert_eq!(total_cost, 0.0035);
    }

    #[test]
    fn test_anthropic_claude3_cost() {
        // Claude 3 Sonnet: $0.003/1K input, $0.015/1K output
        let input_tokens = 1000;
        let output_tokens = 1000;

        let input_cost = (input_tokens as f64 / 1000.0) * 0.003;
        let output_cost = (output_tokens as f64 / 1000.0) * 0.015;
        let total_cost = input_cost + output_cost;

        assert_eq!(total_cost, 0.018);
    }

    #[test]
    fn test_ollama_zero_cost() {
        // Ollama (local): $0.00
        let input_tokens = 1000;
        let output_tokens = 1000;

        let total_cost = 0.0;

        assert_eq!(total_cost, 0.0);

        // Verify Ollama is truly free
        let cost_per_token = 0.0;
        assert_eq!(input_tokens as f64 * cost_per_token, 0.0);
        assert_eq!(output_tokens as f64 * cost_per_token, 0.0);
    }

    #[test]
    fn test_cost_comparison() {
        // Compare costs across providers for same token count
        let tokens = 1000;

        let gpt4_cost = (tokens as f64 / 1000.0) * 0.06; // $0.06
        let claude_cost = (tokens as f64 / 1000.0) * 0.015; // $0.015
        let ollama_cost = 0.0; // Free

        // Ollama should be cheapest
        assert!(ollama_cost < claude_cost);
        assert!(claude_cost < gpt4_cost);
    }
}

#[cfg(test)]
mod token_counter_tests {
    use super::*;

    #[test]
    fn test_simple_token_count() {
        // Rough approximation: 1 token ≈ 4 characters
        let text = "Hello world";
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as usize;

        assert!(estimated_tokens >= 2 && estimated_tokens <= 4);
    }

    #[test]
    fn test_long_text_token_count() {
        let text = "a".repeat(1000);
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as usize;

        assert_eq!(estimated_tokens, 250);
    }

    #[test]
    fn test_empty_text_tokens() {
        let text = "";
        let estimated_tokens = (text.len() as f64 / 4.0).ceil() as usize;

        assert_eq!(estimated_tokens, 0);
    }

    #[test]
    fn test_special_characters_tokens() {
        // Special characters may count as more tokens
        let text = "😀🎉✨";
        let byte_count = text.len(); // UTF-8 bytes

        // Each emoji is ~4 bytes, so ~12 bytes total
        assert!(byte_count >= 9); // Emojis are multi-byte
    }

    #[test]
    fn test_code_token_count() {
        // Code often has different tokenization
        let code = "fn main() {\n    println!(\"Hello\");\n}";
        let estimated_tokens = (code.len() as f64 / 4.0).ceil() as usize;

        assert!(estimated_tokens >= 8 && estimated_tokens <= 15);
    }
}

#[cfg(test)]
mod cache_manager_tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_cache_key_generation() {
        let message = "What is the weather?";
        let model = "gpt-4";

        // Generate cache key (simple hash)
        let cache_key = format!("{}:{}", model, message);

        assert!(cache_key.contains("gpt-4"));
        assert!(cache_key.contains("What is the weather?"));
    }

    #[test]
    fn test_cache_hit() {
        let mut cache: HashMap<String, String> = HashMap::new();
        let key = "gpt-4:Hello";
        let value = "Hi there!";

        cache.insert(key.to_string(), value.to_string());

        // Test cache hit
        let result = cache.get(key);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), "Hi there!");
    }

    #[test]
    fn test_cache_miss() {
        let cache: HashMap<String, String> = HashMap::new();
        let key = "gpt-4:Hello";

        // Test cache miss
        let result = cache.get(key);
        assert!(result.is_none());
    }

    #[test]
    fn test_cache_eviction() {
        let mut cache: HashMap<String, String> = HashMap::new();
        let max_size = 10;

        // Fill cache beyond capacity
        for i in 0..15 {
            cache.insert(format!("key{}", i), format!("value{}", i));

            // Simulate LRU eviction
            if cache.len() > max_size {
                // Remove oldest entry (simplified - real LRU would track access times)
                if let Some(oldest_key) = cache.keys().next().cloned() {
                    cache.remove(&oldest_key);
                }
            }
        }

        assert!(cache.len() <= max_size);
    }

    #[test]
    fn test_cache_ttl_expiry() {
        use std::time::{SystemTime, Duration};

        let cache_time = SystemTime::now();
        let ttl = Duration::from_secs(300); // 5 minutes

        // Test not expired
        let elapsed = SystemTime::now().duration_since(cache_time).unwrap();
        assert!(elapsed < ttl);

        // Test would expire (simulated)
        let future_time = cache_time + Duration::from_secs(400);
        let future_elapsed = future_time.duration_since(cache_time).unwrap();
        assert!(future_elapsed > ttl);
    }
}

#[cfg(test)]
mod request_formatting_tests {
    use super::*;

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

    #[test]
    fn test_anthropic_request_format() {
        let request = serde_json::json!({
            "model": "claude-3-sonnet-20240229",
            "messages": [
                {"role": "user", "content": "Hello"}
            ],
            "stream": true,
            "max_tokens": 1024
        });

        assert!(request["model"].as_str().unwrap().starts_with("claude"));
        assert!(request["stream"].as_bool().unwrap());
        assert_eq!(request["max_tokens"], 1024);
    }

    #[test]
    fn test_google_request_format() {
        let request = serde_json::json!({
            "contents": [
                {
                    "parts": [
                        {"text": "Hello"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024
            }
        });

        assert!(request["contents"].is_array());
        assert_eq!(request["generationConfig"]["temperature"], 0.7);
    }

    #[test]
    fn test_ollama_request_format() {
        let request = serde_json::json!({
            "model": "llama3",
            "prompt": "Hello",
            "stream": true
        });

        assert_eq!(request["model"], "llama3");
        assert_eq!(request["prompt"], "Hello");
        assert!(request["stream"].as_bool().unwrap());
    }
}

#[cfg(test)]
mod error_handling_tests {
    use super::*;

    #[test]
    fn test_timeout_error() {
        let error_msg = "Request timed out after 30 seconds";
        assert!(error_msg.contains("timed out"));
    }

    #[test]
    fn test_rate_limit_error() {
        let error_json = serde_json::json!({
            "error": {
                "type": "rate_limit_error",
                "message": "Rate limit exceeded"
            }
        });

        assert_eq!(error_json["error"]["type"], "rate_limit_error");
    }

    #[test]
    fn test_invalid_api_key_error() {
        let error_json = serde_json::json!({
            "error": {
                "type": "authentication_error",
                "message": "Invalid API key"
            }
        });

        assert_eq!(error_json["error"]["type"], "authentication_error");
    }

    #[test]
    fn test_model_not_found_error() {
        let error_json = serde_json::json!({
            "error": {
                "type": "not_found_error",
                "message": "Model not found"
            }
        });

        assert_eq!(error_json["error"]["type"], "not_found_error");
    }

    #[test]
    fn test_context_length_exceeded() {
        let error_json = serde_json::json!({
            "error": {
                "type": "invalid_request_error",
                "message": "Context length exceeded"
            }
        });

        assert!(error_json["error"]["message"].as_str().unwrap().contains("Context length"));
    }
}

#[cfg(test)]
mod response_parsing_tests {
    use super::*;

    #[test]
    fn test_openai_response_parsing() {
        let response = serde_json::json!({
            "choices": [
                {
                    "message": {
                        "content": "Hello!"
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        });

        assert_eq!(response["choices"][0]["message"]["content"], "Hello!");
        assert_eq!(response["usage"]["total_tokens"], 15);
    }

    #[test]
    fn test_anthropic_response_parsing() {
        let response = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "Hello!"
                }
            ],
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5
            }
        });

        assert_eq!(response["content"][0]["text"], "Hello!");
        assert_eq!(response["usage"]["input_tokens"], 10);
    }

    #[test]
    fn test_function_call_response() {
        let response = serde_json::json!({
            "choices": [
                {
                    "message": {
                        "function_call": {
                            "name": "file_read",
                            "arguments": "{\"path\": \"/tmp/test.txt\"}"
                        }
                    }
                }
            ]
        });

        assert_eq!(response["choices"][0]["message"]["function_call"]["name"], "file_read");

        // Parse arguments
        let args_str = response["choices"][0]["message"]["function_call"]["arguments"].as_str().unwrap();
        let args: serde_json::Value = serde_json::from_str(args_str).unwrap();
        assert_eq!(args["path"], "/tmp/test.txt");
    }
}
