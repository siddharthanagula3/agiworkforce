//! Unit tests for provider adapters

#[cfg(test)]
mod tests {
    use crate::core::llm::provider_adapter::{OpenAIServerTool, ProviderAdapterFactory};
    use crate::core::llm::{
        ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest, Provider,
        ResponseFormat, ThinkingParameter, ToolChoice, ToolDefinition,
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
            model: "gpt-5.2".to_string(),
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
        assert_eq!(adapted["model"], "gpt-5.2");
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
            model: "gpt-5-nano".to_string(),
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
            model: "gpt-5.2".to_string(),
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
            "model": "gpt-5.2",
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
            "model": "gpt-5.2-codex",
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
            model: "gpt-4.1-vision".to_string(),
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
        assert_eq!(adapted["model"], "gpt-4.1-vision");

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
            model: "gpt-5.2".to_string(), // GPT-5 uses Responses API
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
        assert_eq!(adapted["model"], "gpt-5.2");
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
            model: "gemini-2.0-flash".to_string(),
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
            model: "gemini-2.0-flash".to_string(),
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
            model: "gemini-2.0-flash".to_string(),
            temperature: None,
            max_tokens: Some(128),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get weather".to_string(),
                parameters: json!({"type": "object", "properties": {"city": {"type": "string"}}}),
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
            model: "gemini-2.0-flash".to_string(),
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
}
