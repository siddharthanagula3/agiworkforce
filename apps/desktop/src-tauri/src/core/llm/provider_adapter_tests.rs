//! Unit tests for provider adapters

#[cfg(test)]
mod tests {
    use crate::core::llm::provider_adapter::{OpenAIServerTool, ProviderAdapterFactory};
    use crate::core::llm::{
        AudioData, AudioFormat, AudioInput, ChatMessage, ContentPart, DocumentFormat, DocumentInput,
        ImageDetail, ImageFormat, ImageInput, LLMRequest, Provider, ResponseFormat,
        ThinkingParameter, ToolCall, ToolChoice, ToolDefinition, ToolResultInput, ToolUseInput,
        VideoData, VideoFormat, VideoInput,
    };
    use serde_json::json;

    #[test]
    fn test_openai_adapter_chat_completions_basic() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello, world!".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-4.1".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(adapted["model"], "gpt-4.1");
        // f32 temperature (0.7f32) serialized to JSON may lose precision vs f64 literal
        let temp = adapted["temperature"].as_f64().unwrap();
        assert!(
            (temp - 0.7_f64).abs() < 1e-5,
            "temperature should be ~0.7, got {temp}"
        );
        assert_eq!(adapted["max_tokens"], 100);
    }

    #[test]
    fn test_openai_adapter_responses_api_gpt5() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Explain quantum computing".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-5.4".to_string(),
            temperature: Some(0.3),
            max_tokens: Some(2000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: Some("You are a helpful assistant.".to_string()),
            thinking: Some(ThinkingParameter::Enabled(true)),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(adapted["model"], "gpt-5.4");
        assert_eq!(adapted["input"], "Explain quantum computing");
        assert_eq!(adapted["instructions"], "You are a helpful assistant.");
        assert_eq!(adapted["reasoning"]["effort"], "medium");
    }

    #[test]
    fn test_openai_adapter_reasoning_model_with_budget() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Solve this complex problem".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "o3".to_string(),
            temperature: Some(1.0),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: Some(ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: 8000,
            }),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(adapted["model"], "o3");
        assert_eq!(adapted["reasoning"]["effort"], "high"); // 8000 tokens = high effort
    }

    #[test]
    fn test_openai_adapter_structured_outputs() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let json_schema = json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "number"}
            },
            "required": ["name", "age"]
        });

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Generate user data".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-5".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: Some(ResponseFormat {
                format_type: "json_schema".to_string(),
                json_schema: Some(json_schema.clone()),
            }),
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(adapted["text"]["format"], "json_schema");
        assert_eq!(adapted["text"]["json_schema"], json_schema);
    }

    #[test]
    fn test_openai_adapter_with_tools() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let tools = vec![ToolDefinition {
            name: "get_weather".to_string(),
            description: "Get the current weather".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                },
                "required": ["location"]
            }),
            strict: None,
        }];

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What's the weather?".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-4.1".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(tools),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        let tools_arr = adapted["tools"].as_array().unwrap();
        assert_eq!(tools_arr.len(), 1);
        assert_eq!(tools_arr[0]["type"], "function");
        assert_eq!(tools_arr[0]["function"]["name"], "get_weather");
        assert_eq!(adapted["tool_choice"], "auto");
    }

    #[test]
    fn test_openai_adapter_adds_items_for_array_tool_params() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Run a db update".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-5.4-nano".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "db_execute".to_string(),
                description: "Execute SQL".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "sql": { "type": "string" },
                        "params": { "type": "array" }
                    }
                }),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("request should adapt");
        let params = &adapted["tools"][0]["function"]["parameters"];
        assert_eq!(
            params["properties"]["params"]["items"],
            json!({}),
            "array params must include items schema"
        );
    }

    #[test]
    fn test_openai_builtin_tool_mapping_current_ids() {
        assert_eq!(
            OpenAIServerTool::from_str("computer_use_preview"),
            Some(OpenAIServerTool::ComputerUsePreview)
        );
        assert_eq!(
            OpenAIServerTool::from_str("local_shell"),
            Some(OpenAIServerTool::LocalShell)
        );
        assert_eq!(
            OpenAIServerTool::from_str("code_interpreter"),
            Some(OpenAIServerTool::CodeInterpreter)
        );
        assert_eq!(
            OpenAIServerTool::from_str("mcp"),
            Some(OpenAIServerTool::Mcp)
        );
    }

    #[test]
    fn test_google_adapter_uses_parameters_json_schema_for_mcp_style_schemas() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "List MCP resources".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gemini-3-flash-preview".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "list_resources".to_string(),
                description: "List resources from an MCP server".to_string(),
                parameters: json!({
                    "schema": {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "type": "object",
                        "properties": {
                            "server": { "type": "string" },
                            "tags": { "type": "array" }
                        },
                        "required": ["server"],
                        "additionalProperties": false
                    }
                }),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("request should adapt");
        let declaration = &adapted["tools"][0]["functionDeclarations"][0];

        assert!(
            declaration.get("parameters").is_none(),
            "MCP-style JSON Schema should use parametersJsonSchema"
        );
        assert_eq!(
            declaration["parametersJsonSchema"],
            json!({
                "type": "object",
                "properties": {
                    "server": { "type": "string" },
                    "tags": { "type": "array", "items": {} }
                },
                "required": ["server"],
                "additionalProperties": false
            })
        );
    }

    #[test]
    fn test_google_adapter_keeps_simple_tool_schemas_on_parameters() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Check weather".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gemini-3-flash-preview".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get weather".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "city": { "type": "string" }
                    },
                    "required": ["city"]
                }),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("request should adapt");
        let declaration = &adapted["tools"][0]["functionDeclarations"][0];

        assert_eq!(
            declaration["parameters"],
            json!({
                "type": "object",
                "properties": {
                    "city": { "type": "string" }
                },
                "required": ["city"]
            })
        );
        assert!(declaration.get("parametersJsonSchema").is_none());
    }

    #[test]
    fn test_openai_apply_patch_drops_non_standard_validate_before_apply() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Apply the patch".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-5.4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "apply_patch".to_string(),
                description: "Apply a patch".to_string(),
                parameters: json!({
                    "type": "apply_patch",
                    "validate_before_apply": true
                }),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("request should adapt");
        let tools = adapted["tools"].as_array().expect("tools array must exist");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["type"], "apply_patch");
        assert!(
            tools[0].get("validate_before_apply").is_none(),
            "non-standard field must be dropped"
        );
    }

    #[test]
    fn test_openai_adapter_response_chat_completions() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "gpt-4.1",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you today?"
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 9,
                "total_tokens": 19,
                "prompt_tokens_details": {
                    "cached_tokens": 5
                },
                "completion_tokens_details": {
                    "reasoning_tokens": 0
                }
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "Hello! How can I help you today?");
        assert_eq!(response.prompt_tokens, Some(10));
        assert_eq!(response.completion_tokens, Some(9));
        assert_eq!(response.tokens, Some(19));
        assert_eq!(response.cache_read_input_tokens, Some(5));
        assert_eq!(response.model, "gpt-4.1");
        assert_eq!(response.finish_reason, Some("stop".to_string()));
    }

    #[test]
    fn test_openai_adapter_response_with_reasoning_tokens() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "chatcmpl-456",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "o4-mini",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "After careful consideration, the answer is 42."
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 50,
                "completion_tokens": 200,
                "total_tokens": 250,
                "completion_tokens_details": {
                    "reasoning_tokens": 150
                }
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.reasoning_tokens, Some(150));
        assert_eq!(response.completion_tokens, Some(200));
        assert_eq!(response.model, "o4-mini");
    }

    #[test]
    fn test_openai_adapter_response_with_tool_calls() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "chatcmpl-789",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "gpt-4.1",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_abc123",
                        "type": "function",
                        "function": {
                            "name": "get_weather",
                            "arguments": "{\"location\": \"San Francisco\"}"
                        }
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {
                "prompt_tokens": 20,
                "completion_tokens": 30,
                "total_tokens": 50
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_abc123");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert_eq!(tool_calls[0].arguments, "{\"location\": \"San Francisco\"}");
    }

    #[test]
    fn test_openai_adapter_responses_api_top_level_function_call() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "resp_123",
            "status": "completed",
            "model": "gpt-5.4",
            "output": [
                {
                    "type": "function_call",
                    "id": "call_fn_1",
                    "name": "get_weather",
                    "arguments": "{\"location\":\"San Francisco\"}"
                },
                {
                    "type": "message",
                    "content": [
                        { "type": "output_text", "text": "Checking weather..." }
                    ]
                }
            ],
            "usage": {
                "input_tokens": 12,
                "output_tokens": 18,
                "total_tokens": 30,
                "output_tokens_details": {
                    "reasoning_tokens": 4
                }
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "Checking weather...");
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_fn_1");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert_eq!(tool_calls[0].arguments, "{\"location\":\"San Francisco\"}");
    }

    #[test]
    fn test_openai_adapter_responses_api_server_tool_call_prefixed() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "resp_456",
            "status": "in_progress",
            "model": "gpt-5.4-codex",
            "output": [
                {
                    "type": "local_shell_call",
                    "id": "shell_call_1",
                    "input": {
                        "command": "ls -la"
                    }
                }
            ],
            "usage": {
                "input_tokens": 5,
                "output_tokens": 7,
                "total_tokens": 12,
                "output_tokens_details": {
                    "reasoning_tokens": 0
                }
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "shell_call_1");
        assert_eq!(tool_calls[0].name, "__server__local_shell");
        assert!(
            tool_calls[0].arguments.contains("ls -la"),
            "arguments should include shell command payload"
        );
    }

    #[test]
    fn test_openai_chat_completions_server_tool_call_prefixed() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        let api_response = json!({
            "id": "chatcmpl-server-1",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "gpt-4.1",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_server_web_1",
                        "type": "web_search",
                        "input": {"query": "latest ai news"}
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {
                "prompt_tokens": 20,
                "completion_tokens": 10,
                "total_tokens": 30
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "call_server_web_1");
        assert_eq!(tool_calls[0].name, "__server__web_search");
        assert!(
            tool_calls[0].arguments.contains("latest ai news"),
            "arguments should include server tool payload"
        );
    }

    #[test]
    fn test_openai_adapter_supports_features() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        assert_eq!(adapter.provider_name(), "OpenAI");
        assert!(adapter.supports_prompt_caching()); // OpenAI now supports prompt caching
        assert!(adapter.supports_extended_thinking()); // GPT-5 and reasoning models
        assert!(adapter.supports_batch_processing());
        assert!(adapter.supports_structured_outputs());
    }

    #[test]
    fn test_anthropic_adapter_basic() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        assert_eq!(adapter.provider_name(), "Anthropic");
        assert!(adapter.supports_prompt_caching());
        assert!(adapter.supports_extended_thinking());
    }

    #[test]
    fn test_provider_factory_creates_correct_adapters() {
        let openai = ProviderAdapterFactory::create_adapter(Provider::OpenAI);
        assert_eq!(openai.provider_name(), "OpenAI");

        let anthropic = ProviderAdapterFactory::create_adapter(Provider::Anthropic);
        assert_eq!(anthropic.provider_name(), "Anthropic");

        let google = ProviderAdapterFactory::create_adapter(Provider::Google);
        assert_eq!(google.provider_name(), "Google");

        // Perplexity has its own adapter
        let perplexity = ProviderAdapterFactory::create_adapter(Provider::Perplexity);
        assert_eq!(perplexity.provider_name(), "Perplexity");

        let xai = ProviderAdapterFactory::create_adapter(Provider::XAI);
        assert_eq!(xai.provider_name(), "OpenAI");

        let qwen = ProviderAdapterFactory::create_adapter(Provider::Qwen);
        assert_eq!(qwen.provider_name(), "OpenAI");
    }

    #[test]
    fn test_openai_vision_chat_completions() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        // Generate a valid 1x1 white PNG using the image crate (handcrafted bytes fail CRC checks)
        let png_data = {
            use image::{ImageBuffer, Rgb};
            let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
                ImageBuffer::from_fn(1, 1, |_, _| Rgb([255u8, 255u8, 255u8]));
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
            buf.into_inner()
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "What's in this image?".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: png_data,
                            format: ImageFormat::Png,
                            detail: ImageDetail::High,
                        },
                    },
                ]),
            }],
            // Use gpt-4o which routes to Chat Completions API (not Responses API)
            model: "gpt-4o".to_string(),
            temperature: None,
            max_tokens: Some(100),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(
            result.is_ok(),
            "Vision request should be successfully adapted"
        );

        let adapted = result.unwrap();
        assert_eq!(adapted["model"], "gpt-4o");

        // Verify the message structure includes both text and image
        let messages = adapted["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);

        let content = messages[0]["content"].as_array().unwrap();
        assert_eq!(content.len(), 2, "Should have text and image parts");

        // Check text part
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[0]["text"], "What's in this image?");

        // Check image part
        assert_eq!(content[1]["type"], "image_url");
        assert!(content[1]["image_url"]["url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert_eq!(content[1]["image_url"]["detail"], "high");
    }

    #[test]
    fn test_openai_vision_responses_api() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::OpenAI);

        // Generate a valid 1x1 white PNG using the image crate (handcrafted bytes fail CRC checks)
        let png_data = {
            use image::{ImageBuffer, Rgb};
            let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
                ImageBuffer::from_fn(1, 1, |_, _| Rgb([255u8, 255u8, 255u8]));
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
            buf.into_inner()
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Analyze this image".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: png_data,
                            format: ImageFormat::Png,
                            detail: ImageDetail::Low,
                        },
                    },
                ]),
            }],
            model: "gpt-5.4".to_string(), // GPT-5.4 uses Responses API
            temperature: None,
            max_tokens: Some(200),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: Some("You are a helpful vision assistant".to_string()),
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(
            result.is_ok(),
            "Vision request for Responses API should succeed"
        );

        let adapted = result.unwrap();
        assert_eq!(adapted["model"], "gpt-5.4");
        assert_eq!(
            adapted["instructions"],
            "You are a helpful vision assistant"
        );

        // Verify the input structure for Responses API
        let input = adapted["input"].as_array().unwrap();
        assert_eq!(input.len(), 2, "Should have text and image input parts");

        // Check text input
        assert_eq!(input[0]["type"], "input_text");
        assert_eq!(input[0]["text"], "Analyze this image");

        // Check image input
        assert_eq!(input[1]["type"], "input_image");
        assert!(input[1]["source"]["url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert_eq!(input[1]["source"]["detail"], "low");
    }

    // M21 — deepseek-reasoner canonicalization test
    // Verifies that "deepseek-r1" is canonicalized to "deepseek-reasoner" by the
    // DeepSeek adapter, which delegates to OpenAI format after canonicalization.
    #[test]
    fn test_deepseek_adapter_canonicalizes_r1_to_reasoner() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::DeepSeek);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Explain quantum entanglement".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "deepseek-r1".to_string(),
            temperature: Some(0.5),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(
            result.is_ok(),
            "DeepSeek adapter should successfully adapt the request"
        );

        let adapted = result.unwrap();
        assert_eq!(
            adapted["model"], "deepseek-reasoner",
            "deepseek-r1 must be canonicalized to deepseek-reasoner"
        );
    }

    #[test]
    fn test_deepseek_adapter_canonicalizes_r1_zero_to_reasoner() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::DeepSeek);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Solve this math problem".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "deepseek-r1-zero".to_string(),
            temperature: None,
            max_tokens: Some(500),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(
            adapted["model"], "deepseek-reasoner",
            "deepseek-r1-zero must be canonicalized to deepseek-reasoner"
        );
    }

    #[test]
    fn test_deepseek_adapter_passthrough_non_r1_models() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::DeepSeek);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "deepseek-chat".to_string(),
            temperature: None,
            max_tokens: Some(100),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok());

        let adapted = result.unwrap();
        assert_eq!(
            adapted["model"], "deepseek-chat",
            "Non-R1 model IDs must pass through unchanged"
        );
    }

    #[test]
    fn test_image_token_calculation() {
        use crate::core::llm::ImageDetail;

        // Test low detail (fixed 85 tokens)
        let low_detail_tokens =
            super::super::OpenAIAdapter::calculate_image_tokens(1920, 1080, ImageDetail::Low);
        assert_eq!(
            low_detail_tokens, 85,
            "Low detail should always be 85 tokens"
        );

        // Test high detail with small image (1x1, should be 1 tile)
        let small_high_tokens =
            super::super::OpenAIAdapter::calculate_image_tokens(100, 100, ImageDetail::High);
        // 1 tile (100x100 fits in 512x512) = 170 + 85 = 255
        assert_eq!(
            small_high_tokens, 255,
            "Small image should be 1 tile = 255 tokens"
        );

        // Test high detail with medium image (512x512, exactly 1 tile)
        let medium_high_tokens =
            super::super::OpenAIAdapter::calculate_image_tokens(512, 512, ImageDetail::High);
        assert_eq!(
            medium_high_tokens, 255,
            "512x512 should be 1 tile = 255 tokens"
        );

        // Test high detail with large image (1024x1024, should be 4 tiles: 2x2)
        let large_high_tokens =
            super::super::OpenAIAdapter::calculate_image_tokens(1024, 1024, ImageDetail::High);
        // 4 tiles (2x2) = 4*170 + 85 = 765
        assert_eq!(
            large_high_tokens, 765,
            "1024x1024 should be 4 tiles = 765 tokens"
        );

        // Test high detail with very large image that needs scaling
        let xlarge_high_tokens =
            super::super::OpenAIAdapter::calculate_image_tokens(4096, 4096, ImageDetail::High);
        // 4096x4096 scaled to 2048x2048, then 4x4 tiles = 16*170 + 85 = 2805
        assert_eq!(
            xlarge_high_tokens, 2805,
            "4096x4096 scaled to 2048x2048 should be 16 tiles = 2805 tokens"
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Google Gemini message format tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_google_adapter_converts_messages_to_contents_format() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello Gemini".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "Hello! How can I help?".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "What is 2+2?".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
            ],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(100),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(result.is_ok(), "Google adapter should adapt successfully");

        let adapted = result.unwrap();
        let contents = adapted["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 3);

        // First message: role should be "user", content in parts
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[0]["parts"][0]["text"], "Hello Gemini");

        // Second message: "assistant" should be mapped to "model"
        assert_eq!(contents[1]["role"], "model");
        assert_eq!(contents[1]["parts"][0]["text"], "Hello! How can I help?");

        // Third message: user
        assert_eq!(contents[2]["role"], "user");
        assert_eq!(contents[2]["parts"][0]["text"], "What is 2+2?");
    }

    #[test]
    fn test_google_adapter_system_as_instruction_not_content() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are a math tutor.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "Help me".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
            ],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(100),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: Some("You are a math tutor.".to_string()),
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();

        // System messages should be filtered from contents
        let contents = adapted["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 1, "system message should be filtered from contents");
        assert_eq!(contents[0]["role"], "user");

        // System should be in systemInstruction
        assert_eq!(
            adapted["systemInstruction"]["parts"][0]["text"],
            "You are a math tutor."
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Anthropic tool_choice tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_anthropic_adapter_tool_choice_auto() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Search the web".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "search".to_string(),
                description: "Search".to_string(),
                parameters: json!({"type": "object", "properties": {}}),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["tool_choice"]["type"], "auto");
    }

    #[test]
    fn test_anthropic_adapter_tool_choice_required() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Do it".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "action".to_string(),
                description: "Do action".to_string(),
                parameters: json!({"type": "object", "properties": {}}),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Required),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["tool_choice"]["type"], "any");
    }

    #[test]
    fn test_anthropic_adapter_tool_choice_specific() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Get weather".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get weather".to_string(),
                parameters: json!({"type": "object", "properties": {"city": {"type": "string"}}}),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Specific("get_weather".to_string())),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["tool_choice"]["type"], "tool");
        assert_eq!(adapted["tool_choice"]["name"], "get_weather");
    }

    #[test]
    fn test_anthropic_adapter_tool_choice_none_omitted() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "noop".to_string(),
                description: "No-op".to_string(),
                parameters: json!({"type": "object", "properties": {}}),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::None),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert!(
            adapted.get("tool_choice").is_none(),
            "tool_choice should be omitted for None variant on Anthropic"
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Anthropic thinking parameter serialization tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_anthropic_adapter_thinking_enabled_true() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Think hard".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-opus-4-6".to_string(),
            temperature: None,
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: Some(ThinkingParameter::Enabled(true)),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        // Anthropic requires {"type": "enabled", "budget_tokens": N}, NOT bare `true`
        assert_eq!(adapted["thinking"]["type"], "enabled");
        assert!(
            adapted["thinking"]["budget_tokens"].as_u64().unwrap() > 0,
            "budget_tokens must be positive"
        );
    }

    #[test]
    fn test_anthropic_adapter_thinking_enabled_false() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Quick answer".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: Some(ThinkingParameter::Enabled(false)),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["thinking"]["type"], "disabled");
    }

    #[test]
    fn test_anthropic_adapter_thinking_budget() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Analyze this".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-opus-4-6".to_string(),
            temperature: None,
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: Some(ThinkingParameter::Budget {
                thinking_type: "enabled".to_string(),
                budget_tokens: 16384,
            }),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["thinking"]["type"], "enabled");
        assert_eq!(adapted["thinking"]["budget_tokens"], 16384);
    }

    #[test]
    fn test_anthropic_adapter_thinking_level_maps_to_budget() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Deep analysis".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-opus-4-6".to_string(),
            temperature: None,
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: Some(ThinkingParameter::Level {
                level: "high".to_string(),
                max_thinking_tokens: None,
            }),
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(adapted["thinking"]["type"], "enabled");
        assert_eq!(
            adapted["thinking"]["budget_tokens"], 16384,
            "high level should map to 16384 budget tokens"
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Anthropic response parsing tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_anthropic_adapter_response_basic() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let api_response = json!({
            "id": "msg_123",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet-4-6",
            "content": [
                {"type": "text", "text": "Hello from Claude!"}
            ],
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": 15,
                "output_tokens": 8,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "Hello from Claude!");
        assert_eq!(response.prompt_tokens, Some(15));
        assert_eq!(response.completion_tokens, Some(8));
        assert_eq!(response.tokens, Some(23));
        assert_eq!(response.model, "claude-sonnet-4-6");
        assert_eq!(response.finish_reason, Some("end_turn".to_string()));
    }

    #[test]
    fn test_anthropic_adapter_response_with_tool_use() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let api_response = json!({
            "id": "msg_456",
            "type": "message",
            "role": "assistant",
            "model": "claude-sonnet-4-6",
            "content": [
                {"type": "text", "text": "Let me check the weather."},
                {
                    "type": "tool_use",
                    "id": "toolu_abc",
                    "name": "get_weather",
                    "input": {"location": "NYC"}
                }
            ],
            "stop_reason": "tool_use",
            "usage": {
                "input_tokens": 20,
                "output_tokens": 30
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "Let me check the weather.");
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "toolu_abc");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert!(tool_calls[0].arguments.contains("NYC"));
    }

    #[test]
    fn test_anthropic_adapter_response_with_thinking() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let api_response = json!({
            "id": "msg_789",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-4-6",
            "content": [
                {
                    "type": "thinking",
                    "thinking": "Let me reason through this step by step..."
                },
                {"type": "text", "text": "The answer is 42."}
            ],
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": 50,
                "output_tokens": 100
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "The answer is 42.");
        assert!(response.reasoning_content.is_some());
        assert!(response
            .reasoning_content
            .unwrap()
            .contains("step by step"));
    }

    // ────────────────────────────────────────────────────────────────
    // Google Gemini response parsing tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_google_adapter_response_basic() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let api_response = json!({
            "candidates": [{
                "content": {
                    "parts": [{"text": "Hello from Gemini!"}],
                    "role": "model"
                },
                "finishReason": "STOP"
            }],
            "usageMetadata": {
                "promptTokenCount": 10,
                "candidatesTokenCount": 5,
                "totalTokenCount": 15
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.content, "Hello from Gemini!");
        assert_eq!(response.prompt_tokens, Some(10));
        assert_eq!(response.completion_tokens, Some(5));
        assert_eq!(response.tokens, Some(15));
    }

    #[test]
    fn test_google_adapter_response_with_function_call() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let api_response = json!({
            "candidates": [{
                "content": {
                    "parts": [{
                        "functionCall": {
                            "name": "get_weather",
                            "args": {"city": "London"}
                        }
                    }],
                    "role": "model"
                },
                "finishReason": "STOP"
            }],
            "usageMetadata": {
                "promptTokenCount": 20,
                "candidatesTokenCount": 10,
                "totalTokenCount": 30
            }
        });

        let result = adapter.adapt_response(&api_response);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(response.tool_calls.is_some());
        let tool_calls = response.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "get_weather");
        assert!(tool_calls[0].arguments.contains("London"));
    }

    // ────────────────────────────────────────────────────────────────
    // Google Gemini tool_choice mapping tests
    // ────────────────────────────────────────────────────────────────

    #[test]
    fn test_google_adapter_tool_choice_specific() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Get weather".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get weather".to_string(),
                parameters: json!({"type": "object", "properties": {"city": {"type": "string"}}}),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Specific("get_weather".to_string())),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter.adapt_request(&request).unwrap();
        assert_eq!(
            adapted["toolConfig"]["functionCallingConfig"]["mode"],
            "ANY"
        );
        let allowed = adapted["toolConfig"]["functionCallingConfig"]["allowedFunctionNames"]
            .as_array()
            .unwrap();
        assert_eq!(allowed[0], "get_weather");
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #46 — Gemini multimodal image conversion to inlineData format
    // ────────────────────────────────────────────────────────────────

    /// Verifies that a user message carrying an image is converted to the
    /// Gemini `inlineData` parts format rather than being serialised as raw
    /// ChatMessage fields (which Gemini would reject).
    #[test]
    fn test_google_adapter_image_converted_to_inline_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        // Small 1×1 white PNG generated at compile time to avoid CRC issues.
        let png_data = {
            use image::{ImageBuffer, Rgb};
            let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
                ImageBuffer::from_fn(1, 1, |_, _| Rgb([255u8, 255u8, 255u8]));
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
            buf.into_inner()
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Describe this image".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: png_data,
                            format: ImageFormat::Png,
                            detail: ImageDetail::Auto,
                        },
                    },
                ]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle multimodal message");

        let contents = adapted["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0]["role"], "user");

        let parts = contents[0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 2, "should have text part and image part");

        // First part: plain text
        assert_eq!(parts[0]["text"], "Describe this image");

        // Second part: must use Gemini inlineData format — NOT raw base64 string or ChatMessage fields
        assert!(
            parts[1].get("inlineData").is_some(),
            "image must be converted to inlineData format, not passed as raw content"
        );
        assert_eq!(parts[1]["inlineData"]["mimeType"], "image/png");
        let data_str = parts[1]["inlineData"]["data"].as_str().unwrap();
        assert!(
            !data_str.is_empty(),
            "base64 data must be non-empty"
        );
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #50 — Anthropic DirectAPI: tool_calls and tool-role messages
    // ────────────────────────────────────────────────────────────────

    /// Verifies that an assistant message carrying OpenAI-style `tool_calls`
    /// is converted to Anthropic's `content` block array with `type: tool_use`
    /// entries rather than being passed as plain text.
    #[test]
    fn test_anthropic_adapter_tool_calls_converted_to_tool_use_blocks() {
        use crate::core::llm::ToolCall;

        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "What is the weather in Paris?".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Assistant message with a tool_call — this is the OpenAI-style format
                // that must be converted to Anthropic's tool_use content block.
                ChatMessage {
                    role: "assistant".to_string(),
                    content: String::new(),
                    tool_calls: Some(vec![ToolCall {
                        id: "toolu_xyz".to_string(),
                        name: "get_weather".to_string(),
                        arguments: r#"{"city":"Paris"}"#.to_string(),
                    }]),
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Tool result — role="tool" is OpenAI style and must become
                // role="user" with type: tool_result in Anthropic format.
                ChatMessage {
                    role: "tool".to_string(),
                    content: "Sunny, 22°C".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_xyz".to_string()),
                    multimodal_content: None,
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Anthropic adapter should handle tool_calls and tool role messages");

        let messages = adapted["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 3);

        // Message 0: plain user message
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"], "What is the weather in Paris?");

        // Message 1: assistant with tool_call converted to Anthropic tool_use content block
        assert_eq!(messages[1]["role"], "assistant");
        let assistant_content = messages[1]["content"].as_array().unwrap();
        assert_eq!(
            assistant_content.len(),
            1,
            "should have exactly one tool_use block"
        );
        assert_eq!(
            assistant_content[0]["type"], "tool_use",
            "assistant tool_calls must become type: tool_use blocks"
        );
        assert_eq!(assistant_content[0]["id"], "toolu_xyz");
        assert_eq!(assistant_content[0]["name"], "get_weather");
        assert_eq!(assistant_content[0]["input"]["city"], "Paris");

        // Message 2: tool result converted from role=tool to Anthropic role=user with tool_result
        assert_eq!(
            messages[2]["role"], "user",
            "tool result must use role=user in Anthropic format"
        );
        let tool_result_content = messages[2]["content"].as_array().unwrap();
        assert_eq!(tool_result_content.len(), 1);
        assert_eq!(
            tool_result_content[0]["type"], "tool_result",
            "tool result must use type: tool_result"
        );
        assert_eq!(tool_result_content[0]["tool_use_id"], "toolu_xyz");
        assert_eq!(tool_result_content[0]["content"], "Sunny, 22°C");
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #46 — Gemini multimodal: audio converted to inlineData
    // ────────────────────────────────────────────────────────────────

    /// Verifies that audio content parts are converted to Gemini inlineData
    /// format instead of being silently dropped.
    #[test]
    fn test_google_adapter_audio_converted_to_inline_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let audio_bytes = vec![0xFF, 0xFB, 0x90, 0x00]; // minimal MP3 frame header

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Transcribe this audio".to_string(),
                    },
                    ContentPart::Audio {
                        audio: AudioInput {
                            data: AudioData::Bytes(audio_bytes),
                            format: AudioFormat::Mp3,
                            duration_secs: None,
                        },
                    },
                ]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle audio content");

        let contents = adapted["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 1);

        let parts = contents[0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 2, "should have text part and audio part");

        assert_eq!(parts[0]["text"], "Transcribe this audio");

        assert!(
            parts[1].get("inlineData").is_some(),
            "audio must be converted to inlineData format"
        );
        assert_eq!(parts[1]["inlineData"]["mimeType"], "audio/mpeg");
        assert!(
            !parts[1]["inlineData"]["data"].as_str().unwrap().is_empty(),
            "base64 data must be non-empty"
        );
    }

    /// Verifies that audio with a base64 string is passed through directly.
    #[test]
    fn test_google_adapter_audio_base64_passthrough() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![ContentPart::Audio {
                    audio: AudioInput {
                        data: AudioData::Base64("c29tZS1hdWRpby1kYXRh".to_string()),
                        format: AudioFormat::Wav,
                        duration_secs: Some(3.5),
                    },
                }]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle base64 audio");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0]["inlineData"]["mimeType"], "audio/wav");
        assert_eq!(parts[0]["inlineData"]["data"], "c29tZS1hdWRpby1kYXRh");
    }

    /// Verifies that audio with a URI uses Gemini fileData format.
    #[test]
    fn test_google_adapter_audio_uri_uses_file_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![ContentPart::Audio {
                    audio: AudioInput {
                        data: AudioData::Uri("gs://bucket/audio.ogg".to_string()),
                        format: AudioFormat::Ogg,
                        duration_secs: None,
                    },
                }]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle audio URI");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 1);
        assert!(
            parts[0].get("fileData").is_some(),
            "URI audio must use fileData format"
        );
        assert_eq!(parts[0]["fileData"]["mimeType"], "audio/ogg");
        assert_eq!(parts[0]["fileData"]["fileUri"], "gs://bucket/audio.ogg");
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #46 — Gemini multimodal: video converted to inlineData/fileData
    // ────────────────────────────────────────────────────────────────

    /// Verifies that video bytes are converted to Gemini inlineData format.
    #[test]
    fn test_google_adapter_video_bytes_converted_to_inline_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let video_bytes = vec![0x00, 0x00, 0x00, 0x1C]; // minimal MP4 header fragment

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Describe this video".to_string(),
                    },
                    ContentPart::Video {
                        video: VideoInput {
                            data: VideoData::Bytes(video_bytes),
                            format: VideoFormat::Mp4,
                            duration_secs: Some(10.0),
                        },
                    },
                ]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle video bytes");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 2, "should have text part and video part");

        assert_eq!(parts[0]["text"], "Describe this video");

        assert!(
            parts[1].get("inlineData").is_some(),
            "video bytes must be converted to inlineData format"
        );
        assert_eq!(parts[1]["inlineData"]["mimeType"], "video/mp4");
        assert!(
            !parts[1]["inlineData"]["data"].as_str().unwrap().is_empty(),
            "base64 data must be non-empty"
        );
    }

    /// Verifies that video with a URI uses Gemini fileData format.
    #[test]
    fn test_google_adapter_video_uri_uses_file_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![ContentPart::Video {
                    video: VideoInput {
                        data: VideoData::Uri("gs://bucket/clip.webm".to_string()),
                        format: VideoFormat::Webm,
                        duration_secs: None,
                    },
                }]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle video URI");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 1);
        assert!(
            parts[0].get("fileData").is_some(),
            "URI video must use fileData format"
        );
        assert_eq!(parts[0]["fileData"]["mimeType"], "video/webm");
        assert_eq!(parts[0]["fileData"]["fileUri"], "gs://bucket/clip.webm");
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #46 — Gemini multimodal: document converted to inlineData
    // ────────────────────────────────────────────────────────────────

    /// Verifies that a PDF document is converted to Gemini inlineData format.
    #[test]
    fn test_google_adapter_document_converted_to_inline_data() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        let pdf_header = b"%PDF-1.4 fake".to_vec();

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Summarize this document".to_string(),
                    },
                    ContentPart::Document {
                        document: DocumentInput {
                            data: pdf_header,
                            format: DocumentFormat::Pdf,
                            name: Some("report.pdf".to_string()),
                        },
                    },
                ]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle document content");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 2, "should have text part and document part");

        assert_eq!(parts[0]["text"], "Summarize this document");

        assert!(
            parts[1].get("inlineData").is_some(),
            "document must be converted to inlineData format"
        );
        assert_eq!(parts[1]["inlineData"]["mimeType"], "application/pdf");
        assert!(
            !parts[1]["inlineData"]["data"].as_str().unwrap().is_empty(),
            "base64 data must be non-empty"
        );
    }

    /// Verifies that a mixed multimodal message with text, image, and audio
    /// produces the correct number of parts with proper formats.
    #[test]
    fn test_google_adapter_mixed_multimodal_text_image_audio() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Google);

        // 1x1 white PNG
        let png_data = {
            use image::{ImageBuffer, Rgb};
            let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
                ImageBuffer::from_fn(1, 1, |_, _| Rgb([255u8, 255u8, 255u8]));
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
            buf.into_inner()
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Analyze both".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: png_data,
                            format: ImageFormat::Png,
                            detail: ImageDetail::Auto,
                        },
                    },
                    ContentPart::Audio {
                        audio: AudioInput {
                            data: AudioData::Bytes(vec![0xAA, 0xBB]),
                            format: AudioFormat::Wav,
                            duration_secs: None,
                        },
                    },
                ]),
            }],
            model: "gemini-3-flash".to_string(),
            temperature: None,
            max_tokens: Some(256),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Google adapter should handle mixed multimodal");

        let parts = adapted["contents"][0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 3, "should have text + image + audio");

        // Text part
        assert_eq!(parts[0]["text"], "Analyze both");

        // Image part
        assert_eq!(parts[1]["inlineData"]["mimeType"], "image/png");

        // Audio part
        assert_eq!(parts[2]["inlineData"]["mimeType"], "audio/wav");
    }

    // ────────────────────────────────────────────────────────────────
    // Bug #50 — Anthropic DirectAPI: tool-role messages use correct role
    // ────────────────────────────────────────────────────────────────

    /// A multimodal message with role="tool" containing ToolResult content
    /// parts must be emitted with role="user" (Anthropic does not accept
    /// role="tool").  Before the fix, the multimodal path passed msg.role
    /// verbatim, so role="tool" leaked through.
    #[test]
    fn test_anthropic_adapter_multimodal_tool_result_uses_role_user() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Use the tool".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Assistant message with tool_use via multimodal content
                ChatMessage {
                    role: "assistant".to_string(),
                    content: String::new(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: Some(vec![ContentPart::ToolUse {
                        tool_use: ToolUseInput {
                            id: "toolu_multi_abc".to_string(),
                            name: "read_file".to_string(),
                            input: serde_json::json!({"path": "/tmp/test.txt"}),
                        },
                    }]),
                },
                // Tool result via multimodal path — role="tool" must become role="user"
                ChatMessage {
                    role: "tool".to_string(),
                    content: String::new(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: Some(vec![ContentPart::ToolResult {
                        tool_result: ToolResultInput {
                            tool_use_id: "toolu_multi_abc".to_string(),
                            content: "file contents here".to_string(),
                            is_error: false,
                        },
                    }]),
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("Anthropic adapter should handle multimodal tool result");

        let messages = adapted["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 3);

        // The tool result message MUST have role="user", NOT role="tool"
        assert_eq!(
            messages[2]["role"], "user",
            "multimodal tool result must use role=user, not role=tool"
        );

        let content = messages[2]["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "tool_result");
        assert_eq!(content[0]["tool_use_id"], "toolu_multi_abc");
        assert_eq!(content[0]["content"], "file contents here");
    }

    /// Orphaned tool result message (no preceding assistant tool_use) must
    /// cause an error rather than silently producing invalid API payloads.
    #[test]
    fn test_anthropic_adapter_orphaned_tool_result_returns_error() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Tool result with NO preceding assistant tool_use
                ChatMessage {
                    role: "tool".to_string(),
                    content: "some result".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_orphan_123".to_string()),
                    multimodal_content: None,
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(
            result.is_err(),
            "orphaned tool result must produce an error"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("toolu_orphan_123"),
            "error must mention the orphaned tool_use_id, got: {}",
            err_msg
        );
        assert!(
            err_msg.contains("no matching tool_use block"),
            "error must describe the orphan issue, got: {}",
            err_msg
        );
    }

    /// Orphaned tool result inside multimodal content parts must also be
    /// detected and rejected.
    #[test]
    fn test_anthropic_adapter_orphaned_multimodal_tool_result_returns_error() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Multimodal tool result with NO preceding assistant tool_use
                ChatMessage {
                    role: "user".to_string(),
                    content: String::new(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: Some(vec![ContentPart::ToolResult {
                        tool_result: ToolResultInput {
                            tool_use_id: "toolu_orphan_multi".to_string(),
                            content: "orphaned result".to_string(),
                            is_error: false,
                        },
                    }]),
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let result = adapter.adapt_request(&request);
        assert!(
            result.is_err(),
            "orphaned multimodal tool result must produce an error"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("toolu_orphan_multi"),
            "error must mention the orphaned tool_use_id"
        );
    }

    /// Valid multi-turn tool conversation: user -> assistant(tool_use) ->
    /// tool(result) -> assistant(text).  All pairings must validate.
    #[test]
    fn test_anthropic_adapter_valid_tool_pairing_succeeds() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Search for rust tutorials".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: String::new(),
                    tool_calls: Some(vec![ToolCall {
                        id: "toolu_search_1".to_string(),
                        name: "web_search".to_string(),
                        arguments: r#"{"query":"rust tutorials"}"#.to_string(),
                    }]),
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "tool".to_string(),
                    content: "Found 10 results for rust tutorials".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_search_1".to_string()),
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "Here are some rust tutorials...".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("valid tool pairing should succeed");

        let messages = adapted["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 4);

        // tool result must be role=user
        assert_eq!(messages[2]["role"], "user");
        let content = messages[2]["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "tool_result");
        assert_eq!(content[0]["tool_use_id"], "toolu_search_1");
    }

    /// Multiple sequential tool calls in a single assistant message must
    /// all be paired correctly with their respective tool result messages.
    #[test]
    fn test_anthropic_adapter_multiple_tool_calls_all_paired() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Get weather and news".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Assistant makes TWO tool calls
                ChatMessage {
                    role: "assistant".to_string(),
                    content: String::new(),
                    tool_calls: Some(vec![
                        ToolCall {
                            id: "toolu_weather".to_string(),
                            name: "get_weather".to_string(),
                            arguments: r#"{"city":"NYC"}"#.to_string(),
                        },
                        ToolCall {
                            id: "toolu_news".to_string(),
                            name: "get_news".to_string(),
                            arguments: r#"{"topic":"tech"}"#.to_string(),
                        },
                    ]),
                    tool_call_id: None,
                    multimodal_content: None,
                },
                // Two tool results
                ChatMessage {
                    role: "tool".to_string(),
                    content: "Sunny, 72F".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_weather".to_string()),
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "tool".to_string(),
                    content: "Top tech stories...".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_news".to_string()),
                    multimodal_content: None,
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("multiple tool pairings should succeed");

        let messages = adapted["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 4);

        // Both tool results must be role=user
        assert_eq!(messages[2]["role"], "user");
        assert_eq!(messages[3]["role"], "user");

        // Verify tool_use_ids are correct
        let weather_content = messages[2]["content"].as_array().unwrap();
        assert_eq!(weather_content[0]["tool_use_id"], "toolu_weather");

        let news_content = messages[3]["content"].as_array().unwrap();
        assert_eq!(news_content[0]["tool_use_id"], "toolu_news");

        // Verify assistant message has both tool_use blocks
        let assistant_content = messages[1]["content"].as_array().unwrap();
        assert_eq!(assistant_content.len(), 2);
        assert_eq!(assistant_content[0]["type"], "tool_use");
        assert_eq!(assistant_content[0]["id"], "toolu_weather");
        assert_eq!(assistant_content[1]["type"], "tool_use");
        assert_eq!(assistant_content[1]["id"], "toolu_news");
    }

    /// Verify that the adapter output for tool results matches the
    /// Anthropic API schema: role="user", content array with
    /// type="tool_result" blocks containing tool_use_id and content.
    #[test]
    fn test_anthropic_adapter_tool_result_matches_api_schema() {
        let adapter = ProviderAdapterFactory::create_adapter(Provider::Anthropic);

        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Run the command".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "I'll run that.".to_string(),
                    tool_calls: Some(vec![ToolCall {
                        id: "toolu_cmd_1".to_string(),
                        name: "bash".to_string(),
                        arguments: r#"{"command":"ls -la"}"#.to_string(),
                    }]),
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "tool".to_string(),
                    content: "total 42\ndrwxr-xr-x ...".to_string(),
                    tool_calls: None,
                    tool_call_id: Some("toolu_cmd_1".to_string()),
                    multimodal_content: None,
                },
            ],
            model: "claude-sonnet-4-6".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let adapted = adapter
            .adapt_request(&request)
            .expect("schema validation test should succeed");

        let tool_msg = &adapted["messages"][2];

        // Schema check: role MUST be "user"
        assert_eq!(tool_msg["role"], "user");

        // Schema check: content MUST be an array
        let content = tool_msg["content"].as_array().unwrap();
        assert!(!content.is_empty());

        // Schema check: each block must have required fields
        let block = &content[0];
        assert_eq!(block["type"], "tool_result");
        assert!(
            block.get("tool_use_id").is_some(),
            "tool_result block must have tool_use_id field"
        );
        assert_eq!(block["tool_use_id"], "toolu_cmd_1");
        assert!(
            block.get("content").is_some(),
            "tool_result block must have content field"
        );

        // Verify the assistant message also has the expected schema
        let assistant_msg = &adapted["messages"][1];
        assert_eq!(assistant_msg["role"], "assistant");
        let assistant_content = assistant_msg["content"].as_array().unwrap();
        // Should have text block + tool_use block
        assert_eq!(assistant_content.len(), 2);
        assert_eq!(assistant_content[0]["type"], "text");
        assert_eq!(assistant_content[0]["text"], "I'll run that.");
        assert_eq!(assistant_content[1]["type"], "tool_use");
        assert_eq!(assistant_content[1]["id"], "toolu_cmd_1");
        assert_eq!(assistant_content[1]["name"], "bash");
        assert_eq!(assistant_content[1]["input"]["command"], "ls -la");
    }
}
