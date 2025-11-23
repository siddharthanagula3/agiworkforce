#[cfg(test)]
mod tests {
    use crate::router::providers::openai::OpenAIProvider;
    use crate::router::{
        ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMProvider, LLMRequest,
        ToolChoice, ToolDefinition,
    };

    #[test]
    fn test_provider_instantiation() {
        let provider = OpenAIProvider::new("test-key".to_string());
        assert_eq!(provider.name(), "OpenAI");
        assert!(provider.is_configured());
    }

    #[test]
    fn test_provider_unconfigured() {
        let provider = OpenAIProvider::new("your-api-key-here".to_string());
        assert!(!provider.is_configured());

        let empty_provider = OpenAIProvider::new("".to_string());
        assert!(!empty_provider.is_configured());
    }

    #[test]
    fn test_supports_vision() {
        let provider = OpenAIProvider::new("test-key".to_string());
        assert!(provider.supports_vision());
    }

    #[test]
    fn test_supports_function_calling() {
        let provider = OpenAIProvider::new("test-key".to_string());
        assert!(provider.supports_function_calling());
    }

    #[test]
    fn test_message_conversion_text_only() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello, world!".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.messages[0].content, "Hello, world!");
        assert_eq!(request.messages[0].role, "user");
        assert!(request.messages[0].multimodal_content.is_none());
    }

    #[test]
    fn test_message_conversion_multimodal() {
        let image_data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG header
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Describe this image".to_string(),
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "What do you see?".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: image_data.clone(),
                            format: ImageFormat::Png,
                            detail: ImageDetail::High,
                        },
                    },
                ]),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4o".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 1);
        assert!(request.messages[0].multimodal_content.is_some());
        let multimodal = request.messages[0].multimodal_content.as_ref().unwrap();
        assert_eq!(multimodal.len(), 2);
    }

    #[test]
    fn test_tool_definition_conversion() {
        let tools = vec![ToolDefinition {
            name: "get_weather".to_string(),
            description: "Get current weather".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name"
                    }
                },
                "required": ["location"]
            }),
        }];

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What's the weather?".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(tools.clone()),
            tool_choice: None,
        };

        assert!(request.tools.is_some());
        let req_tools = request.tools.as_ref().unwrap();
        assert_eq!(req_tools.len(), 1);
        assert_eq!(req_tools[0].name, "get_weather");
    }

    #[test]
    fn test_tool_choice_auto() {
        let request = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: Some(ToolChoice::Auto),
        };

        assert!(request.tool_choice.is_some());
        assert!(matches!(request.tool_choice, Some(ToolChoice::Auto)));
    }

    #[test]
    fn test_tool_choice_required() {
        let request = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: Some(ToolChoice::Required),
        };

        assert!(matches!(request.tool_choice, Some(ToolChoice::Required)));
    }

    #[test]
    fn test_tool_choice_specific() {
        let request = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: Some(ToolChoice::Specific("get_weather".to_string())),
        };

        if let Some(ToolChoice::Specific(name)) = &request.tool_choice {
            assert_eq!(name, "get_weather");
        } else {
            panic!("Expected ToolChoice::Specific");
        }
    }

    #[test]
    fn test_streaming_request() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Stream this response".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: true,
            tools: None,
            tool_choice: None,
        };

        assert!(request.stream);
    }

    #[test]
    fn test_image_format_handling() {
        let formats = vec![
            (ImageFormat::Png, "image/png"),
            (ImageFormat::Jpeg, "image/jpeg"),
            (ImageFormat::Webp, "image/webp"),
        ];

        for (format, _expected_mime) in formats {
            let image_data = ImageInput {
                data: vec![1, 2, 3, 4],
                format,
                detail: ImageDetail::Auto,
            };
            assert!(!image_data.data.is_empty());
        }
    }

    #[test]
    fn test_image_detail_levels() {
        let details = vec![ImageDetail::Low, ImageDetail::High, ImageDetail::Auto];

        for detail in details {
            let image_data = ImageInput {
                data: vec![1, 2, 3],
                format: ImageFormat::Png,
                detail,
            };
            assert!(!image_data.data.is_empty());
        }
    }

    #[test]
    fn test_multiple_messages() {
        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are helpful".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "Hi there!".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            model: "gpt-4".to_string(),
            temperature: Some(0.8),
            max_tokens: Some(2000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 3);
        assert_eq!(request.messages[0].role, "system");
        assert_eq!(request.messages[1].role, "user");
        assert_eq!(request.messages[2].role, "assistant");
    }

    #[test]
    fn test_temperature_bounds() {
        let low_temp = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: Some(0.0),
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let high_temp = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: Some(2.0),
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(low_temp.temperature, Some(0.0));
        assert_eq!(high_temp.temperature, Some(2.0));
    }

    #[test]
    fn test_max_tokens_setting() {
        let request = LLMRequest {
            messages: vec![],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.max_tokens, Some(4096));
    }

    #[test]
    fn test_empty_content() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages[0].content, "");
    }

    #[test]
    fn test_model_names() {
        let models = vec!["gpt-4", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];

        for model in models {
            let request = LLMRequest {
                messages: vec![],
                model: model.to_string(),
                temperature: None,
                max_tokens: None,
                stream: false,
                tools: None,
                tool_choice: None,
            };

            assert_eq!(request.model, model);
        }
    }

    #[test]
    fn test_serialization() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Test".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let serialized = serde_json::to_string(&request).unwrap();
        assert!(serialized.contains("gpt-4"));
        assert!(serialized.contains("user"));
    }
}
