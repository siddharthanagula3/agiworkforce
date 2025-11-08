#[cfg(test)]
mod tests {
    use crate::router::{ChatMessage, LLMRequest, Provider, RouteCandidate, RouterPreferences, RoutingStrategy};

    #[test]
    fn test_provider_enum_values() {
        let providers = vec![
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
        ];

        assert_eq!(providers.len(), 4);
    }

    #[test]
    fn test_provider_string_conversion() {
        assert_eq!(Provider::OpenAI.as_string(), "openai");
        assert_eq!(Provider::Anthropic.as_string(), "anthropic");
        assert_eq!(Provider::Google.as_string(), "google");
        assert_eq!(Provider::Ollama.as_string(), "ollama");
    }

    #[test]
    fn test_provider_from_string() {
        assert_eq!(Provider::from_string("openai"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_string("anthropic"), Some(Provider::Anthropic));
        assert_eq!(Provider::from_string("google"), Some(Provider::Google));
        assert_eq!(Provider::from_string("ollama"), Some(Provider::Ollama));
        assert_eq!(Provider::from_string("invalid"), None);
    }

    #[test]
    fn test_provider_from_string_case_insensitive() {
        assert_eq!(Provider::from_string("OpenAI"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_string("ANTHROPIC"), Some(Provider::Anthropic));
        assert_eq!(Provider::from_string("GoOgLe"), Some(Provider::Google));
    }

    #[test]
    fn test_llm_request_creation() {
        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(1000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 1);
        assert_eq!(request.model, "gpt-4");
        assert_eq!(request.temperature, Some(0.7));
        assert!(!request.stream);
    }

    #[test]
    fn test_chat_message_creation() {
        let message = ChatMessage {
            role: "assistant".to_string(),
            content: "Response".to_string(),
            tool_calls: None,
            tool_call_id: None,
        };

        assert_eq!(message.role, "assistant");
        assert_eq!(message.content, "Response");
    }

    #[test]
    fn test_routing_strategy_default() {
        let strategy = RoutingStrategy::default();
        assert_eq!(strategy, RoutingStrategy::Auto);
    }

    #[test]
    fn test_routing_strategy_variants() {
        let strategies = vec![
            RoutingStrategy::Auto,
            RoutingStrategy::CostOptimized,
            RoutingStrategy::LatencyOptimized,
            RoutingStrategy::LocalFirst,
        ];

        assert_eq!(strategies.len(), 4);
    }

    #[test]
    fn test_router_preferences_default() {
        let prefs = RouterPreferences::default();
        assert!(prefs.provider.is_none());
        assert!(prefs.model.is_none());
        assert_eq!(prefs.strategy, RoutingStrategy::Auto);
    }

    #[test]
    fn test_router_preferences_with_provider() {
        let prefs = RouterPreferences {
            provider: Some(Provider::Ollama),
            model: Some("llama3".to_string()),
            strategy: RoutingStrategy::LocalFirst,
        };

        assert_eq!(prefs.provider, Some(Provider::Ollama));
        assert_eq!(prefs.model, Some("llama3".to_string()));
        assert_eq!(prefs.strategy, RoutingStrategy::LocalFirst);
    }

    #[test]
    fn test_route_candidate_creation() {
        let candidate = RouteCandidate {
            provider: Provider::OpenAI,
            model: "gpt-4".to_string(),
            reason: "Preferred provider",
        };

        assert_eq!(candidate.provider, Provider::OpenAI);
        assert_eq!(candidate.model, "gpt-4");
        assert_eq!(candidate.reason, "Preferred provider");
    }

    #[test]
    fn test_llm_request_serialization() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Test".to_string(),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "test-model".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let serialized = serde_json::to_string(&request).unwrap();
        let deserialized: LLMRequest = serde_json::from_str(&serialized).unwrap();

        assert_eq!(request.messages.len(), deserialized.messages.len());
        assert_eq!(request.model, deserialized.model);
    }

    #[test]
    fn test_provider_serialization() {
        let provider = Provider::Anthropic;
        let serialized = serde_json::to_string(&provider).unwrap();
        let deserialized: Provider = serde_json::from_str(&serialized).unwrap();

        assert_eq!(provider, deserialized);
    }

    #[test]
    fn test_multiple_messages_in_request() {
        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are helpful".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "assistant".to_string(),
                    content: "Hi there".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "How are you?".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            model: "gpt-4".to_string(),
            temperature: Some(0.8),
            max_tokens: Some(2000),
            stream: true,
            tools: None,
            tool_choice: None,
        };

        assert_eq!(request.messages.len(), 4);
        assert!(request.stream);
    }

    #[test]
    fn test_streaming_request() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Stream this".to_string(),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "test".to_string(),
            temperature: None,
            max_tokens: None,
            stream: true,
            tools: None,
            tool_choice: None,
        };

        assert!(request.stream);
    }

    #[test]
    fn test_temperature_range() {
        let request = LLMRequest {
            messages: vec![],
            model: "test".to_string(),
            temperature: Some(1.5),
            max_tokens: None,
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert!(request.temperature.unwrap() <= 2.0);
    }

    #[test]
    fn test_max_tokens_limit() {
        let request = LLMRequest {
            messages: vec![],
            model: "test".to_string(),
            temperature: None,
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        assert!(request.max_tokens.unwrap() > 0);
    }
}
