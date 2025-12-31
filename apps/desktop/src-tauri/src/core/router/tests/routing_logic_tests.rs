#[cfg(test)]
mod tests {
    use crate::core::router::{CostPriority, LLMRouter, Provider, RouterContext};

    #[test]
    #[ignore]
    fn test_routing_logic_simple_context() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["chat".to_string()],
            requires_vision: false,
            token_estimate: 100,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5-mini");
    }

    #[test]
    fn test_routing_logic_vision_priority() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["chat".to_string()],
            requires_vision: true,
            token_estimate: 100,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro");
    }

    #[test]
    fn test_routing_logic_creative_task() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["creative".to_string(), "design".to_string()],
            requires_vision: false,
            token_estimate: 100,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro");
    }

    #[test]
    #[ignore]
    fn test_routing_logic_complex_coding() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["code".to_string(), "devops".to_string()],
            requires_vision: false,
            token_estimate: 100,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-4-5");
    }

    #[test]
    #[ignore]
    fn test_routing_logic_writing_research() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["writing".to_string(), "research".to_string()],
            requires_vision: false,
            token_estimate: 100,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.2");
    }

    #[test]
    fn test_routing_logic_low_cost() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["chat".to_string()],
            requires_vision: false,
            token_estimate: 100,
            cost_priority: CostPriority::Low,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash");
    }

    #[test]
    #[ignore]
    fn test_routing_logic_large_context_upgrade() {
        let router = LLMRouter::new();
        let context = RouterContext {
            intents: vec!["writing".to_string()],
            requires_vision: false,
            token_estimate: 15_000,
            cost_priority: CostPriority::Balanced,
            plan_tier: "hobby".to_string(),
        };

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.2");
    }
}
