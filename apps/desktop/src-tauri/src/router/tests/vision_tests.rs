#[cfg(test)]
mod vision_tests {
    use crate::router::{
        ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest,
    };

    /// Create a simple 1x1 PNG image for testing
    fn create_test_image() -> Vec<u8> {
        // Simple 1x1 white PNG (base64: iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)
        vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0xFC, 0xFF, 0x9F, 0xA1, 0x1E, 0x00, 0x07, 0x82, 0x02, 0x7F, 0x3D, 0xC8,
            0x48, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ]
    }

    #[test]
    fn test_create_multimodal_message() {
        let image = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Png,
            detail: ImageDetail::Auto,
        };

        let message = ChatMessage {
            role: "user".to_string(),
            content: "What's in this image?".to_string(),
            multimodal_content: Some(vec![
                ContentPart::Text {
                    text: "Please analyze:".to_string(),
                },
                ContentPart::Image {
                    image: image.clone(),
                },
            ]),
            tool_calls: None,
            tool_call_id: None,
        };

        assert_eq!(message.role, "user");
        assert_eq!(message.content, "What's in this image?");
        assert!(message.multimodal_content.is_some());

        let parts = message.multimodal_content.unwrap();
        assert_eq!(parts.len(), 2);

        match &parts[0] {
            ContentPart::Text { text } => assert_eq!(text, "Please analyze:"),
            _ => panic!("Expected text part"),
        }

        match &parts[1] {
            ContentPart::Image { image: img } => {
                assert_eq!(img.format, ImageFormat::Png);
                assert_eq!(img.detail, ImageDetail::Auto);
            }
            _ => panic!("Expected image part"),
        }
    }

    #[test]
    fn test_vision_request_structure() {
        let image = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Jpeg,
            detail: ImageDetail::High,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Describe this image in detail".to_string(),
                multimodal_content: Some(vec![ContentPart::Image { image }]),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4o".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1024),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.model, "gpt-4o");
        assert!(request.messages[0].multimodal_content.is_some());
    }

    #[test]
    fn test_multiple_images_in_message() {
        let image1 = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Png,
            detail: ImageDetail::Low,
        };

        let image2 = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Jpeg,
            detail: ImageDetail::High,
        };

        let message = ChatMessage {
            role: "user".to_string(),
            content: "Compare these two images".to_string(),
            multimodal_content: Some(vec![
                ContentPart::Image {
                    image: image1.clone(),
                },
                ContentPart::Text {
                    text: "vs".to_string(),
                },
                ContentPart::Image {
                    image: image2.clone(),
                },
            ]),
            tool_calls: None,
            tool_call_id: None,
        };

        let parts = message.multimodal_content.unwrap();
        assert_eq!(parts.len(), 3);

        // Check first image
        match &parts[0] {
            ContentPart::Image { image } => {
                assert_eq!(image.format, ImageFormat::Png);
                assert_eq!(image.detail, ImageDetail::Low);
            }
            _ => panic!("Expected image part"),
        }

        // Check text separator
        match &parts[1] {
            ContentPart::Text { text } => assert_eq!(text, "vs"),
            _ => panic!("Expected text part"),
        }

        // Check second image
        match &parts[2] {
            ContentPart::Image { image } => {
                assert_eq!(image.format, ImageFormat::Jpeg);
                assert_eq!(image.detail, ImageDetail::High);
            }
            _ => panic!("Expected image part"),
        }
    }

    #[test]
    fn test_image_format_variants() {
        let formats = vec![
            (ImageFormat::Png, "png"),
            (ImageFormat::Jpeg, "jpeg"),
            (ImageFormat::Webp, "webp"),
        ];

        for (format, _name) in formats {
            let image = ImageInput {
                data: create_test_image(),
                format,
                detail: ImageDetail::Auto,
            };

            assert_eq!(image.format, format);
        }
    }

    #[test]
    fn test_image_detail_variants() {
        let details = vec![
            ImageDetail::Low,
            ImageDetail::High,
            ImageDetail::Auto,
        ];

        for detail in details {
            let image = ImageInput {
                data: create_test_image(),
                format: ImageFormat::Png,
                detail,
            };

            assert_eq!(image.detail, detail);
        }
    }

    #[test]
    fn test_vision_with_function_calling() {
        use crate::router::{ToolChoice, ToolDefinition};

        let image = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Png,
            detail: ImageDetail::Auto,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What objects are in this image?".to_string(),
                multimodal_content: Some(vec![ContentPart::Image { image }]),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4o".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "identify_objects".to_string(),
                description: "Identify objects in an image".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "objects": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "confidence": {"type": "number"}
                                }
                            }
                        }
                    },
                    "required": ["objects"]
                }),
            }]),
            tool_choice: Some(ToolChoice::Auto),
        };

        assert!(request.tools.is_some());
        assert_eq!(request.tools.as_ref().unwrap().len(), 1);
        assert!(request.messages[0].multimodal_content.is_some());
    }

    #[test]
    fn test_conversation_with_vision() {
        let image = ImageInput {
            data: create_test_image(),
            format: ImageFormat::Png,
            detail: ImageDetail::Auto,
        };

        let messages = vec![
            ChatMessage {
                role: "user".to_string(),
                content: "What's in this image?".to_string(),
                multimodal_content: Some(vec![ContentPart::Image { image }]),
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: "I see a white square.".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: "What color is it exactly?".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        assert_eq!(messages.len(), 3);
        assert!(messages[0].multimodal_content.is_some());
        assert!(messages[1].multimodal_content.is_none());
        assert!(messages[2].multimodal_content.is_none());
    }
}

#[cfg(test)]
mod function_calling_tests {
    use crate::router::{ChatMessage, LLMRequest, ToolCall, ToolChoice, ToolDefinition};

    #[test]
    fn test_function_definition() {
        let tool_def = ToolDefinition {
            name: "get_weather".to_string(),
            description: "Get the current weather for a location".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["location"]
            }),
        };

        assert_eq!(tool_def.name, "get_weather");
        assert_eq!(
            tool_def.parameters["properties"]["location"]["type"],
            "string"
        );
        assert_eq!(tool_def.parameters["required"][0], "location");
    }

    #[test]
    fn test_tool_call_structure() {
        let tool_call = ToolCall {
            id: "call_123".to_string(),
            name: "get_weather".to_string(),
            arguments: r#"{"location": "San Francisco", "unit": "celsius"}"#.to_string(),
        };

        assert_eq!(tool_call.id, "call_123");
        assert_eq!(tool_call.name, "get_weather");

        let args: serde_json::Value = serde_json::from_str(&tool_call.arguments).unwrap();
        assert_eq!(args["location"], "San Francisco");
        assert_eq!(args["unit"], "celsius");
    }

    #[test]
    fn test_tool_choice_variants() {
        let auto = ToolChoice::Auto;
        let required = ToolChoice::Required;
        let none = ToolChoice::None;
        let specific = ToolChoice::Specific("get_weather".to_string());

        match auto {
            ToolChoice::Auto => {}
            _ => panic!("Expected Auto"),
        }

        match required {
            ToolChoice::Required => {}
            _ => panic!("Expected Required"),
        }

        match none {
            ToolChoice::None => {}
            _ => panic!("Expected None"),
        }

        match specific {
            ToolChoice::Specific(name) => assert_eq!(name, "get_weather"),
            _ => panic!("Expected Specific"),
        }
    }

    #[test]
    fn test_function_calling_request() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What's the weather in San Francisco?".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1024),
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get current weather".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"}
                    },
                    "required": ["location"]
                }),
            }]),
            tool_choice: Some(ToolChoice::Auto),
        };

        assert!(request.tools.is_some());
        assert_eq!(request.tools.as_ref().unwrap().len(), 1);
        assert_eq!(request.tools.as_ref().unwrap()[0].name, "get_weather");
    }

    #[test]
    fn test_multi_turn_function_calling() {
        let messages = vec![
            // User asks a question
            ChatMessage {
                role: "user".to_string(),
                content: "What's the weather in SF?".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
            // Assistant calls a function
            ChatMessage {
                role: "assistant".to_string(),
                content: String::new(),
                multimodal_content: None,
                tool_calls: Some(vec![ToolCall {
                    id: "call_123".to_string(),
                    name: "get_weather".to_string(),
                    arguments: r#"{"location": "San Francisco"}"#.to_string(),
                }]),
                tool_call_id: None,
            },
            // Function result
            ChatMessage {
                role: "tool".to_string(),
                content: r#"{"temperature": 65, "condition": "sunny"}"#.to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: Some("call_123".to_string()),
            },
            // Assistant responds with result
            ChatMessage {
                role: "assistant".to_string(),
                content: "It's 65°F and sunny in San Francisco.".to_string(),
                multimodal_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        assert_eq!(messages.len(), 4);
        assert!(messages[1].tool_calls.is_some());
        assert_eq!(messages[2].role, "tool");
        assert_eq!(messages[2].tool_call_id, Some("call_123".to_string()));
    }

    #[test]
    fn test_multiple_function_calls() {
        let tool_calls = vec![
            ToolCall {
                id: "call_1".to_string(),
                name: "get_weather".to_string(),
                arguments: r#"{"location": "San Francisco"}"#.to_string(),
            },
            ToolCall {
                id: "call_2".to_string(),
                name: "get_weather".to_string(),
                arguments: r#"{"location": "New York"}"#.to_string(),
            },
            ToolCall {
                id: "call_3".to_string(),
                name: "get_time".to_string(),
                arguments: r#"{"timezone": "America/Los_Angeles"}"#.to_string(),
            },
        ];

        let message = ChatMessage {
            role: "assistant".to_string(),
            content: String::new(),
            multimodal_content: None,
            tool_calls: Some(tool_calls.clone()),
            tool_call_id: None,
        };

        assert_eq!(message.tool_calls.as_ref().unwrap().len(), 3);
        assert_eq!(message.tool_calls.as_ref().unwrap()[0].name, "get_weather");
        assert_eq!(message.tool_calls.as_ref().unwrap()[2].name, "get_time");
    }
}
