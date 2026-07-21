// C6 — LLMRouter routing logic tests.
//
// ALL tests run in CI without API keys or network access.
//
// Tests that exercise `suggest_for_context` with no registered providers
// (legacy paths that fall through to preferred-provider defaults) use
// `LLMRouter::new()`.
//
// Tests that exercise the *intelligent* routing paths -- where the router
// needs `has_provider()` to return `true` in order to confirm a provider --
// use `router_with_all_providers()` which registers a lightweight
// `MockProvider` for every `Provider` variant.  The mock is `is_configured`
// but never makes network calls; `suggest_for_context` only checks
// `has_provider` (which delegates to `is_configured`), so no real API keys
// are required.
//
// [H20] fix: routing-decision tests now run in CI instead of being skipped.
#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::core::llm::llm_router::RouterPreferences;
    use crate::core::llm::{
        CostPriority, LLMProvider, LLMRequest, LLMResponse, LLMRouter, Provider, RouterContext,
        RoutingStrategy, TaskType,
    };
    use agiworkforce_model_registry::TrustMode;

    // ------------------------------------------------------------------
    // MockProvider -- a zero-cost stub that satisfies `has_provider` checks
    // without requiring API keys or network access.
    // ------------------------------------------------------------------

    struct MockProvider {
        provider_name: &'static str,
    }

    #[async_trait::async_trait]
    impl LLMProvider for MockProvider {
        async fn send_message(
            &self,
            _request: &LLMRequest,
        ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
            Err(format!(
                "MockProvider({}) does not send real requests",
                self.provider_name
            )
            .into())
        }

        fn is_configured(&self) -> bool {
            true
        }

        fn name(&self) -> &str {
            self.provider_name
        }
    }

    /// Build an `LLMRouter` with a `MockProvider` registered for every
    /// `Provider` variant so that `has_provider()` returns `true` for all
    /// of them.  This lets us test routing *decisions* without real API keys.
    fn router_with_all_providers() -> LLMRouter {
        let mut router = LLMRouter::new();
        let all_providers: &[(Provider, &str)] = &[
            (Provider::OpenAI, "openai"),
            (Provider::Anthropic, "anthropic"),
            (Provider::Google, "google"),
            (Provider::Ollama, "ollama"),
            (Provider::Perplexity, "perplexity"),
            (Provider::XAI, "xai"),
            (Provider::DeepSeek, "deepseek"),
            (Provider::Qwen, "qwen"),
            (Provider::Moonshot, "moonshot"),
            (Provider::Zhipu, "zhipu"),
            (Provider::ManagedCloud, "managed_cloud"),
            (Provider::Mistral, "mistral"),
            (Provider::Groq, "groq"),
            (Provider::Together, "together"),
            (Provider::Fireworks, "fireworks"),
            (Provider::Cerebras, "cerebras"),
            (Provider::DeepInfra, "deepinfra"),
            (Provider::Cohere, "cohere"),
            (Provider::AI21, "ai21"),
            (Provider::Sambanova, "sambanova"),
            (Provider::Azure, "azure"),
            (Provider::Bedrock, "bedrock"),
            (Provider::LmStudio, "lmstudio"),
            (Provider::LlamaCpp, "llamacpp"),
            (Provider::Vllm, "vllm"),
        ];
        for &(provider, name) in all_providers {
            router.set_provider(
                provider,
                Box::new(MockProvider {
                    provider_name: name,
                }),
            );
        }
        router
    }

    // ------------------------------------------------------------------
    // TRUST BOUNDARY: pure Local mode must never yield a ManagedCloud candidate.
    // ------------------------------------------------------------------

    #[test]
    fn local_only_excludes_managed_cloud_candidate() {
        let router = router_with_all_providers();
        let request = LLMRequest::default();

        // local_only=true must exclude ManagedCloud even though it is registered
        // AND prefer_cloud_credits is set (i.e. every path that could add it).
        let local_prefs = RouterPreferences {
            prefer_cloud_credits: true,
            local_only: true,
            ..Default::default()
        };
        let local_candidates = router.candidates(&request, &local_prefs);
        assert!(
            !local_candidates
                .iter()
                .any(|c| c.provider == Provider::ManagedCloud),
            "Local mode must never produce a ManagedCloud candidate"
        );

        // Sanity: an explicit `managed_cloud_only` widens the boundary and
        // allows ManagedCloud to appear. `local_only: false` alone is NOT
        // sufficient post-desktop-trust-boundary-01 — the router now fails
        // closed to Local when neither `trust_mode` nor `managed_cloud_only`
        // positively resolves a wider boundary (see
        // `llm_router::effective_trust_mode`), so an unset/ambiguous
        // boundary can no longer reach ManagedCloud/BYOK by omission.
        let cloud_prefs = RouterPreferences {
            prefer_cloud_credits: true,
            local_only: false,
            managed_cloud_only: true,
            strategy: RoutingStrategy::CostOptimized,
            ..Default::default()
        };
        let cloud_candidates = router.candidates(&request, &cloud_prefs);
        assert!(
            cloud_candidates
                .iter()
                .any(|c| c.provider == Provider::ManagedCloud),
            "Explicit managed_cloud_only should still allow a ManagedCloud candidate"
        );
    }

    #[test]
    fn local_trust_mode_rejects_direct_byok_providers() {
        let router = router_with_all_providers();
        let request = LLMRequest::default();
        let preferences = RouterPreferences {
            provider: Some(Provider::OpenAI),
            model: Some("gpt-5.6-sol".to_string()),
            trust_mode: Some(TrustMode::Local),
            ..Default::default()
        };

        assert!(router.candidates(&request, &preferences).is_empty());
    }

    #[test]
    fn byok_trust_mode_rejects_local_and_managed_providers() {
        let router = router_with_all_providers();
        let request = LLMRequest::default();

        for provider in [Provider::Ollama, Provider::ManagedCloud] {
            let preferences = RouterPreferences {
                provider: Some(provider),
                trust_mode: Some(TrustMode::Byok),
                ..Default::default()
            };
            assert!(
                router.candidates(&request, &preferences).is_empty(),
                "BYOK boundary admitted {provider:?}"
            );
        }
    }

    #[test]
    fn trust_modes_admit_only_their_own_provider_class() {
        let router = router_with_all_providers();
        let request = LLMRequest::default();
        let cases = [
            (TrustMode::Local, Provider::Ollama),
            (TrustMode::Byok, Provider::OpenAI),
            (TrustMode::ManagedCloud, Provider::ManagedCloud),
        ];

        for (trust_mode, provider) in cases {
            let preferences = RouterPreferences {
                provider: Some(provider),
                trust_mode: Some(trust_mode),
                ..Default::default()
            };
            let candidates = router.candidates(&request, &preferences);
            assert_eq!(candidates.len(), 1, "{trust_mode:?} rejected {provider:?}");
            assert_eq!(candidates[0].provider, provider);
        }
    }

    #[test]
    fn managed_cloud_auto_fails_closed_while_desktop_cloud_profile_is_unwired() {
        let router = router_with_all_providers();
        let request = LLMRequest {
            messages: vec![crate::core::llm::ChatMessage {
                role: "user".to_string(),
                content: "Debug this Rust function".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            ..LLMRequest::default()
        };
        let preferences = RouterPreferences {
            strategy: RoutingStrategy::AutoPremium,
            context: Some(intelligent_context(
                "max",
                Some("coding"),
                Some("chat"),
                None,
            )),
            prefer_cloud_credits: true,
            local_only: false,
            managed_cloud_only: true,
            ..RouterPreferences::default()
        };

        let candidates = router.candidates(&request, &preferences);
        assert!(
            candidates.is_empty(),
            "Desktop managed cloud must remain unavailable until desktop/cloud-chat is wired"
        );
    }

    #[test]
    fn unset_trust_mode_fails_closed_to_local() {
        let router = router_with_all_providers();
        let request = LLMRequest::default();

        // No trust_mode, no legacy booleans: every strategy must fail closed
        // to the Local provider class (see `llm_router::effective_trust_mode`).
        let preference_sets = [
            RouterPreferences::default(),
            RouterPreferences {
                prefer_cloud_credits: true,
                strategy: RoutingStrategy::CostOptimized,
                ..Default::default()
            },
            RouterPreferences {
                strategy: RoutingStrategy::AutoPremium,
                ..Default::default()
            },
        ];

        let mut total_candidates = 0usize;
        for preferences in preference_sets {
            let candidates = router.candidates(&request, &preferences);
            // Guard against vacuous passes. Auto-strategy sets may correctly
            // return zero candidates today: the canonical auto policy fails
            // closed to Unavailable because `desktop/local-chat` has no
            // allowed harnesses yet (registry status "partial"). Non-auto
            // strategies must produce Local candidates from the fallback
            // chain, so an empty result there would mean the test proves
            // nothing.
            let is_auto = matches!(
                preferences.strategy,
                RoutingStrategy::Auto
                    | RoutingStrategy::AutoEconomy
                    | RoutingStrategy::AutoBalanced
                    | RoutingStrategy::AutoPremium
            );
            if !is_auto {
                assert!(
                    !candidates.is_empty(),
                    "Expected Local candidates for non-auto preferences {:?}",
                    preferences
                );
            }
            total_candidates += candidates.len();
            for candidate in candidates {
                assert!(
                    matches!(
                        candidate.provider,
                        Provider::Ollama | Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
                    ),
                    "Unset trust mode must fail closed to Local, got {:?}",
                    candidate.provider
                );
            }
        }
        assert!(
            total_candidates > 0,
            "Every preference set returned zero candidates — the boundary assertions never ran"
        );
    }

    // ------------------------------------------------------------------
    // Provider::from_string — all variants + aliases
    // ------------------------------------------------------------------

    #[test]
    fn test_provider_from_string_openai() {
        assert_eq!(Provider::from_string("openai"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_string("OpenAI"), Some(Provider::OpenAI));
        assert_eq!(Provider::from_string("OPENAI"), Some(Provider::OpenAI));
    }

    #[test]
    fn test_provider_from_string_anthropic() {
        assert_eq!(
            Provider::from_string("anthropic"),
            Some(Provider::Anthropic)
        );
        assert_eq!(
            Provider::from_string("Anthropic"),
            Some(Provider::Anthropic)
        );
    }

    #[test]
    fn test_provider_from_string_google() {
        assert_eq!(Provider::from_string("google"), Some(Provider::Google));
    }

    #[test]
    fn test_provider_from_string_ollama() {
        assert_eq!(Provider::from_string("ollama"), Some(Provider::Ollama));
    }

    #[test]
    fn test_provider_from_string_perplexity_aliases() {
        assert_eq!(
            Provider::from_string("perplexity"),
            Some(Provider::Perplexity)
        );
        assert_eq!(Provider::from_string("pplx"), Some(Provider::Perplexity));
        assert_eq!(Provider::from_string("sonar"), Some(Provider::Perplexity));
    }

    #[test]
    fn test_provider_from_string_xai_aliases() {
        assert_eq!(Provider::from_string("xai"), Some(Provider::XAI));
        assert_eq!(Provider::from_string("grok"), Some(Provider::XAI));
    }

    #[test]
    fn test_provider_from_string_deepseek() {
        assert_eq!(Provider::from_string("deepseek"), Some(Provider::DeepSeek));
    }

    #[test]
    fn test_provider_from_string_qwen_aliases() {
        assert_eq!(Provider::from_string("qwen"), Some(Provider::Qwen));
        assert_eq!(Provider::from_string("alibaba"), Some(Provider::Qwen));
    }

    #[test]
    fn test_provider_from_string_moonshot_aliases() {
        assert_eq!(Provider::from_string("moonshot"), Some(Provider::Moonshot));
        assert_eq!(Provider::from_string("kimi"), Some(Provider::Moonshot));
    }

    #[test]
    fn test_provider_from_string_zhipu_aliases() {
        assert_eq!(Provider::from_string("zhipu"), Some(Provider::Zhipu));
        assert_eq!(Provider::from_string("zhipuai"), Some(Provider::Zhipu));
        assert_eq!(Provider::from_string("bigmodel"), Some(Provider::Zhipu));
        assert_eq!(Provider::from_string("glm"), Some(Provider::Zhipu));
    }

    #[test]
    fn test_provider_from_string_managed_cloud_aliases() {
        assert_eq!(
            Provider::from_string("managed_cloud"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            Provider::from_string("managedcloud"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(Provider::from_string("cloud"), Some(Provider::ManagedCloud));
    }

    #[test]
    fn test_provider_from_string_unknown_returns_none() {
        assert_eq!(Provider::from_string("unknown_provider"), None);
        assert_eq!(Provider::from_string(""), None);
        assert_eq!(Provider::from_string("aws"), None);
    }

    // ------------------------------------------------------------------
    // Provider::as_string — round-trip with from_string
    // ------------------------------------------------------------------

    #[test]
    fn test_provider_as_string_all_variants() {
        let providers = [
            (Provider::OpenAI, "openai"),
            (Provider::Anthropic, "anthropic"),
            (Provider::Google, "google"),
            (Provider::Ollama, "ollama"),
            (Provider::Perplexity, "perplexity"),
            (Provider::XAI, "xai"),
            (Provider::DeepSeek, "deepseek"),
            (Provider::Qwen, "qwen"),
            (Provider::Moonshot, "moonshot"),
            (Provider::Zhipu, "zhipu"),
            (Provider::ManagedCloud, "managed_cloud"),
        ];
        for (provider, expected) in providers {
            assert_eq!(
                provider.as_string(),
                expected,
                "{:?}.as_string() should be \"{}\"",
                provider,
                expected
            );
        }
    }

    #[test]
    fn test_provider_from_string_roundtrip_via_as_string() {
        // as_string() output should be accepted back by from_string()
        // M15 fix: Include Provider::ManagedCloud in the round-trip test
        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Zhipu,
            Provider::ManagedCloud,
        ];
        for p in providers {
            let s = p.as_string();
            let back = Provider::from_string(s);
            assert_eq!(
                back,
                Some(p),
                "{:?}.as_string()=\"{}\" should round-trip",
                p,
                s
            );
        }
    }

    // ------------------------------------------------------------------
    // Provider::default_model — all variants return non-empty strings
    // ------------------------------------------------------------------

    #[test]
    fn test_provider_default_model_all_non_empty() {
        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Zhipu,
            Provider::ManagedCloud,
        ];
        for p in providers {
            let model = p.default_model();
            assert!(
                !model.is_empty(),
                "{:?}.default_model() must not be empty",
                p
            );
        }
    }

    #[test]
    fn test_provider_default_model_spot_checks() {
        assert_eq!(Provider::OpenAI.default_model(), "gpt-5.6-sol");
        assert_eq!(Provider::Anthropic.default_model(), "claude-sonnet-5");
        assert_eq!(Provider::Google.default_model(), "gemini-3.5-flash");
        assert_eq!(Provider::DeepSeek.default_model(), "deepseek-v4-flash");
        assert_eq!(Provider::Ollama.default_model(), "llama4-maverick");
    }

    // ------------------------------------------------------------------
    // Provider::get_model_for_task — spot-checks for key task types
    // ------------------------------------------------------------------

    #[test]
    fn test_get_model_for_task_openai_fast_completion() {
        let model = Provider::OpenAI.get_model_for_task(TaskType::FastCompletion);
        assert!(!model.is_empty(), "FastCompletion model must not be empty");
    }

    #[test]
    fn test_get_model_for_task_openai_complex_reasoning() {
        let model = Provider::OpenAI.get_model_for_task(TaskType::ComplexReasoning);
        assert_eq!(model, "gpt-5.6-sol");
    }

    #[test]
    fn test_get_model_for_task_anthropic_fast_completion() {
        let model = Provider::Anthropic.get_model_for_task(TaskType::FastCompletion);
        // Haiku is the fast completion model
        assert!(
            model.contains("haiku"),
            "Anthropic FastCompletion should use Haiku, got: {}",
            model
        );
    }

    #[test]
    fn test_get_model_for_task_anthropic_complex_reasoning() {
        let model = Provider::Anthropic.get_model_for_task(TaskType::ComplexReasoning);
        // Fable 5 is the registry's anthropic complex-reasoning route
        // (catalog taskRouting.complex_reasoning, verified 2026-07-15).
        assert!(
            model.contains("fable"),
            "Anthropic ComplexReasoning should use Fable, got: {}",
            model
        );
    }

    #[test]
    fn test_get_model_for_task_deepseek_code_generation() {
        let model = Provider::DeepSeek.get_model_for_task(TaskType::CodeGeneration);
        assert!(!model.is_empty());
        // DeepSeek's code-generation task routes to V4 Flash (the new default after V4 launch).
        assert_eq!(model, "deepseek-v4-flash");
    }

    #[test]
    fn test_get_model_for_task_all_providers_return_non_empty() {
        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Zhipu,
            Provider::ManagedCloud,
        ];
        let tasks = [
            TaskType::FastCompletion,
            TaskType::CodeGeneration,
            TaskType::ComplexReasoning,
            TaskType::Chat,
            TaskType::Vision,
            TaskType::LongContext,
        ];
        for p in providers {
            for t in tasks {
                let model = p.get_model_for_task(t);
                assert!(
                    !model.is_empty(),
                    "{:?}.get_model_for_task({:?}) must not be empty",
                    p,
                    t
                );
            }
        }
    }

    // ------------------------------------------------------------------
    // RouterContext::default — sensible zero values
    // ------------------------------------------------------------------

    #[test]
    fn test_router_context_default() {
        let ctx = RouterContext::default();
        assert!(ctx.intents.is_empty(), "Default intents must be empty");
        assert!(
            !ctx.requires_vision,
            "Default requires_vision must be false"
        );
        assert_eq!(ctx.token_estimate, 0);
        assert!(ctx.intent_type.is_none());
        assert!(ctx.selected_model.is_none());
    }

    // ------------------------------------------------------------------
    // CostPriority::default — Balanced
    // ------------------------------------------------------------------

    #[test]
    fn test_cost_priority_default_is_balanced() {
        let p = CostPriority::default();
        assert!(matches!(p, CostPriority::Balanced));
    }

    // ------------------------------------------------------------------
    // RoutingStrategy::default — Auto
    // ------------------------------------------------------------------

    #[test]
    fn test_routing_strategy_default_is_auto() {
        let s = RoutingStrategy::default();
        assert!(matches!(s, RoutingStrategy::Auto));
    }

    // ------------------------------------------------------------------
    // Helper builders for suggest_for_context tests
    // ------------------------------------------------------------------

    /// Build a legacy RouterContext (no intelligent routing fields).
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
            intent_type: None,
            model_category: None,
            selected_model: None,
            suggested_tool_categories: None,
            auto_execute_tools: None,
            confidence: None,
            routing_reason: None,
        }
    }

    /// Build an intelligent RouterContext (TypeScript pre-selected model present).
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

    // ------------------------------------------------------------------
    // suggest_for_context — paths that produce deterministic output without
    // any registered providers (legacy routing falls through to preferred provider)
    // ------------------------------------------------------------------

    #[test]
    fn test_routing_logic_vision_priority() {
        // requires_vision=true forces provider=Google (Creative) regardless of providers
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            true, // requires_vision
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Vision)
        );
    }

    #[test]
    fn test_routing_logic_creative_task() {
        // intents with "creative" forces provider=Google (Creative task category)
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["creative".to_string(), "design".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Vision)
        );
    }

    #[test]
    fn test_routing_logic_low_cost() {
        // CostPriority::Low with basic plan → OpenAI economy default
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Low,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-luna");
    }

    // ------------------------------------------------------------------
    // Model name → provider inference (used by intelligent routing path)
    // These test infer_provider_from_model indirectly via suggest_for_context
    // with a selected_model that has no provider registered — the router falls
    // through to the legacy path and returns the correctly inferred provider.
    //
    // NOTE: When the preferred provider IS registered, suggest_for_context
    //       returns it directly. When it is NOT registered, it falls to legacy.
    //       We verify the inference logic by checking the suggestion provider
    //       matches the model's well-known prefix.
    // ------------------------------------------------------------------

    #[test]
    fn test_infer_provider_claude_model_prefix() {
        // The infer_provider_from_model helper is private but its effect is observable:
        // when selected_model="claude-..." and provider not registered, falls to legacy routing.
        // We check that the returned provider is sane (not panicking).
        let router = LLMRouter::new();
        let ctx = intelligent_context("pro", Some("coding"), Some("chat"), Some("claude-sonnet-5"));
        let suggestion = router.suggest_for_context(&ctx);
        // Without Anthropic registered, falls to legacy and may return a different provider.
        // At minimum it must not panic and must return a non-empty model.
        assert!(!suggestion.model.is_empty());
    }

    #[test]
    fn test_infer_provider_gpt_model_prefix() {
        let router = LLMRouter::new();
        let ctx = intelligent_context("pro", Some("chat"), Some("chat"), Some("gpt-5.6-sol"));
        let suggestion = router.suggest_for_context(&ctx);
        assert!(!suggestion.model.is_empty());
    }

    #[test]
    fn test_infer_provider_gemini_model_prefix() {
        let router = LLMRouter::new();
        let ctx = intelligent_context(
            "basic",
            Some("multimodal"),
            Some("chat"),
            Some("gemini-3.5-flash"),
        );
        let suggestion = router.suggest_for_context(&ctx);
        assert!(!suggestion.model.is_empty());
    }

    #[test]
    fn test_infer_provider_deepseek_model_prefix() {
        let router = LLMRouter::new();
        let ctx = intelligent_context(
            "basic",
            Some("coding"),
            Some("chat"),
            Some("deepseek-v4-flash"),
        );
        let suggestion = router.suggest_for_context(&ctx);
        assert!(!suggestion.model.is_empty());
    }

    #[test]
    fn test_infer_provider_grok_model_prefix() {
        let router = LLMRouter::new();
        let ctx = intelligent_context("basic", Some("reasoning"), Some("chat"), Some("grok-4.5"));
        let suggestion = router.suggest_for_context(&ctx);
        assert!(!suggestion.model.is_empty());
    }

    #[test]
    fn test_infer_provider_sonar_model_prefix() {
        let router = LLMRouter::new();
        let ctx = intelligent_context("pro", Some("search"), Some("search"), Some("sonar-pro"));
        let suggestion = router.suggest_for_context(&ctx);
        assert!(!suggestion.model.is_empty());
    }

    // ------------------------------------------------------------------
    // infer_provider_from_model — direct tests (pub(crate) visibility)
    // These call the actual production method on LLMRouter.
    // ------------------------------------------------------------------

    #[test]
    fn test_infer_provider_openai_gpt_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("gpt-5.6-sol"),
            Provider::OpenAI
        );
        assert_eq!(
            router.infer_provider_from_model("gpt-5.6-luna"),
            Provider::OpenAI
        );
        assert_eq!(
            router.infer_provider_from_model("GPT-5.4"),
            Provider::OpenAI
        );
    }

    #[test]
    fn test_infer_provider_openai_reasoning_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("o1-preview"),
            Provider::OpenAI
        );
        assert_eq!(router.infer_provider_from_model("o3"), Provider::OpenAI);
        assert_eq!(
            router.infer_provider_from_model("o3-mini"),
            Provider::OpenAI
        );
    }

    #[test]
    fn test_infer_provider_openai_non_chat_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("gpt-image-2"),
            Provider::OpenAI
        );
        assert_eq!(
            router.infer_provider_from_model("tts-1-hd"),
            Provider::OpenAI
        );
        assert_eq!(
            router.infer_provider_from_model("gpt-4o-transcribe"),
            Provider::OpenAI
        );
    }

    #[test]
    fn test_infer_provider_anthropic_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("claude-sonnet-5"),
            Provider::Anthropic
        );
        assert_eq!(
            router.infer_provider_from_model("claude-opus-4.8"),
            Provider::Anthropic
        );
        assert_eq!(
            router.infer_provider_from_model("claude-haiku-4-5"),
            Provider::Anthropic
        );
        // Case insensitive
        assert_eq!(
            router.infer_provider_from_model("Claude-Sonnet-4-5"),
            Provider::Anthropic
        );
    }

    #[test]
    fn test_infer_provider_google_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("gemini-3.1-pro-preview"),
            Provider::Google
        );
        assert_eq!(
            router.infer_provider_from_model("gemini-3.5-flash"),
            Provider::Google
        );
        assert_eq!(
            router.infer_provider_from_model("gemini-3.1-flash-image"),
            Provider::Google
        );
    }

    #[test]
    fn test_infer_provider_deepseek_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("deepseek-v4-flash"),
            Provider::DeepSeek
        );
        assert_eq!(
            router.infer_provider_from_model("deepseek-reasoner"),
            Provider::DeepSeek
        );
    }

    #[test]
    fn test_infer_provider_xai_models() {
        let router = LLMRouter::new();
        assert_eq!(router.infer_provider_from_model("grok-4.5"), Provider::XAI);
        assert_eq!(router.infer_provider_from_model("grok-4.5"), Provider::XAI);
        assert_eq!(router.infer_provider_from_model("GROK-4"), Provider::XAI);
    }

    #[test]
    fn test_infer_provider_perplexity_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("sonar"),
            Provider::Perplexity
        );
        assert_eq!(
            router.infer_provider_from_model("sonar-deep-research"),
            Provider::Perplexity
        );
    }

    #[test]
    fn test_infer_provider_qwen_models() {
        let router = LLMRouter::new();
        assert_eq!(router.infer_provider_from_model("qwen-max"), Provider::Qwen);
        assert_eq!(
            router.infer_provider_from_model("qwen3-coder"),
            Provider::Qwen
        );
    }

    #[test]
    fn test_infer_provider_moonshot_models() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("kimi-k3"),
            Provider::Moonshot
        );
        assert_eq!(
            router.infer_provider_from_model("moonshot-v1"),
            Provider::Moonshot
        );
    }

    #[test]
    fn test_infer_provider_zhipu_models() {
        let router = LLMRouter::new();
        assert_eq!(router.infer_provider_from_model("glm-5.2"), Provider::Zhipu);
    }

    #[test]
    fn test_infer_provider_flux_to_managed_cloud() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("flux-2-pro"),
            Provider::ManagedCloud
        );
    }

    #[test]
    fn test_infer_provider_unknown_defaults_to_managed_cloud() {
        let router = LLMRouter::new();
        assert_eq!(
            router.infer_provider_from_model("some-unknown-model"),
            Provider::ManagedCloud
        );
        assert_eq!(
            router.infer_provider_from_model("my-fine-tuned-llm"),
            Provider::ManagedCloud
        );
        assert_eq!(router.infer_provider_from_model(""), Provider::ManagedCloud);
    }

    // ------------------------------------------------------------------
    // Additional legacy routing logic tests (no providers needed)
    // ------------------------------------------------------------------

    #[test]
    fn test_routing_basic_simple_chat_routes_to_core_budget_model() {
        // Budget plans with no special intent default to the current core low-cost stack.
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-luna");
    }

    #[test]
    fn test_routing_free_plan_is_budget() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "free",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
    }

    #[test]
    fn test_routing_pro_plan_is_not_budget() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "pro",
        );
        let suggestion = router.suggest_for_context(&context);
        // Pro plan without special intents defaults to Google
        assert_eq!(suggestion.provider, Provider::Google);
    }

    #[test]
    fn test_routing_code_intent_pro_uses_anthropic() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["code".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "pro",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-5");
    }

    #[test]
    fn test_routing_code_intent_basic_uses_openai_mini() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["code".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
    }

    #[test]
    fn test_routing_writing_pro_uses_openai() {
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["writing".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "pro",
        );
        let suggestion = router.suggest_for_context(&context);
        // Pro plan + writing routes to OpenAI, but with no provider registered
        // it falls through to the default model for the preferred provider
        assert_eq!(suggestion.provider, Provider::OpenAI);
    }

    #[test]
    fn test_routing_vision_overrides_intents() {
        // Vision should take priority even with code intents
        let router = LLMRouter::new();
        let context = legacy_context(
            vec!["code".to_string()],
            true, // requires_vision
            100,
            CostPriority::Balanced,
            "pro",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
    }

    #[test]
    fn test_routing_all_creative_intents() {
        let router = LLMRouter::new();
        for intent in &["creative", "generate", "design", "art"] {
            let context = legacy_context(
                vec![intent.to_string()],
                false,
                100,
                CostPriority::Balanced,
                "pro",
            );
            let suggestion = router.suggest_for_context(&context);
            assert_eq!(
                suggestion.provider,
                Provider::Google,
                "Creative intent '{}' should route to Google",
                intent
            );
        }
    }

    #[test]
    fn test_routing_all_code_intents_basic() {
        let router = LLMRouter::new();
        for intent in &[
            "code",
            "devops",
            "repo",
            "terminal",
            "automation",
            "build",
            "test",
        ] {
            let context = legacy_context(
                vec![intent.to_string()],
                false,
                100,
                CostPriority::Balanced,
                "basic",
            );
            let suggestion = router.suggest_for_context(&context);
            assert_eq!(
                suggestion.provider,
                Provider::OpenAI,
                "Code intent '{}' + basic should route to the OpenAI economy model",
                intent
            );
        }
    }

    // ------------------------------------------------------------------
    // [H20] Previously-ignored tests -- now use `router_with_all_providers()`
    // so `has_provider()` returns true and routing decisions are testable
    // without API keys or network access.
    // ------------------------------------------------------------------

    // --- Legacy routing with mock providers ---

    #[test]
    fn test_routing_logic_simple_context() {
        let router = router_with_all_providers();
        let context = legacy_context(
            vec!["chat".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-luna");
    }

    #[test]
    fn test_routing_logic_complex_coding() {
        let router = router_with_all_providers();
        let context = legacy_context(
            vec!["code".to_string(), "devops".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-terra");
    }

    #[test]
    fn test_routing_logic_writing_research() {
        let router = router_with_all_providers();
        let context = legacy_context(
            vec!["writing".to_string(), "research".to_string()],
            false,
            100,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        // basic + writing/research -> Google (Gemini Pro, Complex task)
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Vision)
        );
    }

    // --- Intelligent routing: selected_model -> provider inference ---

    #[test]
    fn test_intelligent_routing_selected_model_priority() {
        let router = router_with_all_providers();
        let context =
            intelligent_context("pro", Some("coding"), Some("chat"), Some("claude-opus-4-8"));
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Anthropic);
        // The dashed apiModelId alias canonicalizes to the catalog id.
        assert_eq!(suggestion.model, "claude-opus-4.8");
    }

    #[test]
    fn test_intelligent_routing_infer_openai_provider() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("chat"), Some("chat"), Some("gpt-5.6-sol"));
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-sol");
    }

    #[test]
    fn test_intelligent_routing_infer_google_provider() {
        let router = router_with_all_providers();
        let context = intelligent_context(
            "basic",
            Some("multimodal"),
            Some("chat"),
            Some("gemini-3.5-flash"),
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(suggestion.model, "gemini-3.5-flash");
    }

    #[test]
    fn test_intelligent_routing_infer_deepseek_provider() {
        let router = router_with_all_providers();
        // Current DeepSeek chat routing uses the catalog default directly.
        let context = intelligent_context(
            "basic",
            Some("coding"),
            Some("chat"),
            Some("deepseek-v4-flash"),
        );
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::DeepSeek);
        assert_eq!(suggestion.model, "deepseek-v4-flash");
    }

    #[test]
    fn test_intelligent_routing_infer_perplexity_provider() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("search"), Some("search"), Some("sonar"));
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar");
    }

    #[test]
    fn test_intelligent_routing_infer_xai_provider() {
        let router = router_with_all_providers();
        // grok-4.5 is the current xAI catalog flagship; the grok- prefix
        // resolves to the XAI provider.
        let context =
            intelligent_context("basic", Some("reasoning"), Some("chat"), Some("grok-4.5"));
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::XAI);
        assert_eq!(suggestion.model, "grok-4.5");
    }

    // --- Intelligent routing: intent_type-based (no selected_model) ---

    #[test]
    fn test_intelligent_routing_intent_type_coding_basic() {
        let router = router_with_all_providers();
        let context = intelligent_context("basic", Some("coding"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-luna");
    }

    #[test]
    fn test_intelligent_routing_intent_type_coding_pro() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("coding"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-5");
    }

    #[test]
    fn test_intelligent_routing_intent_type_search() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("search"), Some("search"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar");
    }

    #[test]
    fn test_intelligent_routing_intent_type_deep_research() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("deep-research"), Some("search"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Perplexity);
        assert_eq!(suggestion.model, "sonar-deep-research");
    }

    #[test]
    fn test_intelligent_routing_intent_type_reasoning_basic() {
        let router = router_with_all_providers();
        let context = intelligent_context("basic", Some("reasoning"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Chat)
        );
    }

    #[test]
    fn test_intelligent_routing_intent_type_reasoning_pro() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("reasoning"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::OpenAI);
        assert_eq!(suggestion.model, "gpt-5.6-sol");
    }

    #[test]
    fn test_intelligent_routing_intent_type_agentic_basic() {
        let router = router_with_all_providers();
        let context = intelligent_context("basic", Some("agentic"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Chat)
        );
    }

    #[test]
    fn test_intelligent_routing_intent_type_agentic_pro() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("agentic"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Anthropic);
        assert_eq!(suggestion.model, "claude-sonnet-5");
    }

    #[test]
    fn test_intelligent_routing_intent_type_multimodal() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("multimodal"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Vision)
        );
    }

    #[test]
    fn test_intelligent_routing_intent_type_chat_basic() {
        let router = router_with_all_providers();
        let context = intelligent_context("basic", Some("chat"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::FastCompletion)
        );
    }

    #[test]
    fn test_intelligent_routing_intent_type_chat_legacy_hobby_alias_matches_basic() {
        // Subscription rows persisted before the 2026-07-02 hobby->basic rename may
        // still carry the literal string "hobby" in plan_tier; the router must keep
        // routing them as budget-tier identically to "basic".
        let router = router_with_all_providers();
        let context = intelligent_context("hobby", Some("chat"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::FastCompletion)
        );
    }

    #[test]
    fn test_intelligent_routing_intent_type_chat_pro() {
        let router = router_with_all_providers();
        let context = intelligent_context("pro", Some("chat"), Some("chat"), None);
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Chat)
        );
    }

    // --- Large-context and edge cases ---

    #[test]
    fn test_routing_logic_large_context_upgrade() {
        let router = router_with_all_providers();
        let context = legacy_context(
            vec!["writing".to_string()],
            false,
            15_000,
            CostPriority::Balanced,
            "basic",
        );
        let suggestion = router.suggest_for_context(&context);
        // basic + writing -> Google (Complex task), large context doesn't change basic routing
        assert_eq!(suggestion.provider, Provider::Google);
        assert_eq!(
            suggestion.model,
            Provider::Google.get_model_for_task(TaskType::Vision)
        );
    }

    #[test]
    fn test_intelligent_routing_unknown_model_defaults_to_managed_cloud() {
        let router = router_with_all_providers();
        let context =
            intelligent_context("pro", Some("image-gen"), Some("image"), Some("flux-2-pro"));
        let suggestion = router.suggest_for_context(&context);
        assert_eq!(suggestion.provider, Provider::ManagedCloud);
        assert_eq!(suggestion.model, "flux-2-pro");
    }
}
