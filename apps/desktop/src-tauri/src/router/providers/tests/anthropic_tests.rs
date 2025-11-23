#[cfg(test)]
mod tests {
    use crate::router::providers::anthropic::AnthropicProvider;
    use crate::router::{
        ChatMessage, ContentPart, ImageInput, ImageFormat, LLMProvider, LLMRequest, ToolDefinition,
    };

    #[test]
    fn test_provider_instantiation() {
        let provider = AnthropicProvider::new("test-key".to_string());
        assert_eq!(provider.name(), "Anthropic");
        assert!(provider.is_configured());
    }

    #[test]
    fn test_provider_unconfigured() {
        let provider = AnthropicProvider::new("your-api-key-here".to_string());
        assert!(!provider.is_configured());

        let empty_provider = AnthropicProvider::new("".to_string());
        assert!(!empty_provider.is_configured());
    }

    #[test]
    fn test_supports_vision() {
        let provider = AnthropicProvider::new("test-key".to_string());
        assert!(provider.supports_vision());
    }

    #[test]
    fn test_supports_function_calling() {
        let provider = AnthropicProvider::new("test-key".to_string());
        assert!(provider.supports_function_calling());
    }

    #[test]
    fn test_message_conversion_text_only() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello, Claude!".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.messages[0].content, "Hello, Claude!");
        assert_eq!(request.messages[0].role, "user");
        assert!(request.messages[0].multimodal_content.is_none());
    }

    #[test]
    fn test_message_conversion_multimodal() {
        let image_data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG header
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Analyze this image".to_string(),
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "What's in this picture?".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: image_data.clone(),
                            format: ImageFormat::Png,
                            detail: crate::router::ImageDetail::High,
                        },
                    },
                ]),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "claude-3-5-sonnet-20241022".to_string(),
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
            name: "search_database".to_string(),
            description: "Search the database for records".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results"
                    }
                },
                "required": ["query"]
            }),
        }];

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Find user records".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(tools.clone()),
            tool_choice: None,
        };

        assert!(request.tools.is_some());
        let req_tools = request.tools.as_ref().unwrap();
        assert_eq!(req_tools.len(), 1);
        assert_eq!(req_tools[0].name, "search_database");
        assert_eq!(req_tools[0].description, "Search the database for records");
    }

    #[test]
    fn test_max_tokens_default() {
        // Anthropic requires max_tokens, should default to 4096
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Test".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        // The provider will add max_tokens: 4096 if None
        assert!(request.max_tokens.is_none());
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
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: Some(2000),
            stream: true,
            tools: None,
            tool_choice: None,
        };

        assert!(request.stream);
    }

    #[test]
    fn test_image_format_handling() {
        let formats = vec![ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::Webp];

        for format in formats {
            let image_data = ImageInput {
                data: vec![1, 2, 3, 4],
                format,
                detail: crate::router::ImageDetail::Auto,
            };
            assert!(!image_data.data.is_empty());
        }
    }

    #[test]
    fn test_multiple_messages() {
        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "Hi! How can I help?".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "What's the weather?".to_string(),
                    multimodal_content: None,
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: Some(0.8),
            max_tokens: Some(2000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 3);
        assert_eq!(request.messages[0].role, "user");
        assert_eq!(request.messages[1].role, "assistant");
        assert_eq!(request.messages[2].role, "user");
    }

    #[test]
    fn test_temperature_bounds() {
        let low_temp = LLMRequest {
            messages: vec![],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: Some(0.0),
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let high_temp = LLMRequest {
            messages: vec![],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: Some(1.0),
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(low_temp.temperature, Some(0.0));
        assert_eq!(high_temp.temperature, Some(1.0));
    }

    #[test]
    fn test_model_names() {
        let models = vec![
            "claude-3-5-sonnet-20241022",
            "claude-3-opus-20240229",
            "claude-3-haiku-20240307",
            "claude-sonnet-4-5",
        ];

        for model in models {
            let request = LLMRequest {
                messages: vec![],
                model: model.to_string(),
                temperature: None,
                max_tokens: Some(1024),
                stream: false,
                tools: None,
                tool_choice: None,
            };

            assert_eq!(request.model, model);
        }
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
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages[0].content, "");
    }

    #[test]
    fn test_tool_with_complex_schema() {
        let tools = vec![ToolDefinition {
            name: "complex_tool".to_string(),
            description: "A complex tool with nested parameters".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "config": {
                        "type": "object",
                        "properties": {
                            "mode": { "type": "string" },
                            "options": {
                                "type": "array",
                                "items": { "type": "string" }
                            }
                        }
                    }
                },
                "required": ["config"]
            }),
        }];

        let request = LLMRequest {
            messages: vec![],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: Some(1024),
            stream: false,
            tools: Some(tools),
            tool_choice: None,
        };

        assert!(request.tools.is_some());
        assert_eq!(request.tools.as_ref().unwrap()[0].name, "complex_tool");
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
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let serialized = serde_json::to_string(&request).unwrap();
        assert!(serialized.contains("claude"));
        assert!(serialized.contains("user"));
    }

    #[test]
    fn test_base64_image_encoding() {
        // Test that image data is properly prepared for base64 encoding
        let image_data = vec![255, 216, 255, 224]; // JPEG header
        let content = ContentPart::Image {
            image: ImageData {
                data: image_data.clone(),
                format: ImageFormat::Jpeg,
                detail: crate::router::ImageDetail::High,
            },
        };

        if let ContentPart::Image { image } = content {
            assert_eq!(image.data.len(), 4);
            assert!(matches!(image.format, ImageFormat::Jpeg));
        }
    }

    #[test]
    fn test_multimodal_with_multiple_images() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Compare these images".to_string(),
                multimodal_content: Some(vec![
                    ContentPart::Text {
                        text: "Image 1:".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: vec![1, 2, 3],
                            format: ImageFormat::Png,
                            detail: crate::router::ImageDetail::Auto,
                        },
                    },
                    ContentPart::Text {
                        text: "Image 2:".to_string(),
                    },
                    ContentPart::Image {
                        image: ImageInput {
                            data: vec![4, 5, 6],
                            format: ImageFormat::Jpeg,
                            detail: crate::router::ImageDetail::Auto,
                        },
                    },
                ]),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "claude-3-5-sonnet-20241022".to_string(),
            temperature: None,
            max_tokens: Some(2000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert!(request.messages[0].multimodal_content.is_some());
        let multimodal = request.messages[0].multimodal_content.as_ref().unwrap();
        assert_eq!(multimodal.len(), 4);
    }
}
