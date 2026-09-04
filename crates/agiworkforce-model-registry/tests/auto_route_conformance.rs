//! The Rust half of the cross-language Auto-routing conformance contract.
//!
//! This crate and `packages/ai/routing/src/auto.ts` are two independent
//! resolvers over one generated policy. Design-doc **OQ-1 (which of them is
//! canonical) is undecided**, so neither is treated as the other's reference.
//! but a routing-policy or resolver change must not silently make them
//! disagree. Both replay
//! `packages/ai/routing/src/__tests__/fixtures/auto-route-conformance.json`;
//! the fixture is the contract, not either implementation.
//!
//! Regenerate it from the TypeScript suite
//! (`AGI_UPDATE_ROUTING_CONFORMANCE=1`) and re-run this test: a case only that
//! side changed fails here.

use std::collections::BTreeMap;

use agiworkforce_model_registry::{
    AutoRouteDecision, AutoRoutingRequest, RoutingProfile, RoutingTaskType, TrustMode,
    resolve_auto_route,
};

const FIXTURE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/ai/routing/src/__tests__/fixtures/auto-route-conformance.json"
));

fn task_type(key: &str) -> RoutingTaskType {
    match key {
        "simple_chat" => RoutingTaskType::SimpleChat,
        "general" => RoutingTaskType::General,
        "coding" => RoutingTaskType::Coding,
        "reasoning" => RoutingTaskType::Reasoning,
        "creative_writing" => RoutingTaskType::CreativeWriting,
        "multimodal" => RoutingTaskType::Multimodal,
        "long_context" => RoutingTaskType::LongContext,
        "research" => RoutingTaskType::Research,
        "agentic" => RoutingTaskType::Agentic,
        "computer-use" => RoutingTaskType::ComputerUse,
        "image_generation" => RoutingTaskType::ImageGeneration,
        other => panic!("conformance fixture names a routing task Rust cannot express: {other}"),
    }
}

fn trust_mode(key: &str) -> TrustMode {
    match key {
        "local" => TrustMode::Local,
        "on_device" => TrustMode::OnDevice,
        "byok" => TrustMode::Byok,
        "managed_cloud" => TrustMode::ManagedCloud,
        other => panic!("conformance fixture names a trust mode Rust cannot express: {other}"),
    }
}

fn profile(profile: Option<RoutingProfile>) -> &'static str {
    match profile {
        Some(RoutingProfile::Economy) => "economy",
        Some(RoutingProfile::Balanced) => "balanced",
        Some(RoutingProfile::Premium) => "premium",
        None => "~",
    }
}

fn encode(decision: &AutoRouteDecision) -> String {
    match decision {
        AutoRouteDecision::Selected(selected) => {
            let reason = match selected.reason {
                agiworkforce_model_registry::RouteReason::Explicit => "explicit",
                agiworkforce_model_registry::RouteReason::Continuity => "continuity",
                agiworkforce_model_registry::RouteReason::PreferredSlot => "preferred_slot",
                agiworkforce_model_registry::RouteReason::FallbackSlot => "fallback_slot",
            };
            format!(
                "selected;{};{};{reason};{};{};{}",
                selected.model_key,
                selected.route_id,
                profile(selected.requested_profile),
                profile(selected.effective_profile),
                selected
                    .fallbacks
                    .iter()
                    .map(|fallback| fallback.model_key.as_str())
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        AutoRouteDecision::Unavailable(unavailable) => {
            use agiworkforce_model_registry::UnavailableCode as Code;
            let code = match unavailable.code {
                Code::UnknownSelection => "unknown_selection",
                Code::UnknownTask => "unknown_task",
                Code::UnknownRuntimeProfile => "unknown_runtime_profile",
                Code::RuntimeProfileUnavailable => "runtime_profile_unavailable",
                Code::RuntimeProfileMismatch => "runtime_profile_mismatch",
                Code::ExplicitModelIneligible => "explicit_model_ineligible",
                Code::NoEligibleRoute => "no_eligible_route",
            };
            format!(
                "unavailable;~;~;{code};{};{};",
                profile(unavailable.requested_profile),
                profile(unavailable.effective_profile)
            )
        }
    }
}

fn decide(case: &str) -> String {
    let parts = case.split('|').collect::<Vec<_>>();
    let request = match parts.as_slice() {
        ["alias", selection, task, tier, trust, us_only] => AutoRoutingRequest {
            selection: Some(selection),
            task_type: task_type(task),
            subscription_tier: Some(tier),
            trust_mode: trust_mode(trust),
            us_only: *us_only == "us_only",
            ..Default::default()
        },
        ["explicit", model_key, trust] => AutoRoutingRequest {
            selection: Some(model_key),
            task_type: RoutingTaskType::General,
            subscription_tier: Some("max"),
            trust_mode: trust_mode(trust),
            ..Default::default()
        },
        ["continuity", model_key] => AutoRoutingRequest {
            selection: Some("auto"),
            task_type: RoutingTaskType::Coding,
            subscription_tier: Some("max"),
            trust_mode: TrustMode::Byok,
            current_model_key: Some(model_key),
            previous_task_type: Some(RoutingTaskType::Coding),
            ..Default::default()
        },
        _ => panic!("unrecognized conformance case: {case}"),
    };
    encode(&resolve_auto_route(&request).expect("generated registry should load"))
}

#[test]
fn rust_reaches_the_same_auto_route_decision_as_typescript() {
    let recorded: BTreeMap<String, String> =
        serde_json::from_str(FIXTURE).expect("conformance fixture should parse");
    assert!(
        !recorded.is_empty(),
        "conformance fixture is empty; regenerate it with AGI_UPDATE_ROUTING_CONFORMANCE=1"
    );

    let drifted = recorded
        .iter()
        .filter_map(|(case, expected)| {
            let actual = decide(case);
            (&actual != expected)
                .then(|| format!("{case}\n  typescript: {expected}\n  rust:       {actual}"))
        })
        .collect::<Vec<_>>();

    assert!(
        drifted.is_empty(),
        "{} of {} Auto-routing decisions drifted between the TypeScript and Rust resolvers:\n{}",
        drifted.len(),
        recorded.len(),
        drifted.join("\n")
    );
}
