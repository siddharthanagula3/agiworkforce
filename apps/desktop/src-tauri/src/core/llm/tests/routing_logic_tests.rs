#[cfg(test)]
mod tests {
    use crate::core::llm::{CostPriority, LLMRouter, Provider, RouterContext};

    /// Helper to create a default RouterContext with legacy fields only
    fn legacy_context(
        intents: Vec<String>,
        requires_vision: bool,
        token_estimate: u32,
        cost_priority: CostPriority,
        plan_tier: &str,
    ) -> RouterContext {
        RouterContext {
            intents,
            requires_vision,
            token_estimate,
            cost_priority,
            plan_tier: plan_tier.to_string(),
            // New intelligent routing fields set to None (legacy mode)
            intent_type: None,
            model_category: None,
            selected_model: None,
            suggested_tool_categories: None,
            auto_execute_tools: None,
            confidence: None,
            routing_reason: None,
        }
    }

    /// Helper to create a RouterContext with intelligent routing fields
    fn intelligent_context(
        plan_tier: &str,
        intent_type: Option<&str>,
        model_category: Option<&str>,
        selected_model: Option<&str>,
    ) -> RouterContext {
        RouterContext {
            intents: Vec::new(),
            requires_vision: false,
            token_estimate: 0,
            cost_priority: CostPriority::Balanced,
            plan_tier: plan_tier.to_string(),
            intent_type: intent_type.map(String::from),
            model_category: model_category.map(String::from),
            selected_model: selected_model.map(String::from),
            suggested_tool_categories: None,
            auto_execute_tools: None,
            confidence: Some(0.9),
            routing_reason: Some("Test routing".to_string()),
        }
    }

    // ============================================
    // LEGACY ROUTING TESTS (backward compatibility)
    // ============================================

    #[test]
    #[ignore]
    fn test_routing_logic_simple_context() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v3.2");
    }

    #[test]
    fn test_routing_logic_vision_priority() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            true,
            100,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro");
    }

    #[test]
    fn test_routing_logic_creative_task() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["creative".to_string(), "design".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro"); // Creative uses Pro for vision/multimodal
    }

    #[test]
    #[ignore]
    fn test_routing_logic_complex_coding() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["code".to_string(), "devops".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v3.2");
    }

    #[test]
    #[ignore]
    fn test_routing_logic_writing_research() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["writing".to_string(), "research".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash");
    }

    #[test]
    fn test_routing_logic_low_cost() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Low,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v3.2");
    }

    #[test]
    #[ignore]
    fn test_routing_logic_large_context_upgrade() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["writing".to_string()],
            false,
            15_000,
            CostPriority::Balanced,
            "hobby",
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash"); // Budget plan heavy context -> Gemini Flash
    }

    // ============================================
    // INTELLIGENT ROUTING TESTS (January 2026)
    // Note: These tests require providers to be configured.
    // They test the routing logic when providers are available.
    // ============================================

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_selected_model_priority() {
        let router = LLMRouter::new();
        // When selected_model is provided, it should be used directly
        let context = intelligent_context(
            "pro",
            Some("coding"),
            Some("chat"),
            Some("claude-sonnet-4-5"), // Explicitly selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Provider is inferred from model name
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-4-5");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_infer_openai_provider() {
        let router = LLMRouter::new();
        let context = intelligent_context("pro", Some("chat"), Some("chat"), Some("gpt-5.2"));

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.2");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_infer_google_provider() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "hobby",
            Some("multimodal"),
            Some("chat"),
            Some("gemini-3-flash"),
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_infer_deepseek_provider() {
        let router = LLMRouter::new();
        let context =
            intelligent_context("hobby", Some("coding"), Some("chat"), Some("deepseek-v3.2"));

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v3.2");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_infer_perplexity_provider() {
        let router = LLMRouter::new();
        let context = intelligent_context("pro", Some("search"), Some("search"), Some("sonar"));

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_infer_xai_provider() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "hobby",
            Some("reasoning"),
            Some("chat"),
            Some("grok-4.1-fast-reasoning"),
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::XAI);
        assert_eq!(suggestion.model, "grok-4.1-fast-reasoning");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_coding_hobby() {
        let router = LLMRouter::new();
        // No selected_model, but intent_type is provided
        let context = intelligent_context(
            "hobby",
            Some("coding"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Coding intent + hobby plan should route to DeepSeek
        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v3.2");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_coding_pro() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("coding"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Coding intent + pro plan should route to Claude
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-4-5");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_search() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("search"),
            Some("search"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Search intent should route to Perplexity Sonar
        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_deep_research() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("deep-research"),
            Some("search"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Deep research intent should route to Perplexity Sonar Deep Research
        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar-deep-research");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_reasoning_hobby() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "hobby",
            Some("reasoning"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Reasoning intent + hobby should route to Grok Fast Reasoning (same price as non-reasoning)
        assert_eq!(suggestion.provider, Provider::XAI);
        assert_eq!(suggestion.model, "grok-4.1-fast-reasoning");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_reasoning_pro() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("reasoning"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Reasoning intent + pro should route to OpenAI o3
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "o3");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_agentic_hobby() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "hobby",
            Some("agentic"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Agentic intent + hobby should route to Gemini Flash
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_agentic_pro() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("agentic"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Agentic intent + pro should route to Claude for tool orchestration
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-4-5");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_multimodal() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("multimodal"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Multimodal intent should route to Gemini for vision
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_chat_hobby() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "hobby",
            Some("chat"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Chat intent + hobby should route to Gemini Flash
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-flash");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_intent_type_chat_pro() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("chat"),
            Some("chat"),
            None, // No pre-selected model
        );

        let suggestion = router.suggest_for_context(&context);

        // Chat intent + pro should route to Gemini Pro
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3-pro");
    }

    #[test]
    #[ignore] // Requires providers to be configured
    fn test_intelligent_routing_unknown_model_defaults_to_managed_cloud() {
        let router = LLMRouter::new();
        let context = intelligent_context(
            "pro",
            Some("image-gen"),
            Some("image"),
            Some("flux-2-pro"), // Unknown model -> defaults to ManagedCloud
        );

        let suggestion = router.suggest_for_context(&context);

        assert_eq!(suggestion.provider, Provider::ManagedCloud);
        assert_eq!(suggestion.model, "flux-2-pro");
    }
}
