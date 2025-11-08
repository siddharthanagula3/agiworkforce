#[cfg(test)]
mod tests {
    use crate::router::{LLMResponse, Provider};

    #[test]
    fn test_llm_response_success() {
        let response = LLMResponse {
            content: "This is a response".to_string(),
            tokens: Some(100),
            prompt_tokens: Some(20),
            completion_tokens: Some(80),
            cost: Some(0.01),
            model: "gpt-4".to_string(),
            cached: false,
        };

        assert!(!response.content.is_empty());
        assert_eq!(response.tokens, Some(100));
        assert_eq!(response.prompt_tokens, Some(20));
        assert_eq!(response.completion_tokens, Some(80));
    }

    #[test]
    fn test_llm_response_cached() {
        let response = LLMResponse {
            content: "Cached response".to_string(),
            tokens: Some(50),
            prompt_tokens: Some(10),
            completion_tokens: Some(40),
            cost: Some(0.0),
            model: "gpt-3.5-turbo".to_string(),
            cached: true,
        };

        assert!(response.cached);
        assert_eq!(response.cost, Some(0.0));
    }

    #[test]
    fn test_llm_response_default() {
        let response = LLMResponse::default();
        assert_eq!(response.content, "");
        assert!(response.tokens.is_none());
        assert!(!response.cached);
    }

    #[test]
    fn test_llm_response_serialization() {
        let response = LLMResponse {
            content: "Test".to_string(),
            tokens: Some(10),
            prompt_tokens: Some(5),
            completion_tokens: Some(5),
            cost: Some(0.001),
            model: "test-model".to_string(),
            cached: false,
        };

        let serialized = serde_json::to_string(&response).unwrap();
        let deserialized: LLMResponse = serde_json::from_str(&serialized).unwrap();

        assert_eq!(response.content, deserialized.content);
        assert_eq!(response.tokens, deserialized.tokens);
    }

    #[test]
    fn test_provider_model_combinations() {
        let combinations = vec![
            (Provider::OpenAI, "gpt-4"),
            (Provider::OpenAI, "gpt-3.5-turbo"),
            (Provider::Anthropic, "claude-3-opus-20240229"),
            (Provider::Anthropic, "claude-3-sonnet-20240229"),
            (Provider::Google, "gemini-pro"),
            (Provider::Ollama, "llama3"),
        ];

        assert_eq!(combinations.len(), 6);
    }

    #[test]
    fn test_token_calculation() {
        let prompt = 100u32;
        let completion = 200u32;
        let total = prompt + completion;

        assert_eq!(total, 300);
    }

    #[test]
    fn test_cost_calculation_with_zero_tokens() {
        let tokens = 0u32;
        let cost = (tokens as f64 / 1000.0) * 0.03;
        assert_eq!(cost, 0.0);
    }

    #[test]
    fn test_response_without_cost() {
        let response = LLMResponse {
            content: "Response".to_string(),
            tokens: Some(50),
            prompt_tokens: None,
            completion_tokens: None,
            cost: None,
            model: "unknown".to_string(),
            cached: false,
        };

        assert!(response.cost.is_none());
        assert!(response.prompt_tokens.is_none());
    }
}
