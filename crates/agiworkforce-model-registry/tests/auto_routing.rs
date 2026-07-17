use agiworkforce_model_registry::{
    AutoRouteDecision, AutoRoutingRequest, RouteReason, RoutingProfile, RoutingTaskType, TrustMode,
    UnavailableCode, is_auto_routing_selection, model_keys_for_provider, resolve_auto_route,
    runtime_profile,
};

#[test]
fn distinguishes_auto_profiles_from_concrete_model_ids() {
    assert!(is_auto_routing_selection("auto"));
    assert!(is_auto_routing_selection("AUTO-BALANCED"));
    assert!(!is_auto_routing_selection("claude-opus-4.8"));
}

#[test]
fn exposes_the_generated_provider_model_index() {
    let openai_models = model_keys_for_provider("openai")
        .expect("generated registry should load")
        .expect("OpenAI should have a canonical provider index");

    assert!(openai_models.iter().any(|model| model == "gpt-5.4-nano"));
    assert_eq!(
        model_keys_for_provider("not-a-provider").expect("generated registry should load"),
        None
    );
}

fn request<'a>(
    selection: &'a str,
    task_type: RoutingTaskType,
    subscription_tier: &'a str,
    trust_mode: TrustMode,
) -> AutoRoutingRequest<'a> {
    AutoRoutingRequest {
        selection: Some(selection),
        task_type,
        subscription_tier: Some(subscription_tier),
        trust_mode,
        ..AutoRoutingRequest::default()
    }
}

#[test]
fn honors_economy_profile_when_tier_allows_premium() {
    let decision = resolve_auto_route(&request(
        "auto-economy",
        RoutingTaskType::Coding,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "glm-5.2");
    assert_eq!(selected.requested_profile, Some(RoutingProfile::Economy));
    assert_eq!(selected.effective_profile, Some(RoutingProfile::Economy));
    assert_eq!(selected.reason, RouteReason::PreferredSlot);
}

#[test]
fn clamps_premium_to_free_tier_maximum() {
    let decision = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Coding,
        "free",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gemini-3.1-flash-lite");
    assert_eq!(selected.effective_profile, Some(RoutingProfile::Economy));
}

#[test]
fn treats_basic_as_economy_and_max_plus_as_max() {
    let basic = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Coding,
        "basic",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");
    let max_plus = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Coding,
        "max_plus",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(basic) = basic else {
        panic!("expected Basic to select its economy route");
    };
    let AutoRouteDecision::Selected(max_plus) = max_plus else {
        panic!("expected Max+ to select its Max route");
    };
    assert_eq!(basic.effective_profile, Some(RoutingProfile::Economy));
    assert_eq!(max_plus.effective_profile, Some(RoutingProfile::Premium));
    assert_eq!(max_plus.model_key, "claude-opus-4.8");
}

#[test]
fn uses_premium_coding_slot_when_permitted() {
    let decision = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Coding,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "claude-opus-4.8");
    assert_eq!(selected.provider_model_id, "claude-opus-4-8");
    assert_eq!(
        selected
            .fallbacks
            .iter()
            .map(|route| (route.model_key.as_str(), route.provider.as_str()))
            .collect::<Vec<_>>(),
        vec![("glm-5.2", "zhipu"), ("gemini-3.1-flash-lite", "google")]
    );
}

#[test]
fn emits_only_cross_provider_fallbacks_in_registry_policy_order() {
    let decision = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Research,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "sonar-deep-research");
    assert_eq!(selected.fallbacks.len(), 1);
    assert_eq!(selected.fallbacks[0].model_key, "gemini-3.1-flash-lite");
    assert_eq!(selected.fallbacks[0].provider, "google");
}

#[test]
fn applies_us_only_provider_overlay() {
    let mut routing_request = request(
        "auto-premium",
        RoutingTaskType::Reasoning,
        "max",
        TrustMode::ManagedCloud,
    );
    routing_request.us_only = true;

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gpt-5.6-sol");
    assert_eq!(selected.provider, "openai");
}

#[test]
fn routes_image_generation_by_intrinsic_capability() {
    let decision = resolve_auto_route(&request(
        "auto-balanced",
        RoutingTaskType::ImageGeneration,
        "pro",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gemini-3.1-flash-image");
    assert_eq!(selected.harness_id, "google/media");
}

#[test]
fn preserves_an_explicit_eligible_model() {
    let decision = resolve_auto_route(&request(
        "gpt-5.4-nano",
        RoutingTaskType::Coding,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gpt-5.4-nano");
    assert_eq!(selected.reason, RouteReason::Explicit);
    assert!(selected.fallbacks.is_empty());
}

#[test]
fn fails_closed_in_local_trust_mode() {
    let decision = resolve_auto_route(&request(
        "auto-balanced",
        RoutingTaskType::General,
        "pro",
        TrustMode::Local,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Unavailable(unavailable) = decision else {
        panic!("expected unavailable route");
    };
    assert_eq!(unavailable.code, UnavailableCode::NoEligibleRoute);
}

#[test]
fn routes_research_when_a_native_search_harness_is_implemented() {
    let decision = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Research,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "sonar-deep-research");
    assert_eq!(selected.harness_id, "perplexity/chat-completions");
}

#[test]
fn accepts_ga_models_when_the_runtime_supports_their_harness() {
    let decision = resolve_auto_route(&request(
        "gpt-5.6-sol",
        RoutingTaskType::Reasoning,
        "max",
        TrustMode::ManagedCloud,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gpt-5.6-sol");
    assert_eq!(selected.provider, "openai");
    assert_eq!(selected.reason, RouteReason::Explicit);
}

#[test]
fn runtime_adapter_admission_blocks_an_unexecutable_media_harness() {
    let mut routing_request = request(
        "auto-balanced",
        RoutingTaskType::ImageGeneration,
        "pro",
        TrustMode::ManagedCloud,
    );
    routing_request.allowed_harnesses = Some(&["openai/responses", "anthropic/messages"]);

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Unavailable(unavailable) = decision else {
        panic!("expected unavailable route");
    };
    assert_eq!(unavailable.code, UnavailableCode::NoEligibleRoute);
    assert!(
        unavailable
            .reasons
            .iter()
            .any(|reason| reason.contains("google/media"))
    );
}

#[test]
fn byok_is_not_clamped_by_managed_subscription_tiers() {
    let decision = resolve_auto_route(&request(
        "auto-premium",
        RoutingTaskType::Coding,
        "byok",
        TrustMode::Byok,
    ))
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "claude-opus-4.8");
    assert_eq!(selected.effective_profile, Some(RoutingProfile::Premium));
}

#[test]
fn runtime_profiles_are_generated_once_for_cli_and_desktop_byok() {
    let cli = runtime_profile("cli/byok-chat")
        .expect("generated registry should load")
        .expect("CLI profile should exist");
    let desktop = runtime_profile("desktop/byok-chat")
        .expect("generated registry should load")
        .expect("Desktop profile should exist");

    assert_eq!(cli.allowed_harness_ids, desktop.allowed_harness_ids);
    assert_eq!(cli.trust_mode, TrustMode::Byok);
    assert_eq!(cli.status, "implemented");
}

#[test]
fn unavailable_runtime_profile_fails_closed_before_model_selection() {
    let mut routing_request = request(
        "auto-balanced",
        RoutingTaskType::General,
        "pro",
        TrustMode::ManagedCloud,
    );
    routing_request.runtime_profile_id = Some("desktop/cloud-chat");

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Unavailable(unavailable) = decision else {
        panic!("expected unavailable route");
    };
    assert_eq!(unavailable.code, UnavailableCode::RuntimeProfileUnavailable);
}

#[test]
fn web_runtime_profile_admits_its_server_side_search_implementation() {
    let mut routing_request = request(
        "auto-premium",
        RoutingTaskType::Research,
        "max",
        TrustMode::ManagedCloud,
    );
    routing_request.runtime_profile_id = Some("web/cloud-chat");

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "sonar-deep-research");
    assert_eq!(selected.harness_id, "perplexity/chat-completions");
}

#[test]
fn mobile_runtime_profile_admits_its_server_side_search_implementation() {
    let mut routing_request = request(
        "auto-premium",
        RoutingTaskType::Research,
        "max",
        TrustMode::ManagedCloud,
    );
    routing_request.runtime_profile_id = Some("mobile/cloud-chat");

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "sonar-deep-research");
    assert_eq!(selected.harness_id, "perplexity/chat-completions");
}

#[test]
fn preserves_cache_route_on_task_change_when_current_model_remains_preferred() {
    let mut routing_request = request(
        "auto-economy",
        RoutingTaskType::Coding,
        "max",
        TrustMode::ManagedCloud,
    );
    routing_request.current_model_key = Some("gemini-3.1-flash-lite");
    routing_request.previous_task_type = Some(RoutingTaskType::SimpleChat);

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "gemini-3.1-flash-lite");
    assert_eq!(selected.reason, RouteReason::Continuity);
}

#[test]
fn reroutes_on_task_change_when_current_model_is_not_preferred() {
    let mut routing_request = request(
        "auto-premium",
        RoutingTaskType::Research,
        "max",
        TrustMode::ManagedCloud,
    );
    routing_request.current_model_key = Some("gpt-5.4-mini");
    routing_request.previous_task_type = Some(RoutingTaskType::General);

    let decision = resolve_auto_route(&routing_request).expect("generated registry should load");
    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.model_key, "sonar-deep-research");
    assert_eq!(selected.reason, RouteReason::PreferredSlot);
}
